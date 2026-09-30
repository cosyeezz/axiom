import { randomUUID } from 'node:crypto';
import { Compile } from 'typebox/compile';

export const DIRECT_TOOLS = new Set(['read', 'bash', 'powershell', 'edit', 'write', 'grep', 'find', 'ls', 'question', 'ask_axiom', 'let_axiom']);
const EXCLUDED = new Set(['history_read', 'history.read', 'obs_recall']);
export const toolInstructionName = name => `tool.${encodeURIComponent(name)}`;
export const mcpInstructionName = (server, name) => `mcp.${encodeURIComponent(server)}.${encodeURIComponent(name)}`;
const failure = error => ({ content: [{ type: 'text', text: error?.message ?? String(error) }], isError: true });

// There is no public SDK executeTool API. Mirror the public Agent hooks, including
// prepare/validation and result filtering; never call a cached, revoked executor.
export async function dispatchTool({ tool, args, context, session, valid, validate, signal = context.signal }) {
  signal?.throwIfAborted();
  valid();
  const toolCall = { type: 'toolCall', id: `${context.toolCallId ?? 'let'}:${randomUUID()}`, name: tool.name, arguments: structuredClone(args) };
  const prepared = tool.prepareArguments ? tool.prepareArguments(toolCall.arguments) : toolCall.arguments;
  const input = validate(tool, { ...toolCall, arguments: prepared });
  const currentContext = () => ({ systemPrompt: session.agent.state.systemPrompt, messages: session.agent.state.messages, tools: session.agent.state.tools });
  const assistantMessage = session.agent.state.messages.findLast(message => message.role === 'assistant');
  const hookContext = { assistantMessage, toolCall, args: input, context: currentContext() };
  const decision = await session.agent.beforeToolCall?.(hookContext, signal);
  if (decision?.block) return { ...failure(decision.reason ?? 'Tool call blocked'), ...(decision.terminate ? { terminate: true } : {}) };
  signal?.throwIfAborted();
  valid(); // synchronous check AFTER asynchronous approvals, before entering execute
  let result;
  try { const output = await tool.execute(toolCall.id, input, signal, context.onUpdate, context.ctx); result = { ...output, isError: Boolean(output.isError) }; }
  catch (error) { result = failure(error); }
  const patch = await session.agent.afterToolCall?.({ ...hookContext, context: currentContext(), result, isError: Boolean(result.isError) }, signal);
  if (patch) for (const key of ['content', 'details', 'isError', 'usage', 'terminate']) if (patch[key] !== undefined) result = { ...result, [key]: patch[key] };
  return result;
}

/** Session-owned extension tool set. No global executor/schema cache. */
export function createDynamicTools({ inactiveTools = [], getSession, validate, enabled = true } = {}) {
  const records = new Map();
  const active = new Set();
  const initialInactive = new Set(inactiveTools);
  const inFlight = new Map();
  let closed = !enabled;
  let mcp;
  const abort = (name, operationsOnly = false) => {
    for (const call of inFlight.values()) if ((!name || call.name === name) && (!operationsOnly || call.mcpOperation)) call.controller.abort(new Error('Capability revoked'));
  };
  const setActive = names => {
    const next = new Set(names);
    for (const name of active) if (!next.has(name)) { active.delete(name); abort(name); }
    for (const name of next) if (records.has(name) && !closed) active.add(name);
  };
  const get = name => !closed && active.has(name) ? records.get(name) : undefined;
  const register = (tool, owner, adapterRefresh = false) => {
    if (closed || EXCLUDED.has(tool.name)) return;
    if (!tool.name || typeof tool.execute !== 'function') throw new Error('Invalid extension tool');
    const prior = records.get(tool.name);
    if (prior && prior.owner !== owner) throw new Error(`Duplicate extension tool: ${tool.name}`);
    // The trusted adapter refreshes the gateway description during init/connect.
    // Keep an already-entered management call alive, but still replace identity:
    // pending approvals and all operation calls must reject the old record.
    abort(tool.name, adapterRefresh && tool.name === 'mcp' && prior?.owner === owner);
    records.set(tool.name, { tool, owner });
    if (!prior && !initialInactive.has(tool.name)) active.add(tool.name);
  };
  const invoke = async (name, args, context, guard = () => {}) => {
    const record = get(name);
    if (!record) throw new Error(`Tool unavailable: ${name}`);
    const token = Symbol(name), controller = new AbortController();
    inFlight.set(token, { name, controller, mcpOperation: name === 'mcp' && Boolean(args.tool) });
    const signal = context.signal ? AbortSignal.any([context.signal, controller.signal]) : controller.signal;
    const valid = () => { if (get(name) !== record) throw new Error(`Tool revoked or replaced: ${name}`); guard(); };
    try {
      return await dispatchTool({ tool: record.tool, args, context, session: getSession(), valid, validate, signal });
    } finally { inFlight.delete(token); }
  };
  const source = {
    async list(context) {
      if (closed) return [];
      const tools = [...active].filter(name => get(name) && (!mcp || mcp.visible(name))).map(name => ({ name: toolInstructionName(name), description: records.get(name).tool.description }));
      return [...tools, ...(await mcp?.list(context) ?? [])];
    },
    async resolve(name, context) {
      if (closed) return;
      if (name.startsWith('mcp.')) return mcp?.resolve(name, context);
      const key = [...active].find(key => toolInstructionName(key) === name);
      const record = get(key);
      if (!record || (mcp && !mcp.visible(key))) return;
      const tool = key === 'mcp' && mcp ? mcp.managementDefinition(record.tool) : record.tool;
      return { name, description: tool.description, parameters: tool.parameters, toolResult: true,
        // Preparation/validation belongs to the protected dispatcher, not the outer envelope.
        validateArguments: key === 'mcp' && Boolean(mcp),
        ...(tool.promptGuidelines?.length ? { guidance: tool.promptGuidelines.join('\n') } : {}),
        handler: async (args, ctx) => {
          const result = await invoke(key, args, ctx, () => mcp?.guard(key, args));
          if (key === 'mcp') mcp?.afterManagement(args, result);
          return result;
        } };
    },
  };
  return {
    ...source, invoke, get, register,
    activeNames: () => closed ? [] : [...active],
    setActive,
    enable: names => setActive([...active, ...names]),
    disable: names => setActive([...active].filter(name => !names.includes(name))),
    attachMcp: bridge => { mcp = bridge; },
    invalidateMcp: () => { for (const call of inFlight.values()) if (call.mcpOperation) call.controller.abort(new Error('MCP capability changed; rediscover before retrying')); },
    facade(pi, owner, { adapter = false } = {}) {
      return new Proxy(pi, { get(target, property) {
        if (property === 'registerTool') return tool => {
          if (DIRECT_TOOLS.has(tool.name)) throw new Error(`Reserved Axiom tool: ${tool.name}`);
          register(tool, owner, adapter);
        };
        if (property === 'unregisterTool') return name => {
          if (records.get(name)?.owner !== owner) return false;
          abort(name); active.delete(name); return records.delete(name);
        };
        if (property === 'getAllTools') return () => [...target.getAllTools(), ...[...records.values()].map(({ tool, owner: path }) => ({ name: tool.name, description: tool.description, parameters: tool.parameters, promptGuidelines: tool.promptGuidelines, sourceInfo: { path, source: path, scope: 'temporary', origin: 'top-level' } }))];
        if (property === 'getActiveTools') return () => [...target.getActiveTools(), ...active];
        if (property === 'setActiveTools') return names => {
          // An extension controls only its own logical tools, never the host or
          // another extension. The host retains the global activation API.
          const others = [...active].filter(name => records.get(name)?.owner !== owner);
          setActive([...others, ...names.filter(name => records.get(name)?.owner === owner)]);
        };
        if (property === 'registerCommand' && adapter) return (name, options) => target.registerCommand(name, { ...options, handler: async (args, ctx) => {
          // Adapter logout leaves cached metadata behind. A logout command must revoke
          // the host's directory even when the adapter cannot clean its cache.
          mcp?.beforeCommand(name, args);
          return options.handler(args, ctx);
        } });
        return Reflect.get(target, property);
      } });
    },
    dispose() { closed = true; abort(); records.clear(); active.clear(); mcp?.dispose(); },
  };
}

// A conservative schema check for MCP metadata before publishing a contract.
export function objectSchema(value) {
  if (!value || value.type !== 'object') throw new Error('Tool metadata must contain an object schema');
  Compile(value);
  return structuredClone(value);
}
