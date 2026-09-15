import test from "node:test";
import assert from "node:assert/strict";
import { createPlayback } from "../public/stream-playback.js";

const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
const boundaries = (text) => {
  const set = new Set([text.length]);
  for (const { index } of segmenter.segment(text)) set.add(index);
  return set;
};

// offset 必须落在当前真实正文的合法字素边界上 => 永远不会显示半个字素/半个代理对。
function assertBoundary(result, text, note) {
  assert.ok(Number.isInteger(result.offset), `${note}: offset 为整数`);
  assert.ok(result.offset >= 0 && result.offset <= text.length, `${note}: offset 越界 ${result.offset}/${text.length}`);
  assert.ok(boundaries(text).has(result.offset), `${note}: offset ${result.offset} 不是字素边界`);
  assert.ok(Number.isInteger(result.pending) && result.pending >= 0, `${note}: pending 非负整数`);
  assert.ok(result.pending <= 200, `${note}: pending 超出尾部上限 ${result.pending}`);
  // 活跃播放不得显示末尾孤立高代理项（不完整代理对）；terminal 走单独断言。
  let cut = text.length;
  while (cut > 0) {
    const c = text.charCodeAt(cut - 1);
    if (c < 0xd800 || c > 0xdbff) break;
    cut--;
  }
  assert.ok(result.offset <= cut, `${note}: 显示了末尾孤立高代理项 ${result.offset} > ${cut}`);
}

test("每秒10字持续输入：缓冲后逐帧平滑推进，而不是每批一次跳变", () => {
  const playback = createPlayback();
  let text = "";
  let prev = 0;
  let maxStep = 0;
  let pendingRose = false;
  let lastPending = 0;
  const seen = new Set();
  for (let t = 0; t <= 4000; t += 50) {
    if (t % 1000 === 0 && t < 3000) text += "abcdefghij";
    const r = playback.update(text, t);
    assertBoundary(r, text, `t=${t}`);
    if (t >= 300) {
      seen.add(r.offset);
      maxStep = Math.max(maxStep, r.offset - prev);
    }
    if (r.pending > lastPending) pendingRose = true;
    lastPending = r.pending;
    prev = r.offset;
  }
  assert.ok(seen.size >= 20, `应逐帧推进出多个不同游标，实际 ${seen.size} 个`);
  assert.ok(maxStep <= 3, `单帧最多推进 3 个字素，实际 ${maxStep}`);
  assert.ok(pendingRose, "新数据到达时 pending 应会上升");
  assert.equal(lastPending, 0, "停止输入后应追平");
  assert.equal(prev, text.length, "追平后 offset 到正文末尾");
});

test("初始缓冲 150ms 内不显示，之后开始推进", () => {
  const playback = createPlayback();
  assert.equal(playback.update("abcdefghij", 0).offset, 0);
  assert.equal(playback.update("abcdefghij", 100).offset, 0, "缓冲期内保持 0");
  assert.equal(playback.update("abcdefghij", 149).offset, 0);
  assert.ok(playback.update("abcdefghij", 250).offset > 0, "缓冲结束后开始显示");
});

test("突发 200 字：加速追赶但每帧有界，无输入后追平", () => {
  const playback = createPlayback();
  const text = "a".repeat(200);
  let prev = 0;
  let maxStep = 0;
  let result;
  for (let t = 0; t <= 4500; t += 50) {
    result = playback.update(text, t);
    assertBoundary(result, text, `t=${t}`);
    maxStep = Math.max(maxStep, result.offset - prev);
    prev = result.offset;
  }
  assert.ok(maxStep <= 26, `单帧最多 250ms*200/s=50，实际 ${maxStep}`);
  assert.equal(result.offset, text.length);
  assert.equal(result.pending, 0);
});

test("超过尾部预算的巨量正文：有界降级为整批对齐，不循环巨量分段", () => {
  const playback = createPlayback();
  const text = "x".repeat(5000);
  const first = playback.update(text, 0);
  assert.equal(first.offset, text.length, "超预算直接对齐");
  assert.equal(first.pending, 0);
  const next = playback.update(text + "y".repeat(10), 50);
  assertBoundary(next, text + "y".repeat(10), "对齐后的小追加");
  assert.equal(next.pending, 10, "整段重分段：只新增 10 字待显示");
});

test("低帧率（1s 一帧）：真时间照常推进，单帧有工作量上限，最终追平", () => {
  const playback = createPlayback();
  const text = "b".repeat(150);
  let prev = 0;
  let maxStep = 0;
  let firstStep = 0;
  let result;
  for (let t = 0; t <= 8000; t += 1000) {
    result = playback.update(text, t);
    assertBoundary(result, text, `t=${t}`);
    if (t === 1000) firstStep = result.offset - prev;
    maxStep = Math.max(maxStep, result.offset - prev);
    prev = result.offset;
  }
  assert.ok(firstStep > 50, `不能只按 clamp 后的 250ms 补步，实际 ${firstStep}`);
  assert.ok(maxStep <= 120, `单帧工作量上限，实际 ${maxStep}`);
  assert.equal(result.pending, 0);
  assert.equal(result.offset, text.length);
});

test("变速与长空窗：游标单调前进，空窗后重新缓冲再推进", () => {
  const playback = createPlayback();
  let text = "慢".repeat(5);
  let prev = 0;
  let result;
  for (let t = 0; t <= 1000; t += 50) result = playback.update(text, t);
  // 慢速段：游标单调
  assert.ok(result.offset >= prev);
  prev = result.offset;
  // 长空窗
  for (let t = 1050; t <= 3000; t += 50) {
    const r = playback.update(text, t);
    assert.ok(r.offset >= prev, "无输入时游标不回退");
    assertBoundary(r, text, `空窗 t=${t}`);
    prev = r.offset;
    result = r;
  }
  assert.equal(result.pending, 0, "空窗内追平");
  // 空窗后又来一大段
  text += "快".repeat(60);
  const after = playback.update(text, 3050);
  assert.ok(after.pending > 0, "新数据重新积压");
  assertBoundary(after, text, "空窗后新批次");
  for (let t = 3100; t <= 6000; t += 50) result = playback.update(text, t);
  assert.equal(result.pending, 0);
  assert.equal(result.offset, text.length);
});

test("跨批代理对/ZWJ/组合字符/旗帜：逐码元追加也不显示半个字素", () => {
  const playback = createPlayback();
  const source = "A\u{1F468}\u200D\u{1F469}\u200D\u{1F467}e\u0301\u{1F1E8}\u{1F1F3}\u{1F3F4}\u{E0067}\u{E0062}\u{E0073}\u{E0063}\u{E0074}\u{E007F}终";
  let text = "";
  let t = 0;
  for (const unit of source.split("")) {
    text += unit;
    for (let f = 0; f < 8; f++, t += 50) {
      const r = playback.update(text, t);
      assertBoundary(r, text, `unit ${JSON.stringify(unit)} t=${t}`);
    }
  }
  let result;
  for (let i = 0; i < 60; i++, t += 50) result = playback.update(text, t);
  assert.equal(result.offset, text.length, "最终完整显示");
  assert.equal(result.pending, 0);
});

test("已显示的尾字素被后续追加扩展：offset 仍是合法边界且不回退", () => {
  const playback = createPlayback();
  let text = "\u{1F468}";
  let result;
  let t = 0;
  for (let i = 0; i < 40; i++, t += 50) result = playback.update(text, t);
  assert.equal(result.offset, text.length, "单个 emoji 已完整显示");
  const before = result.offset;
  text += "\u200D\u{1F469}";
  result = playback.update(text, t);
  assertBoundary(result, text, "扩展后立即");
  assert.ok(result.offset >= before, `不回退也不显示不完整字素，实际 ${result.offset}`);
  for (let i = 0; i < 40; i++, t += 50) result = playback.update(text, t);
  assert.equal(result.offset, text.length, "最终完整显示");
  assert.equal(result.pending, 0);
});

test("替换与 revision：失效旧游标直接对齐，不把新正文当旧文本追加", () => {
  const playback = createPlayback();
  let t = 0;
  let text = "abcdefghij";
  for (; t <= 400; t += 50) playback.update(text, t);
  const replaced = playback.update("XY", t);
  assert.equal(replaced.offset, 2, "非前缀替换直接对齐");
  assert.equal(replaced.pending, 0);
  // revision 变化：即使新正文以前缀延长，也直接对齐
  text = "XY" + "Z".repeat(50);
  const bumped = playback.update(text, t + 50, { revision: 2 });
  assert.equal(bumped.offset, text.length);
  assert.equal(bumped.pending, 0);
  // 显式 align
  const aligned = playback.update(text + "new", t + 100, { revision: 2, align: true });
  assert.equal(aligned.offset, text.length + 3);
  assert.equal(aligned.pending, 0);
});

test("终态直接对齐，有界结束", () => {
  const playback = createPlayback();
  playback.update("abcdefghijklmnop", 0);
  const done = playback.update("abcdefghijklmnop", 50, { terminal: true });
  assert.equal(done.offset, 16);
  assert.equal(done.pending, 0);
});

test("相同正文与 revision 幂等，不重播", () => {
  const playback = createPlayback();
  let result;
  for (let t = 0; t <= 1000; t += 100) result = playback.update("hello world", t, { revision: 1 });
  const again = playback.update("hello world", 1000, { revision: 1 });
  assert.deepEqual(again, result);
});

test("持续输入遇低帧率：真时间追赶，滞后有界，不永远落后", () => {
  const playback = createPlayback();
  let text = "";
  let maxPending = 0;
  let result;
  for (let frame = 0; frame <= 20; frame++) {
    text += "c".repeat(150); // 每秒 150 字到达，超过单帧 120 的工作预算
    result = playback.update(text, frame * 1000);
    assertBoundary(result, text, `frame ${frame}`);
    maxPending = Math.max(maxPending, result.pending);
  }
  assert.ok(maxPending <= 200, `滞后受尾部上限约束，实际 ${maxPending}`);
  for (let t = 21000; t <= 60000 && result.pending > 0; t += 1000) result = playback.update(text, t);
  assert.equal(result.pending, 0, "停止到达后追平");
  assert.equal(result.offset, text.length);
});

test("随机跨批逐码元追加：offset 始终是当前正文的合法字素边界", () => {
  let seed = 20260915;
  const rand = (n) => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) % n);
  const pool = "a中.\u0301\u200D\uD83D\uDC68\uDC69\uDDE8\uDDF3\uDFF4\u{E0067}\u{1F3FB}".split("");
  const playback = createPlayback();
  let text = "";
  let now = 0;
  let result;
  for (let i = 0; i < 400; i++) {
    text += pool[rand(pool.length)];
    now += 10 + rand(300); // 10~310ms 的不规则帧间隔
    result = playback.update(text, now);
    assertBoundary(result, text, `step ${i}`);
  }
  for (let i = 0; i < 200; i++, now += 50) result = playback.update(text, now);
  result = playback.update(text, now, { terminal: true });
  assert.equal(result.offset, text.length, "终态完整显示真实原文");
  assert.equal(result.pending, 0);
});

test("末尾孤立高代理项：活跃播放按住不显示，补齐后才展示 emoji（terminal 保留真实原文）", () => {
  const playback = createPlayback();
  let text = "前\uD83D"; // 半个 emoji：不完整代理对
  let t = 0;
  let result;
  for (; t <= 1200; t += 50) {
    result = playback.update(text, t);
    assertBoundary(result, text, `t=${t}`);
    assert.ok(result.offset < text.length, `不能显示末尾孤立高代理项，实际 ${result.offset}`);
  }
  assert.equal(result.offset, 1, "前面的完整字素正常显示");
  assert.equal(result.pending, 1, "按住的不完整代理对仍算待显示");
  text += "\uDC68"; // 补齐 👨
  for (let i = 0; i < 60; i++, t += 50) result = playback.update(text, t);
  assert.equal(result.offset, text.length, "补齐后展示完整 emoji");
  assert.equal(result.pending, 0);
  // terminal：终态是真实原文，不做代理对 hold
  const raw = "前\uD83D";
  const done = playback.update(raw, t + 50, { terminal: true });
  assert.equal(done.offset, raw.length);
  assert.equal(done.pending, 0);
});

test("长旗帜序列（RI 奇偶）：逐码元追加都停在合法边界且不回退", () => {
  const playback = createPlayback();
  // 5 面完整旗 + 1 个孤立 RI：RI 配对会随奇偶改变边界，尾窗猜测会出错
  const source = "\u{1F1E8}\u{1F1F3}".repeat(5) + "\u{1F1E9}";
  let text = "";
  let t = 0;
  let prev = 0;
  let result;
  for (const unit of source.split("")) {
    text += unit;
    for (let f = 0; f < 4; f++, t += 50) {
      result = playback.update(text, t);
      assertBoundary(result, text, `unit ${JSON.stringify(unit)}`);
      assert.ok(result.offset >= prev, `逐批追加不回退，实际 ${result.offset} < ${prev}`);
      prev = result.offset;
    }
  }
  for (let i = 0; i < 100; i++, t += 50) result = playback.update(text, t);
  assert.equal(result.offset, text.length);
  assert.equal(result.pending, 0);
});

test("MAX_TEXT 阈值（与 markdown.js 同 24000）：不超长就整段分段，超长整批对齐", () => {
  const playback = createPlayback();
  const big = "x".repeat(20000);
  assert.equal(playback.update(big, 0, { align: true }).offset, 20000);
  // 20010 < 24000：仍走整段分段，只新增 10 字待显示（不降级）
  const within = playback.update(big + "y".repeat(10), 50);
  assert.equal(within.pending, 10);
  assert.equal(within.offset, 20000);
  assertBoundary(within, big + "y".repeat(10), "阈值内追加");
  // 超 24000：不再分段，整批对齐
  const over = playback.update(big + "y".repeat(4010), 100);
  assert.equal(over.offset, big.length + 4010);
  assert.equal(over.pending, 0);
});

test("缺少 Intl.Segmenter：安全整批显示，不截断字符", () => {
  const original = Intl.Segmenter;
  const text = "\u{1F468}\u200D\u{1F469}\u200D\u{1F467}abc";
  try {
    Intl.Segmenter = undefined;
    const playback = createPlayback();
    const result = playback.update(text, 0);
    assert.equal(result.offset, text.length);
    assert.equal(result.pending, 0);
    assert.equal(text.slice(0, result.offset), text);
  } finally {
    Intl.Segmenter = original;
  }
});
