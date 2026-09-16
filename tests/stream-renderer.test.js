import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { readFile } from "node:fs/promises";
import { marked } from "marked";
import createPurify from "dompurify";
import { createStreamRenderer } from "../public/stream-renderer.js";

test("user input stays plain text with newlines; process uses Markdown", () => {
  const dom = new JSDOM('<article class="user"><div></div></article>');
  const document = dom.window.document;
  const item = {
    node: document.querySelector('article'), text: document.querySelector('div'),
    thinking: document.createElement('details'), thought: document.createElement('div'),
    processText: document.createElement('div'), processBuffer: '**进度**', processGroup: { open: true },
    buffer: '第一行\n\n  第二行 <img src=x onerror=alert(1)>', reasoning: '',
  };
  const renderer = createStreamRenderer((el, text) => { el.textContent = text; }, () => {}, () => 1, () => {});
  renderer.flush(item);
  assert.equal(item.text.textContent, item.buffer);
  assert.equal(item.text.childElementCount, 0);
  assert.equal(item.processText.textContent, '**进度**');
  dom.window.close();
});

test("one frame, shared Markdown for lazy thinking, final flush and switch cancellation", async () => {
  const dom = new JSDOM("");
  const source = (await readFile(new URL("../public/markdown.js", import.meta.url), "utf8"))
    .replace(/^import .*;\r?\n/gm, "").replace("export function", "function");
  const render = new Function("marked", "DOMPurify", `${source}; return renderMarkdown;`)(marked, createPurify(dom.window));
  const document = dom.window.document;
  let scheduled,
    count = 0,
    writes = 0,
    time = 0;
  const renderer = createStreamRenderer(
    (el, text) => {
      writes++;
      render(el, text);
    },
    () => {},
    (fn) => {
      count++;
      scheduled = () => { time += 40; fn(); };
      return 1;
    },
    () => {
      scheduled = undefined;
    }, 40, () => time,
  );
  const item = {
    text: document.createElement("div"),
    thought: document.createElement("div"),
    thinking: document.createElement("details"),
    buffer: "answer",
    reasoning: "",
  };
  try {
    for (let i = 0; i < 100; i++) renderer.mark(item);
    assert.equal(count, 1);
    scheduled();
    assert.equal(writes, 1);
    item.reasoning = "## Plan\n\nhidden **thought**";
    renderer.mark(item);
    scheduled();
    assert.equal(writes, 1);
    assert.equal(item.thought.textContent, "");
    item.thinking.open = true;
    renderer.mark(item);
    scheduled();
    const node = item.thought.firstChild;
    item.reasoning += " more";
    renderer.mark(item);
    scheduled();
    assert.equal(item.thought.firstChild, node);
    assert.equal(item.thought.querySelector("strong").textContent, "thought");
    assert.match(item.thought.textContent, /hidden thought more/);
    assert.equal(writes, 3, "only opened thinking parses Markdown");
    item.buffer = "final";
    renderer.mark(item);
    renderer.flush(item);
    assert.equal(scheduled, undefined, "flush 收口最后一个 dirty 项后取消无用定时器");
    scheduled?.();
    assert.equal(writes, 4);
    assert.equal(item.text.textContent.trim(), "final");
    renderer.mark(item);
    renderer.clear();
    assert.equal(scheduled, undefined);

    item.task = { node: document.createElement("details") };
    const before = count;
    for (let i = 0; i < 100; i++) {
      item.buffer += " hidden";
      renderer.mark(item);
    }
    renderer.flush(item);
    assert.equal(count, before, "collapsed tasks do not schedule frames");
    assert.equal(writes, 4, "collapsed tasks skip Markdown parsing");
    item.task.node.open = true;
    renderer.mark(item);
    scheduled();
    assert.equal(writes, 5);
    assert.equal(
      item.text.textContent.trim(),
      item.buffer.trim(),
      "opening paints the full result",
    );
    item.buffer = "closed before frame";
    renderer.mark(item);
    item.task.node.open = false;
    scheduled();
    assert.equal(writes, 5);
    renderer.clear();
  } finally {
    dom.window.close();
  }
});

test("交互让路可恢复、持续交互最多等待一秒，flush 和 clear 不受影响", () => {
  const dom = new JSDOM("");
  const timers = virtualTimers();
  const stamps = [];
  const renderer = createStreamRenderer(
    (el, text) => { el.textContent = text; stamps.push(timers.now()); },
    () => {}, timers.schedule, timers.cancel, 40, timers.now,
  );
  const item = streamItem(dom.window.document, { buffer: "开始" });
  try {
    renderer.interact();
    renderer.mark(item);
    timers.advance(519);
    assert.equal(stamps.length, 0);
    timers.advance(1);
    assert.deepEqual(stamps, [520]);
    item.buffer = "持续交互";
    renderer.mark(item);
    for (let i = 0; i < 10; i++) {
      item.buffer += "字";
      renderer.mark(item);
      renderer.interact();
      timers.advance(100);
    }
    assert.deepEqual(stamps, [520, 1520], "不能被持续输入无限延期");
    item.buffer = "结束";
    renderer.mark(item);
    renderer.flush(item);
    assert.equal(item.text.textContent, "结束");
    assert.equal(timers.pending(), 0);
    renderer.interact();
    item.buffer = "旧会话";
    renderer.mark(item);
    renderer.clear();
    item.buffer = "新会话";
    renderer.mark(item);
    timers.advance(40);
    assert.equal(item.text.textContent, "新会话", "clear 清除旧交互窗口");
  } finally {
    renderer.clear();
    dom.window.close();
  }
});

test("交互期旁支增量与单项 flush 不重置其他消息的等待截止", () => {
  const dom = new JSDOM("");
  const timers = virtualTimers();
  const renderer = createStreamRenderer(
    (el, text) => { el.textContent = text; },
    () => {}, timers.schedule, timers.cancel, 40, timers.now,
  );
  const first = streamItem(dom.window.document, { buffer: "第一项" });
  const second = streamItem(dom.window.document, { buffer: "第二项" });
  try {
    renderer.interact();
    renderer.mark(first);
    timers.advance(400);
    renderer.interact();
    renderer.mark(second);
    renderer.flush(second);
    assert.equal(second.text.textContent, "第二项");
    assert.equal(first.text.textContent, "");
    assert.equal(timers.pending(), 1);
    timers.advance(400);
    renderer.interact();
    renderer.mark(first);
    timers.advance(199);
    assert.equal(first.text.textContent, "");
    timers.advance(1);
    assert.equal(first.text.textContent, "第一项", "旁支结束不延长首项的一秒截止");
    assert.equal(timers.pending(), 0);
  } finally {
    renderer.clear();
    dom.window.close();
  }
});

test("让路定时器顺延后 flush 与 clear 仍取消补画", () => {
  const dom = new JSDOM("");
  const timers = virtualTimers();
  let paints = 0;
  const renderer = createStreamRenderer(
    (el, text) => { el.textContent = text; },
    () => { paints++; }, timers.schedule, timers.cancel, 40, timers.now,
  );
  const item = streamItem(dom.window.document, { buffer: "结束" });
  try {
    renderer.interact();
    renderer.mark(item);
    timers.advance(40);
    assert.equal(paints, 0);
    assert.equal(timers.pending(), 1);
    renderer.flush(item);
    assert.equal(item.text.textContent, "结束");
    assert.equal(timers.pending(), 0);
    timers.advance(520);
    assert.equal(paints, 1, "顺延的回调不得在 flush 后补画");

    renderer.interact();
    item.buffer = "旧会话";
    renderer.mark(item);
    timers.advance(40);
    assert.equal(timers.pending(), 1);
    renderer.clear();
    assert.equal(timers.pending(), 0);
    timers.advance(520);
    assert.equal(paints, 1, "顺延的回调不得在 clear 后补画");
    item.buffer = "新会话";
    renderer.mark(item);
    timers.advance(40);
    assert.equal(item.text.textContent, "新会话");
    assert.equal(paints, 2);
  } finally {
    renderer.clear();
    dom.window.close();
  }
});

test("隐藏 document 时零 Markdown 绘制，恢复前台一次收口当前 dirty", () => {
  const dom = new JSDOM("");
  const document = dom.window.document;
  const timers = virtualTimers();
  let paints = 0, afters = 0;
  const renderer = createStreamRenderer(
    (el, text) => { paints++; el.textContent = text; },
    () => { afters++; },
    timers.schedule, timers.cancel, 40, timers.now, document,
  );
  const first = streamItem(document, { buffer: "一" });
  const second = streamItem(document, { buffer: "二" });
  try {
    setVisibility(document, "hidden");
    first.buffer = "一改"; renderer.mark(first);
    second.buffer = "二改"; renderer.mark(second);
    first.buffer = "一改二"; renderer.mark(first);
    second.buffer = "二终"; renderer.flush(second);
    assert.equal(timers.pending(), 0, "隐藏时不排帧");
    assert.equal(paints, 0, "隐藏时 mark 与 flush 都不解析 Markdown");
    assert.equal(afters, 0, "隐藏时不贴底");
    timers.advance(2000);
    assert.equal(paints, 0, "隐藏期间不补画");

    setVisibility(document, "visible");
    timers.advance(0); // 恢复由统一帧调度器收口，不在 visibilitychange 内写 DOM。
    assert.equal(paints, 2, "恢复时一次收口，每项只画一次");
    assert.equal(first.text.textContent, "一改二");
    assert.equal(second.text.textContent, "二终", "隐藏期 flush 的最新正文在恢复后落地");
    assert.equal(afters, 1, "恢复只贴底一次");
    assert.equal(timers.pending(), 0);

    setVisibility(document, "hidden");
    first.buffer = "会话残留"; renderer.mark(first);
    renderer.clear();
    setVisibility(document, "visible");
    assert.equal(paints, 2, "clear 释放 dirty，恢复不画");
    assert.equal(afters, 1);
  } finally {
    renderer.clear();
    dom.window.close();
  }
});

test("隐藏前排入的帧到期不绘制，恢复可见后才收口最新内容", () => {
  const dom = new JSDOM("");
  const document = dom.window.document;
  const timers = virtualTimers();
  let paints = 0;
  const renderer = createStreamRenderer(
    (el, text) => { paints++; el.textContent = text; },
    () => {}, timers.schedule, timers.cancel, 40, timers.now, document,
  );
  const item = streamItem(document, { buffer: "开始" });
  try {
    renderer.mark(item);
    assert.equal(timers.pending(), 1);
    setVisibility(document, "hidden");
    item.buffer = "隐藏中";
    renderer.mark(item);
    timers.advance(40);
    assert.equal(paints, 0, "隐藏期间到期帧不绘制");
    assert.equal(timers.pending(), 0, "隐藏期间不残留定时器");
    setVisibility(document, "visible");
    timers.advance(0);
    assert.equal(item.text.textContent, "隐藏中", "恢复后收口最新正文");
    assert.equal(paints, 1);
    assert.equal(timers.pending(), 0);
  } finally {
    renderer.clear();
    dom.window.close();
  }
});

function setVisibility(document, state) {
  Object.defineProperty(document, "visibilityState", { value: state, configurable: true });
  document.dispatchEvent(new document.defaultView.Event("visibilitychange"));
}

// 受控时钟 + 定时器：节流测试不依赖真实时间。
function virtualTimers() {
  let time = 0, nextId = 0;
  const timers = new Map();
  return {
    schedule(fn, delay = 0) {
      const id = ++nextId;
      timers.set(id, { at: time + delay, fn });
      return id;
    },
    cancel: (id) => timers.delete(id),
    now: () => time,
    pending: () => timers.size,
    advance(ms) {
      const end = time + ms;
      for (;;) {
        const due = [...timers].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
        if (!due) break;
        timers.delete(due[0]);
        time = Math.max(time, due[1].at);
        due[1].fn();
      }
      time = end;
    },
  };
}

function streamItem(document, extra = {}) {
  return {
    text: document.createElement("div"),
    thought: document.createElement("div"),
    thinking: document.createElement("details"),
    buffer: "", reasoning: "", raw: "", pending: false,
    ...extra,
  };
}

test("突发 delta 合并为一次节流绘制，pending 预处理只做一次且不超过 40ms 延迟", () => {
  const dom = new JSDOM("");
  const document = dom.window.document;
  try {
    const timers = virtualTimers();
    let paints = 0, prepares = 0;
    const renderer = createStreamRenderer(
      (el, text) => { paints++; el.textContent = text; },
      () => {}, timers.schedule, timers.cancel, 40, timers.now,
    );
    const item = streamItem(document);
    item.prepare = (self) => { prepares++; self.buffer = self.raw; };
    for (let i = 0; i < 200; i++) {
      item.raw += "字";
      item.pending = true;
      renderer.mark(item);
    }
    assert.equal(paints, 0, "到达时不做预处理也不绘制");
    assert.equal(prepares, 0);
    timers.advance(39);
    assert.equal(paints, 0, "节流间隔内不绘制");
    timers.advance(1);
    assert.equal(paints, 1, "整批合并为一次绘制");
    assert.equal(prepares, 1, "pending 只在绘制前处理一次");
    assert.equal(item.text.textContent, item.raw);
  } finally {
    dom.window.close();
  }
});

test("持续输入按约 40ms 上限节流，不因重置计时被饿死", () => {
  const dom = new JSDOM("");
  const document = dom.window.document;
  try {
    const timers = virtualTimers();
    const stamps = [];
    const renderer = createStreamRenderer(
      (el, text) => { stamps.push(timers.now()); el.textContent = text; },
      () => {}, timers.schedule, timers.cancel, 40, timers.now,
    );
    const item = streamItem(document);
    item.prepare = (self) => { self.buffer = self.raw; };
    for (let elapsed = 0; elapsed < 1000; elapsed += 5) {
      timers.advance(5);
      item.raw += "x";
      item.pending = true;
      renderer.mark(item);
    }
    timers.advance(40);
    assert.ok(stamps.length >= 20, `持续输入必须有持续绘制，实际 ${stamps.length} 次`);
    assert.ok(stamps.length <= 1000 / 40 + 1, `绘制次数不得超过节流上限，实际 ${stamps.length} 次`);
    const gaps = stamps.slice(1).map((stamp, i) => stamp - stamps[i]);
    assert.ok(Math.max(...gaps) <= 50, `单次等待不得超过节流间隔 + 输入步长，实际 ${Math.max(...gaps)}ms`);
  } finally {
    dom.window.close();
  }
});

test("flush 绕过节流并收口 pending；clear 取消挂起调度，旧回调不再生效", () => {
  const dom = new JSDOM("");
  const document = dom.window.document;
  try {
    const timers = virtualTimers();
    let paints = 0;
    const renderer = createStreamRenderer(
      (el, text) => { paints++; el.textContent = text; },
      () => {}, timers.schedule, timers.cancel, 40, timers.now,
    );
    const item = streamItem(document);
    item.prepare = (self) => { self.buffer = self.raw; };
    item.raw = "一";
    item.pending = true;
    renderer.mark(item);
    assert.equal(timers.pending(), 1);
    item.raw = "一 二";
    renderer.flush(item);
    assert.equal(timers.pending(), 0, "flush 后取消最后一个挂起定时器");
    assert.equal(paints, 1, "flush 立即绘制");
    assert.equal(item.text.textContent, "一 二");
    assert.equal(item.pending, false);
    timers.advance(100);
    assert.equal(paints, 1, "flush 后不得再补画");

    // 有其他 dirty 项时，flush 一个不得取消仍在等待的共享定时器。
    const other = streamItem(document);
    other.prepare = (self) => { self.buffer = self.raw; };
    other.raw = "旁支";
    other.pending = true;
    renderer.mark(other);
    item.raw = "三";
    item.pending = true;
    renderer.mark(item);
    assert.equal(timers.pending(), 1, "同一批只排一个定时器");
    renderer.flush(item);
    assert.equal(timers.pending(), 1, "还有其他 dirty 项时保留共享定时器");
    assert.equal(item.text.textContent, "三");
    assert.equal(other.text.textContent, "", "旁支项仍等待定时器，不被提前推动");
    timers.advance(40);
    assert.equal(other.text.textContent, "旁支", "共享定时器仍会绘制旁支项");

    item.raw = "四";
    item.pending = true;
    renderer.mark(item);
    assert.equal(timers.pending(), 1);
    renderer.clear();
    assert.equal(timers.pending(), 0, "clear 取消全部挂起调度");
    timers.advance(100);
    assert.equal(paints, 3, "clear 后旧回调不得再绘制");
    assert.equal(item.text.textContent, "三");
  } finally {
    dom.window.close();
  }
});

test("折叠任务不调度不解析，展开时补画最新累计内容", () => {
  const dom = new JSDOM("");
  const document = dom.window.document;
  try {
    const timers = virtualTimers();
    let paints = 0, prepares = 0;
    const renderer = createStreamRenderer(
      (el, text) => { paints++; el.textContent = text; },
      () => {}, timers.schedule, timers.cancel, 40, timers.now,
    );
    const task = { node: { open: false } };
    const item = streamItem(document, { task });
    item.prepare = (self) => { prepares++; self.buffer = self.raw; };
    for (let i = 0; i < 50; i++) {
      item.raw += "段";
      item.pending = true;
      renderer.mark(item);
      renderer.flush(item);
    }
    assert.equal(timers.pending(), 0, "折叠任务不排帧");
    assert.equal(paints, 0, "折叠任务不解析 Markdown");
    assert.equal(prepares, 0, "折叠任务不做预处理");
    task.node.open = true;
    renderer.mark(item);
    timers.advance(40);
    assert.equal(paints, 1);
    assert.equal(prepares, 1);
    assert.equal(item.text.textContent, item.raw, "展开时补画最新累计内容");
  } finally {
    dom.window.close();
  }
});

test("无 rAF 的 Node 降级调度在有界等待内完成绘制且 flush 后不再补画", async () => {
  const dom = new JSDOM("");
  const document = dom.window.document;
  try {
    // Node 没有 rAF；浏览器生产 rAF 路径另由 smooth-stream-browser.py 实测。
    let paints = 0;
    const renderer = createStreamRenderer(
      (el, text) => { paints++; el.textContent = text; },
      () => {},
    );
    const item = streamItem(document);
    item.prepare = (self) => { self.buffer = self.raw; };
    const started = Date.now();
    for (let i = 0; i < 50; i++) { item.raw += "字"; item.pending = true; renderer.mark(item); }
    assert.equal(paints, 0, "默认路径同样节流，不立即绘制");
    while (!paints && Date.now() - started < 2000) await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(paints, 1, "默认 setTimeout 路径必须在有界等待内绘制一次");
    assert.equal(item.text.textContent, item.raw, "合并整批 delta 后一次成形");
    assert.ok(Date.now() - started < 2000, "等待上限生效，未无限挂起");

    item.raw += "追加";
    item.pending = true;
    renderer.mark(item);
    renderer.flush(item);
    assert.equal(item.text.textContent, item.raw, "flush 立即补上最终内容");
    await new Promise((resolve) => setTimeout(resolve, 120));
    assert.equal(paints, 2, "flush 已取消挂起定时器，不再补画");
    renderer.clear();
  } finally {
    dom.window.close();
  }
});
