// Scoped R037 report refinement. No SQL DDL or AppSheet mutation.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {api,assertSource,root} from './ReportingApi.mjs';
export const out=root+'/outputs/r037-borrower-contribution';
const priv='C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/r037-borrower-contribution';
fs.mkdirSync(out,{recursive:true});fs.mkdirSync(priv,{recursive:true});
export const save=(n,x)=>fs.writeFileSync(`${out}/${n}.json`,JSON.stringify(x,null,2)+'\n');
const read=n=>JSON.parse(fs.readFileSync(`${out}/${n}.json`));
export const modelSql=fs.readFileSync(root+'/scripts/metabase/models/borrower-lifetime-economics.sql','utf8');
const native=(query,tags={})=>({database:2,type:'native',native:{query,'template-tags':tags}});
const population={id:'r037-pop',name:'population','display-name':'Population',type:'text',default:'All with loan history'};
const colors=['#3B82F6','#A855F7','#D97706','#14B8A6','#EC4899','#6366F1','#84A348','#9259A3','#2A7585','#C5CBD9'];
export function specs(modelId){
 const ref=modelId?`{{#${modelId}}}`:`(${modelSql})`;
 const tags={population,...(modelId?{['#'+modelId]:{id:'r037-model',name:'#'+modelId,'display-name':'Borrower lifetime economics',type:'card','card-id':modelId}}:{})};
 const pop="[[{{population}} --]] 'All with loan history'\n";
 const cohort=`WITH cohort AS (SELECT * FROM ${ref} m WHERE (${pop}='All with loan history' OR ${pop}='Currently active' AND "Has active loan" OR ${pop}='Currently inactive' AND NOT "Has active loan"))`;
 const result=[];
 const add=(key,name,display,q,settings)=>result.push({key,name,display,dataset_query:native(q,tags),visualization_settings:settings,description:'R037. Overall borrower economics; population filter applies, activity date slicer does not. Lifetime rate uses completed Bangkok days and end-of-day outstanding principal. Gross interest before expenses. See chart context and handover.'});
 for(const [key,name,metric] of [['principal','Borrowers Outstanding Principal Contribution','Principal outstanding'],['profit','Borrowers 30 Days Profit Contribution','Interest 30D']]){
  add(key,name,'pie',cohort+`, ranked AS (SELECT *,row_number() OVER(ORDER BY "${metric}" DESC,"Borrower ID") rank FROM cohort WHERE "${metric}">0 AND NOT EXISTS(SELECT 1 FROM cohort WHERE "${metric}" IS NULL${key==='principal'?` OR "${metric}"<0`:''})), grouped AS (SELECT CASE WHEN rank<=9 THEN "Borrower" ELSE 'Others' END label,CASE WHEN rank<=9 THEN "Borrower ID" END id,sum("${metric}") amount,min(rank) rank FROM ranked GROUP BY 1,2) SELECT label AS "Borrower",amount AS "Amount ฿",id AS "Borrower ID" FROM grouped ORDER BY rank`,{'pie.dimension':'Borrower','pie.metric':'Amount ฿','pie.show_legend':true,'pie.show_labels':false,'pie.percent_visibility':'both','pie.decimal_places':1,'pie.slice_threshold':0,'pie.show_total':false,'graph.colors':colors,column_settings:{'["name","Amount ฿"]':{number_style:'decimal',decimals:0,number_separators:'.,'}}});
 }
 for(const [key,name,metric] of [['rate','Lifetime Effective Achieved Daily Interest Rate · top 8','Achieved daily rate'],['coverage','Principal Coverage by Profit · top 8','Principal coverage']]){
  add(key,name,'row',cohort+` SELECT "Borrower","${metric}","Borrower ID","Lifetime interest","Principal days","Active loan interest","Principal outstanding" FROM cohort WHERE "${metric}" IS NOT NULL ORDER BY "${metric}" DESC,"Borrower ID" LIMIT 8`,{'graph.dimensions':['Borrower'],'graph.metrics':[metric],'graph.colors':[key==='rate'?'#7472BE':'#178F8A'],'graph.show_values':true,'graph.show_legend':false,'graph.x_axis.title_enabled':true,'graph.x_axis.title_text':key==='rate'?'Achieved interest · % per day':'Interest / current principal · %','graph.show_goal':key==='coverage','graph.goal_value':1,'graph.goal_label':'100% coverage','stackable.stack_type':null,column_settings:{[JSON.stringify(['name',metric])]:{number_style:'percent',decimals:key==='rate'?3:1,number_separators:'.,'}}});
 }
 add('context','Overall charts · dates and data availability','table',cohort+` SELECT max("Lifetime through") AS "Lifetime rate through",max("30D start") AS "Profit starts",max("30D end") AS "Profit ends",max("Current as of") AS "Principal as of",count(*) FILTER(WHERE "Achieved daily rate" IS NULL) AS "Borrowers without daily rate",count(*) FILTER(WHERE "Principal coverage" IS NULL) AS "Borrowers without coverage",CASE WHEN count(*) FILTER(WHERE "Interest 30D" IS NULL)>0 THEN 'Profit pie unavailable: incomplete receipts' WHEN count(*) FILTER(WHERE "Interest 30D">0)=0 THEN 'No positive 30-day interest' ELSE 'Positive borrower contributions only; negative adjustments excluded' END AS "Profit pie status",coalesce(sum("Interest 30D") FILTER(WHERE "Interest 30D"<0),0) AS "Excluded negative interest ฿",CASE WHEN count(*) FILTER(WHERE "Principal outstanding"<0 OR "Principal outstanding" IS NULL)>0 THEN 'Principal pie unavailable: negative or incomplete balances' ELSE 'Principal pie available' END AS "Principal pie status" FROM cohort`,{'table.pivot':false});
 return result;
}
function shape(d){return d.map(({id,card_id,dashboard_tab_id,col,row,size_x,size_y,series,parameter_mappings,visualization_settings})=>({id,card_id,dashboard_tab_id,col,row,size_x,size_y,series,parameter_mappings,visualization_settings})).sort((a,b)=>a.id-b.id);}
if(process.argv.includes('--prepare')){
 await assertSource();assert(!fs.existsSync(priv+'/before.json'),'Existing baseline; do not overwrite');
 const d=await api('GET','dashboard/3');fs.writeFileSync(priv+'/before.json',JSON.stringify(d));
 fs.writeFileSync(priv+'/permissions.json',JSON.stringify(await api('GET','collection/graph')));
 save('state',{cards:{},startingCommit:'400049e92b2ae4c607c2b19c3cce0ac9d0aebee6'});
 save('plan',{modelSql,charts:specs(null),dashboard:3,tab:104});console.log('Fresh private baseline and local plan captured');
}
if(process.argv.includes('--preflight')){
 await assertSource();const checks=[];
 for(const s of [{key:'model',dataset_query:native(modelSql)},...specs(null)]){
 const r=await api('POST','dataset',s.dataset_query);if(r.status!=='completed'){fs.writeFileSync(priv+'/error.json',JSON.stringify(r));throw Error('Failed '+s.key+'; private diagnostic');}
 assert(!r.data.rows_truncated);checks.push({key:s.key,rows:r.data.rows.length,ms:r.running_time});
 }save('preflight',checks);console.log(JSON.stringify(checks));
}
if(process.argv.includes('--publish')){
 await assertSource();let state=read('state');const before=JSON.parse(fs.readFileSync(priv+'/before.json'));
 let d=await api('GET','dashboard/3');assert.deepEqual(shape(d.dashcards),shape(before.dashcards),'Dashboard drift');assert.deepEqual(d.parameters,before.parameters);
 if(!state.backupDashboard){const b=await api('POST','dashboard/3/copy',{name:'R037 recovery · before borrower contribution',collection_id:5});state.backupDashboard=b.id;save('state',state);}
 if(!state.model){const m=await api('POST','card',{name:'Borrower lifetime economics',type:'model',display:'table',collection_id:5,dataset_query:native(modelSql),visualization_settings:{},description:'R037 shared borrower-grain economics. Lifetime end-of-day exposure through yesterday; signed receipts; current active-loan coverage. No operational writes.'});state.model=m.id;save('state',state);}
 for(const s of specs(state.model)){if(state.cards[s.key])continue;const {key,...body}=s;const c=await api('POST','card',{...body,type:'question',collection_id:5});state.cards[key]=c.id;save('state',state);}
 d=await api('GET','dashboard/3');assert.deepEqual(shape(d.dashcards),shape(before.dashcards));
 // Replace the two ranking placements with contribution pies; retain their saved questions.
 const cards=d.dashcards.filter(c=>![285,286].includes(c.card_id)||c.dashboard_tab_id!==104).map(c=>c.dashboard_tab_id===104&&c.row>=23?{...c,row:c.row+19}:c);
 let id=-37000;
 for(const [key,col,row,w,h] of [['principal',0,14,12,9],['profit',12,14,12,9],['rate',0,23,12,12],['coverage',12,23,12,12],['context',0,35,24,4]])cards.push({id:id--,card_id:state.cards[key],dashboard_tab_id:104,col,row,size_x:w,size_y:h,series:[],parameter_mappings:[{parameter_id:'bp-population',card_id:state.cards[key],target:['variable',['template-tag','population']]}],visualization_settings:{}});
 cards.push({id:id--,card_id:null,dashboard_tab_id:104,col:0,row:39,size_x:24,size_y:3,series:[],parameter_mappings:[],visualization_settings:{virtual_card:{name:null,display:'text',visualization_settings:{text:'**Overall charts ignore Activity dates.** Pies show current principal and positive borrower net interest contributions over the previous 30 completed Bangkok days. Negative borrower totals are excluded from pie shares and shown separately above. Lifetime daily rate = interest received ÷ principal-days outstanding through yesterday; receipt-day principal reductions apply that day. Coverage = interest received on currently active loans ÷ their current outstanding principal. Bars show top 8 eligible borrowers, with no Others aggregation. Unavailable histories are counted above. Gross interest is before expenses.'}}}});
 await api('PUT','dashboard/3/cards',{tabs:d.tabs,cards});console.log(JSON.stringify({model:state.model,cards:state.cards,backup:state.backupDashboard}));
}
if(process.argv.includes('--refine')){
 await assertSource();const state=read('state');
 for(const s of specs(state.model)){const {key,...body}=s;await api('PUT',`card/${state.cards[key]}`,body);}
 const d=await api('GET','dashboard/3');
 const cards=d.dashcards.map(c=>{if(c.dashboard_tab_id!==104)return c;
 if(c.row>=42 && d.dashcards.some(n=>n.dashboard_tab_id===104&&n.row===39&&n.size_y===3&&!n.card_id))return {...c,row:c.row+2};
 if(c.card_id||!c.visualization_settings?.virtual_card?.visualization_settings?.text?.startsWith('**Overall charts'))return c;
 let text=c.visualization_settings.virtual_card.visualization_settings.text.replaceAll('Ã·','÷').replaceAll('top 20','top 8');
 return {...c,size_y:5,visualization_settings:{...c.visualization_settings,virtual_card:{...c.visualization_settings.virtual_card,visualization_settings:{text}}}};});
 await api('PUT','dashboard/3/cards',{tabs:d.tabs,cards});
 save('plan',{modelSql,charts:specs(state.model),dashboard:3,tab:104});console.log('Scoped saved chart definitions reconciled');
}
if(process.argv.includes('--verify')){
 const state=read('state'),before=JSON.parse(fs.readFileSync(priv+'/before.json')),d=await api('GET','dashboard/3');
 assert.deepEqual(shape(d.dashcards.filter(c=>c.dashboard_tab_id!==104)),shape(before.dashcards.filter(c=>c.dashboard_tab_id!==104)));
 assert.deepEqual(d.tabs,before.tabs);assert.deepEqual(d.parameters,before.parameters);assert.deepEqual(await api('GET','collection/graph'),JSON.parse(fs.readFileSync(priv+'/permissions.json')));
 const saved=[],checks=[];
 for(const [key,id] of [['model',state.model],...Object.entries(state.cards)]){
 const c=await api('GET',`card/${id}`);saved.push({key,id,name:c.name,description:c.description,type:c.type,display:c.display,dataset_query:c.dataset_query,visualization_settings:c.visualization_settings,result_metadata:c.result_metadata?.map(({fingerprint,...x})=>x)});
 if(key==='model')continue;
 const p=d.dashcards.find(x=>x.card_id===id&&x.dashboard_tab_id===104);assert.equal(p.parameter_mappings.length,1);assert.equal(p.parameter_mappings[0].parameter_id,'bp-population');
 const q=await api('POST',`dashboard/3/dashcard/${p.id}/card/${id}/query`,{parameters:[{id:'bp-population',type:'string/=',value:['All with loan history']}]});
 if(q.status!=='completed'){fs.writeFileSync(priv+'/error.json',JSON.stringify(q));throw Error('Saved query failed '+key);}
 checks.push({key,rows:q.data.rows.length,dateMappingAbsent:true,ms:q.running_time});
 }
 save('saved',{dashboard:3,tab:104,questions:saved,layout:shape(d.dashcards.filter(c=>c.dashboard_tab_id===104))});save('verification',{at:new Date().toISOString(),otherTabsPreserved:true,parametersPreserved:true,permissionsPreserved:true,checks});console.log(JSON.stringify(checks));
}
if(process.argv.includes('--filters')){
 const state=read('state'),d=await api('GET','dashboard/3');const checks=[];
 const model=await api('POST',`card/${state.model}/query`,{});assert.equal(model.status,'completed');
 const rows=model.data.rows.map(r=>Object.fromEntries(model.data.cols.map((c,i)=>[c.name,r[i]])));
 for(const pop of ['All with loan history','Currently active']){
  const cohort=rows.filter(r=>pop==='All with loan history'||r['Has active loan']);
  for(const key of ['principal','profit','rate','coverage']){
   const id=state.cards[key],p=d.dashcards.find(c=>c.card_id===id&&c.dashboard_tab_id===104);
   const params=[{id:'bp-population',type:'string/=',value:[pop]}];
   const query=extra=>api('POST',`dashboard/3/dashcard/${p.id}/card/${id}/query`,{parameters:[...params,...extra]});
   const q=await query([]);assert.equal(q.status,'completed');
   const metric={principal:'Principal outstanding',profit:'Interest 30D',rate:'Achieved daily rate',coverage:'Principal coverage'}[key];
   const sum=xs=>xs.reduce((a,v)=>a+Number(v),0);
   if(['principal','profit'].includes(key))assert(Math.abs(sum(q.data.rows.map(r=>r[1]))-sum(cohort.filter(r=>r[metric]>0).map(r=>r[metric])))<1e-6,'Pie amounts reconcile');
   else {const expected=cohort.filter(r=>r[metric]!=null).sort((a,b)=>b[metric]-a[metric]||a['Borrower ID'].localeCompare(b['Borrower ID'])).slice(0,8);assert.deepEqual(q.data.rows.map(r=>r[2]),expected.map(r=>r['Borrower ID']));}
   if(pop==='All with loan history'&&['rate','coverage'].includes(key)){const changed=await query([{id:'bp-period',type:'date/all-options',value:'2026-01-01~2026-01-31'}]);assert.deepEqual(changed.data.rows,q.data.rows,'Date slicer invariant');}
   checks.push({key,population:pop,passed:true});
  }
 }save('filter-verification',{checks,dateInvarianceBothBars:true,pieTotalsReconciled:true});console.log('Eight population/reconciliation checks and both date-invariance checks passed');
}
