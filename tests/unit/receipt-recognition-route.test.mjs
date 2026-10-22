import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createHash} from 'node:crypto';
import {createEnvironmentCommandHandler} from '../../services/payment-command/handler.mjs';
import {createEnvironmentCommandStore} from '../../services/payment-command/store.mjs';
import {createRecognizerClient,recognizerUrl,validRecognition} from '../../services/receipts/recognizer-client.mjs';
import {loadBusinessConfig} from '../../services/production/business-config.mjs';
import {DEV_RECEIPT_MAPPING} from '../../services/receipts/dev-receipt-adapter.mjs';
import {businessEnv} from './business-env-fixture.mjs';
// R075 slip recognition: POST /api/payment-commands/{requestId}/receipts/{receiptId}/recognition.
// Synthetic identities, accounts and images only; no network or database.
const requestId='12345678-1234-4234-8234-123456789abc',receiptId='12345678-1234-4234-8234-123456789abd';
const principal={ok:true,subject:'synthetic',email:'synthetic@example.invalid'};
const actor={issuer:'https://issuer.invalid',subject:'synthetic',partnerId:'synthetic-partner',loginEmail:principal.email};
const URL_OK='http://10.148.0.2:8790/v1/receipt-recognition';
const slip={is_payment_receipt:true,transfer_successful:true,date:'2026-10-18',time:'09:41:27',amount:'1500.00',currency:'THB',reference:'AB-1234 CD',account_numbers:['xxx-x-x6789-x']};
const call=(handler,method,url,headers={})=>{const res=new EventEmitter(),out={};res.setHeader=()=>{};res.end=b=>{out.status=res.statusCode;out.body=b?JSON.parse(b):undefined;res.emit('finish')};const req=new EventEmitter();Object.assign(req,{method,url,headers:{authorization:'Bearer synthetic',...headers}});return handler(req,res).then(()=>out);};
const handlerFor=store=>createEnvironmentCommandHandler({config:loadBusinessConfig(businessEnv('dev','command')),verifyPrincipal:async()=>({ok:true,subject:'s',email:'e@example.invalid'}),store});

test('route: POST only, lowercase ids, no query or body; the recognition body is returned at HTTP 200',async()=>{
 const seen=[];const handler=handlerFor({recognize:async(_principal,input)=>{seen.push(input);return {ok:true,status:200,recognition:{status:'unavailable',reason:'disabled',suggestion:null,warnings:[]}}}});
 const path=`/api/payment-commands/${requestId.toUpperCase()}/receipts/${receiptId.toUpperCase()}/recognition`;
 const out=await call(handler,'POST',path);assert.equal(out.status,200);assert.deepEqual(out.body,{ok:true,status:'unavailable',reason:'disabled',suggestion:null,warnings:[]});
 assert.deepEqual(seen,[{requestId,receiptId}]);
 for(const method of ['GET','PATCH','DELETE'])assert.equal((await call(handler,method,path)).status,405);
 for(const bad of [`/api/payment-commands/not-a-uuid/receipts/${receiptId}/recognition`,`/api/payment-commands/${requestId}/receipts/x/recognition`,path+'?retry=1'])assert.equal((await call(handler,'POST',bad)).status,400,bad);
 assert.equal((await call(handler,'POST',path,{'content-length':'2'})).status,400);
 assert.equal(seen.length,1);
 const missing=handlerFor({recognize:async()=>({ok:false,status:404,code:'not_found'})});
 assert.deepEqual(await call(missing,'POST',path),{status:404,body:{ok:false,code:'not_found'}});
});

function storeFixture({recognizer,retrieve,resolveActor=async()=>actor,now,accounts=[{id:'acc-a',number:'123-4-56789-0',alternative:null,active:true}],references=[]}={}){
 let open=0,checkedOut=0;const record=[],sql=[];
 const client={query:async(text,params)=>{sql.push(text);if(text.startsWith('BEGIN'))open++;if(text==='COMMIT'||text==='ROLLBACK')open--;
  if(text.includes('AS day'))return {rows:[{day:'2026-10-18'}]};
  if(text.includes('public."Cash Accounts"'))return {rows:accounts};
  if(text.includes('"Bank Reference"'))return {rows:[{found:references.includes(params[0])}]};
  return {rows:[{}]}},release(){checkedOut--}};
 const pool={connect:async()=>{checkedOut++;return client}};
 const receiptAdapter={resolveReceipt(){},retrieve:async input=>{record.push({call:'retrieve',open,checkedOut,input});return retrieve?retrieve(input):{bytes:Buffer.from('synthetic-png'),mimeType:'image/png'}}};
 const wrapped=recognizer===null?null:{recognize:async input=>{record.push({call:'recognize',open,checkedOut});return (recognizer??(async()=>({status:'recognized',provider:'gemini',model:'synthetic-flash-001',result:slip})))(input)}};
 const store=createEnvironmentCommandStore({pool,guardConnection:async()=>{},principalAllowed:()=>true,resolveActor,actorIssuer:actor.issuer,receiptAdapter,recognizer:wrapped,...(now?{now}:{})});
 return {store,record,sql};
}

test('store: recognizer and storage run with no transaction open; rules re-run each call against the database; one model call per slip',async()=>{
 const references=[];const f=storeFixture({references});
 const first=await f.store.recognize(principal,{requestId,receiptId});
 assert.equal(first.status,200);
 assert.deepEqual(first.recognition,{status:'recognized',provider:'gemini',model:'synthetic-flash-001',suggestion:{amountReceived:'1500',cashAccountId:'acc-a',bankReference:'AB1234CD',paymentDate:'2026-10-18',transferTime:'09:41',paymentMethod:'Bank Transfer'},warnings:[]});
 assert.deepEqual(f.record.map(({call,open,checkedOut})=>({call,open,checkedOut})),[{call:'retrieve',open:0,checkedOut:0},{call:'recognize',open:0,checkedOut:0}]);
 assert.deepEqual(f.record[0].input,{requestId,receiptId,actor});
 assert.ok(f.sql.filter(t=>t.startsWith('BEGIN')).every(t=>t.includes('READ ONLY')));
 references.push('AB1234CD');
 const second=await f.store.recognize(principal,{requestId,receiptId});
 assert.equal(f.record.length,2,'cached: no second storage read or model call');
 assert.deepEqual(second.recognition.warnings,[{code:'reference_exists'}]);
});

test('store: disabled, unknown receipt, storage and recognizer failures; failures are not cached',async()=>{
 const disabled=storeFixture({recognizer:null});
 assert.deepEqual((await disabled.store.recognize(principal,{requestId,receiptId})).recognition,{status:'unavailable',reason:'disabled',suggestion:null,warnings:[]});
 assert.deepEqual(disabled.record,[]);
 const unknown=storeFixture({retrieve:async()=>{throw Object.assign(Error('receipt_unavailable'),{receiptInvalid:true})}});
 assert.deepEqual(await unknown.store.recognize(principal,{requestId,receiptId}),{ok:false,status:404,code:'not_found'});
 const storage=storeFixture({retrieve:async()=>{throw Error('storage down')}});
 assert.equal((await storage.store.recognize(principal,{requestId,receiptId})).recognition.reason,'receipt_unavailable');
 let calls=0;const flaky=storeFixture({recognizer:async()=>++calls===1?{status:'unavailable',reason:'timeout'}:{status:'recognized',provider:'gemini',model:'m-1',result:slip}});
 assert.deepEqual((await flaky.store.recognize(principal,{requestId,receiptId})).recognition,{status:'unavailable',reason:'timeout',suggestion:null,warnings:[]});
 assert.equal((await flaky.store.recognize(principal,{requestId,receiptId})).recognition.status,'recognized');assert.equal(calls,2);
 const throwing=storeFixture({recognizer:async()=>{throw Error('boom')}});
 assert.equal((await throwing.store.recognize(principal,{requestId,receiptId})).recognition.reason,'recognizer_unreachable');
 assert.equal((await disabled.store.recognize(principal,{requestId:'bad',receiptId})).status,400);
 const denied=storeFixture({resolveActor:async()=>null});
 assert.equal((await denied.store.recognize(principal,{requestId,receiptId})).status,403);assert.deepEqual(denied.record,[]);
});

test('store cache: 15-minute expiry, bound to the actor, at most 64 entries',async()=>{
 let clock=0;const f=storeFixture({now:()=>clock});
 await f.store.recognize(principal,{requestId,receiptId});clock+=15*60*1000-1;await f.store.recognize(principal,{requestId,receiptId});
 assert.equal(f.record.filter(r=>r.call==='recognize').length,1);
 clock+=1;await f.store.recognize(principal,{requestId,receiptId});assert.equal(f.record.filter(r=>r.call==='recognize').length,2);
 let current=actor;const g=storeFixture({resolveActor:async()=>current});
 await g.store.recognize(principal,{requestId,receiptId});current={...actor,partnerId:'other-partner'};await g.store.recognize(principal,{requestId,receiptId});
 assert.equal(g.record.filter(r=>r.call==='recognize').length,2,'another actor never reads a cached result');
 const h=storeFixture();const id=n=>`12345678-1234-4234-8234-${String(n).padStart(12,'0')}`;
 for(let n=0;n<65;n++)await h.store.recognize(principal,{requestId,receiptId:id(n)});
 await h.store.recognize(principal,{requestId,receiptId:id(64)});assert.equal(h.record.filter(r=>r.call==='recognize').length,65);
 await h.store.recognize(principal,{requestId,receiptId:id(0)});assert.equal(h.record.filter(r=>r.call==='recognize').length,66,'the oldest entry was evicted');
});

const reply=(bytes,overrides={})=>({status:'recognized',provider:'gemini',model:'gemini-2.5-flash-001',durationMs:1234,imageSha256:createHash('sha256').update(bytes).digest('hex'),result:slip,...overrides});
function fakeFetch(handler){const calls=[];const fn=async(url,init={})=>{calls.push({url,init});return handler(url,init)};fn.calls=calls;return fn;}
const json=(status,body)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});

test('client: ID token for exactly the URL, hash header, no redirects; the reply is shape-validated',async()=>{
 const bytes=Buffer.from('synthetic-png');
 const fetch=fakeFetch((url)=>url.startsWith('http://metadata.google.internal/')?new Response('aaa.bbb.ccc'):json(200,reply(bytes)));
 const client=createRecognizerClient({url:URL_OK,fetch});
 const out=await client.recognize({bytes,mimeType:'image/png'});
 assert.deepEqual(out,{status:'recognized',provider:'gemini',model:'gemini-2.5-flash-001',result:slip});
 assert.equal(fetch.calls[0].url,`http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity?audience=${encodeURIComponent(URL_OK)}&format=full`);
 assert.equal(fetch.calls[0].init.headers['Metadata-Flavor'],'Google');
 const post=fetch.calls[1];assert.equal(post.url,URL_OK);assert.equal(post.init.method,'POST');assert.equal(post.init.redirect,'error');
 assert.deepEqual(post.init.headers,{Authorization:'Bearer aaa.bbb.ccc','Content-Type':'image/png','X-Content-SHA256':createHash('sha256').update(bytes).digest('hex')});
});

test('client: every failure is unavailable',async()=>{
 const bytes=Buffer.from('synthetic-png');const mint=async()=>'aaa.bbb.ccc';
 const outcome=async(handler,options={})=>createRecognizerClient({url:URL_OK,fetch:fakeFetch(handler),mintToken:mint,...options}).recognize({bytes,mimeType:'image/png'});
 assert.deepEqual(await outcome(()=>json(503,{status:'unavailable',reason:'busy'})),{status:'unavailable',reason:'recognizer_unavailable'});
 for(const status of [400,401,403,413,302])assert.equal((await outcome(()=>json(status,{status:'denied'}))).reason,'recognizer_refused');
 for(const body of [reply(bytes,{imageSha256:'0'.repeat(64)}),reply(bytes,{extra:1}),reply(bytes,{status:'rejected'}),reply(bytes,{result:{...slip,amount:1500}}),reply(bytes,{result:{...slip,extra:true}}),reply(bytes,{result:{...slip,account_numbers:'123'}}),reply(bytes,{model:'bad model'}),reply(bytes,{durationMs:-1})])
  assert.equal((await outcome(()=>json(200,body))).reason,'invalid_response',JSON.stringify(body));
 assert.equal((await outcome(()=>new Response('not json'))).reason,'invalid_response');
 assert.equal((await outcome(()=>{throw Error('ECONNREFUSED')})).reason,'recognizer_unreachable');
 assert.equal((await outcome((_url,init)=>new Promise((_resolve,reject)=>init.signal.addEventListener('abort',()=>reject(init.signal.reason))),{timeoutMs:20})).reason,'timeout');
 assert.equal((await createRecognizerClient({url:URL_OK,fetch:fakeFetch(()=>json(200,{})),mintToken:mint}).recognize({bytes,mimeType:'image/gif'})).reason,'invalid_image');
 assert.equal((await createRecognizerClient({url:URL_OK,fetch:fakeFetch(()=>new Response('',{status:500}))}).recognize({bytes,mimeType:'image/png'})).reason,'recognizer_unreachable','no identity token');
 assert.equal(validRecognition(null,'x'),null);
});

test('client: R087 account_numbers; the pre-R087 recipient_numbers key is read, exactly one key is required',()=>{
 const bytes=Buffer.from('synthetic-png'),hash=createHash('sha256').update(bytes).digest('hex');
 const {account_numbers:numbers,...fields}=slip;
 const current=validRecognition(reply(bytes),hash);
 assert.deepEqual(current.result,slip);assert.ok(Object.isFrozen(current.result)&&Object.isFrozen(current.result.account_numbers));
 const legacy=validRecognition(reply(bytes,{result:{...fields,recipient_numbers:numbers}}),hash);
 assert.deepEqual(legacy.result,slip,'the old key is returned as account_numbers');assert.equal('recipient_numbers' in legacy.result,false);
 assert.ok(Object.isFrozen(legacy.result.account_numbers));
 assert.equal(validRecognition(reply(bytes,{result:{...slip,recipient_numbers:numbers}}),hash),null,'both keys are refused');
 assert.equal(validRecognition(reply(bytes,{result:fields}),hash),null,'neither key is refused');
 assert.equal(validRecognition(reply(bytes,{result:{...fields,recipient_numbers:'123'}}),hash),null,'the old key is shape-checked too');
});

test('config: DEV_/PROD_RECEIPT_RECOGNITION needs receipts on the command service and a private :8790 endpoint',()=>{
 for(const good of [URL_OK,'http://192.168.1.5:8790/v1/receipt-recognition','http://172.20.0.9:8790/v1/receipt-recognition'])assert.equal(recognizerUrl(good),good);
 for(const bad of ['https://10.148.0.2:8790/v1/receipt-recognition','http://8.8.8.8:8790/v1/receipt-recognition','http://10.148.0.2:8443/v1/receipt-recognition','http://10.148.0.2:8790/v1/receipt-recognition?x=1','http://u:p@10.148.0.2:8790/v1/receipt-recognition','http://agent.internal:8790/v1/receipt-recognition','http://10.148.0.2:8790/healthz',undefined])assert.equal(recognizerUrl(bad),null,String(bad));
 const receipts={DEV_RECEIPTS:'enabled',RECEIPT_BUCKET:DEV_RECEIPT_MAPPING.bucket,RECEIPT_SQL_PREFIX:DEV_RECEIPT_MAPPING.sqlPrefix,RECEIPT_OBJECT_PREFIX:DEV_RECEIPT_MAPPING.objectPrefix,RECEIPT_COMPATIBILITY_EVIDENCE:'synthetic-evidence'};
 const env={...businessEnv('dev','command'),...receipts,DEV_RECEIPT_RECOGNITION:'enabled',DEV_RECEIPT_RECOGNITION_URL:URL_OK};
 assert.deepEqual(loadBusinessConfig(env).receiptRecognition,{url:URL_OK,audience:URL_OK});
 assert.equal(loadBusinessConfig({...env,DEV_RECEIPT_RECOGNITION:'disabled'}).receiptRecognition,null);
 assert.equal(loadBusinessConfig({...env,DEV_RECEIPT_RECOGNITION:undefined}).receiptRecognition,null);
 assert.equal(loadBusinessConfig(businessEnv('dev','command')).receiptRecognition,null);
 for(const patch of [{DEV_RECEIPT_RECOGNITION:'on'},{DEV_RECEIPT_RECOGNITION_URL:undefined},{DEV_RECEIPT_RECOGNITION_URL:'http://8.8.8.8:8790/v1/receipt-recognition'},{DEV_RECEIPTS:undefined,RECEIPT_BUCKET:undefined,RECEIPT_SQL_PREFIX:undefined,RECEIPT_OBJECT_PREFIX:undefined,RECEIPT_COMPATIBILITY_EVIDENCE:undefined},{PROD_RECEIPT_RECOGNITION:'enabled'}])
  assert.throws(()=>loadBusinessConfig({...env,...patch}),JSON.stringify(patch));
 assert.throws(()=>loadBusinessConfig({...businessEnv('dev','reader'),DEV_RECEIPT_RECOGNITION:'enabled',DEV_RECEIPT_RECOGNITION_URL:URL_OK}));
});

test('R089 log: a recognition answer adds its outcome category (first warning or none) to the command_request record, nothing else',async()=>{
 const path=`/api/payment-commands/${requestId}/receipts/${receiptId}/recognition`;
 const logged=async(recognition)=>{const logs=[];const handler=createEnvironmentCommandHandler({config:loadBusinessConfig(businessEnv('dev','command')),verifyPrincipal:async()=>({ok:true,subject:'s',email:'e@example.invalid'}),
  store:{recognize:async()=>recognition?{ok:true,status:200,recognition}:{ok:false,status:404,code:'not_found'}},completionLogger:r=>logs.push(r)});
  await call(handler,'POST',path);assert.equal(logs.length,1);return logs[0];};
 const clean=await logged({status:'recognized',provider:'gemini',model:'m',suggestion:{amountReceived:'1500'},warnings:[]});
 assert.equal(clean.event,'command_request');assert.equal(clean.operation,'receipt_recognition');assert.equal(clean.warning,'none');
 assert.deepEqual(Object.keys(clean),['event','requestId','operation','method','status','code','durationMs','warning']);
 assert.equal((await logged({status:'recognized',suggestion:{},warnings:[{code:'non_thb'},{code:'account_ambiguous'}]})).warning,'non_thb');
 assert.equal((await logged({status:'recognized',suggestion:{},warnings:[{code:'date_outside_window',date:'2026-10-18'}]})).warning,'date_outside_window');
 assert.equal((await logged({status:'unrecognized',reason:'slip_not_confirmed',suggestion:null,warnings:[{code:'slip_not_confirmed'}]})).warning,'slip_not_confirmed');
 assert.equal((await logged({status:'unavailable',reason:'disabled',suggestion:null,warnings:[]})).warning,'unavailable');
 assert.equal((await logged({status:'recognized',suggestion:{},warnings:[{code:'1500.00 THB'}]})).warning,'other');
 const missing=await logged(null);assert.equal(missing.status,404);assert.equal('warning' in missing,false);
 const logs=[];const other=createEnvironmentCommandHandler({config:loadBusinessConfig(businessEnv('dev','command')),verifyPrincipal:async()=>({ok:true,subject:'s',email:'e@example.invalid'}),
  store:{status:async()=>({ok:true,status:200,state:'done'})},completionLogger:r=>logs.push(r)});
 await call(other,'GET','/api/payment-commands/12345678-1234-4234-8234-123456789abc');assert.equal('warning' in logs[0],false);
});
