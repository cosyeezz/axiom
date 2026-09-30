import test from 'node:test';
import assert from 'node:assert/strict';
import { Compile } from 'typebox/compile';
import { createDynamicTools, toolInstructionName, mcpInstructionName } from '../src/dynamic-tools.js';
import { createMcpInstructions } from '../src/mcp-instructions.js';
import { createInstructions } from '../src/instructions.js';
import { instructionTools } from '../src/instruction-tools.js';
const parameters = { type: 'object', properties: { n: { type: 'integer' } }, required: ['n'], additionalProperties: false };
function fixture() {
  const session = { agent: { state: { systemPrompt: '', messages: [], tools: [] } } };
  const validate = (tool, call) => { if (!Compile(tool.parameters).Check(call.arguments)) throw new Error('Invalid arguments'); return call.arguments; };
  const tools = createDynamicTools({ getSession: () => session, validate });
  const registry = createInstructions(), context = { dynamicTools: tools };
  const native = instructionTools(registry, tools);
  const [ask, letTool] = native;
  const execute = (name, args = {}) => letTool.execute('call', { name, arguments: args });
  const describe = name => ask.execute('ask', { name });
  return { session, tools, registry, context, execute, describe, native };
}
const definition = execute => ({ name: 'probe', description: 'probe operation', parameters, execute });
const result = text => ({ content: [{ type: 'text', text }], details: { original: true } });

test('directory, exact contracts, disable/replace and independent session isolation', async () => {
  const a = fixture(), b = fixture();
  let calls = 0;
  a.tools.register(definition(async (_id, args) => { calls++; return result(String(args.n)); }), 'plugin');
  assert.equal((await a.registry.execute('axiom.tools', {}, a.context)).tools[0].name, 'tool.probe');
  assert.equal((await b.registry.execute('axiom.tools', {}, b.context)).total, 0);
  assert.deepEqual((await a.describe('tool.probe')).details.parameters, parameters);
  await assert.rejects(b.execute('tool.probe', { n: 2 }), /Unknown instruction/);
  await assert.rejects(a.execute('tool.probe', { n: '2' }), /Invalid/);
  assert.equal(calls, 0);
  assert.equal((await a.execute('tool.probe', { n: 2 })).details.original, true);
  a.tools.disable(['probe']);
  assert.equal((await a.registry.execute('axiom.tools', {}, a.context)).total, 0);
  await assert.rejects(a.describe('tool.probe'), /Unknown instruction/);
  await assert.rejects(a.execute('tool.probe', { n: 3 }), /Unknown instruction/);
  a.tools.register(definition(async () => result('updated')), 'plugin');
  await assert.rejects(a.execute('tool.probe', { n: 3 }), /Unknown instruction/);
  a.tools.enable(['probe']);
  assert.equal((await a.execute('tool.probe', { n: 3 })).content[0].text, 'updated');
  assert.equal(calls, 1);
  a.tools.dispose();
  await assert.rejects(a.execute('tool.probe', { n: 3 }), /Unknown instruction/);
});

test('protected dispatch prepares arguments, invokes original hooks, rechecks revocation after approval', async () => {
  const f = fixture(), events = [];
  f.tools.register({ ...definition(async (_id, args) => { events.push('execute'); return result(String(args.n)); }),
    prepareArguments: args => { events.push('prepare'); return { n: Number(args.n) }; } }, 'plugin');
  f.session.agent.beforeToolCall = async ({ toolCall, args }) => {
    assert.equal(toolCall.name, 'probe'); assert.equal(toolCall.arguments.n, '4'); assert.equal(args.n, 4); events.push('before');
  };
  f.session.agent.afterToolCall = async ({ isError }) => { assert.equal(isError, false); events.push('after'); return { content: result('filtered').content }; };
  assert.equal((await f.execute('tool.probe', { n: '4' })).content[0].text, 'filtered');
  assert.deepEqual(events, ['prepare', 'before', 'execute', 'after']);
  events.length = 0;
  f.session.agent.beforeToolCall = async () => { await Promise.resolve(); f.tools.disable(['probe']); };
  await assert.rejects(f.execute('tool.probe', { n: 4 }), /revoked|Capability/);
  assert.deepEqual(events, ['prepare']);
});

test('blocks cannot execute and errors still pass through original result hooks', async () => {
  const f = fixture(); let calls = 0, errors = 0;
  f.tools.register(definition(async () => { calls++; throw new Error('operation failed'); }), 'p');
  f.session.agent.beforeToolCall = async () => ({ block: true, reason: 'approval denied', terminate: true });
  const denied = await f.execute('tool.probe', { n: 1 });
  assert.equal(denied.isError, true);
  assert.equal(denied.terminate, true);
  assert.match(denied.content[0].text, /approval denied/);
  f.native.bindResultHook(f.session.agent);
  assert.equal((await f.session.agent.afterToolCall({ result: denied, isError: false })).isError, true);
  assert.equal(calls, 0);
  f.session.agent.beforeToolCall = null;
  f.session.agent.afterToolCall = async ({ isError }) => { if (isError) errors++; };
  assert.match((await f.execute('tool.probe', { n: 1 })).content[0].text, /operation failed/);
  assert.equal(errors, 1);
});

test('facade captures startup and later registration, preserving logical activation', () => {
  const f = fixture(), direct = new Set(['read']);
  const pi = { getAllTools: () => [{ name: 'read' }], getActiveTools: () => [...direct], setActiveTools: names => { direct.clear(); for (const n of names) direct.add(n); }, registerTool: () => assert.fail('not a direct tool') };
  const api = f.tools.facade(pi, 'plugin');
  api.registerTool(definition(async () => result('x')));
  assert.deepEqual(api.getActiveTools(), ['read', 'probe']);
  api.setActiveTools(['read']); assert.equal(f.tools.get('probe'), undefined);
  api.registerTool(definition(async () => result('new'))); assert.equal(f.tools.get('probe'), undefined);
  assert.throws(() => api.registerTool({ ...definition(() => {}), name: 'ask_axiom' }), /Reserved/);
  assert.throws(() => api.registerTool({ ...definition(() => {}), name: 'read' }), /Reserved/);
  const other = f.tools.facade(pi, 'other');
  other.registerTool({ ...definition(async () => result('y')), name: 'other' });
  api.setActiveTools(['probe']); assert.ok(f.tools.get('probe')); assert.ok(f.tools.get('other'));
  other.setActiveTools([]); api.setActiveTools(['probe', 'other']);
  assert.equal(f.tools.get('other'), undefined);
  assert.equal(api.unregisterTool('other'), false);
  assert.equal(api.unregisterTool('probe'), true);
  assert.equal(f.tools.get('probe'), undefined);
  assert.deepEqual([...direct], ['read']);
});

test('only trusted MCP refresh preserves entered management calls; revocation and pending approvals still win', async () => {
  for (const scenario of ['refresh', 'plugin-replace', 'operation', 'disable', 'unregister', 'dispose', 'pending-approval']) {
    const f = fixture(); let release, entered;
    const waiting = new Promise(resolve => { entered = resolve; });
    const gate = new Promise(resolve => { release = resolve; });
    const api = f.tools.facade({}, 'axiom-mcp', { adapter: scenario !== 'plugin-replace' });
    const tool = { name: 'mcp', description: 'before', parameters: { type: 'object', additionalProperties: true },
      async execute(_id, _args, signal) {
        entered(); await gate; signal.throwIfAborted(); return result('connected');
      } };
    api.registerTool(tool);
    if (scenario === 'pending-approval') f.session.agent.beforeToolCall = async () => { entered(); await gate; };
    const running = f.execute('tool.mcp', scenario === 'operation' ? { tool: 'probe' } : { connect: 'server' });
    await waiting;
    if (scenario === 'disable') f.tools.disable(['mcp']);
    else if (scenario === 'unregister') api.unregisterTool('mcp');
    else if (scenario === 'dispose') f.tools.dispose();
    else api.registerTool({ ...tool, description: 'after' });
    release();
    if (scenario === 'pending-approval') await assert.rejects(running, /revoked|replaced/, scenario);
    else assert.equal((await running).isError, scenario !== 'refresh', scenario);
    f.tools.dispose();
  }
});

test('MCP per-operation contracts use metadata and revoke cached names after logout/status', async () => {
  const f = fixture(), handlers = new Map(); let calls = 0;
  const eventBus = { on(name, fn) { handlers.set(name, fn); return () => handlers.delete(name); } };
  const bridge = createMcpInstructions({ tools: f.tools, servers: ['server'], eventBus });
  f.tools.attachMcp(bridge);
  f.tools.register({ name: 'mcp', description: 'gateway', parameters: { type: 'object', properties: {}, additionalProperties: true },
    async execute(_id, args) {
      if (args.tool) {
        assert.deepEqual(args, { server: 'server', tool: 'server_probe', args: { n: 1 } });
        calls++; return result('remote');
      }
      if (args.describe) return { ...result('metadata'), details: { mode: 'describe', server: 'server', tool: { name: 'server_probe', originalName: 'probe', description: 'probe', inputSchema: parameters } } };
      if (args.server) return { ...result('list'), details: { mode: 'list', server: args.server, tools: ['server_probe'] } };
      return result('status');
    } }, 'axiom-mcp');
  handlers.get('pi-mcp-adapter/status/v1')({ servers: [{ name: 'server', status: 'connected' }] });
  const name = mcpInstructionName('server', 'probe');
  assert.ok((await f.registry.execute('axiom.tools', {}, f.context)).tools.some(tool => tool.name === name));
  assert.deepEqual((await f.describe(name)).details.parameters, parameters);
  await assert.rejects(f.execute(name, { n: 'bad' }), /Invalid/);
  assert.equal((await f.execute(name, { n: 1 })).content[0].text, 'remote');
  await assert.rejects(f.execute(toolInstructionName('mcp'), { tool: 'probe', args: { n: 1 } }), /Invalid/);
  assert.equal(calls, 1);
  bridge.beforeCommand('mcp', 'logout server');
  assert.equal((await f.registry.execute('axiom.tools', {}, f.context)).tools.some(tool => tool.name === name), false);
  await assert.rejects(f.execute(name, { n: 1 }), /Unknown instruction/);
  bridge.beforeCommand('mcp', 'enable server');
  bridge.beforeCommand('mcp', 'reconnect server');
  await assert.rejects(f.execute(name, { n: 1 }), /Unknown instruction/);
  assert.equal(calls, 1);
});

test('MCP status changes abort pending inner approval; management connect is not self-cancelled', async () => {
  const f = fixture(), handlers = new Map(); let calls = 0, approve, entered;
  const pending = new Promise(resolve => { entered = resolve; });
  const eventBus = { on(name, fn) { handlers.set(name, fn); return () => handlers.delete(name); } };
  const bridge = createMcpInstructions({ tools: f.tools, servers: ['server'], eventBus });
  const status = () => handlers.get('pi-mcp-adapter/status/v1')({ servers: [{ name: 'server', status: 'connected' }] });
  f.tools.attachMcp(bridge);
  f.tools.register({ name: 'mcp', description: 'gateway', parameters: { type: 'object', additionalProperties: true },
    async execute(_id, args, signal) {
      if (args.connect) { status(); signal.throwIfAborted(); return result('connected'); }
      if (args.action) return result('auth complete');
      if (args.tool) {
        entered();
        await new Promise((resolve, reject) => { approve = resolve; signal.addEventListener('abort', () => reject(signal.reason), { once: true }); });
        signal.throwIfAborted(); calls++; return result('remote');
      }
      if (args.describe) return { ...result('metadata'), details: { mode: 'describe', server: 'server', tool: { name: 'server_probe', originalName: 'probe', inputSchema: parameters } } };
      return { ...result('list'), details: { mode: 'list', server: 'server', tools: ['server_probe'] } };
    } }, 'axiom-mcp');
  const name = mcpInstructionName('server', 'probe');
  await assert.rejects(f.execute(name, { n: 1 }), /not connected/);
  assert.equal((await f.execute('tool.mcp', { connect: 'server' })).content[0].text, 'connected');
  const calling = f.execute(name, { n: 1 });
  await pending;
  status(); // Even same-sized lists may contain a different operation or schema.
  approve();
  assert.equal((await calling).isError, true);
  assert.equal(calls, 0);
  assert.equal((await f.execute('tool.mcp', { action: 'auth-complete', server: 'server', args: { redirectUrl: 'http://localhost/callback' } })).content[0].text, 'auth complete');
  await assert.rejects(f.execute('tool.mcp', { connect: 'server', args: { input: 'x' } }), /only allowed/);
  await assert.rejects(f.execute('tool.mcp', { action: 'auth-start', connect: 'server' }), /one MCP/);
  await assert.rejects(f.execute('tool.mcp', { describe: 'server_probe' }), /Invalid/);
});

test('MCP failed reconnect does not restore logout authorization; UI visibility follows model metadata', async () => {
  const f = fixture(), handlers = new Map();
  let failConnect = true;
  const bridge = createMcpInstructions({ tools: f.tools, servers: ['server'],
    eventBus: { on(name, fn) { handlers.set(name, fn); return () => handlers.delete(name); } } });
  f.tools.attachMcp(bridge);
  const status = () => handlers.get('pi-mcp-adapter/status/v1')({ servers: [{ name: 'server', status: 'connected' }] });
  f.tools.register({ name: 'mcp', description: 'gateway', parameters: { type: 'object', additionalProperties: true },
    async execute(_id, args) {
      if (args.connect) { status(); return failConnect ? { ...result('failed'), details: { error: 'connect_failed' } } : result('connected'); }
      if (args.tool) return result('remote');
      if (args.describe) return { ...result('metadata'), details: { mode: 'describe', server: 'server', tool: {
        name: args.describe, originalName: args.describe, inputSchema: parameters,
        uiResourceUri: 'ui://example', uiVisibility: args.describe === 'appOnly' ? ['app'] : ['model', 'app'],
      } } };
      return { ...result('list'), details: { mode: 'list', server: 'server', tools: ['probe', 'appOnly'] } };
    } }, 'axiom-mcp');
  status();
  const name = mcpInstructionName('server', 'probe');
  assert.ok((await f.describe(name)).details.parameters);
  await assert.rejects(f.describe(mcpInstructionName('server', 'appOnly')), /Unknown/);
  bridge.beforeCommand('mcp', 'logout server');
  await f.execute('tool.mcp', { connect: 'server' });
  await assert.rejects(f.execute(name, { n: 1 }), /Unknown/);
  failConnect = false;
  await f.execute('tool.mcp', { connect: 'server' });
  assert.equal((await f.execute(name, { n: 1 })).content[0].text, 'remote');
  f.tools.dispose();
});
