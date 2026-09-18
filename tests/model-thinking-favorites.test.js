import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";
import { createStreamRenderer } from "../public/stream-renderer.js";
import { publicSource } from "./helpers/public-source.js";

// 思考程度收藏端到端：主 composer 星标必须按后端契约上报 provider/model:level
// （model id 含冒号时后端按最后一个冒号切分），星标渲染按映射键匹配，无模型上下文无星。
const appSource = await publicSource("markdown-scan", "memory-tags", "goal-markers", "question", "service-settings", "app");
const pickerSource = (await readFile(new URL("../public/file-picker.js", import.meta.url), "utf8")).replace(/^import .*;\r?\n/gm, "").replace(/^export /gm, "");
const modelSources = await Promise.all(["model-picker", "model-auth", "model-manager"].map(async (name) => {
  const source = await readFile(new URL(`../public/${name}.js`, import.meta.url), "utf8");
  const exports = [...source.matchAll(/^export (?:async )?(?:function|const) (\w+)/gm)].map((m) => m[1]);
  return `Object.assign(window, (() => { ${source.replace(/^import .*;\r?\n/gm, "").replace(/^export /gm, "")}\nreturn {${exports.join(",")}}; })());`;
})).then((parts) => parts.join("\n"));
const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");

const MODEL_KEY = "ollama/llama3.1:8b"; // 含冒号：验证按最后冒号切分的契约

async function bootPage() {
  const dom = new JSDOM(html, { url: "http://localhost/", runScripts: "outside-only", pretendToBeVisual: true });
  const { window } = dom;
  const $ = (id) => window.document.getElementById(id);
  window.HTMLDialogElement.prototype.close = function () { this.open = false; };
  window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  window.matchMedia = () => ({ matches: true });
  window.requestAnimationFrame = () => 0;
  window.cancelAnimationFrame = () => {};
  window.renderMarkdown = () => {};
  window.createMarkdownPageCache = () => ({ entries: new Map(), bytes: 0, stats: { hit: 0, miss: 0, store: 0, evict: 0 }, get: () => null, store: () => {} });
  window.createStreamRenderer = (render, after) => createStreamRenderer(render, after, window.requestAnimationFrame, window.cancelAnimationFrame);
  const favStore = { provider: [], model: [], thinking: [] };
  const sessionState = {
    sessionId: "s-a", title: "会话", cwd: "C:\\ws", status: "idle",
    config: { model: MODEL_KEY, thinking: "off", levels: ["off", "high"], skills: [] },
    messages: [], tasks: [], live: {},
  };
  const requests = [];
  const sockets = [];
  window.WebSocket = class {
    static OPEN = 1;
    readyState = 0;
    constructor() { sockets.push(this); }
    open() { this.readyState = 1; this.onopen(); }
    close() { this.readyState = 3; this.onclose(); }
    receive(message) { this.onmessage({ data: JSON.stringify(message) }); }
    send(raw) {
      const req = JSON.parse(raw);
      requests.push(req);
      queueMicrotask(() => {
        let data;
        switch (req.type) {
          case "service.status": data = { managed: true, error: "", version: "0.0.0", importDir: "" }; break;
          case "models.favorites.get": data = JSON.parse(JSON.stringify(favStore)); break;
          case "models.favorites.set": {
            const list = favStore[req.kind] ?? [];
            favStore[req.kind] = req.favorite ? [...list, req.key] : list.filter((v) => v !== req.key);
            data = JSON.parse(JSON.stringify(favStore));
            break;
          }
          case "models.list": data = [{ key: MODEL_KEY, provider: "ollama", name: "Llama", levels: ["off", "high"] }]; break;
          case "sessions.list": data = [{ ...sessionState, id: sessionState.sessionId }]; break;
          case "session.attach":
          case "session.create": data = JSON.parse(JSON.stringify(sessionState)); break;
          default: data = {};
        }
        this.receive({ type: "response", id: req.id, ok: true, data });
      });
    }
  };
  window.eval(`${modelSources}\n${pickerSource}\n${appSource}`);
  const drain = async () => { for (let i = 0; i < 6; i++) await new Promise(setImmediate); };
  return { dom, window, $, requests, drain, sockets };
}

const click = (w, el) => el.dispatchEvent(new w.MouseEvent("click", { bubbles: true, cancelable: true }));
const menu = (w) => w.document.querySelector(".ax-mp-menu");
const opts = (w) => [...menu(w).querySelectorAll(".ax-mp-opt")];
const stars = (w) => [...menu(w).querySelectorAll(".ax-mp-star")];

test("思考收藏：星标上报 provider/model:level，重开菜单按映射键亮星置顶，广播同步与清空熄灭", async () => {
  const page = await bootPage();
  try {
    page.sockets[0].open();
    await page.drain();
    await page.window.eval("refreshModelCatalog()");
    await page.drain();
    page.$("model").value = MODEL_KEY;
    await page.window.eval("refreshModelCatalog()");
    await page.drain();

    const thinking = page.$("thinking");
    assert.deepEqual([...thinking.options].map((o) => o.value), ["off", "high"], "思考选项为裸 level");
    click(page.window, thinking);
    assert.deepEqual(opts(page.window).map((o) => o.dataset.value), ["off", "high"]);

    const highStar = stars(page.window)[opts(page.window).findIndex((o) => o.dataset.value === "high")];
    click(page.window, highStar);
    await page.drain();
    const set = page.requests.find((r) => r.type === "models.favorites.set");
    assert.deepEqual(
      { kind: set.kind, key: set.key, favorite: set.favorite },
      { kind: "thinking", key: `${MODEL_KEY}:high`, favorite: true },
      "按契约上报 provider/model:level",
    );

    click(page.window, thinking); // 关闭
    click(page.window, thinking); // 重开：存储键经映射回亮星并置顶
    assert.equal(opts(page.window)[0].dataset.value, "high");
    assert.equal(stars(page.window)[0].getAttribute("aria-checked"), "true");

    page.sockets[0].receive({ type: "models.favorites.changed", data: { provider: [], model: [], thinking: [`${MODEL_KEY}:off`] } });
    await page.drain(); // 广播更新：off 变收藏星并置顶
    assert.deepEqual(opts(page.window).map((o) => o.dataset.value), ["off", "high"]);
    assert.equal(stars(page.window).find((s) => s.dataset.value === "off")?.getAttribute("aria-checked"), "true", "广播后 off 亮星");

    page.sockets[0].receive({ type: "models.favorites.changed", data: { provider: [], model: [], thinking: [] } }); // 服务端广播：收藏被另一端清空
    await page.drain(); // onmessage 更新 modelFavorites → syncAll 原地重渲染
    assert.ok(stars(page.window).every((s) => s.getAttribute("aria-checked") === "false"), "收藏被清空后星标即时熄灭");
  } finally { page.dom.window.close(); }
});
