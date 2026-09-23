import test from 'node:test';
import assert from 'node:assert/strict';
import {Sessions} from '../src/sessions.js';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
function fixture(){
 const mains=[];
 const factory=async(tools,options={})=>{
  const agent={calls:[],tools,options,config:()=>({model:'test/model'}),subscribe(fn){this.listener=fn;return()=>{};},async prompt(text){this.calls.push(text);this.listener?.({type:'agent.message.end',data:{message:{role:'user',content:text}}});},result:()=>'',dispose:async()=>{},abort:async()=>{},requestSafeStop(){},queue:()=>({steering:[],followUp:[]}),resumable:()=>false,canReask:()=>false};
  if(tools.length)mains.push(agent);return agent;
 };factory.catalog=()=>[{key:'test/model'}];return {factory,mains};
}
async function seed(item){item.todo.questions={confirmTodo:async()=>({approved:true})};await item.todo.update({baseVersion:0,ops:[{op:'add',level:1,id:'a',title:'交付',description:'范围',acceptance:[{criterionId:'c',text:'核对',check:'review'}]}]});}
test('ordinary sessions do not auto-continue and expose no old goal tools',async()=>{
 const {factory,mains}=fixture();const sessions=new Sessions(factory);
 try{const id=await sessions.create();await sessions.prompt(id,'普通输入');await sessions.get(id).work;await new Promise(setImmediate);assert.equal(mains[0].calls.length,1);assert.ok(!mains[0].tools.some(t=>t.name.startsWith('goal_')));}finally{await sessions.close();}
});
test('bare /goal prepares without a model request and cancel clears the latch',async()=>{
 const {factory,mains}=fixture();const sessions=new Sessions(factory);
 try{const id=await sessions.create();await sessions.prompt(id,'/goal');assert.equal(mains[0].calls.length,0);assert.equal(sessions.get(id).todo.requiresPlan,true);await sessions.todoAction(id,'cancel_prepare');assert.equal(sessions.get(id).todo.requiresPlan,false);}finally{await sessions.close();}
});
test('pause persists across ordinary input, isolates sessions and survives restart',async()=>{
 const root=await mkdtemp(join(tmpdir(),'todo-lifecycle-'));const {factory}=fixture();let sessions=new Sessions(factory,undefined,root);
 try{const a=await sessions.create(root);const b=await sessions.create(root);await seed(sessions.get(a));await sessions.todoAction(a,'pause');await sessions.prompt(a,'仅核对');await sessions.get(a).work;assert.equal(sessions.get(a).todo.snapshot().paused,true);assert.equal(sessions.get(b).todo.snapshot().listId,null);await sessions.close();sessions=new Sessions(factory,undefined,root);await sessions.load();const item=await sessions.ensureLoaded(a);assert.equal(item.todo.snapshot().paused,true);}finally{await sessions.close();await rm(root,{recursive:true,force:true});}
});
test('notification confirmation persists before mutating memory',async()=>{
 const {factory}=fixture();const sessions=new Sessions(factory);
 try{const id=await sessions.create();const item=sessions.get(id);const job={id:'job',resultId:'result',notified:false};item.tasks.jobs.set(job.id,job);const persist=sessions.persist;sessions.persist=async()=>{throw new Error('disk full');};await assert.rejects(sessions.confirmTaskNotification(item,{id:'job',resultId:'result'}),/disk full/);assert.equal(job.notified,false);sessions.persist=persist;item.tasks.jobs.delete(job.id);}finally{await sessions.close();}
});
