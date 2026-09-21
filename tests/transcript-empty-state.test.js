// 空态占位的摘除口径：占位只在 #output 无子节点时存在一个，挂载/追加消息时必须摘掉。
//
// 这里同时锁住复杂度：原来每次追加消息都 `#output.querySelector(".empty")`，在已长大的整棵
// 子树上找一个只可能存在于空态的节点，挂载长历史就是 O(n²)（300 条累计扫 134 万节点）。
// 现在改成持引用 O(1) 摘除，所以「追加 n 条消息」不得随 n 增长去扫 #output。
import test from "node:test";
import assert from "node:assert/strict";
import { bootSessionPage, until, makeRecords } from "./helpers/session-page.js";

const append = (page, index) => page.app.event({
  sessionId: "long", agentId: "main", type: "agent.message.end", seq: 501 + index,
  data: { entryId: `add-${index}`, messageId: `add-${index}`, message: { role: "user", content: `追加${index}` } },
});

test("空会话显示空态占位，来消息即摘除且不残留", async (t) => {
  const page = bootSessionPage({ records: [] });
  t.after(page.close);
  page.open();
  await until(() => page.app.connected(), "连接");
  assert.equal(page.$("output").querySelectorAll(".empty").length, 1, "空会话应有一个空态占位");

  append(page, 0);
  await until(() => page.messages() === 1, "消息落地");
  assert.equal(page.$("output").querySelectorAll(".empty").length, 0, "来消息后空态占位必须摘掉");

  // 再追加若干条：占位已摘，不得因为引用失效而复活或重复摘除报错。
  for (let i = 1; i <= 5; i++) append(page, i);
  await until(() => page.messages() === 6, "继续追加");
  assert.equal(page.$("output").querySelectorAll(".empty").length, 0, "占位不得复活");
});

test("追加消息不按条数扫 #output 子树（空态摘除是 O(1)）", async (t) => {
  const page = bootSessionPage({ records: makeRecords(40) });
  t.after(page.close);
  page.open();
  await until(() => page.app.connected(), "连接");

  // 只统计以 #output 为根的查询：这类查询会随历史增长而变贵，是 O(n²) 的来源。
  const output = page.$("output");
  const original = output.querySelector.bind(output);
  let scans = 0;
  output.querySelector = (selector) => { scans++; return original(selector); };

  const before = page.messages();
  for (let i = 0; i < 30; i++) append(page, i);
  await until(() => page.messages() === before + 30, "追加 30 条");

  assert.ok(scans <= 3, `追加 30 条不应逐条扫 #output：scans=${scans}`);
  assert.equal(page.$("output").querySelectorAll(".empty").length, 0, "非空会话没有空态占位");
});
