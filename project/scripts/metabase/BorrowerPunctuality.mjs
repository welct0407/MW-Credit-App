// R040: borrower-selected punctuality presentation over the existing V41 contract.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {api,assertSource,root} from './ReportingApi.mjs';
const out=root+'/outputs/r040-borrower-punctuality';
const priv='C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/r040-borrower-punctuality';
fs.mkdirSync(out,{recursive:true});fs.mkdirSync(priv,{recursive:true});
const save=(n,v,dir=out)=>fs.writeFileSync(`${dir}/${n}.json`,JSON.stringify(v,null,2)+'\n');
const read=(n,dir=priv)=>JSON.parse(fs.readFileSync(`${dir}/${n}.json`,'utf8'));
const sql=c=>c.dataset_query.stages?.[0]?.native??c.dataset_query.native.query;
const shape=d=>d.dashcards.map(({id,card_id,dashboard_tab_id,row,col,size_x,size_y,parameter_mappings,visualization_settings,series})=>({id,card_id,dashboard_tab_id,row,col,size_x,size_y,parameter_mappings,visualization_settings,series})).sort((a,b)=>a.id-b.id);
const tags={period:{id:'bp-period',name:'period','display-name':'Due date range',type:'dimension',dimension:['field',82,null],'widget-type':'date/all-options',alias:'d."Date"'},borrower_id:{id:'bp-borrower',name:'borrower_id','display-name':'Borrower',type:'text'}};
const description='One charge is one obligation. On time means both principal and interest fully covered by its due date. Partial payments are combined. Due dates today/future, zero/accounting obligations and invalid evidence are excluded. A late settlement stays late. Historical timing uses effective payment dates; current outstanding includes today. No eligible history means unavailable, never 100%.';
function plans(c){
 const original=sql(c),marker=" SELECT date_trunc('month',h.due_date)";
 assert.equal(original.split(marker).length,2,'Timing query drift');
 const base=original.split(marker)[0]+`, facts AS (SELECT h.* FROM chosen c JOIN public.reporting_charge_payment_health_v1 h USING(borrower_id) CROSS JOIN bounds b WHERE b.valid AND h.due_date BETWEEN b.starts AND b.ends)`;
 const measures=`count(*) FILTER(WHERE history_eligible AND on_time) AS "Paid on time",count(*) FILTER(WHERE history_eligible AND NOT on_time AND NOT is_overdue) AS "Paid late",count(*) FILTER(WHERE history_eligible AND NOT on_time AND is_overdue) AS "Still overdue"`;
 const query=q=>({database:2,type:'native',native:{query:q,'template-tags':tags}});
 const metrics=['Paid on time','Paid late','Still overdue'];
 return [
  {name:'Payment punctuality over time · due month',description,display:'bar',dataset_query:query(base+` SELECT date_trunc('month',due_date)::date AS "Due month",${measures} FROM facts WHERE history_eligible GROUP BY 1 ORDER BY 1`),visualization_settings:{...c.visualization_settings,'graph.metrics':metrics,'graph.colors':['#2E9D67','#E6A23C','#D9534F'],'graph.y_axis.title_text':'Obligations','column_settings':Object.fromEntries(metrics.map(n=>[JSON.stringify(['name',n]),{number_style:'decimal',decimals:0}]))}},
  {name:'Payment punctuality summary · selected due dates',description,display:'table',dataset_query:query(base+` SELECT CASE WHEN count(*) FILTER(WHERE history_eligible)>0 THEN count(*) FILTER(WHERE history_eligible AND on_time)::numeric/count(*) FILTER(WHERE history_eligible) END AS "On-time rate",count(*) FILTER(WHERE history_eligible) AS "Assessed obligations",${measures},count(*) FILTER(WHERE NOT history_eligible OR on_time IS NULL) AS "Excluded / unavailable" FROM facts HAVING EXISTS(SELECT 1 FROM chosen CROSS JOIN bounds WHERE valid)`),visualization_settings:{'table.pivot':false,'column_settings':{'["name","On-time rate"]':{number_style:'percent',decimals:1}}}}
 ];
}
if(process.argv.includes('--prepare')){
 await assertSource();assert(!fs.existsSync(priv+'/before.json'),'Baseline already exists');
 const [d,c]=await Promise.all([api('GET','dashboard/3'),api('GET','card/304')]);
 assert(d.dashcards.some(x=>x.card_id===304&&x.dashboard_tab_id===105));
 save('before',{d,c},priv);save('plan',{dashboard:3,tab:105,questions:plans(c),startingCommit:process.env.PUNCTUALITY_START_COMMIT});
 for(const p of plans(c)){const r=await api('POST','dataset',p.dataset_query);assert.equal(r.status,'completed');assert.equal(r.data.rows.length,0,'Empty borrower must not expose totals');}
 console.log('Prepared and preflighted; empty borrower returns no data');
}
if(process.argv.includes('--publish')){
 await assertSource();const {d,c}=read('before'),live=await api('GET','dashboard/3'),card=await api('GET','card/304');
 assert.deepEqual(shape(live),shape(d));assert.deepEqual(live.tabs,d.tabs);assert.deepEqual(live.parameters,d.parameters);assert.deepEqual(card.dataset_query,c.dataset_query);assert.deepEqual(card.visualization_settings,c.visualization_settings);
 const backup=await api('POST','dashboard/3/copy',{name:'R040 recovery - before borrower punctuality',collection_id:5});save('state',{backupDashboard:backup.id});
 const [chart,summary]=plans(c);
 const added=await api('POST','card',{...summary,collection_id:c.collection_id});save('state',{backupDashboard:backup.id,summary:added.id});
 await api('PUT','card/304',chart);
 const original=d.dashcards.find(x=>x.card_id===304&&x.dashboard_tab_id===105);
 const placements=d.dashcards.map(x=>x.dashboard_tab_id===105&&x.row>=original.row?{...x,row:x.row+4}:x);
 placements.push({id:-40041,card_id:added.id,dashboard_tab_id:105,row:original.row,col:0,size_x:24,size_y:4,series:[],visualization_settings:{},parameter_mappings:original.parameter_mappings.map(m=>({...m,card_id:added.id}))});
 await api('PUT','dashboard/3/cards',{tabs:d.tabs,cards:placements});console.log(`Saved punctuality chart and summary ${added.id}; recovery ${backup.id}`);
}
if(process.argv.includes('--verify')){
 await assertSource();const {d,c}=read('before'),state=read('state',out),live=await api('GET','dashboard/3');
 assert.deepEqual(live.tabs,d.tabs);assert.deepEqual(live.parameters,d.parameters);
 const expected={dashcards:d.dashcards.map(x=>x.dashboard_tab_id===105&&x.row>=45?{...x,row:x.row+4}:x)};
 assert.deepEqual(shape({dashcards:live.dashcards.filter(x=>x.card_id!==state.summary)}),shape(expected));
 const questions=[];
 for(const [i,id] of [304,state.summary].entries()){
  const q=await api('GET',`card/${id}`),p=plans(c)[i];assert.equal(sql(q),p.dataset_query.native.query);assert.deepEqual(q.visualization_settings,p.visualization_settings);
  questions.push({id,name:q.name,description:q.description,display:q.display,dataset_query:q.dataset_query,visualization_settings:q.visualization_settings});
 }
 const source=await api('POST','dataset',{database:2,type:'native',native:{query:`SELECT borrower_id FROM public.reporting_charge_payment_health_v1 WHERE history_eligible GROUP BY 1 ORDER BY count(*) DESC LIMIT 2`,'template-tags':{}}});assert.equal(source.status,'completed');
 const checks=[];
 for(const [id] of source.data.rows){
  for(const range of ['2026-01-01~2026-09-26','2026-09-01~2026-09-10']){
   const results=[];
   for(const card of [304,state.summary]){const p=live.dashcards.find(x=>x.card_id===card&&x.dashboard_tab_id===105);const r=await api('POST',`dashboard/3/dashcard/${p.id}/card/${card}/query`,{parameters:[{id:'bd-borrower',type:'string/=',value:[id]},{id:'bd-period',type:'date/all-options',value:range}]});assert.equal(r.status,'completed');results.push(r.data.rows);}
   const sums=[0,0,0];for(const row of results[0])for(let j=0;j<3;j++)sums[j]+=Number(row[j+1]);
   const s=results[1][0];assert(s);assert.deepEqual(s.slice(2,5).map(Number),sums);assert.equal(Number(s[1]),sums.reduce((a,b)=>a+b,0));if(Number(s[1])>0)assert(Math.abs(Number(s[0])-sums[0]/Number(s[1]))<1e-9);else assert.equal(s[0],null);
   checks.push({selectedBorrower:true,range,monthlySummaryReconciled:true});
  }
 }
 for(const card of [304,state.summary]){const p=live.dashcards.find(x=>x.card_id===card&&x.dashboard_tab_id===105);const r=await api('POST',`dashboard/3/dashcard/${p.id}/card/${card}/query`,{parameters:[]});assert.equal(r.status,'completed');assert.equal(r.data.rows.length,0);}
 save('saved',{dashboard:3,tab:105,questions,layout:shape(live).filter(x=>x.dashboard_tab_id===105)});save('verification',{passed:true,checks,clearedBorrowerReturnsNoData:true,unrelatedLayoutAndFiltersPreserved:true,backupDashboard:state.backupDashboard});console.log('Saved definitions, two borrowers/two periods, chart-summary reconciliation and empty selection verified');
}
