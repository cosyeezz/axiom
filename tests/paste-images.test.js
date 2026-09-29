import test from "node:test";
import assert from "node:assert/strict";
import { bootSessionPage, until, settle } from "./helpers/session-page.js";

async function rig(t, options = {}) {
  const page = bootSessionPage({ sessionId: "a", records: [], ...options });
  t.after(page.close); page.open();
  await until(() => page.app.connected(), "连接完成");
  const readers = [];
  page.window.FileReader = class {
    readAsDataURL(file) { this.file = file; readers.push(this); }
    abort() { this.aborted = true; this.onabort(); }
    finish(data = "iVBORw0KGgo=") { this.result = `data:image/png;base64,${data}`; this.onload(); }
    fail() { this.onerror(); }
  };
  const file = () => new page.window.File(["image"], "paste.png", { type: "image/png" });
  const paste = (count = 1, fallback = false) => {
    let prevented = false;
    const files = Array.from({ length: count }, file);
    page.$("prompt").onpaste({ clipboardData: fallback ? { files } : {
      items: files.map((value) => ({ kind: "file", type: value.type, getAsFile: () => value })), files,
    }, preventDefault() { prevented = true; } });
    assert.equal(prevented, true);
  };
  const draft = (text, start = text.length, end = start) => {
    page.$("prompt").value = text; page.$("prompt").setSelectionRange(start, end);
  };
  return { ...page, readers, paste, draft };
}

test("连续粘贴同步预留编号，乱序完成不改光标，发送保持粘贴顺序", async (t) => {
  const p = await rig(t);
  p.draft("前后", 1); p.paste();
  p.$("prompt").setRangeText("继续", 9, 9, "end"); p.paste(1, true);
  assert.equal(p.$("prompt").value, "前[image1]继续[image2]后");
  assert.equal(p.readers.length, 2);
  const cursor = p.$("prompt").selectionStart;
  assert.equal(p.$("send").disabled, true);
  p.$("composer").requestSubmit();
  await p.app.withdrawQueue();
  assert.equal(p.requests.some((req) => ["prompt", "queue.withdraw"].includes(req.type)), false);
  assert.equal(p.$("image-attachments").querySelectorAll("button:disabled").length, 2);
  p.readers[1].finish("second"); await settle();
  assert.equal(p.$("send").disabled, true);
  p.readers[0].finish("first"); await settle();
  assert.equal(p.$("prompt").selectionStart, cursor);
  assert.equal(p.$("send").disabled, false);
  p.$("composer").requestSubmit(); p.paint();
  await until(() => p.requests.some((req) => req.type === "prompt"), "发送图片");
  const request = p.requests.find((req) => req.type === "prompt");
  assert.deepEqual(request.images.map((image) => image.data), ["first", "second"]);
  assert.deepEqual(Object.keys(request.images[0]).sort(), ["data", "mimeType", "type"]);
});

test("在途图片计入4张上限，不重复读 clipboard items/files，断线拒绝有提示", async (t) => {
  const p = await rig(t);
  for (let i = 0; i < 4; i++) p.paste();
  const before = p.$("prompt").value;
  p.paste();
  assert.equal(p.$("prompt").value, before);
  assert.equal(p.readers.length, 4);
  assert.match(p.$("error").textContent, /最多.*4/);
  for (const reader of p.readers) reader.finish();
  await settle();
  p.app.setConnected(false); p.paste();
  assert.match(p.$("error").textContent, /连接不可用/);
  assert.equal(p.$("prompt").value, before);
});

test("失败按槽位重新编号，后一次粘贴插在前面也可回滚选区并保留光标", async (t) => {
  const p = await rig(t);
  p.draft("前选后", 1, 2); p.paste();
  p.$("prompt").setSelectionRange(0, 0); p.paste();
  assert.equal(p.$("prompt").value, "[image2]前[image1]后");
  p.readers[1].finish(); await settle();
  p.readers[0].fail(); await settle();
  assert.equal(p.$("prompt").value, "[image1]前选后");
  assert.equal(p.$("prompt").selectionStart, 8);
  assert.equal(p.$("image-attachments").querySelectorAll("img").length, 1);
  assert.equal(p.$("send").disabled, false);
  assert.match(p.$("error").textContent, /读取失败/);
});

test("整批读取失败不留半批图片，迟到完成不复活附件，后续粘贴正常", async (t) => {
  const p = await rig(t);
  p.paste(2); p.paste();
  p.readers[0].fail(); await settle();
  assert.equal(p.readers[1].aborted, true, "同批剩余读取立即终止，不在释放容量后继续占资源");
  assert.equal(p.$("prompt").value, "[image1]");
  p.readers[1].finish(); p.readers[2].finish(); await settle();
  assert.equal(p.$("image-attachments").querySelectorAll("img").length, 1);
  p.paste(); p.readers[3].finish(); await settle();
  assert.equal(p.$("prompt").value, "[image1][image2]");
});

test("多批失败恢复选区中的图片引用时按身份重编号，不把旧编号指向另一张图", async (t) => {
  const p = await rig(t);
  p.paste(); p.paste(); p.readers[1].finish("B"); await settle();
  p.$("prompt").setSelectionRange(8, 16); p.paste(); p.paste();
  p.readers[3].finish("D"); await settle();
  p.readers[0].fail(); await settle();
  p.readers[2].fail(); await settle();
  assert.equal(p.$("prompt").value, "[image1][image2]");
  assert.deepEqual([...p.$("image-attachments").querySelectorAll("img")].map((img) => img.src.split(",")[1]), ["B", "D"]);
});

test("读图跨会话隔离，切换回执前完成也保留；删除缓存不被迟到回调重建", async (t) => {
  const p = await rig(t, { respond(req, base) {
    if (req.type === "sessions.list") return ["a", "b"].map((id) => ({ id, title: id, cwd: "C:/work", status: "idle" }));
    return base(req);
  } });
  p.paste();
  let release;
  const switching = p.app.switchSession(() => new Promise((resolve) => { release = resolve; }));
  p.readers[0].finish("a"); await settle();
  release(p.fullState({ sessionId: "b" })); await switching;
  assert.equal(p.$("image-attachments").hidden, true);
  p.paste(); p.readers[1].finish("b"); await settle();
  assert.equal(p.$("send").disabled, false);
  await p.app.switchSession(async () => p.fullState({ sessionId: "a" }));
  assert.equal(p.$("prompt").value, "[image1]");
  assert.match(p.$("image-attachments").querySelector("img").src, /base64,a$/);
  p.paste();
  await p.app.switchSession(async () => p.fullState({ sessionId: "b" }));
  p.app.views.delete("a");
  p.readers[2].fail(); await settle();
  assert.equal(p.app.views.has("a"), false);
  assert.match(p.$("image-attachments").querySelector("img").src, /base64,b$/);
});

for (const failed of [false, true]) test(`外部删除当前会话后迁移在途图片，迟到${failed ? "失败" : "成功"}只更新新草稿`, async (t) => {
  let deleted = false;
  const p = await rig(t, { hold: (req) => req.type === "session.create", respond(req, base) {
    if (req.type === "session.create") return p.fullState({ sessionId: "recovered" });
    if (req.type === "sessions.list" && deleted) return [{ id: "recovered", title: "recovered", cwd: "C:/work", status: "idle" }];
    return base(req);
  } });
  p.draft("保留正文"); p.paste(); deleted = true;
  p.app.event({ type: "session.deleted", sessionId: "a" });
  await until(() => p.held() === 1, "恢复新会话在途");
  p.release();
  await until(() => p.app.session() === "recovered", "草稿迁移");
  if (failed) p.readers[0].fail(); else p.readers[0].finish();
  await settle();
  assert.equal(p.$("prompt").value, failed ? "保留正文" : "保留正文[image1]");
  assert.equal(p.$("image-attachments").querySelectorAll("img").length, failed ? 0 : 1);
  assert.equal(p.requests.some((req) => req.type === "prompt"), false);
});

test("图片读取无响应会超时报错解锁，异常结果不会留下附件", async (t) => {
  const p = await rig(t);
  const original = p.window.setTimeout;
  let expire;
  p.window.setTimeout = (fn, delay, ...args) => delay === 30000 ? (expire = fn, 0) : original(fn, delay, ...args);
  p.paste(); expire(); await settle();
  assert.match(p.$("error").textContent, /读取超时/);
  assert.equal(p.$("image-attachments").hidden, true);
  p.paste(); p.readers[1].result = null; p.readers[1].onload(); await settle();
  assert.match(p.$("error").textContent, /读取结果无效/);
  assert.equal(p.$("prompt").value, "");
  p.window.setTimeout = original;
});

test("旧消息发送失败不覆盖新粘贴中的草稿", async (t) => {
  const p = await rig(t, { hold: (req) => req.type === "prompt", respond(req, base) {
    if (req.type === "prompt") throw new Error("发送被拒");
    return base(req);
  } });
  p.draft("旧草稿"); p.$("composer").requestSubmit(); p.paint();
  await until(() => p.held() === 1, "旧发送在途");
  p.paste(); p.release(); await settle();
  assert.equal(p.$("prompt").value, "[image1]");
  p.readers[0].finish(); await settle();
  assert.equal(p.$("image-attachments").querySelectorAll("img").length, 1);
});
