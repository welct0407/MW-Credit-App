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
 assert.deepEqual(readDeltaRequest({}),{cursor:null,need:[],sourceVersion:null,acceptChanged:false});
 assert.equal(readDeltaRequest({acceptChanged:true}).acceptChanged,true);
 for(const input of [null,[],{unknown:1},{acceptChanged:'yes'},{need:['invalid']},{need:['a'.repeat(64),'a'.repeat(64)]},{need:Array.from({length:2049},(_,i)=>i.toString(16).padStart(64,'0'))},{sourceVersion:'old'},{cursor:'+'.repeat(2)},{cursor:'a'.repeat(32769)}])assert.throws(()=>readDeltaRequest(input),/invalid_request/);
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

/** Synthetic records fixture: ~40 borrowers, ~60 loans, ~1.5k charges, ~300 payments,
 * answered by SQL shape only. Detail readers that return no row are retained as
 * unavailable by the phase, exactly as orphaned legacy records are. */
function syntheticRecordsClient({fingerprint='stable',onQuery}={}){
 const pad=(n)=>'synthetic-'+String(n).padStart(5,'0'),tables={Borrowers:40,Loans:60,Charges:1500,Payments:300,'Business Expenses':12};
 const ids=Object.fromEntries(Object.entries(tables).map(([table,count])=>[table,Array.from({length:count},(_,i)=>table.slice(0,2).toLowerCase()+pad(i))]));
 const idPage=(table,after,limit)=>ids[table].filter(id=>after===null||id>after).slice(0,limit).map(id=>({id}));
 const filler=id=>({id,notes:'x'.repeat(160),version:'f'.repeat(64)});
 const inner=(sql,args)=>{
  if(/pwa_\w+_version_v\d\(/.test(sql)&&!/FROM public\./.test(sql))return [{version:'f'.repeat(64)}];
  if(/pwa_effective_payment_plan/.test(sql))return [{value:null}];
  if(/WHERE \w+\."Row ID"=\(batch\.args->>0\)/.test(sql))return [filler(args[0])];
  return [];
 };
 return {query:async(sql,params=[])=>{onQuery?.(sql,params);
  if(sql.startsWith('SELECT to_char'))return {rows:[stamp]};
  if(sql.startsWith('SELECT (CURRENT_TIMESTAMP'))return {rows:[{day:stamp.businessDate,instant:stamp.asOf}]};
  if(sql.includes('string_agg(row_hash'))return {rows:[{relation:'Charges',fingerprint}]};
  const idRows=/^SELECT "Row ID" id FROM public\."([^"]+)" WHERE \(\$1::text IS NULL/.exec(sql);if(idRows)return {rows:idPage(idRows[1],params[0],params[1])};
  if(sql.includes('jsonb_array_elements($1::jsonb) WITH ORDINALITY')){const body=/FROM \((.*)\) source\) AS values/s.exec(sql)[1];const batches=JSON.parse(params[0]);return {rows:batches.map((args,i)=>({batchIndex:i+1,values:inner(body,args)}))}}
  if(sql.includes('"Borrower Note" note FROM public."Borrowers"'))return {rows:idPage('Borrowers',params[0],129).map(({id})=>({id,name:'B '+id,borrowerDisplayName:'B '+id+' - ',hasActiveLoan:true}))};
  if(sql.includes('FROM public."Loans" l JOIN public."Borrowers" b ON b."Row ID"=l."Ref Borrowers" WHERE b."Hidden Flag"'))return {rows:[]};
  if(sql.startsWith('WITH records AS'))return {rows:[]};
  if(sql.startsWith('SELECT 1 FROM public."Loans"'))return {rows:[{}],rowCount:1};
  const related=/FROM public\."(Charges|Payments)" \w WHERE \w\."Ref Loans?"=\$1/.exec(sql)??(/^SELECT p\."Row ID" id,p\."Payment Date"::text AS date/.test(sql)?[null,'Payments']:null);if(related){const [loanId,paged]=params,per=related[1]==='Charges'?25:5,index=ids.Loans.indexOf(loanId);return {rows:paged?[]:Array.from({length:per},(_,i)=>({id:related[1].slice(0,1)+loanId+'-'+i,date:'2026-10-0'+(1+index%9),principal:'10',interest:'1',remaining:'0',amount:'11',notes:null}))}}
  if(sql.includes('"Ref Preferred Receiving Cash Account"'))return {rows:[{name:'B',description:'d',preferred_account:null}]};
  if(sql.includes('AS blocked'))return {rows:[{blocked:false}]};
  if(sql.includes('AS invalid'))return {rows:[{invalid:false}]};
  if(sql.includes('CROSS JOIN LATERAL (SELECT coalesce(sum(r."Principal Paid"'))return {rows:[]};
  if(sql.includes('WITH groups AS'))return {rows:[]};
  if(sql.includes('a."Default Account"')||sql.includes('"Holder Name" AS "holderLabel"')||sql.includes('a."Account Label" AS label FROM public."Cash Accounts"'))return {rows:[]};
  if(sql.includes('"Borrower Name" label,"Description" description'))return {rows:idPage('Borrowers',params[0],129).map(({id})=>({id,label:'B',description:null}))};
  if(sql.includes('p."Ref Borrower" AS "borrowerId",(SELECT j.request_id'))return {rows:[]};
  if(sql.startsWith('SELECT DISTINCT "Pending Payment Amount"')){const keys=[...sql.matchAll(/AS "(\w+)"/g)].map(m=>m[1]);return {rows:[Object.fromEntries(keys.map(key=>[key,'0']))]}}
  if(sql.startsWith('SELECT "Operating Income MTD"'))return {rows:[{}]};
  if(sql.startsWith('SELECT "Ref Cash Account" id'))return {rows:[]};
  if(/AS day/.test(sql)&&sql.length<200)return {rows:[{day:stamp.businessDate}]};
  throw Error('Unexpected SQL: '+sql.slice(0,120));
 }};
}
async function walkRecords(client,request){
 const responses=[];let cursor=null,sourceVersion=request?.sourceVersion??null;
 for(let step=0;step<200;step++){const response=await readOfflineDatasetDelta(client,actor,'records',{cursor,need:[],sourceVersion,acceptChanged:true,...request});responses.push(response);if(response.complete)return responses;cursor=response.nextCursor}
 throw Error('Traversal did not complete');
}
test('packed records traversal walks the synthetic fixture in at most 15 responses with bounded bytes',async()=>{
 const client=syntheticRecordsClient();const dataPhases=[];
 const responses=await walkRecords(client);
 for(const response of responses){const bytes=Buffer.byteLength(JSON.stringify(response.patches));dataPhases.push(bytes);assert.ok(bytes<1024*1024,'response bytes '+bytes)}
 const charges=responses.flatMap(r=>r.patches.filter(p=>p.key==='charges')).reduce((sum,p)=>sum+p.refs.length,0);
 assert.equal(charges,1500);assert.ok(responses.length<=15,'responses: '+responses.length);
 const related=responses.flatMap(r=>r.patches.filter(p=>p.key==='loanRelated'&&p.path[1]==='charges'));assert.equal(related.length,60);
});
test('need replay returns identical manifests and values for the same packed cursor',async()=>{
 const first=await walkRecords(syntheticRecordsClient());const probe=first[1];
 const cursor=first[0].nextCursor,need=probe.patches.flatMap(p=>p.refs).slice(0,50);
 const a=await readOfflineDatasetDelta(syntheticRecordsClient(),actor,'records',{cursor,need,sourceVersion:null,acceptChanged:true});
 const b=await readOfflineDatasetDelta(syntheticRecordsClient(),actor,'records',{cursor,need,sourceVersion:null,acceptChanged:true});
 assert.deepEqual(a.patches,probe.patches);assert.deepEqual(a.patches,b.patches);assert.deepEqual(a.values,b.values);assert.equal(Object.keys(a.values).length,new Set(need).size);
});
test('torn completion keeps the bundle for accepting clients and still rejects legacy clients',async()=>{
 const previous=await readOfflineSourceVersion({query:async()=>({rows:[{relation:'Cash Ledger',fingerprint:'old'}]})},actor,'cash',stamp.businessDate);
 const inner={...readTraversalCursor(null,{actor,domain:'cash',...stamp,phases:3}),phase:2};
 const client={query:async query=>query.startsWith('SELECT to_char')?{rows:[stamp]}:query.includes('string_agg(row_hash')?{rows:[{relation:'Cash Ledger',fingerprint:'new'}]}:query.includes('Cash Account Daily Summary Recent')?{rows:[]}:(()=>{throw Error('Unexpected SQL')})()};
 const request={cursor:wrapDeltaCursor(encodeTraversalCursor(inner),previous),need:[],sourceVersion:previous};
 await assert.rejects(readOfflineDatasetDelta(client,actor,'cash',request),/dataset_changed/);
 const torn=await readOfflineDatasetDelta(client,actor,'cash',{...request,acceptChanged:true});
 assert.equal(torn.complete,true);assert.equal(torn.sourceVersion,null);assert.equal(torn.changed,true);assert.equal(torn.nextCursor,null);assert.equal(torn.schemaVersion,3);
});
