import fs from 'node:fs';
import assert from 'node:assert/strict';
import {api,read,write} from './ReportingApi.mjs';
import {backup,specs,layout} from './StatementCleanup.mjs';
const d=await api('GET','dashboard/3'),state=read('statement-cleanup-state.json'),retired=read('statement-cleanup/retirement.json');
assert.ok(retired.applied);
const checks=[];
const run=async(q)=>{const r=await api('POST','dataset',{database:2,type:'native',native:{query:q}});assert.equal(r.status,'completed');return r;};
for(const key of ['income-trend','income-snapshot-status','flow-snapshot-status','expense-detail']){
 const id=state.cards[key],r=await api('POST','card/'+id+'/query',{});assert.equal(r.status,'completed');checks.push(key+' refined query executes');
 const c=await api('GET','card/'+id);if(key==='income-trend')assert.equal(c.visualization_settings.series_settings['Net Profit'].display,'line');
}
for(const m of Object.values(read('models.json'))){const r=await api('POST','card/'+m.id+'/query',{});assert.equal(r.status,'completed');assert.equal(r.data.cols.length,m.columns.length);checks.push(m.name+' retained model executes with expected field count');}
for(const id of [47,48,68,202,207,208,209,210,211]){const p=d.dashcards.find(c=>c.card_id===id&&c.dashboard_tab_id===14);const r=await api('POST',`dashboard/3/dashcard/${p.id}/card/${id}/query`,{parameters:[{id:'review-position',type:'date/single',value:'2026-09-22'},{id:'review-position-trend',type:'date/all-options',value:'past30days'}]});assert.equal(r.status,'completed');}checks.push('All nine Cash Position visuals still execute after dependency retirement');
const benchmarks=[];
for(const [name,q] of [['old-current-period','SELECT * FROM public.reporting_cashflow_daily WHERE "Scope ID"=\'__ALL__\' AND "Date">=date_trunc(\'month\',public.olap_reporting_date())'],['new-current-period',"SELECT * FROM public.reporting_cash_period(date_trunc('month',public.olap_reporting_date())::date,public.olap_reporting_date(),'__ALL__')"]]){
 const r=await run('EXPLAIN (ANALYZE,FORMAT JSON) '+q);const plan=typeof r.data.rows[0][0]==='string'?JSON.parse(r.data.rows[0][0]):r.data.rows[0][0];benchmarks.push({name,execution_ms:plan[0]['Execution Time'],planning_ms:plan[0]['Planning Time']});
}
const permissions=(await run("SELECT has_table_privilege(current_user,'public.reporting_income_events','SELECT'),has_table_privilege(current_user,'public.reporting_income_events','INSERT'),has_function_privilege(current_user,'public.reporting_cash_period(date,date,text)','EXECUTE')")).data.rows[0];assert.deepEqual(permissions,[true,false,true]);checks.push('Restricted reporting SELECT/EXECUTE succeeds; source writes remain denied');
const models=read('models.json'),counts={tabs:d.tabs.length,visuals:d.dashcards.filter(c=>c.card_id).length,questions:new Set(d.dashcards.map(c=>c.card_id).filter(Boolean)).size,notes:d.dashcards.filter(c=>!c.card_id).length,models:Object.keys(models).length,model_fields:Object.values(models).reduce((n,m)=>n+m.columns.length,0),snippets:(await api('GET','native-query-snippet')).length};
fs.writeFileSync(backup+'/completed-dashboard.json',JSON.stringify(d,null,2));
write('statement-cleanup/final-verification.json',{at:new Date().toISOString(),checks,counts,benchmarks,retired_questions:retired.retired.filter(c=>c.type==='question').length,retired_models:retired.retired.filter(c=>c.type==='model').length,financial_values_published:false});
const manifest=read('manifest.json');manifest.dashboard={...manifest.dashboard,tabs:d.tabs.map(t=>t.id),visuals:counts.visuals,questions:counts.questions,heading_and_note_cards:counts.notes};manifest.statement_cleanup={database_version:39,deployment_commit:'311fa9986287a9f4ab234aafcd24c1df0219330f',evidence:'statement-cleanup/README.md',verification:'statement-cleanup/final-verification.json',models:counts.models,model_fields:counts.model_fields};write('manifest.json',manifest);
const plan=read('statement-cleanup-plan.json');plan.tabs=d.tabs;plan.parameters=d.parameters;plan.layout=layout(d,state);write('statement-cleanup-plan.json',plan);
console.log(JSON.stringify({checks:checks.length,counts,benchmarks}));
