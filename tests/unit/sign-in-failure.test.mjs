import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import ts from 'typescript';
// APP-UX-SETTINGS-01: a failed Google sign-in says what happened; "Continue with Google" remains the retry.
const load=file=>import('data:text/javascript;base64,'+Buffer.from(ts.transpileModule(readFileSync(new URL('../../apps/pwa/src/'+file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText).toString('base64'));
const {signInFailureMessage}=await load('sign-in-failure.ts');const {notificationStatusLine}=await load('notification-status.ts');
test('closed or blocked pop-ups share one actionable message in both languages',()=>{
 for(const code of ['auth/popup-blocked','auth/popup-closed-by-user','auth/cancelled-popup-request'])assert.deepEqual(signInFailureMessage(code,false),{text:'The sign-in window was closed or blocked. Allow pop-ups for this site and try again.'});
 assert.equal(signInFailureMessage('auth/popup-blocked',true).text,'หน้าต่างลงชื่อเข้าใช้ถูกปิดหรือถูกบล็อก โปรดอนุญาตป๊อปอัปสำหรับเว็บไซต์นี้แล้วลองอีกครั้ง');
});
test('a network failure asks for a connection',()=>{
 assert.deepEqual(signInFailureMessage('auth/network-request-failed',false),{text:'Sign-in needs a connection. Check the connection and try again.'});
});
test('other failures keep their code; a missing code is safe',()=>{
 assert.deepEqual(signInFailureMessage('auth/internal-error',false),{text:'Sign-in did not complete. Try again.',code:'auth/internal-error'});
 assert.deepEqual(signInFailureMessage(undefined,true),{text:'ลงชื่อเข้าใช้ไม่สำเร็จ กรุณาลองอีกครั้ง'});
});
// APP-UX-SETTINGS-03: one state line when Notifications opens.
test('notification state line covers blocked, on, partly on, off and checking',()=>{
 const on={enabled:true,deviceRegistered:true,subscriptionId:'s'},account={enabled:true,deviceRegistered:false,subscriptionId:null},off={enabled:false,deviceRegistered:true,subscriptionId:'s'};
 assert.equal(notificationStatusLine('denied',on,false,false),'Blocked by this browser. Allow notifications in site settings.');
 assert.equal(notificationStatusLine('granted',on,false,false),'On for this device.');
 assert.equal(notificationStatusLine('default',account,false,false),'On for your account, not on this device.');
 assert.equal(notificationStatusLine('granted',off,false,false),'Off for your account.');
 assert.equal(notificationStatusLine('default',null,true,false),'Checking notification status…');
 assert.equal(notificationStatusLine(undefined,null,false,false),null);
 assert.equal(notificationStatusLine('granted',on,false,true),'เปิดอยู่บนอุปกรณ์นี้');
});
