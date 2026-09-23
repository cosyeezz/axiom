import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createAgentSession,ModelRuntime,SessionManager,SettingsManager} from '@earendil-works/pi-coding-agent';
import {createTodoContextBridge} from '../src/todo-context.js';
test('real SDK persists restore into branch and context without a model turn; boundaries deduplicate',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'todo-context-'));let session;
 try{
 ({session}=await createAgentSession({cwd:dir,agentDir:dir,modelRuntime:await ModelRuntime.create({authPath:join(dir,'auth.json'),modelsPath:null}),model:{id:'test',name:'Test',api:'openai-completions',provider:'test',baseUrl:'http://127.0.0.1:9',reasoning:false,input:['text'],cost:{input:0,output:0,cacheRead:0,cacheWrite:0},contextWindow:4096,maxTokens:100},thinkingLevel:'off',sessionManager:SessionManager.inMemory(dir),settingsManager:SettingsManager.inMemory({compaction:{enabled:false}})}));
 const packet=()=>({content:'任务恢复包',listId:'list',version:3});
 let bridge=createTodoContextBridge(session,packet);bridge.queue('boundary');await bridge.apply();
 assert.equal(session.isStreaming,false);assert.equal(session.sessionManager.getBranch().filter(e=>e.customType==='todo-context').length,1);
 bridge.queue('boundary');await bridge.apply();bridge=createTodoContextBridge(session,packet);bridge.queue('boundary');await bridge.apply();
 assert.equal(session.sessionManager.getBranch().filter(e=>e.customType==='todo-context').length,1);
 bridge.request('resume');await bridge.apply();bridge.request('resume');await bridge.apply();assert.equal(session.sessionManager.getBranch().filter(e=>e.customType==='todo-context').length,2);
 const id=session.sessionManager.appendMessage({role:'toolResult',toolCallId:'call',toolName:'bash',content:[{type:'text',text:'passed'}],isError:false,timestamp:Date.now()});
 assert.deepEqual(bridge.resolve({toolCallId:'call'}),{entryId:id,toolName:'bash'});assert.equal(bridge.resolve({messageId:'missing'}),null);
 }finally{await session?.dispose();rmSync(dir,{recursive:true,force:true});}
});
