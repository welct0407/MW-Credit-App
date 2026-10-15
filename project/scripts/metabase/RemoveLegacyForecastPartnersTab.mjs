// R050: remove the superseded Forecast & Partners tab from Loan Reports.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {api,root} from './ReportingApi.mjs';

const out=root+'/outputs/r050-remove-forecast-partners';
const priv='C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/r050-remove-forecast-partners';
fs.mkdirSync(out,{recursive:true});fs.mkdirSync(priv,{recursive:true});
const save=(name,value,dir=out)=>fs.writeFileSync(`${dir}/${name}.json`,JSON.stringify(value,null,2)+'\n');
const read=(name,dir=priv)=>JSON.parse(fs.readFileSync(`${dir}/${name}.json`,'utf8'));
const shape=cards=>cards.map(({id,card_id,dashboard_tab_id,row,col,size_x,size_y,series,parameter_mappings,visualization_settings})=>({id,card_id,dashboard_tab_id,row,col,size_x,size_y,series,parameter_mappings,visualization_settings})).sort((a,b)=>a.id-b.id);
const names=new Map([[249,'11 · Partners'],[262,'12 · Forecast & Planning']]);
const target={id:11,name:'11 · Forecast & Partners',position:10};
function planned(before){
 assert(before.tabs.some(t=>t.id===target.id&&t.name===target.name&&t.position===target.position));
 assert.equal(before.tabs.find(t=>t.id===249)?.name,'12 · Partners');
 assert.equal(before.tabs.find(t=>t.id===262)?.name,'13 · Forecast & Planning');
 const removed=before.dashcards.filter(c=>c.dashboard_tab_id===target.id);
 assert.equal(removed.length,15);
 const cards=before.dashcards.filter(c=>c.dashboard_tab_id!==target.id);
 const tabs=before.tabs.filter(t=>t.id!==target.id).map((t,position)=>({...t,position,name:names.get(t.id)??t.name}));
 assert.equal(tabs.length,before.tabs.length-1);
 return {tabs,cards,removed};
}

if(process.argv.includes('--prepare')){
 assert(!fs.existsSync(priv+'/dashboard-before.json'),'Baseline already captured');
 const before=await api('GET','dashboard/3');const p=planned(before);
 save('dashboard-before',before,priv);
 const backup=await api('POST','dashboard/3/copy',{name:'R050 recovery - before legacy Forecast & Partners tab removal',collection_id:5});
 save('plan',{dashboard:3,targetTab:11,backupDashboard:backup.id,oldTabs:before.tabs.length,newTabs:p.tabs.length,removedPlacements:p.removed.length,preservedPlacements:p.cards.length,removedQuestionIds:[...new Set(p.removed.map(c=>c.card_id).filter(Boolean))],at:new Date().toISOString()});
 console.log(JSON.stringify({backupDashboard:backup.id,removedPlacements:p.removed.length,preservedPlacements:p.cards.length}));
}

if(process.argv.includes('--apply')){
 const before=read('dashboard-before'),current=await api('GET','dashboard/3'),p=planned(before);
 assert.deepEqual(current.tabs,before.tabs,'Tabs changed since backup');
 assert.deepEqual(shape(current.dashcards),shape(before.dashcards),'Placements changed since backup');
 assert.deepEqual(current.parameters,before.parameters,'Filters changed since backup');
 await api('PUT','dashboard/3/cards',{tabs:p.tabs,cards:p.cards});
 console.log('Legacy tab and its placements removed');
}

if(process.argv.includes('--verify')){
 const before=read('dashboard-before'),after=await api('GET','dashboard/3'),p=planned(before);
 assert.deepEqual(after.tabs.map(({id,name,position})=>({id,name,position})),p.tabs.map(({id,name,position})=>({id,name,position})));
 assert.deepEqual(shape(after.dashcards),shape(p.cards));
 assert.deepEqual(after.parameters,before.parameters);
 assert(!after.tabs.some(t=>t.id===11));
 assert(!after.dashcards.some(c=>c.dashboard_tab_id===11));
 const result={passed:true,at:new Date().toISOString(),dashboard:3,removedTab:11,removedPlacements:p.removed.length,remainingTabs:after.tabs.length,remainingPlacements:after.dashcards.length,partnersTab:249,forecastPlanningTab:262,otherPlacementsUnchanged:true,parametersUnchanged:true,backupDashboard:read('plan',out).backupDashboard};
 save('saved',{dashboard:3,tabs:after.tabs,parameters:after.parameters.map(({id,name})=>({id,name})),remainingPlacements:after.dashcards.length});
 save('verification',result);console.log(JSON.stringify(result));
}
