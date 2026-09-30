import { Compile } from "typebox/compile";

const nameParameter = { type: "string", minLength: 1, description: "Known exact instruction name. Do not guess." };
export const describeParameters = {
  type: "object", properties: { name: nameParameter }, required: ["name"], additionalProperties: false,
};
export const executeParameters = {
  type: "object",
  properties: {
    name: nameParameter,
    arguments: { type: "object", additionalProperties: true, description: "Instruction arguments. Pass {} if none." },
  },
  required: ["name", "arguments"], additionalProperties: false,
};

const validateCall = Compile(executeParameters);
function check(validator, value) {
  if (!validator.Check(value)) {
    throw new Error(`Invalid instruction arguments: ${JSON.stringify(validator.Errors(value))}`);
  }
}

export function createInstructions() {
  const definitions = new Map();
  const sources = new Map();
  const compile = ({ name, description, parameters, handler, toolResult = false, guidance, validateArguments = true }) => {
    if (typeof description !== 'string' || typeof handler !== 'function' || !parameters || parameters.type !== 'object') {
      throw new Error('Instruction requires description, object parameters schema, and handler');
    }
    const contract = structuredClone({ name, description, parameters, ...(guidance ? { guidance } : {}) });
    return { contract, validator: validateArguments ? Compile(contract.parameters) : null, handler, toolResult };
  };
  const resolve = async (name, context) => {
    if (definitions.has(name)) return definitions.get(name);
    for (const [prefix, source] of sources) {
      if (!name.startsWith(prefix)) continue;
      const definition = await source.resolve(name, context);
      if (definition?.name === name) return compile(definition);
    }
    throw new Error(`Unknown instruction: ${name}`);
  };
  const registry = {
    register({ name, description, parameters, handler, toolResult = false, guidance }) {
      if (typeof name !== "string" || !name.trim() || name !== name.trim()) throw new Error("Invalid instruction name");
      if (definitions.has(name)) throw new Error(`Instruction already registered: ${name}`);
      if ([...sources.keys()].some(prefix => name.startsWith(prefix))) throw new Error(`Reserved instruction namespace: ${name}`);
      const definition = compile({ name, description, parameters, handler, toolResult, guidance });
      definitions.set(name, definition);
      // An old disposer cannot remove a later registration with the same name.
      return () => { if (definitions.get(name) === definition) definitions.delete(name); };
    },
    registerSource(prefix, source) {
      if (typeof prefix !== 'string' || !prefix.endsWith('.') || !prefix.trim() || prefix !== prefix.trim() ||
          typeof source?.resolve !== 'function' || typeof source?.list !== 'function') throw new Error('Invalid instruction source');
      if ([...definitions.keys()].some(name => name.startsWith(prefix)) ||
          [...sources.keys()].some(key => key.startsWith(prefix) || prefix.startsWith(key))) throw new Error(`Reserved instruction namespace: ${prefix}`);
      sources.set(prefix, source);
      return () => { if (sources.get(prefix) === source) sources.delete(prefix); };
    },
    async execute(name, args, context = {}) {
      check(validateCall, { name, arguments: args });
      const definition = definitions.get(name) ?? await resolve(name, context);
      if (definition.validator) check(definition.validator, args);
      context.signal?.throwIfAborted();
      const result = await definition.handler(args, context);
      if (definition.toolResult && context.asToolResult) return { instructionResult: true, name, result };
      return result;
    },
  };
  registry.register({
    name: "axiom.describe",
    description: "Get the let_axiom calling instructions for a specified instruction.",
    parameters: describeParameters,
    async handler({ name }, context) {
      return structuredClone((await resolve(name, context)).contract);
    },
  });
  registry.register({
    name: 'axiom.tools',
    description: 'List currently enabled tool/MCP instructions in this session. Use exact names from this paginated directory with ask_axiom, then let_axiom. Disabled or undiscovered operations are not callable.',
    parameters: { type: 'object', properties: {
      query: { type: 'string', maxLength: 200 }, offset: { type: 'integer', minimum: 0 },
      limit: { type: 'integer', minimum: 1, maximum: 50 },
    }, additionalProperties: false },
    async handler({ query = '', offset = 0, limit = 20 }, context) {
      const entries = [];
      for (const [prefix, source] of sources) for (const item of await source.list(context)) {
        if (typeof item.name === 'string' && item.name.startsWith(prefix)) entries.push({ name: item.name, description: String(item.description ?? '').slice(0, 500) });
      }
      const needle = query.toLowerCase();
      const matches = entries.filter(item => `${item.name} ${item.description}`.toLowerCase().includes(needle)).sort((a, b) => a.name.localeCompare(b.name));
      const tools = matches.slice(offset, offset + limit);
      return { tools, total: matches.length, offset, hasMore: offset + tools.length < matches.length,
        ...(offset + tools.length < matches.length ? { nextOffset: offset + tools.length } : {}) };
    },
  });
  for (const prefix of ['tool.', 'mcp.']) registry.registerSource(prefix, {
    resolve: (name, context) => context.dynamicTools?.resolve(name, context),
    list: async context => (await context.dynamicTools?.list(context) ?? []).filter(item => item.name.startsWith(prefix)),
  });
  return registry;
}
