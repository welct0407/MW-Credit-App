/* Passive Activity Log evidence. Does not infer guest runtime between control-plane operations. */
const OPS=new Set(['start','poweroff','deallocate','restart']);
function powerHistory(input,{from,to,complete=false}={}){
 if(!Number.isFinite(from)||!Number.isFinite(to)||to<=from)throw Error('Invalid bounds');
 if(input.nextLink||!complete)throw Error('All Activity Log pages must be verified complete');
 const seen=new Map();
 for(const row of input.value??[]){
  const op=(row.operationName?.value??'').toLowerCase().match(/\/virtualmachines\/(start|poweroff|deallocate|restart)\/action$/)?.[1];
  if(!OPS.has(op)||(row.status?.value??'').toLowerCase()!=='succeeded')continue;
  const at=Date.parse(row.eventTimestamp);if(!Number.isFinite(at)||at>to)continue;
  // A correlation can cover multiple operations; dedup operation+correlation, not all its siblings.
  const key=op+':'+(row.correlationId||row.eventDataId||'');if(key.endsWith(':'))throw Error('Missing operation identity');
  if(!seen.has(key)||at>seen.get(key).at)seen.set(key,{at,op});
 }
 const events=[...seen.values()].sort((a,b)=>a.at-b.at);
 const intervals=[];let at=from,state='unknown';
 for(const e of events){
  // A restart does not prove its transient outage duration and does not reset a whole off interval.
  const next=e.op==='deallocate'?'recorded_deallocated':e.op==='poweroff'?'recorded_powered_off':e.op==='start'?'recorded_started':'unknown';
  if(e.at<=from){state=next;continue;}
  if(e.at>at)intervals.push({from:at,to:e.at,state});at=e.at;state=next;
 }
 if(at<to)intervals.push({from:at,to,state});
 return {intervals,completedOperations:events.length,caveat:'Recorded control-plane state only. Started intervals are not guaranteed continuous guest runtime. Guest shutdown/platform outage may be absent; availability null remains unknown.'};
}
module.exports={powerHistory};
