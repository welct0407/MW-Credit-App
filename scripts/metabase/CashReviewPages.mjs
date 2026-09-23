// Additive R016 review pages. Existing questions, models, snippets and tabs are immutable here.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {api,assertSource,privateDir,read,write} from './ReportingApi.mjs';
export const backup=privateDir+'/cash-review-before';
export const prior=name=>JSON.parse(fs.readFileSync(backup+'/'+name+'.json','utf8'));
export const original=prior('dashboard');
export const tabNames=['2R · Cash Position','10R · Cashflow Statement','9R · Income Statement'];
export const project=c=>Object.fromEntries(['id','card_id','dashboard_tab_id','col','row','size_x','size_y','series','parameter_mappings','visualization_settings'].map(k=>[k,c[k]]));
export function assertPreserved(d){
 const oldIds=new Set(original.dashcards.map(c=>c.id));
 assert.deepEqual(d.dashcards.filter(c=>oldIds.has(c.id)).map(project).sort((a,b)=>a.id-b.id),original.dashcards.map(project).sort((a,b)=>a.id-b.id));
 assert.deepEqual(d.parameters.filter(p=>original.parameters.some(o=>o.id===p.id)),original.parameters);
 assert.deepEqual(d.tabs.filter(t=>original.tabs.some(o=>o.id===t.id)).map(t=>[t.id,t.name,t.position]),original.tabs.map(t=>[t.id,t.name,t.position]));
}
const fmt=names=>Object.fromEntries(names.map(n=>[JSON.stringify(['name',n]),{number_style:'decimal',decimals:0,number_separators:'.,',compact:false}]));
const native=(id,sql)=>{const q=structuredClone(prior('card-'+id).dataset_query);q.stages[0].native=sql;return q;};
const inc=sql=>native(184,'WITH statement AS ({{snippet: Income statement period}}) '+sql);
const flow=sql=>native(197,'WITH statement AS ({{snippet: Cashflow statement period}}) '+sql);
const cols=(names,hidden=[])=>({'table.columns':names.map(name=>({name,enabled:!hidden.includes(name)}))});
export const specs=[
 {key:'advance',name:'Partner advances · position date',display:'scalar',dataset_query:inc('SELECT "Advance Due" FROM statement'),visualization_settings:{'scalar.field':'Advance Due',column_settings:{...fmt(['Advance Due']),...{'["name","Advance Due"]':{number_style:'currency',currency:'THB',currency_style:'symbol',decimals:0,number_separators:'.,',compact:false}}}},reason:'Dated advances are not an existing active scalar question.'},
 {key:'reconciliation',name:'Cash position reconciliation · position date',display:'table',dataset_query:inc(`SELECT v.component AS "Component",v.amount AS "Amount" FROM statement s JOIN {{#188}} c ON c."Date"=s."Period End" CROSS JOIN LATERAL (VALUES (1,'Remaining lending capital',c."Cash Pool Remaining"),(2,'+ Retained net profit · all periods',c."Retained Profit Through Date"),(3,'+ Reconciliation difference',c."Cash Reconciliation Difference"),(4,'= Net cash balance',c."Business Cash Held"-c."Advance Due"),(5,'+ Partner advances',c."Advance Due"),(6,'= Business cash held',c."Business Cash Held")) v(step,component,amount) ORDER BY v.step`),visualization_settings:{'table.pivot':false,column_settings:fmt(['Amount'])},reason:'Existing income cash cards do not provide this all-period net-profit reconciliation.'},
 {key:'trend',name:'Cash position trend · remaining capital and net cash',display:'line',dataset_query:{database:2,type:'native',native:{query:'SELECT d."Date",d."Cash Pool Remaining" AS "Remaining lending capital",d."Business Cash Held"-d."Advance Due" AS "Net cash balance" FROM {{#188}} d WHERE true [[AND {{position_trend}}]] ORDER BY d."Date"','template-tags':{'#188':{id:'r016-model-188',name:'#188','display-name':'Cash Position by Date',type:'card','card-id':188},position_trend:{id:'cash-review-trend',name:'position_trend','display-name':'Position trend period',type:'dimension',dimension:['field',82,null],'widget-type':'date/all-options',alias:'d."Date"'}}}},visualization_settings:{'graph.dimensions':['Date'],'graph.metrics':['Remaining lending capital','Net cash balance'],'graph.colors':['#267DCC','#13855B'],'graph.show_legend':true,'graph.show_values':false,'graph.show_dots':false,'graph.label_value_formatting':'full','graph.x_axis.title_enabled':false,'graph.y_axis.title_enabled':false,column_settings:fmt(['Remaining lending capital','Net cash balance'])},reason:'Existing principal snapshot trend measures a different position; this reads the existing dated cash model.'},
 {key:'movement',name:'Cash movement by transaction type',display:'table',dataset_query:flow('SELECT t."Transaction Type",sum(t."Money In") AS "Money In",sum(t."Money Out") AS "Money Out",sum(t."Net Movement") AS "Net Movement" FROM statement s JOIN {{#190}} t ON t."Date" BETWEEN s."Period Start" AND s."Period End" WHERE t."Scope ID"={{cash_account}} AND s."Continuous Period" GROUP BY 1 ORDER BY 1'),visualization_settings:{'table.pivot':false,column_settings:fmt(['Money In','Money Out','Net Movement'])},reason:'New simple aggregation of existing transaction classifications; no invented principal/interest split.'},
 {key:'profit-bridge',name:'Income less expenses · Total = Net profit',display:'waterfall',dataset_query:inc(`SELECT v.movement AS "Movement",v.amount AS "Amount" FROM statement s CROSS JOIN LATERAL (VALUES (1,'Income',s."Operating Income"),(2,'Expenses',s."Operating Expenses")) v(step,movement,amount) ORDER BY v.step`),visualization_settings:{'graph.dimensions':['Movement'],'graph.metrics':['Amount'],'graph.show_values':true,'graph.label_value_formatting':'full','graph.x_axis.title_enabled':false,'graph.y_axis.title_enabled':false,'waterfall.increase_color':'#13855B','waterfall.decrease_color':'#D1495B','waterfall.total_color':'#267DCC','waterfall.show_total':true,column_settings:fmt(['Amount'])},reason:'Existing waterfall includes partner draws and totals unsettled profit; this totals operating net profit.'}
];
export const parameters=[
 {id:'review-position',name:'Position date / period end',slug:'review_position',type:'date/all-options',sectionId:'date',default:'today'},
 {id:'review-position-trend',name:'Position trend period',slug:'review_position_trend',type:'date/all-options',sectionId:'date',default:'past30days'},
 {id:'review-flow',name:'Cashflow review period',slug:'review_flow',type:'date/all-options',sectionId:'date',default:'thismonth'},
 {...original.parameters.find(p=>p.id==='cashflow-account'),id:'review-account',name:'Review account',slug:'review_account'},
 {id:'review-income',name:'Income review period',slug:'review_income',type:'date/all-options',sectionId:'date',default:'thismonth'}
];
export function layout(state,d){
 let next=-1;const cards=[];
 const note=(tab,row,text,h=1)=>cards.push({id:next--,card_id:null,dashboard_tab_id:tab,col:0,row,size_x:24,size_y:h,series:[],parameter_mappings:[],visualization_settings:{'card.background':false,virtual_card:{display:h===1?'heading':'text',visualization_settings:{text}}}});
 const place=(tab,id,col,row,w,h,title,maps=[],settings={})=>cards.push({id:next--,card_id:id,dashboard_tab_id:tab,col,row,size_x:w,size_y:h,series:[],parameter_mappings:maps.map(([p,target])=>({parameter_id:p,card_id:id,target})),visualization_settings:{'card.title':title,...settings}});
 const dim=n=>['dimension',['template-tag',n]],variable=n=>['variable',['template-tag',n]];
 const asof=[['review-position',dim('statement_period')]],cashdate=[['review-position',dim('cashflow_period')]];
 const fi=[['review-flow',dim('cashflow_period')],['review-account',variable('cash_account')]];
 const income=[['review-income',dim('statement_period')]];
 const [p,f,i]=tabNames.map(n=>d.tabs.find(t=>t.name===n).id);
 note(p,0,'Cash position · where the money sits');
 note(p,1,'Capital: today. Cash: selected date or period end. Amounts in baht.',2);
 note(p,3,'1 · Capital deployed today');
 place(p,47,0,4,12,2,'Total cash pool · today');
 place(p,48,0,6,12,2,'Principal outstanding · today');
 place(p,68,12,4,12,4,'Capital utilization · today');
 note(p,6,'2 · Cash at the selected date');
 [[179,'Remaining lending capital',asof],[197,'Net cash balance',cashdate],[180,'Business cash held',asof],[state.cards.advance,'Partner advances',asof]].forEach(([id,t,m],j)=>place(p,id,j*6,7,6,2,t,m));
 note(p,9,'Cash held − advances = net cash. Lending capital is not a bank balance.',2);
 place(p,184,0,11,24,3,'Position date & availability',asof,cols(['Period Start','Period End','Cash Available From','Selection Status','Cash Status'],['Period Start']));
 place(p,182,0,14,10,7,'Cash held by holder · selected date',asof);
 place(p,183,10,14,14,7,'Account balances · selected date',asof);
 note(p,21,'3 · Explain the cash balance');
 place(p,state.cards.reconciliation,0,22,24,8,'From lending capital to cash held',asof);
 note(p,30,'Retained profit spans all periods. Reconciliation differences need review.',2);
 place(p,state.cards.trend,0,32,24,7,'Cash position over time · separate trend period',[['review-position-trend',dim('position_trend')]]);
 note(p,39,'Cash needs known openings. Later corrections restate history.',2);
 note(f,0,'Cashflow statement · explain the movement');
 note(f,1,'Filters apply throughout. Transfers net to zero in All accounts.',2);
 [[195,'Opening cash'],[192,'Money in'],[193,'Money out'],[197,'Closing cash']].forEach(([id,t],j)=>place(f,id,j*6,3,6,2,t,fi));
 place(f,194,0,5,8,2,'Net cash movement',fi);
 note(f,5,'Opening + money in − money out = closing. Includes negative balances.',2);Object.assign(cards.at(-1),{col:8,size_x:16});
 place(f,198,0,7,24,3,'Statement period & balance availability',fi);
 note(f,10,'1 · What moved the cash?');
 place(f,state.cards.movement,0,11,24,7,'Receipts and payments by transaction type',fi);
 note(f,18,'Recorded transaction types; combined repayments are not split.',2);
 note(f,20,'2 · Follow the transaction trail');
 place(f,196,0,21,24,12,'Transactions · chronological order',fi);
 note(f,33,'Transfers stay visible. Cash needs known openings; history may be restated.',2);
 note(i,0,'Income statement · business profitability');
 note(i,1,'Period earnings above; profit distributions below. Amounts in baht.',2);
 [[168,'Operating income'],[169,'Operating expenses'],[170,'Net profit'],[171,'Average daily net profit']].forEach(([id,t],j)=>place(i,id,j*6,3,6,2,t,income));
 place(i,184,0,5,24,3,'Selected earnings period',income,cols(['Period Start','Period End','Cash Available From','Selection Status','Cash Status'],['Cash Available From','Cash Status']));
 note(i,8,'1 · Income less expenses = net profit');
 place(i,state.cards['profit-bridge'],0,9,24,6,'Profit waterfall · Total = Net profit',income);
 place(i,178,0,15,24,6,'Expense breakdown · selected period',[['review-income',['dimension',['field','Expense Date',{'base-type':'type/Date'}]]]]);
 note(i,21,'2 · Distribution of selected-period profit');
 [[173,'Tommy · allocated draw'],[174,'Lisa · allocated draw'],[175,'Unsettled period profit']].forEach(([id,t],j)=>place(i,id,j*8,22,8,2,t,income));
 note(i,24,'Draws use earlier profit first. Allocations are not period cash payments.',2);
 note(i,26,'Draws are not expenses. Daily averages include zero-activity days.',2);
 // Gauge occupies four rows alongside the two stacked capital scalars.
 for(const c of cards.filter(c=>c.dashboard_tab_id===p&&![47,48,68].includes(c.card_id)&&c.row>=6))c.row+=2;
 // Retain placement identities across scoped refinements so open tabs keep valid query endpoints.
 for(const c of cards){const old=d.dashcards.find(o=>o.dashboard_tab_id===c.dashboard_tab_id&&(c.card_id?o.card_id===c.card_id:!o.card_id&&o.visualization_settings?.virtual_card?.visualization_settings?.text===c.visualization_settings.virtual_card.visualization_settings.text));if(old)c.id=old.id;}
 return cards;
}
if(process.argv.includes('--install')){
 await assertSource();let d=await api('GET','dashboard/3');assertPreserved(d);
 let state;try{state=read('cash-review-state.json');}catch{state={cards:{},baseline_commit:'909fe5374b5383fa8171c5ff90d6ca7007abe2f5'};}
 for(const q of specs){
  if(state.cards[q.key])continue;
  const result=await api('POST','dataset',q.dataset_query);assert.equal(result.status,'completed',q.key);
  const {key,reason,...body}=q;
  const c=await api('POST','card',{...body,type:'question',collection_id:5,description:'R016 additive review. '+reason});state.cards[key]=c.id;write('cash-review-state.json',state);
  console.log('Created missing projection: '+key);
 }
 d=await api('GET','dashboard/3');assertPreserved(d);
 const missing=tabNames.filter(n=>!d.tabs.some(t=>t.name===n));
 if(missing.length){await api('PUT','dashboard/3/cards',{tabs:[...d.tabs,...missing.map((name,j)=>({id:-1-j,name,position:d.tabs.length+j}))],cards:d.dashcards});d=await api('GET','dashboard/3');}
 state.tabs=tabNames.map(n=>({name:n,id:d.tabs.find(t=>t.name===n).id}));write('cash-review-state.json',state);
 const ids=state.tabs.map(t=>t.id),added=layout(state,d);
 await api('PUT','dashboard/3',{parameters:[...d.parameters.filter(p=>!parameters.some(n=>n.id===p.id)),...parameters]});
 await api('PUT','dashboard/3/cards',{tabs:d.tabs,cards:[...d.dashcards.filter(c=>!ids.includes(c.dashboard_tab_id)),...added]});
 d=await api('GET','dashboard/3');assertPreserved(d);
 const placements=d.dashcards.filter(c=>ids.includes(c.dashboard_tab_id)&&c.card_id);
 write('cash-review-plan.json',{created_at:new Date().toISOString(),tabs:state.tabs,new_questions:specs.map(q=>({id:state.cards[q.key],name:q.name,reason:q.reason,dataset_query:q.dataset_query,visualization_settings:q.visualization_settings})),reused_question_ids:[...new Set(placements.filter(c=>!Object.values(state.cards).includes(c.card_id)).map(c=>c.card_id))],new_visual_placements:placements.length,reused_placements:placements.filter(c=>!Object.values(state.cards).includes(c.card_id)).length,new_models:0,new_snippets:0,old_pages_preserved:true});
 console.log('Three additive review tabs saved; original ten tabs preserved.');
}
