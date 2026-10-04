import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

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
