import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { createStreamRenderer } from "../public/stream-renderer.js";

test("one frame, only dirty text, lazy thinking, final flush and switch cancellation", () => {
  const dom = new JSDOM("");
  const document = dom.window.document;
  let scheduled,
    count = 0,
    writes = 0;
  const renderer = createStreamRenderer(
    (el, text) => {
      writes++;
      el.textContent = text;
    },
    () => {},
    (fn) => {
      count++;
      scheduled = fn;
      return 1;
    },
    () => {
      scheduled = undefined;
    },
  );
  const item = {
    text: document.createElement("div"),
    thought: document.createElement("pre"),
    thinking: document.createElement("details"),
    buffer: "answer",
    reasoning: "",
  };
  try {
    for (let i = 0; i < 100; i++) renderer.mark(item);
    assert.equal(count, 1);
    scheduled();
    assert.equal(writes, 1);
    item.reasoning = "hidden thought";
    renderer.mark(item);
    scheduled();
    assert.equal(writes, 1);
    assert.equal(item.thought.textContent, "");
    item.thinking.open = true;
    renderer.mark(item);
    scheduled();
    const node = item.thought.firstChild;
    item.reasoning += " more";
    renderer.mark(item);
    scheduled();
    assert.equal(item.thought.firstChild, node);
    assert.equal(node.data, "hidden thought more");
    item.buffer = "final";
    renderer.mark(item);
    renderer.flush(item);
    scheduled();
    assert.equal(writes, 2);
    assert.equal(item.text.textContent, "final");
    renderer.mark(item);
    renderer.clear();
    assert.equal(scheduled, undefined);
  } finally {
    dom.window.close();
  }
});
