import test from "node:test";
import assert from "node:assert/strict";
import { bootSessionPage, until, settle } from "./helpers/session-page.js";

async function pageFor(t) {
  const page = bootSessionPage({ records: [] });
  t.after(page.close); page.open();
  await until(() => page.app.connected(), "登录");
  return page;
}
const taskState = (page, data) => page.app.event({ sessionId: "long", type: "task.state", taskId: "child", data: { task: "T", ...data } });

test("task stop UI sends both modes and optional reason, hides controls during summary", async t => {
  const page = await pageFor(t);
  taskState(page, { status: "running", startedAt: Date.now() - 5000 }); await settle();
  const controls = page.$("task-child").querySelector(".task-stop-controls");
  assert.equal(controls.hidden, false);
  const [summary, immediate] = controls.querySelectorAll("button");
  const reason = controls.querySelector("input");
  reason.value = "范围改变"; summary.click(); await settle(); await settle();
  let request = page.requests.findLast(r => r.type === "task.cancel");
  assert.deepEqual([request.sessionId, request.taskId, request.mode, request.reason], ["long", "child", "summary", "范围改变"]);
  reason.value = ""; immediate.click(); await settle(); await settle();
  request = page.requests.findLast(r => r.type === "task.cancel");
  assert.deepEqual([request.mode, request.reason], ["immediate", ""]);
  for (const status of ["stopping", "summarizing", "cancelled", "completed"]) {
    taskState(page, { status }); await settle(); assert.equal(controls.hidden, true, status);
  }
});

test("snapshot restores elapsed time and timeout source for tools", async t => {
  const page = await pageFor(t);
  page.app.snapshot(page.fullState({ tools: { "main:call-1": {
    agentId: "main", phase: "end", toolCallId: "call-1", toolName: "bash",
    startedAt: Date.now() - 10000, endedAt: Date.now() - 4000,
    elapsedMs: 6500, timeoutSeconds: 180, timeoutSource: "default",
  } } })); await settle();
  assert.match(page.$("output").querySelector(".tool-status").textContent, /6s.*时限 3m 00s（默认）/);
  taskState(page, { status: "completed", startedAt: 1000, endedAt: 6000, totalElapsedMs: 65000 }); await settle();
  assert.match(page.$("task-child").querySelector(".task-execution-timing").textContent, /本次 5s · 累计 1m 05s/);
});

test("execution budget UI persists all numeric fields", async t => {
  const page = await pageFor(t);
  page.$("open-settings").click(); page.$("settings-defaults-tab").click();
  await settle(); await settle();
  assert.equal(page.$("task-work-seconds").value, "600");
  page.$("task-work-seconds").value = "900";
  page.$("task-wrap-up-seconds").value = "120";
  const summary = page.$("task-summary-seconds"); summary.value = "90";
  summary.dispatchEvent(new summary.ownerDocument.defaultView.Event("change"));
  await settle(); await settle();
  const request = page.requests.findLast(r => r.type === "task.budget.configure");
  assert.deepEqual(JSON.parse(JSON.stringify(request.budget)), { maxTurns: 20, wrapUpWindow: 2, workSeconds: 900, wrapUpSeconds: 120, summarySeconds: 90 });
});
