import { createHash, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { realpath, stat, readFile, mkdir, writeFile, rename, rm, readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, join, relative, isAbsolute, resolve, sep, parse } from "node:path";

import { selection as selectionSchema, presetStore, compaction as compactionSchema, compactionDefaults, assertPromptImages } from "./protocol.js";
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

// 导入 pi 会话的标题：优先 pi 里的会话名，其次首条用户消息（去掉开头注入的标签），最后文件名。
function importedTitle(lines, source) {
  let name = "",
    first = "";
  for (const line of lines) {
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    if (entry?.type === "session_info" && typeof entry.name === "string" && entry.name.trim()) name = entry.name.trim();
    if (!first && entry?.type === "message" && entry.message?.role === "user") {
      const { content } = entry.message;
      const text = Array.isArray(content) ? content.filter((block) => block?.type === "text").map((block) => block.text).join(" ") : String(content ?? "");
      // 去掉注入的 Skill 正文与残留标签，剩下真实任务正文当标题。
      first = text.replace(/<skill\b[^>]*>[\s\S]*?<\/skill>/gi, " ").replace(/<[^<>]*>/g, " ").replace(/\s+/g, " ").trim();
    }
  }
  return (name || first || basename(source).replace(/\.jsonl$/i, "")).slice(0, 60);
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
    this.projectSkills = {};
    this.savingPresets = Promise.resolve();
    this.createAgent = createAgent;
    this.items = new Map();
    this.recentConfig = {};
    this.defaultSelection = { compaction: { ...compactionDefaults }, retry: null, queueType: "steer", model: null, subagentModel: null, thinking: null, subagentThinking: null, capabilities: null, subagentCapabilities: null };
  }

  async loadDefaults() {
    if (!this.defaultsPath) return;
    try {
      const { projectSkills = {}, ...data } = JSON.parse(await readFile(this.defaultsPath, "utf8"));
      const saved = selectionSchema.strict().parse(data);
      if (!projectSkills || typeof projectSkills !== "object" || Array.isArray(projectSkills)) throw new Error("无效的项目技能配置");
      for (const entry of Object.values(projectSkills)) {
        if (!entry || typeof entry !== "object" || Array.isArray(entry)) throw new Error("无效的项目技能配置");
        for (const [role, ids] of Object.entries(entry)) {
          if (!["capabilities", "subagentCapabilities"].includes(role) || !Array.isArray(ids) || ids.some((id) => typeof id !== "string"))
            throw new Error("无效的项目技能选择");
        }
      }
      this.projectSkills = projectSkills;
      Object.assign(this.defaultSelection, saved);
    } catch (error) {
      if (error.code !== "ENOENT") throw new Error(`默认新会话配置读取失败：${error.message}`);
    }
  }
  getDefaults() {
    return structuredClone(this.defaultSelection);
  }
  async workspaceDefaults(workspace = this.createAgent.cwd || process.cwd()) {
    const cwd = await realpath(workspace);
    const key = process.platform === "win32" ? cwd.toLowerCase() : cwd;
    const next = this.getDefaults();
    if (!this.createAgent.capabilities) return next;
    const catalog = await this.createAgent.capabilities(cwd);
    for (const role of ["capabilities", "subagentCapabilities"]) {
      const selection = next[role];
      if (!selection || selection === "inherit") continue;
      selection.skills = await Promise.all(selection.skills.map((id) => realpath(id).catch(() => id)));
      const current = catalog.skills.filter((s) => s.scope === "project").map((s) => s.id);
      // 旧版全局配置里的项目路径仅在所属项目保留，绝不按同名技能替换。
      const globals = selection.skills.filter((id) => !current.includes(id) &&
        (!/[/\\](?:\.pi|\.agents)[/\\]skills[/\\]/.test(id) || catalog.skills.some((s) => s.id === id && s.scope !== "project")));
      selection.skills = [...globals, ...(this.projectSkills[key]?.[role] ?? selection.skills.filter((id) => current.includes(id)))];
    }
    return next;
  }
  configureDefaults(workspace, selection) {
    const save = this.savingDefaults.then(() => this.saveDefaults(workspace, selection));
    this.savingDefaults = save.catch(() => {});
    return save;
  }
  async saveDefaults(workspace, selection) {
    const cwd = await realpath(workspace || this.createAgent.cwd || process.cwd());
    const workspaceKey = process.platform === "win32" ? cwd.toLowerCase() : cwd;
    const next = await this.workspaceDefaults(cwd);
    for (const key of Object.keys(next))
      if (selection[key] !== undefined) next[key] = structuredClone(selection[key]);
    const { catalog } = await this.validateSelection(cwd, next);
    const result = structuredClone(next);
    const projectSkills = structuredClone(this.projectSkills);
    // 首次写入新版配置前，保留旧版默认值中其他工作空间的项目技能。
    for (const role of ["capabilities", "subagentCapabilities"]) {
      for (const id of this.defaultSelection[role]?.skills || []) {
        const match = /^(.*)[/\\](?:\.pi|\.agents)[/\\]skills[/\\]/.exec(id);
        if (!match || catalog?.skills.some((s) => s.id === id && s.scope === "global")) continue;
        const path = await realpath(match[1]).catch(() => resolve(match[1]));
        const key = process.platform === "win32" ? path.toLowerCase() : path;
        if (Object.hasOwn(this.projectSkills[key] || {}, role)) continue;
        projectSkills[key] ||= {};
        projectSkills[key][role] ||= [];
        const skillPath = await realpath(id).catch(() => id);
        if (!projectSkills[key][role].includes(skillPath)) projectSkills[key][role].push(skillPath);
      }
    }
    if (catalog) {
      const entry = {};
      for (const role of ["capabilities", "subagentCapabilities"]) {
        const selected = next[role];
        if (!selected || selected === "inherit") continue;
        const projectIds = catalog.skills.filter((s) => s.scope === "project").map((s) => s.id);
        entry[role] = selected.skills.filter((id) => projectIds.includes(id));
        selected.skills = selected.skills.filter((id) => !projectIds.includes(id));
      }
      projectSkills[workspaceKey] = entry;
    }
    if (this.defaultsPath) {
      const temporary = `${this.defaultsPath}.${randomUUID()}.tmp`;
      await mkdir(dirname(this.defaultsPath), { recursive: true });
      try {
        await writeFile(temporary, JSON.stringify({ ...next, projectSkills }, null, 2) + "\n", { mode: 0o600 });
        await rename(temporary, this.defaultsPath);
      } finally {
        await rm(temporary, { force: true });
      }
    }
    this.defaultSelection = next;
    this.projectSkills = projectSkills;
    return result;
  }
  async validateSelection(workspace = this.createAgent.cwd || process.cwd(), selection, inherited = []) {
    const cwd = await realpath(workspace);
    if (!(await stat(cwd)).isDirectory()) throw new Error("工作空间必须是目录");
    for (const key of ["model", "subagentModel"])
      if (selection[key] != null && !this.createAgent.catalog().some((m) => m.key === selection[key]))
        throw new Error(key === "model" ? "Unknown model" : "Unknown subagent model");
    if (selection.compaction) this.validateCompaction(selection.compaction, selection.model);
    let catalog;
    const warnings = [];
    if (this.createAgent.capabilities) {
      catalog = await this.createAgent.capabilities(cwd, selection.trustProject === true);
      for (const key of ["capabilities", "subagentCapabilities"]) {
        if (key === "subagentCapabilities" && selection[key] === "inherit") continue;
        const resolved = resolveCapabilities(selection[key], catalog, { allowUnavailable: inherited.includes(key), warnings });
        // null 仍表示全部；自定义空集合不能扩大为全部能力。
        if (selection[key] != null && inherited.includes(key)) selection[key] = resolved;
      }
    }
    return { cwd, catalog, warnings };
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

  // —— 具名会话预设：沿用 selection schema，持久化 defaultsPath 同目录 presets.json。
  // 保存只做 schema 校验（selection.parse 剥离 trustProject/useDefaults）；目录或能力失效
  // 留给会话创建时报错，不阻止保存与列表读取。
  get presetsPath() {
    return this.defaultsPath ? join(dirname(this.defaultsPath), "presets.json") : null;
  }
  async listPresets() {
    const path = this.presetsPath;
    if (!path) return { presets: [] };
    try {
      return presetStore.parse(JSON.parse(await readFile(path, "utf8")));
    } catch (error) {
      if (error.code === "ENOENT") return { presets: [] };
      throw new Error(`会话预设读取失败：${error.message}`);
    }
  }
  // 串行读-改-写：并发保存走同一 promise 链避免相互覆盖；临时文件 + rename 原子落盘。
  mutatePresets(mutate) {
    const path = this.presetsPath;
    if (!path) return Promise.reject(new Error("未启用会话预设持久化"));
    const work = this.savingPresets.catch(() => {}).then(async () => {
      const presets = (await this.listPresets()).presets;
      const resultId = mutate(presets);
      // 写前整包自检：不合规数据（含手工编辑的坏 name/selection）在落盘前拦截。
      const store = presetStore.parse({ presets });
      const temporary = `${path}.${randomUUID()}.tmp`;
      await mkdir(dirname(path), { recursive: true });
      try {
        await writeFile(temporary, JSON.stringify(store, null, 2) + "\n", { mode: 0o600 });
        await rename(temporary, path);
      } finally {
        await rm(temporary, { force: true });
      }
      return resultId ? store.presets.find((preset) => preset.id === resultId) : null;
    });
    this.savingPresets = work.catch(() => {});
    return work;
  }
  savePreset({ presetId, name, cwd, selection }) {
    return this.mutatePresets((presets) => {
      const entry = {
        id: presetId || randomUUID(),
        name: name.trim(),
        selection: selectionSchema.parse(selection ?? {}),
        ...(cwd ? { cwd } : {}),
      };
      const index = presets.findIndex((preset) => preset.id === entry.id);
      if (presetId && index < 0) throw new Error("Unknown preset");
      if (index >= 0) presets[index] = entry;
      else presets.push(entry);
      return entry.id;
    });
  }
  deletePreset(presetId) {
    return this.mutatePresets((presets) => {
      const index = presets.findIndex((preset) => preset.id === presetId);
      if (index < 0) throw new Error("Unknown preset");
      presets.splice(index, 1);
      return null;
    }).then(() => ({ deleted: presetId }));
  }

  async load() {
    if (!this.storagePath) return;
    await mkdir(this.storagePath, { recursive: true });
    for (const workspace of await readdir(this.storagePath, { withFileTypes: true })) {
      if (!workspace.isDirectory()) continue;
      for (const file of await readdir(join(this.storagePath, workspace.name))) {
        if (!file.endsWith(".json")) continue;
        const path = join(this.storagePath, workspace.name, file);
        try {
          const saved = JSON.parse(await readFile(path, "utf8"));
          // 重启时统一采用最新默认压缩配置，其余会话配置保持原样。
          saved.selection.compaction = structuredClone(this.defaultSelection.compaction);
          await this.create(saved.cwd, saved.selection, saved);
        } catch (error) {
          console.warn(`会话恢复失败，保留原文件 ${path}：${error.message}`);
        }
      }
    }
  }
  persist(item) {
    if (!item.storageDir) return Promise.resolve();
    const data = JSON.stringify({ id: item.id, cwd: item.cwd, title: item.title,
      createdAt: item.createdAt, updatedAt: item.updatedAt, messages: item.messages, compactions: item.compactions, retries: item.retries, tasks: item.tasks.snapshot(),
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
      .map((item) => ({
        id: item.id,
        title: item.title,
        cwd: item.cwd,
        // 列表展示整场执行状态；主代理的输入/队列状态仍由 item.status 控制。
        status: item.status === "idle" && [...item.tasks.jobs.values()].some((job) =>
          ["starting", "running"].includes(job.status)) ? "running" : item.status,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
        // 会话的 .jsonl 源文件路径，供侧栏菜单「复制 JSONL 路径」用；尚未落盘时为 null。
        sessionFile: item.agent?.sessionFile?.() ?? null,
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

  // 导入 pi 的 .jsonl 会话：历史复制到目标工作空间，原文件保持不变（删除 Axiom 会话不动 pi 历史）。
  async importSession(file, workspace = this.createAgent.cwd) {
    if (!this.storagePath) throw new Error("当前实例未启用会话存储，无法导入会话");
    const source = resolve(String(file || "").trim());
    let text;
    try {
      text = await readFile(source, "utf8");
    } catch (error) {
      if (error.code === "ENOENT" || error.code === "EISDIR") throw new Error(`会话文件不存在或不是文件：${source}`);
      throw error;
    }
    const lines = text.split("\n").filter((line) => line.trim());
    let header = null;
    try {
      header = JSON.parse(lines[0]);
    } catch {}
    if (header?.type !== "session" || typeof header.cwd !== "string" || !header.cwd.trim())
      throw new Error("不是有效的 pi 会话文件：缺少 session 头或 cwd 字段");
    // 只导入历史，目标目录由调用方指定，不沿用源会话的工作空间。
    return this.create(workspace, {}, {
      id: randomUUID(),
      title: importedTitle(lines, source),
      imported: true,
      importText: text,
      messages: [],
    });
  }

  async create(workspace, selection = {}, saved) {
    const inherited = ["capabilities", "subagentCapabilities"].filter((key) =>
      saved || (selection.useDefaults !== false && selection[key] === undefined));
    selection = structuredClone({ ...(selection.useDefaults === false ? {} : await this.workspaceDefaults(workspace)), ...selection });
    const { cwd, catalog, warnings } = await this.validateSelection(workspace, selection, inherited);
    for (const warning of warnings) console.warn(`${cwd}：${warning}`);
    const id = saved?.id || randomUUID();
    const storageDir = this.storagePath && join(this.storagePath, createHash("sha256").update(process.platform === "win32" ? cwd.toLowerCase() : cwd).digest("hex"));
    if (storageDir) await mkdir(storageDir, { recursive: true });
    const importedFile = saved?.importText != null && storageDir ? join(storageDir, `${id}.jsonl`) : null;
    const item = {
      id,
      cwd,
      storageDir,
      queueType: selection.queueType || "steer",
      title: saved?.title || "新会话",
      // 老记录无 createdAt，回退 updatedAt 兜底（历史文件未存创建时间，无法还原真实值）。
      createdAt: saved?.createdAt || saved?.updatedAt || Date.now(),
      updatedAt: saved?.updatedAt || Date.now(),
      seq: 0,
      status: "idle",
      listeners: new Set(),
      messages: saved?.messages || [],
      compactions: saved?.compactions || [],
      retries: (saved?.retries || []).map((savedRecord) => {
        const record = { ...savedRecord };
        if (["waiting", "running"].includes(record.status))
          Object.assign(record, { status: "cancelled", error: "服务已重启，自动重试已停止" });
        delete record.delayMs;
        delete record.nextRetryAt;
        if (record.status === "succeeded") delete record.error;
        return record;
      }),
      live: {},
      tools: {},
      subagentModel: selection.subagentModel ?? null,
      subagentThinking: selection.subagentThinking ?? null,
      retry: selection.retry ?? null,
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
      const envelope = { ...event, sessionId: id, seq: ++item.seq };
      if (event.type === "agent.retry") {
        let record = item.retries.find((entry) => entry.agentId === agentId && entry.id === event.data.id);
        if (!record) {
          const anchor = item.messages.findLast((entry) => entry.agentId === agentId && entry.entryId);
          record = { agentId, messageCount: item.messages.length, ...(anchor ? { anchorEntryId: anchor.entryId } : {}), history: [] };
          item.retries.push(record);
        }
        if (event.data.status === "waiting") record.history.push({ ...event.data });
        Object.assign(record, event.data);
        // 位置随事件广播：前端无需等快照即可归位；缺失字段表示未知。
        envelope.data = { ...event.data, messageCount: record.messageCount,
          ...(record.anchorEntryId ? { anchorEntryId: record.anchorEntryId } : {}) };
        if (!["waiting", "running"].includes(record.status)) {
          delete record.delayMs;
          delete record.nextRetryAt;
          if (record.status === "succeeded") delete record.error;
        }
        void this.persist(item).catch((error) => item.emit({ type: "error", data: { message: `重试记录保存失败：${error.message}` } }));
      }
      if (event.type === "tool.state")
        item.tools[`${agentId}:${event.data.toolCallId}`] = {
          agentId,
          ...event.data,
        };
      if (event.type === "task.state")
        void this.persist(item).catch((error) => item.emit({ type: "error", data: { message: `会话保存失败：${error.message}` } }));
      for (const listener of item.listeners) listener(envelope);
    };
    item.tasks = new Tasks(
      () =>
        this.createAgent([], {
          ...item.agent.config?.(),
          ...(item.retry ? { retry: item.retry } : {}),
          ...(item.subagentModel ? { model: item.subagentModel } : {}),
          cwd,
          ...(item.subagentThinking ? { thinking: item.subagentThinking } : {}),
          capabilities: item.subagentCapabilities === "inherit" ? item.agent.config?.().capabilities ?? item.capabilities : item.subagentCapabilities,
          trustProject: item.trustProject,
        }),
      item.emit,
      async () => {
        await this.persist(item);
        this.scheduleTaskNotifications(item);
      },
    );
    for (const task of saved?.tasks || []) {
      const interrupted = ["starting", "running"].includes(task.status);
      item.tasks.jobs.set(task.id, { ...task,
        status: interrupted ? "cancelled" : task.status,
        error: interrupted ? "服务已重启，子任务已停止" : task.error,
        resultId: task.resultId || randomUUID(), notified: task.notified ?? false });
    }
    try {
      if (importedFile) {
        // 副本拥有自己的身份和工作空间；历史条目及其分支 ID 保持不变。
        const lines = saved.importText.trimStart().split("\n");
        lines[0] = JSON.stringify({ ...JSON.parse(lines[0]), id, cwd });
        await writeFile(importedFile, lines.join("\n"), { mode: 0o600 });
      }
      item.agent = await this.createAgent(delegationTools(item.tasks), {
        ...this.recentConfig,
        ...(selection.model ? { model: selection.model } : {}),
        ...(selection.thinking ? { thinking: selection.thinking } : {}),
        capabilities: item.capabilities,
        compaction: selection.compaction,
        trustProject: item.trustProject,
        cwd,
        sessionDir: storageDir,
        sessionFile: saved?.sessionFile ?? importedFile,
      });
    } catch (error) {
      if (importedFile) await rm(importedFile, { force: true });
      throw error;
    }
    // 导入会话没有网页快照：历史直接取 JSONL 分支，保留 entryId 用于压缩折叠与后续续聊。
    if (importedFile)
      item.messages = (item.agent.historyEntries?.() || []).map((entry) => ({ agentId: "main", message: entry.message, entryId: entry.id }));
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
    // 旧版重试位置迁移（一次性，随本次 persist 固化）：
    // - 界内已有 count 的记录不重算，只补最近同代理 entryId 锚点供前端压缩归属。
    // - 无 count 或越界旧值（早期撤回未清理）：从首个等待起点在「消费时间线」上重定——
    //   主代理优先 SDK 落盘 entry.timestamp（ISO，消费时写入；排队 user 的 message.timestamp
    //   是入队时间，早于真实消费，不可用），无落盘历史可查时退回 message.timestamp；
    //   无消费时间时，助手之后出现的 user 可能来自队列，不能用编写时间推断位置。
    //   仍无可靠位置则保持未知，绝不保留越界数值。
    const consumedAt = new Map((item.agent.historyEntries?.() || [])
      .filter((entry) => Number.isFinite(Date.parse(entry.timestamp)))
      .map((entry) => [entry.id, Date.parse(entry.timestamp)]));
    const anchorFor = (agent, count) => item.messages.slice(0, count)
      .findLast((entry) => entry.agentId === agent && entry.entryId);
    for (const retry of item.retries) {
      const agent = retry.agentId || "main";
      if (!(Number.isInteger(retry.messageCount) && retry.messageCount >= 0 && retry.messageCount <= item.messages.length)) {
        delete retry.messageCount;
        const first = retry.history?.[0];
        const sameAgent = item.messages.map((entry, index) => ({ index, entry }))
          .filter(({ entry }) => entry.agentId === agent);
        let boundary = null;
        const hasQueuedInput = sameAgent.some(({ entry }, index) => entry.message?.role === "user"
          && sameAgent.slice(0, index).some(({ entry: previous }) => previous.message?.role === "assistant"));
        if ((agent === "main" && consumedAt.size || !hasQueuedInput) && sameAgent.length && Number.isFinite(first?.nextRetryAt) && Number.isFinite(first?.delayMs) && first.delayMs >= 0) {
          const startedAt = first.nextRetryAt - first.delayMs;
          const timeline = sameAgent.map(({ entry, index }) => ({ index,
            ts: agent === "main" && consumedAt.size ? consumedAt.get(entry.entryId) : entry.message?.timestamp }));
          if (timeline.every(({ ts }, i) => Number.isFinite(ts) && ts !== startedAt
            && (i === 0 || ts >= timeline[i - 1].ts))) {
            const next = timeline.find(({ ts }) => ts > startedAt);
            boundary = next ? next.index : timeline.at(-1).index + 1;
          }
        }
        if (boundary !== null) retry.messageCount = boundary;
      }
      if (Number.isInteger(retry.messageCount) && retry.messageCount >= 0 && retry.messageCount <= item.messages.length) {
        const anchor = anchorFor(agent, retry.messageCount);
        if (anchor) retry.anchorEntryId = anchor.entryId;
        else delete retry.anchorEntryId;
      } else {
        delete retry.messageCount;
        delete retry.anchorEntryId;
      }
    }
    for (const record of item.agent.compactions?.() || []) {
      const saved = item.compactions.find((entry) => entry.id === record.id);
      if (saved) Object.assign(saved, record);
      else item.compactions.push(record);
    }
    item.unsubscribe = item.agent.subscribe((event) =>
      item.emit({ ...event, agentId: "main", runId: item.runId }),
    );
    this.items.set(id, item);
    await this.persist(item);
    this.scheduleTaskNotifications(item);
    return id;
  }

  scheduleTaskNotifications(item) {
    // ponytail: 通知等当前主运行结束再唤醒，不打断工具；需要轮次内低延迟时再接 SDK 自定义消息。
    if (item.notificationScheduled || item.closing || item.notificationsPaused) return;
    item.notificationScheduled = true;
    setImmediate(() => {
      item.notificationScheduled = false;
      if (item.notifying) return;
      item.notificationWork = this.deliverTaskNotifications(item).catch((error) =>
        item.emit({ type: "error", data: { message: `子任务通知失败：${error.message}` } }));
    });
  }

  async deliverTaskNotifications(item) {
    if (item.notifying || item.closing || item.notificationsPaused || item.configuring || item.status !== "idle") return;
    const jobs = [...item.tasks.jobs.values()].filter((job) => job.resultId && !job.notified);
    if (!jobs.length) return;
    item.notifying = true;
    try {
      // 结果先落盘再触达；通知不放入可撤回的用户 steer/followUp 队列。
      await this.persist(item);
      if (item.closing || item.notificationsPaused || item.configuring || item.status !== "idle") return;
      const text = "[Axiom 子任务完成通知] 以下任务已结束。使用各自的 taskId 和 resultId 调用 read_result 获取结果；不要轮询。\n" +
        JSON.stringify(jobs.map((job) => ({ taskId: job.id, resultId: job.resultId, status: job.status })));
      await this.prompt(item.id, text);
      await item.work;
      if (item.notificationsPaused || item.closing) return;
      for (const job of jobs) job.notified = true;
      await this.persist(item);
    } finally {
      item.notifying = false;
    }
    this.scheduleTaskNotifications(item);
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

  // 运行中刷新会话可见技能（composer 下拉数据源）；旧 factory 无此能力时降级为当前列表。
  async refreshSkills(id) {
    const item = this.get(id);
    if (!item.agent.refreshSkills) return item.agent.config?.()?.skills ?? [];
    return item.agent.refreshSkills();
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
      compactionStatus: item.agent.compactionStatus?.() ?? null,
      retries: item.retries,
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
      this.scheduleTaskNotifications(item);
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
    if (item.status !== "idle" || item.configuring || item.closing) throw new Error("Session is busy");
    item.notificationsPaused = false;
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
          this.scheduleTaskNotifications(item);
        }
      }
    })();
    return item.runId;
  }

  // 撤回：recall 时把这一轮已进入上下文的输入退回输入框（先停稳、无模型输出才允许）；
  // 队列撤回放在 recall 之后，recall 被拒绝时队列原样保留，不会丢消息。
  async withdraw(id, recall = false) {
    const item = this.get(id);
    if (!recall) return item.agent.withdraw();
    if (item.status !== "idle" || item.cancelling) await this.cancel(id);
    const recalled = await item.agent.recall();
    if (recalled) {
      // 网页历史跟着回退：否则重新 attach 仍会画出被撤回的输入和被打断的半截回答。
      const cut = item.messages.findIndex((record) => record.agentId === "main" && record.entryId === recalled.entryId);
      if (cut >= 0) {
        const previousMessages = item.messages;
        // 撤回只回退主代理，独立子任务已经发生的输出必须保留。
        const keptBefore = [0];
        item.messages = previousMessages.filter((record, index) => {
          const keep = index < cut || record.agentId !== "main";
          keptBefore.push(keptBefore.at(-1) + Number(keep));
          return keep;
        });
        // 撤回区间内的主代理重试一并移除（子代理重试保留）；保留记录不得残留越界 count
        // 或失效锚点，否则后续新消息会让旧卡在错位处漂移。无可靠位置 → 前端未知区归档。
        const surviving = new Map();
        for (const record of item.messages)
          if (record.entryId) surviving.set(record.agentId, (surviving.get(record.agentId) ?? new Set()).add(record.entryId));
        item.retries = item.retries.filter((retry) => {
          const agent = retry.agentId || "main";
          if (agent !== "main") return true;
          if (Number.isInteger(retry.messageCount)) return retry.messageCount <= cut;
          return retry.anchorEntryId == null || surviving.get("main")?.has(retry.anchorEntryId);
        });
        for (const retry of item.retries) {
          if (Number.isInteger(retry.messageCount) && retry.messageCount >= 0 && retry.messageCount <= previousMessages.length)
            retry.messageCount = keptBefore[retry.messageCount];
          else delete retry.messageCount;
          const anchors = surviving.get(retry.agentId || "main");
          if (retry.anchorEntryId && !anchors?.has(retry.anchorEntryId)) delete retry.anchorEntryId;
        }
      }
      delete item.live.main;
      await this.persist(item);
    }
    return { ...item.agent.withdraw(), recalled };
  }

  async cancel(id) {
    const item = this.get(id);
    if (item.cancelling) return item.cancelling;
    item.notificationsPaused = true;
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
    item.closing = true;
    await this.cancel(id);
    await item.notificationWork;
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
