import { composerIconNode } from './icons.js';
import { createChoiceColumn } from './choice-column.js';
import { createThinkingPicker } from './thinking-picker.js';

// Compact composer controls. Existing session handlers remain the authority.
export function mountComposerControls({ state, providers, models, levels, selectModel, getFavorites = () => ({}), toggleFavorite = async () => {} }) {
  const $ = (id) => document.getElementById(id);
  const thinkingPicker = createThinkingPicker();
  const paths = { chevron: 'm8 10 4 4 4-4', next: 'm10 6 6 6-6 6', back: 'm14 6-6 6 6 6', check: 'm5 12 4 4L19 6', stop: 'M7 7h10v10H7z', force: 'm7 7 10 10M17 7 7 17', steer: 'M5 19V9a4 4 0 0 1 4-4h10m-4-4 4 4-4 4', followUp: 'M5 6h14M5 12h14M5 18h8m3-3 3 3-3 3', send: 'M12 20V4m-6 6 6-6 6 6', info: 'M12 8h.01M12 11v6M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0' };
  function icon(name) {
    if (['stop', 'force', 'steer', 'followUp', 'send', 'info'].includes(name)) return composerIconNode(name);
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true'); svg.classList.add('composer-control-icon');
    const path = document.createElementNS(svg.namespaceURI, 'path'); path.setAttribute('d', paths[name]); svg.append(path); return svg;
  }
  const actions = document.querySelector('#composer .actions');
  const info = document.createElement('button'); info.type = 'button'; info.className = 'icon-button composer-session-info';
  info.title = '会话详情：上下文、主代理配置与账单'; info.setAttribute('aria-label', info.title); info.append(icon('info'));
  info.onclick = () => $('session-inspector-trigger').click();
  const tools = document.querySelector('.context-bar .icon-group') || document.createElement('div');
  tools.classList.add('composer-tools'); tools.id = 'composer-tools';
  tools.append(info);
  const more = document.createElement('button'); more.type = 'button'; more.className = 'icon-button composer-tools-trigger';
  more.title = '添加与会话操作'; more.setAttribute('aria-label', more.title); more.setAttribute('aria-expanded', 'false'); more.setAttribute('aria-controls', 'context-menu');
  more.append(composerIconNode('context'));
  const trigger = document.createElement('button');
  trigger.type = 'button'; trigger.className = 'composer-model-trigger';
  trigger.setAttribute('aria-label', '选择供应商、模型和思考等级');
  trigger.setAttribute('aria-haspopup', 'dialog');
  const split = document.createElement('div'); split.className = 'composer-split';
  const primary = document.createElement('button'); primary.type = 'button';
  const arrow = document.createElement('button'); arrow.type = 'button'; arrow.append(icon('chevron'));
  arrow.setAttribute('aria-label', '选择运行操作'); arrow.setAttribute('aria-haspopup', 'menu');
  split.append(primary, arrow);
  actions.append(tools, more, trigger, split);
  const modelPanel = document.createElement('div');
  modelPanel.className = 'composer-model-panel'; modelPanel.popover = 'auto';
  modelPanel.setAttribute('role', 'dialog'); modelPanel.setAttribute('aria-label', '模型配置');
  const menu = document.createElement('div'); menu.className = 'composer-operation-menu'; menu.popover = 'auto';
  menu.setAttribute('role', 'menu');
  document.body.append(modelPanel, menu);
  let operation = 'stop', previousBusy = false, identity, provider, model;
  const focusPrompt = () => { if (!$('prompt').disabled) $('prompt').focus({ preventScroll: true }); };
  const viewport = () => {
    const view = window.visualViewport;
    return { left: view?.offsetLeft || 0, top: view?.offsetTop || 0, width: view?.width || innerWidth, height: view?.height || innerHeight };
  };
  const clamp = (value, min, max) => Math.max(min, Math.min(value, max));
  function fit(panel) {
    const view = viewport();
    panel.style.maxHeight = `${Math.max(0, view.height - 16)}px`;
    return view;
  }
  const position = (panel, anchor) => {
    const view = fit(panel), rect = anchor.getBoundingClientRect();
    panel.style.left = `${clamp(rect.left, view.left + 8, view.left + view.width - panel.offsetWidth - 8)}px`;
    panel.style.top = `${clamp(rect.top - panel.offsetHeight - 8, view.top + 8, view.top + view.height - panel.offsetHeight - 8)}px`;
  };
  function positionChild(panel, parent) {
    const view = fit(panel), rect = parent.getBoundingClientRect(), width = panel.offsetWidth;
    const left = view.width <= 720 ? rect.left : rect.right + width + 8 <= view.left + view.width ? rect.right + 6 : rect.left - width - 6;
    panel.style.left = `${clamp(left, view.left + 8, view.left + view.width - width - 8)}px`;
    panel.style.top = `${clamp(rect.top, view.top + 8, view.top + view.height - panel.offsetHeight - 8)}px`;
  }
  const contextMenu = $('context-menu');
  const toolButtons = [...tools.querySelectorAll('button:not([popovertarget])')];
  for (const button of toolButtons) {
    const label = document.createElement('span'); label.className = 'composer-tool-label';
    label.textContent = button === info ? '会话详情' : ({ 'add-image': '上传图片', 'compact-session': '压缩会话', 'goal-enter': '目标模式' }[button.id] || button.title);
    button.append(label);
  }
  function syncToolsLayout() {
    const compact = window.matchMedia?.('(max-width: 1000px)').matches || false;
    const destination = compact ? contextMenu : tools;
    if (destination && toolButtons[0]?.parentElement !== destination) {
      if (contextMenu) close(contextMenu, false);
      destination.append(...toolButtons);
    }
  }
  more.setAttribute('aria-haspopup', 'menu');
  more.onclick = () => {
    if (contextMenu.matches(':popover-open')) { close(contextMenu, false); more.focus(); }
    else { contextMenu.showPopover(); contextMenu.querySelector('button:not([disabled])')?.focus(); }
  };
  contextMenu?.addEventListener('toggle', () => more.setAttribute('aria-expanded', String(contextMenu.matches(':popover-open'))));
  contextMenu?.addEventListener('click', (event) => {
    if (toolButtons.includes(event.target.closest('button'))) close(contextMenu, false);
  });
  syncToolsLayout();
  const children = [];
  function clearChildren(from = 0) { for (const panel of children.splice(from)) { if (panel.matches(':popover-open')) panel.hidePopover(); panel.remove(); } }
  modelPanel.addEventListener('toggle', () => { if (!modelPanel.matches(':popover-open')) clearChildren(); });
  function close(panel, focus = true) { if (panel === modelPanel) clearChildren(); if (panel.matches(':popover-open')) panel.hidePopover(); if (focus) focusPrompt(); }
  function open(panel, anchor) {
    if (panel.matches(':popover-open')) return close(panel);
    panel.showPopover(); position(panel, anchor);
    panel.querySelector('input:not([disabled]),button:not([disabled])')?.focus();
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
  function columnOptions(kind) {
    return { icon, getFavorites: () => getFavorites()[kind] || [],
      toggleFavorite: (key, favorite) => toggleFavorite(kind, key, favorite),
      onBack: kind === 'provider' ? undefined : () => {
        const index = kind === 'thinking' ? 1 : 0;
        clearChildren(index); (index ? children[0] : modelPanel)?.querySelector('input')?.focus();
      } };
  }
  function column(title, entries, selected, choose, kind) {
    return createChoiceColumn({ ...columnOptions(kind), title, entries, selected, choose, next: true });
  }
  function showChild(index, content, anchor) {
    clearChildren(index);
    const panel = document.createElement('div'); panel.className = 'composer-model-panel composer-model-child'; panel.popover = 'manual';
    panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', content.querySelector('h3').textContent);
    panel.append(content); modelPanel.append(panel); children.push(panel); panel.showPopover();
    positionChild(panel, anchor.closest('.composer-model-panel'));
    panel.querySelector('input')?.focus();
  }
  function showModels() {
    clearChildren();
    const session = state().sessionId;
    const validSession = () => modelPanel.matches(':popover-open') && state().available && session === state().sessionId;
    modelPanel.replaceChildren(column('供应商', providers(), state().model?.split('/')[0], (value, anchor) => {
      if (!validSession() || !modelPanel.contains(anchor) || !providers().some(([key]) => key === value)) return;
      provider = value; model = null;
      const selectedProvider = provider;
      showChild(0, column('模型', models(provider), state().model, (value, anchor) => {
        if (!validSession() || !modelPanel.contains(anchor) || !models(selectedProvider).some(([key]) => key === value)) return;
        model = value;
        const selectedModel = model;
        const thinkingColumn = thinkingPicker.column({ ...columnOptions('thinking'), levels: levels(model), model,
          value: model === state().model ? state().thinking : null,
          choose: async (value) => {
            if (!validSession() || !modelPanel.contains(thinkingColumn) || model !== selectedModel || !models(selectedProvider).some(([key]) => key === selectedModel) || !levels(selectedModel).includes(value)) return;
            close(modelPanel);
            await selectModel(selectedModel, value);
            if (typeof document !== 'undefined' && document?.body) { refresh(); focusPrompt(); }
          } });
        showChild(1, thinkingColumn, anchor);
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
    if (identity !== current.sessionId || !current.available) {
      close(modelPanel, false);
      if (contextMenu) close(contextMenu, false);
    }
    identity = current.sessionId; previousBusy = current.busy;
    const modelName = document.createElement('span'); modelName.className = 'composer-model-name';
    modelName.textContent = current.model ? current.model.slice(current.model.indexOf('/') + 1) : '选择模型';
    const effort = document.createElement('span'); effort.className = 'composer-model-effort';
    effort.textContent = current.model ? current.thinking || 'off' : '';
    trigger.replaceChildren(modelName, effort, icon('chevron'));
    trigger.title = current.model ? `${current.model} · ${current.thinking || 'off'}` : '选择模型';
    trigger.setAttribute('aria-label', `选择供应商、模型和思考等级：${trigger.title}`);
    trigger.disabled = !current.available;
    primary.replaceChildren(icon(current.busy ? operation : 'send'), document.createTextNode(current.busy ? operation : '发送')); primary.title = current.busy ? labels[operation] : '发送消息';
    const underlying = current.busy ? $(operation === 'stop' ? 'stop' : operation === 'force' ? 'force-stop' : operation === 'steer' ? 'send-steer' : 'send-followup') : $('send');
    primary.disabled = underlying.disabled || (current.busy && operation === 'stop' && current.safeStopping);
    $('composer-action-help').textContent = current.busy ? `Enter ${operation === 'followUp' ? '排队发送' : '介入'} · 按钮执行 ${operation} · 双按 Esc 安全停止` : 'Enter 发送';
    $('composer-action-help').hidden = !current.busy;
    primary.setAttribute('aria-label', primary.title);
    arrow.disabled = !current.busy;
    arrow.hidden = !current.busy;
    split.dataset.busy = String(current.busy);
    for (const item of menu.children) {
      const name = item.dataset.operation;
      const target = $(name === 'stop' ? 'stop' : name === 'force' ? 'force-stop' : name === 'steer' ? 'send-steer' : 'send-followup');
      item.disabled = !current.busy || target.disabled || (name === 'stop' && current.safeStopping);
    }
  }

  // Resizing (including a phone keyboard) only changes geometry, never search DOM or focus.
  function reposition() {
    for (const [panel, anchor] of [[modelPanel, trigger], [menu, split]]) if (panel.matches(':popover-open')) position(panel, anchor);
    children.forEach((panel, index) => positionChild(panel, index ? children[index - 1] : modelPanel));
  }
  window.addEventListener('resize', () => { syncToolsLayout(); reposition(); });
  window.visualViewport?.addEventListener('resize', reposition);
  window.visualViewport?.addEventListener('scroll', reposition);
  // Do not steal focus from searches, dialogs, selections or other controls.
  document.addEventListener('keydown', (event) => {
    if (event.ctrlKey || event.metaKey || event.altKey || event.isComposing || event.key.length !== 1 || document.querySelector('dialog[open], :popover-open') || getSelection()?.toString()) return;
    if (event.target === document.body || event.target === document.documentElement) focusPrompt();
  });
  $('prompt').autofocus = true;
  refresh();
  return { refresh, invalidateModels: () => {
    // Keep a stable browsing snapshot until the next open. Every choice is revalidated
    // against the live catalog; removal of the active branch cancels it immediately.
    if ((provider && !providers().some(([key]) => key === provider)) || (model && !models(provider).some(([key]) => key === model))) close(modelPanel, false);
  }, queue: () => operation === 'followUp' ? 'followUp' : 'steer' };
}
