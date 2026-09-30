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
  const transcript = page.$("transcript");
  Object.defineProperties(transcript, { scrollHeight: { value: 1000 }, clientHeight: { value: 300 } });
  transcript.scrollTop = 700;
  transcript.dispatchEvent(new page.window.Event("scroll"));
  hold = true; await reconnect(page);
  page.$("prompt").value = "typed while restoring";
  page.$("prompt").dispatchEvent(new page.window.Event("input"));
  // Real upward movement from the latest position; JSDOM has no native geometry.
  transcript.dispatchEvent(new page.window.WheelEvent("wheel", { deltaY: -577 }));
  transcript.scrollTop = 123;
  transcript.dispatchEvent(new page.window.Event("scroll"));
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
