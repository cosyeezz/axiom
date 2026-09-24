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
  const registry = {
    register({ name, description, parameters, handler }) {
      if (typeof name !== "string" || !name.trim() || name !== name.trim()) throw new Error("Invalid instruction name");
      if (definitions.has(name)) throw new Error(`Instruction already registered: ${name}`);
      if (typeof description !== "string" || typeof handler !== "function" || !parameters || parameters.type !== "object") {
        throw new Error("Instruction requires description, object parameters schema, and handler");
      }
      // Schemas are supplied by trusted registration code, never by model input.
      // Keep a private snapshot so descriptions and validation cannot drift.
      const contract = structuredClone({ name, description, parameters });
      const validator = Compile(contract.parameters);
      definitions.set(name, { contract, validator, handler });
    },
    async execute(name, args) {
      check(validateCall, { name, arguments: args });
      const definition = definitions.get(name);
      if (!definition) throw new Error(`Unknown instruction: ${name}`);
      check(definition.validator, args);
      return await definition.handler(args);
    },
  };
  registry.register({
    name: "axiom.describe",
    description: "Get the let_axiom calling instructions for a specified instruction.",
    parameters: describeParameters,
    handler({ name }) {
      const definition = definitions.get(name);
      if (!definition) throw new Error(`Unknown instruction: ${name}`);
      return structuredClone(definition.contract);
    },
  });
  return registry;
}
