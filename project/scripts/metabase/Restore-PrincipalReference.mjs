import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {api,assertSource,root,privateDir,write} from './ReportingApi.mjs';

await assertSource();
const beforeDir=path.join(privateDir,'cash-pool-line-before');
const restoreDir=path.join(privateDir,'cash-pool-line-revert-before');
const original=name=>JSON.parse(fs.readFileSync(path.join(beforeDir,name),'utf8'));
const [model,question,dashboard]=await Promise.all([api('GET','card/74'),api('GET','card/62'),api('GET','dashboard/3')]);
const previousModel=original('model-74.json'),previousQuestion=original('card-62.json'),previousDashboard=original('dashboard-3.json');
assert.equal(model.result_metadata.length,19);
assert.equal(model.dataset_query.stages[0].native.includes('Current Total Cash Pool'),true);
assert.equal(question.display,'combo');
assert.deepEqual(question.visualization_settings['graph.metrics'],['Amount (THB)','Current Total Cash Pool (THB)']);
assert.equal(previousQuestion.visualization_settings['graph.goal_value'],120000);
assert.equal(previousQuestion.display,'area');
const oldNote=previousDashboard.dashcards.find(c=>c.visualization_settings?.virtual_card?.visualization_settings?.text?.includes('Principal reference: 120,000.'));
const currentNote=dashboard.dashcards.find(c=>c.id===oldNote?.id);
assert.ok(oldNote&&currentNote?.visualization_settings?.virtual_card?.visualization_settings?.text?.includes('Principal line: current Total Cash Pool.'));
const oldPlacement=previousDashboard.dashcards.find(c=>c.id===58),cashPlacement=previousDashboard.dashcards.find(c=>c.id===68);
assert.deepEqual(dashboard.dashcards.find(c=>c.id===58).parameter_mappings,oldPlacement.parameter_mappings);
assert.deepEqual(dashboard.dashcards.find(c=>c.id===68).parameter_mappings,cashPlacement.parameter_mappings);
fs.mkdirSync(restoreDir,{recursive:true});
for(const [name,value] of [['model-74.json',model],['card-62.json',question],['dashboard-3.json',dashboard]])fs.writeFileSync(path.join(restoreDir,name),JSON.stringify(value,null,2));
fs.copyFileSync(path.join(root,'Documents/AppSheet_Data_Dictionary.xlsx'),path.join(restoreDir,'AppSheet_Data_Dictionary.xlsx'));
console.log('Current state saved privately before restoration.');

await api('PUT','card/62',{dataset_query:previousQuestion.dataset_query,display:previousQuestion.display,visualization_settings:previousQuestion.visualization_settings,description:previousQuestion.description});
await api('PUT','card/74',{dataset_query:previousModel.dataset_query,result_metadata:previousModel.result_metadata,description:previousModel.description});
const cards=structuredClone(dashboard.dashcards);
cards.find(c=>c.id===oldNote.id).visualization_settings.virtual_card.visualization_settings.text=oldNote.visualization_settings.virtual_card.visualization_settings.text;
await api('PUT','dashboard/3/cards',{tabs:dashboard.tabs,cards});

const [savedModel,savedQuestion,savedDashboard,questionResult,overviewResult,cashResult]=await Promise.all([
 api('GET','card/74'),api('GET','card/62'),api('GET','dashboard/3'),api('POST','card/62/query',{}),
 api('POST','dashboard/3/dashcard/58/card/62/query',{parameters:[{id:'overview-trend-period',type:'date/relative',value:'past30days'}]}),
 api('POST','dashboard/3/dashcard/68/card/62/query',{parameters:[{id:'cash-date',type:'date/range',value:'2026-09-01~2026-09-15'}]})
]);
assert.equal(savedModel.result_metadata.length,18);
assert.equal(savedModel.dataset_query.stages[0].native,previousModel.dataset_query.stages[0].native);
assert.equal(savedQuestion.display,'area');
assert.equal(savedQuestion.visualization_settings['graph.goal_value'],120000);
assert.equal(savedQuestion.visualization_settings['graph.show_goal'],true);
assert.deepEqual(savedQuestion.visualization_settings['graph.metrics'],['Amount (THB)']);
for(const r of [questionResult,overviewResult,cashResult]){assert.equal(r.status,'completed');assert.deepEqual(r.data.cols.map(c=>c.name),['Date','Amount (THB)']);}
assert.equal(overviewResult.row_count,30);assert.equal(cashResult.row_count,15);
assert.deepEqual(savedDashboard.parameters,dashboard.parameters);
assert.deepEqual(savedDashboard.tabs,dashboard.tabs);
assert.deepEqual(savedDashboard.dashcards.map(c=>[c.id,c.card_id,c.dashboard_tab_id,c.col,c.row,c.size_x,c.size_y,c.parameter_mappings]).sort((a,b)=>a[0]-b[0]),dashboard.dashcards.map(c=>[c.id,c.card_id,c.dashboard_tab_id,c.col,c.row,c.size_x,c.size_y,c.parameter_mappings]).sort((a,b)=>a[0]-b[0]));
assert.equal(savedDashboard.dashcards.find(c=>c.id===oldNote.id).visualization_settings.virtual_card.visualization_settings.text,oldNote.visualization_settings.virtual_card.visualization_settings.text);
write('principal-reference-restore-verification.json',{restored_at:new Date().toISOString(),model_id:74,question_id:62,dashboard_id:3,fixed_reference:120000,model_fields:18,question_display:'area',question_metrics:['Amount (THB)'],full_question_rows:questionResult.row_count,overview_last_30_completed_days:overviewResult.row_count,cash_historical_range_rows:cashResult.row_count,layout_and_mappings_unchanged:true,note_restored:true,private_recovery_dir:restoreDir});
console.log(JSON.stringify({goal:savedQuestion.visualization_settings['graph.goal_value'],modelFields:savedModel.result_metadata.length,overviewRows:overviewResult.row_count,cashRows:cashResult.row_count}));
