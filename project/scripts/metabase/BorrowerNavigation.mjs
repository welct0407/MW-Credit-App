// R043: canonical borrower tabs and immutable-key drill-through.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {api,assertSource,root} from './ReportingApi.mjs';
const out=root+'/outputs/r043-borrower-navigation',priv='C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/r043-borrower-navigation';
fs.mkdirSync(out,{recursive:true});fs.mkdirSync(priv,{recursive:true});
const save=(n,x,dir=out)=>fs.writeFileSync(`${dir}/${n}.json`,JSON.stringify(x,null,2)+'\n');
const read=(n,dir=priv)=>JSON.parse(fs.readFileSync(`${dir}/${n}.json`,'utf8'));
const health=[259,261,263,265,267,268,269,271,272,275];
const charts=[285,286,287,311,312,313,314];
const inbound=[640,636,638,645,642];
const sql=c=>c.dataset_query.stages?.[0]?.native??c.dataset_query.native.query;
const link={type:'link',linkType:'url',linkTemplate:'https://reports.mw-credit.com/dashboard/3?tab=105&bd_borrower={{Borrower ID}}&bd_activity=past30days'};
const shape=d=>d.dashcards.map(({id,card_id,dashboard_tab_id,row,col,size_x,size_y,parameter_mappings,visualization_settings,series})=>({id,card_id,dashboard_tab_id,row,col,size_x,size_y,parameter_mappings,visualization_settings,series})).sort((a,b)=>a.id-b.id);
const tabs=t=>t.map(({id,name,position})=>({id,name,position}));
function layout(d){
 const order=[4,14,16,15,18,104,31,105,8,19,11],names={31:'7 · Borrower Health Review',105:'8 · Borrower Detail',8:'9 · Risks',19:'10 · Collection Monitor',11:'11 · Forecast & Partners'};
 assert(d.tabs.some(t=>t.id===10&&t.name.includes('Borrower Insight')));
 const cards=structuredClone(d.dashcards.filter(c=>c.dashboard_tab_id!==10));
 for(const c of cards){
  if(c.dashboard_tab_id===31&&health.includes(c.card_id)){c.visualization_settings.column_settings??={};c.visualization_settings.column_settings['["name","Borrower"]']={...c.visualization_settings.column_settings['["name","Borrower"]'],click_behavior:link};}
  if(c.dashboard_tab_id===104&&charts.includes(c.card_id))c.visualization_settings.click_behavior=link;
  if(inbound.includes(c.id))c.visualization_settings.column_settings['["name","Borrower"]'].click_behavior=link;
  if(c.id===2158)c.visualization_settings.text='### Borrower comparison\nClick a name to open tab 8 · Borrower Detail with these activity dates. Shares use the selected population; hidden operational records remain included.';
  if(c.id===833)c.visualization_settings.text='## Borrower Health Review\nClick a borrower name in a table or the matrix to open tab 8 · Borrower Detail. Detail activity starts with the previous 30 completed days.';
 }
 const parameters=d.parameters.filter(p=>cards.some(c=>c.parameter_mappings?.some(m=>m.parameter_id===p.id)));
 assert.deepEqual(d.parameters.filter(p=>!parameters.includes(p)).map(p=>p.id),['insight-borrower','proposed-amount']);
 return {tabs:order.map((id,position)=>({...d.tabs.find(t=>t.id===id),name:names[id]??d.tabs.find(t=>t.id===id).name,position})),cards,parameters};
}
async function query(q){const r=await api('POST','dataset',q);assert.equal(r.status,'completed',r.error);assert(!r.data.rows_truncated);return r.data;}
if(process.argv.includes('--prepare')){
 await assertSource();assert(!fs.existsSync(priv+'/before.json'));
 const d=await api('GET','dashboard/3'),cards=await Promise.all([...health,287].map(id=>api('GET','card/'+id)));
 save('before',{d,cards},priv);const next=layout(d),questions=[];
 for(const c of cards){
  const dq=structuredClone(c.dataset_query),s=sql(c);
  if(health.includes(c.id)){assert(s.startsWith('SELECT '));dq.stages[0].native=s.replace('SELECT ','SELECT b."Row ID" AS "Borrower ID",');}
  else {const needle='g.label AS "Borrower",';assert(s.includes(needle));dq.stages[0].native=s.replace(needle,needle+'CASE WHEN g.label<>\'Others\' THEN min(g.borrower_id) END AS "Borrower ID",');}
  const data=await query(dq),vs=structuredClone(c.visualization_settings);
  if(health.includes(c.id))vs['table.columns']=data.cols.filter(x=>x.name!=='Borrower ID').concat(data.cols.filter(x=>x.name==='Borrower ID')).map(x=>({name:x.name,fieldRef:x.field_ref??['field',x.name,{'base-type':x.base_type}],enabled:x.name!=='Borrower ID'}));
  const before=await query(c.dataset_query),ix=data.cols.findIndex(x=>x.name==='Borrower ID');
  assert.deepEqual(data.cols.filter((_,i)=>i!==ix).map(c=>c.name),before.cols.map(c=>c.name));
  assert.deepEqual(data.rows.map(r=>r.filter((_,i)=>i!==ix)),before.rows,'Existing values changed');
  questions.push({id:c.id,name:c.name,display:c.display,dataset_query:dq,visualization_settings:vs});
 }
 save('plan',{questions,tabOrder:tabs(next.tabs),removedTab:10,removedPlacements:d.dashcards.filter(c=>c.dashboard_tab_id===10).map(c=>c.id),removedParameters:['insight-borrower','proposed-amount'],existingValuesUnchanged:true});
 console.log('11 queries tested; existing values unchanged; navigation package prepared');
}
if(process.argv.includes('--publish')){
 await assertSource();const {d,cards}=read('before'),live=await api('GET','dashboard/3'),next=layout(d);
 assert.deepEqual(shape(live),shape(d));assert.deepEqual(live.tabs,d.tabs);assert.deepEqual(live.parameters,d.parameters);
 for(const c of cards){const q=await api('GET','card/'+c.id);assert.deepEqual(q.dataset_query,c.dataset_query);assert.deepEqual(q.visualization_settings,c.visualization_settings);}
 const backup=await api('POST','dashboard/3/copy',{name:'R043 recovery - before borrower navigation',collection_id:5});save('state',{backupDashboard:backup.id});
 for(const {id,...q} of read('plan',out).questions)await api('PUT','card/'+id,q);
 await api('PUT','dashboard/3/cards',{tabs:next.tabs,cards:next.cards});
 await api('PUT','dashboard/3',{parameters:next.parameters});
 console.log('Published canonical borrower tabs and links; backup '+backup.id);
}
if(process.argv.includes('--repair-inbound')){
 await assertSource();const {d}=read('before'),live=await api('GET','dashboard/3'),next=layout(d);
 assert.deepEqual(shape({dashcards:live.dashcards.filter(c=>!inbound.includes(c.id))}),shape({dashcards:next.cards.filter(c=>!inbound.includes(c.id))}));
 assert.deepEqual(tabs(live.tabs),tabs(next.tabs));assert.deepEqual(live.parameters,next.parameters);
 for(const id of inbound)assert.deepEqual(shape({dashcards:[live.dashcards.find(c=>c.id===id)]}),shape({dashcards:[d.dashcards.find(c=>c.id===id)]}));
 save('before-inbound',live,priv);await api('PUT','dashboard/3/cards',{tabs:live.tabs,cards:next.cards});console.log('Five existing Collection Monitor links redirected to canonical Detail');
}
if(process.argv.includes('--verify')){
 await assertSource();const {d}=read('before'),next=layout(d),live=await api('GET','dashboard/3');
 assert.deepEqual(tabs(live.tabs),tabs(next.tabs));assert.deepEqual(shape(live),shape({dashcards:next.cards}));assert.deepEqual(live.parameters,next.parameters);
 const questions=[];for(const p of read('plan',out).questions){const c=await api('GET','card/'+p.id);assert.equal(sql(c),sql(p));assert.deepEqual(c.visualization_settings,p.visualization_settings);await query(c.dataset_query);questions.push({...p,dataset_query:c.dataset_query,result_metadata:c.result_metadata?.map(({name,display_name,base_type,effective_type,semantic_type,field_ref})=>({name,display_name,base_type,effective_type,semantic_type,field_ref}))});}
 for(const id of new Set(d.dashcards.filter(c=>c.dashboard_tab_id===10&&c.card_id).map(c=>c.card_id)))assert.equal((await api('GET','card/'+id)).archived,false);
 // Public evidence excludes the credential-bearing iframe and all result rows.
 const linked=live.dashcards.filter(c=>health.includes(c.card_id)&&c.dashboard_tab_id===31||[...charts,289].includes(c.card_id)&&c.dashboard_tab_id===104||inbound.includes(c.id)).map(({id,card_id,dashboard_tab_id,visualization_settings})=>({id,card_id,dashboard_tab_id,visualization_settings}));
 save('saved',{questions,tabs:live.tabs,parameters:live.parameters,links:linked});save('verification',{passed:true,questionsExecuted:questions.length,tabs:live.tabs.length,placements:live.dashcards.length,retiredQuestionsPreserved:true,unaffectedPlacementsPreserved:true,hiddenIds:true,backupDashboard:read('state',out).backupDashboard});console.log('Saved tabs, all links, hidden keys, queries and unaffected placements verified');
}
