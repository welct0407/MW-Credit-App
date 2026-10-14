import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import {connect,principal,command,journalRows,role} from './phase6-populated-fixture.mjs';
import {borrowerFields} from './settings-populated-fixture.mjs';
let admin,app,store,snapshot;
before(async()=>{({admin,app,store}=await connect(92));snapshot=JSON.parse(readFileSync(process.env.SETTINGS_POPULATED_SNAPSHOT,'utf8'))});
after(async()=>{await app?.end();await admin?.end()});
async function applied(c){const r=await store.operation(principal,c);assert.equal(r.originalOutcome?.status,'applied',JSON.stringify(r));assert.deepEqual(await store.operation(principal,c),r);return r}
test('V92 borrower default affects only new rows and old canonical journals replay exactly',async()=>{
 for(const old of snapshot.rows){assert.equal((await store.borrowerRecord(principal,old.id)).item.aiCollectionEnabled,old.flag);assert.deepEqual(await store.operation(principal,old.command),old.outcome);let item=(await store.borrowerRecord(principal,old.id)).item;await applied(command('borrower.update',{...borrowerFields(item.name),note:'Changed old note'},old.id,item.version));assert.equal((await store.borrowerRecord(principal,old.id)).item.aiCollectionEnabled,old.flag);item=(await store.borrowerRecord(principal,old.id)).item;await applied(command('borrower.update',{...borrowerFields(item.name),aiCollectionEnabled:!old.flag},old.id,item.version));assert.equal((await store.borrowerRecord(principal,old.id)).item.aiCollectionEnabled,!old.flag)}
 const legacy=command('borrower.create',borrowerFields('C new omitted default'));await applied(legacy);assert.equal((await store.borrowerRecord(principal,legacy.targetId)).item.aiCollectionEnabled,true);
 for(const flag of[false,true,null]){const c=command('borrower.create',{...borrowerFields('C new explicit '+flag),aiCollectionEnabled:flag});await applied(c);assert.equal((await store.borrowerRecord(principal,c.targetId)).item.aiCollectionEnabled,flag)}
 const before=await journalRows(admin);assert.equal((await store.operation(principal,command('borrower.create',{...borrowerFields('C malformed flag'),aiCollectionEnabled:'true'}))).status,400);assert.deepEqual(await journalRows(admin),before);
});
test('V92 reader and mismatched runtime role cannot use editable settings commands',async()=>{
 await admin.query('CREATE ROLE mw_app_dev_r062_reader LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS');await admin.query('GRANT SELECT ON public."Partners" TO mw_app_dev_r062_reader');const reader=new pg.Pool({host:'127.0.0.1',port:Number(process.env.PAYMENT_REHEARSAL_PORT),database:'payment_rehearsal',user:'mw_app_dev_r062_reader',password:''});
 try{assert.ok((await reader.query('SELECT "Row ID" FROM public."Partners"')).rowCount>0);await assert.rejects(reader.query('SELECT public.pwa_submit_operation_v2($1)',['{}']),e=>e.code==='42501')}finally{await reader.end()}
 const before=await journalRows(admin);await admin.query('REVOKE mw_app_dev FROM '+role);try{const denied=await store.operation(principal,command('partner.create',{partnerName:'C denied role',partnerRole:'B',loginEmail:null,email:'delivery@example.test',instagramUsername:null,languagePreference:'English',igIntegrationEnabled:true,aiReviewer:true}));assert.equal(denied.ok,false);assert.notEqual(denied.status,200);assert.deepEqual(await journalRows(admin),before)}finally{await admin.query('GRANT mw_app_dev TO '+role)}
});
test('V92 partner flags and delivery email are editable without changing login authority',async()=>{
 const inputs={partnerName:'C R062 partner',partnerRole:'B',loginEmail:null,email:'delivery@example.test',instagramUsername:null,languagePreference:'English',igIntegrationEnabled:true,aiReviewer:true};const c=command('partner.create',inputs);await applied(c);let item=(await store.management(principal,'partners',{id:c.targetId})).item;assert.equal(item.email,inputs.email);assert.equal(item.loginEmail,null);assert.equal(item.igIntegrationEnabled,true);assert.equal(item.aiReviewer,true);
 const before=await journalRows(admin);assert.equal((await store.operation({...principal,email:inputs.email},command('partner.update',{...inputs,aiReviewer:false},c.targetId,item.version))).status,403);assert.deepEqual(await journalRows(admin),before);
 await assert.rejects(app.query('SELECT pwa_apply_management_v2($1)',['{}']),e=>e.code==='42501');
 await applied(command('partner.update',{...inputs,email:'other.valid+alias@example.test',igIntegrationEnabled:false,aiReviewer:false},c.targetId,item.version));item=(await store.management(principal,'partners',{id:c.targetId})).item;assert.equal(item.email,'other.valid+alias@example.test');assert.equal(item.igIntegrationEnabled,false);assert.equal(item.aiReviewer,false);
 for(const email of['invalid','bad\n@example.test','x'.repeat(321)+'@example.test'])assert.equal((await store.operation(principal,command('partner.create',{...inputs,email}))).status,400);
 const outsider=command('partner.create',inputs);assert.equal((await store.operation({...principal,email:'nonmember@example.test'},outsider)).status,403);
});
test('V92 preferences preserve unchanged aged date and inactive account while enforcing owner and CAS',async()=>{
 const actor=snapshot.parent.fixture.actorId,account=snapshot.parent.fixture.receivingAccountId;
 await admin.query('UPDATE public."Cash Statement Context" SET "Statement Date"=$1,"Ref Cash Account"=$2 WHERE "Ref Partner"=$3',['2000-01-01',account,actor]);
 const originalAccount=(await admin.query('SELECT "Active" active,"Default Account" def FROM public."Cash Accounts" WHERE "Row ID"=$1',[account])).rows[0];
 await admin.query('UPDATE public."Cash Accounts" SET "Active"=false,"Default Account"=false WHERE "Row ID"=$1',[account]);
 try{let prefs=await store.preferences(principal);assert.equal(prefs.status,200,JSON.stringify(prefs));const original=prefs.item,inputs={language:original.language==='ไทย'?'English':'ไทย',statementAccountId:account,statementDate:'2000-01-01'};const c=command('preference.update',inputs,actor,original.version);await applied(c);prefs=await store.preferences(principal);assert.equal(prefs.item.language,inputs.language);assert.equal(prefs.item.statementAccountId,account);assert.equal(prefs.item.statementDate,'2000-01-01');
  const stale=await store.operation(principal,command('preference.update',{...inputs,language:inputs.language==='ไทย'?'English':'ไทย'},actor,original.version));assert.equal(stale.originalOutcome?.code,'source_conflict',JSON.stringify(stale));
  for(const changed of[{...inputs,statementDate:'2000-01-02'},{...inputs,statementAccountId:'missing-account'}]){const r=await store.operation(principal,command('preference.update',changed,actor,prefs.item.version));assert.equal(r.originalOutcome?.status,'rejected',JSON.stringify(r))}
  assert.equal((await store.operation(principal,command('preference.update',inputs,randomUUID(),prefs.item.version))).status,403);
 }finally{await admin.query('UPDATE public."Cash Accounts" SET "Active"=$2,"Default Account"=$3 WHERE "Row ID"=$1',[account,originalAccount.active,originalAccount.def])}
});
