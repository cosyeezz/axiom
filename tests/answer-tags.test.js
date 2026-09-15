import test from "node:test";
import assert from "node:assert/strict";
import { splitAnswer } from "../public/answer-tags.js";

const open = "<axiom_display>", close = "</axiom_display>";
test("answer separates progress without mutating source", () => {
  const source = `检查中\n${open}\n**完成**\n${close}\n补充`;
  assert.deepEqual(splitAnswer(source), { found: true, answer: "**完成**", process: "检查中\n\n补充", incomplete: false, malformed: false });
});
test("streaming tag prefixes never flash; interrupted answer survives", () => {
  for (let i = 1; i < open.length; i++) assert.equal(splitAnswer(open.slice(0, i), { streaming: true }).answer, "");
  for (let i = 1; i < close.length; i++) assert.equal(splitAnswer(`${open}\n答复\n${close.slice(0, i)}`, { streaming: true }).answer, "答复");
  assert.equal(splitAnswer(`${open}\n答复`).answer, "答复");
  assert.equal(splitAnswer(`${open}\n答复`).incomplete, true);
  assert.equal(splitAnswer(open.slice(0, -2)).answer, open.slice(0, -2));
});
test("code fences, inline code and ordinary examples are not protocol", () => {
  for (const text of [`\`\`\`xml\n${open}\n例子\n${close}\n\`\`\``, `~~~~\n${open}\n例子\n${close}\n~~~~`, `\`${open}\``, `例子 ${open}正文${close}`, `\`\n${open}\n${close}\n\``]) {
    assert.equal(splitAnswer(text).found, false);
    assert.equal(splitAnswer(text).answer, text);
  }
});
test("A-T2 缩进代码块里的标记是例子；0-3 空格缩进仍算协议", () => {
  const sample = `    ${open}\n    例子\n    ${close}`;
  assert.equal(splitAnswer(sample).found, false);
  assert.equal(splitAnswer(sample).answer, sample);
  assert.deepEqual(splitAnswer(`检查中\n\n  ${open}\n答\n  ${close}`), { found: true, answer: "答", process: "检查中", incomplete: false, malformed: false });
});
test("A-T1 落单反引号不跨行配对，协议标记照旧生效", () => {
  const source = `进度 \` 未配对\n${open}\n**完成**\n${close}`;
  assert.deepEqual(splitAnswer(source), { found: true, answer: "**完成**", process: "进度 ` 未配对", incomplete: false, malformed: false });
});
test("A-T3 legacy 与畸形标记回退时丢协议不丢正文，裸标记不进展示文本", () => {
  assert.deepEqual(splitAnswer("旧回答"), { found: false, answer: "旧回答", process: "", incomplete: false, malformed: false });
  for (const [text, expected] of [
    [close, ""],
    [`${open}\n${open}\n内容\n${close}`, "内容"],
    [`${open}\n${close}`, ""],
    [`${open}\na\n${close}\n${open}\nb\n${close}`, "a\nb"],
  ]) {
    const result = splitAnswer(text);
    assert.equal(result.found, false);
    assert.equal(result.malformed, true);
    assert.equal(result.answer, expected);
    assert.ok(!result.answer.includes(open) && !result.answer.includes(close));
  }
});

test("old answer tags are ordinary text, including during streaming", () => {
  const source = "<axiom_answer>\n正文\n</axiom_answer>";
  for (const streaming of [false, true]) {
    assert.deepEqual(splitAnswer(source, { streaming }), { found: false, answer: source, process: "", incomplete: false, malformed: false });
    assert.equal(splitAnswer("<axiom_ans", { streaming }).answer, "<axiom_ans");
  }
});
