import assert from 'node:assert/strict';
import fs from 'node:fs';
import {api,assertSource,read,write,privateDir} from './ReportingApi.mjs';
await assertSource();
const plan=read('income-db-views-plan.json'),models=read('models.json'),checks=[];
for(const [key,view]of Object.entries(plan.views)){
 const before=JSON.parse(fs.readFileSync(`${plan.baseline}/${key}.json`)),after=await api('GET','card/'+models[key].id);
 const fields=c=>c.result_metadata.map(f=>Object.fromEntries(['name','base_type','semantic_type','description','settings'].map(k=>[k,f[k]])));
 assert.deepEqual(fields(after),fields(before),'Model metadata changed '+key);
 assert.equal(after.dataset_query.stages[0].native.trim(),'SELECT * FROM public.'+view);
 checks.push({model:key,thin_view_query:true,field_metadata_preserved:true});
}
const before=JSON.parse(fs.readFileSync(plan.baseline+'/dashboard-3.json')),after=await api('GET','dashboard/3');
const project=c=>Object.fromEntries(['id','card_id','dashboard_tab_id','col','row','size_x','size_y','parameter_mappings','visualization_settings'].map(k=>[k,c[k]]));
assert.deepEqual(after.dashcards.map(project),before.dashcards.map(project));
assert.deepEqual(after.parameters,before.parameters);
assert.deepEqual(await api('GET','collection/graph'),JSON.parse(fs.readFileSync(plan.baseline+'/collection-graph.json')));
write('income-db-views-switch-verification.json',{verified_at:new Date().toISOString(),checks,all_nine_page_layouts_and_filters_preserved:true,partner_permissions_preserved:true,source_database:'loan_manager_prod'});
console.log('Six thin model queries, metadata, all layouts, filters and permissions verified.');
