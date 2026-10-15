// Offline proposals only; IDs/contact/folder must be reconciled before live creation.
const fs=require('fs');
const rows=[
 ['availability','MW | Dots bridge availability','availability','($v==0 or $v==4)','2m','urgent'],
 ['dispatch','MW | Dots bridge dispatch overdue','last_dispatch_completed_at','($v>0 and now-$v>300)','2m','urgent'],
 ['outbox-warning','MW | Dots bridge outbox oldest warning','oldest_pending_seconds','($v>300)','5m','warning'],
 ['outbox-urgent','MW | Dots bridge outbox oldest urgent','oldest_pending_seconds','($v>900)','2m','urgent'],
 ['subscription','MW | Dots expected subscription missing','subscription','($v==0)','5m','urgent'],
 ['renewal','MW | Dots renewal not advancing','renewal','($v==0 or $v==2)','5m','warning'],
 ['delivery','MW | Dots delivery continuity failure','continuity','($v==0)','5m','urgent'],
 ['inspection','MW | Dots bridge telemetry unavailable','inspection_failed','($v==1)','2m','urgent']
];
const rules=rows.map(([uid,title,field,condition,pending,severity])=>{
 const filter='metric.type = "custom.googleapis.com/mw_resource_monitoring/grafana_bridge" AND resource.type = "generic_task" AND resource.labels.task_id = "mw-grafana-events" AND metric.labels.field = "'+field+'"';
 const missing=['availability','dispatch','inspection'].includes(uid);
 const selector='if .nextPageToken then error("Truncated observation") else [.timeSeries[]?.points[]?]|sort_by(.interval.endTime)|last as $p | (try ($p.interval.endTime|sub("[.][0-9]+Z$";"Z")|fromdateiso8601) catch null) as $t | (try ($p.value.int64Value|tonumber) catch null) as $v | {component:"'+uid+'",value:(if $t==null or now-$t>360 or $t-now>120 or $v==null then '+(missing?'1':'0')+' elif '+condition+' then 1 else 0 end)} end';
 const model={refId:'A',datasource:{type:'yesoreyeram-infinity-datasource',uid:'mw-gcp-monitoring'},type:'json',source:'url',parser:'jq-backend',format:'table',url:'https://monitoring.googleapis.com/v3/projects/clever-oasis-508610-n7/timeSeries?filter='+encodeURIComponent(filter)+'&interval.startTime=${__timeFrom:date:iso}&interval.endTime=${__timeTo:date:iso}&pageSize=100000',url_options:{method:'GET'},root_selector:selector,columns:[{text:'component',selector:'component',type:'string'},{text:'value',selector:'value',type:'number'}]};
 return {uid:'mw-dots-'+uid,title,folderUID:'REPLACE_WITH_VERIFIED_FOLDER_UID',ruleGroup:'Performance 2m',condition:'C',for:pending,isPaused:true,noDataState:missing?'Alerting':'KeepLast',execErrState:missing?'Alerting':'KeepLast',labels:{monitoring_path:'grafana_dots_bridge',severity},annotations:{summary:title+'; independent IRM route. Do not replay deliveries or change subscriptions automatically.'},notification_settings:{receiver:'MW Bridge IRM',group_by:['grafana_folder','alertname','component']},data:[{refId:'A',relativeTimeRange:{from:600,to:0},datasourceUid:'mw-gcp-monitoring',model},{refId:'B',relativeTimeRange:{from:0,to:0},datasourceUid:'__expr__',model:{refId:'B',type:'reduce',expression:'A',reducer:'last',settings:{mode:'strict'}}},{refId:'C',relativeTimeRange:{from:0,to:0},datasourceUid:'__expr__',model:{refId:'C',type:'threshold',expression:'B',conditions:[{evaluator:{type:'gt',params:[0]},operator:{type:'and'},reducer:{type:'last'},type:'query'}]}}]};
});
if(require.main===module)fs.writeFileSync(process.argv[2],JSON.stringify(rules,null,2)+'\n');
module.exports={rules};
