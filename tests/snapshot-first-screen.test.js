import test from "node:test";
import assert from "node:assert/strict";
import { bootHistoryPage, until, sessionState, PAGE_SIZE } from "./helpers/history-page.js";

// 分页替代分片后的首屏语义：attach 只回最近一页，snapshot() 同步挂载这一页；
// 「更旧/更新」按不透明游标取相邻页，页面替换上一页而不是越铺越长。
// 假服务端用真实 src/session-history.js 的 pageOf 算游标，断言的是真实分页行为。
const TOTAL = 240;

async function login(page) {
  page.open();
  await until(() => page.app.connected(), "登录恢复完成");
  return page;
}

test("登录首屏：同步清场后只挂最近一页（60 条），分页控件与连接门控就位", async (t) => {
  const page = bootHistoryPage();
  t.after(page.close);
  const { $, app } = page;
  // 断线重连后页面上残留的旧会话内容：identity 切换必须先清掉它。
  const residue = page.window.document.createElement("div");
  residue.className = "message";
  residue.textContent = "旧会话残留";
  $("output").append(residue);
  assert.equal($("workspace").hidden, true, "登录前不显示 workspace");

  await login(page);

  assert.equal($("workspace").hidden, false);
  assert.equal($("login").hidden, true);
  assert.equal($("output").textContent.includes("旧会话残留"), false, "首屏同步清场");
  assert.equal(page.messages(), PAGE_SIZE, "首屏只挂一页，不铺全量历史");
  assert.equal(page.count("历史180"), 1, "本页从第 181 条开始");
  assert.equal(page.count("历史239"), 1, "本页到最新一条结束");
  assert.equal(page.count("历史179"), 0, "更早的一页不在首屏");
  assert.equal(page.pageText(), "");
  assert.equal($("history-pages").hidden, true);
  assert.equal($("history-before").disabled, false, "有更旧历史，可翻页");
  assert.equal($("history-after").disabled, true, "已在最新页，无更新页");
  assert.equal(app.watermark("long"), 500, "attach 快照提交 seq 水位");
  assert.equal(app.queue(), null, "首屏提交后事件闸已释放");
  assert.equal($("status").dataset.connected, "true");

  // 连接与发送能力：恢复完成后输入内容即可发送。
  $("prompt").value = "恢复后发送";
  $("prompt").dispatchEvent(new page.window.Event("input"));
  assert.equal($("send").disabled, false, "完整恢复后开放发送");
});

test("上滚走真实游标：前插历史保留旧节点且不推进水位", async (t) => {
  const page = await login(bootHistoryPage());
  t.after(page.close);
  const { $, app } = page;
  const tail = $("output").lastElementChild;
  const click = async (start) => {
    await app.loadHistory({ before: app.historyState().history.prevCursor });
    assert.equal(app.historyState().history.start, start);
  };

  await click(120);
  assert.equal(page.messages(), PAGE_SIZE * 2);
  assert.equal(page.count("历史120"), 1);
  assert.equal(page.count("历史179"), 1);
  assert.equal(page.count("历史180"), 1);
  assert.equal(page.count("历史239"), 1);
  assert.equal($("output").lastElementChild, tail, "已有节点不重建");
  assert.equal(app.watermark("long"), 500, "页响应不是实时快照，不提交水位");

  await click(60);
  await click(0);
  assert.equal(page.messages(), TOTAL);
  assert.equal($("history-before").disabled, true, "全部历史加载完成");
  assert.equal($("history-after").disabled, true, "回到最新页");
  assert.equal(app.watermark("long"), 500, "一轮翻页后水位仍未变");
});

test("首屏渲染抛错：不连接、不可发、解阀并回到登录入口", async (t) => {
  const page = bootHistoryPage({ hold: (req) => req.type === "session.attach" });
  t.after(page.close);
  const { $, app } = page;
  page.open();
  await until(() => page.held() === 1, "attach 在飞");
  const restore = app.failPlacement();
  page.release();
  await until(() => $("error").textContent.includes("分片渲染失败"), "失败上报到错误区");
  assert.equal(app.connected(), false, "失败不得把连接标记为已建立");
  assert.equal($("send").disabled, true, "失败后仍不可发送");
  assert.equal(app.queue(), null, "失败快照释放事件闸，不永久排队");
  assert.equal($("status").dataset.connected, "false");
  assert.equal($("login").hidden, false, "错误回到登录入口");
  restore();
});

test("首屏钩子抛错与渲染抛错同路：解阀且不提交水位", async (t) => {
  const page = bootHistoryPage();
  t.after(page.close);
  const { app } = page;
  const state = { ...sessionState("solo", { seq: 999 }), history: undefined };
  assert.throws(() => app.snapshot(state, () => { throw new Error("首屏钩子失败"); }), /首屏钩子失败/);
  assert.equal(app.queue(), null, "回调异常必须解阀，否则事后事件永久排队");
  assert.equal(app.watermark("solo"), undefined, "未完成的快照不得提交水位");
});
