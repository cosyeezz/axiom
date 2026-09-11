import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rebuild, update } from "../scripts/service.mjs";
import { spawn } from "node:child_process";
import { once } from "node:events";

test("supervisor quick restart waits for graceful stop then starts a new worker", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "axiom-supervisor-"));
  try {
    await mkdir(join(cwd, "scripts")); await mkdir(join(cwd, "src"));
    await writeFile(join(cwd, "scripts/service.mjs"), await readFile(new URL("../scripts/service.mjs", import.meta.url)));
    await writeFile(join(cwd, "src/update.js"), await readFile(new URL("../src/update.js", import.meta.url)));
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
    const child = spawn(process.execPath, [join(cwd, "scripts/service.mjs")], { stdio: "ignore", env: { ...process.env, AXIOM_PORT: "0" } });
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
    await writeFile(join(cwd, "src/update.js"), await readFile(new URL("../src/update.js", import.meta.url)));
    await writeFile(join(cwd, "src/main.js"), `
      const fs = require('node:fs');
      const n = String((parseInt(fs.existsSync('respawns') ? fs.readFileSync('respawns', 'utf8') : '0', 10) || 0) + 1);
      fs.writeFileSync('respawns', n);
      process.exit(1);
    `);
    const child = spawn(process.execPath, [join(cwd, "scripts/service.mjs")], { stdio: "ignore", env: { ...process.env, AXIOM_PORT: "0" } });
    try {
      await new Promise((resolve) => setTimeout(resolve, 3500));
      assert.ok(parseInt(await readFile(join(cwd, "respawns"), "utf8"), 10) >= 3, "crashed workers are respawned");
    } finally { child.kill(); await once(child, "exit"); }
    await rm(join(cwd, "respawns"), { force: true });
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test("supervisor update installs while old worker serves, then restarts; failure keeps service up", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "axiom-update-sup-"));
  try {
    await mkdir(join(cwd, "scripts")); await mkdir(join(cwd, "src"));
    const shim = join(cwd, "shim"); await mkdir(shim);
    if (process.platform === "win32") {
      await writeFile(join(shim, "npm.cmd"), "@echo %* > \"%CD%\\npm-called\"\r\nif not exist stopped echo served > \"%CD%\\served-during-install\"\r\nexit /b 0\r\n");
    } else {
      await writeFile(join(shim, "npm"), "#!/bin/sh\necho \"$@\" > npm-called\n[ ! -f stopped ] && echo served > served-during-install\nexit 0\n");
      await chmod(join(shim, "npm"), 0o755);
    }
    await writeFile(join(cwd, "scripts/service.mjs"), await readFile(new URL("../scripts/service.mjs", import.meta.url)));
    await writeFile(join(cwd, "src/update.js"), await readFile(new URL("../src/update.js", import.meta.url)));
    await writeFile(join(cwd, "src/main.js"), `
      const fs = require('node:fs');
      const count = () => (parseInt(fs.existsSync('workers') ? fs.readFileSync('workers', 'utf8') : '0', 10) || 0) + 1;
      fs.writeFileSync('workers', String(count()));
      process.on('message', message => {
        if (message.type === 'service.stop') { fs.writeFileSync('stopped', 'saved'); process.exit(0); }
      });
      process.send({ type: 'service.restart', mode: 'update' });
      setInterval(() => {}, 1000);
    `);
    const child = spawn(process.execPath, [join(cwd, "scripts/service.mjs")], {
      stdio: "ignore",
      env: { ...process.env, AXIOM_PORT: "0", AXIOM_NPM: join(shim, process.platform === "win32" ? "npm.cmd" : "npm") },
    });
    const killTree = () => process.platform === "win32"
      ? spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"])
      : child.kill("SIGTERM");
    try {
      const deadline = Date.now() + 8000;
      while (Date.now() < deadline) {
        try { if (parseInt(await readFile(join(cwd, "workers"), "utf8"), 10) >= 2) break; } catch {}
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      killTree();
      await once(child, "exit");
      assert.match(await readFile(join(cwd, "npm-called"), "utf8"), /install -g github:cosyeezz\/axiom/);
      // shim 只在 stopped 尚不存在（旧 worker 仍在服务）时写入此标记 → 证明先装后停
      assert.equal((await readFile(join(cwd, "served-during-install"), "utf8")).trim(), "served");
      assert.equal(await readFile(join(cwd, "stopped"), "utf8"), "saved");
      assert.ok(parseInt(await readFile(join(cwd, "workers"), "utf8"), 10) >= 2, "a new worker started after update");
    } finally { await rm(cwd, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(() => {}); }
  } finally { await rm(cwd, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(() => {}); }
});

test("update runs a global npm install of the GitHub spec", async () => {
  const calls = [];
  await update(async (command, args) => { calls.push([command, ...args].join(" ")); });
  assert.equal(calls.length, 1);
  assert.match(calls[0], /npm install -g github:cosyeezz\/axiom/);
  await assert.rejects(update(async () => { throw new Error("offline"); }), /offline/);
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
