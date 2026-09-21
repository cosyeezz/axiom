import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import { composerIcon } from '../public/icons.js';
import { actionIcon, actionIconPaths, initActionIcons } from '../public/icons.js';

test('shared SVG action icons have safe fixed geometry and a consistent grid', () => {
  for (const name of Object.keys(actionIconPaths)) {
    const dom = new JSDOM(actionIcon(name));
    const svg = dom.window.document.querySelector('svg');
    assert.equal(svg.getAttribute('viewBox'), '0 0 24 24');
    assert.equal(svg.getAttribute('stroke-width'), '1.75');
    assert.equal(svg.getAttribute('fill'), 'none');
    assert.equal(svg.getAttribute('aria-hidden'), 'true');
    assert.equal(svg.getAttribute('focusable'), 'false');
    assert.equal(svg.querySelector('path').getAttribute('d'), actionIconPaths[name]);
    dom.window.close();
  }
  assert.throws(() => actionIcon('<script>'), /Unknown action icon/);
});

test('composer artwork is safe, monochrome and inherits currentColor', () => {
  for (const name of ['context', 'image', 'compact', 'target', 'info', 'send', 'stop', 'force', 'steer', 'followUp', 'skill', 'file', 'folder']) {
    const dom = new JSDOM(composerIcon(name));
    const svg = dom.window.document.querySelector('svg');
    assert.equal(svg.getAttribute('viewBox'), '0 0 24 24');
    assert.equal(svg.getAttribute('aria-hidden'), 'true');
    assert.equal(svg.getAttribute('focusable'), 'false');
    assert.equal(svg.getAttribute('stroke'), 'currentColor');
    assert.equal(svg.getAttribute('stroke-width'), '1.75');
    // Hue must never distinguish one composer tool from another.
    assert.equal(svg.getAttribute('data-tone'), null, `${name} must not carry a tone`);
    assert.doesNotMatch(svg.outerHTML, /fill-opacity|var\(--/, `${name} must stay monochrome`);
    assert.equal(svg.querySelectorAll('[fill]:not([fill="none"])').length, 0, name);
    assert.equal(svg.querySelectorAll('script, image, use, foreignObject').length, 0);
    dom.window.close();
  }
  assert.throws(() => composerIcon('<script>'), /Unknown composer icon/);
  assert.throws(() => composerIcon('constructor'), /Unknown composer icon/);
});

test('all static action controls and dialog templates get SVGs without changing labels', async () => {
  const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  const dom = new JSDOM(html);
  const doc = dom.window.document;
  initActionIcons(doc);
  for (const id of ['new', 'open-workspace', 'import-session', 'open-settings', 'toggle-sidebar', 'copy-workspace', 'reveal-workspace', 'open-raw-io', 'toggle-theme', 'add-context', 'add-image', 'goal-enter', 'context-back', 'context-close', 'stop', 'force-stop', 'image-preview-close']) {
    assert.ok(doc.getElementById(id).querySelector('svg.action-icon'), id);
  }
  for (const id of ['add-context', 'add-image', 'compact-session', 'goal-enter']) {
    assert.ok(doc.getElementById(id).querySelector('svg.composer-icon'), `${id} uses colored artwork`);
  }
  assert.equal(doc.querySelector('#new').textContent.trim(), '新会话');
  assert.equal(doc.querySelector('#add-image').getAttribute('aria-label'), '上传图片');
  assert.ok(doc.querySelector('#task-template').content.querySelector('button[aria-label="关闭子代理详情"] svg'));
  assert.equal(doc.querySelector('#github-link svg').getAttribute('viewBox'), '0 0 16 16', 'brand geometry is preserved');
  const before = doc.body.innerHTML;
  initActionIcons(doc);
  assert.equal(doc.body.innerHTML, before, 'hydration is idempotent');
  dom.window.close();
});
