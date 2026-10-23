// R090: the chat HTTP routes (services/chat/handler.mjs) over a real HTTP server with an in-memory store that keeps
// the V104 RPC contracts (per-Partner scoping, idempotent create, claims, completion), the real engine and Vertex
// transport over a scripted fetch, and the real tool bridge over fake providers. Synthetic identities and data.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {createChatHandler,BODY_LIMIT} from '../../services/chat/handler.mjs';
import {createVertexTransport} from '../../services/chat/gemini.mjs';
import {createChatTools} from '../../services/chat/tools.mjs';
import {loadBusinessConfig} from '../../services/production/business-config.mjs';
import {chatEnv,MODELS} from './chat-fixture.mjs';

const config=loadBusinessConfig(chatEnv('dev',{CHAT_MODELS_JSON:JSON.stringify({...MODELS,models:[...MODELS.models.slice(0,2),{id:'gemini-3.5-flash',label:'Gemini 3.5 Flash',available:false,reason:'pending live check'}]})}));
const ORIGIN='https://dev-lm.mw-credit.com';
const PARTNERS={'a@example.invalid':'PA','b@example.invalid':'PB'};
const USAGE={promptTokenCount:100,candidatesTokenCount:10,thoughtsTokenCount:5,cachedContentTokenCount:40};
const chunk=(parts,extra={})=>({candidates:[{content:{role:'model',parts},...(extra.finishReason?{finishReason:extra.finishReason}:{})}],...(extra.usage?{usageMetadata:extra.usage}:{})});
const reply=text=>[chunk([{text:text.slice(0,3)}]),chunk([{text:text.slice(3)}],{finishReason:'STOP',usage:USAGE})];
const sse=events=>new Response(events.map(e=>`data: ${JSON.stringify(e)}\n\n`).join(''),{status:200});
const id=n=>`${String(n).padStart(8,'0')}-0000-4000-8000-000000000000`;

/** In-memory store with the RPC semantics the handler relies on. */
function memoryStore(){
 const threads=new Map(),messages=new Map(),log=[];let clock=Date.UTC(2026,9,23,3);
 const actor=p=>{const partnerId=PARTNERS[p.email];if(!partnerId)throw Error('access_denied');return {issuer:config.issuer,subject:p.subject,partnerId,loginEmail:p.email};};
 const own=(a,t)=>{const thread=threads.get(t);if(!thread||thread.partner!==a.partnerId)throw Error('not_found');return thread;};
 const item=t=>({id:t.id,title:t.title,model:t.model,status:t.status,createdAt:t.createdAt,lastMessageAt:t.lastMessageAt,messageCount:t.messageCount});
 const msg=m=>({id:m.id,seq:m.seq,role:m.role,text:m.text,status:m.claimed?'pending':m.status,...(m.model?{model:m.model}:{}),createdAt:'2026-10-23T03:00:00.000Z'});
 const store={log,threadMap:threads,fail:null,
  async modelsDefault(p){const a=actor(p);return [...threads.values()].filter(t=>t.partner===a.partnerId).at(-1)?.model??null;},
  async threads(p,{status,before,limit}){const a=actor(p);log.push(['threads',status,before,limit]);
   return [...threads.values()].filter(t=>t.partner===a.partnerId&&t.status===status&&(!before||t.sortAt<before)).sort((x,y)=>y.sortAt.localeCompare(x.sortAt)).slice(0,limit+1).map(t=>({...item(t),sortAt:t.sortAt}));},
  async createThread(p,input){const a=actor(p);const existing=threads.get(input.id);
   if(existing){if(existing.partner!==a.partnerId)throw Object.assign(Error('not_found'),{code:'42501'});return {created:false,item:item(existing)};}
   clock+=1000;const t={id:input.id,partner:a.partnerId,title:input.title??'New chat',model:input.model,status:'active',createdAt:new Date(clock).toISOString(),lastMessageAt:null,messageCount:0,sortAt:new Date(clock).toISOString().replace('Z','000Z')};
   threads.set(t.id,t);messages.set(t.id,[]);return {created:true,item:item(t)};},
  async updateThread(p,tid,patch){const t=own(actor(p),tid);Object.assign(t,patch);return item(t);},
  async thread(p,tid){return item(own(actor(p),tid));},
  async messages(p,tid,{before,limit}){own(actor(p),tid);return messages.get(tid).filter(m=>!before||m.seq<before).toReversed().slice(0,limit+1).map(msg);},
  async message(p,tid,mid){own(actor(p),tid);const list=messages.get(tid),u=list.find(m=>m.id===mid&&m.role==='user');if(!u)throw Error('not_found');
   const a=list.find(m=>m.seq===u.seq+1);return {user:msg(u),assistant:a?msg(a):null};},
  async begin(p,tid,{id:mid,text,model}){
   if(store.fail)throw store.fail;
   const a=actor(p),t=own(a,tid),list=messages.get(tid);
   const existing=list.find(m=>m.id===mid);
   if(existing){const answer=list.find(m=>m.seq===existing.seq+1);if(answer)return {actor:a,value:{state:'completed',user:msg(existing),assistant:msg(answer)}};}
   if(list.some(m=>m.claimed))throw Object.assign(Error('turn_in_progress'),{code:'55006'});
   if(model)t.model=model;
   const u={id:mid,seq:list.length+1,role:'user',text,status:'ok',claimed:true};list.push(u);t.messageCount++;
   return {actor:a,value:{state:'claimed',message:{id:mid,seq:u.seq,createdAt:'2026-10-23T03:00:00.000Z'},thread:{id:tid,model:t.model,title:t.title,messageCount:t.messageCount},partnerLanguage:'English',history:null,seed:[]}};},
  async complete(p,mid,assistant,history,toolCalls,notify=null){
   const a=actor(p);log.push(['complete',mid,assistant,history,toolCalls,notify]);
   if(store.completeFail){const failure=store.completeFail;store.completeFail=null;throw failure;}
   const t=[...threads.values()].find(x=>messages.get(x.id).some(m=>m.id===mid));own(a,t.id);
   const list=messages.get(t.id),u=list.find(m=>m.id===mid);u.claimed=false;
   const row={id:id(900+list.length),seq:u.seq+1,role:'assistant',text:assistant.text,status:assistant.status,model:assistant.model};list.push(row);t.messageCount++;
   return {...msg(row),usage:{promptTokens:assistant.promptTokens},tools:toolCalls.length?[{name:toolCalls[0].name,count:toolCalls.length}]:undefined,...(assistant.errorCode?{errorCode:assistant.errorCode}:{})};},
 };
 return store;
}

async function server({script=[],store=memoryStore(),pingMs=15000,delay=0}={}){
 const revocation=[];
 const verifyPrincipal=async(authorization,options)=>{revocation.push(options?.checkRevoked!==false);
  const m=/^Bearer token-(\w+)$/.exec(authorization??'');if(!m)return {ok:false,status:401,code:'sign_in_required'};
  if(m[1]==='expired')return {ok:false,status:401,code:'session_invalid'};
  return {ok:true,subject:'sub-'+m[1],email:`${m[1]}@example.invalid`};};
 const transport=createVertexTransport({projectId:'clever-oasis-508610-n7',location:'global',getToken:async()=>'t',sleep:async()=>{},
  fetch:async()=>{await new Promise(r=>setTimeout(r,delay));const next=script.shift();if(!next)throw Error('script exhausted');return next instanceof Response?next:sse(next);}});
 const readProvider={catalogue:async()=>({manifestSha256:'m',resources:[]}),query:async()=>({rows:[{'Row ID':'C1','Amount Remaining':'1000.00'}]})};
 const createTools=actor=>createChatTools({readProvider,sqlTool:{query:async()=>({columns:['due'],rows:[{due:'1000.00'}],row_count:1,complete:true}),payoff:async()=>({})},actor});
 const logs=[];
 const handler=createChatHandler({config,verifyPrincipal,store,createTools,transport,log:r=>logs.push(r),pingMs});
 const srv=http.createServer(handler);await new Promise(r=>srv.listen(0,'127.0.0.1',r));
 const base=`http://127.0.0.1:${srv.address().port}`;
 const call=(path,{method='GET',token='a',body,headers={},raw,signal}={})=>fetch(base+path,{method,signal,headers:{...(token?{Authorization:'Bearer token-'+token}:{}),...(body!==undefined||raw!==undefined?{'Content-Type':'application/json'}:{}),...headers},body:raw??(body===undefined?undefined:JSON.stringify(body))});
 return {call,store,logs,revocation,close:()=>new Promise(r=>srv.close(r))};
}
/** Parses an SSE body into [name, data] pairs and counts ping comments. */
async function events(response){
 const text=await response.text();const out=[];let pings=0;
 for(const block of text.split('\n\n').filter(Boolean)){
  if(block.startsWith(': ping')){pings++;continue;}
  const [eventLine,dataLine]=block.split('\n');out.push([eventLine.slice(7),JSON.parse(dataLine.slice(6))]);
 }
 return {list:out,names:out.map(([n])=>n),pings};
}
const T1=id(1),M1=id(11),M2=id(12);
const sql={functionCall:{name:'sql_query',id:'q1',args:{sql:'SELECT 1'}}};

test('health, authentication, membership and CORS',async t=>{
 const s=await server();t.after(s.close);
 assert.deepEqual(await (await s.call('/health',{token:null})).json(),{ok:true});
 let r=await s.call('/api/chat/models',{token:null});assert.equal(r.status,401);assert.deepEqual(await r.json(),{error:'unauthorized',code:'sign_in_required'});
 r=await s.call('/api/chat/models',{token:'expired'});assert.equal(r.status,401);assert.equal((await r.json()).code,'session_invalid');
 r=await s.call('/api/chat/models',{token:'stranger'});assert.equal(r.status,403);assert.deepEqual(await r.json(),{error:'access_denied'});
 r=await s.call('/api/chat/threads',{method:'OPTIONS',token:null,headers:{Origin:ORIGIN,'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'authorization,content-type,accept,x-mw-wake-deadline'}});
 assert.equal(r.status,204);assert.equal(r.headers.get('access-control-allow-origin'),ORIGIN);assert.equal(r.headers.get('access-control-allow-methods'),'GET, POST, PATCH');
 r=await s.call('/api/chat/threads',{method:'OPTIONS',token:null,headers:{Origin:'https://evil.example','Access-Control-Request-Method':'POST'}});assert.equal(r.status,403);
 r=await s.call('/api/chat/threads',{method:'OPTIONS',token:null,headers:{Origin:ORIGIN,'Access-Control-Request-Method':'DELETE'}});assert.equal(r.status,403);
 r=await s.call('/api/chat/models',{headers:{Origin:'https://evil.example'}});assert.equal(r.status,403);
 assert.equal((await s.call('/api/chat/nothing')).status,404);assert.equal((await s.call('/api/chat/models',{method:'POST',body:{}})).status,404);
 r=await s.call('/api/chat/models',{headers:{'X-MW-Wake-Deadline':'soon'}});assert.equal(r.status,400);
 r=await s.call('/api/chat/models',{headers:{'X-MW-Wake-Deadline':String(Date.now()+250000)}});assert.equal(r.status,200);
});

test('models: the allowlist with the unavailable reason; the last chosen model is the default',async t=>{
 const s=await server();t.after(s.close);
 let body=await (await s.call('/api/chat/models')).json();
 assert.deepEqual(body,{version:1,default:'gemini-4-argon',models:[{id:'gemini-4-argon',label:'Gemini 4 Argon',available:true},{id:'gemini-3.8-flash',label:'Gemini 3.8 Flash',available:true},
  {id:'gemini-3.5-flash',label:'Gemini 3.5 Flash',available:false,reason:'pending live check'}]});
 await s.call('/api/chat/threads',{method:'POST',body:{id:T1,model:'gemini-3.8-flash'}});
 body=await (await s.call('/api/chat/models')).json();assert.equal(body.default,'gemini-3.8-flash');
});

test('threads: idempotent create, validation, other Partner 404, PATCH, list paging, revocation on writes only',async t=>{
 const s=await server();t.after(s.close);
 let r=await s.call('/api/chat/threads',{method:'POST',body:{id:T1,model:'gemini-4-argon'}});assert.equal(r.status,201);assert.equal((await r.json()).item.title,'New chat');
 r=await s.call('/api/chat/threads',{method:'POST',body:{id:T1,model:'gemini-4-argon'}});assert.equal(r.status,200);
 r=await s.call('/api/chat/threads',{method:'POST',token:'b',body:{id:T1,model:'gemini-4-argon'}});assert.equal(r.status,404);assert.deepEqual(await r.json(),{error:'not_found'});
 for(const body of [{id:'not-a-uuid',model:'gemini-4-argon'},{id:'ABCDEF01-0000-4000-8000-000000000000',model:'gemini-4-argon'},{id:id(2),model:'gemini-4-argon',title:'a\nb'},{id:id(2),model:'gemini-4-argon',extra:1},[]])
  assert.equal((await s.call('/api/chat/threads',{method:'POST',body})).status,400,JSON.stringify(body));
 r=await s.call('/api/chat/threads',{method:'POST',body:{id:id(2),model:'gemini-3.5-flash'}});assert.equal(r.status,400);assert.deepEqual(await r.json(),{error:'model_unavailable'});
 assert.equal((await s.call('/api/chat/threads',{method:'POST',raw:'{bad'})).status,400);
 assert.equal((await s.call('/api/chat/threads',{method:'POST',body:{id:id(2),model:'gemini-4-argon',title:'x'.repeat(BODY_LIMIT)}})).status,400);
 for(let n=3;n<6;n++)await s.call('/api/chat/threads',{method:'POST',body:{id:id(n),model:'gemini-4-argon',title:'Thread '+n}});
 r=await s.call(`/api/chat/threads/${id(3)}`,{method:'PATCH',body:{title:'Renamed',status:'archived'}});assert.deepEqual([(await r.json()).item.title],['Renamed']);
 assert.equal((await s.call(`/api/chat/threads/${id(3)}`,{method:'PATCH',token:'b',body:{title:'x'}})).status,404);
 assert.equal((await s.call(`/api/chat/threads/${id(3)}`,{method:'PATCH',body:{}})).status,400);
 assert.equal((await s.call(`/api/chat/threads/${id(3)}`,{method:'PATCH',body:{model:'gemini-3.5-flash'}})).status,400);
 const page=await (await s.call('/api/chat/threads?limit=2')).json();
 assert.deepEqual(page.items.map(x=>x.id),[id(5),id(4)]);assert.equal('sortAt' in page.items[0],false);assert.ok(page.nextCursor);
 const next=await (await s.call('/api/chat/threads?limit=2&before='+page.nextCursor)).json();
 assert.deepEqual([next.items.map(x=>x.id),next.nextCursor],[[T1],null]);
 assert.deepEqual((await (await s.call('/api/chat/threads?status=archived')).json()).items.map(x=>x.id),[id(3)]);
 for(const q of ['?status=deleted','?limit=0','?limit=51','?before=x','?other=1','?limit=1&limit=2'])assert.equal((await s.call('/api/chat/threads'+q)).status,400,q);
 s.revocation.length=0;await s.call('/api/chat/threads');await s.call('/api/chat/threads',{method:'POST',body:{id:T1,model:'gemini-4-argon'}});
 assert.deepEqual(s.revocation,[false,true]);
});

test('a turn streams accepted, round, tool, round, delta, message, done and journals the turn',async t=>{
 const s=await server({script:[[chunk([sql],{finishReason:'STOP',usage:USAGE})],reply('Due now: ฿1,000')]});t.after(s.close);
 await s.call('/api/chat/threads',{method:'POST',body:{id:T1,model:'gemini-4-argon'}});
 const r=await s.call(`/api/chat/threads/${T1}/messages`,{method:'POST',body:{id:M1,text:'What is due today?'},headers:{Accept:'text/event-stream',Origin:ORIGIN}});
 assert.equal(r.status,200);assert.match(r.headers.get('content-type'),/^text\/event-stream/);
 assert.equal(r.headers.get('cache-control'),'no-store');assert.equal(r.headers.get('x-accel-buffering'),'no');assert.equal(r.headers.get('access-control-allow-origin'),ORIGIN);
 const {list,names}=await events(r);
 assert.deepEqual(names,['accepted','round','tool','tool','round','delta','delta','message','done']);
 assert.deepEqual(list[0][1],{messageId:M1,seq:1,model:'gemini-4-argon'});
 assert.deepEqual(list[3][1],{callId:'q1',name:'sql_query',state:'ok',ms:list[3][1].ms,summary:'1 rows'});
 assert.deepEqual([list[7][1].role,list[7][1].status,list[7][1].text,list[7][1].seq],['assistant','ok','Due now: ฿1,000',2]);
 const [,messageId,assistant,history,toolCalls]=s.store.log.find(x=>x[0]==='complete');
 assert.equal(messageId,M1);
 assert.deepEqual(Object.keys(assistant).sort(),['attempts','cachedTokens','errorCode','latencyMs','model','outputTokens','promptTokens','rounds','status','text','thinkingLevel','thoughtsTokens']);
 assert.deepEqual([assistant.status,assistant.rounds,assistant.attempts,assistant.promptTokens,assistant.errorCode,assistant.thinkingLevel],['ok',2,2,200,null,'MEDIUM']);
 assert.deepEqual([history.epoch,history.seq,history.messages.length],[0,0,4]);
 assert.deepEqual(toolCalls.map(c=>[c.callId,c.round,c.name]),[['q1',1,'sql_query']]);
 // Outcome read and idempotent re-POST after completion.
 const outcome=await (await s.call(`/api/chat/threads/${T1}/messages/${M1}`)).json();
 assert.deepEqual([outcome.user.status,outcome.assistant.seq],['ok',2]);
 const again=await s.call(`/api/chat/threads/${T1}/messages`,{method:'POST',body:{id:M1,text:'What is due today?'},headers:{Accept:'text/event-stream'}});
 assert.equal(again.status,200);assert.match(again.headers.get('content-type'),/json/);assert.deepEqual((await again.json()).assistant.seq,2);
 assert.equal((await s.call(`/api/chat/threads/${T1}/messages/${M1}`,{token:'b'})).status,404);
 const page=await (await s.call(`/api/chat/threads/${T1}/messages?limit=1`)).json();
 assert.deepEqual([page.items.map(m=>m.seq),page.nextCursor],[[2],'2']);
 const older=await (await s.call(`/api/chat/threads/${T1}/messages?before=2`)).json();assert.deepEqual([older.items.map(m=>m.seq),older.nextCursor],[[1],null]);
 assert.ok(s.logs.some(l=>l.event==='chat_turn'&&l.ok&&l.rounds===2&&!('text' in l)));
});

test('retract tool_round, pings while waiting, ?stream=0, a failed turn and a model override',async t=>{
 const s=await server({pingMs:20,delay:60,script:[[chunk([{text:'Let me'}]),chunk([sql],{finishReason:'STOP',usage:USAGE})],reply('Hello'),
  new Response('{}',{status:404}),reply('Plain')]});t.after(s.close);
 await s.call('/api/chat/threads',{method:'POST',body:{id:T1,model:'gemini-4-argon'}});
 const streamed=await events(await s.call(`/api/chat/threads/${T1}/messages`,{method:'POST',body:{id:M1,text:'Hi'},headers:{Accept:'text/event-stream'}}));
 assert.deepEqual(streamed.names.slice(0,4),['accepted','round','delta','retract']);
 assert.deepEqual(streamed.list[3][1],{reason:'tool_round',attempt:0});assert.ok(streamed.pings>=1);
 // A failed turn: error event, the failed row with the canned text and the fixed code, done last.
 const failed=await events(await s.call(`/api/chat/threads/${T1}/messages`,{method:'POST',body:{id:M2,text:'Again'},headers:{Accept:'text/event-stream'}}));
 assert.deepEqual(failed.names,['accepted','round','error','done']);assert.deepEqual(failed.list[2][1],{code:'MODEL_UNAVAILABLE'});
 const complete=s.store.log.filter(x=>x[0]==='complete').at(-1);
 assert.deepEqual([complete[2].status,complete[2].errorCode,complete[2].text,complete[3]],['failed','MODEL_UNAVAILABLE','I could not complete this request. Check the app before asking again.',null]);
 // ?stream=0 answers one JSON {user, assistant}; a model override applies to the thread.
 const r=await s.call(`/api/chat/threads/${T1}/messages?stream=0`,{method:'POST',body:{id:id(13),text:'Plain',model:'gemini-3.8-flash'}});
 const body=await r.json();assert.equal(r.status,200);assert.deepEqual([body.user.id,body.assistant.text,body.assistant.model],[id(13),'Plain','gemini-3.8-flash']);
 assert.equal(s.store.threadMap.get(T1).model,'gemini-3.8-flash');
});

test('a commit that fails (not a late completion) stores a failed INTERNAL reply so the thread is not held',async t=>{
 const s=await server({script:[reply('Hello'),reply('Again'),reply('Late')]});t.after(s.close);
 await s.call('/api/chat/threads',{method:'POST',body:{id:T1,model:'gemini-4-argon'}});
 // A history row over the CHECK limit (23514): the first commit fails, one release commits a failed row, no history, no tool rows.
 s.store.completeFail=Object.assign(Error('check_violation'),{code:'23514'});
 const first=await events(await s.call(`/api/chat/threads/${T1}/messages`,{method:'POST',body:{id:M1,text:'Hi'},headers:{Accept:'text/event-stream'}}));
 assert.deepEqual(first.names.slice(-2),['error','done']);assert.deepEqual(first.list.at(-2)[1],{code:'INTERNAL'});
 const [failedCommit,released]=s.store.log.filter(x=>x[0]==='complete').slice(-2);
 assert.equal(failedCommit[1],M1);assert.deepEqual([released[1],released[2].status,released[2].errorCode,released[3],released[4]],[M1,'failed','INTERNAL',null,[]]);
 assert.ok(s.logs.some(x=>x.event==='chat_turn_released'&&x.messageId===M1));
 // The thread is free again: the next message is claimed and answered.
 const next=await events(await s.call(`/api/chat/threads/${T1}/messages`,{method:'POST',body:{id:M2,text:'Again'},headers:{Accept:'text/event-stream'}}));
 assert.ok(next.names.includes('message'));
 // A late completion (23505) is not released: another claim owns the turn.
 const before=s.store.log.filter(x=>x[0]==='complete').length;
 s.store.completeFail=Object.assign(Error('unique_violation'),{code:'23505'});
 await events(await s.call(`/api/chat/threads/${T1}/messages`,{method:'POST',body:{id:id(14),text:'Late'},headers:{Accept:'text/event-stream'}}));
 assert.equal(s.store.log.filter(x=>x[0]==='complete').length,before+1);
});

test('batch 2: a turn whose stream closed records the reply event; an attached stream and ?stream=0 never do',async t=>{
 const s=await server({delay:150,script:[reply('Hello'),reply('Gone'),reply('Plain')]});t.after(s.close);
 await s.call('/api/chat/threads',{method:'POST',body:{id:T1,model:'gemini-4-argon'}});
 await events(await s.call(`/api/chat/threads/${T1}/messages`,{method:'POST',body:{id:M1,text:'Hi'},headers:{Accept:'text/event-stream'}}));
 // The device leaves mid-turn (the PWA aborts on hidden or pagehide): the completion carries the thread to notify.
 const controller=new AbortController();
 const response=await s.call(`/api/chat/threads/${T1}/messages`,{method:'POST',body:{id:M2,text:'Again'},headers:{Accept:'text/event-stream'},signal:controller.signal});
 const reader=response.body.getReader();await reader.read();controller.abort();
 const deadline=Date.now()+5000;while(!s.store.log.some(x=>x[0]==='complete'&&x[1]===M2)&&Date.now()<deadline)await new Promise(r=>setTimeout(r,20));
 const plain=await s.call(`/api/chat/threads/${T1}/messages?stream=0`,{method:'POST',body:{id:id(15),text:'Plain'}});assert.equal(plain.status,200);
 const notify=Object.fromEntries(s.store.log.filter(x=>x[0]==='complete').map(x=>[x[1],x[5]]));
 assert.deepEqual(notify,{[M1]:null,[M2]:{thread:T1},[id(15)]:null});
});

test('batch 2: GET one thread returns the caller\'s own record; another Partner gets 404, a bad id 400',async t=>{
 const s=await server();t.after(s.close);
 await s.call('/api/chat/threads',{method:'POST',body:{id:T1,model:'gemini-4-argon'}});
 const own=await s.call(`/api/chat/threads/${T1}`);assert.equal(own.status,200);assert.deepEqual(Object.keys((await own.json()).item).sort(),['createdAt','id','lastMessageAt','messageCount','model','status','title']);
 assert.equal((await s.call(`/api/chat/threads/${T1}`,{token:'b'})).status,404);
 assert.equal((await s.call('/api/chat/threads/00000000-0000-1000-8000-000000000000')).status,400);
});

test('a re-POST of a finished message returns its outcome without applying a model override',async t=>{
 const s=await server({script:[reply('Hello')]});t.after(s.close);
 await s.call('/api/chat/threads',{method:'POST',body:{id:T1,model:'gemini-4-argon'}});
 await s.call(`/api/chat/threads/${T1}/messages?stream=0`,{method:'POST',body:{id:M1,text:'Hi'}});
 const again=await s.call(`/api/chat/threads/${T1}/messages?stream=0`,{method:'POST',body:{id:M1,text:'Hi',model:'gemini-3.8-flash'}});
 assert.equal(again.status,200);assert.equal((await again.json()).assistant.text,'Hello');assert.equal(s.store.threadMap.get(T1).model,'gemini-4-argon');
});

test('message validation, 404, 409 and 503',async t=>{
 const s=await server();t.after(s.close);
 await s.call('/api/chat/threads',{method:'POST',body:{id:T1,model:'gemini-4-argon'}});
 const post=(body,token='a')=>s.call(`/api/chat/threads/${T1}/messages?stream=0`,{method:'POST',token,body});
 for(const body of [{id:M1,text:''},{id:M1,text:'x'.repeat(4001)},{id:M1,text:'bad\u0001'},{id:M1,text:'bad\r\n'},{id:'x',text:'ok'},{id:M1,text:'ok',extra:1},{id:M1,text:'\ud800'}])
  assert.equal((await post(body)).status,400,JSON.stringify(body));
 assert.equal((await post({id:M1,text:'ok',model:'gemini-3.5-flash'})).status,400);
 assert.equal((await post({id:M1,text:'ok\n\tindented'})).status!==400,true);
 assert.equal((await s.call(`/api/chat/threads/${T1}/messages?stream=1`,{method:'POST',body:{id:M2,text:'x'}})).status,400);
 assert.equal((await post({id:M2,text:'x'},'b')).status,404);
 s.store.fail=Object.assign(Error('turn_in_progress'),{code:'55006'});
 let r=await post({id:M2,text:'x'});assert.equal(r.status,409);assert.deepEqual(await r.json(),{error:'turn_in_progress'});
 s.store.fail=Object.assign(Error('thread_full'),{code:'54000'});
 r=await post({id:M2,text:'x'});assert.equal(r.status,400);assert.deepEqual(await r.json(),{error:'invalid_request',detail:'thread_full'});
 s.store.fail=Object.assign(Error('connection refused'),{code:'ECONNREFUSED'});
 r=await post({id:M2,text:'x'});assert.equal(r.status,503);assert.deepEqual(await r.json(),{error:'unavailable'});
 assert.equal((await s.call(`/api/chat/threads/${id(99)}/messages`)).status,404);
 assert.equal((await s.call(`/api/chat/threads/${T1}/messages?before=0`)).status,400);
});
