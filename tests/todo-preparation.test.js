import test from 'node:test';
import assert from 'node:assert/strict';
import { createToolExecutionPolicy } from '../src/tool-execution.js';
import { command } from '../src/protocol.js';
test('preparation latch blocks every non-planning tool without changing timeout policy',()=>{
 const hooks=new Map();let waiting=true;createToolExecutionPolicy({requiresPlan:()=>waiting}).extension({on:(name,fn)=>hooks.set(name,fn)});
 const invoke=name=>hooks.get('tool_call')({toolName:name,input:{}});
 for(const tool of ['bash','edit','delegate','mcp_read'])assert.match(invoke(tool).reason,/TODO_GOAL_NOT_CONFIRMED/);
 for(const tool of ['question','todo_read','todo_update'])assert.equal(invoke(tool),undefined);
 waiting=false;assert.equal(invoke('bash'),undefined);
});
test('unified protocol rejects legacy goal actions and validates bounded read',()=>{
 assert.equal(command.safeParse({id:'r',type:'goal.action',sessionId:'s',action:'enter'}).success,false);
 assert.equal(command.safeParse({id:'r',type:'todo.action',sessionId:'s',action:'prepare',text:'task'}).success,true);
 assert.equal(command.safeParse({id:'r',type:'todo.get',sessionId:'s',itemId:'target',limit:101}).success,false);
});
