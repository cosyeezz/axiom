import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Sessions } from '../src/sessions.js';
import { bootSessionPage, until } from './helpers/session-page.js';

test('重启后大量子代理历史不挤走最新主会话正文，子历史同批下发', async t => {
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
  const state = sessions.snapshot('s', { epoch: 'instance', includeSeq: true });
  // 主轴末条仍是主会话最终回答：130 条子历史插在委派锚点后，不追加到末尾。
  assert.equal(state.messages.at(-1).agentId, 'main');
  assert.equal(state.messages.at(-1).entryId, 'main-3');
  const ids = new Set(state.messages.map(m => m.messageId));
  assert.equal(ids.size, 134, '一次下发主子历史，不重不漏');
  const page = bootSessionPage();
  t.after(page.close);
  page.open();
  await until(() => page.app.connected(), '页面连接');
  page.app.snapshot(state);
  assert.match(page.$('output').textContent, /历史主会话最终回答/);
  assert.equal(page.$('session-tabs'), null);
});
