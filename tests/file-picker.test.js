import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";
import { publicSource } from "./helpers/public-source.js";

const source = await publicSource("file-picker");
const tick = () => new Promise(setImmediate);

test("shared picker loads one directory at a time, paginates, selects and ignores stale replies", async () => {
  const dom = new JSDOM("<button id='opener'>打开</button>", { runScripts: "outside-only", pretendToBeVisual: true });
  const { window } = dom;
  window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  window.HTMLDialogElement.prototype.close = function () { this.open = false; this.dispatchEvent(new window.Event("close")); };
  const calls = [];
  window.request = (type, args) => new Promise((resolve, reject) => calls.push({ type, args, resolve, reject }));
  const $ = (id) => window.document.getElementById(id);
  const reply = (call, path, entries, nextOffset = null) => call.resolve({ path, parent: path ? "" : null, entries, nextOffset, breadcrumbs: [{ name: "工作空间", path: "" }], locations: [] });
  try {
    window.eval(`${source}\nwindow.picker = createFilePicker(window.request); window.icon = fileIcon;`);
    $("opener").focus();
    const selection = window.picker.open({ title: "选择文件", sessionId: "a", path: "", mode: "file" });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].type, "files.browse");
    reply(calls[0], "", [{ name: "src", path: "src", directory: true }]); await tick();
    assert.equal(calls.length, 1, "render does not prefetch children");
    $("file-picker-results").querySelector("button").click();
    assert.equal(calls[1].args.path, "src");
    reply(calls[1], "src", [{ name: "a.js", path: "src/a.js", directory: false }], 200); await tick();
    const more = [...$("file-picker").querySelectorAll("button")].find((button) => /加载更多/.test(button.textContent));
    assert.ok(more); more.click();
    assert.equal(calls[2].args.offset, 200);
    reply(calls[2], "src", [{ name: "<img onerror=alert(1)>.png", path: "src/image.png", directory: false }]); await tick();
    assert.equal($("file-picker-results").querySelectorAll("img").length, 0);
    $("file-picker-results").querySelector("button").click();
    $("file-picker-confirm").click();
    assert.equal((await selection).path, "src/a.js");
    assert.equal(window.document.activeElement, $("opener"));

    const old = window.picker.open({ mode: "folder", path: "/old" });
    const oldCall = calls.at(-1);
    window.picker.close(); assert.equal(await old, null);
    const current = window.picker.open({ mode: "folder", path: "/new" });
    const currentCall = calls.at(-1);
    assert.equal($("file-picker-confirm").disabled, true, "unvalidated folder cannot be selected");
    reply(currentCall, "/new", [{ name: "new", path: "/new/new", directory: true }]); await tick();
    reply(oldCall, "/old", [{ name: "stale", path: "/old/stale", directory: true }]); await tick();
    assert.doesNotMatch($("file-picker-results").textContent, /stale/);
    $("file-picker-confirm").click();
    assert.equal((await current).path, "/new");
    assert.notEqual(window.icon({ name: "image.png" }).outerHTML, window.icon({ name: "code.ts" }).outerHTML);
    assert.equal(window.icon({ name: "image.png" }).hasAttribute("style"), false, "icons work under the real CSP");
    const failed = window.picker.open({ mode: "folder", path: "/missing" });
    calls.at(-1).reject(new Error("目录不存在")); await tick();
    assert.equal($("file-picker-confirm").disabled, true);
    assert.match($("file-picker-status").textContent, /目录不存在/);
    $("file-picker-status").querySelector("button").click();
    reply(calls.at(-1), "/missing", []); await tick();
    $("file-picker-search").value = "new";
    $("file-picker-search").dispatchEvent(new window.Event("input"));
    assert.equal($("file-picker-confirm").disabled, true);
    $("file-picker-search").dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter" }));
    assert.equal(calls.at(-1).args.query, "new");
    $("file-picker").dispatchEvent(new window.Event("cancel", { cancelable: true }));
    assert.equal(await failed, null);
  } finally { dom.window.close(); }
});
