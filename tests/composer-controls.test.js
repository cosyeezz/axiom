import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { publicSource } from './helpers/public-source.js';
const source = await publicSource('composer-controls');
function fixture() {
  const dom = new JSDOM(`<body><div class="context-bar"><div class="icon-group"><button type="button" id="add-context" popovertarget="context-menu"></button></div></div><button id="session-inspector-trigger"></button><form id="composer"><textarea id="prompt"></textarea><div class="actions"></div><button id="send"></button><button id="send-steer"></button><button id="send-followup"></button></form><div id="composer-status"><div id="session-runtime"></div><button id="session-billing-trigger"></button></div><button id="stop"></button><button id="force-stop"></button></body>`, { runScripts: 'outside-only' });
  const w = dom.window;
  w.matchMedia = () => ({ matches: w.innerWidth <= 1000 });
  const original = w.Element.prototype.matches;
  w.Element.prototype.matches = function (selector) { return selector === ':popover-open' ? !!this.open : original.call(this, selector); };
  w.HTMLElement.prototype.showPopover = function () { this.open = true; };
  w.HTMLElement.prototype.hidePopover = function () { this.open = false; };
  let state = { busy: false, available: true, sessionId: 'a', model: 'claude/opus', thinking: 'high' }, selected;
  const favorites = { provider: [], model: [], thinking: [] }, favoriteCalls = [];
  w.eval(source);
  const api = w.mountComposerControls({ getFavorites: () => favorites, toggleFavorite: async (kind, key, favorite) => { favoriteCalls.push([kind, key, favorite]); favorites[kind] = favorite ? [...favorites[kind], key] : favorites[kind].filter((entry) => entry !== key); }, state: () => state, providers: () => [['claude', 'claude'], ['openai', 'openai']], models: () => [['claude/opus', 'opus']], levels: () => ['low', 'high'], selectModel: async (...args) => { selected = args; } });
  return { dom, w, api, state, favoriteCalls, selected: () => selected };
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
    assert.ok(primary.querySelector('svg')); assert.equal(w.document.querySelector('.composer-model-trigger span').textContent, 'claude · opus · high');
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
test('open model menus close when unavailable and stale choices cannot commit', async () => {
  const { dom, w, api, state, selected } = fixture();
  try {
    w.document.querySelector('.composer-model-trigger').click();
    w.document.querySelector('.composer-choice-row > button').click();
    w.document.querySelectorAll('.composer-choice-column')[1].querySelector('.composer-choice-row > button').click();
    const stale = w.document.querySelectorAll('.composer-choice-column')[2].querySelector('.composer-choice-row > button');
    state.available = false; api.refresh();
    assert.equal(w.document.querySelector('.composer-model-panel').open, false);
    stale.click(); await Promise.resolve();
    assert.equal(selected(), undefined);
    state.available = true; api.refresh();
    w.document.querySelector('.composer-model-trigger').click();
    api.invalidateModels();
    assert.equal(w.document.querySelector('.composer-model-panel').open, false);
  } finally { dom.window.close(); }
});

test('tools move into the input row; footer owns statistics and model without duplicate hints', () => {
  const { dom, w, api, state } = fixture();
  try {
    const tools = w.document.getElementById('composer-tools');
    const more = w.document.querySelector('.composer-tools-trigger');
    assert.equal(tools.parentElement.className, 'actions');
    assert.equal(w.document.querySelector('.composer-split').parentElement.lastElementChild.className, 'composer-split');
    assert.equal(w.document.querySelector('.composer-model-trigger').parentElement.id, 'composer-status');
    assert.equal(w.document.getElementById('session-runtime').parentElement.id, 'composer-status');
    w.innerWidth = 390; w.dispatchEvent(new w.Event('resize'));
    assert.equal(tools.getAttribute('popover'), 'auto');
    more.click(); assert.equal(tools.open, true);
    w.document.getElementById('add-context').click();
    assert.equal(tools.open, true, '原生子菜单打开前保持定位锚点可见');
    tools.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    assert.equal(tools.open, false);
    assert.equal(w.document.activeElement, more);
    more.click(); state.sessionId = 'b'; api.refresh(); assert.equal(tools.open, false);
    w.innerWidth = 1440; w.dispatchEvent(new w.Event('resize'));
    assert.equal(tools.hasAttribute('popover'), false);
  } finally { dom.window.close(); }
});

test('favorites persist through the shared callback without choosing a model', async () => {
  const { dom, w, favoriteCalls, selected } = fixture();
  try {
    w.document.querySelector('.composer-model-trigger').click();
    w.document.querySelector('.composer-favorite').click(); await new Promise((resolve) => setTimeout(resolve, 0));
    assert.deepEqual(favoriteCalls, [['provider', 'claude', true]]);
    assert.equal(selected(), undefined);
    assert.equal(w.document.querySelector('.composer-favorite').textContent, '★');
    w.document.querySelector('.composer-choice-row > button').click();
    w.document.querySelectorAll('.composer-choice-column')[1].querySelector('.composer-choice-row > button').click();
    const level = w.document.querySelectorAll('.composer-choice-column')[2];
    level.querySelector('.composer-favorite').click(); await Promise.resolve();
    assert.deepEqual(favoriteCalls[1], ['thinking', 'claude/opus:low', true]);
  } finally { dom.window.close(); }
});
test('all three model levels have independent searches and commit only at final selection', async () => {
  const { dom, w, selected } = fixture();
  try {
    w.document.querySelector('.composer-model-trigger').click();
    const search = w.document.querySelector('.composer-choice-column input'); search.value = 'claude'; search.dispatchEvent(new w.Event('input'));
    assert.equal(w.document.querySelectorAll('.composer-choice-row').length, 1);
    w.document.querySelector('.composer-choice-list button').click();
    assert.equal(w.document.querySelectorAll('.composer-choice-column input').length, 2);
    assert.equal(w.document.querySelector('.composer-choice-column input'), search, 'parent search DOM stays fixed');
    assert.equal(search.value, 'claude');
    assert.equal(selected(), undefined);
    w.document.querySelectorAll('.composer-choice-column')[1].querySelector('.composer-choice-list button').click();
    assert.equal(w.document.querySelectorAll('.composer-choice-column input').length, 3);
    const level = w.document.querySelectorAll('.composer-choice-column')[2];
    assert.equal(level.querySelectorAll('.composer-choice-row > button:first-child svg').length, 1, 'only selected check, no terminal arrows');
    const filter = level.querySelector('input'); filter.value = 'high'; filter.dispatchEvent(new w.Event('input'));
    level.querySelector('.composer-choice-list button').click(); await Promise.resolve();
    assert.deepEqual(selected(), ['claude/opus', 'high']);
  } finally { dom.window.close(); }
});
