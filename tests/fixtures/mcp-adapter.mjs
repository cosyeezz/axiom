import assert from 'node:assert/strict';
import { writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { discoverCapabilities } from '../../src/capabilities.js';
import { createDynamicTools } from '../../src/dynamic-tools.js';
import { createMcpInstructions } from '../../src/mcp-instructions.js';
import { instructionTools } from '../../src/instruction-tools.js';
import { createEventBus } from '@earendil-works/pi-coding-agent';
import { Compile } from 'typebox/compile';

const root = process.env.PI_CODING_AGENT_DIR;
await writeFile(join(root, 'settings.json'), JSON.stringify({ extensions: [process.argv[2]] }));
const { createMcpAdapter } = await discoverCapabilities(root, { agentDir: root });
assert.equal(typeof createMcpAdapter, 'function');
const counter = join(root, 'calls.txt');
const server = `
  import { createInterface } from 'node:readline';
  import { appendFileSync } from 'node:fs';
  let calls = 0;
  createInterface({ input: process.stdin }).on('line', line => {
    const m = JSON.parse(line); if (m.id === undefined) return;
    let result;
    if (m.method === 'initialize') result = { protocolVersion: m.params.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: 'fixture', version: '1' } };
    else if (m.method === 'tools/list') result = { tools: [{ name: 'probe', description: 'Local probe', inputSchema: { type: 'object', properties: { n: { type: 'integer' } }, required: ['n'], additionalProperties: false } }] };
    else if (m.method === 'tools/call') { appendFileSync(${JSON.stringify(counter)}, 'call\\n'); result = { content: [{ type: 'text', text: JSON.stringify({ calls: ++calls, args: m.params.arguments }) }] }; }
    else result = {};
    process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: m.id, result }) + '\\n');
  });
`;
const eventBus = createEventBus(), hooks = new Map();
const session = { agent: { state: { systemPrompt: '', messages: [], tools: [] } } };
const tools = createDynamicTools({ getSession: () => session,
  validate: (tool, call) => { assert.ok(Compile(tool.parameters).Check(call.arguments)); return call.arguments; } });
tools.attachMcp(createMcpInstructions({ tools, servers: ['local'], eventBus }));
const pi = {
  events: eventBus,
  on(name, fn) { const list = hooks.get(name) ?? []; list.push(fn); hooks.set(name, list); },
  registerCommand() {}, registerFlag() {}, getFlag() {}, sendMessage() {},
  registerTool() { assert.fail('MCP tools must not register directly'); },
  getAllTools: () => [], getActiveTools: () => ['ask_axiom', 'let_axiom'], setActiveTools() {},
};
const ctx = { mode: 'print', hasUI: false, cwd: root };
const lifecycle = async name => { for (const fn of hooks.get(name) ?? []) await fn({ type: name }, ctx); };
const native = instructionTools(undefined, tools);
const execute = (name, args = {}) => native[1].execute('test', { name, arguments: args }, undefined, undefined, ctx);
const describe = name => native[0].execute('test', { name }, undefined, undefined, ctx);
let stopApproval;
try {
  await createMcpAdapter({ config: {
    mcpServers: { local: { command: process.execPath, args: ['--input-type=module', '-e', server], lifecycle: 'lazy', directTools: false, approveTools: true } },
    settings: { scriptMode: false, directTools: false, disableProxyTool: false, sampling: false, elicitation: false, autoAuth: false, idleTimeout: 0 },
  } })(tools.facade(pi, 'axiom-mcp', { adapter: true }));
  await lifecycle('session_start');
  const connected = await execute('tool.mcp', { connect: 'local' });
  assert.notEqual(connected.isError, true, JSON.stringify(connected));
  assert.ok(!connected.details?.error, JSON.stringify(connected));
  const directory = await execute('axiom.tools');
  assert.ok(directory.details.tools.some(t => t.name === 'mcp.local.probe'), JSON.stringify(directory));
  assert.equal((await describe('mcp.local.probe')).details.parameters.properties.n.type, 'integer');
  await assert.rejects(execute('mcp.local.probe', { n: 'bad' }), /Invalid/);
  const headless = await execute('mcp.local.probe', { n: 1 });
  assert.equal(headless.details.error, 'approval_required');
  let decision = 'deny', entered, release;
  stopApproval = eventBus.on('pi-mcp-adapter:tool-approval-request', request => {
    assert.equal(request.serverName, 'local'); assert.equal(request.originalToolName, 'probe');
    assert.equal(request.origin, 'proxy');
    request.claim(() => decision === 'pending' ? new Promise(resolve => { release = resolve; entered(); }) : decision);
  });
  assert.equal((await execute('mcp.local.probe', { n: 1 })).details.error, 'approval_denied');
  decision = 'allow_once';
  const accepted = await execute('mcp.local.probe', { n: 7 });
  assert.notEqual(accepted.isError, true, JSON.stringify(accepted));
  assert.equal(await readFile(counter, 'utf8'), 'call\n', 'denied requests must not reach RPC');
  decision = 'pending';
  const approval = new Promise(resolve => { entered = resolve; });
  const calling = execute('mcp.local.probe', { n: 8 });
  await approval;
  await lifecycle('session_shutdown');
  release('allow_once');
  assert.equal((await calling).isError, true);
  assert.equal(await readFile(counter, 'utf8'), 'call\n', 'revocation during approval must not issue an RPC');
  await assert.rejects(describe('mcp.local.probe'), /Unknown instruction/);
  await assert.rejects(execute('mcp.local.probe', { n: 9 }), /Unknown instruction/);
  assert.ok(!(await execute('axiom.tools')).details.tools.some(t => t.name === 'mcp.local.probe'));
  console.log('mcp-integration-ok');
} finally {
  stopApproval?.();
  await lifecycle('session_shutdown');
  tools.dispose();
}
