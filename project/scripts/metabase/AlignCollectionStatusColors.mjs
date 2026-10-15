// R036: align the canonical Collection Monitor's visual status cues with OLTP.
// Only the eight lane question titles, four lane table highlights and detail highlights change.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {api,assertSource} from './ReportingApi.mjs';
import {lanes,shape} from './CollectionMonitor.mjs';

const output='outputs/r036-collection-status-colors';
const backup='C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/r036-collection-status-colors';
const ids={overdue:[240,241],unpaid:[242,243],partial:[244,245],paid:[246,247],detail:248};
const previous={overdue:{title:'🚨 Overdue',pale:'#FEE4E2'},unpaid:{title:'🟠 Not paid',pale:'#FFF1D6'},partial:{title:'🔵 Partially paid',pale:'#EAF2FF'},paid:{title:'🟢 Fully paid',pale:'#ECFDF3'}};
const readJson=path=>JSON.parse(fs.readFileSync(path,'utf8'));
const writeJson=(path,value)=>fs.writeFileSync(path,JSON.stringify(value,null,2)+'\n');
const ownIds=[...Object.values(ids).flat()];
const updated=(card,lane,type)=>{
 const settings=structuredClone(card.visualization_settings);
 if(type==='list'){
  const rules=settings['table.column_formatting'];
  assert.equal(rules.length,1);
  assert.equal(rules[0].color,previous[lane.key].pale);
  rules[0].color=lane.pale;
 }
 return {name:`${lane.title} · ${type==='count'?'people':'borrowers'}`,visualization_settings:settings};
};

if(process.argv.includes('--apply')){
 await assertSource();
 const dashboard=await api('GET','dashboard/3');
 assert.equal(dashboard.tabs.find(t=>t.id===19)?.name,'8 · Collection Monitor');
 for(const id of ownIds)assert.deepEqual(dashboard.dashcards.filter(x=>x.card_id===id).map(x=>x.dashboard_tab_id),[19]);
 const cards=Object.fromEntries(await Promise.all(ownIds.map(async id=>[id,await api('GET',`card/${id}`)])));
 for(const lane of lanes){
  const [countId,listId]=ids[lane.key];
  assert.equal(cards[countId].name,`${previous[lane.key].title} · people`);
  assert.equal(cards[listId].name,`${previous[lane.key].title} · borrowers`);
  updated(cards[listId],lane,'list');
 }
 assert.deepEqual(cards[248].visualization_settings['table.column_formatting'].map(r=>[r.value,r.color]),lanes.map(l=>[l.status,previous[l.key].pale]));
 fs.mkdirSync(backup,{recursive:true});
 const snapshot=`${backup}/before.json`;
 assert.ok(!fs.existsSync(snapshot),'Existing rollback snapshot must not be overwritten');
 writeJson(snapshot,{dashboard,cards});
 for(const lane of lanes){
  const [countId,listId]=ids[lane.key];
  await api('PUT',`card/${countId}`,updated(cards[countId],lane,'count'));
  await api('PUT',`card/${listId}`,updated(cards[listId],lane,'list'));
 }
 const settings=structuredClone(cards[248].visualization_settings);
 settings['table.column_formatting']=settings['table.column_formatting'].map((rule,i)=>({...rule,color:lanes[i].pale}));
 await api('PUT','card/248',{visualization_settings:settings});
 console.log('Applied Collection Monitor status colors; rollback captured privately');
}

if(process.argv.includes('--verify')){
 const before=readJson(`${backup}/before.json`),dashboard=await api('GET','dashboard/3');
 assert.deepEqual(dashboard.tabs.map(({id,name,position})=>({id,name,position})),before.dashboard.tabs.map(({id,name,position})=>({id,name,position})));
 assert.deepEqual(dashboard.parameters,before.dashboard.parameters);
 assert.deepEqual(shape(dashboard.dashcards),shape(before.dashboard.dashcards));
 const cards=Object.fromEntries(await Promise.all(ownIds.map(async id=>[id,await api('GET',`card/${id}`)])));
 for(const lane of lanes){
  const [countId,listId]=ids[lane.key];
  for(const [id,type] of [[countId,'count'],[listId,'list']]){
   const expected=updated(before.cards[id],lane,type);
   assert.equal(cards[id].name,expected.name);
   assert.deepEqual(cards[id].visualization_settings,expected.visualization_settings);
   assert.deepEqual(cards[id].dataset_query,before.cards[id].dataset_query);
  }
 }
 const detail=cards[248],oldDetail=before.cards[248],expected=structuredClone(oldDetail.visualization_settings);
 expected['table.column_formatting']=expected['table.column_formatting'].map((rule,i)=>({...rule,color:lanes[i].pale}));
 assert.equal(detail.name,oldDetail.name);
 assert.deepEqual(detail.visualization_settings,expected);
 assert.deepEqual(detail.dataset_query,oldDetail.dataset_query);
 fs.mkdirSync(output,{recursive:true});
 writeJson(`${output}/verification.json`,{at:new Date().toISOString(),dashboard:3,tab:19,questions:ownIds,lanes:lanes.map(({status,title,color,pale})=>({status,title,color,pale})),checks:['Nine owned question definitions read back with expected colors and titles','All nine queries unchanged','All dashboard tabs, filters and placements unchanged','Four detail-table statuses use matching row colors'],rollback:backup,databaseChanges:false});
 console.log('Four saved-state checks passed');
}
