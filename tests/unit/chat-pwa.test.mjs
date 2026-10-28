import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {runInNewContext} from 'node:vm';
import {chatOriginAllowed,liveConfiguration} from '../../apps/pwa/src/environment.ts';
// R090 PWA chat: the pure protocol, markdown and wording modules (no imports, so each transpiles on its own).
const load=async file=>import('data:text/javascript;base64,'+Buffer.from(ts.transpileModule(readFileSync(new URL('../../apps/pwa/src/chat/'+file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText).toString('base64'));
const {createSseParser,applyTurnEvent,initialTurn,classifyOutcome,pollOutcome}=await load('chat-protocol.ts');
const {parseMarkdown,parseInline,tableCells}=await load('markdown.ts');
const {failureText,failureAction,failureActionLabel,metaLine,progressText,sourcesText,threadTitle,relativeTime}=await load('chat-text.ts');
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
