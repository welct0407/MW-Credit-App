// R122: POST /api/chat/transliterate (services/chat/transliterate.mjs through services/chat/handler.mjs) over a real HTTP
// server, the real relay transport and a fake relay. Synthetic names and identities only.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {createChatHandler} from '../../services/chat/handler.mjs';
import {createRelayTransport} from '../../services/chat/claude.mjs';
import {transliterationInput,transliterationBody,romanizedName,TRANSLITERATE_SYSTEM} from '../../services/chat/transliterate.mjs';
import {loadBusinessConfig} from '../../services/production/business-config.mjs';
import {chatEnv,MODELS} from './chat-fixture.mjs';

const RELAY='http://10.148.0.2:8791/v1/chat/messages',CLAUDE='claude-opus-5-5';
const claudeConfig=loadBusinessConfig(chatEnv('dev',{CHAT_MODELS_JSON:JSON.stringify({...MODELS,default:CLAUDE,models:[{id:CLAUDE,label:'Claude Opus 5.5',available:true}]}),CHAT_RELAY_URL:RELAY}));
const geminiConfig=loadBusinessConfig(chatEnv('dev'));
const ORIGIN='https://dev-lm.mw-credit.com';
/** A Messages stream: an (empty) thinking block, then the text in two deltas. */
const anthropic=text=>[{type:'message_start',message:{id:'msg_1',type:'message',role:'assistant',content:[],usage:{input_tokens:50,output_tokens:1}}},
 {type:'content_block_start',index:0,content_block:{type:'thinking',thinking:'',signature:''}},{type:'content_block_delta',index:0,delta:{type:'signature_delta',signature:'sig'}},{type:'content_block_stop',index:0},
 {type:'content_block_start',index:1,content_block:{type:'text',text:''}},{type:'content_block_delta',index:1,delta:{type:'text_delta',text:text.slice(0,4)}},
 {type:'content_block_delta',index:1,delta:{type:'text_delta',text:text.slice(4)}},{type:'content_block_stop',index:1},
 {type:'message_delta',delta:{stop_reason:'end_turn',stop_sequence:null},usage:{output_tokens:20}},{type:'message_stop'}];
const sse=events=>new Response(events.map(e=>`event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join(''),{status:200,headers:{'content-type':'text/event-stream'}});

async function server({cfg=claudeConfig,relay=()=>sse(anthropic('{"romanized":"Somchai"}'))}={}){
 const bodies=[],logs=[],readers=[];
 const verifyPrincipal=async authorization=>{
  const m=/^Bearer token-(\w+)$/.exec(authorization??'');if(!m)return {ok:false,status:401,code:'sign_in_required'};
  return {ok:true,subject:'sub-'+m[1],email:`${m[1]}@example.invalid`};};
 const store={async reader(p){readers.push(p.email);if(p.email!=='a@example.invalid')throw Error('access_denied');return {partnerId:'PA'};}};
 const transport={claude:createRelayTransport({url:RELAY,mintToken:async()=>'aaa.bbb.ccc',sleep:async()=>{},fetch:async(_url,init)=>{bodies.push(JSON.parse(init.body));return relay();}})};
 const handler=createChatHandler({config:cfg,verifyPrincipal,store,createTools:()=>({}),transport,log:r=>logs.push(r)});
 const srv=http.createServer(handler);await new Promise(r=>srv.listen(0,'127.0.0.1',r));
 const base=`http://127.0.0.1:${srv.address().port}`;
 const call=({method='POST',token='a',body,raw,headers={}}={})=>fetch(base+'/api/chat/transliterate',{method,
  headers:{Origin:ORIGIN,...(token?{Authorization:'Bearer token-'+token}:{}),...(body!==undefined||raw!==undefined?{'Content-Type':'application/json'}:{}),...headers},body:raw??(body===undefined?undefined:JSON.stringify(body))});
 return {call,bodies,logs,readers,close:()=>new Promise(r=>srv.close(r))};
}

test('input: 1..120 characters with Thai script, no control characters; spaces collapsed',()=>{
 assert.equal(transliterationInput('  สมชาย   ใจดี '),'สมชาย ใจดี');
 assert.equal(transliterationInput('ก'.repeat(120)),'ก'.repeat(120));
 for(const bad of ['','   ','Somchai','123','ก'.repeat(121),'สมชาย\nใจดี','สม\u0000ชาย',null,7,['สมชาย'],'\ud800สมชาย'])assert.equal(transliterationInput(bad),null,String(bad));
});

test('reply: only {"romanized"} with a plain Latin name (a json fence is tolerated)',()=>{
 assert.equal(romanizedName('{"romanized":"Somchai Jaidee"}'),'Somchai Jaidee');
 assert.equal(romanizedName('```json\n{"romanized":" Na  Ayutthaya "}\n```'),'Na Ayutthaya');
 assert.equal(romanizedName(`{"romanized":"O'Neill-Smith Jr."}`),`O'Neill-Smith Jr.`);
 for(const bad of ['Somchai','{"romanized":"สมชาย"}','{"romanized":""}','{"romanized":"1Somchai"}','{"romanized":"Somchai","note":"x"}','{"name":"Somchai"}','[]','null',
  `{"romanized":"${'A'.repeat(121)}"}`,'{"romanized":"Som<chai>"}',undefined])assert.equal(romanizedName(bad),null,String(bad));
});

test('the relay request is tool-less: model, system, one user text block, max_tokens, effort medium, stream',()=>{
 const body=transliterationBody(CLAUDE,'สมชาย');
 assert.deepEqual(Object.keys(body).sort(),['max_tokens','messages','model','output_config','stream','system']);
 assert.deepEqual(body.messages,[{role:'user',content:[{type:'text',text:'สมชาย'}]}]);
 assert.deepEqual(body.output_config,{effort:'medium'});assert.equal(body.stream,true);assert.equal(body.model,CLAUDE);
 assert.ok(body.max_tokens>=200&&body.max_tokens<=2048);
 assert.equal(body.system[0].text,TRANSLITERATE_SYSTEM);assert.match(TRANSLITERATE_SYSTEM,/RTGS/);assert.match(TRANSLITERATE_SYSTEM,/Somchai/);
});

test('a Thai name answers {english} through the relay on the default Claude model; the name is never logged',async t=>{
 const s=await server();t.after(s.close);
 const r=await s.call({body:{text:'สมชาย'}});
 assert.equal(r.status,200);assert.equal(r.headers.get('access-control-allow-origin'),ORIGIN);
 assert.deepEqual(await r.json(),{english:'Somchai'});
 assert.equal(s.bodies.length,1);const [body]=s.bodies;
 assert.equal(body.model,CLAUDE);assert.deepEqual(body.output_config,{effort:'medium'});
 for(const key of ['tools','tool_choice','temperature','thinking'])assert.equal(key in body,false,key);
 assert.deepEqual(body.messages,[{role:'user',content:[{type:'text',text:'สมชาย'}]}]);
 assert.deepEqual(s.readers,['a@example.invalid']);
 assert.equal(JSON.stringify(s.logs).includes('สมชาย'),false);assert.equal(JSON.stringify(s.logs).includes('Somchai'),false);
 assert.deepEqual(s.logs.filter(l=>l.event==='chat_transliterate').map(l=>[l.ok,l.code]),[[true,'ok']]);
});

test('non-Thai, overlong, extra keys or a malformed body answer 400 before the relay',async t=>{
 const s=await server();t.after(s.close);
 for(const body of [{text:'Somchai'},{text:'ก'.repeat(121)},{text:''},{text:'สมชาย',model:CLAUDE},{},[],{text:5}]){
  const r=await s.call({body});assert.equal(r.status,400,JSON.stringify(body));assert.deepEqual(await r.json(),{error:'invalid_request'});
 }
 assert.equal((await s.call({raw:'{"text":'})).status,400);
 assert.equal((await s.call({raw:'{"text":"สมชาย"}',headers:{'Content-Type':'text/plain'}})).status,400);
 assert.equal(s.bodies.length,0);assert.deepEqual(s.readers,[]);
});

test('authentication, membership, method and CORS',async t=>{
 const s=await server();t.after(s.close);
 let r=await s.call({token:null,body:{text:'สมชาย'}});
 assert.equal(r.status,401);assert.deepEqual(await r.json(),{error:'unauthorized',code:'sign_in_required'});
 r=await s.call({token:'c',body:{text:'สมชาย'}});
 assert.equal(r.status,403);assert.deepEqual(await r.json(),{error:'access_denied'});
 assert.equal((await s.call({method:'GET'})).status,404);
 r=await s.call({method:'POST',body:{text:'สมชาย'},headers:{Origin:'https://evil.example'}});assert.equal(r.status,403);
 r=await s.call({method:'OPTIONS',token:null,headers:{'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'authorization,content-type'}});
 assert.equal(r.status,204);assert.equal(r.headers.get('access-control-allow-origin'),ORIGIN);
 assert.equal(s.bodies.length,0);
});

test('a relay failure answers 503 model_unavailable; a malformed reply 502 transliteration_invalid',async t=>{
 const down=await server({relay:()=>new Response('',{status:503})});t.after(down.close);
 let r=await down.call({body:{text:'สมชาย'}});
 assert.equal(r.status,503);assert.deepEqual(await r.json(),{error:'model_unavailable'});
 assert.deepEqual(down.logs.filter(l=>l.event==='chat_transliterate').map(l=>[l.ok,l.code]),[[false,'model_unavailable']]);
 for(const text of ['Somchai','{"romanized":"สมชาย"}','{"romanized":"Somchai","extra":1}']){
  const bad=await server({relay:()=>sse(anthropic(text))});t.after(bad.close);
  r=await bad.call({body:{text:'สมชาย'}});
  assert.equal(r.status,502,text);assert.deepEqual(await r.json(),{error:'transliteration_invalid'});
 }
 // A reply cut at max_tokens is a relay-side failure, not a name.
 const cut=await server({relay:()=>sse(anthropic('{"roman').map(e=>e.type==='message_delta'?{...e,delta:{stop_reason:'max_tokens'}}:e))});t.after(cut.close);
 r=await cut.call({body:{text:'สมชาย'}});assert.equal(r.status,503);assert.deepEqual(await r.json(),{error:'model_unavailable'});
});

test('without a Claude default model the route answers 503 model_unavailable and calls nothing',async t=>{
 const s=await server({cfg:geminiConfig});t.after(s.close);
 const r=await s.call({body:{text:'สมชาย'}});
 assert.equal(r.status,503);assert.deepEqual(await r.json(),{error:'model_unavailable'});assert.equal(s.bodies.length,0);
});
