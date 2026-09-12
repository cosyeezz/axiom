import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { marked } from "marked";
import createPurify from "dompurify";
import { JSDOM } from "jsdom";

test("shared Markdown renderer formats blocks and removes unsafe content", async () => {
  const window = new JSDOM("").window;
  try {
    const source = (
      await readFile(new URL("../public/markdown.js", import.meta.url), "utf8")
    )
      .replace(/^import .*;\r?\n/gm, "")
      .replace("export function", "function");
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
    const ascii = "+----------+----------+\n| 命令 | 作用 |\n+----------+----------+\n| axiom | 启动服务（已运行则提示） |\n| <img src=x onerror=alert(1)> | **原文** |\n+----------+----------+";
    const fenced = (text, lang = "text") => `\`\`\`${lang}\n${text}\n\`\`\``;
    render(node, fenced(ascii));
    assert.equal(node.querySelector("pre"), null);
    assert.equal(node.querySelector("th").scope, "col");
    assert.equal(node.querySelectorAll("tbody tr").length, 2);
    assert.equal(node.querySelector("td").textContent, "axiom");
    assert.equal(node.querySelectorAll("td")[2].textContent, "<img src=x onerror=alert(1)>");
    assert.equal(node.querySelector("img, strong"), null, "cells remain literal text");
    assert.equal(node.querySelector(".table-scroll").tabIndex, 0);
    window.navigator.clipboard.writeText = async (text) => { copied = text; };
    await node.querySelector("button").onclick();
    assert.equal(copied, ascii + "\n", "copy retains the original ASCII including whitespace");
    for (const [text, lang] of [[ascii, "js"], [ascii.split("\n").slice(0, -1).join("\n"), "text"], [ascii.replace("| axiom |", "| a | b |"), ""], ["a --> b\n     |\n     c", "ascii"]]) {
      render(node, fenced(text, lang));
      assert(node.querySelector("pre code"), "ambiguous or incomplete content stays code");
      assert.equal(node.querySelector("table"), null);
    }
    render(node, fenced(ascii));
    assert(node.querySelector("table"), "completed streaming table is converted");
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
