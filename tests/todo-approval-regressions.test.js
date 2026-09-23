import test from 'node:test';
import assert from 'node:assert/strict';
import { Todo, createTodoStore } from '../src/todo.js';
const target={op:'add',id:'goal',level:1,title:'结果',description:'范围',acceptance:[{criterionId:'check',text:'核对',check:'review'}]};
const decode=r=>JSON.parse(r.content[0].text);
test('first rejected approval writes nothing and gates tools only while pending',async()=>{
 const store=createTodoStore();let answer;
 const todo=new Todo({sessionId:'s',store,questions:{confirmTodo:()=>new Promise(resolve=>answer=resolve)}});
 const pending=todo.update({baseVersion:0,ops:[target]});
 assert.equal(todo.requiresPlan,true);assert.equal(store.load('s'),undefined);
 answer({approved:false,decision:'cancelled'});await pending;
 assert.equal(store.load('s'),undefined);assert.equal(todo.snapshot().listId,null);assert.equal(todo.requiresPlan,false);
});
test('read errors and stale update errors report codes and current versions',async()=>{
 const store=createTodoStore();const a=new Todo({sessionId:'s',store,questions:{confirmTodo:async()=>({approved:true})}});
 const b=new Todo({sessionId:'s',store});await a.update({baseVersion:0,ops:[target]});
 const bad=await a.readTool().execute('read',{id:'missing'});assert.equal(bad.isError,true);assert.equal(decode(bad).code,'TODO_ITEM_NOT_FOUND');
 const stale=await b.updateTool().execute('update',{baseVersion:0,ops:[target]});assert.equal(stale.isError,true);assert.equal(decode(stale).version,a.snapshot().version);
});
test('missing child parent is a domain error without partial writes',async()=>{
 const todo=new Todo({sessionId:'s',store:createTodoStore()});
 await assert.rejects(todo.update({baseVersion:0,ops:[{op:'add',level:2,title:'步骤'}]}),/TODO_INVALID_PARENT/);
 assert.equal(todo.store.load('s'),undefined);
});
