/* Source-only generator; publish through reviewed Grafana Terraform after adoption. */
const fs=require('node:fs');
const DS={type:'yesoreyeram-infinity-datasource',uid:'mw-gcp-monitoring'};
const PROJECT='clever-oasis-508610-n7';
const FROM='${__timeFrom:date:iso}',TO='${__timeTo:date:iso}';
const numericSelector='if .error then error("Monitoring query failed") elif .nextPageToken then error("Metric response truncated; shorten range") else [.timeSeries[]? | .points[]? | {time:.interval.endTime,value:((.value.doubleValue // .value.int64Value)|tonumber)}] | sort_by(.time) | .[] end';
const hostingSelector='if .error then error("Monitoring query failed") elif .nextPageToken then error("Hosting response truncated") else [.timeSeries[]?.points[]?]|sort_by(.interval.endTime)|last as $p | (try ($p.interval.endTime|sub("[.][0-9]+Z$";"Z")|fromdateiso8601) catch null) as $t | {time:($p.interval.endTime//(now|todateiso8601)),value:(if $t==null or now-$t>360 or $t>now+120 then 4 elif ($p.value.int64Value|tonumber)==1 then 1 elif ($p.value.int64Value|tonumber)==0 then 0 else 4 end)} end';
function query(filter,label,{aligner,reducer,selector=numericSelector}={}){
 let url='https://monitoring.googleapis.com/v3/projects/'+PROJECT+'/timeSeries?filter='+encodeURIComponent(filter)+'&interval.startTime='+FROM+'&interval.endTime='+TO+'&pageSize=100000';
 if(aligner)url+='&aggregation.alignmentPeriod=300s&aggregation.perSeriesAligner='+aligner+'&aggregation.crossSeriesReducer='+reducer;
 return {refId:'A',datasource:DS,type:'json',source:'url',parser:'jq-backend',format:'timeseries',url,root_selector:selector,columns:[{text:'Time',selector:'time',type:'timestamp'},{text:label,selector:'value',type:'number'}],url_options:{method:'GET'}};
}
function build(evidence,{uidAvailable=false}={}){
 if(!uidAvailable||evidence.project!==PROJECT||evidence.resourceType!=='cloud_run_revision')throw Error('Confirmed unused dashboard UID and exact metric inventory required');
 const specs=[['run.googleapis.com/request_count','DELTA','INT64','1','ALIGN_SUM','REDUCE_SUM'],['run.googleapis.com/request_latencies','DELTA','DISTRIBUTION','ms','ALIGN_SUM','REDUCE_PERCENTILE_95'],['run.googleapis.com/container/instance_count','GAUGE','INT64','1','ALIGN_MAX','REDUCE_SUM']];
 for(const [type,kind,valueType,unit,aligner,reducer] of specs){const d=evidence.descriptors.find(d=>d.type===type),q=evidence.aggregateQueries.find(q=>q.metric===type);if(!d||d.kind!==kind||d.valueType!==valueType||d.unit!==unit||!q?.queryPassed||q.aligner!==aligner||q.reducer!==reducer||q.period!=='300s')throw Error('Unverified metric aggregation');}
 const d={uid:'mw-pwa-platform',title:'PWA Platform',schemaVersion:41,version:0,editable:false,tags:['mw-credit','resource-monitoring','pwa'],timezone:'Asia/Bangkok',time:{from:'now-24h',to:'now-2m'},refresh:'2m',panels:[],links:[{title:'Performance',type:'link',url:'/d/mw-resource-performance',targetBlank:false},{title:'Cost',type:'link',url:'/d/mw-resource-cost',targetBlank:false}],templating:{list:[]}};
 let id=1,y=0;
 d.panels.push({id:id++,type:'text',title:'Scope and interpretation',gridPos:{x:0,y:y,w:24,h:4},options:{mode:'markdown',content:'Cloud Run platform observations for DEV and PROD, with a two-minute ingestion allowance. Requests and latency use five-minute windows. Empty series means no observed telemetry, not healthy or failed; min-zero workers may be idle. HTTP4xx includes authorization/client rejection, not necessarily a service outage. No latency/error-ratio alert thresholds are introduced. Job completion freshness and notification queue/device delivery are not measured by these charts. Hosting checks are a single Debian vantage, not browser authentication or multi-region availability.'}});y+=4;
 for(const environment of ['prod','dev']){
  d.panels.push({id:id++,type:'row',title:environment.toUpperCase(),collapsed:false,gridPos:{x:0,y,w:24,h:1},panels:[]});y++;
  const h=query('metric.type = "custom.googleapis.com/mw_resource_monitoring/health" AND resource.labels.instance_id = "8223265527494214160" AND metric.labels.component = "pwa_hosting_'+environment+'"','Hosting',{selector:hostingSelector});
  d.panels.push({id:id++,title:environment.toUpperCase()+' canonical Hosting · Debian vantage',type:'stat',description:'Read-only canonical shell and matching build-version entry. Explicit unexpected/failed response Down; absent report or older than6min Unknown. No redirect, login or business request. Collector activation required.',datasource:DS,targets:[h],gridPos:{x:0,y,w:24,h:3},fieldConfig:{defaults:{noValue:'Unknown',mappings:[{type:'value',options:{0:{text:'Down',color:'red'},1:{text:'Reachable',color:'green'},4:{text:'Unknown',color:'gray'}}}]},overrides:[]},options:{reduceOptions:{calcs:['lastNotNull'],fields:'',values:false},colorMode:'background',graphMode:'none'}});y+=3;
  for(const service of ['read','command','jobs','notify']){
   const name='mw-credit-app-'+service+'-'+environment;
   const filter=type=>'metric.type = "'+type+'" AND resource.type = "cloud_run_revision" AND resource.labels.service_name = "'+name+'"';
   const charts=[
    {title:'requests / 5 min',unit:'short',description:'Sum of request counts across revisions. 4xx/client rejection and5xx/server failure are subsets of All; absent subsets remain missing, never fabricated zero.',targets:[['All',''],['4xx',' AND metric.labels.response_code_class = "4xx"'],['5xx',' AND metric.labels.response_code_class = "5xx"']].map(([label,suffix])=>query(filter(specs[0][0])+suffix,label,{aligner:'ALIGN_SUM',reducer:'REDUCE_SUM'}))},
    {title:'request latency p95',unit:'ms',description:'Merge per-series latency distributions per5min with ALIGN_SUM, then REDUCE_PERCENTILE_95 across revisions/codes. No average of percentiles; low-sample values are descriptive, no alert threshold.',targets:[query(filter(specs[1][0]),'p95',{aligner:'ALIGN_SUM',reducer:'REDUCE_PERCENTILE_95'})]},
    {title:'instance peak envelope',unit:'short',description:'Sum of each revision/state series maximum per5min. Upper envelope, not exact simultaneous instance count. Zero/absent instances can be expected for min-zero services.',targets:[query(filter(specs[2][0]),'Peak envelope',{aligner:'ALIGN_MAX',reducer:'REDUCE_SUM'})]}
   ];
   charts.forEach((c,i)=>{c.targets.forEach((q,j)=>q.refId=String.fromCharCode(65+j));d.panels.push({id:id++,title:environment.toUpperCase()+' '+service+' · '+c.title,description:c.description,type:'timeseries',datasource:DS,targets:c.targets,gridPos:{x:i*8,y,w:8,h:7},fieldConfig:{defaults:{unit:c.unit,noValue:'No observed telemetry',min:0,custom:{spanNulls:false,drawStyle:'line'}},overrides:[]},options:{legend:{displayMode:'list',placement:'bottom'},tooltip:{mode:'multi'}}});});y+=7;
  }
 }
 // Agent E: presentation-only refinement; preserve all metric targets and status mappings.
 const overview=d.panels[0];
 overview.description=overview.options.content.replace('HTTP4xx','HTTP 4xx');
 overview.options.content='- **Timing:** 5-minute windows; range ends 2 minutes ago.\n- **Missing \u2260 healthy:** idle workers may have no data. Query errors remain errors.\n- **HTTP 4xx:** may be client/auth rejection. No new alert thresholds.\n- **Limits:** Hosting is one Debian vantage, not login or regional coverage. Job completion and notification delivery are not measured.';
 overview.gridPos.h=8;
 for(const panel of d.panels.slice(1)){
  panel.gridPos.y+=4;
  if(panel.description)panel.description=panel.description.replace('older than6min','older than 6 min').replaceAll('per5min','per 5 min').replace('and5xx','and 5xx').replace('Collector activation required.','Collected by the existing monitoring timer.');
  panel.title=panel.title.replace('canonical Hosting \u00b7 Debian vantage','Hosting \u00b7 single vantage').replace('requests / 5 min','Requests / 5 min').replace('request latency p95','p95 latency (ms)').replace('instance peak envelope','Instance peak envelope');
  if(panel.targets?.length===3){
   panel.fieldConfig.overrides=[['All','blue','solid'],['4xx','orange','dash'],['5xx','red','dots']].map(([name,color,fill])=>({matcher:{id:'byName',options:name},properties:[{id:'color',value:{mode:'fixed',fixedColor:color}},{id:'custom.lineStyle',value:{fill}}]}));
  }
 }
 return d;
}
module.exports={build,numericSelector,hostingSelector};
if(require.main===module){const [input,output,confirmed]=process.argv.slice(2);if(!input||!output||confirmed!=='--uid-confirmed-unused')throw Error('Evidence, output and live unused-UID confirmation required');fs.writeFileSync(output,JSON.stringify(build(JSON.parse(fs.readFileSync(input,'utf8')),{uidAvailable:true}),null,2)+'\n');}
