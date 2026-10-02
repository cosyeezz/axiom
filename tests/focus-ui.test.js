import test from 'node:test';
import assert from 'node:assert/strict';
import { bootSessionPage, until } from './helpers/session-page.js';

test('focused runtime keeps details reachable, distinguishes unknown and estimated context, and clears per session', async () => {
  const page = bootSessionPage({ records: [] });
  try {
    page.open();
    await until(() => page.app.session(), 'session attached');
    const { $, window } = page;
    const render = value => window.renderRuntime($('session-runtime'), value);
    render({});
    assert.match($('session-runtime').textContent, /缓存 —.*上下文 —/);
    assert.match($('session-usage-body').textContent, /待报告/);
    render({ context: { tokens: 0, contextWindow: 10000, percent: 0 } });
    assert.equal($('session-runtime').hidden, false);
    assert.match($('session-runtime').textContent, /上下文 0 \/ 10,000 · 0.0%/);
    render({ context: { tokens: 1234, contextWindow: null, percent: null, estimated: true } });
    assert.match($('session-runtime').textContent, /上下文（估算） 1,234 tokens · 窗口未知/);
    assert.match($('session-usage-body').textContent, /估算.*1,234 tokens.*未配置/);
    render({ context: { tokens: null, contextWindow: 10000, percent: 0 } });
    assert.match($('session-runtime').textContent, /上下文 — \/ 10,000 · —/, 'unknown is not zero');
    render({ usage: { input: 20, cacheRead: 80 } });
    assert.match($('session-runtime').textContent, /缓存 —/);
    assert.match($('session-usage-body').textContent, /缓存命中率：—（暂无完整可用数据）/);
    render({ usage: { input: 20, cacheRead: 80, cacheWrite: 0 }, context: { tokens: 9000, contextWindow: 10000, percent: 90 } });
    assert.equal($('session-runtime').dataset.warning, 'true');
    assert.match($('session-runtime').textContent, /缓存 80.0%.*上下文 9,000 \/ 10,000 · 90.0%/);
    $('session-runtime').click();
    assert.equal($('session-detail').open, true);
    assert.equal($('session-usage').open, true);
    assert.equal($('session-inspector').open, false);
    assert.match($('session-usage-body').textContent, /80.0%（80 \/ 100 tokens）/);
    $('session-detail-close').click();
    render({});
    assert.match($('session-runtime').textContent, /缓存 —.*上下文 —/);
    assert.equal($('session-runtime').dataset.warning, 'false');
    assert.doesNotMatch($('session-usage-body').textContent, /9,000|80.0%/);
    window.setConnectionStatus('已连接', true);
    assert.equal($('status').querySelector('span').className, 'sr-only');
    window.setConnectionStatus('连接受限，请手动重试');
    assert.equal($('status').querySelector('span').className, '');
    assert.match($('status').getAttribute('aria-label'), /连接受限/);
    for (const id of ['github-link', 'toggle-theme', 'open-raw-io', 'service-version', 'conversation-font-scale']) {
      assert.equal($(id).closest('[popover]').id, 'view-options');
    }
    assert.equal(window.document.querySelector('.composer-help-trigger'), null);
    assert.equal($('composer-help'), null);
    assert.equal($('composer-action-help').className, 'sr-only');
    for (const selector of ['#open-workspace', '#import-session', '#view-options-trigger', '.composer-session-info']) {
      const node = window.document.querySelector(selector);
      assert.ok(node.title);
      assert.ok(node.getAttribute('aria-label'));
      assert.ok(node.querySelector('svg'));
    }
  } finally { await page.close(); }
});
