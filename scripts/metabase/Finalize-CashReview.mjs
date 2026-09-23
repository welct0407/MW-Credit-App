import './LegacyStatementGuard.mjs';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {api,read,write,privateDir} from './ReportingApi.mjs';
import {assertPreserved,parameters,layout,project} from './CashReviewPages.mjs';
const state=read('cash-review-state.json'),d=await api('GET','dashboard/3'),v=read('cash-review-verification.json');
assertPreserved(d);
const ids=state.tabs.map(t=>t.id),actual=d.dashcards.filter(c=>ids.includes(c.dashboard_tab_id));
assert.deepEqual(actual.map(project).sort((a,b)=>a.id-b.id),layout(state,d).map(project).sort((a,b)=>a.id-b.id));
const ps=parameters.map(p=>({id:p.id,type:p.type,value:p.default}));
for(const c of actual.filter(c=>c.card_id)){
 const r=await api('POST',`dashboard/3/dashcard/${c.id}/card/${c.card_id}/query`,{parameters:ps});
 assert.equal(r.status,'completed',String(c.card_id));assert.ok(!r.data.rows_truncated);
}
const dir=privateDir+'/cash-review-complete';fs.mkdirSync(dir,{recursive:true});
fs.writeFileSync(dir+'/dashboard.json',JSON.stringify(d,null,2));
for(const id of Object.values(state.cards))fs.writeFileSync(dir+'/card-'+id+'.json',JSON.stringify(await api('GET','card/'+id),null,2));
v.final_layout_verified_at=new Date().toISOString();v.final_default_queries=actual.filter(c=>c.card_id).length;v.original_pages_preserved_after_layout_refinement=true;
write('cash-review-verification.json',v);
const m=read('manifest.json');
m.dashboard.visuals=d.dashcards.filter(c=>c.card_id).length;m.dashboard.questions=new Set(d.dashcards.map(c=>c.card_id).filter(Boolean)).size;m.dashboard.tabs=d.tabs.map(t=>t.id);m.dashboard.heading_and_note_cards=d.dashcards.filter(c=>!c.card_id).length;
m.status='ten-original-pages-plus-three-additive-review-pages';m.cash_review={tabs:state.tabs,questions:Object.values(state.cards),reused_visual_placements:25,new_models:0,new_snippets:0,verification:'cash-review-verification.json',plan:'cash-review-plan.json',baseline_commit:state.baseline_commit};
write('manifest.json',m);console.log('Final layout and 30 default queries verified; manifest updated.');
