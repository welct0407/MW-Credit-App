// Loan Reports · proposed: parallel redesign of dashboard 3 for owner review. Reads layout.json; never writes dashboard 3.
// --prepare captures the private baseline; --publish creates the collection, ten questions and the dashboard once;
// --refine --only=<question key|tab key>,... re-applies state-owned objects; --verify checks structure, parity and preservation.
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
 FROM totals t CROSS JOIN LATERAL (VALUES (1,'Gross interest',t.interest),(2,'Principal issued',t.issued),(3,'Loans issued',t.loans::numeric),(4,'Principal returned',t.returned)) v(ord,metric,amount)
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
// The ten new questions. dataset_query for the two copies (cashflow.by-type-row, partners.capital-share-row) is read from the live source question.
export function questions(sources={}){
 const q203=sources[203],q331=sources[331];
 const sql=c=>c?.dataset_query?.stages?.[0]?.native??c?.dataset_query?.native?.query;
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
  'cashflow.by-type-row':{dataset_query:q203&&native(`SELECT * FROM (${sql(q203)}) t WHERE t."Transaction Type"<>'TOTAL'`,[{id:'lrp-cashflow-period',name:'cashflow_period','display-name':'Statement period',type:'dimension',dimension:['field',82,null],'widget-type':'date/all-options',alias:'d."Date"'},{id:'lrp-cash-account',name:'cash_account','display-name':'Account',type:'text',required:true,default:'__ALL__'},{id:'lrp-snippet-3',name:'snippet: Cashflow statement period','display-name':'Cashflow statement period',type:'snippet','snippet-name':'Cashflow statement period','snippet-id':3}]),
   visualization_settings:{'graph.dimensions':['Transaction Type'],'graph.metrics':['Money In','Money Out'],'graph.show_values':true,'graph.label_value_formatting':'compact','graph.colors':['#178F8A','#D6816B'],column_settings:fmt(['Money In','Money Out'])},mappings:{'statement-period':tagTarget('cashflow_period'),account:tagTarget('cash_account','variable')}},
  'perf.vs-previous':{dataset_query:native(perfSql,[model(70),model(71),dateTag('performance_period','Performance period')]),visualization_settings:{...compareTable,column_settings:{...compareTable.column_settings}},mappings:{period:tagTarget('performance_period')}},
  'partners.capital-share-row':{dataset_query:q331&&native(`SELECT "Partner","Net capital ฿"/nullif(sum("Net capital ฿") OVER (),0) AS "Capital share %","Net capital ฿" FROM (${sql(q331)}) t`,[{id:'lrp-partner',name:'partner','display-name':'Partner',type:'dimension',dimension:['field',121,null],'widget-type':'string/=',alias:'d.partner_id'},model(318)]),
   visualization_settings:{'graph.dimensions':['Partner'],'graph.metrics':['Capital share %'],'graph.show_values':true,'graph.show_legend':false,'graph.colors':['#178F8A','#7472BE','#D6816B','#D4AD60'],'graph.y_axis.min':0,'graph.y_axis.max':1,column_settings:{...fmt(['Capital share %'],pct),...fmt(['Net capital ฿'])}},mappings:{partner:tagTarget('partner')}}
 };
 return Object.entries(layout.new_questions).map(([key,d])=>({key,name:d.name,display:d.display,description:`Loan Reports · proposed (${key}). ${d.definition} Basis: ${d.basis}.`,...spec[key]}));
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
const relink=(text,state)=>text.replaceAll(`${site}/dashboard/3?tab=105&bd_borrower=`,`${site}/dashboard/${state.dashboard}?tab=${state.tabs['borrower-detail']}&borrower=`).replaceAll('&bd_activity=','&period=');
function rewrite(o,state){
 if(typeof o==='string')return relink(o,state);
 if(Array.isArray(o))return o.map(v=>rewrite(v,state));
 if(o&&typeof o==='object')return Object.fromEntries(Object.entries(o).map(([k,v])=>[k,rewrite(v,state)]));
 return o;
}
const goals={62:{'graph.show_goal':true,'graph.goal_value':120000,'graph.goal_label':'Principal reference 120,000'},222:{'graph.show_goal':true,'graph.goal_value':10000,'graph.goal_label':'Daily interest goal 10,000'}};
const order275=['Category','Borrower','Payment score /100','Contribution ×','Schedule'];
function placements(tab,state,baseline,live1501){
 const byCard=new Map();for(const c of [...baseline.dashcards].sort((a,b)=>a.id-b.id))if(c.card_id&&!byCard.has(c.card_id))byCard.set(c.card_id,c);
 const cardTab=new Map();for(const t of layout.tabs)for(const p of t.placements)if(p.reuse_card_id&&t.key!=='today'&&!cardTab.has(p.reuse_card_id))cardTab.set(p.reuse_card_id,t.key);
 const tabId=state.tabs[tab.key];let id=-1-1000*tab.position;
 return tab.placements.map(p=>{
  const base={id:id--,dashboard_tab_id:tabId,row:p.row,col:p.col,size_x:p.size_x,size_y:p.size_y,series:[]};
  if(p.virtual)return {...base,card_id:null,parameter_mappings:[],visualization_settings:{'card.background':false,virtual_card:{display:p.virtual,visualization_settings:{text:p.text,...(p.virtual==='text'?{'text.align_vertical':'middle'}:{})}},text:p.text}};
  if(p.copy_dashcard){assert.equal(p.copy_dashcard,1501);return {...base,card_id:null,parameter_mappings:[],visualization_settings:structuredClone(live1501.visualization_settings)};}
  if(p.new_question){
   const q=questions().find(q=>q.key===p.new_question),card=state.questions[p.new_question];
   return {...base,card_id:card,parameter_mappings:p.params.filter(k=>q.mappings[k]).map(k=>({parameter_id:k,card_id:card,target:q.mappings[k]})),visualization_settings:{'card.title':p.title}};
  }
  const old=byCard.get(p.reuse_card_id);
  const vs=rewrite(structuredClone(old?.visualization_settings??{}),state);
  vs['card.title']=p.title;
  if(goals[p.reuse_card_id])Object.assign(vs,goals[p.reuse_card_id]);
  // Visualizer-format placements render from their inner settings, so the title and goal go there too.
  if(vs.visualization?.settings){vs.visualization.settings['card.title']=p.title;if(goals[p.reuse_card_id])Object.assign(vs.visualization.settings,goals[p.reuse_card_id]);}
  if(p.reuse_card_id===275&&tab.key==='health'){const cols=state.cardColumns?.[275]??[];vs['table.columns']=[...order275,...cols.filter(c=>!order275.includes(c))].filter(c=>cols.includes(c)).map(name=>({name,enabled:name!=='Borrower ID'}));}
  // Today's attention chips (row 10) open the proposed tab that holds the same question.
  if(tab.key==='today'&&p.row===10&&cardTab.has(p.reuse_card_id))vs.click_behavior={type:'link',linkType:'url',linkTemplate:`${site}/dashboard/${state.dashboard}?tab=${state.tabs[cardTab.get(p.reuse_card_id)]}`};
  const mappings=[];
  for(const m of old?.parameter_mappings??[]){const pid=replaced[m.parameter_id];if(p.params.includes(pid)&&!mappings.some(x=>x.parameter_id===pid))mappings.push({parameter_id:pid,card_id:p.reuse_card_id,target:m.target});}
  return {...base,card_id:p.reuse_card_id,series:(old?.series??[]).map(s=>({id:s.id})),parameter_mappings:mappings,visualization_settings:vs};
 });
}
const redact=vs=>JSON.parse(JSON.stringify(vs).replace(/#key=[^"\\]+/g,'#key=<private>'));
async function liveSources(){return {203:await api('GET','card/203'),331:await api('GET','card/331')};}
async function guardDashboard3(){
 const baseline=read('dashboard-3-before',priv),live=await api('GET','dashboard/3');
 assert.deepEqual(shape(live),shape(baseline),'dashboard 3 dashcards changed since the baseline');assert.deepEqual(live.tabs,baseline.tabs);assert.deepEqual(live.parameters,baseline.parameters);
 return {baseline,live};
}
async function applyTabs(state,baseline,only){
 const d=await api('GET','dashboard/'+state.dashboard);
 const live1501=(await api('GET','dashboard/3')).dashcards.find(c=>c.id===1501);assert(live1501?.visualization_settings?.virtual_card?.display==='iframe','dashcard 1501 matrix iframe missing');
 const keep=d.dashcards.filter(c=>only&&!only.includes(layout.tabs.find(t=>state.tabs[t.key]===c.dashboard_tab_id)?.key));
 const fresh=layout.tabs.filter(t=>!only||only.includes(t.key)).flatMap(t=>placements(t,state,baseline,live1501));
 await api('PUT','dashboard/'+state.dashboard,{tabs:d.tabs.map(({id,name,position})=>({id,name,position})),dashcards:[...keep,...fresh]});
}
const args=process.argv.slice(2),only=(args.find(a=>a.startsWith('--only='))||'').slice(7).split(',').filter(Boolean);
if(args.includes('--plan')){
 const q=questions();console.log(JSON.stringify({tabs:layout.tabs.length,placements:layout.tabs.reduce((n,t)=>n+t.placements.length,0),parameters:layout.parameters.length,questions:q.map(x=>x.key),reused:layout.summary.reused_questions.length}));
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
 const specs=questions(sources);
 for(const s of specs){const r=await api('POST','dataset',s.dataset_query);if(r.status!=='completed'){save('query-error',r,priv);throw Error('query failed: '+s.key);}}
 const collection=await api('POST','collection',{...layout.dashboard.collection});
 const state={collection:collection.id,questions:{},tabs:{},cardColumns:{275:(await api('GET','card/275')).result_metadata.map(m=>m.name)}};save('state',state);
 for(const s of specs){const {key,mappings,...body}=s;const c=await api('POST','card',{...body,type:'question',collection_id:collection.id});state.questions[key]=c.id;save('state',state);}
 const dash=await api('POST','dashboard',{name:layout.dashboard.name,description:layout.dashboard.description,collection_id:collection.id});state.dashboard=dash.id;save('state',state);
 await api('PUT','dashboard/'+dash.id,{parameters:parameters(baseline),auto_apply_filters:layout.dashboard.auto_apply_filters,width:'fixed',tabs:layout.tabs.map(t=>({id:-1-t.position,name:t.name,position:t.position})),dashcards:[]});
 const withTabs=await api('GET','dashboard/'+dash.id);for(const t of layout.tabs)state.tabs[t.key]=withTabs.tabs.find(x=>x.name===t.name).id;save('state',state);
 await applyTabs(state,baseline);
 await guardDashboard3();
 console.log(JSON.stringify({dashboard:dash.id,collection:collection.id,questions:Object.keys(state.questions).length,tabs:Object.keys(state.tabs).length}));
}
if(args.includes('--refine')){
 await assertSource();assert(only.length,'--refine needs --only=<keys>');const state=read('state'),{baseline}=await guardDashboard3(),specs=questions(await liveSources());
 const qs=only.filter(k=>state.questions[k]),tabs=only.filter(k=>state.tabs[k]);assert.equal(qs.length+tabs.length,only.length,'unknown key in --only');
 for(const k of qs){const {key,mappings,...body}=specs.find(s=>s.key===k);const c=await api('GET','card/'+state.questions[k]);save('question-before-refine-'+c.id,c,priv);await api('PUT','card/'+c.id,body);}
 if(tabs.length){save('proposed-before-refine',await api('GET','dashboard/'+state.dashboard),priv);await applyTabs(state,baseline,tabs);}
 await guardDashboard3();console.log(JSON.stringify({refined:only}));
}
const dashQuery=(dash,dc,parameters=[])=>api('POST',`dashboard/${dash}/dashcard/${dc.id}/card/${dc.card_id}/query`,{parameters});
if(args.includes('--verify')){
 await assertSource();const state=read('state'),{baseline,live:d3}=await guardDashboard3(),d=await api('GET','dashboard/'+state.dashboard);
 const checks=[],fail=(name,detail)=>checks.push({name,passed:false,detail}),pass=(name,detail)=>checks.push({name,passed:true,...(detail?{detail}:{})});
 // Structure
 const tabKey=Object.fromEntries(Object.entries(state.tabs).map(([k,v])=>[v,k]));
 let missing=0;for(const t of layout.tabs)for(const p of t.placements){const card=p.reuse_card_id??state.questions[p.new_question]??null;if(!d.dashcards.some(c=>c.dashboard_tab_id===state.tabs[t.key]&&c.row===p.row&&c.col===p.col&&c.size_x===p.size_x&&c.size_y===p.size_y&&c.card_id===card))missing++;}
 (d.tabs.length===12&&d.dashcards.length===240&&d.parameters.length===22&&!missing?pass:fail)('structure',{tabs:d.tabs.length,placements:d.dashcards.length,parameters:d.parameters.length,unmatched:missing});
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
 const collectionUnmapped=d.dashcards.filter(c=>c.dashboard_tab_id===state.tabs.collection&&[241,243,245,247,64].includes(c.card_id)&&c.parameter_mappings.length);
 (collectionUnmapped.length?fail:pass)('collection lanes and 64 map nothing',{mapped:collectionUnmapped.map(c=>c.card_id)});
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
  const b=(await ref(203,{'review-flow':period,'review-account':[account]})).rows.filter(r=>r[0]!=='TOTAL');
  cfCases.push({period:period.includes('~')?'previous range':period,equal:JSON.stringify(a)===JSON.stringify(b)});cfOk&&=JSON.stringify(a)===JSON.stringify(b);
 }
 (cfOk?pass:fail)('cashflow.by-type-row',{cases:cfCases});
 const perf=resultRows('perf.vs-previous'),pp=v=>({'review-performance':v});
 const perfRange=await range('past30days'),prevPerf=shift(perfRange);
 const perfOk=near(perf[0][1],await one(217,pp('past30days')))&&near(perf[1][1],await one(218,pp('past30days')))&&near(perf[2][1],await one(219,pp('past30days')))&&near(perf[0][2],await one(217,pp(prevPerf)))&&near(perf[1][2],await one(218,pp(prevPerf)))&&near(perf[2][2],await one(219,pp(prevPerf)));
 (perfOk?pass:fail)('perf.vs-previous',{thisEquals217to219:true,previousEqualsPrecedingRange:perfOk});
 const share=resultRows('partners.capital-share-row'),q331=(await ref(331)).rows;
 (JSON.stringify(share.map(r=>[r[0],r[2]]))===JSON.stringify(q331)&&near(share.reduce((s,r)=>s+r[1],0),1)?pass:fail)('partners.capital-share-row',{rows:share.length,equals331:JSON.stringify(share.map(r=>[r[0],r[2]]))===JSON.stringify(q331)});
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
