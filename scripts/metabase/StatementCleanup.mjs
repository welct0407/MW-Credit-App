// R016 canonical cash pages. Baseline is private; exact saved queries/layout are published without result rows.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {api,assertSource,privateDir,root,read,write} from './ReportingApi.mjs';
export const backup=privateDir+'/statement-cleanup-before';
export const prior=n=>JSON.parse(fs.readFileSync(`${backup}/${n}.json`));
const fmt=names=>({column_settings:Object.fromEntries(names.map(n=>[JSON.stringify(['name',n]),{number_style:'decimal',decimals:0,number_separators:'.,',compact:false}]))});
const dateTag=n=>({id:'r016-'+n,name:n,'display-name':'Statement period',type:'dimension',dimension:['field',82,null],'widget-type':'date/all-options',alias:'d."Date"'});
const cardTag=id=>({id:'r016-model-'+id,name:'#'+id,'display-name':'Model '+id,type:'card','card-id':id});
const account={id:'r016-cash-account',name:'cash_account','display-name':'Account',type:'text',required:true,default:'__ALL__'};
const native=(query,tags={})=>({database:2,type:'native',native:{query,'template-tags':tags}});
const snippetTag=(name,id)=>({id:'r016-snippet-'+id,name:'snippet: '+name,'display-name':name,type:'snippet','snippet-id':id,'snippet-name':name});
const itags={statement_period:dateTag('statement_period'),'#186':cardTag(186),'snippet: Income statement period':snippetTag('Income statement period',2)};
const ftags={cashflow_period:dateTag('cashflow_period'),cash_account:account,'snippet: Cashflow statement period':snippetTag('Cashflow statement period',3)};
const inc=q=>native('WITH statement AS ({{snippet: Income statement period}}) '+q,itags);
const flow=q=>native('WITH statement AS ({{snippet: Cashflow statement period}}) '+q,ftags);
const status=(selection,extra='')=>`SELECT v.detail AS "Detail",v.value AS "Value" FROM statement s CROSS JOIN LATERAL (VALUES
 (1,'Period',coalesce(to_char(s."Period Start",'YYYY-MM-DD')||' → '||to_char(s."Period End",'YYYY-MM-DD'),'Unavailable')),
 (2,'Source','Live on report refresh'),(3,'Queried at',to_char(s."Queried At",'YYYY-MM-DD HH24:MI')),
 (4,'Status',s."${selection}")${extra}) v(step,detail,value) ORDER BY v.step`;
export const specs=[
 ...[[168,'Operating income','Operating Income'],[169,'Operating expenses','Operating Expenses'],[170,'Net profit','Net Profit'],[171,'Average daily net profit','Average Daily Net Profit']].map(([id,name,field])=>({id,key:'q'+id,name,display:'scalar',dataset_query:inc(`SELECT "${field}" FROM statement`),visualization_settings:{'scalar.field':field,...fmt([field])}})),
 {id:184,key:'income-status',name:'Income period & freshness',display:'table',dataset_query:inc(status('Selection Status')),visualization_settings:{'table.pivot':false}},
 {id:204,key:'profit-bridge',name:'Income less expenses · Total = Net profit',display:'waterfall',dataset_query:inc(`SELECT v.movement AS "Movement",v.amount AS "Amount" FROM statement s CROSS JOIN LATERAL (VALUES (1,'Income',s."Operating Income"),(2,'Expenses',s."Operating Expenses")) v(step,movement,amount) ORDER BY v.step`),visualization_settings:prior('card-204').visualization_settings},
 {id:178,key:'expense-category',name:'Expenses by category · live period',display:'row',dataset_query:{...inc('SELECT e."Expense Category",sum(e."Expense Amount") AS "Expenses" FROM statement s JOIN {{#163}} e ON e."Expense Date" BETWEEN s."Period Start" AND s."Period End" WHERE s."Continuous Period" GROUP BY 1 ORDER BY 2 DESC,1'),native:{...inc('').native,query:'WITH statement AS ({{snippet: Income statement period}}) SELECT e."Expense Category",sum(e."Expense Amount") AS "Expenses" FROM statement s JOIN {{#163}} e ON e."Expense Date" BETWEEN s."Period Start" AND s."Period End" WHERE s."Continuous Period" GROUP BY 1 ORDER BY 2 DESC,1','template-tags':{...itags,'#163':cardTag(163)}}},visualization_settings:{'graph.dimensions':['Expense Category'],'graph.metrics':['Expenses'],'graph.colors':['#D1495B'],'graph.show_values':true,...fmt(['Expenses'])}},
 {key:'expense-detail',name:'Expense detail · live period',display:'table',dataset_query:native('WITH statement AS ({{snippet: Income statement period}}) SELECT e."Expense Date",e."Expense Category",e."Expense Amount" AS "Expenses",e."Expense ID" FROM statement s JOIN {{#163}} e ON e."Expense Date" BETWEEN s."Period Start" AND s."Period End" WHERE s."Continuous Period" ORDER BY e."Expense Date",e."Expense ID"',{...itags,'#163':cardTag(163)}),visualization_settings:{'table.pivot':false,...fmt(['Expenses'])}},
 ...[[195,'Opening cash','Opening Balance'],[192,'Money in','Money In'],[193,'Money out','Money Out'],[197,'Closing cash','Closing Balance'],[194,'Net cash movement','Net Movement']].map(([id,name,field])=>({id,key:'q'+id,name,display:'scalar',dataset_query:flow(`SELECT "${field}" FROM statement`),visualization_settings:{'scalar.field':field,...fmt([field])}})),
 {id:198,key:'flow-status',name:'Cashflow period & freshness',display:'table',dataset_query:flow(status('Statement Status',`,(5,'Account',coalesce(s."Account",'Unavailable')),(6,'Known opening from',coalesce(to_char(s."Available From",'YYYY-MM-DD'),'Unknown'))`)),visualization_settings:{'table.pivot':false}},
 {id:203,key:'movement',name:'Cash movement by transaction type',display:'table',dataset_query:flow(`SELECT CASE WHEN grouping(t."Transaction Type")=1 THEN 'TOTAL' ELSE t."Transaction Type" END AS "Transaction Type",coalesce(sum(t."Money In"),0) AS "Money In",coalesce(sum(t."Money Out"),0) AS "Money Out",coalesce(sum(t."Net Movement"),0) AS "Net Movement" FROM statement s LEFT JOIN LATERAL public.reporting_cash_period_entries(s."Period Start",s."Period End",{{cash_account}}) t ON true WHERE s."Continuous Period" GROUP BY GROUPING SETS ((t."Transaction Type"),()) HAVING bool_or(s."Continuous Period") AND (grouping(t."Transaction Type")=1 OR count(t."Entry ID")>0) ORDER BY grouping(t."Transaction Type"),1`),visualization_settings:{'table.pivot':false,...fmt(['Money In','Money Out','Net Movement'])}},
 {id:196,key:'transactions',name:'Transactions · chronological order',display:'table',dataset_query:flow(`SELECT to_char(t."Date",'DD/MM')||' '||to_char(t."Posted At",'HH24:MI') AS "Date / Time",t."Transaction Type",t."Counterparty",t."Money In",t."Money Out",t."Balance After",t."From Account",t."To Account",t."Notes" FROM statement s CROSS JOIN LATERAL public.reporting_cash_period_entries(s."Period Start",s."Period End",{{cash_account}}) t WHERE s."Continuous Period" ORDER BY t."Date",t."Posted At",t."Ledger ID" COLLATE "C",t."Entry ID" COLLATE "C"`),visualization_settings:prior('card-196').visualization_settings},
 {id:199,key:'accounts',name:'Cash account selector',display:'table',dataset_query:native('SELECT id AS "Scope ID",label AS "Account" FROM public.reporting_cash_scopes ORDER BY id'),visualization_settings:{}}
];
for(const id of [195,197]){
 const spec=specs.find(s=>s.id===id),field=id===195?'Opening Balance':'Closing Balance';
 spec.dataset_query=flow(`SELECT "${field}",coalesce(to_char("${field}",'FM999,999,999,999,990'),'Unavailable') AS "Display Balance" FROM statement`);
 spec.visualization_settings['scalar.field']='Display Balance';
}
specs.find(s=>s.key==='expense-detail').visualization_settings['table.columns']=['Expense Date','Expense Category','Expenses','Expense ID'].map(name=>({name,enabled:name!=='Expense ID'}));
const trendQuery=(income)=>native(`WITH selected AS (SELECT d."Date" FROM public.reporting_statement_calendar d WHERE d."Date"<public.olap_reporting_date() [[AND {{${income?'statement_period':'cashflow_period'}}}]])
 SELECT d."Date",${income?'s."Income",s."Expenses"':'CASE WHEN {{cash_account}}=\'__ALL__\' THEN s."Money In" ELSE a."Money In" END AS "Money In",CASE WHEN {{cash_account}}=\'__ALL__\' THEN s."Money Out" ELSE a."Money Out" END AS "Money Out"'},
 ${income?'s."Generated At"':'CASE WHEN {{cash_account}}=\'__ALL__\' THEN s."Generated At" ELSE a."Generated At" END'} AS "Generated At"
 FROM selected d LEFT JOIN {{#205}} s ON s."Date"=d."Date"${income?'':' LEFT JOIN {{#206}} a ON a."Date"=d."Date" AND a."Cash Account ID"={{cash_account}}'} ORDER BY d."Date"`,{[income?'statement_period':'cashflow_period']:dateTag(income?'statement_period':'cashflow_period'),'#205':cardTag(205),...(income?{}:{cash_account:account,'#206':cardTag(206)})});
for(const income of [true,false]){
 const base=trendQuery(income),metrics=income?['Income','Expenses']:['Money In','Money Out'];
 specs.push({key:income?'income-trend':'flow-trend',name:income?'Daily income & expenses · hourly snapshots':'Daily cash movement · hourly snapshots',display:'bar',dataset_query:base,visualization_settings:{'graph.dimensions':['Date'],'graph.metrics':metrics,'graph.colors':income?['#13855B','#D1495B']:['#13855B','#D1495B'],'graph.show_legend':true,'graph.missing':'none',...(income?{'graph.y_axis.auto_split':false}:{}),'series_settings':income?{Income:{display:'bar',color:'#13855B'},Expenses:{display:'bar',color:'#D1495B'}}:{},...fmt(metrics)}});
 specs.push({key:income?'income-snapshot-status':'flow-snapshot-status',name:income?'Profit trend snapshot freshness':'Cash trend snapshot freshness',display:'table',dataset_query:{...base,native:{...base.native,query:`WITH trend AS (${base.native.query}), totals AS (SELECT count(*) n,count(*) FILTER(WHERE "Generated At" IS NULL) missing,min("Generated At") oldest,max("Generated At") latest FROM trend) SELECT v.detail AS "Detail",v.value AS "Value" FROM totals CROSS JOIN LATERAL (VALUES (1,'Completed dates',n::text),(2,'Missing snapshots',missing::text),(3,'Oldest refresh',coalesce(to_char(oldest,'YYYY-MM-DD HH24:MI'),'Unavailable')),(4,'Latest refresh',coalesce(to_char(latest,'YYYY-MM-DD HH24:MI'),'Unavailable'))) v(step,detail,value) ORDER BY step`}},visualization_settings:{'table.pivot':false}});
}

export function layout(d,state){
 const out=[];let next=-1;
 const note=(tab,row,text,h=2)=>out.push({id:next--,card_id:null,dashboard_tab_id:tab,col:0,row,size_x:24,size_y:h,series:[],parameter_mappings:[],visualization_settings:{'card.background':false,virtual_card:{display:h===1?'heading':'text',visualization_settings:{text}}}});
 const place=(tab,id,col,row,w,h,title)=>out.push({id:d.dashcards.find(c=>c.dashboard_tab_id===tab&&c.card_id===id)?.id??next--,card_id:id,dashboard_tab_id:tab,col,row,size_x:w,size_y:h,series:[],parameter_mappings:[{parameter_id:tab===16?'review-income':'review-flow',card_id:id,target:['dimension',['template-tag',tab===16?'statement_period':'cashflow_period']]},...(tab===15?[{parameter_id:'review-account',card_id:id,target:['variable',['template-tag','cash_account']]}]:[])],visualization_settings:{'card.title':title}});
 note(16,0,'Income statement · live on refresh',1);note(16,1,'Net profit = interest − expenses. Amounts in baht.');
 [[168,'Income'],[169,'Expenses'],[170,'Net profit']].forEach(([id,t],j)=>place(16,id,j*8,3,8,3,t));
 place(16,184,0,6,16,6,'Period & freshness');place(16,171,16,6,8,3,'Average daily net profit');
 note(16,12,'Average uses calendar days. Live figures include later corrections.');
 place(16,204,0,14,24,6,'Income − expenses = net profit');place(16,178,0,20,24,6,'Expenses by category');
 place(16,state.cards['expense-detail'],0,26,24,7,'Expense detail · live');
 note(16,33,'Historical daily trend · hourly snapshots',1);note(16,34,'Completed days only. Gaps stay blank; corrections need a refresh.');
 place(16,state.cards['income-trend'],0,36,24,7,'Daily income & expenses');place(16,state.cards['income-snapshot-status'],0,43,24,6,'Snapshot coverage & actual refresh times');
 note(15,0,'Cashflow statement · live on refresh',1);note(15,1,'All accounts nets transfers to zero. Amounts in baht.');
 [[195,'Opening cash'],[192,'Money in'],[193,'Money out'],[197,'Closing cash']].forEach(([id,t],j)=>place(15,id,j*6,3,6,3,t));
 place(15,198,0,6,16,8,'Period, account & freshness');place(15,194,16,6,8,3,'Net cash movement');
 note(15,14,'Opening + in − out = closing. Unknown openings are unavailable.');
 place(15,203,0,16,24,8,'Cash movement by type · includes total');
 note(15,24,'Historical daily movement · hourly snapshots',1);note(15,25,'Completed days only. Transfers cancel in All accounts.');
 place(15,state.cards['flow-trend'],0,27,24,7,'Daily money in & money out');place(15,state.cards['flow-snapshot-status'],0,34,24,6,'Snapshot coverage & actual refresh times');
 place(15,196,0,40,24,12,'Transactions · live chronological balances');
 note(15,52,'Statement date + posting time. Repayments keep their recorded type.');
 return out;
}

if(process.argv.includes('--income-chart-refine')){
 await assertSource();
 const state=read('statement-cleanup-state.json');
 const baselineDir=privateDir+'/income-chart-refinement-before-20260924';
 const previous=id=>JSON.parse(fs.readFileSync(`${baselineDir}/card-${id}.json`));
 const updates=[[178,'expense-category'],[state.cards['income-trend'],'income-trend'],[state.cards['income-snapshot-status'],'income-snapshot-status']];
 const sql=q=>q.native?.query??q.stages?.[0]?.native;
 for(const [id,key] of updates){
  const current=await api('GET',`card/${id}`),before=previous(id),spec=specs.find(s=>s.key===key);
  const unchanged=current.display===before.display&&sql(current.dataset_query)===sql(before.dataset_query);
  const updated=current.display===spec.display&&sql(current.dataset_query)===sql(spec.dataset_query);
  assert.ok(unchanged||updated,`Card ${id} changed unexpectedly since rollback capture`);
 }
 const dashboard=await api('GET','dashboard/3');
 const baseline=JSON.parse(fs.readFileSync(`${baselineDir}/dashboard.json`));
 const shape=items=>items.map(c=>({id:c.id,card_id:c.card_id,dashboard_tab_id:c.dashboard_tab_id,col:c.col,row:c.row,size_x:c.size_x,size_y:c.size_y,parameter_mappings:c.parameter_mappings,visualization_settings:c.dashboard_tab_id===16&&c.card_id===state.cards['income-trend']?{...c.visualization_settings,'card.title':'Daily income, expenses & net profit'}:c.visualization_settings})).sort((a,b)=>a.id-b.id);
 assert.ok(JSON.stringify(shape(dashboard.dashcards))===JSON.stringify(shape(baseline.dashcards)),'Dashboard placement changed since rollback capture');
 const trend=specs.find(s=>s.key==='income-trend');
 const result=await api('POST','dataset',trend.dataset_query);
 assert.equal(result.status,'completed');
 assert.ok(!result.data.rows_truncated);
 assert.deepEqual(result.data.cols.map(c=>c.name),['Date','Income','Expenses','Generated At']);
 for(const [id,key] of updates){
  const spec=specs.find(s=>s.key===key);
  const current=await api('GET',`card/${id}`);
  if(current.display!==spec.display||sql(current.dataset_query)!==sql(spec.dataset_query))await api('PUT',`card/${id}`,{name:spec.name,display:spec.display,dataset_query:spec.dataset_query,visualization_settings:spec.visualization_settings});
 }
 const cards=dashboard.dashcards.map(c=>c.dashboard_tab_id===16&&c.card_id===state.cards['income-trend']?{...c,visualization_settings:{...c.visualization_settings,'card.title':'Daily income & expenses'}}:c);
 if(dashboard.dashcards.find(c=>c.dashboard_tab_id===16&&c.card_id===state.cards['income-trend']).visualization_settings['card.title']!=='Daily income & expenses')await api('PUT','dashboard/3/cards',{tabs:dashboard.tabs,cards});
 for(const [id,key] of updates){
  const saved=await api('GET',`card/${id}`),spec=specs.find(s=>s.key===key);
  for(const field of ['name','display','visualization_settings'])assert.deepEqual(saved[field],spec[field],`Card ${id} readback: ${field}`);
  assert.equal(sql(saved.dataset_query),sql(spec.dataset_query),`Card ${id} SQL readback`);
 }
 const after=await api('GET','dashboard/3');
 assert.equal(after.dashcards.find(c=>c.dashboard_tab_id===16&&c.card_id===state.cards['income-trend']).visualization_settings['card.title'],'Daily income & expenses');
 assert.equal(after.dashcards.length,dashboard.dashcards.length);
 const plan=read('statement-cleanup-plan.json');
 for(const [id,key] of updates){const spec=specs.find(s=>s.key===key),i=plan.questions.findIndex(q=>q.id===id);assert.ok(i>=0);plan.questions[i]={...spec,id};}
 const placement=plan.layout.find(c=>c.dashboard_tab_id===16&&c.card_id===state.cards['income-trend']);
 assert.ok(placement);placement.visualization_settings['card.title']='Daily income & expenses';
 write('statement-cleanup-plan.json',plan);
 write('statement-cleanup/income-chart-refinement.json',{date:'2026-09-24',dashboard_id:3,tab_id:16,question_ids:updates.map(([id])=>id),trend_columns:result.data.cols.map(c=>c.name),trend_rows:result.data.rows.length,trend_rows_truncated:result.data.rows_truncated,category_display:'row',trend_display:'bar',trend_metrics:trend.visualization_settings['graph.metrics'],split_y_axis:trend.visualization_settings['graph.y_axis.auto_split'],dashboard_placements:after.dashcards.length,rollback:'Private income-chart-refinement-before-20260924 card/dashboard definitions'});
 console.log('Income charts updated and saved definitions verified.');
}

if(process.argv.includes('--refine')){
 const state=read('statement-cleanup-state.json');
 for(const spec of specs.filter(s=>['q195','q197','income-trend','income-snapshot-status','flow-snapshot-status','expense-detail'].includes(s.key))){
  if(spec.key==='expense-detail')spec.visualization_settings['table.columns']=['Expense Date','Expense Category','Expenses','Expense ID'].map(name=>({name,enabled:name!=='Expense ID'}));
  await api('PUT','card/'+state.cards[spec.key],{dataset_query:spec.dataset_query,visualization_settings:spec.visualization_settings});
 }
 const d=await api('GET','dashboard/3');await api('PUT','dashboard/3/cards',{tabs:d.tabs,cards:[...d.dashcards.filter(c=>![15,16].includes(c.dashboard_tab_id)),...layout(d,state)]});
 const plan=read('statement-cleanup-plan.json');plan.questions=specs.map(s=>({...s,id:state.cards[s.key]}));plan.layout=layout(await api('GET','dashboard/3'),state);write('statement-cleanup-plan.json',plan);
}
if(process.argv.includes('--install')){
 await assertSource();let state;try{state=read('statement-cleanup-state.json');}catch{state={cards:{},baseline_commit:'cf243e138cd85701cd8e156626e88a65174d604e'};}
 const models=read('models.json');
 for(const [id,key,name,file,grain] of [[186,'income-events','Income Events','income-events','One posted repayment or business expense; immutable prefixed Event ID. Live dated income/expense flows, no allocation or running history.'],[205,'daily-cash-snapshot','Daily Cash Snapshots','daily-cash-snapshot','One stored portfolio/date snapshot. Sum flows, select balances at a date. Completed historical trends and past positions only.']]){
  const query=native(fs.readFileSync(`${root}/scripts/metabase/models/${file}.sql`,'utf8'));
  const r=await api('POST','dataset',query);assert.equal(r.status,'completed');assert.ok(!r.data.rows_truncated);
  const columns=r.data.cols.map(c=>({...c,semantic_type:['Event ID','Snapshot ID'].includes(c.name)?'type/PK':c.semantic_type,description:c.name+'. '+grain}));
  await api('PUT',`card/${id}`,{name,type:'model',dataset_query:query,result_metadata:columns,description:grain});
  if(id===186)delete models['income-daily'];models[key]={id,name,collection_id:8,grain,grain_field:id===186?'Event ID':'Snapshot ID',database_view:'public.reporting_'+(id===186?'income_events':'daily_snapshot'),columns:columns.map(({name,base_type,semantic_type,description})=>({name,base_type,semantic_type,description}))};
 }
 write('models.json',models);
 for(const [id,file] of [[2,'live-income-period'],[3,'live-cashflow-period']])await api('PUT','native-query-snippet/'+id,{content:fs.readFileSync(`${root}/scripts/metabase/${file}.sql`,'utf8'),description:'Canonical live period selection and bounded calculation. Historical trends use separate stored snapshots.'});
 for(const spec of specs){
  const r=await api('POST','dataset',spec.dataset_query);if(r.status!=='completed'){fs.writeFileSync(backup+'/query-error.json',JSON.stringify(r));throw Error('Preflight '+spec.key);}
  const id=spec.id??state.cards[spec.key];const {key,id:ignored,...body}=spec;
  const c=await api(id?'PUT':'POST',id?'card/'+id:'card',{...body,type:'question',collection_id:5,description:'Canonical R016 statement. Live totals/detail; hourly completed-day snapshot trends are labeled separately.'});state.cards[key]=c.id;write('statement-cleanup-state.json',state);
 }
 let d=await api('GET','dashboard/3');
 const removed=new Set([5,12,13]);
 const order=[4,14,6,7,8,9,10,11,16,15],names={14:'2 · Cash Position',16:'9 · Income Statement',15:'10 · Cashflow Statement'};
 const tabs=order.map((id,position)=>({...d.tabs.find(t=>t.id===id),name:names[id]??d.tabs.find(t=>t.id===id).name,position}));
 const cards=[...d.dashcards.filter(c=>!removed.has(c.dashboard_tab_id)&&![15,16].includes(c.dashboard_tab_id)),...layout(d,state)];
 await api('PUT','dashboard/3/cards',{tabs,cards});
 const usedParams=new Set(cards.flatMap(c=>c.parameter_mappings??[]).map(m=>m.parameter_id));
 const pnames={'review-flow':'Cashflow period','review-account':'Account','review-income':'Statement period'};
 await api('PUT','dashboard/3',{parameters:d.parameters.filter(p=>usedParams.has(p.id)).map(p=>({...p,name:pnames[p.id]??p.name}))});
 d=await api('GET','dashboard/3');assert.equal(d.tabs.length,10);assert.ok(d.tabs.every(t=>!removed.has(t.id)));
 fs.writeFileSync(backup+'/after-dashboard.json',JSON.stringify(d,null,2));
 write('statement-cleanup-plan.json',{tabs:d.tabs,parameters:d.parameters,cards:state.cards,questions:specs.map(s=>({...s,id:state.cards[s.key]})),layout:layout(d,state),source_policy:'Live statements for every period; separate completed-day snapshot trends',database_version:39});
 console.log('Canonical ten-page dashboard installed; dependency cleanup follows verification.');
}
