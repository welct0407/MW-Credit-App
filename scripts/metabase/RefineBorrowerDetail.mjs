// R041 presentation-only: useful loan labels, grouped principal bars, charges before repayments.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {api,assertSource,root} from './ReportingApi.mjs';
const out=root+'/outputs/r041-borrower-detail';
const priv='C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/r041-borrower-detail';
fs.mkdirSync(out,{recursive:true});fs.mkdirSync(priv,{recursive:true});
const ids=[290,301,303,305,306,307,308];
const save=(n,v,dir=out)=>fs.writeFileSync(`${dir}/${n}.json`,JSON.stringify(v,null,2)+'\n');
const read=(n,dir=priv)=>JSON.parse(fs.readFileSync(`${dir}/${n}.json`,'utf8'));
const sql=c=>c.dataset_query.stages?.[0]?.native??c.dataset_query.native.query;
const shape=d=>d.dashcards.map(({id,card_id,dashboard_tab_id,row,col,size_x,size_y,parameter_mappings,visualization_settings,series})=>({id,card_id,dashboard_tab_id,row,col,size_x,size_y,parameter_mappings,visualization_settings,series})).sort((a,b)=>a.id-b.id);
const loanKey=`CASE WHEN k."Row ID" IS NULL THEN 'Loan key unavailable' ELSE coalesce(c.borrower_name,'Unknown borrower')||'-'||to_char(k."Principal Amount"::numeric,'FM999,999,999,990.00')||'-'||to_char(k."Loan Date",'DD/MM')||'-'||coalesce(to_char(k."Effective Daily Interest Rate"::numeric*100,'FM999990.00')||'%','Unavailable') END AS "Loan Key"`;
function plan(c){
 let q=sql(c),s=structuredClone(c.visualization_settings);
 if(c.id===301)return {id:c.id,name:c.name,display:'bar',dataset_query:c.dataset_query,visualization_settings:{...s,'stackable.stack_type':null}};
 if(c.id===290){assert(q.includes('borrower_id AS "Borrower ID",'));q=q.replace('borrower_id AS "Borrower ID",','');}
 else {
  const expr=c.id===306?'r."Ref Loans"':c.id>=307?'h.loan_id':'l.loan_id';assert(q.includes(expr+' AS "Loan ID"'));q=q.replace(expr+' AS "Loan ID"',loanKey);
  const base=c.id>=307?'JOIN public.reporting_charge_payment_health_v1 h USING(borrower_id)':'JOIN public.reporting_borrower_loan_facts_v1 l USING(borrower_id)';
  assert.equal(q.split(base).length,2);q=q.replace(base,base+` LEFT JOIN public.olap_loans_analytics k ON k."Row ID"=${c.id>=307?'h.loan_id':'l.loan_id'}`);
  q=q.replace('r."Row ID" AS "Repayment ID",','').replace('h.charge_id AS "Charge ID",','');
  s['table.columns']=s['table.columns'].filter(x=>!['Repayment ID','Charge ID'].includes(x.name)).map(x=>x.name==='Loan ID'?{...x,name:'Loan Key',fieldRef:['field','Loan Key',{'base-type':'type/Text'}]}:x);
 }
 const tags=Object.fromEntries(c.dataset_query.stages[0]['template-tags'].map(t=>[t.name,t.name==='period'?{id:'bp-period',name:'period','display-name':'Activity period',type:'dimension',dimension:['field',82,null],'widget-type':'date/all-options',alias:'d."Date"'}:t]));
 return {id:c.id,name:c.name,display:c.display,dataset_query:{database:2,type:'native',native:{query:q,'template-tags':tags}},visualization_settings:s};
}
const swapped=d=>({dashcards:d.dashcards.map(x=>x.dashboard_tab_id===105&&[306,307].includes(x.card_id)?{...x,row:d.dashcards.find(y=>y.dashboard_tab_id===105&&y.card_id===(x.card_id===306?307:306)).row}:x)});
async function dataset(c,id){const dq=structuredClone(c.dataset_query);dq.parameters=[{id:'bp-borrower',type:'category',target:['variable',['template-tag','borrower_id']],value:id}];const r=await api('POST','dataset',dq);assert.equal(r.status,'completed');assert(!r.data.rows_truncated);return r.data;}
if(process.argv.includes('--prepare')){
 await assertSource();assert(!fs.existsSync(priv+'/before.json'));
 const d=await api('GET','dashboard/3'),cards=await Promise.all(ids.map(id=>api('GET','card/'+id)));
 save('before',{d,cards},priv);const plans=cards.map(plan);save('plan',{dashboard:3,tab:105,questions:plans,swap:[306,307],loanKey:'OLAP label: borrower name-original principal-DD/MM-effective daily interest rate; rate is live, not lifetime achieved rate. IDs remain internal joins only.'});
 for(const p of plans){const r=await api('POST','dataset',p.dataset_query);assert.equal(r.status,'completed');assert.equal(r.data.rows.length,0);}
 console.log('Seven definitions preflighted; cleared borrower returns no data');
}
if(process.argv.includes('--publish')){
 await assertSource();const {d,cards}=read('before'),live=await api('GET','dashboard/3');assert.deepEqual(shape(live),shape(d));assert.deepEqual(live.tabs,d.tabs);assert.deepEqual(live.parameters,d.parameters);
 for(const c of cards){const l=await api('GET','card/'+c.id);assert.deepEqual(l.dataset_query,c.dataset_query);assert.deepEqual(l.visualization_settings,c.visualization_settings);}
 const backup=await api('POST','dashboard/3/copy',{name:'R041 recovery - before Detail presentation refinement',collection_id:5});save('state',{backupDashboard:backup.id});
 for(const c of cards){const {id,...p}=plan(c);await api('PUT','card/'+id,p);}
 await api('PUT','dashboard/3/cards',{tabs:d.tabs,cards:swapped(d).dashcards});console.log('Saved seven cards and swapped charges/repayments; backup '+backup.id);
}
if(process.argv.includes('--verify')){
 await assertSource();const {d,cards}=read('before'),live=await api('GET','dashboard/3');assert.deepEqual(shape(live),shape(swapped(d)));assert.deepEqual(live.tabs,d.tabs);assert.deepEqual(live.parameters,d.parameters);
 const source=await api('POST','dataset',{database:2,type:'native',native:{query:'SELECT borrower_id FROM public.reporting_borrower_directory_v1 WHERE active_loans>0 ORDER BY active_loans DESC LIMIT 2','template-tags':{}}});assert.equal(source.status,'completed');
 const saved=[],checks=[];
 for(const old of cards){const c=await api('GET','card/'+old.id),p=plan(old);assert.equal(sql(c),sql(p));assert.equal(c.display,p.display);assert.deepEqual(c.visualization_settings,p.visualization_settings);
  for(const [id] of source.data.rows){const a=await dataset(old,id),b=await dataset(c,id);assert.equal(a.rows.length,b.rows.length);const excluded=['Loan ID','Borrower ID','Repayment ID','Charge ID'];const common=a.cols.map(x=>x.name).filter(x=>!excluded.includes(x));for(let i=0;i<a.rows.length;i++)for(const n of common)assert.deepEqual(a.rows[i][a.cols.findIndex(x=>x.name===n)],b.rows[i][b.cols.findIndex(x=>x.name===n)],'Non-label data changed');assert(!b.cols.some(x=>excluded.includes(x.name)));if(![290,301].includes(c.id)){const j=b.cols.findIndex(x=>x.name==='Loan Key');assert(j>=0);assert(b.rows.every(r=>r[j]&&!r[j].includes('unavailable')));}}
  saved.push({id:c.id,name:c.name,display:c.display,dataset_query:c.dataset_query,visualization_settings:c.visualization_settings});checks.push({id:c.id,twoBorrowers:true,rowCountAndNonLabelValuesPreserved:true});
 }
 save('saved',{dashboard:3,tab:105,questions:saved,layout:shape(live).filter(x=>x.dashboard_tab_id===105)});save('verification',{passed:true,checks,otherPlacementsAndMappingsUnchanged:true,chargesBeforeRepayments:true,barChart:true});console.log('Seven saved definitions and two-borrower data parity verified; only intended layout swap');
}
