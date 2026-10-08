import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import http from 'node:http';
import {randomUUID} from 'node:crypto';
import {disposablePool} from '../../scripts/rehearsal/disposable-pool.mjs';
import {seedPaymentFixture} from '../../scripts/rehearsal/payment-fixture.mjs';
import {reconcileApplicationRole} from '../../scripts/database/app-role-policy.mjs';
import {attestDisposableApplicationTarget} from '../../services/payment-command/application-target.mjs';
import {createApplicationRoleCommandStore} from '../../services/payment-command/store.mjs';
import {createPaymentCommandHandler} from '../../services/payment-command/handler.mjs';
import {OWNER_EMAIL} from '../../services/api/dev-read-config.mjs';
let admin,app,proof,server,origin,store;
const user='mw_app_dev_gc_fixture',prefix='4G-C',principal={ok:true,email:OWNER_EMAIL,subject:'synthetic-independent-owner'};
const fixture={borrowerId:prefix+'-B',chargeIds:[prefix+'-C1',prefix+'-C2',prefix+'-FUTURE'],cashAccountIds:['4A-RECEIVE']};
let receiptCalls=0;
before(async()=>{
 admin=await disposablePool(79);await seedPaymentFixture(admin,prefix);
 await admin.query('UPDATE "Partners" SET "Login Email"=$1 WHERE "Row ID"=\'4A-ACTOR\'',[OWNER_EMAIL]);
 await admin.query('CREATE ROLE '+user+' LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS; GRANT mw_app_dev TO '+user);
 const c=await admin.connect();try{await reconcileApplicationRole(c,{database:'payment_rehearsal',creators:['postgres']},{apply:true})}finally{c.release()}
 app=new pg.Pool({host:'127.0.0.1',port:Number(process.env.PAYMENT_REHEARSAL_PORT),database:'payment_rehearsal',user});
 proof=await attestDisposableApplicationTarget({adminPool:admin,expectedDirectory:process.env.PAYMENT_REHEARSAL_DIRECTORY,runtimeUser:user});
 store=createApplicationRoleCommandStore({pool:app,targetAttestation:proof,fixture,receiptAdapter:{async upload(){receiptCalls++;return {receipt:{receiptId:'synthetic'}}},async retrieve(){receiptCalls++;return {bytes:Buffer.from('synthetic'),mimeType:'image/png'}}}});
 server=http.createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 origin='http://127.0.0.1:'+server.address().port;
 server.on('request',createPaymentCommandHandler({origins:[origin],verifyPrincipal:async value=>value==='Bearer synthetic'?principal:{ok:false,code:'sign_in_required'},store}));
});
after(async()=>{if(server)await new Promise(resolve=>server.close(resolve));await app?.end();await admin?.end()});
async function request(path,options={}){return fetch(origin+path,{...options,headers:{Origin:origin,Authorization:'Bearer synthetic',...options.headers}})}
async function count(){return (await admin.query('SELECT count(*)::integer n FROM pwa_payment_commands')).rows[0].n}
test('G02 actual HTTP draft has exact Bangkok date, stable eligible charges and private account projection',async()=>{
 const r=await request('/api/payment-drafts/'+fixture.borrowerId);assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'no-store');
 const d=await r.json();const day=(await admin.query("SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date::text AS day")).rows[0].day;
 assert.equal(d.businessDate,day);assert.ok(Date.parse(d.asOf));assert.deepEqual(d.charges.map(c=>c.id),[prefix+'-C1',prefix+'-C2']);
 assert.equal(d.charges.reduce((n,c)=>n+BigInt(c.amountRemaining),0n),330n);
 assert.deepEqual(Object.keys(d.accounts[0]).sort(),['id','label']);assert.equal(d.mode,'synthetic-only');
});
test('G02 auth, foreign borrower, foreign charge and invalid route fail without journal writes',async()=>{
 const n=await count();
 assert.equal((await request('/api/payment-drafts/'+fixture.borrowerId,{headers:{Authorization:''}})).status,401);
 assert.equal((await request('/api/payment-drafts/'+prefix+'-OTHER')).status,403);
 assert.equal((await request('/api/payment-drafts/'+fixture.borrowerId+'?x=1')).status,400);
 const foreign=createApplicationRoleCommandStore({pool:app,targetAttestation:proof,fixture:{...fixture,chargeIds:[prefix+'-FOREIGN']}});
 assert.equal((await foreign.draft(principal,fixture.borrowerId)).status,503);
 assert.equal(await count(),n);
});
test('G02 draft rejects fractional amount and excludes inactive receiving account',async()=>{
 const prior=(await admin.query('SELECT "Principal Due"::text amount FROM "Charges" WHERE "Row ID"=$1',[prefix+'-C1'])).rows[0].amount;try{
 await admin.query('UPDATE "Charges" SET "Principal Due"=1.50::money WHERE "Row ID"=$1',[prefix+'-C1']);
 assert.equal((await store.draft(principal,fixture.borrowerId)).status,503);
 }finally{await admin.query('UPDATE "Charges" SET "Principal Due"=$1::money WHERE "Row ID"=$2',[prior,prefix+'-C1'])}
 await admin.query('INSERT INTO "Cash Accounts"("Row ID","Ref Cash Holder","Account Label","Bank Name","Active","Default Account") VALUES(\'4G-INACTIVE\',\'ch:dad\',\'Synthetic inactive\',\'Synthetic\',false,false)');
 const inactive=createApplicationRoleCommandStore({pool:app,targetAttestation:proof,fixture:{...fixture,cashAccountIds:['4G-INACTIVE']}});
 assert.deepEqual((await inactive.draft(principal,fixture.borrowerId)).accounts,[]);
});
test('G05 HTTP receipt gate and media/body bounds precede adapter and leave financial state unchanged',async()=>{
 const path='/api/payment-commands/'+randomUUID()+'/receipts/'+randomUUID(),n=await count();
 for(const [borrower,status] of [[prefix+'-OTHER',403],[undefined,403]]){
 const r=await request(path,{method:'POST',headers:{'Content-Type':'image/png',...(borrower?{'X-Borrower-ID':borrower}:{})},body:Buffer.from('image')});assert.equal(r.status,status);
 }
 assert.equal((await request(path,{method:'POST',headers:{'Content-Type':'image/heic','X-Borrower-ID':fixture.borrowerId},body:'bad'})).status,415);
 assert.equal((await request(path,{method:'POST',headers:{'Content-Type':'image/png','X-Borrower-ID':fixture.borrowerId},body:Buffer.alloc(5242881)})).status,413);
 assert.equal(receiptCalls,0);assert.equal(await count(),n);
});




test('G03 HTTP posting and retained replay survive fixture removal',async()=>{
 const draft=await (await request('/api/payment-drafts/'+fixture.borrowerId)).json();
 const cmd={schemaVersion:3,requestId:randomUUID(),borrowerId:fixture.borrowerId,selectedChargeIds:[prefix+'-C1',prefix+'-C2'],cashAccountId:'4A-RECEIVE',paymentDate:draft.businessDate,amountReceived:'330',paymentMethod:'Bank Transfer',allocationMethod:'Selected Charges',notes:'Synthetic notes',receiptId:null};
 const n=await count(),r=await request('/api/payment-commands',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(cmd)});
 assert.equal(r.status,200);const posted=await r.json();assert.equal(posted.originalOutcome.status,'posted');
 assert.deepEqual(await (await request('/api/payment-commands/'+cmd.requestId)).json(),posted);
 const removed=createApplicationRoleCommandStore({pool:app,targetAttestation:proof,fixture:{borrowerId:'removed',chargeIds:[],cashAccountIds:[]}});
 const {status,...value}=await removed.submit(principal,cmd);assert.equal(status,200);assert.deepEqual(value,posted);
 assert.equal((await removed.submit(principal,{...cmd,requestId:randomUUID()})).status,403);
 assert.equal((await removed.submit(principal,{...cmd,notes:'changed'})).status,409);assert.equal(await count(),n+1);
});
test('G04 pre-dispatch guard outage is unavailable without financial Unknown',async()=>{
 const broken={async connect(){const c=await app.connect();return {query:async(sql,...args)=>{if(sql.includes('current_user'))throw Error('guard outage');return c.query(sql,...args)},release:v=>c.release(v)}}};
 const guarded=createApplicationRoleCommandStore({pool:broken,targetAttestation:proof,fixture});
 const n=await count(),day=(await admin.query("SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date::text AS day")).rows[0].day;
 const r=await guarded.submit(principal,{schemaVersion:3,requestId:randomUUID(),borrowerId:fixture.borrowerId,selectedChargeIds:[prefix+'-C1'],cashAccountId:'4A-RECEIVE',paymentDate:day,amountReceived:'110',paymentMethod:'Bank Transfer',allocationMethod:'Selected Charges',notes:null,receiptId:null});
 assert.deepEqual(r,{ok:false,status:503,code:'command_unavailable'});assert.equal(await count(),n);
});








test('G02 account Sort Order precedes ID and charge DTO uses chargeDate',async()=>{
 await admin.query('INSERT INTO "Cash Accounts"("Row ID","Ref Cash Holder","Account Label","Bank Name","Active","Default Account","Sort Order") VALUES(\'4G-SORT-A\',\'ch:dad\',\'Synthetic later\',\'Synthetic\',true,false,20),(\'4G-SORT-Z\',\'ch:dad\',\'Synthetic earlier\',\'Synthetic\',true,false,10)');
 const sorted=createApplicationRoleCommandStore({pool:app,targetAttestation:proof,fixture:{...fixture,cashAccountIds:['4G-SORT-A','4G-SORT-Z'],chargeIds:[prefix+'-UNSELECTED']}});
 const d=await sorted.draft(principal,fixture.borrowerId);assert.equal(d.status,200);assert.deepEqual(d.accounts.map(a=>a.id),['4G-SORT-Z','4G-SORT-A']);
 assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(d.charges[0].chargeDate));assert.equal('date' in d.charges[0],false);
});
test('G05 actual HTTP receipt outage is503; invalid image422 and identity conflict409 without financial effects',async()=>{
 let error=Error('synthetic transport outage');const n=await count();
 const receipts={async upload(){throw error},async retrieve(){throw error}};
 const service=createApplicationRoleCommandStore({pool:app,targetAttestation:proof,fixture,receiptAdapter:receipts});
 const endpoint=http.createServer();await new Promise(resolve=>endpoint.listen(0,'127.0.0.1',resolve));const url='http://127.0.0.1:'+endpoint.address().port;
 endpoint.on('request',createPaymentCommandHandler({origins:[url],verifyPrincipal:async()=>principal,store:service}));
 try{
 const path='/api/payment-commands/'+randomUUID()+'/receipts/'+randomUUID();
 for(const [message,status] of [['synthetic transport outage',503],['invalid_receipt',422],['receipt_conflict',409]]){
 error=Error(message);const r=await fetch(url+path,{method:'POST',headers:{Origin:url,'Content-Type':'image/png','X-Borrower-ID':fixture.borrowerId},body:Buffer.from('synthetic')});assert.equal(r.status,status);
 }
 const r=await fetch(url+path,{headers:{Origin:url}});assert.equal(r.status,409);
 assert.equal(await count(),n);
 }finally{await new Promise(resolve=>endpoint.close(resolve))}
});

