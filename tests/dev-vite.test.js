import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import WebSocket, { WebSocketServer } from "ws";
import { startDevWeb } from "../scripts/dev-vite.mjs";

test("Vite 隔离入口：导入、CSS、代理同源校验与暂停整页刷新", async () => {
  const backend = createServer((req, res) => res.end(JSON.stringify({ pid: process.pid, path: req.url })));
  const wss = new WebSocketServer({ noServer: true });
  let headers;
  backend.on("upgrade", (req, socket, head) => {
    headers = req.headers;
    wss.handleUpgrade(req, socket, head, (ws) => { ws.on("error", () => {}); ws.send("business"); });
  });
  backend.listen(0, "127.0.0.1"); await once(backend, "listening");
  const probe = createServer(); probe.listen(0, "127.0.0.1"); await once(probe, "listening");
  const port = probe.address().port;
  await new Promise((resolve) => probe.close(resolve));
  const vite = await startDevWeb({ port, backendPort: backend.address().port, watch: false });
  const base = `http://127.0.0.1:${port}`;
  const clients = [];
  try {
    const page = await fetch(base);
    assert.match(await page.text(), /@vite\/client/);
    assert.match(page.headers.get("content-security-policy"), /script-src 'self'/);
    assert.equal((await fetch(`${base}/style.css`)).status, 200);
    const markdown = await (await fetch(`${base}/markdown.js`)).text();
    assert.match(markdown, /marked/);
    assert.doesNotMatch(markdown, /Failed to resolve/);
    assert.equal((await (await fetch(`${base}/health`)).json()).pid, process.pid);
    assert.equal((await fetch(`${base}/health`, { headers: { origin: "https://evil.example" } })).status, 403);
    const ws = new WebSocket(`${base.replace('http:', 'ws:')}/ws`, ["axiom"], { origin: base }); clients.push(ws);
    assert.equal(String((await once(ws, "message"))[0]), "business");
    assert.equal(headers.origin, `http://127.0.0.1:${backend.address().port}`);
    assert.equal(headers.host, `127.0.0.1:${backend.address().port}`);
    const bad = new WebSocket(`${base.replace('http:', 'ws:')}/ws`, ["axiom"], { origin: "https://evil.example" }); clients.push(bad);
    await once(bad, "error");
    const warnings = [];
    vite.config.logger.warn = (text) => warnings.push(text);
    vite.ws.send({ type: "full-reload", path: "*" });
    assert.match(warnings[0], /自动刷新已暂停/);
    assert.equal((await (await fetch(`${base}/health`)).json()).pid, process.pid);
  } finally {
    for (const ws of clients) ws.terminate();
    for (const ws of wss.clients) ws.terminate();
    await vite.close();
    await new Promise((resolve) => wss.close(resolve));
    await new Promise((resolve) => backend.close(resolve));
  }
});
