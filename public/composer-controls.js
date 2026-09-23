import { composerIconNode } from './icons.js';

// Compact composer controls. Existing session handlers remain the authority.
export function mountComposerControls({ state, providers, models, levels, selectModel, getFavorites = () => ({}), toggleFavorite = async () => {} }) {
  const $ = (id) => document.getElementById(id);
  const paths = { chevron: 'm8 10 4 4 4-4', next: 'm10 6 6 6-6 6', back: 'm14 6-6 6 6 6', check: 'm5 12 4 4L19 6', stop: 'M7 7h10v10H7z', force: 'm7 7 10 10M17 7 7 17', steer: 'M5 19V9a4 4 0 0 1 4-4h10m-4-4 4 4-4 4', followUp: 'M5 6h14M5 12h14M5 18h8m3-3 3 3-3 3', send: 'M12 20V4m-6 6 6-6 6 6', info: 'M12 8h.01M12 11v6M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0' };
  function icon(name) {
    if (['stop', 'force', 'steer', 'followUp', 'send', 'info'].includes(name)) return composerIconNode(name);
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true'); svg.classList.add('composer-control-icon');
    const path = document.createElementNS(svg.namespaceURI, 'path'); path.setAttribute('d', paths[name]); svg.append(path); return svg;
  }
  const actions = document.querySelector('#composer .actions');
  const info = document.createElement('button'); info.type = 'button'; info.className = 'icon-button composer-session-info';
  info.title = '主代理配置与会话账单'; info.setAttribute('aria-label', info.title); info.append(icon('info'));
  info.onclick = () => $('session-inspector-trigger').click();
  document.querySelector('.context-bar').append(info);
  const trigger = document.createElement('button');
  trigger.type = 'button'; trigger.className = 'composer-model-trigger';
  trigger.setAttribute('aria-label', '选择供应商、模型和思考等级');
  trigger.setAttribute('aria-haspopup', 'dialog');
  const split = document.createElement('div'); split.className = 'composer-split';
  const primary = document.createElement('button'); primary.type = 'button';
  const arrow = document.createElement('button'); arrow.type = 'button'; arrow.append(icon('chevron'));
  arrow.setAttribute('aria-label', '选择运行操作'); arrow.setAttribute('aria-haspopup', 'menu');
  split.append(primary, arrow);
  const runtime = $('session-runtime');
  if (runtime) actions.append(runtime);
  actions.append(trigger, split);
  const modelPanel = document.createElement('div');
  modelPanel.className = 'composer-model-panel'; modelPanel.popover = 'auto';
  modelPanel.setAttribute('role', 'dialog'); modelPanel.setAttribute('aria-label', '模型配置');
  const menu = document.createElement('div'); menu.className = 'composer-operation-menu'; menu.popover = 'auto';
  menu.setAttribute('role', 'menu');
  document.body.append(modelPanel, menu);
  let operation = 'stop', previousBusy = false, identity, provider, model;
  const focusPrompt = () => { if (!$('prompt').disabled) $('prompt').focus({ preventScroll: true }); };
  const position = (panel, anchor) => {
    const rect = anchor.getBoundingClientRect();
    panel.style.left = `${Math.max(8, Math.min(rect.left, innerWidth - panel.offsetWidth - 8))}px`;
    panel.style.top = `${Math.max(8, rect.top - panel.offsetHeight - 8)}px`;
  };
  const children = [];
  function clearChildren(from = 0) { for (const panel of children.splice(from)) { if (panel.matches(':popover-open')) panel.hidePopover(); panel.remove(); } }
  modelPanel.addEventListener('toggle', () => { if (!modelPanel.matches(':popover-open')) clearChildren(); });
  function close(panel, focus = true) { if (panel === modelPanel) clearChildren(); if (panel.matches(':popover-open')) panel.hidePopover(); if (focus) focusPrompt(); }
  function open(panel, anchor) {
    if (panel.matches(':popover-open')) return close(panel);
    panel.showPopover(); position(panel, anchor);
    panel.querySelector('input,button')?.focus();
  }
  for (const [panel, anchor] of [[modelPanel, trigger], [menu, arrow]]) {
    anchor.setAttribute('aria-expanded', 'false');
    panel.addEventListener('toggle', () => anchor.setAttribute('aria-expanded', String(panel.matches(':popover-open'))));
    panel.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(panel); }
      if (!['ArrowDown', 'ArrowUp'].includes(event.key)) return;
      event.stopPropagation();
      const scope = event.target.closest('.composer-model-panel') || panel;
      const items = [...scope.querySelectorAll('button:not([disabled])')].filter((item) => !item.closest('.composer-model-panel') || item.closest('.composer-model-panel') === scope);
      if (!items.length) return;
      event.preventDefault();
      const index = items.indexOf(document.activeElement);
      items[(index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length].focus();
    });
  }
  function column(title, entries, selected, choose, kind) {
    const section = document.createElement('section'); section.className = 'composer-choice-column';
    const heading = document.createElement('h3'); heading.textContent = title;
    const search = document.createElement('input'); search.type = 'search'; search.placeholder = `搜索${title}…`; search.setAttribute('aria-label', `搜索${title}`);
    const list = document.createElement('div'); list.className = 'composer-choice-list';
    function render() {
      list.replaceChildren();
      const favoriteKey = (value) => kind === 'thinking' ? `${model}:${value}` : value;
      const favorites = getFavorites()[kind] || [];
      const filtered = entries.filter((entry) => entry.join(' ').toLowerCase().includes(search.value.toLowerCase()));
      filtered.sort((a, b) => Number(favorites.includes(favoriteKey(b[0]))) - Number(favorites.includes(favoriteKey(a[0]))));
      for (const [value, label] of filtered) {
        const item = document.createElement('button'); item.type = 'button';
        const text = document.createElement('span'); text.textContent = label;
        item.append(text);
        if (value === selected) item.append(icon('check'));
        else if (kind !== 'thinking') item.append(icon('next'));
        item.title = label; item.setAttribute('aria-pressed', String(value === selected));
        item.onclick = () => choose(value, item);
        const row = document.createElement('div'); row.className = 'composer-choice-row';
        const star = document.createElement('button'); star.type = 'button'; star.className = 'composer-favorite';
        const favorite = favorites.includes(favoriteKey(value));
        star.textContent = favorite ? '★' : '☆'; star.setAttribute('aria-label', `${favorite ? '取消收藏' : '收藏'} ${label}`); star.setAttribute('aria-pressed', String(favorite));
        star.onclick = async () => {
          star.disabled = true;
          try {
            const key = favoriteKey(value);
            await toggleFavorite(kind, key, !favorite); render();
            [...list.querySelectorAll('.composer-favorite')].find((button) => button.dataset.favoriteKey === key)?.focus();
          }
          catch (error) { star.title = `收藏失败：${error.message}`; star.disabled = false; }
        };
        star.dataset.favoriteKey = favoriteKey(value);
        row.append(item, star); list.append(row);
      }
      if (!list.childElementCount) { const empty = document.createElement('p'); empty.textContent = '没有匹配项'; list.append(empty); }
    }
    if (title !== '供应商') {
      const back = document.createElement('button'); back.type = 'button'; back.className = 'composer-choice-back'; back.append(icon('back'), document.createTextNode('返回'));
      back.onclick = () => { const index = title === '思考等级' ? 1 : 0; clearChildren(index); (index ? children[0] : modelPanel)?.querySelector('input')?.focus(); };
      section.append(back);
    }
    search.oninput = render; render(); section.append(heading, search, list); return section;
  }
  function showChild(index, content, anchor) {
    clearChildren(index);
    const panel = document.createElement('div'); panel.className = 'composer-model-panel composer-model-child'; panel.popover = 'manual';
    panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', content.querySelector('h3').textContent);
    panel.append(content); modelPanel.append(panel); children.push(panel); panel.showPopover();
    const rect = anchor.closest('.composer-model-panel').getBoundingClientRect();
    const width = panel.offsetWidth;
    const left = rect.right + width + 8 <= innerWidth ? rect.right + 6 : rect.left - width - 6;
    panel.style.left = `${Math.max(8, Math.min(left, innerWidth - width - 8))}px`;
    panel.style.top = `${Math.max(8, Math.min(rect.top, innerHeight - panel.offsetHeight - 8))}px`;
    panel.querySelector('input')?.focus();
  }
  function showModels() {
    clearChildren();
    modelPanel.replaceChildren(column('供应商', providers(), state().model?.split('/')[0], (value, anchor) => {
      provider = value; model = null;
      showChild(0, column('模型', models(provider), state().model, (value, anchor) => {
        model = value;
        showChild(1, column('思考等级', levels(model).map((value) => [value, value]), model === state().model ? state().thinking : null, async (value) => {
          close(modelPanel); await selectModel(model, value);
          if (typeof document !== 'undefined' && document?.body) { refresh(); focusPrompt(); }
        }, 'thinking'), anchor);
      }, 'model'), anchor);
    }, 'provider'));
  }
  trigger.onclick = () => {
    if (!modelPanel.matches(':popover-open')) { provider = null; model = null; showModels(); }
    open(modelPanel, trigger);
  };
  const labels = { stop: '等待安全点后停止', force: '立即强制停止', steer: '发送介入指令', followUp: '当前轮结束后发送' };
  for (const name of Object.keys(labels)) {
    const option = document.createElement('button'); option.type = 'button'; option.append(icon(name), document.createTextNode(name));
    option.title = labels[name]; option.setAttribute('role', 'menuitem'); option.dataset.operation = name;
    option.onclick = () => { operation = name; close(menu); refresh(); if (state().busy) primary.click(); }; menu.append(option);
  }
  arrow.onclick = () => open(menu, split);
  primary.onclick = () => {
    if (!state().busy) $('composer').requestSubmit($('send'));
    else if (operation === 'stop') $('stop').click();
    else if (operation === 'force') $('force-stop').click();
    else $('composer').requestSubmit($(operation === 'steer' ? 'send-steer' : 'send-followup'));
    focusPrompt();
  };
  function refresh() {
    const current = state();
    if ((!previousBusy && current.busy) || identity !== current.sessionId) operation = 'stop';
    if (identity !== current.sessionId) close(modelPanel, false);
    identity = current.sessionId; previousBusy = current.busy;
    const modelName = document.createElement('span'); modelName.textContent = current.model ? `${current.model.replace('/', ' · ')} · ${current.thinking || 'off'}` : '选择模型';
    trigger.replaceChildren(modelName, icon('chevron'));
    trigger.title = current.model || '选择模型'; trigger.disabled = !current.available;
    primary.replaceChildren(icon(current.busy ? operation : 'send'), document.createTextNode(current.busy ? operation : '发送')); primary.title = current.busy ? labels[operation] : '发送消息';
    const underlying = current.busy ? $(operation === 'stop' ? 'stop' : operation === 'force' ? 'force-stop' : operation === 'steer' ? 'send-steer' : 'send-followup') : $('send');
    primary.disabled = underlying.disabled || (current.busy && operation === 'stop' && current.safeStopping);
    $('composer-action-help').textContent = current.busy ? `Enter ${operation === 'followUp' ? 'followUp' : 'steer'} · 按钮执行 ${operation} · 双按 Esc stop` : 'Enter 发送 · 右侧下拉点击即执行 · 双按 Esc stop';
    arrow.disabled = !current.busy;
    for (const item of menu.children) {
      const name = item.dataset.operation;
      const target = $(name === 'stop' ? 'stop' : name === 'force' ? 'force-stop' : name === 'steer' ? 'send-steer' : 'send-followup');
      item.disabled = !current.busy || target.disabled || (name === 'stop' && current.safeStopping);
    }
  }

  window.addEventListener('resize', () => { close(modelPanel, false); for (const [panel, anchor] of [[modelPanel, trigger], [menu, split]]) if (panel.matches(':popover-open')) position(panel, anchor); });
  // Do not steal focus from searches, dialogs, selections or other controls.
  document.addEventListener('keydown', (event) => {
    if (event.ctrlKey || event.metaKey || event.altKey || event.isComposing || event.key.length !== 1 || document.querySelector('dialog[open], :popover-open') || getSelection()?.toString()) return;
    if (event.target === document.body || event.target === document.documentElement) focusPrompt();
  });
  $('prompt').autofocus = true;
  refresh();
  return { refresh, queue: () => operation === 'followUp' ? 'followUp' : 'steer' };
}
