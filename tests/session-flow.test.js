import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readdir, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
    await restored.remove(id);
    const [workspace] = await readdir(storage);
    assert.deepEqual(await readdir(join(storage, workspace)), []);
  } finally { await rm(root, { recursive: true, force: true }); }
});
