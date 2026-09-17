import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import { marked } from 'marked';
import createPurify from 'dompurify';
import { createStreamRenderer } from '../public/stream-renderer.js';

async function fixture() {
  const dom = new JSDOM('<article><div></div></article>');
  const doc = dom.window.document;
  let time = 0, id = 0, parses = 0, paints = 0;
  const frames = new Map();
  const media = new dom.window.EventTarget();
  media.matches = false;
  dom.window.matchMedia = () => media;
  Object.defineProperty(doc, 'visibilityState', { configurable: true, value: 'visible' });
  const source = (await readFile(new URL('../public/markdown.js', import.meta.url), 'utf8'))
    .replace(/^import .*;\r?\n/gm, '').replace(/^export /gm, '');
  const parser = Object.create(marked);
  parser.lexer = (...args) => { parses++; return marked.lexer(...args); };
  const render = new Function('marked', 'DOMPurify', `${source}; return renderMarkdown;`)(parser, createPurify(dom.window));
  const renderer = createStreamRenderer(render, () => paints++, (fn, delay = 0) => {
    frames.set(++id, { fn, at: time + Math.max(16, delay) }); return id;
  }, (id) => frames.delete(id), 40, () => time);
  const item = { node: doc.querySelector('article'), text: doc.querySelector('div'),
    thought: doc.createElement('div'), thinking: doc.createElement('details'),
    active: true, raw: '', buffer: '', reasoning: '' };
  function advance(ms) {
    const end = time + ms;
    while (true) {
      const next = [...frames].find(([, value]) => value.at <= end);
      if (!next) break;
      frames.delete(next[0]); time = next[1].at; next[1].fn();
    }
    time = end;
  }
  return { dom, doc, media, renderer, item, render, frames, advance,
    metrics: () => ({ parses, paints }), close: () => { renderer.dispose(); dom.window.close(); } };
}

test('real Markdown fast path progresses between batches without lexing; authority stays full', async () => {
  const f = await fixture();
  try {
    const lengths = new Set();
    for (let batch = 0; batch < 5; batch++) {
      f.item.raw += '一二三四五六七八九十'; f.item.buffer = f.item.raw;
      f.renderer.mark(f.item);
      for (let step = 0; step < 20; step++) {
        f.advance(50); lengths.add(f.item.text.textContent.length);
        assert.equal(f.item.raw.length, (batch + 1) * 10);
      }
    }
    assert.ok(lengths.size > 20, `intermediate prefixes ${lengths.size}`);
    const node = f.item.text.querySelector('p').firstChild;
    f.advance(3000);
    assert.equal(f.item.text.textContent, f.item.raw);
    assert.equal(f.item.text.querySelector('p').firstChild, node);
    assert.equal(f.metrics().parses, 0);
    assert.equal(f.frames.size, 0);
  } finally { f.close(); }
});

test('hidden restore, dynamic reduced motion, unmount, stale callbacks and disposal', async () => {
  const f = await fixture();
  try {
    f.item.buffer = '一二三四五六七八九十'; f.renderer.mark(f.item);
    const old = [...f.frames.values()][0].fn;
    Object.defineProperty(f.doc, 'visibilityState', { configurable: true, value: 'hidden' });
    f.doc.dispatchEvent(new f.dom.window.Event('visibilitychange'));
    assert.equal(f.frames.size, 0);
    f.item.buffer += '后续内容'; f.renderer.mark(f.item); assert.equal(f.frames.size, 0);
    Object.defineProperty(f.doc, 'visibilityState', { configurable: true, value: 'visible' });
    f.doc.dispatchEvent(new f.dom.window.Event('visibilitychange')); f.advance(50);
    assert.equal(f.item.text.textContent, f.item.buffer);
    f.item.buffer += '新输入'; f.renderer.mark(f.item);
    f.media.matches = true; f.media.dispatchEvent(new f.dom.window.Event('change')); f.advance(50);
    assert.equal(f.item.text.textContent, f.item.buffer);
    f.item.buffer += '未挂载'; f.renderer.mark(f.item); f.item.mounted = false; f.advance(50);
    assert.equal(f.frames.size, 0);
    f.renderer.clear(); old(); assert.equal(f.frames.size, 0);
    f.item.mounted = true; f.renderer.mark(f.item); f.renderer.dispose();
    assert.equal(f.frames.size, 0); old(); assert.equal(f.frames.size, 0);
  } finally { f.close(); }
});

test('selection defers DOM only; terminal and malicious/complex Markdown retain correctness', async () => {
  const f = await fixture();
  try {
    f.item.buffer = '初始正文'; f.renderer.flush(f.item);
    const selection = f.doc.getSelection(), range = f.doc.createRange();
    range.selectNodeContents(f.item.text.querySelector('p')); selection.addRange(range);
    f.item.buffer = '完整终态'; f.item.active = false; f.renderer.flush(f.item);
    assert.equal(f.item.text.textContent, '初始正文'); assert.equal(f.frames.size, 0);
    selection.removeAllRanges(); f.doc.dispatchEvent(new f.dom.window.Event('selectionchange')); f.advance(50);
    assert.equal(f.item.text.textContent, '完整终态');
    for (const text of ['[引用][id]\n\n[id]: https://example.com', '- 一\n- 二', '```js\nhello\n```', '| a | b |\n| - | - |\n| 1 | 2 |', '<img src=x onerror=alert(1)><script>alert(1)</script>[bad](javascript:alert(1))']) {
      f.item.buffer = text; f.renderer.flush(f.item);
      const expected = f.doc.createElement('div'); f.render(expected, text);
      assert.equal(f.item.text.innerHTML, expected.innerHTML);
      assert.equal(f.item.text.querySelector('script,img,[onerror],a[href^="javascript:"]'), null);
    }
    f.item.buffer = '<script>alert(1)</script>'.repeat(3000); f.renderer.flush(f.item);
    assert.equal(f.item.text.querySelector('pre').textContent, f.item.buffer);
    assert.equal(f.item.text.querySelector('script'), null);
  } finally { f.close(); }
});
