/** All effects are disabled unless explicitly enabled by reviewed worker composition. */
export function createNotificationDispatcher({pool,transport,eligible,guardConnection,enabled=false}){
 if(enabled&&(typeof transport!=='function'||typeof eligible!=='function'||typeof guardConnection!=='function'))throw Error('notification_dependencies_required');
 async function checkout(){const c=await pool.connect();try{await guardConnection(c);return c}catch(e){c.release(true);throw e}}
 return async function dispatch(){
  if(!enabled)return{enabled:false,claimed:0};
  const client=await checkout();let claimed;
  try{claimed=(await client.query('SELECT * FROM public.pwa_claim_notifications_v1($1,$2)',[10,30])).rows;}finally{client.release();}
  const results=[];
  for(const delivery of claimed){
   let result={kind:'ineligible'},subscription;
   const reader=await checkout();
   try{
    const row=(await reader.query(`SELECT s.*,e.actor_partner_id,e.event_type,e.source_kind,e.source_id FROM public.pwa_push_subscriptions s JOIN public.pwa_notification_events e ON e.event_id=$2 WHERE s.subscription_id=$1 AND s.created_at<=e.occurred_at AND s.enabled AND s.version=$3 AND (s.expires_at IS NULL OR s.expires_at>clock_timestamp()) AND s.partner_id<>e.actor_partner_id AND NOT EXISTS(SELECT 1 FROM public.pwa_notification_preferences p WHERE p.partner_id=s.partner_id AND p.channel='web-push' AND (NOT p.enabled OR p.updated_at>e.occurred_at))`,[delivery.subscription_id,delivery.event_id,delivery.subscription_version])).rows[0];
    if(row&&await eligible(reader,row)){subscription={endpoint:row.endpoint,expirationTime:row.expires_at?new Date(row.expires_at).getTime():null,keys:{p256dh:row.p256dh,auth:row.auth}};}
   }finally{reader.release();}
   if(subscription){const markerClient=await checkout();let marker;try{marker=await markerClient.query("UPDATE public.pwa_notification_deliveries SET send_started_at=clock_timestamp() WHERE delivery_id=$1 AND lease_generation=$2 AND state='leased' AND lease_expires_at>clock_timestamp() RETURNING delivery_id",[delivery.delivery_id,delivery.lease_generation]);}finally{markerClient.release();}if(!marker.rows.length){results.push({state:'fenced'});continue;}result=await transport(subscription,delivery.event_id);}
   if(!['accepted','expired','throttled','unavailable','network','rejected','ineligible'].includes(result.kind))throw Error('invalid_provider_result');
   const writer=await checkout();
   try{
    await writer.query('BEGIN');
    const state=result.kind==='accepted'?'sent':result.kind==='ineligible'?'cancelled':result.kind==='network'?'uncertain':result.kind==='expired'||result.kind==='rejected'||delivery.attempts>=8?'dead':'retry';
    const ack=await writer.query(`UPDATE public.pwa_notification_deliveries SET state=$3,lease_expires_at=NULL,provider_result=$4,next_attempt_at=clock_timestamp()+make_interval(secs=>$5),completed_at=CASE WHEN $3 IN ('sent','cancelled','dead') THEN clock_timestamp() ELSE NULL END WHERE delivery_id=$1 AND lease_generation=$2 AND state='leased' AND lease_expires_at>clock_timestamp() RETURNING delivery_id`,[delivery.delivery_id,delivery.lease_generation,state,result.kind,Math.min(3600,30*2**delivery.attempts)]);
    if(ack.rows.length&&result.kind==='expired')await writer.query('UPDATE public.pwa_push_subscriptions SET enabled=false,version=version+1 WHERE subscription_id=$1 AND version=$2',[delivery.subscription_id,delivery.subscription_version]);
    await writer.query('COMMIT');results.push({state:ack.rows.length?state:'fenced'});
   }catch(error){await writer.query('ROLLBACK');throw error;}finally{writer.release();}
  }
  return{enabled:true,claimed:claimed.length,results};
 };
}
