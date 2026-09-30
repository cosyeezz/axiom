import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

// Optional integration: point to an installed adapter's public index.ts. Never
// install a package, load personal MCP config, or contact an external server.
const adapter = process.env.AXIOM_TEST_MCP_ADAPTER;
test('real MCP adapter preserves discovery, approval and shutdown revocation', { skip: !adapter }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'axiom-mcp-integration-'));
  try {
    const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => /^(PATH|SYSTEMROOT|WINDIR|COMSPEC)$/i.test(key)));
    const { stdout } = await promisify(execFile)(process.execPath,
      ['tests/fixtures/mcp-adapter.mjs', resolve(adapter)], {
        cwd: new URL('..', import.meta.url), timeout: 90000,
        env: { ...env, HOME: root, USERPROFILE: root, TEMP: root, TMP: root, TMPDIR: root, PI_CODING_AGENT_DIR: root, PI_OFFLINE: '1' },
      });
    assert.match(stdout, /mcp-integration-ok/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
