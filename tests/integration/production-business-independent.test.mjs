import test from 'node:test';
import assert from 'node:assert/strict';
import {realpath,readFile} from 'node:fs/promises';
import {basename,dirname,isAbsolute} from 'node:path';
import pg from 'pg';
import {createProductionConnectionGuard} from '../../services/production/business-target.mjs';
import {createBusinessMembership} from '../../services/production/business-policy.mjs';
import {createBorrowerReadStore} from '../../services/api/borrower-read-store.mjs';

const project='clever-oasis-508610-n7';
const readUser=`mw-credit-app-read-prod@${project}.iam`,commandUser=`mw-credit-app-command-prod@${project}.iam`;
async function fixture(){
 const e=process.env,port=Number(e.PHASE8_TEST_PORT),database=e.PHASE8_TEST_DATABASE,directory=e.PHASE8_TEST_DATA_DIRECTORY;
 if(e.PHASE8_TEST_DISPOSABLE!=='1'||e.PHASE8_TEST_HOST!=='127.0.0.1'||!Number.isInteger(port)||port<1024||port>65535||!/^mw_phase8_[a-f0-9]{32}$/.test(database??'')||e.PHASE8_TEST_USER!=='postgres'||!directory||!isAbsolute(directory))throw Error('Explicit owned loopback Phase8 fixture required');
 const canonical=await realpath(directory);if(basename(canonical)!=='data'||!/^(mw-phase8-|mw_phase8_)[a-f0-9]{32}$/.test(basename(dirname(canonical))))throw Error('Owned Phase8 data marker required');
 assert.match(await readFile(canonical+'/PG_VERSION','utf8'),/^\d+/);const pid=await readFile(canonical+'/postmaster.pid','utf8');assert.equal(Number(pid.split(/\r?\n/)[3]),port);
 const base={host:'127.0.0.1',port,database,password:e.PHASE8_TEST_PASSWORD,max:2,connectionTimeoutMillis:2000};
 const admin=new pg.Pool({...base,user:'postgres'}),reader=new pg.Pool({...base,user:readUser}),command=new pg.Pool({...base,user:commandUser});
 assert.equal((await admin.query('SELECT current_database() AS name')).rows[0].name,database);
 const member={partnerId:'C-PROD-INDEPENDENT',loginEmail:'c-production-independent@example.invalid',partnerRole:'B',capabilities:['read','command']};
 const config={database,dbUser:readUser,serviceRole:'reader',applicationRole:'mw_app_prod',journalOwnerRole:'mw_app_prod_journal_owner',registeredCreators:['postgres'],issuer:`https://securetoken.google.com/${project}`,policy:{members:[member]}};
 return{admin,reader,command,config,member,close:async()=>{await Promise.all([admin.end(),reader.end(),command.end()]);}};
}

test('actual nonsuperuser PostgreSQL sessions enforce exact database, role and inheritance guard',async()=>{
 const f=await fixture();let client;
 try{
  client=await f.reader.connect();await createProductionConnectionGuard(f.config)(client);
  await assert.rejects(createProductionConnectionGuard({...f.config,database:'loan_manager_dev'})(client));
  await assert.rejects(createProductionConnectionGuard({...f.config,dbUser:'postgres'})(client));
  await f.admin.query(`ALTER ROLE "${readUser}" CREATEDB`);await assert.rejects(createProductionConnectionGuard(f.config)(client));await f.admin.query(`ALTER ROLE "${readUser}" NOCREATEDB`);
  await f.admin.query(`GRANT mw_app_prod TO "${readUser}"`);await assert.rejects(createProductionConnectionGuard(f.config)(client));await f.admin.query(`REVOKE mw_app_prod FROM "${readUser}"`);
  await f.admin.query(`GRANT mw_app_dev TO "${readUser}"`);await assert.rejects(createProductionConnectionGuard(f.config)(client));await f.admin.query(`REVOKE mw_app_dev FROM "${readUser}"`);
  const command=await f.command.connect();try{await createProductionConnectionGuard({...f.config,serviceRole:'command',dbUser:commandUser})(command);}finally{command.release();}
 }finally{client?.release();await f.admin.query(`ALTER ROLE "${readUser}" NOCREATEDB`);await f.admin.query(`REVOKE mw_app_prod,mw_app_dev FROM "${readUser}"`);await f.close();}
});

test('actual read-only transactions recheck Login Email mapping and preserve deny after Partner remap',async()=>{
 const f=await fixture();const m=createBusinessMembership(f.config);
 try{
  await f.admin.query('INSERT INTO public."Partners"("Row ID","Partner Name","Partner Role","Login Email","Email") VALUES($1,$2,$3,$4,$5)',[f.member.partnerId,'Synthetic independent',f.member.partnerRole,f.member.loginEmail,'shared-delivery@example.invalid']);
  const store=createBorrowerReadStore({pool:f.reader,config:f.config,source:'prod',guardConnection:createProductionConnectionGuard(f.config),emailAllowed:m.emailAllowed,resolveMember:m.resolveMember});
  assert.equal((await store.session(f.member.loginEmail)).ok,true);assert.equal((await store.session('shared-delivery@example.invalid')).status,403);
  await f.admin.query('UPDATE public."Partners" SET "Partner Role"=$1 WHERE "Row ID"=$2',['A',f.member.partnerId]);assert.equal((await store.session(f.member.loginEmail)).status,403);
  await f.admin.query('UPDATE public."Partners" SET "Partner Role"=$1,"Login Email"=$2 WHERE "Row ID"=$3',['B','remapped@example.invalid',f.member.partnerId]);assert.equal((await store.session(f.member.loginEmail)).status,403);
  await f.admin.query('UPDATE public."Partners" SET "Login Email"=$1 WHERE "Row ID"=$2',[f.member.loginEmail,f.member.partnerId]);assert.equal((await store.session(f.member.loginEmail)).ok,true);
  await assert.rejects(f.admin.query('INSERT INTO public."Partners"("Row ID","Partner Role","Login Email") VALUES($1,$2,$3)',[f.member.partnerId+'-duplicate','B',f.member.loginEmail]),error=>error.code==='23505'&&error.constraint==='partners_login_email_unique');
  assert.equal((await store.session(f.member.loginEmail)).ok,true);
  const client=await f.command.connect();try{const actor=await m.resolveActor(client,{ok:true,subject:'verified-server-user',email:f.member.loginEmail},'command');assert.equal(actor.partnerId,f.member.partnerId);assert.equal(actor.subject,'verified-server-user');}finally{client.release();}
  await f.admin.query('DELETE FROM public."Partners" WHERE "Row ID"=$1',[f.member.partnerId]);assert.equal((await store.session(f.member.loginEmail)).status,403);
 }finally{await f.admin.query('DELETE FROM public."Partners" WHERE "Row ID"=ANY($1::text[])',[[f.member.partnerId,f.member.partnerId+'-duplicate']]);await f.close();}
});
