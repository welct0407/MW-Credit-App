const assert=require('node:assert/strict'),fs=require('fs'),{execFileSync}=require('child_process');
const {patch}=require('./row5-dashboard'),{bridgeObservation}=require('./bridge-observation');
const root='outputs/resource-monitoring-20260922/';
for(const fmt of ['dashboard','editor-resource'])for(const page of ['performance','cost']){
 const before=JSON.parse(fs.readFileSync(root+page+'-'+fmt+'.json'));
 const performance=JSON.parse(fs.readFileSync(root+'performance-'+fmt+'.json'));
 const azureVmMetricsUrl=performance.spec?.elements?.['panel-11']?.spec.data.spec.queries[0].spec.query.spec.url??performance.panels.find(p=>p.id===11).targets[0].url;
 const after=patch(before,page,{azureVmMetricsUrl});
 assert.deepEqual(patch(after,page,{azureVmMetricsUrl}),after,'idempotent '+page+' '+fmt);
 if(before.spec){
  for(const [id,p]of Object.entries(before.spec.elements))assert.deepEqual(after.spec.elements[id],p,'preserve '+id);
  assert.deepEqual(after.metadata,before.metadata);assert.deepEqual(after.spec.timeSettings,before.spec.timeSettings);
  for(let i=0;i<before.spec.layout.spec.rows.length;i++){
   const old=before.spec.layout.spec.rows[i].spec.layout.spec.items;
   assert.deepEqual(after.spec.layout.spec.rows[i].spec.layout.spec.items.slice(0,old.length),old);
  }
 }else for(const p of before.panels){const q=structuredClone(after.panels.find(x=>x.id===p.id));q.gridPos=p.gridPos;assert.deepEqual(q,p);}
 const bad=structuredClone(before);if(bad.spec)bad.spec.timeSettings.timezone='UTC';else bad.timezone='UTC';
 assert.throws(()=>patch(bad,page,{azureVmMetricsUrl}),/timezone/);
}
// Optional fresh LIVE v2 exports: prove removing only this task additions restores exact input.
if(process.argv.length>2){
 const [perfPath,costPath]=process.argv.slice(2);if(!perfPath||!costPath)throw Error('Provide both live exports');
 const perf=JSON.parse(fs.readFileSync(perfPath)),cost=JSON.parse(fs.readFileSync(costPath));
 const azureVmMetricsUrl=perf.spec.elements['panel-11'].spec.data.spec.queries[0].spec.query.spec.url;
 for(const [page,before] of [['performance',perf],['cost',cost]]){
  const after=patch(before,page,{azureVmMetricsUrl}),recovered=structuredClone(after);
  const ids=page==='performance'?[120,121,122,123,124,125,126,127]:[110];
  for(const id of ids)delete recovered.spec.elements['panel-'+id];
  for(const row of recovered.spec.layout.spec.rows)row.spec.layout.spec.items=row.spec.layout.spec.items.filter(x=>!ids.includes(Number(x.spec.element.name.replace('panel-',''))));
  assert.deepEqual(recovered,before,'complete fresh LIVE preservation '+page);
  assert.deepEqual(patch(after,page,{azureVmMetricsUrl}),after,'fresh repeat '+page);
 }
 console.log('PASS: fresh LIVE Performance/Cost complete object preservation and idempotence');
}
const now=100000,base={checked_at:now,passive_health_ok:true,last_dispatch_completed_at:now-60,outbox_complete:true,pending_count:0,expected_subscriptions:1,active_expected_subscriptions:1,earliest_expected_expiry_at:now+7200,renewal_advancing:true,delivery_inspected:true,failed_count:0};
assert.deepEqual(bridgeObservation(base,now),{availability:1,dispatch:1,outbox:1,subscription:1,renewal:1,continuity:1});
assert(Object.values(bridgeObservation({...base,checked_at:now-361},now)).every(x=>x===4));
assert.equal(bridgeObservation({...base,expected_subscriptions:undefined},now).subscription,4);
assert.equal(bridgeObservation({...base,outbox_complete:false,pending_count:100},now).outbox,4);
assert.equal(bridgeObservation({...base,last_dispatch_completed_at:now-301},now).dispatch,0);
assert.equal(bridgeObservation({...base,pending_count:1,oldest_pending_created_at:now-901},now).outbox,0);
assert.equal(bridgeObservation({...base,pending_count:1,oldest_pending_created_at:now-301},now).outbox,2);
assert.equal(bridgeObservation({...base,earliest_expected_expiry_at:now+3599,renewal_advancing:false},now).renewal,2);
assert.equal(bridgeObservation({...base,failed_count:1},now).continuity,0);
assert.equal(bridgeObservation({...base,last_event_at:0},now).continuity,1);
const from=Date.parse('2026-10-03T15:59:00Z'),to=from+120000;
const selector=fs.readFileSync('scripts/monitoring/azure-daily-availability.jq','utf8').replace('__FROM_MS__',String(from)).replace('__TO_MS__',String(to));
const run=(data,sel=selector)=>JSON.parse(execFileSync('jq',['-c',sel],{input:JSON.stringify({interval:"PT1M",value:[{name:{value:'VmAvailabilityMetric'},timeseries:[{data}]}]})}));
const rows=run([{timeStamp:'2026-10-03T15:59:00Z',average:1},{timeStamp:'2026-10-03T16:00:00Z',average:null}]);
assert.equal(rows[0].Day,'2026-10-03');assert.equal(rows[1].Day,'2026-10-04');assert.equal(rows[0]['Observed available hours'],1/60);assert.equal(rows[1]['Observed available hours'],null);assert.equal(rows[1]['Unknown hours'],1/60);
assert.equal(run([{timeStamp:'2026-10-03T15:59:00Z',average:0}])[0]['Observed available hours'],0);
assert.equal(run([{timeStamp:'2026-10-03T15:59:00Z',average:0.5}])[0]['Observed available hours'],1/120);
assert.equal(run([],selector)[0]['Coverage percent'],0);
const partial=selector.replace(String(from),String(from+30000)).replace(String(to),String(from+45000));
assert.equal(run([{timeStamp:'2026-10-03T15:59:00Z',average:1}],partial)[0]['Observed available hours'],15/3600);
assert.throws(()=>run([{timeStamp:'2026-10-03T15:59:00Z',average:2}]),/Command failed/);
assert.throws(()=>run([{timeStamp:'2026-10-03T15:59:00Z',average:1},{timeStamp:'2026-10-03T15:59:00Z',average:1}]),/Command failed/);
console.log('PASS: classic/v2 preservation and idempotence, observation unknown/expiry/backlog semantics, SGT day split, null gaps, clipping, invalid and duplicate data guards');
