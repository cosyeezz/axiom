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

    item.task = { node: document.createElement("details") };
    const before = count;
    for (let i = 0; i < 100; i++) {
      item.buffer += " hidden";
      renderer.mark(item);
    }
    renderer.flush(item);
    assert.equal(count, before, "collapsed tasks do not schedule frames");
    assert.equal(writes, 2, "collapsed tasks skip Markdown parsing");
    item.task.node.open = true;
    renderer.mark(item);
    scheduled();
    assert.equal(writes, 3);
    assert.equal(
      item.text.textContent,
      item.buffer,
      "opening paints the full result",
    );
    item.buffer = "closed before frame";
    renderer.mark(item);
    item.task.node.open = false;
    scheduled();
    assert.equal(writes, 3);
    renderer.clear();
  } finally {
    dom.window.close();
  }
});
