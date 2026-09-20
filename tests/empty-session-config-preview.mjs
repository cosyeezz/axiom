// Real Sessions and WS protocol, isolated storage, slow fake agent; no model or MCP connections.
import { createServerApp } from '../src/server.js';
import { Sessions } from '../src/sessions.js';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const home = await mkdtemp(join(tmpdir(), 'axiom-config-ui-'));
const catalog = [{ provider: 'preview', id: 'model', key: 'preview/model', name: 'Preview', levels: ['off', 'high'] }];
const factory = async (_tools, selection = {}) => {
  await new Promise(resolve => setTimeout(resolve, 600));
  let config = { model: selection.model || 'preview/model', thinking: selection.thinking || 'off', levels: ['off', 'high'], compaction: selection.compaction, retry: selection.retry };
  return {
    config: () => config,
    configure: async next => (config = { ...config, ...Object.fromEntries(Object.entries(next).filter(([, value]) => value !== undefined)) }),
    subscribe: () => () => {}, dispose: async () => {}, abort: async () => {},
    prompt: async () => {}, result: () => 'Preview only', queue: () => ({ steering: [], followUp: [] }),
    sessionFile: () => null, historyEntries: () => [],
  };
};
factory.cwd = home;
factory.catalog = () => catalog;
factory.capabilities = async () => ({ skills: [{ id: 's1', name: 'Skill One' }, { id: 's2', name: 'Skill Two' }], plugins: [], mcp: [], warnings: [] });
const sessions = new Sessions(factory, join(home, 'defaults.json'), join(home, 'sessions'));
await sessions.create(home, { capabilities: { skills: [], plugins: [], mcp: [] } });
const app = createServerApp(sessions);
app.server.listen(Number(process.env.PREVIEW_PORT || 4393), '127.0.0.1', () => console.log('Real config fixture ready'));
async function close() { await app.close(); await sessions.close(); await rm(home, { recursive: true, force: true }); }
process.on('SIGTERM', () => void close().then(() => process.exit()));
process.on('SIGINT', () => void close().then(() => process.exit()));
