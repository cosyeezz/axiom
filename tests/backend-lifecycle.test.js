import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { resolve } from "node:path";
import { createBackendLifecycle } from "../desktop/backend-lifecycle.mjs";

function fixture() {
  const child = new EventEmitter(); child.pid = 42;
  const timers = new Set(); const sent = [];
  child.send = (message, callback) => { sent.push(message); callback(); };
  let calls = 0, options;
  const lifecycle = createBackendLifecycle({ bundleRoot: resolve("bundle"), nodePath: resolve("bundle/runtime/node"),
    bundleVersion: "0.1.7", dataRoot: "data", cwd: resolve("workspace"),
    spawn: (_file, _args, opts) => { calls++; options = opts; return child; },
    setTimer: (fn) => { timers.add(fn); return fn; }, clearTimer: (fn) => timers.delete(fn) });
  const ready = (extra = {}) => child.emit("message", { type: "service.ready", protocol: 1,
    token: options.env.AXIOM_START_TOKEN, instanceId: options.env.AXIOM_INSTANCE_ID,
    bundleVersion: "0.1.7", pid: 42, url: "http://127.0.0.1:4319", ...extra });
  return { lifecycle, child, timers, sent, ready, calls: () => calls, options: () => options };
}

test("并发启动共用 worker，伪 ready 无效，绝对数据路径不随安装目录变化", async () => {
  const f = fixture(), start = f.lifecycle.startBackend();
  assert.equal(f.lifecycle.startBackend(), start);
  assert.equal(f.calls(), 1);
  assert.equal(f.options().env.AXIOM_HOME, resolve("workspace/data"));
  for (const extra of [{ token: "fake" }, { pid: 99 }, { bundleVersion: "old" }, { url: "http://example.com:4319" }, { url: "http://127.0.0.1:99999" }]) {
    f.ready(extra); assert.equal(f.lifecycle.getBackendState().state, "starting");
  }
  f.ready(); assert.equal((await start).bundleVersion, "0.1.7");
  const stop = f.lifecycle.requestStop({ mode: "wait", reason: "update" });
  assert.equal(f.lifecycle.requestStop(), stop);
  assert.deepEqual(f.sent, [{ type: "service.stop", mode: "wait", reason: "update" }]);
  assert.equal(f.lifecycle.getBackendState().ready, undefined);
  assert.equal(f.lifecycle.requestStop({ mode: "cancel" }), stop);
  assert.equal(f.sent.at(-1).mode, "cancel");
  await assert.rejects(f.lifecycle.startBackend(), /尚未确认停止/);
  f.child.emit("exit", 0);
  assert.deepEqual(await stop, { stopped: true, exitCode: 0 });
});

test("启动超时不允许拉起第二写入者，停止超时不能冒充 stopped", async () => {
  const f = fixture(), start = f.lifecycle.startBackend();
  const rejected = assert.rejects(start, /启动超时/);
  [...f.timers][0](); await rejected;
  await assert.rejects(f.lifecycle.startBackend(), /尚未确认停止/); assert.equal(f.calls(), 1);
  const stop = f.lifecycle.requestStop({ mode: "cancel" });
  const stopped = assert.rejects(stop, /不会强杀/);
  [...f.timers][0](); await stopped;
  assert.equal(f.lifecycle.getBackendState().state, "failed");
  f.child.emit("exit", 0);
  await assert.rejects(f.lifecycle.requestStop(), /异常退出/);
});

test("启动中退出拒绝 ready，非零退出码不构成更新许可", async () => {
  const f = fixture(), start = f.lifecycle.startBackend();
  const rejected = assert.rejects(start, /中止/);
  const stop = f.lifecycle.requestStop();
  const stopped = assert.rejects(stop, /未确认安全退出/);
  f.ready(); f.child.emit("exit", 1);
  await Promise.all([rejected, stopped]);
  assert.equal(f.lifecycle.getBackendState().state, "failed");
});
