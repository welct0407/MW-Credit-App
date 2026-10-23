// R090: the conversation engine (services/chat/engine.mjs) over the real Vertex transport (services/chat/gemini.mjs)
// with a fake fetch returning scripted SSE chunk sequences, and the real tool bridge over fake read and SQL
// providers. Covers the round loop, nudges, rejections with the shared attempt counter, retry classes and the
// fixed error codes, the turn deadline, epochs and the seed transcript, chunk merging and usage. Synthetic data.
import test from 'node:test';
import assert from 'node:assert/strict';
import {runTurn,selectEpoch,seedText,failureText,REPLY_LIMIT} from '../../services/chat/engine.mjs';
import {createVertexTransport,ChunkMerger,endpoint} from '../../services/chat/gemini.mjs';
import {createChatTools} from '../../services/chat/tools.mjs';
import {promptDigest,FINISH_NUDGE,ROUND_NUDGE,HISTORY_NOTE,ASSISTANT_INSTRUCTIONS} from '../../services/chat/prompt.mjs';

const CHAT={location:'global',default:'gemini-4-argon',thinkingLevel:'MEDIUM',maxRounds:16,requestTimeoutSeconds:120,turnTimeoutSeconds:240,
 historyTokenLimit:150000,seedChars:40000,maxOutputTokens:16384,models:[{id:'gemini-4-argon',label:'Argon',available:true}]};
const USAGE={promptTokenCount:100,candidatesTokenCount:10,thoughtsTokenCount:5,cachedContentTokenCount:40};
const ACTOR={issuer:'https://securetoken.google.com/clever-oasis-508610-n7',subject:'s1',partnerId:'P1',loginEmail:'p1@example.invalid'};
const chunk=(parts,extra={})=>({candidates:[{content:{role:'model',parts},...(extra.finishReason?{finishReason:extra.finishReason}:{})}],...(extra.usage?{usageMetadata:extra.usage}:{})});
/** A text reply streamed in two chunks. */
const reply=text=>[chunk([{text:text.slice(0,4)}]),chunk([{text:text.slice(4)}],{finishReason:'STOP',usage:USAGE})];
const calls=(...list)=>[chunk(list.map(c=>({functionCall:c})),{finishReason:'STOP',usage:USAGE})];
const sse=events=>new Response(events.map(e=>`data: ${JSON.stringify(e)}\n\n`).join(''),{status:200,headers:{'content-type':'text/event-stream'}});
const status=code=>new Response('{"error":{}}',{status:code});
const hang=init=>new Promise((_,reject)=>init.signal.addEventListener('abort',()=>reject(Object.assign(Error('aborted'),{name:'AbortError'}))));

/** Fake Vertex: each script entry is an SSE event list, a Response, or a function(init). Records request bodies. */
function vertex(script){
 const requests=[],urls=[];let sleeps=0;
 const transport=createVertexTransport({projectId:'clever-oasis-508610-n7',location:'global',getToken:async()=>'synthetic-token',sleep:async()=>{sleeps++;},
  fetch:async(url,init)=>{urls.push(url);requests.push(JSON.parse(init.body));assert.equal(init.headers.Authorization,'Bearer synthetic-token');
   const next=script.shift();if(next===undefined)throw Error('script exhausted');
   if(typeof next==='function')return next(init);if(next instanceof Response)return next;return sse(next);}});
 return {transport,requests,urls,get sleeps(){return sleeps;},script};
}
const ROWS={L1:[{'Row ID':'C1','Amount Remaining':'1000.00'}],L2:[{'Row ID':'C2','Amount Remaining':'250.00'}]};
function tools({delay=0}={}){
 const state={active:0,max:0,queries:0};
 const readProvider={
  catalogue:async(_c,{scope})=>({manifestSha256:'m'.repeat(64),resources:scope==='oltp'?[{scope:'oltp',resource:'Charges',key:'Row ID',legacyPermission:'Read',
   fields:[{name:'Row ID',sourceType:'Text',nativeStatus:'physical'},{name:'Amount Remaining',sourceType:'Price',nativeStatus:'physical'},{name:'Ref Loans',sourceType:'Ref',nativeStatus:'physical'}]}]
   :[{scope:'olap',resource:'Daily Analytics',key:'Row ID',legacyPermission:'Read',fields:[{name:'Row ID',sourceType:'Text',nativeStatus:'physical'}]}]}),
  query:async(_c,input)=>{state.queries++;state.active++;state.max=Math.max(state.max,state.active);await new Promise(r=>setTimeout(r,delay));state.active--;
   return {rows:ROWS[input.predicate?.value]??[]};},
 };
 const sqlTool={query:async()=>({columns:['due'],rows:[{due:'1000.00'}],row_count:1,complete:true}),payoff:async id=>({loan_id:id,eligible:false,reason:'x',complete:true})};
 return {bridge:createChatTools({readProvider,sqlTool,actor:ACTOR}),state};
}
const readCall=(id,loan)=>({name:'read_records',id,args:{app:'oltp',table:'Charges',keys:[],match_field:'Ref Loans',match_text:loan,filter:'',columns:['Amount Remaining'],offset:0,limit:10}});
async function turn(script,{chat=CHAT,history=null,seed=[],text='What is due today?',delay=0,model='gemini-4-argon'}={}){
 const v=vertex(script),t=tools({delay}),events=[];
 const outcome=await runTurn({chat,model,transport:v.transport,tools:t.bridge,history,seed,partnerLanguage:'English',text,emit:(name,data)=>events.push([name,data])});
 return {outcome,events,requests:v.requests,urls:v.urls,state:t.state,vertex:v,tools:t.bridge};
}
const names=events=>events.map(([n])=>n);

test('one round: text reply, deltas, request body, history and usage',async()=>{
 const {outcome,events,requests,urls}=await turn([reply('Hello there')]);
 assert.equal(outcome.ok,true);assert.equal(outcome.text,'Hello there');
 assert.deepEqual(events,[['round',{n:1}],['delta',{text:'Hell'}],['delta',{text:'o there'}]]);
 assert.equal(urls[0],'https://aiplatform.googleapis.com/v1/projects/clever-oasis-508610-n7/locations/global/publishers/google/models/gemini-4-argon:streamGenerateContent?alt=sse');
 const body=requests[0];
 assert.deepEqual(body.generationConfig,{maxOutputTokens:16384,candidateCount:1,thinkingConfig:{thinkingLevel:'MEDIUM'}});
 assert.equal('thinkingBudget' in body.generationConfig.thinkingConfig,false);assert.equal('temperature' in body.generationConfig,false);
 assert.deepEqual(body.toolConfig,{functionCallingConfig:{mode:'AUTO'}});
 assert.equal(body.systemInstruction.parts[0].text,ASSISTANT_INSTRUCTIONS);assert.match(body.systemInstruction.parts[1].text,/^BUSINESS RULES \(owner-confirmed reference; live data wins over it\)\n\n/);
 assert.deepEqual(body.tools[0].functionDeclarations.map(d=>d.name),['data_catalogue','read_records','sum_field','sql_query','loan_payoff']);
 // New epoch without earlier exchanges: no seed part; the opening JSON carries language, as-of and the raw text.
 assert.equal(body.contents.length,1);assert.equal(body.contents[0].parts.length,1);
 const opening=JSON.parse(body.contents[0].parts[0].text);
 assert.deepEqual(Object.keys(opening),['partner_language','as_of','request']);
 assert.equal(opening.partner_language,'English');assert.equal(opening.request,'What is due today?');assert.match(opening.as_of,/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}\+07:00$/);
 assert.deepEqual(outcome.history.messages.map(m=>m.role),['user','model']);
 assert.equal(outcome.history.messages[1].content,JSON.stringify([{text:'Hello there'}]));
 assert.deepEqual([outcome.history.epoch,outcome.history.seq,outcome.history.inputTokens],[0,0,100]);
 assert.equal(outcome.history.promptSha256,promptDigest({model:'gemini-4-argon',declarations:body.tools[0].functionDeclarations}));
 assert.deepEqual([outcome.usage,outcome.rounds,outcome.attempts],[{promptTokens:100,outputTokens:10,thoughtsTokens:5,cachedTokens:40},1,1]);
});

test('a tool round runs two reads concurrently, echoes ids, derives a duplicate journal id, and the reply is grounded',async()=>{
 const {outcome,events,requests,state,tools:bridge}=await turn([calls(readCall('dup','L1'),readCall('dup','L2')),reply('Due now: ฿1,250')],{delay:20});
 assert.equal(outcome.ok,true,JSON.stringify(outcome));assert.equal(state.max,2);
 const answers=requests[1].contents.at(-1);
 assert.equal(answers.role,'user');
 assert.deepEqual(answers.parts.map(p=>[p.functionResponse.name,p.functionResponse.id,p.functionResponse.response.result.observation]),[['read_records','dup','observation-1'],['read_records','dup','observation-2']]);
 assert.equal(answers.parts[0].functionResponse.response.result.rows[0]['Amount Remaining'],'1000.00');
 assert.deepEqual(bridge.journal.map(j=>[j.callId,j.round,j.name,j.error]),[['dup',1,'read_records',null],['dup~1-1',1,'read_records',null]]);
 assert.deepEqual(names(events),['round','tool','tool','tool','tool','round','delta','delta']);
 assert.deepEqual(events.filter(([n,d])=>n==='tool'&&d.state==='ok').map(([,d])=>[d.callId,d.summary]),[['dup','Charges'],['dup~1-1','Charges']]);
 assert.deepEqual([outcome.usage.promptTokens,outcome.rounds,outcome.history.messages.length],[200,2,4]);
});

test('text streamed in a round that ends in a call is retracted silently',async()=>{
 const {outcome,events}=await turn([[chunk([{text:'Let me check'}]),chunk([{functionCall:readCall('a','L1')}],{finishReason:'STOP',usage:USAGE})],reply('Due now: ฿1,000')]);
 assert.equal(outcome.ok,true);
 assert.deepEqual(events.slice(0,3),[['round',{n:1}],['delta',{text:'Let me check'}],['retract',{reason:'tool_round',attempt:0}]]);
});

test('FINISH_NUDGE once after an empty reply; a second empty reply fails INTERNAL',async()=>{
 const empty=[chunk([{text:'',thoughtSignature:'sig'}],{finishReason:'STOP',usage:USAGE})];
 const ok=await turn([empty,reply('Hello')]);
 assert.equal(ok.outcome.ok,true);assert.deepEqual(ok.requests[1].contents.at(-1),{role:'user',parts:[{text:FINISH_NUDGE}]});
 assert.equal(FINISH_NUDGE,'Answer now in plain text; do not call more tools.');
 const failed=await turn([empty,empty]);
 assert.deepEqual([failed.outcome.ok,failed.outcome.code,failed.outcome.detail,failed.outcome.history],[false,'INTERNAL','REPLY_EMPTY',undefined]);
});

test('ROUND_NUDGE is its own content at maxRounds; calls after it fail TOOL_ROUNDS_EXCEEDED without running',async()=>{
 const {outcome,requests,state}=await turn([calls(readCall('a','L1')),calls(readCall('b','L2'))],{chat:{...CHAT,maxRounds:1}});
 assert.deepEqual([outcome.ok,outcome.code],[false,'TOOL_ROUNDS_EXCEEDED']);
 assert.equal(state.queries,1);
 assert.deepEqual(requests[1].contents.slice(-2).map(c=>Object.keys(c.parts[0])[0]),['functionResponse','text']);
 assert.deepEqual(requests[1].contents.at(-1),{role:'user',parts:[{text:ROUND_NUDGE}]});
 const answered=await turn([calls(readCall('a','L1')),reply('Due now: ฿1,000')],{chat:{...CHAT,maxRounds:1}});
 assert.equal(answered.outcome.ok,true);
});

test('grounding rejection (exact text) then success; history keeps the rejected content and the rejection',async()=>{
 const {outcome,events,requests}=await turn([calls(readCall('a','L1')),reply('Due now: ฿1,400'),reply('Due now: ฿1,000')]);
 assert.equal(outcome.ok,true);
 assert.deepEqual(events.filter(([n])=>n==='retract'),[['retract',{reason:'ungrounded',attempt:1}]]);
 const rejection="UNGROUNDED_AMOUNTS: ฿1,400 are not in this turn's observations. Remove them, or re-check the data with a tool and quote the observed figure. Attempt 1 of 3.";
 assert.deepEqual(requests[2].contents.slice(-2),[{role:'model',parts:[{text:'Due now: ฿1,400'}]},{role:'user',parts:[{text:rejection}]}]);
 assert.deepEqual(outcome.history.messages.slice(3,5).map(m=>m.content),[JSON.stringify([{text:'Due now: ฿1,400'}]),JSON.stringify([{text:rejection}])]);
 // The raw message (not the JSON wrapper) is the grounding instruction: a figure the partner wrote grounds.
 assert.equal((await turn([reply('After ฿25,000 paid')],{text:'If I pay 25000 today?'})).outcome.ok,true);
});

test('too long, then ungrounded twice: one shared counter ends the turn with GROUNDING_EXCEEDED',async()=>{
 const long='x'.repeat(REPLY_LIMIT+1);
 const {outcome,events,requests}=await turn([reply(long),reply('Due ฿9,999'),reply('Due ฿9,998')]);
 assert.deepEqual([outcome.ok,outcome.code,outcome.detail],[false,'GROUNDING_EXCEEDED','FINISH_UNGROUNDED_EXCEEDED']);
 assert.deepEqual(events.filter(([n])=>n==='retract').map(([,d])=>d),[{reason:'too_long',attempt:1},{reason:'ungrounded',attempt:2}]);
 assert.equal(requests[1].contents.at(-1).parts[0].text,`REPLY_TOO_LONG: ${REPLY_LIMIT+1} characters; the limit is 4000. Shorten the reply.`);
 assert.match(requests[2].contents.at(-1).parts[0].text,/Attempt 2 of 3\.$/);
 assert.equal(requests.length,3);
});

test('retry classes: 429 twice then success; 429 three times; 500 once; 404 and 400 not retried',async()=>{
 const twice=await turn([status(429),status(429),reply('Hello')]);
 assert.deepEqual([twice.outcome.ok,twice.outcome.attempts,twice.vertex.sleeps],[true,3,2]);
 const thrice=await turn([status(429),status(429),status(429)]);
 assert.deepEqual([thrice.outcome.code,thrice.outcome.attempts],['MODEL_UNAVAILABLE',3]);
 const unavailable=await turn([status(503),status(503),status(503)]);assert.equal(unavailable.outcome.code,'MODEL_UNAVAILABLE');
 const once=await turn([status(500),reply('Hello')]);assert.deepEqual([once.outcome.ok,once.outcome.attempts],[true,2]);
 const fivehundred=await turn([status(502),status(502)]);assert.deepEqual([fivehundred.outcome.code,fivehundred.outcome.attempts],['MODEL_UNAVAILABLE',2]);
 const missing=await turn([status(404)]);assert.deepEqual([missing.outcome.code,missing.outcome.attempts],['MODEL_UNAVAILABLE',1]);
 const bad=await turn([status(400)]);assert.deepEqual([bad.outcome.code,bad.outcome.attempts],['INTERNAL',1]);
 // A quota error inside the stream is retried like the HTTP answer.
 const inStream=await turn([[{error:{code:429,message:'quota'}}],reply('Hello')]);assert.deepEqual([inStream.outcome.ok,inStream.outcome.attempts],[true,2]);
});

test('request timeout: one retry, then MODEL_TIMEOUT; a network failure retried once; mid-stream drop retracts',async()=>{
 const chat={...CHAT,requestTimeoutSeconds:0.05};
 const timeout=await turn([hang,hang],{chat});
 assert.deepEqual([timeout.outcome.code,timeout.outcome.attempts],['MODEL_TIMEOUT',2]);
 const recovered=await turn([hang,reply('Hello')],{chat});assert.equal(recovered.outcome.ok,true);
 const network=await turn([()=>{throw new TypeError('fetch failed');},()=>{throw new TypeError('fetch failed');}]);
 assert.equal(network.outcome.code,'MODEL_UNAVAILABLE');
 const broken=()=>{let pulls=0;return new Response(new ReadableStream({pull(c){if(pulls++===0)c.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(chunk([{text:'Par'}]))}\n\n`));else c.error(Error('reset'));}}),{status:200});};
 const dropped=await turn([broken,reply('Hello')]);
 assert.equal(dropped.outcome.ok,true);
 assert.deepEqual(dropped.events.slice(0,3),[['round',{n:1}],['delta',{text:'Par'}],['retract',{reason:'tool_round',attempt:0}]]);
});

test('turn deadline: TURN_TIMEOUT with no history',async()=>{
 const {outcome}=await turn([hang],{chat:{...CHAT,turnTimeoutSeconds:0.3}});
 assert.deepEqual([outcome.ok,outcome.code,outcome.history],[false,'TURN_TIMEOUT',undefined]);
});

test('MALFORMED_FUNCTION_CALL is resent once with the identical body, then fails; blocked and stopped answers map to fixed codes',async()=>{
 const malformed=[chunk([{text:''}],{finishReason:'MALFORMED_FUNCTION_CALL'})];
 const resent=await turn([malformed,reply('Hello')]);
 assert.equal(resent.outcome.ok,true);assert.deepEqual(resent.requests[0],resent.requests[1]);
 const twice=await turn([malformed,malformed]);assert.deepEqual([twice.outcome.code,twice.outcome.detail],['INTERNAL','GEMINI_STOP_MALFORMED_FUNCTION_CALL']);
 assert.equal((await turn([[{promptFeedback:{blockReason:'SAFETY'}}]])).outcome.code,'PROMPT_BLOCKED');
 assert.equal((await turn([[chunk([{text:'x'}],{finishReason:'PROHIBITED_CONTENT'})]])).outcome.code,'PROMPT_BLOCKED');
 const truncated=await turn([[chunk([{text:'x'}],{finishReason:'MAX_TOKENS'})]]);assert.deepEqual([truncated.outcome.code,truncated.outcome.detail],['INTERNAL','GEMINI_STOP_MAX_TOKENS']);
 assert.equal((await turn([[chunk([{inlineData:{}}],{finishReason:'STOP'})]])).outcome.code,'INTERNAL');
});

test('epochs: same digest replays and continues; model change and token limit open a new epoch with the seed',async()=>{
 const first=await turn([reply('Hello')]);
 const prompt=first.outcome.history.promptSha256;
 const rows=first.outcome.history.messages.map((m,i)=>({seq:i,role:m.role,content:m.content,prompt_sha256:prompt,input_tokens:i===1?100:null}));
 const seed=[{userText:'What is due?',userAt:'2026-10-21T07:05:00.000Z',assistantText:'Due now: ฿1,000',assistantStatus:'ok',assistantAt:'2026-10-21T07:06:00.000Z'},
  {userText:'And tomorrow?',userAt:'2026-10-21T08:00:00.000Z',assistantText:failureText('English'),assistantStatus:'failed',assistantAt:'2026-10-21T08:04:00.000Z'}];
 const same=await turn([reply('Again')],{history:{epoch:3,rows},seed});
 assert.deepEqual([same.outcome.history.epoch,same.outcome.history.seq],[3,2]);
 assert.deepEqual(same.requests[0].contents.slice(0,2),[{role:'user',parts:JSON.parse(rows[0].content)},{role:'model',parts:[{text:'Hello'}]}]);
 assert.equal(same.requests[0].contents[2].parts.length,1); // no seed when the epoch continues
 const changed=await turn([reply('Again')],{history:{epoch:3,rows},seed,model:'gemini-3.8-flash'});
 assert.deepEqual([changed.outcome.history.epoch,changed.outcome.history.seq],[4,0]);
 const opening=changed.requests[0].contents[0];
 assert.equal(changed.requests[0].contents.length,1);
 assert.equal(opening.parts[0].text,'Earlier conversation with this partner (context only; oldest first; Bangkok time):\n\n'
  +'[21-Oct-2026 14:05] Partner: What is due?\n[21-Oct-2026 14:06] Assistant: Due now: ฿1,000\n\n'
  +'[21-Oct-2026 15:00] Partner: And tomorrow?\n[21-Oct-2026 15:04] Notice: I could not complete this request. Check the app before asking again.');
 const over=await turn([reply('Again')],{history:{epoch:3,rows:rows.map((r,i)=>i===1?{...r,input_tokens:150001}:r)},seed,chat:{...CHAT,seedChars:160}});
 assert.equal(over.outcome.history.epoch,4);
 assert.match(over.requests[0].contents[0].parts[0].text,/^Earlier conversation with this partner \(context only; oldest first; Bangkok time; 1 earlier exchange omitted\):\n\n\[21-Oct-2026 15:00\]/);
 const off=await turn([reply('Again')],{seed,chat:{...CHAT,seedChars:0}});
 assert.equal(off.requests[0].contents[0].parts[0].text,HISTORY_NOTE);
 assert.equal(seedText([{userText:'x',userAt:'not a date',assistantStatus:'ok',assistantText:'y'}],100),'Note: the earlier conversation could not be loaded for this turn. Ask the partner for any context you need from them.');
 assert.deepEqual(selectEpoch(null,'p',10),{epoch:0,rows:[],seq:0});
});

test('chunk merge: plain text concatenates; thought and signature parts and calls stay whole; usage from the last chunk that has one',()=>{
 const merger=new ChunkMerger();
 const deltas=[
  merger.push(chunk([{text:'thinking',thought:true}])),
  merger.push(chunk([{text:'Due '}])),merger.push(chunk([{text:'now'}],{usage:{promptTokenCount:7}})),
  merger.push(chunk([{text:': ฿1',thoughtSignature:'s1'}])),
  merger.push(chunk([{functionCall:{name:'sql_query',args:{sql:'SELECT 1'},id:'c1'},thoughtSignature:'s2'}],{finishReason:'STOP',usage:USAGE})),
 ];
 assert.deepEqual(deltas,['','Due ','now',': ฿1','']);
 const result=merger.result();
 assert.deepEqual(result.message.parts,[{text:'thinking',thought:true},{text:'Due now'},{text:': ฿1',thoughtSignature:'s1'},{functionCall:{name:'sql_query',args:{sql:'SELECT 1'},id:'c1'},thoughtSignature:'s2'}]);
 assert.deepEqual(result.calls,[{name:'sql_query',args:{sql:'SELECT 1'},id:'c1'}]);
 assert.equal(result.text,'Due now: ฿1');assert.equal(result.inputTokens,100);
 assert.equal(endpoint({projectId:'p',location:'asia-southeast1',model:'gemini-4-argon'}),'https://asia-southeast1-aiplatform.googleapis.com/v1/projects/p/locations/asia-southeast1/publishers/google/models/gemini-4-argon:streamGenerateContent?alt=sse');
});

test('signatures replay verbatim in the next round',async()=>{
 const {requests}=await turn([[chunk([{functionCall:readCall('a','L1'),thoughtSignature:'sig-1'}],{finishReason:'STOP',usage:USAGE})],reply('Due now: ฿1,000')]);
 assert.deepEqual(requests[1].contents[1],{role:'model',parts:[{functionCall:readCall('a','L1'),thoughtSignature:'sig-1'}]});
});

test('batch 2 (B4): the QUERY DISCIPLINE block follows FAST PATHS verbatim, with the pronoun rule in REPLY FORMAT',()=>{
 const block=`QUERY DISCIPLINE (every round re-sends the whole conversation; rounds, not rows, cost time and tokens)
• Plan the turn before the first call: list every fact the answer needs, then fetch them in at most two
  rounds. Round 1 resolves the borrower(s) in reporting_borrower_directory_v1. Round 2 fetches everything
  else in ONE batch of concurrent calls: loan facts, the borrower's charges, payment health, upcoming
  charges and the loan_payoff cross-checks.
• One query per relation per turn, naming every column you may need from it. Never fetch one column of
  a row and another column of the same row in a later round; never SELECT * from a wide view.
• Join or UNION in SQL instead of several small statements; aggregate in SQL.
• A later round is justified only by a fact you could not know earlier (an unexpected value, a missing
  row, an error). If you reach round 4 after the borrower is resolved, stop fetching: answer with what
  you have and say what is unverified.
• Charges missing for a date: read pwa_job_status_v1(7) once (job_name 'daily-charges', business_date,
  state, completed_at) and report it in plain words ("the daily charge job did not run on 22-Oct-2026");
  never probe other tables to explain a permission error.`;
 const at=ASSISTANT_INSTRUCTIONS.indexOf(block);
 assert.ok(at>ASSISTANT_INSTRUCTIONS.indexOf('FAST PATHS')&&at<ASSISTANT_INSTRUCTIONS.indexOf('You are the MW partner operations assistant'));
 const identify=ASSISTANT_INSTRUCTIONS.indexOf('Identify loans by borrower name'),pronoun=ASSISTANT_INSTRUCTIONS.indexOf("Refer to a borrower by name; use she/he/her/his only when the Partner's current message used that pronoun for them.");
 assert.ok(identify>ASSISTANT_INSTRUCTIONS.indexOf('REPLY FORMAT')&&pronoun>identify);
});
