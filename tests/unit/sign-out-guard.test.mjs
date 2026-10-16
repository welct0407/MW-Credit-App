import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const source=ts.transpileModule(readFileSync(new URL('../../apps/pwa/src/sign-out-guard.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {signOutGuard}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
// APP-OFFLINE-02: sign-out stays disabled while unsynced requests exist, and the label says to sync first.
test('sign-out is enabled with the plain label when nothing is pending',()=>{
 assert.deepEqual(signOutGuard(0,false),{disabled:false,label:'Sign out'});
 assert.deepEqual(signOutGuard(0,true),{disabled:false,label:'ออกจากระบบ'});
});
test('sign-out is disabled and names the pending count in both languages',()=>{
 assert.deepEqual(signOutGuard(3,false),{disabled:true,label:'Sync 3 pending first'});
 assert.deepEqual(signOutGuard(1,false),{disabled:true,label:'Sync 1 pending first'});
 const thai=signOutGuard(3,true);assert.equal(thai.disabled,true);assert.ok(thai.label.startsWith('ซิงค์'));assert.ok(thai.label.includes('3'));assert.equal(thai.label,'ซิงค์ 3 รายการที่ค้างอยู่ก่อน');
});
