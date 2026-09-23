import './LegacyStatementGuard.mjs';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {api,assertSource,read,write,root,privateDir} from './ReportingApi.mjs';
await assertSource();
const plan=read('income-db-views-plan.json'),models=read('models.json');
if(!read('income-db-views-production.json').checks.every(c=>c.exact_multiset_parity))throw Error('Missing PROD parity');
for(const [key,view]of Object.entries(plan.views)){
 const query=`SELECT * FROM public.${view}`;
 const r=await api('POST','dataset',{database:2,type:'native',native:{query}});
 if(r.status!=='completed')throw Error('Restricted view preflight failed '+key);
 assert.deepEqual(r.data.cols.map(c=>c.name),models[key].columns.map(c=>c.name));
}
for(const [key,view]of Object.entries(plan.views)){
 const id=models[key].id,query=`SELECT * FROM public.${view}`;
 await api('PUT','card/'+id,{dataset_query:{database:2,type:'native',native:{query,'template-tags':{}}}});
 const saved=await api('GET','card/'+id);
 const native=saved.dataset_query.stages?.[0]?.native??saved.dataset_query.native?.query;
 assert.equal(native.trim(),query);
 fs.writeFileSync(`${root}/scripts/metabase/models/${key}.sql`,query+'\n');
 models[key].database_view='public.'+view;
 fs.writeFileSync(`${privateDir}/income-db-views-before/${key}-after.json`,JSON.stringify(saved));
}
write('models.json',models);
write('income-db-views-switch.json',{switched_at:new Date().toISOString(),database:'loan_manager_prod',models:plan.model_ids,views:plan.views,fields_preserved:true,report_layout_changed:false});
console.log('Six existing models now select directly from PROD views; IDs and metadata retained.');
