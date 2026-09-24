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
      run: ({ name, arguments: args }) => instructions.execute(name, args),
    },
  ].map(({ name, description, parameters, run }) => {
    const validator = Compile(parameters);
    return {
      name, label: name, description, parameters: structuredClone(parameters),
      async execute(_id, args) {
        if (!validator.Check(args)) throw new Error(`Invalid tool arguments: ${JSON.stringify(validator.Errors(args))}`);
        const result = await run(args);
        return { content: [{ type: "text", text: JSON.stringify(result ?? null) }], details: result ?? null };
      },
    };
  });
}
