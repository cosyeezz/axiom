import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

const imports = `
import assert from 'node:assert/strict';
import net from 'node:net';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { serveGate, connectGate } from ${JSON.stringify(new URL('../src/gate-ipc.js', import.meta.url).href)};
import { RequestGate } from ${JSON.stringify(new URL('../src/request-gate.js', import.meta.url).href)};
const endpoint = process.platform === 'win32' ? ${JSON.stringify('\\\\.\\pipe\\axiom-shape-')} + randomUUID() : join(tmpdir(), 'gate-' + randomUUID() + '.sock');
const frames = ['null', '[]', '\"text\"', '0', 'false', '{'];
`;
function isolated(code) {
  const result = spawnSync(process.execPath, ["--input-type=module", "-e", imports + code], { encoding: "utf8", timeout: 15000 });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr || result.stdout);
}

test("IPC server rejects non-object frames locally and releases held leases", () => isolated(`
const gate = new RequestGate({ limits: { p: { concurrency: 1 } } });
const server = await serveGate({ endpoint, token: 'secret', service: { gate } });
try {
  for (const frame of frames) {
    const socket = net.createConnection(endpoint);
    socket.on('error', () => {});
    await once(socket, 'connect');
    const acquired = once(socket, 'data');
    socket.write(JSON.stringify({ id: 'first', token: 'secret', method: 'acquire', provider: 'p', kind: 'concurrency' }) + '\\n');
    assert.ok(JSON.parse(String((await acquired)[0])).data.leaseId);
    const closed = new Promise(resolve => socket.once('close', resolve));
    socket.write(frame + '\\n');
    await closed;
    const client = await connectGate({ endpoint, token: 'secret', timeoutMs: 1000 });
    try {
      assert.deepEqual((await client.request('limits')).limits, gate.limits);
      const lease = await client.request('acquire', { provider: 'p', kind: 'concurrency' });
      await client.request('release', { leaseId: lease.leaseId });
      assert.equal(gate.snapshot()[0].active, 0);
    } finally { client.close(); }
  }
} finally { await server.close(); gate.close(); }
`));

test("IPC client rejects all pending requests on non-object responses", () => isolated(`
for (const frame of frames) {
  let peer;
  const server = net.createServer(socket => {
    peer = socket;
    let buffer = '';
    socket.on('error', () => {});
    socket.on('data', chunk => {
      buffer += chunk;
      if (buffer.split('\\n').length >= 3) socket.write(frame + '\\n');
    });
  });
  server.listen(endpoint); await once(server, 'listening');
  const client = await connectGate({ endpoint, token: 'secret', timeoutMs: 1000 });
  try {
    const pending = [client.request('limits'), client.request('limits')];
    const results = await Promise.allSettled(pending);
    for (const result of results) {
      assert.equal(result.status, 'rejected');
      assert.equal(result.reason.code, 'GATE_DISCONNECTED');
    }
    assert.equal(client.connected, false);
  } finally { client.close(); peer?.destroy(); await new Promise(resolve => server.close(resolve)); }
}
`));
