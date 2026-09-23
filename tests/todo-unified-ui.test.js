import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createTodoUI } from '../public/todo.js';
test('collapsed dock has zero task rows, expanded bounded and stale async responses isolated',async()=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost'});const old={window:globalThis.window,document:globalThis.document,localStorage:globalThis.localStorage};Object.assign(globalThis,{window:dom.window,document:dom.window.document,localStorage:dom.window.localStorage});
 try{const root=document.getElementById('root');let resolve;const ui=createTodoUI({root,request:()=>new Promise(r=>{resolve=r;})});
 const value={listId:'list',version:1,header:{},counts:{targets:{total:1,done:0,pending:1},steps:{total:4999,done:0}},items:[{id:'t',level:1,title:'target',status:'pending'}]};
 ui.show('a',value);assert.equal(root.querySelectorAll('.todo-row').length,0);root.querySelector('.todo-toggle').click();ui.show('b',{...value,listId:'other',version:2});resolve?.({...value,items:[{id:'foreign',level:1,title:'wrong',status:'pending'}]});await new Promise(r=>setImmediate(r));assert.equal(root.textContent.includes('wrong'),false);ui.show('b',{...value,listId:'other',version:1,items:[]});assert.match(root.textContent,/target/);
 root.querySelector('.todo-toggle').click();assert.equal(root.querySelectorAll('.todo-row').length,0);
 }finally{Object.assign(globalThis,old);dom.window.close();}
});
