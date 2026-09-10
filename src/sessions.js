import { createHash, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { realpath, stat, readFile, mkdir, writeFile, rename, rm, readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, join, relative, isAbsolute, resolve, sep, parse } from "node:path";

import { selection as selectionSchema, compaction as compactionSchema, compactionDefaults, assertPromptImages } from "./protocol.js";
import { Tasks } from "./tasks.js";
import { delegationTools } from "./tools.js";
import { resolveCapabilities } from "./capabilities.js";

// 统一目录浏览：目录优先排序后按服务端过滤结果分页；不递归、不逐项 stat、跳过符号链接。
const BROWSE_PAGE = 200;

async function resolveDir(target) {
  try {
    return await realpath(target);
  } catch (error) {
    if (error.code === "ENOENT" || error.code === "ENOTDIR") throw new Error(`目录不存在：${target}`);
    if (error.code === "EACCES" || error.code === "EPERM") throw new Error(`没有访问权限：${target}`);
    throw error;
  }
}

// 绝对路径（正斜杠形式）的父目录；根（"/" 或 "F:/"）返回 null。
function parentOf(slashPath) {
  const root = parse(slashPath).root.replaceAll("\\", "/").replace(/\/+$/, "");
  const trimmed = slashPath.replace(/\/+$/, "");
  if (trimmed === root) return null;
  if (!trimmed || /^[a-zA-Z]:$/.test(trimmed)) return null;
  const parent = trimmed.slice(0, trimmed.lastIndexOf("/"));
  return /^[a-zA-Z]:$/.test(parent) ? `${parent}/` : parent || "/";
}

function absoluteCrumbs(slashPath) {
  const crumbs = [];
  let acc = "";
  if (slashPath.startsWith("//")) {
    acc = parse(slashPath).root.replaceAll("\\", "/");
    crumbs.push({ name: acc.replace(/\/+$/, ""), path: acc });
  } else if (/^[a-zA-Z]:/.test(slashPath)) {
    acc = `${slashPath.slice(0, 2)}/`;
    crumbs.push({ name: slashPath.slice(0, 2), path: acc });
  } else if (slashPath.startsWith("/")) {
    acc = "/";
    crumbs.push({ name: "/", path: "/" });
  }
  for (const segment of slashPath.slice(acc.length).split("/").filter(Boolean)) {
    acc += segment;
    crumbs.push({ name: segment, path: acc });
    acc += "/";
  }
  return crumbs;
}

// 主机快速位置：主目录 + 文件系统根；Windows 盘符仅全局模式用 fs stat 探测，不 shell。
async function hostLocations() {
  const home = homedir().split(sep).join("/");
  const locations = process.platform === "win32"
    ? (await Promise.all(Array.from({ length: 26 }, (_, index) => {
        const drive = `${String.fromCharCode(65 + index)}:`;
        return stat(`${drive}/`)
          .then((info) => (info.isDirectory() ? { name: drive, path: `${drive}/` } : null))
          .catch(() => null);
      }))).filter(Boolean)
    : [{ name: "/", path: "/" }];
  if (!locations.some((location) => location.path === home))
    locations.unshift({ name: basename(home) || home, path: home });
  return locations;
}

export class Sessions {
  constructor(createAgent, defaultsPath, storagePath) {
    this.storagePath = storagePath;
    this.defaultsPath = defaultsPath;
    this.savingDefaults = Promise.resolve();
    this.createAgent = createAgent;
    this.items = new Map();
    this.recentConfig = {};
    this.defaultSelection = { compaction: { ...compactionDefaults }, queueType: "steer", model: null, subagentModel: null, thinking: null, subagentThinking: null, capabilities: null, subagentCapabilities: null };
  }

  async loadDefaults() {
    if (!this.defaultsPath) return;
    try {
      const saved = selectionSchema.strict().parse(JSON.parse(await readFile(this.defaultsPath, "utf8")));
      Object.assign(this.defaultSelection, saved);
    } catch (error) {
      if (error.code !== "ENOENT") throw new Error(`默认新会话配置读取失败：${error.message}`);
    }
  }
  getDefaults() {
    return structuredClone(this.defaultSelection);
  }
  configureDefaults(workspace, selection) {
    const save = this.savingDefaults.then(() => this.saveDefaults(workspace, selection));
    this.savingDefaults = save.catch(() => {});
    return save;
  }
  async saveDefaults(workspace, selection) {
    const next = this.getDefaults();
    for (const key of Object.keys(next))
      if (selection[key] !== undefined) next[key] = structuredClone(selection[key]);
    await this.validateSelection(workspace, next);
    if (this.defaultsPath) {
      const temporary = `${this.defaultsPath}.${randomUUID()}.tmp`;
      await mkdir(dirname(this.defaultsPath), { recursive: true });
      try {
        await writeFile(temporary, JSON.stringify(next, null, 2) + "\n", { mode: 0o600 });
        await rename(temporary, this.defaultsPath);
      } finally {
        await rm(temporary, { force: true });
      }
    }
    this.defaultSelection = next;
    return this.getDefaults();
  }
  async validateSelection(workspace = this.createAgent.cwd || process.cwd(), selection) {
    const cwd = await realpath(workspace);
    if (!(await stat(cwd)).isDirectory()) throw new Error("工作空间必须是目录");
    for (const key of ["model", "subagentModel"])
      if (selection[key] != null && !this.createAgent.catalog().some((m) => m.key === selection[key]))
        throw new Error(key === "model" ? "Unknown model" : "Unknown subagent model");
    if (selection.compaction) this.validateCompaction(selection.compaction, selection.model);
    let catalog;
    if (this.createAgent.capabilities) {
      catalog = await this.createAgent.capabilities(cwd, selection.trustProject === true);
      resolveCapabilities(selection.capabilities, catalog);
      resolveCapabilities(selection.subagentCapabilities === "inherit" ? selection.capabilities : selection.subagentCapabilities, catalog);
    }
    return { cwd, catalog };
  }

  validateCompaction(value, mainModel) {
    const config = compactionSchema.parse(value);
    const key = config.model || mainModel;
    if (key) {
      const model = this.createAgent.catalog().find((model) => model.key === key);
      if (!model) throw new Error("Unknown compaction model");
      if (config.enabled && model.levels && !model.levels.includes(config.thinking))
        throw new Error("Unsupported compaction thinking level");
    }
    return config;
  }

  async load() {
    if (!this.storagePath) return;
    await mkdir(this.storagePath, { recursive: true });
    for (const workspace of await readdir(this.storagePath)) {
      for (const file of await readdir(join(this.storagePath, workspace))) {
        if (!file.endsWith(".json")) continue;
        const saved = JSON.parse(await readFile(join(this.storagePath, workspace, file), "utf8"));
        // 重启时统一采用最新默认压缩配置，其余会话配置保持原样。
        saved.selection.compaction = structuredClone(this.defaultSelection.compaction);
        await this.create(saved.cwd, saved.selection, saved);
      }
    }
  }
  persist(item) {
    if (!item.storageDir) return Promise.resolve();
    const data = JSON.stringify({ id: item.id, cwd: item.cwd, title: item.title,
      updatedAt: item.updatedAt, messages: item.messages, compactions: item.compactions, tasks: item.tasks.snapshot(),
      sessionFile: item.agent.sessionFile?.(),
      selection: { ...item.agent.config?.(), capabilities: item.capabilities,
        subagentCapabilities: item.subagentCapabilities, subagentModel: item.subagentModel,
        subagentThinking: item.subagentThinking, queueType: item.queueType,
        trustProject: item.trustProject, useDefaults: false } });
    const work = (item.saving || Promise.resolve()).catch(() => {}).then(async () => {
      const file = join(item.storageDir, `${item.id}.json`);
      const temporary = `${file}.tmp`;
      await writeFile(temporary, data, { mode: 0o600 });
      await rename(temporary, file);
    });
    item.saving = work;
    return work;
  }

  list() {
    return [...this.items.values()]
      .map(({ id, title, cwd, status, updatedAt }) => ({
        id,
        title,
        cwd,
        status,
        updatedAt,
      }))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }
  async rename(id, title) {
    const item = this.get(id);
    item.title = title;
    item.updatedAt = Date.now();
    await this.persist(item);
    return { sessionId: id, title };
  }

  async create(workspace, selection = {}, saved) {
    selection = structuredClone({ ...(selection.useDefaults === false ? {} : this.defaultSelection), ...selection });
    const { cwd, catalog } = await this.validateSelection(workspace, selection);
    const id = saved?.id || randomUUID();
    const storageDir = this.storagePath && join(this.storagePath, createHash("sha256").update(process.platform === "win32" ? cwd.toLowerCase() : cwd).digest("hex"));
    if (storageDir) await mkdir(storageDir, { recursive: true });
    const item = {
      id,
      cwd,
      storageDir,
      queueType: selection.queueType || "steer",
      title: saved?.title || "新会话",
      updatedAt: saved?.updatedAt || Date.now(),
      seq: 0,
      status: "idle",
      listeners: new Set(),
      messages: saved?.messages || [],
      compactions: saved?.compactions || [],
      live: {},
      tools: {},
      subagentModel: selection.subagentModel ?? null,
      subagentThinking: selection.subagentThinking ?? null,
      subagentResolvedCapabilities: catalog ? resolveCapabilities(selection.subagentCapabilities === "inherit" ? selection.capabilities : selection.subagentCapabilities, catalog) : null,
      capabilities: selection.capabilities ?? null,
      subagentCapabilities: selection.subagentCapabilities ?? null,
      trustProject: selection.trustProject === true,
    };
    item.emit = (event) => {
      const agentId = event.agentId ?? "main";
      if (event.type === "agent.message.start")
        item.live[agentId] = structuredClone(event.data.message);
      if (event.type === "agent.delta") {
        const delta = event.data;
        const message = item.live[agentId];
        if (message && Array.isArray(message.content)) {
          const i = delta.contentIndex;
          if (delta.type === "text_start")
            message.content[i] = { type: "text", text: "" };
          if (delta.type === "thinking_start")
            message.content[i] = { type: "thinking", thinking: "" };
          if (delta.type === "text_delta") {
            message.content[i] ??= { type: "text", text: "" };
            message.content[i].text += delta.delta;
          }
          if (delta.type === "thinking_delta") {
            message.content[i] ??= { type: "thinking", thinking: "" };
            message.content[i].thinking += delta.delta;
          }
          if (delta.type === "toolcall_start")
            message.content[i] = {
              type: "toolCall",
              id: delta.id,
              name: delta.toolName,
              argumentsText: "",
            };
          if (delta.type === "toolcall_delta" && message.content[i])
            message.content[i].argumentsText =
              (message.content[i].argumentsText ?? "") + delta.delta;
          if (delta.type === "toolcall_end")
            message.content[i] = delta.toolCall;
        }
      }
      if (event.type === "agent.message.end") {
        item.messages.push({ agentId, message: event.data.message, ...(event.data.entryId ? { entryId: event.data.entryId } : {}) });
        delete item.live[agentId];
        void this.persist(item).catch((error) => item.emit({ type: "error", data: { message: `会话保存失败：${error.message}` } }));
      }
      if (event.type === "agent.compaction" && agentId === "main") {
        if (!item.compactions.some((entry) => entry.id === event.data.id)) item.compactions.push(event.data);
        void this.persist(item).catch((error) => item.emit({ type: "error", data: { message: `会话保存失败：${error.message}` } }));
      }
      if (event.type === "tool.state")
        item.tools[`${agentId}:${event.data.toolCallId}`] = {
          agentId,
          ...event.data,
        };
      if (event.type === "task.state")
        void this.persist(item).catch((error) => item.emit({ type: "error", data: { message: `会话保存失败：${error.message}` } }));
      const envelope = { ...event, sessionId: id, seq: ++item.seq };
      for (const listener of item.listeners) listener(envelope);
    };
    item.tasks = new Tasks(
      () =>
        this.createAgent([], {
          ...item.agent.config?.(),
          ...(item.subagentModel ? { model: item.subagentModel } : {}),
          cwd,
          ...(item.subagentThinking ? { thinking: item.subagentThinking } : {}),
          capabilities: item.subagentCapabilities === "inherit" ? item.agent.config?.().capabilities ?? item.capabilities : item.subagentCapabilities,
          trustProject: item.trustProject,
        }),
      item.emit,
    );
    for (const task of saved?.tasks || [])
      item.tasks.jobs.set(task.id, { ...task, status: ["starting", "running"].includes(task.status) ? "cancelled" : task.status });
    item.agent = await this.createAgent(delegationTools(item.tasks), {
      ...this.recentConfig,
      ...(selection.model ? { model: selection.model } : {}),
      ...(selection.thinking ? { thinking: selection.thinking } : {}),
      capabilities: item.capabilities,
      compaction: selection.compaction,
      trustProject: item.trustProject,
      cwd,
      sessionDir: storageDir,
      sessionFile: saved?.sessionFile,
    });
    // Upgrade legacy web history IDs and recover compaction commits saved in Pi JSONL
    // before a crash could persist the web snapshot. Match in order, never by timestamp alone.
    const history = item.agent.historyEntries?.() || [];
    let historyIndex = 0;
    for (const record of item.messages) {
      if (record.agentId !== "main") continue;
      const serialized = JSON.stringify(record.message);
      const index = history.findIndex((entry, i) => i >= historyIndex &&
        (record.entryId ? entry.id === record.entryId : JSON.stringify(entry.message) === serialized));
      if (index >= 0) {
        record.entryId = history[index].id;
        historyIndex = index + 1;
      }
    }
    for (const record of item.agent.compactions?.() || [])
      if (!item.compactions.some((entry) => entry.id === record.id)) item.compactions.push(record);
    item.unsubscribe = item.agent.subscribe((event) =>
      item.emit({ ...event, agentId: "main", runId: item.runId }),
    );
    this.items.set(id, item);
    await this.persist(item);
    return id;
  }

  get(id) {
    const item = this.items.get(id);
    if (!item) throw new Error("Unknown session");
    return item;
  }
  async revealWorkspace(id) {
    const target = await resolveDir(this.get(id).cwd);
    if (!(await stat(target)).isDirectory()) throw new Error("工作空间目录不存在");
    const opener = { win32: "explorer.exe", darwin: "open", linux: "xdg-open" }[process.platform];
    if (!opener) throw new Error(`当前平台 ${process.platform} 不支持打开资源管理器`);
    await new Promise((resolve, reject) => {
      const child = spawn(opener, [target], { shell: false, detached: true, stdio: "ignore" });
      child.once("error", reject);
      child.once("spawn", () => { child.unref(); resolve(); });
    });
    return { opened: true };
  }

  // 旧补全接口：保留 {path, entries} 形状，共享统一浏览实现（不分页）。
  async browse(id, path = "") {
    const { path: current, entries } = await this.listFiles({ sessionId: id, path, pageSize: Infinity });
    return { path: current, entries };
  }

  // 统一文件浏览：带 sessionId 限定工作空间并返回相对路径，否则浏览主机绝对目录。
  async listFiles({ sessionId, path = "", directoriesOnly = false, offset = 0, query = "", pageSize = BROWSE_PAGE } = {}) {
    const needle = query.toLocaleLowerCase();
    const readEntries = async (target, session, base) => {
      let dirents;
      try {
        dirents = await readdir(target, { withFileTypes: true });
      } catch (error) {
        if (error.code === "EACCES" || error.code === "EPERM") throw new Error(`没有访问权限：${target}`);
        if (error.code === "ENOENT") throw new Error(`目录不存在：${target}`);
        if (error.code === "ENOTDIR") throw new Error(`不是目录：${target}`);
        throw error;
      }
      const entries = [];
      for (const entry of dirents) {
        if (entry.isSymbolicLink() || (!entry.isDirectory() && !entry.isFile())) continue;
        if (session && [".git", "node_modules"].includes(entry.name)) continue;
        if (directoriesOnly && !entry.isDirectory()) continue;
        if (needle && !entry.name.toLocaleLowerCase().includes(needle)) continue;
        entries.push({ name: entry.name, directory: entry.isDirectory(), path: join(base, entry.name).split(sep).join("/") });
      }
      // ponytail: 单层排序仍占 O(n) 内存；超大目录成为瓶颈时改用流式目录游标。
      entries.sort((a, b) => Number(b.directory) - Number(a.directory) || a.name.localeCompare(b.name));
      return {
        entries: entries.slice(offset, offset + pageSize),
        nextOffset: offset + pageSize < entries.length ? offset + pageSize : null,
      };
    };
    if (sessionId) {
      const root = await resolveDir(this.get(sessionId).cwd);
      const target = await resolveDir(resolve(root, path));
      const rel = relative(root, target);
      if (isAbsolute(rel) || rel === ".." || rel.startsWith(`..${sep}`))
        throw new Error("只能浏览当前工作空间");
      const slashRel = rel.split(sep).join("/");
      const rootLabel = basename(root);
      return {
        path: slashRel,
        parent: slashRel === "" ? null : slashRel.includes("/") ? slashRel.slice(0, slashRel.lastIndexOf("/")) : "",
        ...(await readEntries(target, true, rel)),
        breadcrumbs: [{ name: rootLabel, path: "" }, ...slashRel.split("/").filter(Boolean)
          .map((segment, index, segments) => ({ name: segment, path: segments.slice(0, index + 1).join("/") }))],
        locations: [{ name: rootLabel, path: "" }],
      };
    }
    const base = this.createAgent.cwd || process.cwd();
    const requested = path.trim() ? (isAbsolute(path) ? path : join(base, path)) : base;
    const target = await resolveDir(requested);
    if (!(await stat(target)).isDirectory()) throw new Error(`不是目录：${target}`);
    const slashPath = target.split(sep).join("/");
    return {
      path: slashPath,
      parent: parentOf(slashPath),
      ...(await readEntries(target, false, target)),
      breadcrumbs: absoluteCrumbs(slashPath),
      locations: await hostLocations(),
    };
  }

  snapshot(id) {
    const item = this.get(id);
    return structuredClone({
      sessionId: id,
      cwd: item.cwd,
      title: item.title,
      seq: item.seq,
      status: item.status,
      runtime: item.agent.runtime?.(),
      queue: item.agent.queue?.(),
      config: {
        queueType: item.queueType,
        ...item.agent.config?.(), subagentModel: item.subagentModel,
        subagentThinking: item.subagentThinking,
        subagentResolvedCapabilities: item.subagentResolvedCapabilities,
        capabilitySelection: item.capabilities,
        subagentCapabilities: item.subagentCapabilities,
      },
      runId: item.runId,
      messages: item.messages,
      compactions: item.compactions,
      live: item.live,
      tools: item.tools,
      tasks: item.tasks.snapshot(),
    });
  }
  subscribe(id, listener) {
    const item = this.get(id);
    item.listeners.add(listener);
    return () => item.listeners.delete(listener);
  }

  async configure(id, selection) {
    const item = this.get(id);
    if (!["idle", "running"].includes(item.status) || item.configuring) throw new Error("Session is busy");
    const { subagentModel = item.subagentModel, model, thinking } = selection;
    if (
      subagentModel !== null &&
      !this.createAgent.catalog().some((m) => m.key === subagentModel)
    )
      throw new Error("Unknown subagent model");
    item.configuring = true;
    try {
      const previous = item.agent.config?.();
      if (selection.compaction) this.validateCompaction(selection.compaction, model || previous?.model);
      const config = await item.agent.configure({ model, thinking, compaction: selection.compaction });
      if (config.model !== previous?.model || config.thinking !== previous?.thinking)
        this.recentConfig = { model: config.model, thinking: config.thinking };
      item.subagentModel = subagentModel;
      item.queueType = selection.queueType || item.queueType;
      await this.persist(item);
      return {
        queueType: item.queueType,
        ...item.agent.config?.(), ...config, subagentModel,
        runtime: item.agent.runtime?.(),
        subagentThinking: item.subagentThinking,
        subagentResolvedCapabilities: item.subagentResolvedCapabilities,
        capabilitySelection: item.capabilities,
        subagentCapabilities: item.subagentCapabilities,
      };
    } finally {
      item.configuring = false;
    }
  }

  async prompt(id, text, queueType, images) {
    if (!text.trim() && !images?.length) throw new Error("请求内容不能为空：请输入文本或附加图片");
    const item = this.get(id);
    if (images?.length) {
      // 必须在回执前拒绝：一旦入队或启动，SDK 会静默丢弃不支持模型的图片。
      assertPromptImages(images);
      const model = this.createAgent.catalog().find((m) => m.key === item.agent.config?.()?.model);
      if (model?.input && !model.input.includes("image"))
        throw new Error(`当前模型 ${model.key} 不支持图片输入，请先切换到具备视觉能力的模型`);
    }
    if (item.status === "running") {
      await item.agent.enqueue(text, queueType || item.queueType, images);
      return item.runId;
    }
    if (item.status !== "idle" || item.configuring) throw new Error("Session is busy");
    if (item.title === "新会话") item.title = (text.trim() || "[图片]").slice(0, 60);
    item.updatedAt = Date.now();
    item.runId = randomUUID();
    item.status = "running";
    item.emit({
      type: "session.state",
      data: { status: item.status, runId: item.runId },
    });
    item.work = (async () => {
      try {
        await item.agent.prompt(text, images?.length ? { images } : undefined);
        item.agent.result();
      } catch (error) {
        item.emit({
          type: "error",
          data: { message: String(error.message ?? error) },
        });
      } finally {
        await this.persist(item).catch((error) => item.emit({ type: "error", data: { message: `会话保存失败：${error.message}` } }));
        if (item.status !== "cancelling") {
          item.status = "idle";
          item.emit({
            type: "session.state",
            data: { status: "idle", runId: item.runId },
          });
        }
      }
    })();
    return item.runId;
  }

  async cancel(id) {
    const item = this.get(id);
    if (item.cancelling) return item.cancelling;
    item.status = "cancelling";
    item.emit({ type: "session.state", data: { status: "cancelling" } });
    item.cancelling = (async () => {
      try {
        await Promise.all([item.agent.abort(), item.tasks.cancel()]);
        await item.work;
      } finally {
        item.status = "idle";
        item.cancelling = undefined;
        item.emit({ type: "session.state", data: { status: "idle" } });
      }
    })();
    return item.cancelling;
  }
  async remove(id, deleting = true) {
    const item = this.get(id);
    await this.cancel(id);
    item.unsubscribe();
    await item.agent.dispose();
    await this.persist(item);
    if (deleting && item.storageDir) {
      if (item.agent.sessionFile?.()) await rm(item.agent.sessionFile(), { force: true });
      await rm(join(item.storageDir, `${id}.json`), { force: true });
    }
    item.listeners.clear();
    this.items.delete(id);
  }
  async close() {
    await Promise.all([...this.items.keys()].map((id) => this.remove(id, false)));
  }
}
