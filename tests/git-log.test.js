import test from "node:test";
import assert from "node:assert/strict";
import { marked } from "marked";
import createPurify from "dompurify";
import { JSDOM } from "jsdom";
import { publicSource } from "./helpers/public-source.js";

test("Git history wraps subjects without changing source or ordinary diagrams", async () => {
  const window = new JSDOM("").window;
  try {
    const source = await publicSource("clipboard", "markdown");
    const render = new Function("marked", "DOMPurify", `${source}; return renderMarkdown;`)(marked, createPurify(window));
    const node = window.document.createElement("div");
    const fence = (text, lang = "text") => `\`\`\`${lang}\n${text}\n\`\`\``;
    const tree = "189730d merge: 恢复历史\n├─ 3faddf1 chore: index\n└─ 4e2e2f1 docs: record <img src=x onerror=alert(1)>";
    const graph = "*   189730d merge: 恢复历史\n|\\\n| * 3faddf1 chore: index\n|/\n* 4e2e2f1 docs: record";
    let copied;
    Object.defineProperty(window.navigator, "clipboard", { value: { writeText: async (text) => { copied = text; } } });
    for (const text of [tree, graph]) for (const lang of ["text", "", "git", "gitgraph", "ASCII"]) {
      render(node, fence(text, lang));
      assert.equal(node.querySelector(".code-toolbar > span").textContent, "Git 历史");
      assert.equal(node.querySelectorAll(".git-commit").length, 3);
      assert.equal(node.querySelector(".git-hash").textContent, "189730d");
      assert.equal(node.querySelector("img"), null);
      await node.querySelector('[aria-label="复制 Git 历史原文"]').onclick();
      assert.equal(copied, text + "\n");
      node.querySelector('[aria-label="切换到原文展示"]').click();
      assert.equal(node.querySelector(".table-scroll").hidden, true);
      assert.equal(node.querySelector("pre").hidden, false);
      assert.equal(node.querySelector("code").textContent, text + "\n");
      node.querySelector('[aria-label="切换到优化展示"]').click();
      assert.equal(node.querySelector(".table-scroll").hidden, false);
      assert.equal(node.querySelector("pre").hidden, true);
    }
    for (const text of ["root\n├─ 中文\n└─ leaf", "189730d one\n└─ 3faddf1 two\n├─ 4e2e2f1 three", "* 189730d one\nAuthor: Someone\n* 3faddf1 two", "** 189730d one\n* 3faddf1 two\n* 4e2e2f1 three", "189730d one\n├─ 3faddf1 two", tree + "x".repeat(20000)]) {
      render(node, fence(text));
      assert.equal(node.querySelector(".git-log"), null);
    }
    render(node, fence(tree, "js"));
    assert.equal(node.querySelector(".git-log"), null);
    // Every streamed prefix must agree with a fresh full render.
    const oracle = window.document.createElement("div");
    const markdown = fence(graph);
    for (let end = 1; end <= markdown.length; end++) {
      render(node, markdown.slice(0, end));
      oracle.replaceChildren();
      render(oracle, "");
      render(oracle, markdown.slice(0, end));
      assert.equal(node.innerHTML, oracle.innerHTML);
    }
  } finally { window.close(); }
});
