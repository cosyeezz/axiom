import test from "node:test";
import assert from "node:assert/strict";
import { marked } from "marked";
import createPurify from "dompurify";
import { JSDOM } from "jsdom";
import { publicSource } from "./helpers/public-source.js";

test("shared Markdown renderer formats blocks and removes unsafe content", async () => {
  const window = new JSDOM("").window;
  try {
    const source = await publicSource("clipboard", "markdown");
    const render = new Function(
      "marked",
      "DOMPurify",
      `${source}; return renderMarkdown;`,
    )(marked, createPurify(window));
    const node = window.document.createElement("div");
    render(
      node,
      "# Title\n\n**bold**\n\n- item\n\n```js\nconst a = 1;\n```\n\n| a | b |\n| - | - |\n| 1 | 2 |\n\n<script>alert(1)</script><img src=x onerror=alert(1)>[bad](javascript:alert(1))",
    );
    for (const selector of ["h1", "strong", "li", "pre code", "table"])
      assert(node.querySelector(selector), selector);
    assert.equal(
      node.querySelector('script,img,[onerror],a[href^="javascript:"]'),
      null,
    );
    assert.equal(node.querySelector(".code-toolbar > span").textContent, "js");
    const code = node.querySelector("pre code");
    const copy = node.querySelector(".code-toolbar button");
    let copied;
    Object.defineProperty(window.navigator, "clipboard", { configurable: true, value: { writeText: async (text) => { copied = text; } } });
    await copy.onclick();
    assert.equal(copied, code.textContent, "copy preserves the exact code, excluding the toolbar");
    assert.equal(copy.textContent, "已复制");
    window.navigator.clipboard.writeText = async () => { throw new Error("denied"); };
    await copy.onclick();
    assert.match(copy.textContent, /复制失败/);
    // 远程 HTTP（非安全上下文）没有 Clipboard API：按钮回退 execCommand，而不是报 undefined。
    delete window.navigator.clipboard;
    let execValue;
    window.document.execCommand = () => { execValue = window.document.querySelector("textarea")?.value; return true; };
    await copy.onclick();
    assert.equal(execValue, code.textContent, "回退路径复制的仍是代码原文");
    assert.equal(copy.textContent, "已复制");
    assert.equal(window.document.querySelector("textarea"), null, "复制后清理临时输入框");
    // 恢复 Clipboard API，后续既有断言继续走注入路径。
    delete window.document.execCommand;
    Object.defineProperty(window.navigator, "clipboard", { configurable: true, value: { writeText: async (text) => { copied = text; } } });
    assert.equal(node.querySelector(".table-scroll").tabIndex, 0);
    assert.equal(node.querySelector("pre").tabIndex, 0);
    const original = node.querySelector("h1");
    const sample = "# Title\n\nGrowing";
    render(node, sample);
    assert.equal(
      node.querySelector("h1"),
      original,
      "unchanged blocks keep DOM identity",
    );
    render(node, sample + " tail");
    assert.equal(node.querySelector("h1"), original);
    render(node, "[reference][id]");
    render(node, "[reference][id]\n\n[id]: https://example.com");
    assert.equal(node.querySelector("a").href, "https://example.com/");
    render(node, "- first\n- second");
    render(node, "- first\n- second\n- third");
    assert.equal(node.querySelectorAll("li").length, 3);
    render(node, "**partial");
    render(node, "**complete**");
    assert.equal(node.querySelector("strong").textContent, "complete");
    render(node, "**加粗。**中文内容");
    assert(node.querySelector("strong"), "CJK punctuation before closing ** still closes");
    assert.equal(node.querySelector("strong").textContent, "加粗");
    render(node, "他说**“重点”**内容");
    assert.equal(node.querySelector("strong").textContent, "重点");
    render(node, "```text\n**x。**y\n```");
    assert.equal(node.querySelector("code").textContent, "**x。**y\n", "fenced code keeps ** verbatim");
    const ascii = "+----------+----------+\n| 命令 | 作用 |\n+----------+----------+\n| axiom | 启动服务（已运行则提示） |\n| <img src=x onerror=alert(1)> | **原文** |\n+----------+----------+";
    const fenced = (text, lang = "text") => `\`\`\`${lang}\n${text}\n\`\`\``;
    render(node, fenced(ascii));
    assert.equal(node.querySelector("pre").hidden, true);
    assert.equal(node.querySelector("th").scope, "col");
    assert.equal(node.querySelectorAll("tbody tr").length, 2);
    assert.equal(node.querySelector("td").textContent, "axiom");
    assert.equal(node.querySelectorAll("td")[2].textContent, "<img src=x onerror=alert(1)>");
    assert.equal(node.querySelector("img, strong"), null, "cells remain literal text");
    assert.equal(node.querySelector(".table-scroll").tabIndex, 0);
    window.navigator.clipboard.writeText = async (text) => { copied = text; };
    await node.querySelector('button[aria-label="复制表格原文"]').onclick();
    assert.equal(copied, ascii + "\n", "copy retains the original ASCII including whitespace");
    for (const [text, lang] of [[ascii, "js"], [ascii.split("\n").slice(0, -1).join("\n"), "text"], [ascii.replace("| axiom |", "| a | b |"), ""], ["a --> b\n     |\n     c", "ascii"]]) {
      render(node, fenced(text, lang));
      assert(node.querySelector("pre code"), "ambiguous or incomplete content stays code");
      assert.equal(node.querySelector("table"), null);
    }
    render(node, fenced(ascii));
    assert(node.querySelector("table"), "completed streaming table is converted");
    const diagram = '侧栏（改动前）       （改动后）\n┌──────────┐        ┌──────────┐\n│ ✓ 完成   │        │ ✎ 重命名 │\n│ 中文 😀  │        │ é <img> │\n└──────────┘        └──────────┘';
    render(node, fenced(diagram));
    assert.equal(node.querySelector('.code-toolbar > span').textContent, '字符示意图');
    assert.equal(node.querySelector('code').textContent, diagram + '\n');
    const cells = [...node.querySelectorAll('.diagram-cell')];
    for (const char of ['中', '😀', '（']) assert(cells.find((cell) => cell.textContent === char).classList.contains('diagram-wide'));
    assert(cells.some((cell) => cell.textContent === 'é'), 'combining marks remain one grapheme');
    assert.equal(node.querySelector('img'), null);
    await node.querySelector('button[aria-label="复制代码"]').onclick();
    assert.equal(copied, diagram + '\n');
    render(node, fenced(diagram, 'js'));
    assert.equal(node.querySelector('.text-diagram'), null);
    render(node, fenced(diagram + 'x'.repeat(20000)));
    assert.equal(node.querySelector('.text-diagram'), null, 'large diagrams avoid per-character DOM growth');
    for (const sample of ['+----+\n| hi |\n+----+', 'root\n|-- 中文\n`-- leaf', 'A --> B', '╔══╗\n║中║\n╚══╝', '说明\n╭──╮\n│中│\n╰──╯\n尾注']) {
      render(node, fenced(sample));
      assert(node.querySelector('.text-diagram'), sample);
      node.querySelector('button[aria-label="切换到原文展示"]').click();
      assert.equal(node.querySelector('.text-diagram'), null);
      assert.equal(node.querySelector('code').textContent, sample + '\n');
      node.querySelector('button[aria-label="切换到优化展示"]').click();
      assert(node.querySelector('.text-diagram'));
    }
    render(node, fenced('中文\tX\né\tY'));
    assert.equal(node.querySelector('.text-diagram'), null, 'unknown text stays original');
    node.querySelector('button[aria-label="切换到优化展示"]').click();
    assert(node.querySelector('.diagram-tab-4'));
    assert(node.querySelector('.diagram-tab-7'));
    assert.equal(node.querySelector('code').textContent, '中文\tX\né\tY\n');
    render(node, fenced(ascii));
    node.querySelector('button[aria-label="切换到原文展示"]').click();
    assert.equal(node.querySelector('.table-scroll').hidden, true);
    assert.equal(node.querySelector('pre').hidden, false);
    node.querySelector('button[aria-label="切换到优化展示"]').click();
    assert.equal(node.querySelector('.table-scroll').hidden, false);
    assert.equal(node.querySelector('pre').hidden, true);
    const aligned = [
      '日期           方向  中继号数  呼叫量  接通  接通率  禁止呼叫  限拨率  无法接通',
      '2026-09-12 六  呼入        19    1026   673   65.6%         0       –       338',
      '               呼出         9     228    64   28.1%        65   28.5%         6',
      '2026-09-13 日  呼入        16     826   523   63.3%         0       –       294',
      '               呼出         9     187    55   29.4%        39   20.9%         1',
      '-------------------------------------------------------------------------------',
      '合计           呼入        21    3011  1942   64.5%',
      '               呼出        13     641   207   32.3%       146   22.8%',
    ].join('\n');
    render(node, fenced(aligned));
    assert.equal(node.querySelector('.code-toolbar > span').textContent, '表格', 'space-aligned tables upgrade to a real table');
    assert.equal(node.querySelectorAll('th').length, 9);
    assert.equal(node.querySelectorAll('th')[0].textContent, '日期');
    assert.equal(node.querySelectorAll('th')[8].textContent, '无法接通');
    assert.equal(node.querySelectorAll('tbody tr').length, 6);
    const firstRow = [...node.querySelectorAll('tbody tr')[0].cells].map((cell) => cell.textContent);
    assert.deepEqual(firstRow, ['2026-09-12 六', '呼入', '19', '1026', '673', '65.6%', '0', '–', '338']);
    const totals = [...node.querySelectorAll('tbody tr')[4].cells].map((cell) => cell.textContent);
    assert.deepEqual(totals, ['合计', '呼入', '21', '3011', '1942', '64.5%', '', '', '']);
    assert(node.querySelectorAll('tbody tr')[4].classList.contains('row-rule'), 'a rule line keeps its group divider');
    assert.equal(node.querySelectorAll('tbody tr')[0].classList.contains('row-rule'), false);
    const numberColumns = [...node.querySelectorAll('tbody tr')[0].cells].map((cell) => cell.classList.contains('cell-number'));
    assert.deepEqual(numberColumns, [false, false, true, true, true, true, true, true, true]);
    assert.equal(node.querySelector('pre').hidden, true);
    window.navigator.clipboard.writeText = async (text) => { copied = text; };
    await node.querySelector('button[aria-label="复制表格原文"]').onclick();
    assert.equal(copied, aligned + '\n', 'copy keeps the aligned source verbatim');
    node.querySelector('button[aria-label="切换到原文展示"]').click();
    assert.equal(node.querySelector('.table-scroll').hidden, true);
    assert.equal(node.querySelector('code').textContent, aligned + '\n');
    for (const [text, lang] of [
      [aligned, 'js'],
      [aligned.replace('日期           方向', '日期          方向 '), 'text'],
      ['名称  值\n甲    1\n乙    2', 'text'],
      ['两列  对齐\n仅此  一行', 'text'],
      ['这是一段说明文字。  它有双空格。\n第二行继续说明。', 'text'],
      ['root\n|-- 中文\n`-- leaf', 'text'],
    ]) {
      render(node, fenced(text, lang));
      assert.equal(node.querySelector('table'), null, `not a table: ${text.slice(0, 12)}`);
    }
    const listing = '-rw-r--r--  1 dane  staff   1024  Sep 12 10:22  README.md\n-rw-r--r--  1 dane  staff  20480  Sep 13 08:04  app.js\ndrwxr-xr-x  4 dane  staff    128  Sep 14 11:31  public';
    render(node, fenced(listing));
    assert.equal(node.querySelector('thead tr'), null, 'headerless output keeps every line as data');
    assert.equal(node.querySelectorAll('tbody tr').length, 3);
    assert.equal(node.querySelectorAll('tbody tr')[0].cells[3].textContent, '1024');
    assert(node.querySelectorAll('tbody tr')[0].cells[3].classList.contains('cell-number'));
    const jsonText = '{"名称":"中文","html":"<img src=x onerror=alert(1)>","items":[1,2]}';
    for (const input of [fenced(jsonText, "json"), fenced(jsonText, ""), jsonText]) {
      render(node, input);
      const action = (label) => [...node.querySelectorAll("button")].find((button) => button.textContent === label);
      const current = () => node.querySelector("pre code").textContent;
      assert.equal(node.querySelector(".code-toolbar > span").textContent, "JSON");
      action("格式化").click();
      assert.equal(current(), JSON.stringify(JSON.parse(jsonText), null, 2));
      action("压缩").click();
      assert.equal(current(), jsonText);
      action("转义").click();
      assert.equal(current(), JSON.stringify(jsonText));
      await action("复制").onclick();
      assert.equal(copied, JSON.stringify(jsonText));
      action("去转义").click();
      assert.equal(current(), jsonText);
      action("去转义").click();
      assert.match(node.querySelector(".json-status").textContent, /失败/);
      assert.equal(current(), jsonText, "failed conversion preserves content");
      assert.equal(node.querySelector("img"), null);
      render(node, input);
      assert.equal(current(), jsonText, "unchanged render preserves local operations");
    }
    render(node, fenced('{"id":9007199254740993}', "json"));
    node.querySelector(".json-actions button").click();
    assert.match(node.querySelector(".json-status").textContent, /安全范围/);
    assert.equal(node.querySelector("code").textContent, '{"id":9007199254740993}\n');
    render(node, fenced('{"incomplete":', "json"));
    node.querySelector(".json-actions button").click();
    assert.match(node.querySelector(".json-status").textContent, /失败/);
    assert.equal(node.querySelector("code").textContent, '{"incomplete":\n');
    render(node, "<pre>plain text without code</pre>");
    assert.equal(node.querySelector("pre").textContent, "plain text without code");
    assert.equal(node.querySelector(".code-toolbar"), null);
    assert.equal(node.querySelector("pre").tabIndex, 0);
  } finally {
    window.close();
  }
});

// 块级复用的安全边界：共享容器走“按块复用”，每步都与“全新容器全量渲染”的 oracle 对比。
// 覆盖 late reference definition（type/raw 不变但渲染变化）、列表松紧、追加/替换等。
test("incremental Markdown rendering matches a fresh full render at every step", async () => {
  const window = new JSDOM("").window;
  try {
    const source = await publicSource("clipboard", "markdown");
    const render = new Function(
      "marked",
      "DOMPurify",
      `${source}; return renderMarkdown;`,
    )(marked, createPurify(window));
    const fresh = () => window.document.createElement("div");
    const assertSameAsFresh = (container, text, label) => {
      const oracle = fresh();
      render(oracle, text);
      assert.equal(
        container.innerHTML,
        oracle.innerHTML,
        `${label} reused DOM diverged at ${JSON.stringify(text.slice(-60))}`,
      );
    };
    const stream = (chunks, label) => {
      const container = fresh();
      let text = "";
      for (const chunk of chunks) {
        text += chunk;
        render(container, text);
        assertSameAsFresh(container, text, label);
      }
      return container;
    };
    const fenced = (body) => `\`\`\`\n${body}\n\`\`\``;

    assert.equal(stream(["- a\n\n", "- b\n"], "loose list").querySelectorAll("li > p").length, 2);
    assert.equal(stream(["- a\n\n", "  para\n"], "list second paragraph").querySelectorAll("li > p").length, 2);
    assert.equal(stream(["Title\n", "====\n", "\nnext"], "setext").querySelector("h1").textContent, "Title");
    assert.equal(stream(["| a | b |\n", "| - | - |\n", "| 1 | 2 |\n"], "table").querySelectorAll("td").length, 2);
    assert.equal(
      stream(["> q\n", "> r\n"], "blockquote").querySelector("blockquote").textContent.replace(/\s+/g, " ").trim(),
      "q r",
    );

    // type/raw 不变但渲染变化：ref 解析依赖 lexer.links，追加 def 后必须重建。
    const late = stream(["[reference][id]", "\n\n[id]: https://example.com"], "late definition");
    assert.equal(late.querySelector("a").getAttribute("href"), "https://example.com");
    assert.equal(
      stream(["> [a][x]\n", ">\n", "> [x]: /u\n"], "definition in blockquote").querySelector("a").getAttribute("href"),
      "/u",
    );
    assert.equal(
      stream(["[a][x]\n\n[x]: /u\n", '  "title"\n'], "multiline definition").querySelector("a").getAttribute("title"),
      "title",
    );
    // 转义 def 不构成定义：`[x][x]` 必须保持字面量，绝不能解析成链接。
    const escaped = stream(["\\[x]: /u\n", "\n[x][x]\n"], "escaped definition");
    assert.equal(escaped.querySelector("a"), null, "an escaped definition must not resolve references");
    assert.equal(escaped.querySelectorAll("p")[1].textContent, "[x][x]");

    const pseudo = stream([fenced("[x]: /u") + "\n", "\n[x]\n"], "definition-looking code fence");
    assert.equal(pseudo.querySelector("a"), null, "a def inside code never resolves references");
    assert.equal(pseudo.querySelector("code").textContent, "[x]: /u\n");
    const cjk = stream(["**加粗。**中文\n", "\n" + fenced("**x。**y") + "\n"], "CJK bold around a fence");
    assert.equal(cjk.querySelector("strong").textContent, "加粗");
    assert.equal(cjk.querySelector("code").textContent, "**x。**y\n");
    const json = stream(['{"a":', '1,"b":2}'], "bare JSON growth");
    assert.equal(json.querySelector(".code-toolbar > span").textContent, "JSON");
    assert.equal(json.querySelector("code").textContent, '{"a":1,"b":2}\n');

    const dangerous = stream(
      ["<img src=x onerror=alert(1)>", "\n\n[bad](javascript:alert(1))", "\n\n<script>alert(1)</script>"],
      "dangerous HTML and links",
    );
    assert.equal(dangerous.querySelector("script,img,[onerror],a[href^='javascript:']"), null);

    // 非追加替换：同一容器换整段文本（含 def 出现后又消失）仍与全量 oracle 一致。
    const replaced = fresh();
    for (const text of ["# one\n\n- a\n", "[r][k]\n\n[k]: /u\n", "# two\n\nplain", "- x\n- y"]) {
      render(replaced, text);
      assertSameAsFresh(replaced, text, "non-append replacement");
    }
  } finally {
    window.close();
  }
});

// linksKey 是拼接字符串：分隔符必须不可伪造，否则不同定义集合同签名会错误复用。
// 两组反例：id 拼接碰撞、href/title 字段边界移动。
test("reference signatures cannot collide across id/href/title boundaries", async () => {
  const window = new JSDOM("").window;
  try {
    const source = await publicSource("clipboard", "markdown");
    const render = new Function(
      "marked",
      "DOMPurify",
      `${source}; return renderMarkdown;`,
    )(marked, createPurify(window));
    const fresh = () => window.document.createElement("div");
    // 两段文本各自的全量渲染必须不同，否则这组反例证明不了任何事。
    const renderPair = (before, after, label) => {
      const oracleBefore = fresh();
      render(oracleBefore, before);
      const oracleAfter = fresh();
      render(oracleAfter, after);
      assert.notEqual(oracleBefore.innerHTML, oracleAfter.innerHTML, `${label}: the pair must render differently`);
      const reused = fresh();
      render(reused, before);
      render(reused, after);
      assert.equal(reused.innerHTML, oracleAfter.innerHTML, `${label}: reused DOM kept the previous definitions`);
    };

    renderPair(
      "[x][a]\n\n[a]: u\n\n[b]: v",
      "[x][a]\n\n[a\u0000u\u0000\u0001b]: v",
      "id boundary",
    );
    renderPair(
      '[x][a]\n\n[a]: x\u0000y "t"',
      '[x][a]\n\n[a]: x "y\u0000t"',
      "href/title boundary",
    );
  } finally {
    window.close();
  }
});
