// R090: the committed schema digest of the chat prompt (services/chat/assets/schema-digest.json), built by
// scripts/chat/build-schema-digest.mjs from a disposable rebuild. It must record the current migration head, so a
// migration without a regenerated digest fails here. With MW_CHAT_DIGEST_PORT (a loopback rebuild at the head, as
// the database CI makes) the builder output must equal the committed file.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {migrationHead} from '../migration-head.mjs';
import {ALLOWED,classify,render,build,OUTPUT} from '../../scripts/chat/build-schema-digest.mjs';

const text=readFileSync(OUTPUT,'utf8'),digest=JSON.parse(text);

test('the committed digest was built at the migration head',()=>{
 assert.equal(digest.migration,migrationHead(),'stale: rebuild the database and run node scripts/chat/build-schema-digest.mjs --port <port>');
 assert.equal(digest.format,1);
 assert.equal(render(digest),text,'the file is the builder rendering');
});

test('relations: public and agent_audit with every column, the chat journal excluded',()=>{
 const relations=Object.fromEntries(digest.relations.map(r=>[r.relation,r.columns.map(c=>c.name)]));
 assert.ok(relations['public."Partners"'].includes('Email'));
 assert.ok(relations['public.pwa_row_changes']);assert.ok(Object.keys(relations).some(n=>n.startsWith('agent_audit.')));
 assert.equal(Object.keys(relations).some(n=>/pwa_chat_/.test(n)),false);
 assert.ok(digest.relations.every(r=>/^(public|agent_audit)\./.test(r.relation)&&r.columns.every(c=>c.name&&c.type)));
});

test('functions: exactly the allow-listed business functions; writers and chat RPCs excluded',()=>{
 assert.equal(ALLOWED.size,28);
 assert.deepEqual(digest.functions.map(f=>f.function).sort(),[...ALLOWED.keys()].sort());
 for(const f of digest.functions){
  assert.deepEqual([f.purpose,f.use_when],ALLOWED.get(f.function));
  assert.ok(['IMMUTABLE','STABLE','VOLATILE'].includes(f.volatility));
 }
 const payoff=digest.functions.find(f=>f.function==='public.loan_close_calculation_v83(p_loan text, p_day date)');
 assert.deepEqual([payoff.result,payoff.volatility],['jsonb','STABLE']);
 for(const writer of ['public.pwa_apply_payment_v2(canonical text)','public.post_payment_explicit_v6(p_id text)','public.pwa_chat_turn_begin_v1(actor jsonb, thread uuid, message jsonb)',
  'public.reallocate_payment_interest_audited(p_operation uuid, p_canonical_plan text)'])assert.equal(classify(writer,'text'),'excluded',writer);
 assert.equal(classify('public.pwa_effective_payment_plan_v2(p_id text)','jsonb'),'allowed');
 assert.equal(classify('public.some_new_reader(p text)','text'),null);
});

test('builder output equals the committed digest on a rebuild (MW_CHAT_DIGEST_PORT)',{skip:!process.env.MW_CHAT_DIGEST_PORT},async()=>{
 const {default:pg}=await import('pg');
 const client=new pg.Client({host:'127.0.0.1',port:Number(process.env.MW_CHAT_DIGEST_PORT),user:'postgres',database:'loan_manager_dev'});
 await client.connect();
 try{assert.equal(render(await build(client)),text);}finally{await client.end();}
});
