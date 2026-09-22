const KEY = 'axiom.todoExpanded';
const paths = {
  pending: '<rect x="3" y="3" width="14" height="14" rx="3"/>',
  running: '<circle cx="10" cy="10" r="7"/><path d="M10 6v4l3 2"/>',
  done: '<path d="m4 10 4 4 8-9"/>',
  blocked: '<circle cx="10" cy="10" r="7"/><path d="M10 6v5m0 3h.01"/>',
};
const names = { pending: '待处理', running: '进行中', done: '已完成', blocked: '受阻' };
function icon(state) { return `<svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">${paths[state]}</svg>`; }
export function createTodoUI({ root, request }) {
  let todo = null, sessionId = null, connected = true, expanded = false;
  try { expanded = localStorage.getItem(KEY) === '1'; } catch {}
  function render() {
    root.replaceChildren(); root.hidden = !todo?.items?.length;
    if (root.hidden) return;
    const head = document.createElement('div'); head.className = 'todo-header';
    const toggle = document.createElement('button'); toggle.type = 'button'; toggle.className = 'todo-toggle';
    toggle.setAttribute('aria-expanded', String(expanded)); toggle.setAttribute('aria-controls', 'todo-list');
    toggle.setAttribute('aria-label', expanded ? '收起任务清单' : '展开任务清单');
    const title = document.createElement('span'); title.textContent = 'Todo'; toggle.append(title);
    const leaves = todo.items.filter(i => !todo.items.some(c => c.parentId === i.id));
    for (const state of Object.keys(paths)) {
      const count = leaves.filter(i => i.status === state).length;
      const badge = document.createElement('span'); badge.className = 'todo-count'; badge.dataset.status = state;
      badge.title = names[state]; badge.setAttribute('aria-label', `${names[state]} ${count}`);
      badge.innerHTML = icon(state); badge.append(document.createTextNode(String(count))); toggle.append(badge);
    }
    toggle.onclick = () => { expanded = !expanded; try { localStorage.setItem(KEY, expanded ? '1' : '0'); } catch {} render(); };
    head.append(toggle);
    const action = document.createElement('button'); action.type = 'button'; action.className = 'todo-action';
    action.textContent = todo.mode === 'paused' ? '恢复' : todo.mode === 'completed' ? '已完成' : '暂停';
    action.disabled = !connected || todo.mode === 'completed';
    action.onclick = async () => {
      action.disabled = true;
      try { await request('todo.action', { sessionId, action: todo.mode === 'paused' ? 'resume' : 'pause' }); }
      catch (error) { const alert = document.createElement('div'); alert.setAttribute('role', 'alert'); alert.textContent = error.message; root.append(alert); }
      finally { action.disabled = !connected || todo.mode === 'completed'; }
    };
    head.append(action); root.append(head);
    const list = document.createElement('div'); list.id = 'todo-list'; list.hidden = !expanded; list.className = 'todo-list';
    if (todo.reason) { const reason = document.createElement('p'); reason.className = 'todo-reason'; reason.textContent = todo.reason; list.append(reason); }
    function row(item, child = false) {
      const el = document.createElement('div'); el.className = 'todo-row'; el.dataset.status = item.status; if (child) el.classList.add('todo-child');
      const status = document.createElement('span'); status.innerHTML = icon(item.status); status.title = names[item.status];
      const text = document.createElement('span'); text.textContent = item.title;
      el.append(status, text); if (item.note) { const note = document.createElement('small'); note.textContent = item.note; el.append(note); }
      list.append(el);
    }
    for (const item of todo.items.filter(i => !i.parentId)) { row(item); for (const child of todo.items.filter(i => i.parentId === item.id)) row(child, true); }
    root.append(list);
  }
  window.addEventListener('storage', event => { if (event.key === KEY) { expanded = event.newValue === '1'; render(); } });
  return {
    show(id, value) { sessionId = id; todo = value; render(); },
    setConnected(value) { if (connected !== value) { connected = value; render(); } },
  };
}
