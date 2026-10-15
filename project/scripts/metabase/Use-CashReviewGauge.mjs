import './LegacyStatementGuard.mjs';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {api,assertSource,privateDir,read,write} from './ReportingApi.mjs';
import {project} from './CashReviewPages.mjs';
await assertSource();
const before=await api('GET','dashboard/3');
const tab=before.tabs.find(t=>t.id===14&&t.name==='2R · Cash Position');assert.ok(tab);
const target=before.dashcards.find(c=>c.dashboard_tab_id===14&&c.card_id===54);assert.ok(target,'Expected scalar placement');
const gauge=await api('GET','card/68'),scalar=await api('GET','card/54');assert.equal(gauge.display,'gauge');
const dir=privateDir+'/cash-review-gauge-before';assert.ok(!fs.existsSync(dir),'Do not overwrite rollback baseline');fs.mkdirSync(dir,{recursive:true});
for(const [name,value] of [['dashboard',before],['gauge',gauge],['scalar',scalar]])fs.writeFileSync(dir+'/'+name+'.json',JSON.stringify(value,null,2));
const g=await api('POST','card/68/query',{}),s=await api('POST','card/54/query',{});
assert.equal(g.status,'completed');assert.equal(s.status,'completed');assert.deepEqual(g.data.rows,s.data.rows);
const expected=structuredClone(before.dashcards);
for(const c of expected.filter(c=>c.dashboard_tab_id===14)){
 if(c.id===target.id){c.card_id=68;c.col=12;c.row=4;c.size_x=12;c.size_y=4;c.parameter_mappings=[];}
 else if(c.card_id===47){c.col=0;c.row=4;c.size_x=12;c.size_y=2;}
 else if(c.card_id===48){c.col=0;c.row=6;c.size_x=12;c.size_y=2;}
 else if(c.row>=6)c.row+=2;
}
await api('PUT','dashboard/3/cards',{tabs:before.tabs,cards:expected});
const after=await api('GET','dashboard/3');
assert.deepEqual(after.dashcards.map(project).sort((a,b)=>a.id-b.id),expected.map(project).sort((a,b)=>a.id-b.id));
assert.deepEqual(after.parameters,before.parameters);assert.deepEqual(after.tabs,before.tabs);
assert.deepEqual((await api('GET','card/68')).dataset_query,gauge.dataset_query);
assert.deepEqual((await api('GET','card/68')).visualization_settings,gauge.visualization_settings);
assert.deepEqual((await api('GET','card/54')).dataset_query,scalar.dataset_query);
const live=await api('POST',`dashboard/3/dashcard/${target.id}/card/68/query`,{});assert.equal(live.status,'completed');assert.deepEqual(live.data.rows,g.data.rows);
const plan=read('cash-review-plan.json');plan.reused_question_ids=plan.reused_question_ids.map(id=>id===54?68:id);write('cash-review-plan.json',plan);
write('cash-review-gauge-verification.json',{verified_at:new Date().toISOString(),baseline_commit:'4cfd6054acc32ee874c6cb6cca762e935994b702',tab_id:14,placement_id:target.id,previous_question:54,reused_gauge_question:68,new_questions:0,checks:['Gauge and previous scalar return identical utilization','Saved gauge placement query completes','Only 2R capital layout and downstream spacing changed','All tabs and parameter definitions unchanged','Shared gauge query/settings and scalar query unchanged'],reused_existing_gauge_scale_and_thresholds:true,financial_values_published:false});
console.log(JSON.stringify({tab_id:14,placement_id:target.id,gauge_settings:gauge.visualization_settings,checks:5}));
