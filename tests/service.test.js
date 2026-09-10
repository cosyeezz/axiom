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
      const count = () => (parseInt(fs.existsSync('workers') ? fs.readFileSync('workers', 'utf8') : '0', 10) || 0) + 1;
      fs.writeFileSync('workers', String(count()));
      if (fs.existsSync('stopped')) process.exit(0);
      process.on('message', message => {
        if (message.type === 'service.stop') { fs.writeFileSync('stopped', 'saved'); process.exit(0); }
      });
      process.send({ type: 'service.restart', mode: 'quick' });
    `);
    const child = spawn(process.execPath, [join(cwd, "scripts/service.mjs")], { stdio: "ignore" });
    try {
      const deadline = Date.now() + 8000;
      while (Date.now() < deadline) {
        try { if (parseInt(await readFile(join(cwd, "workers"), "utf8"), 10) >= 2) break; } catch {}
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      child.kill();
      await once(child, "exit");
      assert.equal(await readFile(join(cwd, "stopped"), "utf8"), "saved");
      assert.ok(parseInt(await readFile(join(cwd, "workers"), "utf8"), 10) >= 2, "a new worker started after quick restart");
    } finally { await rm(cwd, { recursive: true, force: true }); }
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test("supervisor respawns crashed workers with backoff until stopped", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "axiom-respawn-"));
  try {
    await mkdir(join(cwd, "scripts")); await mkdir(join(cwd, "src"));
    await writeFile(join(cwd, "scripts/service.mjs"), await readFile(new URL("../scripts/service.mjs", import.meta.url)));
    await writeFile(join(cwd, "src/main.js"), `
      const fs = require('node:fs');
      const n = String((parseInt(fs.existsSync('respawns') ? fs.readFileSync('respawns', 'utf8') : '0', 10) || 0) + 1);
      fs.writeFileSync('respawns', n);
      process.exit(1);
    `);
    const child = spawn(process.execPath, [join(cwd, "scripts/service.mjs")], { stdio: "ignore" });
    try {
      await new Promise((resolve) => setTimeout(resolve, 3500));
      assert.ok(parseInt(await readFile(join(cwd, "respawns"), "utf8"), 10) >= 3, "crashed workers are respawned");
    } finally { child.kill(); await once(child, "exit"); }
    await rm(join(cwd, "respawns"), { force: true });
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
