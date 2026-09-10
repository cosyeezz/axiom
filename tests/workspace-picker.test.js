import test from "node:test";
import assert from "node:assert/strict";
import childProcess from "node:child_process";
import { syncBuiltinESMExports } from "node:module";
import { Sessions } from "../src/sessions.js";

test("workspace picker owns its dialog and releases the lock after selection, cancel or failure", { skip: process.platform !== "win32" }, async () => {
  let complete, missingModern = false;
  const calls = [];
  const original = childProcess.execFile;
  childProcess.execFile = (file, args, options, callback) => {
    calls.push(file);
    assert.equal(file, missingModern && calls.at(-2) === "pwsh.exe" ? "powershell.exe" : "pwsh.exe");
    if (missingModern && file === "pwsh.exe") {
      callback(Object.assign(new Error("not installed"), { code: "ENOENT" }));
      return;
    }
    assert.ok(args.includes("-STA"));
    const script = Buffer.from(args.at(-1), "base64").toString("utf16le");
    assert.match(script, /\$ErrorActionPreference = "Stop"/);
    assert.match(script, /EnableVisualStyles\(\)/);
    assert.match(script, /\$dialog.AutoUpgradeEnabled = \$true/);
    assert.match(script, /\$dialog.UseDescriptionForTitle = \$true/);
    assert.match(script, /\$owner.TopMost = \$true/);
    assert.ok(script.indexOf("$owner.Show()") < script.indexOf("$dialog.ShowDialog($owner)"));
    assert.match(script, /\$owner.Activate\(\)/);
    assert.match(script, /finally\s*{\s*\$dialog.Dispose\(\)\s*\$owner.Dispose\(\)/);
    assert.equal(options.windowsHide, true);
    assert.equal(options.timeout, 300000);
    complete = (error, stdout) => callback(error, { stdout });
  };
  syncBuiltinESMExports();
  try {
    const sessions = new Sessions(() => {});
    let result = sessions.pickWorkspace();
    await assert.rejects(sessions.pickWorkspace(), /上一次目录选择尚未结束/);
    complete(null, "F:\\中文 工作空间", "");
    assert.deepEqual(await result, { path: "F:\\中文 工作空间" });
    result = sessions.pickWorkspace();
    complete(null, "", "");
    assert.deepEqual(await result, { path: null });
    result = sessions.pickWorkspace();
    complete(Object.assign(new Error("killed"), { killed: true }), "", "");
    await assert.rejects(result, /目录选择已超时/);
    assert.equal(sessions.pickingWorkspace, false);
    result = sessions.pickWorkspace();
    complete(new Error("PowerShell failed"), "", "");
    await assert.rejects(result, /PowerShell failed/);
    assert.equal(sessions.pickingWorkspace, false);
    assert.ok(calls.every((file) => file === "pwsh.exe"));
    calls.length = 0;
    missingModern = true;
    result = sessions.pickWorkspace();
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(calls, ["pwsh.exe", "powershell.exe"]);
    complete(null, "F:\\fallback");
    assert.deepEqual(await result, { path: "F:\\fallback" });
  } finally {
    childProcess.execFile = original;
    syncBuiltinESMExports();
  }
});
