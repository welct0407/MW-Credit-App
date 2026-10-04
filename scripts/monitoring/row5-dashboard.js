/* Scoped classic/v2 patch. Always apply to fresh live exports for publication. */
const fs=require('fs'),path=require('path');
const DS='yesoreyeram-infinity-datasource',MARK='row5-bridge-vm01-v1';
const copy=x=>JSON.parse(JSON.stringify(x));
function patch(input,page,options={}){
 const d=copy(input),v2=!!d.spec?.elements;
 const spec=v2?d.spec:d;
 if((v2?d.metadata.name:d.uid)!=='mw-resource-'+page)throw Error('Unexpected dashboard identity');
 if((v2?spec.timeSettings?.timezone:spec.timezone)!=='Asia/Singapore')throw Error('Verify business timezone before patch');
 const all=v2?Object.values(spec.elements).filter(x=>x.kind==='Panel').map(x=>x.spec):spec.panels;
 const reserved=page==='performance'?[120,121,122,123,124,125,126,127]:[110];
 for(const p of all)if(reserved.includes(p.id)&&!p.description?.includes(MARK))throw Error('Reserved ID collision: '+p.id);
 const mappings=[{type:'value',options:Object.fromEntries(['Down','Healthy','Degraded','Paused','Unknown'].map((text,i)=>[i,{text,color:['red','green','orange','blue','gray'][i]}]))}];
 const panel=(id,title,type,description,targets=[],options={},defaults={})=>({id,title,type,description:MARK+' · '+description,targets,transformations:[],options,fieldConfig:{defaults,overrides:[]}});
 const inline=(id,title,text)=>panel(id,title,'text',text,[],{mode:'markdown',content:text});
 const positions=[];const added=[];
 if(page==='performance'){
  added.push(inline(120,'GRAFANA → DOTS · BRIDGE','Availability · dispatch · durable outbox. Independent IRM rule installation pending approval.'));
  added.push(inline(124,'SUBSCRIPTION · AUTH · DELIVERY','Expected subscriptions · renewal authority · delivery continuity. Expected state remains Unknown until verified.'));
  for(const [id,title,key] of [[121,'Bridge availability','availability'],[122,'Dispatch completion','dispatch'],[123,'Outbox age','outbox'],[125,'Expected subscriptions','subscription'],[126,'Renewal / grant authority','renewal'],[127,'Delivery continuity','continuity']]){
   const mixed=[123,125,126,127].includes(id);
   const field=key==='dispatch'?'last_dispatch_completed_at':key;
   const filter='metric.type = "custom.googleapis.com/mw_resource_monitoring/grafana_bridge" AND resource.type = "generic_task" AND resource.labels.task_id = "mw-grafana-events" AND metric.labels.field = "'+field+'"';
   let selector='if .nextPageToken then error("Truncated bridge observation") else [.timeSeries[]?.points[]?]|sort_by(.interval.endTime)|last as $p | (try ($p.interval.endTime|sub("[.][0-9]+Z$";"Z")|fromdateiso8601) catch null) as $t | (try ($p.value.int64Value|tonumber) catch null) as $v | {Status:(if $t!=null and now-$t<=360 and $t-now<=120 and ($v|IN(0,1,2,3,4)) then $v else 4 end)} end';
   if(key==='dispatch')selector=selector.replace('($v|IN(0,1,2,3,4)) then $v','($v!=null and $v>0 and $v<=now+120) then (if now-$v>300 then 0 else 1 end)');
   const target={refId:'A',datasource:{type:DS,uid:'mw-gcp-monitoring'},type:'json',source:'url',parser:'jq-backend',format:'table',url:'https://monitoring.googleapis.com/v3/projects/clever-oasis-508610-n7/timeSeries?filter='+encodeURIComponent(filter)+'&interval.startTime=${__timeFrom:date:iso}&interval.endTime=${__timeTo:date:iso}&pageSize=100000',url_options:{method:'GET'},root_selector:selector,columns:[{text:'Status',selector:'Status',type:'number'}]};
   added.push(panel(id,title,'stat','Availability means app/owner accessible during successful natural dispatch; absence becomes Unknown. Counts are uncapped Firestore aggregates; terminal failures are retained attention items (up to 31 days), not failures today. Missing/stale samples are Unknown; query errors remain visible. No event received alone is not failure. Normal five-minute access tokens are not failure. Subscription/renewal is Unknown until expected membership and grant metadata are verified. Continuity reports retained failure/backlog status; it does not prove owner-visible receipt.',[target],{colorMode:'value',graphMode:'none',justifyMode:'center',orientation:'horizontal',textMode:'value',reduceOptions:{calcs:['last'],fields:'',values:false}},mixed?{mappings:[],noValue:'Unknown',decimals:0,unit:'short',color:{mode:'fixed',fixedColor:'blue'}}:{mappings,noValue:'Unknown',decimals:0}));
   if(mixed)added[added.length-1].fieldConfig.overrides.push({matcher:{id:'byRegexp',options:'^(?:[A-Z] )?Status$'},properties:[{id:'mappings',value:mappings},{id:'unit',value:'none'},{id:'color',value:{mode:'thresholds'}}]});
  }
  // Numeric detail fields keep queue age/count and authority deadlines visible.
  for(const [id,field,label,unit] of [[123,'pending_count','Pending deliveries','short'],[123,'oldest_pending_seconds','Oldest pending','s'],[125,'active_expected_count','Active expected','short'],[125,'expected_count','Expected','short'],[126,'subscription_seconds_remaining','Subscription remaining','s'],[126,'grant_seconds_remaining','Grant remaining','s'],[127,'failed_count','Terminal failures · retained','short']]){
   const p=added.find(x=>x.id===id),q=copy(p.targets[0]);
   q.refId=String.fromCharCode(65+p.targets.length);
   const f='metric.type = "custom.googleapis.com/mw_resource_monitoring/grafana_bridge" AND resource.type = "generic_task" AND resource.labels.task_id = "mw-grafana-events" AND metric.labels.field = "'+field+'"';
   q.url=q.url.replace(/filter=[^&]+/,'filter='+encodeURIComponent(f));
   q.root_selector='if .nextPageToken then error("Truncated bridge observation") else [.timeSeries[]?.points[]?]|sort_by(.interval.endTime)|last as $p | (try ($p.interval.endTime|sub("[.][0-9]+Z$";"Z")|fromdateiso8601) catch null) as $t | (try ($p.value.int64Value|tonumber) catch null) as $v | {Value:(if $t!=null and now-$t<=360 and $t-now<=120 and $v!=null and $v>=0 then $v else null end)} end';
   q.columns=[{text:label,selector:'Value',type:'number'}];p.targets.push(q);
   p.options.textMode='value_and_name';p.options.wideLayout=true;
   p.fieldConfig.overrides.push({matcher:{id:'byRegexp',options:'^(?:[A-Z] )?'+label.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'$'},properties:[{id:'unit',value:unit},{id:'mappings',value:[]},{id:'noValue',value:'Unknown'},{id:'color',value:{mode:'fixed',fixedColor:'blue'}}]});
  }
  positions.push([120,0,17,12,1],[124,12,17,12,1],[121,0,18,4,4],[122,4,18,4,4],[123,8,18,4,4],[125,12,18,4,4],[126,16,18,4,4],[127,20,18,4,4]);
 }else{
  // Reuse the existing passive Azure monitoring route; never use the controller.
  const t={url:options.azureVmMetricsUrl};
  if(!t?.url?.startsWith('https://management.azure.com/')||!t.url.includes('/providers/Microsoft.Compute/virtualMachines/VM-01/'))throw Error('Missing verified passive VM-01 query binding');
  const prefix=t.url.split('/providers/microsoft.insights/metrics?')[0];
  const q={refId:'A',datasource:{type:DS,uid:'mw-azure-monitoring'},type:'json',source:'url',parser:'jq-backend',format:'table',url:prefix+'/providers/microsoft.insights/metrics?api-version=2023-10-01&metricnames=VmAvailabilityMetric&timespan=${__timeFrom:date:iso}/${__timeTo:date:iso}&interval=PT1M&aggregation=Average&AutoAdjustTimegrain=false',url_options:{method:'GET'},root_selector:fs.readFileSync(path.join(__dirname,'azure-daily-availability.jq'),'utf8').replace('__FROM_MS__','${__from}').replace('__TO_MS__','${__to}'),columns:[{text:'Day',selector:'Day',type:'string'},...['Observed available hours','Unknown hours','Coverage percent'].map(text=>({text,selector:text,type:'number'}))]};
  const p=panel(110,'VM-01 · observed running & available hours by day','barchart','Passive Azure VmAvailabilityMetric, PT1M Average. Singapore calendar days; selected partial days are clipped. Observed hours are a lower bound when coverage has gaps. Null is unknown, including portal/CLI deallocation; never treated as off. Zero is unavailable, not proof of deallocation. Not billable allocated hours or exact power-state runtime. Retention 93 days; select at most 31 days per request. Minute resolution; transitions inside a bucket are averaged. Live source/query verification pending.',[q],{xField:'Day',orientation:'vertical',showValue:'auto',stacking:'none',tooltip:{mode:'multi'},legend:{showLegend:true,placement:'bottom'}},{unit:'suffix:h',decimals:2,min:0,noValue:'Unknown',color:{mode:'palette-classic'}});
  p.fieldConfig.overrides=[{matcher:{id:'byName',options:'Coverage percent'},properties:[{id:'custom.hideFrom',value:{viz:true,legend:true,tooltip:false}},{id:'unit',value:'percent'}]},{matcher:{id:'byName',options:'Unknown hours'},properties:[{id:'color',value:{mode:'fixed',fixedColor:'gray'}}]}];
  added.push(p);
 }
 const toV2=p=>({kind:'Panel',spec:{id:p.id,title:p.title,description:p.description,links:[],data:{kind:'QueryGroup',spec:{queries:p.targets.map(t=>{const {datasource,refId,...s}=t;return {kind:'PanelQuery',spec:{refId,hidden:false,query:{kind:'DataQuery',group:DS,version:'v0',datasource:{name:datasource.uid},spec:s}}}}),transformations:[],queryOptions:{}}},vizConfig:{kind:'VizConfig',group:p.type,version:all.find(x=>x.vizConfig)?.vizConfig.version||'v0',spec:{options:p.options,fieldConfig:p.fieldConfig}}}});
 if(v2){
  const rows=spec.layout?.spec?.rows;if(!rows)throw Error('Unsupported layout');
  const row=page==='performance'?rows[0]:rows.find(r=>r.spec.title.startsWith('Azure ·'));
  if(!row||row.spec.layout.kind!=='GridLayout')throw Error('Unsupported target row');
  const items=row.spec.layout.spec.items;
  const fresh=items.filter(x=>!reserved.includes(Number(x.spec.element.name.replace('panel-',''))));
  if(page==='performance'&&fresh.some(x=>x.spec.y+x.spec.height>17))throw Error('Fresh overview extends into proposed row5; reconcile layout');
  if(page==='cost')positions.push([110,0,Math.max(0,...fresh.map(x=>x.spec.y+x.spec.height)),24,8]);
  for(const p of added)spec.elements['panel-'+p.id]=toV2(p);
  row.spec.layout.spec.items=[...fresh,...positions.map(([id,x,y,width,height])=>({kind:'GridLayoutItem',spec:{x,y,width,height,element:{kind:'ElementReference',name:'panel-'+id}}}))];
 }else{
  const already=spec.panels.some(p=>reserved.includes(p.id));
  spec.panels=spec.panels.filter(p=>!reserved.includes(p.id));
  if(page==='performance'){
   if(!already){if(spec.panels.some(p=>p.type!=='row'&&p.gridPos.y<17&&p.gridPos.y+p.gridPos.h>17))throw Error('Overview collision');for(const p of spec.panels)if(p.gridPos.y>=17)p.gridPos.y+=5;}
  }else{
   const row=spec.panels.find(p=>p.type==='row'&&p.title.startsWith('Azure ·'));
   if(!row)throw Error('Missing Azure row');
   const next=spec.panels.filter(p=>p.type==='row'&&p.gridPos.y>row.gridPos.y).sort((a,b)=>a.gridPos.y-b.gridPos.y)[0];
   const y=next?.gridPos.y??Math.max(...spec.panels.map(p=>p.gridPos.y+p.gridPos.h));
   if(!already)for(const p of spec.panels)if(p.gridPos.y>=y)p.gridPos.y+=8;
   // Existing chart position on repeat is recovered from the previous input.
   positions.push([110,0,already?input.panels.find(p=>p.id===110).gridPos.y:y,24,8]);
  }
  for(const [id,x,y,w,h] of positions)added.find(p=>p.id===id).gridPos={x,y,w,h};
  spec.panels.push(...added);spec.panels.sort((a,b)=>a.gridPos.y-b.gridPos.y||a.gridPos.x-b.gridPos.x);
 }
 return d;
}
module.exports={patch};
if(require.main===module){const [page,input,output,performance]=process.argv.slice(2);if(!['performance','cost'].includes(page)||!input||!output)throw Error('Usage: row5-dashboard.js performance|cost fresh.json output.json');let options={};if(page==='cost'){if(!performance)throw Error('Cost requires a companion Performance export to verify passive VM binding');const d=JSON.parse(fs.readFileSync(performance));const p=d.spec?.elements?.['panel-11']?.spec;options.azureVmMetricsUrl=p?p.data.spec.queries[0].spec.query.spec.url:d.panels.find(p=>p.id===11)?.targets[0].url;}fs.writeFileSync(output,JSON.stringify(patch(JSON.parse(fs.readFileSync(input)),page,options),null,2)+'\n');}
