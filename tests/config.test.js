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
  sessions.createAgent.catalog = () => [{ key: "a/b" }, { key: "c/d" }];
  const id = await sessions.create();
  try {
    await sessions.configure(id, { model: "c/d", thinking: "high" });
    const ids = sessions.get(id).tasks.start(["test"]);
    await sessions.get(id).tasks.read(ids);
    assert.equal(selections[1].model, "c/d");
    assert.equal(selections[1].thinking, "high");
    await sessions.configure(id, { model: "c/d", subagentModel: "a/b" });
    assert.equal(sessions.snapshot(id).config.subagentModel, "a/b");
    await sessions.get(id).tasks.read(sessions.get(id).tasks.start(["override"]));
    assert.equal(selections[2].model, "a/b");
    assert.equal(selections[2].cwd, selections[1].cwd);
    await sessions.configure(id, { model: "c/d" });
    assert.equal(sessions.snapshot(id).config.subagentModel, "a/b");
    await assert.rejects(
      sessions.configure(id, { model: "a/b", subagentModel: "unknown/model" }),
      /Unknown subagent model/,
    );
    assert.equal(sessions.snapshot(id).config.model, "c/d");
    assert.equal(sessions.snapshot(id).config.subagentModel, "a/b");
    await sessions.configure(id, { model: "c/d", subagentModel: null });
    await sessions.get(id).tasks.read(sessions.get(id).tasks.start(["inherit"]));
    assert.equal(selections[3].model, "c/d");
    const other = await sessions.create();
    assert.equal(sessions.snapshot(other).config.subagentModel, null);
    for (const subagentModel of [null, "a/b", "", 123]) {
      assert.equal(command.safeParse({
        id: "1", type: "session.configure", sessionId: id,
        model: "c/d", subagentModel,
      }).success, subagentModel === null || subagentModel === "a/b");
    }
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
