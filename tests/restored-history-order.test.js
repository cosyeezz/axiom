import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Sessions } from '../src/sessions.js';
import { bootHistoryPage, until } from './helpers/history-page.js';

test('重启后大量子代理历史不挤走最新主会话正文，旧页仍可读子历史', async t => {
  const root = mkdtempSync(join(tmpdir(), 'axiom-restored-order-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const writeHistory = (name, messages) => {
    const file = join(root, `${name}.jsonl`);
    writeFileSync(file, [{ type: 'session', version: 3, id: name, cwd: root },
      ...messages.map((message, n) => ({ type: 'message', id: `${name}-${n}`, parentId: n ? `${name}-${n - 1}` : null, message }))].map(JSON.stringify).join('\n'));
    return file;
  };
  const file = writeHistory('main', [
    { role: 'user', content: [{ type: 'text', text: '历史用户请求' }] },
    { role: 'assistant', content: [{ type: 'toolCall', id: 'delegate-call', name: 'delegate', arguments: {} }] },
    { role: 'toolResult', toolCallId: 'delegate-call', toolName: 'delegate', content: [{ type: 'text', text: JSON.stringify({ taskIds: ['child'] }) }] },
    { role: 'assistant', content: [{ type: 'text', text: '<axiom_display>历史主会话最终回答</axiom_display>' }] },
  ]);
  const childFile = writeHistory('child', Array.from({ length: 130 }, (_, n) => ({ role: n % 2 ? 'assistant' : 'user', content: [{ type: 'text', text: `子历史 ${n}` }] })));
  const sessions = Object.create(Sessions.prototype);
  const item = { loaded: false, cwd: root, title: '历史', seq: 7 };
  sessions.get = () => item;
  sessions.goalStore = { load: () => null };
  sessions.store = { getSession: () => ({ sessionFile: file, cwd: root, selection: { model: 'test/model', levels: ['off'] }, tasks: [{ id: 'child', task: '子任务', status: 'completed', sessionFile: childFile }] }) };
  const latest = sessions.snapshot('s', { epoch: 'instance', window: { edge: 'last', limit: 60 } });
  assert.equal(latest.messages.at(-1).agentId, 'main');
  assert.equal(latest.messages.at(-1).entryId, 'main-3');
  const ids = new Set(latest.messages.map(m => m.messageId));
  let current = latest;
  while (current.history.prevCursor) {
    current = await sessions.history('s', { before: current.history.prevCursor, limit: 60 }, 'instance');
    for (const message of current.messages) { assert.ok(!ids.has(message.messageId)); ids.add(message.messageId); }
  }
  assert.equal(ids.size, 134, '分页不丢失或重复主子历史');
  const page = bootHistoryPage();
  t.after(page.close);
  page.open();
  await until(() => page.app.connected(), '页面连接');
  page.app.snapshot(latest);
  assert.match(page.$('output').textContent, /历史主会话最终回答/);
  assert.equal(page.$('session-tabs'), null);
});
