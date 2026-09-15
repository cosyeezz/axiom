import test from "node:test";
import assert from "node:assert/strict";
import { Sessions } from "../src/sessions.js";
import { command, compactionDefaults } from "../src/protocol.js";
import { agentRuntime } from "../src/pi.js";

test("runtime snapshots use actual agent state, survive disposal and stay out of model tool results", async () => {
  const sessions = new Sessions(async () => {
    const state = {
      model: { provider: "test", id: "model" }, thinkingLevel: "off", systemPrompt: "Initial prompt",
      messages: [], getContextUsage: () => ({ tokens: null, contextWindow: 10000, percent: null }),
    };
    let listener;
    return {
      config: () => ({ model: "test/model", thinking: state.thinkingLevel, levels: ["off", "high"] }),
      runtime: () => agentRuntime(state),
      subscribe: (fn) => { listener = fn; return () => {}; },
      configure: async () => { state.thinkingLevel = "high"; return { model: "test/model", thinking: "high" }; },
      prompt: async () => {
        state.systemPrompt = "Prompt changed by an extension";
        state.messages.push({ role: "assistant", usage: { input: 100, cacheRead: 800, cacheWrite: 100 } });
        state.getContextUsage = () => ({ tokens: 1200, contextWindow: 10000, percent: 12 });
        listener({ type: "agent.runtime", data: agentRuntime(state) });
      },
      result: () => "done", abort: async () => {},
      dispose: () => { state.systemPrompt = "Disposed"; },
    };
  });
  const id = await sessions.create();
  try {
    const initial = sessions.snapshot(id).runtime;
    assert.equal(initial.usage, null);
    assert.equal(initial.context.tokens, null);
    assert.equal(initial.systemPrompt, "Initial prompt");
    const configured = await sessions.configure(id, { model: "test/model" });
    assert.equal(configured.runtime.thinking, "high");
    const events = [];
    sessions.subscribe(id, (event) => events.push(event));
    sessions.prompt(id, "test");
    await sessions.get(id).work;
    const current = sessions.snapshot(id).runtime;
    assert.equal(current.systemPrompt, "Prompt changed by an extension");
    assert.equal(current.usage.cacheRead, 800);
    assert.equal(current.context.percent, 12);
    assert(events.some((event) => event.type === "agent.runtime" && event.agentId === "main"));
    const tasks = sessions.get(id).tasks;
    const ids = tasks.start(["child"]);
    await Promise.all(ids.map((taskId) => tasks.jobs.get(taskId).done));
    const result = tasks.read(ids[0], tasks.jobs.get(ids[0]).resultId);
    assert.equal(result.text, "done");
    assert.equal(Object.hasOwn(result, "runtime"), false, "read_result must not feed system prompts back into the parent's context");
    const [child] = sessions.snapshot(id).tasks;
    assert.equal(child.runtime.systemPrompt, current.systemPrompt, "preserve final prompt before disposing");
    assert.equal(child.runtime.context.percent, 12);
    assert(events.some((event) => event.type === "agent.runtime" && event.taskId === ids[0]));
    assert.equal(events.findLast((event) => event.type === "task.state").data.runtime.usage.cacheRead, 800);
    child.runtime.usage.cacheRead = 0;
    assert.equal(sessions.snapshot(id).tasks[0].runtime.usage.cacheRead, 800, "snapshot is isolated");
  } finally {
    await sessions.close();
  }
});

test("configuration applies to the main agent and is inherited by delegated children", async () => {
  const selections = [];
  const sessions = new Sessions(async (_tools, selected) => {
    selections.push(selected);
    const { memory, executionContext, shouldPause, ...configuration } = selected;
    let config = { model: "a/b", thinking: "off", ...configuration, levels: ["off", "high"] };
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
    const tasks = sessions.get(id).tasks;
    await Promise.all(tasks.start(["test"]).map((taskId) => tasks.jobs.get(taskId).done));
    assert.equal(selections[1].model, "c/d");
    assert.equal(selections[1].thinking, "high");
    await sessions.configure(id, { model: "c/d", subagentModel: "a/b" });
    assert.equal(sessions.snapshot(id).config.subagentModel, "a/b");
    await Promise.all(sessions.get(id).tasks.start(["override"])
      .map((taskId) => sessions.get(id).tasks.jobs.get(taskId).done));
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
    await Promise.all(sessions.get(id).tasks.start(["inherit"])
      .map((taskId) => sessions.get(id).tasks.jobs.get(taskId).done));
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

    const all = { compaction: { ...compactionDefaults }, retry: null, queueType: "steer", model: null, subagentModel: null, thinking: null, subagentThinking: null, capabilities: { skills: [], mcp: [], plugins: [] }, subagentCapabilities: { skills: [], mcp: [], plugins: [] } };
    assert.deepEqual(sessions.getDefaults(), all);
    const defaults = {
      compaction: { ...compactionDefaults },
      retry: { retryable: ["429"], nonRetryable: ["billing"] },
      queueType: "steer", model: "c/d", subagentModel: "a/b", thinking: null, subagentThinking: null,
      capabilities: { skills: ["s"], mcp: [], plugins: ["p"] },
      subagentCapabilities: { skills: [], mcp: ["m"], plugins: [] },
    };
    const callsBeforeSave = selections.length;
    const saved = await sessions.configureDefaults(process.cwd(), defaults);
    assert.deepEqual(saved, defaults);
    assert.equal(selections.length, callsBeforeSave, "saving defaults does not create an agent");
    saved.capabilities.skills.length = 0;
    assert.deepEqual(await sessions.workspaceDefaults(process.cwd()), defaults, "returned defaults are isolated");
    const normal = await sessions.create();
    const normalConfig = sessions.snapshot(normal).config;
    assert.equal(normalConfig.model, "c/d");
    assert.equal(normalConfig.subagentModel, "a/b");
    assert.deepEqual(normalConfig.capabilitySelection, defaults.capabilities);
    assert.deepEqual(normalConfig.subagentCapabilities, defaults.subagentCapabilities);
    await Promise.all(sessions.get(normal).tasks.start(["default child"])
      .map((taskId) => sessions.get(normal).tasks.jobs.get(taskId).done));
    assert.deepEqual(selections.at(-1).capabilities, defaults.subagentCapabilities);
    assert.equal(selections.at(-1).model, "a/b");
    assert.equal(selections.at(-1).trustProject, false, "defaults never grant project trust");
    assert.equal(sessions.snapshot(newest).config.model, "a/b");
    assert.deepEqual(sessions.snapshot(newest).config.capabilitySelection, all.capabilities);

    await sessions.configure(newest, { model: "a/b", thinking: "high" });
    assert.deepEqual(await sessions.workspaceDefaults(process.cwd()), defaults, "current configuration does not overwrite explicit defaults");
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
      assert.deepEqual(await sessions.workspaceDefaults(process.cwd()), defaults, "failed saves keep previous defaults");
    }
    const catalog = sessions.createAgent.capabilities;
    sessions.createAgent.capabilities = async () => ({ skills: [], mcp: [], plugins: [] });
    const withoutAvailable = await sessions.create();
    const empty = { skills: [], mcp: [], plugins: [] };
    assert.deepEqual(sessions.snapshot(withoutAvailable).config.capabilitySelection, empty);
    assert.deepEqual(sessions.snapshot(withoutAvailable).config.subagentCapabilities, empty);
    assert.deepEqual(await sessions.workspaceDefaults(process.cwd()), defaults, "capability filtering must not rewrite this workspace's defaults");
    await assert.rejects(sessions.create(undefined, { capabilities: defaults.capabilities }), /未知/);
    sessions.createAgent.capabilities = catalog;
    // 全局兜底：先删掉本目录的独立配置，再把整份配置写进全局（只写补丁的话模型会落到该目录的最近模型）。
    await sessions.deleteDefaults(process.cwd());
    await sessions.configureDefaults(undefined, defaults);
    await sessions.configureDefaults(undefined, { thinking: "high", subagentThinking: "off", subagentCapabilities: "inherit", subagentModel: null });
    assert.equal(sessions.getDefaults().thinking, "high");
    const following = await sessions.create();
    assert.equal(sessions.snapshot(following).config.thinking, "high");
    assert.equal(sessions.snapshot(following).config.subagentCapabilities, "inherit");
    await Promise.all(sessions.get(following).tasks.start(["follow main"])
      .map((taskId) => sessions.get(following).tasks.jobs.get(taskId).done));
    assert.equal(selections.at(-1).model, "c/d");
    assert.equal(selections.at(-1).thinking, "off");
    assert.deepEqual(selections.at(-1).capabilities, defaults.capabilities);
    assert.equal(command.safeParse({ id: "follow", type: "session.defaults.configure", subagentCapabilities: "inherit", thinking: "high", subagentThinking: "off" }).success, true);
    assert.equal(command.safeParse({ id: "invalid", type: "session.defaults.configure", subagentThinking: "invalid" }).success, false);
    await sessions.configureDefaults(undefined, all);
    const reset = await sessions.create();
    assert.equal(sessions.snapshot(reset).config.model, "a/b");
    assert.equal(sessions.snapshot(reset).config.thinking, "high");
    assert.deepEqual(sessions.snapshot(reset).config.capabilitySelection, all.capabilities);
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
    await sessions.configure(id, { model: "a/b" });
    assert.equal(sessions.get(id).status, "running", "model changes must not mark a running session idle");
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

test("session.configure persists subagentThinking: nullable optional, isolated from main, null inherits", async () => {
  const selections = [];
  const sessions = new Sessions(async (_tools, selected) => {
    selections.push(selected);
    const { memory, executionContext, shouldPause, ...configuration } = selected;
    let config = { model: "a/b", thinking: "off", ...configuration, levels: ["off", "high", "xhigh"] };
    return {
      config: () => config,
      configure: async (value) => {
        return (config = {
          ...config,
          ...(value.model ? { model: value.model } : {}),
          ...(value.thinking ? { thinking: value.thinking } : {}),
        });
      },
      subscribe: () => () => {},
      prompt: async () => {},
      result: () => "ok",
      abort: async () => {},
      dispose: () => {},
    };
  });
  sessions.createAgent.catalog = () => [{ key: "a/b" }, { key: "c/d" }];
  sessions.createAgent.capabilities = async () => ({ skills: [], mcp: [], plugins: [] });
  const id = await sessions.create();
  try {
    // 把主代理 thinking 调到 high，作为后续继承的基线。
    await sessions.configure(id, { model: "c/d", thinking: "high" });
    assert.equal(sessions.snapshot(id).config.thinking, "high");
    assert.equal(sessions.snapshot(id).config.subagentThinking, null);

    // 子代理思考等级独立配置：返回值与 snapshot 都落库，主代理 thinking 不变。
    const updated = await sessions.configure(id, { model: "c/d", subagentModel: "a/b", subagentThinking: "xhigh" });
    assert.equal(updated.subagentThinking, "xhigh");
    assert.equal(sessions.snapshot(id).config.subagentThinking, "xhigh");
    assert.equal(sessions.snapshot(id).config.thinking, "high", "main agent thinking must stay untouched");
    assert.equal(updated.thinking, "high", "configure return must not echo subagent thinking onto main");

    // 新委派使用子代理思考等级，不被主代理 high 覆盖。
    const tasks = sessions.get(id).tasks;
    await Promise.all(tasks.start(["override"]).map((taskId) => tasks.jobs.get(taskId).done));
    const childSelection = selections.at(-1);
    assert.equal(childSelection.model, "a/b", "subagent stays on the unchanged subagentModel");
    assert.equal(childSelection.thinking, "xhigh", "new delegation uses the configured subagentThinking");

    // null = 跟随主代理：新委派继承主 thinking。
    await sessions.configure(id, { model: "c/d", subagentModel: null, subagentThinking: null });
    assert.equal(sessions.snapshot(id).config.subagentThinking, null);
    await Promise.all(tasks.start(["inherit"]).map((taskId) => tasks.jobs.get(taskId).done));
    const inheritSelection = selections.at(-1);
    assert.equal(inheritSelection.thinking, "high", "null falls through to main agent thinking");

    // 缺省 = 保持现状：省略字段不会清空已配置值（与 subagentModel 对称）。
    await sessions.configure(id, { model: "c/d", subagentThinking: "xhigh" });
    await sessions.configure(id, { model: "c/d" });
    assert.equal(sessions.snapshot(id).config.subagentThinking, "xhigh", "omitted subagentThinking keeps prior value");
    assert.equal(sessions.snapshot(id).config.subagentModel, null, "omitted subagentModel keeps prior null");

    // 协议层接受 nullable optional 且拒绝非法值。
    for (const value of [null, "off", "high", "xhigh"]) {
      assert.equal(command.safeParse({
        id: "1", type: "session.configure", sessionId: id, model: "c/d", subagentThinking: value,
      }).success, true);
    }
    assert.equal(command.safeParse({
      id: "1", type: "session.configure", sessionId: id, model: "c/d", subagentThinking: "invalid",
    }).success, false);
    assert.equal(command.safeParse({
      id: "1", type: "session.configure", sessionId: id, model: "c/d",
    }).success, true, "subagentThinking optional");
  } finally {
    await sessions.close();
  }
});
