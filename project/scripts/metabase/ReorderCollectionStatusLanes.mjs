// R036: reorder the canonical Collection Monitor lanes without changing any query.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {api,assertSource} from './ReportingApi.mjs';
import {lanes,shape} from './CollectionMonitor.mjs';

const backup='C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/r036-collection-status-order';
const output='outputs/r036-collection-status-colors/order-verification.json';
const placementIds={unpaid:[242,243],partial:[244,245],overdue:[240,241],paid:[246,247]};
const expectedOld=['Overdue','Not Paid','Partially Paid','Fully Paid'];
// R102 added the Long Overdue lane (AddLongOverdueLane.mjs); this R036 step covers the original four.
const wanted=lanes.filter(l=>l.key!=='long').map(l=>l.status);
assert.deepEqual(wanted,['Not Paid','Partially Paid','Overdue','Fully Paid']);
const read=()=>JSON.parse(fs.readFileSync(`${backup}/before.json`,'utf8'));
const write=(path,value)=>fs.writeFileSync(path,JSON.stringify(value,null,2)+'\n');
const targetCards=dashboard=>dashboard.dashcards.map(card=>{
 const index=lanes.findIndex(l=>placementIds[l.key].includes(card.card_id));
 if(index<0)return card;
 assert.equal(card.dashboard_tab_id,19);
 assert.ok(card.row===6||card.row===8);
 assert.equal(card.size_x,6);
 return {...card,col:index*6};
});
const targetParameters=dashboard=>dashboard.parameters.map(parameter=>parameter.id==='collection-detail-status'
 ? {...parameter,values_source_config:{...parameter.values_source_config,values:wanted}}
 : parameter);
const targetDetail=question=>{
 const settings=structuredClone(question.visualization_settings);
 const rules=settings['table.column_formatting'];
 assert.deepEqual(rules.map(r=>r.value),expectedOld);
 assert.deepEqual(rules.map(r=>r.color),['#EDE9FE','#FEE4E2','#FFF1D6','#ECFDF3']);
 settings['table.column_formatting']=wanted.map(status=>rules.find(r=>r.value===status));
 return settings;
};

if(process.argv.includes('--apply')){
 await assertSource();
 const dashboard=await api('GET','dashboard/3');
 const detail=await api('GET','card/248');
 assert.equal(dashboard.tabs.find(t=>t.id===19)?.name,'8 · Collection Monitor');
 const cards=dashboard.dashcards.filter(c=>Object.values(placementIds).flat().includes(c.card_id));
 assert.equal(cards.length,8);
 assert.deepEqual(cards.filter(c=>c.row===6).sort((a,b)=>a.col-b.col).map(c=>c.card_id),[240,242,244,246]);
 assert.deepEqual(cards.filter(c=>c.row===8).sort((a,b)=>a.col-b.col).map(c=>c.card_id),[241,243,245,247]);
 assert.deepEqual(dashboard.parameters.find(p=>p.id==='collection-detail-status').values_source_config.values,expectedOld);
 targetDetail(detail);
 fs.mkdirSync(backup,{recursive:true});
 assert.ok(!fs.existsSync(`${backup}/before.json`),'Existing rollback snapshot must not be overwritten');
 write(`${backup}/before.json`,{dashboard,detail});
 await api('PUT','dashboard/3/cards',{tabs:dashboard.tabs,cards:targetCards(dashboard)});
 await api('PUT','dashboard/3',{parameters:targetParameters(dashboard)});
 await api('PUT','card/248',{visualization_settings:targetDetail(detail)});
 console.log('Collection lanes and detail-status choice order updated');
}

if(process.argv.includes('--verify')){
 const before=read();
 const dashboard=await api('GET','dashboard/3');
 const detail=await api('GET','card/248');
 assert.deepEqual(dashboard.tabs.map(({id,name,position})=>({id,name,position})),before.dashboard.tabs.map(({id,name,position})=>({id,name,position})));
 assert.deepEqual(shape(dashboard.dashcards),shape(targetCards(before.dashboard)));
 assert.deepEqual(dashboard.parameters,targetParameters(before.dashboard));
 assert.deepEqual(detail.dataset_query,before.detail.dataset_query);
 assert.equal(detail.name,before.detail.name);
 assert.deepEqual(detail.visualization_settings,targetDetail(before.detail));
 const count=dashboard.dashcards.filter(c=>c.dashboard_tab_id===19&&c.row===6).sort((a,b)=>a.col-b.col).map(c=>c.card_id);
 const lists=dashboard.dashcards.filter(c=>c.dashboard_tab_id===19&&c.row===8).sort((a,b)=>a.col-b.col).map(c=>c.card_id);
 assert.deepEqual(count,[242,244,240,246]);
 assert.deepEqual(lists,[243,245,241,247]);
 fs.mkdirSync('outputs/r036-collection-status-colors',{recursive:true});
 write(output,{at:new Date().toISOString(),dashboard:3,tab:19,statusOrder:wanted,countCards:count,listCards:lists,checks:['Count and borrower-list rows both follow the requested order','All other dashboard placements, tabs and filters unchanged','Detail status selector and conditional rules follow the same order','Detail query unchanged'],rollback:backup,databaseChanges:false});
 console.log('Four scoped lane-order checks passed');
}
