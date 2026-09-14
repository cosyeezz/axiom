import test from "node:test";
import assert from "node:assert/strict";
import { splitAnswer } from "../public/answer-tags.js";

const open = "<axiom_answer>", close = "</axiom_answer>";
test("answer separates progress without mutating source", () => {
  const source = `检查中\n${open}\n**完成**\n${close}\n补充`;
  assert.deepEqual(splitAnswer(source), { found: true, answer: "**完成**", process: "检查中\n\n补充", incomplete: false, malformed: false });
});
test("streaming tag prefixes never flash; interrupted answer survives", () => {
  for (let i = 1; i < open.length; i++) assert.equal(splitAnswer(open.slice(0, i), { streaming: true }).answer, "");
  for (let i = 1; i < close.length; i++) assert.equal(splitAnswer(`${open}\n答复\n${close.slice(0, i)}`, { streaming: true }).answer, "答复");
  assert.equal(splitAnswer(`${open}\n答复`).answer, "答复");
  assert.equal(splitAnswer(`${open}\n答复`).incomplete, true);
  assert.equal(splitAnswer("<axiom_ans").answer, "<axiom_ans");
});
test("code fences, inline code and ordinary examples are not protocol", () => {
  for (const text of [`\`\`\`xml\n${open}\n例子\n${close}\n\`\`\``, `~~~~\n${open}\n例子\n${close}\n~~~~`, `\`${open}\``, `例子 ${open}正文${close}`, `\`\n${open}\n${close}\n\``]) {
    assert.equal(splitAnswer(text).found, false);
    assert.equal(splitAnswer(text).answer, text);
  }
});
test("legacy, duplicate, nested and empty answers fall back without loss", () => {
  for (const text of ["旧回答", close, `${open}\n${open}\n内容\n${close}`, `${open}\n${close}`, `${open}\na\n${close}\n${open}\nb\n${close}`]) {
    assert.equal(splitAnswer(text).found, false);
    assert.equal(splitAnswer(text).answer, text);
  }
});
