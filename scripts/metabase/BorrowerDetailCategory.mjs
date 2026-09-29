// R050: compact borrower category and chart-axis refinement on Detail105.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {api,assertSource,root} from './ReportingApi.mjs';
const out=root+'/outputs/r050-borrower-detail-category';
const priv='C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/r050-borrower-detail-category';
fs.mkdirSync(out,{recursive:true});fs.mkdirSync(priv,{recursive:true});
const save=(dir,name,x)=>fs.writeFileSync(`${dir}/${name}.json`,JSON.stringify(x,null,2)+'\n');
const read=(dir,name)=>JSON.parse(fs.readFileSync(`${dir}/${name}.json`,'utf8'));
const chosen=`WITH chosen AS (SELECT borrower_id FROM public.reporting_borrower_directory_v1 WHERE borrower_id= [[{{borrower_id}} --]] '__select_borrower__'\n)`;
const query={database:2,type:'native',native:{query:chosen+` SELECT CASE m.quadrant
 WHEN 'Cash Cow' THEN '🐄 Cash Cow' WHEN 'Dog' THEN '🐕 Dog'
 WHEN 'Star' THEN '⭐ Star' WHEN 'Question Mark' THEN '❓ Question Mark'
 ELSE coalesce(m.quadrant,'Outside active cohort') END AS "Borrower category"
 FROM chosen c LEFT JOIN public.reporting_borrower_matrix_v3 m USING(borrower_id)`,
 'template-tags':{borrower_id:{id:'bp-borrower',name:'borrower_id','display-name':'Borrower',type:'text'}}}};
const definition={name:'Borrower category · current BCG matrix',description:'Current governed V3 BCG Matrix quadrant for the selected borrower. Emoji provides a visual cue while retaining the exact category label. Outside active cohort remains explicit. Ignores Detail activity dates.',display:'scalar',dataset_query:query,visualization_settings:{'scalar.field':'Borrower category'}};
const response=async(q,bid)=>{const r=await api('POST','dataset',{...q,parameters:bid?[{type:'category',target:['variable',['template-tag','borrower_id']],value:bid}]:[]});assert.equal(r.status,'completed',r.error);return r.data.rows;};
const top=[291,292,293,294],positions=[[0,5],[5,4],[9,5],[14,4]];
const shape=c=>({id:c.id,card_id:c.card_id,dashboard_tab_id:c.dashboard_tab_id,row:c.row,col:c.col,size_x:c.size_x,size_y:c.size_y,parameter_mappings:c.parameter_mappings,visualization_settings:c.visualization_settings,series:c.series});
if(process.argv.includes('--apply')){
 await assertSource();assert(!fs.existsSync(priv+'/before.json'));
 const d=await api('GET','dashboard/3'),lights=await api('GET','card/369');
 assert(d.tabs.some(t=>t.id===105&&t.name==='8 · Borrower Detail'));
 const health=d.dashcards.filter(c=>c.dashboard_tab_id===105&&c.card_id===295);assert.equal(health.length,1);assert.equal(health[0].row,10);
 for(const id of top){const c=d.dashcards.filter(x=>x.dashboard_tab_id===105&&x.card_id===id);assert.equal(c.length,1);assert.equal(c[0].row,7);assert.equal(c[0].size_x,6);}
 assert.equal(lights.visualization_settings['graph.x_axis.title_text'],'Charge date');
 const sample=await response({database:2,type:'native',native:{query:'SELECT borrower_id FROM public.reporting_borrower_matrix_v3 ORDER BY quadrant,borrower_id LIMIT 8'}});
 assert.equal((await response(query)).length,0);
 for(const [bid] of sample){const rows=await response(query,bid);assert.equal(rows.length,1);assert(/Cash Cow|Dog|Star|Question Mark/.test(rows[0][0]));}
 save(priv,'before',{dashboard:d,lights});
 const backup=await api('POST','dashboard/3/copy',{name:'R050 recovery - before compact borrower category',collection_id:5});
 const state={recoveryDashboard:backup.id,card:null};save(out,'state',state);
 const card=await api('POST','card',{...definition,collection_id:5});state.card=card.id;save(out,'state',state);
 const viz={...lights.visualization_settings};delete viz['graph.x_axis.title_text'];
 await api('PUT','card/369',{name:lights.name,description:lights.description,display:lights.display,dataset_query:lights.dataset_query,visualization_settings:viz});
 const cards=d.dashcards.filter(c=>c.id!==health[0].id).map(c=>{
  const ix=c.dashboard_tab_id===105?top.indexOf(c.card_id):-1;
  if(ix>=0)return {...c,col:positions[ix][0],size_x:positions[ix][1]};
  if(c.dashboard_tab_id===105&&c.row>=17)return {...c,row:c.row-7};
  return c;
 });
 cards.push({id:-50580,card_id:card.id,dashboard_tab_id:105,row:7,col:18,size_x:6,size_y:3,series:[],visualization_settings:{'card.title':'BCG category'},parameter_mappings:[{parameter_id:'bd-borrower',card_id:card.id,target:['variable',['template-tag','borrower_id']]}]});
 await api('PUT','dashboard/3/cards',{tabs:d.tabs,cards});
 save(out,'plan',{dashboard:3,tab:105,removedPlacement:health[0].id,retainedQuestion:295,shiftLaterRows:-7,topCardWidths:[5,4,5,4,6],newQuestion:definition,axisTitleRemovedFrom:369});
 console.log('Compact BCG category published; recovery dashboard '+backup.id+', question '+card.id);
}
if(process.argv.includes('--polish')){
 await assertSource();const d=await api('GET','dashboard/3'),lights=await api('GET','card/369');
 const share=d.dashcards.find(c=>c.dashboard_tab_id===105&&c.card_id===294);
 assert(share);assert.equal(share.visualization_settings['card.title'],undefined);
 assert.equal(lights.visualization_settings['graph.x_axis.title_text'],undefined);
 assert.equal(lights.visualization_settings['graph.x_axis.title_enabled'],undefined);
 save(priv,'before-polish',{dashboard:d,lights});
 await api('PUT','card/369',{name:lights.name,description:lights.description,display:lights.display,dataset_query:lights.dataset_query,visualization_settings:{...lights.visualization_settings,'graph.x_axis.title_enabled':false}});
 const cards=d.dashcards.map(c=>c.id===share.id?{...c,visualization_settings:{...c.visualization_settings,'card.title':'Portfolio %'}}:c);
 await api('PUT','dashboard/3/cards',{tabs:d.tabs,cards});console.log('Removed x-axis title and shortened top-card label');
}
if(process.argv.includes('--axis-blank')){
 await assertSource();const lights=await api('GET','card/369');
 assert.equal(lights.visualization_settings['graph.x_axis.title_enabled'],false);
 save(priv,'before-axis-blank',{lights});
 await api('PUT','card/369',{name:lights.name,description:lights.description,display:lights.display,dataset_query:lights.dataset_query,visualization_settings:{...lights.visualization_settings,'graph.x_axis.title_enabled':true,'graph.x_axis.title_text':'\u00a0'}});
 console.log('Set visually blank x-axis title');
}
if(process.argv.includes('--verify')){
 await assertSource();const before=read(priv,'before').dashboard,state=read(out,'state'),d=await api('GET','dashboard/3'),card=await api('GET','card/'+state.card),lights=await api('GET','card/369');
 assert.deepEqual(d.tabs,before.tabs);assert.deepEqual(d.parameters,before.parameters);assert.equal(lights.visualization_settings['graph.x_axis.title_text'],'\u00a0');assert.equal(lights.visualization_settings['graph.x_axis.title_enabled'],true);
 assert.equal(d.dashcards.filter(c=>c.dashboard_tab_id===105&&c.card_id===295).length,0);
 const newPlacement=d.dashcards.find(c=>c.dashboard_tab_id===105&&c.card_id===state.card);assert(newPlacement);
 assert.deepEqual([newPlacement.row,newPlacement.col,newPlacement.size_x,newPlacement.size_y],[7,18,6,3]);
 assert(newPlacement.parameter_mappings.every(m=>m.parameter_id==='bd-borrower'));
 for(let i=0;i<4;i++){const c=d.dashcards.find(x=>x.dashboard_tab_id===105&&x.card_id===top[i]);assert.deepEqual([c.row,c.col,c.size_x,c.size_y],[7,positions[i][0],positions[i][1],3]);}
 const old=new Map(before.dashcards.map(c=>[c.id,c]));assert.equal(d.dashcards.length,before.dashcards.length);
 for(const c of d.dashcards){const b=old.get(c.id);if(!b){assert.equal(c.card_id,state.card);continue;}if(b.card_id===295)throw Error('Health placement remained');const expected={...b};const ix=b.dashboard_tab_id===105?top.indexOf(b.card_id):-1;if(ix>=0){expected.col=positions[ix][0];expected.size_x=positions[ix][1];if(b.card_id===294)expected.visualization_settings={...b.visualization_settings,'card.title':'Portfolio %'};}else if(b.dashboard_tab_id===105&&b.row>=17)expected.row=b.row-7;assert.deepEqual(shape(c),shape(expected));}
 assert.equal((await response(card.dataset_query)).length,0);
 const sample=await response({database:2,type:'native',native:{query:'SELECT DISTINCT ON (quadrant) borrower_id,quadrant FROM public.reporting_borrower_matrix_v3 WHERE quadrant IN (\'Cash Cow\',\'Dog\',\'Question Mark\',\'Star\') ORDER BY quadrant,borrower_id'}});
 assert.equal(sample.length,4);
 for(const [bid,quadrant] of sample){const a=(await response(card.dataset_query,bid))[0][0];assert.equal(a.replace(/^[^A-Za-z]+/u,''),quadrant);}
 save(out,'saved',{question:{id:card.id,name:card.name,description:card.description,display:card.display,dataset_query:card.dataset_query,visualization_settings:card.visualization_settings},placement:shape(newPlacement),topCards:top.map(id=>shape(d.dashcards.find(c=>c.dashboard_tab_id===105&&c.card_id===id)))});
 save(out,'verification',{passed:true,axisTitleRemoved:true,healthTableRemoved:true,categoryCardAdded:true,otherPlacementsPreserved:true,dateFilterUnmapped:true,borrowerCategoriesCompared:sample.length,recoveryDashboard:state.recoveryDashboard});
 console.log('Axis, category, layout and saved borrower labels verified');
}
if(process.argv.includes('--sync-evidence')){
 await assertSource();const live=await api('GET','card/369');
 assert.equal(live.visualization_settings['graph.x_axis.title_text'],'\u00a0');
 const dir=root+'/outputs/r050-borrower-lifetime';
 for(const name of ['plan','saved']){
  const doc=read(dir,name);const q=name==='plan'?doc.questions[0]:doc.questions.find(x=>x.id===369);
  assert(q);q.visualization_settings=live.visualization_settings;save(dir,name,doc);
 }
 const plan=read(out,'plan');plan.axisTitle={question:369,blankTitle:'nonbreaking space',enabled:true,reason:'Metabase scatter ignored title_enabled=false and displayed the dimension name; a blank explicit title preserves seven date labels.'};save(out,'plan',plan);
 console.log('Refreshed public question369 settings and axis note');
}
