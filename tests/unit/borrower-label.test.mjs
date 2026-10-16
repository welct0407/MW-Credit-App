import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import ts from 'typescript';
// APP-UX-BORROWER-01: "Thai name - English name" without a dangling separator when one side is empty.
const source=ts.transpileModule(readFileSync(new URL('../../apps/pwa/src/borrower-label.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText;
const {borrowerLabel}=await import('data:text/javascript,'+encodeURIComponent(source));
test('both names join with one separator; an empty side leaves no dangling separator',()=>{
 assert.equal(borrowerLabel('ผู้กู้จำลอง','Synthetic Borrower'),'ผู้กู้จำลอง - Synthetic Borrower');
 assert.equal(borrowerLabel('Synthetic Borrower One',null),'Synthetic Borrower One');
 assert.equal(borrowerLabel('Synthetic Borrower One',''),'Synthetic Borrower One');
 assert.equal(borrowerLabel(null,' Synthetic English '),'Synthetic English');
});
test('no name at all uses the fallback',()=>{
 assert.equal(borrowerLabel(null,null),'—');assert.equal(borrowerLabel('  ','',"New borrower"),'New borrower');
});
