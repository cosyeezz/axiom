import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// 子进程隔离全部供应商凭据，真实 SDK + 临时 Pi 目录；不发送模型请求。
test("empty Pi starts, then a configured model becomes usable without restarting", async () => {
  const dir = await mkdtemp(join(tmpdir(), "axiom-onboarding-"));
  try {
    const env = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
      /^(PATH|SYSTEMROOT|WINDIR|COMSPEC|TEMP|TMP|HOME|USERPROFILE|APPDATA|LOCALAPPDATA)$/i.test(key)));
    const { stdout } = await promisify(execFile)(process.execPath, ["--input-type=module", "-e", `
      import assert from 'node:assert/strict';
      import { writeFile } from 'node:fs/promises';
      import { join } from 'node:path';
      import { createPiFactory } from './src/pi.js';
      import { Sessions } from './src/sessions.js';
      import { createServerApp } from './src/server.js';
      const cwd = process.env.PI_CODING_AGENT_DIR;
      const factory = await createPiFactory({ cwd });
      assert.deepEqual(factory.catalog(), []);
      const app = createServerApp(new Sessions(factory));
      await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
      try {
        const address = 'http://127.0.0.1:' + app.server.address().port;
        assert.equal((await fetch(address + '/health')).status, 200);
        assert.equal((await fetch(address + '/')).status, 200);
      } finally { await app.close(); }
      await assert.rejects(factory(), /设置 → 模型与供应商/);
      const explicit = await createPiFactory({ cwd, model: 'missing/model' });
      await writeFile(join(cwd, 'models.json'), JSON.stringify({ providers: {
        onboarding: { baseUrl: 'http://127.0.0.1:1/v1', api: 'openai-completions',
          apiKey: 'test-only-not-a-real-key', models: [{ id: 'local-test', name: 'Local test',
            reasoning: false, input: ['text'], contextWindow: 8192, maxTokens: 1024,
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } }] }
      }}));
      await factory.refreshModels();
      assert.equal(factory.catalog()[0].key, 'onboarding/local-test');
      const agent = await factory([], { capabilities: { skills: [], plugins: [], mcp: [] } });
      assert.equal(agent.config().model, 'onboarding/local-test');
      await agent.dispose();
      // Fresh-install defaults must work for reasoning-only models that reject off.
      const modelsPath = join(cwd, 'models.json');
      await writeFile(modelsPath, JSON.stringify({ providers: {
        onboarding: { baseUrl: 'http://127.0.0.1:1/v1', api: 'openai-completions',
          apiKey: 'test-only-not-a-real-key', models: [{ id: 'reasoning-only', name: 'Reasoning only',
            reasoning: true, thinkingLevelMap: { off: null, minimal: null },
            input: ['text'], contextWindow: 8192, maxTokens: 1024,
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } }] }
      }}));
      await factory.refreshModels();
      assert(!factory.catalog()[0].levels.includes('off'));
      const sessions = new Sessions(factory);
      try {
        const id = await sessions.create(cwd);
        assert.equal(sessions.snapshot(id).config.compaction.thinking, 'low');
        assert.equal(sessions.defaultSelection.compaction.thinking, 'off');
        const selectedId = await sessions.create(cwd, { model: 'onboarding/reasoning-only' });
        assert.equal(sessions.snapshot(selectedId).config.compaction.thinking, 'low');
        const active = sessions.get(id).agent;
        await active.configure({ model: 'onboarding/reasoning-only',
          compaction: { ...active.config().compaction, thinking: 'off' } });
        assert.equal(active.config().compaction.thinking, 'low');
      } finally { await sessions.close(); }
      await explicit.refreshModels();
      await assert.rejects(explicit(), /missing\\/model/);
      await assert.rejects(factory([], { model: 'missing/model' }), /模型不可用/);
      console.log('onboarding-ok');
    `], { cwd: new URL("..", import.meta.url), env: { ...env, PI_CODING_AGENT_DIR: dir, PI_OFFLINE: "1" }, timeout: 60000 });
    assert.match(stdout, /onboarding-ok/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
