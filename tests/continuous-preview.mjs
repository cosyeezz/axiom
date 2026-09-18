// Isolated browser fixture: no SDK, credentials or user sessions.
// 历史不再分页：attach 一次下发全部消息，页面整份挂载。
import { createServerApp } from '../src/server.js';
import { toWireRecord } from '../src/session-history.js';
const id = 'continuous-preview';
const records = Array.from({ length: 300 }, (_, n) => ({ agentId: 'main', entryId: `m${n}`, message: { role: n % 2 ? 'assistant' : 'user', content: `消息 ${n}\n\n连续阅读验证。` } }));
const state = { sessionId: id, title: '连续历史验收', cwd: process.cwd(), status: 'idle', config: { model: 'preview/axiom', thinking: 'off', levels: ['off'], skills: [] }, tasks: [], live: {}, tools: {}, compactions: [], retries: [] };
const snapshot = () => ({
  ...state,
  messages: records.map(toWireRecord),
  messageIndexes: records.map((_, index) => index),
  messageCount: records.length,
  instanceId: 'preview',
});
const sessions = {
  createAgent: { catalog: () => [{ provider: 'preview', id: 'axiom', key: 'preview/axiom', name: 'Preview', levels: ['off'] }] },
  list: () => [{ id, title: state.title, cwd: state.cwd, status: 'idle' }],
  get: () => state, ensureLoaded: async () => state,
  snapshot,
  subscribe: () => () => {},
};
const app = createServerApp(sessions);
app.server.listen(4398, '127.0.0.1', () => console.log('continuous preview 4398'));
