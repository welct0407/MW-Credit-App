import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import {sortedExpenseIds} from '../../services/contracts/rebate-settlement-command.mjs';
// R129 (V137): the Referrers pages' pure helpers: the search rule, the command's id order (the same as the Node contract's
// and SQL COLLATE "C") and the exact money sum of the Pay rebates footer.
const load=file=>{const exports={};runInNewContext(ts.transpileModule(readFileSync(new URL('../../apps/pwa/src/'+file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,TextEncoder});return exports;};
const {matchesReferrer,sortedIds,moneySum}=load('referrer-text.ts');
test('search: every typed word appears in the Thai or the English name',()=>{
 const row={name:'มาย สมใจ',description:'Mai Somjai'};
 for(const query of ['','mai','MAI som','มาย','สมใจ mai','  mai   somjai '])assert.equal(matchesReferrer(row,query),true,query);
 for(const query of ['pond','mai pond','มายา'])assert.equal(matchesReferrer(row,query),false,query);
 assert.equal(matchesReferrer({name:null,description:null},'x'),false);
});
test('id order: UTF-8 byte order without duplicates, as the Node contract and SQL require',()=>{
 const ids=['rr1:b','rr1:B','rr1:a','rr1:b','rr1:é','rr1:z','rr1:ก','rr1:L-10','rr1:L-9'];
 assert.deepEqual([...sortedIds(ids)],sortedExpenseIds(ids));
 assert.deepEqual([...sortedIds(ids)],['rr1:B','rr1:L-10','rr1:L-9','rr1:a','rr1:b','rr1:z','rr1:é','rr1:ก']);
});
test('footer total: exact in satang',()=>{
 assert.equal(moneySum(['0.10','0.20']),'0.30');assert.equal(moneySum(['300.00','100.00','450.00']),'850.00');assert.equal(moneySum([]),'0.00');
});
