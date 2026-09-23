import test from 'node:test';
import assert from 'node:assert/strict';
import { Todo, createTodoStore } from '../src/todo.js';
const fixture=()=>new Todo({sessionId:'s',store:createTodoStore(),questions:{confirmTodo:async()=>({approved:true})},resolveRef:ref=>ref.toolCallId==='test'?{toolName:'bash'}:null});
const target={op:'add',id:'t',level:1,title:'target',description:'scope',acceptance:[{criterionId:'a',text:'tests',check:'tool'}]};
const update=(t,ops,reason)=>t.update({listId:t.header.listId,baseVersion:t.header.version,ops,reason});
test('5000 rows bounded reads and updates, no-op has no version effect',async()=>{
 const t=fixture();await t.update({baseVersion:0,ops:[target]});
 for(let n=0;n<50;n++){const ops=Array.from({length:Math.min(100,4999-n*100)},(_,i)=>({op:'add',id:`s${n*100+i}`,level:2,parentId:'t',title:'有界实现步骤',description:'x'.repeat(100)}));if(ops.length)await update(t,ops);}
 assert.equal(t.snapshot().counts.steps.total,4999);
 const out=await update(t,[{op:'edit',id:'s4998',summary:'updated'}]);assert.ok(JSON.stringify(out).length<8000);assert.equal(out.changed.length,1);
 const version=t.header.version;const noop=await update(t,[{op:'edit',id:'s4998',summary:'updated'}]);assert.equal(noop.noop,true);assert.equal(t.header.version,version);
 const page=t.read({id:'t',limit:100});assert.ok(page.hasMore);assert.ok(JSON.stringify(page).length<=8000);assert.ok(t.contextPacket().content.length<=12000);
});
test('reopen parent then add child uses in-batch state; removed ids cannot be reused',async()=>{
 const t=fixture();await t.update({baseVersion:0,ops:[target]});await update(t,[{op:'status',id:'t',status:'done',summary:'passed',verification:[{criterionId:'a',result:'test passed',refs:[{toolCallId:'test'}]}]}]);
 await update(t,[{op:'reopen',id:'t',reason:'new work'},{op:'add',id:'s',level:2,parentId:'t',title:'new step'}]);assert.equal(t.snapshot().completed,false);
 await update(t,[{op:'delete',id:'s',reason:'replace'}]);await assert.rejects(update(t,[{op:'add',id:'s',level:2,parentId:'t',title:'reuse'}]),/TODO_ID_EXISTS/);
 await update(t,[{op:'delete',id:'t',reason:'cancel'}],'cancel target');assert.equal(t.snapshot().cancelled,true);assert.equal(t.snapshot().completed,false);
});
test('cross-session access, self evidence and definition protection',async()=>{
 const t=fixture();await t.update({baseVersion:0,ops:[target]});
 const other=new Todo({sessionId:'other',store:t.store});assert.throws(()=>other.read({listId:t.header.listId}),/TODO_LIST_NOT_FOUND/);
 await assert.rejects(update(t,[{op:'status',id:'t',status:'done',summary:'fake',verification:[{criterionId:'a',result:'fake',refs:[{toolCallId:'todo_update'}]}]}]),/TODO_INVALID_REFERENCE/);
 await assert.rejects(update(t,[{op:'edit',id:'t',title:'changed'},{op:'add',level:2,parentId:'t',title:'step'}],'change'),/TODO_MIXED_APPROVAL_BATCH/);
});
