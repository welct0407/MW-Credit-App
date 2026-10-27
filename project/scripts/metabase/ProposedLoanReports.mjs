// Loan Reports · proposed: parallel redesign of dashboard 3 for owner review. Reads layout.json; never writes dashboard 3.
// --prepare captures the private baseline; --publish creates the collection, ten questions and the dashboard once;
// --refine --only=<question key|tab key>,... [--dry-run] dry-runs the named questions, then creates missing ones, updates the rest,
// rebuilds the named tabs and archives state-owned questions the spec dropped; --verify checks structure, parity and preservation.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {api,assertSource,root} from './ReportingApi.mjs';
export const out=root+'/outputs/loan-reports-redesign-20261026';
export const priv=process.env.MW_METABASE_PRIVATE_DIR||'C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/loan-reports-redesign-20261026';
fs.mkdirSync(priv,{recursive:true});
export const save=(n,x,dir=out)=>fs.writeFileSync(`${dir}/${n}.json`,JSON.stringify(x,null,2)+'\n');
export const read=(n,dir=out)=>JSON.parse(fs.readFileSync(`${dir}/${n}.json`,'utf8'));
export const layout=read('layout');
export const shape=d=>d.dashcards.map(({id,card_id,dashboard_tab_id,row,col,size_x,size_y,series,parameter_mappings,visualization_settings})=>({id,card_id,dashboard_tab_id,row,col,size_x,size_y,series,parameter_mappings,visualization_settings})).sort((a,b)=>a.id-b.id);
const site='https://reports.mw-credit.com';
const replaced=Object.fromEntries(layout.parameters.flatMap(p=>p.replaces.map(o=>[o,p.id])));
const num={number_style:'decimal',decimals:0,number_separators:'.,',compact:false};
const pct={number_style:'percent',decimals:1,number_separators:'.,'};
const fmt=(names,f=num)=>Object.fromEntries(names.map(n=>[JSON.stringify(['name',n]),f]));
const dateTag=(name,display)=>({id:'lrp-'+name.replaceAll('_','-'),name,'display-name':display,type:'dimension',dimension:['field',82,null],'widget-type':'date/all-options',alias:'d."Date"'});
const model=id=>({id:'lrp-model-'+id,name:'#'+id,'display-name':'Model '+id,type:'card','card-id':id});
const native=(query,tags)=>({database:2,type:'native',native:{query,'template-tags':Object.fromEntries(tags.map(t=>[t.name,t]))}});
const mbql=query=>({database:2,type:'query',query});
const f=(name,type='type/Decimal',extra={})=>['field',name,{'base-type':type,...extra}];
const tagTarget=(name,kind='dimension')=>[kind,['template-tag',name]];
// Same routing as snippet 4 (question 207): today reads model 73, a past date reads model 205, a date before the first snapshot is blank.
const positionSql=column=>`WITH clock AS (SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date AS today),
 dates AS (SELECT generate_series(coalesce((SELECT min("Date") FROM {{#205}}),c.today),c.today,interval '1 day')::date AS "Date" FROM clock c),
 selected AS (SELECT max(d."Date") AS position_date FROM dates d WHERE true [[AND {{position_date}}]])
SELECT CASE WHEN s.position_date=c.today THEN (SELECT p."${column}" FROM {{#73}} p LIMIT 1)
 WHEN s.position_date<c.today THEN (SELECT p."${column}" FROM {{#205}} p WHERE p."Date"=s.position_date ORDER BY p."Generated At" DESC NULLS LAST LIMIT 1) END AS "${column}"
FROM selected s CROSS JOIN clock c`;
// Pattern of questions 217-219: live days of the selected Period, plus the preceding period of equal length.
const perfSql=`WITH clock AS (SELECT public.olap_reporting_date() today),
 available AS (SELECT min("Date") starts FROM public.reporting_statement_calendar),
 selected AS (
 SELECT d."Date" FROM (SELECT generate_series(DATE '1900-01-01',DATE '2199-12-31',INTERVAL '1 day')::date AS "Date") d
 WHERE [[{{performance_period}} --]] d."Date" BETWEEN (SELECT starts FROM available) AND (SELECT today FROM clock)
 ), bounds AS (SELECT min("Date") starts,max("Date") ends,count(*)::int days,
 count(*)>0 AND count(*)=max("Date")-min("Date")+1 continuous FROM selected),
 periods AS (
 SELECT 'this' p,b.starts,least(b.ends,c.today) ends,b.starts>=a.starts ok FROM bounds b CROSS JOIN clock c CROSS JOIN available a WHERE b.continuous
 UNION ALL SELECT 'previous',b.starts-b.days,b.starts-1,b.starts-b.days>=a.starts FROM bounds b CROSS JOIN available a WHERE b.continuous
 ), totals AS (
 SELECT p.p,p.ok,
 (SELECT coalesce(sum(s."Interest Paid"),0) FROM {{#71}} s WHERE s."Payment Date" BETWEEN p.starts AND p.ends) interest,
 (SELECT coalesce(sum(s."Principal Amount"),0) FROM {{#70}} s WHERE s."Loan Date" BETWEEN p.starts AND p.ends) issued,
 (SELECT count(*) FROM {{#70}} s WHERE s."Loan Date" BETWEEN p.starts AND p.ends) loans,
 (SELECT coalesce(sum(s."Principal Paid"),0) FROM {{#71}} s WHERE s."Payment Date" BETWEEN p.starts AND p.ends) returned
 FROM periods p
 ), m AS (
 SELECT v.ord,v.metric,max(v.amount) FILTER (WHERE t.p='this') cur,max(v.amount) FILTER (WHERE t.p='previous' AND t.ok) prev
 FROM totals t CROSS JOIN LATERAL (VALUES (1,'Gross interest',t.interest),(2,'Principal issued',t.issued),(3,'Loans issued',t.loans::numeric),(4,'Principal returned',t.returned),(5,'Net principal deployed',t.issued-t.returned)) v(ord,metric,amount)
 GROUP BY v.ord,v.metric
 )
SELECT metric AS "Measure",cur AS "This period",prev AS "Previous period",cur-prev AS "Change",(cur-prev)/nullif(abs(prev),0) AS "Change %" FROM m ORDER BY ord`;
// Pattern of snippet 2: selected statement period and the preceding period of equal length on model 186.
const incomeSql=`WITH selected AS (SELECT d."Date" FROM public.reporting_statement_calendar d WHERE true [[AND {{statement_period}}]]),
 available AS (SELECT min("Date") starts FROM public.reporting_statement_calendar),
 bounds AS (SELECT min("Date") starts,max("Date") ends,count(*)::int days FROM selected),
 periods AS (
 SELECT 'this' p,b.starts,b.ends,b.days,true ok FROM bounds b WHERE b.days>0 AND b.days=b.ends-b.starts+1
 UNION ALL SELECT 'previous',b.starts-b.days,b.starts-1,b.days,b.starts-b.days>=a.starts FROM bounds b CROSS JOIN available a WHERE b.days>0 AND b.days=b.ends-b.starts+1
 ), totals AS (
 SELECT p.p,p.ok,p.days,coalesce((SELECT sum(e."Income") FROM {{#186}} e WHERE e."Date" BETWEEN p.starts AND p.ends),0) income,
 coalesce((SELECT sum(e."Expenses") FROM {{#186}} e WHERE e."Date" BETWEEN p.starts AND p.ends),0) expenses FROM periods p
 ), m AS (
 SELECT v.ord,v.metric,max(v.amount) FILTER (WHERE t.p='this') cur,max(v.amount) FILTER (WHERE t.p='previous' AND t.ok) prev
 FROM totals t CROSS JOIN LATERAL (VALUES (1,'Income',t.income),(2,'Expenses',t.expenses),(3,'Net profit',t.income-t.expenses),(4,'Net profit per day',(t.income-t.expenses)/nullif(t.days,0))) v(ord,metric,amount)
 GROUP BY v.ord,v.metric
 )
SELECT metric AS "Measure",cur AS "This period",prev AS "Previous period",cur-prev AS "Change",(cur-prev)/nullif(abs(prev),0) AS "Change %" FROM m ORDER BY ord`;
const compareTable={'table.pivot':false,column_settings:{...fmt(['This period','Previous period','Change']),...fmt(['Change %'],pct)},'table.column_formatting':[{id:0,columns:['Change %','Change'],type:'single',operator:'>',value:0,color:'#84BB4C',highlight_row:false},{id:1,columns:['Change %','Change'],type:'single',operator:'<',value:0,color:'#ED6E6E',highlight_row:false}]};
const sql=c=>c?.dataset_query?.stages?.[0]?.native??c?.dataset_query?.native?.query;
// The origin's template tags in the legacy shape this installer posts (names, ids, types and defaults unchanged).
function originTags(c){
 const t=c?.dataset_query?.stages?.[0]?.['template-tags']??c?.dataset_query?.native?.['template-tags']??{};
 return Object.fromEntries((Array.isArray(t)?t:Object.values(t)).map(({dimension,...x})=>[x.name,dimension?{...x,dimension:dimension[1]&&typeof dimension[1]==='object'?['field',dimension[2],null]:dimension}:x]));
}
// Column-settings keys as Metabase writes them (the Python spec writes ["name", "x"] with a space and escapes).
const normKeys=o=>Array.isArray(o)?o.map(normKeys):o&&typeof o==='object'?Object.fromEntries(Object.entries(o).map(([k,v])=>[k.startsWith('["')?JSON.stringify(JSON.parse(k)):k,normKeys(v)])):o;
const mergeVs=(a={},b={})=>{const m={...a,...b};for(const k of ['column_settings','series_settings'])if(a[k]||b[k])m[k]=Object.fromEntries([...new Set([...Object.keys(a[k]??{}),...Object.keys(b[k]??{})])].map(n=>[n,{...a[k]?.[n],...b[k]?.[n]}]));return m;};
const firstDashcard=(baseline,id)=>[...(baseline?.dashcards??[])].sort((a,b)=>a.id-b.id).find(c=>c.card_id===id);
// Definitions given as an edit of the origin's query (layout: "rank<=10 changed to rank<=5 ... 'Others' replaced by 'Others (n)'").
const top5=s=>{assert.equal(s.split('rank<=10').length,3,'origin rank<=10 twice');assert.equal(s.split(`ELSE 'Others' END`).length,2,'origin Others label once');const amount=['outstanding_principal','interest_received'].find(c=>s.includes(`sum(${c})`));assert(amount,'top-5 amount column');return s.replaceAll('rank<=10','rank<=5').replace(`ELSE 'Others' END`,`ELSE 'Others ('||(SELECT count(*) FROM ranked WHERE rank>5 AND coalesce(${amount},0)<>0)||')' END`);};
const edits={'borrowers.principal-top5':top5,'borrowers.interest-top5':top5};
// The new questions. A native question built from its origin's query (sql_wrap, an edit, or sql naming the origin's tags) copies the
// origin's template tags and maps them as the origin's dashboard-3 dashcard did; other new questions carry the mappings written below.
export function questions(sources={},state={},baseline){
 const q331=sources[331];
 const spec={
  'today.principal-smart':{dataset_query:mbql({'source-table':'card__74',aggregation:[['aggregation-options',['max',f('Outstanding Principal')],{name:'Principal at work','display-name':'Principal at work'}]],breakout:[f('Date','type/Date',{'temporal-unit':'day'})],'order-by':[['asc',f('Date','type/Date',{'temporal-unit':'day'})]]}),
   visualization_settings:{'scalar.compact_primary_number':false,'scalar.field':'Principal at work','scalar.comparisons':[{id:'first',type:'periodsAgo',value:29}],column_settings:fmt(['Principal at work'])},mappings:{period:['dimension',f('Date','type/Date')]}},
  'today.realization':{dataset_query:mbql({'source-table':'card__73',fields:[f('Forecast Realization')]}),visualization_settings:{'progress.goal':1,'progress.color':'#2a78d6',column_settings:fmt(['Forecast Realization'],pct)},mappings:{}},
  'today.collection-rate':{dataset_query:mbql({'source-table':'card__73',fields:[f('Amount Collection Rate Today')]}),visualization_settings:{'progress.goal':1,'progress.color':'#067647',column_settings:fmt(['Amount Collection Rate Today'],pct)},mappings:{}},
  'cash.pool-selected':{dataset_query:native(positionSql('Total Cash Pool'),[model(205),model(73),dateTag('position_date','Date')]),visualization_settings:{'scalar.field':'Total Cash Pool',column_settings:fmt(['Total Cash Pool'])},mappings:{'position-date':tagTarget('position_date')}},
  'cash.principal-selected':{dataset_query:native(positionSql('Outstanding Principal'),[model(205),model(73),dateTag('position_date','Date')]),visualization_settings:{'scalar.field':'Outstanding Principal',column_settings:fmt(['Outstanding Principal'])},mappings:{'position-date':tagTarget('position_date')}},
  'income.vs-previous':{dataset_query:native(incomeSql,[model(186),dateTag('statement_period','Statement period')]),visualization_settings:compareTable,mappings:{'statement-period':tagTarget('statement_period')}},
  'income.monthly':{dataset_query:mbql({'source-table':'card__186',aggregation:[['aggregation-options',['sum',f('Income')],{name:'Income','display-name':'Income'}],['aggregation-options',['sum',f('Expenses')],{name:'Expenses','display-name':'Expenses'}],['aggregation-options',['-',['sum',f('Income')],['sum',f('Expenses')]],{name:'Net profit','display-name':'Net profit'}]],breakout:[f('Date','type/Date',{'temporal-unit':'month'})],filter:['time-interval',f('Date','type/Date'),-5,'month',{'include-current':true}]}),
   visualization_settings:{'graph.dimensions':['Date'],'graph.metrics':['Income','Expenses','Net profit'],'graph.show_values':true,'graph.label_value_formatting':'compact','graph.colors':['#178F8A','#D6816B','#2a78d6'],'graph.x_axis.title_enabled':false,'graph.y_axis.title_enabled':false,column_settings:fmt(['Income','Expenses','Net profit'])},mappings:{}},
  'cashflow.by-type-row':{visualization_settings:{'graph.label_value_formatting':'compact',column_settings:fmt(['Money In','Money Out'])}},
  'perf.vs-previous':{dataset_query:native(perfSql,[model(70),model(71),dateTag('performance_period','Performance period')]),visualization_settings:{...compareTable,column_settings:{...compareTable.column_settings}},mappings:{period:tagTarget('performance_period')}},
  'partners.capital-share-row':{dataset_query:q331&&native(`SELECT "Partner","Net capital ฿"/nullif(sum("Net capital ฿") OVER (),0) AS "Capital share %","Net capital ฿" FROM (${sql(q331)}) t`,[{id:'lrp-partner',name:'partner','display-name':'Partner',type:'dimension',dimension:['field',121,null],'widget-type':'string/=',alias:'d.partner_id'},model(318)]),
   visualization_settings:{'graph.dimensions':['Partner'],'graph.metrics':['Capital share %'],'graph.show_values':true,'graph.show_legend':false,'graph.colors':['#178F8A','#7472BE','#D6816B','#D4AD60'],'graph.y_axis.min':0,'graph.y_axis.max':1,column_settings:{...fmt(['Capital share %'],pct),...fmt(['Net capital ฿'])}},mappings:{partner:tagTarget('partner')}}
 };
 // Column links written by the installer (layout: the attention strip's Item opens the tab named in its hidden Tab column).
 const links={'today.attention':{column:'Item',linkTemplate:`${site}/dashboard/${state.dashboard}?tab={{Tab}}`}};
 return Object.entries(layout.new_questions).map(([key,d])=>{
  const origin=sources[d.origin],s=spec[key]??{};let {dataset_query,mappings={}}=s;
  let copy=false,text=d.sql??(d.sql_wrap&&sql(origin)&&d.sql_wrap.replace(`<${d.origin}>`,sql(origin)))??(edits[key]&&sql(origin)&&edits[key](sql(origin)));
  if(text){
   assert(!d.sql_wrap||!text.includes(`<${d.origin}>`),'sql_wrap placeholder left: '+key);
   text=text.replaceAll('__TAB_COLLECTION__',String(state.tabs?.collection)).replaceAll('__TAB_HEALTH__',String(state.tabs?.health));
   const own=sql(origin)?originTags(origin):{};copy=Object.keys(own).some(n=>text.includes(`{{${n}}}`));const tags=copy?{...own}:{};
   for(const [,id] of text.matchAll(/\{\{#(\d+)\}\}/g))tags['#'+id]??=model(+id);
   dataset_query=native(text,Object.values(tags));mappings={};
   if(copy)for(const m of firstDashcard(baseline,d.origin)?.parameter_mappings??[]){const pid=replaced[m.parameter_id];if(d.params.includes(pid))mappings[pid]??=m.target;}
  }else if(d.query){dataset_query=mbql(d.query);mappings={};}
  // Saved settings: the installer's base, the layout's settings over it (descriptive strings skipped), the origin's copied presentation.
  const {copy_from_origin:copyKeys=[],...given}=d.settings??{};
  // A copy of a native origin keeps the origin's column number formats (whole baht) under the layout's settings.
  let vs=mergeVs(mergeVs(copy?{column_settings:origin.visualization_settings?.column_settings}:{},s.visualization_settings),normKeys(Object.fromEntries(Object.entries(given).filter(([k,v])=>!(k==='table.column_formatting'&&typeof v==='string')))));
  const from=mergeVs(origin?.visualization_settings,firstDashcard(baseline,d.origin)?.visualization_settings),copied={};
  // Formatting rules keep only columns the new question returns (a rule left without columns is dropped).
  const fields=d.query?.fields?.map(x=>x[1]);
  if(copyKeys.includes('table.column_formatting')&&from['table.column_formatting'])copied['table.column_formatting']=from['table.column_formatting'].map(r=>({...r,columns:r.columns.filter(c=>!fields||fields.includes(c))})).filter(r=>r.columns.length);
  if(copyKeys.includes('click_behavior')){
   if(from.click_behavior)copied.click_behavior=from.click_behavior;
   for(const [k,v] of Object.entries(from.column_settings??{}))if(v.click_behavior)(copied.column_settings??={})[k]={click_behavior:v.click_behavior};
  }
  const link=links[key];if(link)(copied.column_settings??={})[JSON.stringify(['name',link.column])]={click_behavior:{type:'link',linkType:'url',linkTemplate:link.linkTemplate}};
  const presentation=rewrite(copied,state);vs=mergeVs(vs,presentation);
  // Row and bar charts on this version colour series from series_settings; graph.colors alone is ignored there.
  (vs['graph.metrics']??[]).forEach((m,i)=>{const color=vs['graph.colors']?.[i];if(color&&!vs.series_settings?.[m]?.color)vs.series_settings={...vs.series_settings,[m]:{...vs.series_settings?.[m],color}};});
  return {key,name:d.name,display:d.display,description:`Loan Reports · proposed (${key}). ${d.definition} Basis: ${d.basis}.`,dataset_query,visualization_settings:vs,mappings,presentation,params:d.params};
 });
}
function parameters(baseline){
 return layout.parameters.map(p=>{
  const old=baseline.parameters.find(o=>o.id===p.replaces[0]);assert(old,'baseline parameter '+p.replaces[0]);
  const {id,name,slug,default:_d,...rest}=old;
  const out={...rest,id:p.id,name:p.name,slug:p.slug,type:p.type};
  if(p.default!==null)out.default=p.default;
  if(p.multi)out.isMultiSelect=true;
  if(p.values_source&&p.values_source!=='copy')assert.equal(old.values_source_config?.card_id,p.values_source.card_id);
  return out;
 });
}
const relink=(text,state)=>text.replaceAll(`${site}/dashboard/3?tab=105&bd_borrower=`,`${site}/dashboard/${state.dashboard}?tab=${state.tabs?.['borrower-detail']}&borrower=`).replaceAll('&bd_activity=','&period=');
function rewrite(o,state){
 if(typeof o==='string')return relink(o,state);
 if(Array.isArray(o))return o.map(v=>rewrite(v,state));
 if(o&&typeof o==='object')return Object.fromEntries(Object.entries(o).map(([k,v])=>[k,rewrite(v,state)]));
 return o;
}
// Placement options (layout.json): title, description, vs (merged, and inside visualization.settings for visualizer-format placements), columns
// (named columns first, the rest in their saved order, `hide` disabled) and hide_empty.
function columnsFor(spec,card,current){
 const names=card.result_metadata.map(m=>m.name);for(const n of [...spec.order,...spec.hide])assert(names.includes(n),`column ${n} not in question ${card.id}`);
 const saved=(current??card.visualization_settings?.['table.columns']??[]).filter(c=>names.includes(c.name));
 return [...new Set([...spec.order,...saved.map(c=>c.name),...names])].map(name=>({name,enabled:!spec.hide.includes(name)&&(spec.order.includes(name)||(saved.find(c=>c.name===name)?.enabled??true))}));
}
function options(vs,p,card){
 vs['card.title']=p.title;if(p.description)vs['card.description']=p.description;const extra=normKeys(p.vs??{});Object.assign(vs,extra);
 if(p.hide_empty)vs['card.hide_empty']=true;
 if(p.columns)vs['table.columns']=columnsFor(p.columns,card,vs['table.columns']);
 if(vs.visualization?.settings){vs.visualization.settings['card.title']=p.title;if(p.description)vs.visualization.settings['card.description']=p.description;Object.assign(vs.visualization.settings,extra);}
 return vs;
}
function placements(tab,state,baseline,live1501,specs,cards){
 const tabId=state.tabs[tab.key];let id=-1-1000*tab.position;
 return tab.placements.map(p=>{
  const base={id:id--,dashboard_tab_id:tabId,row:p.row,col:p.col,size_x:p.size_x,size_y:p.size_y,series:[]};
  // Text and heading cards: the placement vs (e.g. text.align_vertical) goes on the card and inside its virtual card.
  if(p.virtual){const extra=normKeys(p.vs??{});return {...base,card_id:null,parameter_mappings:[],visualization_settings:{'card.background':false,...extra,virtual_card:{display:p.virtual,visualization_settings:{text:p.text,...extra}},text:p.text}};}
  // The matrix iframe is copied from live dashcard 1501 in memory; its fragment gains detail=<dashboard>:<Borrower Detail tab>
  // so name links open this dashboard (charts without detail support ignore the parameter and keep dashboard 3 links).
  if(p.copy_dashcard){
   assert.equal(p.copy_dashcard,1501);const vs=structuredClone(live1501.visualization_settings),vc=vs.virtual_card.visualization_settings;
   const detail=`detail=${state.dashboard}:${state.tabs['borrower-detail']}`,before=vc.iframe;
   vc.iframe=before.replace(/(#key=[^"&]+)(?:&detail=[^"]*)?"/,`$1&${detail}"`);assert.notEqual(vc.iframe,before,'iframe src fragment not found');
   return {...base,card_id:null,parameter_mappings:[],visualization_settings:vs};
  }
  if(p.new_question){
   const q=specs.find(q=>q.key===p.new_question),card=state.questions[p.new_question];assert(card,'question not created yet: '+p.new_question);
   return {...base,card_id:card,parameter_mappings:p.params.filter(k=>q.mappings[k]).map(k=>({parameter_id:k,card_id:card,target:q.mappings[k]})),visualization_settings:options(structuredClone(q.presentation),p,cards[card])};
  }
  const old=firstDashcard(baseline,p.reuse_card_id);
  const vs=options(rewrite(structuredClone(old?.visualization_settings??{}),state),p,cards[p.reuse_card_id]);
  const mappings=[];
  for(const m of old?.parameter_mappings??[]){const pid=replaced[m.parameter_id];if(p.params.includes(pid)&&!mappings.some(x=>x.parameter_id===pid))mappings.push({parameter_id:pid,card_id:p.reuse_card_id,target:m.target});}
  return {...base,card_id:p.reuse_card_id,series:(old?.series??[]).map(s=>({id:s.id})),parameter_mappings:mappings,visualization_settings:vs};
 });
}
const cardBody=({key,mappings,presentation,params,...body})=>body;
// The key stops at '&', '"' or '\\'; later fragment parameters (detail) stay visible.
const redact=vs=>JSON.parse(JSON.stringify(vs).replace(/#key=[^"\\&]+/g,'#key=<private>'));
// Live origin questions (read only): every new question's origin, for copied queries, tags and presentation.
async function liveSources(){const out={};for(const id of new Set([331,...Object.values(layout.new_questions).map(d=>d.origin)]))out[id]=await api('GET','card/'+id);return out;}
// Representative parameters (layout defaults) for a question's own mappings; used for dry runs before any write.
const sample=q=>Object.entries(q.mappings).map(([pid,target])=>{const p=layout.parameters.find(x=>x.id===pid);return p.default===null?null:{type:p.type,value:p.default,target};}).filter(Boolean);
async function dryRun(specs){
 const report=[];
 for(const q of specs){
  const r=await api('POST','dataset',{...q.dataset_query,parameters:sample(q)});
  if(r.status!=='completed'){save('query-error',r,priv);throw Error(`dry run failed: ${q.key}: ${String(r.error).slice(0,300)}`);}
  report.push({key:q.key,rows:r.data.rows.length,cols:r.data.cols.map(c=>c.name)});
 }
 return report;
}
async function guardDashboard3(){
 const baseline=read('dashboard-3-before',priv),live=await api('GET','dashboard/3');
 assert.deepEqual(shape(live),shape(baseline),'dashboard 3 dashcards changed since the baseline');assert.deepEqual(live.tabs,baseline.tabs);assert.deepEqual(live.parameters,baseline.parameters);
 return {baseline,live};
}
async function applyTabs(state,baseline,only,specs){
 const d=await api('GET','dashboard/'+state.dashboard);
 const live1501=(await api('GET','dashboard/3')).dashcards.find(c=>c.id===1501);assert(live1501?.visualization_settings?.virtual_card?.display==='iframe','dashcard 1501 matrix iframe missing');
 const tabs=layout.tabs.filter(t=>!only||only.includes(t.key)),cards={};
 for(const t of tabs)for(const p of t.placements)if(p.columns){const id=p.reuse_card_id??state.questions[p.new_question];cards[id]??=await api('GET','card/'+id);}
 const keep=d.dashcards.filter(c=>only&&!only.includes(layout.tabs.find(t=>state.tabs[t.key]===c.dashboard_tab_id)?.key));
 const fresh=tabs.flatMap(t=>placements(t,state,baseline,live1501,specs,cards));
 await api('PUT','dashboard/'+state.dashboard,{tabs:d.tabs.map(({id,name,position})=>({id,name,position})),dashcards:[...keep,...fresh]});
}
// State-owned questions the spec no longer names are archived once no proposed dashcard references them.
async function retire(state){
 const gone=Object.keys(state.questions).filter(k=>!layout.new_questions[k]);if(!gone.length)return [];
 const used=new Set((await api('GET','dashboard/'+state.dashboard)).dashcards.map(c=>c.card_id));
 for(const k of gone){const id=state.questions[k];assert(!used.has(id),`question ${id} (${k}) still placed`);await api('PUT','card/'+id,{archived:true});(state.archived??={})[k]=id;delete state.questions[k];save('state',state);}
 return gone;
}
const args=process.argv.slice(2),only=(args.find(a=>a.startsWith('--only='))||'').slice(7).split(',').filter(Boolean);
if(args.includes('--plan')){
 const q=questions({},{},null);console.log(JSON.stringify({tabs:layout.tabs.length,placements:layout.tabs.reduce((n,t)=>n+t.placements.length,0),parameters:layout.parameters.length,questions:q.map(x=>x.key),reused:layout.summary.reused_questions.length}));
}
if(args.includes('--prepare')){
 await assertSource();assert(!fs.existsSync(out+'/state.json'),'Already published: the baseline is fixed');
 const d=await api('GET','dashboard/3');save('dashboard-3-before',d,priv);
 const cards={};for(const id of layout.summary.reused_questions){const c=await api('GET','card/'+id);assert(!c.archived,`question ${id} archived`);cards[id]=c;}
 save('reused-cards-before',cards,priv);
 const onD3=new Set(d.dashcards.map(c=>c.card_id)),absent=layout.summary.reused_questions.filter(id=>!onD3.has(id));
 assert.equal(d.dashcards.find(c=>c.id===1501)?.visualization_settings?.virtual_card?.display,'iframe');
 console.log(JSON.stringify({tabs:d.tabs.length,dashcards:d.dashcards.length,parameters:d.parameters.length,reused:Object.keys(cards).length,notOnDashboard3:absent}));
}
if(args.includes('--publish')){
 await assertSource();assert(!fs.existsSync(out+'/state.json'),'Already published: use --refine, never replay --publish');
 const {baseline}=await guardDashboard3(),sources=await liveSources();
 await dryRun(questions(sources,{},baseline));
 const collection=await api('POST','collection',{...layout.dashboard.collection});
 const state={collection:collection.id,questions:{},tabs:{}};save('state',state);
 const dash=await api('POST','dashboard',{name:layout.dashboard.name,description:layout.dashboard.description,collection_id:collection.id});state.dashboard=dash.id;save('state',state);
 await api('PUT','dashboard/'+dash.id,{parameters:parameters(baseline),auto_apply_filters:layout.dashboard.auto_apply_filters,width:'fixed',tabs:layout.tabs.map(t=>({id:-1-t.position,name:t.name,position:t.position})),dashcards:[]});
 const withTabs=await api('GET','dashboard/'+dash.id);for(const t of layout.tabs)state.tabs[t.key]=withTabs.tabs.find(x=>x.name===t.name).id;save('state',state);
 const specs=questions(sources,state,baseline);
 for(const s of specs){const c=await api('POST','card',{...cardBody(s),type:'question',collection_id:collection.id});state.questions[s.key]=c.id;save('state',state);}
 await applyTabs(state,baseline,null,specs);
 await guardDashboard3();
 console.log(JSON.stringify({dashboard:dash.id,collection:collection.id,questions:Object.keys(state.questions).length,tabs:Object.keys(state.tabs).length}));
}
if(args.includes('--refine')){
 await assertSource();assert(only.length,'--refine needs --only=<keys>');const state=read('state'),{baseline}=await guardDashboard3(),specs=questions(await liveSources(),state,baseline);
 const qs=only.filter(k=>layout.new_questions[k]),tabs=only.filter(k=>state.tabs[k]);assert.equal(qs.length+tabs.length,only.length,'unknown key in --only');
 const changed=specs.filter(s=>qs.includes(s.key)),dry=await dryRun(changed);
 if(args.includes('--dry-run')){console.log(JSON.stringify({dryRun:dry},null,1));process.exit(0);}
 for(const s of changed){
  if(state.questions[s.key]){const c=await api('GET','card/'+state.questions[s.key]);save('question-before-refine-'+c.id,c,priv);await api('PUT','card/'+c.id,cardBody(s));}
  else{const c=await api('POST','card',{...cardBody(s),type:'question',collection_id:state.collection});state.questions[s.key]=c.id;save('state',state);}
 }
 if(tabs.length){save('proposed-before-refine',await api('GET','dashboard/'+state.dashboard),priv);await applyTabs(state,baseline,tabs,specs);}
 const archived=await retire(state);
 await guardDashboard3();console.log(JSON.stringify({refined:only,questions:Object.fromEntries(qs.map(k=>[k,state.questions[k]])),archived}));
}
const dashQuery=(dash,dc,parameters=[])=>api('POST',`dashboard/${dash}/dashcard/${dc.id}/card/${dc.card_id}/query`,{parameters});
if(args.includes('--verify')){
 await assertSource();const state=read('state'),{baseline,live:d3}=await guardDashboard3(),d=await api('GET','dashboard/'+state.dashboard);
 const checks=[],fail=(name,detail)=>checks.push({name,passed:false,detail}),pass=(name,detail)=>checks.push({name,passed:true,...(detail?{detail}:{})});
 // Structure
 const tabKey=Object.fromEntries(Object.entries(state.tabs).map(([k,v])=>[v,k]));
 let missing=0;for(const t of layout.tabs)for(const p of t.placements){const card=p.reuse_card_id??state.questions[p.new_question]??null;if(!d.dashcards.some(c=>c.dashboard_tab_id===state.tabs[t.key]&&c.row===p.row&&c.col===p.col&&c.size_x===p.size_x&&c.size_y===p.size_y&&c.card_id===card))missing++;}
 const want={tabs:layout.tabs.length,placements:layout.tabs.reduce((n,t)=>n+t.placements.length,0),parameters:layout.parameters.length};
 const sameParams=JSON.stringify(d.parameters.map(p=>p.id))===JSON.stringify(layout.parameters.map(p=>p.id));
 (d.tabs.length===want.tabs&&d.dashcards.length===want.placements&&sameParams&&!missing?pass:fail)('structure',{want,tabs:d.tabs.length,placements:d.dashcards.length,parameters:d.parameters.length,parameterIdsMatch:sameParams,unmatched:missing});
 // Mapping parity: reused cards carry the dashboard-3 targets after id substitution
 let parity=0,parityChecked=0;
 for(const c of d.dashcards.filter(c=>c.card_id&&!Object.values(state.questions).includes(c.card_id))){
  parityChecked++;const p=layout.tabs.find(t=>t.key===tabKey[c.dashboard_tab_id]).placements.find(p=>p.row===c.row&&p.col===c.col);
  const old=[...baseline.dashcards].sort((a,b)=>a.id-b.id).find(o=>o.card_id===c.card_id);
  const want=(old?.parameter_mappings??[]).filter(m=>p.params.includes(replaced[m.parameter_id])).map(m=>JSON.stringify([replaced[m.parameter_id],m.target]));
  const got=c.parameter_mappings.map(m=>JSON.stringify([m.parameter_id,m.target]));
  if(JSON.stringify([...new Set(want)].sort())!==JSON.stringify(got.sort())){parity++;if(parity<5)fail('mapping '+c.card_id,{want,got});}
 }
 (parity?fail:pass)('mapping parity',{checked:parityChecked,mismatched:parity});
 // New questions map exactly the spec's mappings within the placement's filters (copies: the origin's dashboard-3 targets)
 const specs=questions(await liveSources(),state,baseline),byId=new Map(Object.entries(state.questions).map(([k,v])=>[v,specs.find(q=>q.key===k)]));let newBad=[];
 for(const c of d.dashcards.filter(c=>byId.has(c.card_id))){
  const q=byId.get(c.card_id),p=layout.tabs.find(t=>t.key===tabKey[c.dashboard_tab_id]).placements.find(p=>p.row===c.row&&p.col===c.col);
  const want=p.params.filter(k=>q.mappings[k]).map(k=>JSON.stringify([k,q.mappings[k]])).sort(),got=c.parameter_mappings.map(m=>JSON.stringify([m.parameter_id,m.target])).sort();
  if(JSON.stringify(want)!==JSON.stringify(got))newBad.push({key:q.key,want,got});
 }
 const unmappedKeys=['today.attention','collection.board','collection.people','collection.lane-not-paid','collection.lane-partial','collection.lane-overdue','collection.lane-paid'];
 const mappedAnyway=d.dashcards.filter(c=>(unmappedKeys.map(k=>state.questions[k]).includes(c.card_id)||c.card_id===64)&&c.parameter_mappings.length).map(c=>c.card_id);
 (newBad.length||mappedAnyway.length?fail:pass)('new-question mappings; attention, board, people, lanes and 64 map nothing',{mismatched:newBad,mappedAnyway});
 // Execution with default filters
 const defaults=d.parameters.filter(p=>p.default!==undefined).map(p=>({id:p.id,type:p.type,value:p.default}));
 const results=new Map();let errors=0;const failed=[];
 for(const c of d.dashcards.filter(c=>c.card_id)){
  const ps=defaults.filter(p=>c.parameter_mappings.some(m=>m.parameter_id===p.id)).map(p=>({...p,target:c.parameter_mappings.find(m=>m.parameter_id===p.id).target}));
  const r=await dashQuery(state.dashboard,c,ps);results.set(c.id,r);
  if(r.status!=='completed'){errors++;failed.push({tab:tabKey[c.dashboard_tab_id],card:c.card_id,error:String(r.error).slice(0,160)});}
 }
 (errors?fail:pass)('execution',{dashcards:results.size,errors,failed});
 // Reused values against dashboard 3 at the same moment (up to ten per tab)
 const oldParams=new Map(baseline.parameters.map(p=>[p.id,p]));let sampled=0,diff=[];
 for(const t of layout.tabs){
  const cs=d.dashcards.filter(c=>c.dashboard_tab_id===state.tabs[t.key]&&c.card_id&&c.card_id!==276&&!Object.values(state.questions).includes(c.card_id)).slice(0,10);
  for(const c of cs){
   const old=[...d3.dashcards].sort((a,b)=>a.id-b.id).find(o=>o.card_id===c.card_id);
   const ps=old.parameter_mappings.filter(m=>c.parameter_mappings.some(n=>n.parameter_id===replaced[m.parameter_id])).map(m=>({id:m.parameter_id,type:oldParams.get(m.parameter_id).type,value:layout.parameters.find(p=>p.id===replaced[m.parameter_id]).default,target:m.target})).filter(p=>p.value!==null&&p.value!==undefined);
   // Query times differ by the seconds between the two requests; they are not compared.
   const strip=r=>JSON.stringify(r.data?.rows?.map(row=>row.map(v=>typeof v==='string'&&/\d\d:\d\d/.test(v)?'<time>':v)));
   const a=await dashQuery(3,old,ps),b=results.get(c.id);sampled++;
   if(strip(a)!==strip(b)&&strip(await dashQuery(3,old,ps))!==strip(await dashQuery(state.dashboard,c,defaults.filter(p=>c.parameter_mappings.some(m=>m.parameter_id===p.id)))))diff.push({tab:t.key,card:c.card_id});
  }
 }
 (diff.length?fail:pass)('reused values equal dashboard 3',{sampled,different:diff});
 // New-question reconciliations
 // References run through the question's own dashboard-3 dashcard with dashboard-3 filter ids (card-level parameters are ignored by this Metabase version).
 const ref=async(id,values={})=>{const old=[...d3.dashcards].sort((a,b)=>a.id-b.id).find(o=>o.card_id===id);assert(old,'question not on dashboard 3: '+id);const r=await dashQuery(3,old,Object.entries(values).map(([pid,value])=>({id:pid,type:oldParams.get(pid).type,value})));assert.equal(r.status,'completed');return r.data;};
 const run=async id=>(await api('POST',`card/${id}/query`,{parameters:[]})).data;
 const one=async(id,values)=>(await ref(id,values)).rows?.[0]?.[0]??null;
 const near=(a,b)=>a===b||(a!=null&&b!=null&&Math.abs(Number(a)-Number(b))<0.005);
 const objs=data=>data.rows.map(r=>Object.fromEntries(data.cols.map((c,i)=>[c.name,r[i]]))),sum=(rows,i)=>rows.reduce((t,r)=>t+Number(r[i]??0),0);
 const sortRows=rows=>rows.map(r=>JSON.stringify(r)).sort(),neg=x=>x==null?null:-x;
 const dc=key=>d.dashcards.find(c=>c.card_id===state.questions[key]);
 const resultRows=key=>results.get(dc(key).id).data.rows;
 const ovRows=(await run(73)).rows;assert.equal(ovRows.length,1);const ov=ovRows[0],ovCols=(await api('GET','card/73')).result_metadata.map(m=>m.name),ovv=n=>ov[ovCols.indexOf(n)];
 const realized=await one(51),projected=await one(52);
 (near(resultRows('today.realization')[0][0],ovv('Forecast Realization'))&&(projected?near(ovv('Forecast Realization'),realized/projected):true)?pass:fail)('today.realization',{equalsModel73:near(resultRows('today.realization')[0][0],ovv('Forecast Realization')),equals51over52:projected?near(ovv('Forecast Realization'),realized/projected):'projected 0'});
 const due=ovv('Amount Due Today'),got=ovv('Amount Collected Today');
 (near(resultRows('today.collection-rate')[0][0],ovv('Amount Collection Rate Today'))&&(due?near(ovv('Amount Collection Rate Today'),got/due):true)?pass:fail)('today.collection-rate',{equalsModel73:near(resultRows('today.collection-rate')[0][0],ovv('Amount Collection Rate Today')),dueToday:due?'non-zero':'zero'});
 const smart=resultRows('today.principal-smart'),q62=(await dashQuery(3,d3.dashcards.find(c=>c.card_id===62),[{id:'overview-trend-period',type:'date/all-options',value:'past30days',target:d3.dashcards.find(c=>c.card_id===62).parameter_mappings[0].target}])).data.rows;
 (near(smart.at(-1)[1],q62.at(-1)[1])&&near(smart[0][1],q62[0][1])&&smart.length===q62.length?pass:fail)('today.principal-smart',{days:smart.length,latestEquals62:near(smart.at(-1)[1],q62.at(-1)[1]),firstEquals62:near(smart[0][1],q62[0][1])});
  const firstSnap=(await api('POST','dataset',native('SELECT min("Date")::text, (min("Date")+1)::text, (min("Date")-3)::text FROM {{#205}}',[model(205)]))).data.rows[0];
 const past=firstSnap[1];
 for(const [key,col,todayCard] of [['cash.pool-selected','Total Cash Pool',47],['cash.principal-selected','Outstanding Principal',48]]){
  const id=state.questions[key],c=dc(key),ask=v=>dashQuery(state.dashboard,c,[{id:'position-date',type:'date/all-options',value:v,target:c.parameter_mappings[0].target}]).then(r=>r.data.rows[0]?.[0]??null);
  const today=await ask('today'),then=await ask(past),before=await ask(firstSnap[2]);
  const snap=(await api('POST','dataset',native(`SELECT "${col}" FROM {{#205}} WHERE "Date"=DATE '${past}' ORDER BY "Generated At" DESC NULLS LAST LIMIT 1`,[model(205)]))).data.rows[0]?.[0]??null;
  (near(today,await one(todayCard))&&near(then,snap)&&before===null?pass:fail)(key,{todayEquals:todayCard,pastDateEqualsModel205:near(then,snap),beforeOpeningsBlank:before===null});
 }
 // Previous-period tables: this period equals the live questions; previous equals them with the preceding range set by hand
 const range=async value=>{const r=await api('POST','dataset',{...native(`SELECT min(d."Date")::text,max(d."Date")::text,count(*) FROM public.reporting_statement_calendar d WHERE true [[AND {{p}}]]`,[{...dateTag('p','p')}]),parameters:[{type:'date/all-options',value,target:['dimension',['template-tag','p']]}]});return r.data.rows[0];};
 const shift=([s,e,n])=>{const day=x=>new Date(x+'T00:00:00Z'),iso=x=>x.toISOString().slice(0,10);const S=day(s);return `${iso(new Date(S-n*864e5))}~${iso(new Date(S-864e5))}`;};
 const stmt=await range('thismonth'),prevStmt=shift(stmt);
 const sp=v=>({'review-income':v});
 const inc=resultRows('income.vs-previous');
 const i168=await one(168,sp('thismonth')),i169=await one(169,sp('thismonth')),i170=await one(170,sp('thismonth')),i171=await one(171,sp('thismonth'));
 const p168=await one(168,sp(prevStmt)),p170=await one(170,sp(prevStmt));
 const incOk=near(inc[0][1],i168)&&near(inc[1][1],-i169)&&near(inc[2][1],i170)&&near(inc[3][1],i171)&&(inc[0][2]===null||near(inc[0][2],p168))&&(inc[2][2]===null||near(inc[2][2],p170));
 (incOk?pass:fail)('income.vs-previous',{thisEquals168to171:near(inc[0][1],i168)&&near(inc[2][1],i170),previousEqualsPrecedingRange:inc[0][2]===null?'before calendar':near(inc[0][2],p168),days:stmt[2]});
 const monthly=resultRows('income.monthly'),q213=await ref(213,{'review-income':'thismonth'});
 let monthlyOk=monthly.length>0;const q186=(await api('POST','dataset',native(`SELECT date_trunc('month',"Date")::date::text m,sum("Income"),sum("Expenses") FROM {{#186}} WHERE "Date">=date_trunc('month',(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date)-interval '5 months' GROUP BY 1 ORDER BY 1`,[model(186)]))).data.rows;
 for(const [i,row] of monthly.entries())monthlyOk&&=String(row[0]).startsWith(q186[i]?.[0])&&near(row[1],q186[i][1])&&near(row[2],q186[i][2]);
 (monthlyOk?pass:fail)('income.monthly',{months:monthly.length,equalsModel186MonthSums:monthlyOk,question213Rows:q213.rows.length});
 const cfc=dc('cashflow.by-type-row');let cfOk=true;const cfCases=[];
 for(const [period,account] of [['thismonth','__ALL__'],['past30days','__ALL__'],[prevStmt,'__ALL__']]){
  const a=(await dashQuery(state.dashboard,cfc,[{id:'statement-period',type:'date/all-options',value:period,target:tagTarget('cashflow_period')},{id:'account',type:'string/=',value:[account],target:tagTarget('cash_account','variable')}])).data.rows;
  const b=(await ref(203,{'review-flow':period,'review-account':[account]})).rows.filter(r=>r[0]!=='TOTAL'&&(Number(r[1])||Number(r[2])));
  const sorted=a.every((r,i)=>!i||Number(a[i-1][1])+Number(a[i-1][2])>=Number(r[1])+Number(r[2])),equal=JSON.stringify(sortRows(a))===JSON.stringify(sortRows(b));
  cfCases.push({period:period.includes('~')?'previous range':period,rows:a.length,equal,sortedByMovement:sorted});cfOk&&=equal&&sorted;
 }
 (cfOk?pass:fail)('cashflow.by-type-row',{cases:cfCases});
 const perf=resultRows('perf.vs-previous'),pp=v=>({'review-performance':v});
 const perfRange=await range('past30days'),prevPerf=shift(perfRange);
 const perfOk=perf.length===5&&near(perf[4][1],await one(234,pp('past30days')))&&near(perf[4][2],await one(234,pp(prevPerf)))&&near(perf[0][1],await one(217,pp('past30days')))&&near(perf[1][1],await one(218,pp('past30days')))&&near(perf[2][1],await one(219,pp('past30days')))&&near(perf[0][2],await one(217,pp(prevPerf)))&&near(perf[1][2],await one(218,pp(prevPerf)))&&near(perf[2][2],await one(219,pp(prevPerf)));
 (perfOk?pass:fail)('perf.vs-previous',{rows:perf.length,thisEquals217to219and234:perfOk,previousEqualsPrecedingRange:perfOk});
 const share=resultRows('partners.capital-share-row'),q331=(await ref(331)).rows;
 (JSON.stringify(share.map(r=>[r[0],r[2]]))===JSON.stringify(q331)&&near(share.reduce((s,r)=>s+r[1],0),1)?pass:fail)('partners.capital-share-row',{rows:share.length,equals331:JSON.stringify(share.map(r=>[r[0],r[2]]))===JSON.stringify(q331)});
 // Revision 2 questions (Archie's test plan; details are booleans and counts, no amounts)
 const att=resultRows('today.attention'),s162=objs(await run(162)),st=n=>s162.find(r=>r['Collection Status']===n)?.['Amount Remaining']??null;
 const attOk={people240_242_244_270:near(att[0]?.[1],await one(240))&&near(att[1]?.[1],await one(242))&&near(att[2]?.[1],await one(244))&&near(att[3]?.[1],await one(270)),
  overdueAmountEquals254:near(att[0]?.[2],await one(254)),leftEquals162:near(att[1]?.[2],st('Not Paid'))&&near(att[2]?.[2],st('Partially Paid')),
  tabIds:att[0]?.[4]===String(state.tabs.collection)&&att[1]?.[4]===String(state.tabs.collection)&&att[3]?.[4]===String(state.tabs.health),
  itemLink:JSON.stringify(dc('today.attention').visualization_settings).includes(`dashboard/${state.dashboard}?tab={{Tab}}`)};
 (att.length===4&&Object.values(attOk).every(Boolean)?pass:fail)('today.attention',{rows:att.length,...attOk});
 for(const [key,origin] of [['today.principal-top4',60],['today.interest-top4',61]]){
  const a=resultRows(key),b=(await ref(origin)).rows,r={bars:a.length,sumEquals:near(sum(a,1),sum(b,1)),firstFourEqual:a.slice(0,4).every((r,i)=>r[0]===b[i]?.[0]&&near(r[1],b[i][1])),othersLabel:a.length<=4||/^Others \(\d+\)$/.test(a[4][0])};
  (r.sumEquals&&r.firstFourEqual&&r.othersLabel&&a.length<=5?pass:fail)(key,r);
 }
 const ec=dc('income.expenses'),exp=async v=>(await dashQuery(state.dashboard,ec,[{id:'statement-period',type:'date/all-options',value:v,target:ec.parameter_mappings[0].target}])).data.rows[0]?.[0]??null;
 const expOk={thisMonthEqualsMinus169:near(await exp('thismonth'),neg(i169)),previousRangeEqualsMinus169:near(await exp(prevStmt),neg(await one(169,sp(prevStmt))))};
 (Object.values(expOk).every(Boolean)?pass:fail)('income.expenses',expOk);
 const topN=async(key,origin,cases)=>{
  const c=dc(key),old=firstDashcard(d3,origin),out=[];
  for(const vals of cases){
   const a=(await dashQuery(state.dashboard,c,c.parameter_mappings.filter(m=>m.parameter_id in vals).map(m=>({id:m.parameter_id,type:layout.parameters.find(p=>p.id===m.parameter_id).type,value:vals[m.parameter_id],target:m.target})))).data.rows;
   const b=(await dashQuery(3,old,old.parameter_mappings.filter(m=>replaced[m.parameter_id] in vals).map(m=>({id:m.parameter_id,type:oldParams.get(m.parameter_id).type,value:vals[replaced[m.parameter_id]],target:m.target})))).data.rows;
   const named=a.filter(r=>!String(r[0]).startsWith('Others'));
   out.push({case:Object.values(vals).flat().join(' · '),bars:a.length,sumEquals:near(sum(a,1),sum(b,1)),firstFiveEqual:named.length===Math.min(5,b.filter(r=>r[0]!=='Others').length)&&named.every((r,i)=>JSON.stringify(r)===JSON.stringify(b[i])),othersLabel:a.every(r=>r[0]!=='Others')});
  }
  (out.every(r=>r.sumEquals&&r.firstFiveEqual&&r.othersLabel)?pass:fail)(key,{cases:out});
 };
 await topN('borrowers.principal-top5',285,[{population:['All with loan history']},{population:['Currently active']}]);
 await topN('borrowers.interest-top5',286,[{period:'past30days',population:['All with loan history']},{period:'past7days',population:['Currently active']}]);
 const ppl=String(resultRows('collection.people')[0]?.[0]),[x,n]=(ppl.match(/^(\d+) of (\d+) paid$/)??[]).slice(1).map(Number),q239=await one(239);
 const pplOk={format:x!==undefined,firstEquals246:near(x,await one(246)),ratioEquals239:n?near(x/n,q239):q239==null};
 (Object.values(pplOk).every(Boolean)?pass:fail)('collection.people',pplOk);
 const board=objs(results.get(dc('collection.board').id).data),lanes=[['🔴 Not paid',242,'collection.lane-not-paid',243],['🟠 Partially paid',244,'collection.lane-partial',245],['🟣 Overdue',240,'collection.lane-overdue',241],['🟢 Fully paid',246,'collection.lane-paid',247]];
 const boardOk={order:JSON.stringify(board.slice(0,4).map(r=>r.Lane))===JSON.stringify(lanes.map(l=>l[0])),people242_244_240_246:true,unclassifiedEquals251:near(board.filter(r=>r.Lane.startsWith('⚪')).reduce((t,r)=>t+Number(r.People),0),(await one(251))??0),leftEqualsLaneSums:true};
 for(const [label,id,key] of lanes){
  const row=board.find(r=>r.Lane===label),lane=objs(results.get(dc(key).id).data);boardOk.people242_244_240_246&&=near(row?.People,await one(id));
  if(lane[0]&&'Amount Remaining' in lane[0])boardOk.leftEqualsLaneSums&&=near(row?.['Left ฿'],lane.reduce((t,r)=>t+Number(r['Amount Remaining']??0),0));
 }
 (Object.values(boardOk).every(Boolean)?pass:fail)('collection.board',boardOk);
 const laneRes=[];
 for(const [,,key,origin] of lanes){
  const a=objs(results.get(dc(key).id).data),b=objs(await ref(origin)),cols=a[0]?Object.keys(a[0]).filter(k=>!b[0]||k in b[0]):[],by=layout.new_questions[key].query['order-by'][0][1][1];
  const proj=rows=>rows.map(r=>JSON.stringify(cols.map(k=>r[k]))).sort();
  laneRes.push({key,rows:a.length,sameRowsAsOrigin:a.length===b.length&&JSON.stringify(proj(a))===JSON.stringify(proj(b)),sortedBy:by,sorted:a.every((r,i)=>!i||Number(a[i-1][by])>=Number(r[by]))});
 }
 (laneRes.every(r=>r.sameRowsAsOrigin&&r.sorted)?pass:fail)('collection lanes equal origins, resorted',{lanes:laneRes});
 const stm=objs(results.get(dc('partners.statement').id).data),q330=objs(await ref(330));
 const measures={'Net capital ฿':'Net capital ฿','Net earned to date ฿':'Net earned ฿','Completed payouts ฿':'Paid ฿','Pending settlements ฿':'Pending ฿','Net available ฿':'Net available ฿'};
 const cells=q330.flatMap(r=>Object.entries(measures).map(([m,col])=>[m,r.Partner,r[col]]));
 (stm.length===cells.length&&cells.every(([m,p,v])=>near(stm.find(x=>x.Measure===m&&x.Partner===p)?.['Amount ฿'],v))?pass:fail)('partners.statement',{cells:stm.length,partners:q330.length,everyCellEquals330:cells.every(([m,p,v])=>near(stm.find(x=>x.Measure===m&&x.Partner===p)?.['Amount ฿'],v))});
 // Click-through and preservation
 const links=d.dashcards.flatMap(c=>JSON.stringify(c.visualization_settings).match(/dashboard\/\d+\?tab=\d+[^"\\]*/g)??[]);
 (links.length&&links.every(l=>l.startsWith(`dashboard/${state.dashboard}?tab=`))?pass:fail)('links target the proposed dashboard',{links:links.length,toDashboard3:links.filter(l=>l.startsWith('dashboard/3?')).length});
 pass('dashboard 3 preserved',{dashcards:d3.dashcards.length,tabs:d3.tabs.length,parameters:d3.parameters.length});
 const saved={dashboard:state.dashboard,collection:state.collection,tabs:d.tabs.map(({id,name,position})=>({id,name,position,key:tabKey[id]})),parameters:d.parameters,questions:await Promise.all(Object.entries(state.questions).map(async([key,id])=>{const c=await api('GET','card/'+id);return {key,id,name:c.name,display:c.display,description:c.description,dataset_query:c.dataset_query,visualization_settings:c.visualization_settings};})),layout:shape(d).map(c=>({...c,visualization_settings:redact(c.visualization_settings)}))};
 save('saved',saved);
 const passed=checks.every(c=>c.passed);
 save('verification',{at:new Date().toISOString(),passed,checks,financialValuesPublished:false});
 console.log(JSON.stringify({passed,failed:checks.filter(c=>!c.passed)},null,1));
}
