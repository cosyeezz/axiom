import test from "node:test";
import assert from "node:assert/strict";
import { Sessions } from "../src/sessions.js";
import { command } from "../src/protocol.js";

test("configuration applies to the main agent and is inherited by delegated children", async () => {
  const selections = [];
  const sessions = new Sessions(async (_tools, selected) => {
    selections.push(selected);
    let config = { model: "a/b", thinking: "off", levels: ["off", "high"] };
    return {
      config: () => config,
      configure: async (value) => (config = { ...config, ...value }),
      subscribe: () => () => {},
      prompt: async () => {},
      result: () => "ok",
      abort: async () => {},
      dispose: () => {},
    };
  });
  const id = await sessions.create();
  try {
    await sessions.configure(id, { model: "c/d", thinking: "high" });
    const ids = sessions.get(id).tasks.start(["test"]);
    await sessions.get(id).tasks.read(ids);
    assert.equal(selections[1].model, "c/d");
    assert.equal(selections[1].thinking, "high");
    sessions.get(id).status = "running";
    await assert.rejects(sessions.configure(id, { model: "a/b" }), /busy/);
    assert.equal(
      command.safeParse({
        id: "1",
        type: "session.configure",
        sessionId: id,
        model: "a/b",
        thinking: "invalid",
      }).success,
      false,
    );
  } finally {
    await sessions.close();
  }
});
