import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import ts from 'typescript';
// R176: the Collection chat buttons copy the daily reminder (Thai only, 📌 first) built from the remaining amount.
const source=ts.transpileModule(readFileSync(new URL('../../apps/pwa/src/reminder-message.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText;
const {reminderMessage,reminderAmount}=await import('data:text/javascript,'+encodeURIComponent(source));
test('the amount is grouped on the string, decimals only when not zero, no currency sign',()=>{
 assert.equal(reminderMessage('3600'),'📌วันนี้มีส่งยอด 3,600 นะคะ');
 assert.equal(reminderMessage('3600.00'),'📌วันนี้มีส่งยอด 3,600 นะคะ');
 assert.equal(reminderMessage('3600.50'),'📌วันนี้มีส่งยอด 3,600.50 นะคะ');
 assert.equal(reminderMessage('999'),'📌วันนี้มีส่งยอด 999 นะคะ');
 assert.equal(reminderMessage('1234567'),'📌วันนี้มีส่งยอด 1,234,567 นะคะ');
 assert.equal(reminderAmount('3600.00'),'3,600');assert.equal(reminderAmount('1234567.25'),'1,234,567.25');
});
test('a missing, non-decimal, zero or negative amount gives no message',()=>{
 for(const value of [null,undefined,'','abc','0','0.00','-100'])assert.equal(reminderMessage(value),null,String(value));
});
test('the message starts with the pin the group chat summary treats as routine',()=>{
 assert.ok(reminderMessage('3600').startsWith('📌'));
});
