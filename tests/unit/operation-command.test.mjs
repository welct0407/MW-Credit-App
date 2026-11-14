import {canonicalLoanFields} from '../../services/business/loans.mjs';
import test from 'node:test';import assert from 'node:assert/strict';import {canonicalOperation,operationIdentity} from '../../services/contracts/operation-command.mjs';
const fields={name:'ชื่อ ไทย',description:null,communicationName:null,instagramUsername:null,city:null,workingLocation:null,address:null,hidden:null,referrerId:null,preferredReceivingAccountId:null,note:' exact\n '};
const command={requestId:'12345678-1234-4234-8234-123456789abc',operation:'borrower.create',targetId:'12345678-1234-4234-8234-123456789abd',expectedVersion:null,predecessorRequestId:null,inputs:fields,receiptId:null};const actor={issuer:'https://securetoken.google.com/fixture',subject:'fixture-owner',partnerId:'fixture-partner',loginEmail:'owner@example.invalid'};

test('optional borrower AI toggle does not inject a field into old command identities',()=>{const legacy=canonicalOperation(command);assert.deepEqual(legacy.inputs,fields);assert.equal(Object.hasOwn(legacy.inputs,'aiCollectionEnabled'),false);for(const flag of[true,false,null]){const updated=canonicalOperation({...command,inputs:{...fields,aiCollectionEnabled:flag}});assert.equal(updated.inputs.aiCollectionEnabled,flag);assert.equal(Object.keys(updated.inputs).at(-1),'aiCollectionEnabled');assert.notEqual(operationIdentity(updated,actor).payloadSha256,operationIdentity(command,actor).payloadSha256)}for(const flag of['true',0,{},undefined])assert.throws(()=>canonicalOperation({...command,inputs:{...fields,aiCollectionEnabled:flag}}));});

test('partner delivery emails and editable flags remain separate from forged actor fields',()=>{const inputs={partnerName:'Synthetic partner',partnerRole:'B',loginEmail:null,email:'valid+alias@example.test',instagramUsername:null,languagePreference:'English',igIntegrationEnabled:true,aiReviewer:true};const c={...command,operation:'partner.create',inputs};assert.deepEqual(canonicalOperation(c).inputs,inputs);for(const email of['bad','a\n@example.test','x'.repeat(321)+'@example.test'])assert.throws(()=>canonicalOperation({...c,inputs:{...inputs,email}}));for(const forged of['actor','partnerId','capability','enrolled'])assert.throws(()=>canonicalOperation({...c,inputs:{...inputs,[forged]:true}}));assert.throws(()=>canonicalOperation({...c,inputs:{...inputs,aiReviewer:'true'}}));});
test('operation identities bind stable closed source inputs and server actor',()=>{const identity=operationIdentity(command,actor);assert.equal(JSON.parse(identity.canonicalJson).contractVersion,2);assert.equal(JSON.parse(identity.canonicalJson).command.inputs.note,fields.note);assert.equal(operationIdentity({...command,inputs:{...fields}},actor).payloadSha256,identity.payloadSha256);assert.notEqual(operationIdentity({...command,inputs:{...fields,note:'changed'}},actor).payloadSha256,identity.payloadSha256);assert.notEqual(operationIdentity(command,{...actor,subject:'other'}).payloadSha256,identity.payloadSha256);for(const invalid of [{...command,actor},{...command,operation:'arbitrary.sql'},{...command,receiptId:command.requestId},{...command,inputs:{...fields,createdDate:'2026-10-08'}},{...command,expectedVersion:'a'.repeat(64)}])assert.throws(()=>canonicalOperation(invalid));});

test('loan codec preserves decimal precision and nullable legacy terms without inventing an arrangement enum',()=>{
 const fields={borrowerId:'B',loanDate:'2026-10-08',principal:'100.25',transferFee:'0.50',disbursingAccountId:'A',type:'ดอกเบี้ยรายวัน',dueDate:null,dailyPayment:null,fixedInterest:null,currentDailyInterest:'5.25',paymentInterval:1,arrangement:' exact ไทย ',autoChargeEnabled:true};
 assert.deepEqual(canonicalLoanFields(fields,{create:true}),fields);
 for(const value of ['1.001','-1','1e2',1])assert.throws(()=>canonicalLoanFields({...fields,principal:value},{create:true}));
 assert.throws(()=>canonicalLoanFields({...fields,loanDate:'2026-02-30'},{create:true}));
 assert.deepEqual(canonicalLoanFields({...fields,principal:null}),{...fields,principal:null});
 assert.throws(()=>canonicalLoanFields({...fields,principal:null},{create:true}));
 assert.throws(()=>canonicalLoanFields({...fields,originalRate:5},{create:true}));
});

test('R104 loan.book-projected-charge: a versioned loan target, closed date and whole-baht inputs, canonical key order',()=>{
 const version='a'.repeat(64),book={requestId:'12345678-1234-4234-8234-123456789abc',operation:'loan.book-projected-charge',targetId:'LOAN-1',expectedVersion:version,predecessorRequestId:null,receiptId:null,inputs:{interestDue:'70',chargeDate:'2026-11-01',principalDue:'0'}};
 const canonical=canonicalOperation(book);
 assert.deepEqual(Object.keys(canonical.inputs),['chargeDate','principalDue','interestDue'],'the SQL canonical order');
 const json=operationIdentity(book,actor).canonicalJson;
 assert.ok(json.includes('"operation":"loan.book-projected-charge","targetType":"loan","targetId":"LOAN-1","expectedVersion":"'+version+'"'));
 assert.ok(json.includes('"inputs":{"chargeDate":"2026-11-01","principalDue":"0","interestDue":"70"}'),'the charge id is derived, never an input');
 assert.equal(operationIdentity({...book,inputs:{chargeDate:'2026-11-01',principalDue:'0',interestDue:'70'}},actor).payloadSha256,operationIdentity(book,actor).payloadSha256);
 const bad=[{...book,expectedVersion:null},{...book,expectedVersion:'A'.repeat(64)},{...book,receiptId:'12345678-1234-4234-8234-123456789abe'},{...book,predecessorRequestId:'12345678-1234-4234-8234-123456789abe'},
  {...book,inputs:{...book.inputs,chargeId:'cg8:6:LOAN-1:2026-11-01'}},{...book,inputs:{chargeDate:'2026-11-01',principalDue:'0'}}];
 for(const [key,value] of [['chargeDate','2026-02-30'],['chargeDate','2026-11-1'],['chargeDate',null],['principalDue','0.5'],['principalDue','-1'],['principalDue','01'],['principalDue',0],['interestDue','1e2'],['interestDue','92233720368547759'],['interestDue','0']])bad.push({...book,inputs:{...book.inputs,principalDue:key==='interestDue'&&value==='0'?'0':book.inputs.principalDue,[key]:value}});
 for(const value of bad)assert.throws(()=>canonicalOperation(value),/invalid_request/,JSON.stringify(value.inputs));
 assert.doesNotThrow(()=>canonicalOperation({...book,inputs:{chargeDate:'2026-11-01',principalDue:'16',interestDue:'0'}}),'one component may be zero');
});

test('R111 loan.close takes an optional rebatePath (offset | expense) as its last input; without it the close is unchanged',()=>{
 const inputs={paymentDate:'2026-11-02',cashAccountId:'CI-LISA',paymentMethod:'Cash',notes:null,expectedAmount:'1000',expectedPlanHash:'a'.repeat(64)};
 const close={requestId:'22345678-1234-4234-8234-123456789abc',operation:'loan.close',targetId:'L-1',expectedVersion:'b'.repeat(64),predecessorRequestId:null,inputs,receiptId:null};
 const legacy=canonicalOperation(close);assert.deepEqual(Object.keys(legacy.inputs),['paymentDate','cashAccountId','paymentMethod','notes','expectedAmount','expectedPlanHash']);
 for(const rebatePath of ['offset','expense']){const value=canonicalOperation({...close,inputs:{rebatePath,...inputs}});assert.deepEqual(Object.keys(value.inputs).at(-1),'rebatePath');assert.equal(value.inputs.rebatePath,rebatePath);
  assert.match(operationIdentity({...close,inputs:{...inputs,rebatePath}},actor).canonicalJson,new RegExp('"expectedPlanHash":"a{64}","rebatePath":"'+rebatePath+'"\\}'));}
 for(const rebatePath of ['Offset','payout',null,1])assert.throws(()=>canonicalOperation({...close,inputs:{...inputs,rebatePath}}),undefined,String(rebatePath));
});

test('R120 borrower referral rebate terms: optional whole numbers after aiCollectionEnabled, canonical JSON numbers, invalid values refused',()=>{
 const legacy=operationIdentity(command,actor);assert.equal(JSON.parse(legacy.canonicalJson).command.inputs.referralRebateRate,undefined,'absent keys stay absent');
 for(const [rate,cap] of [[15,1500],[0,null],[null,1],[100,999999999999],[null,null]]){
  const inputs={...fields,aiCollectionEnabled:true,referralRebateRate:rate,referralRebateCap:cap},canonical=canonicalOperation({...command,inputs});
  assert.deepEqual(Object.keys(canonical.inputs).slice(-3),['aiCollectionEnabled','referralRebateRate','referralRebateCap'],'the SQL order');
  assert.ok(operationIdentity({...command,inputs},actor).canonicalJson.includes('"aiCollectionEnabled":true,"referralRebateRate":'+JSON.stringify(rate)+',"referralRebateCap":'+JSON.stringify(cap)+'}'),'JSON numbers, never strings');
 }
 // Either key alone; the order is fixed whatever order the client sent.
 assert.deepEqual(Object.keys(canonicalOperation({...command,inputs:{referralRebateCap:150,...fields}}).inputs).at(-1),'referralRebateCap');
 assert.deepEqual(Object.keys(canonicalOperation({...command,inputs:{referralRebateCap:150,referralRebateRate:5,...fields}}).inputs).slice(-2),['referralRebateRate','referralRebateCap']);
 for(const bad of [{referralRebateRate:'15'},{referralRebateRate:12.5},{referralRebateRate:101},{referralRebateRate:-1},{referralRebateRate:true},{referralRebateRate:Number.NaN},
  {referralRebateCap:0},{referralRebateCap:'1000'},{referralRebateCap:1.5},{referralRebateCap:1e12},{referralRebateCap:-5}])
  assert.throws(()=>canonicalOperation({...command,inputs:{...fields,...bad}}),/invalid_request/,JSON.stringify(bad));
});

// R153 (V148): the borrower's Instagram group chat link. Invented thread ids and links only.
test('R153 borrower igGroupUrl: optional, canonical last, absent stays absent, the link rule shared with SQL and the PWA',async()=>{
 const legacy=canonicalOperation(command);assert.equal(Object.hasOwn(legacy.inputs,'igGroupUrl'),false,'absent stays absent');
 assert.equal(JSON.parse(operationIdentity(command,actor).canonicalJson).command.inputs.igGroupUrl,undefined);
 const good=['https://www.instagram.com/direct/t/100000000000001/','https://instagram.com/direct/t/100000000000001','https://ig.me/j/InventedLink01/','https://www.instagram.com/direct/t/1?ref=x&y=1~2%20','https://ig.me/'+'a'.repeat(255)];
 for(const url of [...good,null]){
  const inputs={igGroupUrl:url,referralRebateCap:150,...fields,aiCollectionEnabled:true,referralRebateRate:5},canonical=canonicalOperation({...command,inputs});
  assert.deepEqual(Object.keys(canonical.inputs).slice(-4),['aiCollectionEnabled','referralRebateRate','referralRebateCap','igGroupUrl'],'the SQL order: after referralRebateCap');
  assert.equal(canonical.inputs.igGroupUrl,url);
  assert.ok(operationIdentity({...command,inputs},actor).canonicalJson.endsWith('"referralRebateCap":150,"igGroupUrl":'+JSON.stringify(url)+'}},"receipt":null}'),String(url));
 }
 // Alone after note, as the PWA sends it on a record without the other optional keys.
 assert.deepEqual(Object.keys(canonicalOperation({...command,inputs:{igGroupUrl:good[0],...fields}}).inputs).slice(-2),['note','igGroupUrl']);
 const bad=['http://www.instagram.com/direct/t/100000000000001/','https://www.example.invalid/direct/t/1/','https://user@www.instagram.com/direct/t/1/','https://www.instagram.com.example.invalid/direct/t/1/',
  'https://www.instagram.com/invented_user/','https://www.instagram.com/direct/t/1 2/','https://www.instagram.com/direct/t/1#x','https://ig.me/'+'a'.repeat(256),'https://ig.me/','',' https://ig.me/j/InventedLink01/',
  'https://ig.me/j/InventedLink01/\n','HTTPS://ig.me/j/InventedLink01/','https://m.instagram.com/direct/t/1/',1,true,{},['https://ig.me/j/InventedLink01/']];
 for(const url of bad)assert.throws(()=>canonicalOperation({...command,inputs:{...fields,igGroupUrl:url}}),/invalid_request/,JSON.stringify(url));
 // One rule: the services' pattern, the PWA's and the SQL text in V148 (column check and command) are the same.
 const {IG_GROUP_URL_PATTERN}=await import('../../services/api/collection-read-contract.mjs');const pwa=await import('../../apps/pwa/src/ig-group-url.ts');
 assert.equal(pwa.IG_GROUP_URL_PATTERN.source,IG_GROUP_URL_PATTERN.source);assert.equal(IG_GROUP_URL_PATTERN.flags,'');assert.equal(pwa.IG_GROUP_URL_PATTERN.flags,'');
 const {readFileSync}=await import('node:fs'),migration=readFileSync(new URL('../../database/migrations/V148__borrower_ig_group_url.sql',import.meta.url),'utf8');
 const sqlRule=IG_GROUP_URL_PATTERN.source.replaceAll('\\/','/');
 assert.equal(migration.split("'"+sqlRule+"'").length-1,10,'the column check, the command and the eight self-check probes use the same text');
 // The PWA form value: trimmed, blank is null, undefined stays absent, anything else must match.
 assert.deepEqual([undefined,null,'','   ',' '+good[0]+' ','x'].map(pwa.igGroupUrlValue),[{ok:true,value:undefined},{ok:true,value:null},{ok:true,value:null},{ok:true,value:null},{ok:true,value:good[0]},{ok:false}]);
});

// R154 (V149): the group's invite link. Invented links only.
test('R154 borrower igGroupInviteLink: optional, right after igGroupUrl, ig.me/j only; the rule shared with SQL and the PWA; the device choice',async()=>{
 assert.equal(Object.hasOwn(canonicalOperation(command).inputs,'igGroupInviteLink'),false,'absent stays absent');
 const good=['https://ig.me/j/AbCdEfGh12345678/','https://ig.me/j/AbCdEfGh12345678','https://ig.me/j/'+'a'.repeat(255)];
 for(const invite of [...good,null]){
  const inputs={igGroupInviteLink:invite,igGroupUrl:'https://www.instagram.com/direct/t/100000000000001/',referralRebateCap:150,...fields,aiCollectionEnabled:true,referralRebateRate:5},canonical=canonicalOperation({...command,inputs});
  assert.deepEqual(Object.keys(canonical.inputs).slice(-5),['aiCollectionEnabled','referralRebateRate','referralRebateCap','igGroupUrl','igGroupInviteLink'],'the SQL order: right after igGroupUrl');
  assert.ok(operationIdentity({...command,inputs},actor).canonicalJson.endsWith('"igGroupUrl":"https://www.instagram.com/direct/t/100000000000001/","igGroupInviteLink":'+JSON.stringify(invite)+'}},"receipt":null}'),String(invite));
 }
 assert.deepEqual(Object.keys(canonicalOperation({...command,inputs:{igGroupInviteLink:good[0],...fields}}).inputs).slice(-2),['note','igGroupInviteLink'],'alone after note');
 const bad=['https://www.instagram.com/direct/t/100000000000001/','http://ig.me/j/AbCdEfGh12345678/','https://ig.me/m/invented_user/','https://ig.me/AbCd','https://ig.me/j/','','https://user@ig.me/j/AbCd/',
  'https://ig.me/j/Ab Cd/','https://ig.me/j/AbCd#x','https://ig.me/j/'+'a'.repeat(256),' https://ig.me/j/AbCd/',1,true,{}];
 for(const invite of bad)assert.throws(()=>canonicalOperation({...command,inputs:{...fields,igGroupInviteLink:invite}}),/invalid_request/,JSON.stringify(invite));
 // An ig.me/j link stays valid as the group link too (R153 rule unchanged).
 assert.doesNotThrow(()=>canonicalOperation({...command,inputs:{...fields,igGroupUrl:good[0]}}));
 const {IG_GROUP_INVITE_PATTERN}=await import('../../services/api/collection-read-contract.mjs');const pwa=await import('../../apps/pwa/src/ig-group-url.ts');
 assert.equal(pwa.IG_GROUP_INVITE_PATTERN.source,IG_GROUP_INVITE_PATTERN.source);assert.equal(IG_GROUP_INVITE_PATTERN.flags,'');
 const {readFileSync}=await import('node:fs'),migration=readFileSync(new URL('../../database/migrations/V149__borrower_ig_group_invite_link.sql',import.meta.url),'utf8');
 assert.equal(migration.split("'"+IG_GROUP_INVITE_PATTERN.source.replaceAll('\\/','/')+"'").length-1,11,'the column check, the command and the nine self-check probes use the same text');
 assert.deepEqual([undefined,null,'  ',' '+good[0]+' ','https://www.instagram.com/direct/t/1/'].map(pwa.igGroupInviteValue),[{ok:true,value:undefined},{ok:true,value:null},{ok:true,value:null},{ok:true,value:good[0]},{ok:false}]);
 // D4: the device and the link it opens. Synthetic user agents.
 const iphone='Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  ipados='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
  android='Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
  windows='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
 assert.deepEqual([{userAgent:iphone},{userAgent:ipados,maxTouchPoints:5},{userAgent:ipados,maxTouchPoints:0},{userAgent:android},{userAgent:windows,maxTouchPoints:10},{},undefined].map(pwa.chatDevice),['phone','phone','computer','phone','computer','computer','computer']);
 const web='https://www.instagram.com/direct/t/100000000000001/',invite=good[0],urlInvite='https://ig.me/j/ZyXwVuTs98765432',other='https://ig.me/m/invented_user/';
 const pick=(links,device)=>pwa.chooseChatLink(links,device);
 assert.equal(pick({url:web,inviteUrl:invite},'phone'),invite);assert.equal(pick({url:web,inviteUrl:invite},'computer'),web);
 assert.equal(pick({url:urlInvite},'phone'),urlInvite,'phone: the group link when it is an invite link');assert.equal(pick({url:web},'phone'),web,'phone: any valid link');
 assert.equal(pick({inviteUrl:invite},'computer'),invite,'computer: any valid link');assert.equal(pick({url:other,inviteUrl:invite},'computer'),other);assert.equal(pick({url:other,inviteUrl:invite},'phone'),invite);
 assert.equal(pick({url:'javascript:alert(1)',inviteUrl:'https://ig.me/m/x'},'phone'),null);assert.equal(pick({},'computer'),null);
});
