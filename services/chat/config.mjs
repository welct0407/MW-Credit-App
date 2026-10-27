/** R090 chat service configuration: CHAT_MODELS_JSON (a plain Terraform variable, no credential), validated on
 * start (design §3.2). The PWA never hard-codes a model; GET /api/chat/models answers from this allowlist. */
import {chatRelayUrl} from './claude.mjs';
/** R102: gemini-* (Vertex) or claude-<family>-<major>[-<minor>] (VM relay); date-suffixed ids are refused. */
export const MODEL_ID=/^(?:gemini-[0-9]+(?:\.[0-9]+)?-[a-z0-9-]+|claude-[a-z]+-[0-9]+(?:-[0-9]+)?)$/;
/** The provider that serves a model id. */
export const providerFor=id=>typeof id==='string'&&id.startsWith('claude-')?'claude':'gemini';
export const THINKING_LEVELS=Object.freeze(['LOW','MEDIUM','HIGH','MAX']);
/** Integer bounds; the first four are gemini_conversation.BOUNDS of the integration agent. */
export const CHAT_BOUNDS=Object.freeze({maxRounds:[4,40],requestTimeoutSeconds:[30,240],historyTokenLimit:[50000,400000],seedChars:[0,200000],
 turnTimeoutSeconds:[60,240],maxOutputTokens:[1024,65536]});
const KEYS=['version','location','default','thinkingLevel','maxRounds','requestTimeoutSeconds','turnTimeoutSeconds','historyTokenLimit','seedChars','maxOutputTokens','models'];
const plain=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const text=(v,max)=>typeof v==='string'&&v.length>=1&&v.length<=max&&v===v.trim()&&v.isWellFormed()&&!/[\u0000-\u001f\u007f]/.test(v);
/** Parses and freezes CHAT_MODELS_JSON; throws one generic error for any violation (no value echoed). */
export function parseChatModels(raw){
 const fail=()=>{throw Error('Invalid CHAT_MODELS_JSON');};
 if(typeof raw!=='string'||Buffer.byteLength(raw)>16384)fail();
 let value;try{value=JSON.parse(raw);}catch{fail();}
 if(!plain(value)||Object.keys(value).sort().join(',')!==[...KEYS].sort().join(',')||value.version!==1)fail();
 // Location as in the agent's LOCATION pattern: global or a region.
 if(typeof value.location!=='string'||!/^(?:global|[a-z]+-[a-z]+[0-9]+)$/.test(value.location))fail();
 if(!THINKING_LEVELS.includes(value.thinkingLevel))fail();
 for(const [key,[low,high]] of Object.entries(CHAT_BOUNDS))if(!Number.isSafeInteger(value[key])||value[key]<low||value[key]>high)fail();
 if(value.turnTimeoutSeconds<value.requestTimeoutSeconds)fail();
 if(!Array.isArray(value.models)||value.models.length<1||value.models.length>8)fail();
 const ids=new Set();
 const models=value.models.map(model=>{
  if(!plain(model))fail();
  const keys=Object.keys(model).sort().join(',');
  if(keys!=='available,id,label'&&keys!=='available,id,label,reason')fail();
  if(typeof model.id!=='string'||!MODEL_ID.test(model.id)||model.id.length>64||ids.has(model.id)||!text(model.label,80)||typeof model.available!=='boolean')fail();
  if(model.reason!==undefined&&(!text(model.reason,200)||model.available))fail();
  ids.add(model.id);
  return Object.freeze({id:model.id,label:model.label,available:model.available,...(model.reason!==undefined?{reason:model.reason}:{})});
 });
 if(!models.some(m=>m.id===value.default&&m.available))fail();
 return Object.freeze({version:1,location:value.location,default:value.default,thinkingLevel:value.thinkingLevel,
  maxRounds:value.maxRounds,requestTimeoutSeconds:value.requestTimeoutSeconds,turnTimeoutSeconds:value.turnTimeoutSeconds,
  historyTokenLimit:value.historyTokenLimit,seedChars:value.seedChars,maxOutputTokens:value.maxOutputTokens,
  // Grounding mode is fixed to enforce (owner R088 decision): no switch.
  grounding:'enforce',models:Object.freeze(models)});
}
/** The listed and available model, or null. */
export const availableModel=(chat,id)=>chat.models.find(m=>m.id===id&&m.available)??null;
/** R102: CHAT_RELAY_URL (the VM chat relay endpoint, also the ID-token audience). Absent: no relay. An available
 * claude-* model without a valid relay URL fails start; a present but invalid URL fails too (one generic error). */
export function parseChatRelay(chat,raw){
 const url=raw===undefined?null:chatRelayUrl(raw);
 if(raw!==undefined&&!url)throw Error('Invalid chat configuration');
 if(!url&&chat.models.some(m=>m.available&&providerFor(m.id)==='claude'))throw Error('Invalid chat configuration');
 return url?Object.freeze({url,audience:url}):null;
}
