// R040 refinement: current governed BCG category in Portfolio comparison.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {api,assertSource,root} from './ReportingApi.mjs';

const out=`${root}/outputs/r040-borrower-lifetime-display`;
const priv='C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/r040-borrower-matrix-category';
fs.mkdirSync(out,{recursive:true});fs.mkdirSync(priv,{recursive:true});
const file=(name,dir=priv)=>`${dir}/${name}.json`;
const write=(name,value,dir=out)=>fs.writeFileSync(file(name,dir),JSON.stringify(value,null,2)+'\n');
const read=name=>JSON.parse(fs.readFileSync(file(name),'utf8'));
const sql=card=>card.dataset_query.native?.query??card.dataset_query.stages?.[0]?.native;
const tags={
 period:{id:'bp-period',name:'period','display-name':'Activity period',type:'dimension',dimension:['field',82,null],'widget-type':'date/all-options',alias:'d."Date"'},
 population:{id:'bp-population',name:'population','display-name':'Population',type:'text',default:'All with loan history'},
 '#310':{id:'r040-model-310',name:'#310','display-name':'Borrower lifetime economics',type:'card','card-id':310}
};
const category='BCG Matrix category';
const shape=d=>d.dashcards.map(({id,card_id,dashboard_tab_id,row,col,size_x,size_y,parameter_mappings,visualization_settings})=>({id,card_id,dashboard_tab_id,row,col,size_x,size_y,parameter_mappings,visualization_settings})).sort((a,b)=>a.id-b.id);
async function current(){
 await assertSource();
 const [dashboard,card]=await Promise.all([api('GET','dashboard/3'),api('GET','card/289')]);
 assert.equal(dashboard.dashcards.filter(c=>c.dashboard_tab_id===104&&c.card_id===289).length,1);
 assert.equal(card.id,289);return {dashboard,card};
}
function proposed(card){
 const query=sql(card);
 const select=`coalesce(h.current_health_status,'Unavailable') AS "Current health",`;
 const join='LEFT JOIN public.reporting_borrower_payment_health_v1 h USING(borrower_id) CROSS JOIN bounds b';
 assert.equal(query.split(select).length,2,'Comparison health select drift');
 assert.equal(query.split(join).length,2,'Comparison health join drift');
 assert(query.includes('Lifetime daily rate')&&query.includes('Lifetime interest return'),'R040 lifetime columns missing');
 assert(!query.includes(`AS "${category}"`),'Category already present');
 const next=query.replace(select,`${select}CASE WHEN c.active_loans=0 THEN 'Outside active cohort' ELSE coalesce(m.quadrant,'Unavailable') END AS "${category}",`)
  .replace(join,'LEFT JOIN public.reporting_borrower_payment_health_v1 h USING(borrower_id) LEFT JOIN public.reporting_borrower_matrix_v3 m USING(borrower_id) CROSS JOIN bounds b');
 const settings=structuredClone(card.visualization_settings);
 const columns=settings['table.columns'];const i=columns.findIndex(c=>c.name==='Current health');assert(i>=0);
 columns.splice(i+1,0,{name:category,fieldRef:['field',category,{'base-type':'type/Text'}],enabled:true});
 return {dataset_query:{database:2,type:'native',native:{query:next,'template-tags':tags}},visualization_settings:settings};
}
async function dashboardQuery(d,parameters=[]){
 const p=d.dashcards.find(c=>c.dashboard_tab_id===104&&c.card_id===289);
 const r=await api('POST',`dashboard/3/dashcard/${p.id}/card/289/query`,{parameters});
 assert.equal(r.status,'completed');return r;
}
const rows=r=>r.data.rows.map(row=>Object.fromEntries(r.data.cols.map((c,i)=>[c.name,row[i]])));

if(process.argv.includes('--prepare')){
 assert(!fs.existsSync(file('matrix-before')),'Existing matrix-category baseline; do not overwrite');
 const before=await current();write('matrix-before',before,priv);
 const plan=proposed(before.card),r=await api('POST','dataset',plan.dataset_query);
 assert.equal(r.status,'completed');assert(!r.data.rows_truncated);
 assert(r.data.cols.some(c=>c.name===category));
 write('matrix-plan',{dashboard:3,tab:104,question:289,column:category,source:'public.reporting_borrower_matrix_v3.quadrant',inactiveValue:'Outside active cohort',rows:r.data.rows.length,startingCommit:'720db01b9218090240a5477fdd83211bcc221326'});
 console.log('Current-category query preflight passed');
}
if(process.argv.includes('--publish')){
 const before=read('matrix-before'),live=await current(),plan=proposed(before.card);
 assert.deepEqual(shape(live.dashboard),shape(before.dashboard),'Dashboard drift');
 assert.deepEqual(live.dashboard.parameters,before.dashboard.parameters,'Dashboard filter drift');
 assert.deepEqual(live.card.dataset_query,before.card.dataset_query,'Comparison query drift');
 assert.deepEqual(live.card.visualization_settings,before.card.visualization_settings,'Comparison formatting drift');
 const backup=await api('POST','dashboard/3/copy',{name:'R040 recovery - before Portfolio BCG category',collection_id:5});
 write('matrix-state',{backupDashboard:backup.id,dashboard:3,tab:104,question:289});
 await api('PUT','card/289',{...plan,description:'R040 Portfolio comparison. BCG Matrix category is the current governed V3 quadrant for active borrowers; inactive borrowers are outside the active cohort. Category and lifetime ratios ignore Activity dates; period activity and population continue to filter the table. Click Borrower for Detail.'});
 console.log(`Published current category; recovery dashboard ${backup.id}`);
}
if(process.argv.includes('--verify')){
 const before=read('matrix-before'),live=await current(),plan=proposed(before.card);
 assert.deepEqual(shape(live.dashboard),shape(before.dashboard),'Dashboard layout changed');
 assert.deepEqual(live.dashboard.parameters,before.dashboard.parameters,'Dashboard filters changed');
 assert.equal(sql(live.card),plan.dataset_query.native.query);
 assert.deepEqual(live.card.visualization_settings,plan.visualization_settings);
 const base=await dashboardQuery(live.dashboard);
 const dated=await dashboardQuery(live.dashboard,[{id:'bp-period',type:'date/all-options',value:'2026-09-01~2026-09-10'}]);
 const active=await dashboardQuery(live.dashboard,[{id:'bp-population',type:'string/=',value:['Currently active']}]);
 const v=await api('POST','dataset',{database:2,type:'native',native:{query:'SELECT borrower_id,quadrant FROM public.reporting_borrower_matrix_v3','template-tags':{}}});
 assert.equal(v.status,'completed');
 const matrix=new Map(v.data.rows.map(r=>[r[0],r[1]]));
 const byId=r=>new Map(rows(r).map(x=>[x['Borrower ID'],x]));
 const baseline=byId(base),dates=byId(dated),filtered=byId(active);
 for(const [id,row] of baseline){
  const expected=row['Active loans']===0?'Outside active cohort':matrix.get(id)??'Unavailable';
  assert.equal(row[category],expected,'Category differs from governed matrix');
  if(dates.has(id))assert.equal(dates.get(id)[category],expected,'Category changed with activity dates');
  if(filtered.has(id))assert.equal(filtered.get(id)[category],expected,'Category changed with population');
 }
 assert([...filtered.values()].every(r=>r['Active loans']>0));
 write('matrix-saved',{dashboard:3,tab:104,question:{id:live.card.id,name:live.card.name,description:live.card.description,display:live.card.display,dataset_query:live.card.dataset_query,visualization_settings:live.card.visualization_settings},placement:shape(live.dashboard).find(c=>c.dashboard_tab_id===104&&c.card_id===289)});
 write('matrix-verification',{passed:true,rows:base.data.rows.length,activeRows:filtered.size,matrixRows:matrix.size,governedCategoryParity:true,inactiveOutsideCohort:true,activityDateInvariant:true,populationFilterPreserved:true,layoutAndDrillPreserved:true,backupDashboard:JSON.parse(fs.readFileSync(file('matrix-state',out),'utf8')).backupDashboard});
 console.log('Saved category, source parity, date invariance, population and layout verified');
}
