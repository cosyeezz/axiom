// AXIOM_DEV 必须在导入 server.js 前设置：dev 标志在模块加载期读取一次。
process.env.AXIOM_DEV = "1";

import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { readFile, writeFile, utimes } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const { createServerApp } = await import("../src/server.js");

test("dev 模式下改前端文件无需重启：按 mtime 重读并换新 ETag", async () => {
  const sessions = { createAgent: () => {}, list: () => [], items: new Map() };
  const app = createServerApp(sessions);
  const file = fileURLToPath(new URL("../public/style.css", import.meta.url));
  const original = await readFile(file);
  app.server.listen(0, "127.0.0.1");
  await once(app.server, "listening");
  const url = `http://127.0.0.1:${app.server.address().port}/style.css`;
  try {
    const before = await fetch(url);
    const firstTag = before.headers.get("etag");
    assert.equal(before.status, 200);
    assert(firstTag);
    assert(!(await before.text()).includes("axiom-dev-probe"));

    // mtime 需与原值不同：文件系统时间精度可能粗于一次写入间隔，显式推进一秒。
    await writeFile(file, Buffer.concat([original, Buffer.from("\n/* axiom-dev-probe */\n")]));
    const future = new Date(Date.now() + 1000);
    await utimes(file, future, future);

    const after = await fetch(url);
    assert.equal(after.status, 200);
    assert.notEqual(after.headers.get("etag"), firstTag);
    assert((await after.text()).includes("axiom-dev-probe"));

    // 旧 ETag 不再命中缓存，客户端刷新即拿到新内容。
    const stale = await fetch(url, { headers: { "If-None-Match": firstTag } });
    assert.equal(stale.status, 200);
    await stale.arrayBuffer();
  } finally {
    await writeFile(file, original);
    await new Promise((resolve) => app.server.close(resolve));
  }
});
