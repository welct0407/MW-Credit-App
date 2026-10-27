// R102: the Claude dialect and VM relay transport (services/chat/claude.mjs) through the real engine, with a fake relay
// returning scripted Anthropic SSE streams and the real tool bridge over fake providers; the claude-* model id
// rules and CHAT_RELAY_URL (services/chat/config.mjs, business-config.mjs). Synthetic data and tokens only.
import test from 'node:test';
import assert from 'node:assert/strict';
import {runTurn} from '../../services/chat/engine.mjs';
import {createRelayTransport,chatRelayUrl,claudeDialect,ClaudeMerger,CLAUDE_EFFORT} from '../../services/chat/claude.mjs';
import {createVertexTransport} from '../../services/chat/gemini.mjs';
import {createChatTools,declarations as vertexDeclarations,anthropicTools} from '../../services/chat/tools.mjs';
import {promptDigest} from '../../services/chat/prompt.mjs';
import {MODEL_ID,parseChatModels,parseChatRelay,providerFor} from '../../services/chat/config.mjs';
import {loadBusinessConfig} from '../../services/production/business-config.mjs';
import {MODELS,chatEnv} from './chat-fixture.mjs';
import {businessEnv} from './business-env-fixture.mjs';

const RELAY='http://10.148.0.2:8791/v1/chat/messages',JWT='aaa.bbb.ccc',MODEL='claude-opus-5-5';
const CHAT={location:'global',default:MODEL,thinkingLevel:'LOW',maxRounds:16,requestTimeoutSeconds:120,turnTimeoutSeconds:240,
 historyTokenLimit:150000,seedChars:40000,maxOutputTokens:16384,models:[{id:MODEL,label:'Claude Opus 5.5',available:true}]};
const ACTOR={issuer:'https://securetoken.google.com/clever-oasis-508610-n7',subject:'s1',partnerId:'P1',loginEmail:'p1@example.invalid'};
const USAGE={input_tokens:50,cache_read_input_tokens:900,cache_creation_input_tokens:100,output_tokens:1};

/** One Anthropic stream: message_start, the content blocks (text split in two deltas, tool input JSON split in two),
 * message_delta with the stop reason and output tokens, message_stop. */
function stream(blocks,stop='end_turn',{output=20,usage=USAGE}={}){
 const events=[{type:'message_start',message:{id:'msg_1',type:'message',role:'assistant',content:[],usage}},{type:'ping'}];
 blocks.forEach((block,index)=>{
  if(block.type==='text'){events.push({type:'content_block_start',index,content_block:{type:'text',text:''}},
   {type:'content_block_delta',index,delta:{type:'text_delta',text:block.text.slice(0,4)}},{type:'content_block_delta',index,delta:{type:'text_delta',text:block.text.slice(4)}});}
  else if(block.type==='tool_use'){const json=JSON.stringify(block.input);events.push({type:'content_block_start',index,content_block:{type:'tool_use',id:block.id,name:block.name,input:{}}},
   {type:'content_block_delta',index,delta:{type:'input_json_delta',partial_json:json.slice(0,7)}},{type:'content_block_delta',index,delta:{type:'input_json_delta',partial_json:json.slice(7)}});}
  else if(block.type==='thinking'){events.push({type:'content_block_start',index,content_block:{type:'thinking',thinking:'',signature:''}},
   {type:'content_block_delta',index,delta:{type:'signature_delta',signature:block.signature}});}
  events.push({type:'content_block_stop',index});
 });
 events.push({type:'message_delta',delta:{stop_reason:stop,stop_sequence:null},usage:{output_tokens:output}},{type:'message_stop'});
 return events;
}
const reply=text=>stream([{type:'text',text}]);
const sse=events=>new Response(events.map(e=>`event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join(''),{status:200,headers:{'content-type':'text/event-stream'}});
const status=code=>new Response('{"status":"unavailable"}',{status:code});
const hang=init=>new Promise((_,reject)=>init.signal.addEventListener('abort',()=>reject(Object.assign(Error('aborted'),{name:'AbortError'}))));

function relay(script,{mintToken=async()=>JWT}={}){
 const requests=[],headers=[],urls=[];let sleeps=0;
 const transport=createRelayTransport({url:RELAY,mintToken,sleep:async()=>{sleeps++;},fetch:async(url,init)=>{
  urls.push(url);headers.push(init.headers);requests.push(JSON.parse(init.body));
  const next=script.shift();if(next===undefined)throw Error('script exhausted');
  if(typeof next==='function')return next(init);if(next instanceof Response)return next;return sse(next);}});
 return {transport,requests,headers,urls,get sleeps(){return sleeps;}};
}
const ROWS={L1:[{'Row ID':'C1','Amount Remaining':'1000.00'}],L2:[{'Row ID':'C2','Amount Remaining':'250.00'}]};
function bridge(){
 const readProvider={catalogue:async(_c,{scope})=>({manifestSha256:'m'.repeat(64),resources:scope==='oltp'?[{scope:'oltp',resource:'Charges',key:'Row ID',legacyPermission:'Read',
   fields:[{name:'Row ID',sourceType:'Text',nativeStatus:'physical'},{name:'Amount Remaining',sourceType:'Price',nativeStatus:'physical'},{name:'Ref Loans',sourceType:'Ref',nativeStatus:'physical'}]}]
   :[{scope:'olap',resource:'Daily Analytics',key:'Row ID',legacyPermission:'Read',fields:[{name:'Row ID',sourceType:'Text',nativeStatus:'physical'}]}]}),
  query:async(_c,input)=>({rows:ROWS[input.predicate?.value]??[]})};
 const sqlTool={query:async()=>({columns:['due'],rows:[{due:'1000.00'}],row_count:1,complete:true}),payoff:async id=>({loan_id:id,eligible:false,reason:'x',complete:true})};
 return createChatTools({readProvider,sqlTool,actor:ACTOR});
}
const readInput=loan=>({app:'oltp',table:'Charges',keys:[],match_field:'Ref Loans',match_text:loan,filter:'',columns:['Amount Remaining'],offset:0,limit:10});
async function turn(script,{chat=CHAT,history=null,model=MODEL,transport,mintToken}={}){
 const r=relay(script,{mintToken}),tools=bridge(),events=[];
 const outcome=await runTurn({chat,model,transport:transport??{claude:r.transport},tools,history,seed:[],partnerLanguage:'English',text:'What is due today?',emit:(n,d)=>events.push([n,d])});
 return {outcome,events,relay:r,tools};
}

test('model ids: claude-<family>-<major>[-<minor>] joins gemini-*; date-suffixed and other spellings are refused',()=>{
 for(const id of ['claude-opus-5-5','claude-opus-5','claude-sonnet-5-5','gemini-4-argon','gemini-3.8-flash'])assert.ok(MODEL_ID.test(id),id);
 for(const id of ['claude_opus','claude-opus-5-5-20260401','claude-Opus-5','claude-opus','claude-sonnet','anthropic-opus-5','claude-opus-5.5'])assert.equal(MODEL_ID.test(id),false,id);
 assert.deepEqual([providerFor(MODEL),providerFor('gemini-4-argon')],['claude','gemini']);
 const chat=parseChatModels(JSON.stringify({...MODELS,default:MODEL,models:[{id:MODEL,label:'Claude Opus 5.5',available:true},...MODELS.models]}));
 assert.equal(chat.models[0].id,MODEL);
});

test('CHAT_RELAY_URL: required for an available claude model, validated like the recognizer URL, chat role only',()=>{
 for(const value of [RELAY,'http://172.16.0.9:8791/v1/chat/messages'])assert.equal(chatRelayUrl(value),value);
 for(const value of ['https://10.148.0.2:8791/v1/chat/messages','http://34.1.2.3:8791/v1/chat/messages','http://10.148.0.2:8790/v1/chat/messages',
  'http://10.148.0.2:8791/v1/messages','http://10.148.0.2:8791/v1/chat/messages?x=1','http://u:p@10.148.0.2:8791/v1/chat/messages',undefined,''])assert.equal(chatRelayUrl(value),null,String(value));
 const models=JSON.stringify({...MODELS,default:MODEL,models:[{id:MODEL,label:'Claude Opus 5.5',available:true},...MODELS.models]});
 assert.throws(()=>loadBusinessConfig(chatEnv('dev',{CHAT_MODELS_JSON:models})),/Invalid chat configuration/);
 assert.throws(()=>loadBusinessConfig(chatEnv('dev',{CHAT_MODELS_JSON:models,CHAT_RELAY_URL:'http://10.148.0.2:8790/v1/chat/messages'})),/Invalid chat configuration/);
 const config=loadBusinessConfig(chatEnv('prod',{CHAT_MODELS_JSON:models,CHAT_RELAY_URL:RELAY}));
 assert.deepEqual(config.chatRelay,{url:RELAY,audience:RELAY});assert.ok(Object.isFrozen(config.chatRelay));
 assert.equal(loadBusinessConfig(chatEnv('dev')).chatRelay,null);
 // An unavailable claude entry needs no relay; a relay without claude models is harmless.
 const pending=parseChatModels(JSON.stringify({...MODELS,models:[...MODELS.models,{id:MODEL,label:'Claude Opus 5.5',available:false,reason:'temporarily unavailable'}]}));
 assert.equal(parseChatRelay(pending,undefined),null);
 assert.throws(()=>loadBusinessConfig({...businessEnv('dev','command'),CHAT_RELAY_URL:RELAY}),/Invalid DEV business candidate configuration/);
});

test('one round: request body, relay call, deltas, stored history and usage',async()=>{
 const {outcome,events,relay:r}=await turn([reply('Hello there')]);
 assert.equal(outcome.ok,true,JSON.stringify(outcome));assert.equal(outcome.text,'Hello there');
 assert.deepEqual(events,[['round',{n:1}],['delta',{text:'Hell'}],['delta',{text:'o there'}]]);
 assert.equal(r.urls[0],RELAY);
 assert.deepEqual(r.headers[0],{Authorization:'Bearer '+JWT,'Content-Type':'application/json',Accept:'text/event-stream'});
 const body=r.requests[0];
 assert.deepEqual(Object.keys(body).sort(),['max_tokens','messages','model','output_config','stream','system','tool_choice','tools']);
 assert.deepEqual([body.model,body.max_tokens,body.stream,body.tool_choice,body.output_config],[MODEL,16384,true,{type:'auto'},{effort:'medium'}]);
 assert.equal(CLAUDE_EFFORT,'medium');
 for(const key of ['thinking','temperature','top_p','top_k','fallbacks'])assert.equal(key in body,false,key);
 assert.equal(body.system.length,1);assert.deepEqual(body.system[0].cache_control,{type:'ephemeral'});assert.match(body.system[0].text,/BUSINESS RULES/);
 assert.deepEqual(body.tools.map(t=>Object.keys(t).sort().join()),Array(5).fill('description,input_schema,name'));
 assert.equal(body.tools[1].input_schema.type,'object');assert.equal(body.tools[1].input_schema.properties.limit.type,'integer');
 assert.deepEqual(body.messages.length,1);assert.equal(body.messages[0].role,'user');assert.equal(body.messages[0].content[0].type,'text');
 assert.deepEqual(JSON.parse(body.messages[0].content[0].text).request,'What is due today?');
 assert.deepEqual(outcome.history.messages.map(m=>m.role),['user','model']);
 assert.equal(outcome.history.messages[1].content,JSON.stringify([{type:'text',text:'Hello there'}]));
 assert.equal(outcome.history.promptSha256,promptDigest({model:MODEL,declarations:anthropicTools(),provider:'claude'}));
 assert.deepEqual([outcome.history.inputTokens,outcome.usage],[1050,{promptTokens:1050,outputTokens:20,thoughtsTokens:0,cachedTokens:900}]);
});

test('a tool round: thinking kept verbatim, two tool_use blocks parsed from split JSON, one user message of tool_result blocks',async()=>{
 const round=stream([{type:'thinking',signature:'sig-1'},{type:'tool_use',id:'toolu_1',name:'read_records',input:readInput('L1')},
  {type:'tool_use',id:'toolu_2',name:'read_records',input:readInput('L2')}],'tool_use');
 const {outcome,events,relay:r,tools}=await turn([round,reply('Due now: ฿1,250')]);
 assert.equal(outcome.ok,true,JSON.stringify(outcome));
 const [assistant,results]=r.requests[1].messages.slice(1);
 assert.equal(assistant.role,'assistant');
 assert.deepEqual(assistant.content[0],{type:'thinking',thinking:'',signature:'sig-1'});
 assert.deepEqual(assistant.content.slice(1).map(b=>[b.type,b.id,b.input.match_text]),[['tool_use','toolu_1','L1'],['tool_use','toolu_2','L2']]);
 assert.equal(results.role,'user');
 assert.deepEqual(results.content.map(b=>[b.type,b.tool_use_id,'is_error' in b]),[['tool_result','toolu_1',false],['tool_result','toolu_2',false]]);
 assert.equal(JSON.parse(results.content[0].content).rows[0]['Amount Remaining'],'1000.00');
 assert.deepEqual(tools.journal.map(j=>j.callId),['toolu_1','toolu_2']);
 assert.deepEqual(outcome.history.messages.map(m=>m.role),['user','model','user','model']);
 assert.equal(JSON.parse(outcome.history.messages[1].content)[0].signature,'sig-1');
 assert.ok(events.some(([n,d])=>n==='tool'&&d.state==='ok'));
});

test('a failed tool returns is_error; stored Claude history replays as assistant content in the same epoch',async()=>{
 const bad=stream([{type:'tool_use',id:'toolu_9',name:'read_records',input:{...readInput('L1'),limit:500}}],'tool_use');
 const first=await turn([bad,reply('I could not read the records.')]);
 assert.equal(first.outcome.ok,true,JSON.stringify(first.outcome));
 const result=first.relay.requests[1].messages.at(-1).content[0];
 assert.deepEqual([result.type,result.tool_use_id,result.is_error],['tool_result','toolu_9',true]);
 const rows=first.outcome.history.messages.map((m,seq)=>({...m,seq,prompt_sha256:first.outcome.history.promptSha256,input_tokens:100}));
 const second=await turn([reply('Hello again')],{history:{epoch:0,rows}});
 assert.equal(second.outcome.history.epoch,0);
 const messages=second.relay.requests[0].messages;
 assert.deepEqual(messages.map(m=>m.role),['user','assistant','user','assistant','user']);
 assert.deepEqual(messages[1].content[0].type,'tool_use');
});

test('a Gemini epoch is never replayed into Claude: the provider is part of the prompt digest',()=>{
 const gemini=promptDigest({model:MODEL,declarations:vertexDeclarations(),provider:'gemini'}),claude=promptDigest({model:MODEL,declarations:anthropicTools(),provider:'claude'});
 assert.notEqual(gemini,claude);
 assert.equal(promptDigest({model:'gemini-4-argon',declarations:vertexDeclarations()}),promptDigest({model:'gemini-4-argon',declarations:vertexDeclarations(),provider:'gemini'}),'existing Gemini digests unchanged');
});

test('history under another digest opens a new epoch with the seed instead of replaying it',async()=>{
 const rows=[{role:'user',content:JSON.stringify([{text:'old'}]),seq:0,prompt_sha256:'f'.repeat(64),input_tokens:10},{role:'model',content:JSON.stringify([{text:'old reply'}]),seq:1,prompt_sha256:'f'.repeat(64),input_tokens:10}];
 const {outcome,relay:r}=await turn([reply('Hello')],{history:{epoch:3,rows}});
 assert.equal(outcome.history.epoch,4);assert.equal(r.requests[0].messages.length,1);
});

test('stop reasons: refusal -> PROMPT_BLOCKED, max_tokens -> INTERNAL, pause_turn resent once',async()=>{
 const refused=await turn([stream([{type:'text',text:'No.'}],'refusal')]);
 assert.deepEqual([refused.outcome.ok,refused.outcome.code,refused.outcome.detail],[false,'PROMPT_BLOCKED','CLAUDE_STOP_REFUSAL']);
 const cut=await turn([stream([{type:'text',text:'Partial'}],'max_tokens')]);
 assert.deepEqual([cut.outcome.code,cut.outcome.detail],['INTERNAL','CLAUDE_STOP_MAX_TOKENS']);
 const paused=await turn([stream([{type:'text',text:'Wait'}],'pause_turn'),reply('Hello')]);
 assert.equal(paused.outcome.ok,true);assert.equal(paused.relay.requests.length,2);
 const twice=await turn([stream([{type:'text',text:'Wait'}],'pause_turn'),stream([{type:'text',text:'Wait'}],'pause_turn')]);
 assert.deepEqual([twice.outcome.code,twice.outcome.detail],['INTERNAL','CLAUDE_STOP_PAUSE_TURN']);
});

test('capacity answers retry twice then MODEL_UNAVAILABLE; relay 401/403/503 fail at once; 400 is INTERNAL',async()=>{
 const busy=await turn([status(429),status(529),status(529)]);
 assert.deepEqual([busy.outcome.code,busy.outcome.detail,busy.outcome.attempts,busy.relay.sleeps],['MODEL_UNAVAILABLE','CLAUDE_HTTP_529',3,2]);
 const recovered=await turn([status(529),reply('Hello')]);
 assert.equal(recovered.outcome.ok,true);assert.equal(recovered.outcome.attempts,2);
 for(const code of [401,403,503]){
  const denied=await turn([status(code)]);
  assert.deepEqual([denied.outcome.code,denied.outcome.detail,denied.outcome.attempts,denied.relay.sleeps],['MODEL_UNAVAILABLE',`CLAUDE_HTTP_${code}`,1,0],String(code));
 }
 const invalid=await turn([status(400)]);
 assert.deepEqual([invalid.outcome.code,invalid.outcome.attempts],['INTERNAL',1]);
});

test('a mid-stream overloaded error retries and the streamed text is retracted',async()=>{
 const broken=[...reply('Hello there').slice(0,5),{type:'error',error:{type:'overloaded_error',message:'Overloaded'}}];
 const {outcome,events}=await turn([broken,reply('Hello there')]);
 assert.equal(outcome.ok,true,JSON.stringify(outcome));
 assert.ok(events.some(([n])=>n==='retract'));
});

test('idle relay -> MODEL_TIMEOUT after one network retry; identity failure and missing transport -> MODEL_UNAVAILABLE',async()=>{
 const idle=await turn([hang,hang],{chat:{...CHAT,requestTimeoutSeconds:0.05}});
 assert.deepEqual([idle.outcome.code,idle.outcome.detail,idle.outcome.attempts],['MODEL_TIMEOUT','CLAUDE_TIMEOUT',2]);
 const identity=await turn([],{mintToken:async()=>{throw Error('metadata down');}});
 assert.deepEqual([identity.outcome.code,identity.outcome.detail],['MODEL_UNAVAILABLE','CLAUDE_RELAY_IDENTITY_UNAVAILABLE']);
 const vertex=createVertexTransport({projectId:'clever-oasis-508610-n7',location:'global',getToken:async()=>'t',fetch:async()=>{throw Error('not called');}});
 const missing=await turn([],{transport:vertex});
 assert.deepEqual([missing.outcome.code,missing.outcome.detail],['MODEL_UNAVAILABLE','CLAUDE_TRANSPORT_UNCONFIGURED']);
});

test('a stream the relay cut at its deadline maps to MODEL_TIMEOUT without a retry; a truncated stream too',async()=>{
 const cut=[...reply('Hello there').slice(0,5),{type:'error',error:{type:'timeout_error',message:'relay deadline'}}];
 const deadline=await turn([cut]);
 assert.deepEqual([deadline.outcome.code,deadline.outcome.detail,deadline.outcome.attempts,deadline.relay.sleeps],['MODEL_TIMEOUT','CLAUDE_RELAY_DEADLINE',1,0]);
 assert.ok(deadline.events.some(([n])=>n==='retract'));
 const truncated=await turn([reply('Hello there').slice(0,5)]);
 assert.deepEqual([truncated.outcome.code,truncated.outcome.detail],['MODEL_TIMEOUT','CLAUDE_STREAM_TRUNCATED']);
});

test('the merger refuses an unparsable tool input (resend) and an incomplete stream; empty text blocks are dropped',()=>{
 const merger=new ClaudeMerger();
 for(const e of [{type:'message_start',message:{usage:{}}},{type:'content_block_start',index:0,content_block:{type:'tool_use',id:'t',name:'sql_query',input:{}}},
  {type:'content_block_delta',index:0,delta:{type:'input_json_delta',partial_json:'{"sql":'}}])merger.push(e);
 assert.throws(()=>merger.push({type:'content_block_stop',index:0}),{name:'Resend'});
 assert.throws(()=>new ClaudeMerger().result(),/INTERNAL/);
 const m=new ClaudeMerger();
 for(const e of stream([{type:'thinking',signature:'s'},{type:'text',text:''}],'end_turn'))m.push(e);
 assert.deepEqual(m.result().message.content,[{type:'thinking',thinking:'',signature:'s'}]);
 assert.equal(claudeDialect.replay({role:'model',content:'[]'}).role,'assistant');
 assert.equal(claudeDialect.store({role:'assistant',content:[]}).role,'model');
});
