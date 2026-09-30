import { Compile } from "typebox/compile";
import { createInstructions, describeParameters, executeParameters } from "./instructions.js";

export function instructionTools(instructions = createInstructions(), dynamicTools) {
  // AgentTool.execute cannot set the SDK error flag. Keep the exact returned
  // object in a WeakSet, then restore its flag through the public result hook.
  const failures = new WeakSet();
  const tools = [
    {
      name: "ask_axiom", description: "Get the let_axiom calling instructions for a specified instruction.",
      parameters: describeParameters,
      run: ({ name }, context) => instructions.execute("axiom.describe", { name }, context),
    },
    {
      name: "let_axiom", description: "Execute a specific instruction.",
      parameters: executeParameters,
      run: ({ name, arguments: args }, context) => instructions.execute(name, args, context),
    },
  ].map(({ name, description, parameters, run }) => {
    const validator = Compile(parameters);
    return {
      name, label: name, description, parameters: structuredClone(parameters),
      ...(name === 'let_axiom' ? { executionMode: 'sequential' } : {}),
      async execute(toolCallId, args, signal, onUpdate, ctx) {
        if (!validator.Check(args)) throw new Error(`Invalid tool arguments: ${JSON.stringify(validator.Errors(args))}`);
        signal?.throwIfAborted();
        const result = await run(args, { toolCallId, signal, onUpdate, ctx, dynamicTools, asToolResult: true });
        if (result?.instructionResult) {
          const output = { ...result.result, details: { ...result.result.details, axiomInstruction: result.name } };
          if (output.isError) failures.add(output);
          return output;
        }
        return { content: [{ type: "text", text: JSON.stringify(result ?? null) }], details: result ?? null };
      },
    };
  });
  tools.bindResultHook = agent => {
    const after = agent.afterToolCall;
    agent.afterToolCall = async (context, signal) => {
      const isError = failures.has(context.result) ? true : context.isError;
      const patch = await after?.({ ...context, isError }, signal);
      return { isError, ...patch };
    };
  };
  return tools;
}
