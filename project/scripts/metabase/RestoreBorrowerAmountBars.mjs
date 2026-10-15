// R039: restore the two retained amount-ranking questions alongside both pies and ratio charts.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {api,assertSource,root} from './ReportingApi.mjs';
const out=root+'/outputs/r039-restore-borrower-bars';fs.mkdirSync(out,{recursive:true});
const priv='C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/r039-restore-borrower-bars';
const before=JSON.parse(fs.readFileSync(priv+'/before.json'));
const former=JSON.parse(fs.readFileSync('C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/r037-borrower-contribution/before.json'));
const save=(n,x)=>fs.writeFileSync(out+'/'+n+'.json',JSON.stringify(x,null,2)+'\n');
const shape=xs=>xs.map(({id,card_id,dashboard_tab_id,row,col,size_x,size_y,parameter_mappings,visualization_settings,series})=>({id,card_id,dashboard_tab_id,row,col,size_x,size_y,parameter_mappings,visualization_settings,series})).sort((a,b)=>a.id-b.id);
const restored=[285,286].map((id,i)=>{const c=former.dashcards.find(c=>c.card_id===id&&c.dashboard_tab_id===104);assert(c);const {card,...p}=c;return {...p,id:-39001-i,row:23,col:i*12,size_x:12,size_y:9};});
const retained=before.dashcards.map(c=>c.dashboard_tab_id===104&&c.row>=23?{...c,row:c.row+9}:c);
if(process.argv.includes('--plan')){save('plan',{dashboard:3,tab:104,restored:shape(restored),shiftLaterRows:9,pies:[311,312],ratios:[313,314],queries:'Reused unchanged saved questions285/286. Principal current; interest uses selected activity dates, default previous30 completed Bangkok days.'});console.log('Prepared additive layout; six charts coexist');}
if(process.argv.includes('--publish')){
 await assertSource();let d=await api('GET','dashboard/3');assert.deepEqual(shape(d.dashcards),shape(before.dashcards),'Dashboard drift');assert.deepEqual(d.parameters,before.parameters);
 for(const id of [285,286]){const c=await api('GET',`card/${id}`);assert(!c.archived);assert.deepEqual(c.dataset_query,JSON.parse(fs.readFileSync(priv+`/card-${id}.json`)).dataset_query);}
 const backup=await api('POST','dashboard/3/copy',{name:'R039 recovery - before restoring borrower amount bars',collection_id:5});save('state',{backupDashboard:backup.id,dashboard:3,tab:104,restoredQuestions:[285,286]});
 await api('PUT','dashboard/3/cards',{tabs:d.tabs,cards:[...retained,...restored]});console.log('Restored both amount bars; pies and ratio charts retained');
}
if(process.argv.includes('--verify')){
 const d=await api('GET','dashboard/3');assert.deepEqual(d.tabs,before.tabs);assert.deepEqual(d.parameters,before.parameters);
 assert.deepEqual(shape(d.dashcards.filter(c=>![285,286].includes(c.card_id)||c.dashboard_tab_id!==104)),shape(retained));
 for(const id of [285,286,311,312,313,314])assert.equal(d.dashcards.filter(c=>c.dashboard_tab_id===104&&c.card_id===id).length,1);
 const checks=[];const questions=[];
 for(const id of [285,286]){
  const c=await api('GET',`card/${id}`),old=JSON.parse(fs.readFileSync(priv+`/card-${id}.json`));assert.deepEqual(c.dataset_query,old.dataset_query);assert.deepEqual(c.visualization_settings,old.visualization_settings);
  const p=d.dashcards.find(c=>c.dashboard_tab_id===104&&c.card_id===id),original=restored.find(c=>c.card_id===id);assert.deepEqual(p.parameter_mappings,original.parameter_mappings);assert.deepEqual(p.visualization_settings,original.visualization_settings);
  const r=await api('POST',`dashboard/3/dashcard/${p.id}/card/${id}/query`,{parameters:[]});assert.equal(r.status,'completed');checks.push({id,rows:r.data.rows.length,definitionUnchanged:true,originalMappingsAndDrillThroughRestored:true});
  questions.push({id:c.id,name:c.name,display:c.display,dataset_query:c.dataset_query,visualization_settings:c.visualization_settings});
 }
 save('saved',{dashboard:3,tab:104,questions,layout:shape(d.dashcards.filter(c=>c.dashboard_tab_id===104))});save('verification',{passed:true,sixChartsPresent:true,existingCardsPreserved:true,otherTabsAndFiltersPreserved:true,checks});console.log('Both queries load; six charts present; retained cards and mappings verified');
}
