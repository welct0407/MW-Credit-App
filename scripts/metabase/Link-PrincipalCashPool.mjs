import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {api,assertSource,root,privateDir,read,write} from './ReportingApi.mjs';

await assertSource();
const sql=fs.readFileSync(path.join(root,'scripts/metabase/models/daily.sql'),'utf8').trim();
const [model,card,dashboard,baseline,prepared,source]=await Promise.all([
 api('GET','card/74'),api('GET','card/62'),api('GET','dashboard/3'),
 api('POST','card/62/query',{}),
 api('POST','dataset',{database:2,type:'native',native:{query:sql,'template-tags':{}}}),
 api('POST','dataset',{database:2,type:'native',native:{query:'SELECT "Total Cash Pool"::numeric AS cash_pool FROM public.olap_portfolio_summary','template-tags':{}}})
]);
assert.equal(model.id,74);assert.equal(card.id,62);
assert.equal(model.dataset_query.stages[0].native.includes('Current Total Cash Pool'),false);
assert.equal(card.visualization_settings['graph.goal_value'],120000);
assert.equal(prepared.status,'completed');assert.equal(source.status,'completed');assert.equal(source.row_count,1);
assert.equal(prepared.row_count,model.result_metadata.length?prepared.data.rows.length:prepared.row_count);
assert.equal(prepared.row_count,50);
assert.deepEqual(prepared.data.rows.map(row=>row[1]),(await api('POST','card/74/query',{})).data.rows.map(row=>row[1]));
assert.ok(prepared.data.rows.every(row=>Number(row[5])===Number(source.data.rows[0][0])));
const beforeDir=path.join(privateDir,'cash-pool-line-before');fs.mkdirSync(beforeDir,{recursive:true});
for(const [name,value] of [['model-74.json',model],['card-62.json',card],['dashboard-3.json',dashboard]])fs.writeFileSync(path.join(beforeDir,name),JSON.stringify(value,null,2));
fs.copyFileSync(path.join(root,'Documents/AppSheet_Data_Dictionary.xlsx'),path.join(beforeDir,'AppSheet_Data_Dictionary.xlsx'));
console.log('Private rollback saved for model 74, question 62, dashboard 3 and dictionary.');

const modelDescription='One stored daily snapshot. Includes the current Total Cash Pool as a repeated comparison value; it is not a historical cash-pool balance. Gross interest, cumulative interest, capital yield and Bangkok date windows retain their existing definitions.';
await api('PUT','card/74',{dataset_query:{database:2,type:'native',native:{query:sql,'template-tags':{}}},description:modelDescription});
const result=await api('POST','card/74/query',{});assert.equal(result.status,'completed');assert.equal(result.row_count,prepared.row_count);
const existing=new Map(model.result_metadata.map(c=>[c.name,c]));
const metadata=result.data.cols.map(c=>{
 const prior=existing.get(c.name);if(prior)return {...c,...Object.fromEntries(['semantic_type','description','settings','id','fk_target_field_id'].filter(k=>prior[k]!==undefined).map(k=>[k,prior[k]]))};
 assert.equal(c.name,'Current Total Cash Pool');
 return {...c,semantic_type:'type/Currency',description:'Current Total Cash Pool from olap_portfolio_summary, repeated on each daily snapshot for a horizontal comparison. It is not the balance on that snapshot date.',settings:{number_style:'currency',currency:'THB',currency_style:'code',decimals:0}};
});
await api('PUT','card/74',{result_metadata:metadata});
const F=(name,type='type/Decimal')=>['field',name,{'base-type':type}];
const settings=structuredClone(card.visualization_settings);
delete settings['graph.goal_value'];delete settings['graph.goal_label'];settings['graph.show_goal']=false;
settings['graph.metrics']=['Amount (THB)','Current Total Cash Pool (THB)'];
settings['graph.colors']=['#178F8A','#7472BE'];settings['graph.show_legend']=true;
settings['graph.y_axis.auto_split']=false;
settings.series_settings={'Amount (THB)':{color:'#178F8A',display:'area',title:'Outstanding principal'},'Current Total Cash Pool (THB)':{color:'#7472BE',display:'line',title:'Current Total Cash Pool'}};
settings.column_settings[JSON.stringify(['name','Current Total Cash Pool (THB)'])]={number_style:'decimal',decimals:0,number_separators:'.,'};
const dataset_query={database:2,type:'query',query:{'source-table':'card__74',breakout:[F('Date','type/Date')],aggregation:[['aggregation-options',['sum',F('Outstanding Principal')],{name:'Amount (THB)','display-name':'Amount (THB)'}],['aggregation-options',['max',F('Current Total Cash Pool')],{name:'Current Total Cash Pool (THB)','display-name':'Current Total Cash Pool (THB)'}]],'order-by':[['asc',F('Date','type/Date')]]}};
const description='Stored daily outstanding-principal snapshots with a line for the current Total Cash Pool from olap_portfolio_summary. The cash-pool line changes with the current source value and is repeated across chart dates; it is not a historical cash-pool series. Built from Daily Performance.';
await api('PUT','card/62',{dataset_query,display:'combo',visualization_settings:settings,description});
const saved=await api('GET','card/62');const compared=await api('POST','card/62/query',{});
assert.equal(saved.display,'combo');assert.equal(saved.visualization_settings['graph.show_goal'],false);
assert.deepEqual(saved.visualization_settings['graph.metrics'],settings['graph.metrics']);
assert.equal(compared.status,'completed');assert.equal(compared.row_count,baseline.row_count);
assert.deepEqual(compared.data.rows.map(row=>row[0]),baseline.data.rows.map(row=>row[0]));
assert.deepEqual(compared.data.rows.map(row=>row[1]),baseline.data.rows.map(row=>row[1]));
assert.ok(compared.data.rows.every(row=>Number(row[2])===Number(source.data.rows[0][0])));
const note=dashboard.dashcards.find(c=>c.visualization_settings?.virtual_card?.visualization_settings?.text?.includes('Principal reference: 120,000.'));
assert.ok(note);
const placements=structuredClone(dashboard.dashcards),updatedNote=placements.find(c=>c.id===note.id);
updatedNote.visualization_settings.virtual_card.visualization_settings.text=updatedNote.visualization_settings.virtual_card.visualization_settings.text.replace('Principal reference: 120,000.','Principal line: current Total Cash Pool.');
await api('PUT','dashboard/3/cards',{tabs:dashboard.tabs,cards:placements});
const afterDashboard=await api('GET','dashboard/3');
assert.deepEqual(afterDashboard.dashcards.map(c=>[c.id,c.card_id,c.dashboard_tab_id,c.col,c.row,c.size_x,c.size_y,c.parameter_mappings]).sort((a,b)=>a[0]-b[0]),dashboard.dashcards.map(c=>[c.id,c.card_id,c.dashboard_tab_id,c.col,c.row,c.size_x,c.size_y,c.parameter_mappings]).sort((a,b)=>a[0]-b[0]));
assert.deepEqual(afterDashboard.parameters,dashboard.parameters);
assert.equal(afterDashboard.dashcards.find(c=>c.id===note.id).visualization_settings.virtual_card.visualization_settings.text.includes('Principal line: current Total Cash Pool.'),true);
const models=read('models.json'),daily=models.daily;daily.grain=modelDescription;daily.rows=result.row_count;
const newColumn=metadata.find(c=>c.name==='Current Total Cash Pool');
assert.ok(newColumn&&!daily.columns.some(c=>c.name===newColumn.name));
daily.columns.splice(daily.columns.findIndex(c=>c.name==='Outstanding Principal')+1,0,{name:newColumn.name,base_type:newColumn.base_type,semantic_type:newColumn.semantic_type,id:null,fk_target_field_id:null,description:newColumn.description});
write('models.json',models);
write('principal-cash-pool-verification.json',{saved_at:new Date().toISOString(),model_id:74,question_id:62,source:'public.olap_portfolio_summary."Total Cash Pool"',daily_rows:result.row_count,model_columns:metadata.length,principal_results_unchanged:true,cash_pool_matches_source:true,fixed_goal_removed:true,chart_display:'combo',single_y_axis:true,overview_placement:58,cash_placement:68,dashboard_layout_unchanged:true,note_updated:true,rollback_dir:beforeDir});
console.log(JSON.stringify({dailyRows:result.row_count,modelColumns:metadata.length,chartRows:compared.row_count,principalUnchanged:true,cashPoolMatched:true}));
