// R040: retire original Borrowers and empty Tab 11; make Portfolio the sixth tab.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {api,assertSource,root} from './ReportingApi.mjs';

const out=`${root}/outputs/r040-borrower-lifetime-display`;
const priv='C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/r040-borrower-tab-cutover';
fs.mkdirSync(out,{recursive:true});fs.mkdirSync(priv,{recursive:true});
const write=(name,value,dir=out)=>fs.writeFileSync(`${dir}/${name}.json`,JSON.stringify(value,null,2)+'\n');
const read=(name,dir=priv)=>JSON.parse(fs.readFileSync(`${dir}/${name}.json`,'utf8'));
const cardShape=cards=>cards.map(({id,card_id,dashboard_tab_id,row,col,size_x,size_y,series,parameter_mappings,visualization_settings})=>({id,card_id,dashboard_tab_id,row,col,size_x,size_y,series,parameter_mappings,visualization_settings})).sort((a,b)=>a.id-b.id);
const tabShape=tabs=>tabs.map(({id,name,position})=>({id,name,position})).sort((a,b)=>a.position-b.position);
const ordered=tabs=>[...tabs].sort((a,b)=>a.position-b.position);

function target(before){
 const tabs=ordered(before.tabs);
 assert.equal(tabs.find(t=>t.id===6)?.name,'6 · Borrowers');
 assert.equal(tabs.find(t=>t.id===17)?.name,'Tab 11');
 assert.equal(tabs.find(t=>t.id===104)?.name,'Borrower Portfolio · New');
 assert.equal(tabs.findIndex(t=>t.id===6),5);
 assert.equal(before.dashcards.filter(c=>c.dashboard_tab_id===17).length,0,'Tab 11 no longer empty');
 assert(before.dashcards.some(c=>c.dashboard_tab_id===104&&c.card_id===289));
 const remaining=tabs.filter(t=>![6,17,104].includes(t.id));
 remaining.splice(5,0,{...tabs.find(t=>t.id===104),name:'6 · Borrowers'});
 const nextTabs=remaining.map((t,position)=>({...t,position}));
 const nextCards=before.dashcards.filter(c=>![6,17].includes(c.dashboard_tab_id));
 assert.equal(nextTabs[4].id,18);assert.equal(nextTabs[5].id,104);assert.equal(nextTabs[6].id,31);
 const oldIds=[...new Set(before.dashcards.filter(c=>c.dashboard_tab_id===6&&c.card_id).map(c=>c.card_id))];
 for(const p of before.parameters){const uses=nextCards.some(c=>c.parameter_mappings?.some(m=>m.parameter_id===p.id));assert(uses,`Filter orphaned by cutover: ${p.id}`);}
 return {tabs:nextTabs,cards:nextCards,oldIds};
}
async function current(){await assertSource();return api('GET','dashboard/3');}

if(process.argv.includes('--prepare')){
 assert(!fs.existsSync(`${priv}/tab-before.json`),'Tab-cutover baseline already exists');
 const before=await current(),next=target(before);
 write('tab-before',before,priv);
 write('tab-plan',{dashboard:3,startingCommit:'302ca899fd097fecf41e49ae1aec7858af829cbb',removeTabs:[6,17],promoteTab:104,newName:'6 · Borrowers',newPosition:5,removedPlacements:before.dashcards.filter(c=>c.dashboard_tab_id===6).map(c=>c.id),retainedOldQuestionIds:next.oldIds,tabOrder:tabShape(next.tabs),placementsBefore:before.dashcards.length,placementsAfter:next.cards.length,parametersPreserved:true});
 console.log('Tab cutover prepared; original question definitions retained');
}

if(process.argv.includes('--publish')){
 const before=read('tab-before'),live=await current(),next=target(before);
 assert.deepEqual(cardShape(live.dashcards),cardShape(before.dashcards),'Dashboard placements drifted');
 assert.deepEqual(tabShape(live.tabs),tabShape(before.tabs),'Dashboard tabs drifted');
 assert.deepEqual(live.parameters,before.parameters,'Dashboard filters drifted');
 const backup=await api('POST','dashboard/3/copy',{name:'R040 recovery - before borrower tab replacement',collection_id:5});
 write('tab-state',{backupDashboard:backup.id,dashboard:3,removedTabs:[6,17],promotedTab:104});
 await api('PUT','dashboard/3/cards',{tabs:next.tabs,cards:next.cards});
 console.log(`New Portfolio tab promoted; recovery dashboard ${backup.id}`);
}

if(process.argv.includes('--verify')){
 const before=read('tab-before'),live=await current(),next=target(before);
 assert.deepEqual(tabShape(live.tabs),tabShape(next.tabs),'Tab order/name mismatch');
 assert.deepEqual(cardShape(live.dashcards),cardShape(next.cards),'Retained placements changed');
 assert.deepEqual(live.parameters,before.parameters,'Dashboard filters changed');
 assert(!live.tabs.some(t=>[6,17].includes(t.id)));
 assert.equal(live.dashcards.filter(c=>c.dashboard_tab_id===104).length,before.dashcards.filter(c=>c.dashboard_tab_id===104).length);
 assert.equal(live.dashcards.filter(c=>c.dashboard_tab_id===105).length,before.dashcards.filter(c=>c.dashboard_tab_id===105).length);
 const oldCards=await Promise.all(next.oldIds.map(id=>api('GET',`card/${id}`)));
 assert(oldCards.every(c=>!c.archived),'Original saved question was archived');
 const placement=live.dashcards.find(c=>c.dashboard_tab_id===104&&c.card_id===289);
 const q=await api('POST',`dashboard/3/dashcard/${placement.id}/card/289/query`,{parameters:[]});
 assert.equal(q.status,'completed');
 const names=q.data.cols.map(c=>c.name);
 for(const name of ['Lifetime daily rate','Lifetime interest return','BCG Matrix category'])assert(names.includes(name));
 write('tab-verification',{passed:true,dashboard:3,tabs:live.tabs.length,placements:live.dashcards.length,oldPlacementsRemoved:before.dashcards.length-next.cards.length,oldQuestionsRetained:next.oldIds.length,portfolioPlacementsPreserved:true,detailPlacementsPreserved:true,allOtherPlacementsAndMappingsPreserved:true,parametersPreserved:true,comparisonQueryPassed:true,backupDashboard:read('tab-state',out).backupDashboard});
 console.log('Tab order, retained cards/filters and Portfolio query verified');
}
