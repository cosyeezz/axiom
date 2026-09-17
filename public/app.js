import { initInspector, renderTools, renderBill, money } from "./session-details.js";
import { createTransport } from "./transport.js";
import { createSessionCache } from "./session-cache.js";
import { copyText } from "./clipboard.js";
import { renderMarkdown } from "./markdown.js";
import { stripMemoryTags } from "./memory-tags.js";
import { createStreamRenderer } from "./stream-renderer.js";
import { splitAnswer } from "./answer-tags.js";
import { stripGoalMarkers } from "./goal-markers.js";
import { createFilePicker, fileIcon } from "./file-picker.js";
import "./tooltip.js";
import { createModelPicker } from "./model-picker.js";
import { initModelManager } from "./model-manager.js";
import { initServiceSettings } from "./service-settings.js";
import { createQuestionUI } from "./question.js";
import { createGoalUI } from "./goal.js";
const questionUI = createQuestionUI({ root: document.getElementById("question-dock"), reply: (data) => request("question.reply", data), focusPrompt: () => document.getElementById("prompt").focus() });

const filePicker = createFilePicker(request);
const $ = (id) => document.getElementById(id);
initInspector($("session-inspector"));
const sessionDetail = $("session-detail");
function openSessionDetail(section) {
  $("session-inspector").open = section === "inspector";
  $("session-billing").open = section === "billing";
  sessionDetail.showModal();
  sessionDetail.querySelector(".task-body").scrollTop = 0;
}
$("session-inspector-trigger").onclick = () => openSessionDetail("inspector");
$("session-billing-trigger").onclick = () => openSessionDetail("billing");
$("session-detail-close").onclick = () => sessionDetail.close();
let sessionId,
  models = [],
  config,
  runtime,
  sessionBill,
  activeTask,
  busy = false,
  // safeStopping: 已请求安全停止、还在等轮次边界；stopAlert: 停住了但用户还没回来看。
  safeStopping = false,
  stopAlert = false,
  changing = false,
  connected = false,
  creation;
let sessionMissing = false;
let onboarding = false;
let allSessions = [],
  follow = true;
const views = createSessionCache();
const HISTORY_LIMIT = 60;
let historyState, historyRequest = 0, historyLoading = false, historyDirty = false;
let hiddenDirty = false, historyEvents = 0;
// 目标模式：只消费 snapshot.goal 与 goal 事件，消息仍由本文件渲染；
// 回执/事件里的 goal 由后端给出，前端对字段缺失完整容错。
// （去掉 import 行单独跑 app.js 的测试环境里没有该模块，降级为空实现。）
const goalUI = typeof createGoalUI === "function"
  ? createGoalUI({
      root: {
        track: $("goal-track"),
        dock: $("goal-dock"),
        enter: $("goal-enter"),
        plan: $("goal-plan"),
        output: $("output"),
      },
      request,
      onError: error,
      readPrompt: () => $("prompt").value,
      clearPrompt: (text) => clearGoalPrompt(text),
      focusPrompt: () => $("prompt").focus(),
    })
  : { show() {}, setConnected() {}, anchors() {} };
const compactionDefaults = { enabled: true, tokenThreshold: 100000, percentThreshold: 50, model: null, thinking: "off", keepRecentTokens: 5000 };
// 子代理轮次预算默认值，与 src/task-budget.js 的 taskBudgetDefaults 保持一致。
const taskBudgetDefaults = { maxTurns: 20, wrapUpWindow: 2 };
const thinkingLevels = ["off", "minimal", "low", "medium", "high", "xhigh", "max"];
let modelFavorites = { provider: [], model: [], thinking: [] };
// 思考收藏键带模型上下文，符合后端 provider/model:level 契约（model id 含冒号时后端按最后一个冒号切分）；
// 无模型上下文（“默认主代理模型”“跟随主代理”等空值）返回空串，菜单不提供星标。
function favoriteKey(kind, value, select) {
  if (kind !== "thinking") return value;
  const model = select.closest(".selectors")?.querySelector('select[data-model-kind="model"]')?.value;
  return model ? `${model}:${value}` : "";
}
const modelPicker = createModelPicker({
  getFavorites: () => modelFavorites,
  favKey: favoriteKey,
  onToggle: async (kind, key, favorite) => {
    modelFavorites = await request("models.favorites.set", { kind, key, favorite });
    modelPicker.syncAll();
  },
  onError: error,
});
for (const id of ["provider", "model", "thinking", "subagent-provider", "subagent-model"]) {
  const kind = id.split("-").at(-1);
  $(id).dataset.modelKind = kind;
  modelPicker.enhance($(id), kind);
}
const modelManager = initModelManager({ root: $("models-panel"), request, onSaved: refreshModelCatalog });
const serviceUi = initServiceSettings({ request, isReady: () => connected });
let compactions = [], mainItems = [];
// 消息锚点：键既可以是 state.messages 的下标，也可以是 entryId（startMessage/endMessage 两种语义都可用）。
let goalAnchors = new Map(), goalAnchorCount = 0;
function anchorGoal(key, item, entryId) {
  if (!item?.node) return;
  goalAnchors.set(key, item.node);
  if (entryId) goalAnchors.set(entryId, item.node);
}
// 「调整本轮」用输入框内容当纠正说明；只有内容未被改动时才清空，避免吃掉用户新输入。
function clearGoalPrompt(text) {
  if ($("prompt").value !== text) return;
  $("prompt").value = "";
  const view = views.get(sessionId);
  if (view?.draft === text) view.draft = "";
  resizePrompt();
  region("输入操作", updateComposer);
}
// 手动重试靠主代理末尾消息判定：与服务端 canResume 同一条规则，避免两边判断不一致。
let lastMainMessage = null, interrupted = false, canReask = false;
const compactionNodes = new Map(), taskEntries = new Map();
let images = [], imageLoading = false;
let completionVersion = 0, completionToken, completionEntries = [], completionIndex = 0;
let selectedSkill = "", contextFiles = [], pickingWorkspace = false, currentCwd = "";
try {
  sessionId = new URLSearchParams(location.hash.slice(1)).get("session") || sessionStorage.getItem("axiom.session") || localStorage.getItem("axiom.session") || undefined;
} catch {}
let hiddenSessions = new Set();
try {
  const saved = JSON.parse(localStorage.getItem("axiom.hiddenSessions") || "[]");
  if (Array.isArray(saved)) hiddenSessions = new Set(saved.filter((id) => typeof id === "string"));
} catch {}
// 置顶会话：本地偏好，只影响侧栏排序与高亮，不动服务端数据。
let pinnedSessions = new Set();
try {
  const saved = JSON.parse(localStorage.getItem("axiom.pinnedSessions") || "[]");
  if (Array.isArray(saved)) pinnedSessions = new Set(saved.filter((id) => typeof id === "string"));
} catch {}
// 工作区展开状态：normalized cwd 的展开集合（默认当前展开、其他折叠）
let openCwds = new Set();
try {
  const saved = JSON.parse(localStorage.getItem("axiom.openCwds") || "[]");
  if (Array.isArray(saved)) openCwds = new Set(saved);
} catch {}
// 侧栏分组折叠状态：normalized cwd → { pinned/active/completed: boolean }。
// 置顶与进行中默认展开，已完成默认折叠；和 workspace-group 一样按工作区各自记住。
let sessionGroupPrefs = (() => {
  try {
    const saved = JSON.parse(localStorage.getItem("axiom.sessionGroups") || "{}");
    return saved && typeof saved === "object" && !Array.isArray(saved) ? saved : {};
  } catch { return {}; }
})();
function saveSessionGroupPrefs() {
  try { localStorage.setItem("axiom.sessionGroups", JSON.stringify(sessionGroupPrefs)); } catch {}
}
// 已读时间戳：AI 跑完、用户还没打开过的会话在侧栏标主题色点。没有记录的一律视为已读，
// 否则首次加载会把全部历史会话标成未读。
let seenSessions = {};
try {
  const saved = JSON.parse(localStorage.getItem("axiom.sessionSeen") || "{}");
  if (saved && typeof saved === "object") seenSessions = saved;
} catch {}
function markSessionSeen(id) {
  if (!id) return;
  seenSessions[id] = Date.now();
  try {
    localStorage.setItem("axiom.sessionSeen", JSON.stringify(seenSessions));
  } catch {}
}
function readSessionPreference(key) {
  const saved = JSON.parse(localStorage.getItem(key) || "[]");
  return Array.isArray(saved) ? saved.filter((id) => typeof id === "string") : [];
}
async function changeSessionPreference(key, change) {
  const save = () => {
    const next = change(readSessionPreference(key));
    localStorage.setItem(key, JSON.stringify(next));
    if (key === "axiom.hiddenSessions") hiddenSessions = new Set(next);
    if (key === "axiom.pinnedSessions") pinnedSessions = new Set(next);
    renderSessions();
  };
  try {
    // 同源标签页串行读改写，避免同时操作不同会话时覆盖彼此。
    if (navigator.locks) await navigator.locks.request(key, save);
    // ponytail: 旧浏览器无 Web Locks 时尽力合并；现代浏览器使用上面的跨页锁。
    else save();
  } catch { error("无法保存会话列表设置，请重试"); }
}
function setSessionHidden(id, hidden) {
  if (!allSessions.some((s) => s.id === id)) return;
  return changeSessionPreference("axiom.hiddenSessions", (saved) => {
    const next = new Set(saved);
    hidden ? next.add(id) : next.delete(id);
    return [...next];
  }).then(() => focusSessionMore(id));
}
function setSessionPinned(id, pinned) {
  if (!allSessions.some((s) => s.id === id)) return;
  return changeSessionPreference("axiom.pinnedSessions", (saved) => {
    const next = new Set(saved);
    pinned ? next.add(id) : next.delete(id);
    return [...next];
  }).then(() => focusSessionMore(id));
}
function focusSessionMore(id) {
  return [...document.querySelectorAll(".session-row")].find((row) => row.dataset.sessionId === id)?.querySelector(".session-more").focus();
}
window.addEventListener("storage", (event) => {
  if (event.key !== null && !["axiom.hiddenSessions", "axiom.pinnedSessions", "axiom.sessionSeen"].includes(event.key)) return;
  try {
    hiddenSessions = new Set(readSessionPreference("axiom.hiddenSessions"));
    pinnedSessions = new Set(readSessionPreference("axiom.pinnedSessions"));
    const saved = JSON.parse(localStorage.getItem("axiom.sessionSeen") || "{}");
    seenSessions = saved && typeof saved === "object" ? saved : {};
    renderSessions();
  } catch { error("会话列表设置同步失败"); }
});
function saveView() {
  if (!sessionId) return;
  // 快照同步中保留原阅读位置，草稿仍保存。
  const previous = views.get(sessionId)?.scroll;
  const anchor = !follow && rawEntries.find(entry => entry.item?.node?.getBoundingClientRect().bottom > transcript.getBoundingClientRect().top);
  views.set(sessionId, {
    draft: $("prompt").value,
    contextFiles: [...contextFiles],
    images: [...images],
    selectedSkill,
    scroll: transport.getSnapshotQueue() ? (previous ?? 0) : $("transcript").scrollTop,
    follow,
    anchor: anchor?.messageId,
    anchorOffset: anchor ? anchor.item.node.getBoundingClientRect().top - transcript.getBoundingClientRect().top : 0,
  });
}
// 高度只在「内容」或「可用宽度」变化时重算，缓存键全部由不触发布局的信号拼成，键没变直接返回。
// 长会话里那次 scrollHeight 读会让浏览器对整份文档做一次同步布局，所以重复调用（快照后、重连后、
// 每次 oninput）不能各自再量一遍。注意：键变了仍要真量一次，那是布局本身的成本，缓存只消除重复。
let promptLayout = 0;
let promptFit = { layout: -1, phone: null, value: null };
function resizePrompt() {
  const input = $("prompt"), phone = mobile.matches;
  if (promptFit.layout === promptLayout && promptFit.phone === phone && promptFit.value === input.value) return;
  promptFit = { layout: promptLayout, phone, value: input.value };
  input.rows = phone ? 1 : 3;
  input.style.height = "auto";
  input.style.height = (phone && !input.value ? 44 : Math.min(input.scrollHeight, 240)) + "px";
}
// 可用宽度或字体度量可能变了（断点、侧栏折叠、手机展开、视口尺寸、字体晚到）：先标脏再重算。
function invalidatePrompt() { promptLayout++; resizePrompt(); }
let scrollFrame, locatedScroll;
const FOLLOW_GAP = 80;
const scrollIntent = new WeakMap();
const lastScrollTops = new WeakMap();
// 只有用户自己的滚动（滚轮、触摸、键盘、按住滚动条/正文拖动）才允许暂停吸底。
const noteScrollIntent = (el) => scrollIntent.set(el, performance.now());
// 吸底与“贴底”共用同一把尺子：距底部不足 FOLLOW_GAP 就算在底部。
const atLatest = (el) => el.scrollHeight - el.scrollTop - el.clientHeight < FOLLOW_GAP;
// 跟随状态只由贴底和用户意图决定：内容增高、布局重排、程序跳转产生的 scroll 事件
// 会在下一帧补底之前把距离算大，若照旧判定为“用户离开底部”，运行中的流式输出就会莫名停下。
function readFollow(el, current) {
  const top = el.scrollTop;
  const previous = lastScrollTops.get(el);
  lastScrollTops.set(el, top);
  if (atLatest(el)) return true;
  if (performance.now() - (scrollIntent.get(el) || 0) < 200) return false;
  // 没有意图事件的向上移动（拖动滚动条）也要暂停，只是为顶部按钮等回落留 4px 余量。
  return previous !== undefined && top < previous - 4 ? false : current;
}
const scrollToLatest = (el) => { el.scrollTop = el.scrollHeight; };
function scrollLatest() {
  scheduleCallGroups();
  if (changing || transport.getSnapshotQueue() || scrollFrame !== undefined || (!follow && !activeTask?.follow)) return;
  scrollFrame = requestAnimationFrame(() => {
    scrollFrame = undefined;
    if (changing) return;
    if (follow) scrollToLatest($("transcript"));
    if (activeTask?.node.open && activeTask.follow) scrollToLatest(activeTask.output);
  });
}
const transcript = $("transcript");
// 内容一增高就贴底：图片解码、折叠展开、同步追加的工具卡片等不走 scrollLatest 的路径也自动跟随。
const growthWatch = new Map();
const growthObserver = typeof ResizeObserver === "function"
  ? new ResizeObserver((entries) => { for (const { target } of entries) growthWatch.get(target)?.(); })
  : null;
function watchGrowth(el, apply) { growthWatch.set(el, apply); growthObserver?.observe(el); }
function forgetGrowth(el) { growthWatch.delete(el); growthObserver?.unobserve(el); }
for (const event of ["wheel", "touchstart", "touchmove", "keydown", "pointerdown"])
  transcript.addEventListener(event, () => noteScrollIntent(transcript), { capture: true, passive: true });
const renderer = createStreamRenderer(renderMarkdown, scrollLatest);
window.addEventListener("pagehide", (event) => { if (!event.persisted) renderer.dispose(); });
// 只监听用户意图，不监听程序触发的 scroll，以免贴底刷新自我延迟。
for (const event of ["wheel", "touchstart", "touchmove", "pointerdown", "keydown", "input"])
  document.addEventListener(event, () => renderer.interact(), { capture: true, passive: true });
watchGrowth($("output"), () => { if (follow) scrollLatest(); });
transcript.onscroll = () => {
  $("earliest").hidden = transcript.scrollTop < FOLLOW_GAP;
  // 程序跳转（子代理摘要、回到最早）也触发 scroll，不能当作“用户离开了底部”。
  if (transcript.scrollTop === locatedScroll) return;
  locatedScroll = undefined;
  follow = readFollow(transcript, follow);
  $("latest").hidden = follow;
  prefetchHistory();
};
$("history-before").onclick = () => void loadHistory({ before: historyState.history.prevCursor });
$("history-after").onclick = () => historyDirty ? void latestHistory() : void loadHistory({ after: historyState.history.nextCursor });
$("history-newest").onclick = () => void latestHistory();
$("earliest").onclick = () => {
  if (historyState?.history?.prevCursor) { void loadHistory({ edge: "first" }); return; }
  follow = false;
  transcript.scrollTop = 0;
  locatedScroll = transcript.scrollTop;
  lastScrollTops.set(transcript, transcript.scrollTop);
  $("earliest").hidden = true;
  $("latest").hidden = false;
  transcript.focus({ preventScroll: true });
};
$("latest").onclick = () => {
  if (historyDirty || historyState?.history?.nextCursor) { void latestHistory(); return; }
  locatedScroll = undefined;
  follow = true;
  lastScrollTops.set(transcript, transcript.scrollTop);
  $("latest").hidden = true;
  scrollLatest();
};
const mobile = matchMedia("(max-width: 700px)");
function sidebar(open) {
  const shell = document.querySelector(".shell");
  const collapsed = !open;
  const widthChanged = shell.classList.contains("collapsed") !== collapsed;
  shell.classList.toggle("collapsed", collapsed);
  $("toggle-sidebar").setAttribute("aria-expanded", String(open));
  $("sidebar-backdrop").hidden = !open || !mobile.matches;
  document.querySelector("main").inert = open && mobile.matches;
  if (open && mobile.matches) $("search").focus();
  else if ($("sidebar").contains(document.activeElement))
    $("toggle-sidebar").focus();
  // 桌面折叠会改主区宽度 → 换行数变化，输入框高度得重算。
  if (widthChanged) invalidatePrompt();
}
$("toggle-sidebar").onclick = () =>
  sidebar($("toggle-sidebar").getAttribute("aria-expanded") !== "true");
$("sidebar-backdrop").onclick = () => sidebar(false);
mobile.onchange = () => {
  sidebar(!mobile.matches);
  invalidatePrompt();
};
sidebar(!mobile.matches);
// 长会话内容插入前先量一次：之后 snapshot/connect 里的重复调用直接命中缓存，不再触发整文档同步布局。
resizePrompt();
let promptResizeFrame;
// 同断点内拖窗口会连发 resize，按帧合并，一帧最多重算一次。
addEventListener("resize", () => {
  if (promptResizeFrame !== undefined) return;
  promptResizeFrame = requestAnimationFrame(() => { promptResizeFrame = undefined; invalidatePrompt(); });
});
// 目前全站用系统字体；万一以后引入 webfont，度量变化同样要重算。
document.fonts?.addEventListener?.("loadingdone", invalidatePrompt);
// 阅读字号是设备偏好；CSS 限定到桌面会话内容，不缩放整页。
const fontScale = $("conversation-font-scale");
function applyConversationFontScale(value) {
  const scale = ["100", "125", "150", "175", "200"].includes(value) ? value : "100";
  document.documentElement.dataset.conversationFontScale = scale;
  fontScale.value = scale;
}
let savedFontScale;
try { savedFontScale = localStorage.getItem("axiom.conversationFontScale"); } catch {}
applyConversationFontScale(savedFontScale);
fontScale.onchange = () => {
  applyConversationFontScale(fontScale.value);
  try { localStorage.setItem("axiom.conversationFontScale", fontScale.value); } catch {}
};

// 明暗主题：theme.js 已在首帧前写好 data-theme，这里只负责切换、持久化与按钮语义。
// theme-color 跟着改，移动端浏览器地址栏才不会跟页面对不上。
const themeColors = { dark: "#010102", light: "#f7f8fa" };
function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", themeColors[theme]);
  const label = `切换到${theme === "dark" ? "浅色" : "深色"}主题`;
  $("toggle-theme").setAttribute("aria-pressed", String(theme === "light"));
  $("toggle-theme").title = label;
  $("toggle-theme").setAttribute("aria-label", label);
}
applyTheme(document.documentElement.dataset.theme === "light" ? "light" : "dark");
$("toggle-theme").onclick = () => {
  const theme = document.documentElement.dataset.theme === "light" ? "dark" : "light";
  applyTheme(theme);
  try { localStorage.setItem("axiom.theme", theme); } catch {}
};
$("mobile-expand").onclick = () => {
  const expanded = document.querySelector(".shell").classList.toggle("mobile-expanded");
  $("mobile-expand").setAttribute("aria-expanded", String(expanded));
  $("mobile-expand").textContent = expanded ? "收起" : "展开";
  if (expanded) invalidatePrompt();
};
const live = new Map(), tasks = new Map();
function error(e) {
  $("error").textContent = e.message || String(e);
}
// 消息原文独立于渲染 DOM，保留被标签解析隐藏的内容与压缩历史。
let rawEntries = [], rawLive = new Map(), rawFrame;
function rawMode(open) {
  $("raw-io").hidden = !open;
  $("workspace").classList.toggle("raw-open", open);
  $("open-raw-io").setAttribute("aria-pressed", String(open));
  if (open) paintRaw();
}
$("open-raw-io").onclick = () => {
  const opening = $("raw-io").hidden;
  rawMode(opening);
  if (opening) {
    const bounds = $("transcript").getBoundingClientRect();
    const visible = rawEntries.find(entry => {
      const rect = entry.item?.text.getBoundingClientRect();
      return rect?.height > 0 && rect.bottom > bounds.top && rect.top < bounds.bottom;
    });
    selectRaw(visible || rawEntries.at(-1));
  }
};
$("close-raw-io").onclick = () => { rawMode(false); $("open-raw-io").focus(); };
function rawChanged() {
  if (!$("raw-io").hidden && rawFrame === undefined) rawFrame = requestAnimationFrame(() => {
    rawFrame = undefined;
    paintRaw();
  });
}
function rawEntry(message, agentId = "main", identity = {}) {
  const entry = { message, agentId, ...identity };
  rawEntries.push(entry);
  return entry;
}
function selectRaw(entry, source = false) {
  if (!entry) return;
  rawMode(true);
  if (source && window.matchMedia?.("(max-width: 1000px)").matches) rawMode(false);
  for (const record of rawEntries) {
    record.node?.classList.toggle("raw-selected", record === entry);
    record.item?.node.classList.toggle("raw-selected", record === entry);
  }
  const target = source ? entry.item?.node : entry.node;
  if (source && target) {
    for (let parent = target.parentElement; parent && parent !== $("output"); parent = parent.parentElement)
      if (parent.tagName === "DETAILS") parent.open = true;
    if (entry.item.task) entry.item.task.trigger.click();
    follow = false;
  }
  target?.scrollIntoView?.({ block: "center" });
}
// 任务通知有两代形态：新 custom 通道（role:"custom" + customType）与旧 user+前缀（历史会话兼容）。
// 统一识别后以独立通知条渲染，与用户消息区分，不再隐藏。
const TASK_NOTIFICATION_TYPE = "task-notification";
const TASK_NOTIFICATION_PREFIX = "[Axiom 子任务完成通知]";
const isTaskNotification = (message) => {
  if (message?.role === "custom") return message?.customType === TASK_NOTIFICATION_TYPE;
  if (message?.role !== "user") return false;
  // 旧会话的通知是 user 消息，content 可为字符串或块数组（与旧隐藏逻辑同判据）。
  const text = typeof message.content === "string" ? message.content
    : (message.content || []).filter((block) => block?.type === "text").map((block) => block.text).join("\n");
  return text.startsWith(TASK_NOTIFICATION_PREFIX);
};
// 通知条不进对话卡片体系：无用户气泡、无思考/工具区；返回 { node } 与 bindRaw 兼容（对照原文按钮可挂）。
function taskNotificationCard(message, agentId) {
  const blocks = typeof message.content === "string" ? [{ type: "text", text: message.content }] : message.content || [];
  const text = blocks.filter((b) => b?.type === "text").map((b) => b.text).join("\n");
  const node = document.createElement("article");
  node.className = "task-notification";
  const head = document.createElement("h3");
  head.textContent = agentId === "main" ? "任务通知" : "任务通知 · 子代理";
  const body = document.createElement("pre");
  body.textContent = text;
  node.append(head, body);
  $("output").querySelector(".empty")?.remove();
  (tasks.get(agentId)?.output || $("output")).append(node);
  scrollLatest();
  return { node };
}
function bindRaw(item, entry) {
  if (!entry) return;
  entry.item = item;
  if (entry.messageId || entry.entryId) item.node.dataset.messageKey = JSON.stringify([sessionId, entry.agentId, entry.messageId || entry.entryId]);
  item.node.addEventListener("click", (e) => {
    if (!$("raw-io").hidden && !e.target.closest("button, a, input, textarea, summary") && !window.getSelection()?.toString()) selectRaw(entry);
  });
  const button = document.createElement("button");
  button.type = "button";
  button.className = "raw-source-link secondary";
  button.textContent = "对照原文";
  button.onclick = () => selectRaw(entry);
  item.node.append(button);
}
function paintRaw() {
  const list = $("raw-io-list");
  const atBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 80;
  $("raw-io-empty").hidden = rawEntries.length > 0;
  for (const [index, entry] of rawEntries.entries()) {
    if (!entry.node) {
      entry.node = document.createElement("article");
      entry.node.className = "raw-message";
      const bar = document.createElement("div");
      bar.className = "raw-message-bar";
      entry.label = document.createElement("span");
      const locate = document.createElement("button");
      locate.type = "button";
      locate.className = "raw-locate secondary";
      locate.textContent = "定位对话";
      locate.onclick = () => selectRaw(entry, true);
      const copy = document.createElement("button");
      copy.type = "button";
      copy.className = "raw-copy secondary";
      copy.textContent = "复制原文";
      copy.onclick = async () => {
        try { await copyText(entry.body.textContent); copy.textContent = "已复制"; }
        catch { copy.textContent = "复制失败，请选中文字复制"; }
      };
      bar.append(entry.label, locate, copy);
      entry.body = document.createElement("pre");
      entry.extra = document.createElement("details");
      const summary = document.createElement("summary");
      summary.textContent = "思考 / 工具 / 附件信息";
      entry.extraText = document.createElement("pre");
      entry.extra.append(summary, entry.extraText);
      entry.node.append(bar, entry.body, entry.extra);
      $("raw-io-list").append(entry.node);
    }
    const { message, agentId } = entry;
    entry.label.textContent = `${String(index + 1).padStart(2, "0")} · ${isTaskNotification(message) ? "内部任务通知" : message.role === "user" ? "你的输入" : message.role === "toolResult" ? "工具结果" : message.role === "custom" ? "自定义消息" : "模型输出"}${agentId !== "main" ? " · 子代理" : ""}${rawLive.get(agentId) === entry ? " · 正在生成" : ""}`;
    const blocks = typeof message.content === "string" ? [{ type: "text", text: message.content }] : message.content || [];
    const text = blocks.filter(b => b?.type === "text").map(b => b.text).join("\n");
    if (entry.body.textContent !== text) entry.body.textContent = text;
    entry.body.hidden = !text;
    entry.node.querySelector(".raw-copy").disabled = !text;
    const extra = blocks.filter(b => b && b.type !== "text").map(b => b.type === "thinking" ? `思考\n${b.thinking || ""}` : b.type === "image" ? `图片附件 · ${b.mimeType || "image"}（不展开 base64）` : JSON.stringify(b, null, 2)).join("\n\n");
    entry.extra.hidden = !extra && !!text;
    entry.extraText.textContent = extra || "本条消息尚无文本输出。";
    entry.node.querySelector(".raw-locate").hidden = !entry.item || entry.item.node.hidden;
  }
  if (atBottom) list.scrollTop = list.scrollHeight;
}
function request(type, data = {}) {
  return transport.request({ type, ...data });
}
// 区域只持有 DOM 更新职责，业务数据仍由 sessionId/config/models 等现有来源提供。
// 仅包 UI 更新，不包事件归并/快照：权威数据失败必须继续向调用方传播。
function region(name, update) {
  try { update(); }
  catch (e) { error(`${name}显示失败：${e.message || e}`); }
}
function updateAvailability() {
  updateNavigation();
  region("连接状态", updateConnection);
  region("输入操作", updateComposer);
  region("模型配置", updateModelAvailability);
  region("设置与详情", updateSettingsAvailability);
}
function updateConnection() {
  $("status").dataset.connected = String(connected);
  $("status").textContent = serviceUi.restarting ? "正在重启…" : connected ? "已连接" : "连接断开";
  serviceUi.sync();
}
function updateModelAvailability() {
  const unavailable = !connected || changing;
  for (const id of ["provider", "model", "thinking", "subagent-provider", "subagent-model"])
    $(id).disabled = unavailable;
  $("agent-role").disabled = unavailable || !config;
  $("model").disabled ||= $("agent-role").value === "subagent" && !$("provider").value;
  $("subagent-model").disabled ||= !$("subagent-provider").value;
}
function updateSettingsAvailability() {
  const unavailable = !connected || changing;
  $("settings-feedback").textContent = unavailable
    ? (changing ? "正在保存或切换配置…" : "连接断开，暂时无法修改配置")
    : "更改自动保存，模型在下一次请求生效";
  for (const fieldset of $("create-agents").children) fieldset.disabled = unavailable;
  for (const id of ["defaults-workspace", "defaults-directory", "defaults-delete"]) $(id).disabled = unavailable;
  const remoteLocked = remoteView.local === false;
  for (const id of ["remote-enabled", "remote-email", "remote-save"])
    $(id).disabled = unavailable || remoteLocked;
  $("remote-refresh").disabled = unavailable;
  for (const task of tasks.values()) task.retryButton.disabled = unavailable || sessionMissing || task.retrying;
}
function updateNavigation() {
  const unavailable = !connected || changing;
  $("open-workspace").disabled = unavailable || pickingWorkspace;
  $("reveal-workspace").disabled = unavailable;
  $("copy-workspace").disabled = !$("workspace-label").textContent;
  $("new").disabled = unavailable || !models.length;
  for (const button of $("sessions").querySelectorAll(".session-actions button")) {
    if (button.classList.contains("session-duplicate"))
      button.disabled = duplicateBlocked(allSessions.find((s) => s.id === button.closest(".session-row")?.dataset.sessionId));
    else button.disabled = !button.closest(".session-copy-menu") && !button.matches(".session-copy, .session-hide") && unavailable;
  }
}
// 复制会话按钮的可用性：除了连接/空闲切换，还要求会话不在运行且已落盘历史文件。
// 渲染与状态刷新都会盖写按钮，两处共用同一份判定。
function duplicateBlocked(session) {
  return !connected || changing || !session || session.status !== "idle" || !session.sessionFile;
}
function updateComposer() {
  const unavailable = !connected || changing;
  questionUI.setConnected(!unavailable && !sessionMissing);
  goalUI.setConnected(!unavailable && !sessionMissing);
  $("queue-type").disabled = unavailable;
  $("composer-skill").disabled = unavailable || !config?.skills?.length;
  $("composer-skill").value = selectedSkill;
  if (unavailable) closeCompletion();
  $("prompt").required = !selectedSkill && !images.length && !contextFiles.length;
  $("add-image").disabled = unavailable || imageLoading;
  $("add-context").disabled = unavailable;
  renderContextChips();
  for (const id of ["send", "send-steer", "send-followup"])
    $(id).disabled = unavailable || !sessionId || sessionMissing || imageLoading || (!$("prompt").value.trim() && !selectedSkill && !images.length && !contextFiles.length);
  $("send-steer").hidden = $("send-followup").hidden = !busy;
  $("stop").disabled = $("force-stop").disabled = !busy || unavailable || sessionMissing;
  // 已经在等安全点了就只留强停：再点一次安全停止没任何效果，反而像没生效。
  $("stop").hidden = !busy || safeStopping;
  $("force-stop").hidden = !busy;
  $("safe-stop-progress").hidden = !busy || !safeStopping;
  $("session-alert").hidden = !stopAlert;
  $("send").hidden = busy;
  syncRetryPrompt();
}
function options(select, entries, selected) {
  if (selected && !entries.some(([value]) => value === selected))
    entries = [...entries, [selected, `${selected}（当前不可用）`]];
  // 比较原生目录而非每次新建 Option；选择变化只写 value，不破坏打开菜单。
  const current = [...select.options];
  if (current.length !== entries.length || entries.some(([value, text], i) => current[i].value !== value || current[i].text !== text))
    select.replaceChildren(...entries.map(([value, text]) => new Option(text, value)));
  if (selected !== undefined) select.value = selected;
  modelPicker.sync(select);
}
// 所有入口共用同一份模型目录；收藏只改变展示顺序，不改变会话选择。
const providerEntries = () => [...new Set(models.map((m) => m.provider))].map((p) => [p, p]);
const modelEntries = (provider) => models.filter((m) => provider === undefined || m.provider === provider)
  .map((m) => [m.key, m.name || m.id]);
let catalogRequest = 0;
async function refreshModelCatalog() {
  const ticket = ++catalogRequest;
  const catalog = await request("models.list");
  if (ticket !== catalogRequest) return;
  models = catalog;
  // 原选择失效时保留并标明；刷新目录不能悄悄切换用户的模型或触发自动保存。
  const refill = (select, entries) => {
    const value = select.value;
    const empty = [...select.options].find((option) => !option.value);
    if (empty) entries = [["", empty.textContent], ...entries];
    if (value && !entries.some(([key]) => key === value)) entries.push([value, `${value}（当前不可用）`]);
    options(select, entries, value);
  };
  for (const select of document.querySelectorAll('select[data-model-kind="provider"]')) refill(select, providerEntries());
  for (const select of document.querySelectorAll('select[data-model-kind="model"]')) {
    const provider = select.closest(".selectors")?.querySelector('select[data-model-kind="provider"]');
    refill(select, provider ? (provider.value ? modelEntries(provider.value) : []) : modelEntries());
  }
  for (const select of document.querySelectorAll('select[data-model-kind="thinking"]')) {
    const model = select.closest(".selectors")?.querySelector('select[data-model-kind="model"]');
    const levels = models.find((entry) => entry.key === model?.value)?.levels;
    if (levels) refill(select, levels.map((level) => [level, level]));
  }
  updateNavigation();
  // 首次配置保存模型后解除引导态（并发重复刷新只在状态变化时执行一次）。
  if (onboarding && models.length) {
    onboarding = false;
    updateNavigation();
    error("模型已保存：点击「＋ 新会话」即可开始对话。");
  }
}
function fillModels(selected = $("agent-role").value === "subagent" ? config?.subagentModel || "" : config?.model) {
  const child = $("agent-role").value === "subagent";
  options($("model"), child && !$("provider").value ? [["", "跟随主代理模型"]] : modelEntries($("provider").value), selected);
}
function renderAgentConfig() {
  const child = $("agent-role").value === "subagent";
  const key = child ? config.subagentModel : config.model;
  const current = models.find((m) => m.key === key);
  options($("provider"), [...(child ? [["", "跟随主代理"]] : []), ...providerEntries()], current?.provider || "");
  fillModels();
  const levels = child ? (current?.levels || config.levels) : config.levels;
  options($("thinking"), [...(child ? [["", "跟随主代理思考等级"]] : []), ...(levels || []).map((v) => [v, v])],
    child ? config.subagentThinking || "" : config.thinking);
  modelPicker.sync($("model"));
}
function fillSubagentModels(selected = config?.subagentModel || "") {
  const provider = $("subagent-provider").value;
  options(
    $("subagent-model"),
    provider
      ? modelEntries(provider)
      : [["", "跟随主代理模型"]],
    selected,
  );
}
function capabilityName(id) {
  const parts = id.split(/[\\/]/).filter(Boolean);
  if (/^skill\.md$/i.test(parts.at(-1))) return parts.at(-2) || id;
  const packageIndex = parts.lastIndexOf("node_modules");
  if (packageIndex >= 0) {
    const name = parts.slice(packageIndex + 1);
    return name.slice(0, name[0]?.startsWith("@") ? 2 : 1).join("/") || id;
  }
  return /^index\.[cm]?[jt]s$/i.test(parts.at(-1)) ? parts.at(-2) || id : parts.at(-1) || id;
}
function runtimeSummary(value = {}) {
  const { usage, context, model, thinking } = value;
  const input = (usage?.input ?? 0) + (usage?.cacheRead ?? 0) + (usage?.cacheWrite ?? 0);
  const count = (n) => Number.isFinite(n) ? n.toLocaleString("en-US") : "—";
  const cache = input > 0 && Number.isFinite(usage?.cacheRead)
    ? `${(usage.cacheRead / input * 100).toFixed(1)}% (${count(usage.cacheRead)} tokens)` : usage ? "供应商未报告缓存用量" : "尚无已报告用量的请求";
  const contextText = context?.contextWindow > 0
    ? `${count(context.tokens)} / ${count(context.contextWindow)} tokens${Number.isFinite(context.percent) ? ` · ${context.percent.toFixed(1)}%` : " · 待更新"}`
    : Number.isFinite(context?.tokens) ? `${count(context.tokens)} tokens · 窗口未配置` : "等待首条消息";
  const split = model?.indexOf("/") ?? -1;
  const identity = split >= 0 ? `${model.slice(0, split)} · ${model.slice(split + 1)}` : model || "模型待加载";
  return [`缓存命中 ${cache}`, `上下文 ${contextText}${context?.estimated ? " · 估算" : ""}`, `${identity} · ${thinking || "未知"}${value.billing?.records ? ` · 会话 ${money(value.billing.cost.total)}${value.billing.unpriced ? "（部分未计价）" : ""}` : ""}`];
}
function renderRuntime(node, value) {
  if (node.id === "session-runtime") {
    $("session-system-prompt").textContent = value?.systemPrompt ?? "系统提示词尚未加载；会话启动后可查看。";
    renderTools($("session-active-tools"), value?.tools);
    renderBill($("session-bill-body"), sessionBill ?? value?.billing);
    $("session-bill-total").textContent = (sessionBill ?? value?.billing)?.records ? `${money((sessionBill ?? value.billing).cost.total)}${sessionBill ? " · 含子代理" : ""}` : "主代理与子代理";
    const { usage, context } = value || {};
    const input = (usage?.input ?? 0) + (usage?.cacheRead ?? 0) + (usage?.cacheWrite ?? 0);
    const cache = input > 0 && Number.isFinite(usage?.cacheRead) ? `${(usage.cacheRead / input * 100).toFixed(1)}%` : "—";
    const percent = Number.isFinite(context?.percent) ? `${context.percent.toFixed(1)}%` : "—";
    const identity = runtimeSummary(sessionBill ? { ...value, billing: sessionBill } : value)[2];
    $("mobile-runtime").textContent = `${cache} · ${percent} · ${identity}`;
    $("mobile-runtime").setAttribute("aria-label", `缓存命中率 ${cache}，上下文占比 ${percent}，${identity}`);
  }
  node.replaceChildren(...runtimeSummary(node.id === "session-runtime" && sessionBill ? { ...value, billing: sessionBill } : value).map((text) => {
    const span = document.createElement("span");
    span.textContent = text;
    return span;
  }));
  node.title = "缓存命中：最近一次模型请求的缓存读取 / 输入总量（含缓存读写）；上下文：Pi 当前估算，非累计消耗。";
}
function updateTaskRuntime(task, value) {
  if (!task) return;
  renderRuntime(task.runtime, value);
  task.trigger.querySelector(".task-cost").textContent = value?.billing?.records ? money(value.billing.cost.total) : "用量待报告";
  renderBill(task.node.querySelector(".task-bill-body"), value?.billing, { compact: true });
  task.systemPrompt.textContent = value?.systemPrompt ?? "系统提示词尚未加载";
}
function applyConfig(value) {
  config = value;
  runtime = value.runtime ?? { ...runtime, model: value.model, thinking: value.thinking };
  region("输入操作", () => renderComposerConfig(value));
  region("模型配置", () => renderModelConfig(value));
  region("设置与详情", () => renderRuntime($("session-runtime"), runtime));
}
function renderComposerConfig(value) {
  options($("composer-skill"), [["", value.skills?.length ? "选择 Skill（本次发送加载）" : "此会话无可用 Skill"],
    ...(value.skills || []).map((skill) => [skill.name, skill.name])]);
  for (const option of $("composer-skill").options)
    option.title = value.skills?.find((skill) => skill.name === option.value)?.description || "";
  $("queue-type").value = value.queueType || "steer";
}
function renderModelConfig(value) {
  options(
    $("subagent-provider"),
    [["", "跟随主代理"], ...providerEntries()],
    models.find((m) => m.key === value.subagentModel)?.provider || "",
  );
  fillSubagentModels();
  renderAgentConfig();
}
// 配置请求携带发起时的会话身份与序号；切换会话或重连后，迟到的回执（成功或失败）一律丢弃，不污染当前会话。
let configureSeq = 0;
async function configure(thinking, source = "composer") {
  const target = sessionId, seq = ++configureSeq;
  const child = $("agent-role").value === "subagent";
  const selection = source === "composer"
    ? child
      ? { model: config.model, subagentModel: $("model").value || null,
          subagentThinking: thinking !== undefined ? thinking || null : config.subagentThinking ?? null }
      : { model: $("model").value, ...(thinking ? { thinking } : {}) }
    : { model: config.model, ...(source === "subagent" ? { subagentModel: $("subagent-model").value || null } : {}) };
  let failure;
  changing = true;
  updateAvailability();
  $("error").textContent = "";
  try {
    const value = await request("session.configure", {
      sessionId: target,
      ...selection,
      queueType: $("queue-type").value,
    });
    if (sessionId !== target || seq !== configureSeq) return;
    applyConfig(value);
  } catch (e) {
    if (sessionId !== target || seq !== configureSeq) return;
    error(e);
    failure = e.message || String(e);
    if (config) applyConfig(config);
  } finally {
    if (seq !== configureSeq) return; // 已有更新一次的配置请求，由它负责收尾
    changing = false;
    updateAvailability();
    if (sessionId === target && failure) $("settings-feedback").textContent = `保存失败：${failure}`;
  }
}
// 摘要记忆参数：设置页「默认新会话设置」独立小节，get 填充、change 即存（服务端持久化并校验边界）。
const taskBudgetInputs = ["task-max-turns", "task-wrap-up-window"];
let settingsGeneration = 0;
let budgetRequest = 0, remoteRequest = 0;
const settingsTicket = () => {
  const generation = settingsGeneration, target = sessionId;
  return () => generation === settingsGeneration && target === sessionId;
};
$("settings").addEventListener("close", () => {
  if ($("settings").open) return;
  settingsGeneration++;
  creationLoad++;

});
async function loadTaskBudget() {
  const current = settingsTicket(), ticket = ++budgetRequest;
  try {
    const budget = await request("task.budget.get");
    if (!current() || ticket !== budgetRequest) return;
    $("task-max-turns").value = budget.maxTurns ?? taskBudgetDefaults.maxTurns;
    $("task-wrap-up-window").value = budget.wrapUpWindow ?? taskBudgetDefaults.wrapUpWindow;
  } catch (e) {
    if (current() && ticket === budgetRequest) $("settings-feedback").textContent = `轮次预算加载失败：${e.message}`;
  }
}
async function saveTaskBudget() {
  const current = settingsTicket(), ticket = ++budgetRequest;
  try {
    const budget = await request("task.budget.configure", { budget: Object.fromEntries(
      [["task-max-turns", "maxTurns"], ["task-wrap-up-window", "wrapUpWindow"]]
        .map(([id, key]) => [key, Number($(id).value)]),
    ) });
    if (!current() || ticket !== budgetRequest) return;
    $("task-max-turns").value = budget.maxTurns;
    $("task-wrap-up-window").value = budget.wrapUpWindow;
    $("settings-feedback").textContent = "轮次预算已保存 · 新建任务生效";
  } catch (e) {
    if (current() && ticket === budgetRequest) $("settings-feedback").textContent = `轮次预算保存失败：${e.message}`;
  }
}
for (const id of taskBudgetInputs) $(id).addEventListener("change", () => void saveTaskBudget());
function showSettingsPanel(panel) {
  settingsGeneration++;
  for (const name of ["defaults", "remote", "models", "service"]) {
    $(`${name}-panel`).hidden = name !== panel;
    const button = $(`settings-${name}-tab`);
    if (name === panel) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  }
  if (panel === "models") void modelManager.load();
  if (panel === "remote") void remoteLoad();
}
$("settings-defaults-tab").onclick = () => showSettingsPanel("defaults");
$("settings-remote-tab").onclick = () => showSettingsPanel("remote");
$("settings-models-tab").onclick = () => showSettingsPanel("models");
$("settings-service-tab").onclick = () => showSettingsPanel("service");
// 顶部状态可点击直达「服务与更新」；顶部只保留状态/DEV/版本，不暴露源码路径。
$("status").onclick = () => {
  showSettingsPanel("service");
  if (!$("settings").open) $("settings").showModal();
};
$("open-settings").onclick = () => {
  showSettingsPanel(models.length ? "defaults" : "models");
  region("设置与详情", updateSettingsAvailability);
  if (!$("settings").open) $("settings").showModal();
  if (models.length) void openDefaults();
  void loadTaskBudget();
};
$("settings").onclick = (e) => {
  if (e.target !== $("settings")) return;
  const rect = $("settings").getBoundingClientRect();
  if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom)
    $("settings").close();
};
// Tailscale 远程控制：安全配置显式保存；打开面板才请求，重连后已加载过才刷新。
const remoteView = {};
let remoteLoaded = false;
function remoteAnchor(href, text) {
  const a = document.createElement("a");
  a.href = href;
  a.textContent = text;
  a.target = "_blank";
  a.rel = "noreferrer";
  return a;
}
function remoteRender(data) {
  Object.assign(remoteView, data);
  const status = $("remote-status");
  status.replaceChildren();
  if (data.installed === false) {
    status.append("本机未安装 Tailscale：", remoteAnchor("https://tailscale.com/download", "官方下载安装"), "，安装并登录同一账号后刷新。");
  } else if (!data.enabled) {
    // online 仅在开启后有监听意义，关闭时不断言 Tailscale 状态，避免误报
    status.append("远程访问未开启");
  } else {
    status.append(data.active ? "远程访问已开启，监听中" : "远程访问已开启，但监听未运行：请刷新或在本机检查服务与 Tailscale");
  }
  const login = $("remote-login");
  login.replaceChildren();
  if (data.loginEmail) {
    const code = document.createElement("code");
    code.textContent = data.loginEmail;
    login.append("本机登录邮箱：", code, "（允许的邮箱须与此一致）");
    $("remote-auth").replaceChildren();
  } else if (data.installed !== false) {
    const button = document.createElement("button");
    button.type = "button";
    button.id = "remote-login-button";
    button.className = "secondary";
    button.textContent = "获取登录授权链接";
    button.title = "打开链接完成授权即本机 Tailscale 登录；管理台网页登录不等于本机登录";
    button.onclick = () => void remoteLogin();
    login.append(button, " 未登录时点击生成授权链接，打开完成授权后回到本页或点击刷新自动带入邮箱。");
  }
  const url = $("remote-url");
  url.replaceChildren("访问地址：");
  if (data.url && /^https?:\/\//i.test(data.url)) {
    url.append(remoteAnchor(data.url, data.url));
  } else if (data.url) {
    // ponytail: 后端只应发 http(s)；非安全协议仅展示文本不生成链接，待后端校验后可删除
    const code = document.createElement("code");
    code.textContent = data.url;
    url.append(code);
  } else url.append("开启并保存后生成");
  $("remote-note").hidden = data.local !== false;
  $("remote-enabled").value = data.enabled ? "on" : "off";
  $("remote-email").value = data.loginEmail || "";
  $("remote-feedback").textContent = data.error || "";
  const auth = remoteAuthUrl(data.authUrl);
  if (!data.loginEmail && auth && data.local === true)
    $("remote-auth").replaceChildren(remoteAnchor(auth, "打开 Tailscale 登录授权"));
  region("设置与详情", updateSettingsAvailability);
}
async function remoteLoad() {
  if (!connected) return;
  const current = settingsTicket(), ticket = ++remoteRequest;
  remoteLoaded = true;
  $("remote-feedback").textContent = "";
  $("remote-status").textContent = "正在读取远程访问状态…";
  $("remote-refresh").disabled = true;
  try {
    const data = await request("remote.get");
    if (!current() || ticket !== remoteRequest) return;
    remoteRender(data);
  } catch (e) {
    if (!current() || ticket !== remoteRequest) return;
    $("remote-status").textContent = "状态读取失败";
    $("remote-feedback").textContent = `读取失败：${e.message}`;
  } finally {
    region("设置与详情", updateSettingsAvailability);
  }
}
// 授权链接只信 https://login.tailscale.com/a/…（默认 443、无凭据），其余一律不渲染。
function remoteAuthUrl(authUrl) {
  try {
    const url = new URL(authUrl);
    const ok = url.protocol === "https:" && url.hostname === "login.tailscale.com"
      && url.port === "" && url.pathname.startsWith("/a/") && !url.username && !url.password;
    return ok ? url.href : "";
  } catch { return ""; }
}
async function remoteLogin() {
  const button = $("remote-login-button");
  if (!button || !connected || remoteView.local !== true) return;
  button.disabled = true;
  $("remote-feedback").textContent = "正在获取授权链接…";
  try {
    const data = await request("remote.login");
    remoteRender({ ...remoteView, ...data });
    const authUrl = remoteAuthUrl(data.authUrl);
    if (data.loginEmail) {
      $("remote-feedback").textContent = "Tailscale 已登录，请确认后手动开启远程访问";
    } else if (authUrl) {
      $("remote-auth").replaceChildren(
        "授权链接（打开并完成授权即本机登录，完成后回到本页或点击刷新更新账号）：",
        remoteAnchor(authUrl, "打开 Tailscale 登录授权"));
    } else {
      $("remote-feedback").textContent = data.error || data.guidance || "授权链接仍在获取中，请稍后重试";
    }
  } catch (e) {
    $("remote-feedback").textContent = `获取授权链接失败：${e.message}`;
    const retry = $("remote-login-button");
    if (retry) retry.disabled = false;
  }
}
// 无轮询：回到页面 focus 或手动刷新时更新账号。
window.addEventListener("focus", () => { if (remoteLoaded && $("settings").open && !$("remote-panel").hidden) void remoteLoad(); });
function remoteOnReconnect() {
  if (remoteLoaded && $("settings").open && !$("remote-panel").hidden) void remoteLoad();
}
$("remote-refresh").onclick = () => void remoteLoad();
$("remote-form").onsubmit = async (e) => {
  e.preventDefault();
  if (!connected || changing || remoteView.local === false) return;
  const enabled = $("remote-enabled").value === "on";
  const email = $("remote-email").value.trim();
  if (enabled && !email) {
    $("remote-feedback").textContent = "请先在本机登录 Tailscale（登录后刷新自动带入邮箱）";
    return;
  }
  changing = true;
  updateAvailability();
  $("remote-feedback").textContent = "正在保存…";
  try {
    const data = await request("remote.configure", { enabled, email });
    remoteRender(data);
    if (!data.error) $("remote-feedback").textContent = "已保存远程访问配置";
  } catch (e2) {
    $("remote-feedback").textContent = `保存失败：${e2.message}`;
  } finally {
    changing = false;
    updateAvailability();
  }
};
const messageItems = new WeakMap(), toolItems = new Map(), waitingItems = new Map();
// One local stroke vocabulary: tool identity stays visible when its state changes.
const activityPaths = {
  'circle-done': "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0M8 12l3 3 5-6",
  'circle-stopped': "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0M9 9v6m6-6v6",
  waiting: "M20 12a8 8 0 1 1-8-8",
  thinking: "M9 18h6m-5 3h4M8.5 15.5a6 6 0 1 1 7 0L15 18H9z",
  read: "M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9zM14 3v6h6M8 13h8m-8 4h5",
  edit: "m15 5 4 4M4 20l4-1L20 7a2.8 2.8 0 0 0-4-4L4 15z",
  write: "M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9zM14 3v6h6M8 15h8m-4-4v8",
  bash: "m5 7 5 5-5 5m8 0h6",
  search: "M10.5 18a7.5 7.5 0 1 0 0-15 7.5 7.5 0 0 0 0 15ZM16 16l5 5",
  web: "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM3 12h18M12 3c5 5 5 13 0 18-5-5-5-13 0-18Z",
  agents: "M12 4v6M5 20v-5h14v5M12 10v10M9 4h6M2 20h6m1 0h6m1 0h6",
  tool: "m8 4-5 8 5 8m8-16 5 8-5 8M14 4l-4 16",
  done: "m5 12 4 4L19 6",
  failed: "m12 3 10 18H2zM12 9v5m0 3h.01",
  stopped: "M8 5v14M16 5v14",
};
function setActivityIcon(icon, name) {
  if (icon.dataset.icon === name) return;
  icon.dataset.icon = name;
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  const path = document.createElementNS(svg.namespaceURI, "path");
  path.setAttribute("d", activityPaths[name] || activityPaths.tool);
  svg.append(path);
  icon.replaceChildren(svg);
}
let callGroupsFrame;
function scheduleCallGroups() {
  if (callGroupsFrame !== undefined) return;
  callGroupsFrame = requestAnimationFrame(() => {
    callGroupsFrame = undefined;
    for (const output of [$('output'), ...[...tasks.values()].map(task => task.output)]) {
      if (output?.isConnected) refreshCallGroups(output);
    }
    placeCompactedTasks();
  });
}
function createCallGroup() {
  const group = document.createElement('details');
  group.className = 'call-group';
  group.open = true;
  const summary = document.createElement('summary');
  summary.setAttribute('aria-label', '展开或收起执行过程');
  const viewport = document.createElement('span');
  viewport.className = 'call-preview';
  const body = document.createElement('div');
  body.className = 'call-list';
  summary.append(viewport);
  group.append(summary, body);
  return group;
}
function paintCallGroup(group) {
  const body = group.lastElementChild;
  const rows = [...body.querySelectorAll('.activity-line')].filter(row => {
    for (let node = row; node && node !== body; node = node.parentElement)
      if (node.hidden || node.classList.contains('merged-thought')) return false;
    return true;
  });
  group.hidden = !rows.length;
  if (!rows.length) return;
  // Message boundaries fold segments; agent state ends activity even without a final answer.
  const output = group.closest('#output') || [...tasks.values()].find(task => task.output.contains(group))?.output;
  const pending = rows.some(row => ['running', 'waiting', 'thinking'].includes(row.dataset.state));
  const running = group.dataset.messageFolded !== 'true' && output?.dataset.activityState === 'running'
    && (pending || group.dataset.hasFollowingActivity !== 'true');
  const stopped = rows.some(row => ['stopped', 'failed'].includes(row.dataset.state));
  const label = running ? 'Working' : stopped ? 'Stopped' : 'Completed';
  const icon = running ? 'waiting' : label === 'Stopped' ? 'circle-stopped' : 'circle-done';
  const preview = group.firstElementChild.firstElementChild;
  // 过程标签专用 call-group：保留 "过程" 标题，只同步运行图标。
  if (group.dataset.processMarker === "true") {
    const line = preview.firstElementChild;
    if (line?.classList.contains("activity-line")) {
      const state = running ? "running" : stopped ? "stopped" : "done";
      if (line.dataset.state !== state) {
        line.dataset.state = state;
        setActivityIcon(line.firstChild, icon);
      }
    }
    group.dataset.active = String(running);
    return;
  }
  const signature = `${label}:${icon}`;
  if (preview.dataset.signature !== signature) {
    preview.dataset.signature = signature;
    const line = activityLine(label, '');
    line.removeAttribute('role');
    setActivityIcon(line.firstChild, icon);
    preview.replaceChildren(line);
  }
  // Status controls the icon only; visible messages control automatic folding.
  group.dataset.active = String(running);
}
function refreshCallGroups(output) {
  // Keep the actual records (and their open state); only move their containers.
  const nodes = [...output.children].flatMap(node => node.classList.contains('call-group') && node.dataset.processMarker !== 'true'
    ? [...node.lastElementChild.children] : [node]);
  // 只有同一用户轮出现明确回答后，才把此前的普通说明归为过程。
  const progress = new Set();
  let pending = [];
  for (const node of nodes) {
    const item = messageItems.get(node);
    if (item?.heading.textContent === '你' && !node.hidden) pending = [];
    else if (item?.hasAnswer) { for (const previous of pending) progress.add(previous); pending = []; }
    else if (item && !item.task && !item.node.querySelector('[data-state="failed"]')) pending.push(item);
  }
  let group;
  for (const node of nodes) {
    if (node.dataset.processMarker === 'true') continue;
    const item = messageItems.get(node);
    const precedingGroup = group || (node.previousElementSibling?.classList.contains('call-group') ? node.previousElementSibling : null);
    const isCall = item ? item.heading.textContent !== '你' && (!item.buffer.trim() || progress.has(item))
      : node.matches('.tool-record, .thinking-record, .activity-line, .message-tools');
    // Consecutive tool-only messages belong to one group, not one group per message.
    if (isCall && item?.callGroup) {
      item.text.before(item.thinking);
      item.text.after(item.tools);
      item.callGroup.remove();
      item.callGroup = undefined;
    }
    if (isCall) {
      if (!group) {
        group = node.parentElement.classList.contains('call-list') ? node.parentElement.parentElement : createCallGroup();
        if (!group.isConnected) node.before(group);
      }
      if (node.parentElement !== group.lastElementChild) group.lastElementChild.append(node);
    } else {
      if (group) paintCallGroup(group);
      group = undefined;
      if (node.parentElement.classList.contains('call-list')) {
        const previous = node.parentElement.parentElement;
        const following = [];
        for (let next = node.nextElementSibling; next; next = next.nextElementSibling) following.push(next);
        previous.after(node);
        if (following.length) {
          const tail = createCallGroup();
          tail.lastElementChild.append(...following);
          node.after(tail);
        }
      }
    }
    if (item) {
      // Thinking precedes the answer; tool calls emitted after prose stay after it.
      if (!isCall && item.reasoning && item.heading.textContent !== '你') {
        if (precedingGroup) {
          precedingGroup.lastElementChild.append(item.thinking);
          item.thoughtGroup?.remove();
          item.thoughtGroup = undefined;
          paintCallGroup(precedingGroup);
          foldCallsBeforeMessage(precedingGroup);
        } else {
          if (!item.thoughtGroup) {
            item.thoughtGroup = createCallGroup();
            item.text.before(item.thoughtGroup);
            item.thoughtGroup.lastElementChild.append(item.thinking);
          }
          paintCallGroup(item.thoughtGroup);
          foldCallsBeforeMessage(item.thoughtGroup);
        }
      } else if (item.thoughtGroup) {
        item.text.before(item.thinking);
        item.thoughtGroup.remove();
        item.thoughtGroup = undefined;
      }
      if (!isCall && item.tools.childElementCount && item.heading.textContent !== '你') {
        if (!item.callGroup) {
          item.callGroup = createCallGroup();
          item.node.after(item.callGroup);
          item.callGroup.lastElementChild.append(item.tools);
        }
        paintCallGroup(item.callGroup);
        group = item.callGroup;
      } else if (item.callGroup) {
        item.text.after(item.tools);
        item.callGroup.remove();
        item.callGroup = undefined;
      }
      // 同条消息内标签外的说明放在回答前，复用现有折叠组件；
      // 旧历史无标签不创建 processGroup，唯一答复不隐藏。
      if (!isCall && item.processBuffer && item.heading.textContent !== '你') {
        item.processText.hidden = false;
        if (!item.processGroup) {
          item.processGroup = createCallGroup();
          const marker = activityLine("过程", "done");
          marker.removeAttribute("role");
          item.processGroup.dataset.processMarker = "true";
          item.node.before(item.processGroup);
          item.processGroup.open = false;
          item.processGroup.addEventListener("toggle", () => { if (item.processGroup?.open) renderer.mark(item); });
          item.processGroup.firstElementChild.firstElementChild.replaceChildren(marker);
          item.processGroup.lastElementChild.append(item.processText);
        }
        paintCallGroup(item.processGroup);
        item.processGroup.hidden = item.node.hidden;
      } else if (item.processGroup) {
        item.text.after(item.processText);
        item.processGroup.remove();
        item.processGroup = undefined;
      }
    }
  }
  if (group) paintCallGroup(group);
  for (const node of [...output.children]) if (node.classList.contains('call-group')) {
    if (!node.lastElementChild.childElementCount) node.remove();
    else paintCallGroup(node);
  }
  // Only the latest segment owns the between-tools wait; older segments need actual pending work.
  let hasFollowingActivity = false;
  for (const segment of [...output.querySelectorAll('.call-group')].reverse()) {
    segment.dataset.hasFollowingActivity = String(hasFollowingActivity);
    paintCallGroup(segment);
    if (!segment.hidden) hasFollowingActivity = true;
  }
  let hasFollowingMessage = false;
  for (const node of [...output.children].reverse()) {
    const item = messageItems.get(node);
    // A message's own calls render after its prose, so only later messages close them.
    if (hasFollowingMessage) {
      if (node.classList.contains('call-group')) foldCallsBeforeMessage(node);
      if (item?.callGroup) foldCallsBeforeMessage(item.callGroup);
    }
    if (item && !node.hidden && (item.buffer.trim() || item.images?.childElementCount))
      hasFollowingMessage = true;
  }
}
function foldCallsBeforeMessage(group) {
  if (group.dataset.messageFolded === 'true') return;
  group.dataset.messageFolded = 'true';
  group.open = false;
  paintCallGroup(group);
}
function disclosureHint(label = "详情") {
  const hint = document.createElement("span");
  hint.className = "disclosure-action";
  for (const [className, text] of [["when-closed", label], ["when-open", "收起"]]) {
    const span = document.createElement("span");
    span.className = className;
    span.textContent = text;
    if (className === "when-open") {
      const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      icon.setAttribute("viewBox", "0 0 24 24");
      icon.setAttribute("aria-hidden", "true");
      const path = document.createElementNS(icon.namespaceURI, "path");
      path.setAttribute("d", "M5 4h14M6 14l6-6 6 6M12 8v12");
      icon.append(path);
      span.prepend(icon);
    }
    hint.append(span);
  }
  return hint;
}
function activityLine(label, state = "waiting") {
  const node = document.createElement("span");
  node.className = "activity-line";
  node.setAttribute("role", "status");
  const icon = document.createElement("span");
  icon.className = "activity-icon";
  icon.setAttribute("aria-hidden", "true");
  const text = document.createElement("span");
  text.className = "activity-label";
  node.append(icon, text);
  setActivity(node, label, state);
  return node;
}
function setActivity(node, label, state, icon) {
  scheduleCallGroups();
  node.dataset.state = state;
  setActivityIcon(node.firstChild, node.dataset.toolIcon || icon || (state === "running" ? "waiting" : state));
  const text = node.querySelector(node.classList.contains("tool-activity") ? ".tool-status" : ".activity-label");
  if (text.textContent === label) return;
  text.textContent = label;
  if (state === "thinking" && label === "thinking...") {
    const dots = document.createElement("span");
    dots.className = "thinking-dots";
    dots.textContent = "...";
    text.replaceChildren("thinking", dots);
  }
}
function waiting(agentId) {
  (tasks.get(agentId)?.output || $('output')).dataset.activityState = 'running';
  scheduleCallGroups();
  if (waitingItems.has(agentId) || live.get(agentId)?.active || [...toolItems.values()].some((tool) => tool.agentId === agentId && tool.node.dataset.state === "running")) return;
  const task = tasks.get(agentId);
  const node = activityLine("connecting...");
  (task?.output || $("output")).append(node);
  waitingItems.set(agentId, node);
  scrollLatest();
}
function clearWaiting(agentId) {
  waitingItems.get(agentId)?.remove();
  waitingItems.delete(agentId);
}
function stopActivity(agentId, label = "已停止") {
  (tasks.get(agentId)?.output || $('output')).dataset.activityState = 'stopped';
  scheduleCallGroups();
  clearWaiting(agentId);
  const item = live.get(agentId);
  if (item) {
    item.active = false;
    // 落定停用态记在 item 上：挂起的流式帧/工具更新不得再把它回退成 done/connecting。
    item.stopped = label;
    renderer.flush(item);
    updateActivity(item, label);
  }
  for (const tool of toolItems.values()) if (tool.agentId === agentId && ["running", "waiting"].includes(tool.node.dataset.state))
    setActivity(tool.node, label, "stopped");
}
function updateActivity(item, stopped) {
  if (item.heading.textContent === "你") return;
  // 停用是不可逆落定态：任何后续刷新（挂起绘制、工具完成等）都要保留，不能回退成运行态。
  if (item.stopped && !item.active) stopped = item.stopped;
  const pure = !item.buffer.trim() && !item.tools.childElementCount;
  item.node.classList.toggle("activity-only", !item.buffer.trim());
  item.node.classList.toggle("pure-thought", pure && !!item.reasoning);
  item.activity.hidden = !!item.reasoning || !!item.buffer.trim() || !!item.tools.childElementCount || (!item.active && !stopped);
  item.modelInfo.hidden = !item.modelInfo.childElementCount;
  const thinking = item.active && !item.buffer.trim() && !stopped;
  // Apply defaults on state changes without overriding the user's toggle every delta.
  if (item.thinking.dataset.active !== String(thinking)) {
    item.thinking.open = thinking;
    item.thinking.dataset.active = String(thinking);
  }
  setActivity(item.thinkingLine, stopped ? `thinking · ${stopped}` : thinking ? "thinking..." : "thinking", stopped ? "stopped" : thinking ? "thinking" : "done", "thinking");
  setActivity(item.activity, stopped || "connecting...", stopped ? "stopped" : "waiting");
  if (item.activity.hidden) setActivity(item.activity, "", "");
  item.node.hidden = !item.active && pure && !item.reasoning && !stopped;
}
function mergeThoughts(output) {
  let first;
  const root = output.classList.contains('call-list') ? output.parentElement.parentElement : output;
  for (const node of [...root.children].flatMap(node => node.classList.contains('call-group') ? [...node.lastElementChild.children] : [node])) {
    const item = messageItems.get(node);
    if (!item) { first = undefined; continue; }
    node.classList.remove("merged-thought");
    if (item.ownReasoning !== undefined) item.reasoning = item.ownReasoning;
    if (node.hidden) continue;
    if (!node.classList.contains("pure-thought") || item.active) { first = undefined; continue; }
    if (first) {
      first.reasoning += `\n\n${item.reasoning}`;
      node.classList.add("merged-thought");
      renderer.flush(first);
    } else first = item;
    renderer.flush(item);
  }
}
let diffView = mobile.matches ? "unified" : "split";
try {
  const saved = localStorage.getItem("axiom.diffView");
  if (["split", "unified"].includes(saved)) diffView = saved;
} catch {}
function renderToolDetail(tool) {
  if (!tool.container.isConnected) return;
  // 关闭即释放详情 DOM，重开时再用 tool.args/tool.result 重建，长会话里折叠记录不再常驻节点。
  tool.body.replaceChildren();
  if (!tool.container.open) return;
  const section = (label, text, diff = false) => {
    if (!text) return;
    const heading = document.createElement("h4");
    heading.textContent = label;
    const pre = document.createElement("pre");
    if (diff) {
      const select = document.createElement("select");
      select.setAttribute("aria-label", "代码对比展示方式");
      select.append(new Option("统一视图", "unified"), new Option("左右对比", "split"));
      select.value = diffView;
      select.onchange = () => {
        diffView = select.value;
        try { localStorage.setItem("axiom.diffView", diffView); } catch {}
        for (const record of toolItems.values()) renderToolDetail(record);
      };
      heading.append(select);
    }
    // Bound expanded DOM size; the full original tool result stays in session history.
    const visible = String(text).slice(0, 60000);
    if (diff) for (const line of visible.split("\n")) {
      const row = document.createElement("span");
      row.className = line.startsWith("+") ? "diff-add" : line.startsWith("-") ? "diff-remove" : "diff-context";
      row.textContent = `${line}\n`;
      pre.append(row);
    } else pre.textContent = visible;
    if (diff) {
      pre.className = "diff-unified";
      const split = document.createElement("div");
      split.className = "diff-split";
      split.setAttribute("aria-label", "左侧修改前，右侧修改后");
      const cell = (line, kind) => {
        const node = document.createElement("pre");
        node.className = kind;
        node.textContent = line || " ";
        split.append(node);
      };
      cell("修改前", "diff-column-title");
      cell("修改后", "diff-column-title");
      let removed = [], added = [];
      const flush = () => {
        for (let i = 0; i < Math.max(removed.length, added.length); i++) {
          cell(removed[i], removed[i] === undefined ? "diff-context" : "diff-remove");
          cell(added[i], added[i] === undefined ? "diff-context" : "diff-add");
        }
        removed = []; added = [];
      };
      for (const line of visible.split("\n")) {
        if (line.startsWith("-")) removed.push(line);
        else if (line.startsWith("+")) added.push(line);
        else { flush(); cell(line, "diff-context"); cell(line, "diff-context"); }
      }
      flush();
      const comparison = document.createElement("div");
      comparison.className = `diff-comparison diff-view-${diffView}`;
      comparison.append(pre, split);
      tool.body.append(heading, comparison);
    }
    if (!diff) tool.body.append(heading, pre);
    if (String(text).length > visible.length) {
      const notice = document.createElement("p");
      notice.className = "tool-truncation";
      notice.textContent = "内容过长，仅显示前 60,000 字符；完整记录仍保存在会话中。";
      tool.body.append(notice);
    }
  };
  const args = tool.args || {};
  const result = tool.result;
  const diff = result?.details?.diff;
  if (typeof diff === "string" && diff) section("实际改动", diff, true);
  else if (tool.name === "edit") {
    const edits = args.edits || (typeof args.oldText === "string" ? [args] : []);
    const preview = edits.map((edit) => [
      ...String(edit.oldText ?? "").split("\n").map((line) => `- ${line}`),
      ...String(edit.newText ?? "").split("\n").map((line) => `+ ${line}`),
    ].join("\n")).join("\n\n");
    section("请求改动（是否成功以执行结果为准）", preview, true);
  }
  if (tool.name === "write" && typeof args.content === "string") section("写入内容（可能新建或覆盖文件）", args.content);
  else if (tool.name !== "edit") section("调用参数", JSON.stringify(args, null, 2));
  else section("文件", args.path || args.file_path);
  const content = result?.content;
  const text = typeof content === "string" ? content : Array.isArray(content)
    ? content.map((block) => block.type === "text" ? block.text : `[${block.type || "非文本"}内容]`).join("\n") : "";
  section("执行输出", text || (tool.node.dataset.state === "running" ? "等待工具返回…" : "没有文本输出记录"));
}
function toolState(agentId, data) {
  if (!data.toolCallId) return;
  clearWaiting(agentId);
  const key = `${agentId}:${data.toolCallId}`;
  let tool = toolItems.get(key);
  if (!tool) {
    const item = live.get(agentId);
    const node = activityLine("");
    node.removeAttribute("role");
    const detail = document.createElement("span");
    detail.className = "tool-target";
    const status = document.createElement("span");
    status.className = "tool-status";
    node.append(detail, status);
    node.classList.add("tool-activity");
    const container = document.createElement("details");
    container.className = "tool-record";
    const summary = document.createElement("summary");
    summary.append(node);
    const body = document.createElement("div");
    body.className = "tool-detail";
    container.append(summary, body);
    (item?.tools || tasks.get(agentId)?.output || $("output")).append(container);
    tool = { node, agentId, container, body };
    container.ontoggle = () => { renderToolDetail(tool); scrollLatest(); };
    toolItems.set(key, tool);
    if (item) updateActivity(item);
  }
  if (data.args) tool.args = data.args;
  if (data.result || data.partialResult) tool.result = data.result || data.partialResult;
  else if (data.content) tool.result = data;
  const args = tool.args || {};
  const detail = args.path || args.file_path || args.command || args.query || (Array.isArray(args.queries) ? args.queries.join(" · ") : "") || args.url || (Array.isArray(args.urls) ? args.urls.join(" · ") : "") || (Array.isArray(args.tasks) ? args.tasks.map((task) => task?.task).join(" · ") : "") || args.taskId || args.tool || args.search || "";
  if (data.toolName) tool.name = data.toolName;
  const name = (tool.name || "").replace(/^functions\./, "");
  const icon = ({ __proto__: null, read: "read", edit: "edit", write: "write", bash: "bash", powershell: "bash", pwsh: "bash", web_search: "search", source_check: "search", fetch_content: "web", get_search_content: "web", delegate: "agents", read_result: "agents", append: "agents" })[name] || "tool";
  tool.node.dataset.toolIcon = icon;
  tool.node.querySelector(".activity-label").textContent = name || "tool";
  tool.node.querySelector(".activity-label").title = tool.name || "工具";
  const target = tool.node.querySelector(".tool-target");
  const fullDetail = typeof detail === "string" ? detail.replace(/\s+/g, " ").trim() : "";
  const cwd = currentCwd.replaceAll("\\", "/").replace(/\/$/, "");
  const normalized = fullDetail.replaceAll("\\", "/");
  target.textContent = (args.path || args.file_path) && cwd && normalized.startsWith(`${cwd}/`) ? normalized.slice(cwd.length + 1) : fullDetail;
  target.title = fullDetail;
  const state = data.phase === "end" ? (data.isError ? "failed" : "done") : data.phase === "history" ? "stopped" : "running";
  setActivity(tool.node, { running: "", done: "", failed: "FAILED", stopped: "" }[state], state);
  renderToolDetail(tool);
  scrollLatest();
}
function card(title, task) {
  $("output").querySelector(".empty")?.remove();
  const node = document.createElement("article");
  node.className = title === "你" ? "message user" : "message";
  const heading = document.createElement("h3");
  heading.textContent = title;
  heading.hidden = title === "你" || title === "AXIOM";
  const thinking = document.createElement("details");
  thinking.className = "thinking-record";
  const summary = document.createElement("summary");
  const thinkingLine = activityLine("thinking", "thinking");
  thinkingLine.removeAttribute("role");
  summary.append(thinkingLine);
  const thought = document.createElement("div");
  thought.className = "markdown thinking-content";
  thinking.append(summary, thought);
  thinking.hidden = true;
  const text = document.createElement("div");
  text.className = "markdown";
  text.setAttribute("aria-live", "off");
  const processText = document.createElement("div");
  processText.className = "markdown message-process";
  processText.hidden = true;
  const modelInfo = document.createElement("small");
  modelInfo.className = "message-model";
  const activity = activityLine("connecting...");
  activity.hidden = title === "你";
  if (activity.hidden) setActivity(activity, "", "");
  const tools = document.createElement("div");
  tools.className = "message-tools";
  node.append(heading, activity, thinking, text, processText, tools, modelInfo);
  if (task && !task.trigger.isConnected) $("output").append(task.trigger);
  (task?.output || $("output")).append(node);
  if (!task || task.node.open) scrollLatest();
  const item = {
    task,
    activity, tools, active: false,
    modelInfo,
    node,
    heading,
    thinking,
    thinkingLine,
    thought,
    text,
    processText,
    buffer: "",
    processBuffer: "",
    reasoning: "",
    paintedText: "",
    paintedProcess: "",
    processGroup: undefined,
    raw: "",
    pending: false,
    prepare: prepareStream,
  };
  messageItems.set(node, item);
  task?.messages.push(item);
  thinking.ontoggle = () => {
    if (thinking.open) renderer.mark(item);
  };
  return item;
}
// 流式 delta 只累计原文/思考并标 pending；到真正绘制前一次性去标签、拆分回答与过程，
// 顺带刷新活动状态（依赖 buffer，不能留在 delta 到达时算）。
function prepareStream(item) {
  // 纯思考 delta 不改原文，未变化的 raw 不重复去标签/拆分。
  if (item.preparedRaw !== item.raw) {
    item.preparedRaw = item.raw;
    // 与最终渲染同序：先剥 goal 完成标记，再剥记忆标签；半截标记由 streaming 模式暂存。
    item.buffer = stripMemoryTags(stripGoalMarkers(item.raw || "", { streaming: true }), { streaming: true });
    // 累计解析：开标签到达即展示回答，半截标签暂存。
    item.processBuffer = "";
    if (!item.task) {
      let split;
      try { split = splitAnswer(item.buffer, { streaming: true }); }
      catch { split = null; }
      if (split) {
        item.buffer = split.answer;
        item.hasAnswer = split.found;
        item.processBuffer = split.process || "";
      }
    }
  }
  updateActivity(item);
}
function renderMessage(item, message) {
  const text = typeof message.content === "string" ? message.content
    : (message.content || []).filter((block) => block?.type === "text").map((block) => block.text).join("\n");
  // 任务通知不进入本函数：实时与历史路径均在 card 之前改道为独立通知条（taskNotificationCard）。
  item.pending = false;
  // 消息已落定，停用摘要让位给最终内容/自身的 stopReason。
  item.stopped = undefined;
  item.modelInfo.replaceChildren();
  if (message.role === 'assistant' && message.model) {
    const identity = document.createElement('span');
    identity.className = 'message-identity';
    const model = document.createElement('span');
    model.className = 'message-model-name';
    model.textContent = message.model;
    identity.append(`${message.provider || '未知供应商'} · `, model);
    if (typeof message.thinkingLevel === 'string' && message.thinkingLevel) {
      const level = document.createElement('span');
      level.textContent = message.thinkingLevel;
      level.title = '思考级别';
      identity.append(' · ', level);
    }
    item.modelInfo.append(identity);
    const tokens = document.createElement('span');
    tokens.className = 'message-tokens';
    for (const [key, arrow, label] of [['input', '↑', '输入 tokens'], ['output', '↓', '输出 tokens']]) {
      const value = message.usage?.[key];
      if (!Number.isFinite(value) || value < 0) continue;
      const count = document.createElement('span');
      count.textContent = `${value.toLocaleString('en-US')}${arrow}`;
      count.title = label;
      count.setAttribute('aria-label', `${label}: ${value}`);
      tokens.append(count);
    }
    if (tokens.childElementCount) item.modelInfo.append(tokens);
  }
  const content =
    typeof message.content === "string"
      ? [{ type: "text", text: message.content }]
      : message.content || [];
  const raw = content
    .filter((c) => c?.type === "text")
    .map((c) => c.text)
    .join("\n");
  // 记忆标签与 goal 完成标记只属于助手自报内容；用户手写同名标签原样保留。顺序与后端展示口径
  // （src/goal.js 的 bodyText）一致：先去完成标记，再剥记忆标签，最后拆正式答复。
  item.buffer = message.role === "assistant" ? stripMemoryTags(stripGoalMarkers(raw)) : raw;
  // 主会话解析 axiom_display；未闭合回答仍展示，子任务透传。
  // 异常走原文回退，保证错误/中断始终可见。
  item.processBuffer = "";
  if (message.role === "assistant" && !item.task) {
    let split;
    try { split = splitAnswer(item.buffer, { streaming: false }); }
    catch { split = { found: false, answer: item.buffer, process: "", incomplete: false, malformed: false }; }
    if (split) {
      item.buffer = split.answer;
      item.hasAnswer = split.found;
      item.processBuffer = split.process || "";
    }
  }
  item.reasoning = content
    .filter((c) => c?.type === "thinking")
    .map((c) => c.thinking)
    .join("\n");
  if (message.role === "user") {
    item.skillBlocks?.remove();
    const blocks = document.createElement("div");
    item.buffer = item.buffer.replace(/<skill name="([^"]+)" location="([^"]*)">\r?\n([\s\S]*?)\r?\n<\/skill>/g, (_, name, location, body) => {
      const details = document.createElement("details");
      details.className = "skill-invocation";
      const summary = document.createElement("summary");
      const badge = document.createElement("span");
      badge.className = "skill-badge";
      badge.textContent = "SKILL";
      const label = document.createElement("span");
      label.className = "skill-name";
      label.textContent = name;
      summary.append(badge, label);
      summary.title = "技能正文已加入本条消息，点击展开";
      const path = document.createElement("small");
      path.textContent = location;
      const content = document.createElement("div");
      content.className = "markdown";
      summary.append(disclosureHint("查看"));
      details.append(summary, path, content);
      let rendered = false;
      details.ontoggle = () => { if (details.open && !rendered) { renderMarkdown(content, body); rendered = true; } };
      blocks.append(details);
      return "";
    }).trim();
    item.skillBlocks = blocks;
    if (blocks.childElementCount) item.node.before(blocks);
  }
  item.ownReasoning = item.reasoning;
  item.images?.remove();
  item.images = document.createElement("div");
  item.images.className = "message-images";
  for (const block of content.filter((c) => c?.type === "image")) {
    if (!/^image\/(png|jpeg|gif|webp)$/.test(block.mimeType) || typeof block.data !== "string" || !/^[A-Za-z0-9+/]+={0,2}$/.test(block.data)) continue;
    const image = document.createElement("img");
    image.src = `data:${block.mimeType};base64,${block.data}`;
    image.alt = "消息附件图片";
    image.loading = "lazy";
    image.onload = scrollLatest;
    enableImagePreview(image);
    item.images.append(image);
  }
  item.node.append(item.images);
  item.node.hidden = message.role === "user" && !item.buffer && !item.images.childElementCount;
  updateActivity(item, ["error", "aborted", "length"].includes(message.stopReason) ? (message.errorMessage || "响应中断") : undefined);
  renderer.flush(item);
}
function renderCompactionStatus(data) {
  const node = $("compaction-progress");
  const labels = { summarizing: "后台压缩：正在生成摘要…", ready: "后台压缩：摘要已就绪，等待下一次请求前应用", applied: "后台压缩：已完成", failed: "后台压缩：失败，保留原文", skipped: "后台压缩：已跳过", cancelled: "后台压缩：已取消" };
  node.replaceChildren();
  node.hidden = !labels[data?.status];
  node.dataset.status = data?.status || "";
  if (node.hidden) return;
  if (data.status === "summarizing") {
    const icon = document.createElement("span");
    icon.className = "task-run-spin";
    icon.setAttribute("aria-hidden", "true");
    node.append(icon);
  }
  const label = document.createElement("span");
  label.textContent = `${labels[data.status]}${data.message ? ` · ${data.message}` : ""}`;
  node.append(label);
}
function trackTaskEntries(message, entryId) {
  if (message.isError || message.role !== "toolResult" || message.toolName?.replace(/^functions\./, "") !== "delegate") return;
  for (const block of Array.isArray(message.content) ? message.content : []) {
    if (block.type !== "text") continue;
    try {
      const ids = JSON.parse(block.text).taskIds;
      if (Array.isArray(ids)) for (const id of ids)
        if (typeof id === "string" && !taskEntries.has(id)) taskEntries.set(id, { entryId, toolCallId: message.toolCallId });
    } catch {}
  }
}
function placeCompactedTasks() {
  placeCompactedRetries();
  const tails = new Map();
  for (const [id, binding] of taskEntries) {
    const task = tasks.get(id);
    if (!task) continue;
    const record = compactions.find((record) => record.compactedMessageIds?.includes(binding.entryId));
    const container = compactionNodes.get(record?.id)?.querySelector(".compaction-tasks");
    if (container) {
      if (task.trigger.parentElement !== container) container.append(task.trigger);
      continue;
    }
    // 工具 ID 定位委派所在执行段，入口留在折叠区外；同批任务沿返回顺序排列。
    let anchor = toolItems.get(`main:${binding.toolCallId}`)?.container;
    while (anchor?.parentElement && anchor.parentElement !== $("output")) {
      if (anchor.parentElement.classList.contains("call-list") && anchor.nextElementSibling) {
        const group = anchor.parentElement.parentElement;
        const tail = createCallGroup();
        while (anchor.nextElementSibling) tail.lastElementChild.append(anchor.nextElementSibling);
        group.after(tail);
        scheduleCallGroups();
      }
      anchor = anchor.parentElement;
    }
    if (anchor?.parentElement !== $("output")) continue;
    const tail = tails.get(anchor) || anchor;
    if (tail.nextElementSibling !== task.trigger) tail.after(task.trigger);
    tails.set(anchor, task.trigger);
  }
}
function compactionCard(data) {
  if (compactionNodes.has(data.id)) return compactionNodes.get(data.id);
  const node = document.createElement("details");
  node.className = "compaction-card";
  const label = document.createElement("summary");
  const badge = document.createElement("span");
  const number = String(compactions.findIndex((record) => record.id === data.id) + 1).padStart(2, "0");
  badge.textContent = `${number} · ${data.progress?.title || "上下文已压缩"}`;
  const meta = document.createElement("small");
  const tokens = (value) => (Number.isFinite(value) ? value.toLocaleString("en-US") : "—");
  meta.textContent = data.progress?.description
    || `压缩前 ${tokens(data.tokensBefore)} tokens${Number.isFinite(data.estimatedTokensAfter) ? ` · 压缩后约 ${tokens(data.estimatedTokensAfter)} tokens` : ""}`;
  const body = document.createElement("div");
  body.className = "markdown compaction-summary";
  label.append(badge, meta, disclosureHint("查看摘要"));
  const taskList = document.createElement("div");
  taskList.className = "compaction-tasks";
  node.append(label, body, taskList);
  compactionNodes.set(data.id, node);
  // renderMarkdown 走 DOMPurify 白名单，摘要里的富文本不会执行。
  renderMarkdown(body, data.summary || "");
  return node;
}
function foldCompaction(data) {
  const ids = new Set(data.compactedMessageIds || []);
  const items = mainItems
    .filter(({ item, entryId }) => entryId && ids.has(entryId) && item.node.isConnected )
    .sort((a, b) => (a.item.node.compareDocumentPosition(b.item.node) & 4 ? -1 : 1));
  if (!items.length) {
    const previous = compactionNodes.get(compactions[compactions.indexOf(data) - 1]?.id);
    if (previous) previous.after(compactionCard(data));
    else $("output").prepend(compactionCard(data));
    placeCompactedTasks();
    return;
  }
  const anchor = items.at(-1).item.node.nextElementSibling;
  const top = anchor?.getBoundingClientRect().top ?? 0;
  const first = items[0].item;
  (first.skillBlocks?.isConnected ? first.skillBlocks : first.node).before(compactionCard(data));
  for (const { item } of items) {
    item.node.hidden = true;
    if (item.processGroup) item.processGroup.remove();
    item.processGroup = undefined;
    if (item.skillBlocks) item.skillBlocks.hidden = true;
  }
  placeCompactedTasks();
  mergeThoughts($("output"));
  // 折叠改变上方高度，按保留消息的位移补偿滚动位置，保持阅读锚点而不强制到底部。
  if (anchor) {
    transcript.scrollTop += anchor.getBoundingClientRect().top - top;
    lastScrollTops.set(transcript, transcript.scrollTop);
  }
}
function compactionEditor(initial, mainModel) {
  initial = { ...compactionDefaults, ...initial };
  const number = (input, max, fractional = false) => {
    const text = input.value.trim();
    if (!text) return null;
    const value = Number(text);
    if (!Number.isFinite(value) || value <= 0 || value > max || (!fractional && !Number.isInteger(value)))
      return NaN;
    return value;
  };
  const node = document.createElement("fieldset");
  node.className = "capability-agent compaction-settings";
  const legend = document.createElement("legend");
  legend.textContent = "自动压缩";
  const toggle = document.createElement("label");
  toggle.className = "compaction-toggle";
  const enabled = Object.assign(document.createElement("input"), { type: "checkbox" });
  enabled.checked = initial.enabled;
  toggle.append(enabled, document.createTextNode("启用自动压缩"));
  const selectors = document.createElement("div");
  selectors.className = "selectors settings-selectors";
  const field = (text, input) => {
    const label = document.createElement("label");
    const span = document.createElement("span");
    span.textContent = text;
    label.append(span, input);
    selectors.append(label);
    return input;
  };
  const token = field("Token 阈值", Object.assign(document.createElement("input"), { type: "number", min: "1", placeholder: "不启用" }));
  token.value = initial.tokenThreshold ?? "";
  const percent = field("百分比阈值", Object.assign(document.createElement("input"), { type: "number", min: "0", max: "100", step: "any", placeholder: "不启用" }));
  percent.value = initial.percentThreshold ?? "";
  const keep = field("保留最近 tokens", Object.assign(document.createElement("input"), { type: "number", min: "1" }));
  keep.value = initial.keepRecentTokens;
  const model = field("压缩模型", document.createElement("select"));
  model.dataset.modelKind = "model";
  modelPicker.enhance(model, "model");
  options(model, [["", "跟随主代理模型"], ...modelEntries()], initial.model || "");
  const thinking = field("压缩思考等级", document.createElement("select"));
  thinking.dataset.modelKind = "thinking";
  modelPicker.enhance(thinking, "thinking");
  const read = () => {
    const kept = number(keep, Number.MAX_SAFE_INTEGER);
    return {
      enabled: enabled.checked,
      tokenThreshold: number(token, Number.MAX_SAFE_INTEGER),
      percentThreshold: number(percent, 100, true),
      model: model.value || null,
      thinking: thinking.value,
      keepRecentTokens: kept == null ? compactionDefaults.keepRecentTokens : kept,
    };
  };
  const error = () => {
    if (Number.isNaN(number(token, Number.MAX_SAFE_INTEGER))) return "Token 阈值需为大于 0 的整数";
    if (Number.isNaN(number(percent, 100, true))) return "百分比阈值需为大于 0 且不超过 100 的数值";
    if (Number.isNaN(number(keep, Number.MAX_SAFE_INTEGER))) return "保留最近 tokens 需为大于 0 的整数";
    const value = read();
    return value.enabled && value.tokenThreshold == null && value.percentThreshold == null
      ? "启用自动压缩时至少设置一个触发阈值" : "";
  };
  const valid = () => !error();
  const fillThinking = () => {
    const levels = models.find((m) => m.key === (model.value || mainModel()))?.levels || thinkingLevels;
    const current = thinking.value || initial.thinking;
    options(thinking, levels.map((v) => [v, v]), levels.includes(current) ? current : "off");
  };
  model.onchange = fillThinking;
  fillThinking();
  const hint = document.createElement("p");
  hint.className = "compaction-hint";
  hint.textContent = "两个阈值至少填一个（先到先触发，可同时设置）；较早对话折叠为摘要卡片，保留最近内容，压缩固定不使用工具。";
  node.append(legend, toggle, selectors, hint);
  return { node, read, valid, error, fillThinking };
}
// 重试错误词编辑器：两组 chip 列表（白名单/黑名单），字符串子串匹配、大小写不敏感。
// 回车提交、重复（不区分大小写）拒收、Backspace 空输入时删除末尾、每条 chip × 可删。
// 默认配置面板靠 form 的 change 冒泡自动保存：chip 增删是脚本改状态，浏览器不会自己发 change
// （Enter 上 preventDefault 连隐式提交也没有，且清空 input 会重置脏值标记），故每次改动手动派发。
function retryChipList(labelText, initial) {
  const state = [...initial];
  const wrap = document.createElement("div");
  wrap.className = "retry-patterns";
  const label = document.createElement("span");
  label.className = "retry-patterns-label";
  label.textContent = labelText;
  const chips = document.createElement("div");
  chips.className = "retry-chips";
  const input = Object.assign(document.createElement("input"), { type: "text", maxLength: 200, placeholder: "输入关键词后回车添加，如：429、overloaded" });
  input.setAttribute("aria-label", `${labelText}关键词`);
  const render = () => {
    chips.replaceChildren(...state.map((value, index) => {
      const chip = document.createElement("span");
      chip.className = "retry-chip";
      const text = document.createElement("span");
      text.textContent = value;
      const remove = document.createElement("button");
      remove.type = "button";
      remove.textContent = "×";
      remove.setAttribute("aria-label", `删除 ${value}`);
      remove.onclick = () => { state.splice(index, 1); render(); input.focus(); notify(); };
      chip.append(text, remove);
      return chip;
    }));
  };
  const notify = () => input.dispatchEvent(new Event("change", { bubbles: true }));
  // 提交输入框里待定的关键词，返回是否真的改了状态（空值与重复只清输入框）。
  const commit = () => {
    const value = input.value.trim();
    input.value = "";
    if (!value || state.some((existing) => existing.toLowerCase() === value.toLowerCase())) return false;
    state.push(value);
    render();
    return true;
  };
  input.onkeydown = (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      if (commit()) notify();
    } else if (event.key === "Backspace" && !input.value && state.length) {
      state.pop();
      render();
      notify();
    }
  };
  // 只打字没回车就离开（失焦、关面板）时浏览器发的 change 先到 input 再冒到 form：
  // 这里补提交，form 读到的状态已含这条关键词，不静默丢字。派发出去的合成 change 回到这里是空操作。
  input.onchange = () => { commit(); };
  render();
  wrap.append(label, chips, input);
  return { node: wrap, values: () => [...state] };
}
function retryEditor(initial) {
  initial = initial || {};
  const node = document.createElement("fieldset");
  node.className = "capability-agent retry-settings";
  const legend = document.createElement("legend");
  legend.textContent = "自动重试";
  const white = retryChipList("强制重试（错误消息含关键词即重试）", initial.retryable || []);
  const black = retryChipList("强制不重试（命中关键词立即停止）", initial.nonRetryable || []);
  const hint = document.createElement("p");
  hint.className = "compaction-hint";
  hint.textContent = "按错误消息里的子串匹配（不区分大小写）；黑名单优先于白名单，二者都优先于内建判定（内建默认重试 429、5xx、网络与流中断等）。仅对新建会话生效。";
  node.append(legend, white.node, black.node, hint);
  return {
    node,
    read: () => ({ retryable: white.values(), nonRetryable: black.values() }),
    valid: () => true,
    error: () => "",
  };
}
// 运行摘要复用 tasks map，点击定位原卡片，不复制详情渲染。
function renderTaskRuns() {
  const active = [...tasks.values()].filter((task) => ["starting", "running"].includes(task.trigger.dataset.status));
  $("task-runs").replaceChildren(...active.map((task) => {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "task-run";
    row.title = `定位子代理：${task.trigger.title}`;
    row.setAttribute("aria-label", row.title);
    row.onclick = () => {
      follow = false;
      $("latest").hidden = false;
      for (let parent = task.trigger.parentElement; parent; parent = parent.parentElement)
        if (parent.tagName === "DETAILS") parent.open = true;
      task.trigger.scrollIntoView({ block: "center" });
      locatedScroll = $("transcript").scrollTop;
      task.trigger.focus({ preventScroll: true });
    };
    const icon = document.createElement("span");
    icon.className = "task-run-spin";
    icon.setAttribute("aria-hidden", "true");
    const label = document.createElement("span");
    label.className = "task-run-text";
    label.textContent = task.trigger.title;
    row.append(icon, label);
    return row;
  }));
  $("task-runs").hidden = !active.length;
}
function renderQueue(queue = {}) {
  const entries = [["Steer", "steering"], ["Follow-up", "followUp"]];
  $("message-queue").replaceChildren(...entries.flatMap(([type, key]) => (queue[key] || []).map((text, index) => {
    const row = document.createElement("button");
    row.type = "button";
    row.title = "撤回全部队列到输入框修改（与 Pi 原生一致）";
    row.onclick = () => { void withdrawQueue(); };
    const badge = document.createElement("strong");
    badge.textContent = type;
    const content = document.createElement("span");
    const count = queue.images?.[key]?.[index]?.length || 0;
    content.textContent = [text, count ? `[图片 × ${count}]` : ""].filter(Boolean).join(" ");
    row.append(badge, content);
    return row;
  })));
  $("message-queue").hidden = !$("message-queue").children.length;
}
// 异常停止（Esc 停止、终态错误、重试用尽）后在会话流末尾给一个手动重试入口。
// 主代理判定与 src/retry.js canResume 同步；子代理由 task.state.canRetry 控制独立入口。
const canResumeMessage = (message) =>
  !!message && (message.role !== "assistant" || ["error", "aborted", "length", "toolUse"].includes(message.stopReason));
let retryPrompt;
function syncRetryPrompt() {
  if (historyState?.history?.nextCursor || !(interrupted && !busy && connected && !changing && sessionId && !sessionMissing)) return void retryPrompt?.remove();
  if (!retryPrompt) {
    retryPrompt = document.createElement("div");
    retryPrompt.className = "retry-prompt";
    const hint = document.createElement("span");
    hint.textContent = "上一次请求未正常结束。";
    const button = document.createElement("button");
    button.type = "button";
    button.className = "secondary";
    button.textContent = "↻ 重试";
    button.title = "接着上次中断的地方继续，不重发你的输入";
    button.onclick = async () => {
      button.disabled = true;
      // 成功后服务端转 running，session.state 会把本卡片收走；失败则原地重新可点。
      try { await request("session.retry", { sessionId }); }
      catch (e) { error(e); button.disabled = false; }
    };
    retryPrompt.append(hint, button);
    retryPrompt.button = button;
    retryPrompt.hint = hint;
  }
  retryPrompt.hint.textContent = canReask ? "提问已取消，可以重新打开原问题。" : "上一次请求未正常结束。";
  retryPrompt.button.textContent = canReask ? "↻ 重新提问" : "↻ 重试";
  retryPrompt.button.title = canReask ? "直接重新调用提问工具，回答后继续原任务" : "接着上次中断的地方继续，不重发你的输入";
  retryPrompt.button.disabled = false;
  if ($("output").lastElementChild === retryPrompt) return;
  $("output").querySelector(".empty")?.remove();
  $("output").append(retryPrompt);
  scrollLatest();
}
const retryCards = new Map();
function placeCompactedRetries() {
  for (const record of retryCards.values()) {
    if (record.agentId !== "main") {
      const task = tasks.get(record.agentId);
      if (!task) continue;
      // agentId 就是持久化的任务 ID；子任务重试固定归属任务，不猜消息下标。
      if (!task.retries) {
        task.retries = document.createElement("div");
        task.retries.className = "task-retries";
        task.description.after(task.retries);
      }
      if (record.node.parentElement !== task.retries) {
        const oldArchive = record.node.closest(".retry-archive");
        task.retries.append(record.node);
        if (oldArchive && !oldArchive.querySelector(".retry-card")) oldArchive.remove();
      }
      continue;
    }
    if (!record.anchorEntryId) continue;
    const compacted = compactions.find(c => c.compactedMessageIds?.includes(record.anchorEntryId));
    const parent = compactionNodes.get(compacted?.id)?.querySelector(".compaction-tasks");
    if (parent && record.node.parentElement !== parent) parent.append(record.node);
  }
}
function retryArchive(output) {
  let archive = output.querySelector(":scope > .retry-archive");
  if (!archive) {
    archive = document.createElement("details");
    archive.className = "compaction-card retry-archive";
    const summary = document.createElement("summary");
    summary.textContent = "历史重试记录（原位置无法确认）";
    summary.append(disclosureHint());
    archive.append(summary);
    output.prepend(archive);
  }
  return archive;
}
function renderRetry(agentId = "main", data, historical = false) {
  const key = `${agentId}:${data.id}`;
  let record = retryCards.get(key);
  if (!record) {
    const node = document.createElement("details");
    node.className = "retry-card";
    const summary = document.createElement("summary");
    const history = document.createElement("ol");
    const status = document.createElement("p");
    status.setAttribute("role", "status");
    node.append(summary, status, history);
    const output = tasks.get(agentId)?.output || $("output");
    output.querySelector(".empty")?.remove();
    const unknown = agentId === "main" && historical && (!Number.isInteger(data.messageCount) || data.messageCount < 0);
    (unknown || (agentId !== "main" && !tasks.has(agentId)) ? retryArchive(output) : output).append(node);
    const label = document.createElement("span");
    summary.append(label, disclosureHint());
    record = { node, summary: label, history, status, attempts: new Set(), agentId,
      anchorEntryId: data.anchorEntryId || (!historical && agentId === "main" ? mainItems.at(-1)?.entryId : undefined) };
    retryCards.set(key, record);
  }
  for (const attempt of data.history || (data.status === "waiting" ? [data] : [])) {
    if (record.attempts.has(attempt.attempt)) continue;
    record.attempts.add(attempt.attempt);
    const row = document.createElement("li");
    row.textContent = `第 ${attempt.attempt} 次 · 等待 ${attempt.delayMs / 1000} 秒 · ${attempt.error || "异常中断"}`;
    record.history.append(row);
  }
  const labels = { waiting: "等待重试", running: "正在重试", succeeded: "重试成功", failed: "重试失败", cancelled: "重试已停止" };
  record.summary.textContent = `${labels[data.status] || data.status} · ${data.attempt}/${data.maxRetries || 45}`;
  record.status.textContent = data.status === "waiting"
    ? `预计 ${new Date(data.nextRetryAt).toLocaleString()} 继续，可点击 Stop 停止。`
    : data.status === "succeeded" ? "任务已恢复，展开可查看重试过程。" : data.error || "继续执行任务…";
  if (record.lastStatus !== data.status) record.node.open = data.status !== "succeeded";
  record.lastStatus = data.status;
  record.anchorEntryId ||= data.anchorEntryId;
  placeCompactedRetries();
  scrollLatest();
}
function applyEvent(message) {
  if (message.type === "session.deleted") {
    if (message.sessionId === sessionId) {
      sessionMissing = true;
      saveView();
      region("输入操作", updateComposer);
      if (connected && !changing) void recoverMissingSession();
    }
    void refreshSessions().catch(error);
    return;
  }
  if (message.sessionId !== sessionId) return;
  const { type, agentId = "main", data } = message;
  if (type === "agent.message.start" && data.message.role === "assistant") rawLive.set(agentId, rawEntry(JSON.parse(JSON.stringify(data.message)), agentId, { messageId: data.messageId }));
  if (type === "agent.delta" && ["text_delta", "thinking_delta"].includes(data.type)) {
    if (!rawLive.has(agentId)) rawLive.set(agentId, rawEntry({ role: "assistant", content: [] }, agentId));
    const entry = rawLive.get(agentId);
    const blocks = Array.isArray(entry.message.content) ? entry.message.content : (entry.message.content = []);
    const kind = data.type === "text_delta" ? "text" : "thinking";
    const index = data.contentIndex ?? 0;
    blocks[index] ||= { type: kind, [kind]: "" };
    blocks[index][kind] = (blocks[index][kind] || "") + data.delta;
  }
  let endedRaw;
  if (type === "agent.message.end") {
    endedRaw = rawLive.get(agentId) || rawEntry(data.message, agentId);
    endedRaw.message = data.message;
    endedRaw.messageId = data.messageId || endedRaw.messageId;
    endedRaw.entryId = data.entryId;
    rawLive.delete(agentId);
  }
  if (type.startsWith("agent.message.") || type === "agent.delta") rawChanged();
  if (type === "question.asked") region("输入操作", () => questionUI.asked(message.sessionId, data));
  if (type === "question.closed") region("输入操作", () => questionUI.closed(message.sessionId, data.toolCallId));
  if (type === "goal") {
    region("对话展示", () => goalUI.show(sessionId, data?.goal ?? message.goal, goalAnchors));
    return;
  }
  if (type === "agent.compaction.status" && agentId === "main") renderCompactionStatus(data);
  if (type === "agent.message.end" && agentId === "main") {
    lastMainMessage = data.message;
    trackTaskEntries(data.message, data.entryId);
    placeCompactedTasks();
    // 每条主代理消息（含工具结果）占一个 state.messages 槽位，计数与下标保持同构。
    goalAnchorCount++;
  }
  if (type === "agent.retry") {
    stopActivity(agentId, data.status === "waiting" ? "等待重试" : "已停止");
    renderRetry(agentId, data);
    if (data.status === "running") waiting(agentId);
  }
  if (type === "tool.state") {
    toolState(agentId, data);
    if (data.phase === "end" && (agentId === "main" ? busy : tasks.get(agentId)?.node.dataset.status === "running")) waiting(agentId);
  }
  if (type === "agent.message.end" && data.message.role === "toolResult") {
    toolState(agentId, { ...data.message, phase: "end" });
  }
  if (type === "session.queue" && agentId === "main") renderQueue(data);
  if (type === "session.title") {
    $("session-title").textContent = data.title || "新会话";
    updatePageTitle();
  }
  if (type === "agent.message.end" && isTaskNotification(data.message)) {
    // 任务通知（custom 新形态或 user+前缀旧形态）：独立通知条渲染，与用户消息区分；
    // 槽位计数在上方 main 通用分支已统一进行，通知不 anchorGoal、不进 mainItems，保持下标同构。
    clearWaiting(agentId);
    bindRaw(taskNotificationCard(data.message, agentId), endedRaw);
  }
  if (type === "agent.message.end" && data.message.role === "user" && !isTaskNotification(data.message)) {
    clearWaiting(agentId);
    const item = card("你", tasks.get(agentId));
    bindRaw(item, endedRaw);
    renderMessage(item, data.message);
    if (agentId === "main") {
      mainItems.push({ item, entryId: data.entryId });
      anchorGoal(goalAnchorCount - 1, item, data.entryId);
      goalUI.anchors(goalAnchors);
    }
    if (busy) waiting(agentId);
  }
  if (type === "agent.runtime") {
    if (agentId === "main") {
      runtime = data;
      region("设置与详情", () => renderRuntime($("session-runtime"), runtime));
    } else region("设置与详情", () => updateTaskRuntime(tasks.get(agentId), data));
  }
  if (type === "session.state") {
    applyElapsed(data);
    void refreshSessions().catch(error);
    busy = data.status !== "idle";
    canReask = !!data.canReask;
    // 安全停止只在本次运行内有效：下一次 running 不带 safeStop 时就该恢复正常按钮。
    safeStopping = busy && !!data.safeStop;
    if (data.status === "running") stopAlert = false;
    if (data.status === "running") waiting("main");
    else stopActivity("main", data.status === "cancelling" ? "正在停止…" : "已结束");
    // 正在看的会话跑完就算已读；否则切走后会被错标成「待查看」。
    // 例外：安全停止落地时不标已读 —— 用户可能早已去干别的事，靠红点提醒回来接着看。
    if (data.status === "idle" && data.stopped === "safe") stopAlert = true;
    else if (data.status === "idle") markSessionSeen(sessionId);
    // 停稳了才判断能不能续：message.end 总先于 idle 到达，此时 lastMainMessage 已是本轮结果。
    if (data.status === "running") interrupted = false;
    else if (data.status === "idle") interrupted = canReask || canResumeMessage(lastMainMessage);
    region("输入操作", updateComposer);
  }
  if (type === "agent.message.start" && data.message.role === "assistant") {
    clearWaiting(agentId);
    const previous = live.get(agentId);
    if (previous) { renderer.flush(previous); renderer.disposeMessage(previous); }
    live.set(
      agentId,
      card(
        agentId === "main" ? "AXIOM" : `子 Agent · ${agentId.slice(0, 8)}`,
        tasks.get(agentId),
      ),
    );
    bindRaw(live.get(agentId), rawLive.get(agentId));
    live.get(agentId).active = true;
    updateActivity(live.get(agentId));
  }
  if (type === "agent.delta") {
    const item = live.get(agentId);
    if (!item) return;
    // 只累计并标待处理：stripGoalMarkers/stripMemoryTags/splitAnswer/活动状态都留到绘制前一次完成。
    if (data.type === "text_delta") {
      item.raw = (item.raw || "") + data.delta;
      item.pending = true;
    }
    else if (data.type === "thinking_delta") {
      item.reasoning += data.delta;
      item.pending = true;
    }
    else if (data.type === "thinking_start") { setActivity(item.activity, "thinking...", "thinking"); return; }
    else if (data.type === "toolcall_start" || data.type === "toolcall_delta") { setActivity(item.activity, "calling...", "running"); return; }
    else if (data.type === "toolcall_end") { toolState(agentId, { phase: "start", toolCallId: data.toolCall.id, toolName: data.toolCall.name, args: data.toolCall.arguments }); return; }
    else return;
    renderer.mark(item);
  }
  if (type === "agent.message.end" && data.message.role === "assistant") {
    const item =
      live.get(agentId) ||
      card(agentId === "main" ? "AXIOM" : "子 Agent", tasks.get(agentId));
    clearWaiting(agentId);
    if (!endedRaw.item) bindRaw(item, endedRaw);
    item.active = false;
    live.set(agentId, item);
    for (const call of Array.isArray(data.message.content) ? data.message.content : [])
      if (call.type === "toolCall") toolState(agentId, { phase: "start", toolCallId: call.id, toolName: call.name, args: call.arguments });
    renderMessage(item, data.message);
    mergeThoughts(item.node.parentElement);
    live.delete(agentId);
    if (agentId === "main") {
      mainItems.push({ item, entryId: data.entryId });
      anchorGoal(goalAnchorCount - 1, item, data.entryId);
      goalUI.anchors(goalAnchors);
    }
  }
  if (type === "agent.compaction" && agentId === "main" && !compactions.some((c) => c.id === data.id)) {
    compactions.push(data);
    foldCompaction(data);
  }
  if (type === "task.state") {
    applyElapsed(data);
    if (!tasks.has(message.taskId)) {
      const fragment = $("task-template").content.cloneNode(true);
      const trigger = fragment.querySelector(".task-card");
      const node = fragment.querySelector("dialog");
      const heading = node.querySelector("h2");
      node.id = `task-${message.taskId}`;
      heading.id = `${node.id}-title`;
      node.setAttribute("aria-labelledby", heading.id);
      node.querySelector(".task-system-prompt > summary").append(disclosureHint("查看"));
      trigger.setAttribute("aria-controls", node.id);
      const task = {
        node, trigger, heading, messages: [], follow: true,
        title: trigger.querySelector(".task-title"),
        status: trigger.querySelector(".task-status"),
        output: node.querySelector(".task-body"),
        runtime: node.querySelector(".runtime-summary"),
        description: node.querySelector(".task-description"),
        systemPrompt: node.querySelector(".task-system-prompt pre"),
        failure: node.querySelector(".task-error"),
      };
      const retryButton = document.createElement("button");
      retryButton.type = "button";
      retryButton.className = "secondary";
      retryButton.textContent = "↻ 重试";
      retryButton.title = "接着上次中断的地方继续，不重新委派任务";
      retryButton.hidden = true;
      task.retryButton = retryButton;
      const taskSessionId = sessionId;
      retryButton.onclick = async () => {
        if (task.retrying || !connected || changing || sessionMissing) return;
        task.retrying = retryButton.disabled = true;
        try { await request("task.retry", { sessionId: taskSessionId, taskId: message.taskId }); }
        catch (e) { if (sessionId === taskSessionId) error(e); }
        finally {
          task.retrying = false;
          retryButton.disabled = !connected || changing || sessionMissing;
        }
      };
      task.failure.after(retryButton);
      trigger.onclick = () => {
        activeTask = task;
        node.showModal();
        for (const item of task.messages) renderer.mark(item);
        scrollLatest();
      };
      for (const button of node.querySelectorAll("[data-scroll]")) button.onclick = () => {
        task.follow = button.dataset.scroll === "bottom";
        task.output.scrollTop = task.follow ? task.output.scrollHeight : 0;
        lastScrollTops.set(task.output, task.output.scrollTop);
      };
      for (const event of ["wheel", "touchstart", "touchmove", "keydown", "pointerdown"])
        task.output.addEventListener(event, () => noteScrollIntent(task.output), { capture: true, passive: true });
      task.output.onscroll = () => { task.follow = readFollow(task.output, task.follow); };
      watchGrowth(task.output, () => { if (node.open && task.follow) scrollLatest(); });
      node.onclose = () => { if (!node.open && activeTask === task) activeTask = undefined; };
      node.onclick = (e) => {
        if (e.target !== node) return;
        const rect = node.getBoundingClientRect();
        if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom)
          node.close();
      };
      $("output").querySelector(".empty")?.remove();
      $("output").append(trigger);
      $("task-overlays").append(node);
      tasks.set(message.taskId, task);
    }
    const item = tasks.get(message.taskId);
    item.trigger.dataset.status = item.node.dataset.status = data.status;
    const status = { starting: "启动中", running: "运行中", completed: "已完成", failed: "失败", cancelled: "已取消" }[data.status] || data.status;
    item.status.textContent = status;
    item.heading.textContent = `子代理 · ${status}`;
    item.title.textContent = item.trigger.title = data.task;
    item.description.textContent = data.task;
    item.failure.textContent = data.error || "";
    item.failure.hidden = !data.error;
    item.retryButton.hidden = !data.canRetry;
    item.retryButton.disabled = !connected || changing || sessionMissing || !!item.retrying;
    updateTaskRuntime(item, data.runtime);
    placeCompactedTasks();
    renderTaskRuns();
    if (["starting", "running"].includes(data.status)) waiting(message.taskId);
    else stopActivity(message.taskId, status);
    scrollLatest();
  }
  if (type === "session.billing") {
    sessionBill = data;
    renderRuntime($("session-runtime"), runtime);
  }
  if (type === "error") error(data.message);
}
// History extends the mounted timeline; fetching older records never gates live events.
function prefetchHistory() {
  if (!connected || changing || historyLoading || document.hidden || !historyState?.history?.prevCursor) return;
  if (transcript.clientHeight > 0 && (transcript.scrollHeight <= transcript.clientHeight + 80 || transcript.scrollTop < transcript.clientHeight))
    void loadHistory({ before: historyState.history.prevCursor });
}
function prependHistory(state) {
  const output = $("output");
  const anchor = [...output.children].find(node => node.getBoundingClientRect().bottom > transcript.getBoundingClientRect().top);
  const top = anchor?.getBoundingClientRect().top;
  const previous = new Set(output.children);
  const ids = new Set(rawEntries.map(entry => entry.messageId || entry.entryId));
  const entries = state.messages.filter(entry => !ids.has(entry.messageId || entry.entryId));
  const savedLive = new Map(live);
  const savedMainItems = mainItems;
  mainItems = [];
  live.clear();
  rawEntries = [...entries, ...rawEntries];
  historyState.messages = rawEntries;
  historyState.history = { ...historyState.history, start: state.history.start, prevCursor: state.history.prevCursor };
  for (const record of state.compactions || [])
    if (!compactions.some(existing => existing.id === record.id)) compactions.push(record);
  const folded = new Map();
  for (const record of compactions) for (const id of record.compactedMessageIds || []) folded.set(id, record);
  const restoreRetries = (index) => {
    for (const record of state.retries || []) {
      const boundary = Number.isInteger(record.messageCount) ? record.messageCount : entries.length;
      if (boundary !== index || retryCards.has(`${record.agentId || "main"}:${record.id}`)) continue;
      const anchor = entries.slice(0, index).findLast(entry => entry.agentId === (record.agentId || "main"))?.entryId;
      renderRetry(record.agentId, { ...record, anchorEntryId: record.anchorEntryId || anchor }, true);
    }
  };
  const ctx = { state, folded, placed: new Set(compactionNodes.keys()), foldedTools: new Set(), restoreRetries };
  for (const task of state.tasks || []) if (!tasks.has(task.id))
    applyEvent({ type: "task.state", sessionId, taskId: task.id, data: task });
  for (const entry of entries) if (entry.agentId === "main") trackTaskEntries(entry.message, entry.entryId);
  for (let index = 0; index < entries.length; index++) placeSnapshotMessage(ctx, index, entries[index]);
  restoreRetries(entries.length);
  mainItems.push(...savedMainItems);
  live.clear();
  for (const [id, item] of savedLive) live.set(id, item);
  const added = [...output.children].filter(node => !previous.has(node));
  output.prepend(...added);
  mergeThoughts(output);
  for (const task of tasks.values()) mergeThoughts(task.output);
  placeCompactedTasks();
  rawChanged();
  goalUI.anchors(goalAnchors);
  if (anchor?.isConnected) transcript.scrollTop += anchor.getBoundingClientRect().top - top;
  lastScrollTops.set(transcript, transcript.scrollTop);
}
let snapshotJob = 0;
function snapshot(state, onReady) {
  ++historyRequest;
  historyLoading = false;
  historyDirty = false;
  historyState = state = { ...state, messages: [...state.messages] };
  hiddenDirty = document.hidden;
  transport.beginSnapshot();
  try {
    if (!document.hidden) mountHistory(state, onReady);
    else { sessionId = state.sessionId; onReady?.(); }
    transport.commitSnapshot(state);
    const view = views.get(state.sessionId);
    if (!document.hidden && state.history && !view?.follow && view?.anchor && !state.messages.some(entry => entry.messageId === view.anchor)) {
      const saved = { ...view };
      queueMicrotask(() => { if (sessionId === state.sessionId) void loadHistory({ target: saved.anchor }, saved); });
    }
  } catch (e) { transport.failSnapshot(); throw e; }
}
function mountHistory(state, onReady) {
  const job = ++snapshotJob;
  const ctx = beginSnapshot(state, state.sessionId);
  onReady?.();
  for (let index = 0; index < state.messages.length; index++)
    placeSnapshotMessage(ctx, index, state.messages[index]);
  finishSnapshot(job, ctx);
  paintHistoryControls();
}
function paintHistoryControls() {
  const page = historyState?.history;
  const bar = $("history-pages");
  if (!bar) return;
  bar.hidden = !page || (!historyLoading && !historyDirty);
  $("history-before").hidden = true;
  $("history-after").hidden = true;
  $("history-newest").hidden = !historyDirty;
  $("history-before").disabled = historyLoading || !page?.prevCursor;
  $("history-after").disabled = historyLoading || (!page?.nextCursor && !historyDirty);
  $("history-position").textContent = page
    ? (historyLoading ? "正在加载更早消息…" : historyDirty ? "有新消息 · 回到最新查看" : "") : "";
}
async function loadHistory(options = {}, reading) {
  if (historyLoading || !historyState?.history || changing) return;
  saveView();
  const target = sessionId, revision = historyState.history.revision;
  const instance = historyState.instanceId, token = ++historyRequest, events = historyEvents;
  historyLoading = true;
  paintHistoryControls();
  try {
    const state = await request("session.history", { sessionId: target, limit: HISTORY_LIMIT, ...options });
    if (token !== historyRequest || target !== sessionId || instance !== historyState?.instanceId || revision !== historyState?.history.revision) return;
    // Preserve input typed while the page request was in flight.
    saveView();
    // A page is not a realtime snapshot: never commit its seq to transport.
    if (options.before) {
      if (!document.hidden) prependHistory(state);
      else hiddenDirty = true;
      return;
    }
    historyState = state;
    historyDirty = historyEvents !== events;
    if (historyDirty && !state.history.nextCursor) state.history.nextCursor = "pending";
    // Explicit page navigation starts at its top, not at an unrelated old scroll offset.
    const view = views.get(target);
    if (view) { view.follow = false; view.scroll = 0; view.anchor = reading?.anchor; view.anchorOffset = reading?.anchorOffset || 0; }
    if (!document.hidden) mountHistory(state);
    else hiddenDirty = true;
  } catch (e) {
    if (token === historyRequest && target === sessionId) error(`历史页读取失败，请返回最新重试：${e.message}`);
  } finally {
    if (token === historyRequest) { historyLoading = false; paintHistoryControls(); requestAnimationFrame(prefetchHistory); }
  }
}
async function latestHistory() {
  if (historyLoading || changing || !connected) return;
  saveView();
  const target = sessionId, token = ++historyRequest;
  historyLoading = true;
  try {
    const state = await request("session.attach", { sessionId: target });
    if (token !== historyRequest || target !== sessionId) return;
    saveView();
    const view = views.get(target);
    if (view) { view.follow = true; view.anchor = undefined; }
    snapshot(state);
  } catch (e) { if (target === sessionId) { transport.failSnapshot(); error(e); } }
  finally { if (target === sessionId) { historyLoading = false; paintHistoryControls(); } }
}
function receiveHistoryEvent(message) {
  if (message.type === "session.deleted" || message.sessionId !== sessionId || !historyState?.history) return applyEvent(message);
  const { type, data } = message;
  ++historyEvents;
  // Old-page and hidden views don't accumulate events or create background history DOM.
  // Server history is authoritative; returning to latest fetches one bounded snapshot.
  const parked = document.hidden || !!historyState.history.nextCursor;
  if (type === "session.history.changed" && data.revision !== historyState.history.revision) {
    historyState.history.revision = data.revision;
    ++historyRequest;
    historyLoading = false;
    historyDirty = true;
    if (!document.hidden) void latestHistory();
    return;
  }
  if (parked) {
    historyDirty = true;
    hiddenDirty ||= document.hidden;
    if (!document.hidden) {
      // Business controls still reflect real status; only history drawing is parked.
      if (type === "session.state") {
        busy = data.status !== "idle";
        safeStopping = busy && !!data.safeStop;
        canReask = !!data.canReask;
        region("输入操作", updateComposer);
      }
      if (type === "session.queue") renderQueue(data);
      if (type === "question.asked") questionUI.asked(message.sessionId, data);
      if (type === "question.closed") questionUI.closed(message.sessionId, data.toolCallId);
      paintHistoryControls();
    }
    return;
  }
  applyEvent(message);
  if (type === "agent.message.end") {
    historyState.messages = rawEntries;
    historyState.history.total++;
    paintHistoryControls();
  }
}
document.addEventListener("visibilitychange", () => {
  if (!document.hidden && hiddenDirty) {
    hiddenDirty = false;
    void latestHistory();
  }
});
// 换页时卸载旧页，只建立当前页的索引。
function beginSnapshot(state, target) {
  // 原文对照与当前页共用消息，不维护另一份历史副本。
  rawEntries = state.messages;
  // View handles belong only to this mounted page; message objects remain authoritative.
  for (const entry of rawEntries) { delete entry.item; delete entry.node; }
  rawLive.clear();
  $("raw-io-list").replaceChildren();
  rawChanged();
  locatedScroll = undefined;
  lastScrollTops.delete(transcript);
  clearTimeout(escapeTimer);
  escapeTimer = undefined;
  recallArmedUntil = 0;
  activeTask?.node.close();
  activeTask = undefined;
  $("task-overlays").replaceChildren();
  renderer.clear();
  if (scrollFrame !== undefined) cancelAnimationFrame(scrollFrame);
  scrollFrame = undefined;
  sessionMissing = false;
  sessionId = target;
  questionUI.show(sessionId, state.questions);
  try {
    sessionStorage.setItem("axiom.session", sessionId);
  } catch {}
  const sessionHash = `#${new URLSearchParams({ session: sessionId })}`;
  if (location.hash !== sessionHash) history.replaceState(null, "", sessionHash);
  markSessionSeen(sessionId);
  $("session-title").textContent = state.title || "新会话";
  currentCwd = state.cwd;
  $("workspace-label").textContent = state.cwd;
  updatePageTitle();
  busy = state.status !== "idle";
  safeStopping = busy && !!state.safeStop;
  stopAlert = false;
  lastMainMessage = state.messages.findLast((entry) => entry.agentId === "main")?.message || null;
  canReask = !!state.canReask;
  interrupted = !state.history?.nextCursor && !busy && (canReask || canResumeMessage(lastMainMessage));
  $("output").replaceChildren();
  live.clear();
  toolItems.clear();
  waitingItems.clear();
  for (const task of tasks.values()) forgetGrowth(task.output);
  tasks.clear();
  renderTaskRuns();
  retryCards.clear();
  compactions = state.compactions || [];
  compactionNodes.clear();
  taskEntries.clear();
  renderCompactionStatus(state.compactionStatus);
  for (const { agentId, message, entryId } of state.messages)
    if (agentId === "main") trackTaskEntries(message, entryId);
  mainItems = [];
  goalAnchors = new Map();
  goalAnchorCount = 0;
  for (const task of state.tasks) {
    // 页内 task 恢复不进入实时事件归并。
    applyEvent({ type: "task.state", sessionId, taskId: task.id, data: task });
    tasks.get(task.id).trigger.remove();
  }
  const folded = new Map();
  for (const record of compactions)
    for (const entryId of record.compactedMessageIds || [])
      if (!folded.has(entryId)) folded.set(entryId, record);
  const placed = new Set(), foldedTools = new Set();
  const retriesAt = new Map();
  for (const record of state.retries || []) {
    // 无可靠边界的旧记录单独归档，不伪装成任务结束后的事件。
    const localIndex = record.messageCount;
    const valid = Number.isInteger(localIndex) && localIndex >= 0 && localIndex <= state.messages.length;
    const index = valid ? localIndex : state.messages.length;
    if (!retriesAt.has(index)) retriesAt.set(index, []);
    retriesAt.get(index).push(valid ? record : { ...record, messageCount: undefined });
  }
  const restoreRetries = (index) => {
    for (const record of retriesAt.get(index) || []) {
      const anchor = Number.isInteger(record.messageCount) ? state.messages.slice(0, index)
        .findLast(entry => entry.agentId === (record.agentId || "main"))?.entryId : undefined;
      renderRetry(record.agentId, { ...record, anchorEntryId: record.anchorEntryId || anchor }, true);
    }
  };
  // 草稿/附件独立于可丢弃的历史页恢复。
  const view = views.get(sessionId);
  $("prompt").value = view?.draft || "";
  contextFiles = [...(view?.contextFiles || [])];
  images = [...(view?.images || [])];
  renderImages();
  selectedSkill = view?.selectedSkill || "";
  filePicker.close();
  closeCompletion();
  $("context-menu").hidePopover?.();
  follow = view?.follow ?? true;
  $("latest").hidden = follow;
  return { state, folded, placed, foldedTools, restoreRetries, view };
}
function placeSnapshotMessage(ctx, index, { agentId, message, entryId }) {
  ctx.restoreRetries(index);
  if (message.role === "toolResult") {
    toolState(agentId, { ...message, phase: "end" });
    if (agentId === "main") placeCompactedTasks();
  }
  if (isTaskNotification(message)) {
    // 任务通知（新旧形态统一）：独立通知条，不进对话卡片、不占 goal 锚位，仅保持下标同构。
    bindRaw(taskNotificationCard(message, agentId), rawEntries[index]);
    return;
  }
  if (["assistant", "user"].includes(message.role)) {
    if (agentId === "main" && entryId && ctx.folded.has(entryId)) {
      const record = ctx.folded.get(entryId);
      for (const call of Array.isArray(message.content) ? message.content : [])
        if (call.type === "toolCall") ctx.foldedTools.add(`${agentId}:${call.id}`);
      if (!ctx.placed.has(record.id)) {
        ctx.placed.add(record.id);
        $("output").append(compactionCard(record));
      }
      rawEntries[index].item = { node: compactionNodes.get(record.id) };
      return;
    }
    const item = card(
      message.role === "user"
        ? "你"
        : agentId === "main"
          ? "AXIOM"
          : "子 Agent",
      tasks.get(agentId),
    );
    clearWaiting(agentId);
    live.set(agentId, item);
    for (const call of Array.isArray(message.content) ? message.content : [])
      if (call.type === "toolCall") {
        const existing = toolItems.get(`${agentId}:${call.id}`);
        // The result may have been loaded first at the window boundary. Rehome its
        // existing detail node rather than leaving the delegate anchor at the tail.
        if (existing) { existing.args ||= call.arguments; item.tools.append(existing.container); }
        else toolState(agentId, { phase: "history", toolCallId: call.id, toolName: call.name, args: call.arguments });
      }
    live.delete(agentId);
    // 绑定与下标同构的原文条目：rawEntries 与 state.messages 顺序一致。
    bindRaw(item, rawEntries[index]);
    renderMessage(item, message);
    if (agentId === "main") {
      mainItems.push({ item, entryId });
      anchorGoal((ctx.state.history?.start || 0) + index, item, entryId);
    }
  }
}
function finishSnapshot(job, ctx) {
  if (job !== snapshotJob) return;
  const { state, view } = ctx;
  goalAnchorCount = state.history?.total ?? state.messages.length;
  ctx.restoreRetries(state.messages.length);
  for (const [agentId, message] of Object.entries(state.live))
    if (message.role === "assistant") {
      const item = card(
        agentId === "main" ? "AXIOM" : "子 Agent",
        tasks.get(agentId),
      );
      clearWaiting(agentId);
      item.active = true;
      // 恢复中的流要有原始累计原文做 delta 基线：否则首个 text_delta 会丢掉快照里的历史前缀。
      item.raw = typeof message.content === "string" ? message.content
        : (message.content || []).filter((block) => block?.type === "text")
          .map((block) => block.text).join("\n");
      // 快照里的半成品流没有对应 state.messages 槽位，单独补一条原文条目并继续接收后续 delta。
      const entry = rawEntry(JSON.parse(JSON.stringify(message)), agentId, { messageId: state.liveMessageIds?.[agentId] });
      rawLive.set(agentId, entry);
      bindRaw(item, entry);
      renderMessage(item, message);
      item.preparedRaw = undefined;
      live.set(agentId, item);
    }
  for (const tool of Object.values(state.tools || {}))
    if (!ctx.foldedTools.has(`${tool.agentId || "main"}:${tool.toolCallId}`)) toolState(tool.agentId || "main", tool);
  mergeThoughts($("output"));
  for (const [id, task] of tasks) {
    mergeThoughts(task.output);
    if (!["starting", "running"].includes(task.node.dataset.status)) stopActivity(id, "已结束");
    else waiting(id);
  }
  if (state.status === "running") waiting("main");
  else stopActivity("main", "已结束");
  for (const task of tasks.values())
    if (["starting", "running"].includes(task.trigger.dataset.status) && !task.trigger.isConnected) $("output").append(task.trigger);
  for (const record of compactions)
    if (!compactionNodes.has(record.id)) $("output").prepend(compactionCard(record));
  // 摘要按记录顺序集中在历史顶部；原任务入口移动而非复制，弹窗与状态保持不变。
  $("output").prepend(...compactions.map((record) => compactionNodes.get(record.id)));
  placeCompactedTasks();
  const retryHistory = $("output").querySelector(":scope > .retry-archive");
  if (retryHistory) $("output").prepend(retryHistory);
  if (!$("output").children.length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.innerHTML =
      '<span class="empty-mark" aria-hidden="true">A</span><p class="eyebrow">你的本地 AI 工作台</p><h2>把想法，变成下一步。</h2><p>描述目标，让 Axiom 协同思考与执行。</p><div class="empty-hints"><span>梳理代码</span><span>排查问题</span><span>实现想法</span></div>';
    $("output").append(empty);
  }
  lastScrollTops.delete(transcript);
  scrollFrame = requestAnimationFrame(() => {
    scrollFrame = undefined;
    resizePrompt();
    transcript.scrollTop = follow ? transcript.scrollHeight : (view?.scroll ?? 0);
    const anchor = !follow && view?.anchor && rawEntries.find(entry => entry.messageId === view.anchor)?.item?.node;
    if (anchor) transcript.scrollTop += anchor.getBoundingClientRect().top - transcript.getBoundingClientRect().top - (view.anchorOffset || 0);
    lastScrollTops.set(transcript, transcript.scrollTop);
    prefetchHistory();
  });
  renderQueue(state.queue);
  sessionBill = state.billing;
  runtime = state.runtime;
  applyConfig(state.config);
  config.compaction = state.config.compaction || compactionDefaults;
  updateAvailability();
  region("对话展示", () => goalUI.show(sessionId, state.goal, goalAnchors));
}
const transport = createTransport({
  url: () => `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/ws`,
  reduce: receiveHistoryEvent,
  initialize: initializeConnection,
  onState(state) {
    if (["connecting", "restoring"].includes(state)) {
      connected = false;
    } else if (["disconnected", "closed", "recovering", "limited"].includes(state)) {
      configureSeq++;
      connected = false;
      for (const id of new Set(["main", ...tasks.keys(), ...waitingItems.keys()])) stopActivity(id, "连接断开，等待恢复");
      if (!$("workspace").hidden) saveView();
      ++snapshotJob;
      serviceUi.cancelRestart();
      serviceUi.watch();
      $("login").hidden = false;
      $("connect").disabled = false;
      if (state === "limited") error("自动恢复已暂停：快照过大或连续恢复失败。请确认服务状态后手动连接。");
    }
    updateAvailability();
    if (["connecting", "restoring"].includes(state)) $("status").textContent = "连接中";
    if (state === "limited") $("status").textContent = "连接受限，请手动重试";
  },
});
transport.subscribe("models.favorites.changed", {}, (message) => {
  modelFavorites = message.data;
  modelPicker.syncAll();
});
transport.subscribe("models.config.changed", {}, () => refreshModelCatalog());
window.addEventListener("pagehide", (event) => {
  if (event.persisted) return;
  transport.dispose();
  modelPicker.dispose();
});
$("login").onsubmit = (e) => {
  e.preventDefault();
  void transport.connect().catch((e) => {
    if (transport.getConnectionState() !== "disposed") error(e);
  });
};
let initialized = false;
async function initializeConnection({ isCurrent }) {
  $("error").textContent = "";
  let initializingSession = false;
  try {
    // Reconnect restores the active conversation first; configuration does not gate it.
    if (initialized && sessionId) {
      if (!$("workspace").hidden) saveView();
      let state;
      try { state = await request("session.attach", { sessionId }); }
      catch (e) {
        if (e.code !== "response_error") throw e;
        initialized = false;
        return initializeConnection({ isCurrent });
      }
      if (!isCurrent()) return;
      await snapshot(state);
      if (!isCurrent()) return;
      connected = true;
      $("login").hidden = true;
      updateAvailability();
      return;
    }
    const service = await request("service.status");
    importDir = service.importDir || "";
    region("连接状态", () => serviceUi.apply(service));
    models = await request("models.list");
    try { modelFavorites = await request("models.favorites.get"); }
    catch (e) { error(`收藏读取失败：${e.message}`); }
    modelPicker.syncAll();
    options(
      $("provider"),
      providerEntries(),
    );
    if (!models.length) {
      // 空模型目录启动：保持连接进入首次配置引导，不建会话、不断线重连。
      onboarding = true;
      sessionMissing = true;
      connected = true;
      updateAvailability();
      $("login").hidden = true;
      $("workspace").hidden = false;
      error("尚无可用模型：请在「设置 → 模型与供应商」中添加并保存；保存后点击「＋ 新会话」即可开始，无需重启。");
      showSettingsPanel("models");
      if (!$("settings").open) $("settings").showModal();
      initialized = true;
      return;
    }
    onboarding = false;
    initializingSession = true;
    let state;
    if (sessionId) {
      try {
        state = await request("session.attach", { sessionId });
      } catch (e) {
        if (currentCwd) {
          saveView();
          const draft = views.get(sessionId);
          state = await request("session.create", { cwd: currentCwd });
          views.set(state.sessionId, draft);
          error(`原会话无法恢复，已在原工作空间新建会话并保留草稿：${e.message}`);
        } else sessionId = undefined;
      }
    }
    if (!state) {
      const existing = await request("sessions.list");
      // 单条无法恢复的会话（历史文件缺失、目录被删）不能阻塞整条启动链：逐条尝试并跳过，
      // 全部不可用才新建。此前只 attach 列表第一条，它坏掉时异常会冒到下面的 catch，那里
      // 关掉连接并安排重连，重连后走同一段又抛，页面就卡死在「连接已断开，正在自动重连」。
      const failed = [];
      for (const item of existing) {
        try { state = await request("session.attach", { sessionId: item.id }); break; }
        catch (e) { failed.push(`${item.title || item.id}：${e.message}`); }
      }
      // 其余会话正常时只记控制台（页面整体是好的，别让人以为又出错了）；全不可用才占用错误区。
      if (failed.length) {
        const message = `跳过无法恢复的会话：${failed.join("；")}`;
        if (state) console.warn(message);
        else error(message);
      }
    }
    if (!state) state = await request("session.create");
    initializingSession = false;
    if (!$("workspace").hidden) saveView();
    // 首屏渐进显示：身份切换同步完成后就让 workspace 可见，长快照的分片在可见容器里继续补齐，
    // 不再等全部分片建完 DOM 才做一次整体布局。connected 与发送能力保持未开放。
    if (!isCurrent()) return;
    await snapshot(state, () => { $("workspace").hidden = false; });
    if (!isCurrent()) return;
    await refreshSessions();
    $("login").hidden = true;
    $("workspace").hidden = false;
    connected = true;
    remoteOnReconnect();
    initialized = true;
    resizePrompt();
    updateAvailability();
  } catch (e) {
    if (initializingSession && isCurrent()) {
      // 业务配置失败不等于断线：保留设置/更新入口，避免安装后陷入重连死循环。
      sessionMissing = true;
      connected = true;
      $("login").hidden = true;
      $("workspace").hidden = false;
      updateAvailability();
      $("open-settings").click();
      error(`会话暂时无法打开：${e.message}。服务仍已连接，可在设置中修正配置或更新服务，然后点击「＋ 新会话」重试。`);
      initialized = true;
    } else {
      error(e);
      $("login").hidden = false;
      throw e;
    }
  } finally {
    $("connect").disabled = false;
    updateAvailability();
  }
}
let importDir = "";
updateAvailability();
$("login").requestSubmit();
$("agent-role").onchange = () => { if (config) region("模型配置", renderAgentConfig); region("模型配置", updateModelAvailability); };
$("provider").onchange = () => {
  fillModels(modelEntries($("provider").value)[0]?.[0] || "");
  void configure();
};
$("model").onchange = () => {
  void configure();
};
$("subagent-provider").onchange = () => {
  fillSubagentModels(modelEntries($("subagent-provider").value)[0]?.[0] || "");
  void configure(undefined, "subagent");
};
$("subagent-model").onchange = () => {
  void configure(undefined, "subagent");
};
$("queue-type").onchange = () => { void configure(undefined, "queue"); };
$("thinking").onchange = () => {
  void configure($("thinking").value);
};
$("composer").onsubmit = async (e) => {
  e.preventDefault();
  const draft = $("prompt").value;
  const files = [...contextFiles], skill = selectedSkill, sentImages = [...images];
  const body = [draft.trim(), files.length ? `工作空间引用（按需读取；文件夹不代表已读取全部内容）：\n${files.map((file) => `- ${file.directory ? "文件夹" : "文件"}：${JSON.stringify(file.path)}`).join("\n")}` : ""].filter(Boolean).join("\n\n");
  const text = skill ? `/skill:${skill} ${body}` : body;
  if ((!draft.trim() && !skill && !sentImages.length && !files.length) || imageLoading || changing || sessionMissing || !connected) return;
  closeCompletion();
  if (sentImages.length > 4) return error(new Error("每条消息最多发送 4 张图片，请移除多余附件后分批发送"));
  const wasBusy = busy;
  const queueType = e.submitter?.dataset.queue || config?.queueType || "steer";
  busy = true;
  region("输入操作", updateComposer);
  $("error").textContent = "";
  const sendingSession = sessionId;

  follow = true;
  scrollLatest();
  try {
    if (historyState?.history?.nextCursor) await latestHistory();
    await request("prompt", { sessionId: sendingSession, text, ...(sentImages.length ? { images: sentImages } : {}), ...(wasBusy ? { queueType } : {}) });
    if (sessionId === sendingSession) {
      images = images.filter((image) => !sentImages.includes(image));
      renderImages();
      region("输入操作", updateComposer);
    }
    const imageView = views.get(sendingSession);
    if (imageView) imageView.images = (imageView.images || []).filter((image) => !sentImages.includes(image));
    if (sessionId === sendingSession && $("prompt").value === draft) {
      $("prompt").value = "";
      contextFiles = contextFiles.filter((file) => !files.includes(file));
      if (selectedSkill === skill) selectedSkill = "";
      resizePrompt();
      region("输入操作", updateComposer);
    }
    const saved = views.get(sendingSession);
    if (saved?.draft === draft) {
      saved.draft = "";
      if (saved.selectedSkill === skill) saved.selectedSkill = "";
      saved.contextFiles = (saved.contextFiles || []).filter((file) => !files.includes(file));
    }
    void refreshSessions().catch(error);
  } catch (e) {
    if (sessionId === sendingSession) {
      error(e);
      busy = wasBusy;
      region("输入操作", updateComposer);
    }
  }
};
function enableImagePreview(image) {
  image.tabIndex = 0;
  image.setAttribute("role", "button");
  image.setAttribute("aria-label", `${image.alt}，点击放大`);
  image.setAttribute("aria-haspopup", "dialog");
  image.onclick = () => {
    $("image-preview-image").src = image.src;
    $("image-preview-image").alt = image.alt;
    $("image-preview").showModal();
  };
  image.onkeydown = (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    e.preventDefault();
    image.click();
  };
}
$("image-preview-close").onclick = () => $("image-preview").close();
$("image-preview").onclick = (e) => {
  if (e.target === e.currentTarget) e.currentTarget.close();
};
$("image-preview").onclose = () => $("image-preview-image").removeAttribute("src");
function renderImages() {
  $("image-attachments").hidden = !images.length;
  $("image-attachments").replaceChildren(...images.map((image, index) => {
    const tile = document.createElement("div");
    const preview = document.createElement("img");
    preview.src = `data:${image.mimeType};base64,${image.data}`;
    preview.alt = `待发送图片 ${index + 1}`;
    enableImagePreview(preview);
    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "×";
    remove.setAttribute("aria-label", `移除图片 ${index + 1}`);
    remove.disabled = imageLoading;
    remove.onclick = () => {
      $("prompt").value = $("prompt").value.replace(/\[image(\d+)\]/g, (marker, n) =>
        Number(n) === index + 1 ? "" : Number(n) > index + 1 ? `[image${Number(n) - 1}]` : marker);
      images = images.filter((item) => item !== image);
      renderImages(); resizePrompt(); region("输入操作", updateComposer);
    };
    const label = document.createElement("span");
    label.textContent = `[image${index + 1}]`;
    tile.append(preview, label, remove);
    return tile;
  }));
}
async function addImages(files, target = sessionId) {
  if (files.length > 4) throw new Error("每条消息最多添加 4 张图片");
  const added = [];
  for (const file of files) {
    if (!/^image\/(png|jpeg|gif|webp)$/.test(file.type)) throw new Error("仅支持 PNG、JPEG、GIF、WebP 图片");
    if (!file.size || file.size > 5 * 1024 * 1024) throw new Error("每张图片必须大于 0 且不超过 5 MiB");
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error("图片读取失败，请重试"));
      reader.onabort = () => reject(new Error("图片读取已取消"));
      reader.readAsDataURL(file);
    });
    added.push({ type: "image", mimeType: file.type, data: dataUrl.slice(dataUrl.indexOf(",") + 1) });
  }
  const view = target === sessionId ? null : (views.get(target) || {});
  const current = view ? (view.images || []) : images;
  if (current.length + added.length > 4) throw new Error("每条消息最多添加 4 张图片");
  if (view) { view.images = [...current, ...added]; views.set(target, view); }
  else { images = [...current, ...added]; renderImages(); region("输入操作", updateComposer); }
}
async function loadImages(files) {
  if (imageLoading || withdrawing || changing || !connected) return;
  if (!files.length) return;
  const target = sessionId, input = $("prompt"), start = input.selectionStart;
  const selected = input.value.slice(start, input.selectionEnd);
  const markers = files.map((_, index) => `[image${images.length + index + 1}]`).join(" ");
  input.setRangeText(markers, input.selectionStart, input.selectionEnd, "end");
  input.dispatchEvent(new Event("input", { bubbles: true }));
  imageLoading = true;
  renderImages(); region("输入操作", updateComposer);
  try { await addImages(files, target); }
  catch (e) {
    // ponytail: only roll back an unchanged insertion; edited markers remain ordinary draft text.
    const rollback = (text) => text.slice(start, start + markers.length) === markers
      ? text.slice(0, start) + selected + text.slice(start + markers.length) : text;
    if (sessionId === target) {
      input.value = rollback(input.value);
      resizePrompt();
    } else {
      const view = views.get(target);
      if (view) view.draft = rollback(view.draft || "");
    }
    error(e);
  }
  finally { imageLoading = false; renderImages(); region("输入操作", updateComposer); }
}
$("add-image").onclick = () => $("image-files").click();
$("image-files").onchange = async () => {
  const files = [...$("image-files").files];
  $("image-files").value = "";
  await loadImages(files);
};
let selectionCopy = true;
try { selectionCopy = localStorage.getItem("axiom.selectionCopy") !== "off"; } catch {}
$("selection-copy").value = selectionCopy ? "on" : "off";
$("selection-copy").onchange = () => {
  selectionCopy = $("selection-copy").value === "on";
  try {
    localStorage.setItem("axiom.selectionCopy", selectionCopy ? "on" : "off");
    $("selection-copy-feedback").textContent = "已保存";
  } catch {
    $("selection-copy-feedback").textContent = "浏览器无法保存设置，本次页面内已生效。";
  }
};
async function copySelection(e) {
  if (!selectionCopy || e.isComposing || (e.type === "pointerup" && e.button !== 0)) return;
  if (e.type === "keyup" && !["Shift", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "a", "A"].includes(e.key)) return;
  let text;
  const input = $("prompt");
  if (e.target === input) {
    text = input.value.slice(input.selectionStart, input.selectionEnd);
  } else {
    if (!e.target.closest?.("#output, .task-dialog") || e.target.closest("input, textarea, select, button")) return;
    const selection = window.getSelection();
    if (!selection?.rangeCount || selection.isCollapsed) return;
    const range = selection.getRangeAt(0);
    const root = range.commonAncestorContainer.nodeType === 1
      ? range.commonAncestorContainer : range.commonAncestorContainer.parentElement;
    if (!root?.closest("#output, .task-dialog")) return;
    text = selection.toString();
  }
  if (!text.trim()) return;
  try { await copyText(text); }
  catch { error(new Error("自动复制失败，请使用右键菜单复制。")); }
}
document.addEventListener("pointerup", copySelection);
document.addEventListener("keyup", copySelection);
$("prompt").onpaste = (e) => {
  const files = [...(e.clipboardData?.items || [])].filter((item) => item.kind === "file" && item.type.startsWith("image/")).map((item) => item.getAsFile()).filter(Boolean);
  if (!files.length) return;
  e.preventDefault();
  void loadImages(files);
};
$("prompt").onkeydown = (e) => {
  if (e.isComposing || e.keyCode === 229) return;
  if (e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "c") {
    e.preventDefault();
    const input = e.currentTarget;
    if (input.disabled || input.readOnly || !input.value) return;
    input.select();
    // Native deletion keeps Ctrl+Z undo (including restoring a cleared draft).
    document.execCommand("delete");
    return;
  }
  if (!$("prompt-completion").hidden && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
    if (["ArrowDown", "ArrowUp", "Enter", "Tab", "Escape", "ArrowRight"].includes(e.key)) {
      if (e.key === "ArrowRight" && !completionEntries[completionIndex]?.directory) return;
      e.preventDefault(); e.stopPropagation();
      if (e.key === "Escape") closeCompletion();
      else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        completionIndex = (completionIndex + (e.key === "ArrowDown" ? 1 : -1) + completionEntries.length) % (completionEntries.length || 1);
        highlightCompletion();
      } else if (completionEntries.length) chooseCompletion(completionEntries[completionIndex], e.key === "ArrowRight");
      return;
    }
  }
  if (e.key !== "Enter") return;
  if (e.ctrlKey || e.metaKey) {
    e.preventDefault();
    const input = e.currentTarget;
    input.setRangeText("\n", input.selectionStart, input.selectionEnd, "end");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  } else if (!e.shiftKey && !e.altKey) {
    e.preventDefault();
    $("composer").requestSubmit();
  }
};
let escapeTimer, withdrawing, recallArmedUntil = 0;
async function withdrawQueue(recall = false) {
  if (withdrawing || imageLoading || !connected || changing) return;
  const target = sessionId;
  withdrawing = true;
  try {
    const queue = await request("queue.withdraw", { sessionId: target, ...(recall ? { recall: true } : {}) });
    const recalled = queue.recalled ? [queue.recalled] : [];
    const queuedImages = [
      ...(queue.images?.steering || queue.steering.map(() => null)),
      ...(queue.images?.followUp || queue.followUp.map(() => null)),
      ...recalled.map((entry) => entry.images?.length ? entry.images : null),
    ];
    let imageOffset = (sessionId === target ? images : views.get(target)?.images || []).length;
    const text = [...queue.steering, ...queue.followUp, ...recalled.map((entry) => entry.text)].map((text, index) => {
      const shifted = text.replace(/\[image(\d+)\]/g, (_, n) => `[image${Number(n) + imageOffset}]`);
      imageOffset += queuedImages[index]?.length || 0;
      return shifted;
    }).filter(Boolean).join("\n\n");
    const restored = queuedImages.flat().filter(Boolean);
    if (!text && !restored.length) return;
    // 上下文里的输入被撤回后，叶子已回退：重新取快照重绘消息区（saveView 先保住当前草稿与附件）。
    if (recalled.length && sessionId === target && !changing) {
      saveView();
      const state = await request("session.attach", { sessionId: target });
      if (sessionId === target && !changing && connected) await snapshot(state);
      else queueMicrotask(() => transport.failSnapshot());
    }
    if (sessionId === target && !changing) {
      $("prompt").value = [$("prompt").value, text].filter(Boolean).join("\n\n");
      images = [...images, ...restored];
      renderImages(); resizePrompt(); region("输入操作", updateComposer); $("prompt").focus();
    } else {
      const view = views.get(target) || {};
      view.draft = [view.draft, text].filter(Boolean).join("\n\n");
      view.images = [...(view.images || []), ...restored];
      views.set(target, view);
    }
  } catch (e) { error(e); }
  finally { withdrawing = false; }
}
document.addEventListener("click", (e) => {
  document.querySelectorAll(".session-options[open]").forEach((menu) => { if (!menu.contains(e.target)) menu.open = false; });
});
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape" || e.isComposing || document.querySelector("dialog[open]")) return;
  const menu = document.querySelector(".session-options[open]");
  if (menu) {
    e.preventDefault();
    const copy = menu.querySelector('.session-copy[aria-expanded="true"]');
    if (copy) { copy.click(); copy.focus(); return; }
    menu.open = false;
    menu.querySelector("summary").focus();
    return;
  }
  if (
    mobile.matches &&
    $("toggle-sidebar").getAttribute("aria-expanded") === "true"
  ) {
    sidebar(false);
    $("toggle-sidebar").focus();
  } else if (!e.repeat) {
    e.preventDefault();
    if (escapeTimer) {
      clearTimeout(escapeTimer);
      escapeTimer = undefined;
      recallArmedUntil = Date.now() + 300;
      // 双按 Esc 只给安全停止：强停会丢产出，不能被一个快捷键误触。
      if (busy) void stopSession("safe");
    } else {
      // 单按撤回队列；300ms 内连按三次（第二次起就在 300ms 窗口内）才连带撤回已进入上下文的输入。
      const recall = Date.now() < recallArmedUntil;
      recallArmedUntil = 0;
      escapeTimer = setTimeout(() => { escapeTimer = undefined; void withdrawQueue(recall); }, 300);
    }
  }
});
$("session-alert").onclick = () => {
  stopAlert = false;
  markSessionSeen(sessionId); // 同一下点掉标题红点和侧栏「待查看」点，两处不至于分岔。
  renderSessions();
  region("输入操作", updateComposer);
};
$("stop").onclick = () => void stopSession("safe");
$("force-stop").onclick = () => {
  $("force-stop-dialog").showModal();
  $("force-stop-cancel").focus(); // 默认落在取消上：回车不应该直接把本轮产出丢掉
};
$("force-stop-cancel").onclick = () => $("force-stop-dialog").close();
$("force-stop-form").onsubmit = (e) => {
  e.preventDefault();
  $("force-stop-dialog").close();
  void stopSession("force");
};
// 两种停止都先撤回队列：否则停下后排队的消息会在下一次运行开头被默默消化掉。
async function stopSession(mode) {
  const target = sessionId;
  try {
    await withdrawQueue();
    await request("cancel", { sessionId: target, mode });
  } catch (e) {
    error(e);
  }
}
let refreshing;
function refreshSessions() {
  if (refreshing) return refreshing;
  refreshing = updateSessions().finally(() => {
    refreshing = undefined;
  });
  return refreshing;
}
// ponytail: 可见页面每 5 秒刷新后台状态；需要即时通知时再增加列表事件订阅。
setInterval(() => {
  if (connected && !sessionMissing && !changing && !document.querySelector(".session-options[open]") && !document.hidden) void refreshSessions().catch(error);
}, 5000);
// 运行中每秒重算显示；停止后不再重绘。减少动态效果只停动画，不停计时。
setInterval(() => {
  if (allSessions.find((s) => s.id === sessionId)?.runningSince) renderTaskTimer();
}, 1000);
// 任务计时：绿点（会话执行中）累计时长，运行中每秒增长，停止后定格为累计值。
function timerText(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const pad = (value) => String(value).padStart(2, "0");
  if (total < 60) return `${total}s`;
  if (total < 3600) return `${Math.floor(total / 60)}m ${pad(total % 60)}s`;
  return `${Math.floor(total / 3600)}h ${pad(Math.floor((total % 3600) / 60))}m ${pad(total % 60)}s`;
}
function renderTaskTimer(sessions = allSessions) {
  const node = $("task-timer");
  const session = sessions.find((s) => s.id === sessionId);
  const running = Boolean(session?.runningSince);
  const elapsed = (session?.elapsedMs || 0) + (running ? Date.now() - session.runningSince : 0);
  node.hidden = !running && !elapsed;
  node.dataset.running = String(running);
  const text = timerText(elapsed);
  const label = `${running ? "任务进行中" : "任务已停止"}，累计运行 ${text}`;
  $("task-timer-value").textContent = text;
  node.title = label;
  node.setAttribute("aria-label", label);
}
function applyElapsed(data) {
  if (data?.elapsedMs == null) return;
  const current = allSessions.find((s) => s.id === sessionId);
  if (!current) return;
  current.elapsedMs = data.elapsedMs;
  current.runningSince = data.runningSince ?? null;
  renderTaskTimer();
}
function updatePageTitle() {
  const workspace = currentCwd.replaceAll("\\", "/").replace(/\/$/, "").split("/").pop() || currentCwd;
  document.title = `${$("session-title").textContent} · ${workspace} — Axiom`;
}
async function updateSessions() {
  const sessions = await request("sessions.list");
  renderTaskTimer(sessions);
  // updatedAt 决定排序与未读判定，必须进比较键，否则「跑完」这类只动 updatedAt 的变化不会重渲染列表。
  const listState = (items) => JSON.stringify(items.map(({ id, title, cwd, status, sessionFile, createdAt, updatedAt, elapsedMs, runningSince }) => ({ id, title, cwd, status, sessionFile, createdAt, updatedAt, elapsedMs, runningSince })));
  const active = sessions.find((s) => s.id === sessionId);
  if (!active && sessionId && connected && !changing) {
    allSessions = sessions;
    await recoverMissingSession();
    return;
  }
  if (listState(sessions) === listState(allSessions)) return;
  allSessions = sessions;
  if (active) $("session-title").textContent = active.title;
  updatePageTitle();
  renderSessions();
}
async function recoverMissingSession() {
  sessionMissing = true;
  region("输入操作", updateComposer);
  // 空模型目录不等于历史已删除，保留引用与草稿。
  if (!models.length) {
    error("当前会话暂不可用；请先在「设置 → 模型与供应商」配置模型，再点击「＋ 新会话」。");
    return;
  }
  sessionMissing = true;
  saveView();
  const draft = views.get(sessionId);
  const cwd = currentCwd;
  changing = true;
  updateAvailability();
  try {
    // 不把旧草稿塞入另一条已有会话；独立新建，且不自动发送。
    const state = await request("session.create", { cwd });
    views.set(state.sessionId, draft);
    await snapshot(state);
    error("原会话已在其他页面删除，已在原工作空间新建会话并保留草稿，尚未发送。");
    allSessions = await request("sessions.list");
  } catch (e) {
    error(`原会话已删除，草稿仍保留。请新建会话或切换工作空间：${e.message}`);
  } finally {
    changing = false;
    renderSessions();
    updateAvailability();
  }
}
async function switchSession(action) {
  if (changing || !connected) return;
  saveView();
  changing = true;
  $("error").textContent = "";
  updateAvailability();
  try {
    const state = await action();
    if (sessionMissing) views.set(state.sessionId, { draft: $("prompt").value, contextFiles: [...contextFiles], images: [...images], selectedSkill, follow: true, scroll: 0 });
    await snapshot(state);
    renderSessions();
    if (mobile.matches) sidebar(false);
    await refreshSessions();
  } catch (e) {
    error(e);
  } finally {
    changing = false;
    updateAvailability();
  }
}
// 保留源路径的分隔符，兼容 Windows、UNC 和 POSIX 文件路径。
async function copySessionFile(s, action, kind = "path") {
  if (!s.sessionFile) return error(new Error("该会话还没有 JSONL 文件（发送首条消息后生成）"));
  try {
    const file = s.sessionFile;
    const separator = Math.max(file.lastIndexOf("/"), file.lastIndexOf("\\"));
    const directory = file.slice(0, separator + 1);
    const value = kind === "name" ? file.slice(separator + 1) : kind === "directory" ? directory : file;
    await copyText(value);
    const label = action.title;
    action.title = "已复制";
    setTimeout(() => { action.title = label; }, 1600);
  } catch (e) { error(new Error(`复制失败：${e.message}`)); }
}
function positionSessionMenu(trigger, panel) {
  const anchor = trigger.getBoundingClientRect(), box = panel.getBoundingClientRect();
  const left = anchor.right + 8 + box.width <= innerWidth - 8 ? anchor.right + 8 : Math.max(8, anchor.left - box.width - 8);
  panel.style.left = `${left}px`;
  panel.style.top = `${Math.max(8, Math.min(anchor.top, innerHeight - box.height - 8))}px`;
}
function normalizeCwd(cwd) {
  return (cwd || "").replaceAll("\\", "/").replace(/\/$/, "").toLowerCase();
}
// 会话分线跟随“今天”滚动：今天/昨天/前天/N 天前，同年只到“M月D日”，精确日期放在 title 上。
function sessionDayLabel(ts) {
  const d = new Date(ts);
  if (Number.isNaN(+d)) return "日期未知";
  const startOfDay = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.floor((startOfDay(new Date()) - startOfDay(d)) / 86400000);
  if (days <= 0) return "今天";
  if (days === 1) return "昨天";
  if (days === 2) return "前天";
  if (days <= 6) return `${days} 天前`;
  const label = `${d.getMonth() + 1}月${d.getDate()}日`;
  return d.getFullYear() === new Date().getFullYear() ? label : `${d.getFullYear()}年${label}`;
}

function renderSessions() {
  const fragment = document.createDocumentFragment();
  const query = $("search").value.trim().toLowerCase();
  const running = (s) => s.status !== "idle";
  // 未读 = 打开过它之后又跑完了一轮（updatedAt 是这一轮的开始时刻）。
  const unread = (s) => !hiddenSessions.has(s.id) && s.status === "idle" && s.id !== sessionId && seenSessions[s.id] != null && s.updatedAt > seenSessions[s.id];
  // 用户置顶的会话排在各自工作区最前，其次是运行中，再次是跑完待看的，最后是看过闲着的。
  const pinned = (s) => pinnedSessions.has(s.id);

  // 保存当前 DOM 中各工作区状态：重绘前先取回各分组折叠状态，用户刚点过的不会被重置。
  const groupsOpenByCwd = new Map();
  for (const el of $("sessions").querySelectorAll(".workspace-group")) {
    const cwd = el.dataset.cwd;
    if (!cwd) continue;
    if (el.open) openCwds.add(cwd);
    else openCwds.delete(cwd);
    const state = {};
    for (const section of el.querySelectorAll(".session-section[data-group]")) state[section.dataset.group] = section.open;
    if (Object.keys(state).length) groupsOpenByCwd.set(cwd, state);
  }

  // 按工作空间分组
  const currentNcwd = normalizeCwd(currentCwd);
  const wsMap = new Map(); // normalized cwd → sessions[]
  const wsOriginalCwd = new Map(); // normalized cwd → original cwd (for display)
  for (const s of allSessions) {
    if (!s.title.toLowerCase().includes(query)) continue;
    const key = normalizeCwd(s.cwd);
    if (!wsMap.has(key)) {
      wsMap.set(key, []);
      wsOriginalCwd.set(key, s.cwd);
    }
    wsMap.get(key).push(s);
  }

  // 工作区排序：当前第一，其余按最新会话时间倒序
  const sortedCwds = [...wsMap.keys()].sort((a, b) => {
    if (a === currentNcwd) return -1;
    if (b === currentNcwd) return 1;
    const aLatest = Math.max(...wsMap.get(a).map((s) => s.updatedAt));
    const bLatest = Math.max(...wsMap.get(b).map((s) => s.updatedAt));
    return bLatest - aLatest;
  });
  // 当前工作空间即使无会话也显示占位（搜索时则跳过，避免空组干扰）
  if (!query && currentNcwd && !sortedCwds.includes(currentNcwd)) {
    sortedCwds.unshift(currentNcwd);
  }

  const addRow = (s) => { // ponytail: keep identical
    const hidden = hiddenSessions.has(s.id);
    const button = document.createElement("button");
    button.className = "session-item";
    button.setAttribute("aria-current", s.id === sessionId ? "page" : "false");
    const title = document.createElement("span");
    title.textContent = s.title;
    button.title = s.title;
    const attention = unread(s);
    const status = document.createElement("small");
    status.className = running(s) ? "session-running-dot" : "session-attention-dot";
    status.hidden = !running(s) && !attention;
    status.setAttribute("aria-label", running(s) ? "执行中" : "有待查看的结果");
    button.append(status, title);
    if (pinned(s)) {
      const pin = document.createElement("small");
      pin.className = "session-pin-icon";
      pin.setAttribute("aria-label", "已置顶");
      pin.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m16 3 5 5-4 1-4 4v4l-6-6h4l4-4 1-4Z"/><path d="m3 21 7-7"/></svg>';
      button.append(pin);
    }
    button.onclick = () =>
      switchSession(() => request("session.attach", { sessionId: s.id }));
    const row = document.createElement("div");
    row.className = `session-row${pinned(s) ? " pinned" : ""}`;
    row.dataset.sessionId = s.id;
    const menu = document.createElement("details");
    menu.className = "session-options";
    const more = document.createElement("summary");
    more.className = "session-more";
    more.textContent = "⋯";
    more.title = `会话操作：${s.title}`;
    more.setAttribute("aria-label", more.title);
    menu.append(more);
    menu.addEventListener("toggle", () => {
      if (!menu.isConnected) return;
      if (!menu.open) {
        actions.querySelector('.session-copy[aria-expanded="true"]')?.click();
        actions.hidePopover?.();
        return;
      }
      document.querySelectorAll(".session-options[open]").forEach((other) => { if (other !== menu) other.open = false; });
      actions.showPopover?.();
      positionSessionMenu(more, actions);
    });
    const actions = document.createElement("div");
    actions.className = "session-actions";
    actions.setAttribute("popover", "manual");
    actions.setAttribute("aria-label", `会话操作：${s.title}`);
    for (const [kind, label, path] of [
      ["pin", pinned(s) ? "取消置顶" : "置顶", 'M16 12V4h1V2H7v2h1v8l-2 2v2h5v6h2v-6h5v-2l-2-2z'],
      ["hide", hidden ? "移回进行中" : "标记已完成", hidden ? 'M12 20V4M5 11l7-7 7 7' : 'M5 12l4 4L19 6'],
      ["duplicate", "复制会话", 'M9 9h11v12H9ZM15 9V3H4v12h5M14.5 14v3M13 15.5h3'],
      ["copy", "复制文件", 'M9 9h11v12H9ZM15 9V3H4v12h5'],
      ["rename", "重命名", 'M16 3l5 5L8 21H3v-5L16 3zM13 6l5 5M3 16l5 5'],
      ["delete", "删除会话", 'M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7'],
    ]) {
      const action = document.createElement("button");
      action.type = "button";
      action.className = `session-${kind}`;
      action.title = label;
      action.setAttribute("aria-label", `${label}：${s.title}`);
      if (["rename", "delete"].includes(kind)) action.setAttribute("aria-haspopup", "dialog");
      // 复制文件与置顶是纯前端偏好，不依赖连接，断连时也保持可用；复制会话另按 duplicateBlocked 判定。
      if (kind === "duplicate") action.disabled = duplicateBlocked(s);
      else action.disabled = !["hide", "copy", "pin"].includes(kind) && (!connected || changing);
      action.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${path}"/></svg>`;
      action.append(document.createTextNode(label));
      if (kind === "copy") {
        const submenu = document.createElement("div");
        submenu.className = "session-actions session-copy-menu";
        submenu.setAttribute("popover", "manual");
        submenu.setAttribute("aria-label", "复制会话文件信息");
        submenu.hidden = true;
        action.setAttribute("aria-expanded", "false");
        action.innerHTML += '<span class="session-copy-arrow" aria-hidden="true">›</span>';
        for (const [part, text] of [["directory", "复制所在目录"], ["name", "复制文件名"], ["path", "复制完整路径"]]) {
          const item = document.createElement("button");
          item.type = "button";
          item.dataset.copy = part;
          item.textContent = item.title = text;
          item.onclick = () => {
            void copySessionFile(s, item, part);
            action.click();
            menu.open = false;
            actions.hidePopover?.();
            more.focus();
          };
          submenu.append(item);
        }
        action.onclick = () => {
          const open = action.getAttribute("aria-expanded") !== "true";
          action.setAttribute("aria-expanded", String(open));
          submenu.hidden = !open;
          if (open) { submenu.showPopover?.(); positionSessionMenu(action, submenu); }
          else submenu.hidePopover?.();
        };
        actions.append(action, submenu);
        continue;
      }
      action.onclick = () => {
        menu.open = false;
        actions.hidePopover?.();
        more.focus();
        if (kind === "duplicate") void switchSession(() => request("session.duplicate", { sessionId: s.id }));
        else if (kind === "hide") void setSessionHidden(s.id, !hidden);
        else if (kind === "pin") void setSessionPinned(s.id, !pinned(s));
        else openSessionAction(kind, s);
      };
      actions.append(action);
    }
    menu.append(actions);
    row.append(button, menu);
    return row;
  };

  for (const ncwd of sortedCwds) {
    const sessions = wsMap.get(ncwd) || [];
    const isCurrent = ncwd === currentNcwd;
    const wsDetail = document.createElement("details");
    wsDetail.className = `workspace-group${isCurrent ? " current" : ""}`;
    wsDetail.dataset.cwd = ncwd;
    // 默认：当前展开，其他折叠（除非有保存的状态）
    wsDetail.open = openCwds.has(ncwd) || (isCurrent && openCwds.size === 0);

    // 工作区头 — 两行：名称 + 路径
    const displayName = ncwd.split("/").filter(Boolean).pop() || ncwd;
    const origCwd = wsOriginalCwd.get(ncwd) || (isCurrent ? currentCwd : ncwd);
    const wsHeader = document.createElement("summary");
    wsHeader.className = "workspace-header";
    const headerTop = document.createElement("span");
    headerTop.className = "workspace-header-top";
    const chevron = document.createElement("span");
    chevron.className = "workspace-chevron";
    chevron.setAttribute("aria-hidden", "true");
    chevron.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>';
    headerTop.append(chevron);
    const nameSpan = document.createElement("span");
    nameSpan.className = "workspace-name";
    nameSpan.textContent = displayName;
    headerTop.append(nameSpan);
    // 运行中计数
    const runningCount = sessions.filter((s) => running(s)).length;
    if (runningCount > 0) {
      const badge = document.createElement("span");
      badge.className = "workspace-badge ws-badge-running";
      badge.textContent = `◉ ${runningCount}`;
      headerTop.append(badge);
    }
    // 待查看计数
    const unreadCount = sessions.filter((s) => unread(s)).length;
    if (unreadCount > 0) {
      const badge = document.createElement("span");
      badge.className = "workspace-badge ws-badge-attention";
      badge.textContent = `• ${unreadCount}`;
      headerTop.append(badge);
    }
    // + 按钮：在该工作区新建会话
    const newBtn = document.createElement("button");
    newBtn.type = "button";
    newBtn.className = "workspace-new-btn icon-button";
    newBtn.title = `在「${displayName}」新建会话`;
    newBtn.setAttribute("aria-label", newBtn.title);
    newBtn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>';
    newBtn.onclick = (e) => {
      e.stopPropagation();
      if (!connected || changing) return;
      switchSession(() => request("session.create", { cwd: ncwd }));
    };
    headerTop.append(newBtn);
    wsHeader.append(headerTop);
    // 第二行：完整路径
    const pathSpan = document.createElement("span");
    pathSpan.className = "workspace-path";
    pathSpan.textContent = origCwd;
    pathSpan.title = origCwd;
    wsHeader.append(pathSpan);
    wsDetail.append(wsHeader);

    // 展开/折叠状态持久化
    wsDetail.addEventListener("toggle", () => {
      if (wsDetail.open) openCwds.add(ncwd);
      else openCwds.delete(ncwd);
      try { localStorage.setItem("axiom.openCwds", JSON.stringify([...openCwds])); } catch {}
    });

    // 内层会话列表（完全复用现有结构）
    const wsContent = document.createElement("div");
    wsContent.className = "workspace-content";
    if (sessions.length > 0) {
      const rank = (s) => (pinned(s) ? 0 : running(s) ? 1 : unread(s) ? 2 : 3);
      const sorted = [...sessions].sort((a, b) => rank(a) - rank(b) || b.updatedAt - a.updatedAt || a.id.localeCompare(b.id));
      const hasPinned = sorted.some(pinned);
      const groups = [
        ...(hasPinned ? [["置顶", sorted.filter(pinned)]] : []),
        ["进行中", sorted.filter((s) => !pinned(s) && (running(s) || !hiddenSessions.has(s.id)))],
        ["已完成", sorted.filter((s) => !pinned(s) && !running(s) && hiddenSessions.has(s.id))],
      ];
      for (const [name, groupSessions] of groups) {
        const key = name === "置顶" ? "pinned" : name === "进行中" ? "active" : "completed";
        // 置顶/已完成空组不渲染：没有内容时组头只是噪音；进行中组保留承载空态提示。
        if (!groupSessions.length && key !== "active") continue;
        const section = document.createElement("details");
        section.className = `session-section session-${key}`;
        section.dataset.group = key;
        section.setAttribute("aria-label", name);
        // 折叠状态：先看重绘前的 DOM，再看按工作区记住的偏好；置顶/进行中默认展开，已完成默认折叠。
        section.open = groupsOpenByCwd.get(ncwd)?.[key] ?? sessionGroupPrefs[ncwd]?.[key] ?? key !== "completed";
        // 渲染时同步固化生效状态：toggle 事件是异步任务，不等它也能保证重绘后立刻一致；仅在变化时写盘。
        const prefs = (sessionGroupPrefs[ncwd] ??= {});
        if (prefs[key] !== section.open) { prefs[key] = section.open; saveSessionGroupPrefs(); }
        const heading = document.createElement("summary");
        heading.className = "session-group-toggle";
        const label = document.createElement("span");
        label.className = "session-group";
        label.textContent = name;
        heading.append(label);
        if (groupSessions.length) {
          const count = document.createElement("span");
          count.className = "session-group-count";
          count.textContent = String(groupSessions.length);
          count.title = `${groupSessions.length} 个会话`;
          heading.append(count);
        }
        const content = document.createElement("div");
        content.className = "session-section-content";
        section.append(heading, content);
        // 用户点折叠后按工作区记下来；读取当前值幂等，程序赋值引发的 toggle 不会造成抖动写库。
        section.addEventListener("toggle", () => {
          if (!section.isConnected) return;
          const prefs = (sessionGroupPrefs[ncwd] ??= {});
          if (prefs[key] !== section.open) { prefs[key] = section.open; saveSessionGroupPrefs(); }
        });
        let day;
        for (const s of groupSessions) {
          const label = sessionDayLabel(s.updatedAt);
          if (day !== label) {
            day = label;
            const divider = document.createElement("p");
            divider.className = "session-day";
            divider.textContent = label;
            const exact = new Date(s.updatedAt);
            if (!Number.isNaN(+exact)) divider.title = `${exact.getFullYear()}-${String(exact.getMonth() + 1).padStart(2, "0")}-${String(exact.getDate()).padStart(2, "0")}`;
            content.append(divider);
          }
          content.append(addRow(s));
        }
        if (!groupSessions.length && !hasPinned) {
          const empty = document.createElement("p");
          empty.className = "session-empty";
          empty.textContent = query ? "没有匹配的会话" : "暂无会话";
          content.append(empty);
        }
        wsContent.append(section);
      }
    } else {
      const empty = document.createElement("p");
      empty.className = "session-empty";
      empty.textContent = "暂无会话";
      wsContent.append(empty);
    }
    wsDetail.append(wsContent);
    fragment.append(wsDetail);
  }

  if (!sortedCwds.length) {
    const empty = document.createElement("p");
    empty.className = "session-empty";
    empty.textContent = query ? "没有匹配的会话" : "暂无会话";
    fragment.append(empty);
  }
  $("sessions").replaceChildren(fragment);
}
$("search").oninput = renderSessions;
let sessionAction;

function openSessionAction(kind, session) {
  if (!connected || changing) return;
  sessionAction = { kind, id: session.id, cwd: session.cwd };
  const deleting = kind === "delete";
  $("session-action-title").textContent = deleting ? "删除会话" : "重命名会话";
  $("session-action-description").textContent = deleting ? `删除「${session.title}」及其本地记录？运行中的任务会停止，此操作不可撤销。` : "为当前会话起一个容易查找的名字。";
  $("session-name").value = session.title;
  $("session-name").disabled = deleting;
  $("session-name").hidden = $("session-name-label").hidden = deleting;
  $("session-action-submit").textContent = deleting ? "删除会话" : "保存名称";
  $("session-action-submit").classList.toggle("danger", deleting);
  $("session-action-error").textContent = "";
  $("session-action").showModal();
  (deleting ? $("session-action-cancel") : $("session-name")).focus();
  if (!deleting) $("session-name").select();
}
$("session-action-cancel").onclick = () => $("session-action").close();
$("session-action-form").onsubmit = async (e) => {
  e.preventDefault();
  const action = sessionAction;
  $("session-action-submit").disabled = true;
  try {
    if (action.kind === "rename") {
      const title = $("session-name").value.trim();
      if (!title) throw new Error("请输入会话名称");
      await request("session.rename", { sessionId: action.id, title });
      await refreshSessions();
    } else {
      await request("session.close", { sessionId: action.id });
      views.delete(action.id);
      const rest = await request("sessions.list");
      if (sessionId === action.id) {
        const next = rest.find((s) => s.cwd === action.cwd);
        await switchSession(() => next ? request("session.attach", { sessionId: next.id }) : request("session.create", { cwd: action.cwd }));
      }
      await refreshSessions();
    }
    $("session-action").close();
  } catch (e) { $("session-action-error").textContent = e.message; }
  finally { $("session-action-submit").disabled = false; }
};
function contextIcon(kind) {
  return document.querySelector(`[data-context="${kind}"] svg`).cloneNode(true);
}
function renderContextChips() {
  const skill = selectedSkill;
  const entries = [...(skill ? [{ name: skill, kind: "skill" }] : []), ...contextFiles.map((file) => ({ ...file, name: file.path, kind: file.directory ? "folder" : "file" }))];
  $("context-chips").replaceChildren(...entries.map((entry) => {
    const chip = document.createElement("button");
    chip.type = "button"; chip.className = "context-chip";
    chip.title = `移除${entry.kind === "skill" ? "待加载 Skill" : "引用"}：${entry.name}`;
    chip.setAttribute("aria-label", chip.title);
    const label = document.createElement("span"); label.textContent = entry.name;
    const close = document.createElement("span"); close.textContent = "×"; close.setAttribute("aria-hidden", "true");
    chip.append(entry.kind === "skill" ? contextIcon("skill") : fileIcon({ ...entry, name: entry.path.split(/[\\/]/).pop() }), label, close);
    chip.onclick = () => {
      if (entry.kind === "skill") { $("composer-skill").value = ""; $("composer-skill").onchange(); }
      else { contextFiles = contextFiles.filter((file) => file.path !== entry.path); region("输入操作", updateComposer); }
    };
    return chip;
  }));
}
// 名称模糊匹配：忽略大小写，needle 字符按顺序出现即命中（"apjs" 命中 "app.js"）；空 needle 全部命中。
function fuzzyHit(text, needle) {
  const lower = text.toLocaleLowerCase();
  if (lower.includes(needle)) return true;
  let i = 0;
  for (const char of lower) if (char === needle[i] && ++i === needle.length) return true;
  return false;
}
function renderContextResults() {
  const query = $("context-search").value.toLocaleLowerCase();
  const shown = (config?.skills || []).filter((entry) => fuzzyHit(entry.name, query) || (entry.description || "").toLocaleLowerCase().includes(query));
  $("context-results").replaceChildren(...shown.map((entry) => {
    const button = document.createElement("button"); button.type = "button";
    const text = document.createElement("span");
    const name = document.createElement("span"); name.textContent = entry.name;
    const description = document.createElement("small"); description.textContent = entry.description || "Skill";
    button.title = `${entry.name}\n${description.textContent}`;
    text.append(name, description);
    button.append(contextIcon("skill"), text);
    button.onclick = () => {
      if (!connected || changing) return;
      $("composer-skill").value = entry.name; $("composer-skill").onchange();
      $("context-menu").hidePopover?.();
    };
    return button;
  }));
  $("context-error").textContent = shown.length ? "" : "没有匹配项";
}
function showContextSkills(show) {
  $("context-picker").hidden = !show;
  document.querySelector('[data-context="skill"]').setAttribute("aria-expanded", String(show));
  if (show) positionContextSkills();
}
function positionContextSkills() {
  const menu = $("context-menu").getBoundingClientRect(), picker = $("context-picker");
  const width = picker.getBoundingClientRect().width;
  const right = window.innerWidth - menu.right - 8, left = menu.left - 8;
  const beside = Math.max(right, left) >= width;
  picker.style.left = `${beside ? (right >= width ? menu.right : menu.left - width) : Math.max(8, Math.min(menu.left, window.innerWidth - width - 8))}px`;
  picker.style.maxHeight = `${beside ? window.innerHeight - 16 : Math.max(80, menu.top - 8)}px`;
  const height = picker.getBoundingClientRect().height;
  picker.style.top = `${Math.max(8, beside ? Math.min(menu.top, window.innerHeight - height - 8) : menu.top - height)}px`;
}
$("context-menu").addEventListener("beforetoggle", (event) => {
  if (event.newState !== "open") return;
  showContextSkills(false);
  const rect = $("add-context").getBoundingClientRect();
  $("context-menu").style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - 192))}px`;
  $("context-menu").style.bottom = `${window.innerHeight - rect.top + 8}px`;
  $("context-menu").style.maxHeight = `${Math.max(80, rect.top - 16)}px`;
});
for (const button of document.querySelectorAll("[data-context]")) button.onclick = async (event) => {
  const mode = button.dataset.context;
  if (mode === "skill") {
    showContextSkills(true);
    $("context-search").value = "";
    renderContextResults(); positionContextSkills();
    if (event?.type !== "pointerenter") $("context-search").focus();
    const target = sessionId;
    try {
      const { skills } = await request("session.skills.refresh", { sessionId: target });
      if (target !== sessionId) return;
      config.skills = skills;
      options($("composer-skill"), [["", skills.length ? "选择 Skill（本次发送加载）" : "此会话无可用 Skill"], ...skills.map((skill) => [skill.name, skill.name])]);
      for (const option of $("composer-skill").options)
        option.title = skills.find((skill) => skill.name === option.value)?.description || "";
      region("输入操作", updateComposer);
      renderContextResults();
      if (!$("context-picker").hidden) positionContextSkills();
    } catch (error) {
      if (target === sessionId) $("context-error").textContent = `刷新 Skill 失败：${error.message}`;
    }
    return;
  }
  $("context-menu").hidePopover?.();
  const target = sessionId;
  const entry = await filePicker.open({ title: mode === "file" ? "添加工作空间文件" : "添加工作空间文件夹", mode, sessionId: target, path: "" });
  if (!entry || target !== sessionId || !connected || changing) return;
  entry.path ||= ".";
  if (!contextFiles.some((file) => file.path === entry.path)) contextFiles.push(entry);
  region("输入操作", updateComposer); $("prompt").focus();
};
const skillTrigger = document.querySelector('[data-context="skill"]');
skillTrigger.removeAttribute("title");
skillTrigger.setAttribute("aria-controls", "context-picker");
skillTrigger.onpointerenter = (event) => {
  if (event.pointerType === "mouse" && $("context-picker").hidden) skillTrigger.onclick(event);
};
skillTrigger.onkeydown = (event) => {
  if (event.key === "ArrowRight") { event.preventDefault(); skillTrigger.onclick(event); }
};
$("context-picker").onkeydown = (event) => {
  if (event.key === "Escape" || (event.key === "ArrowLeft" && event.target.tagName !== "INPUT")) {
    event.preventDefault(); event.stopPropagation(); showContextSkills(false); skillTrigger.focus();
  }
};
$("context-search").oninput = () => { renderContextResults(); positionContextSkills(); };
$("context-back").onclick = () => {
  showContextSkills(false);
  document.querySelector('[data-context="skill"]').focus();
};
$("context-close").onclick = () => {
  $("context-menu").hidePopover?.();
  $("add-context").focus();
};
$("composer-skill").onchange = () => {
  selectedSkill = $("composer-skill").value;
  resizePrompt();
  region("输入操作", updateComposer);
  $("prompt").focus();
};
// 斜杠补全里的命令（不是 Skill）：选择后只把 "/goal " 补进输入框，光标留在末尾，
// 用户既能接着写目标文本，也能不写直接发送裸命令。
const SLASH_COMMANDS = [
  { name: "goal", command: true, description: "目标模式：发送整体目标，确认计划后多轮执行并验收" },
];
function closeCompletion() {
  completionVersion++;
  completionToken = undefined;
  completionEntries = [];
  $("prompt-completion").hidden = true;
  $("prompt").setAttribute("aria-expanded", "false");
  $("prompt").removeAttribute("aria-activedescendant");
}
function highlightCompletion() {
  [...$("prompt-completion").children].forEach((node, index) => {
    node.setAttribute("aria-selected", String(index === completionIndex));
    if (index === completionIndex) {
      $("prompt").setAttribute("aria-activedescendant", node.id);
      node.scrollIntoView?.({ block: "nearest" });
    }
  });
}
function chooseCompletion(entry, browse = false) {
  const input = $("prompt"), token = completionToken;
  if (!token || !connected || changing) return;
  if (browse) {
    input.setRangeText(`@"${entry.path}/`, token.start, token.end, "end");
  } else if (entry.command) {
    input.setRangeText(`/${entry.name} `, token.start, token.end, "end");
  } else {
    if (token.skill) selectedSkill = entry.name;
    else if (!contextFiles.some((file) => file.path === entry.path)) contextFiles.push(entry);
    input.setRangeText("", token.start, token.end, "end");
  }
  closeCompletion(); input.focus(); resizePrompt(); region("输入操作", updateComposer);
  if (browse) void updateCompletion();
}
async function updateCompletion() {
  closeCompletion();
  const input = $("prompt");
  if (!connected || changing || input.selectionStart !== input.selectionEnd) return;
  const end = input.selectionStart, before = input.value.slice(0, end);
  const match = /(?:^|\s)(\/[^\s]*|@"[^"\n]*|@[^\s]*)$/.exec(before);
  if (!match) return;
  const text = match[1], start = end - text.length, skill = text[0] === "/";
  if (skill && before.slice(0, start).trim()) return;
  const query = skill ? text.slice(1).replace(/^skill:/, "") : text.slice(text.startsWith('@"') ? 2 : 1).replaceAll("\\", "/");
  const version = completionVersion, target = sessionId;
  completionToken = { start, end, skill };
  $("prompt-completion").hidden = false;
  $("prompt-completion").textContent = "正在读取…";
  input.setAttribute("aria-expanded", "true");
  try {
    const slash = query.lastIndexOf("/");
    const filter = (skill ? query : query.slice(slash + 1)).toLocaleLowerCase();
    const entries = skill
      ? [
          ...(config?.skills || []),
          ...(text.startsWith("/skill:") ? [] : SLASH_COMMANDS.filter((entry) => fuzzyHit(`${entry.name} ${entry.description}`, filter))),
        ]
      : (await request("workspace.browse", { sessionId: target, path: slash < 0 ? "" : query.slice(0, slash), query: filter })).entries;
    if (version !== completionVersion || target !== sessionId) return;
    // 服务端已按名称模糊递归搜索；这里再兜一次，旧服务端（只按子串过滤）也能用。
    completionEntries = entries.filter((entry) => fuzzyHit(`${entry.name} ${skill ? entry.description || "" : ""}`, filter));
    completionIndex = 0;
    $("prompt-completion").replaceChildren(...completionEntries.map((entry, index) => {
      const option = document.createElement("div");
      option.id = `completion-${index}`; option.setAttribute("role", "option");
      const label = document.createElement("button"); label.type = "button"; label.tabIndex = -1;
      label.textContent = skill ? `/${entry.name} — ${entry.description || "Skill"}` : `${entry.directory ? "文件夹" : "文件"}：${entry.path}`;
      label.onclick = () => chooseCompletion(entry);
      option.append(label);
      if (entry.directory) {
        const open = document.createElement("button"); open.type = "button"; open.tabIndex = -1;
        open.textContent = "进入 ›"; open.setAttribute("aria-label", `进入文件夹 ${entry.path}`);
        open.onclick = () => chooseCompletion(entry, true); option.append(open);
      }
      return option;
    }));
    if (!completionEntries.length) $("prompt-completion").textContent = "没有匹配项";
    highlightCompletion();
  } catch (e) {
    if (version === completionVersion) $("prompt-completion").textContent = e.message;
  }
}
$("prompt-completion").onmousedown = (e) => e.preventDefault();
$("prompt").onblur = closeCompletion;
$("prompt").onclick = () => { void updateCompletion(); };
$("prompt").onkeyup = (e) => {
  if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) void updateCompletion();
};
$("prompt").oninput = (e) => {
  const command = /^\/skill:([^\s]+)\s+/.exec($("prompt").value);
  if (command && config?.skills?.some((skill) => skill.name === command[1])) {
    selectedSkill = command[1];
    $("prompt").value = $("prompt").value.slice(command[0].length);
  }
  resizePrompt();
  region("输入操作", updateComposer);
  if (!e?.isComposing) void updateCompletion();
  else closeCompletion();
};
$("prompt").oncompositionend = () => { void updateCompletion(); };
$("open-workspace").onclick = async () => {
  const original = sessionId;
  pickingWorkspace = true; updateNavigation();
  try {
    const entry = await filePicker.open({ title: "打开工作空间", mode: "folder", path: currentCwd });
    if (!entry || original !== sessionId || !connected || changing) return;
    const { path } = entry;
    void switchSession(async () => {
      await refreshSessions();
      const existing = allSessions.find(
        (s) =>
          (/^[a-z]:[\\/]|^[\\/]{2}/i.test(path)
            ? s.cwd.replaceAll("\\", "/").toLowerCase() === path.replaceAll("\\", "/").toLowerCase()
            : s.cwd === path),
      );
      return existing
        ? request("session.attach", { sessionId: existing.id })
        : request("session.create", { cwd: path });
    });
  } catch (e) { error(e); }
  finally { pickingWorkspace = false; updateNavigation(); }
};
$("copy-workspace").onclick = async () => {
  try {
    await copyText($("workspace-label").textContent);
    $("copy-workspace").title = "已复制";
    $("workspace-feedback").textContent = "工作空间路径已复制";
    setTimeout(() => { $("copy-workspace").title = "复制工作空间路径"; }, 1600);
  } catch (e) { error(new Error(`复制失败：${e.message}`)); }
};
$("reveal-workspace").onclick = async () => {
  try { await request("workspace.reveal", { sessionId }); }
  catch (e) { error(e); }
};
$("new").onclick = () =>
  switchSession(() => request("session.create", { cwd: currentCwd }));

// 导入 pi 的 .jsonl 会话：共享文件选择器从 pi 会话目录开始，服务端复制文件并重建历史。
$("import-session").onclick = async () => {
  if (!connected || changing) return;
  const original = sessionId;
  const entry = await filePicker.open({ title: "导入 pi 会话（.jsonl）", mode: "file", path: importDir });
  if (!entry || original !== sessionId || !connected || changing) return;
  await switchSession(() => request("session.import", { path: entry.path, cwd: currentCwd || undefined }));
};

let creationLoad = 0;
// 默认新会话配置：全局一份，外加每个已配置工作目录一份；下拉只切换编辑对象，不切换当前会话。
let defaultsScope = "", defaultsWorkspaces = [];
function renderDefaultsScope() {
  options($("defaults-workspace"), [["", "全局默认（所有未单独配置的工作目录）"], ...defaultsWorkspaces.map((path) => [path, path])], defaultsScope);
  $("defaults-delete").hidden = !defaultsScope;
}
async function refreshDefaultsScope() {
  const active = settingsTicket();
  const { workspaces } = await request("session.defaults.list");
  if (!active()) return;
  defaultsWorkspaces = workspaces ?? [];
  if (defaultsScope && !defaultsWorkspaces.includes(defaultsScope)) defaultsScope = "";
  renderDefaultsScope();
}

function createAgentPicker(role, title, catalog, initial) {
  const fieldset = document.createElement("fieldset");
  fieldset.className = "capability-agent";
  const legend = document.createElement("legend");
  legend.textContent = title;
  fieldset.append(legend);
  const selectors = document.createElement("div");
  selectors.className = "selectors settings-selectors";
  const select = (name, labelText) => {
    const label = document.createElement("label");
    const text = document.createElement("span");
    text.textContent = labelText;
    const node = document.createElement("select");
    node.id = `create-${role}-${name}`;
    node.title = labelText;
    label.append(text, node);
    if (["provider", "model", "thinking"].includes(name)) {
      node.dataset.modelKind = name;
      modelPicker.enhance(node, name);
    }
    selectors.append(label);
    return node;
  };
  const provider = select("provider", `${title}供应商`);
  const model = select("model", `${title}模型`);
  const key = initial.model;
  options(provider, [["", role === "main" ? "默认主代理模型" : "跟随主代理"],
    ...providerEntries()],
    models.find((m) => m.key === key)?.provider || "");
  const fill = (selected) => {
    options(model, provider.value ? modelEntries(provider.value) : [["", "使用默认模型"]], selected);
    model.disabled = !provider.value;
  };
  fill(key);
  const thinking = select("thinking", `${title}思考等级`);
  const fillThinking = () => {
    const levels = models.find((m) => m.key === model.value)?.levels || thinkingLevels;
    options(thinking, [["", role === "main" ? "沿用默认思考等级" : "跟随主代理思考等级"], ...levels.map((v) => [v, v])], thinking.value || initial.thinking || "");
  };
  model.onchange = fillThinking;
  provider.onchange = () => { fill(provider.value ? modelEntries(provider.value)[0]?.[0] || "" : ""); fillThinking(); };
  fillThinking();
  const mode = select("mode", `${title}能力模式`);
  options(mode, [...(role === "subagent" ? [["inherit", "跟随主代理能力"]] : []), ["all", "全部能力"], ["custom", "自定义能力"]], initial.capabilities === "inherit" ? "inherit" : initial.capabilities == null ? "all" : "custom");
  fieldset.append(selectors);
  const pickers = document.createElement("div");
  pickers.hidden = mode.value !== "custom";
  for (const [kind, labelText] of [["skills", "Skills"], ["mcp", "MCP 服务"], ["plugins", "Extensions 扩展"]]) {
    const entries = catalog[kind];
    const details = document.createElement("details");
    details.className = "capability-picker";
    const heading = document.createElement("summary");
    const list = document.createElement("div");
    list.className = "capability-options";
    const update = () => heading.textContent = `${labelText} · 已选 ${list.querySelectorAll("input:checked").length} / ${entries.length}`;
    for (const entry of entries) {
      const label = document.createElement("label");
      label.title = [entry.description, entry.id].filter(Boolean).join("\n");
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = initial.capabilities == null || initial.capabilities === "inherit" || initial.capabilities[kind].includes(entry.id);
      checkbox.value = entry.id;
      checkbox.dataset.kind = kind;
      checkbox.onchange = update;
      label.append(checkbox, document.createTextNode(entry.scope
        ? `${entry.scope === "project" ? "[当前项目]" : "[全局]"} ${entry.name}` : entry.name));
      list.append(label);
    }
    if (!entries.length) {
      const empty = document.createElement("p");
      empty.textContent = "没有已启用的可用项";
      list.append(empty);
    }
    update();
    details.append(heading, list);
    pickers.append(details);
  }
  mode.onchange = () => { pickers.hidden = mode.value !== "custom"; };
  fieldset.append(pickers);
  $("create-agents").append(fieldset);
  return () => ({
    model: model.value || null,
    thinking: thinking.value || null,
    capabilities: mode.value === "inherit" ? "inherit" : mode.value === "all" ? null : Object.fromEntries(
      ["skills", "mcp", "plugins"].map((kind) => [kind,
        [...pickers.querySelectorAll(`input[data-kind="${kind}"]:checked`)].map((input) => input.value)])),
  });
}
// 配置载荷：只带 selection schema 内的字段；scope 为空=全局默认，否则写该目录的独立配置。
const defaultsSelection = () => {
  const main = creation.main(), child = creation.subagent();
  return {
    model: main.model,
    subagentModel: child.model,
    thinking: main.thinking,
    subagentThinking: child.thinking,
    capabilities: main.capabilities,
    subagentCapabilities: child.capabilities,
    compaction: creation.compaction.read(),
    retry: creation.retry.read(),
  };
};
let defaultsSaving = false;

async function loadCreation() {
  const active = settingsTicket();
  const current = creation;
  const load = ++creationLoad;
  const scope = defaultsScope;
  current.loading = true;
  current.main = null;
  disposePickers($("create-agents"));
  disposePickers($("create-compaction"));
  $("create-agents").replaceChildren();
  $("create-compaction").replaceChildren();
  $("create-retry").replaceChildren();
  $("create-feedback").textContent = "正在读取本机 Pi 能力…";
  try {
    const [catalog, selected] = await Promise.all([
      request("capabilities.list", scope ? { cwd: scope } : {}),
      request("session.defaults.get", scope ? { cwd: scope } : {}),
    ]);
    // 期间切了配置范围就丢弃这次结果：否则另一个目录的配置会画进当前表单并接着被自动保存回去。
    if (!active() || creation !== current || load !== creationLoad || scope !== defaultsScope) return;
    current.loading = false;
    $("create-agents").replaceChildren();
    current.main = createAgentPicker("main", "主代理", catalog, { model: selected.model, thinking: selected.thinking, capabilities: selected.capabilities });
    current.subagent = createAgentPicker("subagent", "子代理", catalog, { model: selected.subagentModel, thinking: selected.subagentThinking, capabilities: selected.subagentCapabilities });
    current.compaction = compactionEditor(selected.compaction || compactionDefaults, () => $("create-main-model").value);
    $("create-compaction").replaceChildren(current.compaction.node);
    $("create-main-model").addEventListener("change", current.compaction.fillThinking);
    current.retry = retryEditor(selected.retry);
    $("create-retry").replaceChildren(current.retry.node);
    current.catalog = catalog;
    updateDefaultsPreview();
    $("create-feedback").textContent = catalog.warnings.join("\n");
  } catch (e) {
    if (active() && creation === current && load === creationLoad) $("create-feedback").textContent = `加载失败：${e.message}`;
  }
}

function disposePickers(root) {
  for (const select of root.querySelectorAll("select[data-model-kind]")) modelPicker.dispose(select);
}
async function openDefaults() {
  const active = settingsTicket();
  creation = {};
  $("create-feedback").textContent = "";
  $("defaults-preview").textContent = "";
  disposePickers($("create-agents"));
  $("create-agents").replaceChildren();
  try {
    await refreshDefaultsScope();
  } catch (e) { if (active()) $("create-feedback").textContent = `读取已配置目录失败：${e.message}`; }
  if (active()) await loadCreation();
}

// 下拉只决定编辑哪份配置，不切换当前会话。
$("defaults-workspace").onchange = async () => {
  if (!connected || changing) return;
  defaultsScope = $("defaults-workspace").value;
  $("defaults-delete").hidden = !defaultsScope;
  await loadCreation();
};

$("defaults-directory").onclick = async () => {
  if (!connected || changing) return;
  const current = creation;
  try {
    const entry = await filePicker.open({ title: "选择要单独配置的工作目录", mode: "folder", path: defaultsScope || currentCwd });
    if (!entry || creation !== current || !connected || changing) return;
    const { path } = entry;
    const previousWorkspaces = [...defaultsWorkspaces];
    changing = true;
    updateAvailability();
    // 新目录从全局默认复制一份独立配置；已配置的目录直接加载自己的，绝不覆盖。
    if (!defaultsWorkspaces.includes(path)) {
      // 空补丁让服务端按真实目录复制有效配置，目录别名不会覆盖已有选择。
      await request("session.defaults.configure", { cwd: path });
      await refreshDefaultsScope();
    }
    const pathKey = (value) => /^[a-z]:[\\/]|^[\\/]{2}/i.test(value) ? value.replaceAll("\\", "/").toLowerCase() : value;
    defaultsScope = defaultsWorkspaces.find((value) => pathKey(value) === pathKey(path))
      || defaultsWorkspaces.find((value) => !previousWorkspaces.includes(value)) || "";
    renderDefaultsScope();
    await loadCreation();
  } catch (e) { $("create-feedback").textContent = `选择目录失败：${e.message}`; }
  finally { changing = false; updateAvailability(); }
};

$("defaults-delete").onclick = async () => {
  const scope = defaultsScope;
  if (!scope || changing || !connected) return;
  const button = $("defaults-delete");
  changing = true;
  updateAvailability();
  button.disabled = true;
  try {
    await request("session.defaults.delete", { cwd: scope });
    if (defaultsScope !== scope) return;
    defaultsScope = "";
    await refreshDefaultsScope();
    await loadCreation();
  } catch (e) {
    if (defaultsScope === scope) $("create-feedback").textContent = `删除失败：${e.message}`;
  } finally { changing = false; updateAvailability(); }
};

function updateDefaultsPreview() {
  if (!creation?.main) return;
  const main = creation.main(), child = creation.subagent();
  const compaction = creation.compaction?.read();
  const retry = creation.retry?.read();
  const retryLine = retry && (retry.retryable.length || retry.nonRetryable.length)
    ? `\n\n自动重试 · 强制重试 ${retry.retryable.length} 条 · 强制不重试 ${retry.nonRetryable.length} 条`
    : "";
  const compactionLine = compaction
    ? `\n\n自动压缩 · ${compaction.enabled ? ([
        compaction.tokenThreshold ? `${compaction.tokenThreshold.toLocaleString("en-US")} tokens` : null,
        compaction.percentThreshold ? `${compaction.percentThreshold}%` : null,
      ].filter(Boolean).join(" 或 ") || "未设阈值") + " 触发" : "关闭"} · 保留最近 ${(Number.isFinite(compaction.keepRecentTokens) ? compaction.keepRecentTokens : compactionDefaults.keepRecentTokens).toLocaleString("en-US")} tokens · ${models.find((m) => m.key === compaction.model)?.name || compaction.model || "主代理模型"} · ${compaction.thinking}`
    : "";
  $("defaults-preview").textContent = [["主 Agent", main], ["子 Agent", child]].map(([title, agent]) => {
    const key = agent.model || (agent === child ? main.model : null);
    const model = models.find((m) => m.key === key);
    const capabilities = agent.capabilities === "inherit" ? main.capabilities : agent.capabilities;
    return `${title} · ${model?.provider || "默认供应商"} · ${model?.name || key || "默认模型"} · ${agent.thinking || (agent === child ? main.thinking : null) || "默认"}\n` +
      [["skills", "Skills"], ["mcp", "MCP"], ["plugins", "Extensions"]].map(([kind, label]) => `${label}：${(capabilities?.[kind] || creation.catalog[kind].map((entry) => entry.id)).map(capabilityName).join("、") || "无"}`).join("\n");
  }).join("\n\n") + compactionLine + retryLine;
}
$("create-form").onchange = () => {
  if (!creation?.main) return;
  updateDefaultsPreview();
  $("create-form").requestSubmit();
};
$("create-form").onsubmit = async (e) => {
  e.preventDefault();
  if (!creation?.main || creation.loading || changing || defaultsSaving || !connected) return;
  const invalid = creation.compaction?.error?.();
  if (invalid) {
    $("create-feedback").textContent = invalid;
    return;
  }
  // 保存目标在提交瞬间锁定：之后切配置范围也不会把这份选择写进别的目录。
  const scope = defaultsScope;
  const data = { ...defaultsSelection(), ...(scope ? { cwd: scope } : {}) };
  defaultsSaving = true;
  changing = true;
  updateAvailability();
  $("create-feedback").textContent = "正在保存…";
  try {
    await request("session.defaults.configure", data);
    if (defaultsScope !== scope) return;
    $("create-feedback").textContent = scope
      ? `已保存 · ${scope} 的新会话使用此配置`
      : "已保存到本机 · 全局默认，未单独配置的目录使用此配置";
  } catch (err) {
    if (defaultsScope === scope) $("create-feedback").textContent = `保存失败，当前选择未生效：${err.message}。请重新选择以重试。`;
  } finally {
    defaultsSaving = false;
    changing = false;
    updateAvailability();
  }
};
