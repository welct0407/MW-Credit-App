import fs from 'node:fs';
import {api,assertSource,privateDir} from './ReportingApi.mjs';
await assertSource();
const dir=privateDir+'/cash-snapshot-report-before';
if(fs.existsSync(dir))throw Error('Existing baseline must not be overwritten');
fs.mkdirSync(dir,{recursive:true});
const save=(n,v)=>fs.writeFileSync(`${dir}/${n}.json`,JSON.stringify(v,null,2));
const d=await api('GET','dashboard/3');save('dashboard',d);
save('collection-graph',await api('GET','collection/graph'));
save('snippets',await api('GET','native-query-snippet'));
const ids=[...new Set([...d.dashcards.filter(c=>c.dashboard_tab_id===14).map(c=>c.card_id).filter(Boolean),73,74,163,164,187,188])];
const cards=[];for(const id of ids){const c=await api('GET',`card/${id}`);save('card-'+id,c);cards.push(c);}
console.log(JSON.stringify({tabs:d.tabs,parameters:d.parameters.filter(p=>p.id.startsWith('review-position')),placements:d.dashcards.filter(c=>c.dashboard_tab_id===14).map(c=>({id:c.id,card:c.card_id,row:c.row,title:c.visualization_settings?.['card.title']})),cards:cards.map(c=>({id:c.id,name:c.name,query:c.type==='model'?c.dataset_query:undefined,fields:c.type==='model'?c.result_metadata?.map(f=>({name:f.name,base_type:f.base_type})):undefined}))},null,2));
