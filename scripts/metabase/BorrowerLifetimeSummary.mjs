// R050: date-independent borrower lifetime cards and last-seven charge lights.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {api,assertSource,root} from './ReportingApi.mjs';
const out=root+'/outputs/r050-borrower-lifetime',priv='C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/r050-borrower-lifetime';
fs.mkdirSync(out,{recursive:true});fs.mkdirSync(priv,{recursive:true});
const save=(n,x,dir=out)=>fs.writeFileSync(`${dir}/${n}.json`,JSON.stringify(x,null,2)+'\n');
const read=(n,dir=priv)=>JSON.parse(fs.readFileSync(`${dir}/${n}.json`,'utf8'));
const native=query=>({database:2,type:'native',native:{query,'template-tags':{borrower_id:{id:'bp-borrower',name:'borrower_id','display-name':'Borrower',type:'text'}}}});
const chosen=`WITH chosen AS (SELECT * FROM public.reporting_borrower_directory_v1 WHERE borrower_id= [[{{borrower_id}} --]] '__select_borrower__'\n)`;
const base=chosen+`, totals AS (SELECT b."Total Outstanding Principal" principal,b."Active Loan Interest Earned" interest,b."Projected Interest Coverage Date" coverage,
 z.principal closed_principal,z.interest closed_interest FROM chosen c JOIN public.olap_borrowers_analytics b ON b."Row ID"=c.borrower_id
 CROSS JOIN LATERAL (SELECT CASE WHEN count(*)=0 THEN 0 WHEN bool_and(original_principal IS NOT NULL) THEN sum(original_principal) END principal,
 CASE WHEN count(*)=0 THEN 0 WHEN bool_and(interest_received IS NOT NULL) THEN sum(interest_received) END interest
 FROM public.reporting_borrower_loan_facts_v1 l WHERE l.borrower_id=c.borrower_id AND l.loan_status='Closed') z)`;
const lights=chosen+`, days AS (SELECT DISTINCT h.due_date
 FROM chosen c JOIN public.reporting_charge_payment_health_v1 h USING(borrower_id)
 WHERE h.history_eligible ORDER BY h.due_date DESC LIMIT 7), daily AS (
 SELECT h.due_date,count(*)::integer charges,
 count(*) FILTER (WHERE h.is_overdue)::integer overdue,
 count(*) FILTER (WHERE NOT h.is_overdue AND h.on_time)::integer on_time,
 count(*) FILTER (WHERE NOT h.is_overdue AND NOT h.on_time)::integer paid_late,
 sum(h.principal_due) principal_due,sum(h.interest_due) interest_due,sum(h.remaining_current) remaining
 FROM chosen c JOIN public.reporting_charge_payment_health_v1 h USING(borrower_id)
 JOIN days USING(due_date) WHERE h.history_eligible GROUP BY h.due_date)
 SELECT to_char(days.due_date,'DD Mon YY') AS "Charge day",1 AS "Light",1 AS "Size",
 CASE WHEN d.overdue>0 THEN 'Overdue'
 WHEN d.paid_late>0 THEN 'Paid late' ELSE 'Paid on time' END AS "Status",
 days.due_date AS "Charge date",coalesce(d.charges,0) AS "Charges",
 coalesce(d.on_time,0) AS "Paid on time",coalesce(d.paid_late,0) AS "Paid late",coalesce(d.overdue,0) AS "Overdue charges",
 coalesce(d.principal_due,0) AS "Principal due ฿",coalesce(d.interest_due,0) AS "Interest due ฿",
 coalesce(d.remaining,0) AS "Remaining ฿"
 FROM days JOIN daily d USING(due_date) ORDER BY days.due_date`;
const metricDefs=[
 ['active-principal','Total outstanding principal ฿','principal','Outstanding ฿','amount'],
 ['active-interest','Active loan interest earned ฿','interest','Interest earned ฿','amount'],
 ['active-profit','Profit after principal coverage ฿','interest-principal','After coverage ฿','amount'],
 ['active-return','Return on active principal','CASE WHEN principal>0 THEN interest/principal END','Return %','percent'],
 ['coverage-date','Projected interest coverage date','coverage','Coverage date','date'],
 ['closed-principal','Closed loan original principal ฿','closed_principal','Original principal ฿','amount'],
 ['closed-interest','Closed loan interest earned ฿','closed_interest','Interest earned ฿','amount'],
 ['closed-return','Return on closed loans','CASE WHEN closed_principal>0 THEN closed_interest/closed_principal END','Return on closed loans','percent']
];
function plans(){
 const questions=metricDefs.map(([key,name,expr,title,type])=>({key,name,display:'scalar',description:'Borrower lifetime/current loan groups; ignores activity dates. Active return = lifetime active-loan interest / current outstanding principal. Closed totals use only loans whose current status is Closed, including defaulted closures. Interest is gross signed receipts. Coverage date is the existing constant-daily-interest estimate; when already covered it displays the current reporting date, not a historical crossing date.',dataset_query:native(base+` SELECT ${type==='percent'?`coalesce(to_char((${expr})*100,'FM999999990')||'%','—')`:type==='date'?`coalesce(to_char(${expr},'DD Mon YYYY'),'Not applicable')`:expr} AS "${name}" FROM totals`),visualization_settings:{'scalar.field':name,column_settings:{[JSON.stringify(['name',name])]:type==='date'?{date_style:'D MMM, YYYY'}:{number_style:type==='percent'?'percent':'decimal',decimals:0,number_separators:'.,',compact:false}}},title}));
 questions.unshift({key:'charge-lights',name:'Most recent seven charge dates · oldest → newest',display:'scatter',description:'One light for each of the latest seven distinct eligible charge due dates before today; gaps in the calendar are skipped. All eligible charges on a date are combined. Red if any remains overdue; otherwise orange if any was paid late; otherwise green if all were on time. Fewer than seven dates show fewer lights. Today/future, invalid, zero and default-accounting obligations excluded. Hover for the date’s charge counts and amounts. No activity-date mapping.',dataset_query:native(lights),visualization_settings:{'graph.dimensions':['Charge day','Status'],'graph.metrics':['Light'],'scatter.bubble':'Size','graph.show_legend':true,'graph.show_values':false,'graph.x_axis.axis_enabled':true,'graph.x_axis.labels_enabled':true,'graph.x_axis.title_text':'Charge date','graph.y_axis.axis_enabled':false,'graph.y_axis.labels_enabled':false,'graph.x_axis.scale':'ordinal','graph.y_axis.auto_range':false,'graph.y_axis.min':0,'graph.y_axis.max':2,'graph.y_axis.auto_split':false,'graph.series_order':null,'graph.colors':['#16A34A','#F59E0B','#DC2626'],series_settings:Object.fromEntries([['Paid on time','#16A34A'],['Paid late','#F59E0B'],['Overdue','#DC2626']].map(([n,color])=>[n,{color}])),'graph.tooltip_columns':['Status','Charge date','Charges','Paid on time','Paid late','Overdue charges','Principal due ฿','Interest due ฿','Remaining ฿'].map(n=>JSON.stringify(['name',n]))}});
 return questions;
}
const shape=d=>d.dashcards.map(({id,card_id,dashboard_tab_id,row,col,size_x,size_y,parameter_mappings,visualization_settings,series})=>({id,card_id,dashboard_tab_id,row,col,size_x,size_y,parameter_mappings,visualization_settings,series})).sort((a,b)=>a.id-b.id);
const note=(id,row,text,size_y=2)=>({id,card_id:null,dashboard_tab_id:105,row,col:0,size_x:24,size_y,series:[],parameter_mappings:[],visualization_settings:{text,virtual_card:{display:'text',visualization_settings:{},dataset_query:{},archived:false}}});
function additions(q){
 const card=(key,row,col,size_x,size_y)=>{const c=q.find(x=>x.key===key);return {id:-50500-q.indexOf(c),card_id:c.id,dashboard_tab_id:105,row,col,size_x,size_y,series:[],visualization_settings:c.title?{'card.title':c.title}:{},parameter_mappings:[{parameter_id:'bd-borrower',card_id:c.id,target:['variable',['template-tag','borrower_id']]}]};};
 return [note(-50520,17,'### Active loans · lifetime receipts / current principal'),...metricDefs.slice(0,5).map(([key],i)=>card(key,19,[0,5,10,15,19][i],[5,5,5,4,5][i],4)),note(-50521,23,'### Closed loans · lifetime totals for genuinely closed loans'),...metricDefs.slice(5).map(([key],i)=>card(key,25,i*8,8,4)),note(-50522,29,'### Most recent seven charge dates · oldest → newest\nOne light combines all eligible charges due on that date; calendar gaps are skipped. Red = any still overdue · Orange = none overdue but some paid late · Green = all paid on time. Today/future excluded. Hover for daily counts and amounts.',3),card('charge-lights',32,0,24,6),note(-50523,38,'Lifetime figures ignore activity dates. Interest is gross receipts, before expenses. Active return uses **current outstanding principal**, not original lending. Coverage assumes the current daily interest continues; already covered shows today, not the historical coverage date. Closed return uses original principal from closed loans only.',3)];
}
async function data(q,bid){const r=await api('POST','dataset',{...q,parameters:bid?[{type:'category',target:['variable',['template-tag','borrower_id']],value:bid}]:[]});assert.equal(r.status,'completed',r.error);assert(!r.data.rows_truncated);return r.data;}
if(process.argv.includes('--prepare')){
 await assertSource();assert(!fs.existsSync(priv+'/before.json'));const d=await api('GET','dashboard/3');assert(d.tabs.some(t=>t.id===105&&t.name==='8 · Borrower Detail'));save('before',d,priv);
 const ps=plans();for(const p of ps)assert.equal((await data(p.dataset_query)).rows.length,0);
 const sample=await data(native("SELECT borrower_id FROM public.reporting_borrower_directory_v1 WHERE active_loans>0 ORDER BY loan_count DESC LIMIT 2"));
 for(const [bid] of sample.rows)for(const p of ps){const r=await data(p.dataset_query,bid);assert.equal(r.rows.length,p.key==='charge-lights'?7:1);}
 save('plan',{dashboard:3,tab:105,questions:ps,insertAt:17,shiftRows:24,confirmed:'Latest seven distinct eligible due dates before today; genuine closed-loan cohort'});console.log('Nine new queries tested for two borrowers and empty selection');
}
if(process.argv.includes('--publish')){
 await assertSource();const before=read('before'),live=await api('GET','dashboard/3');assert.deepEqual(shape(live),shape(before));assert.deepEqual(live.tabs,before.tabs);assert.deepEqual(live.parameters,before.parameters);
 const backup=await api('POST','dashboard/3/copy',{name:'R050 recovery - before borrower lifetime summary',collection_id:5});const state={backupDashboard:backup.id,questions:[]};save('state',state);
 for(const {key,title,...p} of read('plan',out).questions){const c=await api('POST','card',{...p,collection_id:5});state.questions.push({key,title,id:c.id});save('state',state);}
 const cards=before.dashcards.map(c=>c.dashboard_tab_id===105&&c.row>=17?{...c,row:c.row+24}:c).concat(additions(state.questions));
 await api('PUT','dashboard/3/cards',{tabs:before.tabs,cards});console.log('Lifetime summary published; recovery dashboard '+backup.id);
}
if(process.argv.includes('--refine')){
 await assertSource();const state=read('state',out),ps=plans(),live=await api('GET','dashboard/3');save('before-refine',{d:live,cards:await Promise.all(state.questions.map(q=>api('GET','card/'+q.id)))},priv);
 for(const p of ps){const {key,title,...definition}=p;await data(p.dataset_query);const q=state.questions.find(x=>x.key===key);await api('PUT','card/'+q.id,definition);q.title=title;}
 const cards=live.dashcards.map(c=>{const q=state.questions.find(q=>q.id===c.card_id);return q?.title?{...c,visualization_settings:{...c.visualization_settings,'card.title':q.title}}:c;});
 await api('PUT','dashboard/3/cards',{tabs:live.tabs,cards});save('state',state);save('plan',{dashboard:3,tab:105,questions:ps,insertAt:17,shiftRows:24,confirmed:'Latest seven distinct eligible due dates before today; genuine closed-loan cohort'});console.log('Refined card labels, unavailable display and evenly spaced lights');
}
if(process.argv.includes('--whole-return')){
 await assertSource();const state=read('state',out),planned=plans().filter(p=>p.key==='active-return'||p.key==='closed-return');
 const current=await Promise.all(planned.map(async p=>({key:p.key,card:await api('GET','card/'+state.questions.find(q=>q.key===p.key).id)})));
 for(const {key,card} of current){const prior=read('saved',out).questions.find(q=>q.key===key);assert.equal(card.id,prior.id);assert.deepEqual(card.dataset_query,prior.dataset_query);assert.deepEqual(card.visualization_settings,prior.visualization_settings);}
 save('before-whole-return',{cards:current},priv);
 for(const p of planned){const {key,title,...definition}=p,q=current.find(x=>x.key===key).card;await api('PUT','card/'+q.id,definition);}
 save('plan',{dashboard:3,tab:105,questions:plans(),insertAt:17,shiftRows:24,confirmed:'Latest seven distinct eligible due dates before today; genuine closed-loan cohort'});console.log('Both lifetime return cards now show whole percentages');
}
if(process.argv.includes('--charge-days')){
 await assertSource();const card=await api('GET','card/369'),dashboard=await api('GET','dashboard/3'),prior=read('plan',out).questions[0],planned=plans()[0];
 assert.equal(card.dataset_query.stages[0].native,prior.dataset_query.native.query);
 const note=dashboard.dashcards.find(c=>c.dashboard_tab_id===105&&c.card_id===null&&c.visualization_settings?.text?.startsWith('### Last seven completed days'));
 assert(note);assert(dashboard.dashcards.some(c=>c.card_id===card.id&&c.dashboard_tab_id===105));
 const sample=await data(native("SELECT borrower_id FROM public.reporting_borrower_directory_v1 WHERE active_loans>0 ORDER BY loan_count DESC LIMIT 2"));
 for(const [bid] of sample.rows){const rows=(await data(planned.dataset_query,bid)).rows;assert(rows.length<=7);assert(rows.length>0);}
 save('before-charge-days',{dashboard,card},priv);
 const backup=await api('POST','dashboard/3/copy',{name:'R050 recovery - before distinct charge dates',collection_id:5});
 const {key,title,...definition}=planned;await api('PUT','card/'+card.id,definition);
 const noteText='### Most recent seven charge dates · oldest → newest\nOne light combines all eligible charges due on that date; calendar gaps are skipped. Red = any still overdue · Orange = none overdue but some paid late · Green = all paid on time. Today/future excluded. Hover for daily counts and amounts.';
 const cards=dashboard.dashcards.map(c=>c.id===note.id?{...c,visualization_settings:{...c.visualization_settings,text:noteText}}:c);
 await api('PUT','dashboard/3/cards',{tabs:dashboard.tabs,cards});
 save('charge-day-recovery',{dashboard:backup.id,card:card.id});save('plan',{dashboard:3,tab:105,questions:plans(),insertAt:17,shiftRows:24,confirmed:'Latest seven distinct eligible due dates; aggregate all eligible charges on each date'});
 console.log('Distinct charge-day lights published; recovery dashboard '+backup.id);
}
if(process.argv.includes('--verify')){
 await assertSource();const before=read('before'),state=read('state',out),live=await api('GET','dashboard/3');
 assert.deepEqual(live.tabs,before.tabs);assert.deepEqual(live.parameters,before.parameters);
 const old=new Set(before.dashcards.map(c=>c.id));assert.deepEqual(shape({dashcards:live.dashcards.filter(c=>old.has(c.id))}),shape({dashcards:before.dashcards.map(c=>c.dashboard_tab_id===105&&c.row>=17?{...c,row:c.row+24}:c)}));
 const added=live.dashcards.filter(c=>!old.has(c.id));assert.equal(added.length,13);assert(added.every(c=>c.parameter_mappings.every(m=>m.parameter_id==='bd-borrower')));
 const sample=await data(native('SELECT borrower_id FROM public.reporting_borrower_directory_v1 WHERE active_loans>0 ORDER BY loan_count DESC LIMIT 2'));const saved=[];
 for(const p of state.questions){const c=await api('GET','card/'+p.id);const place=added.find(x=>x.card_id===p.id);
  for(const [bid] of sample.rows){const results=[];for(const period of ['2026-09-01~2026-09-10','2026-08-01~2026-08-31']){const r=await api('POST',`dashboard/3/dashcard/${place.id}/card/${c.id}/query`,{parameters:[{id:'bd-borrower',type:'string/=',value:[bid]},{id:'bd-period',type:'date/all-options',value:period}]});assert.equal(r.status,'completed');results.push(r.data.rows);}assert.deepEqual(results[0],results[1]);}
  assert.equal((await data(c.dataset_query)).rows.length,0);saved.push({key:p.key,id:c.id,name:c.name,description:c.description,display:c.display,dataset_query:c.dataset_query,visualization_settings:c.visualization_settings});
 }
 save('saved',{questions:saved,placements:shape({dashcards:added})});save('verification',{passed:true,newQuestions:9,newPlacements:13,twoBorrowersTwoPeriodsIdentical:true,emptyBorrowerReturnsNoRows:true,unaffectedPlacementsPreserved:true,backupDashboard:state.backupDashboard});console.log('Saved layout, two-borrower date independence and empty selection verified');
}
if(process.argv.includes('--reconcile')){
 await assertSource();const ps=plans(),sample=await data(native("SELECT borrower_id FROM public.reporting_borrower_directory_v1 WHERE loan_count>0 ORDER BY active_loans DESC,loan_count DESC LIMIT 3"));
 let checkedLights=0,checkedMetrics=0;
 for(const [bid] of sample.rows){
  const ref=await data(native(chosen+' SELECT l.original_principal,l.outstanding_principal,l.interest_received,l.is_active,l.loan_status FROM chosen c JOIN public.reporting_borrower_loan_facts_v1 l USING(borrower_id)'),bid);
  const sum=(ix,pred)=>ref.rows.filter(pred).reduce((s,r)=>s+Number(r[ix]),0),all=()=>true,active=r=>r[3]===true,closed=r=>r[4]==='Closed';
  const principal=sum(1,all),interest=sum(2,active),cp=sum(0,closed),ci=sum(2,closed);
  const expected={'active-principal':principal,'active-interest':interest,'active-profit':interest-principal,'active-return':principal>0?(interest/principal*100).toFixed(0)+'%':'—','closed-principal':cp,'closed-interest':ci,'closed-return':cp>0?(ci/cp*100).toFixed(0)+'%':'—'};
  for(const [key,value] of Object.entries(expected)){const got=(await data(ps.find(p=>p.key===key).dataset_query,bid)).rows[0][0];if(typeof value==='number')assert(Math.abs(Number(got)-value)<0.00001,key);else assert.equal(got,value,key);checkedMetrics++;}
  const source=await data(native(chosen+` SELECT h.due_date,h.is_overdue,h.on_time,h.principal_due,h.interest_due,h.remaining_current,to_char(h.due_date,'DD Mon YY') FROM chosen c JOIN public.reporting_charge_payment_health_v1 h USING(borrower_id) WHERE h.history_eligible AND h.due_date IN (SELECT DISTINCT h2.due_date FROM chosen c2 JOIN public.reporting_charge_payment_health_v1 h2 USING(borrower_id) WHERE h2.history_eligible ORDER BY h2.due_date DESC LIMIT 7)`),bid);
  const plotted=(await data(ps[0].dataset_query,bid)).rows;assert.equal(plotted.length,new Set(source.rows.map(r=>r[0])).size);assert(plotted.length<=7);
  for(let i=0;i<plotted.length;i++){const p=plotted[i],daily=source.rows.filter(r=>r[0]===p[4]),overdue=daily.filter(r=>r[1]===true),onTime=daily.filter(r=>!r[1]&&r[2]===true),late=daily.filter(r=>!r[1]&&!r[2]);
   assert(daily.length>0);assert.equal(p[0],daily[0][6]);if(i)assert(p[4]>plotted[i-1][4]);
   assert(daily.length>0);assert.equal(p[3],overdue.length?'Overdue':late.length?'Paid late':'Paid on time');
   assert.deepEqual(p.slice(5,9).map(Number),[daily.length,onTime.length,late.length,overdue.length]);
   for(let j=0;j<3;j++)assert(Math.abs(Number(p[9+j])-daily.reduce((s,r)=>s+Number(r[3+j]),0))<0.00001);
   checkedLights++;}
 }
 save('reconciliation',{passed:true,borrowers:sample.rows.length,metricComparisons:checkedMetrics,chargeDayComparisons:checkedLights,source:'Existing loan facts independently summed; raw charge health records independently grouped over latest seven distinct eligible due dates; no financial rows retained'});console.log('Lifetime cards reconciled to loan facts; lights matched latest seven charged days');
}
