import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readdir, mkdir, writeFile, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { Sessions } from "../src/sessions.js";

test("sessions persist across shutdown, queue by type, switch models while running, and delete on disk", async () => {
  const root = await mkdtemp(join(tmpdir(), "axiom-flow-"));
  const storage = join(root, "sessions");
  const factory = async (_, selection) => {
    let model = selection.model || "test/one", listener, finish;
    const queue = { steering: [], followUp: [] };
    return {
      config: () => ({ model, thinking: "off", levels: ["off"] }),
      configure: async (next) => { model = next.model; return { model }; },
      subscribe: (fn) => { listener = fn; return () => {}; },
      prompt: (text) => { listener({ type: "agent.message.end", data: { message: { role: "user", content: text } } }); return new Promise((resolve) => { finish = resolve; }); },
      enqueue: async (text, type) => { queue[type === "steer" ? "steering" : "followUp"].push(text); },
      queue: () => queue,
      withdraw: () => { const old = structuredClone(queue); queue.steering = []; queue.followUp = []; return old; },
      abort: async () => { finish?.(); }, result: () => "ok", dispose: async () => {},
    };
  };
  factory.catalog = () => [{ key: "test/one" }, { key: "test/two" }];
  try {
    const first = new Sessions(factory, undefined, storage);
    const id = await first.create(root);
    await mkdir(join(root, "src"));
    await mkdir(join(root, ".git"));
    await writeFile(join(root, "src", "hello.txt"), "hello");
    assert.equal((await first.browse(id)).entries.some((entry) => entry.name === ".git"), false);
    assert.deepEqual((await first.browse(id, "src")).entries, [{ name: "hello.txt", directory: false, path: "src/hello.txt" }]);
    await assert.rejects(first.browse(id, ".."), /只能浏览当前工作空间/);
    await assert.rejects(first.browse(id, "missing"));
    await first.prompt(id, "hello");
    await first.configure(id, { model: "test/two", queueType: "followUp" });
    assert.equal(first.get(id).status, "running");
    await first.prompt(id, "later");
    await first.prompt(id, "now", "steer");
    assert.deepEqual(first.snapshot(id).queue, { steering: ["now"], followUp: ["later"] });
    assert.deepEqual(first.get(id).agent.withdraw(), { steering: ["now"], followUp: ["later"] });
    assert.deepEqual(first.snapshot(id).queue, { steering: [], followUp: [] });
    first.get(id).emit({ type: "agent.retry", agentId: "main", data: { id: "retry-1", status: "waiting", attempt: 1, delayMs: 96000, error: "429" } });
    first.get(id).emit({ type: "agent.retry", agentId: "child", data: { id: "retry-1", status: "succeeded", attempt: 2 } });
    assert.equal(first.snapshot(id).retries.length, 2, "main and child retries are isolated");
    await first.rename(id, "saved name");
    await first.close();
    const restored = new Sessions(factory, undefined, storage);
    await restored.load();
    const state = restored.snapshot(id);
    assert.equal(state.title, "saved name");
    assert.equal(state.config.model, "test/two");
    assert.equal(state.config.queueType, "followUp");
    assert.equal(state.messages[0].message.content, "hello");
    assert.equal(state.status, "idle");
    assert.equal(state.retries[0].status, "cancelled");
    assert.equal(state.retries[0].history[0].delayMs, 96000);
    assert.equal(state.retries[1].status, "succeeded");
    await restored.remove(id);
    const [workspace] = await readdir(storage);
    assert.deepEqual(await readdir(join(storage, workspace)), []);
  } finally { await rm(root, { recursive: true, force: true }); }
});

const flowFactory = async () => ({
  config: () => ({ model: "test/one", thinking: "off" }),
  subscribe: () => () => {}, prompt: async () => {}, enqueue: async () => {},
  queue: () => ({ steering: [], followUp: [] }), withdraw: () => ({}),
  abort: async () => {}, result: () => "ok", dispose: async () => {},
});
flowFactory.catalog = () => [{ key: "test/one" }];

// 会话模式 files.browse：相对路径、工作空间边界、保留原有过滤、分页与导航字段。
test("files.browse session mode stays inside the workspace and pages filtered entries", async () => {
  const root = await mkdtemp(join(tmpdir(), "axiom-files-"));
  const storage = join(root, "sessions");
  try {
    const sessions = new Sessions(flowFactory, undefined, storage);
    const id = await sessions.create(root);
    await mkdir(join(root, "src"));
    await mkdir(join(root, ".git"));
    await Promise.all(Array.from({ length: 205 }, (_, i) =>
      writeFile(join(root, "src", `file-${String(i).padStart(3, "0")}.txt`), "x")));
    await symlink(join(root, ".git"), join(root, "src", "linked")).catch(() => {});

    // 根目录：相对路径、无父级、面包屑与快速位置指向工作空间，原有过滤保留。
    const rootListing = await sessions.listFiles({ sessionId: id });
    assert.equal(rootListing.path, "");
    assert.equal(rootListing.parent, null);
    assert.equal(rootListing.nextOffset, null);
    assert.deepEqual(rootListing.breadcrumbs, [{ name: basename(root), path: "" }]);
    assert.deepEqual(rootListing.locations, [{ name: basename(root), path: "" }]);
    assert.equal(rootListing.entries.some((entry) => entry.name === ".git"), false);
    assert.equal(rootListing.entries[0].directory, true, "目录应排在文件前");

    // 子目录导航：parent 回链、面包屑逐级可回放。
    const src = await sessions.listFiles({ sessionId: id, path: "src" });
    assert.equal(src.path, "src");
    assert.equal(src.parent, "");
    assert.deepEqual(src.breadcrumbs, [
      { name: basename(root), path: "" },
      { name: "src", path: "src" },
    ]);
    assert.equal(src.entries.some((entry) => entry.name === "linked"), false, "符号链接应跳过");

    // 分页：每页 200，nextOffset 续页；大小写不敏感过滤后再分页。
    assert.equal(src.entries.length, 200);
    assert.equal(src.nextOffset, 200);
    const page2 = await sessions.listFiles({ sessionId: id, path: "src", offset: 200 });
    assert.equal(page2.entries.length, 5);
    assert.equal(page2.nextOffset, null);
    assert.deepEqual(page2.entries.at(-1).path, "src/file-204.txt");
    const filtered = await sessions.listFiles({ sessionId: id, path: "src", query: "FILE-01", offset: 5 });
    assert.equal(filtered.entries.length, 5);
    assert.equal(filtered.nextOffset, null);

    // directoriesOnly 只返回目录（storage 目录也是工作空间成员）。
    const dirs = await sessions.listFiles({ sessionId: id, directoriesOnly: true });
    assert.deepEqual(dirs.entries.map((entry) => entry.name).sort(), ["sessions", "src"]);

    // 边界：越界绝对路径与相对上跳都被拒绝。
    await assert.rejects(sessions.listFiles({ sessionId: id, path: ".." }), /只能浏览当前工作空间/);
    await assert.rejects(sessions.listFiles({ sessionId: id, path: join(root, "..") }), /只能浏览当前工作空间/);
    await assert.rejects(sessions.listFiles({ sessionId: id, path: "missing" }), /目录不存在/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
