import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {loanColumns} from '../../services/api/loan-read-contract.mjs';
// R109 DEV defect: the read service selected Loans."Default Loss Amount" while the reader role had no column grant for it
// (42501, 503 read_unavailable). Every column the reader SQL names through a table alias must be in the reader's column
// grants: scripts/production/reader-capability-contract.json (PROD) and scripts/configure-dev-read-role.py (DEV), which
// must list the same columns.
const read=path=>readFileSync(new URL('../../'+path,import.meta.url),'utf8');
const contract=JSON.parse(read('scripts/production/reader-capability-contract.json')).columnSelect;
function devColumns(){
 const source=read('scripts/configure-dev-read-role.py');
 const dict=name=>{const start=source.indexOf(name+' = {');assert.ok(start>=0,name);const body=source.slice(source.indexOf('{',start),source.indexOf('\n}',start)+2);return JSON.parse(body.replaceAll("'",'"').replace(/,\s*}/,'}'));};
 return {...dict('COLUMNS'),...dict('VIEW_COLUMNS')};
}
/** Alias -> relation from `public."Table" a` / `public.view a` in the module's SQL (CTE aliases are not relations). */
function aliases(text){
 const map={};for(const m of text.matchAll(/public\.(?:"([^"]+)"|([a-z_0-9]+))(?:\s+AS)?\s+([a-z]{1,3})\b/g)){const relation=m[1]??m[2],alias=m[3];if(['on','as','where','join','left','cross'].includes(alias))continue;if(!map[alias])map[alias]=new Set();map[alias].add(relation);}
 return map;
}
/** relation -> columns referenced as alias."Column" (an alias naming two relations must resolve in one of them). */
function referenced(text,map){
 const out=[];for(const m of text.matchAll(/\b([a-z]{1,3})\."([^"]+)"/g)){const relations=map[m[1]];if(relations)out.push({relations:[...relations],column:m[2],at:m[0]});}
 return out;
}
const modules=['services/api/borrower-read-store.mjs','services/api/collection-read-contract.mjs','services/api/upcoming-read-contract.mjs'];
test('the DEV read-role script and the PROD reader contract grant the same columns',()=>{
 assert.deepEqual(devColumns(),contract);
});
test('every alias-qualified column of the reader SQL is granted to the reader',()=>{
 const missing=[];
 // loan-read-contract.mjs columns run inside borrower-read-store.mjs's query (public."Loans" l JOIN public."Borrowers" b).
 const sources=[...modules.map(path=>[path,read(path)]),['services/api/loan-read-contract.mjs (loanColumns)',loanColumns]];
 const storeAliases=aliases(read('services/api/borrower-read-store.mjs'));
 let checked=0;
 for(const [path,text] of sources){
  const map=path.startsWith('services/api/loan-read-contract')?storeAliases:aliases(text);
  for(const ref of referenced(text,map)){checked++;if(!ref.relations.some(relation=>contract[relation]?.includes(ref.column)))missing.push(`${path}: ${ref.at} (${ref.relations.join('|')})`);}
 }
 assert.ok(checked>50,'the scan found the reader SQL ('+checked+' references)');
 assert.deepEqual([...new Set(missing)],[],'columns the reader selects without a grant');
});
test('the R109 loss column is granted (the defect this test was added for)',()=>{
 assert.match(loanColumns,/l\."Default Loss Amount"/);assert.ok(contract.Loans.includes('Default Loss Amount'));
});
