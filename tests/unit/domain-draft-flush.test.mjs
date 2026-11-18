import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';

// R172 (owner, 18 November 2026): a form closed within the 400 ms autosave delay kept its last edit only by luck (seen in
// the rollover form: Principal Amount 11000 came back as 10000). useDomainDraft now saves an unsaved change once more when
// the form unmounts or its key changes; a frozen (submitted) or discarded form writes nothing.
const source=ts.transpileModule(readFileSync(new URL('../../apps/pwa/src/domain-draft.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const settle=async()=>{for(let turn=0;turn<20;turn++)await new Promise(resolve=>setImmediate(resolve))};

/** A minimal hook runner (no DOM in the unit suite): useState, useRef and useEffect with deps and cleanups, and unmount. */
function mount(repository){
 const states=[],refs=[],effects=[];let cursor=0,ref=0,effect=0,queue=[];
 const react={useState(initial){const index=cursor++;if(!(index in states))states[index]=initial;return [states[index],value=>{states[index]=typeof value==='function'?value(states[index]):value}]},
  useRef(initial){const index=ref++;if(!(index in refs))refs[index]={current:initial};return refs[index]},
  // As React: every cleanup of a commit runs before any effect body; an effect without deps runs after every render.
  useEffect(run,deps){const index=effect++,old=effects[index];if(!old||!deps||deps.some((dep,at)=>!Object.is(dep,old.deps[at])))queue.push({cleanup:()=>old?.cleanup?.(),run:()=>{effects[index]={deps,cleanup:run()}}})}};
 const window=new EventTarget(),saved=[];window.addEventListener('mw-offline-saved',()=>saved.push('saved'));
 const sandbox={exports:{},require:name=>name==='react'?react:name==='./app-update-safety'?{useAppUpdateBlock:()=>{}}:name==='./draft-state'?{draftFailure:error=>({message:String(error?.message??error)})}:(()=>{throw Error('Unexpected import '+name)})(),
  window,Event,structuredClone,setTimeout,clearTimeout,JSON,Promise,Error};
 runInNewContext(source,sandbox);
 let hook=null;
 const render=props=>{cursor=ref=effect=0;queue=[];hook=sandbox.exports.useDomainDraft({repository,domain:'loan',label:'Rollover',enabled:true,restore:()=>{},...props});for(const entry of queue)entry.cleanup();for(const entry of queue)entry.run();return hook};
 const unmount=()=>{for(const entry of effects)entry?.cleanup?.()};
 return {render,unmount,saved,hook:()=>hook};
}
function repository({authorized=true}={}){
 const saves=[],removed=[];
 return {saves,removed,authorized:async()=>authorized,draft:async()=>null,list:async()=>[],saveDraft:async(key,value)=>{saves.push([key,structuredClone(value)])},remove:async(_store,key)=>{removed.push(key)}};
}
/** Mounted, restored (nothing stored) and ready. */
async function ready(repo,props={}){const form=mount(repo);form.render({id:'R-loan',value:{principal:'10000'},...props});await settle();form.render({id:'R-loan',value:{principal:'10000'},...props});assert.equal(form.hook().ready,true);return form}

test('R172 an edit followed at once by closing the form is saved to the key it was editing',async()=>{
 const repo=repository(),form=await ready(repo);
 form.render({id:'R-loan',value:{principal:'11000'}});
 form.unmount();await settle();
 assert.deepEqual(repo.saves,[['loan:R-loan',{domain:'loan',label:'Rollover',draft:{principal:'11000'}}]]);
 assert.deepEqual(form.saved,['saved']);
});
test('R172 a key change flushes the unsaved edit to the previous key only',async()=>{
 const repo=repository(),form=await ready(repo);
 form.render({id:'R-loan',value:{principal:'11000'}});
 form.render({id:'R-other',value:{principal:'11000'}});await settle();
 assert.deepEqual(repo.saves.map(([key,value])=>[key,value.draft]),[['loan:R-loan',{principal:'11000'}]]);
});
test('R172 an unchanged form saves nothing when it closes',async()=>{
 const repo=repository(),form=await ready(repo);
 form.unmount();await settle();
 assert.deepEqual(repo.saves,[]);
});
test('R172 after freeze() (submitted) or discard() closing writes no draft',async()=>{
 for(const action of ['freeze','discard']){
  const repo=repository(),form=await ready(repo);
  form.render({id:'R-loan',value:{principal:'11000'}});
  await form.hook()[action]();form.unmount();await settle();
  assert.deepEqual(repo.saves,[],action);
  assert.deepEqual(repo.removed,action==='discard'?['loan:R-loan']:[],action);
 }
});
test('R172 the flush still needs the owner lease and never throws',async()=>{
 const repo=repository(),form=await ready(repo);
 repo.authorized=async()=>false;form.render({id:'R-loan',value:{principal:'11000'}});
 form.unmount();await settle();assert.deepEqual(repo.saves,[]);
 const failing=repository(),other=await ready(failing);
 failing.saveDraft=async()=>{throw Error('quota')};other.render({id:'R-loan',value:{principal:'12000'}});
 other.unmount();await settle();assert.deepEqual(other.saved,[]);
});
test('R172 the 400 ms autosave still saves an edit on a form that stays open',async()=>{
 const repo=repository(),form=await ready(repo);
 form.render({id:'R-loan',value:{principal:'11000'}});
 await new Promise(resolve=>setTimeout(resolve,450));await settle();
 assert.deepEqual(repo.saves.map(([key,value])=>[key,value.draft]),[['loan:R-loan',{principal:'11000'}]]);
 // Already saved: closing now writes nothing more.
 form.render({id:'R-loan',value:{principal:'11000'}});form.unmount();await settle();assert.equal(repo.saves.length,1);
});
test('R172 UX-DRAFT-02 a new-record draft is restored only for the same borrower (recoverNew scoping)',async()=>{
 const stored={key:'draft:loan:A-new',savedAt:1,value:{domain:'loan',label:'Borrower A',draft:{id:'A-new',fields:{borrowerId:'B-A',terms:'kept'}}}};
 for(const [borrower,expected] of [['B-B',null],['B-A','kept']]){
  const repo=repository();repo.list=async store=>store==='draft'?[structuredClone(stored)]:[];
  let restored=null;const form=mount(repo);
  form.render({id:'new-'+borrower,recoverNew:true,value:{id:'new-'+borrower,fields:{borrowerId:borrower,terms:''}},restore:value=>{restored=value}});await settle();
  assert.equal(restored?.fields?.terms??null,expected,borrower);
  if(expected)assert.equal(restored.id,'new-'+borrower,'the restored draft takes the new form id');
  form.unmount();
 }
});
test('R172 Chase: when the key and the value change together, the old key gets its own last value, not the new one',async()=>{
 const repo=repository(),form=await ready(repo);
 form.render({id:'R-loan',value:{principal:'11000'}});
 form.render({id:'R-other',value:{principal:'500'}});await settle();
 assert.deepEqual(repo.saves.map(([key,value])=>[key,value.draft]),[['loan:R-loan',{principal:'11000'}]]);
 // An old key closed without an edit writes nothing, whatever the new key holds.
 const clean=repository(),other=await ready(clean);
 other.render({id:'R-other',value:{principal:'500'}});await settle();assert.deepEqual(clean.saves,[]);
});
