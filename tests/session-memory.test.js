import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Sessions } from "../src/sessions.js";
import { memoryHooks } from "../src/session-memory.js";

const reply = (text) => ({ role: "assistant", stopReason: "stop", content: [{ type: "text", text }] });

test("policy：主代理 null，子代理按 item.taskBudget 定死（缺省回默认，非法建会话即失败）", () => {
  const main = memoryHooks({ emit: () => {} }, () => {});
  assert.equal(main.role, "main");
  assert.equal(main.policy, null);
  const item = { taskBudget: { maxTurns: 50, wrapUpWindow: 5 }, emit: () => {} };
  const child = memoryHooks(item, () => {}, { id: "child", status: "running" });
  assert.equal(child.role, "subagent");
  assert.deepEqual(child.policy, { maxTurns: 50, wrapUpWindow: 5, wrapUpAt: 45, workSeconds: 600, wrapUpSeconds: 180, summarySeconds: 60 });
  // 无配置回默认：20 轮、窗口 2
  const fresh = memoryHooks({ emit: () => {} }, () => {}, { id: "child", status: "running" });
  assert.deepEqual(fresh.policy, { maxTurns: 20, wrapUpWindow: 2, wrapUpAt: 18, workSeconds: 600, wrapUpSeconds: 180, summarySeconds: 60 });
  // 非法配置直接报错（早于任何模型请求）
  assert.throws(() => memoryHooks({ taskBudget: { maxTurns: 1 }, emit: () => {} }, () => {}, { id: "c", status: "running" }), /须为 3-200 的整数/);
  assert.throws(() => memoryHooks({ taskBudget: { maxTurns: 20, wrapUpWindow: 99 }, emit: () => {} }, () => {}, { id: "c", status: "running" }), /须为 1-10 的整数/);
});

test("onReply 只提取主代理标题，save 只落 {title:true}；子代理、失败回复与已定标题都不动", () => {
  const events = [];
  const item = { title: "新会话", titlePending: true, emit: (event) => events.push(event) };
  const saves = [];
  const main = memoryHooks(item, (change) => saves.push(change));
  // 旧摘要标签（axiom_summary/summary/progress）不再提取
  main.onReply({ message: reply("<title>新标题</title><summary>结论</summary><progress>进度</progress>") });
  assert.equal(item.title, "新标题");
  assert.equal(item.titlePending, false);
  assert.deepEqual(saves, [{ title: true }]);
  assert.deepEqual(events, [{ type: "session.title", data: { title: "新标题" } }]);
  // 无标题无 save
  main.onReply({ message: reply("无标签") });
  assert.equal(saves.length, 1);
  // 子代理永不改标题、不 save
  const child = memoryHooks(item, (change) => saves.push(change), { id: "child", status: "running" });
  child.onReply({ message: reply("<title>子标题</title>") });
  assert.equal(item.title, "新标题");
  assert.equal(saves.length, 1);
});

test("invalid, missing and failed model reports do not change the title", () => {
  const item = { title: "临时标题", titlePending: true, emit: () => {} };
  const hooks = memoryHooks(item, () => {});
  for (const text of ["无标签", "<title>一二三四五六七八九十十一</title>", "<title>未闭合"]) hooks.onReply({ message: reply(text), turn: 1 });
  hooks.onReply({ message: { ...reply("<title>失败输出</title>"), stopReason: "error" }, turn: 1 });
  assert.equal(item.title, "临时标题");
  hooks.onReply({ message: reply("<title>合法标题</title>"), turn: 2 });
  hooks.onReply({ message: reply("<title>不能覆盖</title>"), turn: 3 });
  assert.equal(item.title, "合法标题");
  item.titleManual = true;
  item.titlePending = true;
  hooks.onReply({ message: reply("<title>仍不能覆盖</title>"), turn: 4 });
  assert.equal(item.title, "合法标题");
});

test("首轮未自报不固化：兑底标题剥占位符，下一条消息重新索要，自报后定案；旧坏会话重启自愈", async () => {
  const root = await mkdtemp(join(tmpdir(), "axiom-memory-retry-"));
  let reportTitle = false;
  const agents = [];
  const factory = async (tools, selection) => {
    const agent = {
      selection, calls: [], config: () => ({ model: "test/model" }),
      subscribe: () => () => {}, result: () => "done", dispose: async () => {}, abort: async () => {},
      async prompt(text) {
        this.calls.push({ text, wantsTitle: selection.memory.wantsTitle() });
        // 首轮不输出标签（复现首轮直接委派漏掉 <title> 行）；此后按开关自报
        if (reportTitle) selection.memory.onReply({ message: reply("<title>补报标题</title>") });
      },
    };
    agents.push(agent);
    return agent;
  };
  factory.catalog = () => [{ key: "test/model" }];
  const sessions = new Sessions(factory, undefined, join(root, "storage"));
  let restored;
  try {
    const id = await sessions.create(root);
    await sessions.prompt(id, "[image1] 查一下ASCII图的渲染逻辑和相关历史提交");
    sessions.get(id).emit({ type: "agent.message.end", data: { entryId: "u1", message: { role: "user", content: "查一下" } } });
    await sessions.get(id).work;
    // 首轮没自报：兑底标题落库且剥掉 [image1] 占位符，titleRequested 不固化
    assert.equal(sessions.get(id).title, "查一下ASCII图的渲染逻辑和相关历史提交".slice(0, 60));
    assert.equal(sessions.store.getSession(id).titleRequested, false, "未自报不得固化索要标记");
    reportTitle = true;
    await sessions.prompt(id, "继续查");
    await sessions.get(id).work;
    assert.equal(agents[0].calls[1].wantsTitle, true, "未定案时下一条消息必须重新索要");
    assert.equal(sessions.get(id).title, "补报标题");
    assert.equal(sessions.store.getSession(id).titleRequested, true, "自报成功即定案");
    // 复刻旧机制固化的坏会话：把 titleRequested 写回 true、标题换回超长兑底，重启后靠长度识别自愈
    const broken = sessions.get(id);
    broken.titleRequested = true;
    broken.title = "查一下ASCII图的渲染逻辑和相关历史提交".slice(0, 60);
    await sessions.persist(broken);
    await sessions.close();
    restored = new Sessions(factory, undefined, join(root, "storage"));
    await restored.load();
    await restored.prompt(id, "重启后继续");
    await restored.get(id).work;
    assert.equal(agents[1].calls[0].wantsTitle, true, "旧坏会话恢复后必须重新索要标题");
    assert.equal(restored.get(id).title, "补报标题");
  } finally {
    await restored?.close();
    await sessions.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("first prompt title only, manual title wins, records persist across restart", async () => {
  const root = await mkdtemp(join(tmpdir(), "axiom-memory-"));
  const agents = [];
  const factory = async (tools, selection) => {
    const agent = {
      selection, calls: [], config: () => ({ model: "test/model" }),
      subscribe: () => () => {}, result: () => "done", dispose: async () => {}, abort: async () => {},
      async prompt(text, options) {
        this.calls.push({ text, options, wantsTitle: selection.memory.wantsTitle() });
        selection.memory.onReply({ message: reply("<title>轮次预算</title>") });
      },
    };
    agents.push(agent);
    return agent;
  };
  factory.catalog = () => [{ key: "test/model" }];
  // 库随 storage 目录旁自建（dirname(storagePath)/axiom.db）：用 root/storage 让库落在各测试
  // 独占的 Temp root 内，避免落到公共 Temp 目录互串。
  const sessions = new Sessions(factory, undefined, join(root, "storage"));
  let restored;
  try {
    const id = await sessions.create(root);
    await sessions.prompt(id, "实现预算");
    sessions.get(id).emit({ type: "agent.message.end", data: { entryId: "u1", message: { role: "user", content: "实现预算" } } });
    await sessions.get(id).work;
    assert.equal(agents[0].calls[0].text, "实现预算");
    assert.equal(agents[0].calls[0].wantsTitle, true, "首条消息必须索要标题");
    assert.equal(sessions.get(id).title, "轮次预算");
    await sessions.rename(id, "手动命名");
    await sessions.prompt(id, "继续");
    await sessions.get(id).work;
    assert.equal(agents[0].calls[1].wantsTitle, false, "手动命名后不再索要");
    assert.equal(sessions.get(id).title, "手动命名");
    // 管理数据在共享 SQLite 库（不再写磁盘 JSON 快照）。
    const disk = sessions.store.getSession(id);
    assert.equal(disk.titleManual, true);
    await sessions.close();
    restored = new Sessions(factory, undefined, join(root, "storage"));
    await restored.load();
    await restored.ensureLoaded(id);
    assert.equal(restored.get(id).title, "手动命名");
    assert.equal(restored.get(id).titleManual, true);
  } finally {
    await restored?.close();
    await sessions.close();
    await rm(root, { recursive: true, force: true });
  }
});
