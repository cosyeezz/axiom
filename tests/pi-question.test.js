// 子进程隔离凭据，真实 Pi SDK + 本地 fake SSE 供应商；
// 验证 model question 调用在用户 reply 之前不发下一轮请求，
// reply 后答案以 tool result 进入下一轮请求，abort 释放等待。
// 不调用真实模型、不依赖真实网络；只写此测试，不动产品代码。
import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("question: model blocks until reply, reply becomes next-turn tool result, abort releases pending", async () => {
  const dir = await mkdtemp(join(tmpdir(), "axiom-question-"));
  try {
    const env = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
      /^(PATH|SYSTEMROOT|WINDIR|COMSPEC|TEMP|TMP|HOME|USERPROFILE|APPDATA|LOCALAPPDATA)$/i.test(key)));
    const { stdout } = await promisify(execFile)(process.execPath, ["--input-type=module", "-e", `
      import assert from 'node:assert/strict';
      import { writeFile } from 'node:fs/promises';
      import { createServer } from 'node:http';
      import { join } from 'node:path';
      import { createPiFactory } from './src/pi.js';
      import { createQuestions } from './src/questions.js';

      const textOf = (m) => (Array.isArray(m.content) ? m.content
        .filter((b) => b.type === 'text').map((b) => b.text).join('') : String(m.content ?? ''));

      const requests = [];
      let n = 0;
      const script = [];
      const usage = { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 };
      const server = createServer((req, res) => {
        let body = '';
        req.on('data', (chunk) => { body += chunk; });
        req.on('end', () => {
          const payload = JSON.parse(body);
          requests.push(payload.messages);
          const step = script[n]; n += 1;
          res.writeHead(200, { 'content-type': 'text/event-stream' });
          const chunks = [];
          if (step.tool) {
            const argsJson = JSON.stringify(step.args);
            chunks.push({ choices: [{ delta: { tool_calls: [
              { index: 0, id: 'call_q1', type: 'function', function: { name: step.tool, arguments: '' } },
            ] } }] });
            chunks.push({ choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: argsJson } }] } }] });
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
            models: [{ id: 'q', name: 'Q', reasoning: false, input: ['text'], contextWindow: 8192, maxTokens: 1024,
              cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } }] },
        } }));
        const factory = await createPiFactory({ cwd, model: 'fake/q' });

        const questionArgs = { questions: [
          { header: '方式', question: '哪种方式？', description: '影响后续步骤。', options: [{ label: 'A' }, { label: 'B' }] },
          { header: '范围', question: '范围？', description: '确定边界。', options: [{ label: '广' }, { label: '窄' }], multiple: true },
        ] };

        // —— 1) 主流程：reply 前不发下一轮；reply 后下一轮带 tool result —— //
        script.push({ tool: 'question', args: questionArgs });
        script.push({ text: '已收到：' });

        const askedEvents = [];
        const questions = createQuestions((event) => askedEvents.push(event));
        const agent = await factory([questions.tool]);
        try {
          const promise = agent.prompt('先问一下');
          // 等到 question.asked 触发 = 工具 execute 已进入 pending。
          await new Promise((resolve) => {
            const tick = () => {
              if (askedEvents.some((e) => e.type === 'question.asked')) return resolve();
              setImmediate(tick);
            };
            tick();
          });
          // reply 前：必须只有 1 个请求，工具还在等。
          assert.equal(requests.length, 1, 'no second request before reply');
          assert.equal(questions.snapshot().length, 1);
          const asked = askedEvents.find((e) => e.type === 'question.asked');
          assert.ok(asked, 'question.asked was emitted');
          assert.equal(asked.data.questions.length, 2);
          assert.equal(asked.data.questions[1].multiple, true);

          // 取 toolCallId（emit 里带；用 snapshot 也可）
          const toolCallId = asked.data.toolCallId;

          // 多 50ms 也不会冒出第二个请求。
          await new Promise((r) => setTimeout(r, 50));
          assert.equal(requests.length, 1, 'still only one request before reply');

          // reply：单选 1 个、多选 2 个。
          questions.reply(toolCallId, [['A'], ['广', '窄']]);
          await promise;

          assert.equal(requests.length, 2, 'reply triggers exactly one follow-up request');
          assert.equal(n, 2, 'both script steps consumed');

          // 请求 2 的消息数组必须包含上一轮的 tool_result，且来自上一次工具调用的 toolCallId。
          const req2 = requests[1];
          const toolResult = req2.find((m) => m.role === 'tool');
          assert.ok(toolResult, 'second request carries a toolResult');
          assert.equal(toolResult.tool_call_id, 'call_q1');
          const toolText = textOf(toolResult);
          const parsed = JSON.parse(toolText);
          assert.deepEqual(parsed.answers, [['A'], ['广', '窄']]);

          // 上一轮的 assistant tool_call 也在消息数组里，保证"答案作为 tool result 进入下一轮"。
          const assistantCall = req2.find((m) => m.role === 'assistant' && m.tool_calls?.some((t) => t.function.name === 'question'));
          assert.ok(assistantCall, 'previous assistant tool_call is part of next request');
          assert.equal(assistantCall.tool_calls[0].id, 'call_q1');

          // 最终 result：去掉工具干扰后的模型文本。
          assert.equal(agent.result(), '已收到：');

          // 关闭后不再保留 pending。
          assert.deepEqual(questions.snapshot(), []);
          assert.deepEqual(askedEvents.map((e) => e.type), ['question.asked', 'question.closed']);
        } finally {
          await agent.dispose();
        }

        // —— 2) abort 释放等待：pending 工具被拒绝，不再产生第二轮请求 —— //
        script.length = 0;
        n = 0;
        requests.length = 0;
        script.push({ tool: 'question', args: questionArgs });

        const asked2 = [];
        const questions2 = createQuestions((event) => asked2.push(event));
        const agent2 = await factory([questions2.tool]);
        try {
          const pending = questions2.snapshot();
          assert.equal(pending.length, 0);
          const promise2 = agent2.prompt('再问一次');
          await new Promise((resolve) => {
            const tick = () => {
              if (asked2.some((e) => e.type === 'question.asked')) return resolve();
              setImmediate(tick);
            };
            tick();
          });
          assert.equal(requests.length, 1);
          assert.equal(questions2.snapshot().length, 1);

          // abort 后：工具被拒绝，prompt 抛出，pending 清空。
          await agent2.abort();
          await promise2;
          assert.deepEqual(questions2.snapshot(), []);
          assert.equal(requests.length, 1, 'abort does not produce a follow-up request');

          // 再来一发：能正常 retry；这里只确认 dispose 不挂。
        } finally {
          await agent2.dispose();
        }

        console.log('question-ok');
      } finally {
        server.close();
      }
    `], { cwd: new URL("..", import.meta.url), env: { ...env, PI_CODING_AGENT_DIR: dir, PI_OFFLINE: "1" }, timeout: 180000 });
    assert.match(stdout, /question-ok/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});