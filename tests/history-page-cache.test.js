// 页级渲染缓存：历史整份重挂是重复渲染的主场景——撤回后重取、后台回前台收口、
// 切会话再切回，都会把同一批终态 markdown 从零 lex/parse。缓存按 entryId 复用旧 blocks；
// 键包含 sessionId，切走保留、切回命中；同文不同会话不互相冒充。
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

  // 再来一次：继续命中，不重复入缓存。
  await page.app.reattach();
  await until(() => page.app.attachFlags().attaching === false, "第二次重取完成");
  const again = page.app.pageCacheStats();
  assert.ok(again.hit >= stats.hit + 120, "反复重挂继续命中");
  assert.equal(again.entries, stats.entries, "命中不新增缓存条目");
});

test("切走再切回命中缓存，且同名键不跨会话冒充", async (t) => {
  const page = bootSessionPage({ records });
  t.after(page.close);
  page.open();
  await until(() => page.app.connected(), "连接");
  const afterFirst = page.app.pageCacheStats();
  assert.ok(afterFirst.store >= 120);

  // 切到另一个会话：entryId 同名、正文同文，但属于不同会话，不得命中。
  const other = makeRecords(4, "别的会话").map((record, index) => ({ ...record,
    entryId: `hist-${index}`, messageId: `hist-${index}`,
    message: { role: "assistant", content: md(index) } }));
  page.app.snapshot(sessionState("other", { messages: other, seq: 1 }));
  const switched = page.app.pageCacheStats();
  assert.equal(switched.hit, afterFirst.hit, "换会话不得命中同名键");
  // 旧会话产物留在缓存里等切回时复用，不再随切换整体丢弃。
  assert.ok(switched.entries >= afterFirst.entries + 4, `旧会话条目应保留：entries=${switched.entries}`);

  // 切回原会话：旧产物节点已随旧页销毁而 detach，直接 move 回来。
  await page.app.reattach();
  await until(() => page.app.attachFlags().attaching === false, "切回原会话");
  const revived = page.app.pageCacheStats();
  assert.ok(revived.hit >= switched.hit + 120, `切回应命中：hit=${revived.hit}←${switched.hit}`);
  assert.equal(page.messages(), 240, "命中复用后历史条数不变");
});
