import { actionIconNode } from './icons.js';

export function createTodoUI({ root, request }) {
  const KEY = 'axiom.todoExpanded';
  const stateIcons = { pending: 'pending', running: 'clock', done: 'check', blocked: 'blocked' };
  const names = { pending: '待处理', running: '进行中', done: '已完成', blocked: '受阻' };
  const checks = { tool: '工具验证', review: '检查确认', user: '由你验收' };
  const el = (tag, cls, text) => {
    const node = document.createElement(tag);
    node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  };
  const icon = (state) => {
    const slot = el('span', 'todo-state-icon');
    slot.setAttribute('aria-hidden', 'true');
    slot.append(actionIconNode(stateIcons[state] ?? stateIcons.pending));
    return slot;
  };
  let todo = null, sessionId = null, connected = true, expanded = true;
  let generation = 0, nextOffset = null, loading = false, detailId = 0;
  const rows = new Map();
  // Child summaries load independently of details, with bounded page size/concurrency.
  const childQueue = [];
  let activeReads = 0;
  try { expanded = localStorage.getItem(KEY) !== '0'; } catch {}

  const head = el('div', 'todo-header');
  const toggle = el('button', 'todo-toggle');
  const action = el('button', 'todo-action');
  const list = el('div', 'todo-list');
  const notice = el('p', 'todo-reason');
  const more = el('button', 'todo-action', '显示更多目标');
  toggle.type = action.type = more.type = 'button';
  list.id = 'todo-list';
  toggle.setAttribute('aria-controls', list.id);

  const identity = el('span', 'todo-identity');
  const chevron = actionIconNode('chevron');
  chevron.classList.add('todo-chevron');
  identity.append(chevron, actionIconNode('checklist'), el('span', 'todo-heading', '任务清单'));
  const metrics = el('span', 'todo-metrics');
  toggle.append(identity, metrics);
  head.append(toggle, action);
  root.replaceChildren(head, notice, list, more);

  const error = (e) => {
    notice.textContent = e.message;
    notice.hidden = false;
    notice.setAttribute('role', 'alert');
  };

  async function query(params = {}) {
    const id = sessionId, token = generation;
    const { id: itemId, ...rest } = params;
    try {
      const value = await request('todo.get', {
        sessionId: id, listId: todo?.listId, ...rest, ...(itemId ? { itemId } : {}),
      });
      if (id !== sessionId || token !== generation) return null;
      return value;
    } catch (error) {
      if (id !== sessionId || token !== generation) return null;
      throw error;
    }
  }

  function closeDetail(row) {
    row.detail?.remove();
    row.detail = null;
    row.button.setAttribute('aria-expanded', 'false');
    row.button.removeAttribute('aria-busy');
  }

  async function details(row) {
    if (row.detail) { closeDetail(row); return; }
    const detail = el('div', 'todo-detail', '正在读取详情…');
    detail.id = row.button.getAttribute('aria-controls');
    row.detail = detail;
    row.node.insertBefore(detail, row.children ?? null);
    row.button.setAttribute('aria-expanded', 'true');
    row.button.setAttribute('aria-busy', 'true');
    const current = () => row.detail === detail && row.node.isConnected;
    try {
      const view = await query({ id: row.item.id, detail: true, limit: 1 });
      if (!view || !current()) return;
      const verification = await query({ id: row.item.id, section: 'verification', limit: 10 });
      if (!verification || !current()) return;
      if (view.version < todo.version || verification.version < todo.version) { closeDetail(row); return; }
      detail.replaceChildren();
      const section = (label, text) => {
        if (text) detail.append(el('strong', 'todo-detail-label', label), el('p', '', text));
      };
      section('任务说明', view.item.description);
      const criteria = el('ul', '');
      for (const c of view.item.acceptance ?? []) {
        criteria.append(el('li', '', `${c.text}（${checks[c.check] ?? '检查确认'}）`));
      }
      if (criteria.childNodes.length) detail.append(el('strong', 'todo-detail-label', '验收标准'), criteria);
      section('实施结果', view.item.summary);
      section('受阻原因', view.item.blocker);
      if (verification.verification?.length) detail.append(el('strong', 'todo-detail-label', '验收记录'));
      for (const v of verification.verification ?? []) {
        const label = view.item.acceptance?.find(c => c.criterionId === v.criterionId)?.text ?? v.criterionId;
        detail.append(el('p', '', `${label}：${v.result}`));
        for (const ref of v.refs ?? []) {
          detail.append(el('small', 'todo-evidence', ref.messageId ? `消息依据：${ref.messageId}` : `工具依据：${ref.toolCallId}`));
        }
      }
      if (!detail.childNodes.length) detail.append(el('p', '', '暂无任务详情'));
    } catch (e) {
      if (current()) { closeDetail(row); error(e); }
    } finally {
      if (current()) row.button.removeAttribute('aria-busy');
    }
  }

  function updateRow(row, item) {
    row.item = item;
    row.node.dataset.status = item.status;
    row.button.replaceChildren(icon(item.status), el('span', 'todo-item-label', item.title));
    row.button.setAttribute('aria-label', `${item.title}，${names[item.status] ?? names.pending}`);
    row.button.title = `查看任务详情 · ${names[item.status] ?? names.pending}`;
    row.button.disabled = !connected;
    closeDetail(row);
  }

  function put(item, container = list) {
    let row = rows.get(item.id);
    if (!row) {
      const node = el('div', `todo-row${item.level === 2 ? ' todo-child' : ''}`);
      node.dataset.id = item.id;
      const button = el('button', 'todo-item-title');
      button.type = 'button';
      button.setAttribute('aria-controls', `todo-detail-${++detailId}`);
      node.append(button);
      row = { node, button, item, childVersion: -1, queued: false, childLoading: false };
      button.onclick = () => details(row);
      if (item.level === 1) {
        row.children = el('div', 'todo-children');
        row.childMore = el('button', 'todo-action', '显示更多步骤');
        row.childMore.type = 'button';
        row.childMore.hidden = true;
        row.childMore.onclick = () => queueChildren(row, row.childOffset ?? 0);
        node.append(row.children, row.childMore);
      }
      rows.set(item.id, row);
      container.append(node);
    }
    updateRow(row, item);
    return row;
  }

  function place(container, node, next = null) {
    if (node.parentNode === container && node.nextSibling === next) return;
    const focused = document.activeElement;
    const restore = node.contains(focused);
    container.insertBefore(node, next);
    if (restore) focused.focus({ preventScroll: true });
  }

  function removeRow(id) {
    const row = rows.get(id);
    if (!row) return;
    if (row.node.contains(document.activeElement)) {
      (rows.get(row.item.parentId)?.button ?? toggle).focus({ preventScroll: true });
    }
    for (const child of row.children?.querySelectorAll('.todo-child') ?? []) removeRow(child.dataset.id);
    closeDetail(row);
    row.node.remove();
    rows.delete(id);
  }

  function queueChildren(row, offset = 0) {
    if (row.queued || row.childLoading || !row.node.isConnected || !connected || !expanded) return;
    row.queued = true;
    row.childMore.disabled = true;
    childQueue.push({ row, offset, token: generation });
    drainChildren();
  }

  function drainChildren() {
    while (connected && activeReads < 4 && childQueue.length) {
      const job = childQueue.shift();
      job.row.queued = false;
      if (job.token !== generation || !job.row.node.isConnected) continue;
      activeReads++;
      void loadChildren(job.row, job.offset).finally(() => { activeReads--; drainChildren(); });
    }
  }

  async function loadChildren(row, offset) {
    row.childLoading = true;
    const version = todo.version;
    try {
      const view = await query({ id: row.item.id, offset, limit: 20 });
      if (!view || !row.node.isConnected || !expanded) return;
      if (view.version < todo.version) return;
      if (offset === 0) {
        const ids = new Set(view.items.map(i => i.id));
        for (const child of row.children.querySelectorAll('.todo-child')) {
          if (!ids.has(child.dataset.id)) removeRow(child.dataset.id);
        }
      }
      row.children.querySelector('.todo-reason')?.remove();
      let previous = offset === 0 ? null : row.children.lastElementChild;
      for (const item of view.items) {
        const child = put(item, row.children);
        const next = previous ? previous.nextSibling : row.children.firstChild;
        if (child.node !== next && child.node !== previous) place(row.children, child.node, next);
        previous = child.node;
      }
      row.childVersion = view.version ?? version;
      row.childOffset = view.nextOffset;
      row.childMore.textContent = '显示更多步骤';
      row.childMore.hidden = !view.hasMore;
      const children = [...row.children.querySelectorAll('.todo-child')];
      if (children.length && !view.hasMore && children.every(c => c.dataset.status === 'done') && row.item.status !== 'done') {
        row.children.append(el('p', 'todo-reason', '步骤已完成，待目标验收'));
      }
    } catch (e) {
      if (row.node.isConnected) {
        error(e);
        row.childOffset = offset;
        row.childMore.textContent = '重试读取步骤';
        row.childMore.hidden = false;
      }
    } finally {
      row.childLoading = false;
      row.childMore.disabled = !connected;
      // A newer broadcast arriving during a read gets one fresh page, never stale rows.
      if (row.node.isConnected && version < todo?.version) queueChildren(row);
    }
  }

  async function load(offset = 0) {
    if (loading || !connected || !expanded || !todo?.listId) return;
    loading = true;
    more.disabled = true;
    const token = generation, version = todo.version;
    try {
      const view = await query({ offset, limit: 20 });
      if (!view || !expanded || view.version < todo.version) return;
      todo = { ...todo, ...view };
      for (const item of view.items) {
        const row = put(item);
        if (row.childVersion < todo.version) queueChildren(row);
      }
      nextOffset = view.nextOffset;
      renderHeader();
    } catch (e) { error(e); }
    finally {
      if (token === generation) {
        loading = false;
        more.disabled = !connected;
        if (version < todo?.version && !rows.size) void load();
      }
    }
  }

  function renderHeader() {
    root.hidden = !todo?.listId;
    if (root.hidden) return;
    const counts = todo.counts?.targets ?? {};
    metrics.replaceChildren(el('span', 'todo-count', `${counts.done ?? 0} / ${counts.total ?? 0} 已完成`));
    for (const state of ['running', 'blocked']) {
      if (!counts[state]) continue;
      const badge = el('span', 'todo-count');
      badge.dataset.status = state;
      badge.append(icon(state), el('span', '', `${counts[state]} ${names[state]}`));
      metrics.append(badge);
    }
    toggle.setAttribute('aria-expanded', String(expanded));
    toggle.setAttribute('aria-label', `${expanded ? '收起' : '展开'}任务清单，${counts.done ?? 0} / ${counts.total ?? 0} 已完成，${counts.pending ?? 0} 待处理，${counts.running ?? 0} 进行中，${counts.blocked ?? 0} 受阻`);
    toggle.title = `${expanded ? '收起' : '展开'}任务清单`;
    const h = todo.header ?? {};
    action.textContent = todo.completed ? '已完成' : todo.cancelled ? '已取消' : h.requirePlan ? '取消创建' : h.paused ? '恢复' : '暂停';
    action.disabled = !connected || todo.completed || todo.cancelled;
    notice.textContent = h.runtimeBlock?.reason || h.pauseReason || (h.requirePlan ? '等待填写目标或确认目标' : todo.cancelled ? '已取消，未完成' : '');
    notice.hidden = !notice.textContent;
    notice.removeAttribute('role');
    list.hidden = !expanded;
    more.hidden = !expanded || nextOffset == null;
    more.disabled = !connected || loading;
    for (const row of rows.values()) {
      row.button.disabled = !connected;
      if (row.childMore) row.childMore.disabled = !connected || row.queued || row.childLoading;
    }
  }

  function collapse() {
    generation++;
    loading = false;
    childQueue.length = 0;
    rows.clear();
    list.replaceChildren();
    nextOffset = null;
  }

  function setExpanded(value) {
    expanded = value;
    if (!expanded) collapse();
    renderHeader();
    if (expanded && !rows.size) void load();
  }
  toggle.onclick = () => {
    try { localStorage.setItem(KEY, expanded ? '0' : '1'); } catch {}
    setExpanded(!expanded);
  };
  more.onclick = () => load(nextOffset);
  action.onclick = async () => {
    const id = sessionId, listId = todo?.listId;
    action.disabled = true;
    try {
      const value = await request('todo.action', {
        sessionId, action: todo.header?.requirePlan ? 'cancel_prepare' : todo.header?.paused ? 'resume' : 'pause',
      });
      if (id === sessionId && listId === todo?.listId && value?.listId) show(sessionId, value);
    } catch (e) { if (id === sessionId && listId === todo?.listId) error(e); }
    finally { renderHeader(); }
  };

  function show(id, value) {
    if (id !== sessionId || value?.listId !== todo?.listId) {
      collapse();
      sessionId = id;
      todo = null;
    }
    if (todo && value && value.version < todo.version) return;
    const changedVersion = value?.version !== todo?.version;
    todo = value;
    renderHeader();
    if (!expanded || !todo?.listId) { collapse(); return; }
    if (changedVersion) for (const row of rows.values()) closeDetail(row);
    for (const item of value?.changed ?? value?.items ?? []) {
      if (item.level === 1) put(item);
      else {
        const parent = rows.get(item.parentId);
        if (parent) put(item, parent.children);
      }
    }
    for (const removed of [...(value?.removedIds ?? []), ...(value?.removedTargetIds ?? [])]) removeRow(removed);
    if (value?.items) {
      // Broadcasts contain only the bounded first page, not deleted IDs. On a
      // new version discard previously loaded tail pages rather than keep ghosts.
      if (changedVersion || !value.hasMore) {
        const ids = new Set(value.items.filter(i => i.level === 1).map(i => i.id));
        for (const [id, row] of rows) if (row.item.level === 1 && !ids.has(id)) removeRow(id);
      }
      // Keep the server's ordering (including move operations) without replacing buttons.
      let previous = null;
      for (const item of value.items.filter(i => i.level === 1)) {
        const node = rows.get(item.id).node;
        if (node !== (previous ? previous.nextSibling : list.firstChild)) place(list, node, previous ? previous.nextSibling : list.firstChild);
        previous = node;
      }
      nextOffset = value.nextOffset ?? null;
    }
    for (const row of rows.values()) if (row.children && row.childVersion < todo.version) queueChildren(row);
    renderHeader();
    if (!value.items && !rows.size) void load();
  }

  window.addEventListener('storage', event => {
    if (event.key === KEY) setExpanded(event.newValue !== '0');
  });
  return {
    show,
    setConnected(value) {
      connected = value;
      renderHeader();
      if (connected && expanded) {
        for (const row of rows.values()) if (row.children && row.childVersion < todo?.version) queueChildren(row);
        drainChildren();
        if (!rows.size) void load();
      }
    },
    expand() { setExpanded(true); },
  };
}
