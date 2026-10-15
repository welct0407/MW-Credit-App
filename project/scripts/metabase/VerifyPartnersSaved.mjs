import assert from 'node:assert/strict';
import {api,assertSource} from './ReportingApi.mjs';
import {read,save,shape} from './PartnersTab.mjs';
await assertSource();
const state=read('state'),d=await api('GET','dashboard/3');
const run=async(key,parameters=[])=>{
 const id=state.cards[key],p=d.dashcards.find(x=>x.card_id===id&&x.dashboard_tab_id===state.tab);
 const r=await api('POST',`dashboard/3/dashcard/${p.id}/card/${id}/query`,{parameters});
 assert.equal(r.status,'completed');assert(!r.data.rows_truncated);return r.data.rows;
};
const picker=await api('POST',`card/${state.cards.picker}/query`,{});assert.equal(picker.status,'completed');
const ids=picker.data.rows.map(x=>x[0]);
assert.deepEqual(await run('comparison',[{id:'pt-partner',type:'string/=',value:ids}]),await run('comparison'));
for(const value of ['Pending','Completed','Cancelled']){
 const ps=[{id:'pt-status',type:'string/=',value}];
 const rows=await run('settlement-ledger',ps);assert(rows.every(x=>x[3]===value));
 assert.deepEqual(await run('available',ps),await run('available'));
}
const questions=[],models=[];
const sanitize=x=>Array.isArray(x)?x.map(sanitize):x&&typeof x==='object'?Object.fromEntries(Object.entries(x).filter(([k])=>k!=='fingerprint').map(([k,v])=>[k,sanitize(v)])):x;
for(const [kind,objects,target] of [['question',state.cards,questions],['model',state.models,models]]){
 for(const [key,id] of Object.entries(objects)){
  const q=await api('GET','card/'+id);
  target.push(sanitize(Object.fromEntries(Object.entries({key,...q}).filter(([k])=>['key','id','name','type','display','dataset_query','visualization_settings','description','result_metadata','collection_id'].includes(k)))));
 }
}
save('saved',{dashboard:3,tab:state.tab,tabs:d.tabs,questions,models,parameters:d.parameters.filter(x=>x.id.startsWith('pt-')),layout:shape(d).filter(x=>x.dashboard_tab_id===state.tab)});
save('filter-verification',{passed:true,multiPartnerMatchesAll:true,statusLedgerOnly:true,statusValues:['Pending','Completed','Cancelled'],savedQuestions:questions.length,savedModels:models.length});
console.log('Saved exact definitions; multi-partner and all three status cases passed');
