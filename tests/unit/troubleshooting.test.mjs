import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,writeFileSync,existsSync,statSync,rmSync,symlinkSync,mkdirSync} from 'node:fs';
import {generateKeyPairSync} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import ts from 'typescript';
import {decryptTroubleshooting,parseTroubleshootingFile,keyIdOf} from '../../scripts/troubleshooting/envelope.mjs';
const load=async file=>import('data:text/javascript;base64,'+Buffer.from(ts.transpileModule(readFileSync(new URL('../../apps/pwa/src/'+file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText).toString('base64'));
const envelopeModule=await load('troubleshooting-envelope.ts'),report=await load('troubleshooting-report.ts'),events=await load('client-events.ts'),timing=await load('startup-timing.ts');
const {encryptTroubleshooting,troubleshootingFileText,troubleshootingKeyId,keyIdOf:browserKeyIdOf,pemToDer}=envelopeModule;
// R072 troubleshooting file: WebCrypto envelope in the app, Node decryption for the owner; synthetic keys and data only.
const pair=generateKeyPairSync('rsa',{modulusLength:3072,publicKeyEncoding:{type:'spki',format:'pem'},privateKeyEncoding:{type:'pkcs8',format:'pem'}});
const payload={schemaVersion:1,app:{release:'R072'},events:[{kind:'error',message:'สวัสดี synthetic'}],pending:{failed:[{value:{command:{operation:'payment.receive'}}}],queued:[]}};
const createdAt=new Date('2026-10-18T05:06:07.000Z');
for(const compress of [true,false])test('envelope round-trips through the operator decryption ('+(compress?'gzip':'none')+')',async()=>{
 const envelope=await encryptTroubleshooting(payload,{publicKeyPem:pair.publicKey,environment:'synthetic',createdAt,compress});
 assert.equal(envelope.compressed,compress?'gzip':'none');assert.equal(envelope.keyId,keyIdOf(pair.publicKey));assert.equal(envelope.createdAt,'2026-10-18T05:06:07.000Z');
 assert.deepEqual(Object.keys(envelope),['format','v','keyId','alg','compressed','environment','createdAt','wrappedKey','iv','ciphertext']);
 const text=troubleshootingFileText(envelope),lines=text.split('\n');
 assert.equal(lines.length,2);assert.equal(lines[0],'MW Credit troubleshooting file (encrypted). Send it only to the app owner.');assert.equal(text.includes('synthetic'),true);assert.equal(text.includes('payment.receive'),false);
 assert.deepEqual(decryptTroubleshooting(parseTroubleshootingFile(text),pair.privateKey),payload);
});
test('a changed ciphertext byte, header field (AAD) or key id is rejected',async()=>{
 const envelope=await encryptTroubleshooting(payload,{publicKeyPem:pair.publicKey,environment:'dev',createdAt});
 const bytes=Buffer.from(envelope.ciphertext,'base64');bytes[3]^=1;
 assert.throws(()=>decryptTroubleshooting({...envelope,ciphertext:bytes.toString('base64')},pair.privateKey),{code:'decrypt'});
 assert.throws(()=>decryptTroubleshooting({...envelope,environment:'prod'},pair.privateKey),{code:'decrypt'});
 assert.throws(()=>decryptTroubleshooting({...envelope,createdAt:'2026-10-18T05:06:08.000Z'},pair.privateKey),{code:'decrypt'});
 assert.throws(()=>decryptTroubleshooting({...envelope,keyId:'0'.repeat(64)},pair.privateKey),{code:'key'});
 const other=generateKeyPairSync('rsa',{modulusLength:3072,privateKeyEncoding:{type:'pkcs8',format:'pem'},publicKeyEncoding:{type:'spki',format:'pem'}});
 assert.throws(()=>decryptTroubleshooting(envelope,other.privateKey),{code:'key'});
});
test('the committed public key is RSA-3072 and matches the committed key id',async()=>{
 const pem=readFileSync(new URL('../../apps/pwa/troubleshooting-public-key.pem',import.meta.url),'utf8');
 assert.equal(keyIdOf(pem),troubleshootingKeyId);assert.equal(await browserKeyIdOf(pemToDer(pem)),troubleshootingKeyId);
 assert.equal(troubleshootingKeyId,'77c23e74520a272b6b43d872d7bcf6d88cbae219db8c447e921479abe5783dd6');
 assert.match(pem,/^-----BEGIN PUBLIC KEY-----\n/);assert.equal(pem.includes('PRIVATE'),false);
});
test('the scrubber removes tokens, keys, push endpoints, origins, emails, the raw uid and namespace',()=>{
 const uid='synthetic-owner-uid-123',namespace='mw-credit-dev-owner:https://securetoken.google.com/clever-oasis-508610-n7:'+uid;
 // Assembled at run time so secret scanners do not read these synthetic sentinels as leaked credentials.
 const jwt=['eyJhbGciOiJSUzI1NiJ9','eyJzdWIiOiJzeW50aGV0aWMifQ','c2lnbmF0dXJl'].join('.'),apiKey='AI'+'zaSyD-synthetic-0123456789abcdefghijklmno';
 const dirty={message:'Request failed Authorization: Bearer abc.def-ghi for owner@example.com',stack:'at https://mw-credit-app-read-dev-abc.a.run.app/api/x?key=SECRETVALUE&ok=1\n'+jwt,nested:[{text:'store '+namespace+' uid '+uid+' key '+apiKey},{endpoint:'https://fcm.googleapis.com/fcm/send/abc',idToken:'raw',note:'push https://web.push.apple.com/QWERTY'}],refresh:'AMf-vBsyntheticrefreshtoken0123456789abcdef'};
 const clean=report.scrubTroubleshooting(dirty,[uid,namespace]),text=JSON.stringify(clean);
 for(const sentinel of ['abc.def-ghi','owner@example.com','SECRETVALUE',jwt,'eyJhbGci',apiKey,'AIza',uid,namespace,'mw-credit-app-read-dev-abc','fcm.googleapis.com','"raw"','QWERTY','AMf-vB'])assert.equal(text.includes(sentinel),false,sentinel);
 assert.match(clean.message,/Bearer \[redacted\]/);assert.match(clean.stack,/key=\[redacted\]&ok=1/);assert.equal(clean.nested[1].endpoint,'[redacted]');
 // Sensitive field names match case-insensitively without - and _, by part; the payload's own sections stay.
 const fields=report.scrubTroubleshooting({'x-api-key':'S1',authToken:'S2',sessionToken:'S3',cookie:'S4',Set_Cookie:'S5',client_secret:'S6',privateKey:'S7',PRIVATE_KEY:'S8',credentials:{user:'S9'},Authorization:'S10',session:{status:'signed_out'},sessionStatus:'ready',accountHash:'abc',keyId:'k',requestId:'r'});
 for(const key of ['x-api-key','authToken','sessionToken','cookie','Set_Cookie','client_secret','privateKey','PRIVATE_KEY','credentials','Authorization'])assert.equal(fields[key],'[redacted]',key);
 assert.equal(/"S\d+"/.test(JSON.stringify(fields)),false);assert.deepEqual(fields.session,{status:'signed_out'});assert.equal(fields.sessionStatus,'ready');assert.equal(fields.accountHash,'abc');assert.equal(fields.keyId,'k');assert.equal(fields.requestId,'r');
 const built=report.buildTroubleshootingPayload({app:{},device:{},serviceWorker:{},session:{},events:[{message:'Bearer zzz '+uid}]},{createdAt,secrets:[uid]});
 assert.equal(built.schemaVersion,2);assert.equal(built.createdAt,'2026-10-18T05:06:07.000Z');assert.equal(JSON.stringify(built).includes(uid),false);assert.equal(JSON.stringify(built).includes('zzz'),false);
});
test('failed saves keep full content with receipt images as descriptors; queued rows and signed-out rows are summaries',async()=>{
 const image=new Blob([new Uint8Array([1,2,3,4,5])],{type:'image/jpeg'}),now=Date.parse('2026-10-18T06:00:00Z');
 const blocked={key:'pending:11111111-1111-4111-8111-111111111111',savedAt:now-30*60000,value:{domain:'payment',borrowerLabel:'SYNTHETIC BORROWER',command:{operation:'payment.receive',inputs:{amount:'100.00'}},receipt:{image}},sync:{state:'blocked',code:'stale_version',outcome:{code:'stale_version',status:409},attempted:true,deferred:true}};
 const queued={key:'pending:22222222-2222-4222-8222-222222222222',savedAt:now-5*60000,value:{command:{operation:'borrower.update',inputs:{note:'SYNTHETIC PRIVATE NOTE'}}},sync:{state:'queued',attempted:false}};
 const {failed,queued:rest}=await report.describePendingRows([blocked,queued],now);
 assert.equal(failed.length,1);assert.equal(rest.length,1);
 assert.deepEqual(failed[0].value.receipt.image,{type:'image/jpeg',size:5,sha256:'74f81fe167d99b4cb41d6d0ccda82278caee9f3e2f25d5e5a3936ff3dcec60d0'});
 assert.equal(failed[0].value.borrowerLabel,'SYNTHETIC BORROWER');assert.deepEqual(failed[0].sync,{state:'blocked',code:'stale_version',status:409,outcome:{code:'stale_version',status:409},attempted:true,deferred:true});
 assert.deepEqual(rest[0],{operation:'borrower.update',state:'queued',savedAt:'2026-10-18T05:55:00.000Z',ageMinutes:5});
 assert.equal(JSON.stringify(rest).includes('SYNTHETIC PRIVATE NOTE'),false);
 const signedOut=[blocked,queued].map(report.signedOutPendingRow),text=JSON.stringify(signedOut);
 assert.deepEqual(signedOut[0],{savedAt:'2026-10-18T05:30:00.000Z',operation:'payment.receive',state:'blocked',code:'stale_version',attempted:true,deferred:true});
 for(const content of ['value','SYNTHETIC','100.00','inputs','image','receipt'])assert.equal(text.includes(content),false,content);
});
test('the client event log keeps the last 40 events and cuts message and stack to 2 KB',()=>{
 events.clearClientEvents();assert.equal(events.CLIENT_EVENT_LIMIT,40);
 for(let i=0;i<45;i++)events.recordClientEvent({kind:'error',code:'e'+i,message:i===44?'ก'.repeat(2000):'m',stack:i===44?'x'.repeat(5000):undefined});
 const log=events.clientEvents();assert.equal(log.length,40);assert.equal(log[0].code,'e5');assert.equal(log.at(-1).code,'e44');
 const encoder=new TextEncoder();assert.ok(encoder.encode(log.at(-1).message).length<=2048);assert.ok(encoder.encode(log.at(-1).stack).length<=2048);assert.match(log.at(-1).stack,/…\[truncated\]$/);
 assert.match(log.at(-1).at,/^\d{4}-\d{2}-\d{2}T/);assert.equal(events.clipText('short'),'short');assert.equal(events.clipText(''),undefined);
});
test('at the limit the oldest event that is not session or startup is dropped first; the log stays bounded',()=>{
 events.clearClientEvents();
 events.recordClientEvent({kind:'session',code:'provisional',message:'120ms'});events.recordClientEvent({kind:'dataset-failed',code:'records',message:'503 command_unavailable 1890ms'});
 events.recordClientEvent({kind:'startup',code:'error'});events.recordClientEvent({kind:'session',code:'confirmed',message:'812ms'});
 for(let i=0;i<60;i++)events.recordClientEvent({kind:'error',code:'e'+i});
 let log=events.clientEvents();assert.equal(log.length,40);
 assert.deepEqual(log.slice(0,3).map(event=>event.kind+':'+event.code),['session:provisional','startup:error','session:confirmed']);
 assert.equal(log[3].code,'e23');assert.equal(log.at(-1).code,'e59');assert.equal(log.some(event=>event.kind==='dataset-failed'),false,'other kinds age out oldest first');
 // Only session and startup events: the oldest of them goes.
 events.clearClientEvents();for(let i=0;i<45;i++)events.recordClientEvent({kind:'session',code:'s'+i});
 log=events.clientEvents();assert.equal(log.length,40);assert.equal(log[0].code,'s5');assert.equal(log.at(-1).code,'s44');
});
test('the file name uses Bangkok time',()=>{
 assert.equal(report.troubleshootingFileName('dev',new Date('2026-10-18T17:30:00Z')),'mw-credit-troubleshooting-dev-20261019-0030.txt');
 assert.equal(report.troubleshootingFileName('prod',new Date('2026-01-01T00:05:00Z')),'mw-credit-troubleshooting-prod-20260101-0705.txt');
});
test('the decrypt CLI refuses output inside the repository and decrypts outside it with 0600',async()=>{
 const cli=fileURLToPath(new URL('../../scripts/troubleshooting/decrypt.mjs',import.meta.url)),repo=fileURLToPath(new URL('../..',import.meta.url));
 const work=mkdtempSync(join(tmpdir(),'mw-troubleshooting-'));
 try{
  const file=join(work,'input.txt'),key=join(work,'private.pem');writeFileSync(file,troubleshootingFileText(await encryptTroubleshooting(payload,{publicKeyPem:pair.publicKey,environment:'synthetic',createdAt})));writeFileSync(key,pair.privateKey,{mode:0o600});
  const inside=spawnSync(process.execPath,[cli,file,'--out',join(repo,'decrypted-test-output.json'),'--key-file',key],{encoding:'utf8'});
  assert.equal(inside.status,3);assert.equal(existsSync(join(repo,'decrypted-test-output.json')),false);
  const out=join(work,'out.json'),run=spawnSync(process.execPath,[cli,file,'--out',out,'--key-file',key],{encoding:'utf8'});
  assert.equal(run.status,0,run.stderr);assert.deepEqual(JSON.parse(readFileSync(out,'utf8')),payload);assert.equal(statSync(out).mode&0o777,0o600);
  assert.match(run.stdout,/Environment: synthetic/);assert.match(run.stdout,/Failed saves: 1/);assert.equal((run.stdout+run.stderr).includes('PRIVATE KEY'),false);
  const again=spawnSync(process.execPath,[cli,file,'--out',out,'--key-file',key],{encoding:'utf8'});
  assert.equal(again.status,4);assert.equal(again.stderr.trim(),'Output exists; pass --force to replace it');
  assert.equal(spawnSync(process.execPath,[cli,file,'--out',out,'--key-file',key,'--force']).status,0);assert.equal(statSync(out).mode&0o777,0o600);
  // A symlinked output or parent directory is refused, also with --force; the link target is not written.
  const target=join(work,'target.json'),link=join(work,'link.json');writeFileSync(target,'unchanged');symlinkSync(target,link);
  for(const force of [[],['--force']])assert.equal(spawnSync(process.execPath,[cli,file,'--out',link,'--key-file',key,...force]).status,3);
  assert.equal(readFileSync(target,'utf8'),'unchanged');
  mkdirSync(join(work,'real'));symlinkSync(join(work,'real'),join(work,'linked-dir'));
  assert.equal(spawnSync(process.execPath,[cli,file,'--out',join(work,'linked-dir','out.json'),'--key-file',key]).status,3);assert.equal(existsSync(join(work,'real','out.json')),false);
  const other=generateKeyPairSync('rsa',{modulusLength:3072,privateKeyEncoding:{type:'pkcs8',format:'pem'},publicKeyEncoding:{type:'spki',format:'pem'}}),otherKey=join(work,'other.pem');writeFileSync(otherKey,other.privateKey);
  assert.equal(spawnSync(process.execPath,[cli,file,'--out',join(work,'other.json'),'--key-file',otherKey]).status,2);
 }finally{rmSync(work,{recursive:true,force:true})}
});

// R133: schema 2 (additive) for the R121, R130 and R132 diagnoses.
test('an unreadable receipt blob becomes a descriptor with readable false; its failed row stays',async()=>{
 const broken=new Blob([new Uint8Array([1,2,3])],{type:'image/png'});Object.defineProperty(broken,'arrayBuffer',{value:()=>Promise.reject(Object.assign(new Error('Error preparing Blob/File data'),{name:'NotReadableError'}))});
 const row={key:'pending:33333333-3333-4333-8333-333333333333',savedAt:Date.parse('2026-11-06T06:00:00Z'),value:{command:{operation:'payment.receive'},receipt:{image:broken}},sync:{state:'blocked',code:'saved_receipt_invalid'}};
 const {failed}=await report.describePendingRows([row],Date.parse('2026-11-06T06:10:00Z'));
 assert.equal(failed.length,1);assert.deepEqual(failed[0].value.receipt.image,{type:'image/png',size:3,sha256:null,readable:false,error:'NotReadableError'});
 assert.equal(failed[0].sync.code,'saved_receipt_invalid');
});
test('the scrubber keeps the new section fields and still redacts sensitive names',()=>{
 const sections={app:{startup:{current:{appStart:1,sessionConfirmedMs:812,startupCheckDone:300},previous:null},latestBuild:{version:'a'.repeat(24),release:'R133'},buildMismatch:false},device:{deviceMemory:4,hardwareConcurrency:8,visibilityState:'visible',wasDiscarded:false},serviceWorker:{},session:{auth:'S1',firebase:'S2',idToken:'S3'},
  events:[{kind:'session',code:'confirmed',message:'812ms'},{kind:'sync-outcome',code:'command_busy',ref:'r',message:'409 command_busy'},{kind:'dataset-failed',code:'records',message:'503 command_unavailable 1890ms'}],
  offline:{preparation:{activity:'records,receipts'},domains:[{domain:'records',lastAttemptAt:'2026-11-06T06:00:00.000Z',lastSuccessAt:null,lastFailureAt:'2026-11-06T06:00:01.000Z',lastStatus:503,lastCode:'command_unavailable',lastDurationMs:1890,attempts:3,failures:3}],recentCycles:[{startedAt:'2026-11-06T06:00:00.000Z',trigger:'first',durationMs:1900,failedDomains:['records']}],receiptCounts:{downloaded:1,queued:0,failed:0,refused:1,lastRefusalAt:null},receiptSample:{checked:3,unreadable:1,errors:['NotReadableError']}}};
 const built=report.buildTroubleshootingPayload(sections,{createdAt});
 assert.deepEqual(built.app,sections.app);assert.deepEqual(built.device,sections.device);assert.deepEqual(built.offline,sections.offline);assert.deepEqual(built.events,sections.events);
 assert.equal(built.app.startup.current.sessionConfirmedMs,812);
 for(const key of ['auth','firebase','idToken'])assert.equal(built.session[key],'[redacted]',key);
});
function memoryStorage(initial){const values=new Map(initial?[['mw-credit-startup-timing',initial]]:[]);return {values,getItem:key=>values.get(key)??null,setItem:(key,value)=>{values.set(key,String(value))},removeItem:key=>{values.delete(key)}}}
test('startup timing rotates the previous launch, records each mark once and keeps numbers only',()=>{
 const storage=memoryStorage(JSON.stringify({current:{appStart:100,startupCheckDone:900,note:'text',firstSyncDone:'x'},previous:{appStart:1}}));let now=50;
 const first=timing.createStartupTiming({storage:()=>storage,now:()=>now,wallClock:()=>2000,navigation:{type:'reload',responseEnd:120.4},persist:true});
 assert.deepEqual(first.snapshot(),{current:{appStart:2000,navigationType:1,responseEnd:120},previous:{appStart:100,startupCheckDone:900}});
 now=310.6;assert.equal(first.mark('startupCheckDone'),311);now=900;assert.equal(first.mark('startupCheckDone'),311,'the first time is kept');first.mark('sessionConfirmedMs',812);first.mark('unknownMark');
 const saved=JSON.parse(storage.values.get('mw-credit-startup-timing'));assert.deepEqual(saved.current,{appStart:2000,navigationType:1,responseEnd:120,startupCheckDone:311,sessionConfirmedMs:812,unknownMark:900});
 // The next launch keeps only known numeric marks of this one as previous.
 const second=timing.createStartupTiming({storage:()=>storage,now:()=>0,wallClock:()=>3000,navigation:null,persist:true});
 assert.deepEqual(second.snapshot(),{current:{appStart:3000},previous:{appStart:2000,navigationType:1,responseEnd:120,startupCheckDone:311,sessionConfirmedMs:812}});
 assert.deepEqual(timing.STARTUP_MARKS,['appStart','navigationType','responseEnd','startupCheckDone','provisionalShown','sessionConfirmedMs','workspaceFirstRender','firstSyncDone']);
});
test('startup timing stores nothing until a session exists and removes its key when signed out; memory keeps the launch',()=>{
 const storage=memoryStorage(JSON.stringify({current:{appStart:100},previous:null})),value=timing.createStartupTiming({storage:()=>storage,now:()=>5,wallClock:()=>2000});
 value.mark('startupCheckDone');assert.equal(JSON.parse(storage.values.get('mw-credit-startup-timing')).current.appStart,100,'a signed-out launch writes nothing');
 value.setPersistence(true);assert.deepEqual(JSON.parse(storage.values.get('mw-credit-startup-timing')),{current:{appStart:2000,startupCheckDone:5},previous:{appStart:100}});
 value.setPersistence(false);assert.equal(storage.values.size,0,'sign-out removes the key');value.mark('firstSyncDone');assert.equal(storage.values.size,0);
 assert.deepEqual(value.snapshot().current,{appStart:2000,startupCheckDone:5,firstSyncDone:5});
});
test('a broken or blocked startup-timing storage loses only the record',()=>{
 for(const storage of [()=>null,()=>{throw Error('SecurityError')},()=>({getItem:()=>'{not json',setItem:()=>{throw Error('QuotaExceededError')},removeItem:()=>{throw Error('SecurityError')}})]){
  const value=timing.createStartupTiming({storage,now:()=>42,wallClock:()=>7,persist:true});
  assert.deepEqual(value.snapshot(),{current:{appStart:7},previous:null});assert.equal(value.mark('workspaceFirstRender'),42);value.setPersistence(false);value.setPersistence(true);
 }
 assert.deepEqual(timing.startupTimingSnapshot(),{current:{},previous:null},'no window: an empty record');assert.equal(timing.recordStartupMark('appStart'),undefined);assert.equal(timing.setStartupTimingPersistence(true),undefined);
});
test('busy and queued sync results are logged once per request id and code',()=>{
 events.clearClientEvents();
 const a='44444444-4444-4444-8444-444444444444',b='55555555-5555-4555-8555-555555555555';
 for(let i=0;i<3;i++)events.recordSyncOutcome({requestId:a,kind:'queued',status:409,code:'command_busy'});
 events.recordSyncOutcome({requestId:a,kind:'queued',status:503,code:'command_unavailable'});
 events.recordSyncOutcome({requestId:b,kind:'busy',status:409,code:'command_busy'});
 events.recordSyncOutcome({requestId:b,kind:'synced',status:200,code:'x'});events.recordSyncOutcome({requestId:b,kind:'queued'});events.recordSyncOutcome(null);
 const log=events.clientEvents().map(event=>[event.kind,event.code,event.ref,event.message]);
 assert.deepEqual(log,[['sync-outcome','command_busy',a,'409 command_busy'],['sync-outcome','command_unavailable',a,'503 command_unavailable'],['sync-outcome','command_busy',b,'409 command_busy']]);
 events.clearClientEvents();events.recordSyncOutcome({requestId:a,kind:'queued',status:409,code:'command_busy'});assert.equal(events.clientEvents().length,1,'clearing the log forgets what was logged');
});
test('the decrypt CLI prints the schema, each domain and the startup marks; a schema 1 file prints unknown',async()=>{
 const cli=fileURLToPath(new URL('../../scripts/troubleshooting/decrypt.mjs',import.meta.url)),work=mkdtempSync(join(tmpdir(),'mw-troubleshooting-'));
 try{
  const key=join(work,'private.pem');writeFileSync(key,pair.privateKey,{mode:0o600});
  const decrypt=async(content,name)=>{const file=join(work,name+'.txt');writeFileSync(file,troubleshootingFileText(await encryptTroubleshooting(content,{publicKeyPem:pair.publicKey,environment:'synthetic',createdAt})));const run=spawnSync(process.execPath,[cli,file,'--out',join(work,name+'.json'),'--key-file',key],{encoding:'utf8'});assert.equal(run.status,0,run.stderr);assert.deepEqual(JSON.parse(readFileSync(join(work,name+'.json'),'utf8')),content);return run.stdout};
  const v2=await decrypt({schemaVersion:2,createdAt:createdAt.toISOString(),app:{release:'R133',startup:{current:{appStart:1,startupCheckDone:300,sessionConfirmedMs:812},previous:null}},events:[],offline:{domains:[{domain:'records',lastStatus:503,lastCode:'command_unavailable',lastSuccessAt:null,lastFailureAt:new Date(createdAt.getTime()-2*60000).toISOString()},{domain:'cash',lastStatus:200,lastCode:null,lastSuccessAt:new Date(createdAt.getTime()-5*60000).toISOString()}]}},'v2');
  assert.match(v2,/^Schema: 2$/m);assert.match(v2,/^ {2}records: status 503, code command_unavailable, last success unknown, last failure 2 min ago$/m);assert.match(v2,/^ {2}cash: status 200, code unknown, last success 5 min ago, last failure unknown$/m);
  assert.match(v2,/^Startup: startupCheckDone 300 ms, provisionalShown unknown, sessionConfirmedMs 812 ms, workspaceFirstRender unknown, firstSyncDone unknown$/m);
  const v1=await decrypt({...payload,offline:{domains:[{domain:'records',complete:true,partial:false}]}},'v1');
  assert.match(v1,/^Schema: 1$/m);assert.match(v1,/^ {2}records: status unknown, code unknown, last success unknown, last failure unknown$/m);assert.match(v1,/^Startup: startupCheckDone unknown/m);
  const bare=await decrypt(payload,'bare');assert.match(bare,/^Domains: unknown$/m);assert.match(bare,/Failed saves: 1/);
 }finally{rmSync(work,{recursive:true,force:true})}
});
