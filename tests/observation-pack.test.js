import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  THRESHOLD_BYTES,
  FULL_SENDS,
  createObservation,
  createObservationStats,
  ensureStored,
  estimateTokens,
  isPureTextResult,
  objectPath,
  observationPackExtension,
  observationRuntime,
  placeholderFor,
  readRecallChunk,
} from "../src/observation-pack.js";

// 生成大于阈值的多行文本：行长度可预测，方便断言摘录与分页边界。
function bigText(targetBytes) {
  const lines = [];
  const line = "0123456789".repeat(10) + " tail"; // 46 字节/行
  while (lines.length * 47 < targetBytes) lines.push(`${lines.length}: ${line}`);
  return lines.join("\n");
}

function toolResult(text, toolCallId = "t1", toolName = "bash") {
  return { role: "toolResult", toolCallId, toolName, content: [{ type: "text", text }], isError: false };
}

function assistant() {
  return { role: "assistant", content: [{ type: "text", text: "ok" }] };
}

function fakePi() {
  const handlers = new Map();
  const tools = new Map();
  return {
    on: (name, handler) => handlers.set(name, handler),
    registerTool: (tool) => tools.set(tool.name, tool),
    handlers,
    tools,
  };
}

async function project(extensionPi, messages) {
  const handler = extensionPi.handlers.get("context");
  assert.ok(handler, "context handler registered");
  return (await handler({ messages })).messages;
}

test("observation identity: below threshold skipped, id deterministic and content-addressed", () => {
  const root = "/tmp/unused";
  assert.equal(createObservation(toolResult("small"), root), undefined);
  assert.equal(createObservation(toolResult("x".repeat(THRESHOLD_BYTES)), root), undefined);
  assert.equal(createObservation(toolResult("x".repeat(THRESHOLD_BYTES + 1)), root).id,
    createObservation(toolResult("x".repeat(THRESHOLD_BYTES + 1)), root).id);
  const a = createObservation(toolResult(bigText(9000), "t1"), root);
  const b = createObservation(toolResult(bigText(9000), "t2"), root);
  const c = createObservation(toolResult(bigText(10000), "t1"), root);
  assert.match(a.id, /^obs_[a-f0-9]{24}$/u);
  assert.equal(a.id, createObservation(toolResult(bigText(9000), "t1"), root).id);
  assert.notEqual(a.id, b.id); // toolCallId 参与寻址
  assert.notEqual(a.id, c.id); // 内容参与寻址
});

test("archive: O_EXCL 创建 + 复用校验 + 篡改拒用", async () => {
  const root = await mkdtemp(join(tmpdir(), "obs-"));
  try {
    const observation = createObservation(toolResult(bigText(9000)), root);
    await ensureStored(observation);
    const stored = await readFile(objectPath(root, observation.id), "utf8");
    assert.equal(stored, observation.text);
    await ensureStored(observation); // 幂等复用
    await writeFile(objectPath(root, observation.id), "X".repeat(observation.bytes)); // 等长篡改 → 落入哈希校验
    await assert.rejects(() => ensureStored(observation), /mismatch/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("placeholder: 字节级稳定、含取回指引、体积远小于原文", () => {
  const observation = createObservation(toolResult(bigText(20000)), "unused");
  const first = placeholderFor(observation);
  assert.equal(first, placeholderFor(observation)); // 纯函数 → 前缀缓存逐字节稳定
  assert.ok(first.includes(`id: ${observation.id}`));
  assert.ok(first.includes("tool: bash"));
  assert.ok(first.includes(`original_bytes: ${observation.bytes}`));
  assert.ok(first.includes(`retrieve: call obs_recall with {"id":"${observation.id}","offset":0}`));
  assert.ok(first.startsWith(`[large tool result replaced after its first ${FULL_SENDS} provider requests]`));
  assert.ok(first.includes("[middle omitted; last complete lines, up to 512 bytes]"));
  assert.ok(Buffer.byteLength(first, "utf8") < observation.bytes / 3);
});

test("recall paging: 分页拼接与原文逐字节一致，页界符合限制", async () => {
  const root = await mkdtemp(join(tmpdir(), "obs-"));
  try {
    const text = bigText(50000);
    const observation = createObservation(toolResult(text), root);
    await ensureStored(observation);
    const limits = { maxBytes: 4096, maxLines: 400 };
    let offset = 0;
    const pages = [];
    while (true) {
      const chunk = await readRecallChunk(objectPath(root, observation.id), offset, limits);
      assert.ok(chunk.bytes <= limits.maxBytes);
      assert.ok(chunk.lines <= limits.maxLines);
      pages.push(chunk.text);
      if (chunk.eof) break;
      offset = chunk.nextOffset;
      assert.ok(offset <= observation.bytes);
    }
    assert.equal(pages.join(""), text); // 取回即原文
    await assert.rejects(() => readRecallChunk(objectPath(root, observation.id), observation.bytes + 1, limits), /exceeds observation size/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("context projection: 前两次全文，之后折叠；不改写原消息；原文归档", async () => {
  const root = await mkdtemp(join(tmpdir(), "obs-"));
  try {
    const stats = createObservationStats();
    const pi = fakePi();
    observationPackExtension(root, stats)(pi);
    const original = toolResult(bigText(9000));
    const before = JSON.stringify(original);

    // R1：工具结果首次入上下文（尚无后续 assistant）；R2：一条 assistant；前两次全文。
    let messages = [{ role: "user", content: [{ type: "text", text: "go" }] }, original];
    let projected = await project(pi, messages);
    assert.equal(projected[1].content[0].text, original.content[0].text); // 第 1 次全文

    messages = [...messages, assistant()];
    projected = await project(pi, messages);
    assert.equal(projected[1].content[0].text, original.content[0].text); // 第 2 次全文

    messages = [...messages, assistant()];
    projected = await project(pi, messages);
    assert.ok(projected[1].content[0].text.startsWith("[large tool result replaced"));
    assert.equal(projected[1].content[0].text, (await project(pi, messages))[1].content[0].text); // 折叠后仍稳定
    assert.equal(JSON.stringify(original), before); // 原消息未被改写
    assert.equal(await readFile(objectPath(root, createObservation(original, root).id), "utf8"), original.content[0].text);
    assert.equal(stats.foldedIds.size, 1);
    assert.ok(stats.savedTokens > 0);
    assert.equal(stats.failures, 0);
    assert.deepEqual(observationRuntime(stats).folded, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("restart seeding: 无内存状态，靠历史 assistant 计数立即折叠", async () => {
  const root = await mkdtemp(join(tmpdir(), "obs-"));
  try {
    const pi = fakePi();
    observationPackExtension(root, null)(pi); // 全新实例（等价重启后）
    const messages = [{ role: "user", content: [{ type: "text", text: "go" }] }, toolResult(bigText(12000)), assistant(), assistant()];
    const projected = await project(pi, messages);
    assert.ok(projected[1].content[0].text.startsWith("[large tool result replaced"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("obs_recall: 首页带 header 与 next_offset；未知 id/坏 offset 报错", async () => {
  const root = await mkdtemp(join(tmpdir(), "obs-"));
  try {
    const pi = fakePi();
    observationPackExtension(root, null)(pi);
    const recall = pi.tools.get("obs_recall");
    assert.ok(recall, "obs_recall registered");

    const original = toolResult(bigText(12000));
    const observation = createObservation(original, root);
    await ensureStored(observation);
    const first = await recall.execute("call-1", { id: observation.id });
    assert.ok(first.content[0].text.startsWith(`[obs_recall id=${observation.id} offset=0 next_offset=`));
    assert.ok(first.details.nextOffset > 0);
    assert.ok(first.content[0].text.includes("0: 0123456789")); // 首页即原文开头

    const second = await recall.execute("call-2", { id: observation.id, offset: first.details.nextOffset });
    assert.ok(second.details.eof || second.details.nextOffset > first.details.nextOffset);

    await assert.rejects(() => recall.execute("call-3", { id: "not-an-id" }), /Unknown observation id/);
    await assert.rejects(() => recall.execute("call-4", { id: observation.id, offset: 1e9 }), /exceeds observation size/);
    await assert.rejects(() => recall.execute("call-5", { id: observation.id, offset: "0" }), /non-negative integer/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("fail-open: 归档写入失败时原文照发，失败计数与 ledger 记录", async () => {
  const root = await mkdtemp(join(tmpdir(), "obs-"));
  try {
    const sabotage = join(root, "objects");
    await mkdir(root, { recursive: true });
    await writeFile(sabotage, "not a directory"); // objects 路径被文件占据
    const stats = createObservationStats();
    const pi = fakePi();
    observationPackExtension(root, stats)(pi);
    const original = toolResult(bigText(12000));
    const messages = [{ role: "user", content: [{ type: "text", text: "go" }] }, original, assistant(), assistant()];
    const projected = await project(pi, messages);
    assert.equal(projected[1].content[0].text, original.content[0].text); // fail-open：原文照发
    assert.equal(stats.failures, 1);
    assert.equal(stats.foldedIds.size, 0);
    const ledger = (await readFile(join(root, "ledger.jsonl"), "utf8")).trim().split("\n").map((line) => JSON.parse(line));
    assert.equal(ledger.at(-1).event, "fail-open");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("ledger: 只记状态转换（fold/recall），可解析", async () => {
  const root = await mkdtemp(join(tmpdir(), "obs-"));
  try {
    const pi = fakePi();
    observationPackExtension(root, null)(pi);
    const messages = [{ role: "user", content: [{ type: "text", text: "go" }] }, toolResult(bigText(12000)), assistant(), assistant()];
    await project(pi, messages);
    await project(pi, messages); // 重复投影不重复记账
    const recall = pi.tools.get("obs_recall");
    const id = createObservation(messages[1], root).id;
    await recall.execute("call-1", { id });
    const entries = (await readFile(join(root, "ledger.jsonl"), "utf8")).trim().split("\n").map((line) => JSON.parse(line));
    assert.equal(entries.filter((e) => e.event === "fold").length, 1); // 每个观察只记一次首次折叠
    assert.equal(entries.filter((e) => e.event === "recall").length, 1);
    const fold = entries.find((e) => e.event === "fold");
    assert.equal(fold.id, id);
    assert.equal(fold.tool, "bash");
    assert.ok(fold.originalTokens === estimateTokens(messages[1].content[0].text));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("boundary: 错误结果与图片块不参与折叠", () => {
  assert.equal(isPureTextResult({ role: "user", content: [{ type: "text", text: "hi" }] }), false);
  assert.equal(isPureTextResult({ role: "toolResult", isError: true, content: [{ type: "text", text: "err" }] }), false);
  assert.equal(isPureTextResult({ role: "toolResult", content: [{ type: "image", url: "x" }] }), false);
  assert.equal(isPureTextResult({ role: "toolResult", content: [] }), false);
  assert.ok(isPureTextResult(toolResult("small"))); // 尺寸过滤在 createObservation
});
