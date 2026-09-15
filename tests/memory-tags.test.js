import test from "node:test";
import assert from "node:assert/strict";
import { extractMemoryTags, stripMemoryTags } from "../public/memory-tags.js";

test("extract 只认 title；旧摘要标签（axiom_summary/summary/progress）不再提取", () => {
  assert.deepEqual(extractMemoryTags("<axiom_summary>完成验证</axiom_summary>"), {});
  assert.deepEqual(extractMemoryTags("前言\n<summary>已知X；意图Y</summary>\n正文"), {});
  assert.deepEqual(extractMemoryTags("<progress>五成</progress>"), {});
  assert.deepEqual(extractMemoryTags("<title>摘要机制</title><summary>明确需求</summary>"), { title: "摘要机制" });
  assert.deepEqual(extractMemoryTags("前缀<title>T</title>后缀"), { title: "T" });
  assert.equal(stripMemoryTags("正文<axiom_summary>完成验证</axiom_summary>"), "正文");
  assert.equal(stripMemoryTags("正文<axiom_sum", { streaming: true }), "正文");
});

test("extract title 取首个、防贪婪吞并，超长与空值跳过", () => {
  assert.deepEqual(extractMemoryTags("<title>一</title>\n<title>二</title>"), { title: "一" });
  assert.deepEqual(extractMemoryTags("<title> </title><title>一二三四五六七八九十十一</title><title>合法</title>"), { title: "合法" });
  // 嵌套外壳不认，内层标签仍认
  assert.deepEqual(extractMemoryTags("<summary>a <title>b</title> c</summary>"), { title: "b" });
});

test("extract 忽略代码围栏，跨行折行为空格，trim 内容，大小写不敏感", () => {
  assert.deepEqual(extractMemoryTags("```\n<title>代码内</title>\n```\n<title>外</title>"), { title: "外" });
  assert.deepEqual(extractMemoryTags("<title>跨行\n认</title>"), { title: "跨行 认" });
  assert.deepEqual(extractMemoryTags("<title>  空  </title>"), { title: "空" });
  assert.deepEqual(extractMemoryTags("<TITLE>大写</TITLE>"), { title: "大写" });
  assert.deepEqual(extractMemoryTags(""), {});
});

test("strip 删除完整标签（含已删机制的旧标签，旧会话历史仍需过滤），独占行不留空档", () => {
  assert.equal(stripMemoryTags("结论\n<summary>已知</summary>\n正文"), "结论\n正文");
  assert.equal(stripMemoryTags("<title>摘要机制</title><summary>明确需求</summary>"), "");
  assert.equal(stripMemoryTags("看 <title>T</title> 好"), "看  好");
  assert.equal(stripMemoryTags("<summary>a</summary> 保留 <summary>b</summary>"), " 保留 ");
  assert.equal(stripMemoryTags("<summary>a <title>b</title> c</summary> 尾"), " 尾");
  assert.equal(stripMemoryTags("普通文本不变"), "普通文本不变");
});

test("strip 非流式只删落单开启标签本身，代码围栏与普通比较符不受影响", () => {
  // M-T2：以前「截到段尾」，谈到这几个标签名就把后文（连带 goal 完成标记）一起吞掉。
  assert.equal(stripMemoryTags("<summary>未闭合"), "未闭合");
  assert.equal(stripMemoryTags("答案<summary>未闭合"), "答案未闭合");
  assert.equal(stripMemoryTags("```\n<summary>保留</summary>\n```"), "```\n<summary>保留</summary>\n```");
  assert.equal(stripMemoryTags("5 < 3 且 a>b"), "5 < 3 且 a>b");
});

test("M-T2/X1 落单开启标签不吞后文：其他机制的标记与正文都留住", () => {
  const talk = "讨论 <summary> 的用法\n\n正文\n\n<axiom_round_finished>";
  assert.equal(stripMemoryTags(talk), "讨论  的用法\n\n正文\n\n<axiom_round_finished>");
});

test("标签独占行的跨行摘要：整块隐藏，落单闭合标签不漏出", () => {
  const reply = "定案：走续跑\n<axiom_summary>\n定案：重试按钮挂 updateActivity，语义为续跑非重发\n</axiom_summary>";
  assert.deepEqual(extractMemoryTags(reply), {});
  assert.equal(stripMemoryTags(reply), "定案：走续跑");
  assert.equal(stripMemoryTags("正文\n</axiom_summary>"), "正文");
  assert.equal(stripMemoryTags("正文 </summary> 尾"), "正文  尾");
  // 开启标签落在代码围栏内：围栏原样保留，围栏外的闭合标签不漏出
  assert.equal(stripMemoryTags("```\n<summary>\n```\n正文\n</summary>"), "```\n<summary>\n```\n正文");
});

test("M-T1/M-T6 与真 HTML 同名的标签不吞正经写法：details/summary、带属性 progress", () => {
  const details = "<details>\n<summary>点击展开细节</summary>\n\n正文\n</details>";
  assert.equal(stripMemoryTags(details), details);
  const bar = '进度条这样写：\n<progress value="70" max="100"></progress>\n即可。';
  assert.equal(stripMemoryTags(bar), bar);
});

test("M-T3/M-T4 代码区口径：波浪线围栏、更长围栏、缩进代码块算代码；6 空格的围栏行不是围栏", () => {
  assert.deepEqual(extractMemoryTags("~~~\n<title>围栏内</title>\n~~~"), {});
  assert.deepEqual(extractMemoryTags("````\n```\n<title>嵌套围栏内</title>\n```\n````"), {});
  assert.deepEqual(extractMemoryTags("说明\n\n    <title>缩进内</title>"), {});
  assert.equal(stripMemoryTags("说明\n\n    <summary>缩进内</summary>"), "说明\n\n    <summary>缩进内</summary>");
  // 6 空格缩进的 ``` 是代码内容而非围栏开关，其后的真标签照旧生效
  assert.deepEqual(extractMemoryTags("      ```\n<title>六空格后</title>"), { title: "六空格后" });
});

test("M-T5 只有回复开头那一行的 <title> 是自报，正文里的 HTML 示例不提取也不剥离", () => {
  const doc = "HTML 页头这样写：\n<title>示例站点</title>\n再配 meta 标签即可。";
  assert.deepEqual(extractMemoryTags(doc), {});
  assert.equal(stripMemoryTags(doc), doc);
  const head = "<head><title>示例站点</title></head>";
  assert.deepEqual(extractMemoryTags(head), {});
  assert.equal(stripMemoryTags(head), head);
  assert.deepEqual(extractMemoryTags("<title>真标题</title>\n正文"), { title: "真标题" });
});

test("行内代码里的标签是讨论内容，不剥不提取，不吃后文", () => {
  // 回归：以前 `<axiom_summary>` 被当未闭合开启标签，“截到段尾”把反引号后的整句话吃掉。
  const talk = "摘要机制整套删除。主代理自报 `<axiom_summary>`、摘要提醒注入全部拿掉。";
  assert.equal(stripMemoryTags(talk), talk);
  assert.equal(stripMemoryTags(talk, { streaming: true }), talk);
  assert.equal(stripMemoryTags("用 `<title>` 自报标题"), "用 `<title>` 自报标题");
  assert.equal(stripMemoryTags("``<summary>`` 也留住"), "``<summary>`` 也留住");
  assert.deepEqual(extractMemoryTags("说明 `<title>假的</title>` 结束"), {});
  // 行内代码不影响同段真标签的剥离
  assert.equal(stripMemoryTags("混合 `<progress>` 与<summary>删我</summary>尾巴"), "混合 `<progress>` 与尾巴");
  assert.deepEqual(extractMemoryTags("`<title>假</title>`<title>真</title>"), { title: "真" });
});

test("strip 流式：跨行摘要在闭合前整块隐藏", () => {
  const head = "定案：走续跑\n<axiom_summary>\n定案：重试按钮";
  assert.equal(stripMemoryTags(head, { streaming: true }), "定案：走续跑");
  assert.equal(stripMemoryTags(head + "\n</axiom_su", { streaming: true }), "定案：走续跑");
});

test("strip 流式隐藏行尾标签残片", () => {
  assert.equal(stripMemoryTags("答<sum", { streaming: true }), "答");
  assert.equal(stripMemoryTags("答<summary>部分", { streaming: true }), "答");
  assert.equal(stripMemoryTags("答</summary", { streaming: true }), "答");
  assert.equal(stripMemoryTags("答<summary>", { streaming: true }), "答");
  assert.equal(stripMemoryTags("完成", { streaming: true }), "完成");
  assert.equal(stripMemoryTags("5 < 3", { streaming: true }), "5 < 3");
});
