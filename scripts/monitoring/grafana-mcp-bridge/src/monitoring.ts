/** Optional post-dispatch instrumentation; never invokes delivery, refresh or power actions. */
import { createHash } from 'node:crypto';
import type { Store } from './store.js';
export const METRIC='custom.googleapis.com/mw_resource_monitoring/grafana_bridge';
const integer=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0;
const past=(v:unknown,now:number):v is number=>integer(v)&&v>0&&v<=now+120_000;
const fields=['availability','dispatch','outbox','subscription','renewal','continuity'];
export type NumericSnapshot=Record<string,number>;
export function unknownSnapshot(now:number):NumericSnapshot {
 return {checked_at:Math.floor(now/1000),inspection_failed:1,...Object.fromEntries(fields.map(k=>[k,4]))};
}
export async function inspectMonitoring(store:Store,ownerEnabled:boolean,dispatchAt:number,now=Date.now()):Promise<NumericSnapshot>{
 const result=unknownSnapshot(now);
 result.availability=ownerEnabled?1:0;
 if(past(dispatchAt,now))result.last_dispatch_completed_at=Math.floor(dispatchAt/1000);
 result.dispatch=past(dispatchAt,now)?(now-dispatchAt>300_000?0:1):4;
 if(!store.count) return result;
 try {
  const [pending,failed,oldest,control,previous]=await Promise.all([
   store.count('deliveries',[['state','==','pending']]),store.count('deliveries',[['state','==','failed']]),
   store.query('deliveries',[['state','==','pending']],1,'createdAt'),
   store.get('control/monitoring'),store.get('monitoring/previous')]);
  if(!integer(pending)||!integer(failed))throw Error();
  const oldestAt=oldest[0]?.createdAt;
  const coherent=pending===0?oldest.length===0:past(oldestAt,now);
  result.pending_count=pending;result.failed_count=failed;
  if(coherent){
   const age=pending===0?0:Math.max(0,Math.floor((now-oldestAt)/1000));
   result.oldest_pending_seconds=age;result.outbox=age>900?0:age>300?2:1;
   result.continuity=failed>0?0:age>300?2:1;
  }
  const expected=control?.expectedSubscriptionIds;
  if(Array.isArray(expected)&&expected.length>0&&expected.length<=8&&new Set(expected).size===expected.length&&expected.every(id=>typeof id==='string'&&/^sub_[a-f0-9]{64}$/.test(id))){
   result.expected_count=expected.length;
   let active=0,expiry=Infinity,grantExpiry=Infinity,grantKnown=true;
   for(const id of expected){
    const sub=await store.get('subscriptions/'+id);
    const revoked=sub?.grantHash?await store.get('revokedGrants/'+sub.grantHash):undefined;
    const grantTime=integer(sub?.grantExpiresAt)&&sub.grantExpiresAt>0&&typeof sub?.grantHash==='string'&&/^[a-f0-9]{64}$/.test(sub.grantHash);
    if(!grantTime)grantKnown=false;else grantExpiry=Math.min(grantExpiry,sub!.grantExpiresAt);
    if(ownerEnabled&&sub?.active===true&&integer(sub.expiresAt)&&sub.expiresAt>now&&!revoked&&(!grantTime||sub.grantExpiresAt>now)){
      active++;expiry=Math.min(expiry,sub.expiresAt);
    }
   }
   result.active_expected_count=active;result.subscription=active===expected.length?1:0;
   result.grant_authority=grantKnown?(grantExpiry>now&&active===expected.length?1:0):4;
   if(Number.isFinite(grantExpiry))result.grant_seconds_remaining=Math.max(0,Math.floor((grantExpiry-now)/1000));
   if(Number.isFinite(expiry)){
    const deadline=grantKnown?Math.min(expiry,grantExpiry):expiry;
    result.subscription_seconds_remaining=Math.max(0,Math.floor((expiry-now)/1000));
    const key=createHash('sha256').update([...expected].sort().join('\n')).digest('hex');
    const comparable=previous?.expectedSetHash===key&&integer(previous.deadline)&&past(previous.observedAt,now)&&now-previous.observedAt>=30_000&&now-previous.observedAt<=360_000;
    const advancing=comparable&&deadline>previous!.deadline;
    result.renewal=!grantKnown?4:deadline<=now?0:deadline-now>3600_000?1:!comparable?4:advancing?1:2;
    await store.atomic(async tx=>{
     const before=await tx.get('monitoring/previous');
     if(!before||!integer(before.observedAt)||before.observedAt<now)
      tx.set('monitoring/previous',{expectedSetHash:key,deadline,observedAt:now});
    });
   }else result.renewal=active===expected.length?4:0;
  }
  result.inspection_failed=coherent?0:1;
 }catch {result.inspection_failed=1;for(const key of ['outbox','subscription','renewal','continuity'])result[key]=4;}
 return result;
}
export function monitoringSeries(snapshot:NumericSnapshot,project:string,now=Date.now()){
 const allow=new Set([...fields,'checked_at','inspection_failed','last_dispatch_completed_at','pending_count','failed_count','oldest_pending_seconds','expected_count','active_expected_count','grant_authority','grant_seconds_remaining','subscription_seconds_remaining']);
 const labels={project_id:project,location:'asia-southeast1',namespace:'mw-resource-monitoring',job:'mcp-bridge',task_id:'mw-grafana-events'};
 return {timeSeries:Object.entries(snapshot).filter(([k,v])=>allow.has(k)&&integer(v)).map(([field,value])=>({
  metric:{type:METRIC,labels:{field}},resource:{type:'generic_task',labels},metricKind:'GAUGE',valueType:'INT64',
  points:[{interval:{endTime:new Date(now).toISOString()},value:{int64Value:String(value)}}]}))};
}
