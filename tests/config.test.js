import test from "node:test";
import assert from "node:assert/strict";
import { Sessions } from "../src/sessions.js";
import { command } from "../src/protocol.js";

test("configuration applies to the main agent and is inherited by delegated children", async () => {
  const selections = [];
  const sessions = new Sessions(async (_tools, selected) => {
    selections.push(selected);
    let config = { model: "a/b", thinking: "off", ...selected, levels: ["off", "high"] };
    return {
      config: () => config,
      configure: async (value) => {
        if (value.model === "unknown/model") throw new Error("Unknown model");
        return (config = { ...config, model: value.model, thinking: value.thinking ?? config.thinking });
      },
      subscribe: () => () => {},
      prompt: async () => {},
      result: () => "ok",
      abort: async () => {},
      dispose: () => {},
    };
  });
  sessions.createAgent.catalog = () => [{ key: "a/b" }, { key: "c/d" }];
  sessions.createAgent.capabilities = async () => ({ skills: [{ id: "s" }], mcp: [{ id: "m" }], plugins: [{ id: "p" }] });
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
    assert.equal(sessions.snapshot(other).config.model, "c/d");
    assert.equal(sessions.snapshot(other).config.thinking, "high");
    await sessions.configure(other, { model: "a/b", thinking: "off" });
    assert.equal(sessions.snapshot(id).config.model, "c/d", "existing sessions stay unchanged");
    await sessions.configure(id, { model: "c/d", subagentModel: "a/b" });
    await assert.rejects(sessions.configure(id, { model: "unknown/model" }), /Unknown model/);
    const newest = await sessions.create();
    assert.equal(sessions.snapshot(newest).config.model, "a/b", "subagent-only changes and failures do not replace defaults");
    assert.equal(sessions.snapshot(newest).config.thinking, "off");
    assert.equal(sessions.snapshot(newest).config.subagentModel, null);

    const all = { model: null, subagentModel: null, capabilities: null, subagentCapabilities: null };
    assert.deepEqual(sessions.getDefaults(), all);
    const defaults = {
      model: "c/d", subagentModel: "a/b",
      capabilities: { skills: ["s"], mcp: [], plugins: ["p"] },
      subagentCapabilities: { skills: [], mcp: ["m"], plugins: [] },
    };
    const callsBeforeSave = selections.length;
    const saved = await sessions.configureDefaults(process.cwd(), defaults);
    assert.deepEqual(saved, defaults);
    assert.equal(selections.length, callsBeforeSave, "saving defaults does not create an agent");
    saved.capabilities.skills.length = 0;
    assert.deepEqual(sessions.getDefaults(), defaults, "returned defaults are isolated");
    const normal = await sessions.create();
    const normalConfig = sessions.snapshot(normal).config;
    assert.equal(normalConfig.model, "c/d");
    assert.equal(normalConfig.subagentModel, "a/b");
    assert.deepEqual(normalConfig.capabilitySelection, defaults.capabilities);
    assert.deepEqual(normalConfig.subagentCapabilities, defaults.subagentCapabilities);
    await sessions.get(normal).tasks.read(sessions.get(normal).tasks.start(["default child"]));
    assert.deepEqual(selections.at(-1).capabilities, defaults.subagentCapabilities);
    assert.equal(selections.at(-1).model, "a/b");
    assert.equal(selections.at(-1).trustProject, false, "defaults never grant project trust");
    assert.equal(sessions.snapshot(newest).config.model, "a/b");
    assert.equal(sessions.snapshot(newest).config.capabilitySelection, null);

    await sessions.configure(newest, { model: "a/b", thinking: "high" });
    assert.deepEqual(sessions.getDefaults(), defaults, "current configuration does not overwrite explicit defaults");
    const custom = await sessions.create(undefined, { useDefaults: false });
    assert.equal(sessions.snapshot(custom).config.model, "a/b", "custom sessions still use the recent model");
    assert.equal(sessions.snapshot(custom).config.subagentModel, null);
    assert.equal(sessions.snapshot(custom).config.capabilitySelection, null);
    assert.equal(sessions.snapshot(custom).config.subagentCapabilities, null);
    const explicit = await sessions.create(undefined, { model: "a/b", subagentModel: null, capabilities: null });
    assert.equal(sessions.snapshot(explicit).config.model, "a/b");
    assert.equal(sessions.snapshot(explicit).config.subagentModel, null);
    assert.equal(sessions.snapshot(explicit).config.capabilitySelection, null, "explicit all overrides custom defaults");
    for (const patch of [
      { model: "unknown/model" }, { subagentModel: "unknown/model" },
      { capabilities: { skills: ["missing"], mcp: [], plugins: [] } },
      { subagentCapabilities: { skills: [], mcp: ["missing"], plugins: [] } },
    ]) {
      await assert.rejects(sessions.configureDefaults(process.cwd(), patch), /Unknown|未知/);
      assert.deepEqual(sessions.getDefaults(), defaults, "failed saves keep previous defaults");
    }
    const catalog = sessions.createAgent.capabilities;
    sessions.createAgent.capabilities = async () => ({ skills: [], mcp: [], plugins: [] });
    const callsBeforeFailure = selections.length;
    await assert.rejects(sessions.create(), /未知/, "unavailable defaults must not expand to all capabilities");
    assert.equal(selections.length, callsBeforeFailure);
    sessions.createAgent.capabilities = catalog;
    await sessions.configureDefaults(undefined, all);
    const reset = await sessions.create();
    assert.equal(sessions.snapshot(reset).config.model, "a/b");
    assert.equal(sessions.snapshot(reset).config.thinking, "high");
    assert.equal(sessions.snapshot(reset).config.capabilitySelection, null);
    assert.deepEqual(sessions.snapshot(normal).config, normalConfig, "changing defaults leaves existing sessions intact");
    assert.equal(command.safeParse({ id: "1", type: "session.defaults.get" }).success, true);
    assert.equal(command.safeParse({ id: "1", type: "session.defaults.configure", ...defaults }).success, true);
    assert.equal(command.safeParse({ id: "1", type: "session.defaults.configure", ...all }).success, true);
    for (const patch of [{ trustProject: true }, { capabilities: {} }, { model: "" }, { subagentModel: 1 }])
      assert.equal(command.safeParse({ id: "1", type: "session.defaults.configure", ...patch }).success, false);
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
