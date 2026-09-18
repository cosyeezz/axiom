// 有界 DOM（Phase D1）：前插（上滚读旧历史）是唯一无界累积方向；超窗后裁掉最新端
// 非流式节点，分页条反映真实窗口；贴底预取/下翻按钮改走 target 定位整页重挂，被裁
// 区间完整回载（同 revision 下 D2 页缓存命中）。live 流式卡不在 rawEntries，不会被裁。
import test from "node:test";
import assert from "node:assert/strict";
import { bootHistoryPage, until } from "./helpers/history-page.js";

const md = (i) => `**历史${i}**\n\n- 项甲${i}\n- 项乙${i}\n\n\`行内${i}\``;
const records = Array.from({ length: 420 }, (_, i) => ({
  agentId: "main",
  entryId: `hist-${i}`,
  message: { role: i % 2 ? "assistant" : "user", content: md(i) },
}));

async function attachAndPageUp(page, pages) {
  await until(() => page.app.historyState().history.start === 360, "attach 末页");
  for (let i = 0; i < pages; i++) {
    const before = page.app.historyState().history.prevCursor;
    if (!before) break;
    await page.app.loadHistory({ before });
    await until(() => page.app.historyState().history.start < 360 - i * 60, `前插第 ${i + 1} 页`);
  }
}

test("前插累积超窗裁底：窗口有界、分页条反映真实范围、无丢失假象", async (t) => {
  const page = bootHistoryPage({ records });
  t.after(page.close);
  page.open();
  await until(() => page.app.connected(), "连接");
  await attachAndPageUp(page, 5); // 60 + 5×60 = 360 条挂载 → 裁到 300
  assert.equal(page.messages(), 300, "挂载窗口封顶在 300");
  // 被裁的是最新端（attach 的 [360,420)）：窗口 = [60,360)。
  assert.match(page.pageText(), /^61–360 \/ 共 420 条/, "分页条反映裁剪后窗口（61–360 为 300 条）");
  assert.ok(page.count("历史359") >= 1, "窗口右缘消息仍在");
  assert.equal(page.count("历史419"), 0, "被裁消息不在 DOM（回载可达）");
  assert.ok(page.count("历史60") >= 1, "窗口左缘（前插最旧页）保留");
  // mainItems 与窗口同构（goal 锚依赖）。
  assert.deepEqual(page.app.mainEntries(), page.app.historyState().messages
    .filter(e => e.agentId === "main" && ["assistant", "user"].includes(e.message.role))
    .map(e => e.entryId).filter(id => id !== undefined));
  // 上滚回载仍通：prevCursor 指向窗口首条，前一页完整前插；持续前插仍维持窗口上限。
  const before = page.app.historyState().history.prevCursor;
  await page.app.loadHistory({ before });
  await until(() => page.app.historyState().history.start === 0, "回最旧页");
  assert.ok(page.count("项甲59") >= 1, "前插衔接处无跳条");
  assert.ok(page.count("历史0") >= 1, "窗口左缘抵达最早页");
  assert.equal(page.messages(), 300, "阅读端持续前插仍维持窗口上限（最新端再裁）");
  assert.match(page.pageText(), /^1–300 \/ 共 420 条/);
});

test("裁剪后下翻走 target 重挂被裁区间，D2 页缓存命中", async (t) => {
  const page = bootHistoryPage({ records });
  t.after(page.close);
  page.open();
  await until(() => page.app.connected(), "连接");
  await attachAndPageUp(page, 5);
  assert.equal(page.messages(), 300);
  const storeAfterTrim = page.app.pageCacheStats().store;

  // 下翻按钮：不沿用旧 after 游标（会跳过被裁区间），改走 target=被裁第一条。
  page.$("history-after").click();
  await until(() => page.requests.some(r => r.type === "session.history" && r.target === "hist-360"), "target 定位请求");
  await until(() => page.app.historyState().history.start === 360, "重挂被裁页");
  assert.equal(page.messages(), 60, "被裁区间整页重挂");
  assert.ok(page.count("历史419") >= 1, "被裁的最后一条回来了");
  assert.equal(page.count("项甲100"), 0, "整页替换后旧前插页卸载");
  // 同 revision 整页重挂 → D2 页缓存命中（复用裁剪前的渲染产物）。
  const stats = page.app.pageCacheStats();
  assert.ok(stats.hit >= 30, `回载命中页缓存：hit=${stats.hit}`);
  assert.equal(stats.store, storeAfterTrim, "命中不新增缓存条目");
  // 重挂到末页（无下页）：分页条不占空间，语义与现状一致。
  assert.equal(page.pageText(), "");
});

test("未超窗不裁剪，语义与现状一致", async (t) => {
  const page = bootHistoryPage({ records });
  t.after(page.close);
  page.open();
  await until(() => page.app.connected(), "连接");
  await attachAndPageUp(page, 2); // 60 + 120 = 180 < 300
  assert.equal(page.messages(), 180);
  // 从末页上滚：无裁剪无 boundary，分页条维持末页（不占空间）语义。
  assert.equal(page.pageText(), "");
  assert.ok(page.count("历史419") >= 1, "未裁剪时全部消息在 DOM");
});

// 真实会话是混合记录：toolResult 不拥有自己的消息节点，内容渲染进前一条 assistant
// 卡的过程组。裁剪不能在这类条目上停死（否则混合会话永远不裁，真实浏览器里曾挂
// 满 500 条），也不能拆开它与主卡（否则 DOM 在展示已丢弃的记录）。
const mixed = Array.from({ length: 420 }, (_, i) => {
  const entryId = `mix-${i}`;
  if (i % 4 === 0) return { agentId: "main", entryId, message: { role: "user", content: `提问${i}` } };
  if (i % 4 === 1) return { agentId: "main", entryId, message: { role: "assistant", content: [{ type: "text", text: md(i) }] } };
  if (i % 4 === 2) return { agentId: "main", entryId, message: { role: "assistant", content: [
    { type: "thinking", thinking: `思考${i}` },
    { type: "toolCall", id: `call-${i}`, name: "read", arguments: { path: `f-${i}.txt` } },
  ] } };
  return { agentId: "main", entryId, message: { role: "toolResult", toolCallId: `call-${i - 1}`, toolName: "read", content: [{ type: "text", text: `结果${i}` }] } };
});

test("混合记录（toolResult 无独立节点）仍裁到上限，且边界不拆开主卡", async (t) => {
  const page = bootHistoryPage({ records: mixed });
  t.after(page.close);
  page.open();
  await until(() => page.app.connected(), "连接");
  await attachAndPageUp(page, 5); // 360 条记录挂载 → 裁到 ≤300
  const mounted = page.app.historyState().messages;
  assert.equal(mounted.length, 300, "混合会话也裁到上限（修前停在 toolResult 上 cut=0，全部挂着）");
  assert.match(page.pageText(), /^61–360 \/ 共 420 条/, "分页条反映真实窗口");
  // 丢弃集合 DOM 完整：被裁第一条（mix-360，拥有自己的节点）连内容离开 DOM；
  // 右缘可以是 toolResult（mix-359），它的主卡 mix-358 仍在窗口内，没有被拆开。
  assert.equal(mounted.at(-1).entryId, "mix-359");
  assert.ok(mounted.some(entry => entry.entryId === "mix-358"), "右缘 toolResult 的主卡仍在窗口内");
  assert.equal(page.count("提问360"), 0, "被裁的最新端不在 DOM");
  assert.ok(page.count("提问64") >= 1, "窗口内消息在场");
  assert.ok(page.messages() <= 300, `消息节点数有界：${page.messages()}`);
  // 下翻回载：target 定位到被裁第一条（拥有节点的条目），区间完整回来。
  page.$("history-after").click();
  await until(() => page.requests.some(r => r.type === "session.history" && r.target === "mix-360"), "target 定位请求");
  await until(() => page.app.historyState().history.start === 360, "重挂被裁页");
  assert.ok(page.count("提问416") >= 1, "被裁区间回载后可见");
});
