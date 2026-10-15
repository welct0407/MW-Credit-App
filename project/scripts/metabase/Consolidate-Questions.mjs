import fs from 'node:fs';
import assert from 'node:assert/strict';
import {api,assertSource,read,write,privateDir} from './ReportingApi.mjs';
import {questionReuse,renamePresentation} from './QuestionReuse.mjs';

await assertSource();
const backup=privateDir+'/question-reuse-before';
const baseline=JSON.parse(fs.readFileSync(backup+'/dashboard-3.json'));
const all=JSON.parse(fs.readFileSync(backup+'/cards.json'));
const byId=new Map(all.map(c=>[c.id,c]));
const aliases=new Map(Object.values(questionReuse).map(a=>[a.retired,a]));
const project=c=>Object.fromEntries(['id','card_id','dashboard_tab_id','row','col','size_x','size_y','parameter_mappings','visualization_settings'].map(k=>[k,c[k]]));
const ordered=d=>d.dashcards.map(project).sort((a,b)=>a.id-b.id);
const current=await api('GET','dashboard/3');
assert.deepEqual(ordered(current),ordered(baseline),'Dashboard changed since private backup');
const affected=baseline.dashcards.filter(c=>aliases.has(c.card_id));
assert.equal(affected.length,10);
for(const id of new Set([...aliases.keys(),...Array.from(aliases.values(),x=>x.canonical)])) {
 const card=await api('GET','card/'+id);
 assert.deepEqual(card.dataset_query,byId.get(id).dataset_query,'Question changed since backup: '+id);
 fs.writeFileSync(`${backup}/card-${id}.json`,JSON.stringify(card,null,2));
}
function references(v,id) {
 if(Array.isArray(v))return v.some(x=>references(x,id));
 if(v&&typeof v==='object')return Object.entries(v).some(([k,x])=>['source-card','card-id','card_id'].includes(k)&&x===id||k==='source-table'&&x==='card__'+id||references(x,id));
 return typeof v==='string'&&v.includes('{{#'+id+'}}');
}
for(const id of aliases.keys()) {
 assert.ok(!all.some(c=>!c.archived&&c.id!==id&&references(c.dataset_query,id)),'Question dependency on '+id);
 const other=JSON.parse(fs.readFileSync(backup+'/dashboard-2.json'));
 assert.ok(!references(other.dashcards,id),'Other dashboard dependency on '+id);
}
const query=async(route,parameters=[])=>{
 const r=await api('POST',route,{parameters,ignore_cache:true});
 assert.equal(r.status,'completed',route);return r.data.rows;
};
const lookup=await query('card/'+read('remaining-install-state.json').borrower_selector_id+'/query');
assert.ok(lookup.length);
const selected=[{id:'insight-borrower',type:'string/=',value:[lookup[0][0]]}];
const noMatch=[{id:'insight-borrower',type:'string/=',value:['__question_reuse_no_match__']}];
const cases=[];
for(const p of affected) {
 const a=aliases.get(p.card_id);
 assert.deepEqual(await query(`card/${p.card_id}/query`),await query(`card/${a.canonical}/query`),'Duplicate value mismatch '+p.card_id);
 for(const parameters of p.card_id===142?[[],selected,noMatch]:[[]]) {
  cases.push({placement:p.id,old:p.card_id,canonical:a.canonical,parameters,rows:await query(`dashboard/3/dashcard/${p.id}/card/${p.card_id}/query`,parameters)});
 }
}
// Metabase models 73 and 162 guarantee the one-row portfolio and zero-filled status grains.
// Equivalence is established by the reviewed definitions as well as current result parity.
const cards=baseline.dashcards.map(p=>{
 const a=aliases.get(p.card_id),result={...project(p),series:p.series.map(s=>({id:s.id}))};
 if(!a)return result;
 const old=byId.get(p.card_id);
 result.card_id=a.canonical;
 result.parameter_mappings=p.parameter_mappings.map(m=>({...m,card_id:m.card_id===p.card_id?a.canonical:m.card_id}));
 result.visualization_settings=renamePresentation({...old.visualization_settings,...p.visualization_settings,'card.title':p.visualization_settings['card.title']??old.name},a.fieldRename);
 return result;
});
await api('PUT','dashboard/3/cards',{cards,tabs:baseline.tabs});
const saved=await api('GET','dashboard/3');
assert.deepEqual(ordered(saved),cards.map(project).sort((a,b)=>a.id-b.id));
assert.deepEqual(saved.parameters,baseline.parameters);
assert.deepEqual(saved.tabs,baseline.tabs);
for(const c of cases)assert.deepEqual(await query(`dashboard/3/dashcard/${c.placement}/card/${c.canonical}/query`,c.parameters),c.rows,'Placement/filter changed '+c.placement);
for(const id of new Set(Array.from(aliases.values(),a=>a.canonical)))assert.deepEqual((await api('GET','card/'+id)).dataset_query,byId.get(id).dataset_query,'Canonical query changed');
for(const id of aliases.keys()) {
 assert.ok(!saved.dashcards.some(p=>p.card_id===id||p.series.some(s=>s.id===id)));
 await api('PUT','card/'+id,{archived:true});
 assert.equal((await api('GET','card/'+id)).archived,true);
}
const state=read('remaining-install-state.json');
for(const [key,a]of Object.entries(questionReuse))state.cards[key]={...state.cards[key],id:a.canonical,reused:true};
write('remaining-install-state.json',state);
const manifest=read('manifest.json');manifest.dashboard.questions=new Set(saved.dashcards.filter(c=>c.card_id).map(c=>c.card_id)).size;manifest.question_reuse_evidence='question-reuse-verification.json';write('manifest.json',manifest);
write('question-reuse-verification.json',{verified_at:new Date().toISOString(),baseline_commit:'90a0c472fcc083bc2f74aaf41d3238f7e29c3062',reviewed_active_cards:all.filter(c=>!c.archived).length,reviewed_dashboard_questions:126,archived_duplicates:Object.entries(questionReuse).map(([key,a])=>({key,...a})),questions_after:manifest.dashboard.questions,visual_placements:130,rebound_placements:affected.length,result_and_filter_cases:cases.length,canonical_queries_unchanged:true,layout_titles_formatting_and_parameters_preserved:true,borrower_filter_cases:['unfiltered','selected existing borrower','no matching borrower'],private_rollback:'question-reuse-before',retained_variants:[{ids:[54,68],reason:'Number versus gauge presentation'},{ids:[63,98],reason:'Area versus line presentation; page-specific date filtering'},{ids:[82,83,84,85],reason:'Share pie versus ranked bars'},{ids:[83,112],reason:'Visible-borrower versus active-borrower population'},{ids:[118,146],reason:'Active-borrower portfolio versus selected-borrower risk view'},{ids:[58,81,94],reason:'Portfolio total, borrower aggregate and date-filterable repayment interest have different source/filter and empty-result contracts'},{ids:[40,41,42,43,44,45,46],reason:'Separate POC views explicitly exclude hidden borrowers and have distinct grouping/limits'}]});
console.log(`Reused ${affected.length} placements; archived ${aliases.size} duplicates; ${manifest.dashboard.questions} questions remain across 130 visuals. All ${cases.length} placement/filter cases passed.`);
