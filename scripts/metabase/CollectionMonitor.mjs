// R025 additive collection review. No database writes or shared-card edits.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {api,assertSource} from './ReportingApi.mjs';
export const out='outputs/r025-20260924';
export const backup='C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/r025-collection-monitor';
export const save=(name,value)=>{fs.mkdirSync(out,{recursive:true});fs.writeFileSync(`${out}/${name}.json`,JSON.stringify(value,null,2)+'\n');};
export const read=name=>JSON.parse(fs.readFileSync(`${out}/${name}.json`,'utf8'));
const F=(name,type='type/Decimal')=>['field',name,{'base-type':type}];
const T=name=>F(name,'type/Text');
const E=name=>['expression',name];
const named=(expr,name)=>['aggregation-options',expr,{name,'display-name':name}];
const number={number_style:'decimal',decimals:0,number_separators:'.,',compact:false};
export const lanes=[
 {key:'overdue',status:'Overdue',title:'🚨 Overdue',color:'#B42318',pale:'#FEE4E2'},
 {key:'unpaid',status:'Not Paid',title:'🟠 Not paid',color:'#B54708',pale:'#FFF1D6'},
 {key:'partial',status:'Partially Paid',title:'🔵 Partially paid',color:'#175CD3',pale:'#EAF2FF'},
 {key:'paid',status:'Fully Paid',title:'🟢 Fully paid',color:'#067647',pale:'#ECFDF3'}
];
export const parameters=[
 {id:'collection-detail-borrower',name:'Detail only · Borrower',slug:'collection_detail_borrower',type:'string/=',sectionId:'string',values_query_type:'list',values_source_type:'card',values_source_config:{card_id:77,value_field:T('Borrower ID'),label_field:T('Borrower')},isMultiSelect:false},
 {id:'collection-detail-status',name:'Detail only · Status',slug:'collection_detail_status',type:'string/=',sectionId:'string',values_query_type:'list',values_source_type:'static-list',values_source_config:{values:lanes.map(l=>l.status)},isMultiSelect:true}
];
const fmt=(names,extra={})=>({column_settings:{...Object.fromEntries(names.map(n=>[JSON.stringify(['name',n]),number])),...extra}});
const query=(id,q)=>({database:2,type:'query',query:{'source-table':`card__${id}`,...q}});
export const specs=[];
const add=(key,name,display,dataset_query,settings={},description='')=>specs.push({key,name,display,dataset_query,visualization_settings:settings,description:`R025 / 8R Collection Monitor. ${description}`});
const scalar=(key,name,field)=>add(key,name,'scalar',query(77,{aggregation:[named(field?['coalesce',['sum',F(field)],0]:['distinct',T('Borrower ID')],name)]}),{'scalar.field':name,...fmt([name])},'Current board participants only. Bangkok today. Signed amounts retained; no hidden-borrower exclusion.');
scalar('people','People on board');scalar('receipts','Receipts today','Receipts Today');scalar('remaining','Left to collect','Amount Remaining');
const totals={'source-table':'card__77',aggregation:[named(['distinct',T('Borrower ID')],'Total'),named(['count-where',['=',T('Daily Collection Status'),'Fully Paid']],'Paid')]};
add('completion','People fully paid','scalar',{database:2,type:'query',query:{'source-query':totals,expressions:{'People fully paid':['case',[[['>',F('Total'),0],['/',F('Paid'),F('Total')]]]]},fields:[E('People fully paid')]}},{'scalar.field':'People fully paid',column_settings:{'["name","People fully paid"]':{...number,number_style:'percent',decimals:1}}},'Fully Paid people / all board people, including any unclassified exceptions. Zero denominator is unavailable. This is a people percentage, not amount collection rate.');
for(const lane of lanes){
 add(`${lane.key}-count`,`${lane.title} · people`,'scalar',query(162,{filter:['=',T('Collection Status'),lane.status],fields:[F('Borrower Count','type/Integer')]}),{'scalar.field':'Borrower Count',...fmt(['Borrower Count'])},'Zero means this group is empty. Status comes from governed source.');
 const fields=[T('Borrower'),F('Receipts Today'),F('Amount Remaining'),T('Borrower ID'),T('Daily Collection Status')];
 add(`${lane.key}-list`,`${lane.title} · borrowers`,'table',query(77,{fields,filter:['=',T('Daily Collection Status'),lane.status],'order-by':[['asc',T('Borrower')],['asc',T('Borrower ID')]]}),{
  'table.pivot':false,'table.columns':fields.map((f,i)=>({name:f[1],fieldRef:f,enabled:i<3})),
  ...fmt(['Receipts Today','Amount Remaining'],{'["name","Receipts Today"]':{...number,column_title:'Received'},'["name","Amount Remaining"]':{...number,column_title:'Left'}}),
  'table.column_formatting':[{columns:['Amount Remaining'],type:'single',operator:'>=',value:0,color:lane.pale,highlight_row:true}],
  'table.cell_column_widths':[105,73,70]
 },'One row per borrower. Received = posted principal + interest receipts dated today; Left = collection-set remaining including older dues. Alphabetical stable order. Overdue takes precedence even after a payment today.');
}
const detailFields=['Borrower','Daily Collection Status','Amount Due','Amount Collected','Amount Remaining','Receipts Today','Overdue Amount','Borrower ID'].map(n=>/Borrower|Status/.test(n)?T(n):F(n));
const titles={'Daily Collection Status':'Status','Amount Due':'Collection due','Amount Collected':'Collection received today','Amount Remaining':'Left to collect','Receipts Today':'Receipts today','Overdue Amount':'Overdue balance'};
add('detail','Collection detail · filters above affect only this table','table',query(77,{fields:detailFields,'order-by':[['desc',F('Amount Remaining')],['asc',T('Borrower')],['asc',T('Borrower ID')]]}),{
 'table.pivot':false,'table.columns':detailFields.map((f,i)=>({name:f[1],fieldRef:f,enabled:i<7})),
 column_settings:Object.fromEntries(Object.entries(titles).map(([n,title])=>[JSON.stringify(['name',n]),{...(/Status/.test(n)?{}:number),column_title:title}])),
 'table.column_formatting':lanes.map(l=>({columns:['Daily Collection Status'],type:'single',operator:'=',value:l.status,color:l.pale,highlight_row:true}))
},'Detail filters only. The main monitoring board always shows its full population. Overdue is already included in Left; do not add it again.');
add('today-charges','Charges dated today · separate from board balances','table',query(73,{expressions:{'Paid percentage':['case',[[['>',F('Amount Due Today'),0],['/',F('Amount Collected Today'),F('Amount Due Today')]]]]},fields:[F('Amount Due Today'),F('Amount Collected Today'),F('Amount Outstanding Today'),E('Paid percentage')]}),{
 'table.pivot':false,...fmt(['Amount Due Today','Amount Collected Today','Amount Outstanding Today'],{'["name","Paid percentage"]':{...number,number_style:'percent',decimals:1},'["name","Amount Due Today"]':{...number,column_title:'Due'},'["name","Amount Collected Today"]':{...number,column_title:'Paid against these charges'},'["name","Amount Outstanding Today"]':{...number,column_title:'Remaining'}})
},'Charges dated Bangkok today only; paid is Total Paid against those charges. Not receipts posted today across all charge dates. Zero due => unavailable percentage.');
add('today-charge-paid',"Today's charges · paid %",'scalar',query(73,{expressions:specs.find(s=>s.key==='today-charges').dataset_query.query.expressions,fields:[E('Paid percentage')]}),{'scalar.field':'Paid percentage',column_settings:{'["name","Paid percentage"]':{...number,number_style:'percent',decimals:1}}},'Total Paid against charges dated Bangkok today / amount due on those charges. Zero due => unavailable percentage.');
add('freshness','Bangkok date & query time','table',query(73,{expressions:{'Queried at':['now']},fields:[F('As Of Date','type/Date'),E('Queried at')]}),{'table.pivot':false,'table.cell_column_widths':[130,230],column_settings:{'["name","As Of Date"]':{column_title:'Bangkok date',date_style:'D/M/YYYY'},'["name","Queried at"]':{date_style:'D/M/YYYY',time_enabled:'minutes',time_style:'HH:mm'}}},'Time this helper query ran; not proof every card succeeded. Unsynced AppSheet payments are not visible. Native errors remain visible.');
add('unclassified','Unclassified people · expected 0','scalar',query(77,{filter:['not',['=',T('Daily Collection Status'),...lanes.map(l=>l.status)]],aggregation:[named(['distinct',T('Borrower ID')],'Unclassified')]}),{'scalar.field':'Unclassified',...fmt(['Unclassified'])},'Any positive count requires investigation; full detail retains unexpected statuses. Do not treat unknown statuses as paid.');
export const shape=cards=>cards.map(c=>Object.fromEntries(['id','card_id','dashboard_tab_id','col','row','size_x','size_y','series','parameter_mappings','visualization_settings'].map(k=>[k,c[k]]))).sort((a,b)=>a.id-b.id);
export function layout(state){
 let next=-100;const cards=[];
 const note=(text,row,h=1,col=0,w=24)=>cards.push({id:next--,card_id:null,dashboard_tab_id:state.tab,col,row,size_x:w,size_y:h,series:[],parameter_mappings:[],visualization_settings:{'card.background':false,virtual_card:{display:h===1?'heading':'text',visualization_settings:{text}}}});
 const place=(key,col,row,w,h)=>{
  const mappings=key==='detail'?parameters.map((p,i)=>({parameter_id:p.id,card_id:state.cards[key],target:['dimension',T(i?'Daily Collection Status':'Borrower ID')]})):[];
  const settings={};
  // Link on displayed borrower name uses hidden immutable key from same result row.
  if(key.endsWith('-list')||key==='detail') settings.column_settings={'["name","Borrower"]':{click_behavior:{type:'link',linkType:'url',linkTemplate:'https://reports.mw-credit.com/dashboard/3?borrower={{Borrower ID}}&tab=10-9-%C2%B7-borrower-insight'}}};
  cards.push({id:next--,card_id:state.cards[key],dashboard_tab_id:state.tab,col,row,size_x:w,size_y:h,series:[],parameter_mappings:mappings,visualization_settings:settings});
 };
 note('Collection Monitor · Bangkok today',0);
 note('Received = receipts today · Left includes older dues. Refresh every minute using the clock. Detail filters do not hide people above.',1,3,0,12);
 place('freshness',12,1,12,3);
 ['receipts','remaining','completion','today-charge-paid'].forEach((k,i)=>place(k,i*6,4,6,2));
 lanes.forEach((l,i)=>{place(`${l.key}-count`,i*6,6,6,2);place(`${l.key}-list`,i*6,8,6,9);});
 note('Zero people = empty group. A payment today can still leave a borrower Overdue. People can move groups after refresh.',17,2);
 note('Collection detail · filters apply here only',19);
 place('detail',0,20,24,10);
 place('today-charges',0,30,18,4);place('unclassified',18,30,6,4);
 note('Amounts are baht. Queried at is the helper query time; errors remain visible per card. AppSheet payments appear after sync and refresh.',34,2);
 return cards;
}
export async function runQuery(route,body){const r=await api('POST',route,body);if(r.status!=='completed'){fs.mkdirSync(backup,{recursive:true});fs.writeFileSync(`${backup}/query-error.json`,JSON.stringify(r));throw Error(`Query failed ${route}; private diagnostic saved`);}assert.ok(!r.data.rows_truncated,'No truncation');return r.data;}
if(process.argv.includes('--prepare')){
 await assertSource();fs.mkdirSync(backup,{recursive:true});
 if(!fs.existsSync(`${backup}/dashboard.json`)){
  const d=await api('GET','dashboard/3');assert.equal(d.tabs.find(t=>t.id===9)?.name,'8 · Daily Collection');
  fs.writeFileSync(`${backup}/dashboard.json`,JSON.stringify(d));fs.writeFileSync(`${backup}/permissions.json`,JSON.stringify(await api('GET','collection/graph')));
  for(const id of [69,71,73,77,162])fs.writeFileSync(`${backup}/model-${id}.json`,JSON.stringify(await api('GET',`card/${id}`)));
  const def=await runQuery('dataset',{database:2,type:'native',native:{query:`SELECT pg_get_viewdef('public.olap_borrowers_analytics'::regclass,true) AS definition`}});
  fs.writeFileSync(`${backup}/borrower-view-definition.json`,JSON.stringify(def));
 }
 const checks=[];for(const s of specs){const start=Date.now();await runQuery('dataset',s.dataset_query);checks.push({key:s.key,ms:Date.now()-start,completed:true});}
 save('preflight',{at:new Date().toISOString(),checks});console.log(`Rollback captured privately; ${checks.length} queries passed preflight`);
}
if(process.argv.includes('--install')){
 await assertSource();const before=JSON.parse(fs.readFileSync(`${backup}/dashboard.json`));
 const state=fs.existsSync(`${out}/state.json`)?read('state'):{cards:{},backup,baselineCommit:'f4b8ffd86a73667b0d30c429a7b6d85da6151a5b'};
 let d=await api('GET','dashboard/3');assert.deepEqual(shape(d.dashcards.filter(c=>c.dashboard_tab_id!==state.tab)),shape(before.dashcards));
 for(const s of specs){if(state.cards[s.key])continue;const {key,...body}=s;const c=await api('POST','card',{...body,type:'question',collection_id:5});state.cards[key]=c.id;save('state',state);}
 d=await api('GET','dashboard/3');
 if(!state.tab){const tabs=[...d.tabs];tabs.splice(tabs.findIndex(t=>t.id===9)+1,0,{id:-1,name:'8R · Collection Monitor'});await api('PUT','dashboard/3/cards',{tabs,cards:d.dashcards});d=await api('GET','dashboard/3');state.tab=d.tabs.find(t=>t.name==='8R · Collection Monitor').id;save('state',state);}
 const missing=parameters.filter(p=>!d.parameters.some(x=>x.id===p.id));
 if(missing.length){await api('PUT','dashboard/3',{parameters:[...d.parameters,...missing]});d=await api('GET','dashboard/3');}
 assert.deepEqual(shape(d.dashcards.filter(c=>c.dashboard_tab_id!==state.tab)),shape(before.dashcards));
 await api('PUT','dashboard/3/cards',{tabs:d.tabs,cards:[...d.dashcards.filter(c=>c.dashboard_tab_id!==state.tab),...layout(state)]});
 d=await api('GET','dashboard/3');assert.deepEqual(shape(d.dashcards.filter(c=>c.dashboard_tab_id!==state.tab)),shape(before.dashcards));
 save('plan',{dashboard:3,tab:state.tab,questions:specs.map(s=>({...s,id:state.cards[s.key]})),parameters,layout:shape(d.dashcards.filter(c=>c.dashboard_tab_id===state.tab))});
 console.log(`Installed tab ${state.tab}; ${before.dashcards.length} original placements preserved`);
}
if(process.argv.includes('--refine')){
 const state=read('state'),before=JSON.parse(fs.readFileSync(`${backup}/dashboard.json`));
 let d=await api('GET','dashboard/3');assert.deepEqual(shape(d.dashcards.filter(c=>c.dashboard_tab_id!==state.tab)),shape(before.dashcards));
 fs.writeFileSync(`${backup}/before-refinement-${Date.now()}.json`,JSON.stringify(d));
 await api('PUT','dashboard/3',{parameters:d.parameters.map(p=>parameters.find(x=>x.id===p.id)??p)});
 for(const s of specs){const id=state.cards[s.key];assert.ok(id);const {key,...body}=s;await api('PUT',`card/${id}`,body);}
 // Preserve new placement identities across layout refinements.
 const old=d.dashcards.filter(c=>c.dashboard_tab_id===state.tab),used=new Set();
 const next=layout(state).map(c=>{const match=old.find(x=>!used.has(x.id)&&(c.card_id?x.card_id===c.card_id:!x.card_id&&x.visualization_settings?.virtual_card?.visualization_settings?.text===c.visualization_settings?.virtual_card?.visualization_settings?.text));if(match){used.add(match.id);return {...c,id:match.id};}return c;});
 await api('PUT','dashboard/3/cards',{tabs:d.tabs,cards:[...d.dashcards.filter(c=>c.dashboard_tab_id!==state.tab),...next]});
 d=await api('GET','dashboard/3');save('plan',{dashboard:3,tab:state.tab,questions:specs.map(s=>({...s,id:state.cards[s.key]})),parameters,layout:shape(d.dashcards.filter(c=>c.dashboard_tab_id===state.tab))});
 console.log('Refined only 8R questions and placements');
}
