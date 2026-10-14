import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {canonicalDeltaValue,deltaValueHash,readDeltaRequest,encodeDeltaChunk,readDeltaCursor,wrapDeltaCursor} from '../../services/api/offline-dataset-delta.mjs';
import {readTraversalCursor,encodeTraversalCursor} from '../../services/api/offline-dataset-cursor.mjs';
import {readOfflineSourceVersion,readOfflineDatasetDelta} from '../../services/business/offline-dataset-delta.mjs';
import {createPaymentCommandHandler} from '../../services/payment-command/handler.mjs';

const actor={issuer:'synthetic',subject:'owner',partnerId:'owner-partner'},stamp={asOf:'2026-10-14T01:00:00.000Z',businessDate:'2026-10-14'};
test('PostgreSQL timestamp Date values retain ordinary JSON wire semantics',()=>{
 const value={receiptAt:new Date(stamp.asOf),asOf:new Date(stamp.asOf),nested:[{createdAt:new Date(stamp.asOf)}]};
 assert.deepEqual(canonicalDeltaValue(value),{asOf:null,nested:[{createdAt:stamp.asOf}],receiptAt:stamp.asOf});
 assert.equal(deltaValueHash(value),deltaValueHash(JSON.parse(JSON.stringify(value))));
});
test('delta manifests retain page order, exclude fresh read timestamps and transfer only requested changed values',()=>{
 const before={id:'a',amount:'100',asOf:stamp.asOf},same={asOf:'2026-10-14T02:00:00.000Z',amount:'100',id:'a'},changed={id:'b',amount:'105'};
 assert.equal(deltaValueHash(before),deltaValueHash(same));assert.notEqual(deltaValueHash(before),deltaValueHash({...same,amount:'101'}));
 const input={schemaVersion:2,patches:[{key:'items',mode:'append',value:[same,changed]},{key:'dashboard',mode:'replace',value:{asOf:stamp.asOf,total:'205'}}],complete:false,nextCursor:'next'};
 const manifest=encodeDeltaChunk(input);assert.deepEqual(manifest.values,{});assert.deepEqual(manifest.patches[0].refs,[deltaValueHash(before),deltaValueHash(changed)]);
 const fetched=encodeDeltaChunk(input,[deltaValueHash(changed)]);assert.deepEqual(fetched.values,{[deltaValueHash(changed)]:canonicalDeltaValue(changed)});assert.deepEqual(fetched.patches,manifest.patches);
 assert.equal(JSON.stringify(fetched.values).includes('100'),false);
});
test('delta request and traversal bounds reject malformed, duplicate and oversized inventories',()=>{
 assert.deepEqual(readDeltaRequest({}),{cursor:null,need:[],sourceVersion:null});
 for(const input of [null,[],{unknown:1},{need:['invalid']},{need:['a'.repeat(64),'a'.repeat(64)]},{need:Array.from({length:2049},(_,i)=>i.toString(16).padStart(64,'0'))},{sourceVersion:'old'},{cursor:'+'.repeat(2)},{cursor:'a'.repeat(32769)}])assert.throws(()=>readDeltaRequest(input),/invalid_request/);
 const wrapped=wrapDeltaCursor('inner','a'.repeat(64));assert.deepEqual(readDeltaCursor(wrapped),{v:3,sourceVersion:'a'.repeat(64),inner:'inner'});assert.throws(()=>readDeltaCursor(wrapped+'='),/invalid_request/);
});
test('unchanged source gate runs raw fingerprints only, actor/date changes force a new checkpoint',async()=>{
 let providerReads=0,sql='';const client={query:async query=>{if(query.startsWith('SELECT to_char'))return{rows:[stamp]};if(query.includes('string_agg(row_hash')){sql=query;return{rows:[{relation:'Loans',fingerprint:'stable'}]}}providerReads++;throw Error('Unexpected provider read')}};
 const source=await readOfflineSourceVersion(client,actor,'records',stamp.businessDate);
 const result=await readOfflineDatasetDelta(client,actor,'records',{cursor:null,need:[],sourceVersion:source});
 assert.equal(result.unchanged,true);assert.equal(result.sourceVersion,source);assert.deepEqual(result.values,{});assert.equal(providerReads,0);
 assert.match(sql,/s\.xmin/);assert.match(sql,/"pwa_payment_commands"/);assert.doesNotMatch(sql,/pwa_notification|pwa_push|pg_stat|last_seen/i);
 assert.notEqual(source,await readOfflineSourceVersion(client,{...actor,subject:'other'},'records',stamp.businessDate));assert.notEqual(source,await readOfflineSourceVersion(client,actor,'records','2026-10-15'));
});
test('source fingerprint ordering is stable and detects direct updates/deletions independently of journal IDs',async()=>{
 let rows=[{relation:'Loans',fingerprint:'one'},{relation:'Borrowers',fingerprint:'two'}];const client={query:async()=>({rows:[...rows]})};
 const first=await readOfflineSourceVersion(client,actor,'collection',stamp.businessDate);rows.reverse();assert.equal(first,await readOfflineSourceVersion(client,actor,'collection',stamp.businessDate));
 rows=[{relation:'Loans',fingerprint:'one'},{relation:'Borrowers',fingerprint:'updated'}];assert.notEqual(first,await readOfflineSourceVersion(client,actor,'collection',stamp.businessDate));
 rows=[{relation:'Loans',fingerprint:'empty'},{relation:'Borrowers',fingerprint:'two'}];assert.notEqual(first,await readOfflineSourceVersion(client,actor,'collection',stamp.businessDate));
});
test('completion rejects a source mutation during a resumable traversal',async()=>{
 const previous=await readOfflineSourceVersion({query:async()=>({rows:[{relation:'Cash Ledger',fingerprint:'old'}]})},actor,'cash',stamp.businessDate);
 const inner={...readTraversalCursor(null,{actor,domain:'cash',...stamp,phases:3}),phase:2};
 const client={query:async query=>query.startsWith('SELECT to_char')?{rows:[stamp]}:query.includes('string_agg(row_hash')?{rows:[{relation:'Cash Ledger',fingerprint:'new'}]}:query.includes('Cash Account Daily Summary Recent')?{rows:[]}:(()=>{throw Error('Unexpected SQL')})()};
 await assert.rejects(readOfflineDatasetDelta(client,actor,'cash',{cursor:wrapDeltaCursor(encodeTraversalCursor(inner),previous),need:[],sourceVersion:previous}),/dataset_changed/);
});
test('protocol3 HTTP is authenticated JSON POST while protocol2 remains GET',async()=>{
 let calls=0,last;const handler=createPaymentCommandHandler({origins:['http://127.0.0.1:9876'],verifyPrincipal:async token=>token==='Bearer synthetic'?{ok:true,subject:'owner'}:{ok:false,status:401,code:'sign_in_required'},store:{offlineDataset:async(...args)=>{calls++;last=args;return{ok:true,status:200,schemaVersion:3,complete:true}}}});
 const server=createServer((req,res)=>void handler(req,res));await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
 try{
  const path='/api/offline-dataset?domain=records&protocol=3',headers={Authorization:'Bearer synthetic','Content-Type':'application/json'};
  assert.equal((await fetch(origin+path,{method:'POST',headers,body:JSON.stringify({cursor:null,need:[],sourceVersion:null})})).status,200);assert.equal(last[3].protocol,3);assert.deepEqual(last[3].input,{cursor:null,need:[],sourceVersion:null});
  assert.equal((await fetch(origin+path,{headers})).status,405);assert.equal((await fetch(origin+path,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,401);
  assert.equal((await fetch(origin+path+'&cursor=abc',{method:'POST',headers,body:'{}'})).status,400);assert.equal((await fetch(origin+path,{method:'POST',headers,body:'{'})).status,400);assert.equal(calls,1);
  assert.equal((await fetch(origin+'/api/offline-dataset?domain=records&protocol=2',{headers})).status,200);assert.equal(last[3].protocol,2);
 }finally{await new Promise(resolve=>server.close(resolve))}
});
