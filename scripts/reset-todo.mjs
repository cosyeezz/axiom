import { DatabaseSync } from 'node:sqlite';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { TODO_SCHEMA } from '../src/todo-store.js';

export function resetTodo(database) {
 const names=['todo_events','todo_items','todo_lists','todos','goals'];
 const counts={};
 database.exec('BEGIN IMMEDIATE');
 try {
  for(const name of names) {
   const exists=database.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(name);
   counts[name]=exists?database.prepare(`SELECT count(*) AS n FROM ${name}`).get().n:0;
   database.exec(`DROP TABLE IF EXISTS ${name}`);
  }
  database.exec(TODO_SCHEMA); database.exec('COMMIT'); return counts;
 } catch(error){database.exec('ROLLBACK');throw error;}
}
if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
 const args=process.argv.slice(2),at=args.indexOf('--database');
 if(at<0||!args[at+1]||args[at+1].startsWith('--')||!args.includes('--confirm-reset')) {
  console.error('需要 --database <已核实路径> --confirm-reset；必须先停止服务及共享同库写入者。');process.exitCode=1;
 } else {
  const db=new DatabaseSync(resolve(args[at+1]));
  try{db.exec('PRAGMA foreign_keys=ON');console.log(JSON.stringify(resetTodo(db)));}finally{db.close();}
 }
}
