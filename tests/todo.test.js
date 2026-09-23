import test from 'node:test';
import assert from 'node:assert/strict';
import {Todo,createTodoStore} from '../src/todo.js';
const goal={op:'add',id:'a',level:1,title:'交付',description:'范围',acceptance:[{criterionId:'c',text:'核对',check:'review'}]};
const fixture=()=>new Todo({sessionId:'s',store:createTodoStore(),questions:{confirmTodo:async()=>({approved:true})}});
const update=(t,ops)=>t.update({listId:t.snapshot().listId,baseVersion:t.snapshot().version,ops});
test('pause survives edits and reads; only resume clears it',async()=>{
 const t=fixture();await t.update({baseVersion:0,ops:[goal]});t.pause();
 await update(t,[{op:'edit',id:'a',summary:'进度'}]);const version=t.snapshot().version;
 for(let i=0;i<10;i++)assert.equal(t.read().paused,true);
 assert.equal(t.snapshot().version,version);assert.equal(t.resume().paused,false);
});
test('running child advances parent but completing child never completes parent',async()=>{
 const t=fixture();await t.update({baseVersion:0,ops:[goal]});
 const output=await update(t,[{op:'add',id:'s',parentId:'a',level:2,title:'步骤',status:'running'}]);
 assert.ok(output.affectedTargetIds.includes('a'));assert.equal(t.read({id:'a'}).item.status,'running');
 await update(t,[{op:'status',id:'s',status:'done',summary:'已完成'}]);assert.equal(t.snapshot().completed,false);
});
test('atomic batch reports failing operation and returns latest version',async()=>{
 const t=fixture();await t.update({baseVersion:0,ops:[goal]});const before=t.snapshot();
 const r=await t.updateTool().execute('call',{listId:before.listId,baseVersion:before.version,ops:[{op:'edit',id:'a',summary:'不可提交'},{op:'status',id:'missing',status:'running'}]});
 assert.equal(r.isError,true);const value=JSON.parse(r.content[0].text);assert.equal(value.operationIndex,1);assert.equal(value.version,before.version);assert.deepEqual(t.snapshot(),before);
});
test('tool update response is the next CAS baseline',async()=>{
 const t=fixture();const first=JSON.parse((await t.updateTool().execute('one',{baseVersion:0,ops:[goal]})).content[0].text);
 const next=await t.updateTool().execute('two',{listId:first.listId,baseVersion:first.version,ops:[{op:'edit',id:'a',summary:'核对中'}]});assert.ok(!next.isError);assert.equal(JSON.parse(next.content[0].text).version,first.version+1);
});
