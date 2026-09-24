import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// 子进程隔离凭据 + 真实 SDK + 本地 fake SSE 供应商；验证 goal 模式的通用钩子接线契约：
// executionContext 每请求注入（含工具后续轮与子代理）、空串不注入；
// inactiveTools 只注册不激活（请求 schema/config 只含激活工具），enableTools 激活已注册工具；
// shouldPause 只在轮次/工具批次边界停(不 abort、队列留待下次)、paused() 暴露暂停态、prompt 重置；
// requestPause() 取消等待中的自动重试退避而不 abort 在飞工具/请求，暂停语义下 result() 不报错、真实失败照旧抛错；
// checkpoint 用原生 compaction 清空请求上下文，JSONL/UI 历史与队列保留，非空闲或队列非空时拒绝，重复检查点不回流旧摘要。
const PREAMBLE = `
      import assert from 'node:assert/strict';
      import { writeFile } from 'node:fs/promises';
      import { createServer } from 'node:http';
      import { join } from 'node:path';
      import { createPiFactory } from './src/pi.js';
      import { defineTool } from '@earendil-works/pi-coding-agent';

      const NL = String.fromCharCode(10);
      const requests = [];
      const schemas = [];
      let n = 0;
      let script = [];
      const usage = { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 };
      const server = createServer((req, res) => {
        let body = '';
        req.on('data', (chunk) => { body += chunk; });
        req.on('end', () => {
          const payload = JSON.parse(body);
          requests.push(payload.messages);
          schemas.push((payload.tools ?? []).map((tool) => tool.function?.name ?? tool.name));
          const step = script[n] ?? { text: '默认回答' };
          n += 1;
          res.writeHead(200, { 'content-type': 'text/event-stream' });
          const chunks = [];
          if (step.tool) {
            chunks.push({ choices: [{ delta: { tool_calls: [
              { index: 0, id: step.id ?? 'call_1', type: 'function', function: { name: step.tool, arguments: '' } },
            ] } }] });
            chunks.push({ choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: JSON.stringify(step.args ?? {}) } }] } }] });
            chunks.push({ choices: [{ delta: {}, finish_reason: 'tool_calls' }], usage });
          } else {
            chunks.push({ choices: [{ delta: { content: step.text ?? '' } }] });
            // finish 可指定异常收尾（network_error/content_filter 等）以构造可重试/终态失败助手消息。
            chunks.push({ choices: [{ delta: {}, finish_reason: step.finish ?? 'stop' }], usage });
          }
          for (const chunk of chunks) res.write('data: ' + JSON.stringify(chunk) + NL + NL);
          res.end('data: [DONE]' + NL + NL);
        });
      });
      await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
      const cwd = process.env.PI_CODING_AGENT_DIR;
      await writeFile(join(cwd, 'models.json'), JSON.stringify({ providers: {
        fake: { baseUrl: 'http://127.0.0.1:' + server.address().port + '/v1', api: 'openai-completions',
          apiKey: 'test-only-not-a-real-key',
          models: [{ id: 'goal', name: 'Goal', reasoning: false, input: ['text'], contextWindow: 8192, maxTokens: 1024,
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } }] },
      } }));
      const factory = await createPiFactory({ cwd, model: 'fake/goal' });
      const textOfLlm = (m) => (typeof m.content === 'string' ? m.content
        : Array.isArray(m.content) ? m.content.filter((b) => b.type === 'text').map((b) => b.text).join('') : '');
      const flat = (messages) => messages.map((m) => JSON.stringify(m)).join(' | ');
      let onProbe = async () => {};
      const probe = defineTool({ name: 'probe', label: 'Probe', description: 'probe', parameters: { type: 'object', properties: {}, required: [] },
        execute: async () => { await onProbe(); return { content: [{ type: 'text', text: 'ok' }], details: {} }; } });
      const memory = (role) => ({ role, policy: null, onReply() {} });
      try {
`;

const FOOTER = `
      } finally { server.close(); }
      console.log('goal-ok');
`;

const run = async (body) => {
  const dir = await mkdtemp(join(tmpdir(), "axiom-goal-"));
  try {
    const env = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
      /^(PATH|SYSTEMROOT|WINDIR|COMSPEC|TEMP|TMP|HOME|USERPROFILE|APPDATA|LOCALAPPDATA)$/i.test(key)));
    const { stdout } = await promisify(execFile)(process.execPath, ["--input-type=module", "-e", PREAMBLE + body + FOOTER],
      { cwd: new URL("..", import.meta.url), env: { ...env, PI_CODING_AGENT_DIR: dir, PI_OFFLINE: "1" }, timeout: 180000 });
    assert.match(stdout, /goal-ok/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
};

test("universal tools are registered and ask/let execute the same description through the SDK", async () => {
  await run(`
        const agent = await factory([], { memory: memory('subagent') });
        try {
          script = [
            { tool: 'ask_axiom', id: 'ask_1', args: { name: 'axiom.describe' } },
            { tool: 'let_axiom', id: 'let_1', args: { name: 'axiom.describe', arguments: { name: 'axiom.describe' } } },
            { text: 'done' },
          ];
          await agent.prompt('Describe the known axiom.describe instruction using both tools.');
          assert.ok(schemas[0].includes('ask_axiom'));
          assert.ok(schemas[0].includes('let_axiom'));
          const results = requests[2].filter(m => m.role === 'tool');
          assert.equal(results.length, 2);
          assert.deepEqual(results[0].content, results[1].content);
          assert.match(JSON.stringify(results[0].content), /parameters/);
        } finally { await agent.dispose(); }
  `);
});

test("executionContext 每请求注入（工具后续轮+子代理），空串不注入，不改用户原文", async () => {
  await run(`
        let ctx = '【目标背景】甲';
        const agent = await factory([probe], { memory: memory('main'), executionContext: () => ctx });
        try {
          script = [{ tool: 'probe' }, { text: '第一答' }, { text: '第二答' }, { text: '第三答' }];
          await agent.prompt('第一问'); // 工具轮 + 后续轮，两次请求
          assert.equal(requests.length, 2);
          for (const [i, messages] of requests.entries()) {
            assert.match(flat(messages), /【目标背景】甲/, 'request ' + (i + 1));
            // 执行上下文是独立消息，不污染用户原文
            assert.ok(messages.find((m) => m.role === 'user' && textOfLlm(m) === '第一问'), 'user text intact');
          }
          assert.equal(agent.paused(), false); // 没给 shouldPause：永不暂停
          ctx = '';
          await agent.prompt('第二问');
          assert.doesNotMatch(flat(requests[2]), /【目标背景】/);
          // 子代理（有 memory、有 executionContext）同样注入
          const sub = await factory([probe], { memory: memory('subagent'), executionContext: () => '【目标背景】乙' });
          try {
            await sub.prompt('子任务问');
            assert.match(flat(requests[3]), /【目标背景】乙/);
          } finally { await sub.dispose(); }
        } finally { await agent.dispose(); }
  `);
});

test("inactiveTools 只注册不激活：请求 schema 与 config 只含激活工具，enableTools 激活已注册工具", async () => {
  await run(`
        const goalTool = defineTool({ name: 'goal_plan', label: 'Plan', description: 'goal plan', parameters: { type: 'object', properties: {}, required: [] },
          execute: async () => ({ content: [{ type: 'text', text: 'plan' }], details: {} }) });
        const agent = await factory([probe, goalTool], { memory: memory('main'), inactiveTools: ['goal_plan'] });
        try {
          script = [{ text: '普通答' }];
          await agent.prompt('普通问');
          assert.ok(schemas[0].includes('probe'), 'active tool schema sent');
          assert.ok(!schemas[0].includes('goal_plan'), 'inactive tool hidden from request schema');
          assert.ok(!agent.config().activeTools.includes('goal_plan'), 'inactive tool not active');
          agent.enableTools(['goal_plan']);
          assert.ok(agent.config().activeTools.includes('goal_plan'), 'enableTools activates registered tool');
          script = [{ text: '目标答' }];
          await agent.prompt('目标问');
          assert.ok(schemas[1].includes('goal_plan'), 'enabled tool schema sent');
        } finally { await agent.dispose(); }
  `);
});

test("shouldPause 在工具批次后安全停：不 abort、无排队消息时不再续跑、paused() 标记，prompt 重置", async () => {
  await run(`
        let pause = false;
        let probes = 0;
        onProbe = async () => { probes += 1; };
        const agent = await factory([probe], { memory: memory('main'), shouldPause: () => pause });
        try {
          script = [{ tool: 'probe' }, { text: '停后续答' }, { text: '再来答' }];
          pause = true;
          await agent.prompt('干活');
          // 只在工具批次后停一次：后续请求没发出，工具已正常跑完，不是 abort
          assert.equal(requests.length, 1);
          assert.equal(probes, 1);
          assert.equal(agent.paused(), true);
          assert.doesNotThrow(() => agent.result());
          assert.deepEqual(agent.queue().followUp, []);
          // 恢复：pause 归位 + prompt 重置标记
          pause = false;
          await agent.prompt('继续');
          assert.equal(agent.paused(), false);
          assert.equal(requests.length, 2);
          assert.equal(probes, 1);
        } finally { await agent.dispose(); }
  `);
});

test("checkpoint 原子清空请求上下文：JSONL/UI 历史与队列保留，队列非空时拒绝", async () => {
  await run(`
        const agent = await factory([probe], { memory: memory('main') });
        try {
          const events = [];
          const off = agent.subscribe((event) => events.push(event));
          script = [{ text: '甲答' }, { text: '乙答' }, { text: '丙答' }];
          await agent.prompt('甲问');
          await agent.prompt('乙问');
          assert.equal(agent.historyEntries().length, 4);
          assert.equal(requests.length, 2);

          await assert.rejects(() => agent.checkpoint('   '), /摘要不能为空/);
          await agent.enqueue('排队', 'followUp');
          await assert.rejects(() => agent.checkpoint('阶段摘要'), /队列中还有未处理消息/);
          agent.withdraw();

          const result = await agent.checkpoint('阶段摘要');
          assert.ok(result.id, 'returns checkpoint entry id');
          assert.equal(requests.length, 2); // 不额外发 LLM 请求
          // JSONL/UI 历史逐字保留（getBranch 不受 compaction 影响），压缩记录可查
          assert.equal(agent.historyEntries().length, 4);
          assert.equal(agent.compactions().length, 1);
          assert.equal(agent.compactions()[0].summary, '阶段摘要');
          assert.ok(events.some((e) => e.type === 'agent.compaction' && e.data.checkpoint === true && e.data.summary === '阶段摘要'));

          // 下一次请求只带摘要，旧轮用户输入不再进入上下文；新输入照常
          await agent.prompt('丙问');
          const last = requests.at(-1);
          assert.match(flat(last), /阶段摘要/);
          assert.doesNotMatch(flat(last), /甲问/);
          assert.doesNotMatch(flat(last), /乙问/);
          assert.ok(last.find((m) => m.role === 'user' && textOfLlm(m) === '丙问'));
          if (off) off();
        } finally { await agent.dispose(); }
  `);
});

test("checkpoint 哨兵边界：连续检查点只带最新摘要，旧摘要与旧消息不回流", async () => {
  await run(`
        const agent = await factory([probe], { memory: memory('main') });
        try {
          script = [{ text: '甲答' }, { text: '乙答' }, { text: '丙答' }, { text: '丁答' }];
          await agent.prompt('甲问');
          await agent.prompt('乙问');
          await agent.checkpoint('第一段摘要');
          await agent.prompt('丙问');
          await agent.checkpoint('第二段摘要');
          await agent.prompt('丁问');
          const last = requests.at(-1);
          assert.match(flat(last), /第二段摘要/);
          assert.doesNotMatch(flat(last), /第一段摘要/); // 哨兵边界保留零条旧消息，上一次摘要也不回流
          for (const old of ['甲问', '乙问', '丙问']) assert.doesNotMatch(flat(last), new RegExp(old));
          assert.ok(last.find((m) => m.role === 'user' && textOfLlm(m) === '丁问'));
          assert.equal(agent.historyEntries().length, 8); // JSONL/UI 全文照旧
          assert.equal(agent.compactions().length, 2);
          assert.deepEqual(agent.compactions().map((c) => c.summary), ['第一段摘要', '第二段摘要']);
        } finally { await agent.dispose(); }
  `);
});

test("requestPause 在工具执行中不打断：工具跑完、批次边界停、队列与历史保留", async () => {
  await run(`
        let release;
        onProbe = () => new Promise((resolve) => { release = resolve; });
        const agent = await factory([probe], { memory: memory('main'), shouldPause: () => false });
        try {
          script = [{ tool: 'probe' }, { text: '工具后答' }];
          const run = agent.prompt('干活');
          while (!release) await new Promise((resolve) => setImmediate(resolve));
          await assert.rejects(() => agent.checkpoint('中途快照'), /尚未空闲/); // 非空闲拒绝检查点
          await agent.enqueue('排队留在队列', 'steer');
          agent.requestPause();
          release();
          await run;
          assert.equal(requests.length, 1);       // 工具批次后不再发下一次请求（shouldPause 闭包为 false，靠 paused 标志生效）
          assert.equal(agent.paused(), true);
          assert.deepEqual(agent.queue().steering, ['排队留在队列']); // 队列不被消费
          assert.ok(!agent.historyEntries().some((entry) =>
            entry.message?.role === 'user' && textOfLlm(entry.message) === '排队留在队列'));
          assert.doesNotThrow(() => agent.result());
          agent.withdraw();                        // 撤回后队列清空
          assert.deepEqual(agent.queue().steering, []);
        } finally { await agent.dispose(); }
  `);
});

test("requestPause 取消等待中的自动重试：不继续重试、result() 不报错、prompt 复位", async () => {
  await run(`
        const agent = await factory([probe], { memory: memory('main'), shouldPause: () => false });
        try {
          let wake;
          const waiting = new Promise((resolve) => { wake = resolve; });
          agent.subscribe((event) => { if (event.type === 'agent.retry' && event.data.status === 'waiting') wake(); });
          script = [{ finish: 'network_error' }, { text: '重试成功' }]; // 第一次可重试失败 → 进入退避等待
          const run = agent.prompt('干活');
          await waiting;
          assert.equal(requests.length, 1);
          assert.equal(agent.paused(), false);
          agent.requestPause();
          await run;                               // 退避被取消，运行以暂停语义收尾而不是抛错
          assert.equal(agent.paused(), true);
          assert.equal(requests.length, 1);        // 没有继续发起重试
          assert.doesNotThrow(() => agent.result());
          script = [{ text: '恢复答' }];
          await agent.prompt('继续');
          assert.equal(agent.paused(), false);     // prompt 复位
          assert.equal(requests.length, 2);
        } finally { await agent.dispose(); }
  `);
});

test("未经暂停的真实失败仍由 result() 抛错（paused 不误伤）", async () => {
  await run(`
        const agent = await factory([probe], { memory: memory('main'), shouldPause: () => false });
        try {
          script = [{ finish: 'content_filter' }]; // 不可重试的终态失败
          await agent.prompt('干活');
          assert.equal(agent.paused(), false);
          assert.throws(() => agent.result(), /content_filter/);
        } finally { await agent.dispose(); }
  `);
});
