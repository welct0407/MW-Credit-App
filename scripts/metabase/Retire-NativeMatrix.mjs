import fs from 'node:fs';
import assert from 'node:assert/strict';
import {api} from './ReportingApi.mjs';
const privateDir='C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/r033-matrix-cutover';
const before=JSON.parse(fs.readFileSync(privateDir+'/before.json','utf8'));
const current=await api('GET','dashboard/3');
assert.equal(current.updated_at,before.updated_at,'Dashboard drift; reconcile before running');
assert.deepEqual(current.dashcards,before.dashcards);
const remove=new Set([849,1280,1281,1282,1283]);
assert.equal(current.dashcards.filter(c=>remove.has(c.id)&&c.dashboard_tab_id===31).length,5);
assert.equal(current.dashcards.find(c=>c.id===849).card_id,274);
assert.equal(current.dashcards.find(c=>c.id===1501).visualization_settings.virtual_card.display,'iframe');
const question=await api('GET','card/274');
const cards=current.dashcards.filter(c=>!remove.has(c.id)).map(c=>{
 if(c.dashboard_tab_id!==31)return c;
 if(c.id===1501)return {...c,row:31};
 if(c.id===1278)return {...c,row:53};
 return {...c,row:c.row>=76?c.row-20:c.row};
});
await api('PUT','dashboard/3/cards',{tabs:current.tabs,cards});
const saved=await api('GET','dashboard/3');
fs.writeFileSync(privateDir+'/after.json',JSON.stringify(saved));
assert.equal(saved.dashcards.length,before.dashcards.length-5);
for(const c of cards){const actual=saved.dashcards.find(x=>x.id===c.id);assert.ok(actual);for(const key of ['row','col','size_x','size_y','dashboard_tab_id','card_id','visualization_settings','parameter_mappings','series'])assert.deepEqual(actual[key],c[key],`${c.id}: ${key}`);}
assert.deepEqual(saved.tabs,before.tabs);assert.deepEqual(saved.parameters,before.parameters);
assert.deepEqual(await api('GET','card/274'),question);
const result={dashboard:3,tab:31,removedPlacements:[...remove],savedQuestion274Retained:true,iframe:{id:1501,row:31,col:0,width:24,height:22,configurationUnchanged:true},methodNote:{id:1278,row:53},laterRowsShiftedBy:-20,otherTabsAndFiltersUnchanged:true,remainingPlacementsVerified:true};
fs.writeFileSync('outputs/r033-matrix-cutover/verification.json',JSON.stringify(result,null,2)+'\n');
console.log(result);
