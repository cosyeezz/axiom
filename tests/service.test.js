import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm, chmod, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rebuild, update, stopService } from "../scripts/service.mjs";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:http";

test("axiom stop waits for supervisor exit after graceful worker save", async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'axiom-stop-'));
  let child;
  const server = createServer((req, res) => {
    assert.equal(req.method, 'POST');
    assert.equal(req.url, '/service/stop');
    res.writeHead(202, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ service: 'axiom', pid: child.pid }));
    void writeFile(join(cwd, 'shutdown'), '1');
  });
  try {
    await mkdir(join(cwd, 'scripts')); await mkdir(join(cwd, 'src'));
    await writeFile(join(cwd, 'scripts/service.mjs'), await readFile(new URL('../scripts/service.mjs', import.meta.url)));
    await writeFile(join(cwd, 'src/update.js'), await readFile(new URL('../src/update.js', import.meta.url)));
    await writeFile(join(cwd, 'src/main.js'), `
      const fs = require('node:fs');
      process.on('message', m => {
        if (m.type === 'service.stop') setTimeout(() => { fs.writeFileSync('saved', 'yes'); process.exit(0); }, 200);
      });
      const timer = setInterval(() => {
        if (fs.existsSync('shutdown')) { clearInterval(timer); process.send({ type: 'service.shutdown' }); }
      }, 20);
    `);
    child = spawn(process.execPath, [join(cwd, 'scripts/service.mjs')], { stdio: 'ignore', env: { ...process.env, AXIOM_PORT: '0' } });
    server.listen(0, '127.0.0.1'); await once(server, 'listening');
    await stopService(`http://127.0.0.1:${server.address().port}`);
    assert.equal(await readFile(join(cwd, 'saved'), 'utf8'), 'yes');
    assert.throws(() => process.kill(child.pid, 0), { code: 'ESRCH' });
  } finally {
    child?.kill();
    await new Promise(done => server.close(done));
    await rm(cwd, { recursive: true, force: true });
  }
});

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

for (const failInstall of [false, true]) test(`supervisor update ${failInstall ? "failure restores requests via restart" : "installs the exact commit before restart"}`, async () => {
  const cwd = await mkdtemp(join(tmpdir(), "axiom-update-sup-"));
  try {
    await mkdir(join(cwd, "scripts")); await mkdir(join(cwd, "src"));
    const globalRoot = join(cwd, "global");
    await mkdir(join(globalRoot, "@myworkbench"), { recursive: true });
    await symlink(cwd, join(globalRoot, "@myworkbench", "axiom"), "junction");
    const shim = join(cwd, "shim"); await mkdir(shim);
    if (process.platform === "win32") {
      await writeFile(join(shim, "npm.cmd"), `@if "%1"=="root" (echo ${globalRoot}& exit /b 0)\r\n@echo %* > "%CD%\\npm-called"\r\nif not exist stopped echo served > "%CD%\\served-during-install"\r\nexit /b ${failInstall ? 1 : 0}\r\n`);
    } else {
      await writeFile(join(shim, "npm"), `#!/bin/sh\nif [ "$1" = root ]; then printf '%s\\n' '${globalRoot}'; exit 0; fi\necho "$@" > npm-called\n[ ! -f stopped ] && echo served > served-during-install\nexit ${failInstall ? 1 : 0}\n`);
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
      fs.writeFileSync('service-error', process.env.AXIOM_SERVICE_ERROR || '');
      if (!fs.existsSync('stopped')) process.send({ type: 'service.restart', mode: 'update', sha: '${"b".repeat(40)}' });
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
      assert.ok((await readFile(join(cwd, "npm-called"), "utf8")).includes('install -g github:cosyeezz/axiom#' + 'b'.repeat(40)));
      const error = await readFile(join(cwd, "service-error"), "utf8");
      if (failInstall) {
        assert.match(error, /更新失败/);
        await assert.rejects(readFile(join(cwd, ".axiom-commit")), { code: "ENOENT" });
      } else {
        assert.equal(error, "");
        assert.equal((await readFile(join(cwd, ".axiom-commit"), "utf8")).trim(), 'b'.repeat(40));
      }
      // shim 只在 stopped 尚不存在（旧 worker 仍在服务）时写入此标记 → 证明先装后停
      assert.equal((await readFile(join(cwd, "served-during-install"), "utf8")).trim(), "served");
      assert.equal(await readFile(join(cwd, "stopped"), "utf8"), "saved");
      assert.ok(parseInt(await readFile(join(cwd, "workers"), "utf8"), 10) >= 2, "a new worker started after update");
    } finally { await rm(cwd, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(() => {}); }
  } finally { await rm(cwd, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(() => {}); }
});

test("update pins the full commit and records it only after successful installation", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "axiom-pinned-"));
  const sha = "b".repeat(40), calls = [];
  try {
    const globalRoot = join(cwd, "global");
    await mkdir(join(globalRoot, "@myworkbench"), { recursive: true });
    await symlink(cwd, join(globalRoot, "@myworkbench", "axiom"), "junction");
    const execute = async (command, args, dir, capture) => {
      calls.push([command, ...args].join(" "));
      return capture ? globalRoot + '\n' : '';
    };
    await update(sha, execute, cwd);
    assert.equal(calls.length, 3);
    assert.ok(calls[1].includes(`npm install -g github:cosyeezz/axiom#${sha}`));
    assert.equal((await readFile(join(cwd, ".axiom-commit"), "utf8")).trim(), sha);
    await assert.rejects(update("c".repeat(40), async (cmd, args, dir, capture) => {
      if (capture) return globalRoot;
      throw new Error("offline");
    }, cwd), /offline/);
    let installs = 0;
    await assert.rejects(update(sha, async (cmd, args, dir, capture) => {
      if (capture) return join(cwd, 'other-prefix');
      installs++;
    }, cwd), /目录与当前服务不一致/);
    assert.equal(installs, 0, 'wrong prefix must be rejected before npm install');
    let probes = 0;
    await assert.rejects(update('c'.repeat(40), async (cmd, args, dir, capture) => {
      if (capture) return ++probes === 1 ? globalRoot : join(cwd, 'changed-prefix');
    }, cwd), /目录与当前服务不一致/);
    assert.equal((await readFile(join(cwd, ".axiom-commit"), "utf8")).trim(), sha);
    await assert.rejects(update("bad & command", async () => assert.fail("must not run npm"), cwd), /无效/);
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
