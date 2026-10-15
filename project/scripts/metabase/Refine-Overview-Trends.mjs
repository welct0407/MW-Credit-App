import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {api,assertSource,privateDir,write} from './ReportingApi.mjs';

await assertSource();
const before=await api('GET','dashboard/3');
const overview=before.tabs.find(t=>t.name==='1 · Overview');
const cash=before.tabs.find(t=>t.name==='2 · Cash Analysis');
assert.ok(overview&&cash);
const trends=before.dashcards.filter(c=>c.dashboard_tab_id===overview.id&&[62,63,64].includes(c.card_id));
assert.deepEqual(trends.map(c=>c.card_id).sort((a,b)=>a-b),[62,63,64]);
assert.ok(before.dashcards.some(c=>c.dashboard_tab_id===cash.id&&c.card_id===62));

const rename=s=>s.replace(/\s*·\s*THB\b/g,'').replace(/,\s*THB\b/g,'');
const titleChanges=[],questionChanges=[];
const cards=before.dashcards.map(c=>{
 const v=structuredClone(c),settings=v.visualization_settings??{};
 if(typeof settings['card.title']==='string'){
  const old=settings['card.title'],next=rename(old);
  if(next!==old){settings['card.title']=next;titleChanges.push({placement:c.id,old,next});}
 }
 const virtual=settings.virtual_card?.visualization_settings;
 if(typeof virtual?.text==='string'){
  const old=virtual.text;
  let next=rename(old).replace('Amounts in **THB**. ','').replace(' All amounts are THB.','');
  if(next!==old){virtual.text=next;titleChanges.push({placement:c.id,old,next});}
 }
 if(trends.some(t=>t.id===c.id)){
  assert.equal(v.parameter_mappings.length,0);
  v.parameter_mappings=[{parameter_id:'overview-trend-period',card_id:c.card_id,target:['dimension',['field','Date',{'base-type':'type/Date'}]]}];
 }
 return v;
});
const parameters=structuredClone(before.parameters);
assert.ok(!parameters.some(p=>p.id==='overview-trend-period'));
parameters.push({id:'overview-trend-period',name:'Portfolio trend period',slug:'overview_trend_period',type:'date/all-options',sectionId:'date',default:'past30days'});
const proposed=parameters.find(p=>p.id==='proposed-amount');
assert.equal(proposed?.name,'Proposed loan · THB');proposed.name='Proposed loan';
titleChanges.push({parameter:'proposed-amount',old:'Proposed loan · THB',next:proposed.name});
const ids=[...new Set(before.dashcards.filter(c=>c.card_id&&c.card?.name&&rename(c.card.name)!==c.card.name).map(c=>c.card_id))];
const questionBackups=await Promise.all(ids.map(id=>api('GET',`card/${id}`)));
const backupDir=path.join(privateDir,'overview-trend-before');fs.mkdirSync(backupDir,{recursive:true});
fs.writeFileSync(path.join(backupDir,'dashboard.json'),JSON.stringify(before,null,2));
for(const q of questionBackups)fs.writeFileSync(path.join(backupDir,`card-${q.id}.json`),JSON.stringify(q,null,2));
console.log(`Rollback saved privately: dashboard and ${questionBackups.length} question definitions.`);

await api('PUT','dashboard/3',{parameters});
await api('PUT','dashboard/3/cards',{tabs:before.tabs,cards});
for(const q of questionBackups){const next=rename(q.name);await api('PUT',`card/${q.id}`,{name:next});questionChanges.push({id:q.id,old:q.name,next});}

const after=await api('GET','dashboard/3');
assert.equal(after.tabs.length,before.tabs.length);
assert.equal(after.dashcards.length,before.dashcards.length);
assert.equal(after.dashcards.filter(c=>c.card_id).length,before.dashcards.filter(c=>c.card_id).length);
assert.equal(after.parameters.find(p=>p.id==='overview-trend-period')?.default,'past30days');
assert.equal(after.parameters.find(p=>p.id==='proposed-amount')?.name,'Proposed loan');
for(const c of trends){const saved=after.dashcards.find(v=>v.id===c.id);assert.equal(saved?.parameter_mappings.find(m=>m.parameter_id==='overview-trend-period')?.card_id,c.card_id);}
const cashBefore=before.dashcards.find(c=>c.dashboard_tab_id===cash.id&&c.card_id===62);
const cashAfter=after.dashcards.find(c=>c.id===cashBefore.id);
assert.deepEqual(cashAfter.parameter_mappings,cashBefore.parameter_mappings);
assert.deepEqual(after.dashcards.map(c=>[c.id,c.card_id,c.dashboard_tab_id,c.col,c.row,c.size_x,c.size_y]).sort((a,b)=>a[0]-b[0]),before.dashcards.map(c=>[c.id,c.card_id,c.dashboard_tab_id,c.col,c.row,c.size_x,c.size_y]).sort((a,b)=>a[0]-b[0]));
const remaining=after.dashcards.flatMap(c=>[c.visualization_settings?.['card.title'],c.visualization_settings?.virtual_card?.visualization_settings?.text,c.card?.name]).filter(s=>typeof s==='string'&&s.includes('THB'));
assert.deepEqual(remaining,[]);
write('overview-trend-refinement.json',{saved_at:new Date().toISOString(),dashboard_id:3,overview_tab_id:overview.id,trend_placements:trends.map(c=>({id:c.id,card_id:c.card_id})),filter:{id:'overview-trend-period',default:'past30days',field:'Date'},title_changes:titleChanges,question_changes:questionChanges,remaining_visible_thb:remaining.length,visual_count:after.dashcards.filter(c=>c.card_id).length,tabs:after.tabs.length,cash_mapping_unchanged:true,rollback_dir:backupDir});
console.log(JSON.stringify({titles:titleChanges.length,questions:questionChanges.length,trends:trends.length,visuals:after.dashcards.filter(c=>c.card_id).length,tabs:after.tabs.length,remainingVisibleThb:remaining.length}));
