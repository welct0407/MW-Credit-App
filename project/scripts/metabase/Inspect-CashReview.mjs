import fs from 'node:fs';
import {api,assertSource,privateDir} from './ReportingApi.mjs';
await assertSource();
const dir=privateDir+'/cash-review-before';
if(fs.existsSync(dir))throw Error('Backup exists; reuse it, do not overwrite');
fs.mkdirSync(dir,{recursive:true});
const save=(name,value)=>fs.writeFileSync(dir+'/'+name+'.json',JSON.stringify(value,null,2));
const d=await api('GET','dashboard/3');save('dashboard',d);
save('collection-graph',await api('GET','collection/graph'));
save('snippets',await api('GET','native-query-snippet'));
const ids=[...new Set([...d.dashcards.map(c=>c.card_id).filter(Boolean),...Array.from({length:8},(_,i)=>[73,74,187,188,190,191,163,186][i])])];
const cards=[];for(const id of ids){const c=await api('GET','card/'+id);save('card-'+id,c);cards.push(c);}
console.log(JSON.stringify({backup:dir,tabs:d.tabs,parameters:d.parameters,cards:cards.map(c=>({id:c.id,name:c.name,display:c.display})),models:cards.filter(c=>[73,74,187,188,190,191].includes(c.id)).map(c=>({id:c.id,columns:c.result_metadata?.map(f=>({name:f.name,base_type:f.base_type}))}))},null,2));
