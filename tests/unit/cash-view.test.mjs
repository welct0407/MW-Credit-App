import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import ts from 'typescript';
// APP-TEST-03: cash statement date helpers (pure module, transpiled as the PWA build does).
const source=ts.transpileModule(readFileSync(new URL('../../apps/pwa/src/cash-view.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText;
const {yesterdayBangkok,previousDay,statementTime}=await import('data:text/javascript,'+encodeURIComponent(source));
test('yesterday is computed on the Bangkok calendar',()=>{
 assert.equal(yesterdayBangkok(new Date('2026-10-16T00:30:00Z')),'2026-10-15');
 assert.equal(yesterdayBangkok(new Date('2026-10-15T16:59:00Z')),'2026-10-14');
 assert.equal(yesterdayBangkok(new Date('2026-10-15T17:00:00Z')),'2026-10-15');
});
test('previous day crosses month and leap-year boundaries',()=>{
 assert.equal(previousDay('2026-03-01'),'2026-02-28');assert.equal(previousDay('2028-03-01'),'2028-02-29');assert.equal(previousDay('2027-01-01'),'2026-12-31');
});
test('statement time shows HH:MM or a dash',()=>{
 assert.equal(statementTime('2026-10-15 10:05:00.1'),'10:05');assert.equal(statementTime('2026-10-15T23:59:59Z'),'23:59');
 for(const value of [null,undefined,'',123,'10:05','2026-10-15'])assert.equal(statementTime(value),'—',String(value));
});
