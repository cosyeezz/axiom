import { createHash, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { realpath, stat, readFile, mkdir, writeFile, copyFile, rm, readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { Database } from "./database.js";
import { SessionStore } from "./session-store.js";
import { readSessionManager, toWireRecord } from "./session-history.js";
import { sessionBilling, combinedBilling, usageRuntime } from "./session-billing.js";
import { Goal, createGoalStore } from "./goal.js";
import { basename, dirname, join, relative, isAbsolute, resolve, sep, parse } from "node:path";

import { selection as selectionSchema, taskBudget as taskBudgetSchema, compaction as compactionSchema, compactionDefaults, resolveCompaction, assertPromptImages } from "./protocol.js";
import { taskBudgetDefaults } from "./task-budget.js";
import { Tasks } from "./tasks.js";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import { delegationTools } from "./tools.js";
import { createQuestions } from "./questions.js";
import { resolveCapabilities } from "./capabilities.js";
import { memoryHooks } from "./session-memory.js";
import { TITLE_MAX, stripMemoryTags } from "../public/memory-tags.js";
import { splitAnswer } from "../public/answer-tags.js";
import { stripGoalMarkers } from "../public/goal-markers.js";

// Goal 模式挂载的四个工具：普通会话初始即停用，退出 Goal 时统一停用。
const GOAL_TOOL_NAMES = ["goal_plan", "goal_evidence", "goal_block", "goal_progress"];
// 在飞子任务：状态在跑且真有运行 promise（恢复时被暂停的 starting 没有 done，不算在飞）。
const hasRunningTasks = (item) => [...item.tasks.jobs.values()].some((job) => ["starting", "running"].includes(job.status) && job.done);

// 消息引用到的工具调用身份（toolCall 块与 toolResult 的 toolCallId）。
const referencedToolKeys = (records) => {
  const owned = new Set();
  for (const record of records) {
    const owner = record.agentId ?? "main";
    if (Array.isArray(record.message?.content))
      for (const block of record.message.content)
        if (block?.type === "toolCall" && block.id) owned.add(`${owner}:${block.id}`);
    if (record.message?.toolCallId) owned.add(`${owner}:${record.message.toolCallId}`);
  }
  return owned;
};

// 下发已完成的工具记录：只给下发历史里真引用到的，否则被摘要折叠起来的那段工具会画出幽灵条目。
function relevantTools(item, records) {
  const owned = referencedToolKeys(records);
  const tools = {};
  for (const [key, tool] of Object.entries(item.tools))
    if (tool?.phase !== "end" || owned.has(`${tool.agentId ?? "main"}:${tool.toolCallId}`)) tools[key] = tool;
  return tools;
}

// 压缩卡展开时补发的工具记录：只要这段消息自己引用的，不夹带在跑的工具（快照里已有）。
function ownedTools(allTools, records) {
  const owned = referencedToolKeys(records);
  const tools = {};
  for (const [key, tool] of Object.entries(allTools ?? {}))
    if (owned.has(`${tool?.agentId ?? "main"}:${tool?.toolCallId}`)) tools[key] = tool;
  return tools;
}

// 已完成的元数据按下发历史裁剪：被摘要折叠掉的消息不在历史里，整表下发会为看不见的消息建 DOM。
// 历史内 delegate 结果声明的 taskId：与前端 trackTaskEntries 同一套解析，
// 投影时用来把子代理历史挂回它自己的委派锚点之后。
const delegateTaskIds = (message, into) => {
  if (message?.isError || message?.role !== "toolResult" ||
      message.toolName?.replace(/^functions\./, "") !== "delegate") return;
  for (const block of Array.isArray(message.content) ? message.content : []) {
    if (block?.type !== "text") continue;
    try {
      for (const id of JSON.parse(block.text).taskIds ?? []) if (typeof id === "string") into.add(id);
    } catch {}
  }
};

// 投影：独立 JSONL 不共享时间线，按真实委派结果归位，不能把所有子历史堆到主回答之后。
// 读时投影（live 数组不动）：下发顺序、前端主轴预算都以这个顺序为准；幂等，重复投影不变。
function projectTimeline(messages) {
  const main = [], children = new Map();
  for (const record of messages) {
    if ((record.agentId ?? "main") === "main") main.push(record);
    else {
      if (!children.has(record.agentId)) children.set(record.agentId, []);
      children.get(record.agentId).push(record);
    }
  }
  const ordered = [];
  for (const record of main) {
    ordered.push(record);
    const spawned = new Set();
    delegateTaskIds(record.message, spawned);
    for (const id of spawned) {
      ordered.push(...(children.get(id) || []));
      children.delete(id);
    }
  }
  // 旧记录没有委派锚点时不伪造关联；保留为前置历史，避免遮蔽最新主回答。
  return [...children.values()].flat().concat(ordered);
}

const entryIdSet = (records) => new Set(records.map((record) => record.entryId).filter(Boolean));

// 压缩段的展示口径正文：与前端 renderMessage、src/goal.js 的 bodyText 同一套实现
// （先去 goal 完成标记，再剥记忆标签，最后取 <axiom_display> 内的正式答复），避免正则漂移。
const compactedAnswer = (text) => {
  const cleaned = stripMemoryTags(stripGoalMarkers(String(text ?? "")));
  try { return splitAnswer(cleaned, { streaming: false }).answer.trim(); }
  catch { return cleaned.trim(); }
};

// 压缩段记录 → 精简版：只留「人看的那一层」。
// 用户输入原样保留（含图片附件，抹掉附件会让历史看起来像没发过图）；助手消息只留正式答复正文，
// 思考、工具调用、用量与中断标记这些过程信息随摘要卡一起收走。返回 null 表示这条不再下发。
function compactedRecord(record) {
  if ((record.agentId ?? "main") !== "main") return null; // 子代理记录只在摘要卡展开时补进任务弹窗。
  const message = record.message;
  const role = message?.role;
  if (role !== "user" && role !== "assistant") return null; // 工具结果、内部通知等不属于对话正文。
  const blocks = typeof message.content === "string" ? [{ type: "text", text: message.content }] : message.content ?? [];
  const text = blocks.filter((block) => block?.type === "text").map((block) => block.text).join("\n");
  if (role === "user") {
    // 旧会话的子任务完成通知是带前缀的 user 消息：它是内部通知，不是用户输入。
    if (text.startsWith("[Axiom 子任务完成通知]")) return null;
    const content = [...(text ? [{ type: "text", text }] : []), ...blocks.filter((block) => block?.type === "image")];
    if (!content.length) return null;
    return { ...record, compacted: true, message: { role: "user", content } };
  }
  const answer = compactedAnswer(text);
  if (!answer) return null; // 纯过程轮次（只有思考/工具调用）在压缩后没有可展示的正文。
  return { ...record, compacted: true, message: { role: "assistant", content: [{ type: "text", text: answer }] } };
}

// 压缩折叠：被摘要覆盖的历史裁成精简版下发——主会话的用户输入与助手正式答复留在原位，
// 其余（思考、工具调用/结果、子代理记录）不下发，点开摘要卡时按需取原文。
// keptBefore[i] = 原数组下标 i 之前仍然下发的记录数，用于把重试卡的下标兜底换算到下发数组上。
// indexes[j] = 下发数组第 j 条在折叠前的下标：前端的目标轮次锚点按历史下标登记，折叠不能让它错位。
// visibleIds 只收未被压缩的记录：精简版不是原文形态，锚在其上的重试卡仍随摘要卡展开补发。
function foldCompacted(records, compactions) {
  const hidden = new Set();
  for (const record of compactions ?? [])
    for (const entryId of record.compactedMessageIds ?? []) hidden.add(entryId);
  const keptBefore = new Array(records.length + 1);
  if (!hidden.size) {
    const indexes = new Array(records.length);
    for (let index = 0; index <= records.length; index++) keptBefore[index] = index;
    for (let index = 0; index < records.length; index++) indexes[index] = index;
    return { records, keptBefore, indexes, folded: false, visibleIds: entryIdSet(records) };
  }
  const kept = [];
  const indexes = [];
  const visibleIds = new Set();
  let insideFold = false;
  for (let index = 0; index < records.length; index++) {
    keptBefore[index] = kept.length;
    const record = records[index];
    if ((record.agentId ?? "main") === "main") insideFold = !!record.entryId && hidden.has(record.entryId);
    if (!insideFold) {
      kept.push(record);
      indexes.push(index);
      if (record.entryId) visibleIds.add(record.entryId);
      continue;
    }
    const lite = compactedRecord(record);
    if (lite) { kept.push(lite); indexes.push(index); }
  }
  keptBefore[records.length] = kept.length;
  return { records: kept, keptBefore, indexes, folded: kept.length !== records.length, visibleIds };
}


// 重试卡按下发历史归位：锚点被折叠（在压缩段内）就不下发，下标兜底换算到下发数组上。
function historyRetries(records, visibleIds, keptBefore, total) {
  return records.flatMap((record) => {
    // 锚点在前：anchorEntryId 是精确身份，跨重排不漂；messageCount 只是同构下标的兜底。
    if (record.anchorEntryId && !visibleIds.has(record.anchorEntryId)) return [];
    if (!Number.isInteger(record.messageCount)) return [record];
    // 下标越界（旧数据/历史被改写）时：有锚点就只靠锚点定位，没锚点才整条丢弃。
    if (record.messageCount < 0 || record.messageCount > total) {
      if (!record.anchorEntryId) return [];
      const copy = { ...record };
      delete copy.messageCount;
      return [copy];
    }
    return [{ ...record, messageCount: keptBefore[record.messageCount] }];
  });
}

// live 数组按到达序累积，重试卡的 messageCount 是记录时的数组下标；下发投影时
// 换算成投影下标（主记录恒保序，双指针 O(n)；全主记录数组上恒等）。
function translateRetries(retries, raw, projected) {
  if (!retries.some((record) => Number.isInteger(record.messageCount))) return retries;
  const slots = []; // 第 k 条主记录的投影下标 + 1，即「其后」的槽位。
  let p = 0;
  for (const record of raw) {
    if ((record.agentId ?? "main") !== "main") continue;
    while (p < projected.length && projected[p] !== record) p++;
    if (projected[p] !== record) break; // 主记录必然在投影里；防御式退出。
    slots.push(p + 1);
  }
  return retries.map((record) => {
    if (!Number.isInteger(record.messageCount)) return record;
    let mains = 0;
    for (let index = 0; index < Math.min(record.messageCount, raw.length); index++)
      if ((raw[index].agentId ?? "main") === "main") mains++;
    const slot = mains > 0 && mains <= slots.length ? slots[mains - 1] : 0;
    return slot === record.messageCount ? record : { ...record, messageCount: slot };
  });
}

// 统一目录浏览：目录优先排序后按服务端过滤结果分页；无搜索词时不递归、不逐项 stat、跳过符号链接。
const BROWSE_PAGE = 200;
// 搜索（query 非空）改为递归 + 名称模糊匹配：限制返回条数并给递归目录数封顶，避免超大目录卡住请求。
const SEARCH_LIMIT = 60;
const SEARCH_DIR_LIMIT = 400;
// 搜索与常规浏览都跳过的目录：版本库与依赖目录噪声大、数量多。
const IGNORED_ENTRIES = new Set([".git", "node_modules"]);

// 名称模糊匹配：忽略大小写，needle 的字符按顺序出现即命中（"apjs" 命中 "app.js"）。
function fuzzyHit(text, needle) {
  const lower = text.toLocaleLowerCase();
  if (lower.includes(needle)) return true;
  let i = 0;
  for (const char of lower) {
    if (char === needle[i] && ++i === needle.length) return true;
  }
  return false;
}

// 匹配质量：完全相等 < 前缀 < 子串（越靠前越好） < 子序列；用于搜索排序。
function matchRank(name, needle) {
  const lower = name.toLocaleLowerCase();
  if (lower === needle) return 0;
  if (lower.startsWith(needle)) return 1;
  const at = lower.indexOf(needle);
  return at >= 0 ? 2 + at / 1000 : 3;
}

// 递归搜索：BFS 逐层扫描（先浅后深），只匹配名称、不回读文件，命中按质量排序后截断。
async function searchEntries(root, base, { needle, directoriesOnly, limit }) {
  const hits = [];
  const queue = [[root, base]];
  let visited = 0;
  while (queue.length && visited < SEARCH_DIR_LIMIT && hits.length < limit * 4) {
    const [dir, prefix] = queue.shift();
    visited++;
    let dirents;
    try {
      dirents = await readdir(dir, { withFileTypes: true });
    } catch {
      continue; // 单个子目录不可读不该让整次搜索失败
    }
    for (const entry of dirents) {
      if (entry.isSymbolicLink() || (!entry.isDirectory() && !entry.isFile())) continue;
      if (IGNORED_ENTRIES.has(entry.name)) continue;
      const path = join(prefix, entry.name).split(sep).join("/");
      if (entry.isDirectory()) queue.push([join(dir, entry.name), path]);
      if (directoriesOnly && !entry.isDirectory()) continue;
      if (!fuzzyHit(entry.name, needle)) continue;
      hits.push({ name: entry.name, directory: entry.isDirectory(), path, rank: matchRank(entry.name, needle), depth: path.split("/").length });
    }
  }
  hits.sort((a, b) => a.rank - b.rank || a.depth - b.depth || Number(b.directory) - Number(a.directory) || a.name.localeCompare(b.name));
  return hits.slice(0, limit).map(({ name, directory, path }) => ({ name, directory, path }));
}

// 侧栏绿点口径：主运行中，或主代理空闲但仍有子任务在跑。
function pointStatus(item) {
  if (item.status !== "idle") return item.status;
  return [...item.tasks.jobs.values()].some((job) => ["starting", "running"].includes(job.status)) ? "running" : "idle";
}

// 任务用时即会话执行中的累计时长：进入 running 开始计，离开 running 结算，再次 running 继续累加。
// 用 running 而不是「非 idle」：取消/关闭空闲会话也会发 cancelling，那不应开一段计时。
function trackElapsed(item, status) {
  if (status === "running") {
    item.runningSince ??= Date.now();
    return;
  }
  if (!item.runningSince) return;
  item.elapsedMs += Date.now() - item.runningSince;
  item.runningSince = null;
}

// 兑底标题：首条输入剥掉 [imageN] 占位符后取前 60 字；剥完为空（纯图片输入）回退「[图片]」。
function fallbackTitle(text) {
  const clean = text.trim().replace(/\[image\d+\]\s*/g, "").trim();
  return (clean || "[图片]").slice(0, 60);
}

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

// 复制会话的标题：原名去掉结尾序号后接下一个可用序号（xxx → xxx 1，再复制 → xxx 2；
// 复制「xxx 1」也回到同一条 xxx N 序列，不会出现「xxx 1 1」）。序号只避开同工作区现有
// 标题与源会话自身，副本绝不与源同名。
function duplicateTitle(base, taken) {
  const raw = String(base || "").trim() || "新会话";
  const stem = raw.replace(/\s+\d+$/, "").trim() || raw;
  const titles = new Set(taken);
  for (let n = 1; n <= 999; n++) {
    const candidate = `${stem} ${n}`.slice(0, 60);
    if (!titles.has(candidate)) return candidate;
  }
  return `${stem} 副本`.slice(0, 60);
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

// SDK 的 JSONL 是惰性创建的：新建会话此刻只有路径，文件要等第一条消息才写。
// 把这种路径落库就会留下「库里有路径、磁盘没文件」的假记录——重启后该会话永久打不开
// （ensureLoaded 按「历史文件缺失」拒绝加载，且文件永远不会被创建）。列表的「复制 JSONL
// 路径」同源：前端已按 sessionFile 为 null 渲染「发送首条消息后生成」。
function landedSessionFile(item) {
  const file = item.agent?.sessionFile?.() ?? item.sessionFile ?? null;
  return file && existsSync(file) ? file : null;
}

// SQLite 主结果码（扩展码低 8 位）里「重试有意义」的一组：忙、锁、内存不足、只读、
// I/O、磁盘满、打不开、协议错。这些是环境状态，稍后重放同一增量可能成功。
const RETRYABLE_SQLITE = new Set([5, 6, 7, 8, 10, 13, 14, 15]);
const retryableWrite = (error) => error?.code === "ERR_SQLITE_ERROR" && RETRYABLE_SQLITE.has(error.errcode & 0xff);

// 会话默认配置的库内布局：namespace "defaults" 下 "global" 是全局兜底，
// 其余键 "workspace/<归一化cwd>" 是工作目录独立配置。每套配置一行，选择集完整落库
// （项目技能就在 selection 里），不再有 selection 之外的旁路字段。
const DEFAULTS_NS = "defaults";
const WORKSPACE_PREFIX = "workspace/";
const workspaceKeyOf = (cwd) => (process.platform === "win32" ? cwd.toLowerCase() : cwd);
const CAPABILITY_KINDS = ["skills", "plugins", "mcp"];
// 项目资源只认 catalog 给的 scope，绝不从路径猜（全局目录也可能落在 .agents/skills 之类路径下）。
const catalogProjectsOf = (catalog, kind) => new Set(catalog[kind].filter((entry) => entry.scope === "project").map((entry) => entry.id));

// projectSkills 结构自检：外层 {cwd: {角色: [字符串 id]}}，单目录项与整体都过一遍，坏数据不进入内存。
function validateProjectSkills(projectSkills) {
  if (!projectSkills || typeof projectSkills !== "object" || Array.isArray(projectSkills)) throw new Error("无效的项目技能配置");
  for (const entry of Object.values(projectSkills)) validateProjectSkillEntry(entry);
}
function validateProjectSkillEntry(entry) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) throw new Error("无效的项目技能配置");
  for (const [role, ids] of Object.entries(entry)) {
    if (!Array.isArray(ids) || ids.some((id) => typeof id !== "string")) throw new Error("无效的项目技能选择");
  }
}
// 旧记录把项目技能存在 selection 之外的 projectSkills（{角色: [技能 id]}）：读入时并回完整 selection，
// 此后只写完整 selection，该字段自然消亡。
function mergeLegacyProjectSkills(selection, entry = {}) {
  for (const [role, ids] of Object.entries(entry)) {
    const selected = selection[role];
    if (!selected || selected === "inherit") continue;
    selected.skills = [...new Set([...selected.skills, ...ids])];
  }
  return selection;
}

export class Sessions {
  constructor(createAgent, defaultsPath, storagePath, database) {
    this.storagePath = storagePath;
    this.defaultsPath = defaultsPath;
    // 共享 SQLite 库：优先外部注入（main 组装同一实例）；未注入时从 defaultsPath 或
    // storagePath 旁自建 axiom.db，让旧调用方零改动即得持久化；两者都没有则纯内存。
    const sidecar = defaultsPath ? join(dirname(defaultsPath), "axiom.db")
      : storagePath ? join(dirname(storagePath), "axiom.db") : null;
    this.ownsDatabase = !database && !!sidecar;
    this.database = database || (sidecar ? new Database(sidecar) : null);
    this.store = this.database ? new SessionStore(this.database) : null;
    this.goalStore = createGoalStore(this.database);
    this.taskBudget = structuredClone(taskBudgetDefaults);
    this.loadTaskBudget();
    this.savingDefaults = Promise.resolve();
    // 工作目录独立默认配置：归一化 cwd → { cwd, selection }；读取时优先目录，无目录回落全局。
    this.workspaceSelections = new Map();
    this.createAgent = createAgent;
    this.items = new Map();
    // 每个工作目录记住自己最近用过的模型/思考等级（内存级），不跨目录污染。
    this.recentConfig = new Map();
    this.defaultSelection = { compaction: { ...compactionDefaults }, retry: null, queueType: "steer", model: null, subagentModel: null, thinking: null, subagentThinking: null, capabilities: { skills: [], mcp: [], plugins: [] }, subagentCapabilities: { skills: [], mcp: [], plugins: [] } };
  }

  // 默认配置验证与装配：schema 校验后并入全局内存值；验证通过是写库与迁移标记的前提。
  applyDefaults(data) {
    const parsed = selectionSchema.strict().parse(data ?? {});
    Object.assign(this.defaultSelection, parsed);
  }

  // 默认配置以 SQLite 为权威：全局兜底 + 各工作目录独立配置；首次启动从旧 defaults.json 一次性迁移。
  async loadDefaults() {
    if (!this.database) return;
    const stored = this.database.get(DEFAULTS_NS, "global");
    if (stored !== undefined) this.applyDefaults(stored);
    else await this.migrateDefaults();
    this.loadWorkspaceDefaults();
    // 具名预设已下线：清掉库里的旧记录（磁盘 presets.json 不动，留给用户自行处理）。
    this.database.delete("presets", "store");
  }

  // 旧 defaults.json（或旧版库内单条记录）一次性迁移：验证通过才写库并标记；此后 JSON 只是遗留文件，
  // 不再作为权威——坏 JSON 只警告不标记（保留重试机会），也绝不阻断启动。
  async migrateDefaults() {
    const legacy = this.database.get(DEFAULTS_NS, "defaults");
    if (legacy !== undefined) return this.migrateLegacyStore(legacy);
    if (!this.defaultsPath || this.database.get("migrated", this.defaultsPath)) return;
    try {
      const data = JSON.parse(await readFile(this.defaultsPath, "utf8"));
      this.migrateLegacyStore(data);
      this.database.set("migrated", this.defaultsPath, true);
    } catch (error) {
      if (error.code !== "ENOENT") console.warn(`旧默认配置迁移失败，保留原文件 ${this.defaultsPath}：请检查数据格式及数据库读写权限`);
    }
  }

  // 旧版一条 defaults 记录 = 一份全局配置 + projectSkills 表。拆成「全局兜底 + 各工作目录独立配置」，
  // 目录记录沿用旧形态（旁人审计在读侧统一兼容），下次用户保存时升级成完整 selection。
  migrateLegacyStore(data) {
    const { projectSkills = {}, ...saved } = data ?? {};
    // 旧记录只存了用户改过的键：与内置默认合并后才是完整配置（目录配置不再依赖全局兜底）。
    const selection = { ...structuredClone(this.defaultSelection), ...selectionSchema.strict().parse(saved) };
    validateProjectSkills(projectSkills);
    // 全局与目录记录必须同一事务落地：中途失败若留下 global，下次启动就会跳过迁移，
    // 目录配置将永久丢失。
    this.database.exec("SAVEPOINT defaults_migration");
    try {
      this.database.set(DEFAULTS_NS, "global", selection);
      for (const [cwd, entry] of Object.entries(projectSkills)) {
        const key = WORKSPACE_PREFIX + workspaceKeyOf(cwd);
        if (this.database.get(DEFAULTS_NS, key) !== undefined) continue;
        this.database.set(DEFAULTS_NS, key, { cwd, selection, projectSkills: entry });
      }
      this.database.exec("RELEASE defaults_migration");
    } catch (error) {
      this.database.exec("ROLLBACK TO defaults_migration; RELEASE defaults_migration");
      throw error;
    }
    this.applyDefaults(selection);
  }

  // 目录配置逐条加载：单条坏记录只警告跳过，与全局配置一样不阻断启动。
  loadWorkspaceDefaults() {
    if (!this.database) return;
    for (const { key, value } of this.database.list(DEFAULTS_NS)) {
      if (!key.startsWith(WORKSPACE_PREFIX) || !value) continue;
      const scope = key.slice(WORKSPACE_PREFIX.length);
      try {
        const selection = selectionSchema.strict().parse(value.selection);
        validateProjectSkillEntry(value.projectSkills ?? {});
        this.workspaceSelections.set(scope, { cwd: value.cwd ?? scope,
          selection: mergeLegacyProjectSkills(selection, value.projectSkills) });
      } catch (error) {
        console.warn(`工作目录默认配置读取失败，已跳过 ${value.cwd || scope}：${error.message}`);
      }
    }
  }

  // —— 全局子代理轮次预算（taskBudget）：SQLite namespace "settings"；构造时读取，
  // 重启后按最新全局值生效；运行中会话持有创建时的快照，不热更。
  // 坏记录只警告并回退默认值，不阻断启动。
  loadTaskBudget() {
    if (!this.database) return;
    try {
      const saved = this.database.get("settings", "taskBudget");
      if (saved === undefined) return;
      // 只挑已知键再 strict 校验：旧版本/未来字段留下的未知键不得连合法值一起丢掉
      // （strict 整条解析失败会静默回落默认，用户设过的预算凭空消失）。
      const known = Object.fromEntries(Object.keys(taskBudgetDefaults)
        .filter((key) => saved?.[key] !== undefined).map((key) => [key, saved[key]]));
      this.taskBudget = taskBudgetSchema.parse({ ...taskBudgetDefaults, ...known });
    } catch (error) {
      console.warn(`轮次预算读取失败，使用默认值：${error.message}`);
    }
  }

  getTaskBudget() {
    return structuredClone(this.taskBudget);
  }

  // 保存前 zod 校验（坏值直接抛给 WS 通用错误回执），先持久化再更新内存值。
  // 无库实例时明确报错：读侧有空库判断，写侧也必须有，不能靠 TypeError 暴露。
  configureTaskBudget(value) {
    if (!this.database) throw new Error("未启用轮次预算持久化");
    const next = taskBudgetSchema.parse(value);
    this.database.set("settings", "taskBudget", next);
    this.taskBudget = next;
    return structuredClone(next);
  }
  getDefaults() {
    return structuredClone(this.defaultSelection);
  }
  // 目录配置存在则用目录的，否则回落全局兜底（同步；压缩恢复与直推沿用同一归属判断）。
  defaultsFor(cwd) {
    return (cwd && this.workspaceSelections.get(workspaceKeyOf(cwd))?.selection) || this.defaultSelection;
  }
  // 已配置的工作目录路径列表（配置下拉用）；内存即库内快照。
  listDefaults() {
    return { workspaces: [...this.workspaceSelections.values()].map((record) => record.cwd).sort() };
  }
  // 删除目录配置：与保存共用同一串行链（避免并发的保存写在删除之后把配置复活）；
  // 先成功删库再改内存，该目录立即回落全局兜底；目录已不在磁盘上也能清理。
  // 返回简单回执：不再回头读该目录的能力目录，避免「删除已成功、却因目录读取失败报错」。
  deleteDefaults(workspace) {
    const work = this.savingDefaults.then(() => this.removeDefaults(workspace));
    this.savingDefaults = work.catch(() => {});
    return work;
  }
  async removeDefaults(workspace) {
    if (!workspace) throw new Error("缺少工作目录");
    const cwd = await realpath(workspace).catch(() => null);
    const scope = workspaceKeyOf(cwd || resolve(workspace));
    this.database?.delete(DEFAULTS_NS, WORKSPACE_PREFIX + scope);
    this.workspaceSelections.delete(scope);
    // 回落只影响未来新会话，已有会话保留创建时或单独保存的配置。
    return { deleted: true, cwd };
  }
  async workspaceDefaults(workspace = this.createAgent.cwd || process.cwd(), capabilityCatalog) {
    const cwd = await realpath(workspace);
    const scope = workspaceKeyOf(cwd);
    const record = this.workspaceSelections.get(scope);
    const next = structuredClone(record?.selection ?? this.defaultSelection);
    if (!this.createAgent.capabilities) return next;
    const catalog = await (capabilityCatalog ?? this.createAgent.capabilities(cwd));
    for (const role of ["capabilities", "subagentCapabilities"]) {
      const selection = next[role];
      if (!selection || selection === "inherit") continue;
      // 别名目录的绝对路径先归一，才能与 catalog 的 id 对上。
      selection.skills = await Promise.all(selection.skills.map((id) => realpath(id).catch(() => id)));
      for (const kind of CAPABILITY_KINDS) {
        const available = new Set(catalog[kind].map((entry) => entry.id));
        // 只过滤返回副本，不改库内选择；资源重新出现后无需重启即可恢复。
        selection[kind] = selection[kind].filter((id) => available.has(id));
      }
    }
    return next;
  }
  configureDefaults(workspace, selection) {
    const save = this.savingDefaults.then(() => this.saveDefaults(workspace, selection));
    this.savingDefaults = save.catch(() => {});
    return save;
  }
  // 带 cwd 写该目录的独立配置，不带 cwd 写全局兜底；目录配置读取时优先，删除后回落全局。
  async saveDefaults(workspace, selection) {
    const scoped = !!workspace;
    const cwd = await realpath(workspace || this.createAgent.cwd || process.cwd());
    const scope = workspaceKeyOf(cwd);
    const next = scoped ? await this.workspaceDefaults(cwd) : structuredClone(this.defaultSelection);
    // 只认 selection schema 里的键：调用方会把整个 WS 请求传进来，未知键不能进库；
    // 也不能按 next 已有键遍历——旧记录只存过用户改过的键，那样补丁会被整段丢掉。
    const explicit = Object.keys(selectionSchema.shape).filter((key) => selection[key] !== undefined);
    for (const key of explicit) next[key] = structuredClone(selection[key]);
    // 显式提交的键严格过关（不能选别的目录的资源）；继承自旧记录的键允许已不可用（跳过并剔除），
    // 否则一个被删掉的项目技能文件会让用户连 thinking 都改不了。
    const inherited = Object.keys(selectionSchema.shape).filter((key) => selection[key] === undefined);
    const { catalog } = await this.validateSelection(cwd, next, inherited);
    // 全局兜底跨工作目录共用：显式提交的项目资源一律拒绝，否则会把服务目录的项目能力
    // 写进全局再泄漏给别的目录；显式 null（=全部）保留运行时语义，不落库也不展开。
    if (!scoped && catalog) {
      for (const role of explicit.filter((key) => ["capabilities", "subagentCapabilities"].includes(key) && next[key] != null && next[key] !== "inherit")) {
        for (const kind of CAPABILITY_KINDS) {
          const leaked = next[role][kind].filter((id) => catalogProjectsOf(catalog, kind).has(id));
          if (leaked.length) throw new Error(`全局默认配置不能包含项目${kind}：${leaked.join("、")}`);
        }
      }
    }
    const result = structuredClone(next);
    if (scoped) {
      // 项目技能就在这份完整 selection 里：先成功落库再改内存，写失败不能让它实际生效。
      this.database?.set(DEFAULTS_NS, WORKSPACE_PREFIX + scope, { cwd, selection: next });
      this.workspaceSelections.set(scope, { cwd, selection: next });
    } else {
      this.database?.set(DEFAULTS_NS, "global", next);
      this.defaultSelection = next;
    }
    // 默认配置只影响以后创建的会话，不能覆盖已有会话的独立设置。
    // 当前会话的热更新统一走 session.configure。
    return result;
  }
  // 压缩配置直推：只改选中会话的压缩部分，等级由实际模型适配，单会话失败不影响调用方。
  async pushCompaction(match, compaction) {
    for (const item of this.items.values()) {
      if (!item.loaded || item.configuring) continue;
      if (!match(item.cwd ? workspaceKeyOf(item.cwd) : null)) continue;
      const model = item.agent?.config?.()?.model;
      if (!model) continue;
      try {
        await item.agent.configure({ model, compaction });
      } catch {}
    }
  }
  async validateSelection(workspace = this.createAgent.cwd || process.cwd(), selection, inherited = [], capabilityCatalog) {
    const cwd = await realpath(workspace);
    if (!(await stat(cwd)).isDirectory()) throw new Error("工作空间必须是目录");
    // 恢复已有会话（create 注入 selection.sessionFile）：历史模型允许暂未鉴权但已定义，
    // 与 pi.js 主代理按 sessionFile 走 getModels 的放行一致；新建/修改仍要求可用，
    // 真正无效照常报错，不自动换模型。目录仅在确有模型要校验时读取（无 catalog 方法
    // 的测试桩不炸），无目录方法视为空目录。
    // 目录仅在确有模型/压缩模型要校验时才读取（与原惰性校验一致，无 catalog 方法的旧桩不炸）。
    const models = () => selection.sessionFile
      ? (this.createAgent.modelCatalog?.() ?? this.createAgent.catalog?.())
      : this.createAgent.catalog?.();
    for (const key of ["model", "subagentModel"])
      if (selection[key] != null && !models()?.some((m) => m.key === selection[key]))
        throw new Error(key === "model" ? "Unknown model" : "Unknown subagent model");
    if (selection.compaction) this.validateCompaction(selection.compaction, selection.model, !!selection.sessionFile);
    let catalog;
    const warnings = [];
    if (this.createAgent.capabilities) {
      catalog = await (capabilityCatalog ?? this.createAgent.capabilities(cwd, selection.trustProject === true));
      for (const key of ["capabilities", "subagentCapabilities"]) {
        if (key === "subagentCapabilities" && selection[key] === "inherit") continue;
        const resolved = resolveCapabilities(selection[key], catalog, { allowUnavailable: inherited.includes(key), warnings });
        // null 仍表示全部；自定义空集合不能扩大为全部能力。
        if (selection[key] != null && inherited.includes(key)) selection[key] = resolved;
      }
    }
    return { cwd, catalog, warnings };
  }

  // restore（恢复会话）时历史模型允许已定义未鉴权；目录仅在 key 存在时才读取（原惰性契约），
  // 无 catalog 方法的旧桩按未知模型报错而非 TypeError。
  validateCompaction(value, mainModel, restore = false) {
    const config = compactionSchema.parse(value);
    const key = config.model || mainModel;
    if (key) {
      const models = restore
        ? (this.createAgent.modelCatalog?.() ?? this.createAgent.catalog?.())
        : this.createAgent.catalog?.();
      const model = models?.find((model) => model.key === key);
      if (!model) throw new Error("Unknown compaction model");
      return resolveCompaction(config, model.levels);
    }
    return config;
  }

  async load() {
    if (!this.store) return;
    this.store.migrateLegacy();
    if (this.storagePath) {
      await mkdir(this.storagePath, { recursive: true });
      await this.migrateLegacySessions();
    }
    // 启动只读元数据；历史和 SDK 留到首次打开。缺失 JSONL 也保留可见记录。
    for (const saved of this.store?.listSessions() ?? []) {
      this.items.set(saved.id, { ...saved, loaded: false, status: "idle", runningSince: null,
        tasks: { jobs: new Map() }, listeners: new Set() });
    }
    // 只有待通知会话需要主动恢复，串行启动避免历史任务同时唤醒大量 SDK。
    for (const id of this.store?.listPendingSessionIds() ?? []) {
      try {
        // 暂停/等待确认的 Goal 会话投递必被拒（见 goalNotificationsBlocked），拉起 SDK 纯属白费；
        // notified 仍留 0，等用户恢复 Goal 再投，不改「待通知」口径。
        const phase = this.goalStore.load(id)?.phase;
        if (phase && !["running", "verifying"].includes(phase)) continue;
        await this.ensureLoaded(id);
      }
      catch (error) { console.warn(`会话恢复失败 ${id}：${error.message}`); }
    }
  }

  async ensureLoaded(id) {
    const item = this.get(id);
    if (item.releasing) { await item.releasing; return this.ensureLoaded(id); }
    if (item.closing) throw new Error("Session is closing");
    item.lastUsedAt = Date.now();
    if (item.loaded) return item;
    if (!item.loading) item.loading = (async () => {
      // 元数据会话也可能有改名失败；换成 SDK 实例前先清空旧对象的失败队列。
      if (item.pendingWrites?.length) await this.persist(item, {});
      const saved = item.draft ?? this.store.getSession(id);
      if (saved.sessionFile && !existsSync(saved.sessionFile))
        throw new Error(`会话历史文件缺失，已保留数据库记录：${saved.sessionFile}`);
      saved.selection ??= {};
      saved.selection.compaction ??= structuredClone(this.defaultsFor(saved.cwd).compaction ?? compactionDefaults);
      await this.create(saved.cwd, saved.selection, saved);
      const loaded = this.get(id);
      loaded.emit({ type: "session.config", data: this.configData(loaded) });
      return loaded;
    })().finally(() => { item.loading = null; });
    return item.loading;
  }

  // 旧版磁盘会话（workspaces/<hash>/<id>.json）一次性迁入库：解析验证成功才写库+标记，
  // 源文件保留（迁移永不破坏原始数据）。标记精确到文件：单文件失败只跳过它自己，修复后
  // 下次启动重试，不牵连同目录其他文件。三表导入与标记经存储层单事务提交。库中已有同 id
  // 记录时以库为准不覆盖；删除会话时旧 JSON 一并清理，即使清理中断，文件标记仍在，绝不复活。
  async migrateLegacySessions() {
    for (const workspace of await readdir(this.storagePath, { withFileTypes: true })) {
      if (!workspace.isDirectory()) continue;
      const directory = join(this.storagePath, workspace.name);
      for (const file of await readdir(directory)) {
        if (!file.endsWith(".json")) continue;
        const path = join(directory, file);
        const marker = `sessions/${path}`;
        if (this.database?.get("migrated", marker)) continue;
        try {
          const saved = JSON.parse(await readFile(path, "utf8"));
          if (typeof saved?.id !== "string" || !saved.id) throw new Error("缺少会话 id");
          if (typeof saved?.cwd !== "string" || !saved.cwd) throw new Error("缺少会话工作空间");
          if (saved.selection !== undefined && (typeof saved.selection !== "object" || Array.isArray(saved.selection) || saved.selection === null))
            throw new Error("无效的会话配置");
          // 完整模型消息不再入库：历史权威是 Pi JSONL，恢复时重建。
          delete saved.messages;
          this.store?.importLegacySession(saved, marker);
        } catch (error) {
          console.warn(`旧会话迁移失败，保留原文件 ${path}：请检查数据格式及数据库读写权限`);
        }
      }
    }
  }
  sessionData(item) {
    return { id: item.id, cwd: item.cwd, title: item.title,
      titleManual: item.titleManual, titleRequested: item.titleRequested,
      createdAt: item.createdAt, updatedAt: item.updatedAt,
      elapsedMs: item.elapsedMs, runningSince: item.runningSince,
      // 已知真实路径优先取当前落盘结果，取不到则保留已知路径：JSONL 被外部删除时，库里
      // 的路径是「历史丢失」的唯一证据，抹成 NULL 会让下次打开把它当全新会话静默重建。
      sessionFile: landedSessionFile(item) ?? item.sessionFile ?? null,
      selection: item.agent ? { ...item.agent.config?.(), capabilities: item.capabilities,
        subagentCapabilities: item.subagentCapabilities, subagentModel: item.subagentModel,
        subagentThinking: item.subagentThinking, queueType: item.queueType, retry: item.retry,
        // 轮次预算随会话创建定死（create 从 selection.taskBudget 读回）：不落进 selection
        // 就无从区分「创建时的预算」与「当前全局值」，重开会话即被热更成新全局值。
        taskBudget: item.taskBudget, executionStarted: item.executionStarted,
        trustProject: item.trustProject, useDefaults: false } : item.selection };
  }

  // 同步 SQL 在返回 Promise 前完成；调用方仍可 await/捕获，不排队复制整份历史。
  // 事务边界复用存储层 change()（回滚自身的异常在那里被吞掉，不会掩盖原始错误）。
  async persist(item, change = { session: this.sessionData(item) }) {
    if (!this.store) return;
    if (!this.store.hasSession(item.id) && !item.messages?.some(record => record.message?.role === "user")) return;
    // 失败的增量留待下次写入/关闭重试，不能指望全量快照偶然补救。
    item.pendingWrites ||= [];
    item.pendingWrites.push({ change });
    while (item.pendingWrites.length) {
      const head = item.pendingWrites[0];
      try {
        this.store.change(() => {
          if (!this.store.hasSession(item.id)) this.store.insertSession({ ...this.sessionData(item),
            compactions: item.compactions, retries: item.retries, tasks: item.tasks.snapshot() });
          this.writeChange(item, head.change);
        });
      } catch (error) {
        // 环境性失败（忙/锁/只读/磁盘满/IO）重试有意义：保留队头与增量顺序原样上抛，
        // 由下次写入或关闭重放——顺序不能乱，否则旧快照会覆盖更新的字段值。
        if (retryableWrite(error)) throw error;
        // 确定性失败（未知字段、缺 id、库内坏 JSON）重试一万次也不会成功。每条增量给且只给
        // 一次机会：首次确定性失败留队并上抛（调用方仍可修正后重来，整段增量不半途丢记录）；
        // 再撞见同一条就丢弃并上报，绝不让一条坏增量把这个会话此后的全部落盘永久堵死。
        if (!head.tried) {
          head.tried = true;
          throw error;
        }
        item.pendingWrites.shift();
        const report = `会话保存失败，已丢弃无法写入的改动：${error.message}`;
        if (item.emit) item.emit({ type: "error", data: { message: report } });
        else console.warn(report);
      }
      if (item.pendingWrites[0] === head) item.pendingWrites.shift();
    }
  }

  writeChange(item, change) {
    if (Array.isArray(change)) {
      for (const part of change) this.writeChange(item, part);
      return;
    }
    if (change.session) {
      const { id, ...patch } = change.session;
      this.store.updateSession(item.id, patch);
    }
    // 自报标题成功即固化「已定案」：titleRequested 只在真正拿到标题后才为真，重启不会重复索要。
    if (change.title) this.store.updateSession(item.id, { title: item.title, titleRequested: item.titleRequested });
    if (change.event) this.store.saveEvent(item.id, change.event.type, change.event.record);
    if (change.task) this.store.saveTask(item.id, change.task);
    if (change.deletedEvents) this.store.deleteEvents(item.id, change.deletedEvents.type, change.deletedEvents.records);
  }

  saveChange(item, change) {
    void this.persist(item, change).catch((error) =>
      item.emit({ type: "error", data: { message: `会话保存失败：${error.message}` } }));
  }

  list() {
    return [...this.items.values()]
      .map((item) => ({
        id: item.id,
        title: item.title,
        cwd: item.cwd,
        // 列表展示整场执行状态；主代理的输入/队列状态仍由 item.status 控制。
        status: pointStatus(item),
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
        elapsedMs: item.elapsedMs,
        runningSince: item.runningSince,
        // 会话的 .jsonl 源文件路径，供侧栏菜单「复制 JSONL 路径」用；尚未落盘时为 null。
        sessionFile: landedSessionFile(item),
      }))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }
  async rename(id, title) {
    if (this.get(id).loading) await this.get(id).loading;
    const item = this.get(id);
    if (item.closing) throw new Error("Session is closing");
    item.title = title;
    item.titleManual = true;
    item.titlePending = false;
    item.updatedAt = Date.now();
    if (item.draft) Object.assign(item.draft, { title, titleManual: true, updatedAt: item.updatedAt });
    await this.persist(item, { session: { title, titleManual: true, updatedAt: item.updatedAt } });
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

  // 复制会话：主历史 JSONL 与子任务历史都复制成新身份（等价于把会话完整重启成一份副本），
  // 配置沿用源会话，标题原名接序号。只允许空闲会话复制：运行中主历史还在追加，边写边复制
  // 可能截断末行；副本也不会接管未完成的子任务（那会造成同一任务双跑）。
  async duplicate(id) {
    if (!this.items.has(id)) throw new Error("Unknown session");
    if (!this.storagePath) throw new Error("当前实例未启用会话存储，无法复制会话");
    if (this.get(id).loading) await this.get(id).loading;
    const item = this.get(id);
    if (item.closing) throw new Error("Session is closing");
    const file = landedSessionFile(item);
    if (!file) throw new Error("会话还没有历史文件，发送首条消息后再复制");
    if (pointStatus(item) !== "idle") throw new Error("会话正在运行，请等任务结束或停止后再复制");
    // 先冲刷内存里的最新状态到库（标题/时间/累计用时等，失败按原语义上抛，不做降级复制）。
    await this.persist(item);
    const saved = this.store.getSession(id);
    const cwd = item.cwd;
    const newId = randomUUID();
    const storageDir = join(this.storagePath, createHash("sha256").update(process.platform === "win32" ? cwd.toLowerCase() : cwd).digest("hex"));
    const tasksDir = join(storageDir, `${newId}-tasks`);
    await mkdir(tasksDir, { recursive: true });
    // 主历史：只重写首行身份（id/cwd），其余条目与分支 ID 原样保留，与导入同一口径。
    const lines = (await readFile(file, "utf8")).split("\n").filter((line) => line.trim());
    let header;
    try { header = JSON.parse(lines[0]); }
    catch { throw new Error("会话历史文件损坏，无法复制"); }
    const mainCopy = join(storageDir, `${newId}.jsonl`);
    await writeFile(mainCopy, [JSON.stringify({ ...header, id: newId, cwd }), ...lines.slice(1)].join("\n"), { mode: 0o600 });
    // 子任务历史：逐个复制到副本自己的 -tasks 目录；文件缺失（历史已丢失）的旧任务保留
    // 记录但不再引用源路径——副本绝不能读回源会话的文件，否则删除源会把副本变成坏引用。
    const tasks = [];
    for (const task of saved?.tasks || []) {
      const record = { ...task };
      if (record.sessionFile && existsSync(record.sessionFile)) {
        const target = join(tasksDir, `${record.id}.jsonl`);
        try { await copyFile(record.sessionFile, target); }
        catch (error) { throw new Error(`复制子任务历史失败：${error.message}`); }
        record.sessionFile = target;
      } else delete record.sessionFile;
      // 副本不接管未完成的子任务；通知也一律视为已消费：用户在源会话已看过结果，
      // 副本重启后不该再自动唤醒一轮通知（与 goal 退出的 notified 归一口径一致）。
      if (["starting", "running"].includes(record.status))
        Object.assign(record, { status: "cancelled", error: "副本不接管未完成的子任务" });
      record.notified = true;
      tasks.push(record);
    }
    return this.create(cwd, saved?.selection ?? {}, {
      ...saved,
      id: newId,
      sessionFile: mainCopy,
      title: duplicateTitle(item.title, [item.title, ...[...this.items.values()].filter((other) => other !== item && other.cwd === cwd).map((other) => other.title)]),
      titleManual: true,
      titleRequested: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      elapsedMs: 0,
      runningSince: null,
      tasks,
    });
  }

  async create(workspace, selection = {}, saved, deferStart = false) {
    const inherited = ["capabilities", "subagentCapabilities"].filter((key) =>
      saved || (selection.useDefaults !== false && selection[key] === undefined));
    // 单次创建复用默认值过滤与选择校验的扫描；不跨请求缓存，不复用不同信任级别。
    const resolvedWorkspace = await realpath(workspace || this.createAgent.cwd || process.cwd());
    const capabilityCatalog = this.createAgent.capabilities && selection.trustProject !== true
      ? await this.createAgent.capabilities(resolvedWorkspace, false) : undefined;
    selection = structuredClone({ ...(selection.useDefaults === false ? {} : await this.workspaceDefaults(resolvedWorkspace, capabilityCatalog)), ...selection });
    // 恢复已有会话时告知 validateSelection 放行历史模型（后续建 agent 本就传 sessionFile）。
    if (saved?.sessionFile) selection.sessionFile = saved.sessionFile;
    const { cwd, catalog, warnings } = await this.validateSelection(resolvedWorkspace, selection, inherited, selection.trustProject === true ? undefined : capabilityCatalog);
    for (const warning of warnings) console.warn(`${cwd}：${warning}`);
    const id = saved?.id || randomUUID();
    if (deferStart && !saved) {
      const draft = { id, cwd, selection, title: "新会话", titleManual: false,
        titleRequested: false, createdAt: Date.now(), updatedAt: Date.now() };
      this.items.set(id, { ...draft, draft, loaded: false, status: "idle",
        runningSince: null, tasks: { jobs: new Map() }, listeners: new Set() });
      return id;
    }
    const storageDir = this.storagePath && join(this.storagePath, createHash("sha256").update(process.platform === "win32" ? cwd.toLowerCase() : cwd).digest("hex"));
    if (storageDir) await mkdir(storageDir, { recursive: true });
    const importedFile = saved?.importText != null && storageDir ? join(storageDir, `${id}.jsonl`) : null;
    const item = {
      id,
      cwd,
      storageDir,
      loaded: true,
      sessionFile: saved?.sessionFile ?? importedFile,
      queueType: selection.queueType || "steer",
      title: saved?.title || "新会话",
      titleManual: saved?.titleManual ?? !!saved,
      // 旧「一次性索要」时代失败的会话已把 titleRequested 固化成 1：标题是 60 字兑底（超过自报
      // 上限，不可能是模型给的），视为未定案——恢复后下一条消息重新索要，存量坏会话自愈。
      titleRequested: (saved?.titleRequested ?? !!saved)
        && (saved?.titleManual === true || [...(saved?.title ?? "")].length <= TITLE_MAX),
      titlePending: false,
      // 轮次预算随会话创建定死：新会话取当前全局值（保存后新建即生效），运行中不热更；
      // 恢复的会话从 selection 读回创建时的预算，全局值后来改了也不追认。
      taskBudget: structuredClone(selection.taskBudget ?? this.taskBudget),
      // 老记录无 createdAt，回退 updatedAt 兜底（历史文件未存创建时间，无法还原真实值）。
      createdAt: saved?.createdAt || saved?.updatedAt || Date.now(),
      updatedAt: saved?.updatedAt || Date.now(),
      lastUsedAt: Date.now(),
      // 重启即中断：上次未结算的运行段不补算，只保留已结算的累计用时。
      elapsedMs: saved?.elapsedMs || 0,
      runningSince: null,
      seq: this.items.get(id)?.seq ?? 0,
      status: "idle",
      listeners: this.items.get(id)?.listeners ?? new Set(),
      executionStarted: selection.executionStarted ?? !!(saved?.sessionFile || saved?.messages?.length || saved?.retries?.length || saved?.tasks?.length),
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
      // 流式消息的临时身份（agentId → uuid）；不落盘。
      liveIds: new Map(),
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
      let endIdentity;
      if (event.type === "agent.message.start") {
        item.live[agentId] = structuredClone(event.data.message);
        item.liveIds.set(agentId, randomUUID());
      }
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
        // entryId 是身份首选（跨重启稳定）；没有就沿用流式临时 id，保证 live→end 同一条消息同一个 id。
        const liveId = item.liveIds.get(agentId);
        item.liveIds.delete(agentId);
        const entryId = event.data.entryId;
        const messageId = entryId ?? liveId ?? randomUUID();
        item.messages.push({ agentId, message: event.data.message, messageId, ...(entryId ? { entryId } : {}) });
        endIdentity = { messageId, ...(entryId ? { entryId } : {}), ...(liveId && liveId !== messageId ? { liveId } : {}) };
        delete item.live[agentId];
        if (agentId === "main") {
          const sessionFile = landedSessionFile(item);
          if (sessionFile && sessionFile !== item.sessionFile) {
            item.sessionFile = sessionFile;
            this.saveChange(item, { session: { sessionFile } });
          }
        }
        if (event.data.message?.role === "user") this.saveChange(item, { session: this.sessionData(item) });
      }
      if (event.type === "agent.compaction" && agentId === "main") {
        if (!item.compactions.some((entry) => entry.id === event.data.id)) item.compactions.push(event.data);
        this.saveChange(item, { event: { type: "compaction", record: event.data } });
      }
      const envelope = { ...event, sessionId: id, seq: ++item.seq };
      if (endIdentity) envelope.data = { ...envelope.data, ...endIdentity };
      if (event.type === "agent.message.start") envelope.data = { ...envelope.data, messageId: item.liveIds.get(agentId) };
      if (event.type === "session.state" || event.type === "task.state") {
        // 绿点开始/结束才需要落盘：累计值变了，重启恢复才算得准。
        const wasRunning = item.runningSince;
        trackElapsed(item, pointStatus(item));
        envelope.data = { ...event.data, elapsedMs: item.elapsedMs, runningSince: item.runningSince };
        // 顺路带上标题与 updatedAt：这两个字段在运行开始前就改好了（prompt 用首条输入推导标题、
        // startRun 刷新时间），但原先要等整轮跑完的全量快照才落库。长任务跑到一半进程被杀，
        // 重启后侧栏就是一排「新会话」加过期时间。搭已有的这一笔写，不多一次落盘。
        if (wasRunning !== item.runningSince)
          this.saveChange(item, { session: { title: item.title, updatedAt: item.updatedAt,
            elapsedMs: item.elapsedMs, runningSince: item.runningSince } });
      }
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
        this.saveChange(item, { event: { type: "retry", record } });
      }
      if (event.type === "tool.state")
        Object.assign(item.tools[`${agentId}:${event.data.toolCallId}`] ??= { agentId }, event.data);
      if (event.type === "task.state") this.saveChange(item, { task: event.saved ?? event.data });
      // 持久化专用字段不进入 WebSocket 广播。
      delete envelope.saved;
      const envelopes = [envelope];
      if (event.type === "agent.runtime" && (!event.agentId || event.agentId === "main")) item.billingMain = event.data?.billing;
      if (event.type === "agent.runtime" || event.type === "task.state") {
        const main = item.billingMain ?? item.agent?.runtime?.()?.billing;
        envelopes.push({ type: "session.billing", sessionId: id, seq: ++item.seq,
          data: combinedBilling(main, [...(item.tasks?.jobs.values() ?? [])]) });
      }
      for (const outgoing of envelopes)
        for (const listener of item.listeners) {
          try {
            Promise.resolve(listener(outgoing)).catch(() => console.warn("[sessions] listener_failed"));
          } catch { console.warn("[sessions] listener_failed"); }
        }
    };
    item.goal = new Goal({ sessionId: id, store: this.goalStore, emit: item.emit,
      messageCount: () => item.messages.length });
    item.questions = createQuestions(item.emit);
    const saveMemory = (change) => this.saveChange(item, change);
    item.tasks = new Tasks(
      (job) => {
        if (job.historySaved && (!job.sessionFile || !existsSync(job.sessionFile)))
          throw new Error("子任务历史文件缺失，已保留记录，拒绝重新执行原任务");
        return this.createAgent([], {
          ...item.agent.config?.(),
          audit: { sessionId: id, agentId: job.id, source: "task" },
          ...(item.retry ? { retry: item.retry } : {}),
          ...(item.subagentModel ? { model: item.subagentModel } : {}),
          cwd,
          ...(item.subagentThinking ? { thinking: item.subagentThinking } : {}),
          capabilities: item.subagentCapabilities === "inherit" ? item.agent.config?.().capabilities ?? item.capabilities : item.subagentCapabilities,
          trustProject: item.trustProject,
          memory: memoryHooks(item, saveMemory, job),
          executionContext: () => {
            const goal = item.goal.snapshot();
            if (!goal) return null;
            return `[Goal 所属子任务] 总体目标：${goal.objective}\n约束：${goal.constraints.join("；")}\n所属轮次：${goal.currentRound + 1}。只完成委派给你的具体任务，不负责推进总体目标。` +
              (this.goalNotificationsBlocked(item) ? "\n用户已要求暂停：在当前工具完成后保存实际进度、未完成事项和产物位置，安全收尾，不启动新的工作。" : "");
          },
          sessionDir: storageDir ? join(storageDir, `${id}-tasks`) : undefined,
          // 子代理与主会话共享同一归档目录：与 `${id}-tasks` 同批清理。
          observationsDir: storageDir ? join(storageDir, `${id}-observations`) : undefined,
          sessionFile: job.sessionFile,
        });
      },
      item.emit,
      async () => {
        // task.state 已同步提交终态；只重试失败队列，不再重写同一大结果。
        await this.persist(item, {});
        this.scheduleTaskNotifications(item);
        this.scheduleGoal(item);
      },
    );
    for (const task of saved?.tasks || []) {
      const interrupted = ["starting", "running"].includes(task.status);
      const resumable = interrupted && (!!task.sessionFile || task.persistenceVersion === 1);
      item.tasks.jobs.set(task.id, { ...task,
        status: resumable ? "starting" : interrupted ? "cancelled" : task.status,
        error: interrupted && !resumable ? "旧子任务没有持久化历史，无法恢复" : task.error,
        resultId: resumable ? undefined : task.resultId || randomUUID(), notified: resumable ? false : task.notified ?? false });
    }
    try {
      if (importedFile) {
        // 副本拥有自己的身份和工作空间；历史条目及其分支 ID 保持不变。
        const lines = saved.importText.trimStart().split("\n");
        lines[0] = JSON.stringify({ ...JSON.parse(lines[0]), id, cwd });
        await writeFile(importedFile, lines.join("\n"), { mode: 0o600 });
      }
      item.agent = await this.createAgent([...delegationTools(item.tasks), item.questions.tool, item.goal.planTool(), item.goal.blockTool(), item.goal.progressTool(), item.goal.verificationTool({ evidence: () => {
        const start = item.goal.snapshot()?.rounds[item.goal.snapshot()?.currentRound]?.startMessage ?? item.messages.length;
        return item.messages.slice(start).filter((entry) => entry.agentId === "main" && entry.message?.role === "toolResult")
          .map((entry) => entry.message);
      } })], {
        ...(this.recentConfig.get(workspaceKeyOf(cwd)) ?? {}),
        audit: { sessionId: id, agentId: "main", source: "main" },
        ...(selection.model ? { model: selection.model } : {}),
        ...(selection.thinking ? { thinking: selection.thinking } : {}),
        capabilities: item.capabilities,
        compaction: selection.compaction,
        retry: item.retry,
        trustProject: item.trustProject,
        cwd,
        sessionDir: storageDir,
        observationsDir: storageDir ? join(storageDir, `${id}-observations`) : undefined,
        sessionFile: saved?.sessionFile ?? importedFile,
        memory: memoryHooks(item, saveMemory),
        executionContext: () => item.goal.context(),
        shouldPause: () => !!item.goal.snapshot()?.pendingAction || item.goal.snapshot()?.phase === "paused",
        inactiveTools: item.goal.active ? [] : GOAL_TOOL_NAMES,
      });
    // 导入与库恢复的会话都没有完整消息快照（模型消息不再入库）：主代理历史从 Pi JSONL
    // 当前分支重建（撤回/压缩后的分支即真实历史），entryId 保留用于压缩折叠与撤回定位；
    // 子代理使用独立 JSONL，按 task ID 恢复到各自详情，不混入主上下文。
    const restoredFromJsonl = importedFile || (saved && !item.messages.length);
    if (restoredFromJsonl)
      item.messages = (item.agent.historyEntries?.() || []).map((entry) => ({ agentId: "main", message: entry.message, entryId: entry.id }));
    for (const job of item.tasks.jobs.values()) {
      if (!job.sessionFile || !existsSync(job.sessionFile)) continue;
      try {
        const taskManager = readSessionManager(job.sessionFile, item.cwd);
        const entries = taskManager.getBranch().filter(entry => entry.type === "message");
        job.runtime = { ...job.runtime, billing: sessionBilling(taskManager.getEntries()) };
        item.messages.push(...entries.map(entry => ({ agentId: job.id, entryId: entry.id, message: entry.message })));
      } catch (error) {
        job.status = "failed";
        job.error = `子任务历史读取失败：${error.message}`;
      }
    }
    // 仅独立 JSONL 重建（子历史堆在末尾）才按委派锚点归位；旧快照自带完整 messages
    // 的顺序就是真实交错历史，重排会改写 messageCount 等下标语义。
    if (restoredFromJsonl) item.messages = projectTimeline(item.messages);
    // Upgrade legacy web history IDs and recover compaction commits saved in Pi JSONL
    // before a crash could persist the web snapshot. Match in order, never by timestamp alone.
    const history = item.agent.historyEntries?.() || [];
    let historyIndex = 0;
    const historyIds = new Map(history.map((entry, index) => [entry.id, index]));
    // 已有关联 ID 直接定位；旧无 ID 记录仅序列化一次并按原顺序匹配。
    const legacyMatches = new Map();
    if (item.messages.some((record) => record.agentId === "main" && !record.entryId)) {
      history.forEach((entry, index) => {
        const key = JSON.stringify(entry.message);
        if (!legacyMatches.has(key)) legacyMatches.set(key, { indices: [], cursor: 0 });
        legacyMatches.get(key).indices.push(index);
      });
    }
    for (const record of item.messages) {
      if (record.agentId !== "main") continue;
      let index = historyIds.get(record.entryId);
      if (!record.entryId) {
        const match = legacyMatches.get(JSON.stringify(record.message));
        if (match) {
          while (match.indices[match.cursor] < historyIndex) match.cursor++;
          index = match.indices[match.cursor];
        }
      }
      if (index !== undefined && index >= historyIndex) {
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
    const consumedAt = new Map(history
      .filter((entry) => Number.isFinite(Date.parse(entry.timestamp)))
      .map((entry) => [entry.id, Date.parse(entry.timestamp)]));
    // 一次按代理建立时间线/锚点，随后二分；不能每条重试重新扫描、复制全部消息。
    const timelines = new Map();
    if (item.retries.length) item.messages.forEach((entry, index) => {
      const agent = entry.agentId;
      if (!timelines.has(agent)) timelines.set(agent, { rows: [], anchors: [], valid: true, assistant: false, queued: false });
      const line = timelines.get(agent), message = entry.message;
      const ts = agent === "main" && consumedAt.size ? consumedAt.get(entry.entryId) : message?.timestamp;
      line.valid &&= Number.isFinite(ts) && (!line.rows.length || ts >= line.rows.at(-1).ts);
      line.queued ||= message?.role === "user" && line.assistant;
      line.assistant ||= message?.role === "assistant";
      line.rows.push({ index, ts });
      if (entry.entryId) line.anchors.push({ index, entryId: entry.entryId });
    });
    const after = (rows, field, value) => {
      let low = 0, high = rows.length;
      while (low < high) {
        const middle = Math.floor((low + high) / 2);
        if (rows[middle][field] <= value) low = middle + 1;
        else high = middle;
      }
      return low;
    };
    for (const retry of item.retries) {
      const agent = retry.agentId || "main", line = timelines.get(agent);
      if (!(Number.isInteger(retry.messageCount) && retry.messageCount >= 0 && retry.messageCount <= item.messages.length)) {
        delete retry.messageCount;
        const first = retry.history?.[0];
        if (line?.valid && (agent === "main" && consumedAt.size || !line.queued) &&
            Number.isFinite(first?.nextRetryAt) && Number.isFinite(first?.delayMs) && first.delayMs >= 0) {
          const startedAt = first.nextRetryAt - first.delayMs;
          const next = after(line.rows, "ts", startedAt);
          // 同毫秒仍视为歧义，不因优化而猜边界。
          if (line.rows[next - 1]?.ts !== startedAt)
            retry.messageCount = line.rows[next]?.index ?? line.rows.at(-1).index + 1;
        }
      }
      if (Number.isInteger(retry.messageCount) && retry.messageCount >= 0 && retry.messageCount <= item.messages.length) {
        const anchors = line?.anchors ?? [];
        const anchor = anchors[after(anchors, "index", retry.messageCount - 1) - 1];
        if (anchor) retry.anchorEntryId = anchor.entryId;
        else delete retry.anchorEntryId;
      } else {
        delete retry.messageCount;
        delete retry.anchorEntryId;
      }
    }
    const compactionById = new Map();
    for (const entry of item.compactions)
      if (!compactionById.has(entry.id)) compactionById.set(entry.id, entry);
    for (const record of item.agent.compactions?.() || []) {
      const saved = compactionById.get(record.id);
      if (saved) Object.assign(saved, record);
      else { item.compactions.push(record); compactionById.set(record.id, record); }
    }
    item.unsubscribe = item.agent.subscribe((event) =>
      item.emit({ ...event, agentId: "main", runId: item.runId }),
    );
      if (this.store && !this.store.hasSession(id) && item.messages.some(record => record.message?.role === "user")) {
        this.store.insertSession({ ...this.sessionData(item), compactions: item.compactions,
          retries: item.retries, tasks: item.tasks.snapshot() });
      } else if (this.store?.hasSession(id)) {
        // 恢复时的中断状态与 JSONL 对账只写一次，不进入日常保存热路径。
        // 整段一次 persist（数组增量走同一 SAVEPOINT）：逐条独立成事务时，中途失败会留下
        // 半截归一化结果（任务已改写、事件没写）；同时把写放大从 1+N 次事务压到 1 次。
        await this.persist(item, [
          { session: this.sessionData(item) },
          ...item.tasks.snapshot().map((task) => ({ task })),
          ...item.retries.map((record) => ({ event: { type: "retry", record } })),
          ...item.compactions.map((record) => ({ event: { type: "compaction", record } })),
        ]);
      }
    } catch (error) {
      try { item.unsubscribe?.(); await item.agent?.dispose(); }
      finally { if (importedFile) await rm(importedFile, { force: true }); }
      throw error;
    }
    this.items.set(id, item);
    for (const job of item.tasks.jobs.values())
      if (job.status === "starting" && !this.goalNotificationsBlocked(item) && (job.sessionFile || job.persistenceVersion === 1)) job.done = item.tasks.run(job, true);
    this.scheduleTaskNotifications(item);
    return id;
  }

  async goalAction(id, action, text) {
    const item = await this.ensureLoaded(id);
    if (item.closing || item.configuring || item.cancelling) throw new Error("会话正在切换状态");
    // 退出目标模式：只允许在没有在飞工作时发生（UI 需先暂停并等安全点落定）。
    // 清掉目标记录回到普通会话，历史与产物原样保留；goal_* 工具停用，通知冻结到用户下次显式输入。
    if (action === "exit") {
      if (item.status !== "idle" || hasRunningTasks(item)) throw new Error("Goal 仍在执行：请先暂停并在安全点落定后再退出");
      // 先按「已通知」落盘未投递的结果（notified 是唯一持久化的待通知信号）：
      // 否则重启时 listPendingSessionIds 会把已退出的会话重新拉起并自动唤醒。
      // 只消费通知不删结果：任务记录、resultId 与正文照旧保留，用户仍可查看或 read_result。
      // 顺序先于删目标：中途崩溃时目标还在（暂停态），不会出现无目标 + 未通知的自动唤醒窗口。
      for (const job of item.tasks.jobs.values()) {
        if (!job.resultId || job.notified) continue;
        // 先落库再改内存：反了的话落库失败会留下「内存已通知、库里还是 0」，
        // 本进程不再补发而重启又通知一遍。
        await this.persist(item, { task: { id: job.id, notified: true } });
        job.notified = true;
      }
      item.goal.exit();
      item.agent.disableTools?.(GOAL_TOOL_NAMES);
      item.goalExited = true;
      item.notificationsPaused = true;
      return { goal: null, runId: item.runId };
    }
    if (["enter", "confirm", "resume"].includes(action) && (item.status !== "idle" || hasRunningTasks(item))) throw new Error("请等待当前执行与子任务安全收尾");
    item.goalExited = false;
    item.goal.action(action, text);
    item.agent.enableTools?.(GOAL_TOOL_NAMES);
    item.notificationsPaused = this.goalNotificationsBlocked(item) || false;
    if (action === "enter" && !item.goal.snapshot().objective) return { goal: item.goal.snapshot(), runId: item.runId };
    if (["enter", "confirm", "resume"].includes(action)) {
      item.goalSegments = 0;
      for (const job of item.tasks.jobs.values())
        if (job.status === "starting" && !job.done) job.done = item.tasks.run(job, true);
      this.startRun(item, () => item.agent.prompt(action === "enter"
        ? "[Axiom Goal] 根据现有对话澄清目标并提交分轮计划，等待用户确认。"
        : "[Axiom Goal] 按已确认目标继续。先核对实际产物和已保存进度，不盲目重放操作。"));
    } else if (item.goal.snapshot()?.phase === "clarifying" && item.status === "idle") {
      this.startRun(item, () => item.agent.prompt("[Axiom Goal 调整] 根据用户调整重新规划。先核对已保存产物，保留历史，提交计划等待确认。"));
    } else {
      item.agent.requestPause?.();
      this.scheduleGoal(item);
    }
    return { goal: item.goal.snapshot(), runId: item.runId };
  }

  scheduleGoal(item) {
    if (!item.goal?.active || item.goalScheduled || item.closing) return;
    item.goalScheduled = true;
    setImmediate(() => {
      item.goalScheduled = false;
      void this.advanceGoal(item).catch((error) => {
        item.goal.fail(`Goal 调度失败：${error.message}`);
        item.emit({ type: "error", data: { message: error.message } });
      });
    });
  }

  async advanceGoal(item) {
    if (item.closing || item.cancelling || item.configuring || item.status !== "idle" || item.notifying) return;
    if (hasRunningTasks(item)) return;
    let goal = item.goal.snapshot();
    if (!goal) return;
    if (goal.pendingAction || goal.phase === "paused") {
      item.goal.pauseAtSafePoint({ tasks: item.tasks.snapshot(), summary: item.goalResult?.text || "执行已到安全点；工具结果与子任务进度保留在会话历史。" });
      item.goalResult = null;
      item.notificationsPaused = true;
      if (item.goal.snapshot()?.phase === "clarifying")
        this.startRun(item, () => item.agent.prompt("[Axiom Goal 调整] 现有工作已安全保存。按用户调整重新规划，核对产物，保留历史，提交计划等待确认。"));
      return;
    }
    if (!["running", "verifying"].includes(goal.phase)) return;
    if ([...item.tasks.jobs.values()].some((job) => job.resultId && !job.notified)) {
      this.scheduleTaskNotifications(item);
      return;
    }
    const previousRound = goal.currentRound;
    if (item.goalResult) {
      const reply = item.goalResult;
      item.goalResult = null;
      const last = item.messages.findLastIndex((entry) => entry.agentId === "main" && entry.message?.role === "assistant");
      item.goal.onReply({ message: { role: "assistant", stopReason: "stop", content: [{ type: "text", text: reply.text }] }, index: last >= 0 ? last : item.messages.length });
    }
    goal = item.goal.snapshot();
    if (!["running", "verifying"].includes(goal.phase)) return;
    if ((item.goalSegments = (item.goalSegments || 0) + 1) > 64) {
      item.goal.fail("已达到本次自动执行的 64 段预算，进度已保存；请检查结果后手动恢复。");
      return;
    }
    const queue = item.agent.queue?.();
    if (goal.currentRound !== previousRound && item.agent.checkpoint && !queue?.steering?.length && !queue?.followUp?.length)
      await item.agent.checkpoint(item.goal.context());
    if (item.closing || item.status !== "idle" || this.goalNotificationsBlocked(item)) return;
    this.startRun(item, () => item.agent.prompt("[Axiom Goal 自动续跑] 核对最新目标与本轮进度。未完成请继续修正；已完成请提交验收依据并在最终回复独立一行给出完成标记。"));
  }

  goalNotificationsBlocked(item) {
    // 退出目标模式后冻结自动唤醒：排队中的子任务通知与续跑不得自行重启，直到用户显式输入。
    if (item.goalExited) return true;
    const phase = item.goal?.snapshot()?.phase;
    return phase && !["running", "verifying"].includes(phase);
  }

  scheduleTaskNotifications(item) {
    // 通知双通道：running 时经 SDK custom message（task-notification）在轮次边界注入，不打断工具、
    // 不等待运行结束；idle 时经 prompt 直接唤醒，走完整 startRun 状态机。见 deliverTaskNotifications。
    if (item.notificationScheduled || item.closing || item.notificationsPaused || this.goalNotificationsBlocked(item)) return;
    item.notificationScheduled = true;
    setImmediate(() => {
      item.notificationScheduled = false;
      if (item.notifying) return;
      item.notificationWork = this.deliverTaskNotifications(item).catch((error) =>
        item.emit({ type: "error", data: { message: `子任务通知失败：${error.message}` } }));
    });
  }

  async deliverTaskNotifications(item) {
    if (item.notifying || item.closing || item.notificationsPaused || this.goalNotificationsBlocked(item) || item.configuring) return;
    const jobs = [...item.tasks.jobs.values()].filter((job) => job.resultId && !job.notified)
      .map(({ id, resultId, status }) => ({ id, resultId, status }));
    if (!jobs.length) return;
    const text = "[Axiom 子任务完成通知] 以下任务已结束。使用各自的 taskId 和 resultId 调用 read_result 获取结果；不要轮询。\n" +
      JSON.stringify(jobs.map((job) => ({ taskId: job.id, resultId: job.resultId, status: job.status })));
    if (item.status !== "idle") {
      // running：结果先落盘，再以 custom message 注入 steering 队列——SDK 在轮次边界（安全点）送达，
      // 当前 run 自动延长至通知消化完，状态机无需变更。不置 notified：送达确认由 settleTaskNotifications
      // 在 run 收尾按消息历史判定；被 clear_queue 误清或滞留队列时经本调度补投（文本幂等）。
      item.notifying = true;
      try {
        await this.persist(item, {});
        if (item.closing || item.notificationsPaused || this.goalNotificationsBlocked(item) || item.configuring) return;
        await item.agent.notifyTask(text);
      } finally {
        item.notifying = false;
      }
      return;
    }
    item.notifying = true;
    try {
      // 结果先落盘再触达；idle 通道直接唤醒，走完整 startRun 状态机。
      await this.persist(item, {});
      if (item.closing || item.notificationsPaused || this.goalNotificationsBlocked(item) || item.configuring || item.status !== "idle") return;
      await this.prompt(item.id, text);
      await item.work;
      if (item.notificationsPaused || item.closing) return;
      for (const job of jobs) {
        const current = item.tasks.jobs.get(job.id);
        if (current?.resultId !== job.resultId) continue;
        await this.persist(item, { task: { id: job.id, notified: true } });
        if (current.resultId === job.resultId) current.notified = true;
      }
    } finally {
      item.notifying = false;
    }
    this.scheduleTaskNotifications(item);
    this.scheduleGoal(item);
  }

  // running 通道注入的通知送达确认：消息已进历史（被模型消费、已落盘）才置 notified。不在历史
  // （被 clear_queue 误清或尚滞留队列）一律保持未通知，交 scheduleTaskNotifications 补投：通知文本
  // 幂等，read_result 靠 resultId 校验，重复投递无害。只在 run 收尾（status 回到 idle 后）调用。
  async settleTaskNotifications(item) {
    if (item.closing || item.notificationsPaused || this.goalNotificationsBlocked(item)) return;
    const jobs = [...item.tasks.jobs.values()].filter((job) => job.resultId && !job.notified);
    if (!jobs.length) return;
    for (const job of jobs) {
      const delivered = item.messages.some((record) => {
        if (record.agentId !== "main" || record.message?.role !== "custom" || record.message?.customType !== "task-notification") return false;
        // 运行中为字符串，恢复后的历史条目可能是块数组；两种形态都取文本判任务 id。
        const content = record.message?.content;
        const text = typeof content === "string" ? content
          : Array.isArray(content) ? content.filter((b) => b?.type === "text").map((b) => b.text).join("\n") : "";
        return text.includes(`"${job.id}"`);
      });
      if (!delivered) continue;
      await this.persist(item, { task: { id: job.id, notified: true } }).catch((error) =>
        item.emit({ type: "error", data: { message: `通知确认落盘失败：${error.message}` } }));
      const current = item.tasks.jobs.get(job.id);
      if (current?.resultId === job.resultId) current.notified = true;
    }
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

  // 旧补全接口：保留 {path, entries} 形状，共享统一浏览实现（query 非空时递归全工作空间搜索，不分页）。
  async browse(id, path = "", query = "") {
    const { path: current, entries } = await this.listFiles({ sessionId: id, path, pageSize: Infinity, query });
    return { path: current, entries };
  }

  // 统一文件浏览：带 sessionId 限定工作空间并返回相对路径，否则浏览主机绝对目录。
  async listFiles({ sessionId, path = "", directoriesOnly = false, offset = 0, query = "", pageSize = BROWSE_PAGE } = {}) {
    const needle = query.trim().toLocaleLowerCase();
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
        if (session && IGNORED_ENTRIES.has(entry.name)) continue;
        if (directoriesOnly && !entry.isDirectory()) continue;
        entries.push({ name: entry.name, directory: entry.isDirectory(), path: join(base, entry.name).split(sep).join("/") });
      }
      // ponytail: 单层排序仍占 O(n) 内存；超大目录成为瓶颈时改用流式目录游标。
      entries.sort((a, b) => Number(b.directory) - Number(a.directory) || a.name.localeCompare(b.name));
      return {
        entries: entries.slice(offset, offset + pageSize),
        nextOffset: offset + pageSize < entries.length ? offset + pageSize : null,
      };
    };
    // 搜索一次返回全工作空间命中（已按质量排序），不再分页。
    const entriesFor = async (target, session, base) => needle
      ? { entries: await searchEntries(target, base, { needle, directoriesOnly, limit: Math.min(pageSize, SEARCH_LIMIT) }), nextOffset: null }
      : await readEntries(target, session, base);
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
        ...(await entriesFor(target, true, rel)),
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
      ...(await entriesFor(target, false, target)),
      breadcrumbs: absoluteCrumbs(slashPath),
      locations: await hostLocations(),
    };
  }

  // 运行中刷新会话可见技能（composer 下拉数据源）；旧 factory 无此能力时降级为当前列表。
  async refreshSkills(id) {
    const item = await this.ensureLoaded(id);
    if (!item.agent.refreshSkills) return item.agent.config?.()?.skills ?? [];
    return item.agent.refreshSkills();
  }

  // 一次全量下发历史（不分页）：被压缩摘要折叠掉的消息除外，那段由前端点开摘要卡时按需取。
  // 未加载时按数据库元数据 + JSONL 构建只读投影：浏览历史不得持久化恢复状态或启动任务
  //（Goal 恢复仅在内存投影）。
  configData(item) {
    return {
      canReconfigure: this.canReconfigure(item), queueType: item.queueType,
      ...item.agent.config?.(), subagentModel: item.subagentModel,
      subagentThinking: item.subagentThinking,
      subagentResolvedCapabilities: item.subagentResolvedCapabilities,
      capabilitySelection: item.capabilities, subagentCapabilities: item.subagentCapabilities,
      runtime: item.agent.runtime?.(),
    };
  }

  snapshot(id, options = {}) {
    const item = this.get(id);
    if (!item.loaded) {
      const saved = item.draft ?? this.store.getSession(id);
      let messages = [];
      const tasks = structuredClone(saved.tasks ?? []);
      const manager = saved.sessionFile ? readSessionManager(saved.sessionFile, saved.cwd) : null;
      const branch = manager?.getBranch() ?? [];
      messages.push(...branch.filter(entry => entry.type === "message").map(entry => ({ agentId: "main", entryId: entry.id, message: entry.message })));
      const selection = saved.selection ?? {};
      const model = (this.createAgent?.modelCatalog?.() ?? this.createAgent?.catalog?.() ?? []).find(model => model.key === selection.model) ?? {};
      const restoredRuntime = {
        model: selection.model, thinking: selection.thinking,
        ...usageRuntime(manager?.buildSessionContext().messages ?? [], model),
        // 压缩后的实际上下文可能还没有 assistant，但最近请求用量仍可从分支恢复。
        usage: branch.findLast(entry => entry.type === "message" && entry.message?.role === "assistant" && entry.message.usage)?.message.usage ?? null,
        billing: sessionBilling(manager?.getEntries() ?? []),
      };
      for (const task of tasks) {
        if (!task.sessionFile) continue;
        try {
          const taskManager = readSessionManager(task.sessionFile, saved.cwd);
          task.runtime = { ...task.runtime, billing: sessionBilling(taskManager.getEntries()) };
          messages.push(...taskManager.getBranch().filter(entry => entry.type === "message").map(entry => ({ agentId: task.id, entryId: entry.id, message: entry.message })));
        } catch (error) { task.error = `子任务历史读取失败：${error.message}`; }
      }
      messages = projectTimeline(messages);
      const compactions = saved.compactions ?? [];
      const fold = foldCompacted(messages, compactions);
      const visibleIds = fold.visibleIds;
      const goal = new Goal({ sessionId: id, store: {
        load: () => structuredClone(this.goalStore.load(id)), save: () => {},
      } });
      return structuredClone({ sessionId: id, cwd: item.cwd, title: item.title, seq: item.seq ?? 0,
        instanceId: options.epoch ?? null, liveMessageIds: {},
        status: "idle", safeStop: false, runtime: restoredRuntime, billing: combinedBilling(restoredRuntime.billing, tasks), config: { ...saved.selection, capabilitySelection: selection.capabilities ?? null,
          subagentCapabilities: selection.subagentCapabilities ?? null, queueType: selection.queueType || "steer",
          canReconfigure: !saved.sessionFile && !messages.length && !tasks.length
          && !compactions.length && !saved.retries?.length && saved.selection?.executionStarted !== true && !goal.active },
        messages: fold.records.map(toWireRecord),
        messageIndexes: fold.indexes, messageCount: messages.length,
        compactions, retries: historyRetries(saved.retries ?? [], visibleIds, fold.keptBefore, messages.length),
        live: {}, tools: {},
        questions: [], tasks, goal: goal.snapshot(), canReask: false, compactionStatus: null });
    }
    // 读时投影：live 数组保持到达序（撤回/重试/压缩等内部逻辑依赖它），下发按锚点顺序。
    const projected = projectTimeline(item.messages);
    const fold = foldCompacted(projected, item.compactions);
    const visibleIds = fold.visibleIds;
    const state = {
      // 会话身份：前端按 sessionId 路由消息与持久化键，必须带出。
      sessionId: id,
      cwd: item.cwd,
      title: item.title,
      seq: item.seq,
      instanceId: options.epoch ?? null,
      status: item.status,
      // 刷新/重连后也要能看到「等待安全点」提示，所以跟快照一起下发。
      safeStop: item.status !== "idle" && !!item.safeStopping,
      runtime: item.agent.runtime?.(),
      billing: combinedBilling(item.agent.runtime?.()?.billing, [...item.tasks.jobs.values()]),
      queue: item.agent.queue?.(),
      config: this.configData(item),
      runId: item.runId,
      messages: fold.records.map(toWireRecord),
      // 折叠前的下标与总数：前端按历史下标登记目标轮次锚点，压缩折叠不能让计数漂移。
      messageIndexes: fold.indexes,
      messageCount: projected.length,
      compactions: item.compactions,
      compactionStatus: item.agent.compactionStatus?.() ?? null,
      retries: historyRetries(translateRetries(item.retries, item.messages, projected), visibleIds, fold.keptBefore, projected.length),
      live: item.live,
      tools: relevantTools(item, fold.records),
      questions: item.questions.snapshot(),
      canReask: item.status === 'idle' && !!item.agent.canReask?.(),
      // 任务卡按 delegate 锚点渲染，折叠段里的委派入口也要能落到摘要卡内，所以任务不做裁剪。
      tasks: item.tasks.snapshot(),
      goal: item.goal?.snapshot() ?? null,
      // 活动流的身份：前端要按 agent.message.end 带的 messageId 把半成品原文接到正确槽位。
      liveMessageIds: Object.fromEntries(item.liveIds),
    };
    return structuredClone(state);
  }

  // 压缩卡按需展开：取某条摘要折叠掉的原始消息（含挂在其后的子代理记录）与这些消息引用的工具记录。
  // 未加载会话走 JSONL 只读投影，不创建 SDK 实例。
  async compactionMessages(id, compactionId) {
    const item = this.get(id);
    let records;
    let compactions;
    let tools;
    let retryRecords;
    if (item.loaded) {
      records = projectTimeline(item.messages);
      compactions = item.compactions;
      tools = item.tools;
      retryRecords = translateRetries(item.retries, item.messages, records);
    } else {
      const saved = this.store.getSession(id);
      const raw = [];
      if (saved.sessionFile)
        raw.push(...readSessionManager(saved.sessionFile, saved.cwd).getBranch()
          .filter(entry => entry.type === "message").map(entry => ({ agentId: "main", entryId: entry.id, message: entry.message })));
      for (const task of saved.tasks ?? []) {
        if (!task.sessionFile) continue;
        try {
          raw.push(...readSessionManager(task.sessionFile, saved.cwd).getBranch()
            .filter(entry => entry.type === "message").map(entry => ({ agentId: task.id, entryId: entry.id, message: entry.message })));
        } catch {}
      }
      records = projectTimeline(raw);
      compactions = saved.compactions ?? [];
      tools = {};
      retryRecords = saved.retries ?? [];
    }
    const record = compactions.find((entry) => entry.id === compactionId);
    if (!record) throw new Error("找不到该压缩摘要");
    const hidden = new Set(record.compactedMessageIds ?? []);
    const picked = [];
    let inside = false;
    for (const entry of records) {
      if ((entry.agentId ?? "main") === "main") inside = !!entry.entryId && hidden.has(entry.entryId);
      if (inside) picked.push(entry);
    }
    // 锚点落在这段里的重试卡也随展开补发：快照已经把它们滤掉了（锚点不可见），
    // 否则展开摘要后只剩消息、原地的重试记录凭空消失。
    const pickedIds = new Set(picked.map((entry) => entry.entryId).filter(Boolean));
    const retries = (retryRecords ?? []).filter((entry) => entry.anchorEntryId && pickedIds.has(entry.anchorEntryId))
      .map((entry) => { const copy = { ...entry }; delete copy.messageCount; return copy; });
    return structuredClone({ sessionId: id, compactionId,
      messages: picked.map(toWireRecord),
      // 只带子代理工具：折叠段的主消息不重绘（摘要卡就是它们的形态），主工具没有落位处。
      tools: ownedTools(tools, picked.filter((entry) => (entry.agentId ?? "main") !== "main")),
      retries });
  }
  subscribe(id, listener) {
    // 允许在 ensureLoaded 之前订阅：元数据条目（load 建的 stub）已经在 items 里，事件一个不漏；
    // create() 替换条目时沿用同一个 listener 集合（见 create 的 listeners 初始化）。
    const item = this.get(id);
    item.listeners.add(listener);
    return () => item.listeners.delete(listener);
  }

  canReconfigure(item, afterConfigure = false) {
    return item.loaded && item.status === "idle" && !item.executionStarted && (afterConfigure || !item.configuring) && !item.closing
      && !item.messages.length && !item.compactions.length && !item.retries.length
      && !item.tasks.jobs.size && !item.goal.active && !landedSessionFile(item);
  }

  async configure(id, selection) {
    const item = await this.ensureLoaded(id);
    if (!["idle", "running"].includes(item.status) || item.configuring) throw new Error("Session is busy");
    if (["capabilities", "subagentCapabilities", "retry"].some((key) => Object.hasOwn(selection, key))) {
      if (!this.canReconfigure(item)) throw new Error("能力与重试配置仅可在首次发送消息前修改");
      item.configuring = true;
      const rebuild = (async () => {
        const saved = this.sessionData(item);
        await this.create(item.cwd, { ...saved.selection, ...selection, useDefaults: false }, saved);
        item.unsubscribe?.();
        try { await item.agent.dispose(); } catch (error) { console.warn("旧会话实例清理失败", error); }
        return this.snapshot(id).config;
      })();
      item.releasing = rebuild;
      try { return await rebuild; }
      finally { item.configuring = false; item.releasing = null; }
    }
    const { subagentModel = item.subagentModel, subagentThinking = item.subagentThinking, model, thinking } = selection;
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
        this.recentConfig.set(workspaceKeyOf(item.cwd), { model: config.model, thinking: config.thinking });
      item.subagentModel = subagentModel;
      item.subagentThinking = subagentThinking;
      item.queueType = selection.queueType || item.queueType;
      await this.persist(item);
      return {
        canReconfigure: this.canReconfigure(item, true),
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

  // 运行骨架（prompt 与手动重试共用）：runId/status 广播 → result() 取错 → 收尾持久化与 idle 复位。
  startRun(item, run) {
    item.executionStarted = true;
    // 通知在下一次运行开始时恢复：goal 被暂停/退出时仍要冻结，安全停止期间也暂停，防止通知把刚停下的会话又拉起来。
    item.notificationsPaused = this.goalNotificationsBlocked(item) || false;
    item.safeStopping = false;
    item.updatedAt = Date.now();
    item.runId = randomUUID();
    item.status = "running";
    item.emit({
      type: "session.state",
      data: { status: item.status, runId: item.runId },
    });
    item.work = (async () => {
      try {
        await this.persist(item);
        await run();
        const text = item.agent.result();
        if (item.goal.active) item.goalResult = { text, runId: item.runId };
      } catch (error) {
        if (item.goal.active) item.goal.fail(String(error.message ?? error));
        item.emit({
          type: "error",
          data: { message: String(error.message ?? error) },
        });
      } finally {
        item.titlePending = false;
        await this.persist(item).catch((error) => item.emit({ type: "error", data: { message: `会话保存失败：${error.message}` } }));
        if (item.status !== "cancelling") {
          item.status = "idle";
          // stopped 让前端区分「跑完了」和「被安全停止」：后者要留红点提醒回来接着看。
          const stopped = item.safeStopping ? "safe" : undefined;
          item.safeStopping = false;
          item.emit({
            type: "session.state",
            data: { status: "idle", runId: item.runId, canReask: !!item.agent.canReask?.(), stopped },
          });
          // running 通道注入的通知在此判据确认（消息进历史才置 notified），未确认的交给下面的调度补投。
          await this.settleTaskNotifications(item);
          this.scheduleTaskNotifications(item);
          this.scheduleGoal(item);
        }
      }
    })();
    return item.runId;
  }

  // 手动重试：不带新输入续跑上一次异常停止的请求（删掉末尾失败的 assistant 后 continue()）。
  // 可续判定在启动前同步做完：不可续时直接报错给回执，不留 running → idle 的空转。
  async retry(id) {
    const item = this.get(id).loaded ? this.get(id) : await this.ensureLoaded(id);
    if (item.status !== "idle" || item.configuring || item.closing) throw new Error("Session is busy");
    if (item.goal.active && this.goalNotificationsBlocked(item)) throw new Error("Goal 已暂停或等待确认，请使用 Goal 恢复按钮");
    if (item.agent.canReask?.()) return this.startRun(item, () => item.agent.reask());
    if (!item.agent.resumable()) throw new Error("没有可重试的请求：上一次运行已正常结束");
    return this.startRun(item, () => item.agent.resume());
  }

  async prompt(id, text, queueType, images) {
    if (!text.trim() && !images?.length) throw new Error("请求内容不能为空：请输入文本或附加图片");
    const item = this.get(id).loaded ? this.get(id) : await this.ensureLoaded(id);
    if (item.configuring || item.closing || item.releasing) throw new Error("Session is busy");
    if (/^\/goal(?:\s|$)/.test(text.trim())) {
      const result = await this.goalAction(id, "enter", text.trim().replace(/^\/goal\s*/, ""));
      return result.runId;
    }
    if (item.goal.active && ["paused", "pausing", "adjusting", "completed"].includes(item.goal.snapshot().phase))
      throw new Error("Goal 已停止或正在安全收尾，请使用专用恢复、调整或重启按钮");
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
    if (item.status !== "idle" || item.configuring || item.closing || item.releasing) throw new Error("Session is busy");
    // 用户显式输入：退出目标模式后的通知/续跑冻结到此为止，恢复正常会话行为。
    item.goalExited = false;
    const goal = item.goal.snapshot();
    if (goal?.phase === "clarifying" && !goal.objective && !goal.rounds.length) item.goal.supplyObjective(text);
    if (item.title === "新会话" && !item.titleManual) item.title = fallbackTitle(text);
    // 标题未定案（模型没自报过、也没手动命名）就持续索要：本轮靠 item.titlePending（context 钩子
    // 逐请求读 memory.wantsTitle），run 结束清零；titleRequested 只在自报成功后才固化为真。
    item.titlePending = !item.titleRequested && !item.titleManual;
    return this.startRun(item, () => item.agent.prompt(text, images?.length ? { images } : undefined));
  }

  // 撤回：recall 时把这一轮已进入上下文的输入退回输入框（先停稳、无模型输出才允许）；
  // 队列撤回放在 recall 之后，recall 被拒绝时队列原样保留，不会丢消息。
  async withdraw(id, recall = false) {
    const item = await this.ensureLoaded(id);
    if (!recall) return item.agent.withdraw();
    if (item.status !== "idle" || item.cancelling) await this.cancel(id);
    const recalled = await item.agent.recall();
    // 历史真被截断时通知所有客户端重取快照：撤回重写了历史，增量事件无法表达「消息消失」。
    let truncated = false;
    if (recalled) {
      const changes = [];
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
        const previousRetries = item.retries;
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
          changes.push({ event: { type: "retry", record: retry } });
        }
        changes.push({ deletedEvents: { type: "retry", records: previousRetries.filter((entry) => !item.retries.includes(entry)) } });
        truncated = true;
      }
      delete item.live.main;
      item.liveIds.delete("main");
      changes.push({ session: this.sessionData(item) });
      // SDK分支已经回退：写库失败也必须同步网页并交还输入。整组短事务，
      // 错误由既有error事件报告，失败增量留到下次保存/关闭重试。
      this.saveChange(item, changes);
    }
    if (truncated) item.emit({ type: "session.history.reset", data: { reason: "recall" } });
    return { ...item.agent.withdraw(), recalled };
  }

  replyQuestion(id, toolCallId, answers) {
    const item = this.get(id);
    if (!item.loaded || item.closing || item.cancelling) throw new Error("会话不可回答问题");
    return item.questions.reply(toolCallId, answers);
  }

  // 安全停止：不 abort、不杀工具，只请求 SDK 在下一个轮次边界收工，已完成的产出全部保留。
  // 子任务不受影响（继续跑到自己结束）；期间暂停子任务完成通知，否则通知会立刻 prompt 把会话重新拉起来。
  // goal 会话的“停”在 master 里已有专用路径（暂停并落定目标进度），复用同一入口，避免同一颗按钮两套语义。
  async safeStop(id) {
    const item = this.get(id);
    if (item.loading) {
      await item.loading.catch(() => {});
      return this.safeStop(id);
    }
    if (item.goal?.active && !item.closing) return this.goalAction(id, "pause");
    if (!item.loaded || item.cancelling || item.status === "idle") return;
    item.notificationsPaused = true;
    item.safeStopping = true;
    item.agent.requestSafeStop?.();
    // 状态仍是 running：不新增状态值，避免前端 busy 判定连带影响按钮与队列。
    item.emit({ type: "session.state", data: { status: item.status, runId: item.runId, safeStop: true } });
  }

  async cancel(id) {
    const item = this.get(id);
    if (item.loading) {
      await item.loading.catch(() => {});
      return this.cancel(id);
    }
    if (!item.loaded) return;
    if (item.goal?.active && !item.closing) return this.goalAction(id, "pause");
    if (item.cancelling) return item.cancelling;
    item.notificationsPaused = true;
    item.status = "cancelling";
    item.emit({ type: "session.state", data: { status: "cancelling" } });
    item.cancelling = (async () => {
      try {
        const abort = item.agent.abort();
        item.questions.cancel();
        await Promise.all([abort, item.tasks.cancel()]);
        await item.work;
      } finally {
        item.status = "idle";
        item.cancelling = undefined;
        item.emit({ type: "session.state", data: { status: "idle", canReask: !!item.agent.canReask?.() } });
      }
    })();
    return item.cancelling;
  }
  async retryTask(id, taskId) {
    const item = await this.ensureLoaded(id);
    if (item.closing || item.cancelling) throw new Error("会话正在停止，暂时无法重试子任务");
    if (item.goal.active && this.goalNotificationsBlocked(item)) throw new Error("请先恢复 Goal，再重试子任务");
    item.goalExited = false; // 显式重试子任务：退出 Goal 后的通知冻结到此解除
    item.notificationsPaused = false;
    return item.tasks.retry(taskId);
  }
  // 删会话的库侧清理：会话行与 goal 记录同一事务。goals 表没有指向 sessions 的外键
  // （createGoalStore 可脱离 SessionStore 单用），两步分开做时崩在中间就成了「会话还在、
  // 目标没了」——活着的目标比一条无害孤儿行金贵得多，必须同生共死。
  deleteRecords(id) {
    if (!this.store) {
      this.goalStore.remove(id);
      return;
    }
    this.store.change(() => {
      this.store.deleteSession(id); // 子表外键级联
      this.goalStore.remove(id);
    });
  }

  async releaseIdle(now = Date.now(), idleMs = 5 * 60_000) {
    if (!this.store) return;
    for (const item of this.items.values()) {
      const queue = item.agent?.queue?.();
      if (!item.loaded || item.loading || item.releasing || item.closing || item.cancelling || item.configuring ||
          item.status !== "idle" || item.notifying || item.goalScheduled || item.notificationScheduled ||
          hasRunningTasks(item) || item.questions.snapshot().length || item.pendingWrites?.length ||
          queue?.steering?.length || queue?.followUp?.length ||
          [...item.tasks.jobs.values()].some(task => !task.notified) ||
          item.goal?.active || now - Math.max(item.lastUsedAt ?? 0, item.updatedAt ?? 0) < idleMs) continue;
      item.releasing = (async () => {
        await this.persist(item);
        await item.agent.dispose();
        item.unsubscribe();
        const saved = this.store.getSession(item.id) ?? this.sessionData(item);
        this.items.set(item.id, { ...saved, ...(!this.store.hasSession(item.id) ? { draft: saved } : {}), loaded: false, status: "idle", runningSince: null,
          seq: item.seq, tasks: { jobs: new Map() }, listeners: item.listeners });
      })();
      try { await item.releasing; }
      finally { item.releasing = null; }
    }
  }

  async remove(id, deleting = true) {
    let item = this.get(id);
    if (item.releasing) { await item.releasing; item = this.get(id); }
    if (item.loading) {
      await item.loading.catch(() => {});
      item = this.get(id);
    }
    item.closing = true;
    if (!deleting) item.goal?.freeze();
    if (!item.loaded) {
      if (!deleting && item.pendingWrites?.length) await this.persist(item, {});
      if (deleting) {
        this.deleteRecords(id);
        const storageDir = this.storagePath && join(this.storagePath, createHash("sha256").update(process.platform === "win32" ? item.cwd.toLowerCase() : item.cwd).digest("hex"));
        if (storageDir) {
          if (item.sessionFile) await rm(item.sessionFile, { force: true });
          await rm(join(storageDir, `${id}-tasks`), { recursive: true, force: true });
          await rm(join(storageDir, `${id}-observations`), { recursive: true, force: true });
          await rm(join(storageDir, `${id}.json`), { force: true });
        }
      }
      item.listeners.clear();
      this.items.delete(id);
      return;
    }
    if (deleting) await this.cancel(id);
    else {
      item.notificationsPaused = true;
      const abort = item.agent.abort();
      item.questions.cancel();
      await Promise.all([abort, item.tasks.interrupt()]);
      await item.work;
    }
    await item.notificationWork;
    item.unsubscribe();
    await item.agent.dispose();
    await this.persist(item);
    if (deleting) {
      // 删除顺序：先删库记录再清理文件；若中途崩溃，标记过的旧 JSON 不会复活会话。
      this.deleteRecords(id);
      if (item.storageDir) {
        if (item.agent.sessionFile?.()) await rm(item.agent.sessionFile(), { force: true });
        await rm(join(item.storageDir, `${id}-tasks`), { recursive: true, force: true });
        await rm(join(item.storageDir, `${id}-observations`), { recursive: true, force: true });
        // 旧版磁盘快照兜底清理（已迁移标记的目录不会再被扫描）。
        await rm(join(item.storageDir, `${id}.json`), { force: true });
      }
    }
    item.listeners.clear();
    this.items.delete(id);
  }
  async close() {
    await Promise.all([...this.items.keys()].map((id) => this.remove(id, false)));
    // 只有本实例自建的库才由这里关闭；外部注入的库由注入方（main）统一管理。
    // 置 null 保证重复 close 幂等。
    if (this.ownsDatabase && this.database) {
      this.database.close();
      this.database = null;
    }
  }
}
