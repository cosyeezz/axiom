import test from "node:test";
import assert from "node:assert/strict";
import { bootSessionPage, makeRecords, until, settle } from "./helpers/session-page.js";

async function reconnect(page) {
  page.sockets.at(-1).close(1000);
  page.$("login").requestSubmit();
  page.open();
  await until(() => page.held() > 0 || page.app.connected(), "reconnect attach");
}

test("reconnect preserves edits and reading position made while attach is in flight", async t => {
  let hold = false;
  const page = bootSessionPage({ records: makeRecords(2), hold: req => hold && req.type === "session.attach" });
  t.after(page.close); page.open(); await until(() => page.app.connected(), "initial connect"); page.paint();
  page.$("prompt").value = "before disconnect";
  hold = true; await reconnect(page);
  page.$("prompt").value = "typed while restoring";
  page.$("prompt").dispatchEvent(new page.window.Event("input"));
  page.$("transcript").scrollTop = 123;
  // Use the real scroll handler to stop following the bottom (JSDOM has no geometry).
  Object.defineProperty(page.$("transcript"), "scrollHeight", { value: 1000 });
  page.$("transcript").dispatchEvent(new page.window.Event("wheel"));
  page.$("transcript").dispatchEvent(new page.window.Event("scroll"));
  hold = false; page.releaseAll();
  await until(() => page.app.connected(), "restored"); page.paint();
  assert.equal(page.$("prompt").value, "typed while restoring");
  assert.equal(page.$("transcript").scrollTop, 123);
  assert.equal(page.requests.some(req => req.type === "prompt" || req.type === "session.create"), false);
});

test("history reset buffered during reconnect forces fresh history after initialization", async t => {
  let hold = false;
  const records = makeRecords(4, "stale");
  const page = bootSessionPage({ records, hold: req => hold && req.type === "session.attach" });
  t.after(page.close); page.open(); await until(() => page.app.connected(), "initial connect");
  hold = true; await reconnect(page);
  records.splice(1);
  page.sockets.at(-1).receive({ type: "session.history.reset", sessionId: "long", seq: 501 });
  hold = false; page.releaseAll();
  await until(() => page.requests.filter(req => req.type === "session.attach").length >= 3 && page.messages() === 1, "reset refresh");
  assert.equal(page.count("stale3"), 0);
  assert.equal(page.app.attachFlags().hiddenDirty, false);
});

test("reset arriving during a history reattach is not lost behind the attach guard", async t => {
  let hold = false;
  const records = makeRecords(4, "reset");
  const page = bootSessionPage({ records, hold: req => hold && req.type === "session.attach" });
  t.after(page.close); page.open(); await until(() => page.app.connected(), "initial connect");
  hold = true;
  const pending = page.app.reattach({ keepView: true });
  await until(() => page.held() === 1, "held attach");
  records.splice(1);
  page.sockets.at(-1).receive({ type: "session.history.reset", sessionId: "long", seq: 501 });
  hold = false; page.releaseAll(); await pending;
  await until(() => page.requests.filter(req => req.type === "session.attach").length >= 3 && page.messages() === 1, "second attach");
  assert.equal(page.count("reset3"), 0);
});

test("reattach rendering failure leaves one disconnected recovery, never a phantom recovering state", async t => {
  const page = bootSessionPage({ records: makeRecords(1) }); t.after(page.close);
  page.open(); await until(() => page.app.connected(), "initial connect");
  const restore = page.app.failPlacement();
  await page.app.reattach({ keepView: true }); restore();
  assert.equal(page.app.transportState(), "disconnected");
  assert.equal(page.app.connected(), false);
});

test("late reattach failure cannot tear down a replacement connection to the same session", async t => {
  const page = bootSessionPage({ records: makeRecords(1) }); t.after(page.close);
  page.open(); await until(() => page.app.connected(), "initial connect");
  const original = page.app.request; let rejectOld;
  page.app.setRequest((type, data) => type === "session.attach" ? new Promise((_, reject) => { rejectOld = reject; }) : original(type, data));
  const stale = page.app.reattach();
  page.app.setRequest(original);
  await reconnect(page); await until(() => page.app.connected(), "replacement ready");
  rejectOld(new Error("obsolete attach failure")); await stale;
  assert.equal(page.app.transportState(), "open");
  assert.doesNotMatch(page.$("error").textContent, /obsolete/);
});

test("late reattach success or error after switching cannot replace the active conversation", async t => {
  const page = bootSessionPage({ records: makeRecords(1) }); t.after(page.close);
  page.open(); await until(() => page.app.connected(), "initial connect");
  const original = page.app.request; let finish;
  page.app.setRequest((type, data) => type === "session.attach" ? new Promise(resolve => { finish = resolve; }) : original(type, data));
  const old = page.app.reattach();
  await page.app.switchSession(async () => page.fullState({ sessionId: "b" }));
  finish(page.fullState()); await old;
  assert.equal(page.app.session(), "b"); assert.equal(page.app.transportState(), "open");
  page.app.setRequest(original);
});

test("switch response already resolved before disconnect must not mount on the new connection", async t => {
  const page = bootSessionPage({ records: makeRecords(1) }); t.after(page.close);
  page.open(); await until(() => page.app.connected(), "initial connect");
  const switching = page.app.switchSession(() => Promise.resolve(page.fullState({ sessionId: "stale" })));
  page.sockets[0].close(1000); await switching;
  assert.equal(page.app.session(), "long");
  page.$("login").requestSubmit(); page.open(); await until(() => page.app.connected(), "restored");
  assert.equal(page.app.session(), "long");
});

test("a reconnect business error on an existing session never creates a replacement", async t => {
  let fail = false;
  const page = bootSessionPage({ records: makeRecords(1), respond(req, fallback) {
    if (fail && req.type === "session.attach") throw new Error("temporarily busy");
    return fallback(req);
  } });
  t.after(page.close); page.open(); await until(() => page.app.connected(), "initial connect");
  page.$("prompt").value = "keep this";
  fail = true; page.sockets[0].close(1000); page.$("login").requestSubmit(); page.open();
  await until(() => page.requests.filter(req => req.type === "session.attach").length === 2, "failed attach");
  for (let i = 0; i < 20; i++) await settle();
  assert.equal(page.requests.some(req => req.type === "session.create"), false);
  assert.equal(page.app.session(), "long");
  assert.equal(page.$("prompt").value, "keep this");
  assert.equal(page.app.connected(), false);
});
