import fs from 'node:fs';
import assert from 'node:assert/strict';
import {api,assertSource} from './ReportingApi.mjs';
import {specs,read,save,shape,priv,parameters} from './BorrowerPages.mjs';
await assertSource();
const state=read('metabase-state'),d=await api('GET','dashboard/3'),checks=[],timings=[];
const check=(name,value)=>{assert(value,name);checks.push(name);};
const before=JSON.parse(fs.readFileSync(priv+'/dashboard-before.json'));
assert.deepEqual(shape(d.dashcards.filter(c=>!Object.values(state.tabs).includes(c.dashboard_tab_id))),shape(before.dashcards));
assert.deepEqual(d.tabs.filter(t=>!Object.values(state.tabs).includes(t.id)),before.tabs);
for(const old of before.dashcards.filter(c=>c.card_id)){const now=d.dashcards.find(c=>c.id===old.id);assert.deepEqual(now.card.dataset_query,old.card.dataset_query);assert.deepEqual(now.card.visualization_settings,old.card.visualization_settings);}
checks.push('All original tabs, placements, saved queries and formatting preserved');
assert.deepEqual(d.parameters.filter(p=>!parameters(state).some(x=>x.id===p.id)),before.parameters);
assert.deepEqual(await api('GET','collection/graph'),JSON.parse(fs.readFileSync(priv+'/permissions-before.json')));
checks.push('Original filters and collection permissions preserved');
if(process.argv.includes('--metadata-only')){save('final-invariants',{at:new Date().toISOString(),checks,passed:true,original_tabs:before.tabs.length,original_placements:before.dashcards.length});console.log('Original dashboard and access definitions preserved');process.exit(0);}
const objects=r=>r.rows.map(row=>Object.fromEntries(r.cols.map((c,i)=>[c.name,row[i]])));
async function query(key,values={}){
 console.log('Checking '+key);
 const dc=d.dashcards.find(c=>c.card_id===state.cards[key]),ps=parameters(state).filter(p=>dc.parameter_mappings.some(m=>m.parameter_id===p.id)).map(p=>({id:p.id,type:p.type,value:values[p.id]??p.default})).filter(p=>p.value!==undefined);
 const r=await api('POST',`dashboard/3/dashcard/${dc.id}/card/${dc.card_id}/query`,{parameters:ps,ignore_cache:true});
 if(r.status!=='completed'){fs.writeFileSync(priv+'/verify-error.json',JSON.stringify(r));throw Error('Failed '+key);}
 check(key+' query complete/no truncation',!r.data.rows_truncated);timings.push({key,ms:r.running_time});return objects(r.data);
}
const defaults={};
if(process.argv.includes('--refinement')){
 const r=await api('POST',`card/${state.cards['p-comparison']}/query`,{});const rows=objects(r.data),sample=rows.find(r=>r['Active loans']>0);
 const selected={'bd-borrower':[sample['Borrower ID']]};
 for(const key of ['d-principal','d-active','d-share']){check(key+' no selection empty',(await query(key)).length===0);const result=await query(key,selected);check(key+' selected row',result.length===1);if(key==='d-principal')check('Refined principal matches portfolio',result[0]['Current principal ฿']===sample['Principal ฿']);if(key==='d-active')check('Refined active count matches portfolio',result[0]['Active loans']===sample['Active loans']);}
 for(const key of ['d-health','d-issued-count','d-scenario']){check(key+' cleared selection empty',(await query(key)).length===0);check(key+' selected row loads',(await query(key,selected)).length===1);}
 save('refinement-verification',{at:new Date().toISOString(),checks,passed:checks.length,timings});console.log(JSON.stringify({passed:checks.length}));process.exit(0);
}
for(const s of specs.filter(s=>s.page!=='helper')){defaults[s.key]=await query(s.key);if(s.page==='detail')check(s.key+' empty selection fails closed',defaults[s.key].length===0);}
const comparison=defaults['p-comparison'];check('Comparison has unique identities',comparison.length>0&&new Set(comparison.map(r=>r['Borrower ID'])).size===comparison.length);
const sample=comparison.find(r=>r['Active loans']>0)['Borrower ID'];const selected={'bd-borrower':[sample]};
for(const s of specs.filter(s=>s.page==='detail'))await query(s.key,selected);
const active=comparison.find(r=>r['Borrower ID']===sample);
check('Drill-through dates are plain ISO dates',/^\d{4}-\d{2}-\d{2}$/.test(active['Period start'])&&/^\d{4}-\d{2}-\d{2}$/.test(active['Period end']));
const linkPeriod=active['Period start']+'~'+active['Period end'];
check('Drill-through explicit range retains interest',(await query('d-interest',{...selected,'bd-period':linkPeriod}))[0]['Interest received ฿']===active['Interest ฿']);
check('Portfolio to Detail current principal agrees',(await query('d-principal',selected))[0]['Current principal ฿']===active['Principal ฿']);
check('Portfolio to Detail interest agrees',(await query('d-interest',selected))[0]['Interest received ฿']===active['Interest ฿']);
check('No-match ID never broadens scope',(await query('d-identity',{'bd-borrower':['SYNTHETIC-NO-MATCH']})).length===0);
for(const population of ['Currently active','Currently inactive']){
 const rows=await query('p-comparison',{'bp-population':[population]});check(population+' cohort filter',rows.every(r=>population==='Currently active'?r['Active loans']>0:r['Active loans']===0));
}
const recent=await query('p-comparison',{'bp-period':'past7days'});
check('Date changes preserve current positions',recent.every(r=>r['Principal ฿']===comparison.find(c=>c['Borrower ID']===r['Borrower ID'])['Principal ฿']));
const sums=rows=>rows.reduce((n,r)=>n+Number(r['Interest ฿']),0),near=(a,b)=>Math.abs(Number(a)-Number(b))<0.001;
check('Period summary reconciles comparison',near(sums(comparison),defaults['p-interest'][0]['Interest received ฿']));
check('Ranking reconciles signed interest',near(defaults['p-contribution'].reduce((n,r)=>n+Number(r['Amount ฿']),0),sums(comparison)));
check('Trend reconciles signed interest',near(defaults['p-trend'].reduce((n,r)=>n+Number(r['Interest ฿']),0),sums(comparison)));
const scenario=await query('d-scenario',{...selected,'bd-amount':[10000]});check('Scenario returns one borrower',scenario.length===1);
const negative=await query('d-scenario',{...selected,'bd-amount':[-1]});check('Negative scenario rejects projections',negative.length===1&&negative[0]['Proposed principal ฿']===null&&negative[0]['Proposed share']===null&&negative[0].Status==='Enter a nonnegative finite amount');
const cleared=await query('d-identity');check('Cleared selection restores empty result',cleared.length===0);
save('metabase-verification',{at:new Date().toISOString(),checks,passed:checks.length,timings,financial_values_published:false});
console.log(JSON.stringify({passed:checks.length,queries:timings.length}));
