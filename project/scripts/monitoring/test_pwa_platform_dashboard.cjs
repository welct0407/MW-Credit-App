const assert=require('node:assert/strict'),fs=require('node:fs'),{spawnSync}=require('node:child_process');
const {build,numericSelector,hostingSelector}=require('./pwa-platform-dashboard.cjs');
const evidence=JSON.parse(fs.readFileSync(process.argv[2]||'../MW-Credit-App/outputs/r055-grafana/cloud-run-metric-evidence.json'));
const d=build(evidence,{uidAvailable:true});assert.equal(d.uid,'mw-pwa-platform');assert.equal(d.panels.length,29);assert.equal(new Set(d.panels.map(p=>p.id)).size,29);
assert.throws(()=>build(evidence));const bad=structuredClone(evidence);bad.aggregateQueries[1].reducer='REDUCE_MEAN';assert.throws(()=>build(bad,{uidAvailable:true}));
for(const p of d.panels.filter(p=>p.type==='timeseries'))for(const q of p.targets){const u=new URL(q.url);assert.equal(u.origin,'https://monitoring.googleapis.com');assert.equal(q.datasource.uid,'mw-gcp-monitoring');assert.match(u.searchParams.get('filter'),/mw-credit-app-(read|command|jobs|notify)-(dev|prod)/);assert.equal(u.searchParams.get('aggregation.alignmentPeriod'),'300s');assert.equal(q.url_options.method,'GET');assert.equal(p.fieldConfig.defaults.noValue,'No observed telemetry');assert.equal(p.fieldConfig.defaults.custom.spanNulls,false);}
assert.equal(d.panels.filter(p=>p.type==='stat').length,2);
if(process.argv[3]){
 const jq=process.argv[3],run=(selector,value)=>spawnSync(jq,['-c',selector],{input:JSON.stringify(value),encoding:'utf8'});
 for(const input of [{},{timeSeries:[]}]){const r=run(numericSelector,input);assert.equal(r.status,0,r.stderr);assert.equal(r.stdout.trim(),'');}
 for(const input of [{error:{code:403}},{nextPageToken:'more'}])assert.notEqual(run(numericSelector,input).status,0);
 for(const [age,value,expected]of [[0,'1',1],[0,'0',0],[361,'1',4],[-121,'1',4],[0,'9',4]]){const r=run(hostingSelector,{timeSeries:[{points:[{interval:{endTime:new Date(Date.now()-age*1000).toISOString()},value:{int64Value:value}}]}]});assert.equal(r.status,0,r.stderr);assert.equal(JSON.parse(r.stdout).value,expected);}
 const r=run(hostingSelector,{});assert.equal(r.status,0,r.stderr);assert.equal(JSON.parse(r.stdout).value,4);
 for(const input of [{error:{code:403}},{nextPageToken:'more'}])assert.notEqual(run(hostingSelector,input).status,0);
}
console.log('PWA dashboard structure, verified aggregations, fixed bindings, no-data semantics'+(process.argv[3]?' and executable jq fixtures':'')+' passed.');
