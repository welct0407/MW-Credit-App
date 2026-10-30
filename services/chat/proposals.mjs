/** R106 chat write proposals (design D2-D4, D7, D8): the static command catalogue, the host fill of every command
 * field the model must not choose, canonical validation with the command contracts, the server-built card and the
 * exactly-once execution through the command service.
 * - The model names an operation, a target and the field values it was told; the host fills requestId (the proposal
 *   id), targetId for creates, expectedVersion and predecessorRequestId from a fresh read of the target through the
 *   command service with the Partner's token (the read the screen makes before its own submit), receiptId null, and
 *   every value the screen takes from the system (payoff amount, plan hash, business date, next charge amounts,
 *   settle-all amount, payment split). The result must pass canonicalOperation / canonicalCommand.
 * - The card holds only server fields: label, target, values, changes [{field,before,after}] (before from the fresh
 *   read, after from the validated command), bounded consequences and the destructive flag.
 * - Confirm: the claim (pending -> executing) runs first; the command's status is read before any POST; busy is
 *   retried with the same request id; a lost answer after the POST is unknown and is reconciled by the status read. */
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {canonicalOperation} from '../contracts/operation-command.mjs';
import {ToolError} from './errors.mjs';
import {CommandUnavailable} from './command-client.mjs';
import {planPayment} from './payment-plan.mjs';

/** A proposal stays confirmable this long (V118 sets expires_at; the PWA shows the countdown). */
export const PROPOSAL_TTL_MS=15*60*1000;
/** An executing claim older than this belongs to a dead instance: its POST can no longer be in flight (the command
 * service's Cloud Run request timeout is 55 s; the chat client aborts after 15 s). V118 uses the same 3 minutes. */
export const STALE_CLAIM_MS=3*60*1000;
const plain=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const freeze=v=>{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;};
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const HASH=/^[a-f0-9]{64}$/;
const ID=v=>typeof v==='string'&&v.length>=1&&Buffer.byteLength(v)<=256&&!/[\u0000-\u001f\u007f]/u.test(v);
const DAY=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&v>='0001-01-01'&&Number.isFinite(Date.parse(v+'T00:00:00Z'))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;
const TEXT=v=>typeof v==='string'&&v.isWellFormed()&&!v.includes('\0')&&Buffer.byteLength(v)<=65536;
const REF_TYPES=new Set(['borrower','account','loan','charge','holder','partner','expense','allocation']);

let cached=null;
/** The checked-in catalogue (services/chat/assets/command-catalogue.json), read once and frozen. */
export function loadCatalogue(){
 if(cached)return cached;
 const value=JSON.parse(readFileSync(new URL('./assets/command-catalogue.json',import.meta.url),'utf8'));
 if(value?.version!==1||!Array.isArray(value.entries))throw Error('Invalid command catalogue');
 const entries=new Map();
 for(const entry of value.entries){
  if(entries.has(entry.operation)||!['operation','payment'].includes(entry.kind)||!Array.isArray(entry.fields))throw Error('Invalid command catalogue');
  entries.set(entry.operation,entry);
 }
 cached=freeze({version:1,excluded:value.excluded,hostOwned:value.hostOwned,entries});
 return cached;
}

/** What the model sees from action_catalogue: the operation list, or one operation's fields. */
export function catalogueView(catalogue,operation){
 if(!operation)return {operations:[...catalogue.entries.values()].map(e=>({operation:e.operation,label:e.label.en,destructive:e.destructive,description:e.description})),
  excluded:Object.keys(catalogue.excluded),
  guidance:'Call propose_action with operation, target_id (the record Row ID; empty for a create) and values as a JSON object of the fields the Partner gave. Fields marked host are filled by the system and must not be given.'};
 const entry=catalogue.entries.get(operation);
 if(!entry)throw new ToolError(Object.hasOwn(catalogue.excluded,operation)?'UNSUPPORTED_OPERATION':'UNKNOWN_OPERATION');
 return {operation,label:entry.label.en,description:entry.description,destructive:entry.destructive,target:entry.target,
  fields:entry.fields.filter(f=>!f.hidden).map(f=>({name:f.name,type:f.type,...(f.values?{values:f.values}:{}),...(f.required&&!f.host?{required:true}:{}),...(f.host?{host:true}:{}),...(f.default!==undefined?{default:f.default}:{}),label:f.label.en}))};
}

/** Canonical form of a money-like decimal text (trailing fraction zeros dropped), or null when it is not one. */
function decimalText(text,{signed=false,places=2,whole=false}={}){
 if(typeof text!=='string')return null;
 const m=new RegExp(`^(${signed?'-?':''})(0|[1-9][0-9]*)(?:\\.([0-9]+))?$`).exec(text);if(!m)return null;
 const fraction=(m[3]??'').replace(/0+$/,'');
 if(whole?fraction!=='':places!==null&&fraction.length>places)return null;
 const value=m[1]+m[2]+(fraction?'.'+fraction:'');
 return value==='-0'?'0':value;
}
/** A value of the field's type from the model (fromItem: from the command service's read) -> canonical, or throws. */
export function fieldValue(field,value,{fromItem=false}={}){
 const bad=()=>{throw new ToolError(`${fromItem?'FIELD_UNREADABLE':'INVALID_FIELD'}:${field.name}`);};
 if(value===undefined||value===null)return null;
 const asText=typeof value==='number'&&Number.isFinite(value)?String(value):value;
 switch(field.type){
  case 'text':if(!TEXT(value))bad();return value===''&&!fromItem?null:value;
  case 'text-required':if(!TEXT(value)||!value.trim())bad();return value;
  case 'money':return decimalText(asText)??bad();
  case 'signed-money':return decimalText(asText,{signed:true})??bad();
  case 'whole':return decimalText(asText,{whole:true})??bad();
  case 'signed-whole':{const v=decimalText(asText,{signed:true,whole:true});if(v===null||v==='0')bad();return v;}
  case 'decimal':return decimalText(asText,{places:null})??bad();
  case 'date':if(!DAY(value))bad();return value;
  case 'boolean':case 'boolean-null':if(typeof value!=='boolean')bad();return value;
  case 'integer':{const n=typeof value==='string'&&/^-?[0-9]{1,10}$/.test(value)?Number(value):value;if(!Number.isSafeInteger(n))bad();return n;}
  case 'enum':if(!field.values.includes(value))bad();return value;
  case 'hash':if(typeof value!=='string'||!HASH.test(value))bad();return value;
  default:if(REF_TYPES.has(field.type)){if(!ID(value))bad();return value;}
 }
 return bad();
}
const dig=(value,path)=>path.split('.').reduce((v,k)=>plain(v)&&Object.hasOwn(v,k)?v[k]:undefined,value);
const template=(path,vars)=>path.replace(/\{([A-Za-z]+)\}/g,(_,key)=>{if(!ID(vars[key]))throw new ToolError(`MISSING_FIELD:${key}`);return encodeURIComponent(vars[key]);});
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
/** ฿ with grouping (two decimals only when the amount has a fraction), the same in both languages. */
export function bahtText(value){
 if(typeof value!=='string'||!/^-?\d+(\.\d+)?$/.test(value))return null;
 const [whole,fraction]=value.replace('-','').split('.'),grouped=whole.replace(/\B(?=(\d{3})+(?!\d))/g,',');
 return (value.startsWith('-')?'-':'')+'฿'+grouped+(fraction&&/[1-9]/.test(fraction)?'.'+fraction.padEnd(2,'0').slice(0,2):'');
}
/** CWR-02: the Confirm button's short label from the catalogue, the amount filled from the command; null when it
 * cannot be filled or is too long (the PWA then shows plain Confirm). */
export function confirmLabel(entry,values){
 const template=entry.confirm;if(!template?.en||!template?.th)return null;
 let amount=null;if(template.amount){amount=bahtText(values?.[template.amount]);if(!amount)return null;}
 const fill=text=>amount===null?text:text.replace('{amount}',amount);
 const label={en:fill(template.en),th:fill(template.th)};
 return [...label.en].length<=32&&[...label.th].length<=32&&!label.en.includes('{')?label:null;
}

/** Maps a non-200 command-service read to the tool error the model sees. */
export function readError(status,data){
 if(status===404)return new ToolError('TARGET_NOT_FOUND');
 if(status===401||status===403)return new ToolError('ACCESS_DENIED');
 const code=typeof data?.code==='string'&&/^[a-z][a-z0-9_]{0,79}$/.test(data.code)?data.code:null;
 if(status>=400&&status<500)return new ToolError(code?code.toUpperCase():'INVALID_TARGET');
 return new ToolError('COMMAND_UNAVAILABLE');
}

/**
 * One turn's proposal planner. client: createCommandClient bound to the Partner's token.
 * @param {{client:{get:Function,post:Function},actor:{partnerId:string},catalogue?:any,newId?:()=>string}} options
 */
export function createProposalPlanner({client,actor,catalogue=loadCatalogue(),newId=randomUUID}){
 const reads=new Map();
 async function get(path){
  if(!reads.has(path))reads.set(path,(async()=>{
   let answer;try{answer=await client.get(path);}catch(error){if(error instanceof CommandUnavailable)throw new ToolError('COMMAND_UNAVAILABLE');throw error;}
   if(answer.status!==200)throw readError(answer.status,answer.data);
   return answer.data;
  })());
  const value=reads.get(path);value.catch(()=>reads.delete(path));
  return value;
 }
 /** Display labels of reference values, from the screens' own reads; an unreadable label is left out. */
 async function display(field,value){
  if(typeof value!=='string')return undefined;
  try{
   if(field.type==='account')return (await get('/api/borrower-options')).accounts?.find(a=>a.id===value)?.label??undefined;
   if(field.type==='borrower'){const item=(await get('/api/borrower-records/'+encodeURIComponent(value))).item;return [item?.name,item?.description].filter(Boolean).join(' - ')||undefined;}
   if(field.type==='holder')return (await get('/api/management/cash-holders/'+encodeURIComponent(value))).item?.label??undefined;
   if(field.type==='partner')return (await get('/api/management/partners/'+encodeURIComponent(value))).item?.label??undefined;
  }catch{/* the id stays the only display */}
  return undefined;
 }
 async function cardFields(fields,inputs,before){
  const values=[],changes=[];
  for(const field of fields){
   if(field.hidden)continue;
   const after=inputs[field.name]??null,old=before?before[field.name]??null:null;
   const [afterLabel,beforeLabel]=REF_TYPES.has(field.type)?await Promise.all([display(field,after),before?display(field,old):undefined]):[];
   if(after!==null)values.push({field:field.name,label:field.label,type:field.type,value:after,...(afterLabel?{display:afterLabel}:{})});
   if(!same(after,old))changes.push({field:field.name,label:field.label,type:field.type,before:old,after,...(beforeLabel?{beforeDisplay:beforeLabel}:{}),...(afterLabel?{afterDisplay:afterLabel}:{})});
  }
  return {values,changes};
 }
 async function title(entry,response,vars){
  const source=entry.titleRead?await get(template(entry.titleRead,vars)):response;
  const parts=(entry.title??[]).map(path=>dig(source,path)).filter(v=>typeof v==='string'&&v.trim());
  return parts.length?parts.join(' - ').slice(0,200):null;
 }
 const consequence=(code,inputs)=>code==='loan_close_payoff'?{code,amount:inputs.expectedAmount}:{code};

 async function proposePayment(entry,target,values){
  const requestId=newId();
  const {command,plan}=await planPayment({client:{get:async path=>{try{return await client.get(path);}catch(error){if(error instanceof CommandUnavailable)throw new ToolError('COMMAND_UNAVAILABLE');throw error;}},
   post:async(path,body)=>{try{return await client.post(path,body);}catch(error){if(error instanceof CommandUnavailable)throw new ToolError('COMMAND_UNAVAILABLE');throw error;}}},borrowerId:target,values,requestId});
  const field=name=>entry.fields.find(f=>f.name===name);
  const values_=[['amountReceived',command.amountReceived],['paymentDate',command.paymentDate],['paymentMethod',command.paymentMethod],['cashAccountId',command.cashAccountId,plan.accountLabel],['notes',command.notes]]
   .filter(([,value])=>value!==null).map(([name,value,label])=>({field:name,label:field(name).label,type:field(name).type,value,...(label?{display:label}:{})}));
  const card={version:1,operation:entry.operation,label:entry.label,confirmLabel:confirmLabel(entry,command),destructive:false,target:{type:'borrower',id:target,label:plan.borrowerLabel},values:values_,changes:[],
   split:plan.split,consequences:plan.settlesAllDue?[{code:'settles_all_due'}]:[]};
  return {id:requestId,kind:'payment',operation:entry.operation,command:JSON.stringify(command),card};
 }

 return {
  catalogue,
  /** @param {{operation:string,target:string,values:Record<string,any>}} input */
  async propose({operation,target,values}){
   if(typeof operation!=='string'||!operation)throw new ToolError('UNKNOWN_OPERATION');
   if(!plain(values))throw new ToolError('INVALID_VALUES');
   if(Object.hasOwn(catalogue.excluded,operation)||(operation==='payment.correct'&&values.receiptMode==='replace')||(operation==='analytics.refresh'&&values.mode==='Full'))
    throw new ToolError('UNSUPPORTED_OPERATION');
   const entry=catalogue.entries.get(operation);
   if(!entry)throw new ToolError('UNKNOWN_OPERATION');
   for(const key of Object.keys(values)){
    const field=entry.fields.find(f=>f.name===key);
    if(catalogue.hostOwned.includes(key)||field?.host)throw new ToolError(`HOST_FIELD:${key}`);
    if(!field)throw new ToolError(`UNKNOWN_FIELD:${key}`);
   }
   if(entry.kind==='payment'){if(!ID(target))throw new ToolError('TARGET_REQUIRED');return proposePayment(entry,target,values);}
   const requestId=newId();
   let targetId,expectedVersion=null,predecessorRequestId=null,response=null,item=null;
   if(entry.target==='new'){
    targetId=newId();
    if(entry.targetAs&&target&&values[entry.targetAs]===undefined)values={...values,[entry.targetAs]:target};
   }else if(entry.target==='record'){
    if(!ID(target))throw new ToolError('TARGET_REQUIRED');
    response=await get(template(entry.read,{id:target}));item=plain(response.item)?response.item:null;targetId=target;
   }else if(entry.target==='self'){
    response=await get(entry.read);item=plain(response.item)?response.item:null;targetId=item?.id;
    if(targetId!==actor.partnerId)throw new ToolError('TARGET_NOT_FOUND');
   }else{
    response=await get(entry.read);targetId=dig(response,entry.targetPath);
    if(!ID(targetId))throw new ToolError('TARGET_NOT_FOUND');
   }
   if(entry.target!=='new'){
    expectedVersion=dig(response,entry.version??'item.version');
    if(typeof expectedVersion!=='string'||!HASH.test(expectedVersion))throw new ToolError('TARGET_VERSION_UNAVAILABLE');
    if(entry.predecessor){predecessorRequestId=dig(response,entry.predecessor)??null;if(predecessorRequestId!==null&&!UUID.test(predecessorRequestId))throw new ToolError('TARGET_VERSION_UNAVAILABLE');}
   }
   let inputs={},before=null;
   if(entry.builder==='correction'){
    ({inputs,before}=correction(entry,item,values));
   }else if(entry.builder==='book'){
    const borrowerId=item?.borrowerId;if(!ID(borrowerId))throw new ToolError('TARGET_NOT_FOUND');
    const draft=await get('/api/payment-drafts/'+encodeURIComponent(borrowerId)+'?scope=all');
    const offer=(Array.isArray(draft.bookable)?draft.bookable:Array.isArray(draft.upcoming)?draft.upcoming:[]).find(row=>row.loanId===targetId);
    if(!offer||typeof offer.bookVersion!=='string'||!HASH.test(offer.bookVersion))throw new ToolError('NEXT_CHARGE_UNAVAILABLE');
    expectedVersion=offer.bookVersion;
    inputs={chargeDate:offer.chargeDate,principalDue:offer.principalRemaining,interestDue:offer.interestRemaining};
   }else if(entry.inputs==='merge'||entry.inputs==='model'){
    const merge=entry.inputs==='merge'&&item!==null;
    if(merge)before={};
    for(const field of entry.fields){
     let value;
     if(field.host){
      const source=field.host.read?await get(template(field.host.read,{...values,id:targetId})):response;
      value=fieldValue(field,dig(source,field.host.path??field.name),{fromItem:true});
      if(value===null)throw new ToolError(`HOST_FIELD_UNAVAILABLE:${field.name}`);
     }else{
      if(merge){
       const key=field.from??field.name;
       if(!Object.hasOwn(item,key))throw new ToolError(`FIELD_UNREADABLE:${field.name}`);
       before[field.name]=fieldValue(field,item[key],{fromItem:true});
      }
      value=Object.hasOwn(values,field.name)?fieldValue(field,values[field.name]):merge?before[field.name]:field.default??null;
     }
     if(value===null&&field.required)throw new ToolError(`MISSING_FIELD:${field.name}`);
     inputs[field.name]=value;
    }
    if(merge&&same(inputs,before))throw new ToolError('NO_CHANGE');
   }
   let command;
   try{command=canonicalOperation({requestId,operation,targetId,expectedVersion,predecessorRequestId,inputs,receiptId:null});}
   catch{throw new ToolError('INVALID_COMMAND');}
   const {values:shown,changes}=await cardFields(entry.builder==='correction'?entry.fields.filter(f=>f.name!=='receiptMode'||inputs.receiptMode!=='preserve'):entry.fields,
    entry.builder==='correction'?{...inputs.fields,receiptMode:inputs.receiptMode}:command.inputs,before);
   const card={version:1,operation,label:entry.label,confirmLabel:confirmLabel(entry,command.inputs),destructive:entry.destructive===true,
    target:{type:operation.split('.')[0],id:targetId,label:await title(entry,response,{...values,id:targetId})},
    values:shown,changes:entry.target==='new'?[]:changes,consequences:entry.consequences.map(code=>consequence(code,command.inputs))};
   if(entry.builder==='correction')card.split=inputs.fields.allocations?.map(row=>({chargeId:row.chargeId,chargeDate:row.chargeDate,principal:row.principal,interest:row.interest,loanDisplayKey:null,projected:false}))??[];
   return {id:requestId,kind:'operation',operation,command:JSON.stringify(command),card};
  },
 };
}

/** payment.correct (D4: no receipt replacement): the correction form's initial state from the correction preview,
 * with the Partner's changes to date, method, receiving account and notes; the allocation plan is kept. */
function correction(entry,item,values){
 const source=item?.source;
 if(!plain(item)||!plain(source)||!['pwa-plan','legacy-source'].includes(item.origin))throw new ToolError('TARGET_NOT_FOUND');
 const whole=v=>String(v??'').replace(/\.0+$/,'');
 const field=name=>entry.fields.find(f=>f.name===name);
 const before={paymentDate:source.paymentDate??null,paymentMethod:source.paymentMethod??null,cashAccountId:source.cashAccountId??null,notes:source.notes===''?null:source.notes??null};
 const fields={borrowerId:source.borrowerId,amountReceived:whole(source.amountReceived),paymentDate:before.paymentDate,paymentMethod:before.paymentMethod,cashAccountId:before.cashAccountId,
  notes:before.notes===''?null:before.notes,allocationMethod:source.allocationMethod,targetChargeId:source.targetChargeId??null,targetLoanId:source.targetLoanId??null};
 for(const key of ['paymentDate','paymentMethod','cashAccountId','notes'])if(Object.hasOwn(values,key))fields[key]=fieldValue(field(key),values[key]);
 if(fields.paymentDate===null||fields.paymentMethod===null||fields.cashAccountId===null)throw new ToolError('MISSING_FIELD:'+(fields.paymentDate===null?'paymentDate':fields.paymentMethod===null?'paymentMethod':'cashAccountId'));
 const receiptMode=values.receiptMode===undefined?'preserve':fieldValue(field('receiptMode'),values.receiptMode);
 if(item.origin==='pwa-plan'){
  const balances=Array.isArray(item.balances)?item.balances:[];
  fields.allocations=(item.effectivePlan?.allocations??[]).map(line=>{const current=balances.find(row=>row.chargeId===line.chargeId);
   return {chargeId:line.chargeId,principal:whole(line.principal),interest:whole(line.interest),expectedPrincipalRemaining:whole(current?.principalRemaining??line.expectedPrincipalRemaining),
    expectedInterestRemaining:whole(current?.interestRemaining??line.expectedInterestRemaining),chargeDate:current?.chargeDate??line.chargeDate};}).filter(line=>line.principal!=='0'||line.interest!=='0');
 }else fields.selectedChargeIds=typeof source.selectedChargeIdsText==='string'&&source.selectedChargeIdsText?source.selectedChargeIdsText.split(','):null;
 if(receiptMode==='preserve'&&['paymentDate','paymentMethod','cashAccountId','notes'].every(key=>same(fields[key],before[key]===''?null:before[key])))throw new ToolError('NO_CHANGE');
 return {inputs:{kind:item.origin,fields,receiptMode,...(item.origin==='pwa-plan'?{closePreparationHash:null}:{})},before:{...before,receiptMode:'preserve'}};
}

const PROTOCOL_KEYS=['id','threadId','messageId','kind','operation','state','card','expiresAt','createdAt','settledAt','outcome','record'];
/** The API proposal object (D9): the internal claim fields are removed. */
export const publicProposal=p=>p?Object.fromEntries(PROTOCOL_KEYS.filter(k=>Object.hasOwn(p,k)).map(k=>[k,p[k]])):p;

/** The link to the written record for the card (D6 record {type,id,paymentId}); a delete links nothing. */
function recordFor(proposal,command,outcome){
 const paymentId=typeof outcome.paymentId==='string'?outcome.paymentId:typeof outcome.result?.paymentId==='string'?outcome.result.paymentId:null;
 if(proposal.kind==='payment')return paymentId?{type:'payment',id:paymentId,paymentId}:null;
 if(proposal.operation.endsWith('.delete'))return null;
 const type=proposal.operation.split('.')[0];
 return typeof command?.targetId==='string'?{type,id:command.targetId,paymentId}:null;
}
const capped=value=>value===undefined?null:Buffer.byteLength(JSON.stringify(value))<=60000?value:{truncated:true};
/** A recorded journal answer -> the settlement (applied/posted -> done, rejected -> failed with its code). */
function recorded(proposal,command,data){
 const o=data.originalOutcome;
 const outcome={status:o.status,code:typeof o.code==='string'?o.code:null,result:capped(o.result??(o.paymentId?{paymentId:o.paymentId}:null)),recordedAt:o.recordedAt??null};
 if(['applied','posted'].includes(o.status))return {state:'done',outcome,record:recordFor(proposal,command,o)};
 return {state:'failed',outcome:{...outcome,code:outcome.code??'request_rejected'},record:null};
}
const failed=code=>({state:'failed',outcome:{status:'not_applied',code,result:null,recordedAt:null},record:null});
const unknown=reason=>({state:'unknown',outcome:{status:'unknown',code:'outcome_unknown',result:null,recordedAt:null,reason},record:null});

/**
 * POST .../proposals/:id/confirm. Only a pending proposal is claimed (V118: pending -> executing, once) and only that
 * claim may POST, after the status read finds the command unresolved. Any other answer of the claim (unknown, a dead
 * instance's executing, a settled state) is reconciled from the command journal and never posts the command again.
 * A busy refusal settles failed command_busy only on the first attempt: services/payment-command/store.mjs run()
 * answers 409 command_busy only for a lock or try-lock refusal before COMMIT after a confirmed ROLLBACK (no quarantine),
 * so nothing was applied (lines 86-92, DB-LOCK-01); any later attempt settles unknown.
 * @param {{store:any,principal:any,thread:string,id:string,client:any,log?:(record:object)=>void,now?:()=>number}} input
 */
export async function executeProposal({store,principal,thread,id,client,log=()=>{},now=Date.now}){
 const claim=await store.claimProposal(principal,thread,id);
 if(!claim.claimed)return reconcileProposal({store,principal,thread,proposal:claim.proposal,client,now,log});
 const proposal=claim.proposal,first=proposal.attempts===1;
 let command=null;try{command=JSON.parse(claim.command);}catch{/* the stored text is the command service's JSON */}
 const settle=async settlement=>{
  log({event:'chat_proposal_settled',thread,proposal:id,operation:proposal.operation,state:settlement.state,code:settlement.outcome?.code??null,attempts:proposal.attempts});
  return publicProposal(await store.settleProposal(principal,thread,id,settlement));
 };
 // Reconcile before any POST (AGENTS.md): the journal is authoritative for this request id.
 let status;
 try{status=await client.status(proposal.kind,id);}
 catch(error){if(!(error instanceof CommandUnavailable))throw error;return settle(first?failed('command_unavailable'):unknown('status_unavailable'));}
 if(status.kind==='recorded')return settle(recorded(proposal,command,status));
 if(status.kind==='conflict')return settle(failed('command_conflict'));
 if(status.kind==='refused')return settle(first?failed(status.code):unknown('status_refused'));
 if(!first)return settle(unknown('not_first_attempt'));
 const answer=await client.submit(proposal.kind,claim.command);
 if(answer.result==='recorded')return settle(recorded(proposal,command,answer.data));
 if(answer.result==='busy')return settle(first?failed('command_busy'):unknown('busy'));
 if(answer.result==='rejected')return settle(failed(answer.code));
 return settle(unknown(answer.reason));
}

/**
 * GET .../proposals/:id, and Confirm on a proposal that is not pending: an unknown outcome, or an executing claim of a
 * dead instance, is reconciled by the status read; a recorded journal entry always wins. A command the journal does
 * not hold STALE_CLAIM_MS (3 minutes) after the claim was never applied (no POST can still be in flight) and is
 * settled failed (command_unavailable); before that it stays as it is. Never posts.
 * @param {{store:any,principal:any,thread:string,proposal:any,client:any,now?:()=>number,log?:(record:object)=>void}} input
 */
export async function reconcileProposal({store,principal,thread,proposal,client,now=Date.now,log=()=>{}}){
 const claimed=Date.parse(proposal.claimedAt??'');
 const stale=Number.isFinite(claimed)&&now()-claimed>=STALE_CLAIM_MS;
 if(!(proposal.state==='unknown'||(proposal.state==='executing'&&stale)))return publicProposal(proposal);
 let status;
 try{status=await client.status(proposal.kind,proposal.id);}catch(error){if(error instanceof CommandUnavailable)return publicProposal(proposal);throw error;}
 let settlement=null;
 if(status.kind==='recorded'){
  let command=null;
  if(proposal.kind==='operation'&&!proposal.operation.endsWith('.delete'))command={targetId:proposal.card?.target?.id};
  settlement=recorded(proposal,command,status);
 }else if(status.kind==='conflict')settlement=failed('command_conflict');
 else if(status.kind==='unresolved'&&stale)settlement=failed('command_unavailable');
 if(!settlement)return publicProposal(proposal);
 log({event:'chat_proposal_reconciled',thread,proposal:proposal.id,operation:proposal.operation,state:settlement.state,code:settlement.outcome?.code??null});
 return publicProposal(await store.settleProposal(principal,thread,proposal.id,settlement));
}
