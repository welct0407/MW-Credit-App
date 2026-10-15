import fs from 'node:fs';
import {api,assertSource,privateDir,write} from './ReportingApi.mjs';
await assertSource();
const dir=privateDir+'/statement-cleanup-before';
if(fs.existsSync(dir))throw Error('Baseline already exists');
fs.mkdirSync(dir,{recursive:true});
const save=(n,v)=>fs.writeFileSync(`${dir}/${n}.json`,JSON.stringify(v,null,2));
const cards=await api('GET','card'),dashboards=await api('GET','dashboard');
save('cards',cards);save('snippets',await api('GET','native-query-snippet'));save('collection-graph',await api('GET','collection/graph'));
for(const d of dashboards)save('dashboard-'+d.id,await api('GET','dashboard/'+d.id));
const complete=[];for(const c of cards){const full=await api('GET','card/'+c.id);save('card-'+c.id,full);complete.push(full);}
const d=JSON.parse(fs.readFileSync(dir+'/dashboard-3.json'));
write('statement-cleanup-inspection.json',{baseline_commit:'cf243e138cd85701cd8e156626e88a65174d604e',tabs:d.tabs,questions:complete.map(c=>({id:c.id,name:c.name,type:c.type,refs:[...JSON.stringify(c.dataset_query).matchAll(/(?:card__|\{\{#)(\d+)/g)].map(m=>Number(m[1])),tabs:d.dashcards.filter(x=>x.card_id===c.id).map(x=>x.dashboard_tab_id)}))});
console.log(JSON.stringify({tabs:d.tabs,models:complete.filter(c=>c.type==='model').map(c=>({id:c.id,name:c.name})),parameters:d.parameters,statementCards:complete.filter(c=>c.id>=163&&c.id<=198).map(c=>({id:c.id,name:c.name,tabs:d.dashcards.filter(x=>x.card_id===c.id).map(x=>x.dashboard_tab_id)}))}));
