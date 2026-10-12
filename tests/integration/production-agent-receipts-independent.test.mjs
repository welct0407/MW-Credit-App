import test from 'node:test';import assert from 'node:assert/strict';import pg from 'pg';import sharp from 'sharp';import {createHash} from 'node:crypto';
import {realpath,readFile} from 'node:fs/promises';import {basename,dirname} from 'node:path';
import {createEnvironmentCommandStore} from '../../services/payment-command/store.mjs';
import {createProductionAgentReceiptReader} from '../../services/receipts/production-agent-receipts.mjs';import {decodeSourceReceipt} from '../../services/receipts/decode-image.mjs';
test('actual READ COMMITTED receipt response fences current SQL projection and actor changes during decode',{timeout:20000},async()=>{
 const e=process.env;if(e.PHASE8_TEST_DISPOSABLE!=='1'||e.PHASE8_TEST_HOST!=='127.0.0.1')throw Error('Owned loopback required');
 const d=await realpath(e.PHASE8_TEST_DATA_DIRECTORY);assert.equal(basename(d),'data');assert.match(basename(dirname(d)),/^mw-phase8-[a-f0-9]{32}$/);assert.equal(Number((await readFile(d+'/postmaster.pid','utf8')).split(/\r?\n/)[3]),Number(e.PHASE8_TEST_PORT));
 const base={host:'127.0.0.1',port:Number(e.PHASE8_TEST_PORT),user:'postgres'};const bootstrap=new pg.Client({...base,database:'postgres'});await bootstrap.connect();await bootstrap.query('CREATE DATABASE loan_manager_prod');await bootstrap.end();
 const pool=new pg.Pool({...base,database:'loan_manager_prod',max:2});
 try{
  // Minimal query-contract fixture, not a substitute for the separately tested full migrations/grants.
  await pool.query('CREATE TABLE public."Partners"("Row ID" text PRIMARY KEY,"Login Email" text UNIQUE,"Partner Role" text); CREATE TABLE public."Payments"("Row ID" text PRIMARY KEY,"Uploaded Receipt" text,"Receipt Image" text,"IG Receipt ID" text,"Receipt Received At" timestamp)');
  const bytes=await sharp({create:{width:2,height:3,channels:3,background:'#113355'}}).png().toBuffer(),asset='a'.repeat(64),ref=`//receipts/prod/2026/10/11/${asset}/${createHash('sha256').update(bytes).digest('hex')}.png`;
  for(const scenario of ['unchanged','reference','asset','timestamp','preferred','deleted','actor-role','actor-email','actor-deleted','capability-revoked']){
   await pool.query('DELETE FROM public."Payments"; DELETE FROM public."Partners"');await pool.query('INSERT INTO public."Partners" VALUES($1,$2,$3)',['partner','synthetic@example.invalid','A']);await pool.query('INSERT INTO public."Payments" VALUES($1,NULL,$2,$3,$4)',['payment',ref,asset,'2026-10-11 12:13:14.123456']);
   let release;const hold=new Promise(r=>release=r);let started;const reached=new Promise(r=>started=r);let allowed=true;
   const reader=createProductionAgentReceiptReader({storage:{bucket:()=>({file:(_key,options)=>({getMetadata:async()=>[{generation:'12',size:String(bytes.length),contentType:'image/png'}],download:async()=>{assert.deepEqual(options,{generation:'12'});started();await hold;return[bytes]}})})},decodeImage:decodeSourceReceipt});
   const principal={issuer:'synthetic-issuer',subject:'synthetic-subject',email:'synthetic@example.invalid'};
   const resolveActor=async c=>{if(!allowed)return null;const rows=(await c.query('SELECT "Row ID" id,"Partner Role" role FROM public."Partners" WHERE lower(btrim("Login Email"))=$1 LIMIT 2',[principal.email])).rows;return rows.length===1&&rows[0].id==='partner'&&rows[0].role==='A'?{issuer:principal.issuer,subject:principal.subject,loginEmail:principal.email,partnerId:rows[0].id}:null;};
   const store=createEnvironmentCommandStore({pool,guardConnection:async c=>assert.equal((await c.query('SELECT current_database() db')).rows[0].db,'loan_manager_prod'),principalAllowed:()=>true,resolveActor,actorIssuer:principal.issuer,sourceReceiptReader:(reference,kind,projection)=>{assert.equal(kind,'agent');return reader(reference,projection);}});
   const pending=store.paymentImage(principal,'payment');await reached;
   if(scenario==='reference')await pool.query('UPDATE public."Payments" SET "Receipt Image"=$1',[ref.replace('/2026/','/2025/')]);
   if(scenario==='asset')await pool.query('UPDATE public."Payments" SET "IG Receipt ID"=$1',['b'.repeat(64)]);
   if(scenario==='timestamp')await pool.query('UPDATE public."Payments" SET "Receipt Received At"=\'2026-10-12 12:13:14\'');
   if(scenario==='preferred')await pool.query('UPDATE public."Payments" SET "Uploaded Receipt"=\'new-manual-reference\'');
   if(scenario==='deleted')await pool.query('DELETE FROM public."Payments"');
   if(scenario==='actor-role')await pool.query('UPDATE public."Partners" SET "Partner Role"=\'B\'');
   if(scenario==='actor-email')await pool.query('UPDATE public."Partners" SET "Login Email"=\'changed@example.invalid\'');
   if(scenario==='actor-deleted')await pool.query('DELETE FROM public."Partners"');
   if(scenario==='capability-revoked')allowed=false;
   release();const result=await pending;
   if(scenario==='unchanged'){assert.equal(result.ok,true);assert.deepEqual(result.bytes,bytes);assert.equal(result.mimeType,'image/png');}else{assert.equal(result.ok,false,scenario);assert.equal(result.code,scenario.startsWith('actor-')||scenario==='capability-revoked'?'access_denied':'receipt_unavailable',scenario);assert.equal(result.bytes,undefined);}
  }
 }finally{await pool.end();}
});
