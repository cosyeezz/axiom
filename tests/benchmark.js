// Reproducible CPU/DOM microbenchmark, not an end-to-end latency measurement.
import { performance } from "node:perf_hooks";
import { readFile } from "node:fs/promises";
import { marked } from "marked";
import createPurify from "dompurify";
import { JSDOM } from "jsdom";

const window = new JSDOM("").window;
try {
  const purifier = createPurify(window);
  const source = (
    await readFile(new URL("../public/markdown.js", import.meta.url), "utf8")
  )
    .replace(/^import .*;\n/gm, "")
    .replace("export function", "function");
  const optimized = new Function(
    "marked",
    "DOMPurify",
    `${source}; return renderMarkdown;`,
  )(marked, purifier);
  const baseline = (el, text) => {
    el.innerHTML = purifier.sanitize(marked.parse(text, { gfm: true }));
  };
  const base =
    "# Section\n\nA paragraph with **bold** and `code`.\n\n- first\n- second\n\n```js\nconst n = 42;\n```\n\n".repeat(
      40,
    );
  const results = {};
  for (const [name, render] of Object.entries({ baseline, optimized })) {
    const samples = [];
    for (let run = 0; run < 3; run++) {
      const panes = Array.from({ length: 3 }, () =>
        window.document.createElement("div"),
      );
      let text = base;
      const start = performance.now();
      for (let i = 0; i < 60; i++) {
        text += "word ";
        for (const pane of panes) render(pane, text);
      }
      samples.push(performance.now() - start);
    }
    results[name] = Math.round(samples.sort((a, b) => a - b)[1]);
  }
  console.log({
    scenario: "3 agents × 60 updates, ~4KB Markdown",
    medianMs: results,
  });
} finally {
  window.close();
}
