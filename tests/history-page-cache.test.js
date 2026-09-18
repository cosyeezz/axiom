// 页级渲染缓存：历史整份重挂是重复渲染的主场景——撤回后重取、后台回前台收口、
// 切会话再切回，都会把同一批终态 markdown 从零 lex/parse。缓存按 entryId 复用旧 blocks；
// epoch 就是 sessionId，切换会话即整体丢弃（同文不同会话不互相冒充）。
import test from "node:test";
import assert from "node:assert/strict";
import { bootSessionPage, until, sessionState, makeRecords } from "./helpers/session-page.js";

// 用户消息走 textContent 快路径不参与；assistant 消息含 markdown 语法走复杂渲染。
const md = (i) => `**历史${i}**\n\n- 项甲${i}\n- 项乙${i}\n\n\`行内${i}\``;
const records = Array.from({ length: 240 }, (_, i) => ({
  agentId: "main",
  entryId: `hist-${i}`,
  message: { role: i % 2 ? "assistant" : "user", content: md(i) },
}));

test("同会话整份重挂命中页缓存，渲染内容等价", async (t) => {
  const page = bootSessionPage({ records });
  t.after(page.close);
  page.open();
  await until(() => page.app.connected(), "连接");
  // attach 快照：120 条 assistant 复杂 markdown 入缓存。
  const afterAttach = page.app.pageCacheStats();
  assert.ok(afterAttach.store >= 120, `复杂 markdown 应入缓存：store=${afterAttach.store}`);
  assert.equal(afterAttach.hit, 0, "首渲没有可命中的条目");
  const firstHtml = [...page.$("output").querySelectorAll(".message")]
    .filter((node) => node.querySelector(".markdown-block")).map((node) => node.innerHTML);

  // 撤回后重取（reason: recall）：同会话同内容整份重挂，键不变即命中。
  await page.app.reattach();
  await until(() => page.app.attachFlags().attaching === false, "重取完成");
  const stats = page.app.pageCacheStats();
  assert.ok(stats.hit >= 120, `整份重挂应命中：hit=${stats.hit}`);
  assert.equal(page.messages(), 240);
  const backHtml = [...page.$("output").querySelectorAll(".message")]
    .filter((node) => node.querySelector(".markdown-block")).map((node) => node.innerHTML);
  assert.deepEqual(backHtml, firstHtml, "命中复用后渲染产物与首渲等价");

  // 再来一次：同 epoch 内继续命中，不重复入缓存。
  await page.app.reattach();
  await until(() => page.app.attachFlags().attaching === false, "第二次重取完成");
  const again = page.app.pageCacheStats();
  assert.ok(again.hit >= stats.hit + 120, "同 epoch 内反复重挂继续命中");
  assert.equal(again.entries, stats.entries, "命中不新增缓存条目");
});

test("切换会话后旧缓存作废（epoch = sessionId，整体丢弃）", async (t) => {
  const page = bootSessionPage({ records });
  t.after(page.close);
  page.open();
  await until(() => page.app.connected(), "连接");
  assert.ok(page.app.pageCacheStats().store >= 120);

  // 切到另一个会话：内容同文但 entryId 归属不同会话，缓存整体丢弃。
  const other = makeRecords(4, "别的会话").map((record, index) => ({ ...record,
    entryId: `hist-${index}`, messageId: `hist-${index}`,
    message: { role: "assistant", content: md(index) } }));
  page.app.snapshot(sessionState("other", { messages: other, seq: 1 }));
  const switched = page.app.pageCacheStats();
  assert.equal(switched.hit, 0, "换会话不得命中同名键");
  assert.equal(switched.entries, 4, "旧会话条目被整体丢弃");

  // 切回原会话：新缓存对象里没有原会话条目，重新入缓存而不是复用旧代。
  await page.app.reattach();
  await until(() => page.app.attachFlags().attaching === false, "切回原会话");
  const revived = page.app.pageCacheStats();
  assert.equal(revived.hit, 0, "旧代条目不复用");
  assert.ok(revived.store >= 120, "新 epoch 重新入缓存");
});
