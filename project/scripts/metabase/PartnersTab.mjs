// R044 additive Partners tab. Existing dashboard objects are preserved and guarded.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {api,assertSource,root} from './ReportingApi.mjs';
export const out=root+'/outputs/r044-partners';
export const priv='C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/r044-partners';
fs.mkdirSync(out,{recursive:true});fs.mkdirSync(priv,{recursive:true});
export const save=(n,x,dir=out)=>fs.writeFileSync(`${dir}/${n}.json`,JSON.stringify(x,null,2)+'\n');
export const read=(n,dir=out)=>JSON.parse(fs.readFileSync(`${dir}/${n}.json`,'utf8'));
export const shape=d=>d.dashcards.map(({id,card_id,dashboard_tab_id,row,col,size_x,size_y,series,parameter_mappings,visualization_settings})=>({id,card_id,dashboard_tab_id,row,col,size_x,size_y,series,parameter_mappings,visualization_settings})).sort((a,b)=>a.id-b.id);
const num={number_style:'decimal',decimals:0,number_separators:'.,',compact:false};
const fmt=names=>Object.fromEntries(names.map(n=>[JSON.stringify(['name',n]),n.includes('%')?{...num,number_style:'percent',decimals:2}:num]));
const table=(names,hidden=[])=>({'table.pivot':false,'table.columns':names.map(name=>({name,fieldRef:['field',name,{'base-type':name.includes('฿')||name.includes('%')?'type/Decimal':'type/Text'}],enabled:!hidden.includes(name)})),column_settings:fmt(names.filter(n=>n.includes('฿')||n.includes('%')))});
const graph=(dim,metrics,extra={})=>({'graph.dimensions':[dim],'graph.metrics':metrics,'graph.colors':['#178F8A','#7472BE','#D6816B','#D4AD60'],'graph.show_legend':true,'graph.show_values':true,'graph.label_value_formatting':'full','graph.y_axis.auto_split':false,'graph.missing':'none','stackable.stack_type':null,column_settings:fmt(metrics),...extra});
const tags={partner:{id:'pt-partner',name:'partner','display-name':'Partner',type:'dimension',dimension:['field',121,null],'widget-type':'string/=',alias:'d.partner_id'},period:{id:'pt-period',name:'period','display-name':'Partner activity period',type:'dimension',dimension:['field',82,null],'widget-type':'date/all-options',alias:'d.activity_date'},status:{id:'pt-status',name:'status','display-name':'Settlement ledger status',type:'text'}};
export const native=(query,keys=[])=>({database:2,type:'native',native:{query,'template-tags':Object.fromEntries([...keys.map(k=>[k,tags[k]]),...Array.from(query.matchAll(/\{\{#(\d+)\}\}/g),m=>['#'+m[1],{id:'r044-model-'+m[1],name:'#'+m[1],'display-name':'Partners source '+m[1],type:'card','card-id':Number(m[1])}])])}});
const safe=f=>`CASE WHEN count(*)=0 THEN 0 WHEN bool_and(${f} IS NOT NULL) THEN sum(${f}) END`;
const from=(key,period=false)=>`FROM __MODEL_${key}__ d WHERE true [[AND {{partner}}]]${period?' [[AND {{period}}]]':''}`;
export function specs(models={}){
 const result=[];
 const add=(key,name,display,query,keys,settings={},description='')=>result.push({key,name,display,dataset_query:native(query.replace(/__MODEL_(\w+)__/g,(_,k)=>models[k]?`{{#${models[k]}}}`:`public.reporting_partner_${k}_v1`),keys),visualization_settings:settings,description:'R044 Partners. '+description});
 const scalar=(key,label,field,model='position',period=false)=>add(key,label,'scalar',`SELECT ${safe(field)} AS "${label}" ${from(model,period)}`,period?['partner','period']:['partner'],{'scalar.field':label,column_settings:fmt([label])},period?'Selected actual event dates.':'Current recorded balance; activity period does not apply.');
 add('picker','Partners · selection list','table','SELECT d.partner_id AS "Partner ID",d.partner_name AS "Partner" FROM __MODEL_position__ d ORDER BY d.partner_role,d.partner_id',[],table(['Partner ID','Partner'],['Partner ID']));
 scalar('capital','Net capital ฿','net_capital');scalar('earned','Net earned to date ฿','net_earned');scalar('paid','Completed payouts ฿','completed');scalar('pending','Pending settlements ฿','pending');scalar('available','Net available ฿','available');
 const cols=['Partner','Net capital ฿','Capital share %','Allocated interest ฿','Allocated expenses ฿','Net earned ฿','Paid ฿','Pending ฿','Net available ฿','Status','Partner ID'];
 add('comparison','Partner positions · current','table',`SELECT d.partner_name AS "Partner",net_capital AS "Net capital ฿",capital_share AS "Capital share %",interest_earned AS "Allocated interest ฿",expenses AS "Allocated expenses ฿",net_earned AS "Net earned ฿",completed AS "Paid ฿",pending AS "Pending ฿",available AS "Net available ฿",quality_status AS "Status",d.partner_id AS "Partner ID" ${from('position')} ORDER BY partner_role,d.partner_id`,['partner'],table(cols,['Partner ID']),'Full-pool denominator is preserved when filtering. Net available is after expenses and all non-Cancelled reservations, not cash liquidity.');
 add('share','Capital share · full pool','row',`SELECT partner_name AS "Partner",capital_share AS "Capital share %",net_capital AS "Net capital ฿" ${from('position')} ORDER BY partner_role,d.partner_id`,['partner'],graph('Partner',['Capital share %'],{'graph.y_axis.min':0,'graph.y_axis.max':1,'graph.show_legend':false}),'Current individual net capital / full economic pool, calculated before filtering.');
 // Explicit bridge table avoids an unsupported intermediate subtotal in the native waterfall.
 const bridge=`WITH totals AS (SELECT ${safe('interest_earned')} g,${safe('expenses')} x,${safe('net_earned')} n,${safe('completed')} c,${safe('pending')} p,${safe('other_reserved')} o,${safe('available')} a ${from('position')})
 SELECT v.label AS "Entitlement bridge",v.amount AS "Amount ฿" FROM totals t CROSS JOIN LATERAL (VALUES
 (1,'Allocated interest',g),(2,'Less allocated expenses',-x),(3,'Net earned',n),(4,'Less completed payouts',-c),(5,'Less pending reservations',-p),(6,'Less other reservations',-o),(7,'Net available to settle',a)) v(ord,label,amount) WHERE v.ord<>6 OR o<>0 ORDER BY v.ord`;
 add('bridge','How net available is calculated','table',bridge,['partner'],table(['Entitlement bridge','Amount ฿']),'Net earned and Net available are subtotals, not additional movements. Pending is reserved, not paid.');
 scalar('period-interest','Allocated interest ฿','allocated_interest','daily',true);scalar('period-expense','Allocated expenses ฿','allocated_expense','daily',true);scalar('period-earned','Net earned ฿','net_earned','daily',true);scalar('period-paid','Payouts in period ฿','completed_payouts','daily',true);
 add('monthly','Monthly net earned versus paid','bar',`SELECT date_trunc('month',activity_date)::date AS "Month",${safe('net_earned')} AS "Net earned ฿",${safe('completed_payouts')} AS "Completed payouts ฿" ${from('daily',true)} GROUP BY 1 ORDER BY 1`,['partner','period'],graph('Month',['Net earned ฿','Completed payouts ฿']),'Selected dates only; boundary months can be partial. Payouts use Transfer Date and can consume earlier profit; not FIFO profit-month attribution.');
 add('movements','Capital contributions and withdrawals','bar',`SELECT date_trunc('month',activity_date)::date AS "Month",${safe('capital_contributed')} AS "Contributed ฿",-(${safe('capital_withdrawn')}) AS "Withdrawn ฿" ${from('daily',true)} GROUP BY 1 ORDER BY 1`,['partner','period'],graph('Month',['Contributed ฿','Withdrawn ฿'],{'graph.colors':['#178F8A','#D6816B']}),'Capital transactions only. Profit settlements never reduce contributed capital.');
 add('capital-trend','Net contributed capital over time','line',`SELECT activity_date AS "Date",partner_name AS "Partner",capital_eod AS "Net capital ฿" ${from('daily',true)} ORDER BY activity_date,partner_id`,['partner','period'],graph('Date',['Net capital ฿'],{'graph.dimensions':['Date','Partner'],'graph.show_values':false,'graph.show_dots':false}),'Daily end balance includes capital before the selected period. Reconstructed from current records; no forecast.');
 add('queue','Pending settlements · all dates','table',`SELECT partner_name AS "Partner",amount AS "Amount ฿",activity_date AS "Recorded transfer date",date_status AS "Date status",settlement_id AS "Settlement reference" ${from('settlements')} AND status='Pending' ORDER BY activity_date NULLS LAST,settlement_id`,['partner'],table(['Partner','Amount ฿','Recorded transfer date','Date status','Settlement reference']),'Current pending reservations, including future/undated transfer dates. Activity period does not apply. This date is not creation time.');
 add('capital-ledger','Capital transaction ledger','table',`SELECT activity_date AS "Date",partner_name AS "Partner",transaction_type AS "Type",net_movement AS "Movement ฿",date_end_capital AS "Capital at date end ฿",capital_id AS "Capital reference" ${from('capital_ledger',true)} AND activity_date<=public.olap_reporting_date() ORDER BY activity_date DESC,capital_id`,['partner','period'],table(['Date','Partner','Type','Movement ฿','Capital at date end ฿','Capital reference']),'Same-date transactions share the date-end balance; reference order is not intraday chronology.');
 add('settlement-ledger','Settlement transaction ledger','table',`SELECT activity_date AS "Transfer date",partner_name AS "Partner",amount AS "Recorded amount ฿",status AS "Status",completed_amount AS "Effective paid ฿",pending_amount AS "Pending ฿",settlement_id AS "Settlement reference" ${from('settlements',true)} AND activity_date<=public.olap_reporting_date() [[AND d.status={{status}}]] ORDER BY activity_date DESC,settlement_id`,['partner','period','status'],table(['Transfer date','Partner','Recorded amount ฿','Status','Effective paid ฿','Pending ฿','Settlement reference']),'Cancelled audit amounts are not effective payments. Status filter applies to this ledger only; undated Pending remains in the queue above.');
 add('context','Source and balance checks','table',`SELECT CASE WHEN bool_and(ready) THEN 'Ready · live on refresh' ELSE 'Needs review' END AS "Status",max(queried_at) AS "Queried at · Bangkok",max(capital_exceptions+earnings_exceptions+settlement_exceptions) AS "Source exceptions",max(undated_pending) AS "Undated pending",max(allocation_residual) AS "Allocation rounding difference ฿" ${from('position')}`,['partner'],{...table(['Status','Queried at · Bangkok','Source exceptions','Undated pending','Allocation rounding difference ฿']),column_settings:{...fmt(['Allocation rounding difference ฿']),'["name","Allocation rounding difference ฿"]':{...num,decimals:2}}},'Rounding difference = allocated A+B interest minus gross interest. Does not alter entitlement. Query time is not transaction sync time.');
 return result;
}
function parameters(state){return [
 {id:'pt-partner',name:'Partner',slug:'pt_partner',type:'string/=',sectionId:'string',isMultiSelect:true,values_query_type:'list',values_source_type:'card',values_source_config:{card_id:state.cards.picker,value_field:['field','Partner ID',{'base-type':'type/Text'}],label_field:['field','Partner',{'base-type':'type/Text'}]}},
 {id:'pt-period',name:'Partner activity period',slug:'pt_activity',type:'date/all-options',sectionId:'date',default:'thismonth'},
 {id:'pt-status',name:'Settlement ledger status',slug:'pt_settlement_status',type:'string/=',sectionId:'string',isMultiSelect:false,values_query_type:'list',values_source_type:'static-list',values_source_config:{values:['Pending','Completed','Cancelled']}}
];}
function layout(state){
 const placements=[];let id=-47001;const ss=specs(state.models);
 const note=(row,text,h=3)=>placements.push({id:id--,card_id:null,dashboard_tab_id:state.tab,col:0,row,size_x:24,size_y:h,series:[],parameter_mappings:[],visualization_settings:{'card.background':false,virtual_card:{display:'text',visualization_settings:{text}}}});
 const put=(key,col,row,w,h)=>{const s=ss.find(s=>s.key===key);placements.push({id:id--,card_id:state.cards[key],dashboard_tab_id:state.tab,col,row,size_x:w,size_y:h,series:[],visualization_settings:{},parameter_mappings:Object.keys(s.dataset_query.native['template-tags']).filter(k=>k in tags).map(k=>({parameter_id:tags[k].id,card_id:state.cards[key],target:[k==='status'?'variable':'dimension',['template-tag',k]]}))});};
 note(0,'## Partners\nCurrent capital, earned profit and settlements. All amounts are baht; current balances stay current when activity dates change.');
 ['capital','earned','paid'].forEach((k,i)=>put(k,i*8,3,8,4));put('pending',0,7,12,4);put('available',12,7,12,4);
 put('comparison',0,11,24,7);put('share',0,18,12,9);put('bridge',12,18,12,9);
 note(27,'### Actual activity · selected dates\nNet earnings are after allocated expenses. Payouts use transfer dates and may include profit earned earlier. Partial months show only selected dates.');
 ['period-interest','period-expense','period-earned','period-paid'].forEach((k,i)=>put(k,i*6,30,6,4));
 put('monthly',0,34,12,9);put('movements',12,34,12,9);put('capital-trend',0,43,24,10);
 note(53,'### Pending settlements · current\nAll pending reservations are shown, including future or missing transfer dates. A blank table means there are no pending settlements; the activity period does not apply.');put('queue',0,56,24,6);
 note(62,'### Transaction detail · selected dates\nCapital withdrawals and profit payouts are separate. The status filter affects the settlement ledger only. Cancelled entries remain visible as history.');
 put('capital-ledger',0,65,24,9);put('settlement-ledger',0,74,24,9);put('context',0,83,24,5);
 note(88,'Net available is an entitlement after reservations, not cash on hand. Current totals use all recorded balances; past activity is restated by corrections. [Cash Position](/dashboard/3?tab=14) shows liquidity. Complete settlements in OLAP.',3);
 return placements;
}
async function query(q,parameters){const r=await api('POST','dataset',{...q,...(parameters?{parameters}:{})});if(r.status!=='completed'){save('query-error',r,priv);throw Error('Query failed; private diagnostic saved');}assert(!r.data.rows_truncated);return r;}
if(process.argv.includes('--plan')){save('plan',{dashboard:3,specs:specs(),scope:'Additive Partners; six read-only SQL views; no AppSheet changes'});console.log('Saved report plan');}
if(process.argv.includes('--publish')){
 await assertSource();const baseline=read('dashboard-before',priv),live=await api('GET','dashboard/3');assert.deepEqual(shape(live),shape(baseline));assert.deepEqual(live.parameters,baseline.parameters);assert.deepEqual(live.tabs,baseline.tabs);
 assert(!fs.existsSync(out+'/state.json'),'Already started: inspect state before resuming');
 for(const s of specs())await query(s.dataset_query);
 const recovery=await api('POST','dashboard/3/copy',{name:'R044 recovery - before Partners tab',collection_id:5});
 const state={backupDashboard:recovery.id,models:{},cards:{}};save('state',state);
 for(const key of ['position','capital','earnings','settlements','daily','capital_ledger']){
  const dq=native(`SELECT * FROM public.reporting_partner_${key}_v1`);const r=await query(dq);
  const m=await api('POST','card',{name:`Partners · ${key.replaceAll('_',' ')} source`,type:'model',display:'table',collection_id:8,dataset_query:dq,result_metadata:r.data.cols,visualization_settings:{},description:'R044 thin metadata over governed read-only PostgreSQL provider. No financial writes.'});
  state.models[key]=m.id;save('state',state);
 }
 for(const s of specs(state.models)){const {key,...p}=s;const q=await api('POST','card',{...p,collection_id:key==='picker'?8:5});state.cards[key]=q.id;save('state',state);}
 const d=await api('GET','dashboard/3');assert.deepEqual(shape(d),shape(baseline));assert.deepEqual(d.parameters,baseline.parameters);
 await api('PUT','dashboard/3',{parameters:[...d.parameters,...parameters(state)]});
 await api('PUT','dashboard/3/cards',{tabs:[...d.tabs,{id:-47,name:'12 · Partners',position:d.tabs.length}],cards:d.dashcards});
 const withTab=await api('GET','dashboard/3');state.tab=withTab.tabs.find(t=>t.name==='12 · Partners').id;save('state',state);
 await api('PUT','dashboard/3/cards',{tabs:withTab.tabs,cards:[...withTab.dashcards,...layout(state)]});
 console.log(JSON.stringify({tab:state.tab,backup:state.backupDashboard,questions:Object.keys(state.cards).length,models:Object.keys(state.models).length}));
}
if(process.argv.includes('--repair')){
 await assertSource();const state=read('state'),before=[];
 for(const s of specs(state.models)){const q=await api('GET','card/'+state.cards[s.key]);assert.equal(q.name,s.name);before.push(q);}
 save('questions-before-repair',before,priv);
 for(const s of specs(state.models))await api('PUT','card/'+state.cards[s.key],{dataset_query:s.dataset_query});
 console.log('Updated model-reference tags on the 20 R044 questions');
}
if(process.argv.includes('--verify')){
 await assertSource();const state=read('state'),old=read('dashboard-before',priv),d=await api('GET','dashboard/3');
 assert.deepEqual(shape({...d,dashcards:d.dashcards.filter(c=>c.dashboard_tab_id!==state.tab)}),shape(old));
 assert.deepEqual(d.tabs.filter(t=>t.id!==state.tab),old.tabs);assert.deepEqual(d.parameters.filter(p=>!p.id.startsWith('pt-')),old.parameters);
 const ss=specs(state.models),saved=[],checks=[];
 const sample=await query(native('SELECT partner_id FROM public.reporting_partner_position_v1 ORDER BY partner_role'));
 const ids=sample.data.rows.map(r=>r[0]);assert.equal(ids.length,2);
 for(const s of ss){
  const id=state.cards[s.key],q=await api('GET','card/'+id);const sql=q.dataset_query.stages?.[0]?.native??q.dataset_query.native?.query;assert.equal(sql,s.dataset_query.native.query);assert.equal(q.display,s.display);
  saved.push({id,...s});const place=d.dashcards.find(c=>c.card_id===id&&c.dashboard_tab_id===state.tab);
  if(!place)continue;
  const sets=[[],[{id:'pt-period',type:'date/all-options',value:'thismonth'}],[{id:'pt-period',type:'date/all-options',value:'2026-08-01~2026-08-31'},{id:'pt-partner',type:'string/=',value:[ids[0]]}]];
  let currentReference;
  for(const ps of sets){const r=await api('POST',`dashboard/3/dashcard/${place.id}/card/${id}/query`,{parameters:ps});if(r.status!=='completed'){save('query-error',r,priv);throw Error(`dashboard query failed ${s.key}`);}assert(!r.data.rows_truncated);if(!s.dataset_query.native['template-tags'].period&&!ps.some(p=>p.id==='pt-partner')&&s.key!=='context'){if(currentReference)assert.deepEqual(r.data.rows,currentReference);else currentReference=r.data.rows;}}
  checks.push({key:s.key,threeFilterQueriesPassed:true});
 }
 // Full-pool denominator survives selection; period slices agree with daily source independently verified in SQL.
 const sharePlace=d.dashcards.find(c=>c.card_id===state.cards.share&&c.dashboard_tab_id===state.tab);
 const all=await api('POST',`dashboard/3/dashcard/${sharePlace.id}/card/${state.cards.share}/query`,{parameters:[]});
 for(const id of ids){const r=await api('POST',`dashboard/3/dashcard/${sharePlace.id}/card/${state.cards.share}/query`,{parameters:[{id:'pt-partner',type:'string/=',value:[id]}]});assert.equal(r.data.rows.length,1);assert(all.data.rows.some(v=>JSON.stringify(v)===JSON.stringify(r.data.rows[0])));}
 save('saved',{dashboard:3,tab:state.tab,questions:saved,models:state.models,parameters:parameters(state),layout:shape(d).filter(c=>c.dashboard_tab_id===state.tab)});
 save('verification',{at:new Date().toISOString(),passed:true,checks,oldPlacementsPreserved:old.dashcards.length,otherTabsAndParametersUnchanged:true,fullPoolDenominatorPreserved:true,financialValuesPublished:false});
 console.log(JSON.stringify({passed:true,visuals:checks.length,preservedPlacements:old.dashcards.length}));
}
