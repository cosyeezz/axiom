import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readSessionHistory } from "../src/session-history.js";

test("历史只读：当前分支、空文件和旧版本不改写磁盘", () => {
  const root = mkdtempSync(join(tmpdir(), "axiom-history-")), file = join(root, "history.jsonl");
  try {
    const text = [
      { type: "session", version: 3, id: "test", cwd: root, timestamp: new Date().toISOString() },
      { type: "message", id: "a", parentId: null, message: { role: "user", content: "hello" } },
      { type: "message", id: "b", parentId: "a", message: { role: "assistant", content: [] } },
      { type: "message", id: "c", parentId: "a", message: { role: "user", content: "branch" } },
    ].map(JSON.stringify).join("\n");
    writeFileSync(file, text);
    assert.deepEqual(readSessionHistory(file, root).map(entry => entry.id), ["a", "c"]);
    assert.equal(readFileSync(file, "utf8"), text);
    const legacy = text.replace('"version":3', '"version":2');
    writeFileSync(file, legacy);
    readSessionHistory(file, root);
    assert.equal(readFileSync(file, "utf8"), legacy);
    writeFileSync(file, "");
    assert.throws(() => readSessionHistory(file, root), /头部/);
    assert.equal(readFileSync(file, "utf8"), "");
  } finally { rmSync(root, { recursive: true, force: true }); }
});
