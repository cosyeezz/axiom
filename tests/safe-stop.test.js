// 安全停止：真实 Pi SDK + 本地 fake SSE 供应商，验证停在轮次边界而不是中途。
// 关注点：已完成的产出全部保留、工具不被打断、停下后仍可手动续跑、标志不污染下一次运行。
// 不调用真实模型、不依赖真实网络。
import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Sessions } from "../src/sessions.js";
import { command } from "../src/protocol.js";

test("safe stop ends the run at a turn boundary: tools finish, output is kept, run stays resumable", async () => {
  const dir = await mkdtemp(join(tmpdir(), "axiom-safe-stop-"));
  try {
    const env = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
      /^(PATH|SYSTEMROOT|WINDIR|COMSPEC|TEMP|TMP|HOME|USERPROFILE|APPDATA|LOCALAPPDATA)$/i.test(key)));
    const { stdout } = await promisify(execFile)(process.execPath, ["--input-type=module", "-e", `
      import assert from 'node:assert/strict';
      import { writeFile } from 'node:fs/promises';
      import { createServer } from 'node:http';
      import { join } from 'node:path';
      import { createPiFactory } from './src/pi.js';

      const requests = [];
      let n = 0;
      const script = [];
      const usage = { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 };
      const server = createServer((req, res) => {
        let body = '';
        req.on('data', (chunk) => { body += chunk; });
        req.on('end', () => {
          requests.push(JSON.parse(body).messages);
          const step = script[n]; n += 1;
          res.writeHead(200, { 'content-type': 'text/event-stream' });
          const chunks = [];
          if (step.tool) {
            chunks.push({ choices: [{ delta: { content: step.text ?? '' } }] });
            chunks.push({ choices: [{ delta: { tool_calls: [
              { index: 0, id: 'call_' + n, type: 'function', function: { name: step.tool, arguments: JSON.stringify(step.args) } },
            ] } }] });
            chunks.push({ choices: [{ delta: {}, finish_reason: 'tool_calls' }], usage });
          } else {
            chunks.push({ choices: [{ delta: { content: step.text } }] });
            chunks.push({ choices: [{ delta: {}, finish_reason: 'stop' }], usage });
          }
          for (const chunk of chunks) res.write('data: ' + JSON.stringify(chunk) + '\\n\\n');
          res.end('data: [DONE]\\n\\n');
        });
      });
      await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
      try {
        const cwd = process.env.PI_CODING_AGENT_DIR;
        await writeFile(join(cwd, 'models.json'), JSON.stringify({ providers: {
          fake: { baseUrl: 'http://127.0.0.1:' + server.address().port + '/v1', api: 'openai-completions',
            apiKey: 'test-only-not-a-real-key',
            models: [{ id: 's', name: 'S', reasoning: false, input: ['text'], contextWindow: 8192, maxTokens: 1024,
              cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } }] },
        } }));
        const factory = await createPiFactory({ cwd, model: 'fake/s' });

        // 第二轮的工具在执行中途请求安全停止：工具必须照常跑完，停止只发生在轮次结束后。
        let armStop;
        const finished = [];
        const mark = {
          name: 'mark', label: 'Mark', description: '测试用工具：记录一次调用。',
          parameters: { type: 'object', additionalProperties: false, required: ['step'],
            properties: { step: { type: 'string', description: '步骤名' } } },
          async execute(_id, params) {
            if (params.step === 'stop-here') await armStop();
            await new Promise((r) => setTimeout(r, 20));
            finished.push(params.step);
            return { content: [{ type: 'text', text: 'done ' + params.step }] };
          },
        };
        const agent = await factory([mark]);
        // 同时排队一条 steer：SDK 在轮次边界后还会按 hasQueuedMessages 继续抽干队列，
        // 只靠 shouldStopAfterTurn 停不住——这条排队消息必须留到下一次显式运行。
        armStop = async () => {
          await agent.enqueue('排队等待的消息', 'steer');
          agent.requestSafeStop();
        };
        try {
          script.push({ tool: 'mark', args: { step: 'first' }, text: '先做第一步' });
          script.push({ tool: 'mark', args: { step: 'stop-here' }, text: '再做第二步' });
          script.push({ text: '本来还有第三轮' });

          await agent.prompt('走两步');
          agent.result();
          const messages = agent.historyEntries().map((entry) => entry.message);
          const last = messages.at(-1);
          const assistants = messages.filter((m) => m.role === 'assistant');

          console.log(JSON.stringify({
            requests: requests.length,
            finished,
            lastRole: last.role,
            lastAssistantStop: assistants.at(-1).stopReason,
            texts: assistants.flatMap((m) => m.content.filter((b) => b.type === 'text').map((b) => b.text)),
            toolResults: messages.filter((m) => m.role === 'toolResult').length,
            resumable: agent.resumable(),
            pendingAfterStop: agent.safeStopPending(),
            queueAfterStop: agent.queue().steering,
            queuedInHistory: messages.some((m) => m.role === 'user' && JSON.stringify(m.content).includes('排队等待的消息')),
          }));

          // 停止是一次性的：续跑不该再被上一次的标志误停，第三轮正常收尾。
          agent.withdraw(); // 排队消息不参与本次验证，避免抽水循环（复位后）把它带进第三次请求
          await agent.resume();
          agent.result();
          const after = agent.historyEntries().map((entry) => entry.message);
          console.log(JSON.stringify({
            requestsAfterResume: requests.length,
            lastStopAfterResume: after.filter((m) => m.role === 'assistant').at(-1).stopReason,
            resumableAfterResume: agent.resumable(),
            pendingAfterResume: agent.safeStopPending(),
          }));
        } finally {
          await agent.dispose();
        }
      } finally {
        server.close();
      }
    `], { cwd: process.cwd(), env: { ...env, PI_CODING_AGENT_DIR: dir }, timeout: 60000 });

    const [stopped, resumed] = stdout.trim().split("\n").filter((line) => line.startsWith("{")).map((line) => JSON.parse(line));
    assert.equal(stopped.requests, 2, "停在轮次边界：第三次请求没有发出");
    assert.deepEqual(stopped.finished, ["first", "stop-here"], "请求停止时正在跑的工具照常跑完，不被打断");
    assert.equal(stopped.toolResults, 2, "两轮工具结果都在上下文里，配对完整");
    assert.deepEqual(stopped.texts, ["先做第一步", "再做第二步"], "已生成的文本一字不丢");
    assert.equal(stopped.lastRole, "toolResult", "停在工具结果之后，正好是下一次请求的起点");
    assert.equal(stopped.lastAssistantStop, "toolUse", "不改 stopReason：不伪装成正常收尾");
    assert.equal(stopped.resumable, true, "停下来的运行可以手动续跑");
    assert.equal(stopped.pendingAfterStop, true, "标志闩到下一次运行开始才清：抽水循环每次都查它，早清等于没停");
    assert.deepEqual(stopped.queueAfterStop, ["排队等待的消息"], "队列消息原样退回，不被停下的运行消费");
    assert.equal(stopped.queuedInHistory, false, "排队消息没进上下文，下一次显式运行才轮到它");
    assert.equal(resumed.requestsAfterResume, 3, "续跑接着发第三次请求");
    assert.equal(resumed.pendingAfterResume, false, "续跑开始时复位，不会误停下一次运行");
    assert.equal(resumed.lastStopAfterResume, "stop", "续跑正常收尾");
    assert.equal(resumed.resumableAfterResume, false, "正常收尾后没有可续的东西");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// 服务端骨架：safeStop 不 abort，只请求停止并把状态广播出去；停住的 idle 带 stopped 标记。
test("sessions.safeStop keeps the run alive, reports safeStop, and marks the resulting idle", async () => {
  let finish, safeStops = 0, aborts = 0;
  const agent = {
    subscribe: () => () => {},
    prompt: async () => new Promise((r) => { finish = r; }),
    requestSafeStop: () => { safeStops++; },
    safeStopPending: () => safeStops > 0,
    resumable: () => false,
    result: () => {},
    abort: async () => { aborts++; finish?.(); },
    dispose: async () => {},
  };
  const sessions = new Sessions(async () => agent);
  const id = await sessions.create(process.cwd());
  const item = sessions.get(id);
  const events = [];
  item.emit = (event) => events.push(event);

  await sessions.prompt(id, "跑起来");
  await sessions.safeStop(id);
  assert.equal(safeStops, 1);
  assert.equal(aborts, 0, "安全停止不 abort：工具和流式输出都不受影响");
  assert.equal(item.status, "running", "仍在运行，只是等轮次边界");
  assert.equal(item.notificationsPaused, true, "暂停子任务通知，否则通知会立刻把会话重新拉起来");
  const stopping = events.findLast((e) => e.type === "session.state");
  assert.deepEqual([stopping.data.status, stopping.data.safeStop], ["running", true]);
  assert.equal(sessions.snapshot(id).safeStop, true, "刷新/重连也要能看到等待安全点");

  finish();
  await item.work;
  const idle = events.findLast((e) => e.type === "session.state");
  assert.deepEqual([idle.data.status, idle.data.stopped], ["idle", "safe"], "停住的 idle 带标记，前端据此留红点");
  assert.equal(sessions.snapshot(id).safeStop, false, "idle 后不再报等待安全点");

  // 同一会话再跑一次：不该继承上一次的停止状态。
  await sessions.prompt(id, "再跑");
  assert.equal(item.notificationsPaused, false, "新运行恢复子任务通知");
  const running = events.findLast((e) => e.type === "session.state");
  assert.equal(running.data.safeStop, undefined);
  finish();
  await item.work;
  assert.equal(events.findLast((e) => e.type === "session.state").data.stopped, undefined, "正常跑完的 idle 不带停止标记");
  await sessions.close?.(id);
});

test("safeStop is a no-op on idle sessions and force stop wins over a pending safe stop", async () => {
  let finish, safeStops = 0, aborts = 0;
  const agent = {
    subscribe: () => () => {},
    prompt: async () => new Promise((r) => { finish = r; }),
    requestSafeStop: () => { safeStops++; },
    resumable: () => false,
    result: () => {},
    abort: async () => { aborts++; finish?.(); },
    dispose: async () => {},
  };
  const sessions = new Sessions(async () => agent);
  const id = await sessions.create(process.cwd());
  const item = sessions.get(id);
  const events = [];
  item.emit = (event) => events.push(event);

  await sessions.safeStop(id);
  assert.equal(safeStops, 0, "没在跑就没有安全点可等");

  await sessions.prompt(id, "跑起来");
  await sessions.safeStop(id);
  await sessions.cancel(id);
  assert.equal(aborts, 1, "等不及就强停：立刻 abort");
  assert.equal(item.status, "idle");
  const idle = events.findLast((e) => e.type === "session.state");
  assert.equal(idle.data.stopped, undefined, "强停走 cancel 的收尾，不冒充安全停止");
});

test("cancel defaults to force so older clients keep the old stop semantics", () => {
  const base = { id: "1", type: "cancel", sessionId: "s1" };
  assert.equal(command.parse(base).mode, "force");
  assert.equal(command.parse({ ...base, mode: "safe" }).mode, "safe");
  assert.equal(command.safeParse({ ...base, mode: "later" }).success, false);
});
