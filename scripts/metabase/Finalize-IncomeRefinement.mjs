import './LegacyStatementGuard.mjs';
import fs from 'node:fs';import assert from 'node:assert/strict';
import {api,assertSource,read,write,privateDir} from './ReportingApi.mjs';
await assertSource();
const state=read('income-state.json'),specs=read('income-questions.json'),models=read('models.json');
const dashboards=await api('GET','dashboard');assert.ok(Array.isArray(dashboards));
const used=new Set();for(const item of dashboards.filter(d=>!d.archived)){const d=await api('GET','dashboard/'+item.id);for(const c of d.dashcards)if(c.card_id)used.add(c.card_id);}
state.archived_cards??={};
for(const key of ['inception','monthly','cash-difference']){const id=state.cards[key];if(!id)continue;if(used.has(id))throw Error('Removed card still used: '+key);await api('PUT','card/'+id,{archived:true});state.archived_cards[key]=id;delete state.cards[key];write('income-state.json',state);}
const dir=privateDir+'/income-refinement-complete';fs.mkdirSync(dir,{recursive:true});
for(const route of ['dashboard/3','collection/graph','native-query-snippet/'+state.snippet_id,...specs.map(q=>'card/'+state.cards[q.key]),'card/'+models['cash-account-daily'].id,'card/'+models['cash-daily'].id])fs.writeFileSync(dir+'/'+route.replaceAll('/','-')+'.json',JSON.stringify(await api('GET',route)));
const performance=[];
for(const view of ['reporting_cash_account_daily','reporting_cash_daily']){
 const r=await api('POST','dataset',{database:2,type:'native',native:{query:`EXPLAIN (ANALYZE, FORMAT JSON, TIMING OFF) SELECT * FROM public.${view}`}});
 if(r.status!=='completed')throw Error('Cash view timing failed');
 const raw=r.data.rows[0][0],plan=typeof raw==='string'?JSON.parse(raw):raw;
 performance.push({view,execution_ms:plan[0]['Execution Time']});
}
write('income-asof-performance.json',{measured_at:new Date().toISOString(),checks:performance,note:'Single-run database execution diagnostics, not dashboard latency or a billing benchmark.'});
const d=await api('GET','dashboard/3'),manifest=read('manifest.json');
manifest.dashboard.visuals=d.dashcards.filter(c=>c.card_id).length;manifest.dashboard.questions=new Set(d.dashcards.map(c=>c.card_id).filter(Boolean)).size;manifest.dashboard.heading_and_note_cards=d.dashcards.filter(c=>!c.card_id).length;
manifest.models.ids=Object.values(models).map(m=>m.id);manifest.flyway.after=35;manifest.flyway.new_migrations=[...new Set([...manifest.flyway.new_migrations,'V35__income_cash_asof.sql'])];manifest.flyway.v34_deployment_commit??=manifest.flyway.deployment_commit;manifest.flyway.deployment_commit='e7fd3af40b572ab644856e7cc95d6a243f49a870';manifest.flyway.v34_migration_sha256??=manifest.flyway.migration_sha256;delete manifest.flyway.migration_sha256;manifest.income_cash_asof_tests='income-asof-production.json';manifest.income_cash_asof_access='income-asof-grants.json';write('manifest.json',manifest);
write('income-refinement-complete.json',{completed_at:new Date().toISOString(),private_backup:dir,archived_cards:state.archived_cards,visuals:manifest.dashboard.visuals,questions:manifest.dashboard.questions,income_visuals:specs.length,models:Object.keys(models).length,model_fields:Object.values(models).reduce((n,m)=>n+m.columns.length,0),cash_available_from:'2026-09-18',cash_reconstructed_from_posted_dates:true});
console.log('Archived three replaced cards, saved completion metadata and updated inventory.');
