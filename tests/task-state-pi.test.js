import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('real factory requests isolate main/sub state and restore it after reopen', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'axiom-task-state-pi-'));
  try {
    const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => /^(PATH|SYSTEMROOT|WINDIR|COMSPEC|TEMP|TMP|HOME|USERPROFILE|APPDATA|LOCALAPPDATA)$/i.test(key)));
    const code = String.raw`
      import assert from 'node:assert/strict';
      import { writeFile, mkdir } from 'node:fs/promises';
      import { createServer } from 'node:http';
      import { join } from 'node:path';
      import { createPiFactory } from './src/pi.js';
      import { SessionManager } from '@earendil-works/pi-coding-agent';
      const requests = []; let reply = 'ok';
      const server = createServer((req, res) => {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
          const payload = JSON.parse(body); requests.push(payload.messages);
          res.writeHead(200, { 'content-type': 'text/event-stream' });
          for (const chunk of [
            { choices: [{ delta: { content: reply } }] },
            { choices: [{ delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } }
          ]) res.write('data: ' + JSON.stringify(chunk) + '\n\n');
          res.end('data: [DONE]\n\n');
        });
      });
      await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
      const cwd = process.env.PI_CODING_AGENT_DIR;
      await writeFile(join(cwd, 'models.json'), JSON.stringify({ providers: { fake: {
        baseUrl: 'http://127.0.0.1:' + server.address().port + '/v1', api: 'openai-completions', apiKey: 'test-only',
        models: [{ id: 'tasked', name: 'Tasked', reasoning: false, input: ['text'], contextWindow: 200000, maxTokens: 4096,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } }]
      } } }));
      const factory = await createPiFactory({ cwd, model: 'fake/tasked' });
      const text = m => typeof m.content === 'string' ? m.content : (m.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
      const compaction = { enabled: false, tokenThreshold: 100000, percentThreshold: null, model: null, thinking: 'off', keepRecentTokens: 64, syncKeepRecentTokens: 64, asyncKeepRecentTokens: 64 };
      const files = {};
      try {
        for (const role of ['main', 'sub']) {
          const sessionDir = join(cwd, role); await mkdir(sessionDir);
          const sm = SessionManager.create(cwd, sessionDir);
          sm.appendMessage({ role: 'user', content: 'old', timestamp: Date.now() });
          sm.appendMessage({ role: 'assistant', content: [{ type: 'text', text: 'old reply' }], api: 'openai-completions', provider: 'fake', model: 'tasked', stopReason: 'stop', usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } }, timestamp: Date.now() });
          const boundary = sm.appendMessage({ role: 'user', content: 'RETAINED-' + role, timestamp: Date.now() });
          sm.appendCompaction('SUMMARY-' + role, boundary, 1000, { stateDoc: 'STATE-' + role, stateBoundary: boundary });
          files[role] = sm.getSessionFile();
        }
        for (const role of ['main', 'sub', 'main', 'sub']) {
          const agent = await factory([], { sessionFile: files[role], sessionDir: join(cwd, role), compaction,
            ...(role === 'sub' ? { memory: { role: 'subagent', policy: null, onReply() {} } } : {}) });
          try {
            await agent.prompt('NEW-' + role);
            const texts = requests.at(-1).map(text);
            const i = texts.findIndex(t => t.includes('SUMMARY-' + role));
            assert.ok(i >= 0);
            assert.match(texts[i + 1], new RegExp('STATE-' + role));
            assert.ok(texts.findIndex(t => t === 'RETAINED-' + role) > i + 1);
            assert.ok(texts.findIndex(t => t === 'NEW-' + role) > i + 1);
            assert.equal(texts.filter(t => t.includes('STATE-' + role)).length, 1);
            assert.ok(!texts.join('').includes('STATE-' + (role === 'main' ? 'sub' : 'main')));
          } finally { await agent.dispose(); }
        }
      } finally { server.close(); }
      console.log('task-state-ok');
    `;
    const { stdout } = await promisify(execFile)(process.execPath, ['--input-type=module', '-e', code], {
      cwd: new URL('..', import.meta.url), env: { ...env, PI_CODING_AGENT_DIR: dir, PI_OFFLINE: '1' }, timeout: 120000,
    });
    assert.match(stdout, /task-state-ok/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
