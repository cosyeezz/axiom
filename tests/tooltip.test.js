import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";

const source = await readFile(new URL("../public/tooltip.js", import.meta.url), "utf8");

// tooltip 的延迟全走 window.setTimeout，用可确定性 flush 的假定时器替换。
// opts.sheets：注入模拟的外部 tooltip.css stylesheet（jsdom 不加载外部样式，CSP 也不允许 <style>）；
// opts.popover：给 HTMLElement 装上按浏览器语义抛错的 showPopover/hidePopover 桩（jsdom 未实现）。
function boot(html = "", opts = {}) {
  const dom = new JSDOM(`<!doctype html><html><head></head><body>${html}</body></html>`, {
    runScripts: "outside-only",
    pretendToBeVisual: true,
  });
  const { window } = dom;
  if (opts.sheets) {
    const sheet = {
      href: "/tooltip.css",
      cssRules: [],
      insertRule(rule, index = this.cssRules.length) {
        this.cssRules.splice(index, 0, { cssText: rule, style: {} });
        return index;
      },
    };
    Object.defineProperty(window.document, "styleSheets", { value: [sheet], configurable: true });
    window.tooltipSheet = sheet;
  }
  if (opts.popover) {
    const calls = [];
    window.popoverCalls = calls;
    for (const name of ["showPopover", "hidePopover"]) {
      window.HTMLElement.prototype[name] = function () {
        if (name === "showPopover" && !this.isConnected) {
          throw new window.DOMException("not connected", "NotSupportedError");
        }
        calls.push(name === "showPopover" ? "show" : "hide");
      };
    }
  }
  let seq = 0;
  const pending = new Map();
  window.setTimeout = (fn, ms) => {
    const id = ++seq;
    pending.set(id, { fn, ms: ms || 0 });
    return id;
  };
  window.clearTimeout = (id) => pending.delete(id);
  window.flush = (ms = Number.MAX_SAFE_INTEGER) => {
    let again = true;
    while (again) {
      again = false;
      for (const [id, t] of [...pending]) {
        if (t.ms <= ms) {
          pending.delete(id);
          t.fn();
          again = true;
          break;
        }
      }
    }
  };
  window.eval(source);
  return window;
}

// relatedTarget / pointerType / key 不是 Event 构造参数（bubbles/cancelable 除外），事后挂上。
const fire = (el, type, props = {}) => {
  const e = new el.ownerDocument.defaultView.Event(type, { bubbles: props.bubbles ?? true, cancelable: true });
  for (const [k, v] of Object.entries(props)) if (k !== "bubbles" && k !== "cancelable") e[k] = v;
  el.dispatchEvent(e);
};

const tip = (window) => window.document.getElementById("ax-tooltip");

test("悬停显示前摘除原生 title，SHOW_DELAY 后显示，移开后完整恢复", () => {
  const window = boot(`<button id="b" title="复制工作空间路径">复制</button>`);
  const b = window.document.getElementById("b");
  fire(b, "pointerover", { pointerType: "mouse" });
  const t = tip(window);
  assert.equal(b.hasAttribute("title"), false, "悬停即摘除，原生提示永不出现");
  assert.ok(!t.classList.contains("ax-show"), "延迟内不显示");
  assert.equal(t.getAttribute("style"), null, "绝不写 inline style（CSP）");
  window.flush(500);
  assert.ok(t.classList.contains("ax-show"));
  assert.equal(t.textContent, "复制工作空间路径", "原文完整展示");
  assert.equal(b.getAttribute("aria-describedby"), "ax-tooltip");
  fire(b, "pointerout");
  window.flush();
  assert.equal(b.getAttribute("title"), "复制工作空间路径", "title 完整恢复");
  assert.equal(b.hasAttribute("aria-describedby"), false);
  assert.ok(!t.classList.contains("ax-show"));
  assert.equal(t.parentElement, null, "回退路径下隐藏即摘除节点");
});

test("aria-describedby 已有值时合并而非覆盖，恢复原值", () => {
  const window = boot(`<input id="i" title="提示" aria-describedby="composer-help" />`);
  const i = window.document.getElementById("i");
  fire(i, "pointerover", { pointerType: "mouse" });
  window.flush();
  assert.equal(i.getAttribute("aria-describedby"), "composer-help ax-tooltip");
  fire(i, "pointerout");
  window.flush();
  assert.equal(i.getAttribute("aria-describedby"), "composer-help");
});

test("无文字图标按钮摘除 title 期间用 aria-label 保住可访问名称；已有 aria-label 则不动", () => {
  const window = boot(`<button id="a" title="复制路径"></button><button id="b" title="新会话" aria-label="已有名称"></button>`);
  const [a, b] = [window.document.getElementById("a"), window.document.getElementById("b")];
  fire(a, "pointerover", { pointerType: "mouse" });
  assert.equal(a.getAttribute("aria-label"), "复制路径");
  fire(a, "pointerout");
  window.flush();
  assert.equal(a.hasAttribute("aria-label"), false, "恢复后撤掉临时代名");
  fire(b, "pointerover", { pointerType: "mouse" });
  assert.equal(b.getAttribute("aria-label"), "已有名称", "不覆盖已有 aria-label");
  fire(b, "pointerout");
  window.flush();
  assert.equal(b.getAttribute("aria-label"), "已有名称");
});

test("键盘聚焦立即显示，失焦恢复（真实焦点移动）", () => {
  const window = boot(`<button id="b" title="聚焦提示">x</button><button id="c">c</button>`);
  const b = window.document.getElementById("b");
  b.focus(); // jsdom 的 focus() 原生派发 focusin
  const t = tip(window);
  assert.ok(t.classList.contains("ax-show"), "键盘路径无延迟");
  assert.equal(t.textContent, "聚焦提示");
  window.document.getElementById("c").focus(); // 原生派发 b 的 focusout
  assert.equal(b.getAttribute("title"), "聚焦提示");
  assert.ok(!t.classList.contains("ax-show"));
});

test("关闭时焦点仍在元素上（如滚动关闭）则暂缓恢复，真正离开才恢复", () => {
  const window = boot(`<button id="b" title="滚动提示">x</button><button id="c">c</button>`);
  const b = window.document.getElementById("b");
  b.focus(); // 原生 focusin → 立即显示
  const t = tip(window);
  fire(b, "scroll"); // 捕获阶段收到，关闭提示（回退路径下节点被摘除）
  window.flush();
  assert.ok(!t.classList.contains("ax-show"));
  assert.equal(b.hasAttribute("title"), false, "焦点未离开，暂缓恢复避免原生提示突现");
  window.document.getElementById("c").focus(); // 原生 focusout → 现在才恢复
  assert.equal(b.getAttribute("title"), "滚动提示");
});

test("Esc、resize 关闭并恢复；提示内容自身滚动不关闭", () => {
  const window = boot(`<button id="b" title="T">x</button>`);
  const b = window.document.getElementById("b");
  fire(b, "pointerover", { pointerType: "mouse" });
  const t = tip(window);
  window.flush();
  fire(t, "scroll", { bubbles: false });
  window.flush();
  assert.ok(t.classList.contains("ax-show"), "提示内部滚动不关闭");
  fire(b, "keydown", { key: "Escape" }); // 冒泡到 document 委托
  assert.equal(b.getAttribute("title"), "T", "Esc 恢复");
  fire(b, "pointerover", { pointerType: "mouse" });
  window.flush();
  window.dispatchEvent(new window.Event("resize"));
  assert.equal(b.getAttribute("title"), "T", "resize 恢复");
});

test("可悬停提示内容：移入不关闭，从提示内容离开才关闭", () => {
  const window = boot(`<button id="b" title="T">x</button>`);
  const b = window.document.getElementById("b");
  fire(b, "pointerover", { pointerType: "mouse" });
  const t = tip(window);
  window.flush();
  fire(b, "pointerout", { relatedTarget: t });
  window.flush();
  assert.ok(t.classList.contains("ax-show"), "移向提示内容不关闭");
  assert.equal(b.hasAttribute("title"), false);
  fire(t, "pointerout");
  window.flush();
  assert.ok(!t.classList.contains("ax-show"));
  assert.equal(b.getAttribute("title"), "T");
});

test("悬停中快速换目标：旧目标恢复、新目标接管", () => {
  const window = boot(`<button id="a" title="A">a</button><button id="b" title="B">b</button>`);
  const [a, b] = [window.document.getElementById("a"), window.document.getElementById("b")];
  fire(a, "pointerover", { pointerType: "mouse" });
  window.flush();
  fire(b, "pointerover", { pointerType: "mouse" });
  window.flush();
  assert.equal(a.getAttribute("title"), "A", "旧目标已恢复");
  assert.equal(b.hasAttribute("title"), false);
  assert.equal(tip(window).textContent, "B");
  assert.ok(tip(window).classList.contains("ax-show"));
});

test("空 title 不展示且原样保留，内部移动不闪关", () => {
  const window = boot(`<button id="e" title="">x</button><button id="b" title="T"><span id="s">s</span></button>`);
  const e = window.document.getElementById("e");
  fire(e, "pointerover", { pointerType: "mouse" });
  window.flush();
  assert.equal(e.getAttribute("title"), "");
  assert.ok(!tip(window).classList.contains("ax-show"), "空标题不展示");
  assert.equal(e.hasAttribute("aria-describedby"), false);
  const b = window.document.getElementById("b");
  fire(b, "pointerover", { pointerType: "mouse" });
  window.flush();
  fire(window.document.getElementById("s"), "pointerout", { relatedTarget: b });
  window.flush();
  assert.ok(tip(window).classList.contains("ax-show"), "目标内部子元素间移动不关闭");
});

test("触摸不摘除 title 也不显示", () => {
  const window = boot(`<button id="b" title="T">x</button>`);
  const b = window.document.getElementById("b");
  fire(b, "pointerover", { pointerType: "touch" });
  window.flush();
  assert.equal(b.getAttribute("title"), "T");
  assert.ok(!tip(window).classList.contains("ax-show"));
});

test("动态插入的节点同样被委托覆盖；dialog 内挂进 dialog 保证顶层可见", () => {
  const window = boot(`<dialog id="d"><button id="b" title="T">x</button></dialog>`);
  const d = window.document.getElementById("d");
  d.setAttribute("open", "");
  const b = window.document.getElementById("b");
  fire(b, "pointerover", { pointerType: "mouse" });
  window.flush();
  assert.equal(tip(window).textContent, "T", "动态/静态统一由委托处理");
  if (typeof window.HTMLElement.prototype.showPopover === "function") {
    assert.equal(tip(window).parentElement, window.document.body, "Popover API：top layer");
  } else {
    assert.equal(tip(window).parentElement, d, "回退路径：挂进打开的 dialog");
  }
});

test("定位复用外部 tooltip.css stylesheet 的 CSSOM，不新建 <style> 也不写 inline style（CSP）", () => {
  const window = boot(`<button id="b" title="T">x</button>`, { sheets: true });
  fire(window.document.getElementById("b"), "pointerover", { pointerType: "mouse" });
  window.flush();
  const { cssRules } = window.tooltipSheet;
  assert.equal(cssRules.length, 1, "规则追加进外部 stylesheet");
  assert.match(cssRules[0].style.left, /px$/);
  assert.match(cssRules[0].style.top, /px$/);
  assert.equal(window.document.querySelector("style"), null, "绝不新建 <style> 元素（空 style 也被 CSP 拦）");
  assert.equal(tip(window).getAttribute("style"), null);
  // 无外部 stylesheet（未打 sheets 桩）时静默降级，不影响显示流程
  const plain = boot(`<button id="c" title="T">x</button>`);
  fire(plain.document.getElementById("c"), "pointerover", { pointerType: "mouse" });
  plain.flush();
  assert.ok(tip(plain).classList.contains("ax-show"), "找不到 stylesheet 时仍显示，只是不定位");
});

test("reveal 前 hide 摘除节点后再次显示：重新挂载，showPopover 不断链", () => {
  const window = boot(`<button id="b" title="T">x</button>`, { popover: true });
  const b = window.document.getElementById("b");
  const t = tip(window);
  fire(b, "pointerover", { pointerType: "mouse" });
  fire(b, "keydown", { key: "Escape" }); // reveal 前关闭 → 未进过 top layer，走 remove 分支
  assert.equal(t.isConnected, false, "回退路径摘除节点");
  fire(b, "pointerover", { pointerType: "mouse" });
  window.flush(); // 桩模拟浏览器：断连元素 showPopover 会抛 NotSupportedError
  assert.ok(t.isConnected, "mount 重新挂载");
  assert.ok(t.classList.contains("ax-show"));
  assert.ok(window.popoverCalls.includes("show"), "showPopover 成功进入 top layer");
});

test("跨 gap 移入提示：关闭倒计时挂起期间解绑保留，移入取消、移出正常恢复", () => {
  const window = boot(`<button id="b" title="T">x</button>`);
  const b = window.document.getElementById("b");
  const t = tip(window); // 回退路径下关闭即摘除节点，提前持引用
  fire(b, "pointerover", { pointerType: "mouse" });
  window.flush();
  fire(b, "pointerout", { relatedTarget: null }); // 指针进入按钮与提示之间的 gap
  fire(t, "pointerover", { pointerType: "mouse" }); // 移入提示内容，取消关闭
  window.flush();
  assert.ok(t.classList.contains("ax-show"), "跨 gap 移入不关闭");
  assert.equal(b.hasAttribute("title"), false, "title 仍被摘除（未提前恢复）");
  assert.equal(b.getAttribute("aria-describedby"), "ax-tooltip");
  fire(t, "pointerout", { relatedTarget: null }); // 从提示离开
  window.flush();
  assert.ok(!t.classList.contains("ax-show"), "离开提示正常关闭");
  assert.equal(b.getAttribute("title"), "T", "title 完整恢复");
  assert.equal(b.hasAttribute("aria-describedby"), false);
});
