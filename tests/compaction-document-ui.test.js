import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { publicSource } from './helpers/public-source.js';

const source = await publicSource('compaction-view');
test('compaction prioritizes final results, preserves disclosure choice and accessible source switching', async () => {
  const dom = new JSDOM('<main></main>', { runScripts: 'outside-only' });
  const { window: w } = dom;
  try {
    w.eval(`function renderMarkdown(node, text) { node.textContent = text; }
      async function copyText() {}
      ${source}\nwindow.makeView = createCompactionView;`);
    const root = w.document.querySelector('main');
    let revision = 0;
    const view = w.makeView(root, async () => ({ revision: ++revision, requests: [{ id: 'r', context: { systemPrompt: '系统原文', messages: [] }, text: '生成正文' }], finalSummary: '最终摘要内容', stateDoc: '任务状态内容' }));
    await view('s', 'run');
    const headings = [...root.querySelectorAll('summary')].map(n => n.textContent);
    assert.deepEqual(headings.slice(0, 2), ['最终摘要', '任务状态文档（截至压缩切点）']);
    assert.ok(headings.includes('请求 1 · 完整请求原文'));
    const final = root.firstElementChild;
    assert.equal(final.open, true);
    final.open = false;
    const mutations = [];
    const observer = new w.MutationObserver(records => mutations.push(...records));
    observer.observe(root, { childList: true });
    await view('s', 'run');
    await Promise.resolve();
    observer.disconnect();
    assert.equal(mutations.length, 0, 'unchanged document order must not move nodes during updates');
    assert.equal(root.firstElementChild, final);
    assert.equal(final.open, false, 'polling must not reopen reader-collapsed results');
    const toggle = final.querySelector('button');
    assert.equal(toggle.getAttribute('aria-pressed'), 'false');
    toggle.click();
    assert.equal(toggle.getAttribute('aria-pressed'), 'true');
    assert.equal(final.querySelector('pre').textContent, '最终摘要内容');
    assert.equal(final.querySelector('[role="region"]').tabIndex, 0);
    await view('other', 'run');
    assert.notEqual(root.firstElementChild, final);
  } finally { w.close(); }
});
