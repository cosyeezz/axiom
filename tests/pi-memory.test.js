import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// 子进程隔离凭据，真实 SDK + 本地 fake SSE 供应商；验证 selection.memory 接线契约：
// message_end 在工具执行前同步触发、turn 编号累计；context 每次 LLM 请求（含同一次 prompt
// 的工具后续轮）实时取背景；titleRequest 标题指令只注入一次；每满 N 个累计 turn（主 3 子 6，
// 建会话时由 memory-policy 定死）下一次请求注入一次 [摘要提醒] 并回调 onTrigger，不重发；
// 系统提示词为原文+后缀（主代理另含委派附加句）；全程无额外请求。
test("memory hooks order, turn numbering, per-request context, one-shot title and interval summary reminders", async () => {
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
      import { SUMMARY_DELEGATE, SUMMARY_REMINDER, SUMMARY_SYSTEM_PROMPT, memoryPolicy } from './src/memory-policy.js';
      import { defineTool } from '@earendil-works/pi-coding-agent';

      const events = [];
      const triggers = [];
      let contextCalls = 0;
      let subContextCalls = 0;
      let progressLeft = '';
      const textOf = (message) => (Array.isArray(message.content) ? message.content
        .filter((block) => block.type === 'text').map((block) => block.text).join('') : String(message.content ?? ''));
      const memory = {
        role: 'main',
        turn: 0,
        policy: memoryPolicy('main'), // 真实装配由 memoryHooks 提供；此处用缺省策略模拟
        onReply({ message, turn }) { events.push(['reply', turn, textOf(message)]); },
        onTurn({ toolResults, turn }) { events.push(['turn', turn, toolResults.length]); },
        onTrigger(data) { triggers.push(data); },
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
        const delegate = defineTool({
          name: 'delegate', label: 'Delegate', description: 'delegate probe',
          parameters: { type: 'object', properties: {}, required: [] },
          execute: async () => {
            events.push(['tool']);
            return { content: [{ type: 'text', text: 'ok' }], details: {} };
          },
        });

        // —— 主代理（interval 3）：context 每次请求实时取背景 + 标题指令一次性 ——
        const agent = await factory([probe, delegate], { memory });
        try {
          script = [
            { tool: 'probe' },
            { text: '完成。<title>标题甲</title>\\n<summary>已知A；意图B</summary>' },
            { text: 'ok3' },
            { text: 'ok4' }, // 第 3 问收尾后满 3 个 turn → 下一请求（此处）注入提醒
            { text: 'ok5' },
            { tool: 'delegate' },
            { text: '最终。<title>标题乙</title>' }, // 满 6 个 turn → 注入提醒（委派同回复，仍只此一次）
            { text: 'ok8' },
          ];
          await agent.prompt('第一问');
          assert.equal(agent.result(), '完成。'); // result() 去标签
          await agent.prompt('第二问');
          await agent.prompt('第三问');
          await agent.prompt('第四问');
          await agent.prompt('第五问'); // delegate 工具调用 + 同一 prompt 收尾文本，满 6 turn 后收尾请求注入提醒
          assert.equal(agent.result(), '最终。');
          await agent.prompt('第六问', { titleRequest: true });

          // 回放顺序：message_end（onReply）先于工具执行（含 delegate），turn_end（onTurn）收尾；turn 首轮 1。
          assert.deepEqual(events, [
            ['reply', 1, ''], ['tool'], ['turn', 1, 1],
            ['reply', 2, '完成。<title>标题甲</title>\\n<summary>已知A；意图B</summary>'], ['turn', 2, 0],
            ['reply', 3, 'ok3'], ['turn', 3, 0],
            ['reply', 4, 'ok4'], ['turn', 4, 0],
            ['reply', 5, 'ok5'], ['turn', 5, 0],
            ['reply', 6, ''], ['tool'], ['turn', 6, 1],
            ['reply', 7, '最终。<title>标题乙</title>'], ['turn', 7, 0],
            ['reply', 8, 'ok8'], ['turn', 8, 0],
          ]);
          assert.equal(contextCalls, 8); // 每次 LLM 请求（含同一次 prompt 的工具后续轮）都实时调用 context()
          assert.equal(requests.length, 8); // 无额外请求

          // onTrigger 契约：每次真正注入触发一次，turn 指向即将作答的轮次（已完成 turn+1）。
          assert.deepEqual(triggers, [
            { turn: 4, interval: 3, maxChars: 30, prompt: SUMMARY_REMINDER, systemPrompt: SUMMARY_SYSTEM_PROMPT },
            { turn: 7, interval: 3, maxChars: 30, prompt: SUMMARY_REMINDER, systemPrompt: SUMMARY_SYSTEM_PROMPT },
          ]);

          // 8 次请求的系统提示词固定一致，且含原文+后缀+主代理委派附加句，不含标题指令。
          const systems = new Set(requests.map((messages) => messages.find((m) => m.role === 'system')?.content ?? ''));
          assert.equal(systems.size, 1);
          const mainSystem = [...systems][0];
          assert.ok(mainSystem.includes(SUMMARY_SYSTEM_PROMPT + SUMMARY_DELEGATE), 'main system prompt');
          assert.doesNotMatch(mainSystem, /不超过10字的会话标题/);

          // 请求 2：prompt 1 工具执行后产生的新进度，进入同一次 prompt 的下一个请求（此前只取一次会漏掉）。
          assert.match(requests[1].map((m) => JSON.stringify(m)).join('\\n'), /工具后新进度/);

          // 第 6 次 prompt（请求 8）：标题指令随该次首个请求注入，用户原文未被污染。
          const first = requests[7].map((m) => JSON.stringify(m)).join('\\n');
          assert.match(first, /不超过10字的会话标题/);
          const textOfLlm = (m) => (typeof m.content === 'string' ? m.content
            : Array.isArray(m.content) ? m.content.filter((b) => b.type === 'text').map((b) => b.text).join('') : '');
          const user = requests[7].find((m) => m.role === 'user' && textOfLlm(m).includes('第六问'));
          assert.equal(textOfLlm(user), '第六问');

          // 提醒仅出现在满 3/6 个 turn 后的请求 4、7；进度一次性；标题指令仅请求 8。
          for (const [index, messages] of requests.entries()) {
            const texts = messages.map((m) => JSON.stringify(m)).join('');
            assert.equal(texts.includes(SUMMARY_REMINDER), index === 3 || index === 6, 'request ' + (index + 1));
            if (index !== 1) assert.doesNotMatch(texts, /工具后新进度/, 'request ' + (index + 1));
            if (index !== 7) assert.doesNotMatch(texts, /不超过10字的会话标题/, 'request ' + (index + 1));
          }
        } finally {
          await agent.dispose();
        }

        // —— 子代理（interval 6）：累计 turn 每满 6，下一次请求前注入一次提醒；第 7 次请求后不重发 ——
        const subTriggers = [];
        const subMemory = {
          role: 'subagent', turn: 0,
          policy: memoryPolicy('subagent'),
          onReply() {}, onTurn() {},
          onTrigger(data) { subTriggers.push(data); },
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
          const subSystem = requests.slice(subStart).map((messages) => messages.find((m) => m.role === 'system')?.content ?? '');
          assert.equal(new Set(subSystem).size, 1);
          assert.ok(subSystem[0].includes(SUMMARY_SYSTEM_PROMPT), 'sub system prompt');
          assert.ok(!subSystem[0].includes(SUMMARY_DELEGATE), 'sub system has no delegate clause');
          assert.ok(sub[6].includes(SUMMARY_REMINDER)); // 第 7 次请求：已完成 6 个 turn，注入一次提醒
          for (const [index, text] of sub.entries())
            if (index !== 6) assert.ok(!text.includes(SUMMARY_REMINDER), 'subagent request ' + (index + 1)); // 其余不重发
          assert.deepEqual(subTriggers, [
            { turn: 7, interval: 6, maxChars: 30, prompt: SUMMARY_REMINDER, systemPrompt: SUMMARY_SYSTEM_PROMPT },
          ]);
        } finally {
          await subAgent.dispose();
        }

        // —— 持久化配置随记忆装配：建会话捕获，interval 1 + maxChars 29 逐请求不变 ——
        const policy = memoryPolicy('main', { mainTurns: 1, maxChars: 29 });
        const triggers2 = [];
        const envMemory = { role: 'main', turn: 0, policy, onReply() {}, onTurn() {},
          onTrigger(data) { triggers2.push(data); }, context() { return ''; } };
        const envStart = requests.length;
        script = [{ text: 'a' }, { text: 'b' }];
        n = 0;
        const envAgent = await factory([probe], { memory: envMemory });
        try {
          await envAgent.prompt('甲问');
          await envAgent.prompt('乙问');
        } finally {
          await envAgent.dispose();
        }
        const envReqs = requests.slice(envStart).map((messages) => messages.map((m) => JSON.stringify(m)).join('\\n'));
        assert.ok(!envReqs[0].includes(SUMMARY_REMINDER)); // 首请求 turn 0 不触发
        assert.ok(envReqs[1].includes(SUMMARY_REMINDER)); // 满 1 个 turn 即触发
        assert.deepEqual(triggers2, [
          { turn: 2, interval: 1, maxChars: 29, prompt: SUMMARY_REMINDER, systemPrompt: SUMMARY_SYSTEM_PROMPT.replace('<30字', '<29字') },
        ]);

        // —— 非法配置在 memoryPolicy 计算时（建会话装配期）即失败，早于任何模型请求 ——
        assert.throws(() => memoryPolicy('main', { maxChars: 1 }), /字数上限/);
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
