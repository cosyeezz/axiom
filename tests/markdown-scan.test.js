// markdown-scan 增量掩码：流式热路径（prepareStream 每帧）的 maskCode 增量版。
// 正确性口径 = 与全量 maskCode 逐字节等值：行级状态前向固化、行内配对不跨「有结束换行的
// 空白行」；无换行的末行与哨兵行不是段边界，配对可跨它们延伸到下一帧的新内容。
import { test } from "node:test";
import assert from "node:assert/strict";
import { maskCode, maskCodeCached, createMaskCache } from "../public/markdown-scan.js";

const B = String.fromCharCode(96);

function randomPiece() {
  const pieces = [
    "aaa", B.repeat(3) + "js", "const x=1;", B.repeat(3), "~~~", "    indented",
    B + "unclosed", B + "ok" + B + " code", B + "a" + B + B + "b" + B, "",
    "  spaced", "<axiom_display>", B.repeat(5), "tab\tline", "x " + B + B + " y " + B + B + " z",
    "fence close", "    code after blank", "c\r\n", "\r", " \t ", "\u0001",
  ];
  return pieces[Math.floor(Math.random() * pieces.length)];
}

test("增量掩码与全量逐字节等值：随机 append 序列 + 退化帧", () => {
  for (let trial = 0; trial < 2000; trial++) {
    let text = "";
    const cache = createMaskCache();
    const steps = 1 + Math.floor(Math.random() * 30);
    for (let s = 0; s < steps; s++) {
      const piece = randomPiece();
      const cut = Math.floor(Math.random() * (piece.length + 1));
      text += piece.slice(0, cut) + piece.slice(cut) + (Math.random() < 0.3 ? "\n" : "");
      // 偶发收缩替换：走 startsWith 失败的全量重算路径
      if (Math.random() < 0.05) text = text.slice(0, Math.floor(text.length / 2)) + "CHANGED";
      assert.equal(maskCodeCached(text, cache), maskCode(text), `trial ${trial} step ${s}: ${JSON.stringify(text)}`);
    }
  }
});

test("增量掩码与全量逐字节等值：全字符谱逐字符增长", () => {
  for (let trial = 0; trial < 200; trial++) {
    let text = "";
    const cache = createMaskCache();
    const alphabet = B + B + B + "~` \t\n<a>-_=.abc019\r";
    const steps = 1 + Math.floor(Math.random() * 60);
    for (let s = 0; s < steps; s++) {
      text += alphabet[Math.floor(Math.random() * alphabet.length)];
      assert.equal(maskCodeCached(text, cache), maskCode(text), `trial ${trial} step ${s}: ${JSON.stringify(text)}`);
    }
  }
});

test("边界语义：哨兵行与无换行末行不是段边界，配对可跨到后续帧", () => {
  const cache = createMaskCache();
  // "`a\n" 的末行空串是哨兵不是空行；下一帧闭合跨行配对。
  assert.equal(maskCodeCached("`a\n", cache), maskCode("`a\n"));
  assert.equal(maskCodeCached("`a\n`", cache), maskCode("`a\n`"));
  // 配对生效：两行同时被掩码。
  assert.ok(maskCodeCached("`a\n`", cache).startsWith(B.repeat(0) || "\u0001"));
  // 无换行的末空白行同样不是边界。
  const cache2 = createMaskCache();
  maskCodeCached("x `a\n \t ", cache2);
  assert.equal(maskCodeCached("x `a\n \t `b", cache2), maskCode("x `a\n \t `b"));
});

test("等值输入直接返回缓存结果（零成本早退）", () => {
  const cache = createMaskCache();
  const first = maskCodeCached("aaa\n```js\ncode\n```", cache);
  assert.equal(maskCodeCached("aaa\n```js\ncode\n```", cache), first);
});

test("增量掩码的扫描成本随增量而非全文增长", () => {
  // 长流式文本（多段），逐 delta append；统计 scanLines 实际处理的字符量。
  // 借助一个代理计数：直接测 maskCodeCached 在长文本追加 1 字符时的耗时增长曲线，
  // 对比 maskCode 全量（应为线性）。此处用「尾段长度」作可观测代理：
  // 已固化 head 应覆盖绝大多数前缀。
  let text = "";
  const cache = createMaskCache();
  for (let round = 0; round < 200; round++) {
    text += `段落 ${round}：${"内容".repeat(20)}\n${B}code${B} 代码\n\n`;
  }
  maskCodeCached(text, cache);
  // 每个空行边界之后的内容构成 tail；确认 head 已吸收全部历史段。
  assert.ok(cache.head.length > text.length * 0.9, `head 应吸收绝大多数前缀（实际 ${(cache.head.length / text.length).toFixed(2)}）`);
  // 追加 1 字符：只重扫末行 + 末段。
  const before = cache.head.length + cache.tail.join("\n").length;
  maskCodeCached(text + "字", cache);
  const after = cache.head.length + cache.tail.join("\n").length;
  assert.equal(after, before + 1);
  assert.ok(cache.tail.join("\n").length < text.length, "尾段必须远小于全文");
});
