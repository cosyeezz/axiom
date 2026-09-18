import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { readFileSync } from "node:fs";
import { initInspector, renderTools, renderBill, jsonTree } from "../public/session-details.js";

test("inspector tabs, safe collapsible JSON and itemized billing", () => {
  const dom = new JSDOM(readFileSync(new URL("../public/index.html", import.meta.url), "utf8"));
  globalThis.document = dom.window.document;
  try {
    const root = document.getElementById("session-inspector");
    initInspector(root);
    document.getElementById("inspector-tools-tab").click();
    assert.equal(document.getElementById("inspector-prompt-panel").hidden, true);
    assert.equal(document.getElementById("inspector-tools-panel").hidden, false);
    const tools = document.getElementById("session-active-tools");
    const source = [{ name: "<img src=x onerror=alert(1)>", description: "tool", parameters: { type: "object", properties: { x: { type: "string" } } } }];
    renderTools(tools, source);
    assert.equal(tools.querySelector("img"), null);
    assert.ok(tools.querySelector(".json-tree details"));
    assert.ok(tools.querySelector(".json-string"));
    tools.querySelector('.inspector-tool').open = true;
    renderTools(tools, source);
    assert.equal(tools.querySelector('.inspector-tool').open, true, "updates retain disclosure state");
    renderTools(tools, null);
    assert.match(tools.textContent, /尚未加载/);
    const tree = jsonTree({ n: 1, b: true, nil: null });
    assert.ok(tree.querySelector(".json-number"));
    const body = document.getElementById("session-bill-body");
    renderBill(body, { records: 1, unpriced: 0, cost: { total: .12 }, groups: [{ model: "p/m", tokens: { input: 1, output: 2, cacheRead: 3, cacheWrite: 4 }, cost: { input: .01, output: .02, cacheRead: .03, cacheWrite: .06, total: .12 } }] });
    assert.equal(body.querySelector('.bill-total').title, '$0.120000');
    assert.match(body.textContent, /\$0\.120\b/);
    assert.equal(body.querySelectorAll('.bill-table')[0].querySelectorAll('tbody tr').length, 4);
  } finally { delete globalThis.document; dom.window.close(); }
});
