import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

const ROOT = join(import.meta.dirname, "..");
const SKILL = join(ROOT, ".pi", "skills", "codebase-map");

test("索引可重建且包含关键符号与横切常量", async () => {
  execFileSync(process.execPath, [join(SKILL, "scripts", "reindex.mjs")], { cwd: ROOT });
  const text = await readFile(join(SKILL, "INDEX.md"), "utf8");
  assert.match(text, /Sessions \| class \| 9/); // L2 符号→行号
  assert.match(text, /src\/sessions\.js/); // L1 模块登记
  assert.match(text, /command\.type：.*session\.create/); // L3 协议常量
  assert.match(text, /未登记文件（0）/); // 无未登记文件
});
