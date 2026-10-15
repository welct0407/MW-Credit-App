import fs from 'node:fs';
import assert from 'node:assert/strict';
import {api,assertSource,read,write,privateDir} from './ReportingApi.mjs';
await assertSource();
const before=JSON.parse(fs.readFileSync(privateDir+'/income-symbols-before/dashboard.json'));
const d=await api('GET','dashboard/3'),state=read('income-state.json'),checks=[];
const check=(name,condition)=>{assert.ok(condition,name);checks.push(name);};
const project=c=>Object.fromEntries(['id','card_id','dashboard_tab_id','col','row','size_x','size_y','parameter_mappings','visualization_settings'].map(k=>[k,c[k]]));
assert.deepEqual(d.dashcards.filter(c=>c.dashboard_tab_id!==12).map(project).sort((a,b)=>a.id-b.id),before.dashcards.filter(c=>c.dashboard_tab_id!==12).map(project).sort((a,b)=>a.id-b.id));
assert.deepEqual(d.parameters,before.parameters);checks.push('Earlier eight pages and all date filters unchanged');
const active=d.dashcards.filter(c=>c.dashboard_tab_id===12&&c.card_id);
check('Cash waterfall removed; fourteen business visuals remain',active.length===14&&!active.some(c=>c.card_id===189));
for(const c of active){const old=before.dashcards.find(x=>x.card_id===c.card_id);assert.deepEqual(c.card.dataset_query,old.card.dataset_query);assert.deepEqual(c.parameter_mappings,old.parameter_mappings);}
checks.push('Every retained question query and filter mapping unchanged');
const symbols=d.dashcards.filter(c=>c.dashboard_tab_id===12&&c.row===14&&!c.card_id);
check('Separate plus and equals signs between three equally sized cash cards',symbols.some(c=>c.col===7&&c.visualization_settings.virtual_card.visualization_settings.text==='+')&&symbols.some(c=>c.col===15&&c.visualization_settings.virtual_card.visualization_settings.text==='=')&&active.filter(c=>c.row===14).every(c=>c.size_x===7&&c.size_y===2));
check('Waterfall title maps native Total to Unsettled Profit',active.find(c=>c.card_id===172).card.name==='Income waterfall · Total = Unsettled Profit');
async function query(key,value){const id=state.cards[key],dc=active.find(c=>c.card_id===id);const r=await api('POST',`dashboard/3/dashcard/${dc.id}/card/${id}/query`,{parameters:[{id:'income-period',type:value==='thismonth'?'date/relative':'date/range',value}]});assert.equal(r.status,'completed');return r.data.rows;}
for(const [label,value] of [['current','thismonth'],['historical','2026-09-01~2026-09-18']]){
 const waterfall=await query('bridge',value),retained=(await query('retained',value))[0][0];
 check(label+' waterfall total equals Unsettled Profit',Math.abs(waterfall.reduce((sum,r)=>sum+Number(r[1]),0)-Number(retained))<1e-7);
 for(const key of ['cash-pool','cash-held','period'])await query(key,value);
 checks.push(label+' period-end cash and availability queries execute');
}
const removed=await api('GET','card/189');check('Removed question has no dashboard use',removed.dashboard_count===0);
await api('PUT','card/189',{archived:true});check('Removed question recoverably archived',(await api('GET','card/189')).archived);
state.archived_cards['cash-bridge']=189;delete state.cards['cash-bridge'];write('income-state.json',state);
const m=read('manifest.json');m.dashboard.visuals=d.dashcards.filter(c=>c.card_id).length;m.dashboard.questions=new Set(d.dashcards.filter(c=>c.card_id).map(c=>c.card_id)).size;m.dashboard.heading_and_note_cards=d.dashcards.filter(c=>!c.card_id).length;m.income_presentation_tests='income-symbols-verification.json';write('manifest.json',m);
write('income-symbols-verification.json',{verified_at:new Date().toISOString(),checks,check_count:checks.length,visuals:m.dashboard.visuals,questions:m.dashboard.questions,income_visuals:active.length,private_rollback:privateDir+'/income-symbols-before',database_changes:false,calculation_changes:false,total_label_limitation:'Metabase v0.63.18.1 hardcodes native Total; chart title explicitly maps Total = Unsettled Profit',cash_equation_note:'Earlier retained profit, advances and reconciliation differences can affect period-end cash; explanatory footnote retained',prior_financial_tests:'income-verification.json (154 checks; unchanged calculations)'});
console.log(`${checks.length} focused presentation, preservation and query checks passed.`);
