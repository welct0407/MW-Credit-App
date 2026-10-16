/* Dashboard-only preparation: apply solely to a fresh parent-verified v2 export. */
const fs=require('node:fs');
const METRIC='compute.googleapis.com/instance/uptime_total';
const PROJECT='clever-oasis-508610-n7',INSTANCE='8223265527494214160';
const selector=`if .error then error("Uptime query failed") elif .nextPageToken then error("Truncated uptime response") else
  (.timeSeries // []) as $series |
  if ($series|length)>1 then error("Ambiguous VM uptime series")
  elif ($series|length)==0 then {Uptime:null}
  elif $series[0].metric.type!="${METRIC}" or
    $series[0].resource.type!="gce_instance" or
    $series[0].resource.labels.project_id!="${PROJECT}" or
    $series[0].resource.labels.instance_id!="${INSTANCE}" or
    $series[0].resource.labels.zone!="asia-southeast1-a"
  then error("Unexpected uptime resource") else
    [$series[0].points[]?] | sort_by(.interval.endTime) | last as $p |
    (try ($p.interval.endTime|sub("[.][0-9]+Z$";"Z")|fromdateiso8601) catch null) as $t |
    (try ($p.value.int64Value|tonumber) catch null) as $v |
    {Uptime:(if $t!=null and now-$t<=360 and $t-now<=120 and
      $v!=null and ($v|type)=="number" and $v>=0 and ($v|floor)==$v
      then $v else null end)}
  end end`;
const display=` | . + {UptimeText:(if .Uptime==null then null else
  (.Uptime/60|floor) as $m | (($m/1440|floor)|tostring)+"d "+
  ("0"+((($m%1440)/60|floor)|tostring)|.[-2:])+"h "+
  ("0"+(($m%60)|tostring)|.[-2:])+"m" end)}`;
const sqlSelector=`if .error then error("SQL uptime query failed") elif .nextPageToken then error("Truncated SQL uptime response") else
  (.timeSeries // []) as $s |
  if any($s[]; .metric.type!="custom.googleapis.com/mw_resource_monitoring/worker_timing" or
      .metric.labels.component!="cloud_sql_prod" or .resource.type!="gce_instance" or
      .resource.labels.project_id!="${PROJECT}" or .resource.labels.instance_id!="${INSTANCE}" or
      .resource.labels.zone!="asia-southeast1-a" or
      (.metric.labels.field!="status" and .metric.labels.field!="uptime_seconds"))
  then error("Unexpected SQL uptime resource") else
    [$s[]|{field:.metric.labels.field,p:(.points|sort_by(.interval.endTime)|last)}] as $rows |
    if ([$rows[]|.field]|unique|length)!=($rows|length) then error("Ambiguous SQL uptime fields") else
      ($rows|map(select(.field=="status"))|first|.p) as $p |
      ($rows|map(select(.field=="uptime_seconds"))|first|.p) as $u |
      (try ($p.interval.endTime|sub("[.][0-9]+Z$";"Z")|fromdateiso8601) catch null) as $t |
      (try ($p.value.int64Value|tonumber) catch null) as $status |
      (try ($u.value.int64Value|tonumber) catch null) as $v |
      {Uptime:(if $t!=null and now-$t<=360 and $t-now<=120 and $status==1 and
        $u.interval.endTime==$p.interval.endTime and $v!=null and $v>=0 and ($v|floor)==$v
        then $v else null end)}
    end
  end end`;
function query(metricFilter,root){
 return {refId:'A',hidden:false,query:{kind:'DataQuery',group:'yesoreyeram-infinity-datasource',version:'v0',datasource:{name:'mw-gcp-monitoring'},spec:{type:'json',source:'url',parser:'jq-backend',format:'table',url:'https://monitoring.googleapis.com/v3/projects/'+PROJECT+'/timeSeries?filter='+encodeURIComponent(metricFilter)+'&interval.startTime=${__timeFrom:date:iso}&interval.endTime=${__timeTo:date:iso}&pageSize=100000',url_options:{method:'GET'},root_selector:root+display,columns:[{text:'Uptime',selector:'UptimeText',type:'string'}]}}};
}
function debianQuery(){
 const filter=`metric.type = "${METRIC}" AND resource.type = "gce_instance" AND resource.labels.project_id = "${PROJECT}" AND resource.labels.instance_id = "${INSTANCE}" AND resource.labels.zone = "asia-southeast1-a"`;
 return query(filter,selector);
}
function sqlQuery(){return query('metric.type = "custom.googleapis.com/mw_resource_monitoring/worker_timing" AND metric.labels.component = "cloud_sql_prod" AND resource.type = "gce_instance" AND resource.labels.project_id = "'+PROJECT+'" AND resource.labels.instance_id = "'+INSTANCE+'" AND resource.labels.zone = "asia-southeast1-a"',sqlSelector);}
function patchDebian(input){
 const d=structuredClone(input);
 if(d.metadata?.name!=='mw-resource-performance'||d.spec?.timeSettings?.timezone!=='Asia/Singapore')throw Error('Verify dashboard identity/timezone');
 if(Object.keys(d.spec.elements).length!==69||d.spec.elements['panel-128']||d.spec.elements['panel-129'])throw Error('Fresh 69-element baseline required; reconcile existing IDs');
 const row=d.spec.layout.spec.rows[0],items=row?.spec.layout.spec.items;
 if(row?.spec.layout.kind!=='GridLayout')throw Error('Unsupported overview layout');
 const delivery=items.find(x=>x.spec.element.name==='panel-127')?.spec;
 if(!delivery||delivery.x!==16||delivery.y!==18||delivery.width!==4||delivery.height!==4)throw Error('Delivery layout changed; reconcile placement');
 const slot={x:20,y:17,width:2,height:5};
 for(const {spec:p}of items)if(p.x<slot.x+slot.width&&p.x+p.width>slot.x&&p.y<slot.y+slot.height&&p.y+p.height>slot.y)throw Error('Uptime slot occupied');
 const prototype=d.spec.elements['panel-121']?.spec.vizConfig;
 if(prototype?.group!=='stat')throw Error('Missing current stat prototype');
 const viz=structuredClone(prototype);
 viz.spec.fieldConfig={defaults:{displayName:'Debian uptime',unit:'string',min:0,decimals:0,noValue:'Unknown',mappings:[],color:{mode:'fixed',fixedColor:'blue'}},overrides:[]};
 viz.spec.options={...viz.spec.options,orientation:'vertical',textMode:'value_and_name',graphMode:'none',colorMode:'value',justifyMode:'center',text:{titleSize:12,valueSize:18},reduceOptions:{calcs:['last'],fields:'',values:false}};
 d.spec.elements['panel-128']={kind:'Panel',spec:{id:128,title:'',description:'Debian VM elapsed time since Compute Engine VM start, seconds, sampled every60s with up to120s visibility delay. Uses uptime_total GAUGE, not uptime DELTA or agent lifetime; not a service-availability percentage or guaranteed guest-reboot age. Freshness limit6min, future tolerance2min. Missing/invalid/stale samples are Unknown; errors remain visible. Raw latest sample, no extrapolation. Historical ranges excluding fresh data are Unknown. Resource vm-mw-credit-agent, Asia/Singapore dashboard.',links:[],data:{kind:'QueryGroup',spec:{queries:[{kind:'PanelQuery',spec:debianQuery()}],transformations:[],queryOptions:{}}},vizConfig:viz}};
 items.push({kind:'GridLayoutItem',spec:{...slot,element:{kind:'ElementReference',name:'panel-128'}}});
 return d;
}
function patchSql(input){
 const d=structuredClone(input);
 if(d.metadata?.name!=='mw-resource-performance'||d.spec?.timeSettings?.timezone!=='Asia/Singapore'||Object.keys(d.spec.elements).length!==70||d.spec.elements['panel-129'])throw Error('Fresh saved70-element Performance baseline required');
 const items=d.spec.layout.spec.rows[0].spec.layout.spec.items;
 const vm=d.spec.elements['panel-128'];
 if(!vm||!items.some(x=>x.spec.element.name==='panel-128'&&x.spec.x===20&&x.spec.y===17&&x.spec.width===2&&x.spec.height===5))throw Error('Reconcile saved Debian uptime tile first');
 const slot={x:22,y:17,width:2,height:5};
 for(const {spec:p} of items)if(p.x<24&&p.x+p.width>22&&p.y<22&&p.y+p.height>17)throw Error('SQL uptime slot occupied');
 const panel=structuredClone(vm);panel.spec.id=129;panel.spec.title='';panel.spec.links=[];
 panel.spec.description='PostgreSQL server uptime for shared PROD and DEV Cloud SQL instance mw-credit-pg-20261017. Read through the existing least-privilege reporting connection to loan_manager_prod and Cloud SQL Auth Proxy. Elapsed seconds since pg_postmaster_start_time(), resetting on server restart or failover; not Cloud SQL allocation age or an availability percentage. Existing Debian collector cadence is 120 seconds after completion. Fresh successful status and uptime must share a timestamp; older than 6 minutes, more than 2 minutes future, missing, invalid or failed observations are Unknown. Errors remain visible. Display floors to whole minutes as days, hours and minutes; raw seconds retained internally. No extrapolation.';
 panel.spec.data.spec.queries=[{kind:'PanelQuery',spec:sqlQuery()}];panel.spec.data.spec.transformations=[];
 panel.spec.vizConfig.spec.fieldConfig.defaults.displayName='Cloud SQL uptime';panel.spec.vizConfig.spec.fieldConfig.defaults.unit='string';panel.spec.vizConfig.spec.fieldConfig.defaults.noValue='Unknown';
 panel.spec.vizConfig.spec.options.text={titleSize:12,valueSize:18};panel.spec.vizConfig.spec.options.reduceOptions={calcs:['last'],fields:'',values:false};
 d.spec.elements['panel-129']=panel;items.push({kind:'GridLayoutItem',spec:{...slot,element:{kind:'ElementReference',name:'panel-129'}}});return d;
}
function patchSaved(input){
 const d=structuredClone(input),vm=d.spec?.elements?.['panel-128'];
 if(!vm)throw Error('Saved Debian tile required');
 const q=vm.spec.data.spec.queries[0].spec.query.spec;
 if(q.root_selector.includes('UptimeText'))throw Error('Formatter already installed; use fresh baseline and reconcile');
 q.root_selector+=display;q.columns=[{text:'Uptime',selector:'UptimeText',type:'string'}];
 vm.spec.vizConfig.spec.fieldConfig.defaults.unit='string';
 vm.spec.description=vm.spec.description.replace('days, hours, minutes and seconds','days, hours and minutes')+' Display floors to whole minutes; raw seconds retained internally.';
 return patchSql(d);
}
function patchInfrastructure(input){
 const d=patchSaved(input),items=d.spec.layout.spec.rows[0].spec.layout.spec.items;
 if(d.spec.elements['panel-130'])throw Error('Infrastructure header ID occupied');
 // The browser-verified inline Stat header matches the current compact headers.
 // Keep its exact saved definition, including the existing datasource reference.
 const header=structuredClone(require('../../outputs/grafana-infrastructure-uptime-20261005/saved-uptime-panels.json').elements['panel-130']);
 d.spec.elements['panel-130']=header;
 for(const [id,x,label]of [[128,20,'Debian VM'],[129,22,'Cloud SQL']]){
  const item=items.find(i=>i.spec.element.name===`panel-${id}`);
  Object.assign(item.spec,{x,y:18,width:2,height:4});
  d.spec.elements[`panel-${id}`].spec.vizConfig.spec.fieldConfig.defaults.displayName=label;
  d.spec.elements[`panel-${id}`].spec.vizConfig.spec.options.reduceOptions={calcs:['last'],fields:'/.*/',values:true};
 }
 items.push({kind:'GridLayoutItem',spec:{x:20,y:17,width:4,height:1,element:{kind:'ElementReference',name:'panel-130'}}});
 return d;
}
module.exports={debianQuery,sqlQuery,patchDebian,patchSql,patchSaved,patchInfrastructure,selector,sqlSelector,display};
if(require.main===module){
 const [input,output]=process.argv.slice(2);
 if(!input||!output)throw Error('Usage: node uptime-dashboard.js fresh-v2.json patched-v2.json');
 fs.writeFileSync(output,JSON.stringify(patchInfrastructure(JSON.parse(fs.readFileSync(input))),null,2)+'\n');
}
