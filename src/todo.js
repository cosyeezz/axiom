import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { createTodoStore } from './todo-store.js';
import { TODO_READ_DESCRIPTION, TODO_UPDATE_DESCRIPTION, buildTodoContextMessage } from './todo-prompts.js';
export { createTodoStore };
const id=z.string().min(1).max(128), title=z.string().trim().min(1).max(160), reason=z.string().trim().min(1).max(600);
const status=z.enum(['pending','running','blocked','done']);
const acceptance=z.array(z.object({criterionId:id,text:z.string().trim().min(1).max(300),check:z.enum(['tool','review','user']).default('review')}).strict()).max(10).refine(a=>new Set(a.map(c=>c.criterionId)).size===a.length);
const ref=z.union([z.object({toolCallId:id}).strict(),z.object({messageId:id}).strict()]);
const verification=z.array(z.object({criterionId:id,result:z.string().trim().min(1).max(600),refs:z.array(ref).max(3).default([])}).strict()).max(10);
const description=z.string().max(2000), summary=z.string().max(800), blocker=z.string().max(600);
const operation=z.discriminatedUnion('op',[
 z.object({op:z.literal('add'),id:id.optional(),level:z.union([z.literal(1),z.literal(2)]),parentId:id.nullable().optional(),title,description:description.optional(),acceptance:acceptance.optional(),status:status.optional(),summary:summary.optional(),blocker:blocker.optional()}).strict(),
 z.object({op:z.literal('edit'),id,title:title.optional(),description:description.optional(),acceptance:acceptance.optional(),summary:summary.optional()}).strict(),
 z.object({op:z.literal('status'),id,status,summary:summary.optional(),blocker:blocker.optional(),verification:verification.optional()}).strict(),
 z.object({op:z.literal('move'),id,beforeId:id.optional()}).strict(),
 z.object({op:z.literal('delete'),id,reason}).strict(),
 z.object({op:z.literal('reopen'),id,reason}).strict(),
]);
export const todoUpdateSchema=z.object({listId:id.optional(),baseVersion:z.number().int().nonnegative(),reason:reason.optional(),ops:z.array(operation).min(1).max(100)}).strict();
export const todoReadSchema=z.object({listId:id.optional(),id:id.optional(),unfinished:z.boolean().default(false),detail:z.boolean().default(false),section:z.enum(['item','verification']).default('item'),includeDeleted:z.boolean().default(false),offset:z.number().int().nonnegative().default(0),limit:z.number().int().min(1).max(100).default(20)}).strict();
const result=value=>({content:[{type:'text',text:JSON.stringify(value)}]});
const compact=i=>({id:i.id,level:i.level,parentId:i.parentId,title:i.title,status:i.status,summary:i.summary.slice(0,100),blocker:i.blocker.slice(0,120),definitionVersion:i.definitionVersion});
const fail=(code,extra={})=>{throw Object.assign(new Error(code),{code,...extra});};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const emptyCounts=()=>({targets:{total:0,done:0,pending:0,running:0,blocked:0},steps:{total:0,done:0,pending:0,running:0,blocked:0}});

export class Todo {
 constructor({sessionId,store,emit=()=>{},questions,resolveRef=()=>null}) { this.id=sessionId; this.store=store; this.emit=emit; this.questions=questions; this.resolveRef=resolveRef; this.header=store.load(sessionId); this.memoryBlock=null; }
 get requiresPlan(){return !!this.header?.requirePlan || (this.pendingCreationApprovals ?? 0) > 0;}
 get active(){if(!this.header)return false;const s=this.snapshot();return !!s.listId && !s.completed && !s.cancelled && !s.paused;}
 get actionable(){if(!this.header)return false;const s=this.snapshot();return !s.paused&&!s.header.runtimeBlock&&(s.counts.targets.pending+s.counts.targets.running>0);}
 snapshot(){return this.read({});}
 read(input={}) {
  const q=todoReadSchema.parse(input); const h=this.store.load(this.id,q.listId); if(q.listId&&!h) fail('TODO_LIST_NOT_FOUND');
  if(!q.listId)this.header=h;
  const counts=h?this.store.count(h.listId):emptyCounts();
  const view={listId:h?.listId??null,version:h?.version??0,header:{requirePlan:!!h?.requirePlan,paused:!!h?.paused,pauseReason:h?.pauseReason??'',runtimeBlock:this.memoryBlock??h?.runtimeBlock??null,hasPrepareText:!!h?.prepareText},paused:!!h?.paused,counts,completed:counts.targets.total>0&&counts.targets.total===counts.targets.done,cancelled:!!h&&!h.requirePlan&&counts.targets.total===0,items:[],coverage:{complete:false,itemIds:[],fields:['id','level','parentId','title','status','summary','blocker','definitionVersion']},hasMore:false};
  if(!h)return view;
  let rows;
  if(q.section==='verification'&&!q.id)fail('TODO_ITEM_ID_REQUIRED');
  if(q.id){const target=this.store.get(h.listId,q.id,q.includeDeleted);if(!target)fail('TODO_ITEM_NOT_FOUND');view.item=q.detail?structuredClone(target):compact(target); if(q.detail) {delete view.item.position;view.item.verification=[];}
   if(q.section==='verification'){rows=target.verification.slice(q.offset,q.offset+q.limit+1);view.verification=[];}else if(target.level===1) rows=this.store.query(h.listId,{...q,parentId:target.id,limit:q.limit+1});else {rows=[];view.parent=compact(this.store.get(h.listId,target.parentId,true));}
  }else rows=this.store.query(h.listId,{...q,level:1,limit:q.limit+1});
  const key=q.section==='verification'?'verification':'items';view[key]??=[];
  const budget=q.detail?12000:8000;
  for(const row of rows){const value=key==='verification'?row:compact(row);view[key].push(value); if(view[key].length>q.limit||JSON.stringify(view).length>budget-500){view[key].pop();view.hasMore=true;break;}}
  view.nextOffset=view.hasMore?q.offset+view[key].length:null;view.coverage.itemIds=view.items.map(i=>i.id);if(view.item)view.coverage.itemIds.unshift(view.item.id);
  if(JSON.stringify(view).length>budget)fail('TODO_READ_TOO_LARGE');return view;
 }
 publish(){this.header=this.store.load(this.id);const view=this.snapshot();this.emit({type:'todo',todo:view});return view;}
 control(change,{create=false}={}) {this.store.transaction(()=>{let h=this.store.load(this.id);if(!h){if(!create)return;h=this.store.create(this.id);}const next={...h,...change};if(!same(next,h))this.store.save(next,h.version);});return this.publish();}
 prepare(text=''){if(text.length>30000)fail('TODO_PREPARE_TOO_LARGE');const s=this.snapshot();if(s.counts.targets.total&&!s.completed)return s;return this.store.transaction(()=>{if(s.completed)this.header=this.store.create(this.id);return this.control({requirePlan:true,prepareText:text},{create:true});});}
 cancelPrepare(){if(this.snapshot().counts.targets.total)return this.snapshot();return this.control({requirePlan:false,prepareText:''});}
 pause(pauseReason='用户已暂停'){const s=this.snapshot();if(s.completed||s.cancelled||!s.listId)return s;return this.control({paused:true,pauseReason});}
 resume(){this.memoryBlock=null;return this.control({paused:false,pauseReason:'',runtimeBlock:null});}
 block(code,reason){const runtimeBlock={code,reason:String(reason).slice(0,600),at:Date.now()};try{return this.control({runtimeBlock});}catch(error){this.memoryBlock=runtimeBlock;this.emit({type:'error',error:String(error)});return null;}}
 async update(input,signal){
  const data=todoUpdateSchema.parse(input); const current=this.store.load(this.id);let h=data.listId?this.store.load(this.id,data.listId):current;
  if(data.listId&&(!h||h.listId!==current?.listId))fail('TODO_LIST_NOT_CURRENT');
  if(h&&h.version!==data.baseVersion)fail('TODO_VERSION_CONFLICT');
  if(h&&!data.listId&&this.store.count(h.listId).targets.total)fail('TODO_LIST_ID_REQUIRED');
  if(!h&&data.baseVersion!==0)fail('TODO_VERSION_CONFLICT');
  const frozen=structuredClone(data);for(const op of frozen.ops)if(op.op==='add'&&!op.id)op.id=randomUUID();const proposedId=h?.listId??randomUUID();
  const preview=this.apply(frozen,h,proposedId,{preview:true});
  let approved=false;
  if(preview.kind){
   if(!this.questions?.confirmTodo)fail('TODO_APPROVAL_UNAVAILABLE');
   // A proposed identity is not a persisted list; approval waits outside transactions.
   const creation = preview.kind === 'create';
   if(creation)this.pendingCreationApprovals=(this.pendingCreationApprovals??0)+1;
   let answer;
   try{answer=await this.questions.confirmTodo({kind:preview.kind,reason:data.reason??'根据本次用户要求建立目标',proposal:{listId:proposedId,baseVersion:data.baseVersion,changes:preview.proposal}},signal);}
   finally{if(creation)this.pendingCreationApprovals--;}
   if(!answer.approved){
    const fresh=this.store.load(this.id);
    if(creation&&answer.decision!=='feedback'&&fresh?.requirePlan&&fresh.listId===h?.listId&&fresh.version===data.baseVersion)this.cancelPrepare();
    return {applied:false,...answer,listId:h?.listId??null,version:this.store.load(this.id)?.version??0};
   }
   approved=true;
  }
  let changed;
  try{changed=this.store.transaction(()=>{const fresh=this.store.load(this.id);if((fresh?.version??0)!==data.baseVersion||fresh&&fresh.listId!==proposedId)fail(approved?'TODO_APPROVAL_STALE':'TODO_VERSION_CONFLICT');return this.apply(frozen,fresh,proposedId,{approved});});}catch(e){if(approved&&e.code==='TODO_VERSION_CONFLICT')e.code=e.message='TODO_APPROVAL_STALE';throw e;}
  if(changed.noop)return {...this.snapshot(),applied:false,noop:true};
  const view=this.publish();const output={applied:true,listId:view.listId,version:view.version,header:view.header,counts:view.counts,changed:[],changedIds:[],removedIds:[],removedTargetIds:changed.removedTargets,affectedTargetIds:changed.affectedTargets,changedCount:changed.rows.length,removedCount:changed.removed.length,coverage:{complete:false,itemIds:[],fields:['id','level','parentId','title','status','summary','blocker','definitionVersion']},hasMore:false};
  for(const row of changed.rows){output.changed.push(compact(row));output.changedIds.push(row.id);output.coverage.itemIds.push(row.id);if(JSON.stringify(output).length>7400){output.changed.pop();output.changedIds.pop();output.coverage.itemIds.pop();output.hasMore=true;break;}}
  for(const value of changed.individualRemoved){output.removedIds.push(value);if(JSON.stringify(output).length>7800){output.removedIds.pop();output.hasMore=true;break;}}return output;
 }
 apply(data,h,listId,{preview=false,approved=false}={}) {
  const rows=new Map(), originals=new Map(), loadedParents=new Set(), removed=[],removedTargets=[],events=[],proposal=[]; let protectedCount=0,otherCount=0,userCheck=false;
  const get=(key,deleted=false)=>{if(rows.has(key))return rows.get(key);const i=h?this.store.get(listId,key,deleted):null;if(i){rows.set(key,structuredClone(i));originals.set(key,structuredClone(i));}return rows.get(key);};
  const children=parentId=>{const found=h&&!loadedParents.has(parentId)?this.store.query(listId,{parentId,limit:5000}):[];loadedParents.add(parentId);for(const i of found)if(!rows.has(i.id)){rows.set(i.id,structuredClone(i));originals.set(i.id,structuredClone(i));}return [...rows.values()].filter(i=>i.parentId===parentId&&!i.deletedAt);};
  let position=h?this.store.nextPosition(listId):1;
  for(const [index,op] of data.ops.entries())try{
   let i=op.id?get(op.id,true):null;const before=i?structuredClone(i):null;let protectedOp=false;
   if(op.op==='add'){
    if(i)fail('TODO_ID_EXISTS');if(op.level===1&&(op.parentId!=null||op.status&&op.status!=='pending'))fail('TODO_INVALID_TARGET');
    if(op.level===2&&!op.parentId)fail('TODO_INVALID_PARENT');
    const parent=op.level===2?get(op.parentId):null;if(op.level===2&&(!parent||parent.deletedAt||parent.level!==1||parent.status==='done'))fail('TODO_INVALID_PARENT');
    i={id:op.id??randomUUID(),level:op.level,parentId:op.level===1?null:op.parentId,position:position++,title:op.title,description:op.description??'',acceptance:op.acceptance??[],status:op.status??'pending',summary:op.summary??'',blocker:op.blocker??'',verification:[],definitionVersion:1,deletedAt:null};rows.set(i.id,i);protectedOp=i.level===1;
    if(i.status==='done'&&!i.summary.trim())fail('TODO_SUMMARY_REQUIRED');
   }else{
    if(!i||i.deletedAt)fail('TODO_ITEM_NOT_FOUND');
    if(op.op==='edit'){
     const fields=['title','description','acceptance','summary'].filter(k=>op[k]!==undefined);if(!fields.length)fail('TODO_EMPTY_EDIT');
     const definition=fields.some(k=>k!=='summary'&&!same(i[k],op[k]));if(definition&&i.status==='done')fail('TODO_REOPEN_REQUIRED');
     if(definition){i.definitionVersion++;i.verification=[];protectedOp=i.level===1;}for(const k of fields)i[k]=op[k];
     if(protectedOp&&op.summary!==undefined)fail('TODO_MIXED_APPROVAL_BATCH');
    }else if(op.op==='status'){
     if(i.status==='done'&&op.status!=='done')fail('TODO_REOPEN_REQUIRED');i.status=op.status;if(op.summary!==undefined)i.summary=op.summary;if(op.blocker!==undefined)i.blocker=op.blocker;if(op.verification!==undefined)i.verification=op.verification;
     if(i.status!=='blocked')i.blocker='';
     if(i.status==='done'&&i.level===1){
      const unfinished=children(i.id).filter(c=>c.status!=='done');if(unfinished.length)fail('TODO_ACCEPTANCE_INCOMPLETE',{ids:unfinished.slice(0,10).map(c=>c.id)});
      if(!i.summary.trim())fail('TODO_SUMMARY_REQUIRED');
      if(new Set(i.verification.map(v=>v.criterionId)).size!==i.verification.length||i.verification.length!==i.acceptance.length)fail('TODO_ACCEPTANCE_INCOMPLETE');
      for(const c of i.acceptance){const v=i.verification.find(v=>v.criterionId===c.criterionId);if(!v)fail('TODO_ACCEPTANCE_INCOMPLETE');let validTool=false;
       for(const reference of v.refs){const found=this.resolveRef(reference);if(!found)fail('TODO_INVALID_REFERENCE');if(reference.toolCallId&&!['todo_read','todo_update','question','delegate','read_result','append','cancel_task'].includes(found.toolName))validTool=true;}
       if(c.check==='tool'&&!validTool)fail('TODO_INVALID_REFERENCE');if(c.check==='review'&&!v.refs.length)fail('TODO_INVALID_REFERENCE');if(c.check==='user')userCheck=true;
      }
      if(i.acceptance.some(c=>c.check==='user'))proposal.push({before,after:structuredClone(i)});events.push({id:i.id,kind:'completed',record:{definitionVersion:i.definitionVersion,verification:i.verification}});
     }
    }else if(op.op==='reopen'){i.status='pending';i.verification=[];i.blocker='';if(i.parentId){const parent=get(i.parentId);if(parent.status==='done'){parent.status='pending';parent.verification=[];}}events.push({id:i.id,kind:'reopened',record:{reason:op.reason}});
    }else if(op.op==='delete'){protectedOp=i.level===1;i.deletedAt=Date.now();removed.push(i.id);if(i.level===1){removedTargets.push(i.id);for(const child of children(i.id)){child.deletedAt=i.deletedAt;removed.push(child.id);}}events.push({id:i.id,kind:'removed',record:{reason:op.reason}});
    }else if(op.op==='move'){
     const target=op.beforeId?get(op.beforeId):null;if(op.beforeId&&(!target||target.deletedAt||target.parentId!==i.parentId||target.id===i.id))fail('TODO_INVALID_MOVE');
     const siblings=h?this.store.query(listId,{parentId:i.parentId,limit:5000}):[];for(const s of siblings)get(s.id);const ordered=[...rows.values()].filter(s=>!s.deletedAt&&s.parentId===i.parentId&&s.id!==i.id).sort((a,b)=>a.position-b.position);const at=target?ordered.findIndex(s=>s.id===target.id):ordered.length;ordered.splice(at,0,i);ordered.forEach((s,n)=>{s.position=n+1;});
    }
   }
   if(i.level===1&&(!i.description.trim()||!i.acceptance.length))fail('TODO_TARGET_DEFINITION_REQUIRED');
   if(JSON.stringify({title:i.title,description:i.description,acceptance:i.acceptance}).length>6500)fail('TODO_DEFINITION_TOO_LARGE');
   if(i.status==='blocked'&&!i.blocker.trim())fail('TODO_BLOCKER_REQUIRED');
   if(i.level===2&&i.status==='running'){const parent=get(i.parentId);if(parent.status==='blocked')fail('TODO_PARENT_BLOCKED');if(parent.status==='pending')parent.status='running';}
   if(protectedOp){protectedCount++;proposal.push({before,after:structuredClone(i)});events.push({id:i.id,kind:'approved',record:{before,after:structuredClone(i),reason:data.reason}});}else otherCount++;
  }catch(error){error.operationIndex=index;error.itemId=op.id;throw error;}
  if(protectedCount&&(otherCount||protectedCount>10))fail('TODO_MIXED_APPROVAL_BATCH');
  if(protectedCount&&h&&this.store.count(listId).targets.total&&!data.reason)fail('TODO_REASON_REQUIRED');
  const existing=h?this.store.count(listId):emptyCounts();const total=existing.targets.total+existing.steps.total+[...rows.values()].filter(i=>!originals.has(i.id)&&!i.deletedAt).length-[...rows.values()].filter(i=>originals.has(i.id)&&i.deletedAt&&!originals.get(i.id).deletedAt).length;if(total>5000)fail('TODO_LIMIT');
  const kind=protectedCount?(existing.targets.total===0?'create':data.ops.every(o=>o.op==='delete')?'remove':'change'):userCheck?'acceptance':null;
  const changed=[...rows.values()].filter(i=>!same(i,originals.get(i.id)));
  if(preview)return {kind,proposal};if(kind&&!approved)fail('TODO_APPROVAL_REQUIRED');if(!changed.length)return {noop:true};
  h??=this.store.create(this.id,listId);for(const i of changed)this.store.put(listId,i);for(const e of events)this.store.event(listId,e.id,e.kind,e.record);
  if(kind==='create'){h.requirePlan=false;h.prepareText='';}this.store.save(h,h.version);return {rows:changed.filter(i=>!i.deletedAt),removed,removedTargets,affectedTargets:[...new Set(changed.filter(i=>i.parentId&&!removedTargets.includes(i.parentId)).map(i=>i.parentId))],individualRemoved:removed.filter(id=>!removedTargets.includes(id)&&!removedTargets.includes(rows.get(id)?.parentId))};
 }
 contextPacket(reason='compaction'){const s=this.read({limit:10});if(!s.listId)return null;const current=this.store.currentTarget(s.listId);const view={...s};if(current){const detail=this.read({id:current.id,detail:true,unfinished:true,limit:10});view.current=detail.item;view.steps=detail.items;}while(JSON.stringify(view).length>11200&&(view.steps?.length||view.items.length)){if(view.steps?.length)view.steps.pop();else view.items.pop();view.hasMore=true;}return {content:buildTodoContextMessage(view,reason),listId:s.listId,version:s.version};}
 readTool(){return {name:'todo_read',label:'读取任务清单',description:TODO_READ_DESCRIPTION,parameters:{type:'object',additionalProperties:false,properties:{listId:{type:'string'},id:{type:'string'},unfinished:{type:'boolean'},detail:{type:'boolean'},section:{type:'string',enum:['item','verification']},includeDeleted:{type:'boolean'},offset:{type:'integer',minimum:0},limit:{type:'integer',minimum:1,maximum:100}}},execute:async(_id,input)=>{try{return result(this.read(input));}catch(error){return {...result({code:error.code??'TODO_INVALID_OPERATION_FIELDS',version:this.store.load(this.id)?.version??0}),isError:true};}}};}
 updateTool(){const fields={op:{type:'string',enum:['add','edit','status','move','delete','reopen']},id:{type:'string',maxLength:128},level:{type:'integer',enum:[1,2]},parentId:{type:['string','null']},title:{type:'string',maxLength:160},description:{type:'string',maxLength:2000},summary:{type:'string',maxLength:800},blocker:{type:'string',maxLength:600},reason:{type:'string',maxLength:600},status:{type:'string',enum:['pending','running','blocked','done']},beforeId:{type:'string'},acceptance:{type:'array',maxItems:10,items:{type:'object',additionalProperties:false,required:['criterionId','text'],properties:{criterionId:{type:'string'},text:{type:'string',maxLength:300},check:{type:'string',enum:['tool','review','user']}}}},verification:{type:'array',maxItems:10,items:{type:'object',additionalProperties:false,required:['criterionId','result'],properties:{criterionId:{type:'string'},result:{type:'string',maxLength:600},refs:{type:'array',maxItems:3,items:{type:'object',properties:{toolCallId:{type:'string'},messageId:{type:'string'}},additionalProperties:false}}}}}};return {name:'todo_update',label:'更新任务清单',description:TODO_UPDATE_DESCRIPTION,parameters:{type:'object',additionalProperties:false,required:['baseVersion','ops'],properties:{listId:{type:'string'},baseVersion:{type:'integer',minimum:0},reason:{type:'string',maxLength:600},ops:{type:'array',minItems:1,maxItems:100,items:{type:'object',required:['op'],additionalProperties:false,properties:fields}}}},execute:async(_id,input,signal)=>{try{return result(await this.update(input,signal));}catch(error){return {...result({applied:false,code:error.code??'TODO_INVALID_OPERATION_FIELDS',operationIndex:error.operationIndex,itemId:error.itemId,version:this.store.load(this.id)?.version??0}),isError:true};}}};}
}
