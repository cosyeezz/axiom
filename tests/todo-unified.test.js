import test from 'node:test';
import assert from 'node:assert/strict';
import { Todo,createTodoStore } from '../src/todo.js';
import { createQuestions } from '../src/questions.js';
import { resetTodo } from '../scripts/reset-todo.mjs';
const target={op:'add',id:'target',level:1,title:'交付结果',description:'明确范围',acceptance:[{criterionId:'check',text:'报告可核对',check:'review'}]};
const fixture=()=>new Todo({sessionId:'s',store:createTodoStore(),questions:{confirmTodo:async()=>({approved:true})},resolveRef:()=>({toolName:'bash'})});
const update=(todo,ops)=>todo.update({listId:todo.snapshot().listId,baseVersion:todo.snapshot().version,ops});
test('confirmed targets survive initialization; reads are read only; steps never complete targets',async()=>{
 const todo=fixture();await todo.update({baseVersion:0,ops:[target]});
 const {version,listId}=todo.snapshot();for(let n=0;n<10;n++)todo.read({});assert.equal(todo.snapshot().version,version);
 await update(todo,[{op:'add',id:'step',level:2,parentId:'target',title:'步骤',status:'done',summary:'已完成'}]);assert.equal(todo.read({id:'target'}).item.status,'pending');
 await assert.rejects(update(todo,[{op:'status',id:'target',status:'done',summary:'完成'}]),/TODO_ACCEPTANCE_INCOMPLETE/);
 await update(todo,[{op:'status',id:'target',status:'done',summary:'报告已交付',verification:[{criterionId:'check',result:'已核对',refs:[{messageId:'report'}]}]}]);assert.equal(todo.snapshot().completed,true);
 const again=new Todo({sessionId:'s',store:createTodoStore(todo.store.database)});assert.equal(again.snapshot().listId,listId);assert.equal(again.pause().paused,false);
});
test('approval is bound and stale approval cannot write',async()=>{
 const events=[];const questions=createQuestions(e=>events.push(e));const todo=new Todo({sessionId:'s',store:createTodoStore(),questions});
 const promise=todo.update({baseVersion:0,ops:[target]});const asked=events.find(e=>e.type==='question.asked');assert.ok(asked.data.proposal);assert.equal(todo.snapshot().counts.targets.total,0);
 todo.prepare('并发建单请求');questions.reply(asked.data.toolCallId,[['确认并开始']]);await assert.rejects(promise,/TODO_APPROVAL_STALE/);assert.equal(todo.snapshot().counts.targets.total,0);
});
test('strict operation fields, atomic failure and CAS',async()=>{
 const todo=fixture();await todo.update({baseVersion:0,ops:[target]});
 const before=todo.snapshot();await assert.rejects(update(todo,[{op:'edit',id:'target',status:'done'}]));
 await assert.rejects(update(todo,[{op:'add',id:'child',level:2,parentId:'target',title:'child'},{op:'status',id:'missing',status:'done'}]));assert.deepEqual(todo.snapshot(),before);
 await assert.rejects(todo.update({listId:before.listId,baseVersion:0,ops:[{op:'edit',id:'target',summary:'x'}]}),/TODO_VERSION_CONFLICT/);
});
test('reset touches only task tables and normal initialization preserves application data',()=>{
 const store=createTodoStore();store.database.exec("CREATE TABLE sessions(id TEXT); INSERT INTO sessions VALUES('keep'); CREATE TABLE goals(id TEXT); CREATE TABLE todos(id TEXT)");
 const counts=resetTodo(store.database);assert.deepEqual(Object.keys(counts),['todo_events','todo_items','todo_lists','todos','goals']);assert.equal(store.database.prepare('SELECT id FROM sessions').get().id,'keep');resetTodo(store.database);
});
test('cancelled internal confirmation closes pending promise without reask',async()=>{
 const q=createQuestions(()=>{});const p=q.confirmTodo({kind:'create',reason:'',proposal:{}});q.cancel();assert.equal((await p).decision,'cancelled');assert.deepEqual(q.snapshot(),[]);
});
