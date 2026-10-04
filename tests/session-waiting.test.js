import test from 'node:test';
import assert from 'node:assert/strict';
import { bootSessionPage, until } from './helpers/session-page.js';

const question = (toolCallId, proposal) => ({ toolCallId, questions: [{
  header: '确认', question: '是否继续？', description: '确认后继续执行。', options: [{ label: '继续' }],
}], ...(proposal ? { proposal: { changes: [] } } : {}) });
const dot = (page, id = page.app.session()) => page.window.document.querySelector(`.session-row[data-session-id="${id}"] .session-item > small`);
const emit = (page, type, data) => page.sockets.at(-1).receive({ type, sessionId: page.app.session(), data });
const checkWaiting = (page) => {
  assert.equal(page.$('session-state').dataset.state, 'waiting');
  assert.equal(page.$('session-state').textContent, '等待确认');
  assert.equal(dot(page).className, 'session-waiting-dot');
  assert.equal(dot(page).getAttribute('aria-label'), '等待用户确认');
  assert.equal(dot(page).title, '等待用户确认');
  assert.equal(dot(page).hidden, false);
};

async function open(page) {
  page.open();
  await until(() => page.app.session() && dot(page), 'session and sidebar attached');
}

test('question and Todo confirmation share waiting display; only the last close restores execution', async () => {
  const page = bootSessionPage({ records: [] });
  try {
    await open(page);
    page.app.snapshot(page.fullState({ status: 'running' }));
    emit(page, 'question.asked', question('ordinary'));
    checkWaiting(page);
    emit(page, 'question.asked', question('todo', true));
    emit(page, 'question.asked', question('todo', true)); // duplicate delivery is idempotent
    emit(page, 'question.closed', { toolCallId: 'ordinary' });
    checkWaiting(page);
    assert.equal(page.$('question-dock').classList.contains('question-todo'), true);
    emit(page, 'question.closed', { toolCallId: 'todo' });
    assert.equal(page.$('session-state').textContent, '运行中');
    assert.equal(dot(page).className, 'session-running-dot');
    assert.equal(dot(page).hidden, false);
    await page.window.eval('refreshSessions()'); // stale idle list must not hide the live running signal
    assert.equal(dot(page).className, 'session-running-dot');
    assert.equal(dot(page).hidden, false);
    emit(page, 'session.state', { status: 'idle' });
    assert.equal(page.$('session-state').textContent, '空闲');
    assert.equal(dot(page).hidden, true);
    assert.equal(page.$('question-dock').hidden, true);
  } finally { await page.close(); }
});

test('snapshots rebuild pending confirmations; stop/disconnect win and idle background work is not waiting', async () => {
  const page = bootSessionPage({ records: [] });
  try {
    await open(page);
    for (const status of ['running', 'idle']) {
      page.app.snapshot(page.fullState({ status, questions: [question('pending')] }));
      checkWaiting(page);
    }
    page.app.setConnected(false);
    assert.equal(page.$('session-state').textContent, '连接断开');
    page.app.setConnected(true);
    checkWaiting(page);
    for (const [state, text] of [[{ status: 'running', safeStop: true }, '安全停止中'], [{ status: 'cancelling' }, '正在停止']]) {
      page.app.snapshot(page.fullState({ ...state, questions: [question('pending')] }));
      assert.equal(page.$('session-state').textContent, text);
      assert.notEqual(dot(page).className, 'session-waiting-dot');
    }
    page.app.snapshot(page.fullState({ status: 'running', questions: [question('restored')] }));
    checkWaiting(page);
    page.app.snapshot(page.fullState({ status: 'idle', questions: [], todo: {
      listId: 'paused-list', version: 1, header: { paused: true },
      counts: { targets: { total: 1, running: 1 } }, coverage: { complete: false },
      items: [{ id: 'goal', level: 1, title: '已暂停目标', status: 'running' }], hasMore: false,
    } }));
    assert.equal(page.$('session-state').textContent, '空闲');
    assert.notEqual(dot(page).className, 'session-waiting-dot');
    assert.equal(page.$('todo-dock').querySelector('.todo-header > .todo-action').textContent, '恢复');
    emit(page, 'session.state', { status: 'idle', stopped: 'safe' });
    assert.equal(page.$('session-state').textContent, '已停下');
    page.app.snapshot(page.fullState({ status: 'running', tasks: [{ id: 'child', task: '后台工作', status: 'running' }] }));
    assert.equal(page.$('session-state').textContent, '运行中');
    assert.notEqual(dot(page).className, 'session-waiting-dot');
  } finally { await page.close(); }
});

test('reply failure keeps waiting; confirmed response clears it even before a close event arrives', async () => {
  let fail = true;
  const page = bootSessionPage({ records: [], respond(req, fallback) {
    if (req.type !== 'question.reply') return fallback(req);
    if (fail) throw new Error('答案未被接受');
    return { toolCallId: req.toolCallId };
  } });
  try {
    await open(page);
    page.app.snapshot(page.fullState({ status: 'running', questions: [question('reply')] }));
    page.$('question-dock').querySelector('.question-choice').click();
    page.$('question-dock').querySelector('.question-submit').click();
    checkWaiting(page);
    await until(() => page.$('question-dock').querySelector('.question-error'), 'reply failure visible');
    checkWaiting(page);
    fail = false;
    page.$('question-dock').querySelector('.question-submit').click();
    await until(() => page.$('question-dock').hidden, 'reply accepted');
    assert.equal(page.$('session-state').textContent, '运行中');
    assert.equal(dot(page).className, 'session-running-dot');
    assert.equal(dot(page).hidden, false);
    emit(page, 'question.closed', { toolCallId: 'reply' });
    assert.equal(page.$('session-state').textContent, '运行中');
  } finally { await page.close(); }
});

test('list-only waiting changes repaint other sessions; snapshots and switching never inherit another question', async () => {
  let awaiting = false;
  const page = bootSessionPage({ records: [], respond(req, fallback) {
    if (req.type === 'sessions.list') return [...fallback(req), {
      id: 'other', title: '另一个会话', cwd: 'C:/work', status: 'running', updatedAt: 1, awaitingConfirmation: awaiting,
    }];
    return fallback(req);
  } });
  try {
    await open(page);
    assert.equal(dot(page, 'other').className, 'session-running-dot');
    awaiting = true;
    await page.window.eval('refreshSessions()');
    assert.equal(dot(page, 'other').className, 'session-waiting-dot');
    assert.equal(page.$('session-state').textContent, '空闲');
    awaiting = false;
    await page.window.eval('refreshSessions()');
    assert.equal(dot(page, 'other').className, 'session-running-dot');
    page.app.snapshot(page.fullState({ status: 'running', questions: [question('mine')] }));
    checkWaiting(page);
    await page.window.eval('refreshSessions()'); // fixture returns a stale nonwaiting current row
    checkWaiting(page);
    page.app.snapshot(page.fullState({ sessionId: 'other', status: 'running', questions: [] }));
    assert.equal(page.$('session-state').textContent, '运行中');
    assert.equal(dot(page, 'long').className, 'session-waiting-dot', 'previous session retains its own pending signal');
    page.app.snapshot(page.fullState({ questions: [] }));
    assert.equal(page.$('session-state').textContent, '空闲');
    assert.notEqual(dot(page).className, 'session-waiting-dot');
  } finally { await page.close(); }
});
