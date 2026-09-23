import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync,rmSync } from 'node:fs';
import { tmpdir,cpus,platform } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { Todo,createTodoStore } from '../src/todo.js';
const dir=mkdtempSync(join(tmpdir(),'axiom-todo-bench-'));
const report={node:process.version,platform:platform(),cpu:cpus()[0]?.model,database:'file SQLite WAL synchronous=NORMAL',samples:[]};
try{for(const size of [100,1000,5000]){
 const db=new DatabaseSync(join(dir,`${size}.db`));db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL');const todo=new Todo({sessionId:'bench',store:createTodoStore(db),questions:{confirmTodo:async()=>({approved:true})}});
 await todo.update({baseVersion:0,ops:[{op:'add',id:'t',level:1,title:'基准目标',description:'x'.repeat(100),acceptance:[{criterionId:'a',text:'review',check:'review'}]}]});
 for(let start=1;start<size;start+=100)await todo.update({listId:todo.header.listId,baseVersion:todo.header.version,ops:Array.from({length:Math.min(100,size-start)},(_,n)=>({op:'add',id:`s${start+n}`,level:2,parentId:'t',title:'步骤'.repeat(10),description:'x'.repeat(100)}))});
 const read=[],write=[];let readChars=0,writeChars=0;
 for(let n=0;n<350;n++){let t=performance.now();readChars=JSON.stringify(todo.read({})).length;if(n>=50)read.push(performance.now()-t);t=performance.now();const result=await todo.update({listId:todo.header.listId,baseVersion:todo.header.version,ops:[{op:'edit',id:'s1',summary:`sample ${n}`}]});writeChars=JSON.stringify(result).length;if(n>=50)write.push(performance.now()-t);}
 const stats=a=>{a.sort((a,b)=>a-b);return {medianMs:a[150],p95Ms:a[284]};};report.samples.push({size,read:stats(read),write:stats(write),readChars,writeChars});db.close();
}console.log(JSON.stringify(report,null,2));}finally{rmSync(dir,{recursive:true,force:true});}
