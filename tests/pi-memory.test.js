import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// 子进程隔离凭据，真实 SDK + 本地 fake SSE 供应商；验证 selection.memory 接线契约：
// message_end 在工具执行前同步触发 onReply；轮次计数逐 turn_end +1（含工具轮）；
// 子代理到达 wrapUpAt 后每次请求注入一次 WRAP_UP_PROMPT（故意反复、无去重、无硬停）；
// 主代理 policy 为 null：任何轮次都不注入预算提示；titleRequest 标题指令只随当次首个请求注入；
// 子代理系统提示词含轮次预算原文，主代理不含。
test("memory hooks order, per-request context, one-shot title and wrap-up budget injection", async () => {
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
      import { WRAP_UP_PROMPT, budgetSystemPrompt, taskBudgetPolicy } from './src/task-budget.js';
      import { defineTool } from '@earendil-works/pi-coding-agent';

      const events = [];
      const textOf = (message) => (Array.isArray(message.content) ? message.content
        .filter((block) => block.type === 'text').map((block) => block.text).join('') : String(message.content ?? ''));

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
          execute: async () => { ran += 1; events.push(['tool', ran]); return { content: [{ type: 'text', text: 'ok' }], details: {} }; },
        });

        // —— 主代理（policy null）：任何轮次都不注入预算提示；标题指令一次性；result() 给模型原文 ——
        const memory = {
          role: 'main',
          policy: null, // 真实装配由 memoryHooks 提供：主代理没有预算
          onReply({ message }) { events.push(['reply', textOf(message)]); },
        };
        const agent = await factory([probe], { memory });
        try {
          script = [
            { tool: 'probe' },
            { text: '完成。<title>标题甲</title>' },
            { text: 'ok3' },
            { text: 'ok4' },
            { text: 'ok5' },
          ];
          await agent.prompt('第一问');
          // result() 是模型原文出口（落库与 read_result 都要原文），剥离只属于展示层。
          assert.equal(agent.result(), '完成。<title>标题甲</title>');
          await agent.prompt('第二问');
          await agent.prompt('第三问', { titleRequest: true });
          await agent.prompt('第四问');

          // 回放顺序：message_end（onReply）先于工具执行。
          assert.deepEqual(events, [
            ['reply', ''], ['tool', 1],
            ['reply', '完成。<title>标题甲</title>'],
            ['reply', 'ok3'],
            ['reply', 'ok4'],
            ['reply', 'ok5'],
          ]);
          assert.equal(requests.length, 5); // 无额外请求

          const texts = requests.map((messages) => messages.map((m) => JSON.stringify(m)).join('\\n'));
          // 主代理 5 次请求（第 5 次已累计 5 个 turn）全无预算提示。
          for (const [index, text] of texts.entries()) assert.ok(!text.includes(WRAP_UP_PROMPT), 'main request ' + (index + 1));

          // 5 次请求的系统提示词固定一致，且不含轮次预算与标题指令。
          const systems = new Set(requests.map((messages) => messages.find((m) => m.role === 'system')?.content ?? ''));
          assert.equal(systems.size, 1);
          const mainSystem = [...systems][0];
          assert.doesNotMatch(mainSystem, /轮次预算/);
          assert.doesNotMatch(mainSystem, /不超过10字的会话标题/);

          // 第 3 次 prompt（请求 4）：标题指令随该次首个请求注入，用户原文未被污染。
          assert.match(texts[3], /不超过10字的会话标题/);
          const textOfLlm = (m) => (typeof m.content === 'string' ? m.content
            : Array.isArray(m.content) ? m.content.filter((b) => b.type === 'text').map((b) => b.text).join('') : '');
          const user = requests[3].find((m) => m.role === 'user' && textOfLlm(m).includes('第三问'));
          assert.equal(textOfLlm(user), '第三问');
          // customType 'axiom-memory' 只是 display:false 的请求副本：texts[3] 证明它进了当次 LLM 请求，
          // 而请求 5 又不含它 —— 若这条 custom 条目落进消息历史，后续每次请求都会复现它。
          for (const [index, text] of texts.entries())
            if (index !== 3) assert.doesNotMatch(text, /不超过10字的会话标题/, 'main request ' + (index + 1));
        } finally {
          await agent.dispose();
        }

        // —— 子代理（wrapUpAt 2）：前两次请求不注入，第 3 次起每轮注入（无去重、无硬停） ——
        // policy 建会话捕获一次，逐请求不重读；系统提示词含轮次预算原文（按该 policy 定死）。
        const policy = taskBudgetPolicy('subagent', { maxTurns: 5, wrapUpWindow: 3 });
        assert.deepEqual(policy, { maxTurns: 5, wrapUpWindow: 3, wrapUpAt: 2 });
        const subMemory = {
          role: 'subagent',
          policy,
          onReply() {},
        };
        const subStart = requests.length;
        script = Array.from({ length: 6 }, (_, index) => ({ text: '子任务回答' + (index + 1) }));
        n = 0;
        const subAgent = await factory([probe], { memory: subMemory });
        try {
          for (let turn = 1; turn <= 6; turn++) await subAgent.prompt('子任务第' + turn + '问');
          assert.equal(requests.length - subStart, 6); // 无额外请求
          const sub = requests.slice(subStart).map((messages) => messages.map((m) => JSON.stringify(m)).join('\\n'));
          const subSystem = requests.slice(subStart).map((messages) => messages.find((m) => m.role === 'system')?.content ?? '');
          assert.equal(new Set(subSystem).size, 1);
          assert.ok(subSystem[0].includes(budgetSystemPrompt(policy)), 'sub system prompt carries the budget');
          // 请求 1、2（turn 0、1）无收尾提示；请求 3-6（turn 2-5）每轮都注入，无去重。
          for (const [index, text] of sub.entries())
            assert.equal(text.includes(WRAP_UP_PROMPT), index >= 2, 'subagent request ' + (index + 1));
          // 无硬停：6 问全部得到回答。
          assert.equal(n, 6);
        } finally {
          await subAgent.dispose();
        }
        console.log('memory-ok');
      } finally {
        server.close();
      }
    `], { cwd: new URL("..", import.meta.url), env: { ...env, PI_CODING_AGENT_DIR: dir, PI_OFFLINE: "1" }, timeout: 180000 });
    assert.match(stdout, /memory-ok/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
