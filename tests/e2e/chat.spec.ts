import {test,expect,chromium,devices,type BrowserContext,type Page} from '@playwright/test';
import {spawnSync} from 'node:child_process';import {mkdtempSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {startCanonicalFixture,fixtureLaunchArgs,assertServed} from './fixtures/canonical-server';
import {chooseLanguage as chooseLiveLanguage} from './live-controls';

// R090 in-app chat (design §6, §10): the live-dev bundle with a stubbed chat origin. Reads, thread writes and outcome
// polls go through context.route; the streamed turn POST is served in the page by a fetch shim the test feeds event by
// event, so the provisional, retract and dropped-stream states are deterministic; the shim also records the turn's
// presence POSTs and outcome polls in order (__chatLog). Screenshots for review land in
// test-results/r090-chat (CHAT_CAPTURE_ROOT overrides).
const host='dev-lm.mw-credit.com',readHost='mw-credit-app-read-dev-test.run.app',commandHost='mw-credit-app-command-dev-test.run.app',chatHost='mw-credit-app-chat-dev-test.run.app',chatOrigin='https://'+chatHost;
const uid='synthetic-chat-owner',shots=process.env.CHAT_CAPTURE_ROOT??'test-results/r090-chat';
let fixture:any,root:string,mobile=false,project='';
test.beforeEach(async({browserName:_browser},info)=>{project=info.project.name;mobile=project.startsWith('mobile')});
function build(outDir:string,withChat:boolean,notifications=false){
 const transform=(code:string,id:string)=>id.endsWith('/apps/pwa/src/live-main.tsx')?code+";import {getAuth as fixtureGetAuth,signInWithCustomToken as fixtureSignIn} from 'firebase/auth';globalThis.__syntheticSdk={fixtureGetAuth,fixtureSignIn};":undefined;
 const script='import{build}from"vite";await build(Object.assign('+JSON.stringify({mode:'live-dev',logLevel:'warn',build:{outDir,emptyOutDir:true}})+',{plugins:[{name:"synthetic-sdk-bridge",enforce:"pre",transform:'+transform.toString()+'}]}));';
 const env:Record<string,string|undefined>={...process.env,VITE_FIREBASE_PROJECT_ID:'clever-oasis-508610-n7',VITE_FIREBASE_AUTH_DOMAIN:'clever-oasis-508610-n7.firebaseapp.com',VITE_FIREBASE_API_KEY:'synthetic-public-key',VITE_FIREBASE_APP_ID:'synthetic-app',VITE_API_ORIGIN:'https://'+readHost,VITE_COMMAND_API_ORIGIN:'https://'+commandHost,VITE_COMMAND_MODE:'dev-owner-testing',VITE_CHAT_API_ORIGIN:withChat?chatOrigin:undefined,...(notifications?{VITE_NOTIFICATIONS:'enabled'}:{})};
 if(!withChat)delete env.VITE_CHAT_API_ORIGIN;
 const result=spawnSync(process.execPath,['--input-type=module','-e',script],{encoding:'utf8',env});expect(result.status,result.stderr).toBe(0);
}
test.beforeAll(async()=>{root=mkdtempSync(join(tmpdir(),'mw-chat-e2e-'));build(join(root,'chat'),true);build(join(root,'plain'),false);build(join(root,'notify'),true,true);fixture=await startCanonicalFixture(join(root,'chat'))});
test.afterAll(async()=>{await fixture?.close();rmSync(root,{recursive:true,force:true})});
test.setTimeout(60000);

const iso=(minutesAgo:number)=>new Date(Date.now()-minutesAgo*60000).toISOString();
const models={version:1,default:'gemini-a',models:[{id:'gemini-a',label:'Gemini A',available:true},{id:'gemini-b',label:'Gemini B',available:true},{id:'gemini-c',label:'Gemini C',available:false,reason:'pending live check'}]};
const T1='11111111-1111-4111-8111-111111111111',T2='22222222-2222-4222-8222-222222222222',T3='33333333-3333-4333-8333-333333333333';
const reply='Payoff for **Somchai** today is **12,450** baht.\n\n- Principal: 12,000\n- Interest: 450\n\n| Loan | Principal | Interest |\n|---|---:|---:|\n| L-0042 | 12,000 | 450 |';
const seeded=()=>({
 threads:[{id:T1,title:'Payoff for Somchai today',model:'gemini-a',status:'active',createdAt:iso(90),lastMessageAt:iso(5),messageCount:4},{id:T2,title:'Profit this month',model:'gemini-b',status:'active',createdAt:iso(6000),lastMessageAt:iso(4400),messageCount:2},{id:T3,title:'Old cash question',model:'gemini-a',status:'archived',createdAt:iso(30000),lastMessageAt:iso(30000),messageCount:2}],
 messages:{[T1]:[
  {id:'aaaaaaaa-0000-4000-8000-000000000001',seq:0,role:'user',text:'Payoff for Somchai today?',status:'ok',createdAt:iso(10)},
  {id:'aaaaaaaa-0000-4000-8000-000000000002',seq:1,role:'assistant',text:reply,status:'ok',model:'gemini-a',createdAt:iso(9),tools:[{name:'read_records',count:2},{name:'loan_payoff',count:1}]},
  {id:'aaaaaaaa-0000-4000-8000-000000000003',seq:2,role:'user',text:'And every loan that is overdue by more than 90 days, with the total?',status:'ok',createdAt:iso(6)},
  {id:'aaaaaaaa-0000-4000-8000-000000000004',seq:3,role:'assistant',text:'I could not complete this request. Check the app before asking again.',status:'failed',errorCode:'TURN_TIMEOUT',model:'gemini-a',createdAt:iso(5)},
 ],[T2]:[{id:'bbbbbbbb-0000-4000-8000-000000000001',seq:0,role:'user',text:'Profit this month',status:'ok'},{id:'bbbbbbbb-0000-4000-8000-000000000002',seq:1,role:'assistant',text:'Profit this month is **8,200** baht.',status:'ok',model:'gemini-0-retired',tools:[{name:'sql_query',count:1}]}],[T3]:[]} as Record<string,any[]>,
});
type Stub={threads:any[];messages:Record<string,any[]>;creates:any[];patches:any[];polls:string[];outcomes:any[];presence:string[];presenceStatus:number|null;denied:boolean;patchStatus:number|null;
 proposalRequests:{method:string;path:string;body:string|null;authorization:string|null}[];confirmAnswer:any;proposalReads:any[]};
// R106: a reply that proposed a payment (server-built card; synthetic borrower and amounts), pending for 15 minutes.
const P1='dddddddd-0000-4000-8000-000000000001';
const paymentProposal=(patch:Record<string,unknown>={})=>({id:P1,threadId:T1,messageId:'aaaaaaaa-0000-4000-8000-000000000005',kind:'payment',operation:'payment.record',state:'pending',
 expiresAt:new Date(Date.now()+15*60000).toISOString(),createdAt:new Date().toISOString(),settledAt:null,outcome:null,record:null,
 card:{version:1,operation:'payment.record',label:{en:'Record payment',th:'บันทึกรับชำระ'},confirmLabel:{en:'Record ฿700',th:'บันทึก ฿700'},destructive:false,target:{type:'borrower',id:'B1',label:'Somchai'},changes:[],
  values:[{field:'amountReceived',label:{en:'Amount received',th:'ยอดรับชำระ'},type:'whole',value:'700'},{field:'paymentDate',label:{en:'Payment date',th:'วันที่รับชำระ'},type:'date',value:'2026-10-30'},
   {field:'paymentMethod',label:{en:'Payment method',th:'วิธีรับชำระ'},type:'enum',value:'Cash'},{field:'cashAccountId',label:{en:'Receiving account',th:'บัญชีรับเงิน'},type:'account',value:'CA1',display:'Cash box'}],
  split:[{chargeId:'C2',loanDisplayKey:'Somchai-฿10,000-01/10-1%',chargeDate:'2026-10-29',principal:'0',interest:'100',projected:false},{chargeId:'C1',loanDisplayKey:'Somchai-฿10,000-01/10-1%',chargeDate:'2026-10-28',principal:'500',interest:'100',projected:false}],
  consequences:[{code:'settles_all_due'}]},...patch});
// D12: a group of charge edits (one card, Confirm all); each line shows its changed field only, never the long note.
const G='eeeeeeee-0000-4000-8000-000000000000';
const chargeGroup=(count:number)=>Array.from({length:count},(_,index)=>{const id=G.slice(0,-1)+index,ids=Array.from({length:count},(_,i)=>G.slice(0,-1)+i);return {id,threadId:T1,messageId:'aaaaaaaa-0000-4000-8000-000000000007',kind:'operation',operation:'charge.update',state:'pending',
 expiresAt:new Date(Date.now()+15*60000).toISOString(),createdAt:new Date().toISOString(),settledAt:null,outcome:null,record:null,
 card:{version:1,operation:'charge.update',label:{en:'Edit charge',th:'แก้ไขรายการเรียกเก็บ'},confirmLabel:null,destructive:false,target:{type:'charge',id:'C'+index,label:`Somchai · ${20+index}-Oct-2026`},
  group:{id:ids[0],index,count,ids},
  values:[{field:'interestAmount',label:{en:'Interest',th:'ดอกเบี้ย'},type:'money',value:'90.00'},{field:'principalAmount',label:{en:'Principal',th:'เงินต้น'},type:'money',value:'0.00'},
   {field:'notes',label:{en:'Notes',th:'หมายเหตุ'},type:'text',value:'A long synthetic note that must never be repeated on the card. '.repeat(4)}],
  changes:[{field:'interestAmount',label:{en:'Interest',th:'ดอกเบี้ย'},type:'money',before:'100.00',after:'90.00'}],consequences:[]}}}).map((line,index)=>index?line:
 // CW3-01: the group's destructive line (the service puts it first): a charge delete.
 {...line,operation:'charge.delete',card:{...line.card,operation:'charge.delete',label:{en:'Delete charge',th:'ลบรายการเรียกเก็บ'},destructive:true,values:[],changes:[],consequences:[{code:'destructive'}]}});
const ev=(name:string,data:unknown)=>`event: ${name}\ndata: ${JSON.stringify(data)}\n\n`;
async function feed(page:Page,...chunks:string[]){for(const chunk of chunks)await page.evaluate(text=>(window as any).__chatStreams.at(-1).push(text),chunk)}
const streams=(page:Page)=>page.evaluate(()=>(window as any).__chatStreams.map((entry:any)=>({url:entry.url,body:entry.body,headers:entry.headers})));
const chatLog=(page:Page)=>page.evaluate(()=>(window as any).__chatLog as any[]);
const hide=(page:Page,event:'visibilitychange'|'pagehide'='visibilitychange')=>page.evaluate(name=>{
 Object.defineProperty(document,'visibilityState',{configurable:true,get:()=>'hidden'});
 if(name==='pagehide')window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true}));else document.dispatchEvent(new Event('visibilitychange'))},event);
const show=(page:Page)=>page.evaluate(()=>{delete (document as any).visibilityState;document.dispatchEvent(new Event('visibilitychange'))});

async function launch({seed=false,denied=false,width,path='',target,configure,proposal=false,group=false}:{seed?:boolean;denied?:boolean;width?:number;path?:string;target?:{kind:string;id:string};configure?:(context:BrowserContext)=>Promise<void>;proposal?:boolean;group?:boolean}={}){
 const device=mobile?devices['Pixel 7']:devices['Desktop Chrome'];
 const context=await chromium.launchPersistentContext('',{headless:true,...device,viewport:width?{width,height:mobile?915:900}:mobile?device.viewport:{width:1440,height:900},args:fixtureLaunchArgs(fixture.port,[],host)});
 context.setDefaultTimeout(5000);
 const page=await context.newPage();page.on('pageerror',error=>console.log('chat synthetic pageerror: '+error.message));
 const now=Math.floor(Date.now()/1000),token=[{alg:'none',typ:'JWT'},{sub:uid,user_id:uid,aud:'clever-oasis-508610-n7',iss:'https://securetoken.google.com/clever-oasis-508610-n7',iat:now,exp:now+3600,auth_time:now,email:'synthetic@example.test',email_verified:true,firebase:{sign_in_provider:'custom'}}].map(part=>Buffer.from(JSON.stringify(part)).toString('base64url')).join('.')+'.synthetic';
 const data=seed?seeded():{threads:[],messages:{}};
 if(proposal)data.messages[T1].push({id:'aaaaaaaa-0000-4000-8000-000000000005',seq:4,role:'user',text:'Record a 700 baht cash payment from Somchai',status:'ok',createdAt:iso(2)},
  {id:'aaaaaaaa-0000-4000-8000-000000000006',seq:5,role:'assistant',text:'The card is ready: confirm it on the card.',status:'ok',model:'gemini-a',createdAt:iso(1),proposals:[paymentProposal()]});
 if(group)data.messages[T1].push({id:'aaaaaaaa-0000-4000-8000-000000000007',seq:4,role:'user',text:'Set the six October charges of Somchai to ฿90 interest',status:'ok',createdAt:iso(2)},
  {id:'aaaaaaaa-0000-4000-8000-000000000008',seq:5,role:'assistant',text:'One card for the six charges: confirm it on the card.',status:'ok',model:'gemini-a',createdAt:iso(1),proposals:chargeGroup(6)});
 const s:Stub={...data,creates:[],patches:[],polls:[],outcomes:[],presence:[],presenceStatus:null,denied,patchStatus:null,proposalRequests:[],confirmAnswer:null,proposalReads:[]};
 await context.addInitScript(({chat})=>{
  const original=window.fetch.bind(window),encoder=new TextEncoder();(window as any).__chatStreams=[];(window as any).__chatLog=[];
  window.fetch=(input:RequestInfo|URL,init?:RequestInit)=>{
   const url=typeof input==='string'?input:input instanceof URL?input.href:input.url,headers=(init?.headers??{}) as Record<string,string>;
   // Batch 2c: the presence POSTs as sent (form, keepalive, credentials, keys) and the outcome polls, in order.
   if(url.startsWith(chat+'/api/chat/threads/')){
    const path=new URL(url).pathname;
    if(/\/presence$/.test(path)&&init?.method==='POST'){const body=JSON.parse(String(init.body));
     (window as any).__chatLog.push({kind:'presence',state:body.state,keys:Object.keys(body).sort(),keepalive:init.keepalive===true,credentials:init.credentials,contentType:headers['Content-Type'],authorization:'Authorization' in headers,wake:'X-MW-Wake-Deadline' in headers})}
    else if(/\/messages\/[^/]+$/.test(path)&&(init?.method??'GET')==='GET')(window as any).__chatLog.push({kind:'poll'});
   }
   if(url.startsWith(chat+'/api/chat/threads/')&&/\/messages$/.test(new URL(url).pathname)&&init?.method==='POST'&&headers.Accept==='text/event-stream'){
    let controller!:ReadableStreamDefaultController<Uint8Array>;const stream=new ReadableStream<Uint8Array>({start(c){controller=c}});
    const entry={url,body:JSON.parse(String(init.body)),headers:{...headers,Authorization:headers.Authorization?.replace(/^(Bearer) .+$/,'$1 <token>')},push:(text:string)=>controller.enqueue(encoder.encode(text)),close:()=>controller.close(),fail:()=>controller.error(new TypeError('network error'))};
    init.signal?.addEventListener('abort',()=>{try{controller.error(new DOMException('aborted','AbortError'))}catch{}});
    (window as any).__chatStreams.push(entry);
    return Promise.resolve(new Response(stream,{status:200,headers:{'Content-Type':'text/event-stream; charset=utf-8'}}));
   }
   return original(input,init);
  };
 },{chat:chatOrigin});
 await context.route('**/*',async route=>{
  const request=route.request(),u=new URL(request.url()),method=request.method();
  if(u.hostname===host)return route.continue();
  if(u.hostname==='identitytoolkit.googleapis.com')return route.fulfill({json:u.pathname.includes('signInWithCustomToken')?{idToken:token,refreshToken:'synthetic-refresh',expiresIn:'3600',isNewUser:false}:{users:[{localId:uid,email:'synthetic@example.test',emailVerified:true,providerUserInfo:[]}]}});
  if(u.hostname===readHost)return route.fulfill({json:{ok:true,source:'dev',businessDate:'2026-10-23',items:[],nextCursor:null,asOf:new Date().toISOString()}});
  if(u.hostname===commandHost){
   if(method==='POST'&&u.pathname==='/api/operations')return route.fulfill({json:{kind:'recorded',originalOutcome:{status:'applied'}}});
   if(method!=='GET')return route.abort('failed');
   if(u.pathname.startsWith('/api/operations/'))return route.fulfill({json:{ok:true,kind:'unresolved'}});
   if(target&&/^\/api\/notifications\/[0-9a-f-]{36}$/.test(u.pathname))return route.fulfill({json:target});
   if(u.pathname==='/api/dashboard')return route.fulfill({json:{collection:{notPaid:0,partiallyPaid:0,overdue:0,longOverdue:0,fullyPaid:0},forecast:{},portfolio:{},incomeMtd:{},businessCashHeld:[]}});
   if(u.pathname==='/api/preferences')return route.fulfill({json:{item:{id:'C-partner',version:'a'.repeat(64),language:'English',statementAccountId:null,statementDate:null},accounts:[],dates:[]}});
   return route.fulfill({json:{ok:true,items:[],nextCursor:null}});
  }
  if(u.hostname===chatHost)return chatRoute(route,s);
  return route.abort();
 });
 if(configure)await configure(context);
 await page.goto('https://'+host+path);assertServed(fixture,host);
 await expect.poll(()=>page.evaluate(()=>!!navigator.serviceWorker.controller)).toBe(true);
 await page.evaluate(async()=>{const sdk=(window as any).__syntheticSdk;await sdk.fixtureSignIn(sdk.fixtureGetAuth(),'synthetic-custom-token')});
 await expect(page.locator(mobile||(width??1440)<=1050?'.live-bottom-nav':'#live-desktop-navigation nav')).toBeVisible({timeout:15000});
 return {context,page,s};
}
function stubGroupState(states:string[]){
 if(states.includes('executing'))return 'executing';if(states.includes('unknown'))return 'unknown';
 const settled=states.filter(state=>state==='done'||state==='failed');
 if(!settled.length)return states.includes('pending')?'pending':states.every(state=>state==='expired')?'expired':'cancelled';
 return settled.every(state=>state==='done')?'done':'failed';
}
async function chatRoute(route:any,s:Stub){
 const request=route.request(),u=new URL(request.url()),method=request.method(),path=u.pathname;
 if(s.denied)return route.fulfill({status:403,json:{error:'access_denied',code:'no_partner'}});
 if(path==='/api/chat/models')return route.fulfill({json:models});
 if(path==='/api/chat/threads'&&method==='GET'){const status=u.searchParams.get('status')??'active';return route.fulfill({json:{items:s.threads.filter(thread=>thread.status===status),nextCursor:null}})}
 if(path==='/api/chat/threads'&&method==='POST'){const body=request.postDataJSON();s.creates.push(body);const item={id:body.id,title:'New chat',model:body.model,status:'active',createdAt:new Date().toISOString(),lastMessageAt:null,messageCount:0};s.threads.unshift(item);s.messages[item.id]=[];return route.fulfill({status:201,json:{item}})}
 let match=/^\/api\/chat\/threads\/([^/]+)$/.exec(path);
 if(match&&method==='GET'){const thread=s.threads.find(row=>row.id===match![1]);return thread?route.fulfill({json:{item:thread}}):route.fulfill({status:404,json:{error:'not_found'}})}
 if(match&&method==='PATCH'){const body=request.postDataJSON();s.patches.push({id:match[1],body});if(s.patchStatus)return route.fulfill({status:s.patchStatus,json:{error:'unavailable'}});const thread=s.threads.find(row=>row.id===match![1]);Object.assign(thread,body);return route.fulfill({json:{item:thread}})}
 match=/^\/api\/chat\/threads\/([^/]+)\/messages$/.exec(path);
 if(match&&method==='GET')return route.fulfill({json:{items:s.messages[match[1]]??[],nextCursor:null}});
 if(/^\/api\/chat\/threads\/[^/]+\/messages\/[^/]+\/presence$/.test(path)&&method==='POST'){s.presence.push(request.postData()??'');return s.presenceStatus?route.fulfill({status:s.presenceStatus,json:{error:'unauthorized',code:'session_invalid'}}):route.fulfill({status:204,body:''})}
 match=/^\/api\/chat\/threads\/([^/]+)\/proposals\/([^/]+)(\/confirm|\/cancel)?$/.exec(path);
 if(match){
  s.proposalRequests.push({method,path,body:request.postData(),authorization:request.headers().authorization?'present':null});
  // D12: the id is the group's head; the answer is the group {id, state, lines}. An object answer applies to every
  // pending (or unknown) line; an array answer is per line (null leaves the line as it is) and streams `line` events.
  const row=s.messages[match[1]]?.find(item=>item.proposals?.some((line:any)=>line.id===match![2]));if(!row)return route.fulfill({status:404,json:{error:'not_found'}});
  if(row.proposals[0].id!==match[2])return route.fulfill({status:400,json:{error:'invalid_request',detail:'not_head'}});
  const settled=new Date().toISOString(),open=(line:any)=>['pending','unknown','executing'].includes(line.state);
  const apply=(answer:any,only:(line:any)=>boolean)=>{row.proposals=row.proposals.map((line:any,index:number)=>{const patch=Array.isArray(answer)?answer[index]:answer;return patch&&only(line)?{...line,...patch}:line})};
  const group=()=>({id:row.proposals[0].id,state:stubGroupState(row.proposals.map((line:any)=>line.state)),lines:row.proposals});
  if(match[3]==='/confirm'){
   const answer=s.confirmAnswer;if(answer==='abort')return route.abort('failed');
   const before=row.proposals.map((line:any)=>line.state);apply(answer,line=>line.state==='pending');
   if(!Array.isArray(answer))return route.fulfill({json:{item:group()}});
   const lines=row.proposals.map((line:any,index:number)=>({line,index})).filter(({line,index}:any)=>line.state!==before[index]).map(({line,index}:any)=>ev('line',{index,id:line.id,state:line.state,...(line.outcome?.code?{code:line.outcome.code}:{}),...(line.record?{record:line.record}:{})}));
   return route.fulfill({status:200,headers:{'Content-Type':'text/event-stream; charset=utf-8'},body:lines.join('')+ev('group',{state:group().state,group:group()})+ev('done',{})});
  }
  if(match[3]==='/cancel'){apply({state:'cancelled',settledAt:settled},line=>line.state==='pending');return route.fulfill({json:{item:group()}})}
  const next=s.proposalReads.shift();if(next)apply(next,open);return route.fulfill({json:{item:group()}});
 }
 match=/^\/api\/chat\/threads\/([^/]+)\/messages\/([^/]+)$/.exec(path);
 if(match&&method==='GET'){s.polls.push(match[2]);const next=s.outcomes.shift();return next?route.fulfill({json:next}):route.fulfill({status:404,json:{error:'not_found'}})}
 return route.fulfill({status:404,json:{error:'not_found'}});
}
// The language choice saves a preference command; wait for it to sync so the next choice is enabled.
async function chooseLanguage(page:Page,language:'EN'|'ไทย'){await chooseLiveLanguage(page,language);await expect(page.locator('.language button').first()).toBeEnabled({timeout:15000})}
async function openChat(page:Page){await page.getByRole('button',{name:/^(Chat|แชท)$/}).filter({visible:true}).first().click();await expect(page.locator('main[data-workspace="chat"] .chat-workspace')).toBeVisible()}
const composer=(page:Page)=>page.getByRole('textbox',{name:/^(Message|ข้อความ)$/});
async function openThreads(page:Page){if(page.viewportSize()!.width<=1050){await page.getByRole('button',{name:/^(Threads|รายการแชท): /}).click();await expect(page.locator('.chat-pane')).toBeVisible()}}
async function closeThreads(page:Page){if(page.viewportSize()!.width<=1050)await page.getByRole('button',{name:/^(Close threads|ปิดรายการแชท)$/}).click()}

test('Chat is the fifth and last bottom item, and last in the desktop sidebar',async()=>{
 const {context,page}=await launch();
 try{
  if(!mobile){const labels=await page.locator('#live-desktop-navigation nav > button:not(.management-nav-item)').evaluateAll(buttons=>buttons.map(button=>button.getAttribute('aria-label')));expect(labels.at(-1)).toBe('Chat');expect(labels.slice(0,4)).toEqual(['Dashboard','Collection','Payments','Borrowers']);await page.setViewportSize({width:320,height:800})}
  const nav=page.locator('.live-bottom-nav');
  for(const language of ['EN','ไทย'] as const){
   await chooseLanguage(page,language);
   expect(await nav.locator('button').evaluateAll(buttons=>buttons.map(button=>button.getAttribute('aria-label')))).toEqual(language==='EN'?['Dashboard','Collection','Payments','Borrowers','Chat']:['ภาพรวม','งานติดตาม','รับชำระ','ผู้กู้','แชท']);
   expect(await nav.locator('svg.app-icon').nth(4).getAttribute('data-icon')).toBe('chat');
   expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
   for(const width of [320,375,412]){
    await page.setViewportSize({width,height:800});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    for(const button of await nav.locator('button').all()){const box=(await button.boundingBox())!;expect(box.width).toBeGreaterThanOrEqual(44);expect(box.height).toBeGreaterThanOrEqual(44)}
    // CHAT-NAV-1: every label fits its button on one line, untruncated.
    const fit=await nav.locator('button').evaluateAll(buttons=>buttons.map(button=>{const label=button.querySelector('.live-nav-label') as HTMLElement;return {text:label.textContent,scroll:label.scrollWidth,client:label.clientWidth,height:label.clientHeight,button:button.clientWidth}}));
    for(const row of fit){expect(row.scroll,row.text+' at '+width).toBeLessThanOrEqual(row.button);expect(row.scroll,row.text+' truncated at '+width).toBeLessThanOrEqual(row.client)}
   }
   await page.setViewportSize({width:320,height:800});
  }
  await chooseLanguage(page,'EN');
  await page.getByRole('button',{name:'Open navigation',exact:true}).click();await expect(page.getByRole('dialog',{name:'Navigation menu',exact:true}).getByRole('button',{name:'Chat',exact:true})).toHaveCount(0);
 }finally{await context.close()}
});

test('Chat is hidden when the build has no VITE_CHAT_API_ORIGIN',async()=>{
 fixture.setBuildRoot(join(root,'plain'));
 try{
  const {context,page}=await launch();
  try{
   if(!mobile)await expect(page.locator('#live-desktop-navigation').getByRole('button',{name:'Chat',exact:true})).toHaveCount(0);
   await page.setViewportSize({width:320,height:800});
   expect(await page.locator('.live-bottom-nav button').evaluateAll(buttons=>buttons.map(button=>button.getAttribute('aria-label')))).toEqual(['Dashboard','Collection','Payments','Borrowers']);
   await expect(page.getByRole('button',{name:'Chat',exact:true})).toHaveCount(0);
  }finally{await context.close()}
 }finally{fixture.setBuildRoot(join(root,'chat'))}
});

test('new thread: round, tool, delta and message render in order; provisional text then the committed reply; retract clears',async()=>{
 const {context,page,s}=await launch();
 try{
  await openChat(page);
  await expect(page.getByText('Ask about loans, payments and cash. Answers come from the current records.',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'What is due today?',exact:true}).click();await expect(composer(page)).toHaveValue('What is due today?');
  await page.getByRole('button',{name:'Send',exact:true}).click();
  await expect.poll(()=>s.creates.length).toBe(1);expect(s.creates[0]).toEqual({id:expect.stringMatching(/^[0-9a-f-]{36}$/),model:'gemini-a'});
  await expect.poll(async()=>(await streams(page)).length).toBe(1);
  const [post]=await streams(page);expect(post.url).toBe(chatOrigin+'/api/chat/threads/'+s.creates[0].id+'/messages');expect(post.body).toEqual({id:expect.stringMatching(/^[0-9a-f-]{36}$/),text:'What is due today?'});expect(post.headers).toMatchObject({Authorization:'Bearer <token>',Accept:'text/event-stream','Content-Type':'application/json'});expect(Number(post.headers['X-MW-Wake-Deadline'])-Date.now()).toBeGreaterThan(200000);
  await expect(page.locator('.chat-user')).toHaveText('What is due today?');await expect(composer(page)).toHaveValue('');await expect(composer(page)).toBeDisabled();
  const progress=page.locator('.chat-progress'),provisional=page.locator('.chat-provisional');
  await expect(progress).toHaveText('Sending…');
  await feed(page,ev('accepted',{messageId:post.body.id,seq:0,model:'gemini-a'}));await expect(progress).toHaveText('Preparing a reply…');
  await feed(page,ev('round',{n:1}),ev('tool',{callId:'c1',name:'read_records',state:'running'}));await expect(progress.locator('.chat-progress-text')).toHaveText('Looking up data · records…');await expect(progress).not.toContainText('Round');
  await feed(page,ev('tool',{callId:'c1',name:'read_records',state:'ok',ms:12,summary:'Charges'}),ev('tool',{callId:'c2',name:'sql_query',state:'running'}));await expect(progress.locator('.chat-progress-text')).toHaveText('Looking up data · charges, database…');
  // A text round that ends in a tool call is retracted silently.
  await feed(page,ev('delta',{text:'Let me look'}));await expect(provisional).toContainText('Let me look');await expect(provisional.locator('.chat-provisional-label')).toHaveText('checking figures · Gemini A');
  await feed(page,ev('retract',{reason:'tool_round',attempt:0}));await expect(provisional).toHaveCount(0);await expect(page.getByText('Checking the figures again…')).toHaveCount(0);
  // R103: the row comes back after a tool-round retract; any elapsed seconds are aria-hidden.
  await expect(progress.locator('.chat-progress-text')).toHaveText('Looking up data · charges, database…');await expect(progress.locator('.chat-progress-seconds:not([aria-hidden="true"])')).toHaveCount(0);
  await feed(page,ev('round',{n:2}),ev('delta',{text:'Due today: **1,500**'}),ev('delta',{text:' baht'}));
  await expect(provisional.locator('strong')).toHaveText('1,500');await expect(provisional).toContainText('Due today: 1,500 baht');
  await feed(page,ev('retract',{reason:'ungrounded',attempt:1}));await expect(provisional).toHaveCount(0);await expect(progress).toHaveText('Checking the figures again…');
  await feed(page,ev('round',{n:3}));await expect(progress).toHaveText('Checking the figures again…');
  const text='Due today: **1,000** baht\n\n| Borrower | Due |\n|---|---|\n| A | 1,000 |';
  await feed(page,ev('delta',{text}));await expect(progress).toHaveCount(0);await expect(provisional.locator('td').first()).toHaveText('A');
  s.threads[0]={...s.threads[0],title:'What is due today?',lastMessageAt:new Date().toISOString(),messageCount:2};
  await feed(page,ev('message',{id:'cccccccc-0000-4000-8000-000000000001',seq:1,role:'assistant',text,status:'ok',model:'gemini-a',tools:[{name:'read_records',count:1},{name:'sql_query',count:2}]}),ev('done',{}));
  const committed=page.locator('.chat-assistant:not(.chat-provisional)');
  await expect(provisional).toHaveCount(0);await expect(committed).toHaveCount(1);await expect(committed.locator('strong')).toHaveText('1,000');await expect(committed.locator('th')).toHaveText(['Borrower','Due']);
  await expect(committed.locator('.chat-sources')).toHaveText('Checked: records, database (2 queries) · Gemini A');
  // CHAT-NAV-2: phones keep the header to "Chat" and show the thread title in the Threads button.
  if(mobile){await expect(page.locator('.live-brand h1')).toHaveText('Chat');await expect(page.locator('.chat-threads-current')).toHaveText('What is due today?')}
  else await expect(page.locator('.live-brand h1')).toHaveText('Chat · What is due today?');
  await expect(composer(page)).toBeEnabled();
  await openThreads(page);await expect(page.locator('.chat-thread.current .chat-thread-title')).toHaveText('What is due today?');
 }finally{await context.close()}
});

test('model switch PATCHes the thread, updates the badge and reverts on failure',async()=>{
 const {context,page,s}=await launch({seed:true});
 try{
  await openChat(page);
  const picker=page.getByRole('combobox',{name:'Model',exact:true});
  await expect(picker).toHaveValue('gemini-a');await expect(page.locator('.chat-assistant strong').first()).toHaveText('Somchai');
  await expect(page.locator('.chat-assistant').first().locator('.chat-sources')).toHaveText('Checked: records (2 reads), loan payoff · Gemini A');
  await expect(page.locator('.chat-failed .chat-model-line')).toHaveText('Gemini A');
  await expect(picker.locator('option[value="gemini-c"]')).toHaveJSProperty('disabled',true);await expect(picker.locator('option[value="gemini-c"]')).toHaveText('Gemini C — pending live check');
  await picker.selectOption('gemini-b');
  await expect.poll(()=>s.patches).toEqual([{id:T1,body:{model:'gemini-b'}}]);
  await expect(page.getByText('Applies to your next message',{exact:true})).toBeVisible();
  await openThreads(page);await expect(page.locator('.chat-thread.current .chat-model-badge')).toHaveText('Gemini B');await closeThreads(page);
  s.patchStatus=503;await picker.selectOption('gemini-a');
  await expect.poll(()=>s.patches.length).toBe(2);await expect(picker).toHaveValue('gemini-b');await expect(page.getByRole('alert')).toHaveText('The assistant is unavailable. Try again.');
  await openThreads(page);await expect(page.locator('.chat-thread.current .chat-model-badge')).toHaveText('Gemini B');
 }finally{await context.close()}
});

// R108: a thread on a model no longer listed (a Gemini thread once Gemini left the menu) shows the default with the note,
// sends it as the turn body's model, and the local thread follows once the turn is accepted; a listed thread sends none.
test('R108: a thread on an unlisted model falls back to the default, notes it and sends it with the turn',async()=>{
 const {context,page,s}=await launch({seed:true});
 try{
  s.threads[0]={...s.threads[0],model:'gemini-gone'};
  await openChat(page);
  const picker=page.getByRole('combobox',{name:'Model',exact:true});
  await expect(picker).toHaveValue('gemini-a');await expect(page.getByText('Applies to your next message',{exact:true})).toBeVisible();
  await composer(page).fill('Still there?');await page.getByRole('button',{name:'Send',exact:true}).click();
  await expect.poll(async()=>(await streams(page)).length).toBe(1);
  const [post]=await streams(page);expect(post.body).toEqual({id:expect.stringMatching(/^[0-9a-f-]{36}$/),text:'Still there?',model:'gemini-a'});
  expect(s.patches).toEqual([]);
  await feed(page,ev('accepted',{messageId:post.body.id,seq:4,model:'gemini-a'}));
  await expect(picker).toHaveValue('gemini-a');
  await openThreads(page);await expect(page.locator('.chat-thread.current .chat-model-badge')).toHaveText('Gemini A');
 }finally{await context.close()}
});

test('offline keeps the thread readable and disables the composer',async()=>{
 const {context,page}=await launch({seed:true});
 try{
  await openChat(page);await expect(page.locator('.chat-assistant').first()).toContainText('12,450');
  await composer(page).fill('Draft kept offline');
  await context.setOffline(true);
  await expect(composer(page)).toBeDisabled();await expect(page.getByText('You are offline. Connect to send a message.',{exact:true})).toBeVisible();
  await expect(page.locator('.chat-assistant').first()).toContainText('12,450');await expect(page.getByRole('button',{name:'Edit question',exact:true})).toBeEnabled();
  await context.setOffline(false);
  await expect(composer(page)).toBeEnabled();await expect(composer(page)).toHaveValue('Draft kept offline');
 }finally{await context.close()}
});

test('a dropped stream polls the outcome and shows the reply',async()=>{
 const {context,page,s}=await launch({seed:true});
 try{
  await openChat(page);await expect(page.locator('.chat-assistant').first()).toContainText('12,450');await composer(page).fill('Payoff for Somchai tomorrow?');await page.getByRole('button',{name:'Send',exact:true}).click();
  await expect.poll(async()=>(await streams(page)).length).toBe(1);const [post]=await streams(page);
  const user={id:post.body.id,seq:4,role:'user',text:'Payoff for Somchai tomorrow?',status:'pending'};
  s.outcomes.push({user,assistant:null},{user:{...user,status:'ok'},assistant:{id:'dddddddd-0000-4000-8000-000000000001',seq:5,role:'assistant',text:'Tomorrow it is **12,465** baht.',status:'ok',tools:[{name:'loan_payoff',count:1}]}});
  await feed(page,ev('accepted',{messageId:post.body.id,seq:4,model:'gemini-a'}),ev('round',{n:1}),ev('delta',{text:'Tomorrow it is'}));
  await expect(page.locator('.chat-provisional')).toContainText('Tomorrow it is');
  await page.evaluate(()=>(window as any).__chatStreams.at(-1).fail());
  await expect(page.locator('.chat-progress')).toHaveText('Waiting for the reply…');await expect(page.locator('.chat-provisional')).toHaveCount(0);
  await expect(page.locator('.chat-assistant:not(.chat-provisional)').last()).toContainText('Tomorrow it is 12,465 baht.',{timeout:10000});
  expect(s.polls).toEqual([post.body.id,post.body.id]);await expect(page.locator('.chat-assistant:not(.chat-provisional) .chat-sources').last()).toHaveText('Checked: loan payoff');
  await expect(composer(page)).toBeEnabled();
 }finally{await context.close()}
});

test('failed replies offer the action that fits: Edit question, Choose model, Retry with a new id',async()=>{
 const {context,page}=await launch({seed:true});
 try{
  await openChat(page);await expect(page.locator('.chat-assistant').first()).toContainText('12,450');await composer(page).fill('Profit this year');await page.getByRole('button',{name:'Send',exact:true}).click();
  await expect.poll(async()=>(await streams(page)).length).toBe(1);const [first]=await streams(page);
  await feed(page,ev('accepted',{messageId:first.body.id,seq:4,model:'gemini-a'}),ev('round',{n:1}),ev('error',{code:'MODEL_UNAVAILABLE'}),ev('done',{}));
  const failed=page.locator('.chat-failed').last();
  await expect(failed).toContainText('This model is unavailable right now. Choose another model.');
  await failed.getByRole('button',{name:'Choose model',exact:true}).click();await expect(page.getByRole('combobox',{name:'Model',exact:true})).toBeFocused();
  // TURN_TIMEOUT (seeded) puts the question back into the composer instead of resending it.
  await page.getByRole('button',{name:'Edit question',exact:true}).click();await expect(composer(page)).toHaveValue('And every loan that is overdue by more than 90 days, with the total?');await expect(composer(page)).toBeFocused();
  await composer(page).fill('Profit this year');await page.getByRole('button',{name:'Send',exact:true}).click();
  await expect.poll(async()=>(await streams(page)).length).toBe(2);const second=(await streams(page))[1];
  await feed(page,ev('accepted',{messageId:second.body.id,seq:6,model:'gemini-a'}),ev('round',{n:1}),ev('error',{code:'MODEL_TIMEOUT'}),ev('done',{}));
  await expect(page.locator('.chat-failed').last()).toContainText('The model did not answer in time. Try again.');
  await page.locator('.chat-failed').last().getByRole('button',{name:'Retry',exact:true}).click();
  await expect.poll(async()=>(await streams(page)).length).toBe(3);const third=(await streams(page))[2];
  expect(third.body.text).toBe('Profit this year');expect(third.body.id).not.toBe(second.body.id);expect(third.body.id).not.toBe(first.body.id);
 }finally{await context.close()}
});

test('batch 2c: hiding aborts the stream and sends one text/plain beacon; visible sends JSON presence, then polls',async()=>{
 const {context,page,s}=await launch({seed:true});
 try{
  await openChat(page);await expect(page.locator('.chat-assistant').first()).toContainText('12,450');
  await composer(page).fill('Payoff for Somchai next week?');await page.getByRole('button',{name:'Send',exact:true}).click();
  await expect.poll(async()=>(await streams(page)).length).toBe(1);const [post]=await streams(page);
  await feed(page,ev('accepted',{messageId:post.body.id,seq:4,model:'gemini-a'}),ev('round',{n:1}));
  await page.evaluate(()=>{(window as any).__aborted=false;const entry=(window as any).__chatStreams.at(-1);const push=entry.push;entry.push=(t:string)=>{try{push(t)}catch{(window as any).__aborted=true}}});
  await hide(page);await hide(page,'pagehide');
  // Aborted at once: the next server event cannot be delivered, and nothing is polled while hidden.
  await expect.poll(()=>page.evaluate(()=>{const entry=(window as any).__chatStreams.at(-1);try{entry.push(': ping\n\n')}catch{return true}return (window as any).__aborted})).toBe(true);
  await expect(page.locator('.chat-progress')).toHaveText('Waiting for the reply…');
  // One beacon for the hide (visibilitychange and pagehide): text/plain with the ID token, keepalive, no Authorization,
  // no custom header (a CORS simple request, no preflight).
  const beacon={kind:'presence',state:'hidden',keys:['state','token'],keepalive:true,credentials:'omit',contentType:'text/plain',authorization:false,wake:false};
  await expect.poll(()=>chatLog(page)).toEqual([beacon]);
  await page.waitForTimeout(1500);expect(s.polls).toEqual([]);expect(await chatLog(page)).toEqual([beacon]);
  expect(s.presence.map(body=>JSON.parse(body))).toEqual([{token:expect.stringMatching(/^[\w-]+\.[\w-]+\.[\w-]+$/),state:'hidden'}]);
  const user={id:post.body.id,seq:4,role:'user',text:'Payoff for Somchai next week?',status:'ok'};
  s.outcomes.push({user,assistant:{id:'eeeeeeee-0000-4000-8000-000000000001',seq:5,role:'assistant',text:'Next week it is **12,520** baht.',status:'ok',tools:[{name:'loan_payoff',count:1}]}});
  // Back: the JSON form clears the mark, then the outcome poll starts at once.
  await show(page);
  await expect(page.locator('.chat-assistant:not(.chat-provisional)').last()).toContainText('Next week it is 12,520 baht.');expect(s.polls).toEqual([post.body.id]);
  expect(await chatLog(page)).toEqual([beacon,{kind:'presence',state:'visible',keys:['state'],keepalive:false,credentials:'omit',contentType:'application/json',authorization:true,wake:true},{kind:'poll'}]);
  // The turn is over: a later hide sends nothing.
  await hide(page);await page.waitForTimeout(300);expect((await chatLog(page)).length).toBe(3);await show(page);
 }finally{await context.close()}
});

test('batch 2c: a failed visible presence (expired token, 401) is ignored: no signed-out card, the poll still shows the reply',async()=>{
 const {context,page,s}=await launch({seed:true});
 try{
  await openChat(page);await expect(page.locator('.chat-assistant').first()).toContainText('12,450');
  await composer(page).fill('Payoff for Somchai in a month?');await page.getByRole('button',{name:'Send',exact:true}).click();
  await expect.poll(async()=>(await streams(page)).length).toBe(1);const [post]=await streams(page);
  await feed(page,ev('accepted',{messageId:post.body.id,seq:4,model:'gemini-a'}),ev('round',{n:1}));
  await hide(page);await expect.poll(()=>chatLog(page)).toHaveLength(1);
  s.presenceStatus=401;
  s.outcomes.push({user:{id:post.body.id,seq:4,role:'user',text:'Payoff for Somchai in a month?',status:'ok'},assistant:{id:'cccccccc-0000-4000-8000-000000000001',seq:5,role:'assistant',text:'In a month it is **12,900** baht.',status:'ok'}});
  await show(page);
  await expect(page.locator('.chat-assistant:not(.chat-provisional)').last()).toContainText('In a month it is 12,900 baht.');
  await expect.poll(()=>s.presence.length).toBe(2);expect(JSON.parse(s.presence[1])).toEqual({state:'visible'});expect(s.polls).toEqual([post.body.id]);
  await page.waitForTimeout(500);
  await expect(page.getByRole('heading',{name:'Please sign in again',exact:true})).toHaveCount(0);
  await expect(page.locator('main[data-workspace="chat"] .chat-workspace')).toBeVisible();await expect(composer(page)).toBeEnabled();
 }finally{await context.close()}
});

test('batch 2c: a reply received before hiding is shown once and not polled; a finished turn sends no visible presence',async()=>{
 const {context,page,s}=await launch({seed:true});
 try{
  await openChat(page);await expect(page.locator('.chat-assistant').first()).toContainText('12,450');
  await composer(page).fill('Payoff for Somchai on Friday?');await page.getByRole('button',{name:'Send',exact:true}).click();
  await expect.poll(async()=>(await streams(page)).length).toBe(1);const [post]=await streams(page);
  await feed(page,ev('accepted',{messageId:post.body.id,seq:4,model:'gemini-a'}),ev('round',{n:1}),ev('delta',{text:'On Friday'}));
  await expect(page.locator('.chat-provisional')).toContainText('On Friday');
  // The committed reply arrives (it clears the provisional text), then the app is hidden before `done`: the stream is
  // aborted and the beacon may go out (the service finds the reply and changes nothing).
  await feed(page,ev('message',{id:'ffffffff-0000-4000-8000-000000000001',seq:5,role:'assistant',text:'On Friday it is **12,480** baht.',status:'ok',model:'gemini-a'}));
  await expect(page.locator('.chat-provisional')).toHaveCount(0);
  await hide(page);
  await expect(page.locator('.chat-assistant:not(.chat-provisional)').last()).toContainText('On Friday it is 12,480 baht.');
  await show(page);await page.waitForTimeout(1500);
  expect(s.polls).toEqual([]);
  expect((await chatLog(page)).map((entry:any)=>entry.kind+':'+entry.state)).toEqual(['presence:hidden']);
  await expect(page.locator('.chat-assistant',{hasText:'On Friday it is 12,480 baht.'})).toHaveCount(1);
  await expect(composer(page)).toBeEnabled();
 }finally{await context.close()}
});

test('batch 2: a chat-reply notification opens its thread (cold start with ?notification=)',async()=>{
 fixture.setBuildRoot(join(root,'notify'));
 try{
  const {context,page}=await launch({seed:true,path:'/?notification=99999999-9999-4999-8999-999999999999',target:{kind:'chat',id:T2}});
  try{
   await expect(page.locator('main[data-workspace="chat"] .chat-workspace')).toBeVisible({timeout:10000});
   await expect(page.locator('.chat-assistant').last()).toContainText('Profit this month is 8,200 baht.');
   // A retired model is named by its id.
   await expect(page.locator('.chat-assistant').last().locator('.chat-sources')).toHaveText('Checked: database · gemini-0-retired');
   await openThreads(page);await expect(page.locator('.chat-thread.current .chat-thread-title')).toHaveText('Profit this month');
  }finally{await context.close()}
 }finally{fixture.setBuildRoot(join(root,'chat'))}
});

test('batch 2: a notification for an archived thread off the first page loads its record and opens it read-only',async()=>{
 fixture.setBuildRoot(join(root,'notify'));
 try{
  const {context,page}=await launch({seed:true,path:'/?notification=88888888-8888-4888-8888-888888888888',target:{kind:'chat',id:T3}});
  try{
   await expect(page.locator('main[data-workspace="chat"] .chat-workspace')).toBeVisible({timeout:10000});
   await expect(page.getByText('This thread is archived. Unarchive it to continue.',{exact:true})).toBeVisible();
   await expect(composer(page)).toBeDisabled();await expect(page.getByRole('button',{name:'Unarchive',exact:true}).filter({visible:true})).toBeVisible();
   if(mobile)await expect(page.locator('.chat-threads-current')).toHaveText('Old cash question');else await expect(page.locator('.live-brand h1')).toHaveText('Chat · Old cash question');
  }finally{await context.close()}
 }finally{fixture.setBuildRoot(join(root,'chat'))}
});

test('batch 2: a notification for a thread that is gone explains it and shows the thread list; a failed load offers Try again',async()=>{
 fixture.setBuildRoot(join(root,'notify'));
 try{
  const gone='77777777-7777-4777-8777-777777777777';
  let r=await launch({seed:true,path:'/?notification=88888888-8888-4888-8888-888888888888',target:{kind:'chat',id:gone}});
  try{
   await expect(r.page.getByText('This thread is no longer available.',{exact:true})).toBeVisible({timeout:10000});
   await expect(r.page.locator('.chat-pane')).toBeVisible();await expect(r.page.locator('.chat-thread-title').first()).toHaveText('Payoff for Somchai today');
  }finally{await r.context.close()}
  // Network failure on the record: the notice offers Try again, which loads it.
  r=await launch({seed:true,path:'/?notification=88888888-8888-4888-8888-888888888888',target:{kind:'chat',id:T3},configure:async context=>{
   let failed=false;await context.route(chatOrigin+'/api/chat/threads/'+T3,async route=>{if(!failed&&route.request().method()==='GET'){failed=true;return route.abort('failed')}return route.fallback()});}});
  try{
   const notice=r.page.getByText('Could not open this thread.',{exact:false});await expect(notice).toBeVisible({timeout:10000});await expect(composer(r.page)).toBeDisabled();
   await r.page.getByRole('alert').filter({hasText:'Could not open this thread.'}).getByRole('button',{name:'Try again',exact:true}).click();
   await expect(r.page.getByText('This thread is archived. Unarchive it to continue.',{exact:true})).toBeVisible();await expect(notice).toHaveCount(0);
  }finally{await r.context.close()}
 }finally{fixture.setBuildRoot(join(root,'chat'))}
});

test('R106: the confirmation card shows the server fields; Confirm is disabled offline; confirm settles done and survives a reload',async()=>{
 const {context,page,s}=await launch({seed:true,proposal:true});
 try{
  await openChat(page);
  const card=page.locator('.chat-proposal');
  await expect(card).toHaveCount(1);await expect(card).toHaveAttribute('data-state','pending');
  await expect(card.getByRole('heading',{name:'Record payment'})).toBeVisible();await expect(card.locator('.chat-proposal-target')).toHaveText('Somchai');
  await expect(card.locator('.chat-proposal-fields dd')).toHaveText(['฿700','30-Oct-2026','Cash','Cash box']);
  await expect(card.locator('.chat-proposal-split li')).toHaveCount(2);await expect(card.locator('.chat-proposal-split h4')).toHaveText('Allocation · ฿700');
  await expect(card.locator('.chat-proposal-split li').nth(1)).toContainText('Principal ฿500 · Interest ฿100');
  await expect(card.locator('.chat-proposal-consequence')).toHaveText('Settles every due charge of this borrower.');
  // CWR-03: the live region holds the state only; the countdown sits outside it.
  await expect(card.locator('.chat-proposal-state')).toHaveText('Waiting for your confirmation');await expect(card.locator('[aria-live] .chat-proposal-countdown, .chat-proposal-state .chat-proposal-countdown')).toHaveCount(0);
  await expect(card.locator('.chat-proposal-countdown')).toHaveText(/^Expires in 1[45]:\d\d$/);
  // CWR-04: allocation dates and amounts never wrap.
  await expect(card.locator('.chat-proposal-split .chat-nowrap')).toHaveCount(6);
  // CWR-02/01: the server's short label; armed once the card has been in view.
  // CW2-01: the card's dismiss button never reads like a catalogue Cancel action.
  const confirm=card.getByRole('button',{name:'Record ฿700',exact:true}),cancel=card.getByRole('button',{name:"Don't do this",exact:true});
  await expect(card.getByRole('button',{name:/^Cancel/})).toHaveCount(0);
  await card.scrollIntoViewIfNeeded();await expect(card).toHaveAttribute('data-armed','true');await expect(confirm).toBeEnabled();
  // CWR-08: offline disables both buttons; one note covers them.
  await context.setOffline(true);await expect(confirm).toBeDisabled();await expect(cancel).toBeDisabled();await expect(card.getByText('Connect to confirm or cancel.',{exact:true})).toBeVisible();
  await context.setOffline(false);await expect(confirm).toBeEnabled();await expect(cancel).toBeEnabled();
  s.confirmAnswer={state:'done',settledAt:new Date().toISOString(),outcome:{code:null},record:{type:'payment',id:'PM1',paymentId:'PM1'}};
  await confirm.click();
  // CWR-07: the Done card shows the saved time (Bangkok).
  await expect(card).toHaveAttribute('data-state','done');await expect(card.locator('.chat-proposal-state')).toHaveText(/^Saved \d\d:\d\d$/);await expect(card.locator('.chat-proposal-confirm')).toHaveCount(0);
  expect(s.proposalRequests.filter(r=>r.method==='POST')).toEqual([{method:'POST',path:`/api/chat/threads/${T1}/proposals/${P1}/confirm`,body:'{}',authorization:'present'}]);
  await card.scrollIntoViewIfNeeded();await page.screenshot({path:`${shots}/r106-card-done-${project}.png`,fullPage:false});
  // The record link opens the payment record over the thread (CW2-03: "Back to chat"); Back returns to the same
  // thread and card with the scroll position and focus on Open record (CW2-02).
  const open=card.getByRole('button',{name:'Open record',exact:true});
  await open.scrollIntoViewIfNeeded();
  const where=await page.evaluate(()=>({pageY:Math.round(window.scrollY),listTop:Math.round(document.querySelector('.chat-messages')?.scrollTop??0)}));
  await open.click();
  await expect(page.locator('.chat-workspace')).toBeHidden();
  await expect(page.getByRole('button',{name:'Back to payment history'})).toHaveCount(0);
  await expect(page.locator('.chat-record-view').locator('h1,h2').first()).toBeFocused();
  await page.getByRole('button',{name:'Back to chat',exact:true}).first().click();
  await expect(page.locator('.chat-proposal')).toHaveAttribute('data-state','done');
  await expect(page.locator('.chat-proposal').getByRole('button',{name:'Open record',exact:true})).toBeFocused();
  await expect.poll(()=>page.evaluate(()=>({pageY:Math.round(window.scrollY),listTop:Math.round(document.querySelector('.chat-messages')?.scrollTop??0)}))).toEqual(where);await expect(page.locator('.chat-user').last()).toHaveText('Record a 700 baht cash payment from Somchai');
  // The persisted state on reload (any device).
  await page.reload();await openChat(page);await expect(page.locator('.chat-proposal')).toHaveAttribute('data-state','done');
 }finally{await context.close()}
});

test('R106: a lost confirm answer polls as unknown (never failed) until it resolves; a rejection shows the app wording; a new message cancels a pending card',async()=>{
 const {context,page,s}=await launch({seed:true,proposal:true});
 try{
  await openChat(page);
  const card=page.locator('.chat-proposal');
  await expect(card).toHaveAttribute('data-state','pending');await card.scrollIntoViewIfNeeded();
  await page.screenshot({path:`${shots}/r106-card-pending-${project}.png`,fullPage:false});
  s.confirmAnswer='abort';s.proposalReads=[{state:'unknown',outcome:{code:'outcome_unknown'}},{state:'done',outcome:{code:null},settledAt:new Date().toISOString(),record:{type:'payment',id:'PM1',paymentId:'PM1'}}];
  await card.scrollIntoViewIfNeeded();await card.locator('.chat-proposal-confirm').click();
  await expect(card).toHaveAttribute('data-state','unknown');await expect(card.locator('.chat-proposal-state')).toHaveText('Checking whether the change was saved…');
  await expect(card.getByRole('button',{name:/Confirm|Record|Retry|Ask again/})).toHaveCount(0);
  await expect(card).toHaveAttribute('data-state','done',{timeout:15000});
  expect(s.proposalRequests.filter(r=>r.method==='GET').length).toBeGreaterThanOrEqual(2);
  // A rejection from the command service: the app's localized table.
  const row=s.messages[T1].at(-1);row.proposals=[paymentProposal({id:'dddddddd-0000-4000-8000-000000000002'})];
  await page.reload();await openChat(page);
  s.confirmAnswer={state:'failed',outcome:{code:'source_conflict'},settledAt:new Date().toISOString()};
  await page.locator('.chat-proposal').scrollIntoViewIfNeeded();await page.locator('.chat-proposal .chat-proposal-confirm').click();
  await expect(page.locator('.chat-proposal .chat-proposal-state')).toHaveText('Could not apply: The record changed since it was opened. (source_conflict)');
  // CWR-06: Ask again puts the original question back in the composer.
  await page.locator('.chat-proposal').getByRole('button',{name:'Ask again',exact:true}).click();await expect(composer(page)).toHaveValue('Record a 700 baht cash payment from Somchai');await composer(page).fill('');
  // A pending card is cancelled by the next message.
  row.proposals=[paymentProposal({id:'dddddddd-0000-4000-8000-000000000003'})];
  await page.reload();await openChat(page);await expect(page.locator('.chat-proposal')).toHaveAttribute('data-state','pending');
  await composer(page).fill('Actually make it 600');await page.getByRole('button',{name:'Send',exact:true}).click();
  await expect(page.locator('.chat-proposal')).toHaveAttribute('data-state','cancelled');await expect(page.locator('.chat-proposal .chat-proposal-state')).toHaveText('Cancelled. Nothing was changed.');
 }finally{await context.close()}
});

test('R106 D12: one card for six changes at 320 px; the delete is marked; Confirm all streams each line; a failed line shows; Confirm N remaining after a partial run',async()=>{
 const {context,page,s}=await launch({seed:true,group:true,width:mobile?undefined:320});
 try{
  await openChat(page);
  const card=page.locator('.chat-proposal'),lines=card.locator('.chat-proposal-line');
  await expect(card).toHaveCount(1);await expect(card).toHaveAttribute('data-lines','6');await expect(lines).toHaveCount(6);
  await expect(card.getByRole('heading',{name:'6 changes'})).toBeVisible();
  // Chase: only the changed field per line; the unchanged long note is never repeated, just counted.
  await expect(card.locator('.chat-proposal-change')).toHaveCount(5);await expect(lines.nth(1).locator('.chat-proposal-change dd')).toContainText('฿90.00');
  // CW3-01: the delete line carries the warning icon, the red edge and its tag; the card warning and Confirm count it.
  await expect(lines.first()).toHaveAttribute('data-destructive','true');await expect(lines.first().locator('.chat-proposal-tag')).toHaveText('Deletes');
  await expect(lines.first().locator('.chat-proposal-line-icon')).toHaveCount(1);await expect(lines.nth(1).locator('.chat-proposal-tag')).toHaveCount(0);
  expect(await lines.first().evaluate(element=>getComputedStyle(element).borderLeftColor)).toBe('rgb(179, 38, 30)');
  await expect(card.locator('.chat-proposal-destructive')).toHaveText('1 change deletes data');
  await expect(card.getByText(/A long synthetic note/)).toHaveCount(0);await expect(card.locator('.chat-proposal-unchanged summary').first()).toHaveText('+2 unchanged');
  await expect(lines.locator('.chat-proposal-chip')).toHaveText(Array(6).fill('Waiting'));
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
  const confirm=card.getByRole('button',{name:'Confirm 6 changes (1 delete)',exact:true});
  // CW3-03: opened at the thread's end, the action row sits above the composer, not under it.
  const actions=await card.locator('.chat-proposal-actions').boundingBox(),composerBox=await page.locator('.chat-composer').boundingBox();
  expect(actions!.y+actions!.height).toBeLessThanOrEqual(composerBox!.y+1);
  // CW3-04: until armed, the hint says why Confirm waits.
  await expect(card.locator('.chat-proposal-arm-hint')).toHaveText('Scroll through all changes to confirm');
  // CWR-01: a card taller than the pane arms once the Partner has scrolled through it.
  await card.evaluate(element=>element.scrollIntoView({block:'start'}));await page.waitForTimeout(150);
  await confirm.scrollIntoViewIfNeeded();await expect(card).toHaveAttribute('data-armed','true');await expect(confirm).toBeEnabled();await expect(card.locator('.chat-proposal-arm-hint')).toHaveCount(0);
  await page.screenshot({path:`${shots}/r106-group-pending-${mobile?'pixel7':320}.png`,fullPage:true});
  // A partial run: lines 1-2 done, line 3 rejected, lines 4-6 left pending (the 180 s deadline).
  const done=(index:number)=>({state:'done',settledAt:new Date().toISOString(),outcome:{code:null},record:{type:'charge',id:'C'+index,chargeId:'C'+index}});
  s.confirmAnswer=[done(0),done(1),{state:'failed',outcome:{code:'source_conflict'},settledAt:new Date().toISOString()},null,null,null];
  await confirm.click();
  // CW3-02: lines a Confirm can still run read "Not run yet"; the summary counts them.
  await expect(lines.locator('.chat-proposal-chip')).toHaveText(['Done','Done','Not saved','Not run yet','Not run yet','Not run yet']);
  await expect(lines.nth(2).locator('.chat-proposal-line-failure')).toHaveText('Could not apply: The record changed since it was opened. (source_conflict)');
  await expect(lines.nth(0).getByRole('button',{name:'Open record',exact:true})).toBeVisible();await expect(lines.nth(3).getByRole('button',{name:'Open record',exact:true})).toHaveCount(0);
  await expect(card).toHaveAttribute('data-state','partial');await expect(card.locator('.chat-proposal-state')).toHaveText('2 done · 1 not saved · 3 not run');
  const rest=card.getByRole('button',{name:'Confirm 3 remaining',exact:true});await expect(rest).toBeEnabled();
  s.confirmAnswer=[null,null,null,done(3),done(4),done(5)];
  await rest.click();
  await expect(lines.locator('.chat-proposal-chip')).toHaveText(['Done','Done','Not saved','Done','Done','Done']);await expect(card.locator('.chat-proposal-confirm')).toHaveCount(0);
  await expect(card.locator('.chat-proposal-state')).toHaveText('5 done · 1 not saved');
  expect(s.proposalRequests.filter(r=>r.method==='POST').map(r=>r.path)).toEqual(Array(2).fill(`/api/chat/threads/${T1}/proposals/${G.slice(0,-1)}0/confirm`));
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
  await page.screenshot({path:`${shots}/r106-group-settled-${mobile?'pixel7':320}.png`,fullPage:true});
  await page.reload();await openChat(page);await expect(page.locator('.chat-proposal-line .chat-proposal-chip')).toHaveText(['Done','Done','Not saved','Done','Done','Done']);
 }finally{await context.close()}
});

test('a 403 from the chat service shows the access denied card',async()=>{
 const {context,page}=await launch({denied:true});
 try{
  await openChat(page).catch(()=>{});
  await expect(page.getByRole('heading',{name:'This account does not have access',exact:true})).toBeVisible();
 }finally{await context.close()}
});

test('review captures: conversation, thread sheet and provisional reply (EN/TH)',async()=>{
 const widths=mobile?[undefined]:[1440,320];
 for(const width of widths){
  const {context,page}=await launch({seed:true,width});
  try{
   const name=(state:string,language:string)=>join(shots,`${state}-${mobile?'pixel7':width}-${language}.png`);
   await openChat(page);await expect(page.locator('.chat-assistant').first()).toContainText('12,450');
   for(const language of ['EN','ไทย'] as const){
    await chooseLanguage(page,language);await page.waitForTimeout(250);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
    await page.screenshot({path:name('conversation',language==='EN'?'en':'th')});
    if(page.viewportSize()!.width<=1050){await openThreads(page);await page.screenshot({path:name('threads',language==='EN'?'en':'th')});await closeThreads(page)}
   }
   for(const [index,language] of (['EN','ไทย'] as const).entries()){
    const tag=language==='EN'?'en':'th',newChat=page.getByRole('button',{name:/^(New chat|แชทใหม่)$/}).filter({visible:true});
    await chooseLanguage(page,language);
    if(await newChat.count())await newChat.first().click();else{await openThreads(page);await newChat.first().click()}
    await expect(page.locator('.chat-welcome')).toBeVisible();await page.screenshot({path:name('empty',tag)});
    await composer(page).fill(language==='EN'?'Payoff for Somchai today?':'ปิดยอดของสมชายวันนี้เท่าไร');await page.getByRole('button',{name:/^(Send|ส่ง)$/}).click();
    await expect.poll(async()=>(await streams(page)).length).toBe(index+1);const post=(await streams(page))[index];
    await feed(page,ev('accepted',{messageId:post.body.id,seq:0,model:'gemini-a'}),ev('round',{n:1}),ev('tool',{callId:'c1',name:'read_records',state:'ok',summary:'Loans'}),ev('tool',{callId:'c2',name:'loan_payoff',state:'running'}));
    await expect(page.locator('.chat-progress-text')).toHaveText(language==='EN'?'Looking up data · loans, loan payoff…':'กำลังค้นหาข้อมูล · loans, ยอดปิดสินเชื่อ…');await page.screenshot({path:name('progress',tag)});
    await feed(page,ev('round',{n:2}),ev('delta',{text:'Payoff for **Somchai** today is **12,450** baht.\n\n- Principal: 12,000'}));
    await expect(page.locator('.chat-provisional')).toBeVisible();await page.screenshot({path:name('provisional',tag)});
    await feed(page,ev('message',{id:crypto.randomUUID(),seq:1,role:'assistant',text:'Payoff for **Somchai** today is **12,450** baht.',status:'ok',tools:[{name:'loan_payoff',count:1}]}),ev('done',{}));
    await expect(composer(page)).toBeEnabled();
   }
  }finally{await context.close()}
 }
});
