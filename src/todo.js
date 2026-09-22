import { randomUUID } from 'node:crypto';
import { z } from 'zod';

const states = ['pending', 'running', 'done', 'blocked'];
const text = z.string().trim().min(1).max(2000);
const operation = z.object({
  op: z.enum(['add', 'edit', 'status', 'move', 'delete', 'reopen']),
  id: z.string().min(1).optional(), title: text.optional(),
  note: z.string().max(4000).optional(), parentId: z.string().nullable().optional(),
  status: z.enum(states).optional(), beforeId: z.string().optional(),
}).strict();
const updateSchema = z.object({ baseVersion: z.number().int().nonnegative(), ops: z.array(operation).min(1).max(1000) }).strict();
const empty = () => ({ version: 0, mode: 'completed', paused: false, items: [], audit: [], reason: '', nudges: 0, stagnant: 0, lastDone: 0 });
const result = value => ({ content: [{ type: 'text', text: JSON.stringify(value) }] });

export function createTodoStore(database = null) {
  const memory = new Map();
  database?.exec('CREATE TABLE IF NOT EXISTS todos (session_id TEXT PRIMARY KEY, todo TEXT NOT NULL, version INTEGER NOT NULL, updated_at INTEGER NOT NULL)');
  const load = id => {
    if (!database) return structuredClone(memory.get(id) ?? null);
    const row = database.prepare('SELECT todo FROM todos WHERE session_id = ?').get(id);
    return row ? JSON.parse(row.todo) : null;
  };
  return {
    load,
    save(id, value, expected) {
      if (!database) {
        if ((memory.get(id)?.version ?? 0) !== expected) throw new Error('Todo版本冲突，请重新todo_read');
        memory.set(id, structuredClone(value)); return;
      }
      const json = JSON.stringify(value);
      const saved = expected === 0
        ? database.prepare('INSERT OR IGNORE INTO todos (session_id,todo,version,updated_at) VALUES (?,?,?,?)').run(id, json, value.version, Date.now())
        : database.prepare('UPDATE todos SET todo=?,version=?,updated_at=? WHERE session_id=? AND version=?').run(json, value.version, Date.now(), id, expected);
      if (Number(saved.changes) !== 1) throw new Error('Todo版本冲突，请重新todo_read');
    },
    remove(id) { if (database) database.prepare('DELETE FROM todos WHERE session_id=?').run(id); else memory.delete(id); },
    list() {
      return database ? database.prepare('SELECT session_id,todo FROM todos').all().map(r => ({ sessionId: r.session_id, todo: JSON.parse(r.todo) }))
        : [...memory].map(([sessionId, todo]) => ({ sessionId, todo: structuredClone(todo) }));
    },
  };
}

function aggregate(items) {
  for (const parent of items.filter(i => !i.parentId)) {
    const children = items.filter(i => i.parentId === parent.id);
    if (children.length) parent.status = children.every(i => i.status === 'done') ? 'done'
      : children.some(i => i.status === 'running') ? 'running'
      : children.every(i => ['done', 'blocked'].includes(i.status)) ? 'blocked' : 'pending';
  }
}

export class Todo {
  constructor({ sessionId, store, emit = () => {} }) { this.id = sessionId; this.store = store; this.emit = emit; }
  snapshot() { const { audit, ...view } = this.store.load(this.id) ?? empty(); return view; }
  get active() { return this.snapshot().mode === 'enabled'; }
  get actionable() { return this.active && this.snapshot().items.some(i => ['pending', 'running'].includes(i.status)); }
  commit(next, expected, action) {
    next.version = expected + 1;
    next.audit = [...next.audit, { at: Date.now(), action }].slice(-500);
    this.store.save(this.id, next, expected);
    const view = this.snapshot(); this.emit({ type: 'todo', todo: view }); return view;
  }
  update(input) {
    const { baseVersion, ops } = updateSchema.parse(input);
    // Keep load, validation and CAS synchronous: no await or partial persistence.
    const next = this.store.load(this.id) ?? empty();
    if (baseVersion !== next.version) throw new Error('Todo版本冲突，请重新todo_read');
    for (const [index, op] of ops.entries()) {
      try {
        let item = next.items.find(i => i.id === op.id);
        if (op.op === 'add') {
          if (!op.title) throw new Error('新增事项需要title');
          const id = op.id ?? randomUUID();
          if (next.items.some(i => i.id === id)) throw new Error('Todo ID重复');
          const parent = op.parentId ? next.items.find(i => i.id === op.parentId) : null;
          if (op.parentId && (!parent || parent.parentId || parent.status === 'done')) throw new Error('只能向未完成的一级事项添加子项');
          if (op.status === 'blocked' && !op.note?.trim()) throw new Error('受阻事项需要说明原因');
          item = { id, title: op.title, note: op.note ?? '', status: op.status ?? 'pending', parentId: op.parentId ?? null };
          next.items.push(item);
        } else {
          if (!item) throw new Error('Todo事项不存在');
          if (op.op === 'delete') {
            next.items = next.items.filter(i => i.id !== item.id && i.parentId !== item.id);
            const parent = next.items.find(i => i.id === item.parentId);
            if (parent && !next.items.some(i => i.parentId === parent.id)) parent.status = 'pending';
            continue;
          }
          if (op.op === 'reopen') {
            if (next.items.some(i => i.parentId === item.id)) throw new Error('请重新打开具体子事项');
            item.status = 'pending';
          } else {
            if (item.status === 'done') throw new Error('已完成事项请先reopen');
            if (op.op === 'edit') { if (op.title) item.title = op.title; if (op.note !== undefined) item.note = op.note; }
            if (op.op === 'status') {
              if (!op.status) throw new Error('缺少status');
              if (next.items.some(i => i.parentId === item.id)) throw new Error('父项状态由子项汇总，请修改具体子项，不要直接设置父项状态');
              if (op.status === 'blocked' && !(op.note ?? item.note)?.trim()) throw new Error('受阻事项需要说明原因');
              item.status = op.status; if (op.note !== undefined) item.note = op.note;
            }
            if (op.op === 'move') {
              const before = next.items.find(i => i.id === op.beforeId);
              if (op.beforeId && (!before || before.parentId !== item.parentId || before.id === item.id)) throw new Error('只能在同级事项间重排');
              next.items = next.items.filter(i => i !== item);
              const index = before ? next.items.indexOf(before) : next.items.length;
              next.items.splice(index, 0, item);
            }
          }
        }
      } catch (error) {
        throw new Error(`第${index + 1}个操作(${op.op}${op.id ? ` id=${JSON.stringify(op.id)}` : ''})失败：${error.message}`, { cause: error });
      }
    }
    if (next.items.length > 5000) throw new Error('Todo最多5000项');
    aggregate(next.items);
    if (next.items.every(i => i.status === 'done')) next.mode = next.paused ? 'paused' : 'completed';
    else if (next.mode === 'completed') next.mode = next.paused ? 'paused' : 'enabled';
    return this.commit(next, baseVersion, { ops });
  }
  pause(reason = '用户已暂停') {
    const next = this.store.load(this.id); if (!next || next.mode === 'paused') return this.snapshot();
    next.mode = 'paused'; next.paused = true; next.reason = reason; return this.commit(next, next.version, { pause: reason });
  }
  resume() {
    const next = this.store.load(this.id); if (!next) throw new Error('尚无Todo');
    next.mode = next.items.every(i => i.status === 'done') ? 'completed' : 'enabled';
    next.paused = false; next.reason = ''; next.nudges = 0; next.stagnant = 0;
    next.lastDone = next.items.filter(i => i.status === 'done').length;
    return this.commit(next, next.version, { resume: true });
  }
  nudge() {
    if (!this.actionable) return false;
    const next = this.store.load(this.id);
    const done = next.items.filter(i => i.status === 'done').length;
    next.stagnant = done > next.lastDone ? 0 : next.stagnant + 1;
    next.lastDone = done; next.nudges++;
    if (next.stagnant > 3 || next.nudges > 64) {
      next.mode = 'paused'; next.paused = true; next.reason = '自动推进连续未完成事项或已达轮次上限，请核对后恢复';
    }
    this.commit(next, next.version, { nudge: next.nudges });
    return next.mode === 'enabled';
  }
  context() {
    const s = this.snapshot();
    const counts = Object.fromEntries(states.map(state => [state, s.items.filter(i => i.status === state).length]));
    return '多步骤任务使用todo_read/todo_update维护两级清单；用户提出新的多步骤工作（如从排查转为修复）时，先新增对应事项再执行，不要沿用已完成清单冒充当前计划。开始/完成/阻塞/计划变化时更新；复用快照只减少读取，不免除更新。子代理不维护清单，由你读取其结果并验收。Todo不是额外操作授权，新用户指令优先。' +
      `\n当前Todo版本${s.version}，自动推进${s.mode}，总计${s.items.length}项：${JSON.stringify(counts)}。` +
      (s.reason ? ` ${s.reason}` : '') + '\ntodo_read/todo_update返回均为权威状态；已有返回的版本与当前版本一致且包含相关事项时直接复用，不要重复读取。仅缺少相关事项、版本不一致、更新冲突，或压缩/恢复后只剩旧清单时，才用todo_read读取。';
  }
  readTool() {
    return { name: 'todo_read', label: '读取任务清单', description: '读取当前主会话SQLite任务清单。大清单可按ID或未完成过滤；已有同版本权威返回且包含相关事项时直接复用；仅缺少事项、版本变化或冲突时读取。',
      parameters: { type: 'object', properties: { id: { type: 'string' }, unfinished: { type: 'boolean' }, offset: { type: 'integer', minimum: 0 }, limit: { type: 'integer', minimum: 1, maximum: 1000 } }, additionalProperties: false },
      execute: async (_id, input) => {
        const q = z.object({ id: z.string().optional(), unfinished: z.boolean().optional(), offset: z.number().int().nonnegative().optional(), limit: z.number().int().min(1).max(1000).optional() }).strict().parse(input ?? {});
        const s = this.snapshot(); let items = s.items;
        if (q.id) items = items.filter(i => i.id === q.id || i.parentId === q.id);
        if (q.unfinished) items = items.filter(i => i.status !== 'done');
        const total = items.length; return result({ ...s, items: items.slice(q.offset ?? 0, (q.offset ?? 0) + (q.limit ?? 100)), total });
      } };
  }
  updateTool() {
    return { name: 'todo_update', label: '更新任务清单', description: '主代理维护Todo：按baseVersion原子批量add/edit/status/move/delete/reopen。最多两级；add可指定稳定id供同批子项引用。add默认pending，可用status指定叶项初始状态（含一级叶项），blocked需note说明原因。有子项的父项状态自动汇总，禁止对其使用status，请改具体子项。删除父项含子项。更新返回可直接作为下一次修改的权威版本，无需重复读取。用户暂停不能通过修改清单恢复。',
      parameters: { type: 'object', required: ['baseVersion', 'ops'], additionalProperties: false, properties: {
        baseVersion: { type: 'integer', minimum: 0 }, ops: { type: 'array', minItems: 1, maxItems: 1000, items: {
          type: 'object', required: ['op'], additionalProperties: false, properties: {
            op: { type: 'string', enum: ['add', 'edit', 'status', 'move', 'delete', 'reopen'] }, id: { type: 'string' }, title: { type: 'string', maxLength: 2000 }, note: { type: 'string', maxLength: 4000 }, parentId: { type: ['string', 'null'] }, status: { type: 'string', enum: states }, beforeId: { type: 'string' },
          },
        } },
      } }, execute: async (_id, input) => result(this.update(input)) };
  }
}
