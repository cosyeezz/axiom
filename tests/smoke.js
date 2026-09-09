import assert from "node:assert/strict";
import { createPiFactory } from "../src/pi.js";
import { Sessions } from "../src/sessions.js";

const sessions = new Sessions(
  await createPiFactory({ cwd: process.cwd(), model: process.env.AXIOM_MODEL }),
);
try {
  const id = await sessions.create();
  sessions.prompt(
    id,
    'Call delegate exactly once with two tasks: "Reply with AXIOM_A only; do not use tools" and "Reply with AXIOM_B only; do not use tools". Then call read_result with both task IDs and wait=true. Finally summarize both replies. Do not read or change files.',
  );
  await sessions.get(id).work;
  const tasks = sessions.get(id).tasks.snapshot();
  assert.equal(tasks.length, 2);
  assert(
    tasks.every((task) => task.status === "completed"),
    JSON.stringify(tasks),
  );
  assert(tasks.some((task) => task.text.includes("AXIOM_A")));
  assert(tasks.some((task) => task.text.includes("AXIOM_B")));
  console.log(
    "PASS: main agent -> delegate -> two subagents -> read_result -> summary",
  );
} finally {
  await sessions.close();
}
