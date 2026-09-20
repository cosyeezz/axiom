import test from "node:test";
import assert from "node:assert/strict";
import { parseSummaryOutput, renderCompactionSources, validateFacts, compactionArbitration } from "../src/compaction.js";

test("threshold has one owner; overflow/manual retain SDK recovery", () => {
  let cancelled = 0, enabled = true;
  const controller = { getConfig: () => ({ enabled }), cancel: () => { cancelled++; } };
  assert.deepEqual(compactionArbitration(controller, { reason: "threshold" }), { cancel: true });
  assert.equal(cancelled, 0);
  assert.equal(compactionArbitration(controller, { reason: "overflow" }), undefined);
  assert.equal(cancelled, 1);
  enabled = false;
  assert.equal(compactionArbitration(controller, { reason: "threshold" }), undefined);
  assert.equal(cancelled, 2);
});

const facts = (value) => `Summary\n<axiom_compact_facts>${value}</axiom_compact_facts>`;
test("strict summary protocol rejects missing, incomplete, empty and oversized facts", () => {
  for (const text of ["Summary", facts(""), "Summary<axiom_compact_facts>abc", facts("x".repeat(301)), facts(Array(31).fill("quote").join("\n")), facts("quote") + "<axiom_compact_facts>other</axiom_compact_facts>"])
    assert.throws(() => parseSummaryOutput(text, { strict: true }), /Invalid summary/);
  assert.deepEqual(parseSummaryOutput(facts("NONE"), { strict: true }).facts, []);
});

test("ordinary code examples remain intact and cannot supply protocol facts", () => {
  const text = 'Example follows:\n```xml\n<axiom_compact_title>example</axiom_compact_title>\n<axiom_compact_facts>fabricated</axiom_compact_facts>\n```';
  assert.equal(parseSummaryOutput(text).summary, text);
  assert.throws(() => parseSummaryOutput(text, { strict: true }), /facts/);
});

test("full source archive preserves sub-OP-threshold tool tails and image payloads", () => {
  const text = "x".repeat(2900) + "FINAL_VERDICT=rollback_required";
  const messages = [{ role: "toolResult", content: [{ type: "text", text }, { type: "image", data: "aW1hZ2U=", mimeType: "image/png" }] }];
  const archive = renderCompactionSources(messages, ["entry-1"]);
  assert.ok(archive.includes(text));
  assert.ok(archive.includes("aW1hZ2U="));
  assert.ok(archive.includes("entry-1"));
  assert.equal(validateFacts(["FINAL_VERDICT=rollback_required"], archive).ok, true);
  assert.equal(validateFacts(["fabricated"], archive, "fabricated").ok, false);
});
