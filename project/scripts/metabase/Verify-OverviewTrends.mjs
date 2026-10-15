import assert from 'node:assert/strict';
import {api,assertSource,read,write} from './ReportingApi.mjs';

await assertSource();
const d=await api('GET','dashboard/3'),overview=d.tabs.find(t=>t.name==='1 · Overview').id,cash=d.tabs.find(t=>t.name==='2 · Cash Analysis').id;
const param=d.parameters.find(p=>p.id==='overview-trend-period');
assert.equal(param.default,'past30days');
assert.equal(param.type,'date/all-options');
const cards=[62,63,64],dates=[];
for(const id of cards){
 const p=d.dashcards.find(c=>c.dashboard_tab_id===overview&&c.card_id===id);
 assert.ok(p);assert.equal(p.parameter_mappings.length,1);
 assert.equal(p.parameter_mappings[0].parameter_id,param.id);
 const r=await api('POST',`dashboard/3/dashcard/${p.id}/card/${id}/query`,{parameters:[{id:param.id,type:'date/relative',value:param.default}]});
 assert.equal(r.status,'completed');assert.ok(!r.data.rows_truncated);
 dates.push({card_id:id,placement_id:p.id,dates:r.data.rows.map(row=>row[0].slice(0,10))});
}
const nowParts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()).map(p=>[p.type,p.value]));
const today=new Date(Date.UTC(+nowParts.year,+nowParts.month-1,+nowParts.day));
const dateOffset=n=>new Date(today.getTime()+n*86400000).toISOString().slice(0,10);
const expected=Array.from({length:30},(_,i)=>dateOffset(-30+i));
for(const d of dates)assert.deepEqual(d.dates,expected,`Unexpected trend dates for card ${d.card_id}`);
const cashPlacement=d.dashcards.find(c=>c.dashboard_tab_id===cash&&c.card_id===62);
assert.deepEqual(cashPlacement.parameter_mappings.map(m=>m.parameter_id),['cash-date']);
const cashCard=await api('GET','card/62');
const overviewCard=d.dashcards.find(c=>c.dashboard_tab_id===overview&&c.card_id===62).card;
assert.deepEqual(cashCard.dataset_query,overviewCard.dataset_query);
const prior=read('overview-trend-refinement.json');
write('overview-trend-refinement.json',{...prior,verified_at:new Date().toISOString(),trend_dates:{first:expected[0],last:expected.at(-1),count:expected.length,bangkok_today:dateOffset(0)},cash_principal_question_unchanged:true,trend_query_status:'completed',title_thb_count:d.dashcards.flatMap(c=>[c.card?.name,c.visualization_settings?.['card.title'],c.visualization_settings?.virtual_card?.visualization_settings?.text]).filter(v=>typeof v==='string'&&v.includes('THB')).length});
console.log(JSON.stringify({trends:dates.length,first:expected[0],last:expected.at(-1),days:expected.length,cashMapping:'cash-date'}));
