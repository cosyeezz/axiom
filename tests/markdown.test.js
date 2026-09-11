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
  } finally {
    window.close();
  }
});
