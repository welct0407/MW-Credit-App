import {genericNotification,renderNotification} from './content.mjs';
/** R119: the only v4 errors that fall back to v3: undefined_function (a database before V134) and insufficient_privilege.
 * R129: the same two v5 errors fall back to v4 (a database before V137, or before its grant). */
const V4_FALLBACK=new Set(['42883','42501']);
/** Claim just before each send so a slow provider cannot expire an entire batch. */
export function createNotificationDispatcher({pool,transport,eligible,guardConnection,enabled=false,shouldStop=()=>false,remainingMs=()=>Infinity,signal=()=>undefined}){
 if(enabled&&(typeof transport!=='function'||typeof eligible!=='function'||typeof guardConnection!=='function'))throw Error('notification_dependencies_required');
 async function query(sql,args){const c=await pool.connect();let healthy=false;try{await guardConnection(c);const r=await c.query(sql,args);healthy=true;return r;}finally{c.release(!healthy);}}
 return async function dispatch(){
  if(!enabled)return{enabled:false,claimed:0};
  const results=[];
  for(let i=0;i<10;i++){
   if(shouldStop()||remainingMs()<10000)break;
   const delivery=(await query('SELECT * FROM public.pwa_claim_notifications_v1($1,$2)',[1,30])).rows[0];if(!delivery)break;
   const row=(await query('SELECT * FROM public.pwa_notify_prepare_send_v1($1::uuid,$2::bigint)',[delivery.delivery_id,delivery.lease_generation])).rows[0];
   const checked=row?await eligible(null,row):false;
   const eligibility=shouldStop()||remainingMs()<8000?null:checked;
   let result={kind:eligibility===null?'deferred':'ineligible'};
   if(eligibility===true){
    // R080 (V99): event wording. Best effort: any failure (including a database before V99) sends the generic
    // text and never defers, fails or re-orders the delivery; lease, fence and result handling are unchanged.
    let content;
    // R111 (V122): v2 adds a closed loan's rebate facts; before V122 the v1 read answers (no rebate line).
    // R118 (V132): v3 adds the payment's late-charge part; before V132 the v2 read answers (no late part).
    // R119 (V134): v4 adds every rebate of the payment (`rebates`); before V134 (42883, no such function) or before its
    // grant (42501) the v3 read answers (the first rebate). Any other v4 error is not hidden behind a first-rebate push:
    // it reaches the catch below, which sends the generic text.
    try{const args=[delivery.delivery_id,delivery.lease_generation];let facts;
     // R129 (V137): v5 adds each rebate's state, pending amount and the payee's owed total; v4 answers before V137.
     for(const version of [5,4,3,2,1]){try{facts=(await query(`SELECT * FROM public.pwa_notify_content_v${version}($1::uuid,$2::bigint)`,args)).rows[0];break;}
      catch(error){if(version===1||version>=4&&!V4_FALLBACK.has(error?.code))throw error;}}
     content=facts?renderNotification({found:facts.found,eventType:facts.event_type,language:facts.language,borrowerName:facts.borrower_name,amount:facts.amount,rebatePayee:facts.rebate_payee??null,rebatePayable:facts.rebate_payable??null,paymentMethod:facts.payment_method??null,rebateLoan:facts.rebate_loan??null,lateChargeAmount:facts.late_charge_amount??null,rebates:facts.rebates??null}):genericNotification();}
    catch{content=genericNotification();}
    const started=(await query('SELECT public.pwa_notify_start_send_v1($1::uuid,$2::bigint,$3::bigint) AS started',[delivery.delivery_id,delivery.lease_generation,row.version])).rows[0].started;
    if(!started){results.push({state:'fenced'});continue;}
    try{if(shouldStop()||remainingMs()<=0)throw Error('request_expired_after_send_fence');result=await transport({endpoint:row.endpoint,expirationTime:row.expires_at?new Date(row.expires_at).getTime():null,keys:{p256dh:row.p256dh,auth:row.auth}},delivery.event_id,{timeoutMs:Math.min(8000,remainingMs()),signal:signal(),content});}catch{result={kind:'network'};}
   }
   if(!['accepted','expired','throttled','unavailable','network','rejected','ineligible','deferred'].includes(result.kind))throw Error('invalid_provider_result');
   const state=(await query('SELECT public.pwa_notify_complete_v1($1::uuid,$2::bigint,$3::text) AS state',[delivery.delivery_id,delivery.lease_generation,result.kind])).rows[0].state;
   results.push({state});
  }
  return{enabled:true,claimed:results.length,results};
 };
}
