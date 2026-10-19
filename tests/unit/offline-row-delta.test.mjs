import test from 'node:test';
import assert from 'node:assert/strict';
import {applyDatasetPatch,deltaMovesRows,deltaScopeMoves} from '../../services/lib/offline-dataset-digest.mjs';
import {resolveCashScope,resolveCollectionScope,CASH_ACCOUNT_DAY_LIMIT,TARGETED_LIMITS} from '../../services/business/offline-dataset-chunks.mjs';
import {encodeDeltaChunk,readDeltaRequest} from '../../services/api/offline-dataset-delta.mjs';

// R078 row deltas for collection and cash: the replaceWhere patch, the moved-row checks and the scope resolvers' walk cases.
const plain=value=>JSON.parse(JSON.stringify(value));
test('replaceWhere replaces the rows of the listed owners and restores the walk order (COLLATE "C" on the sort field)',()=>{
 const data={charges:[{id:'c1',borrowerId:'A'},{id:'c3',borrowerId:'B'},{id:'c5',borrowerId:'A'},{id:'c7',borrowerId:null}]};
 applyDatasetPatch(data,{key:'charges',mode:'replaceWhere',field:'borrowerId',values:['A'],value:[{id:'c6',borrowerId:'A'},{id:'C0',borrowerId:'A'}],sort:'id'});
 assert.deepEqual(plain(data.charges),[{id:'C0',borrowerId:'A'},{id:'c3',borrowerId:'B'},{id:'c6',borrowerId:'A'},{id:'c7',borrowerId:null}]);
 applyDatasetPatch(data,{key:'charges',mode:'replaceWhere',field:'borrowerId',values:[null,'B'],value:[]});assert.deepEqual(plain(data.charges).map(row=>row.id),['C0','c6'],'null is an owner value too; no sort keeps the order');
 applyDatasetPatch(data,{key:'receipts',mode:'replaceWhere',field:'borrowerId',values:['A'],value:[{id:'p1',borrowerId:'A'}],sort:'id'});assert.deepEqual(plain(data.receipts),[{id:'p1',borrowerId:'A'}],'an absent key starts empty');
 for(const bad of [{key:'charges',mode:'replaceWhere',field:'borrowerId',values:['A'],value:[{id:'x',borrowerId:'B'}]},{key:'charges',mode:'replaceWhere',field:'a.b',values:[],value:[]},{key:'charges',mode:'replaceWhere',field:'borrowerId',values:'A',value:[]},{key:'charges',mode:'replaceWhere',field:'borrowerId',values:[],value:[],sort:'x-y'},{key:'charges',mode:'replaceWhere',field:'borrowerId',values:['A'],value:[null]}])assert.throws(()=>applyDatasetPatch(data,bad),/Invalid dataset patch/,JSON.stringify(bad));
 const encoded=encodeDeltaChunk({domain:'collection',businessDate:'2026-10-19',patches:[{key:'charges',mode:'replaceWhere',field:'borrowerId',values:['A'],value:[{id:'c1',borrowerId:'A'},{id:'c2',borrowerId:'A'}],sort:'id'}]},[]);
 assert.equal(encoded.patches[0].refs.length,2,'rows travel as one reference each');assert.deepEqual(encoded.patches[0].values,['A']);
 assert.equal(readDeltaRequest({rowDeltas:true}).rowDeltas,true);assert.throws(()=>readDeltaRequest({rowDeltas:1}),/invalid_request/);
});
test('moved rows walk: a replaceWhere row still held under another owner, a changed loan under a borrower outside the delta, a changed ledger row outside the re-read days',()=>{
 const data={charges:[{id:'c1',borrowerId:'A',loanId:'L1'},{id:'c2',borrowerId:'B',loanId:'L2'}],receipts:[{id:'p1',borrowerId:'A'}]};
 assert.equal(deltaMovesRows(data,[{key:'charges',mode:'replaceWhere',field:'borrowerId',values:['B'],value:[{id:'c2',borrowerId:'B'}]}]),false);
 assert.equal(deltaMovesRows(data,[{key:'charges',mode:'replaceWhere',field:'borrowerId',values:['B'],value:[{id:'c1',borrowerId:'B'}]}]),true,'c1 is still under A');
 assert.equal(deltaMovesRows(data,[{key:'receipts',mode:'replaceWhere',field:'borrowerId',values:['A','B'],value:[{id:'p1',borrowerId:'B'}]}]),false,'both owners replaced');
 assert.equal(deltaScopeMoves(data,{borrowers:['B'],loans:['L2']}),false);
 assert.equal(deltaScopeMoves(data,{borrowers:['B'],loans:['L1']}),true,'L1 still has a charge under A');
 assert.equal(deltaScopeMoves({borrowerUpcomingByKey:{'["borrower","A"]':{borrowerId:'A',previews:[{items:[{loanId:'L9'}]}]}}},{borrowers:['B'],loans:['L9']}),true,'an upcoming entry of A shows the loan');
 const cash={statementsByKey:{'["CI-DAD","2026-10-17"]':{items:[{ledgerId:'G1'}]},'["CI-LISA","2026-10-18"]':{items:[{ledgerId:'G2'}]}}};
 assert.equal(deltaScopeMoves(cash,{ledgerIds:['G1'],from:{'CI-DAD':'2026-10-17'}}),false);
 assert.equal(deltaScopeMoves(cash,{ledgerIds:['G1'],from:{'CI-DAD':'2026-10-18'}}),true,'the row moved later: its old day is not re-read');
 assert.equal(deltaScopeMoves(cash,{ledgerIds:['G2'],from:{'CI-DAD':'2026-10-01'}}),true,'the row moved to another account');
 assert.equal(deltaScopeMoves(cash,null),false);
});

/** A client answering the resolvers' queries from fixtures (SQL recognised by its distinctive text). */
function fakeClient({ledger=[],window=[],labels={},lookups={},hidden=[],allocated=[]}){
 const queries=[];
 return {queries,query:async(sql,params=[])=>{queries.push(sql);const ids=params[0]??[];
  if(sql.includes('"Cash Account Daily Summary Recent"'))return {rows:window.filter(row=>ids.includes(row.account))};
  if(sql.includes('FROM public."Cash Ledger" g WHERE g."Row ID"=ANY'))return {rows:ledger.filter(row=>ids.includes(row.id))};
  for(const [marker,rows] of Object.entries(labels))if(sql.includes(marker))return {rows};
  if(sql.includes('"Hidden Flag" IS TRUE'))return {rowCount:ids.some(id=>hidden.includes(id))?1:0,rows:[]};
  if(sql.includes('"Payment Allocations" a JOIN public."Charges"'))return {rows:allocated.map(id=>({id}))};
  for(const [table,rows] of Object.entries(lookups))if(sql.includes(`FROM public."${table}"`))return {rows:rows.filter(row=>ids.includes(row.key))};
  return {rows:[]};
 }};
}
const days=(account,from,to)=>{const rows=[];for(let day=from;day<=to;day++)rows.push({account,day:`2026-10-${String(day).padStart(2,'0')}`});return rows};
test('cash scope: a ledger row re-reads both accounts from its day onward; labels only their days; walk cases',async()=>{
 const window=[...days('CI-DAD',5,19),...days('CI-LISA',5,19)];
 const shifted=await resolveCashScope(fakeClient({window,ledger:[{id:'G1',from:'CI-LISA',to:'CI-DAD',day:'2026-10-17'}]}),[{table:'Cash Ledger',key:'G1'},{table:'Cash Pool Contributions',key:'C1'}]);
 assert.deepEqual(shifted.accountDays.map(pair=>pair.join(' ')),['CI-DAD 2026-10-17','CI-DAD 2026-10-18','CI-DAD 2026-10-19','CI-LISA 2026-10-17','CI-LISA 2026-10-18','CI-LISA 2026-10-19']);
 assert.deepEqual(shifted.from,{'CI-LISA':'2026-10-17','CI-DAD':'2026-10-17'});assert.deepEqual(shifted.ledgerIds,['G1']);
 const backdated=await resolveCashScope(fakeClient({window,ledger:[{id:'G0',from:null,to:'CI-DAD',day:'2026-09-30'}]}),[{table:'Cash Ledger',key:'G0'}]);
 assert.equal(backdated.accountDays.length,15,'a row before the window shifts every window day of its account');assert.deepEqual(backdated.from,{'CI-DAD':'2026-10-05'});
 const label=await resolveCashScope(fakeClient({window,labels:{'g."Ref Payment"=ANY':[{id:'G5',from:null,to:'CI-DAD',day:'2026-10-12'},{id:'G6',from:null,to:'CI-DAD',day:'2026-09-01'}]}}),[{table:'Payments',key:'P1'}]);
 assert.deepEqual(label.accountDays,[['CI-DAD','2026-10-12']],'a label row re-reads only its day, and nothing outside the window');assert.deepEqual(label.from,{});
 const overview=await resolveCashScope(fakeClient({window}),[{table:'Repayments',key:'R1'},{table:'Cash Pool Contributions',key:'C1'}]);
 assert.deepEqual(overview.accountDays,[],'overview-only changes re-read no statement');
 for(const table of ['Cash Accounts','Cash Holders','Cash Statement Context','r008_cash_account_cutover','Unknown table'])assert.equal(await resolveCashScope(fakeClient({window}),[{table,key:'X'}]),null,table+' walks');
 assert.equal(await resolveCashScope(fakeClient({window,ledger:[]}),[{table:'Cash Ledger',key:'GONE'}]),null,'a missing ledger row walks');
 const many=Array.from({length:3},(_,index)=>({id:'G'+index,from:`A${index}`,to:null,day:'2026-10-05'})),wide=[0,1,2].flatMap(index=>days(`A${index}`,5,19));
 assert.equal(await resolveCashScope(fakeClient({window:wide,ledger:many}),many.map(row=>({table:'Cash Ledger',key:row.id}))),null,`more than ${CASH_ACCOUNT_DAY_LIMIT} account-days walk`);
});
test('collection scope: borrowers through the records lookups plus the borrowers a changed payment is allocated to; walk cases',async()=>{
 const lookups={Payments:[{key:'P1',borrowers:['B'],payment:'P1',expense:null,unassigned:false}],Borrowers:[{key:'H',borrowers:['H'],payment:null,expense:null,unassigned:false}],Loans:[{key:'L1',borrowers:['B'],payment:null,expense:null,unassigned:false}]};
 const scope=await resolveCollectionScope(fakeClient({lookups,allocated:['A']}),[{table:'Payments',key:'P1'},{table:'Loans',key:'L1'}]);
 assert.deepEqual(scope,{borrowers:['A','B'],loans:['L1']},'the old borrower of a moved payment is re-read too');
 assert.equal(await resolveCollectionScope(fakeClient({lookups}),[{table:'Cash Accounts',key:'CI-DAD'}]),null,'a cash account change walks');
 assert.equal(await resolveCollectionScope(fakeClient({lookups}),[{table:'Statistics',key:'S'}]),null,'an unmapped table walks');
 assert.equal(await resolveCollectionScope(fakeClient({lookups,hidden:['H']}),[{table:'Borrowers',key:'H'}]),null,'a hidden changed borrower walks');
 assert.equal(await resolveCollectionScope(fakeClient({lookups,allocated:Array.from({length:TARGETED_LIMITS.borrowers},(_,index)=>'X'+index)}),[{table:'Payments',key:'P1'}]),null,'more borrowers than the limit walk');
});

// R078 inline values (level 6): a delta's values travel with it within the caps; the manifest never changes.
test('inline values: every referenced value within the byte and count caps, none above them, the same manifest either way',async()=>{
 const {INLINE_VALUE_BYTES,INLINE_VALUE_COUNT}=await import('../../services/api/offline-dataset-delta.mjs');
 const chunk=rows=>({domain:'collection',businessDate:'2026-10-19',patches:[{key:'charges',mode:'replaceWhere',field:'borrowerId',values:['A'],value:rows,sort:'id'},{key:'items',mode:'replace',value:[]}]});
 const small=[{id:'c1',borrowerId:'A',businessDate:'2026-10-19'},{id:'c2',borrowerId:'A'}];
 const plainChunk=encodeDeltaChunk(chunk(small),[],{dates:true}),inline=encodeDeltaChunk(chunk(small),[],{dates:true,inline:true});
 assert.deepEqual(inline.patches,plainChunk.patches,'the manifest does not depend on inline');assert.deepEqual(plainChunk.values,{});
 assert.deepEqual(Object.keys(inline.values).sort(),[...new Set(inline.patches.flatMap(patch=>patch.refs))].sort(),'every referenced value inline');
 assert.equal(inline.values[inline.patches[0].refs[0]].businessDate,null,'inline values are the canonical (hashed) form');
 const need=encodeDeltaChunk(chunk(small),[inline.patches[0].refs[1]],{dates:true,inline:true});assert.deepEqual(Object.keys(need.values),[inline.patches[0].refs[1]],'a need request answers exactly what it names');
 const big=[{id:'big',borrowerId:'A',text:'x'.repeat(INLINE_VALUE_BYTES)}];assert.deepEqual(encodeDeltaChunk(chunk(big),[],{inline:true}).values,{},'above the byte cap: manifest + need');
 const many=Array.from({length:INLINE_VALUE_COUNT+1},(_,index)=>({id:'r'+index,borrowerId:'A'}));assert.deepEqual(encodeDeltaChunk(chunk(many),[],{inline:true}).values,{},'above the count cap: manifest + need');
 assert.equal(readDeltaRequest({inlineValues:true}).inlineValues,true);assert.throws(()=>readDeltaRequest({inlineValues:'yes'}),/invalid_request/);
});
