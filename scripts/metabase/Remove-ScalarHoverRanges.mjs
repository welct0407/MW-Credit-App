import fs from 'node:fs';
import assert from 'node:assert/strict';
import {isDeepStrictEqual} from 'node:util';
import {api,assertSource,privateDir,write} from './ReportingApi.mjs';

await assertSource();
const before=JSON.parse(fs.readFileSync(privateDir+'/scalar-hover-before/cards.json','utf8'));
const dashboardBefore=JSON.parse(fs.readFileSync(privateDir+'/scalar-hover-before/dashboard-3.json','utf8'));
assert.equal(before.length,63,'Expected the reviewed 63 scalar cards');
const ids=before.map(c=>c.id).sort((a,b)=>a-b);
const beforeIds=[...new Set(dashboardBefore.dashcards.filter(x=>x.card?.display==='scalar'&&x.card.visualization_settings?.['scalar.segments']?.length).map(x=>x.card_id))].sort((a,b)=>a-b);
assert.deepEqual(ids,beforeIds);

for(const original of before){
 const current=await api('GET','card/'+original.id);
 assert.equal(current.display,'scalar');
 assert.deepEqual(current.dataset_query,original.dataset_query,`Query changed: ${original.id}`);
 assert.equal(current.collection_id,original.collection_id);
 const clean={...original.visualization_settings};delete clean['scalar.segments'];
 if(isDeepStrictEqual(current.visualization_settings,clean))continue;
 assert.deepEqual(current.visualization_settings,original.visualization_settings,`Other formatting changed: ${original.id}`);
 await api('PUT','card/'+original.id,{visualization_settings:clean});
 const saved=await api('GET','card/'+original.id);
 assert.deepEqual(saved.visualization_settings,clean,`Formatting not saved: ${original.id}`);
}

const dashboard=await api('GET','dashboard/3');
const shape=c=>Object.fromEntries(['id','card_id','dashboard_tab_id','col','row','size_x','size_y','parameter_mappings','visualization_settings'].map(k=>[k,c[k]]));
assert.deepEqual(dashboard.dashcards.map(shape).sort((a,b)=>a.id-b.id),dashboardBefore.dashcards.map(shape).sort((a,b)=>a.id-b.id));
assert.deepEqual(dashboard.parameters,dashboardBefore.parameters);
assert.equal(dashboard.dashcards.filter(x=>x.card?.display==='scalar'&&x.card.visualization_settings?.['scalar.segments']?.length).length,0);
write('scalar-hover-cleanup.json',{
 source_dashboard:3,affected_scalar_questions:ids,question_count:ids.length,
 unaffected_gauge_questions:[68],scope:'Remove decorative scalar.segments ranges; retain chart and gauge data tooltips',
 private_rollback:'scalar-hover-before/cards.json',previous_dashboard_layout_and_filters_preserved:true,
 color_effect:'Number cards use Metabase default color; table conditional formatting and chart colors unchanged'
});
console.log(`Removed meaningless scalar hover ranges from ${ids.length} questions.`);
