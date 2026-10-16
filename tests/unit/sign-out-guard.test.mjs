import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const source=ts.transpileModule(readFileSync(new URL('../../apps/pwa/src/sign-out-guard.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {signOutGuard,syncNowLabel}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
// APP-OFFLINE-02 / APP-UX-SETTINGS-05: sign-out stays disabled while unsynced requests exist; the button keeps
// its plain name and a separate note says why.
test('sign-out is enabled with the plain label when nothing is pending',()=>{
 assert.deepEqual(signOutGuard(0,false),{disabled:false,label:'Sign out'});
 assert.deepEqual(signOutGuard(0,true),{disabled:false,label:'ออกจากระบบ'});
});
test('sign-out is disabled with a note naming the unsynced count in both languages',()=>{
 assert.deepEqual(signOutGuard(3,false),{disabled:true,label:'Sign out',note:'3 saved changes not synced yet. Sync before signing out.'});
 assert.deepEqual(signOutGuard(1,false),{disabled:true,label:'Sign out',note:'1 saved change not synced yet. Sync before signing out.'});
 assert.deepEqual(signOutGuard(3,true),{disabled:true,label:'ออกจากระบบ',note:'ยังมีรายการที่บันทึกไว้ 3 รายการที่ยังไม่ซิงค์ กรุณาซิงค์ก่อนออกจากระบบ'});
});
test('a sub-second first send keeps sign-out disabled without the note',()=>{
 assert.deepEqual(signOutGuard(1,false,0),{disabled:true,label:'Sign out'});
});
test('the visible Sync now action names its count',()=>{
 assert.equal(syncNowLabel(1,false),'Sync now, 1 saved change');assert.equal(syncNowLabel(2,false),'Sync now, 2 saved changes');assert.equal(syncNowLabel(2,true),'ซิงค์ตอนนี้ 2 รายการที่บันทึก');
});
