// Query-builder (MBQL) implementation: no native SQL or database-object changes.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {api,assertSource,privateDir,read,write} from './ReportingApi.mjs';
export const backup=privateDir+'/performance-ma7-before-20260924';
export const f=(name,type='type/Decimal',alias)=>['field',name,{'base-type':type,...(alias?{'join-alias':alias}:{})}];
export const named=(expr,name)=>['aggregation-options',expr,{name,'display-name':name}];
export const query=q=>({database:2,type:'query',query:q});
const date=f('Date','type/Date'),calendar=['field',569,{'base-type':'type/Date'}];
const origin={'source-table':'card__74',aggregation:[named(['min',date],'History Start')]};
const inputs={'source-table':36,joins:[
 {'source-query':origin,alias:'Origin',strategy:'inner-join',condition:['>=',calendar,f('History Start','type/Date','Origin')]},
 {'source-table':'card__74',alias:'Snapshot',strategy:'left-join',condition:['=',calendar,f('Date','type/Date','Snapshot')]}
 ],filter:['<',calendar,['relative-datetime',0,'day']],expressions:{
 'Missing input':['case',[[['or',['is-null',f('Snapshot ID','type/Text','Snapshot')],['is-null',f('Profit','type/Decimal','Snapshot')]],1]],{'default':0}]
 },fields:[calendar,f('History Start','type/Date','Origin'),f('Profit','type/Decimal','Snapshot'),f('Cumulative Profit','type/Decimal','Snapshot'),f('Generated At','type/DateTime','Snapshot'),['expression','Missing input']]};
export const coverage={'source-query':inputs,breakout:[date],aggregation:[
 named(['max',f('Profit')],'Gross interest'),named(['max',f('Cumulative Profit')],'Cumulative gross interest'),
 named(['cum-sum',f('Missing input','type/Integer')],'Missing since start'),
 named(['max',f('Generated At','type/DateTime')],'Generated at'),named(['min',f('History Start','type/Date')],'History start')
 ],'order-by':[['asc',date]]};
export const guarded={'source-query':coverage,expressions:{'Valid cumulative':['case',[[['=',f('Missing since start','type/Integer'),0],f('Cumulative gross interest')]]]},fields:[date,f('Gross interest'),f('History start','type/Date'),f('Generated at','type/DateTime'),f('Missing since start','type/Integer'),['expression','Valid cumulative']]};
const avg7=name=>['/', ['+', ['max',f(name)],...Array.from({length:6},(_,i)=>['offset',{},['max',f(name)],-i-1])],7];
export const rolling={'source-query':guarded,breakout:[date],aggregation:[
 named(['max',f('Gross interest')],'Gross interest'),named(avg7('Gross interest'),'7-day average · daily'),
 named(['max',f('Valid cumulative')],'Cumulative gross interest'),named(avg7('Valid cumulative'),'7-day average · cumulative'),
 named(['min',f('History start','type/Date')],'History start'),named(['max',f('Generated at','type/DateTime')],'Generated at'),
 named(['max',f('Missing since start','type/Integer')],'Missing since start')
 ],'order-by':[['asc',date]]};
export const outer=(source=rolling)=>({'source-query':source,'order-by':[['asc',date]]});
export const sourceCard=id=>({'source-table':`card__${id}`});
export const chartQuery=(id,cumulative=false)=>query({...sourceCard(id),fields:[date,f(cumulative?'Cumulative gross interest':'Gross interest'),f(cumulative?'7-day average · cumulative':'7-day average · daily')],'order-by':[['asc',date]]});
export const chartSettings=(cumulative=false)=>{
 const metrics=cumulative?['Cumulative gross interest','7-day average · cumulative']:['Gross interest','7-day average · daily'];
 const colors=cumulative?['#88BF4D','#509EE3']:['#88BF4D','#F2A86F'];
 return {'graph.dimensions':['Date'],'graph.metrics':metrics,'graph.colors':colors,'graph.show_legend':true,'graph.y_axis.auto_split':false,'graph.y_axis.title_text':cumulative?'Baht accumulated':'Baht / day','graph.missing':'none','line.missing':'none','graph.show_values':false,'graph.show_trendline':false,'graph.show_goal':!cumulative,'graph.goal_value':10000,'graph.goal_label':'Daily goal · 10,000','stackable.stack_type':null,'line.interpolate':'linear',series_settings:Object.fromEntries(metrics.map((n,i)=>[n,{title:i===1?'7-day average':cumulative?'Accumulated':'Gross interest',color:colors[i],display:'line',axis:'left','line.interpolate':'linear','line.missing':'none','line.style':i===1&&!cumulative?'dashed':'solid','line.size':i===1?'L':'S','line.marker_enabled':null,show_series_trendline:false}])),column_settings:Object.fromEntries(metrics.map(n=>[JSON.stringify(['name',n]),{number_style:'decimal',decimals:0,number_separators:'.,',compact:false}]))};
};
export const readinessQuery=id=>query({...sourceCard(id),aggregation:[named(['min',f('History start','type/Date')],'History starts'),named(['count'],'Selected completed days'),named(['count',f('7-day average · daily')],'Daily MA ready days'),named(['count',f('7-day average · cumulative')],'Cumulative MA ready days')]});
export const dateMapping=id=>({parameter_id:'review-performance',card_id:id,target:['dimension',date]});
export function revisedLayout(d,state){
 const placements=structuredClone(d.dashcards);let next=-1;
 for(const p of placements.filter(x=>x.dashboard_tab_id===18)){
  if(p.card_id===222){p.row=29;p.size_y=8;p.parameter_mappings=[dateMapping(222)];}
  else if(p.card_id===223){p.row=37;p.col=0;}
  else if(p.card_id===224){p.row=37;p.col=12;}
  else if(p.card_id===225){p.row=44;p.col=0;p.size_x=24;}
  else if(p.card_id===228)p.row=18;
  else if(p.row>=37)p.row+=14;
  if(p.id===611){p.size_y=4;p.visualization_settings.virtual_card.visualization_settings.text='Yesterday refreshes hourly; rebuild older corrections. MA7 needs 7 complete days, including before the filter. Cumulative starts at history origin. Use one continuous range.';}
 }
 for(const [key,col,row,w,h] of [['cumulative',12,29,12,8],['readiness',0,25,24,4]])placements.push({id:next--,card_id:state[key],dashboard_tab_id:18,col,row,size_x:w,size_y:h,series:[],parameter_mappings:[dateMapping(state[key])],visualization_settings:{}});
 return placements;
}
export async function execute(q){const r=await api('POST','dataset',query(q));if(r.status!=='completed'){fs.writeFileSync(backup+'/query-error.json',JSON.stringify(r));throw Error(r.error??'Query failed; private diagnostic saved');}assert.ok(!r.data.rows_truncated,'Result truncated');return r;}
if(process.argv.includes('--preflight')){
 await assertSource();
 for(const [name,q] of [['origin',origin],['inputs',inputs],['coverage',coverage],['guarded',guarded],['rolling',rolling]]){
  const r=await execute(q);fs.writeFileSync(backup+'/'+name+'-result.json',JSON.stringify(r));console.log(JSON.stringify({name,rows:r.data.rows.length,columns:r.data.cols.map(c=>c.name)}));
 }
}
if(process.argv.includes('--install')){
 await assertSource();
 const verification=read('performance-redesign/rolling-verification.json');assert.ok(verification.count>=19);
 const tracker=fs.readFileSync(new URL('../../Documents/Release_Tracker.md',import.meta.url),'utf8');assert.ok(tracker.includes('**R017 — Open**')&&tracker.includes('Frozen for promotion'),'Publish R016 scope freeze before installation');
 const before=JSON.parse(fs.readFileSync(backup+'/dashboard.json'));
 const shape=cards=>cards.map(c=>Object.fromEntries(['id','card_id','dashboard_tab_id','col','row','size_x','size_y','series','parameter_mappings','visualization_settings'].map(k=>[k,c[k]]))).sort((a,b)=>a.id-b.id);
 let d=await api('GET','dashboard/3');assert.deepEqual(shape(d.dashcards),shape(before.dashcards));assert.deepEqual(d.tabs,before.tabs);assert.deepEqual(d.parameters,before.parameters);
 assert.deepEqual((await api('GET','card/222')).dataset_query,JSON.parse(fs.readFileSync(backup+'/card-222.json')).dataset_query);
 const state={backup,tab:18,daily:222};
 const create=async(key,body)=>{const c=await api('POST','card',{type:'question',collection_id:5,...body});state[key]=c.id;write('performance-redesign/rolling-state.json',state);return c.id;};
 const helper=await create('helper',{name:'Performance rolling averages · completed history',display:'table',dataset_query:query(rolling),visualization_settings:{'table.pivot':false},description:'R016 Metabase query-builder helper. Existing calendar + model 74; calendar gaps preserved. Strict trailing seven calendar days, full completed history before display filters. Cumulative unavailable after a missing input. Do not add a date filter inside this helper. No new SQL or database objects.'});
 await api('PUT','card/222',{name:'Daily gross interest & 7-day average',display:'line',dataset_query:chartQuery(helper),visualization_settings:chartSettings(),description:'Gross interest from completed daily snapshots; seven calendar days ending on each plotted day. Filter only this outer question. First six or missing-input windows have no average. Daily goal 10,000 baht. Not net profit.'});
 await create('cumulative',{name:'Cumulative gross interest · MA7',display:'line',dataset_query:chartQuery(helper,true),visualization_settings:chartSettings(true),description:'Model 74 gross interest accumulated since available history began; never reset by the display filter. Blue line averages seven cumulative levels. Missing prior history makes cumulative unavailable. Completed dates only.'});
 await create('readiness',{name:'Rolling-average coverage · selected completed dates',display:'table',dataset_query:readinessQuery(helper),visualization_settings:{'table.pivot':false},description:'Origin and counts of selected dates with complete seven-day inputs. History starts means available snapshot origin, not business inception. Earlier dates outside the selected period still contribute to averages. Original snapshot coverage panel retains generation times. Choose one continuous range.'});
 d=await api('GET','dashboard/3');assert.deepEqual(shape(d.dashcards),shape(before.dashcards));assert.deepEqual(d.tabs,before.tabs);
 await api('PUT','dashboard/3/cards',{tabs:d.tabs,cards:revisedLayout(d,state)});
 d=await api('GET','dashboard/3');assert.deepEqual(shape(d.dashcards.filter(c=>c.dashboard_tab_id!==18)),shape(before.dashcards.filter(c=>c.dashboard_tab_id!==18)));assert.deepEqual(d.tabs,before.tabs);assert.deepEqual(d.parameters,before.parameters);
 const questions=[];for(const id of [state.helper,222,state.cumulative,state.readiness]){const c=await api('GET','card/'+id);questions.push(Object.fromEntries(['id','name','description','display','dataset_query','visualization_settings','collection_id'].map(k=>[k,c[k]])));}
 write('performance-redesign/rolling-plan.json',{at:new Date().toISOString(),tabs:d.tabs,parameters:d.parameters,questions,layout:shape(d.dashcards.filter(c=>c.dashboard_tab_id===18)),database_changes:false});
 console.log('Installed 6R rolling averages; IDs recorded in rolling-state.json.');
}
