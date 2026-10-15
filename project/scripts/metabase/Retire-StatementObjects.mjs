import fs from 'node:fs';
import assert from 'node:assert/strict';
import {api,read,write} from './ReportingApi.mjs';
import {backup,prior} from './StatementCleanup.mjs';
let existing;try{existing=read('statement-cleanup/retirement.json');}catch{}
if(existing?.applied)throw Error('Retirement is complete; preserve its evidence. A later cleanup needs a fresh scoped baseline.');
const cards=[];for(const c of await api('GET','card'))cards.push(await api('GET','card/'+c.id));
const snippets=await api('GET','native-query-snippet');
const dashboards=[];for(const x of await api('GET','dashboard'))dashboards.push(await api('GET','dashboard/'+x.id));
const old=prior('dashboard-3');
const candidates=new Set([...old.dashcards.filter(c=>[5,12,13].includes(c.dashboard_tab_id)).map(c=>c.card_id).filter(Boolean),173,174,175,200,201,...cards.filter(c=>c.type==='model').map(c=>c.id)]);
const refs=value=>{const found=new Set();const walk=v=>{if(typeof v==='string'){for(const m of v.matchAll(/(?:card__|\{\{#)(\d+)/g))found.add(Number(m[1]));}else if(Array.isArray(v))v.forEach(walk);else if(v&&typeof v==='object')for(const [k,x] of Object.entries(v)){if(['card-id','card_id','source-card','source_card_id'].includes(k)&&Number.isInteger(x))found.add(x);else walk(x);}};walk(value);return found;};
const roots=new Set();for(const d of dashboards){for(const c of d.dashcards){if(c.card_id)roots.add(c.card_id);for(const s of c.series??[])if(s.id)roots.add(s.id);}for(const id of refs(d.parameters))roots.add(id);}
for(const c of cards)if(!candidates.has(c.id))roots.add(c.id);
// Saved subscriptions/alerts are independent consumers, even when absent from a dashboard.
for(const route of ['pulse','alert']){const consumers=await api('GET',route);fs.writeFileSync(`${backup}/${route}-consumers.json`,JSON.stringify(consumers));for(const id of refs(consumers))roots.add(id);}
const byId=new Map(cards.map(c=>[c.id,c])),bySnippet=new Map(snippets.map(s=>[s.id,s]));
const reachable=new Set();
function visit(id){if(reachable.has(id))return;reachable.add(id);const c=byId.get(id);if(!c)return;for(const id of refs(c.dataset_query))visit(id);const text=JSON.stringify(c.dataset_query);for(const s of snippets)if(text.includes('snippet: '+s.name)||text.includes('"snippet-id":'+s.id)){for(const id of refs(s.content))visit(id);}}
for(const id of roots)visit(id);
const retired=cards.filter(c=>candidates.has(c.id)&&!reachable.has(c.id)).map(c=>({id:c.id,name:c.name,type:c.type}));
write('statement-cleanup/retirement.json',{at:new Date().toISOString(),retired,retained_models:cards.filter(c=>c.type==='model'&&reachable.has(c.id)).map(c=>({id:c.id,name:c.name})),external_roots_checked:['all dashboards','parameter value sources','card references','snippet references','alerts','subscriptions'],applied:false});
if(process.argv.includes('--apply')){
 assert.ok(read('statement-cleanup/verification.json').check_count>100,'Complete report verification first');
 for(const c of retired){await api('PUT','card/'+c.id,{archived:true});assert.equal((await api('GET','card/'+c.id)).archived,true);}
 const remaining=await api('GET','card');for(const c of remaining)for(const id of refs(c.dataset_query))assert.ok(!retired.some(r=>r.id===id),'Remaining dependency '+c.id);
 const models=read('models.json');for(const [key,m] of Object.entries(models))if(retired.some(c=>c.id===m.id))delete models[key];write('models.json',models);
 const evidence=read('statement-cleanup/retirement.json');evidence.applied=true;evidence.active_models=Object.keys(models).length;evidence.active_model_fields=Object.values(models).reduce((n,m)=>n+m.columns.length,0);write('statement-cleanup/retirement.json',evidence);
}
console.log(JSON.stringify({retired,applied:process.argv.includes('--apply')}));
