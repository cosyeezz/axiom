import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// 子进程隔离凭据，真实 SDK + 本地 fake SSE 供应商；验证 selection.memory 接线契约：
// message_end 在工具执行前同步触发、turn 编号累计；context 每次 LLM 请求（含同一次 prompt
// 的工具后续轮）实时取背景，工具后新进度可入下一次请求；titleRequest 标题指令只注入一次；
// 子代理每满 5 个累计 turn 在下一次请求前提醒一次且不重发；全程无额外请求。
test("memory hooks order, turn numbering, per-request context, one-shot title and subagent progress reminder", async () => {
  const dir = await mkdtemp(join(tmpdir(), "axiom-memory-"));
  try {
    const env = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
      /^(PATH|SYSTEMROOT|WINDIR|COMSPEC|TEMP|TMP|HOME|USERPROFILE|APPDATA|LOCALAPPDATA)$/i.test(key)));
    const { stdout } = await promisify(execFile)(process.execPath, ["--input-type=module", "-e", `
      import assert from 'node:assert/strict';
      import { writeFile } from 'node:fs/promises';
      import { createServer } from 'node:http';
      import { join } from 'node:path';
      import { createPiFactory } from './src/pi.js';
      import { defineTool } from '@earendil-works/pi-coding-agent';

      const events = [];
      let contextCalls = 0;
      let subContextCalls = 0;
      let progressLeft = '';
      const textOf = (message) => (Array.isArray(message.content) ? message.content
        .filter((block) => block.type === 'text').map((block) => block.text).join('') : String(message.content ?? ''));
      const memory = {
        role: 'main',
        turn: 0,
        onReply({ message, turn }) { events.push(['reply', turn, textOf(message)]); },
        onTurn({ toolResults, turn }) { events.push(['turn', turn, toolResults.length]); },
        // 模拟真实 context() 的一次性进度（progressDelivered）：工具执行后产生一条，消费即清空。
        context() { contextCalls += 1; const text = progressLeft; progressLeft = ''; return text; },
      };

      const requests = [];
      let n = 0;
      let script = [];
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
            chunks.push({ choices: [{ delta: { tool_calls: [
              { index: 0, id: 'call_1', type: 'function', function: { name: step.tool, arguments: '' } },
            ] } }] });
            chunks.push({ choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '{}' } }] } }] });
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
            models: [{ id: 'mem', name: 'Mem', reasoning: false, input: ['text'], contextWindow: 8192, maxTokens: 1024,
              cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } }] },
        } }));
        const factory = await createPiFactory({ cwd, model: 'fake/mem' });
        let ran = 0;
        const probe = defineTool({
          name: 'probe', label: 'Probe', description: 'probe tool',
          parameters: { type: 'object', properties: {}, required: [] },
          execute: async () => {
            ran += 1;
            if (ran === 1) progressLeft = '<progress>工具后新进度</progress>'; // 仅第一次工具后产生新进度
            events.push(['tool']);
            return { content: [{ type: 'text', text: 'ok' }], details: {} };
          },
        });

        // —— 主代理：context 每次请求实时取背景 + 标题指令一次性 ——
        const agent = await factory([probe], { memory });
        try {
          script = [
            { tool: 'probe' },
            { text: '完成。<title>标题甲</title>\\n<summary>已知A；意图B</summary>' },
            { text: 'ok2' }, { text: 'ok3' }, { text: 'ok4' }, { text: 'ok5' },
            { tool: 'probe' },
            { text: '最终。<title>标题乙</title>' },
          ];
          await agent.prompt('第一问');
          assert.equal(agent.result(), '完成。'); // result() 去标签
          for (let i = 2; i <= 5; i++) await agent.prompt('第' + i + '问');
          await agent.prompt('第六问', { titleRequest: true });

          // 回放顺序：message_end（onReply）先于工具执行，turn_end（onTurn）收尾；turn 首轮 1、onTurn 后递增。
          assert.deepEqual(events, [
            ['reply', 1, ''], ['tool'], ['turn', 1, 1],
            ['reply', 2, '完成。<title>标题甲</title>\\n<summary>已知A；意图B</summary>'], ['turn', 2, 0],
            ['reply', 3, 'ok2'], ['turn', 3, 0],
            ['reply', 4, 'ok3'], ['turn', 4, 0],
            ['reply', 5, 'ok4'], ['turn', 5, 0],
            ['reply', 6, 'ok5'], ['turn', 6, 0],
            ['reply', 7, ''], ['tool'], ['turn', 7, 1],
            ['reply', 8, '最终。<title>标题乙</title>'], ['turn', 8, 0],
          ]);
          assert.equal(contextCalls, 8); // 每次 LLM 请求（含同一次 prompt 的工具后续轮）都实时调用 context()
          assert.equal(requests.length, 8); // 无额外请求

          // 8 次请求的系统提示词固定一致，且主代理含 summary 指令、不含标题指令。
          const systems = new Set(requests.map((messages) => messages.find((m) => m.role === 'system')?.content ?? ''));
          assert.equal(systems.size, 1);
          assert.match([...systems][0], /<summary>上一步已知要点\\+本次意图<\\/summary>/);
          assert.doesNotMatch([...systems][0], /title/);

          // 请求 2：prompt 1 工具执行后产生的新进度，进入同一次 prompt 的下一个请求（此前只取一次会漏掉）。
          assert.match(requests[1].map((m) => JSON.stringify(m)).join('\\n'), /工具后新进度/);

          // 第 6 次 prompt（请求 7）：标题指令随该次首个请求注入，用户原文未被污染。
          const first = requests[6].map((m) => JSON.stringify(m)).join('\\n');
          assert.match(first, /不超过10字的会话标题/);
          const textOfLlm = (m) => (typeof m.content === 'string' ? m.content
            : Array.isArray(m.content) ? m.content.filter((b) => b.type === 'text').map((b) => b.text).join('') : '');
          const user = requests[6].find((m) => m.role === 'user' && textOfLlm(m).includes('第六问'));
          assert.equal(textOfLlm(user), '第六问');

          // 进度一次性：仅请求 2 出现；标题指令仅请求 7；主代理请求全程无子代理提醒。
          for (const [index, messages] of requests.entries()) {
            const texts = messages.map((m) => JSON.stringify(m)).join('');
            if (index !== 1) assert.doesNotMatch(texts, /工具后新进度/, 'request ' + (index + 1));
            if (index !== 6) assert.doesNotMatch(texts, /不超过10字的会话标题/, 'request ' + (index + 1));
            assert.doesNotMatch(texts, /已满5轮/, 'request ' + (index + 1));
          }
        } finally {
          await agent.dispose();
        }

        // —— 子代理：累计 turn 每满 5，下一次请求前注入一次 <progress> 提醒；第 7 次请求不重发 ——
        const subMemory = {
          role: 'subagent', turn: 0,
          onReply() {}, onTurn() {},
          context() { subContextCalls += 1; return ''; },
        };
        const subStart = requests.length;
        script = [1, 2, 3, 4, 5, 6].map(() => ({ tool: 'probe' })).concat([{ text: '子任务完成' }]);
        n = 0;
        const subAgent = await factory([probe], { memory: subMemory });
        try {
          await subAgent.prompt('子任务开始');
          assert.equal(requests.length - subStart, 7); // 6 轮工具 + 1 轮收尾，无额外请求
          assert.equal(subContextCalls, 7); // 子代理同样每次请求实时调 context()
          const sub = requests.slice(subStart).map((messages) => messages.map((m) => JSON.stringify(m)).join('\\n'));
          assert.match(sub[5], /已满5轮/); // 第 6 次请求：已完成 5 个 turn，注入一次提醒
          assert.match(sub[5], /阶段进展/);
          for (const [index, text] of sub.entries())
            if (index !== 5) assert.doesNotMatch(text, /已满5轮/, 'subagent request ' + (index + 1)); // 其余（含第 7 次）不重发
          console.log('memory-ok');
        } finally {
          await subAgent.dispose();
        }
      } finally {
        server.close();
      }
    `], { cwd: new URL("..", import.meta.url), env: { ...env, PI_CODING_AGENT_DIR: dir, PI_OFFLINE: "1" }, timeout: 120000 });
    assert.match(stdout, /memory-ok/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
