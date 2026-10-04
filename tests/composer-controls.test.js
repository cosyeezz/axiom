import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { publicSource } from './helpers/public-source.js';
const source = await publicSource('composer-controls');
function fixture() {
  const dom = new JSDOM(`<body><div class="context-bar"><div class="icon-group"><button type="button" id="add-context" popovertarget="context-menu"></button></div></div><div id="context-menu" popover><button data-context="skill">Skill</button></div><button id="session-inspector-trigger"></button><span id="composer-action-help" class="sr-only" hidden></span><form id="composer"><textarea id="prompt"></textarea><div class="actions"></div><button id="send"></button><button id="send-steer"></button><button id="send-followup"></button></form><div id="composer-status"><div id="session-runtime"></div><button id="session-billing-trigger"></button></div><button id="stop"></button><button id="force-stop"></button></body>`, { runScripts: 'outside-only' });
  const w = dom.window;
  w.matchMedia = () => ({ matches: w.innerWidth <= 1000 });
  const original = w.Element.prototype.matches;
  w.Element.prototype.matches = function (selector) { return selector === ':popover-open' ? !!this.open : original.call(this, selector); };
  w.HTMLElement.prototype.showPopover = function () { this.open = true; };
  w.HTMLElement.prototype.hidePopover = function () { this.open = false; };
  let state = { busy: false, available: true, sessionId: 'a', model: 'claude/opus', thinking: 'high' }, selected;
  const favorites = { provider: [], model: [], thinking: [] }, favoriteCalls = [];
  const catalog = { providers: [['claude', 'claude'], ['openai', 'openai']], models: [['claude/opus', 'opus']], levels: ['low', 'high'] };
  w.visualViewport = new w.EventTarget();
  w.eval(source);
  const api = w.mountComposerControls({ getFavorites: () => favorites, toggleFavorite: async (kind, key, favorite) => { favoriteCalls.push([kind, key, favorite]); favorites[kind] = favorite ? [...favorites[kind], key] : favorites[kind].filter((entry) => entry !== key); }, state: () => state, providers: () => catalog.providers, models: () => catalog.models, levels: () => catalog.levels, selectModel: async (...args) => { selected = args; } });
  return { dom, w, api, state, catalog, favoriteCalls, selected: () => selected };
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
    assert.ok(primary.querySelector('svg'));
    assert.equal(w.document.querySelector('.composer-model-name').textContent, 'opus');
    assert.equal(w.document.querySelector('.composer-model-effort').textContent, 'high');
    assert.equal(w.document.querySelector('.composer-model-trigger').title, 'claude/opus · high');
    assert.match(w.document.querySelector('.composer-model-trigger').getAttribute('aria-label'), /claude\/opus/);
    assert.equal(w.document.getElementById('composer-action-help').hidden, false);
    assert.match(w.document.getElementById('composer-action-help').textContent, /Enter 介入.*按钮执行 stop/);
    state.busy = false; api.refresh();
    assert.equal(w.document.getElementById('composer-action-help').hidden, true);
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
    assert.equal(w.document.querySelector('.composer-model-panel').open, true, 'catalog refresh does not dismiss browsing');
    w.document.querySelector('.composer-choice-row > button').click();
    w.document.querySelectorAll('.composer-choice-column')[1].querySelector('.composer-choice-row > button').click();
    stale.click(); await Promise.resolve();
    assert.equal(selected(), undefined, 'detached callback cannot commit after reopening the same model');
    state.sessionId = 'other'; api.refresh();
    assert.equal(w.document.querySelector('.composer-model-panel').open, false);
    stale.click(); await Promise.resolve();
    assert.equal(selected(), undefined, 'stale choices cannot cross sessions');
  } finally { dom.window.close(); }
});

test('tools and model share the bottom action bar; footer owns statistics without a help entry', () => {
  const { dom, w, api, state } = fixture();
  try {
    const tools = w.document.getElementById('composer-tools');
    const more = w.document.querySelector('.composer-tools-trigger');
    assert.equal(tools.parentElement.className, 'actions');
    assert.equal(w.document.querySelector('.composer-split').parentElement.lastElementChild.className, 'composer-split');
    assert.equal(w.document.querySelector('.composer-model-trigger').parentElement.className, 'actions');
    assert.equal(w.document.querySelector('.composer-help-trigger'), null);
    assert.equal(w.document.getElementById('session-runtime').parentElement.id, 'composer-status');
    w.innerWidth = 390; w.dispatchEvent(new w.Event('resize'));
    const context = w.document.getElementById('context-menu');
    assert.equal(tools.hasAttribute('popover'), false);
    assert.equal(w.document.querySelector('.composer-session-info').parentElement, context);
    more.click(); assert.equal(context.open, true);
    w.document.querySelector('.composer-session-info').click();
    assert.equal(context.open, false);
    more.click(); state.sessionId = 'b'; api.refresh(); assert.equal(context.open, false);
    w.innerWidth = 1440; w.dispatchEvent(new w.Event('resize'));
    assert.equal(w.document.querySelector('.composer-session-info').parentElement, tools);
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

test('refreshes, catalog updates and keyboard resize preserve model searches and focus', async () => {
  const { dom, w, api, state, catalog, selected } = fixture();
  try {
    w.document.querySelector('.composer-model-trigger').click();
    const root = w.document.querySelector('.composer-model-panel');
    const search = root.querySelector('input');
    search.value = 'claude'; search.dispatchEvent(new w.Event('input'));
    root.querySelector('.composer-choice-row > button').click();
    root.querySelector('.composer-model-child .composer-choice-row > button').click();
    const inputs = [...root.querySelectorAll('input')], last = inputs.at(-1);
    last.value = 'high'; last.dispatchEvent(new w.Event('input')); last.focus();
    const scroll = root.querySelector('.composer-choice-list'); scroll.scrollTop = 17;
    for (let i = 0; i < 5; i++) {
      state.busy = !state.busy; api.refresh(); api.invalidateModels();
      w.innerWidth = i % 2 ? 390 : 1440; w.innerHeight = 400;
      w.dispatchEvent(new w.Event('resize'));
      w.visualViewport.dispatchEvent(new w.Event('resize'));
      w.visualViewport.dispatchEvent(new w.Event('scroll'));
      assert.equal(root.open, true);
      assert.deepEqual([...root.querySelectorAll('input')], inputs);
      assert.equal(search.value, 'claude'); assert.equal(last.value, 'high');
      assert.equal(w.document.activeElement, last); assert.equal(scroll.scrollTop, 17);
    }
    const choice = last.closest('section').querySelector('.composer-choice-row > button');
    catalog.levels = ['low']; api.invalidateModels(); choice.click(); await Promise.resolve();
    assert.equal(selected(), undefined, 'removed thinking level is rejected');
    catalog.levels = ['low', 'high']; choice.click(); await Promise.resolve();
    assert.deepEqual(selected(), ['claude/opus', 'high']);
    w.document.querySelector('.composer-model-trigger').click();
    root.querySelector('.composer-choice-row > button').click();
    root.querySelector('.composer-model-child .composer-choice-row > button').click();
    const stale = root.querySelectorAll('.composer-choice-column')[2].querySelector('.composer-choice-row > button');
    catalog.models = []; api.invalidateModels();
    assert.equal(root.open, false, 'removed active model cancels selection');
    stale.click(); await Promise.resolve();
    assert.deepEqual(selected(), ['claude/opus', 'high']);
  } finally { dom.window.close(); }
});
