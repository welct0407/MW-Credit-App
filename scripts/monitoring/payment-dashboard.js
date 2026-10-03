/* Pure scoped dashboard patch, shared by the builder and live UI preparation. */
function addPaymentMonitoring(input, selectors) {
  const d=JSON.parse(JSON.stringify(input)),v2=!!d.spec?.elements;
  const title='Payment processing — Instagram to recorded payment';
  const copy=x=>JSON.parse(JSON.stringify(x));
  const source=id=>v2?d.spec.elements['panel-'+id]:d.panels.find(p=>p.id===id);
  const ds='yesoreyeram-infinity-datasource';
  const url=(metric,extra='')=>'https://monitoring.googleapis.com/v3/projects/clever-oasis-508610-n7/timeSeries?filter='+encodeURIComponent('metric.type = "custom.googleapis.com/mw_resource_monitoring/'+metric+'" AND resource.labels.instance_id = "8223265527494214160"'+extra)+'&interval.startTime=${__timeFrom:date:iso}&interval.endTime=${__timeTo:date:iso}&pageSize=100000';
  const query=(metric,selector,columns,extra='',format='table')=>({type:'json',source:'url',parser:'jq-backend',format,url:url(metric,extra),url_options:{method:'GET'},root_selector:selector,columns});
  const col=(text,type,selector)=>({text,type,selector});
  const fields=(a)=>selectors.snapshot.replace('__FIELDS__',JSON.stringify(a.map(([key,label])=>({key,label}))));
  const nullMap={type:'special',options:{match:'null',result:{text:'Unavailable',color:'gray'}}};
  const defaults={unit:'short',decimals:0,noValue:'Unavailable',mappings:[nullMap],color:{mode:'fixed',fixedColor:'blue'}};
  const options={colorMode:'value',graphMode:'none',justifyMode:'center',orientation:'horizontal',textMode:'value_and_name',wideLayout:true,reduceOptions:{calcs:['last'],fields:'',values:false},text:{titleSize:13,valueSize:30}};
  const warning=name=>({matcher:{id:'byName',options:name},properties:[{id:'color',value:{mode:'thresholds'}},{id:'thresholds',value:{mode:'absolute',steps:[{value:null,color:'green'},{value:1,color:'red'}]}}]});
  const panel=(id,name,qs,description,overrides=[],type='stat')=>({id,title:name,type,description:description+' Current snapshots update about every 2 minutes; missing, mismatched or older-than-6-minute samples show Unavailable. Historical ranges excluding current telemetry do not show current counts.',datasource:{type:ds,uid:'mw-gcp-monitoring'},targets:qs.map((q,i)=>({...q,refId:String.fromCharCode(65+i),datasource:{type:ds,uid:'mw-gcp-monitoring'}})),transformations:[],fieldConfig:{defaults:copy(defaults),overrides},options:copy(options)});
  const q=a=>query('receipt_pipeline','[ '+fields(a)+' ] | map({key:.key,value:.value}) | from_entries',a.map(([key,label])=>col(label,'number',key)));
  const panels=[];
  // Reuse the polling metric while showing completion time beside the status.
  const scan=copy(source(63));
  const sp=v2?scan.spec:scan;
  sp.id=101;sp.title='1 · Group scanning';
  const sv=v2?sp.vizConfig.spec:sp;
  sv.fieldConfig.defaults.displayName='API polling';sv.options.text={titleSize:13,valueSize:30};
  const sq=v2?sp.data.spec.queries[0].spec.query.spec:sp.targets[0];
  sq.root_selector=selectors.groupScanning;
  sv.options.orientation='horizontal';
  sv.options.wideLayout=true;
  sv.fieldConfig.overrides=[{matcher:{id:'byName',scope:'series',options:'Last scan completion'},properties:[
    {id:'displayName',value:'Last scan · SGT'},
    {id:'unit',value:'time:DD MMM HH:mm'},
    {id:'noValue',value:'Unavailable'}
  ]}];
  sp.description='Instagram group-chat scan and last completion time in Singapore. The scan runs five minutes after the previous completion; downstream Receipts is a separate worker. Timing updates about every two minutes; missing or stale timing shows Unavailable. Hover the status for worker state and schedule details.';
  const healthSelector='[.timeSeries[]?.points[]?]|sort_by(.interval.endTime)|last as $p | (try ($p.interval.endTime|sub("[.][0-9]+Z$";"Z")|fromdateiso8601) catch null) as $t | (try ($p.value.int64Value|tonumber) catch null) as $v | {name:"Receipt workflow",value:(if $t!=null and now-$t<=360 and $t-now<=120 and ($v|IN(0,1,2,3,4)) then $v else 4 end)}';
  const hp=panel(102,'Pipeline health',[query('health',healthSelector,[col('Name','string','name'),col('Value','number','value')],' AND metric.labels.component = "receipts"')],'Service health plus receipt intake, required review/hold attention and posting health. Optional Partner result failures remain visible in Notification failures without degrading this status. Degraded may mean overdue reviewer action, not a stopped worker.');
  hp.fieldConfig.defaults.mappings=[{type:'value',options:Object.fromEntries(['Down','Healthy','Degraded','Paused','Unknown'].map((text,i)=>[i,{text,color:['red','green','orange','blue','gray'][i]}]))}];
  hp.fieldConfig.defaults.displayName='Receipt workflow';
  panels.push(hp);
  panels.push(panel(103,'2 · Receipt extraction',[q([['pending_images','Images waiting'],['oldest_pending_seconds','Oldest wait'],['stalled_jobs','Stalled work']])],'Images await extraction/retry; zero means an observed empty queue. Stalled work also includes delayed routing/execution.',[warning('Stalled work'),{matcher:{id:'byName',options:'Oldest wait'},properties:[{id:'unit',value:'s'}]}]));
  panels.push(panel(104,'3 · Validation',[q([['validated_receipts','Ready to route'],['held_receipts','Manual holds'],['unnotified_holds','Unnotified holds']])],'Manual holds cannot be approved as executable proposals. Already notified holds remain visible without making health fail.',[warning('Unnotified holds')]));
  panels.push(panel(105,'4 · Reviewer decisions',[q([['pending_reviews','Awaiting reply'],['overdue_reviews','Overdue > 2h']])],'Use a direct reply to the accepted IG review request. Normal waiting is not failure; email is informational only.',[warning('Overdue > 2h')]));
  panels.push(panel(106,'5 · Payment posting',[q([['approved_payments','Awaiting posting'],['unconfirmed_postings','Reconcile; do not retry'],['completed_payments','Recorded · retained total']])],'UNKNOWN/POSTING requires reconciliation, never repeat Add. Recorded is retained journal history, not payments today.',[warning('Reconcile; do not retry')]));
  panels.push(panel(107,'6 · Notification failures',[q([['failed_notifications','Partner results'],['unnotified_holds','Hold alerts'],['undelivered_reviews','Review requests']])],'Undelivered work older than 5 minutes. Partner results are optional and remain visible without degrading processing health. Hold alerts and required review requests still affect processing health. IG first, email backup; acceptance does not prove human reading. Counts may overlap other cards.',['Partner results','Hold alerts','Review requests'].map(warning)));
  const trendFields=[['pending_images','Images waiting'],['held_receipts','Manual holds'],['pending_reviews','Awaiting review'],['unconfirmed_postings','Unconfirmed posting']];
  const trend=panel(108,'Queue length over time',trendFields.map(([key,label])=>query('receipt_pipeline',selectors.trend,[col('Time','timestamp','time'),col(label,'number','value')],' AND metric.labels.field = "'+key+'"','timeseries')),'Snapshot counts over the selected range; stages/error counts must not be added together.',[],'timeseries');
  trend.fieldConfig.defaults={unit:'short',decimals:0,min:0,color:{mode:'palette-classic'},custom:{drawStyle:'line',lineInterpolation:'stepAfter',lineWidth:2,fillOpacity:8,showPoints:'auto',spanNulls:false}};
  trend.options={tooltip:{mode:'multi',sort:'desc'},legend:{showLegend:true,displayMode:'list',placement:'bottom'}};
  panels.push(trend);
  // Wide numeric frames keep each stage measure visible without reducing rows together.
  for(const p of panels)p.transformations=[];
  const positions=[[101,0,0,6,5],[102,6,0,6,5],[103,12,0,6,5],[104,18,0,6,5],[105,0,5,8,5],[106,8,5,8,5],[107,16,5,8,5],[108,0,10,24,7]];
  if(v2){
    d.spec.elements['panel-101']=scan;
    for(const p of panels){
      d.spec.elements['panel-'+p.id]={kind:'Panel',spec:{id:p.id,title:p.title,description:p.description,links:[],data:{kind:'QueryGroup',spec:{queries:p.targets.map(t=>{const {datasource,refId,...s}=t;return {kind:'PanelQuery',spec:{refId,hidden:false,query:{kind:'DataQuery',group:ds,version:'v0',datasource:{name:datasource.uid},spec:s}}}}),transformations:p.transformations.map(t=>({kind:'Transformation',group:t.id,spec:{options:t.options}})),queryOptions:{}}},vizConfig:{kind:'VizConfig',group:p.type,version:sp.vizConfig.version,spec:{fieldConfig:p.fieldConfig,options:p.options}}}};
    }
    d.spec.layout.spec.rows=d.spec.layout.spec.rows.filter(r=>r.spec.title!==title);
    d.spec.layout.spec.rows.splice(1,0,{kind:'RowsLayoutRow',spec:{title,collapse:false,hideHeader:false,layout:{kind:'GridLayout',spec:{items:positions.map(([id,x,y,width,height])=>({kind:'GridLayoutItem',spec:{x,y,width,height,element:{kind:'ElementReference',name:'panel-'+id}}}))}}}});
  }else{
    const old=d.panels.find(p=>p.id===100);
    if(!old){for(const p of d.panels){if(p.gridPos.y>=17)p.gridPos.y+=18;}}
    d.panels=d.panels.filter(p=>p.id<100||p.id>108);
    d.panels.push({id:100,type:'row',title,collapsed:false,panels:[],gridPos:{x:0,y:17,w:24,h:1}},scan,...panels);
    for(const [id,x,y,w,h] of positions)d.panels.find(p=>p.id===id).gridPos={x,y:y+18,w,h};
    d.panels.sort((a,b)=>a.gridPos.y-b.gridPos.y||a.gridPos.x-b.gridPos.x);
  }
  return d;
}
if(typeof module!=='undefined')module.exports={addPaymentMonitoring};
if(typeof require!=='undefined' && require.main===module){
  const fs=require('fs'),path=require('path');
  const [input,output]=process.argv.slice(2);
  const selectors={snapshot:fs.readFileSync(path.join(__dirname,'receipt-pipeline.jq'),'utf8'),trend:fs.readFileSync(path.join(__dirname,'receipt-trend.jq'),'utf8'),groupScanning:fs.readFileSync(path.join(__dirname,'group-scanning.jq'),'utf8')};
  fs.writeFileSync(output,JSON.stringify(addPaymentMonitoring(JSON.parse(fs.readFileSync(input,'utf8')),selectors),null,2)+'\n');
}
