import test from "node:test";
import assert from "node:assert/strict";
import { getEventListeners } from "node:events";
import { abortableSleep, createAutoRetry, MAX_RETRIES, MAX_TIMEOUT_MS, RETRY_DELAYS_MS } from "../src/retry.js";

const RATE_LIMIT = { stopReason: "error", errorMessage: "429 rate limit exceeded" };
const QUOTA = { stopReason: "error", errorMessage: "insufficient_quota: billing issue" };
const ABORTED = { stopReason: "aborted", errorMessage: "Operation aborted" };

// 最小 fake session：脚本化每轮（prompt/continue）结果。
// prompt 仅首轮注入用户消息；continue 复用现有上下文（与真实 agent.continue 同约束：
// 末尾是助手消息时拒绝继续，快照记录调用时的状态供继续安全断言）。
// step 支持：{ throws } 抛异常（不追加任何消息）；{ noAssistant } 只追加 messages 不追加助手消息；
// { content } 覆盖助手 content；{ after } 在助手消息之后追加（如 toolResult）。
function fakeSession(steps, { maxTokens = 100, initial = [], onContinue } = {}) {
  const session = {
    model: { maxTokens },
    log: [],
    prompted: 0,
    continueSnapshots: [],
    agent: {
      state: { messages: [...initial] },
      continue: async () => {
        session.continueSnapshots.push(structuredClone(session.agent.state.messages));
        onContinue?.();
        turn(undefined);
      },
    },
    prompt: async (text) => {
      session.prompted++;
      turn(text);
    },
  };
  function turn(text) {
    if (text !== undefined) session.agent.state.messages.push({ role: "user", content: text });
    const step = steps[Math.min(session.log.length, steps.length - 1)];
    session.log.push(text === undefined ? "continue" : "prompt");
    if (step.throws) throw step.throws;
    for (const message of step.messages ?? []) session.agent.state.messages.push(structuredClone(message));
    if (!step.noAssistant)
      session.agent.state.messages.push({
        role: "assistant",
        content: step.content ?? (step.text ? [{ type: "text", text: step.text }] : []),
        stopReason: step.stopReason,
        ...(step.errorMessage ? { errorMessage: step.errorMessage } : {}),
        ...(step.usage ? { usage: step.usage } : {}),
      });
    for (const message of step.after ?? []) session.agent.state.messages.push(structuredClone(message));
  }
  return session;
}

function recorder() {
  const events = [];
  return {
    events,
    emit: (event) => events.push(event),
    data: () => events.filter((event) => event.type === "agent.retry").map((event) => event.data),
  };
}

// 注入 sleep：记录每次请求的时长并立即返回，测试无需真实等待。
const recordedSleep = () => {
  const calls = [];
  const fn = (ms) => {
    calls.push(ms);
    return Promise.resolve();
  };
  fn.calls = calls;
  return fn;
};

const lastAssistant = (session) =>
  session.agent.state.messages.findLast((message) => message.role === "assistant");

test("退避常量符合规格：3,3,3,6,6,12,24,48 秒为基础表，之后翻倍不封顶，最多 30 次", () => {
  assert.deepEqual(RETRY_DELAYS_MS, [3000, 3000, 3000, 6000, 6000, 12000, 24000, 48000]);
  assert.equal(MAX_RETRIES, 30);
});

test("全序列：30 次重试按 3,3,3,6,6,12,24,48 后 96,192 翻倍不封顶的节奏，耗尽前一次成功", async () => {
  const steps = Array.from({ length: 30 }, () => RATE_LIMIT);
  steps.push({ stopReason: "stop", text: "finally" });
  const session = fakeSession(steps);
  const { emit, data } = recorder();
  const sleep = recordedSleep();
  const retry = createAutoRetry({ session, emit, sleep });
  await retry.run((text) => session.prompt(text || "hi"));
  const expected = [...RETRY_DELAYS_MS, ...Array.from({ length: 22 }, (_, i) => 48000 * 2 ** (i + 1))];
  assert.equal(expected.at(-1), 201326592000, "第 30 次等待 48s×2^22，不封顶");
  assert.deepEqual(sleep.calls, expected);
  const waiting = data().filter((event) => event.status === "waiting");
  assert.deepEqual(waiting.map((event) => event.delayMs), expected);
  assert.deepEqual(waiting.map((event) => event.attempt), Array.from({ length: 30 }, (_, i) => i + 1));
  assert.ok(waiting[0].nextRetryAt > 0 && waiting.at(-1).nextRetryAt >= waiting[0].nextRetryAt, "waiting 携带 nextRetryAt");
  assert.equal(data().at(-1).status, "succeeded");
  assert.equal(data().at(-1).attempt, 30);
  assert.equal(session.log.length, 31);
  assert.equal(session.log[0], "prompt");
  assert.ok(session.log.slice(1).every((kind) => kind === "continue"));
});

test("限流两次后成功：waiting/running 递进、succeeded 收尾、同一稳定 id、不重发 prompt", async () => {
  const session = fakeSession([RATE_LIMIT, RATE_LIMIT, { stopReason: "stop", text: "ok" }]);
  const { emit, data } = recorder();
  const retry = createAutoRetry({ session, emit, sleep: recordedSleep() });
  const final = await retry.run((text) => session.prompt(text || "hi"));
  assert.equal(final.stopReason, "stop");
  assert.deepEqual(session.log, ["prompt", "continue", "continue"]);
  assert.equal(session.prompted, 1, "原始用户输入只发一次");
  assert.deepEqual(data().map(({ status, attempt }) => ({ status, attempt })), [
    { status: "waiting", attempt: 1 },
    { status: "running", attempt: 1 },
    { status: "waiting", attempt: 2 },
    { status: "running", attempt: 2 },
    { status: "succeeded", attempt: 2 },
  ]);
  assert.equal(new Set(data().map((event) => event.id)).size, 1, "同一 prompt 的重试事件共享稳定 id");
});

test("耗尽：达到上限后 failed 事件并抛错传播，失败消息保留在上下文", async () => {
  const session = fakeSession([RATE_LIMIT]);
  const { emit, data } = recorder();
  const retry = createAutoRetry({ session, emit, sleep: recordedSleep(), maxRetries: 3 });
  await assert.rejects(
    retry.run((text) => session.prompt(text || "hi")),
    /自动重试已达上限（3 次）/,
  );
  assert.deepEqual(data().map((event) => event.status), [
    "waiting", "running", "waiting", "running", "waiting", "running", "failed",
  ]);
  assert.equal(data().at(-1).attempt, 3);
  assert.match(data().at(-1).error, /429 rate limit exceeded/);
  assert.equal(session.log.length, 4, "首次运行 + 3 次重试");
  assert.equal(lastAssistant(session).stopReason, "error", "耗尽后错误消息不被移除");
});

test("start() 抛网络错误：可重试异常走退避续跑并成功", async () => {
  const session = fakeSession([{ throws: new Error("fetch failed: connection refused") }, { stopReason: "stop", text: "ok" }]);
  const { emit, data } = recorder();
  const retry = createAutoRetry({ session, emit, sleep: recordedSleep() });
  await retry.run((text) => session.prompt(text || "hi"));
  assert.deepEqual(session.log, ["prompt", "continue"]);
  assert.deepEqual(data().map((event) => event.status), ["waiting", "running", "succeeded"]);
  assert.match(data()[0].error, /connection refused/);
});

test("start() 抛不可恢复错误：failed 事件、抛错传播、不续跑", async () => {
  const session = fakeSession([{ throws: new Error("insufficient_quota: billing issue") }]);
  const { emit, data } = recorder();
  const retry = createAutoRetry({ session, emit, sleep: recordedSleep() });
  await assert.rejects(retry.run((text) => session.prompt(text || "hi")), /insufficient_quota/);
  assert.deepEqual(session.log, ["prompt"]);
  assert.deepEqual(data().map((event) => event.status), ["failed"]);
  assert.equal(data()[0].attempt, 0);
});

test("意外 aborted（无人取消）按可重试继续：首败即续跑至成功", async () => {
  const session = fakeSession([ABORTED, { stopReason: "stop", text: "ok" }]);
  const { emit, data } = recorder();
  const retry = createAutoRetry({ session, emit, sleep: recordedSleep() });
  await retry.run((text) => session.prompt(text || "hi"));
  assert.deepEqual(session.log, ["prompt", "continue"]);
  assert.deepEqual(data().map((event) => event.status), ["waiting", "running", "succeeded"]);
});

test("用户取消与意外中断区分：续跑途中主动取消 → cancelled 收尾", async () => {
  let cancelNow = () => {};
  const session = fakeSession([RATE_LIMIT, ABORTED, { stopReason: "stop", text: "ok" }], {
    onContinue: () => cancelNow(),
  });
  const { emit, data } = recorder();
  const retry = createAutoRetry({ session, emit, sleep: recordedSleep() });
  cancelNow = () => retry.cancel();
  await retry.run((text) => session.prompt(text || "hi"));
  assert.deepEqual(session.log, ["prompt", "continue"], "取消发生在续跑完成时，不再有下一轮");
  assert.deepEqual(data().map((event) => event.status), ["waiting", "running", "cancelled"]);
  assert.equal(data().at(-1).attempt, 1);
  assert.equal(data().at(-1).id, data()[0].id);
});

test("首败即用户取消：无重试事件，上下文不动", async () => {
  let cancelNow = () => {};
  const session = fakeSession([ABORTED]);
  const { emit, data } = recorder();
  const retry = createAutoRetry({ session, emit, sleep: recordedSleep() });
  cancelNow = () => retry.cancel();
  await retry.run(() => {
    cancelNow();
    return session.prompt("hi");
  });
  assert.deepEqual(data(), [], "用户主动取消不进入重试序列");
  assert.equal(lastAssistant(session).stopReason, "aborted");
});

test("等待期可取消：cancelled 事件、不再发起 running、错误传播、上下文不动", async () => {
  const session = fakeSession([RATE_LIMIT, { stopReason: "stop", text: "ok" }]);
  const { events, data } = recorder();
  let sawWaiting;
  const emit = (event) => {
    events.push(event);
    if (event.type === "agent.retry" && event.data.status === "waiting") sawWaiting?.();
  };
  // 挂起直到 abort 的 sleep：验证取消能立即打断长等待。
  const hangUntilAborted = (ms, signal) =>
    new Promise((_, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true }));
  const retry = createAutoRetry({ session, emit, sleep: hangUntilAborted });
  const run = retry.run((text) => session.prompt(text || "hi"));
  await new Promise((resolve) => { sawWaiting = resolve; });
  retry.cancel();
  await assert.rejects(run, /已取消自动重试/);
  assert.deepEqual(data().map((event) => event.status), ["waiting", "cancelled"]);
  assert.equal(data().at(-1).attempt, 1);
  assert.equal(data().at(-1).id, data()[0].id);
  assert.deepEqual(session.log, ["prompt"], "等待期间不发起任何续跑");
  assert.equal(lastAssistant(session).stopReason, "error", "取消不改动上下文");
});

test("toolUse 且工具已收齐结果：视为成功而非 terminal，无重试事件", async () => {
  const session = fakeSession([
    {
      content: [{ type: "toolCall", id: "t1", name: "read", arguments: {} }],
      stopReason: "toolUse",
      after: [{ role: "toolResult", toolCallId: "t1", content: [{ type: "text", text: "out" }] }],
    },
  ]);
  const { emit, data } = recorder();
  const retry = createAutoRetry({ session, emit, sleep: recordedSleep() });
  const final = await retry.run((text) => session.prompt(text || "hi"));
  assert.equal(final.stopReason, "toolUse");
  assert.deepEqual(data(), []);
  assert.deepEqual(session.log, ["prompt"]);
});

test("插件无输出（本轮无新助手消息）：不误用历史回应，直接成功无事件", async () => {
  const session = fakeSession([{ noAssistant: true }], {
    initial: [{ role: "user", content: "hi" }, RATE_LIMIT],
  });
  const { emit, data } = recorder();
  const retry = createAutoRetry({ session, emit, sleep: recordedSleep() });
  const final = await retry.run((text) => session.prompt(text || "hi"));
  assert.equal(final, undefined);
  assert.deepEqual(data(), [], "历史里的 error 助手消息不触发重试");
  assert.deepEqual(session.log, ["prompt"], "不发起续跑");
});

test("永久错误不重试：配额/计费首败即止无事件；重试途中转永久则 failed 收尾", async () => {
  const direct = fakeSession([QUOTA]);
  const directRecorder = recorder();
  const directRetry = createAutoRetry({ session: direct, emit: directRecorder.emit, sleep: recordedSleep() });
  await directRetry.run((text) => direct.prompt(text || "hi"));
  assert.deepEqual(direct.log, ["prompt"], "不可恢复错误首次即止");
  assert.deepEqual(directRecorder.data(), [], "未进入重试序列则无事件");
  assert.equal(lastAssistant(direct).stopReason, "error");

  const mid = fakeSession([RATE_LIMIT, QUOTA, { stopReason: "stop", text: "ok" }]);
  const { emit, data } = recorder();
  const midRetry = createAutoRetry({ session: mid, emit, sleep: recordedSleep() });
  await midRetry.run((text) => mid.prompt(text || "hi"));
  assert.deepEqual(mid.log, ["prompt", "continue"], "转永久错误后不再续跑");
  assert.deepEqual(data().map((event) => event.status), ["waiting", "running", "failed"]);
  assert.equal(data().at(-1).attempt, 1);
  assert.equal(data().at(-1).error, QUOTA.errorMessage);
});

test("length 未完成：可恢复（产出低于上限）重试，满额不重试", async () => {
  const truncated = fakeSession([{ stopReason: "length", usage: { output: 50 } }, { stopReason: "stop", text: "done" }]);
  const { emit, data } = recorder();
  const truncatedRetry = createAutoRetry({ session: truncated, emit, sleep: recordedSleep() });
  await truncatedRetry.run((text) => truncated.prompt(text || "hi"));
  assert.deepEqual(truncated.log, ["prompt", "continue"]);
  assert.deepEqual(data().map((event) => event.status), ["waiting", "running", "succeeded"]);
  assert.match(data()[0].error, /length/);

  const full = fakeSession([{ stopReason: "length", usage: { output: 100 } }, { stopReason: "stop", text: "done" }]);
  const fullRecorder = recorder();
  const fullRetry = createAutoRetry({ session: full, emit: fullRecorder.emit, sleep: recordedSleep() });
  await fullRetry.run((text) => full.prompt(text || "hi"));
  assert.deepEqual(full.log, ["prompt"], "产出已满输出上限不重试");
  assert.deepEqual(fullRecorder.data(), []);
});

test("继续安全：移除末尾失败消息后续跑，用户输入不重发、已完成工具保留", async () => {
  const toolCall = { role: "assistant", content: [{ type: "toolCall", id: "t1", name: "read", arguments: {} }], stopReason: "stop" };
  const toolResult = { role: "toolResult", toolCallId: "t1", content: [{ type: "text", text: "out" }] };
  const session = fakeSession([
    { messages: [toolCall, toolResult], stopReason: "error", errorMessage: "socket hang up" },
    { stopReason: "stop", text: "done" },
  ]);
  const { emit, data } = recorder();
  const retry = createAutoRetry({ session, emit, sleep: recordedSleep() });
  await retry.run((text) => session.prompt(text || "hi"));
  assert.deepEqual(session.log, ["prompt", "continue"]);
  // continue 发起时：失败助手消息已移除，工具调用与结果仍在上下文。
  const snapshot = session.continueSnapshots[0];
  assert.equal(snapshot.at(-1).role, "toolResult");
  assert.ok(snapshot.some((message) => message.role === "assistant" && message.content.some((block) => block.type === "toolCall")));
  assert.equal(snapshot.filter((message) => message.role === "user" && message.content === "hi").length, 1, "原始用户输入仍在且只有一份");
  // 结束后：上下文无失败消息，最终助手消息为成功续跑产物。
  assert.deepEqual(
    session.agent.state.messages.filter((message) => message.role === "assistant" && message.stopReason === "error"),
    [],
  );
  assert.equal(lastAssistant(session).content[0].text, "done");
  assert.equal(data().at(-1).status, "succeeded");
});

test("abortableSleep：预先 aborted 立即拒绝，不挂起", async () => {
  const controller = new AbortController();
  controller.abort(new Error("已取消"));
  await assert.rejects(abortableSleep(60_000, controller.signal), /已取消/);
});

test("abortableSleep：正常结束与中止路径都清理监听器", async () => {
  const resolved = new AbortController();
  await abortableSleep(1, resolved.signal);
  assert.equal(getEventListeners(resolved.signal, "abort").length, 0, "resolve 后不残留监听器");

  const aborted = new AbortController();
  const pending = abortableSleep(60_000, aborted.signal);
  aborted.abort(new Error("已取消"));
  await assert.rejects(pending, /已取消/);
  assert.equal(getEventListeners(aborted.signal, "abort").length, 0, "abort 后不残留监听器");
});

test("abortableSleep：超过 setTimeout 32 位上限自动分段", async () => {
  const realSetTimeout = global.setTimeout;
  const sizes = [];
  global.setTimeout = (fn, ms) => {
    sizes.push(ms);
    return realSetTimeout(fn, 0);
  };
  try {
    await abortableSleep(2 ** 32, new AbortController().signal);
  } finally {
    global.setTimeout = realSetTimeout;
  }
  assert.deepEqual(sizes, [MAX_TIMEOUT_MS, MAX_TIMEOUT_MS, 2 ** 32 - MAX_TIMEOUT_MS * 2]);
});
