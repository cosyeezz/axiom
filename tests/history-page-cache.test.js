// 页级渲染缓存的分页集成（Phase D2）：历史快照整页替换是重复渲染主场景——翻页来回、
// 目标定位、切会话再切回都会把同一批终态 markdown 从零 lex/parse。页缓存按
// entryId 复用旧 blocks；同 revision（epoch）内命中，切换即整体丢弃。
import test from "node:test";
import assert from "node:assert/strict";
import { bootHistoryPage, until } from "./helpers/history-page.js";

// 用户消息走 textContent 快路径不参与；assistant 消息含 markdown 语法走复杂渲染。
const md = (i) => `**历史${i}**\n\n- 项甲${i}\n- 项乙${i}\n\n\`行内${i}\``;
const records = Array.from({ length: 240 }, (_, i) => ({
  agentId: "main",
  entryId: `hist-${i}`,
  message: { role: i % 2 ? "assistant" : "user", content: md(i) },
}));

test("翻页来回与目标定位命中页缓存，渲染内容等价", async (t) => {
  const page = bootHistoryPage({ records });
  t.after(page.close);
  page.open();
  await until(() => page.app.connected(), "连接");
  // attach 快照（末页 180–239）：30 条 assistant 复杂 markdown 入缓存。
  await until(() => page.app.historyState().history.start === 180, "末页");
  const lastHtml = [...page.$("output").querySelectorAll(".message")]
    .filter((node) => node.querySelector(".markdown-block")).map((node) => node.innerHTML);
  const afterAttach = page.app.pageCacheStats();
  assert.ok(afterAttach.store >= 30, `复杂 markdown 应入缓存：store=${afterAttach.store}`);

  // 翻到首页：键不重叠，纯 miss（新一批 store）。
  await page.app.loadHistory({ edge: "first" });
  await until(() => page.app.historyState().history.start === 0, "首页");
  assert.equal(page.app.pageCacheStats().hit, 0, "换页键不重叠不应命中");

  // 翻回末页：同键同文，命中复用。
  await page.app.loadHistory({ edge: "last" });
  await until(() => page.app.historyState().history.start === 180, "回末页");
  const stats = page.app.pageCacheStats();
  assert.ok(stats.hit >= 30, `回页应命中：hit=${stats.hit}`);
  assert.equal(page.messages(), 60);
  const backHtml = [...page.$("output").querySelectorAll(".message")]
    .filter((node) => node.querySelector(".markdown-block")).map((node) => node.innerHTML);
  assert.deepEqual(backHtml, lastHtml, "命中复用后渲染产物与首渲等价");

  // 目标定位回首页第一条（窗口 [0,60) 与已缓存首页重合）：同 revision 继续命中。
  await page.app.loadHistory({ target: "hist-0" });
  await until(() => page.app.historyState().history.start === 0, "定位回首页");
  assert.ok(page.app.pageCacheStats().hit >= stats.hit + 30, "同 revision 内跨页往返继续命中");
});

test("历史修订推进后旧缓存作废（epoch 切换整体丢弃）", async (t) => {
  const page = bootHistoryPage({ records });
  t.after(page.close);
  page.open();
  await until(() => page.app.connected(), "连接");
  await until(() => page.app.historyState().history.start === 180, "末页");
  const firstStats = page.app.pageCacheStats();
  assert.ok(firstStats.store >= 30);

  // 服务端历史变化（新消息入史）：revision 前进，旧页缓存整体作废。
  page.touchHistory();
  await page.app.loadHistory({ edge: "first" });
  await until(() => page.app.historyState().history.start === 0, "首页");
  const revived = page.app.pageCacheStats();
  // 首页键与末页键不重叠：若 epoch 未切换会累计到 60 条；恰好 30 条说明旧缓存已整体现弃。
  assert.equal(revived.entries, 30, "旧 epoch 条目应被整体丢弃");
  assert.equal(revived.hit, 0);
  // 末页键在新对象里不存在：再翻回末页也不命中（同文不同代不冒充）。
  await page.app.loadHistory({ edge: "last" });
  await until(() => page.app.historyState().history.start === 180, "回末页");
  assert.equal(page.app.pageCacheStats().hit, 0, "旧代条目不复用");
  assert.ok(page.app.pageCacheStats().store >= 60, "新 epoch 重新入缓存");
});
