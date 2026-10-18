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
const envelopeModule=await load('troubleshooting-envelope.ts'),report=await load('troubleshooting-report.ts'),events=await load('client-events.ts');
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
 assert.equal(built.schemaVersion,1);assert.equal(built.createdAt,'2026-10-18T05:06:07.000Z');assert.equal(JSON.stringify(built).includes(uid),false);assert.equal(JSON.stringify(built).includes('zzz'),false);
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
test('the client event log keeps the last 25 events and cuts message and stack to 2 KB',()=>{
 events.clearClientEvents();
 for(let i=0;i<30;i++)events.recordClientEvent({kind:'error',code:'e'+i,message:i===29?'ก'.repeat(2000):'m',stack:i===29?'x'.repeat(5000):undefined});
 const log=events.clientEvents();assert.equal(log.length,25);assert.equal(log[0].code,'e5');assert.equal(log.at(-1).code,'e29');
 const encoder=new TextEncoder();assert.ok(encoder.encode(log.at(-1).message).length<=2048);assert.ok(encoder.encode(log.at(-1).stack).length<=2048);assert.match(log.at(-1).stack,/…\[truncated\]$/);
 assert.match(log.at(-1).at,/^\d{4}-\d{2}-\d{2}T/);assert.equal(events.clipText('short'),'short');assert.equal(events.clipText(''),undefined);
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
