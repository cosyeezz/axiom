import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';

export const TODO_SCHEMA = `
CREATE TABLE IF NOT EXISTS todo_lists (
 id TEXT PRIMARY KEY, session_id TEXT NOT NULL,
 is_current INTEGER NOT NULL DEFAULT 1 CHECK(is_current IN(0,1)),
 version INTEGER NOT NULL DEFAULT 0 CHECK(version>=0),
 require_plan INTEGER NOT NULL DEFAULT 0 CHECK(require_plan IN(0,1)),
 prepare_text TEXT NOT NULL DEFAULT '', paused INTEGER NOT NULL DEFAULT 0 CHECK(paused IN(0,1)),
 pause_reason TEXT NOT NULL DEFAULT '', runtime_block TEXT,
 created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS todo_one_current ON todo_lists(session_id) WHERE is_current=1;
CREATE TABLE IF NOT EXISTS todo_items (
 list_id TEXT NOT NULL REFERENCES todo_lists(id) ON DELETE CASCADE,
 id TEXT NOT NULL, level INTEGER NOT NULL CHECK(level IN(1,2)), parent_id TEXT,
 position INTEGER NOT NULL, title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
 acceptance TEXT NOT NULL DEFAULT '[]', status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN('pending','running','blocked','done')),
 summary TEXT NOT NULL DEFAULT '', blocker TEXT NOT NULL DEFAULT '', verification TEXT,
 definition_version INTEGER NOT NULL DEFAULT 1, deleted_at INTEGER, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
 PRIMARY KEY(list_id,id), FOREIGN KEY(list_id,parent_id) REFERENCES todo_items(list_id,id),
 CHECK((level=1 AND parent_id IS NULL) OR (level=2 AND parent_id IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS todo_items_level ON todo_items(list_id,level,position,id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS todo_items_parent ON todo_items(list_id,parent_id,position,id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS todo_items_status ON todo_items(list_id,status,level) WHERE deleted_at IS NULL;
CREATE TABLE IF NOT EXISTS todo_events (
 id INTEGER PRIMARY KEY, list_id TEXT NOT NULL REFERENCES todo_lists(id) ON DELETE CASCADE,
 item_id TEXT, kind TEXT NOT NULL, record TEXT NOT NULL, created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS todo_events_list ON todo_events(list_id,id);
`;
const parse = value => value == null ? null : JSON.parse(value);
const header = r => r && ({ listId:r.id, sessionId:r.session_id, version:r.version, requirePlan:!!r.require_plan, prepareText:r.prepare_text, paused:!!r.paused, pauseReason:r.pause_reason, runtimeBlock:parse(r.runtime_block) });
const item = r => r && ({ id:r.id, level:r.level, parentId:r.parent_id, position:r.position, title:r.title, description:r.description, acceptance:parse(r.acceptance), status:r.status, summary:r.summary, blocker:r.blocker, verification:parse(r.verification) ?? [], definitionVersion:r.definition_version, deletedAt:r.deleted_at });

export function createTodoStore(database) {
 const db = database ?? new DatabaseSync(':memory:');
 db.exec('PRAGMA foreign_keys=ON'); db.exec(TODO_SCHEMA);
 const statements = new Map();
 const sql = text => { if (!statements.has(text)) statements.set(text,db.prepare(text)); return statements.get(text); };
 let serial=0;
 const store = {
  database:db,
  transaction(fn) { const name=`todo_${++serial}`; db.exec(`SAVEPOINT ${name}`); try { const value=fn(); db.exec(`RELEASE ${name}`); return value; } catch(e) { db.exec(`ROLLBACK TO ${name}; RELEASE ${name}`); throw e; } },
  load(sessionId,listId) { const r=listId ? sql('SELECT * FROM todo_lists WHERE session_id=? AND id=?').get(sessionId,listId) : sql('SELECT * FROM todo_lists WHERE session_id=? AND is_current=1').get(sessionId); return header(r); },
  create(sessionId, id=randomUUID()) { const now=Date.now(); sql('UPDATE todo_lists SET is_current=0 WHERE session_id=? AND is_current=1').run(sessionId); sql('INSERT INTO todo_lists(id,session_id,created_at,updated_at) VALUES(?,?,?,?)').run(id,sessionId,now,now); return store.load(sessionId,id); },
  save(h, expected) { const r=sql('UPDATE todo_lists SET version=?,require_plan=?,prepare_text=?,paused=?,pause_reason=?,runtime_block=?,updated_at=? WHERE id=? AND session_id=? AND version=?').run(expected+1,+h.requirePlan,h.prepareText,+h.paused,h.pauseReason,h.runtimeBlock ? JSON.stringify(h.runtimeBlock):null,Date.now(),h.listId,h.sessionId,expected); if(Number(r.changes)!==1) throw new Error('TODO_VERSION_CONFLICT'); return {...h,version:expected+1}; },
  get(listId,id,includeDeleted=false) { return item(sql(`SELECT * FROM todo_items WHERE list_id=? AND id=?${includeDeleted?'':' AND deleted_at IS NULL'}`).get(listId,id)); },
  query(listId,{parentId,level,unfinished=false,includeDeleted=false,offset=0,limit=20}={}) { const where=['list_id=?']; const args=[listId]; if(!includeDeleted) where.push('deleted_at IS NULL'); if(parentId!==undefined) { where.push('parent_id IS ?'); args.push(parentId); } if(level) { where.push('level=?'); args.push(level); } if(unfinished) where.push("status!='done'"); return sql(`SELECT * FROM todo_items WHERE ${where.join(' AND ')} ORDER BY position,id LIMIT ? OFFSET ?`).all(...args,limit,offset).map(item); },
  count(listId) { const counts={targets:{total:0,done:0,pending:0,running:0,blocked:0},steps:{total:0,done:0,pending:0,running:0,blocked:0}}; for(const r of sql('SELECT level,status,count(*) AS n FROM todo_items WHERE list_id=? AND deleted_at IS NULL GROUP BY level,status').all(listId)) { const c=counts[r.level===1?'targets':'steps']; c.total+=r.n; c[r.status]+=r.n; } return counts; },
  currentTarget(listId) { return item(sql("SELECT * FROM todo_items WHERE list_id=? AND level=1 AND deleted_at IS NULL ORDER BY CASE status WHEN 'running' THEN 0 WHEN 'pending' THEN 1 WHEN 'blocked' THEN 2 ELSE 3 END,position,id LIMIT 1").get(listId)); },
  nextPosition(listId) { return sql('SELECT coalesce(max(position),0)+1 AS n FROM todo_items WHERE list_id=?').get(listId).n; },
  put(listId,i) { const now=Date.now(); sql(`INSERT INTO todo_items(list_id,id,level,parent_id,position,title,description,acceptance,status,summary,blocker,verification,definition_version,deleted_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(list_id,id) DO UPDATE SET position=excluded.position,title=excluded.title,description=excluded.description,acceptance=excluded.acceptance,status=excluded.status,summary=excluded.summary,blocker=excluded.blocker,verification=excluded.verification,definition_version=excluded.definition_version,deleted_at=excluded.deleted_at,updated_at=excluded.updated_at`).run(listId,i.id,i.level,i.parentId,i.position,i.title,i.description,JSON.stringify(i.acceptance),i.status,i.summary,i.blocker,JSON.stringify(i.verification),i.definitionVersion,i.deletedAt??null,now,now); },
  event(listId,itemId,kind,record) { sql('INSERT INTO todo_events(list_id,item_id,kind,record,created_at) VALUES(?,?,?,?,?)').run(listId,itemId,kind,JSON.stringify(record),Date.now()); },
  remove(sessionId) { sql('DELETE FROM todo_lists WHERE session_id=?').run(sessionId); },
  list() { return sql('SELECT * FROM todo_lists WHERE is_current=1').all().map(r=>({sessionId:r.session_id,todo:header(r)})); },
 };
 return store;
}
