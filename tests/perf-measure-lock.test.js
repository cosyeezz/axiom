import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { acquireMeasureLock } from "../docs/perf-long-conversation/measure-lock.mjs";

test("measurement lock rejects another output, releases only its token, and preserves unknown locks", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "axiom-lock-test-"));
  const lock = path.join(root, "lock");
  try {
    const release = acquireMeasureLock("first.json", lock);
    assert.throws(() => acquireMeasureLock("second.json", lock), /lock exists/);
    release();
    const next = acquireMeasureLock("second.json", lock);
    const owner = path.join(lock, "owner.json");
    const original = fs.readFileSync(owner, "utf8");
    fs.writeFileSync(owner, JSON.stringify({ token: "another-owner" }));
    assert.throws(next, /ownership changed/);
    assert.equal(JSON.parse(fs.readFileSync(owner, "utf8")).token, "another-owner");
    fs.writeFileSync(owner, original);
    next();
    fs.mkdirSync(lock);
    assert.throws(() => acquireMeasureLock("third.json", lock), /lock exists/);
    assert.ok(fs.existsSync(lock), "missing owner must not trigger automatic lock removal");
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
