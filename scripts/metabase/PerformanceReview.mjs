// R016 parallel review page; never alters original Performance questions/placements.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {api,assertSource,privateDir,read,write} from './ReportingApi.mjs';
export const backup=privateDir+'/performance-review-before-20260924';
export const parameter={id:'review-performance',name:'Performance period',slug:'review_performance',type:'date/all-options',sectionId:'date',default:'past30days'};
const dateTag={id:'r016-performance-period',name:'performance_period','display-name':'Performance period',type:'dimension',dimension:['field',82,null],'widget-type':'date/all-options',alias:'d."Date"'};
const cardTag=id=>({id:'r016-performance-model-'+id,name:'#'+id,'display-name':'Model '+id,type:'card','card-id':id});
const fmt=names=>({column_settings:Object.fromEntries(names.map(n=>[JSON.stringify(['name',n]),{number_style:'decimal',decimals:0,number_separators:'.,',compact:false}]))});
// Broad presentation calendar permits explicit pre-coverage/future selections. It holds no financial data.
// The optional comment gives a cleared filter a data-based all-history default.
export const common=`WITH clock AS (SELECT public.olap_reporting_date() today),
 available AS (SELECT min("Date") starts FROM public.reporting_statement_calendar),
 selected AS (
 SELECT d."Date" FROM (SELECT generate_series(DATE '1900-01-01',DATE '2199-12-31',INTERVAL '1 day')::date AS "Date") d
 WHERE [[{{performance_period}} --]] d."Date" BETWEEN (SELECT starts FROM available) AND (SELECT today FROM clock)
 ), bounds AS (SELECT min("Date") starts,max("Date") ends,count(*) days,
 count(*)>0 AND count(*)=max("Date")-min("Date")+1 continuous FROM selected),
 live_days AS (SELECT d."Date" FROM selected d CROSS JOIN bounds b CROSS JOIN clock c WHERE b.continuous AND d."Date"<=c.today),
 history_days AS (SELECT d."Date" FROM selected d CROSS JOIN bounds b CROSS JOIN clock c WHERE b.continuous AND d."Date"<c.today)`;
export const historical=common+`, history AS (
 SELECT d."Date",s."Snapshot ID",s."Generated At",s."Profit" AS "Gross interest",s."Principal Issued" AS "Principal issued",
 s."Principal Returned" AS "Principal returned",s."Loans Issued" AS "Loans issued",s."Active Loans EOD" AS "Active loans EOD",
 s."Active Borrowers EOD" AS "Active borrowers EOD" FROM history_days d LEFT JOIN {{#74}} s ON s."Date"=d."Date")`;
const native=(query,models=[])=>({database:2,type:'native',native:{query,'template-tags':{performance_period:dateTag,...Object.fromEntries(models.map(id=>['#'+id,cardTag(id)]))}}});
const live=(table,date,amount)=>common+` SELECT CASE WHEN EXISTS(SELECT 1 FROM live_days) THEN (SELECT ${amount} FROM {{#${table}}} s JOIN live_days d ON s."${date}"=d."Date") END`;
const graph=(metrics,colors)=>({'graph.dimensions':['Date'],'graph.metrics':metrics,'graph.colors':colors,'graph.show_legend':metrics.length>1,'graph.y_axis.auto_split':false,'graph.missing':'none','stackable.stack_type':null,...fmt(metrics)});
export const specs=[
 {key:'interest',name:'Gross interest · live',display:'scalar',dataset_query:native(live(71,'Payment Date','coalesce(sum(s."Interest Paid"),0)')+' AS "Gross interest"',[71]),visualization_settings:{'scalar.field':'Gross interest',...fmt(['Gross interest'])}},
 {key:'principal',name:'Principal issued · live',display:'scalar',dataset_query:native(live(70,'Loan Date','coalesce(sum(s."Principal Amount"),0)')+' AS "Principal issued"',[70]),visualization_settings:{'scalar.field':'Principal issued',...fmt(['Principal issued'])}},
 {key:'loans',name:'Loans issued · live',display:'scalar',dataset_query:native(live(70,'Loan Date','count(*)')+' AS "Loans issued"',[70]),visualization_settings:{'scalar.field':'Loans issued',...fmt(['Loans issued'])}},
 {key:'type',name:'Gross interest by loan type · live',display:'row',dataset_query:native(common+` SELECT coalesce(s."Loan Type",'Unspecified') AS "Loan type",sum(s."Interest Paid") AS "Gross interest" FROM {{#71}} s JOIN live_days d ON s."Payment Date"=d."Date" GROUP BY 1 ORDER BY 2 DESC,1`,[71]),visualization_settings:{'graph.dimensions':['Loan type'],'graph.metrics':['Gross interest'],'graph.colors':['#509EE3'],'graph.show_values':true,...fmt(['Gross interest'])}},
 {key:'live-status',name:'Live period & source',display:'table',dataset_query:native(common+`, span AS (SELECT min("Date") starts,max("Date") ends FROM live_days)
 SELECT v.detail AS "Detail",v.value AS "Value" FROM bounds b CROSS JOIN span s CROSS JOIN clock c CROSS JOIN LATERAL (VALUES
 (1,'Live period',coalesce(s.starts::text||' → '||s.ends::text,'Unavailable')),
 (2,'Source','Live on report refresh'),(3,'Queried at',to_char(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok','YYYY-MM-DD HH24:MI')),
 (4,'Status',CASE WHEN b.days=0 THEN 'No eligible dates (supported: 1900–2199)' WHEN NOT b.continuous THEN 'Choose one continuous date range' WHEN s.starts IS NULL THEN 'Future dates have no live results' WHEN b.ends>c.today THEN 'Future dates excluded' ELSE 'Ready · includes corrections' END)) v(step,detail,value) ORDER BY step`),visualization_settings:{'table.pivot':false}},
 {key:'daily-interest',name:'Daily gross interest · snapshots',display:'line',dataset_query:native(historical+' SELECT "Date","Gross interest" FROM history ORDER BY 1',[74]),visualization_settings:graph(['Gross interest'],['#509EE3'])},
 {key:'daily-principal',name:'Principal issued & returned · snapshots',display:'bar',dataset_query:native(historical+' SELECT "Date","Principal issued","Principal returned" FROM history ORDER BY 1',[74]),visualization_settings:graph(['Principal issued','Principal returned'],['#509EE3','#88BF4D'])},
 {key:'daily-loans',name:'Loans issued per day · snapshots',display:'bar',dataset_query:native(historical+' SELECT "Date","Loans issued" FROM history ORDER BY 1',[74]),visualization_settings:graph(['Loans issued'],['#A989C5'])},
 {key:'weekly-average',name:'Average loan size · selected days per week',display:'bar',dataset_query:native(historical+` SELECT date_trunc('week',"Date")::date AS "Week starting",
 CASE WHEN count("Snapshot ID")=count(*) AND count("Principal issued")=count(*) AND count("Loans issued")=count(*) THEN sum("Principal issued")/nullif(sum("Loans issued"),0) END AS "Average loan size",
 min("Date") AS "Selected from",max("Date") AS "Selected through",count(*) AS "Selected days",
 count(*)-count("Snapshot ID") AS "Missing snapshots" FROM history GROUP BY 1 ORDER BY 1`,[74]),visualization_settings:{...graph(['Average loan size'],['#F9CF48']),'graph.dimensions':['Week starting']}},
 {key:'active',name:'Active loans & borrowers · end of day',display:'line',dataset_query:native(historical+' SELECT "Date","Active loans EOD","Active borrowers EOD" FROM history ORDER BY 1',[74]),visualization_settings:graph(['Active loans EOD','Active borrowers EOD'],['#509EE3','#F2A86F'])},
 {key:'detail',name:'Daily performance · snapshots',display:'table',dataset_query:native(historical+` SELECT "Date","Gross interest","Principal issued","Principal returned","Loans issued",
 "Principal issued"/nullif("Loans issued",0) AS "Average loan size","Active loans EOD","Active borrowers EOD" FROM history ORDER BY 1 DESC`,[74]),visualization_settings:{'table.pivot':false,...fmt(['Gross interest','Principal issued','Principal returned','Loans issued','Average loan size','Active loans EOD','Active borrowers EOD'])}},
 {key:'snapshot-status',name:'Snapshot coverage & generation times',display:'table',dataset_query:native(historical+`, totals AS (SELECT min("Date") starts,max("Date") ends,count(*) n,count("Snapshot ID") covered,
 count(*) FILTER(WHERE "Snapshot ID" IS NOT NULL AND ("Gross interest" IS NULL OR "Principal issued" IS NULL OR "Principal returned" IS NULL OR "Loans issued" IS NULL OR "Active loans EOD" IS NULL OR "Active borrowers EOD" IS NULL)) incomplete,
 min("Generated At") oldest,max("Generated At") latest FROM history)
 SELECT v.detail AS "Detail",v.value AS "Value" FROM totals t CROSS JOIN bounds b CROSS JOIN LATERAL (VALUES
 (1,'Stored period',coalesce(t.starts::text||' → '||t.ends::text,'No completed dates')),
 (2,'Coverage',t.covered::text||'/'||t.n::text||' · missing '||(t.n-t.covered)::text||' · null '||t.incomplete::text),
 (3,'Oldest generation',coalesce(to_char(t.oldest,'YYYY-MM-DD HH24:MI'),'Unavailable')),
 (4,'Latest generation',coalesce(to_char(t.latest,'YYYY-MM-DD HH24:MI'),'Unavailable')),
 (5,'Status',CASE WHEN b.days=0 THEN 'No eligible dates (supported: 1900–2199)' WHEN NOT b.continuous THEN 'Choose one continuous date range' WHEN t.n=0 THEN 'No completed dates in selection' WHEN t.covered<t.n OR t.incomplete>0 THEN 'Gaps; weekly averages blank' ELSE 'Complete' END)) v(step,detail,value) ORDER BY step`,[74]),visualization_settings:{'table.pivot':false}}
];
export const shape=cards=>cards.map(c=>Object.fromEntries(['id','card_id','dashboard_tab_id','col','row','size_x','size_y','series','parameter_mappings','visualization_settings'].map(k=>[k,c[k]]))).sort((a,b)=>a.id-b.id);
export function layout(state){
 const result=[];let next=-1;
 const note=(row,text,h=1)=>result.push({id:next--,card_id:null,dashboard_tab_id:state.tab,col:0,row,size_x:24,size_y:h,series:[],parameter_mappings:[],visualization_settings:{'card.background':false,virtual_card:{display:h===1?'heading':'text',visualization_settings:{text}}}});
 const place=(key,col,row,w,h)=>result.push({id:next--,card_id:state.cards[key],dashboard_tab_id:state.tab,col,row,size_x:w,size_y:h,series:[],parameter_mappings:[{parameter_id:parameter.id,card_id:state.cards[key],target:['dimension',['template-tag','performance_period']]}],visualization_settings:{}});
 note(0,'Selected-period results · live on report refresh');
 note(1,'All portfolio · baht · Bangkok dates.',2);
 ['interest','principal','loans'].forEach((k,i)=>place(k,i*8,3,8,3));
 place('type',0,6,16,7);place('live-status',16,6,8,7);
 note(13,'Completed-day history · stored daily snapshots');
 note(14,'Hourly refresh: yesterday. Older corrections need a rebuild.',2);
 place('snapshot-status',0,16,24,7);
 place('daily-interest',0,23,12,7);place('daily-principal',12,23,12,7);
 place('daily-loans',0,30,12,7);place('weekly-average',12,30,12,7);
 note(37,'Weekly = principal ÷ loans. Partial weeks use selected days only.',2);
 place('active',0,39,24,7);
 note(46,'End-of-day counts use loan/close dates; do not sum across dates.',2);
 place('detail',0,48,24,9);
 return result;
}
if(process.argv.includes('--prepare')){
 await assertSource();fs.mkdirSync(backup,{recursive:true});
 if(!fs.existsSync(backup+'/dashboard.json')){
  const d=await api('GET','dashboard/3');fs.writeFileSync(backup+'/dashboard.json',JSON.stringify(d));
  fs.writeFileSync(backup+'/permissions.json',JSON.stringify(await api('GET','collection/graph')));
  for(const id of [70,71,74])fs.writeFileSync(backup+`/model-${id}.json`,JSON.stringify(await api('GET','card/'+id)));
 }
 for(const s of specs){const r=await api('POST','dataset',s.dataset_query);if(r.status!=='completed'){fs.writeFileSync(backup+'/preflight-error.json',JSON.stringify(r));throw Error('Preflight failed '+s.key);}assert.ok(!r.data.rows_truncated);}
 console.log('Private dashboard/model rollback captured; all 12 queries passed unfiltered preflight.');
}
if(process.argv.includes('--install')){
 if(fs.existsSync(new URL('../../outputs/r016-20260922/performance-redesign/rolling-state.json',import.meta.url)))throw Error('6R has the rolling-average enhancement. Do not replay the legacy page layout; use PerformanceRolling.mjs and its saved plan.');
 await assertSource();const before=JSON.parse(fs.readFileSync(backup+'/dashboard.json'));
 let state;try{state=read('performance-redesign/state.json');}catch{state={cards:{},baseline_commit:'52a8bd44cfade2ec43c54ccb39889b1037b3329c',backup};}
 let d=await api('GET','dashboard/3');assert.deepEqual(shape(d.dashcards.filter(c=>c.dashboard_tab_id!==state.tab)),shape(before.dashcards));
 for(const s of specs){if(state.cards[s.key])continue;const {key,...body}=s;const c=await api('POST','card',{...body,type:'question',collection_id:5,description:'R016 parallel Performance review. Isolated from original tab; live period totals and completed-day stored snapshots. Bangkok dates; no borrower exclusion. Supported date selector 1900–2199.'});state.cards[key]=c.id;write('performance-redesign/state.json',state);}
 d=await api('GET','dashboard/3');
 if(!state.tab){await api('PUT','dashboard/3/cards',{tabs:[...d.tabs,{id:-1,name:'6R · Performance Review',position:d.tabs.length}],cards:d.dashcards});d=await api('GET','dashboard/3');state.tab=d.tabs.find(t=>t.name==='6R · Performance Review').id;write('performance-redesign/state.json',state);}
 if(!d.parameters.some(p=>p.id===parameter.id)){await api('PUT','dashboard/3',{parameters:[...d.parameters,parameter]});d=await api('GET','dashboard/3');}
 assert.deepEqual(shape(d.dashcards.filter(c=>c.dashboard_tab_id!==state.tab)),shape(before.dashcards));
 await api('PUT','dashboard/3/cards',{tabs:d.tabs,cards:[...d.dashcards.filter(c=>c.dashboard_tab_id!==state.tab),...layout(state)]});
 d=await api('GET','dashboard/3');
 assert.deepEqual(shape(d.dashcards.filter(c=>c.dashboard_tab_id!==state.tab)),shape(before.dashcards));
 assert.deepEqual(d.parameters.filter(p=>p.id!==parameter.id),before.parameters);
 assert.deepEqual(d.tabs.filter(t=>t.id!==state.tab),before.tabs);
 write('performance-redesign/plan.json',{tabs:d.tabs,parameters:d.parameters,questions:specs.map(s=>({...s,id:state.cards[s.key]})),layout:shape(d.dashcards.filter(c=>c.dashboard_tab_id===state.tab)),source_policy:'Live selected-period totals for any date; completed-day snapshots only for trends/detail. Original Performance unchanged.'});
 console.log('Review tab '+state.tab+' installed; original tabs, placements and filters unchanged.');
}
