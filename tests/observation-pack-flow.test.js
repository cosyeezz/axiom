import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, rm, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// 隔离凭据 + 真实 SDK + 本地 SSE：旧引用只读、完整历史与 checkpoint 恢复。
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

test("端到端：停止自动折叠，旧归档只读取回且无 ledger", async () => {
  await run(`
    const { mkdir, readFile, access } = await import('node:fs/promises');
    const id = 'obs_' + 'a'.repeat(24);
    await mkdir(join(obsDir, 'objects'), { recursive: true });
    await writeFile(join(obsDir, 'objects', id + '.txt'), bigText);
    const agent = await factory([bigprobe], { observationsDir: obsDir });
    try {
      script = [{ tool: 'bigprobe' }, { text: '收工' }];
      await agent.prompt('读大文件');
      for (let i = 0; i < 3; i++) { script = [{ text: '继续' }]; await agent.prompt('继续'); }
      assert.ok(flat(requests.at(-1)).includes('MIDDLE-MARKER-XYZ'));
      assert.ok(!schemas[0].includes('history_search'), 'only exact history reads are exposed');
      assert.ok(schemas[0].includes('history_read'));
      script = [{ tool: 'obs_recall', args: { id } }, { text: '完成' }];
      await agent.prompt('取回旧归档');
      assert.ok(flat(requests.at(-1)).includes('[obs_recall id=' + id));
      assert.equal(await readFile(join(obsDir, 'objects', id + '.txt'), 'utf8'), bigText);
      await assert.rejects(access(join(obsDir, 'ledger.jsonl')));
    } finally { await agent.dispose(); }
  `);
});

test('持久会话 checkpoint 来源可取回，恢复后尾部完整且控制记录不混入 raw', async () => {
  await run(`
    const { readFile, mkdir } = await import('node:fs/promises');
    const sessionDir = join(cwd, 'journals');
    await mkdir(sessionDir);
    let agent = await factory([], { sessionDir });
    let file;
    try {
      script = [{ text: '原始答复' }]; await agent.prompt('原始证据 ALPHA');
      await agent.checkpoint('保留目标与证据');
      file = agent.sessionFile();
      script = [{ text: '尾部答复' }]; await agent.prompt('未压缩尾部 BETA');
    } finally { await agent.dispose(); }
    const raw = (await readFile(file + '.history/raw.jsonl', 'utf8')).trim().split(NL).map(JSON.parse);
    assert.ok(raw.every(record => ['message', 'custom_message'].includes(record.sourceEntry.type)));
    assert.ok(JSON.stringify(raw).includes('ALPHA')); assert.ok(JSON.stringify(raw).includes('BETA'));
    const control = (await readFile(file + '.history/control.jsonl', 'utf8')).trim().split(NL).map(JSON.parse);
    const checkpoint = control.find(record => record.sourceEntry.type === 'compaction');
    const ref = checkpoint.sourceEntry.details.sourceManifest.sources[0].ref;
    agent = await factory([], { sessionFile: file, sessionDir });
    try {
      script = [{ tool: 'history_read', args: { ref } }, { text: '原文已核验' }];
      await agent.prompt('核验原文');
      assert.ok(flat(requests.at(-1)).includes('ALPHA'));
      assert.ok(flat(requests.at(-1)).includes('BETA'));
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
