import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, rm, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// 子进程隔离凭据 + 真实 SDK + 本地 fake SSE 供应商：验证 Observation Pack 的完整接线——
// 扩展经 selection.observationsDir 装载、大工具结果前两次请求全文、第三次折叠为占位符、
// 归档落盘、obs_recall 可被模型调用并分页取回、runtime() 面板统计与 ledger 事件。
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
          const step = script.shift() ?? { text: '默认回答' };
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
          models: [{ id: 'goal', name: 'Goal', reasoning: false, input: ['text'], contextWindow: 200000, maxTokens: 1024,
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } }] },
      } }));
      const factory = await createPiFactory({ cwd, model: 'fake/goal' });
      const flat = (messages) => messages.map((m) => JSON.stringify(m)).join(' | ');
      // 12KB 结果：中部埋唯一标记，占位符摘录（头尾各 512B）不会带上它。
      const big = Array.from({ length: 260 }, (_, i) => i + ': ' + 'x'.repeat(43)).join('\\n');
      const bigText = big.slice(0, 6000) + '\\nMIDDLE-MARKER-XYZ\\n' + big.slice(6000);
      const bigprobe = defineTool({ name: 'bigprobe', label: 'Big', description: 'big result', parameters: { type: 'object', properties: {}, required: [] },
        execute: async () => ({ content: [{ type: 'text', text: bigText }], details: {} }) });
      const obsDir = join(cwd, 'obs-archive');
      try {
`;

const FOOTER = `
      } finally { server.close(); }
      console.log('op-ok');
`;

const run = async (body) => {
  const dir = await mkdtemp(join(tmpdir(), "axiom-op-"));
  try {
    const env = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
      /^(PATH|SYSTEMROOT|WINDIR|COMSPEC|TEMP|TMP|HOME|USERPROFILE|APPDATA|LOCALAPPDATA)$/i.test(key)));
    const { stdout } = await promisify(execFile)(process.execPath, ["--input-type=module", "-e", PREAMBLE + body + FOOTER],
      { cwd: new URL("..", import.meta.url), env: { ...env, PI_CODING_AGENT_DIR: dir, PI_OFFLINE: "1" }, timeout: 180000 });
    assert.match(stdout, /op-ok/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
};

test("端到端：三次请求折叠、面板统计、obs_recall 取回、归档与 ledger", async () => {
  await run(`
        const agent = await factory([bigprobe], { observationsDir: obsDir });
        try {
          assert.ok(schemas.length === 0 || schemas[0] === undefined, 'sanity');
          script = [{ tool: 'bigprobe' }, { text: '收工' }];
          await agent.prompt('读大文件');
          assert.equal(requests.length, 2);
          assert.ok(schemas[0].includes('bigprobe'), 'custom tool sent');
          assert.ok(schemas[0].includes('obs_recall'), 'extension tool registered and active');
          assert.ok(flat(requests[1]).includes('MIDDLE-MARKER-XYZ'), 'request 2: first full send');

          script = [{ text: '第二答' }];
          await agent.prompt('继续');
          assert.ok(flat(requests[2]).includes('MIDDLE-MARKER-XYZ'), 'request 3: second full send');

          script = [{ text: '第三答' }];
          await agent.prompt('再来');
          const folded = flat(requests[3]);
          assert.doesNotMatch(folded, /MIDDLE-MARKER-XYZ/, 'request 4: middle content folded away');
          assert.match(folded, /\\[large tool result replaced after its first 2 provider requests\\]/, 'placeholder present');
          assert.match(folded, /retrieve: call obs_recall with .{0,16}id/, 'retrieve hint present');
          const id = /obs_[a-f0-9]{24}/.exec(folded)[0];

          // 面板统计：折 1 项、每请求省 > 0、无失败
          const pack = agent.runtime().observationPack;
          assert.ok(pack, 'observationPack in runtime');
          assert.equal(pack.folded, 1);
          assert.ok(pack.savedTokens > 0);
          assert.equal(pack.failures, 0);

          // 归档与 ledger
          const objects = await (await import('node:fs/promises')).readdir(join(obsDir, 'objects'));
          assert.ok(objects.includes(id + '.txt'), 'archived object on disk');
          const archived = await (await import('node:fs/promises')).readFile(join(obsDir, 'objects', id + '.txt'), 'utf8');
          assert.ok(archived.includes('MIDDLE-MARKER-XYZ'), 'archive holds the original bytes');
          const ledger = await (await import('node:fs/promises')).readFile(join(obsDir, 'ledger.jsonl'), 'utf8');
          assert.match(ledger, /"event":"fold"/, 'fold event logged');

          // 模型主动取回：obs_recall 分页回原文
          script = [{ tool: 'obs_recall', id: 'call_2', args: { id } }, { text: '取回完毕' }];
          await agent.prompt('取回');
          const recalled = flat(requests[5]);
          assert.match(recalled, new RegExp('\\\\[obs_recall id=' + id + ' offset=0 next_offset=\\\\d+ eof=(true|false)\\\\]'), 'recall header');
          assert.match(recalled, /chunk_bytes=\\d+ chunk_lines=\\d+/, 'chunk stats');
          const ledger2 = await (await import('node:fs/promises')).readFile(join(obsDir, 'ledger.jsonl'), 'utf8');
          assert.match(ledger2, /"event":"recall"/, 'recall event logged');
          assert.equal(agent.runtime().observationPack.recalls, 1, 'recalls counter');
        } finally { await agent.dispose(); }
  `);
});

test("未注入 observationsDir 的会话不装载扩展、runtime 无面板字段", async () => {
  await run(`
        const agent = await factory([bigprobe], {});
        try {
          script = [{ text: '普通答' }];
          await agent.prompt('普通问');
          assert.equal(requests.length, 1);
          assert.ok(!schemas[0].includes('obs_recall'), 'no obs_recall tool without observationsDir');
          assert.ok(!agent.runtime().observationPack, 'no observationPack in runtime');
        } finally { await agent.dispose(); }
  `);
});
