import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readdir, readFile, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  THRESHOLD_BYTES,
  FULL_SENDS,
  createObservation,
  createObservationStats,
  dropRedundantRecallEchoes,
  ensureStored,
  estimateTokens,
  isPureTextResult,
  objectPath,
  observationPackExtension,
  observationRuntime,
  placeholderFor,
  readRecallChunk,
  resolveObservationConfig,
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

// ---------------------------------------------------------------------------
// OP 加固：配置化、回显指针、取回粒度、完整性校验、计数语义、摘要去冗余
// ---------------------------------------------------------------------------

test("config: 默认值可覆盖、非法值抛错、configVersion 随取值变化", () => {
  const base = resolveObservationConfig();
  assert.equal(base.thresholdBytes, THRESHOLD_BYTES);
  assert.equal(base.fullSends, FULL_SENDS);
  assert.equal(base.foldEnabled, true);
  assert.equal(resolveObservationConfig().configVersion, base.configVersion); // 同取值同指纹
  assert.notEqual(resolveObservationConfig({ fullSends: 3 }).configVersion, base.configVersion);
  assert.equal(resolveObservationConfig({ fullSends: 0 }).fullSends, 0); // 0 = 立即折叠
  assert.throws(() => resolveObservationConfig({ thresholdBytes: 10 }), /integer in \[256/);
  assert.throws(() => resolveObservationConfig({ fullSends: -1 }), /integer in \[0, 64\]/);
  assert.throws(() => resolveObservationConfig({ fullSends: 1.5 }), /integer/);
  assert.throws(() => resolveObservationConfig({ recallDefaultBytes: 1 << 20 }), /integer in \[256/);
  assert.ok(Object.isFrozen(base));
});

test("config foldEnabled=false: 不折叠但 obs_recall 仍可用（旧会话占位符不失效）", async () => {
  const root = await mkdtemp(join(tmpdir(), "obs-"));
  try {
    // 先用开启折叠的扩展把原文归档下来，模拟“旧会话留下的占位符 + 归档”。
    const warm = fakePi();
    observationPackExtension(root, null, {})(warm);
    const text = bigText(9000);
    const messages = [toolResult(text, "t1"), assistant(), assistant()];
    await project(warm, messages);

    const pi = fakePi();
    const stats = createObservationStats();
    observationPackExtension(root, stats, { foldEnabled: false })(pi);
    const handler = pi.handlers.get("context");
    assert.equal(await handler({ messages }), undefined, "关闭折叠后 context 钩子不改写投影");
    assert.ok(pi.tools.get("obs_recall"), "obs_recall 仍然注册");

    const id = createObservation(toolResult(text, "t1"), root).id;
    const recalled = await pi.tools.get("obs_recall").execute("c1", { id });
    assert.ok(recalled.content[0].text.includes(text.slice(0, 40)), "仍能取回原文");
    assert.equal(stats.recalls, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("recall echo: 折叠成指回原对象的指针，不新建归档对象（消除递归折叠）", async () => {
  const root = await mkdtemp(join(tmpdir(), "obs-"));
  try {
    const pi = fakePi();
    const stats = createObservationStats();
    observationPackExtension(root, stats, {})(pi);

    const original = createObservation(toolResult(bigText(30000), "t1"), root);
    await ensureStored(original);
    const page = await pi.tools.get("obs_recall").execute("c1", { id: original.id, limit: 8 * 1024 });
    const echoText = page.content[0].text;
    assert.ok(Buffer.byteLength(echoText, "utf8") > THRESHOLD_BYTES, "回显本身超过阈值，旧实现会再折一层");

    const objectsBefore = await readdir(join(root, "objects"));
    const messages = [toolResult(echoText, "recall-call", "obs_recall"), assistant(), assistant()];
    const projected = await project(pi, messages);
    const folded = projected[0].content[0].text;
    assert.match(folded, /^\[recall view of obs_[a-f0-9]{24} bytes \d+\.\.\d+ dropped from context/);
    assert.match(folded, new RegExp(`re-read: call obs_recall with \\{"id":"${original.id}"`));
    assert.ok(Buffer.byteLength(folded, "utf8") < 512, "指针远小于回显原文");
    assert.deepEqual((await readdir(join(root, "objects"))).sort(), objectsBefore.sort(), "没有新建归档对象");
    assert.equal(stats.echoFolds, 1);
    assert.equal(stats.foldedIds.size, 0, "回显不计入折叠对象数");

    const ledger = (await readFile(join(root, "ledger.jsonl"), "utf8")).trim().split("\n").map((l) => JSON.parse(l));
    const echoEvent = ledger.find((e) => e.event === "fold-echo");
    assert.equal(echoEvent.id, original.id);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("recall 粒度: limit 默认小于硬上限，startLine/lineLimit 与 query 只取需要的部分", async () => {
  const root = await mkdtemp(join(tmpdir(), "obs-"));
  try {
    const pi = fakePi();
    observationPackExtension(root, createObservationStats(), {})(pi);
    const recall = pi.tools.get("obs_recall");
    const lines = Array.from({ length: 400 }, (_, i) => `line ${i}: ${"x".repeat(40)}${i === 250 ? " NEEDLE-HERE" : ""}`);
    const observation = createObservation(toolResult(lines.join("\n"), "t1"), root);
    await ensureStored(observation);

    const first = await recall.execute("c1", { id: observation.id });
    assert.match(first.content[0].text, /^\[obs_recall id=obs_[a-f0-9]{24} offset=0 next_offset=\d+ eof=false/);
    assert.ok(first.details.bytes <= 4 * 1024, "默认页小于 16KiB 硬上限");

    const byLine = await recall.execute("c2", { id: observation.id, startLine: 100, lineLimit: 3 });
    const bodyLines = byLine.content[0].text.split("\n").slice(2).filter((l) => l.length > 0);
    assert.match(byLine.content[0].text, /mode=lines start_line=100 next_line=103/);
    assert.equal(bodyLines.length, 3);
    assert.ok(bodyLines[0].includes("line 99:"), "startLine 是 1-based");

    const found = await recall.execute("c3", { id: observation.id, query: "needle-here", contextLines: 1 });
    assert.match(found.content[0].text, /mode=query matches=1/);
    assert.ok(found.content[0].text.includes("NEEDLE-HERE"), "大小写不敏感命中");
    assert.ok(found.details.bytes < 500, "检索只回命中行与上下文");

    await assert.rejects(() => recall.execute("c4", { id: observation.id, query: "" }), /non-empty string/);
    await assert.rejects(() => recall.execute("c5", { id: observation.id, startLine: 0 }), /1-based/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("完整性: manifest 校验等长篡改被拒、无 manifest 宽松放行/严格拒绝", async () => {
  const root = await mkdtemp(join(tmpdir(), "obs-"));
  try {
    const observation = createObservation(toolResult(bigText(9000), "t1"), root);
    await ensureStored(observation);
    const manifest = JSON.parse(await readFile(join(root, "objects", `${observation.id}.json`), "utf8"));
    assert.equal(manifest.contentHash, observation.contentHash);
    assert.equal(manifest.bytes, observation.bytes);

    const lenient = fakePi();
    observationPackExtension(root, createObservationStats(), {})(lenient);
    const ok = await lenient.tools.get("obs_recall").execute("c1", { id: observation.id });
    assert.match(ok.content[0].text, /integrity=verified/);

    // 等长篡改：size 检查看不出来，只有全文哈希能发现。
    await writeFile(join(root, "objects", `${observation.id}.txt`), "X".repeat(observation.bytes));
    const tampered = fakePi();
    const tamperedStats = createObservationStats();
    observationPackExtension(root, tamperedStats, {})(tampered);
    await assert.rejects(
      () => tampered.tools.get("obs_recall").execute("c2", { id: observation.id }),
      /content hash does not match/,
    );
    assert.equal(tamperedStats.recallFailures, 1, "取回失败计入统计");
    const ledger = (await readFile(join(root, "ledger.jsonl"), "utf8")).trim().split("\n").map((l) => JSON.parse(l));
    assert.ok(ledger.some((e) => e.event === "recall-failed"), "取回失败记账");

    // 旧归档没有 manifest：宽松放行记 unverified，严格模式拒绝。
    const legacy = createObservation(toolResult(bigText(9100), "t2"), root);
    await ensureStored(legacy);
    await rm(join(root, "objects", `${legacy.id}.json`));
    const relaxed = fakePi();
    observationPackExtension(root, createObservationStats(), {})(relaxed);
    const unverified = await relaxed.tools.get("obs_recall").execute("c3", { id: legacy.id });
    assert.match(unverified.content[0].text, /integrity=unverified/);
    const strict = fakePi();
    observationPackExtension(root, createObservationStats(), { strictVerify: true })(strict);
    await assert.rejects(() => strict.tools.get("obs_recall").execute("c4", { id: legacy.id }), /no manifest/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("UTF-8: 起点落在多字节字符中间时前移到边界并如实回报 offset", async () => {
  const root = await mkdtemp(join(tmpdir(), "obs-"));
  try {
    const text = "汉字内容".repeat(2000); // 每字 3 字节
    const observation = createObservation(toolResult(text, "t1"), root);
    await ensureStored(observation);
    const chunk = await readRecallChunk(objectPath(root, observation.id), 1, { maxBytes: 300, maxLines: 400 });
    assert.equal(chunk.offset, 3, "起点前移到下一个字符首字节");
    assert.ok(chunk.text.startsWith("字内容"), "开头没有替换字符");
    assert.ok(!chunk.text.includes("\ufffd"));
    assert.equal(chunk.bytes % 3, 0, "尾部也按字符边界截断");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("空摘录兜底: 单行超预算时 placeholder 仍带头尾摘录", () => {
  const observation = createObservation(toolResult("Z".repeat(12015), "t1"), "/tmp/unused");
  const parts = placeholderFor(observation).split("\n");
  const head = parts[parts.findIndex((l) => l.startsWith("[first complete lines")) + 1];
  const tail = parts[parts.findIndex((l) => l.startsWith("[middle omitted")) + 1];
  assert.ok(head.length > 0, "头部摘录非空");
  assert.ok(tail.length > 0, "尾部摘录非空");
  assert.ok(observation.text.startsWith(head));
  assert.ok(observation.text.endsWith(tail));
});

test("计数纯推导: 同一批消息重复投影结果逐字节一致（取消/重试不虚增年龄）", async () => {
  const root = await mkdtemp(join(tmpdir(), "obs-"));
  try {
    const pi = fakePi();
    observationPackExtension(root, createObservationStats(), {})(pi);
    const young = [toolResult(bigText(9000), "t1"), assistant()]; // 只经历 1 次请求
    assert.equal((await project(pi, young))[0].content[0].text, young[0].content[0].text, "未到 fullSends 不折叠");
    for (let i = 0; i < 3; i += 1) {
      const again = await project(pi, young);
      assert.equal(again[0].content[0].text, young[0].content[0].text, "重复投影不会把年龄累加上去");
    }
    const old = [toolResult(bigText(9000), "t1"), assistant(), assistant()];
    const first = await project(pi, old);
    const second = await project(pi, old);
    assert.ok(first[0].content[0].text.startsWith("[large tool result replaced"));
    assert.equal(first[0].content[0].text, second[0].content[0].text, "占位符逐字节稳定");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("归档时机: 未折叠的候选不写盘，首次折叠才落档", async () => {
  const root = await mkdtemp(join(tmpdir(), "obs-"));
  try {
    const pi = fakePi();
    observationPackExtension(root, createObservationStats(), {})(pi);
    const text = bigText(9000);
    await project(pi, [toolResult(text, "t1"), assistant()]);
    assert.deepEqual(await readdir(join(root, "objects")).catch(() => []), [], "全文投影阶段不写盘");
    await project(pi, [toolResult(text, "t1"), assistant(), assistant()]);
    const id = createObservation(toolResult(text, "t1"), root).id;
    assert.ok((await readdir(join(root, "objects"))).includes(`${id}.txt`), "折叠时才归档");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("ledger 归因: 恢复场景（sends 已远超阈值）不漏记 fold，projection 事件带缓存失效起点", async () => {
  const root = await mkdtemp(join(tmpdir(), "obs-"));
  try {
    const pi = fakePi();
    observationPackExtension(root, createObservationStats(), { agentId: "task-7" })(pi);
    // 从历史恢复：该结果之后已有 5 条 assistant，旧实现只在 sends === FULL_SENDS 时记账，会整段漏记。
    const messages = [toolResult(bigText(9000), "t1"), assistant(), assistant(), assistant(), assistant(), assistant()];
    await project(pi, messages);
    const ledger = (await readFile(join(root, "ledger.jsonl"), "utf8")).trim().split("\n").map((l) => JSON.parse(l));
    const fold = ledger.find((e) => e.event === "fold");
    assert.ok(fold, "恢复场景仍记 fold");
    assert.equal(fold.sends, 5);
    assert.equal(fold.agentId, "task-7", "ledger 带 agentId，主子代理可区分");
    assert.ok(fold.runId && fold.configVersion && fold.contentHash);
    const projection = ledger.find((e) => e.event === "projection");
    assert.equal(projection.foldBatch, 1);
    assert.equal(projection.earliestFoldIndex, 0, "最早折叠位置 = 前缀缓存最早失效点");
    assert.equal(projection.seq, fold.seq, "fold 与 projection 共享投影序号");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("provider-response: 只与真折过东西的投影配对，空投影不写 ledger", async () => {
  const root = await mkdtemp(join(tmpdir(), "obs-"));
  try {
    const pi = fakePi();
    observationPackExtension(root, createObservationStats(), {})(pi);
    const responded = pi.handlers.get("after_provider_response");
    assert.ok(responded, "监听了供应商响应");

    // 未折叠的投影：只构造过投影，ledger 不应出现任何条目。
    await project(pi, [toolResult(bigText(9000), "t1"), assistant()]);
    await responded({ status: 200 });
    assert.equal(await readFile(join(root, "ledger.jsonl"), "utf8").catch(() => ""), "");

    await project(pi, [toolResult(bigText(9000), "t1"), assistant(), assistant()]);
    await responded({ status: 200 });
    await responded({ status: 200 }); // 同一投影的重复响应不重复记账
    const entries = (await readFile(join(root, "ledger.jsonl"), "utf8")).trim().split("\n").map((l) => JSON.parse(l));
    const responses = entries.filter((e) => e.event === "provider-response");
    assert.equal(responses.length, 1);
    assert.equal(responses[0].status, 200);
    assert.equal(responses[0].seq, entries.find((e) => e.event === "projection").seq, "与投影序号配对");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("dropRedundantRecallEchoes: 同批既有原文又有其回显时丢回显，找不到原文则保留", () => {
  const root = "/tmp/unused";
  const source = toolResult(bigText(9000), "t1");
  const id = createObservation(source, root).id;
  const echo = toolResult(`[obs_recall id=${id} offset=0 next_offset=4096 eof=false]\n${bigText(7000)}`, "r1", "obs_recall");
  const other = toolResult(`[obs_recall id=obs_${"a".repeat(24)} offset=0 next_offset=10 eof=true]\n${bigText(7000)}`, "r2", "obs_recall");

  const withSource = dropRedundantRecallEchoes([source, assistant(), echo]);
  assert.equal(withSource.length, 2);
  assert.ok(!withSource.includes(echo), "原文在同批 → 回显是纯冗余");
  assert.ok(withSource.includes(source));

  const withoutSource = dropRedundantRecallEchoes([assistant(), echo]);
  assert.equal(withoutSource.length, 2, "找不到原文 → 回显可能是唯一副本，必须保留");
  assert.equal(dropRedundantRecallEchoes([source, other]).length, 2, "指向别的对象的回显不受影响");
  assert.deepEqual(dropRedundantRecallEchoes([]), []);
  const small = [toolResult("tiny"), assistant()];
  assert.equal(dropRedundantRecallEchoes(small), small, "无可丢弃项时原样返回");
});
