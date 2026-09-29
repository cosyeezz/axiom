import test from "node:test";
import assert from "node:assert/strict";
import { bootSessionPage } from "./helpers/session-page.js";

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(check) {
  const deadline = Date.now() + 10000;
  while (!check()) {
    assert.ok(Date.now() < deadline, "等待维护初始化超时");
    await wait(20);
  }
}
const service = status => ({ managed: true, operation: {
  operationId: "refresh-maintenance", operation: "rebuild", startedAt: 100,
  status, ready: status !== "running", phases: [],
  ...(status === "failed" ? { error: "准备失败" } : {}),
} });

test("远程维护中刷新：仅查询状态，读取失败不解锁，准备失败不断线即继续初始化", async t => {
  let status = "running", unreadable = false;
  const page = bootSessionPage({ records: [], respond(req, fallback) {
    if (req.type === "service.status") return unreadable ? { managed: true, operationError: "尚未确认" } : service(status);
    if (status === "running" || unreadable) throw new Error("服务正在维护");
    return fallback(req);
  } });
  t.after(page.close);
  page.open();
  await until(() => page.requests.length >= 2);
  assert.equal(page.app.connected(), false);
  assert.equal(page.app.transportState(), "restoring");
  assert.ok(page.requests.every(req => req.type === "service.status"));
  const before = page.requests.length;
  unreadable = true;
  await until(() => page.requests.length > before);
  assert.ok(page.requests.every(req => req.type === "service.status"));
  assert.equal(page.sockets.length, 1);
  status = "failed"; unreadable = false;
  await until(() => page.app.connected());
  assert.equal(page.app.transportState(), "open");
  assert.equal(page.sockets.length, 1);
  for (const type of ["models.list", "sessions.list", "session.attach"])
    assert.ok(page.requests.some(req => req.type === type));
  assert.match(page.$("service-history").textContent, /失败：准备失败/);
});

test("维护初始化睡眠中断线：旧代次不再请求，新连接等待后恢复", async t => {
  let status = "running";
  const page = bootSessionPage({ records: [], respond(req, fallback) {
    if (req.type === "service.status") return service(status);
    if (status === "running") throw new Error("服务正在维护");
    return fallback(req);
  } });
  t.after(page.close);
  page.open();
  await until(() => page.requests.length === 1);
  await wait(20);
  page.sockets[0].close(1011);
  const before = page.requests.length;
  await wait(1200);
  assert.equal(page.requests.length, before);
  await until(() => page.sockets.length === 2);
  status = "failed";
  page.open();
  await until(() => page.app.connected());
  assert.equal(page.app.transportState(), "open");
});

test("维护初始化在飞状态迟到：dispose 后不应用旧结果或继续业务请求", async t => {
  const page = bootSessionPage({ records: [], hold: req => req.type === "service.status",
    respond: (req, fallback) => req.type === "service.status" ? service("failed") : fallback(req),
  });
  t.after(page.close);
  page.open();
  await until(() => page.held() === 1);
  page.app.dispose();
  page.releaseAll();
  await wait(1100);
  assert.equal(page.requests.length, 1);
  assert.equal(page.app.connected(), false);
  assert.doesNotMatch(page.$("service-history").textContent, /准备失败/);
});

test("已初始化页面重连也先等待维护，不提前 attach", async t => {
  let status = "idle";
  const page = bootSessionPage({ records: [], respond(req, fallback) {
    if (req.type === "service.status") return service(status);
    if (status === "running") throw new Error("服务正在维护");
    return fallback(req);
  } });
  t.after(page.close);
  page.open();
  await until(() => page.app.connected());
  status = "running";
  page.sockets[0].close(1011);
  await until(() => page.sockets.length === 2);
  const before = page.requests.length;
  page.open();
  await until(() => page.requests.length >= before + 2);
  assert.ok(page.requests.slice(before).every(req => req.type === "service.status"));
  status = "failed";
  await until(() => page.app.connected());
  assert.ok(page.requests.slice(before).some(req => req.type === "session.attach"));
  assert.equal(page.sockets.length, 2);
});
