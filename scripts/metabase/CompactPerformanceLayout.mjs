import fs from 'node:fs';
import assert from 'node:assert/strict';
import {api,assertSource} from './ReportingApi.mjs';
const dir='outputs/r020-20260924';
const backup='C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/r020-layout/dashboard.json';
const before=JSON.parse(fs.readFileSync(backup));
const shape=c=>Object.fromEntries(['id','card_id','dashboard_tab_id','col','row','size_x','size_y','series','parameter_mappings','visualization_settings'].map(k=>[k,c[k]]));
const cards=before.dashcards.map(original=>{let c=structuredClone(original);if(c.dashboard_tab_id!==18)return c;
if(c.row>=24)c.row-=11;
if(c.card_id===233)Object.assign(c,{row:53,col:0,size_x:12,size_y:7});
if(c.card_id===226)Object.assign(c,{row:53,col:12,size_x:12});
if(c.id===625)Object.assign(c,{row:60,col:0,size_x:12,size_y:3});
if(c.id===619)Object.assign(c,{row:60,col:12,size_x:12,size_y:3});
if(c.card_id===227)c.row=63;
if(c.id===610)c.visualization_settings.virtual_card.visualization_settings.text='Performance trends · snapshots except loan-cohort return (live)';
return c;});
const tab=cards.filter(c=>c.dashboard_tab_id===18);
for(let i=0;i<tab.length;i++)for(let j=i+1;j<tab.length;j++){const a=tab[i],b=tab[j];assert.ok(!(a.col<b.col+b.size_x&&a.col+a.size_x>b.col&&a.row<b.row+b.size_y&&a.row+a.size_y>b.row),'Overlap');}
fs.writeFileSync(dir+'/plan.json',JSON.stringify({layout:tab.map(shape)},null,2)+'\n');
if(process.argv.includes('--publish')){await assertSource();const live=await api('GET','dashboard/3');assert.deepEqual(live.dashcards.map(shape).sort((a,b)=>a.id-b.id),before.dashcards.map(shape).sort((a,b)=>a.id-b.id));await api('PUT','dashboard/3/cards',{tabs:live.tabs,cards});}
if(process.argv.includes('--verify')){const live=await api('GET','dashboard/3');assert.deepEqual(live.dashcards.map(shape).sort((a,b)=>a.id-b.id),cards.map(shape).sort((a,b)=>a.id-b.id));assert.deepEqual(live.parameters,before.parameters);assert.deepEqual(live.tabs,before.tabs);for(const c of live.dashcards.filter(c=>c.card_id)){const b=before.dashcards.find(b=>b.id===c.id);assert.deepEqual(c.card.dataset_query,b.card.dataset_query);assert.deepEqual(c.card.visualization_settings,b.card.visualization_settings);}fs.writeFileSync(dir+'/verification.json',JSON.stringify({at:new Date().toISOString(),checks:['No overlapping placements','Exact saved layout','All queries and chart settings unchanged','Dashboard filters and tabs unchanged'],placements:live.dashcards.length},null,2)+'\n');}
console.log('Layout checks passed');
