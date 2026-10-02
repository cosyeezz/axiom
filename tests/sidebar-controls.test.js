import test from 'node:test';
import assert from 'node:assert/strict';
import { bootSessionPage, until } from './helpers/session-page.js';

test('sidebar owns navigation and view controls; collapsed mode keeps named SVG entries', async () => {
  const page = bootSessionPage({ records: [] });
  try {
    page.open();
    await until(() => page.app.session(), 'session attached');
    const { $, window } = page;
    for (const id of ['toggle-sidebar', 'view-options-trigger', 'mobile-more', 'status', 'open-settings']) {
      assert.equal($(id).closest('aside')?.id, 'sidebar', id);
      assert.ok($(id).getAttribute('aria-label'), id);
      if (id !== 'status') assert.ok($(id).querySelector('svg'), id);
      assert.equal($(id).closest('main > header'), null, id);
    }
    assert.equal($('toggle-sidebar').querySelector('svg').dataset.icon, 'sidebar');
    $('search').focus();
    $('toggle-sidebar').click();
    assert.equal($('toggle-sidebar').getAttribute('aria-expanded'), 'false');
    assert.equal($('toggle-sidebar').getAttribute('aria-label'), '展开侧栏');
    assert.equal(window.document.activeElement, $('toggle-sidebar'));
    assert.equal(window.document.querySelector('main').inert, false);
    $('toggle-sidebar').click();
    assert.equal($('toggle-sidebar').getAttribute('aria-label'), '收起侧栏');
    for (const id of ['github-link', 'toggle-theme', 'open-raw-io', 'service-version', 'conversation-font-scale']) {
      assert.equal($(id).closest('[popover]').id, 'view-options');
    }
    // Same real controls move into the phone dialog, whose trigger remains on the left.
    const media = window.matchMedia('(max-width: 700px)');
    media.matches = true; media.onchange();
    assert.equal($('view-options-trigger').closest('dialog').id, 'mobile-menu');
    $('toggle-sidebar').click();
    assert.equal(window.document.querySelector('main').inert, true);
    $('mobile-more').click();
    assert.equal($('mobile-menu').open, true);
    assert.equal(window.document.querySelector('main').inert, false);
    assert.equal($('sidebar-backdrop').hidden, true);
    $('mobile-menu-close').click();
    assert.equal(window.document.activeElement, $('mobile-more'));
    assert.equal($('mobile-connection').getAttribute('href'), '/_axiom/native/connection');
    media.matches = false; media.onchange();
    assert.equal($('view-options-trigger').closest('aside').id, 'sidebar');
  } finally { await page.close(); }
});

test('current session execution state stays in composer independently from connection and folding', async () => {
  const page = bootSessionPage({ records: [] });
  try {
    page.open();
    await until(() => page.app.session(), 'session attached');
    const { $, window, app } = page;
    assert.equal($('session-state').parentElement.id, 'composer-status');
    assert.equal($('session-state').textContent, '空闲');
    app.snapshot(page.fullState({ status: 'running' }));
    assert.equal($('session-state').textContent, '运行中');
    $('toggle-sidebar').click();
    assert.equal($('session-state').textContent, '运行中');
    app.snapshot(page.fullState({ status: 'running', safeStop: true }));
    assert.equal($('session-state').textContent, '安全停止中');
    app.setConnected(false);
    assert.equal($('session-state').textContent, '连接断开');
    assert.match($('status').getAttribute('aria-label'), /连接断开/);
    app.setConnected(true);
    app.snapshot(page.fullState({ status: 'cancelling' }));
    assert.equal($('session-state').textContent, '正在停止');
    assert.equal($('session-state').dataset.state, 'stopping');
    page.sockets.at(-1).receive({ type: 'session.state', sessionId: app.session(), data: { status: 'idle', stopped: 'safe' } });
    assert.equal($('session-state').textContent, '已停下');
    for (const [status, text] of [['running', '运行中'], ['cancelling', '正在停止'], ['idle', '空闲']]) {
      page.sockets.at(-1).receive({ type: 'session.state', sessionId: app.session(), data: { status } });
      assert.equal($('session-state').textContent, text);
    }
  } finally { await page.close(); }
});
