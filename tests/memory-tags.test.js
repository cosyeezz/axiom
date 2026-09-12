import test from "node:test";
import assert from "node:assert/strict";
import { extractMemoryTags, stripMemoryTags } from "../public/memory-tags.js";

test("extract 只认单行有界标签，行中/行尾/同行多个均可", () => {
  assert.deepEqual(extractMemoryTags("前言\n<summary>已知X；意图Y</summary>\n正文"), { summary: "已知X；意图Y" });
  assert.deepEqual(extractMemoryTags("<title>摘要机制</title><summary>明确需求</summary>"), { title: "摘要机制", summary: "明确需求" });
  assert.deepEqual(extractMemoryTags("正文 <summary>末尾</summary>"), { summary: "末尾" });
  assert.deepEqual(extractMemoryTags("前缀<title>T</title>后缀"), { title: "T" });
  assert.deepEqual(extractMemoryTags("<progress>五成</progress>"), { progress: "五成" });
});

test("extract 防贪婪吞并同类，title 取首个，summary/progress 取最后", () => {
  assert.deepEqual(extractMemoryTags("<summary>a</summary> 中间 <summary>b</summary>"), { summary: "b" });
  assert.deepEqual(extractMemoryTags("<title>一</title>\n<title>二</title>"), { title: "一" });
  assert.deepEqual(extractMemoryTags("<title> </title><title>一二三四五六七八九十十一</title><title>合法</title>"), { title: "合法" });
  // 嵌套外壳不认，内层标签仍认
  assert.deepEqual(extractMemoryTags("<summary>a <title>b</title> c</summary>"), { title: "b" });
});

test("extract 忽略代码围栏与跨行内容，trim 内容，大小写不敏感", () => {
  assert.deepEqual(extractMemoryTags("```\n<title>代码内</title>\n```\n<summary>外</summary>"), { summary: "外" });
  assert.deepEqual(extractMemoryTags("<summary>跨行\n不认</summary>"), {});
  assert.deepEqual(extractMemoryTags("<summary>  空  </summary>"), { summary: "空" });
  assert.deepEqual(extractMemoryTags("<SUMMARY>大写</SUMMARY>"), { summary: "大写" });
  assert.deepEqual(extractMemoryTags(""), {});
});

test("strip 删除完整标签，独占行不留空档", () => {
  assert.equal(stripMemoryTags("结论\n<summary>已知</summary>\n正文"), "结论\n正文");
  assert.equal(stripMemoryTags("<title>摘要机制</title><summary>明确需求</summary>"), "");
  assert.equal(stripMemoryTags("看 <title>T</title> 好"), "看  好");
  assert.equal(stripMemoryTags("<summary>a</summary> 保留 <summary>b</summary>"), " 保留 ");
  assert.equal(stripMemoryTags("<summary>a <title>b</title> c</summary> 尾"), " 尾");
  assert.equal(stripMemoryTags("普通文本不变"), "普通文本不变");
});

test("strip 隐藏未闭合开启标签，代码围栏与普通比较符不受影响", () => {
  assert.equal(stripMemoryTags("<summary>未闭合"), "");
  assert.equal(stripMemoryTags("答案<summary>未闭合"), "答案");
  assert.equal(stripMemoryTags("```\n<summary>保留</summary>\n```"), "```\n<summary>保留</summary>\n```");
  assert.equal(stripMemoryTags("5 < 3 且 a>b"), "5 < 3 且 a>b");
});

test("strip 流式隐藏行尾标签残片", () => {
  assert.equal(stripMemoryTags("答<sum", { streaming: true }), "答");
  assert.equal(stripMemoryTags("答<summary>部分", { streaming: true }), "答");
  assert.equal(stripMemoryTags("答</summary", { streaming: true }), "答");
  assert.equal(stripMemoryTags("答<summary>", { streaming: true }), "答");
  assert.equal(stripMemoryTags("完成", { streaming: true }), "完成");
  assert.equal(stripMemoryTags("5 < 3", { streaming: true }), "5 < 3");
  assert.equal(stripMemoryTags("结论\n<sum", { streaming: true }), "结论\n");
  assert.equal(stripMemoryTags("```\n<sum", { streaming: true }), "```\n<sum");
});
