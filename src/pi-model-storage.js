import { randomUUID } from "node:crypto";
import { readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { getAgentDir } from "@earendil-works/pi-coding-agent";

// SDK 0.85.1 未公开导出 resolveConfigValue/isCommandConfigValue（auth.json $VAR 插值语义），
// 与 model-config.js 相同：从实际安装位置经包入口定位后按文件 URL 深路径加载。
// 加载失败只降级（读值不再做环境插值），不阻断启动。
let sdkResolveConfigValue;
let sdkIsCommandConfigValue;
try {
  const sdkDist = dirname(fileURLToPath(import.meta.resolve("@earendil-works/pi-coding-agent")));
  const mod = await import(pathToFileURL(join(sdkDist, "core", "resolve-config-value.js")).href);
  sdkResolveConfigValue = mod.resolveConfigValue;
  sdkIsCommandConfigValue = mod.isCommandConfigValue;
} catch {}

// 模型配置/凭据的 SQLite 权威存储：供应商、模型、API keys、收藏全部入库，
// Pi 运行时零手工配置——凭据以内存 CredentialStore 注入 ModelRuntime（SDK 标准接口），
// 模型目录因 SDK 只接受文件路径，写 Axiom 私有派生文件 models.compat.json（仅派生非权威，
// 每次写库后全量重写，可随时删除重建）。首次启动幂等导入既有 Pi 配置（models.json/auth.json）
// 与旧收藏文件：只读源文件、绝不回写；仅权威为空时导入，打迁移标记后不再从旧文件覆盖，
// 页面配置后旧文件永久退出导入来源，清空权威也不复活。
// 密钥明文仅存 SQLite（用户明确同意）；本模块所有对外读取均不返回明文。
const NAMESPACE = "models";
const AUTH_NAMESPACE = "auth";
const MIGRATED_NAMESPACE = "migrated";
const CONFIG_KEY = "config";
const FAVORITES_KEY = "favorites";
// Axiom 私有的内置目录可见性清单（不写入 models.json：SDK schema 只认 provider 定义）。
const HIDDEN_KEY = "hidden";
const IMPORT_ERROR_KEY = "importError";

// 权威配置的规范序列化：指纹、SDK 校验、派生文件三处共用，保证三 view 一致。
export function canonicalModelsJson(config) {
  return `${JSON.stringify(config, null, 2)}\n`;
}

const isPlainObject = (value) => !!value && typeof value === "object" && !Array.isArray(value);
// auth.json 条目的宽松形状检查（与 SDK ReadOnlyAuthStorage 一致的最小校验）。
const isCredential = (value) =>
  isPlainObject(value) &&
  ((value.type === "api_key" && (value.key === undefined || typeof value.key === "string")) ||
    (value.type === "oauth" &&
      typeof value.access === "string" &&
      typeof value.refresh === "string" &&
      typeof value.expires === "number" &&
      Number.isFinite(value.expires)));

export function createPiModelStorage({ database, home, piDir = getAgentDir() }) {
  const compatPath = join(home, "models.compat.json");
  const sources = {
    models: join(piDir, "models.json"),
    auth: join(piDir, "auth.json"),
    favorites: join(home, "models-favorites.json"),
  };

  // 多语句写入的原子边界（与 SessionStore #change 同风格）：事务外自动开事务、RELEASE 提交；
  // 事务内自动嵌套，同名保存点释放最近一层。失败时 ROLLBACK TO + RELEASE 自身的异常一并吞掉，
  // 绝不用回滚错误掩盖原始错误。
  const change = (work) => {
    database.exec("SAVEPOINT model_storage");
    try {
      const result = work();
      database.exec("RELEASE model_storage");
      return result;
    } catch (error) {
      try {
        database.exec("ROLLBACK TO model_storage");
        database.exec("RELEASE model_storage");
      } catch {}
      throw error;
    }
  };

  // prepared 语句按 SQL 文本复用：写路径（CAS、原文读取）每次重新 prepare 会让 importAuth
  // 退化成 N+1 次编译。
  const statements = new Map();
  const sql = (text) => {
    let statement = statements.get(text);
    if (!statement) statements.set(text, (statement = database.prepare(text)));
    return statement;
  };

  // ---- 权威配置（models/config） -------------------------------------------------
  // 单行坏 JSON 绝不能阻断启动：整库只坏一行时进程仍要起得来、配置页仍要打得开（否则用户
  // 没有任何自愈入口）。行不存在 → undefined；行存在但不是合法 JSON → 记一条去重告警后按缺失
  // 处理，坏行原样留在库里等写路径 CAS 自愈。告警只报 namespace/key，绝不带原文片段。
  const readRow = (namespace, key) => {
    try {
      return database.get(namespace, key);
    } catch {
      recordImportError(`${namespace}/${key}`, "数据库记录不是合法 JSON，已按未配置处理；请在本页重新配置");
      return undefined;
    }
  };
  const readConfig = () => {
    const stored = readRow(NAMESPACE, CONFIG_KEY);
    // 库内值只可能由本模块写入；外部篡改导致结构非法时按空配置兜底，不让进程崩溃。
    // 「行存在但结构非法」由 configState().invalid 上报给写路径拒绝覆盖，这里只保证读不炸。
    return isPlainObject(stored) ? stored : { providers: {} };
  };

  // 原子写派生兼容文件：SDK 只接受 models.json 路径，故权威配置全量镜像到该私有文件。
  // 0600：文件含真实密钥；write/rename 任一步失败都完整清理临时文件后向上抛
  //（权威已入库，下次写配置/重启自动重建）。临时文件名用 randomUUID，永不复用。
  // rename 瞬时占用（Windows 杀软/并发读取目标文件报 EPERM/EBUSY）：有限次退避重试，
  // 绝不先删目标——删了就丢旧镜像，失败窗口内 SDK 会读到不存在的模型目录。
  const syncCompatFile = async (config) => {
    const tmp = `${compatPath}.tmp-${randomUUID()}`;
    try {
      await writeFile(tmp, canonicalModelsJson(config), { mode: 0o600 });
      for (let attempt = 0; ; attempt += 1) {
        try {
          await rename(tmp, compatPath);
          break;
        } catch (error) {
          if (attempt >= 2 || !(error?.code === "EPERM" || error?.code === "EBUSY")) throw error;
          await new Promise((resolve) => setTimeout(resolve, 50 * (attempt + 1)));
        }
      }
    } catch (error) {
      await rm(tmp, { force: true }).catch(() => {});
      throw error;
    }
  };

  // 权威落库（仅 SQLite）。派生兼容文件由调用方按需经 syncCompatFile 显式重建，
  // 两阶段分离让上层能区分「库写入失败」（应报错）与「派生/刷新失败」（部分成功，可重试应用）。
  const writeConfig = (config) => {
    database.set(NAMESPACE, CONFIG_KEY, config);
  };

  // ---- 跨进程 CAS：修同 HOME 多进程读-改-写丢更新 --------------------------------
  // 复用传入的权威连接，比较与写入在单条同步 SQL 内完成，不持锁跨异步操作。
  const readRaw = (db, namespace, key) =>
    (db === database ? sql("SELECT value FROM store WHERE namespace = ? AND key = ?") :
      db.prepare("SELECT value FROM store WHERE namespace = ? AND key = ?")).get(namespace, key)?.value;
  // expectedRaw 为 undefined（行尚不存在）→ 仅当行仍不存在时插入；否则原文全等才覆盖。
  // 返回 false = 他人已抢先写入：调用方转为固定脱敏冲突错误，绝不自动重放（fn 可能有副作用）。
  const compareAndSet = (db, namespace, key, expectedRaw, next) => {
    const text = expectedRaw === undefined
      ? "INSERT INTO store (namespace, key, value) VALUES (?, ?, ?) ON CONFLICT(namespace, key) DO NOTHING"
      : "UPDATE store SET value = ? WHERE namespace = ? AND key = ? AND value = ?";
    const statement = db === database ? sql(text) : db.prepare(text);
    return expectedRaw === undefined
      ? statement.run(namespace, key, next).changes === 1
      : statement.run(next, namespace, key, expectedRaw).changes === 1;
  };

  // 写路径起点捕获：raw 为库内原文（CAS 期望值）；坏 JSON 不抛错（否则单行损坏会让配置页
  // 与启动一起瘫掉），而是把 invalid 传给调用方，由写路径明确拒绝覆盖。
  const readState = (namespace, key) => {
    const raw = readRaw(database, namespace, key);
    if (raw === undefined) return { raw, value: undefined };
    try { return { raw, value: JSON.parse(raw) }; }
    catch { return { raw, value: undefined, invalid: true }; }
  };
  // invalid = 行存在但读不出可用配置（坏 JSON 或顶层非对象）。此时绝不能当空配置：
  // 空配置指纹会与它相同，用户随手一存就把原值静默覆盖掉。
  const configState = () => {
    const { raw, value, invalid } = readState(NAMESPACE, CONFIG_KEY);
    if (isPlainObject(value)) return { raw, config: value };
    return { raw, config: { providers: {} }, invalid: raw !== undefined || !!invalid };
  };
  const casConfig = (raw, config) => compareAndSet(database, NAMESPACE, CONFIG_KEY, raw, JSON.stringify(config));
  const favoritesState = () => readState(NAMESPACE, FAVORITES_KEY);
  const casFavorites = (raw, store) =>
    compareAndSet(database, NAMESPACE, FAVORITES_KEY, raw, JSON.stringify({ ...store, version: 1 }));
  const credentialState = (providerId) => {
    const { raw, value, invalid } = readState(AUTH_NAMESPACE, providerId);
    return { raw, current: isCredential(value) ? value : undefined, invalid };
  };

  // ---- 凭据（auth/<providerId>）：pi-ai CredentialStore 实现 ---------------------
  // 单进程单写者：modify/delete 走同一条 promise 链串行化；跨进程见下方 CAS。
  // 跨进程由落库时的 CAS（比较 fn 调用前的权威原文）防丢更新。OAuth 刷新等运行时写入全部落库。
  let chain = Promise.resolve();
  const enqueue = (run) => {
    const task = chain.then(run);
    chain = task.then(
      () => undefined,
      () => undefined,
    );
    return task;
  };
  const rawCredential = (providerId) => {
    const stored = readRow(AUTH_NAMESPACE, providerId);
    return isCredential(stored) ? stored : undefined;
  };
  // 与 SDK AuthStorage.read 完全一致：api_key 且非命令型时解析 $VAR/${VAR} 插值；
  // 命令型/其余类型原样返回（命令由 getAuth 阶段的专用通道执行，这里绝不执行）。
  const resolveForRead = (credential) => {
    if (credential.type !== "api_key" || !credential.key) return structuredClone(credential);
    if (sdkIsCommandConfigValue?.(credential.key)) return structuredClone(credential);
    const resolve = sdkResolveConfigValue ?? ((key) => key);
    return { ...credential, key: resolve(credential.key, credential.env) };
  };

  const credentials = {
    async read(providerId, options) {
      options?.signal?.throwIfAborted();
      const credential = rawCredential(providerId);
      return credential ? resolveForRead(credential) : undefined;
    },
    // 元数据枚举：只有 providerId 与 type，绝不暴露任何 key 值。
    async list(options) {
      options?.signal?.throwIfAborted();
      return database
        .list(AUTH_NAMESPACE)
        .filter(({ value }) => isCredential(value))
        .map(({ key, value }) => ({ providerId: key, type: value.type }));
    },
    modify(providerId, fn, options) {
      return enqueue(async () => {
        options?.signal?.throwIfAborted();
        const { raw: expectedRaw, current, invalid } = credentialState(providerId);
        // 坏 JSON 行绝不进回调、更不许被覆盖：不知道原值是什么就写新值等于静默丢弃用户凭据。
        // 读路径（read/list）对它容错跳过，只有写路径拒绝，用户仍能删除该行后重新配置。
        if (invalid) throw new Error(`provider「${providerId}」的凭据记录不是合法 JSON，已拒绝写入以避免覆盖`);
        const next = await fn(current ? structuredClone(current) : undefined);
        // 与 SDK AuthStorage.modify 一致：fn 返回 undefined 表示放弃变更，保留现值。
        if (next === undefined) return current;
        // 落库前校形状：否则写出 read/list 都看不见的幽灵行，而该行又因「已存在」永久阻断
        // auth.json 里同名的合法凭据导入。
        if (!isCredential(next)) throw new Error(`provider「${providerId}」的凭据格式无效，已拒绝写入`);
        // 异步 fn 期间他人可能已写：CAS 原文比较失败即冲突——固定脱敏错误，不自动重放。
        if (!compareAndSet(database, AUTH_NAMESPACE, providerId, expectedRaw, JSON.stringify(next)))
          throw new Error("凭据已被其他进程修改，本次写入已取消，请重试");
        return structuredClone(next);
      });
    },
    async delete(providerId, options) {
      options?.signal?.throwIfAborted();
      await enqueue(() => {
        database.delete(AUTH_NAMESPACE, providerId);
      });
    },
  };

  // ---- 首次幂等导入 ----------------------------------------------------------------
  // 导入告警去重：坏文件在修复前每次 init 都会重读重报，同一来源同一消息只记一条。
  // 读整表 → 追加 → 整表回写是两条语句，包保存点：崩在中间不留半截告警列表。
  const recordImportError = (source, error) => change(() => {
    const list = importErrors();
    if (list.some((item) => item.source === source && item.error === error)) return;
    database.set(NAMESPACE, IMPORT_ERROR_KEY, [...list, { source, error }]);
  });
  // 来源修复后其历史告警已过时，全部清除（避免空权威页面上出现陈旧噪音）。
  const clearImportErrors = (source) => change(() => {
    const list = importErrors();
    const rest = list.filter((item) => item.source !== source);
    if (rest.length !== list.length) database.set(NAMESPACE, IMPORT_ERROR_KEY, rest);
  });

  // 单文件导入门闩：仅成功导入后才打标记，此后不再读该源文件（旧配置此后只是历史，
  // 不再覆盖权威）。读失败/坏 JSON/结构拒绝：记录去重告警且不打标记——用户修好原文件后
  // 下次 init 自动重新导入（与 README「坏文件保留并警告，修复后可再次导入」一致），
  // 每次重试只多读一个小文件，代价可忽略。JSON 解析错误不携带 error.message
  //（V8 SyntaxError 可能附带文件原文片段，有密钥泄露风险）。
  const importOnce = async (source, apply, { markMissing = false } = {}) => {
    if (readRow(MIGRATED_NAMESPACE, source) !== undefined) return;
    let raw;
    try {
      raw = await readFile(source, "utf8");
    } catch (error) {
      if (error.code === "ENOENT") {
        // 无旧配置：零导入。仍打标记关闭迁移窗口——日后才出现的旧文件不再补导
        //（页面配置后不跟随，权威清空后也不复活）。收藏来源不受此影响。
        if (markMissing) database.set(MIGRATED_NAMESPACE, source, true);
        return;
      }
      recordImportError(source, "无法读取旧配置文件，已跳过导入");
      return;
    }
    let value;
    try {
      value = JSON.parse(raw);
    } catch {
      recordImportError(source, "不是有效 JSON，已跳过导入；原文件未改动，可在本页重新配置");
      return;
    }
    // apply 与打标记必须同生共死：只 apply 没打标记会重复导入，只打标记没 apply 会永久丢数据。
    if (!(await change(() => apply(value)))) return; // 部分拒绝：告警已记录，不打标记，修复后下次 init 重试
    change(() => {
      database.set(MIGRATED_NAMESPACE, source, true);
      clearImportErrors(source);
    });
  };

  // 已知损坏的结构不进权威（UI 是唯一修复入口，坏结构一旦入库将无法通过 UI 修复）。
  // 返回 true = 本来源干净（可打标记）；false = 有条目被拒（不打标记，修复后重导）。
  const importModels = (value) => {
    if (!isPlainObject(value) || (value.providers !== undefined && !isPlainObject(value.providers))) {
      recordImportError(sources.models, "结构无效（顶层/providers 必须是对象），已跳过导入；原文件未改动");
      return false;
    }
    if (readRow(NAMESPACE, CONFIG_KEY) === undefined) database.set(NAMESPACE, CONFIG_KEY, value);
    return true;
  };
  const importAuth = (value) => {
    if (!isPlainObject(value)) {
      recordImportError(sources.auth, "结构无效（顶层必须是对象），已跳过导入；原文件未改动");
      return false;
    }
    // 逐 provider 写入包同一保存点：中途失败（磁盘满/SQL 异常）不留半截导入——半截既不完整，
    // 又会因「行已存在」占位阻断下次重导。
    return change(() => {
      let clean = true;
      for (const [providerId, credential] of Object.entries(value)) {
        if (!isCredential(credential)) {
          recordImportError(sources.auth, `provider「${providerId}」的凭据格式无效，已跳过该条`);
          clean = false;
          continue;
        }
        // 权威已有的 providerId 一律不覆盖：UI 新值 / 上次导入优先，旧文件只是历史。
        if (readRow(AUTH_NAMESPACE, providerId) === undefined)
          database.set(AUTH_NAMESPACE, providerId, credential);
      }
      return clean;
    });
  };
  const importFavorites = (value) => {
    if (!isPlainObject(value)) {
      // 与 importModels/importAuth 同口径：不导入就必须给用户可见告警，否则每次启动
      // 默默重读同一个坏文件，用户永远不知道收藏为何没过来。
      recordImportError(sources.favorites, "结构无效（顶层必须是对象），已跳过导入；原文件未改动");
      return false;
    }
    // 走同一写入口：导入与 CAS 写的形状必须一致（都带 version）。
    if (readRow(NAMESPACE, FAVORITES_KEY) === undefined) writeFavoritesRaw(value);
    return true;
  };

  const readHiddenRaw = () => readRow(NAMESPACE, HIDDEN_KEY);
  const writeHiddenRaw = (keys) => database.set(NAMESPACE, HIDDEN_KEY, { keys, version: 1 });
  // hidden 与 config/favorites/凭据同口径用 CAS：本模块注释自陈要解决「同 HOME 多进程
  // 读-改-写丢更新」，唯独 hidden 盲写就会让先写者的隐藏项复活。
  const hiddenState = () => readState(NAMESPACE, HIDDEN_KEY);
  const casHidden = (raw, keys) =>
    compareAndSet(database, NAMESPACE, HIDDEN_KEY, raw, JSON.stringify({ keys, version: 1 }));

  const readFavoritesRaw = () => readRow(NAMESPACE, FAVORITES_KEY);
  // version 由本模块定，必须放在 spread 之后：否则调用方传入的 store.version 能覆盖字面量。
  const writeFavoritesRaw = (store) => database.set(NAMESPACE, FAVORITES_KEY, { ...store, version: 1 });

  // 启动装配：幂等导入 → 全量重建派生兼容文件（幂等：任意时刻删掉 compat 文件重启即恢复）。
  // 必须在 createPiFactory 之前 await 完成，SDK 首次读模型目录时兼容文件已就绪。
  const init = async () => {
    // 导入门闩：每个来源只看自己的 migrated/<source> 标记，绝不用「另一个来源已导入」去推断。
    // 权威已存在（页面配置或既往导入）时，没留告警的来源直接补打标记退出导入；仍有告警的来源
    // 必须保持窗口开着——README 承诺「坏文件保留并警告，修复后可再次导入」，而 importModels/
    // importAuth 都不覆盖已存在的权威行，重试只补缺失条目，绝不回退用户在页面上的新值。
    // （旧实现以 models/config 是否存在作为两个来源的共用门闩：models.json 合法 + auth.json 有坏
    // 条目时，第二次 init 就把 auth 的窗口永久关掉并清空告警，坏条目修好也永不导入。）
    const pending = new Set(importErrors().map((item) => item.source));
    // 必须在循环前一次捕获：否则 models 刚导入完写下 config，auth 就会被误判为「已配置」而直接退出导入。
    const configured = readRow(NAMESPACE, CONFIG_KEY) !== undefined;
    for (const [source, apply] of [[sources.models, importModels], [sources.auth, importAuth]]) {
      if (configured && !pending.has(source)) {
        if (readRow(MIGRATED_NAMESPACE, source) === undefined)
          database.set(MIGRATED_NAMESPACE, source, true);
        clearImportErrors(source);
        continue;
      }
      await importOnce(source, apply, { markMissing: true });
    }
    await importOnce(sources.favorites, importFavorites);
    await syncCompatFile(readConfig());
  };

  // 导入期告警（get() 在权威配置为空时转成 parseError 展示）。
  // 自身也可能是那行坏 JSON：这里必须裸 try/catch，不能再走 readRow（会递归回本函数）。
  const importErrors = () => {
    try {
      return database.get(NAMESPACE, IMPORT_ERROR_KEY) ?? [];
    } catch {
      return [];
    }
  };

  // ModelRuntime.create 的注入参数：凭据走内存注入（零文件），模型目录走派生兼容文件。
  const runtimeOptions = () => ({ credentials, modelsPath: compatPath });

  return {
    compatPath,
    sources,
    init,
    importErrors,
    readConfig,
    writeConfig,
    configState,
    casConfig,
    favoritesState,
    casFavorites,
    hiddenState,
    casHidden,
    syncCompatFile,
    canonicalModelsJson,
    getFavorites: readFavoritesRaw,
    setFavorites: writeFavoritesRaw,
    getHidden: readHiddenRaw,
    setHidden: writeHiddenRaw,
    credentials,
    runtimeOptions,
  };
}
