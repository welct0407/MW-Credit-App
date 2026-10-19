import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {canonicalDeltaValue,deltaValueHash,readDeltaRequest,encodeDeltaChunk,readDeltaCursor,wrapDeltaCursor} from '../../services/api/offline-dataset-delta.mjs';
import {readTraversalCursor,encodeTraversalCursor} from '../../services/api/offline-dataset-cursor.mjs';
import {readOfflineSourceVersion,readOfflineSourceVersions,readOfflineDatasetDelta,offlineSourceTables,offlineDeterministicPages,readChangedRows} from '../../services/business/offline-dataset-delta.mjs';
import {readOfflineDatasetChunk,MAX_CHUNK_VALUES} from '../../services/business/offline-dataset-chunks.mjs';
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
 assert.deepEqual(readDeltaRequest({}),{cursor:null,need:[],sourceVersion:null,acceptChanged:false,versions:false,since:null,reconcile:false,digests:null,dates:false});
 assert.equal(readDeltaRequest({dates:true}).dates,true);assert.throws(()=>readDeltaRequest({dates:'yes'}),/invalid_request/);
 assert.equal(readDeltaRequest({versions:true}).versions,true);
 assert.equal(readDeltaRequest({acceptChanged:true}).acceptChanged,true);
 for(const input of [null,[],{unknown:1},{acceptChanged:'yes'},{versions:1},{need:['invalid']},{need:['a'.repeat(64),'a'.repeat(64)]},{need:Array.from({length:2049},(_,i)=>i.toString(16).padStart(64,'0'))},{sourceVersion:'old'},{cursor:'+'.repeat(2)},{cursor:'a'.repeat(32769)}])assert.throws(()=>readDeltaRequest(input),/invalid_request/);
 const wrapped=wrapDeltaCursor('inner','a'.repeat(64));assert.deepEqual(readDeltaCursor(wrapped),{v:3,sourceVersion:'a'.repeat(64),inner:'inner'});assert.throws(()=>readDeltaCursor(wrapped+'='),/invalid_request/);
});
test('unchanged source gate runs raw fingerprints only, actor/date changes force a new checkpoint',async()=>{
 let providerReads=0,sql='';const client={query:async query=>{if(query.startsWith('SELECT to_char'))return{rows:[stamp]};if(query.includes('pwa_row_changes'))return{rows:[{available:false}]};if(query.includes('AS fingerprint')){sql=query;return{rows:[{relation:'Loans',fingerprint:'stable'}]}}providerReads++;throw Error('Unexpected provider read')}};
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
 const client={query:async query=>query.startsWith('SELECT to_char')?{rows:[stamp]}:query.includes('AS fingerprint')?{rows:[{relation:'Cash Ledger',fingerprint:'new'}]}:query.includes('Cash Account Daily Summary Recent')?{rows:[]}:(()=>{throw Error('Unexpected SQL')})()};
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
  if(sql.includes('pwa_row_changes'))return {rows:[{available:false}]};
  if(sql.startsWith('SELECT (CURRENT_TIMESTAMP'))return {rows:[{day:stamp.businessDate,instant:stamp.asOf}]};
  if(sql.includes('AS fingerprint'))return {rows:[{relation:'Charges',fingerprint}]};
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
 const client={query:async query=>query.startsWith('SELECT to_char')?{rows:[stamp]}:query.includes('AS fingerprint')?{rows:[{relation:'Cash Ledger',fingerprint:'new'}]}:query.includes('Cash Account Daily Summary Recent')?{rows:[]}:(()=>{throw Error('Unexpected SQL')})()};
 const request={cursor:wrapDeltaCursor(encodeTraversalCursor(inner),previous),need:[],sourceVersion:previous};
 await assert.rejects(readOfflineDatasetDelta(client,actor,'cash',request),/dataset_changed/);
 const torn=await readOfflineDatasetDelta(client,actor,'cash',{...request,acceptChanged:true});
 assert.equal(torn.complete,true);assert.equal(torn.sourceVersion,null);assert.equal(torn.changed,true);assert.equal(torn.nextCursor,null);assert.equal(torn.schemaVersion,3);
});

test('every packed response stays within the need cap and its full need request is accepted',async()=>{
 // Large change: no local content at all, so every referenced hash would be requested.
 const client=syntheticRecordsClient();let cursor=null;const sizes=[];
 for(let step=0;step<200;step++){
  const response=await readOfflineDatasetDelta(client,actor,'records',{cursor,need:[],sourceVersion:null,acceptChanged:true});
  const refs=response.patches.flatMap(patch=>patch.refs),need=[...new Set(refs)];sizes.push(refs.length);
  assert.ok(refs.length<=2048,'response refs '+refs.length);
  const fetched=await readOfflineDatasetDelta(syntheticRecordsClient(),actor,'records',{cursor,need,sourceVersion:null,acceptChanged:true});
  assert.deepEqual(fetched.patches,response.patches);assert.equal(Object.keys(fetched.values).length,need.length);
  if(response.complete)break;cursor=response.nextCursor;
 }
 assert.ok(sizes.length<=15,'responses '+sizes.length);assert.ok(Math.max(...sizes)>1024,'fixture is large enough to exercise the cap: '+Math.max(...sizes));
});

// R078 items 3–4: per-domain source tables and the cheap (key, xmin) fingerprint.
test('per-domain source sets keep every table a domain reads and leave out analytics-only tables',()=>{
 const has=(domain,source)=>offlineSourceTables[domain].includes(source);
 for(const domain of ['records','collection','cash','management'])for(const source of ['Cash Account Daily Analytics','r005_cash_cutover_sources'])assert.equal(has(domain,source),false,domain+' '+source);
 // The records dashboard reads olap_portfolio_summary: Statistics by row identity, Daily Analytics by content.
 for(const source of ['Borrowers','Loans','Charges','Payments','Payment Allocations','Repayments','Business Expenses','Cash Accounts','Cash Holders','Cash Ledger','Cash Pool Contributions','Settlements','Partners','r008_cash_account_cutover','pwa_payment_commands','Statistics#identity','Daily Analytics#content'])assert.ok(has('records',source),source);
 assert.equal(has('records','Statistics'),false);assert.equal(has('records','Daily Analytics'),false);
 assert.deepEqual([...offlineSourceTables.collection].sort(),['Borrowers','Cash Accounts','Charges','Loans','Payment Allocations','Payments','Repayments']);
 for(const source of ['Cash Statement Context','Borrowers','Cash Ledger','r008_cash_account_cutover'])assert.ok(has('cash',source),source);
 for(const source of ['Daily Analytics','Statistics','Loan Assessment SQL Lab','Charges',...offlineSourceTables.cash])assert.ok(has('management',source),source);
 for(const domain of ['collection','cash'])for(const source of ['Daily Analytics','Statistics','pwa_payment_commands'])assert.equal(offlineSourceTables[domain].some(item=>item.startsWith(source)),false,domain+' '+source);
});
test('fingerprint SQL keys each table by its primary key, aggregates without a sort and runs once for all domains',async()=>{
 const sql=[];const client={query:async query=>{sql.push(query);return {rows:query.split(' UNION ALL ').map(part=>({relation:/^SELECT '([^']+)'/.exec(part)[1],fingerprint:'1:42'}))}}};
 const versions=await readOfflineSourceVersions(client,actor,stamp.businessDate);
 assert.equal(sql.length,1);const query=sql[0];
 assert.doesNotMatch(query,/ORDER BY|string_agg|to_jsonb\(s\)::text\|\|/);assert.match(query,/hashtextextended\(s\."Row ID"::text\|\|':'\|\|s\.xmin::text,0\)/);
 assert.match(query,/s\.request_id::text\|\|':'\|\|s\.xmin::text[\s\S]*FROM public\."pwa_payment_commands" s/);
 assert.match(query,/s\."Ref Cash Account"::text\|\|':'\|\|s\.xmin::text[\s\S]*FROM public\."r008_cash_account_cutover" s/);
 assert.match(query,/s\."Ref Partner"::text\|\|':'\|\|s\.xmin::text[\s\S]*FROM public\."Cash Statement Context" s/);
 assert.match(query,/'Statistics#identity'[\s\S]*coalesce\(s\."Statistics ID"::text,''\)[\s\S]*FROM public\."Statistics" s(?! WHERE)/);
 assert.match(query,/'Daily Analytics#content'[\s\S]*\(to_jsonb\(s\)-'Generated At'\)::text[\s\S]*FROM public\."Daily Analytics" s WHERE s\."Snapshot Date">=/);
 assert.equal(query.split(' UNION ALL ').length,new Set(Object.values(offlineSourceTables).flat()).size);
 for(const domain of ['records','collection','cash','management'])assert.equal(versions[domain],await readOfflineSourceVersion(client,actor,domain,stamp.businessDate),domain);
 assert.equal(new Set(Object.values(versions)).size,4);
});
test('analytics-only changes leave records, collection and cash unchanged while management sees them',async()=>{
 let fingerprints={};const client={query:async query=>({rows:query.split(' UNION ALL ').map(part=>{const relation=/^SELECT '([^']+)'/.exec(part)[1];return {relation,fingerprint:fingerprints[relation]??'1:1'}})})};
 const before=await readOfflineSourceVersions(client,actor,stamp.businessDate);
 fingerprints={Statistics:'1:2','Daily Analytics':'31:5'};const after=await readOfflineSourceVersions(client,actor,stamp.businessDate);
 assert.deepEqual(Object.fromEntries(Object.keys(before).map(domain=>[domain,before[domain]!==after[domain]])),{records:false,collection:false,cash:false,management:true});
 fingerprints={'Daily Analytics#content':'31:6'};assert.notEqual((await readOfflineSourceVersions(client,actor,stamp.businessDate)).records,before.records);
 fingerprints={Payments:'2:3'};const payment=await readOfflineSourceVersions(client,actor,stamp.businessDate);for(const domain of Object.keys(before))assert.notEqual(payment[domain],before[domain],domain);
});
test('a starting check asking for versions gets every domain from one fingerprint statement and an unchanged answer',async()=>{
 let fingerprintQueries=0;const client={query:async query=>{if(query.startsWith('SELECT to_char'))return {rows:[stamp]};if(query.includes('pwa_row_changes'))return {rows:[{available:false}]};if(query.includes('AS fingerprint')){fingerprintQueries++;return {rows:query.split(' UNION ALL ').map(part=>({relation:/^SELECT '([^']+)'/.exec(part)[1],fingerprint:'1:7'}))}}throw Error('Unexpected provider read')}};
 const versions=await readOfflineSourceVersions(client,actor,stamp.businessDate);fingerprintQueries=0;
 const result=await readOfflineDatasetDelta(client,actor,'records',{cursor:null,need:[],sourceVersion:versions.records,acceptChanged:true,versions:true});
 assert.equal(result.unchanged,true);assert.deepEqual(result.versions,versions);assert.equal(result.sourceVersion,versions.records);assert.equal(fingerprintQueries,1);
 const plain=await readOfflineDatasetDelta(client,actor,'cash',{cursor:null,need:[],sourceVersion:versions.cash});assert.equal(plain.unchanged,true);assert.equal(plain.versions,undefined);
 await assert.rejects(readOfflineDatasetDelta(client,actor,'notifications',{}),/invalid_request/);
});
test('cash statements pack 16 account-day pages per request inside the value budget',async()=>{
 assert.deepEqual(offlineDeterministicPages,{records:32,collection:2,cash:16,management:8});
 const days=Array.from({length:40},(_,i)=>({accountId:'account-'+String(Math.floor(i/10)).padStart(2,'0'),date:'2026-10-'+String(1+i%10).padStart(2,'0')}));
 const client={query:async(sql,params)=>{
  if(sql.startsWith('SELECT to_char'))return {rows:[stamp]};
  if(sql.includes('ORDER BY "Ref Cash Account" COLLATE "C","Statement Date" LIMIT 1')){const [account,date]=params;return {rows:days.filter(day=>account===null||day.accountId>account||day.accountId===account&&day.date>date).slice(0,1)}}
  if(sql.includes('"Ref Cash Account"=$1 AND "Statement Date"=$2::date'))return {rows:[{date:params[1],openingBalance:'0',moneyIn:'1',moneyOut:'0',netMovement:'1',closingBalance:'1',transactionCount:'3',initialized:true}]};
  if(sql.includes('"Sort Timestamp"'))return {rows:[0,1,2].map(n=>({id:'ledger'+n,ledgerId:'ledger'+n,direction:'IN',timestamp:'2026-10-01 10:00:0'+n,amount:'1'}))};
  throw Error('Unexpected SQL: '+sql.slice(0,80));
 }};
 let cursor=encodeTraversalCursor({...readTraversalCursor(null,{actor,domain:'cash',...stamp,phases:3}),phase:2}),requests=0,statements=0;
 for(;;){const chunk=await readOfflineDatasetChunk(client,actor,'cash',cursor,{deterministicPages:offlineDeterministicPages.cash});requests++;
  const values=chunk.patches.reduce((sum,patch)=>sum+(patch.mode==='append'?patch.value.length:1),0);assert.ok(values<=MAX_CHUNK_VALUES);assert.ok(Buffer.byteLength(JSON.stringify(chunk.patches))<1024*1024);
  statements+=chunk.patches.filter(patch=>patch.mode==='replace').length;if(chunk.complete)break;cursor=chunk.nextCursor;assert.ok(requests<20)}
 assert.equal(statements,40);assert.equal(requests,3);
});

// R078 protocol v4 contract pieces (the real SQL path runs in tests/integration/offline-delta-v4-lab.test.mjs).
test('v4 request cursor, upsert/remove encoding and the cursor continuation rules',async()=>{
 const since={seq:'10',xmin:'500',businessDate:'2026-10-14'};
 assert.deepEqual(readDeltaRequest({since}).since,since);
 for(const bad of [{seq:10,xmin:'1',businessDate:'2026-10-14'},{seq:'01',xmin:'1',businessDate:'2026-10-14'},{seq:'1',xmin:'1'},{seq:'1',xmin:'1',businessDate:'14/10/2026'},{seq:'1',xmin:'1',businessDate:'2026-10-14',extra:1},[]])assert.throws(()=>readDeltaRequest({since:bad}),/invalid_request/,JSON.stringify(bad));
 const encoded=encodeDeltaChunk({patches:[{key:'payments',mode:'upsert',value:[{id:'a'},{id:'b'}]},{key:'paymentMonths',mode:'remove',by:'borrowerId',value:['b1',null]}]});
 assert.equal(encoded.patches[0].refs.length,2);assert.equal(encoded.patches[1].refs.length,1);assert.equal(encoded.patches[1].by,'borrowerId');
 let sql=null;const client={query:async(query,params)=>{sql={query,params};return {rows:[{table:'Payments',key:'p1'}]}}};
 const current={seq:'20',xmin:'600',businessDate:'2026-10-14',minSeq:'5'};
 assert.deepEqual(await readChangedRows(client,'records',since,current),[{table:'Payments',key:'p1'}]);
 assert.match(sql.query,/seq>\$2::bigint OR txid>=\$3::xid8/);assert.deepEqual(sql.params.slice(1,3),['10','500']);assert.ok(sql.params[0].includes('pwa_payment_commands')&&!sql.params[0].includes('Statistics#identity'));
 // A day change, a cursor ahead of the log (another database) or behind its retention cannot continue.
 for(const [cursor,log] of [[{...since,businessDate:'2026-10-13'},current],[{...since,seq:'21'},current],[{...since,seq:'3'},current],[since,null]])assert.equal(await readChangedRows(client,'records',cursor,log),null);
 assert.equal(await readChangedRows({query:async()=>({rows:Array.from({length:3},(_,i)=>({table:'Payments',key:'p'+i}))})},'records',since,current,2),null,'over the size bound');
 assert.equal(await readChangedRows({query:async()=>({rows:[{table:'Payments',key:'p1'},{table:'Daily Analytics',key:'*'}]})},'records',since,current),null,'a TRUNCATE marker walks');
});
test('a targeted delta stops at its limits while it is built',async()=>{
 const {readRecordsTargeted,TARGETED_LIMITS}=await import('../../services/business/offline-dataset-chunks.mjs');
 const loans=Array.from({length:TARGETED_LIMITS.loans+1},(_,i)=>({id:'L'+i}));let queries=0;
 const client={query:async sql=>{queries++;if(sql.includes('FROM public."Loans" WHERE "Ref Borrowers"'))return {rows:loans};throw Error('read after the limit: '+sql.slice(0,60))}};
 await assert.rejects(readRecordsTargeted(client,actor,stamp,{borrowers:['B'],payments:[],expenses:[],dashboard:true}),/targeted_limit/);assert.equal(queries,1);
});
