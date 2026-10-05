/* Pure numeric observation contract. No network, persistence, labels or runtime wiring. */
const UNKNOWN=4, HEALTHY=1, DOWN=0, DEGRADED=2;
function bridgeObservation(s, now=Date.now()/1000) {
  const valid=v=>Number.isFinite(v)&&v>=0;
  if(!valid(s.checked_at)||now-s.checked_at>360||s.checked_at>now+120)
    return Object.fromEntries(['availability','dispatch','outbox','subscription','renewal','continuity'].map(k=>[k,UNKNOWN]));
  const age=t=>valid(t)&&t<=now+120?Math.max(0,now-t):null;
  const dispatchAge=age(s.last_dispatch_completed_at);
  // A fully inspected empty queue has age 0; capped counts cannot establish it.
  const oldest=s.outbox_complete===true&&valid(s.pending_count)?
    (s.pending_count===0?0:age(s.oldest_pending_created_at)):null;
  const expected=Number.isInteger(s.expected_subscriptions)&&s.expected_subscriptions>0;
  const subscription=expected&&Number.isInteger(s.active_expected_subscriptions)?
    (s.active_expected_subscriptions===s.expected_subscriptions?HEALTHY:DOWN):UNKNOWN;
  const expiry=valid(s.earliest_expected_expiry_at)?s.earliest_expected_expiry_at-now:null;
  const renewal=subscription===UNKNOWN||expiry===null||typeof s.renewal_advancing!=='boolean'?UNKNOWN:
    expiry<=0?DOWN:expiry<=3600&&!s.renewal_advancing?DEGRADED:HEALTHY;
  const continuity=s.delivery_inspected===true&&Number.isInteger(s.failed_count)&&valid(s.failed_count)?
    (s.failed_count>0?DOWN:oldest===null?UNKNOWN:oldest>300?DEGRADED:HEALTHY):UNKNOWN;
  return {availability:typeof s.passive_health_ok==='boolean'?(s.passive_health_ok?HEALTHY:DOWN):UNKNOWN,
    dispatch:dispatchAge===null?UNKNOWN:dispatchAge>300?DOWN:HEALTHY,
    outbox:oldest===null?UNKNOWN:oldest>900?DOWN:oldest>300?DEGRADED:HEALTHY,
    subscription,renewal,continuity};
}
module.exports={bridgeObservation};
