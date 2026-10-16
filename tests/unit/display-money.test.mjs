import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import ts from 'typescript';
// APP-TEST-03: the PWA money formatters (pure module, transpiled as the PWA build does).
const source=ts.transpileModule(readFileSync(new URL('../../apps/pwa/src/display-money.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText;
const {wholeBaht,sharePercent}=await import('data:text/javascript,'+encodeURIComponent(source));
test('whole baht rounds to an integer with thousands separators; missing values show a dash',()=>{
 assert.equal(wholeBaht('1234.5'),'฿1,235');assert.equal(wholeBaht(0),'฿0');assert.equal(wholeBaht('-20.4'),'฿-20');
 assert.equal(wholeBaht(null),'—');assert.equal(wholeBaht(undefined),'—');
});
test('share percent keeps two decimals at most',()=>{
 assert.equal(sharePercent('0.1234'),'12.34%');assert.equal(sharePercent(1),'100%');assert.equal(sharePercent('0.123456'),'12.35%');assert.equal(sharePercent(null),'—');
});
