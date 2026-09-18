import test from "node:test";
import assert from "node:assert/strict";
import { bootSessionPage, until, sessionState } from "./helpers/session-page.js";

// 分页删除后的首屏语义：attach 一次回全量历史，snapshot() 同步清场并整份挂载；
// 两个滚动按钮只做本地跳转，不再有页游标、页替换与补齐请求。
const TOTAL = 240;

async function login(page) {
  page.open();
  await until(() => page.app.connected(), "登录恢复完成");
  return page;
}

test("登录首屏：同步清场后整份挂载全部历史，连接门控就位", async (t) => {
  const page = bootSessionPage();
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
  assert.equal(page.messages(), TOTAL, "首屏即全量历史");
  assert.equal(page.count("历史0"), 1, "最早一条也在场");
  assert.equal(page.count("历史239"), 1, "最新一条在场");
  assert.equal(app.watermark("long"), 500, "attach 快照提交 seq 水位");
  assert.equal(app.queue(), null, "首屏提交后事件闸已释放");
  assert.equal($("status").dataset.connected, "true");

  // 连接与发送能力：恢复完成后输入内容即可发送。
  $("prompt").value = "恢复后发送";
  $("prompt").dispatchEvent(new page.window.Event("input"));
  assert.equal($("send").disabled, false, "完整恢复后开放发送");
});

test("首屏挂载后不再有任何历史补齐请求", async (t) => {
  const page = await login(bootSessionPage());
  t.after(page.close);
  const { $, app } = page;
  page.paint();
  const kinds = new Set(page.requests.map((req) => req.type));
  assert.equal(kinds.has("session.history"), false, "分页命令已下线");
  assert.equal(page.requests.filter((req) => req.type === "session.attach").length, 1, "只取一次快照");

  // 滚到顶：过去会触发前插取页，现在只是本地滚动。
  const before = page.requests.length;
  $("transcript").scrollTop = 0;
  $("transcript").dispatchEvent(new page.window.Event("scroll"));
  page.paint();
  assert.equal(page.requests.length, before, "滚到顶不取数");
  assert.equal(page.messages(), TOTAL, "历史范围不随滚动变化");
  assert.equal(app.watermark("long"), 500);
});

test("首屏渲染抛错：不连接、不可发、解阀并回到登录入口", async (t) => {
  const page = bootSessionPage({ hold: (req) => req.type === "session.attach" });
  t.after(page.close);
  const { $, app } = page;
  page.open();
  await until(() => page.held() === 1, "attach 在飞");
  const restore = app.failPlacement();
  page.release();
  await until(() => $("error").textContent.includes("历史挂载失败"), "失败上报到错误区");
  assert.equal(app.connected(), false, "失败不得把连接标记为已建立");
  assert.equal($("send").disabled, true, "失败后仍不可发送");
  assert.equal(app.queue(), null, "失败快照释放事件闸，不永久排队");
  assert.equal($("status").dataset.connected, "false");
  assert.equal($("login").hidden, false, "错误回到登录入口");
  restore();
});

test("首屏钩子抛错与渲染抛错同路：解阀且不提交水位", async (t) => {
  const page = bootSessionPage();
  t.after(page.close);
  const { app } = page;
  assert.throws(() => app.snapshot(sessionState("solo", { seq: 999 }), () => { throw new Error("首屏钩子失败"); }), /首屏钩子失败/);
  assert.equal(app.queue(), null, "回调异常必须解阀，否则事后事件永久排队");
  assert.equal(app.watermark("solo"), undefined, "未完成的快照不得提交水位");
});
