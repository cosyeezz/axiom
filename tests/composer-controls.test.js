import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { readFile } from 'node:fs/promises';
const iconSource = (await readFile(new URL('../public/icons.js', import.meta.url), 'utf8')).replaceAll('export ', '');
const source = (await readFile(new URL('../public/composer-controls.js', import.meta.url), 'utf8')).replace(/^import .*;\r?\n/m, '').replace('export function', 'function');
function fixture() {
  const dom = new JSDOM(`<body><div class="context-bar"></div><button id="session-inspector-trigger"></button><form id="composer"><textarea id="prompt"></textarea><div class="actions"></div><button id="send"></button><button id="send-steer"></button><button id="send-followup"></button></form><button id="stop"></button><button id="force-stop"></button><span id="composer-action-help"></span></body>`, { runScripts: 'outside-only' });
  const w = dom.window;
  const original = w.Element.prototype.matches;
  w.Element.prototype.matches = function (selector) { return selector === ':popover-open' ? !!this.open : original.call(this, selector); };
  w.HTMLElement.prototype.showPopover = function () { this.open = true; };
  w.HTMLElement.prototype.hidePopover = function () { this.open = false; };
  let state = { busy: false, available: true, sessionId: 'a', model: 'claude/opus', thinking: 'high' }, selected;
  w.eval(`${iconSource}\n${source}`);
  const api = w.mountComposerControls({ state: () => state, providers: () => [['claude', 'claude'], ['openai', 'openai']], models: () => [['claude/opus', 'opus']], levels: () => ['low', 'high'], selectModel: async (...args) => { selected = args; } });
  return { dom, w, api, state, selected: () => selected };
}
test('one stable split button defaults to stop; menu clicks execute immediately', () => {
  const { dom, w, api, state } = fixture();
  try {
    const primary = w.document.querySelector('.composer-split button');
    assert.equal(primary.textContent, '发送');
    assert.equal(primary.querySelector('.composer-icon').dataset.icon, 'send');
    assert.equal(w.document.querySelector('.composer-session-info .composer-icon').dataset.icon, 'info');
    for (const name of ['stop', 'force', 'steer', 'followUp']) {
      assert.equal(w.document.querySelector(`[data-operation="${name}"] .composer-icon`).dataset.icon, name);
    }
    state.busy = true; api.refresh();
    assert.equal(primary.textContent, 'stop');
    let forced = 0; w.document.getElementById('force-stop').onclick = () => forced++;
    w.document.querySelector('[data-operation="force"]').click();
    assert.equal(primary.textContent, 'force'); assert.equal(forced, 1);
    primary.click(); assert.equal(forced, 2);
    let stopped = 0;
    w.document.getElementById('stop').onclick = () => stopped++;
    const submissions = [];
    w.document.getElementById('composer').onsubmit = (event) => { event.preventDefault(); submissions.push(event.submitter.id); };
    const menu = w.document.querySelector('.composer-operation-menu');
    const arrow = w.document.querySelector('.composer-split button:last-child');
    for (const name of ['stop', 'steer', 'followUp']) {
      arrow.click(); assert.equal(menu.open, true);
      const item = menu.querySelector(`[data-operation="${name}"]`);
      assert.equal(item.getAttribute('role'), 'menuitem');
      item.click(); assert.equal(menu.open, false);
    }
    assert.equal(stopped, 1);
    assert.deepEqual(submissions, ['send-steer', 'send-followup']);
    assert.equal(api.queue(), 'followUp');
    state.busy = false; api.refresh(); state.busy = true; api.refresh(); assert.equal(primary.textContent, 'stop');
    assert.ok(primary.querySelector('svg')); assert.equal(w.document.querySelector('.composer-model-trigger span').textContent, 'opus');
  } finally { dom.window.close(); }
});
test('unavailable menu actions cannot execute or submit an idle message', () => {
  const { dom, w, api, state } = fixture();
  try {
    let executions = 0;
    w.document.getElementById('stop').onclick = () => executions++;
    w.document.getElementById('force-stop').onclick = () => executions++;
    w.document.getElementById('composer').onsubmit = (event) => { event.preventDefault(); executions++; };
    const items = [...w.document.querySelectorAll('[data-operation]')];
    for (const item of items) { assert.equal(item.disabled, true); item.click(); }
    state.busy = true; state.safeStopping = true;
    for (const id of ['force-stop', 'send-steer', 'send-followup']) w.document.getElementById(id).disabled = true;
    api.refresh();
    for (const item of items) { assert.equal(item.disabled, true); item.click(); }
    assert.equal(executions, 0);
  } finally { dom.window.close(); }
});
test('all three model levels have independent searches and commit only at final selection', async () => {
  const { dom, w, selected } = fixture();
  try {
    w.document.querySelector('.composer-model-trigger').click();
    const search = w.document.querySelector('.composer-choice-column input'); search.value = 'claude'; search.dispatchEvent(new w.Event('input'));
    assert.equal(w.document.querySelectorAll('.composer-choice-list button').length, 1);
    w.document.querySelector('.composer-choice-list button').click();
    assert.equal(w.document.querySelectorAll('.composer-choice-column input').length, 2);
    assert.equal(selected(), undefined);
    w.document.querySelectorAll('.composer-choice-column')[1].querySelector('.composer-choice-list button').click();
    assert.equal(w.document.querySelectorAll('.composer-choice-column input').length, 3);
    const level = w.document.querySelectorAll('.composer-choice-column')[2];
    const filter = level.querySelector('input'); filter.value = 'high'; filter.dispatchEvent(new w.Event('input'));
    level.querySelector('.composer-choice-list button').click(); await Promise.resolve();
    assert.deepEqual(selected(), ['claude/opus', 'high']);
  } finally { dom.window.close(); }
});
