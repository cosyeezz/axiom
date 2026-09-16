import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { claimDataRoot } from "../src/data-owner.js";

test("同数据根拒绝第二写入者，释放后允许重开，不同根互不影响", async () => {
  const root = await mkdtemp(join(tmpdir(), "axiom-owner-"));
  const other = await mkdtemp(join(tmpdir(), "axiom-owner-"));
  let release, releaseOther;
  try {
    release = await claimDataRoot(root);
    await assert.rejects(claimDataRoot(join(root, ".")), /占用/);
    releaseOther = await claimDataRoot(other);
    await release(); release = undefined;
    release = await claimDataRoot(root);
  } finally {
    await release?.(); await releaseOther?.();
    await rm(root, { recursive: true, force: true });
    await rm(other, { recursive: true, force: true });
  }
});
