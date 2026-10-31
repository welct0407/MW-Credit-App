import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {runInNewContext} from 'node:vm';
import {chatOriginAllowed,liveConfiguration} from '../../apps/pwa/src/environment.ts';
// R090 PWA chat: the pure protocol, markdown and wording modules (no imports, so each transpiles on its own).
const load=async file=>import('data:text/javascript;base64,'+Buffer.from(ts.transpileModule(readFileSync(new URL('../../apps/pwa/src/chat/'+file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText).toString('base64'));
const {listedDefault,threadModel,createSseParser,applyTurnEvent,initialTurn,classifyOutcome,pollOutcome,isProposal,proposalView,mergeProposal,pollProposal,PROPOSAL_POLL_MS,PROPOSAL_POLL_LIMIT_MS,groupState,groupView,isGroup,pollGroup,seenThrough}=await load('chat-protocol.ts');
const {parseMarkdown,parseInline,tableCells}=await load('markdown.ts');
const {failureText,failureAction,failureActionLabel,metaLine,progressText,sourcesText,threadTitle,relativeTime,proposalCodeText,proposalStateText,proposalCountdown,consequenceText,proposalUnresolvedText,confirmText,savedAtText,proposalButtons,lineChipText,groupConfirmText,unchangedText,groupProgressText,groupSummaryText,destructiveKind,destructiveCounts,destructiveTagText,destructiveWarningText,armHintText}=await load('chat-text.ts');
const sse=(chunks,end=true)=>{const events=[];const parser=createSseParser((name,data)=>events.push([name,data]));for(const chunk of chunks)parser.push(chunk);if(end)parser.end();return events};

test('SSE parser reads events across chunk boundaries, CRLF, multi-line data and pings',()=>{
 const body='event: accepted\ndata: {"messageId":"m","seq":0,"model":"x"}\n\n: ping\n\nevent: delta\r\ndata: {"text":"a"}\r\n\r\nevent: tool\ndata: {"callId":"c",\ndata: "name":"sql_query","state":"running"}\n\nevent: done\ndata: {}\n\n';
 for(const size of [1,2,7,body.length]){
  const chunks=[];for(let at=0;at<body.length;at+=size)chunks.push(body.slice(at,at+size));
  assert.deepEqual(sse(chunks),[['accepted',{messageId:'m',seq:0,model:'x'}],['delta',{text:'a'}],['tool',{callId:'c',name:'sql_query',state:'running'}],['done',{}]],'chunk size '+size);
 }
});
test('SSE parser drops an event cut off by the end of the body and dispatches bad JSON as null',()=>{
 assert.deepEqual(sse(['event: delta\ndata: {"text":"x"}\n\nevent: done\ndata: {}']),[['delta',{text:'x'}]]);
 assert.deepEqual(sse(['event: delta\ndata: {not json}\n\n']),[['delta',null]]);
 assert.deepEqual(sse(['data: {"a":1}\n\n']),[['message',{a:1}]]);
});
test('turn reducer: tool_round retract is silent, ungrounded and too_long show the check label until new text',()=>{
 let s=initialTurn();
 for(const [name,data] of [['accepted',{messageId:'m',seq:4,model:'gemini-a'}],['round',{n:1}],['tool',{callId:'a',name:'read_records',state:'running'}],['tool',{callId:'b',name:'sql_query',state:'running'}],['tool',{callId:'a',name:'read_records',state:'ok',ms:5,summary:'Loans'}]])s=applyTurnEvent(s,name,data);
 assert.equal(s.accepted,true);assert.equal(s.seq,4);assert.equal(s.model,'gemini-a');assert.equal(initialTurn().model,null);assert.equal(s.round,1);assert.deepEqual(s.tools.map(t=>[t.callId,t.state,t.summary]),[['a','ok','Loans'],['b','running',undefined]]);
 s=applyTurnEvent(s,'delta',{text:'Let me check'});assert.equal(s.provisional,'Let me check');
 s=applyTurnEvent(s,'retract',{reason:'tool_round',attempt:0});assert.equal(s.provisional,'');assert.equal(s.checking,false);
 s=applyTurnEvent(s,'round',{n:2});assert.deepEqual(s.tools,[]);
 s=applyTurnEvent(s,'delta',{text:'Total 1,000'});s=applyTurnEvent(s,'retract',{reason:'ungrounded',attempt:1});assert.equal(s.provisional,'');assert.equal(s.checking,true);
 s=applyTurnEvent(s,'round',{n:3});assert.equal(s.checking,true,'the label stays through the next round');
 s=applyTurnEvent(s,'delta',{text:'Total 900'});assert.equal(s.checking,false);
 s=applyTurnEvent(s,'retract',{reason:'too_long',attempt:2});assert.equal(s.checking,true);
 const message={id:'r',seq:5,role:'assistant',text:'Total 900',status:'ok'};
 s=applyTurnEvent(s,'message',message);assert.deepEqual(s.message,message);assert.equal(s.provisional,'');
 s=applyTurnEvent(s,'done',{});assert.equal(s.done,true);
 // R103: startedAt is set by the first accepted and survives round, tool, delta and retract (the seconds never restart).
 {let x=applyTurnEvent(initialTurn(),'accepted',{seq:1},1000);assert.equal(initialTurn().startedAt,null);assert.equal(x.startedAt,1000);
  for(const [name,data,now] of [['round',{n:1},2000],['tool',{callId:'a',name:'sql_query',state:'running'},3000],['delta',{text:'x'},4000],['retract',{reason:'tool_round'},5000],['round',{n:2},6000],['retract',{reason:'ungrounded'},7000],['accepted',{seq:1},8000]])x=applyTurnEvent(x,name,data,now);
  assert.equal(x.startedAt,1000);assert.equal(x.round,2);
  const failed=applyTurnEvent(x,'error',{code:'MODEL_TIMEOUT'},9000);assert.equal(failed.error,'MODEL_TIMEOUT');assert.equal(failed.provisional,'');}
 assert.equal(applyTurnEvent(initialTurn(),'error',{code:'TURN_TIMEOUT'}).error,'TURN_TIMEOUT');
 assert.equal(applyTurnEvent(initialTurn(),'message',{id:1}).message,null,'a malformed message is ignored');
 assert.deepEqual(applyTurnEvent(s,'unknown',{}),s);
});
test('outcome classification and polling: pending until a reply, lost on a stale claim, timeout after the window',async()=>{
 const user={id:'u',seq:0,role:'user',text:'q',status:'pending'},assistant={id:'a',seq:1,role:'assistant',text:'r',status:'ok'};
 assert.deepEqual(classifyOutcome({user,assistant:null}),{state:'pending'});
 assert.deepEqual(classifyOutcome({user:{...user,status:'ok'},assistant}),{state:'done',user:{...user,status:'ok'},assistant});
 assert.deepEqual(classifyOutcome({user:{...user,status:'failed'},assistant:null}),{state:'gone'});
 assert.deepEqual(classifyOutcome(null),{state:'gone'});
 let clock=0,reads=0;const sleeps=[];const options={now:()=>clock,sleep:async ms=>{sleeps.push(ms);clock+=ms},intervalMs:3000,timeoutMs:10000};
 const answers=[{state:'pending'},Promise.reject(Error('network')),{state:'done',user,assistant}];
 assert.deepEqual(await pollOutcome(async()=>answers[reads++],options),{state:'done',user,assistant});assert.equal(reads,3);assert.deepEqual(sleeps,[3000,3000]);
 clock=0;reads=0;sleeps.length=0;
 assert.deepEqual(await pollOutcome(async()=>{reads++;return {state:'pending'}},options),{state:'timeout'});assert.equal(reads,4);assert.equal(clock,9000);
 const fatal=Object.assign(Error('denied'),{fatal:true});await assert.rejects(pollOutcome(async()=>{throw fatal},options),/denied/);
 const controller=new AbortController();controller.abort(Error('left'));await assert.rejects(pollOutcome(async()=>({state:'pending'}),{...options,signal:controller.signal}),/left/);
});
test('markdown: paragraphs, line breaks, bold, bullets and pipe tables; everything else stays text',()=>{
 assert.deepEqual(parseInline('Due **1,000** baht'),[{kind:'text',text:'Due '},{kind:'strong',text:'1,000'},{kind:'text',text:' baht'}]);
 assert.deepEqual(parseInline('a ** b'),[{kind:'text',text:'a ** b'}]);
 assert.deepEqual(parseInline('****'),[{kind:'text',text:'****'}]);
 const blocks=parseMarkdown('Hello\nsecond line\n\n- one\n* **two**\n\n| Borrower | Amount |\n|---|--:|\n| A \\| B | 1,000 |\n| C | 2 |\n\n## Heading <b>x</b>');
 assert.deepEqual(blocks.map(b=>b.kind),['paragraph','list','table','paragraph']);
 assert.deepEqual(blocks[0].inlines,[{kind:'text',text:'Hello'},{kind:'break'},{kind:'text',text:'second line'}]);
 assert.deepEqual(blocks[1].items,[[{kind:'text',text:'one'}],[{kind:'strong',text:'two'}]]);
 assert.deepEqual(blocks[2].head,[[{kind:'text',text:'Borrower'}],[{kind:'text',text:'Amount'}]]);
 assert.deepEqual(blocks[2].rows.map(r=>r.map(c=>c[0].text)),[['A | B','1,000'],['C','2']]);
 assert.deepEqual(blocks[3].inlines,[{kind:'text',text:'## Heading <b>x</b>'}],'HTML and headings are plain text');
 assert.equal(parseMarkdown('| a | b |\n| c | d |')[0].head,null,'a table without a separator has no header');
 assert.deepEqual(tableCells('| x |  | y |'),['x','','y']);
 assert.deepEqual(parseMarkdown('\r\n\r\n'),[]);
});
test('chat components never set HTML from text',()=>{
 for(const file of ['ChatMessage.tsx','ChatWorkspace.tsx','ChatThreads.tsx','ChatComposer.tsx','markdown.ts']){
  const source=readFileSync(new URL('../../apps/pwa/src/chat/'+file,import.meta.url),'utf8');
  assert.doesNotMatch(source,/innerHTML|dangerouslySetInnerHTML|outerHTML|insertAdjacentHTML/,file);
 }
});
test('wording: failure reasons, progress row, sources line and placeholder title in English and Thai',()=>{
 assert.equal(failureText('MODEL_UNAVAILABLE',false),'This model is unavailable right now. Choose another model.');
 assert.equal(failureText('TURN_TIMEOUT',false),'The question took too long. Ask a narrower question.');
 assert.equal(failureText('unavailable',false),'The assistant is unavailable. Try again.');
 assert.equal(failureText('lost',false),'Reply not received. Refresh the chat.');
 assert.equal(failureText('thread_gone',false),'This thread is no longer available.');assert.equal(failureText('thread_gone',true),'แชทนี้ไม่มีแล้ว');
 assert.equal(failureText('thread_unavailable',false),'Could not open this thread.');assert.equal(failureText('thread_unavailable',true),'เปิดแชทนี้ไม่ได้');
 assert.equal(failureText('INTERNAL',false),'Something went wrong. Try again.');
 assert.equal(failureText('SOMETHING_NEW',false),failureText('INTERNAL',false));
 assert.equal(failureText('INTERNAL',true),'เกิดข้อผิดพลาด ลองอีกครั้ง');assert.equal(failureText('TURN_TIMEOUT',true),'คำถามนี้ใช้เวลานานเกินไป ลองถามให้เจาะจงขึ้น');
 for(const code of ['MODEL_UNAVAILABLE','MODEL_TIMEOUT','TOOL_ROUNDS_EXCEEDED','GROUNDING_EXCEEDED','TURN_TIMEOUT','PROMPT_BLOCKED','INTERNAL','unavailable','lost'])assert.notEqual(failureText(code,true),failureText(code,false),code);
 // R103: "Looking up data…" without "Round N"; distinct tool labels (at most three, then "…"); seconds from 5 s on.
 const lookup=[{name:'read_records',state:'ok',summary:'Loans'},{name:'read_records',state:'running'},{name:'sql_query',state:'running'}];
 assert.deepEqual({...progressText(2,lookup,false)},{text:'Looking up data · loans, records, database…',seconds:''});
 assert.deepEqual({...progressText(1,[],false)},{text:'Looking up data…',seconds:''});
 assert.deepEqual({...progressText(1,[],true)},{text:'กำลังค้นหาข้อมูล…',seconds:''});
 assert.deepEqual({...progressText(1,lookup,true)},{text:'กำลังค้นหาข้อมูล · loans, ข้อมูล, ฐานข้อมูล…',seconds:''});
 assert.deepEqual({...progressText(0,[],false,7)},{text:'Preparing a reply…',seconds:' · 7 s'});
 assert.equal(progressText(3,[...lookup,{name:'loan_payoff',state:'running'},{name:'sum_field',state:'running'}],false).text,'Looking up data · loans, records, database, …');
 for(const [elapsed,english,thai] of [[0,'',''],[4.99,'',''],[5,' · 5 s',' · 5 วิ'],[12.7,' · 12 s',' · 12 วิ']]){
  assert.equal(progressText(1,[],false,elapsed).seconds,english,String(elapsed));assert.equal(progressText(1,[],true,elapsed).seconds,thai,String(elapsed));
 }
 assert.doesNotMatch(JSON.stringify([progressText(4,lookup,false,30),progressText(4,lookup,true,30)]),/Round|รอบที่/);
 assert.equal(sourcesText([{name:'sql_query',count:2},{name:'loan_payoff',count:1}],false),'Checked: database (2 queries), loan payoff');
 assert.equal(sourcesText([{name:'sql_query',count:2}],true),'ตรวจแล้ว: ฐานข้อมูล (2 คำสั่ง)');
 assert.equal(sourcesText([],false),'');
 // The answering model closes the line under a reply; either part may be absent.
 assert.equal(metaLine('Checked: database (2 queries)','Gemini 4 Argon'),'Checked: database (2 queries) · Gemini 4 Argon');
 assert.equal(metaLine('','Gemini 4 Argon'),'Gemini 4 Argon');assert.equal(metaLine('ตรวจแล้ว: ผลรวม',null),'ตรวจแล้ว: ผลรวม');assert.equal(metaLine(),'');
 assert.equal(threadTitle('New chat',true),'แชทใหม่');assert.equal(threadTitle('Payoff A',true),'Payoff A');
 const now=Date.parse('2026-10-23T12:00:00Z');
 assert.equal(relativeTime('2026-10-23T11:55:00Z',false,now),'5 minutes ago');assert.equal(relativeTime('2026-10-22T12:00:00Z',false,now),'yesterday');
 assert.equal(relativeTime('2026-10-01T12:00:00Z',false,now),null);assert.equal(relativeTime(null,false,now),null);
});
test('failed replies offer Edit question, Choose model, New chat or Retry by code',()=>{
 for(const code of ['TURN_TIMEOUT','TOOL_ROUNDS_EXCEEDED','PROMPT_BLOCKED'])assert.equal(failureAction(code),'edit',code);
 assert.equal(failureAction('MODEL_UNAVAILABLE'),'model');assert.equal(failureAction('thread_full'),'new');
 for(const code of ['unavailable','MODEL_TIMEOUT','lost','GROUNDING_EXCEEDED','INTERNAL',undefined])assert.equal(failureAction(code),'retry',String(code));
 assert.equal(failureActionLabel('edit',false),'Edit question');assert.equal(failureActionLabel('edit',true),'แก้คำถาม');assert.equal(failureActionLabel('model',false),'Choose model');
});
test('chat origin: the exact Cloud Run origin of the same environment only',()=>{
 assert.equal(chatOriginAllowed('https://mw-credit-app-chat-dev-pvrgvyg3oq-as.a.run.app','dev'),true);
 assert.equal(chatOriginAllowed('https://mw-credit-app-chat-prod-pvrgvyg3oq-as.a.run.app','prod'),true);
 for(const [value,environment] of [['https://mw-credit-app-chat-prod-pvrgvyg3oq-as.a.run.app','dev'],['https://mw-credit-app-chat-dev-pvrgvyg3oq-as.a.run.app/','dev'],['http://mw-credit-app-chat-dev-pvrgvyg3oq-as.a.run.app','dev'],['https://mw-credit-app-read-dev-pvrgvyg3oq-as.a.run.app','dev'],['https://mw-credit-app-chat-dev-x.run.app.evil.example','dev'],['https://mw-credit-app-chat-dev-pvrgvyg3oq-as.a.run.app','synthetic'],['','dev']])
  assert.equal(chatOriginAllowed(value,environment),false,value+' '+environment);
 const env={MODE:'live-dev',VITE_FIREBASE_PROJECT_ID:'clever-oasis-508610-n7',VITE_FIREBASE_AUTH_DOMAIN:'clever-oasis-508610-n7.firebaseapp.com',VITE_FIREBASE_API_KEY:'k',VITE_FIREBASE_APP_ID:'a',VITE_API_ORIGIN:'https://mw-credit-app-read-dev-pvrgvyg3oq-as.a.run.app'};
 assert.equal(liveConfiguration(env).chatOrigin,null);
 assert.equal(liveConfiguration({...env,VITE_CHAT_API_ORIGIN:''}).chatOrigin,null);
 assert.equal(liveConfiguration({...env,VITE_CHAT_API_ORIGIN:'https://mw-credit-app-chat-dev-pvrgvyg3oq-as.a.run.app'}).chatOrigin,'https://mw-credit-app-chat-dev-pvrgvyg3oq-as.a.run.app');
 assert.throws(()=>liveConfiguration({...env,VITE_CHAT_API_ORIGIN:'https://mw-credit-app-chat-prod-pvrgvyg3oq-as.a.run.app'}),/unavailable/);
});

test('read-cache keeps the thread list, a thread\'s messages and the models offline, never a single turn outcome',async()=>{
 const source=ts.transpileModule(readFileSync(new URL('../../apps/pwa/src/read-cache.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const origin='https://mw-credit-app-chat-dev-pvrgvyg3oq-as.a.run.app',saved=[],wake=[];
 const repo={environment:'dev',scopeName:'synthetic-owner',readCacheRevision:async()=>1,readRevision:async()=>1,syncAuthorized:async()=>true,authorize:async()=>{},readCachedResponse:async()=>null,saveCachedResponse:async key=>{saved.push(key)},remove:async()=>{}};
 const exports={},dependencies={'./client-events':{recordClientEvent:()=>{}},'./request-activity':{beginRequest:()=>()=>{}},'./offline-dataset':{readOfflineDataset:async()=>null,isOfflineDatasetCursor:()=>false,routeDomain:()=>'records',receiptMediaCandidates:()=>[]},'./environment':{commandOriginAllowed:()=>false,chatOriginAllowed:value=>value===origin},'./interaction-hold':{deferWhileInteracting:()=>{},cancelDeferred:()=>false}};
 runInNewContext(source,{exports,require:name=>dependencies[name],Response,Blob,URL,AbortController,DOMException,structuredClone,setTimeout,clearTimeout,navigator:{onLine:true},location:{origin:'https://dev-lm.mw-credit.com'},window:new EventTarget(),fetch:async(_url,init)=>{wake.push(Number(init.headers['X-MW-Wake-Deadline'])-Date.now());return new Response(JSON.stringify({items:[],nextCursor:null}),{status:200,headers:{'Content-Type':'application/json'}})}});
 const access={origin,offline:repo,token:async()=>'synthetic-token',authFailure:()=>{}};
 const T='11111111-1111-4111-8111-111111111111',M='22222222-2222-4222-8222-222222222222';
 for(const path of ['/api/chat/models','/api/chat/threads?status=active&limit=20',`/api/chat/threads/${T}/messages?limit=50`,`/api/chat/threads/${T}/messages/${M}`,`/api/chat/threads/${T}`])await exports.readCachedJson(access,path,{wakeMs:250000});
 assert.deepEqual(saved.map(key=>key.replace('json:'+origin,'')),['/api/chat/models','/api/chat/threads?status=active&limit=20',`/api/chat/threads/${T}/messages?limit=50`]);
 assert.ok(wake.every(ms=>ms>249000&&ms<=250000),String(wake));
});

// R106: the proposal event, the card state machine and its wording.
const card={version:1,operation:'expense.create',label:{en:'New expense',th:'เพิ่มค่าใช้จ่าย'},destructive:false,target:{type:'expense',id:'E1',label:null},values:[],changes:[],consequences:[]};
const proposal=(patch={})=>({id:'p1',threadId:'t1',messageId:'m1',kind:'operation',operation:'expense.create',state:'pending',card,expiresAt:'2026-10-30T03:15:00.000Z',createdAt:'2026-10-30T03:00:00.000Z',settledAt:null,outcome:null,record:null,...patch});
const T0=Date.parse('2026-10-30T03:00:00.000Z');
test('turn reducer: the proposal event precedes the reply, and the reply keeps it',()=>{
 let s=applyTurnEvent(initialTurn(),'accepted',{messageId:'m1',seq:1,model:'x'});
 assert.deepEqual(initialTurn().proposals,[]);
 s=applyTurnEvent(s,'proposal',{proposals:[{id:'bad'}]});assert.deepEqual(s.proposals,[],'a malformed proposal is ignored');
 s=applyTurnEvent(s,'proposal',{proposals:[proposal(),proposal({id:'p2'})]});assert.deepEqual(s.proposals.map(p=>p.id),['p1','p2']);
 s=applyTurnEvent(s,'message',{id:'r1',role:'assistant',text:'Card ready.',status:'ok'});assert.deepEqual(s.message.proposals.map(p=>p.id),['p1','p2']);
 const row={id:'r2',role:'assistant',text:'x',status:'ok',proposals:[]};
 assert.deepEqual(applyTurnEvent(s,'message',row).message.proposals,[],'the stored row wins');
 assert.deepEqual(applyTurnEvent(initialTurn(),'proposal',{proposal:proposal()}).proposals.map(p=>p.id),['p1'],'the single form still reads');
 assert.equal(isProposal(proposal({state:'weird'})),false);assert.equal(isProposal(proposal()),true);
});
test('card states: pending counts down and expires; Confirm needs a connection; unknown polls; settled is final',()=>{
 let v=proposalView(proposal(),{now:T0+60000});
 assert.deepEqual(v,{state:'pending',canConfirm:true,canCancel:true,poll:false,remainingSeconds:840,code:null});
 // CWR-08: both buttons need a connection; CWR-01: Confirm waits until the card was seen.
 assert.equal(proposalView(proposal(),{now:T0,online:false}).canConfirm,false);assert.equal(proposalView(proposal(),{now:T0,online:false}).canCancel,false);
 assert.deepEqual([proposalView(proposal(),{now:T0,seen:false}).canConfirm,proposalView(proposal(),{now:T0,seen:false}).canCancel],[false,true]);
 assert.equal(proposalView(proposal(),{now:T0,busy:true}).canConfirm,false);
 v=proposalView(proposal(),{now:T0+15*60000});assert.deepEqual([v.state,v.canConfirm,v.code,v.remainingSeconds],['expired',false,'proposal_expired',0]);
 assert.deepEqual([proposalView(proposal({state:'unknown'}),{now:T0}).poll,proposalView(proposal({state:'unknown'}),{now:T0}).code],[true,'outcome_unknown']);
 assert.equal(proposalView(proposal({state:'executing'}),{now:T0,busy:true}).poll,false,'own confirm in flight');
 assert.equal(proposalView(proposal({state:'executing'}),{now:T0}).poll,true,'executing after a reload');
 for(const state of ['done','failed','cancelled'])assert.deepEqual([proposalView(proposal({state}),{now:T0}).canConfirm,proposalView(proposal({state}),{now:T0}).poll],[false,false],state);
 assert.equal(proposalView(proposal({state:'failed',outcome:{code:'source_conflict'}}),{now:T0}).code,'source_conflict');
 assert.equal(proposalView(proposal({state:'cancelled'}),{now:T0}).code,'proposal_cancelled');
});
test('card merge: the newer local state wins until the row is final',()=>{
 assert.equal(mergeProposal(proposal(),proposal({state:'executing'})).state,'executing');
 assert.equal(mergeProposal(proposal({state:'done'}),proposal({state:'unknown'})).state,'done');
 assert.equal(mergeProposal(proposal(),proposal({id:'other',state:'done'})).state,'pending');
 assert.equal(mergeProposal(null,undefined),null);
});
test('unknown polling: every 3 s up to 5 minutes, read errors keep waiting, a settled answer ends it',async()=>{
 assert.equal(PROPOSAL_POLL_MS,3000);assert.equal(PROPOSAL_POLL_LIMIT_MS,300000);
 let clock=0,reads=0;const answers=[()=>{throw Error('offline')},()=>proposal({state:'unknown'}),()=>proposal({state:'done'})];
 const value=await pollProposal(async()=>answers[reads++](),{now:()=>clock,sleep:async ms=>{clock+=ms}});
 assert.equal(value.state,'done');assert.equal(reads,3);assert.equal(clock,9000);
 clock=0;reads=0;
 assert.equal(await pollProposal(async()=>{reads++;return proposal({state:'unknown'})},{now:()=>clock,sleep:async ms=>{clock+=ms}}),null);assert.equal(reads,100);
 await assert.rejects(pollProposal(async()=>{throw Object.assign(Error('denied'),{fatal:true})},{now:()=>0,sleep:async()=>{}}),/denied/);
});
test('card wording: chat-layer codes in both languages, command-service codes left to the app table',()=>{
 for(const code of ['reviewer_required','command_required','proposal_expired','proposal_cancelled','proposal_executing','command_busy','command_unavailable','outcome_unknown'])
  assert.ok(proposalCodeText(code,false)&&proposalCodeText(code,true)&&proposalCodeText(code,false)!==proposalCodeText(code,true),code);
 assert.equal(proposalCodeText('source_conflict',false),null);assert.equal(proposalCodeText(null,false),null);
 assert.equal(proposalCountdown(840,false),'Expires in 14:00');assert.equal(proposalCountdown(65,true),'หมดอายุใน 1:05');
 assert.equal(proposalStateText('executing',false),'Saving…');assert.match(proposalUnresolvedText(false),/not confirmed/);assert.doesNotMatch(proposalUnresolvedText(false),/fail/i);
 assert.match(consequenceText({code:'loan_close_payoff'},false,'฿10,300'),/฿10,300/);assert.match(consequenceText({code:'settles_all_due'},true),/ทั้งหมด/);
});

test('CWR-02/07: the server Confirm label or plain Confirm; the saved time in Bangkok',()=>{
 assert.equal(confirmText({en:'Record ฿700',th:'บันทึก ฿700'},false),'Record ฿700');assert.equal(confirmText({en:'Record ฿700',th:'บันทึก ฿700'},true),'บันทึก ฿700');
 assert.equal(confirmText(null,false),'Confirm');assert.equal(confirmText(undefined,true),'ยืนยัน');assert.equal(confirmText({en:'',th:''},false),'Confirm');
 assert.equal(savedAtText('2026-10-30T07:05:00.000Z',false),'Saved 14:05');assert.equal(savedAtText('2026-10-30T07:05:00.000Z',true),'บันทึกแล้ว 14:05');assert.equal(savedAtText(null,false),null);
});

test('CW2-01: the card dismisses with "Don\'t do this", never a catalogue-like Cancel',()=>{
 assert.deepEqual([...proposalButtons.cancel],["Don't do this",'ไม่ทำรายการ']);
 assert.equal(/cancel|ยกเลิก/i.test(proposalButtons.cancel.join(' ')),false);
});

// R106 D12: one card for a group of lines.
const line=(index,patch={})=>proposal({id:'g'+index,card:{...card,group:{id:'g0',index,count:3,ids:['g0','g1','g2']}},...patch});
test('D12 group state: derived from the lines like the service',()=>{
 assert.equal(groupState(['pending','pending']),'pending');
 assert.equal(groupState(['done','executing','pending']),'executing');
 assert.equal(groupState(['done','unknown','pending']),'unknown');
 assert.equal(groupState(['done','done']),'done');
 assert.equal(groupState(['done','pending']),'partial','pending lines left: not done');
 for(const rest of ['expired','failed','cancelled'])assert.equal(groupState(['done',rest]),'partial',rest);
 assert.equal(groupState(['done','failed','pending']),'partial');assert.equal(groupState(['failed','pending']),'failed');
 assert.equal(groupState(['expired','expired']),'expired');assert.equal(groupState(['cancelled','expired']),'cancelled');
});
test('D12 group view: Confirm all, then N remaining; skipped lines; unknown polls and never confirms',()=>{
 let v=groupView([line(0),line(1),line(2)],{now:T0+60000});
 assert.deepEqual([v.state,v.pending,v.remaining,v.canConfirm,v.canCancel,v.poll,v.remainingSeconds],['pending',3,false,true,true,false,840]);
 v=groupView([line(0,{state:'done'}),line(1,{state:'failed',outcome:{code:'source_conflict'}}),line(2)],{now:T0});
 assert.deepEqual(v.lines,['done','failed','notrun']);assert.deepEqual([v.state,v.pending,v.remaining,v.canConfirm],['partial',1,true,true]);
 v=groupView([line(0,{state:'done'}),line(1,{state:'unknown'}),line(2)],{now:T0});
 assert.deepEqual([v.state,v.canConfirm,v.canCancel,v.poll],['unknown',false,false,true]);
 assert.equal(groupView([line(0,{state:'done'}),line(1,{state:'executing'}),line(2)],{now:T0,busy:true}).poll,false,'own confirm in flight');
 v=groupView([line(0,{state:'done'}),line(1),line(2)],{now:T0+15*60000});
 assert.deepEqual([v.lines,v.canConfirm,v.remaining],[['done','skipped','skipped'],false,false],'expired leftovers are skipped, not offered');
 assert.equal(groupView([line(0),line(1)],{now:T0,online:false}).canConfirm,false);
 assert.equal(groupView([line(0),line(1)],{now:T0,seen:false}).canConfirm,false);
 assert.equal(isGroup({id:'g0',state:'pending',lines:[line(0)]}),true);assert.equal(isGroup({id:'g0',lines:[]}),false);assert.equal(isGroup({id:'g0',lines:[{id:'x'}]}),false);
});
test('D12 group polling: until no line is unknown or executing',async()=>{
 let clock=0,reads=0;const answers=[[line(0,{state:'done'}),line(1,{state:'unknown'})],[line(0,{state:'done'}),line(1,{state:'done'})]];
 const value=await pollGroup(async()=>answers[reads++],{now:()=>clock,sleep:async ms=>{clock+=ms}});
 assert.deepEqual(value.map(l=>l.state),['done','done']);assert.equal(reads,2);
});
test('D12 group wording: Confirm 6 changes, Confirm N remaining, line chips, unchanged count',()=>{
 assert.equal(groupConfirmText({count:6,pending:6,remaining:false},false),'Confirm 6 changes');assert.equal(groupConfirmText({count:6,pending:6,remaining:false},true),'ยืนยัน 6 รายการ');
 assert.equal(groupConfirmText({count:6,pending:2,remaining:true},false),'Confirm 2 remaining');assert.equal(groupConfirmText({count:6,pending:2,remaining:true},true),'ยืนยันอีก 2 รายการ');
 assert.equal(groupConfirmText({count:1,pending:1,remaining:false,label:{en:'Record ฿700',th:'บันทึก ฿700'}},false),'Record ฿700');
 assert.equal(groupConfirmText({count:1,pending:1,remaining:false,label:null},false),'Confirm change');assert.equal(groupConfirmText({count:1,pending:1,remaining:false,label:null},true),'ยืนยันรายการ');
 for(const state of ['pending','executing','done','failed','expired','cancelled','unknown','skipped'])assert.ok(lineChipText(state,false)&&lineChipText(state,true)&&lineChipText(state,false)!==lineChipText(state,true),state);
 assert.equal(/cancel|ยกเลิก/i.test(lineChipText('cancelled',false)+lineChipText('cancelled',true)),false);
 assert.deepEqual([lineChipText('notrun',false),lineChipText('notrun',true),lineChipText('skipped',false),lineChipText('skipped',true)],['Not run yet','ยังไม่ทำ','Skipped','ข้าม']);
 assert.equal(groupSummaryText({done:4,failed:0,notRun:2},false),'4 done · 2 not run');assert.equal(groupSummaryText({done:4,failed:0,notRun:2},true),'สำเร็จ 4 · ไม่ได้ทำ 2');
 assert.equal(groupSummaryText({done:2,failed:1,notRun:3},false),'2 done · 1 not saved · 3 not run');assert.equal(groupSummaryText({done:0,failed:2,notRun:0},false),'2 not saved');
 assert.equal(armHintText(false),'Scroll through all changes to confirm');assert.equal(armHintText(true),'เลื่อนดูทุกรายการก่อนยืนยัน');
 assert.equal(unchangedText(4,false),'+4 unchanged');assert.equal(groupProgressText(2,6,false),'Saving 2 of 6…');
});
test('CWR-01/D12: a card is seen once every part has been in view, at once or scrolled through',()=>{
 assert.equal(seenThrough([[0,400]],400),true);
 assert.equal(seenThrough([[0,700]],1400),false,'a tall card half in view');
 assert.equal(seenThrough([[0,700],[650,1400]],1400),true,'scrolled through');
 assert.equal(seenThrough([[700,1400],[0,500]],1400),false,'a gap is not seen');
 assert.equal(seenThrough([],400),false);
});
test('CW3-01: destructive lines are named by kind, counted in the warning and in Confirm',()=>{
 assert.deepEqual(['charge.delete','settlement.reverse','settlement.cancel','loan.default','charge.update'].map(destructiveKind),['delete','reverse','cancel','default','other']);
 assert.deepEqual([destructiveTagText('charge.delete',false),destructiveTagText('charge.delete',true),destructiveTagText('settlement.reverse',false),destructiveTagText('settlement.reverse',true)],['Deletes','ลบ','Reverses','ย้อนกลับ']);
 const one=destructiveCounts(['charge.delete']);
 assert.equal(destructiveWarningText(one,false),'1 change deletes data');assert.equal(destructiveWarningText(one,true),'1 รายการจะลบข้อมูล');
 assert.equal(destructiveWarningText(destructiveCounts(['charge.delete','expense.delete','settlement.reverse']),false),'2 changes delete data; 1 change reverses a record');
 assert.equal(groupConfirmText({count:6,pending:6,remaining:false,destructive:one},false),'Confirm 6 changes (1 delete)');
 assert.equal(groupConfirmText({count:6,pending:6,remaining:false,destructive:one},true),'ยืนยัน 6 รายการ (ลบ 1)');
 assert.equal(groupConfirmText({count:6,pending:2,remaining:true,destructive:{}},false),'Confirm 2 remaining');
 assert.equal(groupConfirmText({count:6,pending:6,remaining:false},false),'Confirm 6 changes');
});

// R108: Gemini left the chat model menu (Claude only). A thread still on an unlisted or unavailable model shows the
// default in the picker with the "applies to your next message" note, and its next turn carries the default as the
// body model (the service applies it to the thread when it claims the turn).
test('R108: a thread on an unlisted model falls back to the default, which its next turn carries',()=>{
 const claudeOnly={version:1,default:'claude-opus-5-5',models:[{id:'claude-opus-5-5',label:'Claude Opus 5.5',available:true}]};
 assert.equal(listedDefault(claudeOnly),'claude-opus-5-5');assert.equal(listedDefault(null),null);
 assert.equal(listedDefault({default:'x',models:[{id:'x',available:false},{id:'y',available:true}]}),'y');
 assert.deepEqual(threadModel(claudeOnly,'claude-opus-5-5'),{model:'claude-opus-5-5',override:null});
 assert.deepEqual(threadModel(claudeOnly,'gemini-3.5-flash'),{model:'claude-opus-5-5',override:'claude-opus-5-5'},'unlisted model: the default, sent with the turn');
 assert.deepEqual(threadModel({...claudeOnly,models:[...claudeOnly.models,{id:'gemini-3.5-flash',available:false}]},'gemini-3.5-flash'),{model:'claude-opus-5-5',override:'claude-opus-5-5'},'listed but unavailable');
 assert.deepEqual(threadModel(null,'gemini-3.5-flash'),{model:'gemini-3.5-flash',override:null},'before the list loads nothing changes');
 assert.deepEqual(threadModel({...claudeOnly,models:[{id:'claude-opus-5-5',available:false}]},'gemini-3.5-flash'),{model:'gemini-3.5-flash',override:null},'no available model: no override');
 // The workspace wires it: the picker value, the note and the turn body (a React component; checked in its source).
 const source=readFileSync(new URL('../../apps/pwa/src/chat/ChatWorkspace.tsx',import.meta.url),'utf8');
 assert.match(source,/const override=thread\.model\?threadModel\(models,thread\.model\)\.override:null;/);
 assert.match(source,/streamTurn\(accessRef\.current,thread\.id,\{id:messageId,text,\.\.\.\(override\?\{model:override\}:\{\}\)\}/);
 assert.match(source,/const currentModel=resolved\?\.model\|\|newModel\|\|defaultModel\(models\);/);
 assert.match(source,/modelNote\|\|resolved\?\.override\?t\('Applies to your next message'/);
 // The thread list badge shows the model's label when listed, the raw id otherwise.
 assert.match(readFileSync(new URL('../../apps/pwa/src/chat/ChatThreads.tsx',import.meta.url),'utf8'),/const modelLabel=\(id:string\)=>models\.find\(model=>model\.id===id\)\?\.label\?\?id;[\s\S]*chat-model-badge">\{modelLabel\(thread\.model\)\}/);
});
