/** R090 read-only tool registry and per-turn tool bridge (design §4.1, §4.3; Archie resolutions 9 and 10): a port of
 * integration-agent conversation_tools.py for data_catalogue, read_records, sum_field, sql_query and loan_payoff.
 * R106 (D2, D5): WRITE_TOOLS (action_catalogue, propose_action) are appended only for a turn whose Partner is an AI
 * Reviewer holding 'command' while the chat_commands switch is on; propose_action never writes a record, it stores
 * one confirmation card (the Partner's Confirm tap executes it). Calls of one round run concurrently (at most
 * TOOL_WORKERS); observation ids, the journal and the answers keep call order. */
import {codePointCompare} from '../lib/offline-dataset-digest.mjs';
import {ToolError} from './errors.mjs';
import {Dec} from './grounding.mjs';
import {bangkokIso} from './prompt.mjs';
import {RESULT_LIMIT,ROW_CAP} from './sql-guard.mjs';

export const TOOL_WORKERS=4;
const HIDDEN=new Set(['_RowNumber']);
const RESULT_CAP=262144,ARGUMENTS_CAP=16384;
const STR={type:'string'},STRINGS={type:'array',items:STR};
const spec=(name,description,properties)=>Object.freeze({type:'function',name,description,
 inputSchema:{type:'object',properties,required:Object.keys(properties),additionalProperties:false}});

/** Read-only release: descriptions of conversation_tools.py with the write (api_action/reviewer) wording removed. */
export const TOOLS=Object.freeze([
 spec('data_catalogue','List native oltp/olap resources using empty app/table, or inspect reviewed fields, types and relationships. Pending capabilities are unavailable; never invent a formula.',
  {app:STR,table:STR}),
 spec('read_records','Fresh native read-only records. Page limit MUST be 1..100. Use exact keys, literal field text, or filter containing JSON typed AST: eq/ne/lt/lte/gt/gte/contains/in with op,field,value; isNull with op,field; and/or with op,args; not with op,arg. Numeric values are decimal strings. Empty filter means no predicate. No AppSheet expressions or SQL. All matches must fit 1000 rows; otherwise narrow search. Ref fields link exact keys.',
  {app:STR,table:STR,keys:STRINGS,match_field:STR,match_text:STR,filter:STR,columns:STRINGS,
   offset:{type:'integer',minimum:0},limit:{type:'integer',minimum:1,maximum:100}}),
 spec('sum_field','Exact decimal sum of current-turn observed rows only; result explicitly reports partial pages. Never extrapolate a partial sum.',
  {observation:STR,field:STR,group_by:STR}),
 spec('sql_query','Read-only SQL over the MW Credit business database (PostgreSQL 18, schema public, '
  +'Asia/Bangkok, read-only transaction). Exactly one SELECT or WITH statement; no semicolon, comments, '
  +'dollar quoting, E strings, row locks, writes or side-effect functions; at most 8000 characters; 20 s limit. Quote mixed-case '
  +`identifiers exactly ("Loans"."Row ID"). Small results only: at most ${ROW_CAP} rows and ${RESULT_LIMIT>>10} KB, `
  +'distinct column names; a larger result is refused, so aggregate in SQL (sum, count, group by) and LIMIT the '
  +'rows you will list instead of paging. Use the schema digest in the system prompt.',{sql:STR}),
 spec('loan_payoff',"Cross-check of today's payoff (Bangkok) for one open Daily Interest loan from the system's own "
  +'loan close calculation, by exact loan Row ID; report the charge-balance payoff of the business rules. '
  +'Returns eligible=false with the reason for any other loan.',{loan_id:STR}),
]);
/** R106: the write proposal tools (one generic proposal over the static command catalogue). */
export const WRITE_TOOLS=Object.freeze([
 spec('action_catalogue','The app write commands the Partner can confirm. Empty operation lists them; an operation name returns its fields (type, allowed values, required, host-filled).',{operation:STR}),
 spec('propose_action','Propose every change the Partner asked for in this message, in ONE call (1 to 20 changes); they appear on one card and nothing changes until the Partner taps Confirm. '
  +'Only on an explicit instruction in the current message. Each change: operation, target_id (the record Row ID; empty for a create; the borrower for payment.record) and inputs, a JSON object '
  +'with only the fields the Partner gave (decimal strings for amounts, YYYY-MM-DD dates); never give ids, versions, splits or other host-filled fields. One call per turn; never split a request across turns. '
  +'A payment or loan close must be the only change for its borrower in a call.',
  {changes:{type:'array',items:{type:'object',properties:{operation:STR,target_id:STR,inputs:STR},required:['operation','target_id','inputs'],additionalProperties:false}}}),
]);
/** D12: the model's changes[] -> [{operation,target,values}], 1..20, each inputs a JSON object of at most 16 KB. */
export function parseChanges(changes){
 if(!Array.isArray(changes)||changes.length<1)throw new ToolError('NO_CHANGES');
 if(changes.length>20)throw new ToolError('TOO_MANY_CHANGES');
 return changes.map(change=>{
  if(!plainObject(change)||Object.keys(change).sort().join(',')!=='inputs,operation,target_id'||typeof change.operation!=='string'||typeof change.target_id!=='string'||typeof change.inputs!=='string'
   ||Buffer.byteLength(change.inputs)>16384)throw new ToolError('INVALID_CHANGES');
  let values;try{values=change.inputs===''?{}:JSON.parse(change.inputs);}catch{throw new ToolError('INVALID_VALUES');}
  if(!plainObject(values))throw new ToolError('INVALID_VALUES');
  return {operation:change.operation,target:change.target_id,values};
 });
}
/** CWR-05 (owner decision via the coordinator): with chat writes switched on, a Partner who may not propose (not an AI
 * Reviewer, or without 'command') still has propose_action, which runs nothing (no read, no record) and returns this
 * fixed observation; the prompt has the model relay its text verbatim. action_catalogue stays absent for them. */
export const REVIEWER_REQUIRED=Object.freeze({code:'REVIEWER_REQUIRED',changed:false,
 message:Object.freeze({en:'Only an AI Reviewer Partner can make changes from chat. Nothing was changed; use the app screens.',
  th:'เฉพาะหุ้นส่วนที่เป็นผู้ตรวจสอบ AI เท่านั้นที่เปลี่ยนแปลงข้อมูลจากแชทได้ ยังไม่มีการเปลี่ยนแปลงใด ๆ กรุณาใช้หน้าจอในแอป'})});
/** A host JSON schema in Vertex's OpenAPI subset: uppercase types, no additionalProperties. */
export function vertexSchema(value){
 const result={type:value.type.toUpperCase()};
 if(value.properties)result.properties=Object.fromEntries(Object.entries(value.properties).map(([k,v])=>[k,vertexSchema(v)]));
 if(value.items)result.items=vertexSchema(value.items);
 for(const key of ['description','enum','minimum','maximum','required'])if(key in value)result[key]=Array.isArray(value[key])?[...value[key]]:value[key];
 return result;
}
export const declarations=(tools=TOOLS)=>tools.map(t=>({name:t.name,description:t.description,parameters:vertexSchema(t.inputSchema)}));
/** R102: the same tools as Anthropic Messages API tool definitions (the host JSON schema, lowercase types). */
export const anthropicTools=(tools=TOOLS)=>tools.map(t=>({name:t.name,description:t.description,input_schema:structuredClone(t.inputSchema)}));

/** Python str() of an observed value. */
export function pyStr(value){
 if(value===null||value===undefined)return 'None';
 if(value===true)return 'True';if(value===false)return 'False';
 if(typeof value==='string')return value;
 if(typeof value==='number')return Number.isFinite(value)?String(value):value>0?'inf':value<0?'-inf':'nan';
 return JSON.stringify(value);
}
const plainObject=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const isInt=v=>typeof v==='number'&&Number.isInteger(v);
const canonical=value=>Array.isArray(value)?'['+value.map(canonical).join(',')+']':plainObject(value)?'{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}':JSON.stringify(value);
/** Rejects NaN/Infinity constants as json.loads(parse_constant=raise) does. */
function filterExpression(value){
 if(typeof value!=='string'||Buffer.byteLength(value)>16384||value.includes('\0'))throw new ToolError('INVALID_FIND_FILTER');
 let node;try{node=JSON.parse(value);}catch{throw new ToolError('NATIVE_TYPED_FILTER_REQUIRED_NO_LEGACY_REPLAY');}
 if(node!==null&&!plainObject(node))throw new ToolError('NATIVE_TYPED_FILTER_REQUIRED_NO_LEGACY_REPLAY');
 return node;
}
const capped=(text,cap)=>Buffer.byteLength(text)<=cap?text:JSON.stringify({truncated:true,bytes:Buffer.byteLength(text)});
const nativeUnavailable=error=>['unsupported_native_capability','invalid_agent_query','access_denied'].includes(error?.message)||error?.code==='42501';

/** Summary label shown under a reply (Archie resolution 8). */
export function toolSummary(name,args,value){
 if(name==='read_records')return typeof args?.table==='string'?args.table.slice(0,80):'records';
 if(name==='data_catalogue')return 'catalogue';
 if(name==='sql_query')return `${value?.row_count??0} rows`;
 if(name==='loan_payoff')return 'loan payoff';
 return 'sum';
}

/** One turn's tool bridge. readProvider: createConversationReadProvider (in process) bound to this turn's actor.
 * writes (R106): {catalogue(operation), propose({operation,target,values})} for a turn allowed to propose (both write
 * tools declared), or {refuse:true} for one that is not (propose_action only, answering REVIEWER_REQUIRED); null when
 * chat writes are off (no write tool).
 * @param {{readProvider:{catalogue:Function,query:Function},sqlTool:{query:Function,payoff:Function},actor:{issuer:string,subject:string,partnerId:string},signal?:AbortSignal,now?:()=>number,tools?:readonly any[],writes?:{catalogue?:Function,propose?:Function,refuse?:boolean}|null}} options */
export function createChatTools({readProvider,sqlTool,actor,signal,now=Date.now,tools:readTools=TOOLS,writes=null}){
 const tools=writes?.refuse?[...readTools,WRITE_TOOLS[1]]:writes?[...readTools,...WRITE_TOOLS]:readTools;
 let proposed=false;
 const observations={},journal=[],journalIds=new Set(),cache=new Map();
 const context={workload:{issuer:actor.issuer,subject:actor.subject},signal};
 let schema=null;
 function observe(value){
  const id='observation-'+(Object.keys(observations).length+1);
  observations[id]=value;
  return {observation:id,as_of:bangkokIso(now()),...value};
 }
 /** The reviewed native catalogue of both scopes, fetched once per turn (agent load_schema). */
 function loadSchema(){
  schema??=(async()=>{
   const apps={};
   for(const scope of ['oltp','olap']){
    let result;
    try{result=await readProvider.catalogue(context,{version:1,actorPartnerId:actor.partnerId,scope,resource:null});}
    catch(error){if(nativeUnavailable(error))throw new ToolError('REVIEWED_NATIVE_SCHEMA_REQUIRED');throw error;}
    const tables={};
    for(const resource of result.resources??[]){
     if(resource.scope!==scope||Object.hasOwn(tables,resource.resource))throw new ToolError('INVALID_NATIVE_SCHEMA');
     tables[resource.resource]={key:resource.key,permission:resource.legacyPermission,
      columns:Object.fromEntries(resource.fields.map(f=>[f.name,{Type:f.sourceType,nativeStatus:f.nativeStatus}]))};
    }
    if(!Object.keys(tables).length)throw new ToolError('INVALID_NATIVE_SCHEMA');
    apps[scope]={version:result.manifestSha256,tables};
   }
   return {format:2,apps};
  })();
  schema.catch(()=>{schema=null;});
  return schema;
 }
 async function tableSchema(app,table){
  const value=await loadSchema();
  if(typeof app!=='string'||typeof table!=='string'||!Object.hasOwn(value.apps,app)||!Object.hasOwn(value.apps[app].tables,table))throw new ToolError('UNKNOWN_APP_OR_TABLE');
  return value.apps[app].tables[table];
 }
 const fieldsOf=definition=>Object.keys(definition.columns).filter(k=>!HIDDEN.has(k)).sort();
 /** The pure part of a read (no observe, no journal). */
 async function fetch(name,a){
  if(name==='data_catalogue'){
   if(!a.table){
    const value=await loadSchema();
    return {apps:Object.fromEntries(Object.entries(value.apps).filter(([app])=>!a.app||app===a.app).map(([app,v])=>[app,{version:v.version,tables:Object.keys(v.tables)}]))};
   }
   const table=await tableSchema(a.app,a.table);
   return {app:a.app,table:a.table,key:table.key,permission:table.permission,condition:'',
    columns:Object.fromEntries(Object.entries(table.columns).filter(([k])=>!HIDDEN.has(k))),
    guidance:'Read-only native catalogue. Use Ref keys to link records; aggregate with sum_field or sql_query.'};
  }
  if(name==='read_records'){
   const {app,table}=a,definition=await tableSchema(app,table),key=definition.key,fields=fieldsOf(definition);
   const {keys,columns,offset,limit}=a;
   if(!isInt(limit)||limit<1||limit>100)throw new ToolError('PAGE_LIMIT_MUST_BE_INTEGER_1_TO_100');
   if(!Array.isArray(keys)||keys.length>25||keys.some(k=>typeof k!=='string'||!k)||new Set(keys).size!==keys.length
    ||!Array.isArray(columns)||!columns.length||columns.some(k=>typeof k!=='string'||!fields.includes(k))
    ||!isInt(offset)||offset<0||typeof a.match_field!=='string'||typeof a.match_text!=='string')throw new ToolError('INVALID_RECORD_QUERY');
   if(keys.length&&(a.match_field||a.match_text))throw new ToolError('USE_KEYS_OR_SEARCH');
   if(a.filter&&(keys.length||a.match_field||a.match_text))throw new ToolError('USE_FILTER_OR_KEYS_OR_SEARCH');
   let predicate=null;
   if(a.filter)predicate=filterExpression(a.filter);
   else if(keys.length)predicate={op:'in',field:key,value:keys};
   else if(a.match_field){
    const field=a.match_field;
    if(!fields.includes(field)||/[[\]"]/.test(field))throw new ToolError('UNKNOWN_SEARCH_FIELD');
    predicate={op:'contains',field,value:a.match_text};
   }else if(a.match_text)throw new ToolError('SEARCH_FIELD_REQUIRED');
   const projected=[...new Set([key,...columns])];
   const cacheKey=JSON.stringify([app,table,canonical(predicate),projected]);
   if(!cache.has(cacheKey)){
    let rows;
    try{rows=(await readProvider.query(context,{version:1,actorPartnerId:actor.partnerId,scope:app,resource:table,columns:projected,predicate,limit:1001})).rows;}
    catch(error){if(nativeUnavailable(error))throw new ToolError('NATIVE_QUERY_UNAVAILABLE');throw error;}
    if(!Array.isArray(rows)||rows.length>1001)throw new ToolError('NATIVE_QUERY_UNAVAILABLE');
    const ids=rows.map(r=>r[key]);
    if(rows.length>=1001)throw new ToolError('READ_BOUND_REACHED_NARROW_SEARCH');
    if(ids.some(k=>typeof k!=='string'||!k)||new Set(ids).size!==ids.length)throw new ToolError('RECORD_IDENTITY_MISMATCH');
    if(keys.length&&(ids.length!==keys.length||!keys.every(k=>ids.includes(k))))throw new ToolError('REQUESTED_RECORD_MISSING');
    cache.set(cacheKey,rows.toSorted((x,y)=>codePointCompare(x[key],y[key])));
   }
   const rows=cache.get(cacheKey);
   if(rows.some(row=>columns.some(k=>!Object.hasOwn(row,k))))throw new ToolError('APP_SCHEMA_CHANGED_OR_FIELD_UNAVAILABLE');
   return {app,table,total_matched:rows.length,offset,
    rows:rows.slice(offset,offset+limit).map(r=>Object.fromEntries([...new Set([key,...columns,...(Object.hasOwn(r,'_nativeVersion')?['_nativeVersion']:[])])].map(k=>[k,r[k]??null]))),
    complete:offset===0&&rows.length<=limit};
  }
  if(name==='sum_field'){
   const source=observations[a.observation];
   if(!plainObject(source)||!('rows' in source))throw new ToolError('CURRENT_OBSERVATION_REQUIRED');
   const totals=new Map();
   for(const row of source.rows){
    if(!plainObject(row)||!Object.hasOwn(row,a.field)||(a.group_by&&!Object.hasOwn(row,a.group_by)))throw new ToolError('UNOBSERVED_FIELD');
    const value=Dec.parse(pyStr(row[a.field]).replaceAll(',','').replaceAll('฿','').trim());
    if(value===null)throw new ToolError('NON_NUMERIC_VALUE');
    const group=a.group_by?pyStr(row[a.group_by]):'total';
    totals.set(group,(totals.get(group)??new Dec(0n,0)).add(value));
   }
   if(!('complete' in source))throw Error('observation without completeness');
   return {totals:Object.fromEntries([...totals].map(([k,v])=>[k,String(v)])),source:a.observation,rows_count:source.rows.length,complete:source.complete};
  }
  if(name==='sql_query')return sqlTool.query(a.sql);
  if(name==='loan_payoff')return sqlTool.payoff(a.loan_id);
  if(writes?.refuse&&name==='propose_action')return REVIEWER_REQUIRED;
  if(writes&&!writes.refuse&&name==='action_catalogue')return writes.catalogue(a.operation);
  if(writes&&!writes.refuse&&name==='propose_action'){
   // One group per turn (D9, D12): a second call fails before any read, even within the same round.
   if(proposed)throw new ToolError('ONE_PROPOSAL_PER_TURN');
   proposed=true;
   let changes;
   try{changes=parseChanges(a.changes);}catch(error){proposed=false;throw error;}
   try{return await writes.propose({changes});}
   catch(error){if(!(error instanceof ToolError&&error.message==='ONE_PROPOSAL_PER_TURN'))proposed=false;throw error;}
  }
  throw new ToolError('TOOL_NOT_PERMITTED');
 }
 function journalId(round,index,call){
  let id=call.id||`gemini-${round}-${index}`;
  if(journalIds.has(id))id=`${id}~${round}-${index}`;
  journalIds.add(id);return id;
 }
 const errorText=error=>error instanceof ToolError?error.message:'TOOL_FAILED_INSPECT_BEFORE_RETRY';
 return {
  observations,journal,declarations:()=>declarations(tools),specs:()=>anthropicTools(tools),
  /** One model round of calls [{name,args,id}] -> [{call,value,error,journalId}] in call order.
   * @param {{name:string,args:any,id:string|null}[]} calls
   * @param {{deadline:number,round:number,emit?:(name:string,data:any)=>void}} options */
  async runRound(calls,{deadline,round,emit=()=>{}}){
   const ids=calls.map((call,index)=>journalId(round,index,call));
   const outcomes=calls.map(()=>null);
   const started=calls.map(()=>0),ended=calls.map(()=>0);
   const ready=calls.map((call,index)=>{
    emit('tool',{callId:ids[index],name:call.name,state:'running'});
    const definition=tools.find(t=>t.name===call.name);
    const keys=Object.keys(definition?.inputSchema.properties??{}).sort().join(',');
    if(!definition||!plainObject(call.args)||Object.keys(call.args).sort().join(',')!==keys){outcomes[index]={error:new ToolError('UNSUPPORTED_TOOL_OR_ARGUMENTS')};return false;}
    return true;
   });
   let next=0;
   const worker=async()=>{
    while(next<calls.length){
     const index=next++;if(!ready[index])continue;
     started[index]=now();
     try{outcomes[index]={value:await fetch(calls[index].name,calls[index].args)};}catch(error){outcomes[index]={error};}
     ended[index]=now();
    }
   };
   const pool=Promise.all(Array.from({length:Math.min(TOOL_WORKERS,calls.length)},worker));
   let timer;
   await Promise.race([pool,new Promise(resolve=>{timer=setTimeout(resolve,Math.max(0,deadline-now()));})]);
   clearTimeout(timer);
   return calls.map((call,index)=>{
    let outcome=outcomes[index];
    if(!outcome)outcome={error:new ToolError('TOOL_TIMEOUT')};
    const ms=ended[index]?Math.max(0,ended[index]-started[index]):Math.max(0,now()-(started[index]||now()));
    let value,error=false;
    if(outcome.error){value=errorText(outcome.error);error=true;}
    else value=call.name==='data_catalogue'||call.name==='action_catalogue'?outcome.value:observe(outcome.value);
    journal.push({callId:ids[index],round,name:typeof call.name==='string'?call.name.slice(0,200):'unknown',
     arguments:capped(JSON.stringify(call.args??null),ARGUMENTS_CAP),result:error?null:capped(JSON.stringify(value),RESULT_CAP),error:error?value:null,ms});
    emit('tool',{callId:ids[index],name:call.name,state:error?'error':'ok',ms,...(error?{}:{summary:toolSummary(call.name,call.args,outcome.value)})});
    return {call,value,error,journalId:ids[index]};
   });
  },
 };
}
