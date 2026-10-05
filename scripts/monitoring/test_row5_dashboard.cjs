const assert=require('node:assert/strict'),fs=require('fs'),{execFileSync}=require('child_process');
const {patch}=require('./row5-dashboard'),{bridgeObservation}=require('./bridge-observation');
const root='outputs/resource-monitoring-20260922/';
for(const fmt of ['dashboard','editor-resource'])for(const page of ['performance','cost']){
 const before=JSON.parse(fs.readFileSync(root+page+'-'+fmt+'.json'));
 const performance=JSON.parse(fs.readFileSync(root+'performance-'+fmt+'.json'));
 const azureVmMetricsUrl=performance.spec?.elements?.['panel-11']?.spec.data.spec.queries[0].spec.query.spec.url??performance.panels.find(p=>p.id===11).targets[0].url;
 const after=patch(before,page,{azureVmMetricsUrl});
 assert.deepEqual(patch(after,page,{azureVmMetricsUrl}),after,'idempotent '+page+' '+fmt);
 if(page==='performance'){
  const geometry=id=>{
   if(after.spec){const p=after.spec.layout.spec.rows[0].spec.layout.spec.items.find(p=>p.spec.element.name==='panel-'+id).spec;return {x:p.x,y:p.y,w:p.width,h:p.height};}
   return after.panels.find(p=>p.id===id).gridPos;
  };
  const peer=geometry(51),cards=[121,122,123,125,126,127].map(geometry);
  const standard=after.spec?after.spec.layout.spec.rows[0].spec.layout.spec.items.filter(p=>[10,14].includes(p.spec.y)&&after.spec.elements[p.spec.element.name]?.spec.vizConfig?.group==='stat').map(p=>({y:p.spec.y,w:p.spec.width,h:p.spec.height})):after.panels.filter(p=>p.type==='stat'&&[10,14].includes(p.gridPos.y)).map(p=>p.gridPos);
  assert(standard.some(p=>p.y===10)&&standard.some(p=>p.y===14),'both standard status rows inspected');
  for(const p of standard)assert.deepEqual([p.w,p.h],[2,3],'every existing row3/4 light has the reference footprint');

  for(const id of [121,122])assert.deepEqual([geometry(id).w,geometry(id).h],[peer.w,peer.h],'lights match existing row3/4 tile size');
  for(const id of [123,125,126,127])assert.deepEqual([geometry(id).w,geometry(id).h],[4,3],'other row5 card widths preserved and height matches the lights');
  assert(cards.every(p=>p.h===peer.h),'all six row5 cards have the standard light height');
  assert.deepEqual(cards.map(p=>p.x),[0,2,4,8,12,16],'compact row5 order');
  assert.deepEqual(geometry(120),{x:0,y:17,w:8,h:1},'Bridge header aligned over its cards');
  assert.deepEqual(geometry(124),{x:8,y:17,w:12,h:1},'Subscription header aligned over its cards');
  assert.equal(Math.max(...cards.map(p=>p.x+p.w)),20,'rightmost four columns remain blank');
  for(let i=0;i<cards.length;i++)for(let j=i+1;j<cards.length;j++){
   const a=cards[i],b=cards[j];assert(a.x+a.w<=b.x||b.x+b.w<=a.x||a.y+a.h<=b.y||b.y+b.h<=a.y,'row5 cards must not overlap');
  }
 }

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
// Mixed stat panels must never apply health mappings to counts/seconds,
// including Grafana query-prefixed display names observed in live QA.
const presentation=patch(JSON.parse(fs.readFileSync(root+'performance-dashboard.json')),'performance');
const fieldOptions=(p,name)=>{
 const resolved=structuredClone(p.fieldConfig.defaults);
 for(const o of p.fieldConfig.overrides)if(o.matcher.id==='byRegexp'&&new RegExp(o.matcher.options).test(name))
  for(const property of o.properties)resolved[property.id]=property.value;
 return resolved;
};
for(const id of [123,125,126,127]){
 const p=presentation.panels.find(x=>x.id===id);
 assert.deepEqual(p.fieldConfig.defaults.mappings,[],'numeric defaults unmapped');
 for(const name of ['Status','A Status']){
  const c=fieldOptions(p,name);assert.equal(c.mappings[0].options[0].text,'Down');assert.equal(c.mappings[0].options[4].text,'Unknown');
 }
 for(const q of p.targets.slice(1))for(const name of [q.columns[0].text,q.refId+' '+q.columns[0].text]){
  const c=fieldOptions(p,name);assert.deepEqual(c.mappings,[],'zero must remain numeric: '+name);
  assert.equal(c.unit,/pending_seconds|seconds_remaining/.test(decodeURIComponent(q.url))?'s':'short','prefix-compatible unit: '+name);
  assert.equal(c.noValue,'Unknown');assert.equal(c.color.fixedColor,'blue');
 }
}
for(const id of [121,122]){
 const tile=presentation.panels.find(x=>x.id===id),ref=presentation.panels.find(x=>x.id===51);
 const fields=structuredClone(ref.fieldConfig);fields.defaults.displayName=id===121?'Bridge availability':'Dispatch completion';
 assert.equal(tile.title,'');assert.deepEqual(tile.options,ref.options);assert.deepEqual(tile.fieldConfig,fields);
 assert.deepEqual(Object.values(tile.fieldConfig.defaults.mappings[0].options).map(v=>v.text),['🔴','🟢','🟠','🔵','⚪']);
 assert.equal(tile.fieldConfig.defaults.noValue,'⚪');
}
const liveStyle=JSON.parse(fs.readFileSync(root+'performance-editor-resource.json'));
const styled=patch(liveStyle,'performance');
for(const id of [121,122]){
 const expected=structuredClone(liveStyle.spec.elements['panel-51'].spec.vizConfig);
 expected.spec.fieldConfig.defaults.displayName=id===121?'Bridge availability':'Dispatch completion';
 assert.deepEqual(styled.spec.elements['panel-'+id].spec.vizConfig,expected,'entire existing v2 visualization copied');
 assert.equal(styled.spec.elements['panel-'+id].spec.title,'');
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
// Infinity JQ root results still use GJSON column selectors: plain object keys,
// not jq/JSONPath bracket notation. Check against actual generated output keys.
const columnCost=patch(JSON.parse(fs.readFileSync(root+'cost-dashboard.json')),'cost',{azureVmMetricsUrl:JSON.parse(fs.readFileSync(root+'performance-dashboard.json')).panels.find(p=>p.id===11).targets[0].url});
const columns=columnCost.panels.find(p=>p.id===110).targets[0].columns;
for(const c of columns){
 assert(Object.hasOwn(rows[0],c.selector),'column extracts an actual jq output key: '+c.selector);
 assert.equal(c.type,c.selector==='Day'?'string':'number');
 if(c.type==='number')assert.equal(typeof rows[0][c.selector],'number');
}
assert.equal(rows[1][columns[1].selector],null,'unknown availability remains null through explicit column mapping');
assert.equal(rows[0].Day,'2026-10-03');assert.equal(rows[1].Day,'2026-10-04');assert.equal(rows[0]['Observed available hours'],1/60);assert.equal(rows[1]['Observed available hours'],null);assert.equal(rows[1]['Unknown hours'],1/60);
assert.equal(run([{timeStamp:'2026-10-03T15:59:00Z',average:0}])[0]['Observed available hours'],0);
assert.equal(run([{timeStamp:'2026-10-03T15:59:00Z',average:0.5}])[0]['Observed available hours'],1/120);
assert.equal(run([],selector)[0]['Coverage percent'],0);
const partial=selector.replace(String(from),String(from+30000)).replace(String(to),String(from+45000));
assert.equal(run([{timeStamp:'2026-10-03T15:59:00Z',average:1}],partial)[0]['Observed available hours'],15/3600);
assert.throws(()=>run([{timeStamp:'2026-10-03T15:59:00Z',average:2}]),/Command failed/);
assert.throws(()=>run([{timeStamp:'2026-10-03T15:59:00Z',average:1},{timeStamp:'2026-10-03T15:59:00Z',average:1}]),/Command failed/);
console.log('PASS: classic/v2 preservation and idempotence, observation unknown/expiry/backlog semantics, SGT day split, null gaps, clipping, invalid and duplicate data guards');
