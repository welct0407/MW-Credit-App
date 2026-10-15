import fs from 'node:fs';
import assert from 'node:assert/strict';
import {api,assertSource} from './ReportingApi.mjs';

const privateDir='C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/r034-matrix-order';
const before=JSON.parse(fs.readFileSync(privateDir+'/before.json','utf8'));
const cardBefore=JSON.parse(fs.readFileSync(privateDir+'/cards-before.json','utf8'));
const verifyOnly=process.argv.includes('--verify');
await assertSource();
const current=await api('GET','dashboard/3');
if(!verifyOnly){
 assert.equal(current.updated_at,before.updated_at,'Dashboard changed since recovery capture');
 assert.ok(JSON.stringify(current.dashcards)===JSON.stringify(before.dashcards),'Dashboard layout drift');
}
const at=id=>before.dashcards.find(c=>c.id===id);
assert.equal(at(1501)?.row,31);
assert.equal(at(1501)?.visualization_settings?.virtual_card?.display,'iframe');
assert.equal(at(1278)?.row,53);
assert.equal(at(848)?.row,29);
const tableIds=[840,841,842,843,844,845,846,847];
for(const id of tableIds)assert.equal(at(id)?.dashboard_tab_id,31);
const expected=before.dashcards.filter(c=>c.id!==848).map(c=>{
 if(c.id===1501)return {...c,row:9};
 if(c.id===1278)return {...c,row:31};
 if(tableIds.includes(c.id))return {...c,row:c.row+25};
 return c;
});
const amountKeys={};
for(const [id,baseline] of Object.entries(cardBefore)){
 const currentCard=await api('GET','card/'+id);
 if(!verifyOnly){
  assert.ok(JSON.stringify(currentCard.dataset_query)===JSON.stringify(baseline.dataset_query),`Question ${id} query drift`);
  assert.ok(JSON.stringify(currentCard.visualization_settings)===JSON.stringify(baseline.visualization_settings),`Question ${id} formatting drift`);
 }
 const settings=structuredClone(baseline.visualization_settings);
 const keys=Object.keys(settings.column_settings||{}).filter(k=>k.includes('฿'));
 assert.ok(keys.length>0,`Question ${id} has no money settings`);
 for(const key of keys){
  assert.ok(settings.column_settings[key].decimals>0,`Question ${id} field ${key} already changed`);
  settings.column_settings[key].decimals=0;
 }
 amountKeys[id]=keys.map(k=>JSON.parse(k)[1]);
 if(!verifyOnly)await api('PUT','card/'+id,{visualization_settings:settings});
}
if(!verifyOnly)await api('PUT','dashboard/3/cards',{tabs:before.tabs,cards:expected});
const saved=await api('GET','dashboard/3');
fs.writeFileSync(privateDir+'/after.json',JSON.stringify(saved));
assert.equal(saved.dashcards.length,expected.length);
for(const c of expected){
 const actual=saved.dashcards.find(x=>x.id===c.id);
 assert.ok(actual,`Missing placement ${c.id}`);
 for(const key of ['row','col','size_x','size_y','dashboard_tab_id','card_id','visualization_settings','parameter_mappings','series'])
  assert.ok(JSON.stringify(actual[key])===JSON.stringify(c[key]),`Placement ${c.id} ${key} differs; inspect private metadata`);
}
assert.ok(!saved.dashcards.some(c=>c.id===848));
assert.ok(JSON.stringify(saved.tabs)===JSON.stringify(before.tabs));
assert.ok(JSON.stringify(saved.parameters)===JSON.stringify(before.parameters));
for(const [id,baseline] of Object.entries(cardBefore)){
 const actual=await api('GET','card/'+id);
 assert.ok(JSON.stringify(actual.dataset_query)===JSON.stringify(baseline.dataset_query),`Question ${id} SQL changed`);
 const original=baseline.visualization_settings.column_settings;
 const updated=actual.visualization_settings.column_settings;
 for(const [key,fmt] of Object.entries(original)){
  const target={...fmt,...(key.includes('฿')?{decimals:0}:{})};
  assert.ok(JSON.stringify(updated[key])===JSON.stringify(target),`Question ${id} field settings changed unexpectedly`);
 }
}
const result={dashboard:3,tab:31,iframe:{id:1501,row:9,height:22,definitionUnchanged:true},explanation:{id:1278,row:31,height:3},categoryCards:tableIds,categoryRowsShiftedBy:25,removedRedundantHeading:848,detailTable:{id:1279,row:56,definitionUnchanged:true},otherPlacementsTabsFiltersUnchanged:true,formattedQuestions:Object.keys(cardBefore).map(Number),moneyFields:amountKeys,amountDecimals:0,scoresAndRatiosUnchanged:true,sqlUnchanged:true,backupDashboard:9};
fs.writeFileSync('outputs/r034-matrix-order/verification.json',JSON.stringify(result,null,2)+'\n');
console.log({dashboard:3,tab:31,iframeRow:9,categoryRowsShiftedBy:25,amountFields:Object.values(amountKeys).reduce((n,k)=>n+k.length,0),questionCount:Object.keys(cardBefore).length,backupDashboard:9});
