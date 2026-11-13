import test from 'node:test';import assert from 'node:assert/strict';
import {createReadHandler} from '../../services/api/read-handler.mjs';
import {createBorrowerReadStore} from '../../services/api/borrower-read-store.mjs';
import {encodeCollectionCursor,decodeCollectionCursor,projectCollection} from '../../services/api/collection-read-contract.mjs';
const config={ownerEmail:'owner@example.test',origins:['https://client.example.test']};
const board={kind:'collection',businessDate:'2026-10-07',rank:0,days:0,name:'Name',id:'a'};const child={kind:'collection-charges',businessDate:'2026-10-07',parentId:'p',chargeDate:'2026-10-07',id:'c'};
test('Collection canonical cursor rejects kind parent date rank extra-field and obsolete substitution',()=>{const b=encodeCollectionCursor(board),c=encodeCollectionCursor(child);assert.equal(decodeCollectionCursor(b,'collection').id,'a');assert.equal(decodeCollectionCursor(c,'collection-charges','p').id,'c');for(const [cursor,kind,parent] of [[b,'collection-charges','p'],[c,'collection'],[c,'collection-charges','other'],[b+'=','collection'],[Buffer.from(JSON.stringify({...board,v:2})).toString('base64url'),'collection'],[Buffer.from(JSON.stringify({...board,v:4,days:undefined,queryHash:JSON.parse(Buffer.from(b,'base64url').toString()).queryHash})).toString('base64url'),'collection'],[Buffer.from(JSON.stringify({...board,v:3,queryHash:JSON.parse(Buffer.from(b,'base64url').toString()).queryHash})).toString('base64url'),'collection'],[Buffer.from(JSON.stringify({...board,v:1,extra:true})).toString('base64url'),'collection']])assert.throws(()=>decodeCollectionCursor(cursor,kind,parent));for(const value of [{...board,businessDate:'0000-01-01'},{...child,chargeDate:'0000-01-01'},{...board,rank:5},{...board,days:undefined},{...board,days:3},{...board,rank:3,days:0},{...board,rank:3,days:-8},{...board,rank:3,days:8.5},{...board,businessDate:'2026-02-30'},{...child,chargeDate:null}])assert.throws(()=>encodeCollectionCursor(value))});
async function request(handler,url,method='GET'){let status,body;await handler({method,url,headers:{authorization:'Bearer synthetic'}},{setHeader(){},set statusCode(v){status=v},end(v){body=v?JSON.parse(v):null}});return{status,body}}
test('Collection auth denial and invalid HTTP inputs never call business store',async()=>{let calls=0;const store={listCollection:async()=>{calls++;return{ok:true}},getCollectionCharges:async()=>{calls++;return{ok:true}}};for(const code of ['sign_in_required','session_invalid','access_denied']){const h=createReadHandler({config,store,verifyPrincipal:async()=>({ok:false,status:code==='access_denied'?403:401,code})});for(const url of ['/api/collection','/api/collection/p/charges'])assert.equal((await request(h,url)).body.code,code)}const h=createReadHandler({config,store,verifyPrincipal:async()=>({ok:true,email:config.ownerEmail})});for(const url of ['/api/collection?businessDate=2026-01-01','/api/collection?status=paid','/api/collection?limit=2&limit=3','/api/collection?limit=-1','/api/collection/%ZZ/charges','/api/collection/p/charges?cursor=a&cursor=b'])assert.equal((await request(h,url)).status,400);assert.equal((await request(h,'/api/collection','POST')).status,405);assert.equal(calls,0)});
test('Collection invalid bounded store requests reject without database connection and projections exclude extras',async()=>{let connects=0;const store=createBorrowerReadStore({config,pool:{connect:async()=>{connects++;throw Error()}}});for(const options of [{limit:0},{limit:101},{limit:1.5},{cursor:'%%%'}])assert.equal((await store.listCollection(config.ownerEmail,options)).status,400);assert.equal((await store.getCollectionCharges(config.ownerEmail,'other',{cursor:encodeCollectionCursor(child)})).status,400);assert.equal(connects,0);const value=projectCollection({id:'a',rank:3,overdue_days:12,borrower_name:'Name',borrower_description:'English',amount_due:'0',amount_collected:'-1.01',amount_remaining:null,prepaid_today:'100.25',prepaid_only:true,privateBank:'never'});assert.equal(value.amountCollected,'-1.01');assert.equal(value.prepaidToday,'100.25');assert.equal(value.prepaidOnly,true);assert.equal(JSON.stringify(value).includes('never'),false);assert.equal(Object.keys(value).length,9);assert.equal(value.status,'long_overdue');assert.equal(value.overdueDays,12);for(const bad of [{prepaid_only:null},{prepaid_only:'true'},{prepaid_today:'x'},{overdue_days:undefined},{overdue_days:0},{overdue_days:-3},{overdue_days:'8'},{overdue_days:1.5},{rank:5}])assert.throws(()=>projectCollection({id:'a',rank:3,overdue_days:null,borrower_name:'Name',amount_due:'0',amount_collected:'0',amount_remaining:'0',prepaid_today:'0',prepaid_only:false,...bad}),/Invalid collection/)});
test('R102/R137 Collection status order puts long_overdue between overdue and fully_paid; cursor v5 carries rank 4 and the long overdue days key',async()=>{const {collectionStatuses,LONG_OVERDUE_SINCE_PAYMENT_DAYS,NON_CASH_PAYMENT_METHODS,collectionCte}=await import('../../services/api/collection-read-contract.mjs');assert.deepEqual(collectionStatuses,['not_paid','partially_paid','overdue','long_overdue','fully_paid']);assert.equal(LONG_OVERDUE_SINCE_PAYMENT_DAYS,8);assert.deepEqual(NON_CASH_PAYMENT_METHODS,['Referral Rebate Offset','Net-off at Disbursement']);
 // R137: rank 3 = an unpaid past-due charge and 8 or more days since the last payment, else since the first charge.
 assert.match(collectionCte,/charge_date < \$1::date AND payment_status <> 'ชำระแล้ว'\) > 0\s+AND \$1::date - COALESCE\(last_paid, first_due\) >= 8 THEN 3/);
 assert.match(collectionCte,/p\."Payment Method" IS DISTINCT FROM 'Referral Rebate Offset' AND p\."Payment Method" IS DISTINCT FROM 'Net-off at Disbursement'/);
 assert.match(collectionCte,/JOIN public\."Payments" p ON p\."Row ID" = r\."Ref Payment"/);assert.match(collectionCte,/r\."Payment Date" <= \$1::date/);
 assert.match(collectionCte,/NOT starts_with\(fc\."Row ID", 'df10:'\)/);assert.doesNotMatch(collectionCte,/\$1::date - 7\b/);
 assert.match(collectionCte,/AS overdue_days/);const cursor=encodeCollectionCursor({...board,rank:4});assert.equal(JSON.parse(Buffer.from(cursor,'base64url').toString()).v,5);assert.equal(decodeCollectionCursor(cursor,'collection').rank,4);const long=encodeCollectionCursor({...board,rank:3,days:19});assert.deepEqual([decodeCollectionCursor(long,'collection').rank,decodeCollectionCursor(long,'collection').days],[3,19]);assert.match(collectionCte,/CASE WHEN rank = 3 THEN since_days ELSE 0 END AS sort_days/);const none=projectCollection({id:'b',rank:4,overdue_days:null,borrower_name:'N',amount_due:'0',amount_collected:'0',amount_remaining:'0',prepaid_today:'0',prepaid_only:false});assert.equal(none.status,'fully_paid');assert.equal(none.overdueDays,null)});
test('R137 projection: sinceLastPaymentDays and neverPaid on long overdue rows only (8 or more days), null elsewhere, absent for an older source',()=>{
 const base={id:'a',borrower_name:'N',amount_due:'0',amount_collected:'0',amount_remaining:'0',prepaid_today:'0',prepaid_only:false};
 const long=projectCollection({...base,rank:3,overdue_days:20,since_last_payment_days:10,never_paid:false});
 assert.deepEqual([long.status,long.overdueDays,long.sinceLastPaymentDays,long.neverPaid],['long_overdue',20,10,false]);
 assert.deepEqual([projectCollection({...base,rank:3,overdue_days:9,since_last_payment_days:9,never_paid:true}).neverPaid],[true]);
 const overdue=projectCollection({...base,rank:2,overdue_days:20,since_last_payment_days:null,never_paid:null});assert.deepEqual([overdue.sinceLastPaymentDays,overdue.neverPaid],[null,null]);
 assert.equal('sinceLastPaymentDays' in projectCollection({...base,rank:2,overdue_days:3}),false);
 for(const bad of [{rank:3,overdue_days:20,since_last_payment_days:7,never_paid:false},{rank:3,overdue_days:20,since_last_payment_days:null,never_paid:null},{rank:3,overdue_days:20,since_last_payment_days:10,never_paid:null},{rank:3,overdue_days:20,since_last_payment_days:8.5,never_paid:true},{rank:2,overdue_days:20,since_last_payment_days:10,never_paid:false},{rank:2,overdue_days:3,since_last_payment_days:null,never_paid:false}])
  assert.throws(()=>projectCollection({...base,...bad}),/Invalid collection/,JSON.stringify(bad));
});
test('R110 Collection status counts only charges dated by the business date (a future charge part-paid today is not partly paid)',async()=>{
 const {collectionCte}=await import('../../services/api/collection-read-contract.mjs');
 const rank=collectionCte.slice(collectionCte.indexOf('CASE WHEN count(*)'),collectionCte.indexOf('AS rank'));
 assert.match(rank,/charge_date <= \$1::date AND payment_status IN \('รอชำระ', 'ชำระบางส่วน'\)\) = 0 THEN 4/);
 assert.match(rank,/charge_date <= \$1::date AND payment_status = 'ชำระบางส่วน'\) > 0/);
 const status=[...rank.matchAll(/FILTER \(WHERE ([^)]*)\)/g)].map(m=>m[1]).filter(where=>/payment_status (?:IN|=|<>)/.test(where));
 assert.ok(status.length===6&&status.every(where=>/charge_date (?:<|<=) \$1::date/.test(where)),'every status test is limited to charges due by today');
});
test('R114 COL-2: a borrower paid in advance by a rebate offset gets prepaidSource, only when the reader may read the payment method',async()=>{
 const {readCollection,prepaidSourceSql,prepaidSourceAllowedSql}=await import('../../services/api/collection-read-contract.mjs');
 const row=(id,prepaid)=>({id,rank:4,overdue_days:null,borrower_name:id,amount_due:'0',amount_collected:'0',amount_remaining:'0',prepaid_today:prepaid?'100':'0',prepaid_only:prepaid,prepaid_payment_date:prepaid?'2026-11-01':null});
 const run=async allowed=>{const calls=[];const client={query:async(sql,args)=>{calls.push(sql);
   if(sql.includes('CURRENT_TIMESTAMP AS "asOf"'))return {rows:[{asOf:'2026-11-02T01:00:00Z',businessDate:'2026-11-02'}]};
   if(sql.includes('AS invalid'))return {rows:[{invalid:false}]};
   if(sql===prepaidSourceAllowedSql)return {rows:[{allowed}]};
   if(sql===prepaidSourceSql){assert.deepEqual(args,['2026-11-02',['a','b']]);return {rows:[{id:'b'}]};}
   return {rows:[row('a',true),row('b',true),row('c',false)]};}};
  return {value:await readCollection(client,{limit:10,after:null}),calls};};
 const granted=await run(true);
 assert.deepEqual(granted.value.items.map(item=>item.prepaidSource??null),[null,'rebate_offset',null]);
 assert.equal(granted.value.items[1].prepaidPaymentDate,'2026-11-01','the date stays');
 const without=await run(false);
 assert.deepEqual(without.value.items.map(item=>item.prepaidSource??null),[null,null,null],'no grant: the caption falls back to the date');
 assert.equal(without.calls.includes(prepaidSourceSql),false);
 assert.match(prepaidSourceSql,/p\."Payment Method"/);assert.match(prepaidSourceSql,/r\."Ref Payment"/);
});
// R146: the group chat summary on the collection read. Invented text only.
test('R146 list items carry chatSummaryAt and the detail envelope groupChat; a reader without the grant gets null and no failure',async()=>{
 const {readCollection,groupChatAllowedSql,groupChatListSql,groupChatDetailSql,GROUP_CHAT_COLUMNS,projectGroupChat}=await import('../../services/api/collection-read-contract.mjs');
 const row=id=>({id,rank:0,overdue_days:null,borrower_name:id,amount_due:'100',amount_collected:'0',amount_remaining:'100',prepaid_today:'0',prepaid_only:false,prepaid_payment_date:null});
 const stored={borrower_id:'a',shared_group:false,headline_th:'ผู้กู้ขอเลื่อนจ่ายเป็นวันศุกร์',headline_en:'Borrower asks to pay on Friday.',
  points:[{speaker:{role:'borrower',borrowerId:'a'},th:'เงินเดือนออกช้า',en:'Salary is late.'},{speaker:{role:'partner'},th:'ตกลง',en:'Agreed.'}],
  last_speaker_role:'referrer',last_speaker_borrower_id:'x',message_count:12,last_message_at:new Date('2026-11-12T07:05:00Z'),generated_at:'2026-11-12T07:32:00.000Z'};
 const run=async(allowed,options={limit:10,after:null})=>{const calls=[];const client={query:async(sql,args)=>{calls.push(sql);
   if(sql.includes('CURRENT_TIMESTAMP AS "asOf"'))return {rows:[{asOf:'2026-11-12T08:00:00Z',businessDate:'2026-11-12'}]};
   if(sql.includes('AS invalid'))return {rows:[{invalid:false}]};
   if(sql===groupChatAllowedSql){if(allowed==='missing')return {rows:[]};return {rows:[{allowed}]};}
   if(sql===groupChatListSql){assert.deepEqual(args,[['a','b']]);return {rows:[{id:'a',last_message_at:new Date('2026-11-12T07:05:00Z')}]};}
   if(sql===groupChatDetailSql){assert.deepEqual(args,['a']);return {rows:options.none?[]:[stored]};}
   if(sql.includes('pwa_group_chat_summaries'))throw Object.assign(Error('permission denied for table pwa_group_chat_summaries'),{code:'42501'});
   if(sql.includes('AS allowed'))return {rows:[{allowed:false}]};
   if(sql.endsWith('SELECT * FROM summaries'))return {rows:[row('a')]};
   if(sql.includes('SELECT id, loan_id, payment_status'))return {rows:[]};
   return {rows:[row('a'),row('b')]};}};
  return {value:await readCollection(client,options),calls};};
 // List: the summary's last substantive message time, null where there is none.
 const list=await run(true);
 assert.deepEqual(list.value.items.map(item=>[item.id,item.chatSummaryAt]),[['a','2026-11-12T07:05:00.000Z'],['b',null]]);
 assert.equal('groupChat' in list.value,false);
 // Detail: headline in both languages, points, last speaker, times, count and the shared flag.
 const detail=await run(true,{limit:10,after:null,borrowerId:'a'});
 assert.deepEqual(detail.value.groupChat,{headline:{th:stored.headline_th,en:stored.headline_en},points:stored.points,lastSpeaker:{role:'referrer',borrowerId:'x'},
  lastMessageAt:'2026-11-12T07:05:00.000Z',generatedAt:'2026-11-12T07:32:00.000Z',messageCount:12,shared:false});
 assert.deepEqual(Object.keys(detail.value),['businessDate','asOf','timezone','borrower','groupChat','items','nextCursor']);
 assert.equal((await run(true,{limit:10,after:null,borrowerId:'a',none:true})).value.groupChat,null,'no summary: null');
 // No grant (false), no table or an older database (no row): nulls, the table is never queried, nothing fails.
 for(const allowed of [false,'missing',null]){
  const without=await run(allowed);assert.deepEqual(without.value.items.map(item=>item.chatSummaryAt),[null,null]);assert.equal(without.calls.includes(groupChatListSql),false);
  const one=await run(allowed,{limit:10,after:null,borrowerId:'a'});assert.equal(one.value.groupChat,null);assert.equal(one.calls.includes(groupChatDetailSql),false);assert.equal(one.value.borrower.id,'a');
 }
 // The guard: the table must exist and every selected column must be readable; no age filter on the server.
 assert.match(groupChatAllowedSql,/to_regclass\('public\.pwa_group_chat_summaries'\)/);assert.match(groupChatAllowedSql,/has_column_privilege\(t\.oid, c\.name, 'SELECT'\)/);
 for(const column of GROUP_CHAT_COLUMNS){assert.ok(groupChatAllowedSql.includes(`'${column}'`),column);assert.ok(groupChatDetailSql.includes('g.'+column),column);}
 for(const sql of [groupChatListSql,groupChatDetailSql])assert.doesNotMatch(sql,/now\(\)|CURRENT_|interval|clock_timestamp/i);
 const contract=JSON.parse((await import('node:fs')).readFileSync(new URL('../../scripts/production/reader-capability-contract.json',import.meta.url),'utf8')).columnSelect.pwa_group_chat_summaries;
 assert.deepEqual([...contract].sort(),[...GROUP_CHAT_COLUMNS].sort(),'the reader contract grants exactly the columns the read selects');
 // A row that is not the V146 shape is dropped (display only), never an error.
 assert.equal(projectGroupChat(undefined),null);
 for(const bad of [{points:'x'},{last_speaker_role:'owner'},{last_speaker_role:'borrower',last_speaker_borrower_id:null},{points:[{speaker:{role:'partner'},th:1,en:'x'}]},{points:Array(5).fill(stored.points[1])},
   {last_message_at:'not a time'},{message_count:'12'},{shared_group:null},{headline_th:null}])assert.equal(projectGroupChat({...stored,...bad}),null,JSON.stringify(bad));
 assert.deepEqual(projectGroupChat({...stored,points:[],last_speaker_role:'business',last_speaker_borrower_id:null,shared_group:true}).lastSpeaker,{role:'business'});
});
