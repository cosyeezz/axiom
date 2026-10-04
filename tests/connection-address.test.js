import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const connector = (await readFile(new URL("../desktop/connector/index.html", import.meta.url), "utf8")).match(/<script>([\s\S]*?)<\/script>/)[1];
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
function bootConnector() {
  const elements = Object.fromEntries(["address", "connect", "status"].map(id => [id, {
    value: "", textContent: "", disabled: false, dataset: {}, listeners: {},
    addEventListener(name, fn) { this.listeners[name] = fn; }, focus() {}, select() {},
  }]));
  const probes = [], navigations = [], writes = [];
  vm.runInNewContext(connector, {
    URL, AbortSignal: { timeout() { return {}; } },
    document: { getElementById: id => elements[id] },
    localStorage: { getItem: () => "http://127.0.0.1:4319", setItem: (...args) => writes.push(args) },
    location: { set href(value) { navigations.push(value); } },
    fetch: url => new Promise((resolve, reject) => probes.push({ url, resolve, reject })),
  });
  return { elements, probes, navigations, writes };
}
for (const savedSuccess of [true, false]) test(`connector ignores stale saved probe (${savedSuccess ? "success" : "failure"}) after manual port selection`, async () => {
  const r = bootConnector(), { address, connect, status } = r.elements;
  address.value = "127.0.0.1:4320"; connect.onclick();
  const message = status.textContent;
  r.probes[0][savedSuccess ? "resolve" : "reject"](); await flush();
  assert.deepEqual(r.navigations, []); assert.equal(status.textContent, message);
  r.probes[1].resolve(); await flush();
  assert.deepEqual(r.navigations, ["http://127.0.0.1:4320"]);
  assert.equal(r.writes[0][1], "http://127.0.0.1:4320");
});
test("connector editing cancels old navigation; current failure allows a fresh attempt", async () => {
  const r = bootConnector(), { address, connect, status } = r.elements;
  address.value = "127.0.0.1:4320"; address.listeners.input?.();
  r.probes[0].resolve(); await flush(); assert.deepEqual(r.navigations, []);
  connect.onclick(); r.probes[1].reject(); await flush();
  assert.equal(connect.disabled, false); assert.equal(status.dataset.kind, "error");
  connect.onclick();
  address.value = "127.0.0.1:4319"; address.listeners.input?.();
  r.probes[2].resolve(); await flush(); assert.deepEqual(r.navigations, []);
  connect.onclick(); r.probes[3].resolve(); await flush();
  assert.deepEqual(r.navigations, ["http://127.0.0.1:4319"]);
});

test("connector ignores an old manual failure while a newer port probe is pending", async () => {
  const r = bootConnector(), { address, connect, status } = r.elements;
  connect.onclick();
  address.value = "127.0.0.1:4320"; address.listeners.input(); connect.onclick();
  const message = status.textContent;
  r.probes[1].reject(); await flush();
  assert.equal(connect.disabled, true); assert.equal(status.textContent, message);
  assert.deepEqual(r.navigations, []);
  r.probes[2].resolve(); await flush();
  assert.deepEqual(r.navigations, ["http://127.0.0.1:4320"]);
});

// Execute both shipped implementations, not a copy of the algorithm.
for (const [file, name] of [["public/app.js", "normalizeBackendAddress"], ["desktop/connector/index.html", "normalize"]]) {
  test(`${file}: explicit standard ports and distinct backend ports retain their meanings`, async () => {
    const source = await readFile(new URL(`../${file}`, import.meta.url), "utf8");
    const body = source.match(new RegExp(`function ${name}\\(raw\\) \\{[\\s\\S]*?\\n *\\}`))[0];
    const normalize = new Function(`${body}; return ${name};`)();
    for (const [input, output] of [
      ["localhost", "http://localhost:4319"], ["localhost:80", "http://localhost"],
      ["http://localhost:80", "http://localhost"], ["https://example.com:443", "https://example.com"],
      ["http://localhost", "http://localhost"], ["https://example.com", "https://example.com"],
      ["http://localhost:443", "http://localhost:443"], ["https://example.com:80", "https://example.com:80"],
      ["127.0.0.1:4319", "http://127.0.0.1:4319"], ["127.0.0.1:4320", "http://127.0.0.1:4320"],
      ["[::1]", "http://[::1]:4319"], ["[::1]:80", "http://[::1]"],
      ["https://[::1]:443/path?secret=1#session", "https://[::1]"],
      [" example.com:9000/path?q=1#hash ", "http://example.com:9000"],
      ["example.com/path", "http://example.com:4319"],
    ]) assert.equal(normalize(input), output, input);
    for (const input of ["", " ", "host:0", "host:65536", "host:-1", "host:", "http://host:",
      "http://user:pass@host", "javascript://x", "ftp://x", "http://", "::1", "host\\other", "bad host"])
      assert.equal(normalize(input), null, input);
  });
}
