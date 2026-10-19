import test from 'node:test';
import assert from 'node:assert/strict';
import * as shared from '../../services/lib/offline-dataset-digest.mjs';

// R078: the shared patch application (services/lib/offline-dataset-digest.mjs) keeps a v4 delta byte-equal to a walk (row order) and refuses moved rows.
const {applyDatasetPatch,deltaMovesRows,codePointCompare}=shared,plain=value=>JSON.parse(JSON.stringify(value));
test('code point order matches PostgreSQL COLLATE "C" (UTF-8 bytes), not UTF-16 units',()=>{
 assert.ok(codePointCompare('B','a')<0);assert.ok(codePointCompare('a','ab')<0);assert.equal(codePointCompare('x','x'),0);
 assert.ok(codePointCompare('￿','\u{10000}')<0,'a supplementary character sorts after U+FFFF as in UTF-8');
});
test('upsert keeps the walk order by id; remove drops rows by id, by field or object keys',()=>{
 const data={payments:[{id:'p1'},{id:'p3'}],months:[{borrowerId:'b1',m:1},{borrowerId:null,m:2}],related:{L1:{},L2:{}}};
 applyDatasetPatch(data,{key:'payments',mode:'upsert',order:'id',value:[{id:'p2'},{id:'p3',changed:true},{id:'P0'}]});
 assert.deepEqual(plain(data.payments),[{id:'P0'},{id:'p1'},{id:'p2'},{id:'p3',changed:true}]);
 applyDatasetPatch(data,{key:'months',mode:'remove',by:'borrowerId',value:[null]});assert.deepEqual(plain(data.months),[{borrowerId:'b1',m:1}]);
 applyDatasetPatch(data,{key:'related',mode:'remove',value:['L1','__proto__']});assert.deepEqual(Object.keys(data.related),['L2']);
 applyDatasetPatch(data,{key:'payments',mode:'upsert',value:[{id:'a'}]});assert.equal(data.payments.at(-1).id,'a','no order named: appended');
 for(const bad of [{key:'payments',mode:'upsert',value:[{}]},{key:'payments',mode:'upsert',order:'name',value:[]},{key:'months',mode:'remove',by:'a.b',value:[]},{key:'__proto__',mode:'replace',value:1},{key:'x',mode:'other',value:1}])assert.throws(()=>applyDatasetPatch(data,bad),/Invalid dataset patch/);
});
test('a delta re-sending a row with another owner, target or charge set is refused (walk)',()=>{
 const data={loans:[{id:'L',borrowerId:'A'}],charges:[{id:'C',loanId:'L',borrowerId:'A'}],payments:[{id:'P',borrowerId:'A',targetLoanId:null,targetChargeId:null,allocations:[{chargeId:'C'}],repayments:[{chargeId:'C'}]}]};
 assert.equal(deltaMovesRows(data,[{key:'loans',mode:'upsert',value:[{id:'L',borrowerId:'A',principal:'9'}]},{key:'loans',mode:'upsert',value:[{id:'new',borrowerId:'B'}]}]),false);
 assert.equal(deltaMovesRows(data,[{key:'loans',mode:'upsert',value:[{id:'L',borrowerId:'B'}]}]),true);
 assert.equal(deltaMovesRows(data,[{key:'charges',mode:'upsert',value:[{id:'C',loanId:'L2',borrowerId:'A'}]}]),true);
 for(const change of [{borrowerId:'B'},{targetLoanId:'L'},{repayments:[{chargeId:'D'}]},{allocations:[]}])assert.equal(deltaMovesRows(data,[{key:'payments',mode:'upsert',value:[{...data.payments[0],...change}]}]),true,JSON.stringify(change));
 assert.equal(deltaMovesRows(data,[{key:'payments',mode:'upsert',value:[{...data.payments[0],notes:'edited'}]}]),false);
});
test('reconciliation digests: canonical form, one digest per key, and the differing key names',async()=>{
 const {canonicalDatasetValue,datasetDigests,digestDifferences}=shared,sha=text=>import('node:crypto').then(({createHash})=>createHash('sha256').update(text).digest('hex'));
 const at=new Date('2026-10-19T01:00:00.000Z');
 assert.deepEqual(canonicalDatasetValue({b:1,a:{asOf:'2026-10-19T00:00:00Z',when:at,z:[{y:2,x:1}]}}),{a:{asOf:null,when:'2026-10-19T01:00:00.000Z',z:[{x:1,y:2}]},b:1});
 const stored={payments:[{id:'p1',amount:'10',asOf:'2026-10-19T00:00:00Z'}],dashboard:{total:'5'}},server={dashboard:{total:'5'},payments:[{amount:'10',id:'p1',asOf:'2026-10-19T09:00:00Z'}]};
 const left=await datasetDigests(stored,sha),right=await datasetDigests(server,sha);
 assert.deepEqual(Object.keys(left.keys),['dashboard','payments']);assert.equal(left.digest,right.digest,'key order and read time do not matter');assert.deepEqual(digestDifferences(left,right),[]);
 const changed=await datasetDigests({...server,payments:[{id:'p1',amount:'11'}]},sha);assert.deepEqual(digestDifferences(left,changed),['payments']);assert.notEqual(left.digest,changed.digest);
 assert.deepEqual(digestDifferences(left,await datasetDigests({dashboard:{total:'5'}},sha)),['payments'],'a missing key is a difference');
 assert.ok(/^[a-f0-9]{64}$/.test(left.keys.payments));
});
