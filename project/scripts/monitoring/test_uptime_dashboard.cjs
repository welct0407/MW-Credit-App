const assert=require('node:assert/strict'),fs=require('node:fs'),{execFileSync}=require('node:child_process');
const {selector,sqlSelector,display,patchDebian,patchSaved,patchInfrastructure,sqlQuery}=require('./uptime-dashboard');
const epoch=Math.floor(Date.parse('2026-10-05T11:53:00Z')/1000);
// Parent Explore verified this real resource/sample; use a fixed clock for guards.
const series={metric:{type:'compute.googleapis.com/instance/uptime_total'},resource:{type:'gce_instance',labels:{project_id:'clever-oasis-508610-n7',instance_id:'8223265527494214160',zone:'asia-southeast1-a'}},points:[{interval:{endTime:'2026-10-05T11:53:00Z'},value:{int64Value:'1198121'}},{interval:{endTime:'2026-10-05T11:52:00Z'},value:{int64Value:'1198061'}}]};
const run=(data,now=epoch+120)=>JSON.parse(execFileSync('jq',['-c',selector.replaceAll('now',String(now))],{input:JSON.stringify(data),stdio:['pipe','pipe','pipe']}));
assert.equal(run({timeSeries:[series]}).Uptime,1198121,'latest raw gauge, not sum or rate');
assert.equal(run({timeSeries:[series]},epoch+360).Uptime,1198121);
assert.equal(run({timeSeries:[series]},epoch+361).Uptime,null,'stale sample never displayed as current uptime');
assert.equal(run({timeSeries:[series]},epoch-121).Uptime,null,'invalid future sample');
assert.equal(run({}).Uptime,null);assert.equal(run({timeSeries:[]}).Uptime,null);
for(const raw of ['bad','-1','1.5',null]){const invalid=structuredClone(series);invalid.points[0].value.int64Value=raw;assert.equal(run({timeSeries:[invalid]}).Uptime,null,'invalid latest sample cannot fall back to an older healthy value');}
for(const data of [{error:{message:'synthetic'}},{nextPageToken:'synthetic'},{timeSeries:[series,series]}])assert.throws(()=>run(data),'errors and ambiguity visible');
const wrong=structuredClone(series);wrong.resource.labels.instance_id='synthetic-other';assert.throws(()=>run({timeSeries:[wrong]}));
const path=process.argv[2]||'outputs/grafana-row5-vm01-20261004/performance-import.json';
const before=JSON.parse(fs.readFileSync(path)),after=patchDebian(before),recovered=structuredClone(after);
assert.equal(Object.keys(after.spec.elements).length,70);delete recovered.spec.elements['panel-128'];recovered.spec.layout.spec.rows[0].spec.layout.spec.items.pop();assert.deepEqual(recovered,before,'every existing element/layout/preference/metadata preserved');
assert(!after.spec.elements['panel-129'],'VM-only preparation does not fabricate SQL telemetry');
assert.deepEqual(after.spec.layout.spec.rows[0].spec.layout.spec.items.at(-1).spec,{x:20,y:17,width:2,height:5,element:{kind:'ElementReference',name:'panel-128'}});
assert.throws(()=>patchDebian(after),'old baseline cannot silently replay over live');
const occupied=structuredClone(before);occupied.spec.layout.spec.rows[0].spec.layout.spec.items.push({kind:'GridLayoutItem',spec:{x:20,y:18,width:2,height:4,element:{kind:'ElementReference',name:'synthetic'}}});assert.throws(()=>patchDebian(occupied));
console.log('PASS: raw verified gauge, freshness/null/error/resource guards; scoped69→70 preservation, placement and SQL absence');
const displayRun=seconds=>JSON.parse(execFileSync('jq',['-c','.'+display],{input:JSON.stringify({Uptime:seconds})}));
assert.deepEqual(displayRun(1198121),{Uptime:1198121,UptimeText:'13d 20h 48m'});
assert.deepEqual(displayRun(null),{Uptime:null,UptimeText:null});
assert.equal(displayRun(59).UptimeText,'0d 00h 00m');assert.equal(displayRun(60).UptimeText,'0d 00h 01m');
const sqlSeries=field=>({...structuredClone(series),metric:{type:'custom.googleapis.com/mw_resource_monitoring/worker_timing',labels:{component:'cloud_sql_prod',field}},points:[{interval:{endTime:'2026-10-05T11:53:00Z'},value:{int64Value:field==='status'?'1':'1294391'}}]});
const pair=[sqlSeries('status'),sqlSeries('uptime_seconds')];
const sqlRun=(s,now=epoch+120)=>JSON.parse(execFileSync('jq',['-c',(sqlSelector+display).replaceAll('now',String(now))],{input:JSON.stringify({timeSeries:s}),stdio:['pipe','pipe','pipe']}));
assert.equal(sqlRun(pair).Uptime,1294391);assert.equal(sqlRun(pair).UptimeText,'14d 23h 33m');
assert.equal(sqlRun(pair,epoch+361).Uptime,null);
const failed=structuredClone(pair);failed[0].points[0].value.int64Value='4';assert.equal(sqlRun(failed).Uptime,null);
const mismatched=structuredClone(pair);mismatched[1].points[0].interval.endTime='2026-10-05T11:52:00Z';assert.equal(sqlRun(mismatched).Uptime,null);
assert.equal(sqlRun([pair[0]]).Uptime,null);assert.throws(()=>sqlRun([...pair,pair[0]]));
assert.equal(sqlRun([]).Uptime,null);assert.equal(sqlRun(pair,epoch-121).Uptime,null);
for(const raw of ['bad','-1','1.5',null]){const invalid=structuredClone(pair);invalid[1].points[0].value.int64Value=raw;assert.equal(sqlRun(invalid).Uptime,null);}
for(const extra of [{error:{message:'synthetic'}},{nextPageToken:'synthetic'}])assert.throws(()=>JSON.parse(execFileSync('jq',['-c',sqlSelector],{input:JSON.stringify(extra),stdio:['pipe','pipe','pipe']})));
const wrongSql=structuredClone(pair);wrongSql[0].metric.labels.field='synthetic';assert.throws(()=>sqlRun(wrongSql));
{
 const saved=process.argv[3]?JSON.parse(fs.readFileSync(process.argv[3])):structuredClone(after);
 if(!process.argv[3]){
  const vm=saved.spec.elements['panel-128'],q=vm.spec.data.spec.queries[0].spec.query.spec;
  q.root_selector=selector;q.columns=[{text:'Uptime',selector:'Uptime',type:'number'}];
  vm.spec.vizConfig.spec.fieldConfig.defaults.unit='dtdhms';
 }
 const patched=patchSaved(saved),recovered=structuredClone(patched);
 const vm=saved.spec.elements['panel-128'];delete recovered.spec.elements['panel-129'];recovered.spec.layout.spec.rows[0].spec.layout.spec.items.pop();recovered.spec.elements['panel-128']=structuredClone(vm);assert.deepEqual(recovered,saved,'all70 saved elements unchanged except VM display formatting');
 const expected=structuredClone(vm),q=expected.spec.data.spec.queries[0].spec.query.spec;q.root_selector+=display;q.columns=[{text:'Uptime',selector:'UptimeText',type:'string'}];expected.spec.vizConfig.spec.fieldConfig.defaults.unit='string';expected.spec.description=expected.spec.description.replace('days, hours, minutes and seconds','days, hours and minutes')+' Display floors to whole minutes; raw seconds retained internally.';assert.deepEqual(patched.spec.elements['panel-128'],expected);
 assert.deepEqual(patched.spec.layout.spec.rows[0].spec.layout.spec.items.at(-1).spec,{x:22,y:17,width:2,height:5,element:{kind:'ElementReference',name:'panel-129'}});
 console.log('PASS: exact70→71 SQL addition and VM display-only formatting, paired SQL status, no seconds shown, raw precision retained');
 const final=patchInfrastructure(saved),restored=structuredClone(final);
 assert.equal(Object.keys(final.spec.elements).length,72);
 assert.equal(JSON.parse(final.spec.elements['panel-130'].spec.data.spec.queries[0].spec.query.spec.data)[0].label,'Infrastructure Uptime');
 for(const [id,x,name]of [[128,20,'Debian VM'],[129,22,'Cloud SQL'],[130,20,null]]){
  const p=final.spec.layout.spec.rows[0].spec.layout.spec.items.find(i=>i.spec.element.name===`panel-${id}`).spec;
  assert.equal(p.x,x);assert.equal(p.y,id===130?17:18);assert.equal(p.width,id===130?4:2);assert.equal(p.height,id===130?1:4);
  if(name)assert.equal(final.spec.elements[`panel-${id}`].spec.vizConfig.spec.fieldConfig.defaults.displayName,name);
  if(name)assert.deepEqual(final.spec.elements[`panel-${id}`].spec.vizConfig.spec.options.reduceOptions,{calcs:['last'],fields:'/.*/',values:true},'string values included by Stat');
 }
 for(const id of [129,130])delete restored.spec.elements[`panel-${id}`];
 restored.spec.elements['panel-128']=structuredClone(vm);
 restored.spec.layout.spec.rows[0].spec.layout.spec.items=restored.spec.layout.spec.rows[0].spec.layout.spec.items.filter(i=>!['panel-129','panel-130'].includes(i.spec.element.name));
 restored.spec.layout.spec.rows[0].spec.layout.spec.items.find(i=>i.spec.element.name==='panel-128').spec=structuredClone(saved.spec.layout.spec.rows[0].spec.layout.spec.items.find(i=>i.spec.element.name==='panel-128').spec);
 assert.deepEqual(restored,saved,'only existing Debian formatting/placement changes; all other original values preserved');
 assert.throws(()=>patchInfrastructure(final),'reject replay over saved final group');
 assert(!decodeURIComponent(sqlQuery().query.spec.url).includes(' OR '),'use browser-verified Monitoring filter');
 console.log('PASS: Infrastructure Uptime header, matching row 5 geometry and labels; original panels preserved');
 if(process.argv[4]){
  const live=JSON.parse(fs.readFileSync(process.argv[4]));
  for(const id of [128,129,130])assert.deepEqual(final.spec.elements[`panel-${id}`],live.spec.elements[`panel-${id}`],`exact saved panel ${id}`);
  const sort=items=>items.toSorted((a,b)=>a.spec.element.name.localeCompare(b.spec.element.name));
  assert.deepEqual(sort(final.spec.layout.spec.rows[0].spec.layout.spec.items),sort(live.spec.layout.spec.rows[0].spec.layout.spec.items),'exact saved layout; array order normalized by Grafana');
  const normalized=structuredClone(final);normalized.spec.layout=structuredClone(live.spec.layout);assert.deepEqual(normalized,live,'only layout item ordering may normalize');
  console.log('PASS: generator precisely reproduces final saved resource, allowing layout item ordering only');
 }
}
