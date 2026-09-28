import { Compile } from "typebox/compile";
import { createInstructions, describeParameters, executeParameters } from "./instructions.js";

export function instructionTools(instructions = createInstructions()) {
  return [
    {
      name: "ask_axiom", description: "Get the let_axiom calling instructions for a specified instruction.",
      parameters: describeParameters,
      run: ({ name }) => instructions.execute("axiom.describe", { name }),
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
      async execute(toolCallId, args, signal, onUpdate, ctx) {
        if (!validator.Check(args)) throw new Error(`Invalid tool arguments: ${JSON.stringify(validator.Errors(args))}`);
        signal?.throwIfAborted();
        const result = await run(args, { toolCallId, signal, onUpdate, ctx, asToolResult: true });
        if (result?.instructionResult) {
          const output = result.result;
          if (output.isError) throw new Error(output.content.filter(b => b.type === 'text').map(b => b.text).join('\n'));
          return { ...output, details: { ...output.details, axiomInstruction: result.name } };
        }
        return { content: [{ type: "text", text: JSON.stringify(result ?? null) }], details: result ?? null };
      },
    };
  });
}
