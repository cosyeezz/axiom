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
  const source = await readFile(join(ROOT, "src", "sessions.js"), "utf8");
  const line = source.split(/\r?\n/).findIndex((line) => line.startsWith("export class Sessions")) + 1;
  assert.ok(text.includes(`| Sessions | class | ${line} |`)); // L2 与源码行号一致
  assert.match(text, /src\/sessions\.js/); // L1 模块登记
  assert.match(text, /command\.type：.*session\.create/); // L3 协议常量
  assert.match(text, /未登记文件（0）/); // 无未登记文件
});
