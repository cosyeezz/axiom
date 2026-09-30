import { randomUUID } from 'node:crypto';
import { mcpInstructionName, objectSchema } from './dynamic-tools.js';

const STATUS = 'pi-mcp-adapter/status/v1';
const empty = { type: 'object', properties: {}, additionalProperties: false };

/** Public adapter proxy metadata only; never import its manager/client internals. */
export function createMcpInstructions({ tools, servers, eventBus }) {
  const selected = new Set(servers);
  const revoked = new Set();
  const states = new Map();
  let operations = new Map(), revision = 0, dirty = true, closed = false;
  let pending;
  const invalidate = (cancel = false) => {
    revision++; dirty = true; operations.clear();
    if (cancel) tools.invalidateMcp();
  };
  const allowed = server => selected.has(server) && !revoked.has(server) && !['disabled', 'needs-auth', 'failed'].includes(states.get(server));
  const off = eventBus.on(STATUS, snapshot => {
    if (closed) return;
    const present = new Set();
    for (const server of snapshot?.servers ?? []) {
      if (!selected.has(server.name)) continue;
      const state = server.disabled ? 'disabled' : server.status;
      present.add(server.name);
      states.set(server.name, state);
    }
    for (const server of selected) if (!present.has(server)) states.set(server, 'disabled');
    // Counts are not versions: same-sized lists may have different names/schemas.
    // Fail closed even for a connected snapshot. Management connect is separate
    // from operation execution, so its own status events cannot cancel itself.
    invalidate(true);
  });
  const refresh = async context => {
    if (closed || !tools.get('mcp')) return;
    if (pending) { await pending; if (!dirty) return; }
    if (!dirty) return;
    const generation = revision, proxy = tools.get('mcp');
    pending = (async () => {
      const next = new Map();
      // These two proxy modes read metadata only. They do not connect lazy servers.
      const metadata = async args => {
        context.signal?.throwIfAborted();
        const result = await proxy.tool.execute(`catalog:${randomUUID()}`, args, context.signal, undefined, context.ctx);
        if (result.isError || result.details?.error) return null;
        return result.details;
      };
      for (const server of selected) {
        if (!allowed(server)) continue;
        const listing = await metadata({ server });
        if (listing?.mode !== 'list' || listing.server !== server || !Array.isArray(listing.tools)) continue;
        for (const key of listing.tools) {
          const detail = await metadata({ describe: key });
          const tool = detail?.tool;
          if (detail?.mode !== 'describe' || detail.server !== server || !tool?.originalName || tool.name !== key) continue;
          if (tool.uiVisibility?.length && !tool.uiVisibility.includes('model')) continue;
          let parameters;
          try { parameters = objectSchema(tool.resourceUri ? empty : tool.inputSchema ?? empty); } catch { continue; }
          const name = mcpInstructionName(server, tool.originalName);
          if (next.has(name)) throw new Error(`Ambiguous MCP operation: ${name}`);
          next.set(name, { name, server, proxyName: tool.name, description: String(tool.description ?? ''), parameters });
        }
      }
      if (!closed && generation === revision && tools.get('mcp') === proxy) { operations = next; dirty = false; }
    })();
    try { await pending; } finally { pending = undefined; }
  };
  const lookup = name => !closed && !dirty && tools.get('mcp') ? operations.get(name) : undefined;
  const guardOperation = operation => {
    if (lookup(operation.name) !== operation || !allowed(operation.server)) throw new Error(`MCP operation revoked or changed: ${operation.name}`);
    if (states.get(operation.server) !== 'connected') throw new Error('MCP server is not connected; use tool.mcp connect, then rediscover via axiom.tools');
  };
  return {
    // Direct MCP tools and scripting would re-expose stale names or bypass the
    // operation guard. Use the per-operation directory and management contract.
    visible: name => tools.get(name)?.owner !== 'axiom-mcp' || name === 'mcp',
    guard(name, args) {
      if (tools.get(name)?.owner !== 'axiom-mcp') return;
      if (name !== 'mcp') throw new Error('Use a current MCP operation from axiom.tools');
      if (Object.hasOwn(args, 'tool')) throw new Error('Use a current MCP operation from axiom.tools');
      if (args.args && args.action !== 'auth-complete') throw new Error('MCP args are only allowed for auth-complete');
      const modes = ['action', 'connect'].filter(key => args[key] !== undefined);
      if (modes.length !== 1) throw new Error('Choose one MCP management mode: connect or action');
      if (args.connect && args.server && args.server !== args.connect) throw new Error('Conflicting MCP servers');
      if (['auth-start', 'auth-complete'].includes(args.action) && !args.server) throw new Error('MCP authentication requires a selected server');
      const server = args.server ?? args.connect ?? args.instructions;
      if (server && !selected.has(server)) throw new Error(`MCP server not selected: ${server}`);
    },
    async list(context) { await refresh(context); return [...operations.values()].filter(op => allowed(op.server)); },
    async resolve(name, context) {
      await refresh(context);
      const operation = lookup(name);
      if (!operation || !allowed(operation.server)) return;
      return { name, description: operation.description, parameters: operation.parameters, toolResult: true,
        handler: async (args, ctx) => {
          const result = await tools.invoke('mcp', { server: operation.server, tool: operation.proxyName, args }, ctx, () => guardOperation(operation));
          return result.details?.error ? { ...result, isError: true } : result;
        } };
    },
    beforeCommand(name, args) {
      if (name !== 'mcp') return;
      const [action, ...rest] = String(args).trim().split(/\s+/);
      const server = rest.join(' ');
      if (['logout', 'disable'].includes(action) && selected.has(server)) { revoked.add(server); invalidate(true); }
      // Never grant before adapter success. Programmatic enable/disable commands
      // are unsupported; explicit management connect can restore a revoked server.
    },
    managementDefinition(tool) {
      const parameters = { type: 'object', additionalProperties: false, properties: {
        server: { type: 'string' }, connect: { type: 'string' },
        action: { type: 'string', enum: ['ui-messages', 'auth-start', 'auth-complete'] },
        args: { type: 'object', additionalProperties: false, properties: {
          redirectUrl: { type: 'string' }, code: { type: 'string' }, input: { type: 'string' },
        } },
      } };
      return { ...tool, parameters, description: 'MCP connection/authentication only: choose connect or action. Connect selected servers first, then rediscover exact operation names through axiom.tools. Cached tools cannot execute offline. Runtime status changes conservatively cancel pending operations; retry only after checking actual effects.' };
    },
    afterManagement(args, result) {
      if (args.connect && !result.isError && !result.details?.error && states.get(args.connect) === 'connected') revoked.delete(args.connect);
      if (args.connect || args.action) invalidate();
    },
    dispose() { closed = true; operations.clear(); off?.(); },
  };
}
