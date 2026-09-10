import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rebuild } from "../scripts/service.mjs";
import { spawn } from "node:child_process";
import { once } from "node:events";

test("supervisor quick restart waits for graceful stop then starts a new worker", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "axiom-supervisor-"));
  try {
    await mkdir(join(cwd, "scripts")); await mkdir(join(cwd, "src"));
    await writeFile(join(cwd, "scripts/service.mjs"), await readFile(new URL("../scripts/service.mjs", import.meta.url)));
    await writeFile(join(cwd, "src/main.js"), `
      const fs = require('node:fs');
      if (fs.existsSync('stopped')) process.exit(0);
      process.on('message', message => {
        if (message.type === 'service.stop') { fs.writeFileSync('stopped', 'saved'); process.exit(0); }
      });
      process.send({ type: 'service.restart', mode: 'quick' });
    `);
    const child = spawn(process.execPath, [join(cwd, "scripts/service.mjs")], { stdio: "ignore" });
    const timer = setTimeout(() => child.kill(), 10000);
    try { assert.equal((await once(child, "exit"))[0], 0); }
    finally { clearTimeout(timer); }
    assert.equal(await readFile(join(cwd, "stopped"), "utf8"), "saved");
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test("rebuild installs then builds; failed install restores old dependencies", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "axiom-rebuild-"));
  const modules = join(cwd, "node_modules");
  try {
    await mkdir(modules);
    await writeFile(join(modules, "old"), "working");
    await assert.rejects(rebuild(cwd, async () => {
      await mkdir(modules); await writeFile(join(modules, "partial"), "bad");
      throw new Error("offline");
    }), /offline/);
    assert.equal(await readFile(join(modules, "old"), "utf8"), "working");
    const calls = [];
    await rebuild(cwd, async (cmd, args) => {
      calls.push([cmd, ...args].join(" "));
      if (calls.length === 1) await mkdir(modules);
    });
    assert.match(calls[0], /npm ci/);
    assert.match(calls[1], /npm run build --if-present/);
    await assert.rejects(readFile(join(cwd, ".node_modules-backup", "old")), { code: "ENOENT" });
  } finally { await rm(cwd, { recursive: true, force: true }); }
});
