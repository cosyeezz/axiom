// Observation Pack：大工具结果先全文发送 fullSends 次，之后在 context 投影层
// 替换为字节级稳定的占位符；原文按内容寻址归档，模型用 obs_recall 取回。
// 移植自 SoL-Pi extensions/observation-pack（NVIDIA，MIT），适配点见 devlog 2026-09-19。
// 关键不变量：不改写持久历史（投影层 structuredClone 之后的消息数组）、
// 折叠失败 fail-open（原文照发）、占位符为纯函数输出（前缀缓存逐字节稳定）。
//
// 2026-09-19 加固（见 devlog）：
// - 取回回显不再被当成新观察归档，而是折叠为指回原对象的指针（消除 O→placeholder→recall→placeholder 的多层引用）。
// - 发送次数改为纯推导（其后 assistant 消息数），投影幂等：取消/重试/重复投影不再虚增材料年龄。
// - 取回支持 limit/行范围/关键词三种定位，硬上限不再等于默认读取量。
// - 归档写 sidecar manifest，取回时按 manifest 校验内容哈希（等长篡改可检出）。
// - 每请求热路径记忆化：同一工具调用的 hash / 归档校验 / 占位符只算一次。
import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { appendFile, lstat, mkdir, open, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

/** Only tool results larger than this participate. AXIOM 定 6KB（SoL-Pi 原版 10KB）。 */
export const THRESHOLD_BYTES = 6 * 1024;
/** 前几次请求仍全文发送，之后占位符接管。 */
export const FULL_SENDS = 2;
/** 占位符摘录预算：头尾各半，只取完整行。 */
export const PLACEHOLDER_EXCERPT_BYTES = 1024;

const CHARS_PER_TOKEN = 4;
const OBSERVATION_ID_PATTERN = /^obs_[a-f0-9]{24}$/u;
// Windows 无 O_NOFOLLOW（undefined 按位或会得到 NaN）。
const READ_OBJECT_FLAGS = constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0);
const CREATE_OBJECT_FLAGS = constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0);

const RECALL_MAX_BYTES = 16 * 1024;
const RECALL_MAX_LINES = 400;
const RECALL_HEADER_RESERVE_BYTES = 512;
const RECALL_HEADER_LINES = 2;
const RECALL_LIMITS = {
  maxBytes: RECALL_MAX_BYTES - RECALL_HEADER_RESERVE_BYTES,
  maxLines: RECALL_MAX_LINES - RECALL_HEADER_LINES,
};
/** 默认单次取回正文预算：小于硬上限，避免“只想确认一行”也拉回满页。 */
const RECALL_DEFAULT_BYTES = 4 * 1024;
/** 行定位 / 关键词检索需要整文件入内存，超过这个尺寸退回字节分页。 */
const RECALL_SCAN_MAX_BYTES = 8 * 1024 * 1024;
const RECALL_DEFAULT_CONTEXT_LINES = 2;
const RECALL_MAX_CONTEXT_LINES = 20;
const RECALL_MAX_QUERY_BYTES = 512;

export function hash(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function estimateTokens(text) {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

export function countLines(text) {
  if (text.length === 0) return 0;
  let lines = text.endsWith("\n") ? 0 : 1;
  for (const character of text) {
    if (character === "\n") lines += 1;
  }
  return lines;
}

function countBufferLines(buffer) {
  if (buffer.length === 0) return 0;
  let lines = buffer[buffer.length - 1] === 0x0a ? 0 : 1;
  for (const byte of buffer) {
    if (byte === 0x0a) lines += 1;
  }
  return lines;
}

// ---------------------------------------------------------------------------
// 策略配置：阈值 / 全文次数 / 工作集 / 取回预算 / 校验强度可注入，
// 每项都能单独回滚到原常量。configVersion 进 ledger，便于按策略版本分段归因。
// ---------------------------------------------------------------------------

/** 关闭新折叠时仍保留 obs_recall：上下文或摘要里可能还存在旧占位符。 */
export const OBSERVATION_DEFAULTS = {
  thresholdBytes: THRESHOLD_BYTES,
  fullSends: FULL_SENDS,
  placeholderExcerptBytes: PLACEHOLDER_EXCERPT_BYTES,
  foldEnabled: true,
  foldRecallEchoes: true,
  strictVerify: false,
  recallDefaultBytes: RECALL_DEFAULT_BYTES,
};

function positiveInteger(value, fallback, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) {
  if (value == null) return fallback;
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new Error(`observation-pack config expects an integer in [${min}, ${max}], received ${value}`);
  }
  return value;
}

export function resolveObservationConfig(options = {}) {
  const resolved = {
    thresholdBytes: positiveInteger(options.thresholdBytes, THRESHOLD_BYTES, { min: 256 }),
    fullSends: positiveInteger(options.fullSends, FULL_SENDS, { min: 0, max: 64 }),
    placeholderExcerptBytes: positiveInteger(options.placeholderExcerptBytes, PLACEHOLDER_EXCERPT_BYTES, { min: 64, max: RECALL_LIMITS.maxBytes }),
    foldEnabled: options.foldEnabled ?? true,
    foldRecallEchoes: options.foldRecallEchoes ?? true,
    strictVerify: options.strictVerify ?? false,
    recallDefaultBytes: positiveInteger(options.recallDefaultBytes, RECALL_DEFAULT_BYTES, { min: 256, max: RECALL_LIMITS.maxBytes }),
  };
  const fingerprint = hash(JSON.stringify(Object.entries(resolved).sort(([a], [b]) => (a < b ? -1 : 1)))).slice(0, 12);
  return Object.freeze({ ...resolved, configVersion: fingerprint });
}

const DEFAULT_CONFIG = resolveObservationConfig();

export function isPureTextResult(message) {
  return (
    message.role === "toolResult" &&
    !message.isError &&
    Array.isArray(message.content) &&
    message.content.length > 0 &&
    message.content.every((block) => block.type === "text")
  );
}

function textFromResult(message) {
  return message.content.map((block) => block.text).join("\n");
}

/** 归档布局由注入的会话目录决定（对齐 AXIOM 的 `<id>-observations` 清理约定）。 */
export function objectPath(root, id) {
  return join(root, "objects", `${id}.txt`);
}

/** sidecar manifest：持久化完整 contentHash 与字节数，取回时据此校验等长篡改。 */
export function manifestPath(root, id) {
  return join(root, "objects", `${id}.json`);
}

export function isObservationId(id) {
  return OBSERVATION_ID_PATTERN.test(id);
}

/**
 * 会话内内容寻址：id = hash(toolName, toolCallId, contentHash)。resume 沿用同一目录；
 * 分支重建自己的对象（历史未被改写，原文可再归档）。
 */
export function createObservation(message, root, config = DEFAULT_CONFIG) {
  const text = textFromResult(message);
  const bytes = Buffer.byteLength(text, "utf8");
  if (bytes <= config.thresholdBytes) return undefined;
  if (!root) throw new Error("Observation archive directory is unavailable");

  const contentHash = hash(text);
  const id = `obs_${hash(`${message.toolName}\0${message.toolCallId}\0${contentHash}`).slice(0, 24)}`;
  return {
    id,
    contentHash,
    filePath: objectPath(root, id),
    manifestFile: manifestPath(root, id),
    toolName: message.toolName,
    text,
    bytes,
    lines: countLines(text),
    tokens: estimateTokens(text),
  };
}

/**
 * 写入内容寻址路径：O_EXCL 创建，拒绝符号链接；已存在则逐字节校验后才复用。
 * 同时写 sidecar manifest（best-effort：manifest 写失败不影响原文可用性）。
 */
export async function ensureStored(observation) {
  const directoryPath = dirname(observation.filePath);
  await mkdir(directoryPath, { recursive: true, mode: 0o700 });
  const directoryStats = await lstat(directoryPath);
  if (!directoryStats.isDirectory() || directoryStats.isSymbolicLink()) {
    throw new Error(`Observation directory is not a regular directory for ${observation.id}`);
  }

  let handle;
  try {
    handle = await open(observation.filePath, CREATE_OBJECT_FLAGS, 0o600);
    await handle.writeFile(observation.text, { encoding: "utf8" });
  } catch (error) {
    if (!(error instanceof Error) || !("code" in error) || error.code !== "EEXIST") throw error;
    const existingHandle = await open(observation.filePath, READ_OBJECT_FLAGS);
    try {
      const existing = await existingHandle.stat();
      if (!existing.isFile()) {
        throw new Error(`Content-addressed observation is not a regular file for ${observation.id}`);
      }
      if (existing.size !== observation.bytes) {
        throw new Error(`Content-addressed observation size mismatch for ${observation.id}`);
      }
      const existingContent = await existingHandle.readFile();
      if (hash(existingContent) !== observation.contentHash) {
        throw new Error(`Content-addressed observation hash mismatch for ${observation.id}`);
      }
    } finally {
      await existingHandle.close();
    }
  } finally {
    await handle?.close();
  }

  await writeManifest(observation);
}

async function writeManifest(observation) {
  const manifest = JSON.stringify({
    id: observation.id,
    contentHash: observation.contentHash,
    bytes: observation.bytes,
    lines: observation.lines,
    tool: observation.toolName,
    storedAt: new Date().toISOString(),
  });
  try {
    await writeFile(observation.manifestFile, manifest, { encoding: "utf8", mode: 0o600 });
  } catch (error) {
    // manifest 只服务校验；写不进去时退回“未校验取回”，不能因此丢原文。
    console.error(`[observation-pack] manifest write failed for ${observation.id}: ${error?.message ?? error}`);
  }
}

export async function readManifest(root, id) {
  try {
    const raw = await readFile(manifestPath(root, id), "utf8");
    const parsed = JSON.parse(raw);
    if (typeof parsed?.contentHash !== "string" || !Number.isSafeInteger(parsed?.bytes)) return undefined;
    return parsed;
  } catch {
    return undefined;
  }
}

/**
 * 按 manifest 校验归档完整性。等长改写在 readRecallChunk 的 size 检查下不可见，
 * 只有全文哈希能发现。结果按 (path, size, mtimeMs) 缓存：同一进程内每个对象最多算一次。
 */
const fileVersion = (stat) => `${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}`;

export function createIntegrityVerifier() {
  const verified = new Map();
  return async function verifyObject(root, id, { strict = false, snapshot = false } = {}) {
    const path = objectPath(root, id);
    const handle = await open(path, READ_OBJECT_FLAGS);
    let stats, bytes;
    try {
      stats = await handle.stat();
      if (!stats.isFile()) throw new Error("Stored observation is not a regular file");
      bytes = await handle.readFile();
      if (fileVersion(stats) !== fileVersion(await handle.stat())) throw new Error("Observation changed while reading");
    } finally {
      await handle.close();
    }

    const manifestStat = await lstat(manifestPath(root, id)).catch((error) => {
      if (error.code === "ENOENT") return null;
      throw error;
    });
    if (manifestStat && (!manifestStat.isFile() || manifestStat.isSymbolicLink())) throw new Error("Invalid observation manifest file");
    const cacheKey = `${path}\0${fileVersion(stats)}\0${manifestStat ? fileVersion(manifestStat) : "missing"}\0${strict}`;
    if (verified.size > 256) verified.clear();
    const cached = verified.get(cacheKey);
    if (cached) {
      if (cached.error) throw new Error(cached.error);
      if (cached.digest !== hash(bytes)) throw new Error(`Observation ${id} content hash changed`);
      return snapshot ? { integrity: cached.state, bytes } : cached.state;
    }

    const manifest = await readManifest(root, id);
    if (!manifest) {
      // 旧归档没有 manifest：严格模式拒绝取回，宽松模式记为 unverified 继续。
      if (strict) {
        const message = `Observation ${id} has no manifest; refusing to recall under strictVerify`;
        verified.set(cacheKey, { error: message });
        throw new Error(message);
      }
      if (manifestStat) throw new Error(`Observation ${id} has a malformed manifest`);
      verified.set(cacheKey, { state: "unverified", digest: hash(bytes) });
      return snapshot ? { integrity: "unverified", bytes } : "unverified";
    }
    if (manifest.id !== id || !/^[a-f0-9]{64}$/.test(manifest.contentHash)) throw new Error(`Observation ${id} has an invalid manifest`);
    if (manifest.bytes !== stats.size) {
      const message = `Observation ${id} size does not match its manifest (${stats.size} vs ${manifest.bytes})`;
      verified.set(cacheKey, { error: message });
      throw new Error(message);
    }
    const actual = hash(bytes);
    if (actual !== manifest.contentHash) {
      const message = `Observation ${id} content hash does not match its manifest`;
      verified.set(cacheKey, { error: message });
      throw new Error(message);
    }
    verified.set(cacheKey, { state: "verified", digest: actual });
    return snapshot ? { integrity: "verified", bytes } : "verified";
  };
}

function trimUtf8End(buffer, limit) {
  let end = limit;
  while (end > 0 && end < buffer.length && ((buffer[end] ?? 0) & 0xc0) === 0x80) end -= 1;
  return end;
}

/** 起点落在多字节字符中间时前移到下一个字符首字节，避免开头出现替换字符。 */
function alignUtf8Start(buffer, start) {
  let aligned = start;
  while (aligned < buffer.length && ((buffer[aligned] ?? 0) & 0xc0) === 0x80) aligned += 1;
  return aligned;
}

function excerptByBytes(text, budgetBytes, fromEnd) {
  const buffer = Buffer.from(text, "utf8");
  if (buffer.length <= budgetBytes) return text;
  if (fromEnd) {
    const start = alignUtf8Start(buffer, buffer.length - budgetBytes);
    return buffer.subarray(start).toString("utf8");
  }
  return buffer.subarray(0, trimUtf8End(buffer, budgetBytes)).toString("utf8");
}

function completeLineExcerpt(text, budgetBytes, fromEnd) {
  const lines = text.split(/(?<=\n)/);
  const selected = [];
  let selectedBytes = 0;
  let index = fromEnd ? lines.length - 1 : 0;

  while (index >= 0 && index < lines.length) {
    const line = lines[index];
    if (line === undefined) break;
    const lineBytes = Buffer.byteLength(line, "utf8");
    if (selectedBytes + lineBytes > budgetBytes) break;
    if (fromEnd) selected.unshift(line);
    else selected.push(line);
    selectedBytes += lineBytes;
    index += fromEnd ? -1 : 1;
  }

  // 首行就超预算（单行大结果：压缩 JSON / 无换行日志）时按字节截断兜底，
  // 否则占位符会退化成“只剩元数据、零内容”。
  if (selected.length === 0) return excerptByBytes(text, budgetBytes, fromEnd);
  return selected.join("");
}

export function placeholderFor(observation, config = DEFAULT_CONFIG) {
  const headBudget = Math.floor(config.placeholderExcerptBytes / 2);
  const tailBudget = config.placeholderExcerptBytes - headBudget;
  const head = completeLineExcerpt(observation.text, headBudget, false);
  const tail = completeLineExcerpt(observation.text, tailBudget, true);
  return [
    `[large tool result replaced after its first ${config.fullSends} provider requests]`,
    `id: ${observation.id}`,
    `tool: ${observation.toolName}`,
    `original_bytes: ${observation.bytes}`,
    `original_lines: ${observation.lines}`,
    `estimated_tokens: ${observation.tokens}`,
    `retrieve: call obs_recall with {"id":"${observation.id}","offset":0}; continue with returned next_offset`,
    `narrow: add "query" (keyword), or "startLine"/"lineLimit", to avoid re-reading whole pages`,
    `[first complete lines, up to ${headBudget} bytes]`,
    head,
    `[middle omitted; last complete lines, up to ${tailBudget} bytes]`,
    tail,
    `[${observation.bytes} original bytes omitted]`,
  ].join("\n");
}

// ---------------------------------------------------------------------------
// 取回回显：obs_recall 的输出本身是「某个原对象的投影视图」，不是新资料。
// 折叠它时不再归档成新对象，而是换成指回原对象的指针，避免引用层数增长。
// ---------------------------------------------------------------------------

const RECALL_ECHO_PATTERN = /^\[obs_recall id=(obs_[a-f0-9]{24})\b([^\]]*)\]/u;

export function parseRecallEcho(text) {
  const match = RECALL_ECHO_PATTERN.exec(text);
  if (!match) return undefined;
  const id = match[1];
  if (!isObservationId(id)) return undefined;
  const fields = match[2] ?? "";
  const pick = (name) => {
    const found = new RegExp(`${name}=(\\d+)`, "u").exec(fields);
    return found ? Number(found[1]) : undefined;
  };
  return { id, offset: pick("offset"), nextOffset: pick("next_offset") };
}

export function recallPointerFor(echo, bytes) {
  const range = echo.offset != null && echo.nextOffset != null ? ` bytes ${echo.offset}..${echo.nextOffset}` : "";
  const resume = echo.nextOffset != null ? `,"offset":${echo.nextOffset}` : "";
  return [
    `[recall view of ${echo.id}${range} dropped from context; ${bytes} bytes]`,
    `re-read: call obs_recall with {"id":"${echo.id}"${resume}} (add "query"/"startLine" to narrow)`,
  ].join("\n");
}

// ---------------------------------------------------------------------------
// 取回：字节分页（默认）/ 行范围 / 关键词检索。三者共享同一硬上限，
// 但默认读取量小于硬上限，避免“确认一个符号”也拉回满页。
// ---------------------------------------------------------------------------

function bufferHandle(bytes) {
  return {
    stat: async () => ({ isFile: () => true, size: bytes.length }),
    read: async (buffer, start, length, position) => ({ bytesRead: bytes.copy(buffer, start, position, position + length) }),
    readFile: async () => bytes.toString("utf8"),
    close: async () => {},
  };
}

export async function readRecallChunk(path, offset, limits) {
  const handle = Buffer.isBuffer(path) ? bufferHandle(path) : await open(path, READ_OBJECT_FLAGS);
  try {
    const fileStats = await handle.stat();
    if (!fileStats.isFile()) throw new Error("Stored observation is not a regular file");
    if (offset > fileStats.size) throw new Error(`Offset ${offset} exceeds observation size ${fileStats.size}`);

    const available = Math.max(0, fileStats.size - offset);
    const buffer = Buffer.alloc(Math.min(available, limits.maxBytes + 4));
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, offset);

    // 起点可能落在多字节字符中间（模型按上次 next_offset 之外的值试探时）：
    // 前移到字符边界并如实回报实际起点，chunk 里不留替换字符。
    const start = alignUtf8Start(buffer.subarray(0, bytesRead), 0);
    let end = Math.min(bytesRead, start + limits.maxBytes);
    let newlineCount = 0;

    for (let index = start; index < end; index += 1) {
      if (buffer[index] !== 0x0a) continue;
      newlineCount += 1;
      if (newlineCount === limits.maxLines) {
        end = index + 1;
        break;
      }
    }

    end = trimUtf8End(buffer, end);
    const chunk = buffer.subarray(start, Math.max(start, end));
    const nextOffset = offset + start + chunk.length;
    return {
      mode: "bytes",
      text: chunk.toString("utf8"),
      bytes: chunk.length,
      lines: countBufferLines(chunk),
      offset: offset + start,
      nextOffset,
      eof: nextOffset >= fileStats.size,
      size: fileStats.size,
    };
  } finally {
    await handle.close();
  }
}

async function readWholeObject(path) {
  const handle = Buffer.isBuffer(path) ? bufferHandle(path) : await open(path, READ_OBJECT_FLAGS);
  try {
    const fileStats = await handle.stat();
    if (!fileStats.isFile()) throw new Error("Stored observation is not a regular file");
    if (fileStats.size > RECALL_SCAN_MAX_BYTES) {
      throw new Error(`Observation is ${fileStats.size} bytes; line and query modes cap at ${RECALL_SCAN_MAX_BYTES}. Use offset paging instead.`);
    }
    return { text: await handle.readFile("utf8"), size: fileStats.size };
  } finally {
    await handle.close();
  }
}

function splitLines(text) {
  const lines = text.split("\n");
  if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  return lines;
}

/** 行范围读取：1 基起始行 + 行数，按字节预算截断。 */
export async function readRecallLines(path, startLine, lineLimit, limits) {
  const { text, size } = await readWholeObject(path);
  const lines = splitLines(text);
  if (startLine > lines.length) {
    throw new Error(`startLine ${startLine} exceeds observation line count ${lines.length}`);
  }
  const begin = startLine - 1;
  const selected = [];
  let bytes = 0;
  let index = begin;
  while (index < lines.length && selected.length < lineLimit && selected.length < limits.maxLines) {
    const candidate = `${lines[index]}\n`;
    const candidateBytes = Buffer.byteLength(candidate, "utf8");
    if (bytes + candidateBytes > limits.maxBytes && selected.length > 0) break;
    if (bytes + candidateBytes > limits.maxBytes) {
      selected.push(`${excerptByBytes(lines[index], limits.maxBytes, false)}\n`);
      bytes = limits.maxBytes;
      index += 1;
      break;
    }
    selected.push(candidate);
    bytes += candidateBytes;
    index += 1;
  }
  return {
    mode: "lines",
    text: selected.join(""),
    bytes,
    lines: selected.length,
    startLine,
    nextLine: index + 1,
    totalLines: lines.length,
    eof: index >= lines.length,
    size,
  };
}

/** 关键词检索：大小写不敏感子串，命中行带上下文，按字节预算截断。 */
export async function searchRecall(path, query, contextLines, limits) {
  const { text, size } = await readWholeObject(path);
  const lines = splitLines(text);
  const needle = query.toLowerCase();
  const blocks = [];
  let bytes = 0;
  let matches = 0;
  let emittedThrough = 0; // 已输出到的行号（1 基），用于合并相邻命中窗口
  let truncated = false;

  for (let index = 0; index < lines.length; index += 1) {
    if (!lines[index].toLowerCase().includes(needle)) continue;
    matches += 1;
    const from = Math.max(emittedThrough + 1, index + 1 - contextLines);
    const to = Math.min(lines.length, index + 1 + contextLines);
    if (to < from) continue;
    const rendered = [];
    for (let line = from; line <= to; line += 1) rendered.push(`${line}: ${lines[line - 1]}\n`);
    const block = (from > emittedThrough + 1 && emittedThrough > 0 ? "...\n" : "") + rendered.join("");
    const blockBytes = Buffer.byteLength(block, "utf8");
    const blockLines = countLines(block);
    if (bytes + blockBytes > limits.maxBytes || countLines(blocks.join("")) + blockLines > limits.maxLines) {
      truncated = true;
      break;
    }
    blocks.push(block);
    bytes += blockBytes;
    emittedThrough = to;
  }

  return {
    mode: "query",
    text: blocks.join(""),
    bytes,
    lines: countLines(blocks.join("")),
    matches,
    totalLines: lines.length,
    truncated,
    lastLine: emittedThrough,
    eof: !truncated,
    size,
  };
}

// ---------------------------------------------------------------------------
// 度量：进程内统计（面板显示）+ ledger（长期审计，只记状态转换不逐请求记账）。
// recallRate 的分子分母必须同尺度：被取回过的**不同对象数** / 折叠过的**不同对象数**。
// 页数单独计（recallPages），分页读完一个对象不再被误算成“取回率 700%”。
// ---------------------------------------------------------------------------

export function createObservationStats() {
  return {
    foldedIds: new Set(),
    recalledIds: new Set(),
    savedTokens: 0,
    recalls: 0,
    recallPages: 0,
    recallFailures: 0,
    echoFolds: 0,
    failures: 0,
  };
}

export function observationRuntime(stats) {
  if (!stats) return undefined;
  const folded = stats.foldedIds.size;
  const recalledObjects = stats.recalledIds.size;
  return {
    folded,
    savedTokens: stats.savedTokens,
    // recalls 保留“成功取回调用次数”语义（面板展示用），recallPages 与之同义但命名更准确。
    recalls: stats.recalls,
    recallPages: stats.recallPages,
    recalledObjects,
    recallFailures: stats.recallFailures,
    echoFolds: stats.echoFolds,
    failures: stats.failures,
    // 有多少折叠对象事后被重新取回：>1 不可能，可直接用于判断折叠是否折错了东西。
    recallRate: folded ? Math.min(1, recalledObjects / folded) : 0,
  };
}

function createLedger(root, base) {
  let directoryReady = false;
  return async (entry) => {
    try {
      if (!directoryReady) {
        await mkdir(root, { recursive: true, mode: 0o700 });
        directoryReady = true;
      }
      await appendFile(
        join(root, "ledger.jsonl"),
        `${JSON.stringify({ timestamp: new Date().toISOString(), ...base, ...entry })}\n`,
        "utf8",
      );
    } catch (error) {
      // 度量失败不影响机制本身。
      console.error(`[observation-pack] ledger write failed: ${error?.message ?? error}`);
    }
  };
}

// ---------------------------------------------------------------------------
// 摘要口径：obs_recall 回显是原对象的字节切片。当同一批待摘要消息里既有原始
// 工具输出、又有它的取回回显时，回显是纯冗余（逐字包含在原文里），可安全丢弃。
// 找不到对应原文时一律保留：那份回显可能是该内容在本批里唯一的副本。
// ---------------------------------------------------------------------------

export function dropRedundantRecallEchoes(messages, config = DEFAULT_CONFIG) {
  if (!Array.isArray(messages) || messages.length === 0) return messages;
  const present = new Set();
  for (const message of messages) {
    if (!message || !isPureTextResult(message)) continue;
    const text = textFromResult(message);
    if (Buffer.byteLength(text, "utf8") <= config.thresholdBytes) continue;
    if (parseRecallEcho(text)) continue;
    present.add(`obs_${hash(`${message.toolName}\0${message.toolCallId}\0${hash(text)}`).slice(0, 24)}`);
  }
  if (present.size === 0) return messages;

  const kept = messages.filter((message) => {
    if (!message || !isPureTextResult(message)) return true;
    const echo = parseRecallEcho(textFromResult(message));
    return !echo || !present.has(echo.id);
  });
  return kept.length === messages.length ? messages : kept;
}

// ---------------------------------------------------------------------------
// 扩展：context 投影 + obs_recall 工具。归档目录由调用方注入（会话存储布局）。
// ---------------------------------------------------------------------------

// Read-only projection used by compaction estimates. Never archives, logs, or changes counters.
export function previewObservationMessages(messages, root, options = {}) {
  if (!root) return messages;
  const config = resolveObservationConfig(options);
  if (!config.foldEnabled) return messages;
  let assistants = 0;
  const projected = [...messages];
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (message?.role === "assistant") assistants += 1;
    if (!message || !isPureTextResult(message) || assistants < config.fullSends) continue;
    const text = textFromResult(message);
    if (Buffer.byteLength(text, "utf8") <= config.thresholdBytes) continue;
    const echo = config.foldRecallEchoes ? parseRecallEcho(text) : undefined;
    const observation = echo ? null : createObservation(message, root, config);
    const pointer = echo ? recallPointerFor(echo, Buffer.byteLength(text, "utf8")) : placeholderFor(observation, config);
    projected[i] = { ...message, content: [{ type: "text", text: pointer }] };
  }
  return projected;
}

export function observationPackExtension(root, stats = null, options = {}) {
  if (!root) throw new Error("observation-pack requires an archive directory");
  const config = resolveObservationConfig(options);
  const agentId = options.agentId ?? null;
  return (pi) => {
    const runId = hash(`${Date.now()}\0${Math.random()}`).slice(0, 8);
    const ledger = createLedger(root, { runId, ...(agentId ? { agentId } : {}), configVersion: config.configVersion });
    const verifyObject = createIntegrityVerifier();
    const loggedFolds = new Set();
    const projectionCache = new Map();
    // 哪些投影真的折过东西（等着与供应商响应配对）。
    const foldedProjections = new Set();
    // 每次 context 投影一个序号：fold 事件与 projection 汇总共享它，
    // 折叠批次与最早变化边界（缓存失效起点）因此可事后归因。
    let projectionSeq = 0;

    pi.registerTool({
      name: "obs_recall",
      label: "Recall Observation",
      description:
        "Read a stored large tool result. Default reads a small page from `offset`; " +
        "prefer `query` (keyword) or `startLine`/`lineLimit` to pull only what you need.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string", description: "Observation id from a placeholder" },
          offset: { type: "integer", minimum: 0, description: "Byte offset, default 0" },
          limit: {
            type: "integer",
            minimum: 1,
            maximum: RECALL_LIMITS.maxBytes,
            description: `Max body bytes to return, default ${config.recallDefaultBytes}`,
          },
          startLine: { type: "integer", minimum: 1, description: "1-based start line; overrides offset" },
          lineLimit: { type: "integer", minimum: 1, maximum: RECALL_LIMITS.maxLines, description: "Lines to return with startLine" },
          query: { type: "string", description: "Case-insensitive substring; returns matching lines with context" },
          contextLines: {
            type: "integer",
            minimum: 0,
            maximum: RECALL_MAX_CONTEXT_LINES,
            description: `Context lines around each query match, default ${RECALL_DEFAULT_CONTEXT_LINES}`,
          },
        },
        required: ["id"],
        additionalProperties: false,
      },
      async execute(_toolCallId, params) {
        const input = params ?? {};
        if (!isObservationId(input.id)) throw new Error(`Unknown observation id: ${input.id}`);
        for (const field of ["offset", "limit", "startLine", "lineLimit", "contextLines"]) {
          const value = input[field];
          if (value != null && (!Number.isSafeInteger(value) || value < 0)) {
            throw new Error(`obs_recall ${field} must be a non-negative integer`);
          }
        }
        if (input.query != null && (typeof input.query !== "string" || input.query.length === 0)) {
          throw new Error("obs_recall query must be a non-empty string");
        }
        if (input.query != null && Buffer.byteLength(input.query, "utf8") > RECALL_MAX_QUERY_BYTES) {
          throw new Error(`obs_recall query must be at most ${RECALL_MAX_QUERY_BYTES} bytes`);
        }
        if (input.startLine != null && input.startLine < 1) throw new Error("obs_recall startLine is 1-based");

        const limits = {
          maxBytes: Math.min(input.limit ?? config.recallDefaultBytes, RECALL_LIMITS.maxBytes),
          maxLines: Math.min(input.lineLimit ?? RECALL_LIMITS.maxLines, RECALL_LIMITS.maxLines),
        };
        const offset = input.offset ?? 0;

        let chunk;
        let integrity = "unverified";
        try {
          // 取回前按 manifest 校验：等长改写 size 检查看不出来，只有全文哈希能发现。
          const verified = await verifyObject(root, input.id, { strict: config.strictVerify, snapshot: true });
          integrity = verified.integrity;
          const path = verified.bytes; // All modes read exactly the bytes whose hash was verified.
          if (input.query != null) {
            chunk = await searchRecall(path, input.query, input.contextLines ?? RECALL_DEFAULT_CONTEXT_LINES, limits);
          } else if (input.startLine != null) {
            chunk = await readRecallLines(path, input.startLine, input.lineLimit ?? RECALL_LIMITS.maxLines, limits);
          } else {
            chunk = await readRecallChunk(path, offset, limits);
          }
        } catch (error) {
          const missing = error instanceof Error && "code" in error && error.code === "ENOENT";
          const reason = missing ? `Unknown observation id: ${input.id}` : error instanceof Error ? error.message : String(error);
          if (stats) stats.recallFailures += 1;
          // 取回失败同样记账：只记成功会让“折叠后取不回来”在审计里完全隐形。
          await ledger({ event: "recall-failed", id: input.id, mode: input.query != null ? "query" : input.startLine != null ? "lines" : "bytes", reason });
          throw missing ? new Error(reason) : error;
        }

        const header = renderRecallHeader(input.id, chunk, integrity);
        const content = `${header}\n${chunk.text}`;
        if (Buffer.byteLength(content, "utf8") > RECALL_MAX_BYTES || countLines(content) > RECALL_MAX_LINES) {
          throw new Error("Recall output exceeded its hard limit");
        }
        if (stats) {
          stats.recalls += 1;
          stats.recallPages += 1;
          stats.recalledIds.add(input.id);
        }
        await ledger({
          event: "recall",
          id: input.id,
          mode: chunk.mode,
          integrity,
          offset: chunk.mode === "bytes" ? chunk.offset : undefined,
          startLine: chunk.startLine,
          query: input.query != null ? `len:${input.query.length}` : undefined,
          matches: chunk.matches,
          bytes: chunk.bytes,
          lines: chunk.lines,
          nextOffset: chunk.nextOffset,
          nextLine: chunk.nextLine,
          eof: chunk.eof,
        });
        return {
          content: [{ type: "text", text: content }],
          details: {
            id: input.id,
            mode: chunk.mode,
            integrity,
            offset: chunk.offset ?? offset,
            bytes: chunk.bytes,
            lines: chunk.lines,
            nextOffset: chunk.nextOffset,
            nextLine: chunk.nextLine,
            matches: chunk.matches,
            eof: chunk.eof,
          },
        };
      },
    });

    pi.on("context", async (event) => {
      if (!config.foldEnabled) return undefined;
      const projected = [...event.messages];
      const seq = (projectionSeq += 1);
      // 每条消息此前参与的请求数 = 其后 assistant 消息数。纯推导、不累加计数器：
      // 取消、重试、同一逻辑请求多次投影都不会虚增材料年龄，重启后也无需持久状态。
      const priorAssistantCounts = new Array(event.messages.length);
      let assistantCount = 0;
      for (let index = event.messages.length - 1; index >= 0; index -= 1) {
        priorAssistantCounts[index] = assistantCount;
        if (event.messages[index]?.role === "assistant") assistantCount += 1;
      }

      // 先筛候选（超阈值的纯文本工具结果），折叠判定与 ledger 统计共用这一份索引。
      const candidateIndexes = [];
      for (let index = 0; index < event.messages.length; index += 1) {
        const message = event.messages[index];
        if (!message || !isPureTextResult(message)) continue;
        if (Buffer.byteLength(textFromResult(message), "utf8") > config.thresholdBytes) candidateIndexes.push(index);
      }

      let savedTokens = 0;
      let foldBatch = 0;
      let earliestFoldIndex = -1;
      const memo = projectionCache; // bounded, session-local cache; source equality and file metadata invalidate it

      for (const index of candidateIndexes) {
        const message = event.messages[index];
        const sends = priorAssistantCounts[index] ?? 0;
        if (sends < config.fullSends) continue;

        try {
          const text = textFromResult(message);
          const echo = config.foldRecallEchoes ? parseRecallEcho(text) : undefined;
          if (echo) {
            // 取回回显折叠成指回原对象的指针：不新建归档对象，引用层数不增长。
            const bytes = Buffer.byteLength(text, "utf8");
            const pointer = recallPointerFor(echo, bytes);
            projected[index] = { ...message, content: [{ type: "text", text: pointer }] };
            savedTokens += Math.max(0, estimateTokens(text) - estimateTokens(pointer));
            foldBatch += 1;
            if (earliestFoldIndex < 0) earliestFoldIndex = index;
            if (stats) stats.echoFolds += 1;
            const foldKey = `echo:${echo.id}:${echo.offset ?? "?"}:${message.toolCallId}`;
            if (!loggedFolds.has(foldKey)) {
              loggedFolds.add(foldKey);
              await ledger({ event: "fold-echo", seq, id: echo.id, offset: echo.offset, nextOffset: echo.nextOffset, bytes, toolCallId: message.toolCallId });
            }
            continue;
          }

          // Tool identity alone is not a content version: compare actual text as well.
          const memoKey = `${message.toolName}\0${message.toolCallId}`;
          let entry = memo.get(memoKey);
          if (entry && entry.observation.text !== text) entry = undefined;
          if (!entry) {
            const observation = createObservation(message, root, config);
            if (!observation) continue;
            entry = { observation, placeholder: placeholderFor(observation, config), stored: false };
            memo.set(memoKey, entry);
            if (memo.size > 256) memo.delete(memo.keys().next().value);
          }
          const { observation } = entry;
          if (entry.stored) {
            const stat = await lstat(observation.filePath);
            if (!stat.isFile() || stat.isSymbolicLink() || fileVersion(stat) !== entry.version) entry.stored = false;
          }
          if (!entry.stored) {
            await ensureStored(observation);
            entry.version = fileVersion(await lstat(observation.filePath));
            entry.stored = true;
          }

          const removedTokens = Math.max(0, observation.tokens - estimateTokens(entry.placeholder));
          projected[index] = { ...message, content: [{ type: "text", text: entry.placeholder }] };
          savedTokens += removedTokens;
          foldBatch += 1;
          if (earliestFoldIndex < 0) earliestFoldIndex = index;
          if (stats) stats.foldedIds.add(observation.id);
          // 首次折叠记一笔状态转换。用本地集合判定，不依赖“恰好等于 fullSends”：
          // 从历史恢复时 sends 可能已经大于阈值，旧写法会整段漏记 fold。
          if (!loggedFolds.has(observation.id)) {
            loggedFolds.add(observation.id);
            await ledger({
              event: "fold",
              seq,
              id: observation.id,
              contentHash: observation.contentHash,
              tool: observation.toolName,
              toolCallId: message.toolCallId,
              sends,
              originalBytes: observation.bytes,
              originalLines: observation.lines,
              originalTokens: observation.tokens,
              placeholderBytes: Buffer.byteLength(entry.placeholder, "utf8"),
              removedTokens,
            });
          }
        } catch (error) {
          // fail-open：折叠失败绝不能让代理丢掉观察结果。
          const reason = error instanceof Error ? error.message : String(error);
          console.error(`[observation-pack] fail-open for tool result: ${reason}`);
          if (stats) stats.failures += 1;
          await ledger({ event: "fail-open", seq, tool: message.toolName, toolCallId: message.toolCallId, reason });
        }
      }

      if (stats) stats.savedTokens = savedTokens;
      // 投影汇总：最早折叠位置就是本次请求的前缀缓存最早失效点，折叠批次是本轮扰动规模。
      // 与持久化的 usage（cacheRead/cacheWrite）对齐后，缓存代价才能真正归因到折叠事件。
      if (foldBatch > 0) {
        foldedProjections.add(seq);
        await ledger({
          event: "projection",
          seq,
          messageCount: event.messages.length,
          candidates: candidateIndexes.length,
          foldBatch,
          earliestFoldIndex,
          savedTokens,
        });
      }
      return { messages: projected };
    });

    // 供应商真正受理后才记录：projection 事件只说明“构造过这个投影”，
    // 二者对照即可分辨被取消/失败/重试的投影，不把它们当成已发送。
    // 只对真折过东西的投影记一笔，否则每请求一行会把 ledger 洗成请求日志。
    pi.on("after_provider_response", async (event) => {
      const seq = projectionSeq;
      if (!foldedProjections.delete(seq)) return;
      await ledger({ event: "provider-response", seq, status: event?.status ?? null });
    });
  };
}

function renderRecallHeader(id, chunk, integrity) {
  const verified = integrity === "verified" ? " integrity=verified" : integrity === "unverified" ? " integrity=unverified" : "";
  if (chunk.mode === "query") {
    return [
      `[obs_recall id=${id} mode=query matches=${chunk.matches} total_lines=${chunk.totalLines} truncated=${chunk.truncated}${verified}]`,
      `[chunk_bytes=${chunk.bytes} chunk_lines=${chunk.lines}; line numbers are 1-based; use startLine to read around a match]`,
    ].join("\n");
  }
  if (chunk.mode === "lines") {
    return [
      `[obs_recall id=${id} mode=lines start_line=${chunk.startLine} next_line=${chunk.nextLine} total_lines=${chunk.totalLines} eof=${chunk.eof}${verified}]`,
      `[chunk_bytes=${chunk.bytes} chunk_lines=${chunk.lines}; use next_line to continue]`,
    ].join("\n");
  }
  return [
    `[obs_recall id=${id} offset=${chunk.offset} next_offset=${chunk.nextOffset} eof=${chunk.eof}${verified}]`,
    `[chunk_bytes=${chunk.bytes} chunk_lines=${chunk.lines}; use next_offset to continue]`,
  ].join("\n");
}
