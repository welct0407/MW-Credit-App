// R042: full original receipts, lifetime loan return percentage, interest bars.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {api,assertSource,root} from './ReportingApi.mjs';
const out=root+'/outputs/r042-borrower-payments',priv='C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/r042-borrower-payments';
fs.mkdirSync(out,{recursive:true});fs.mkdirSync(priv,{recursive:true});
const save=(n,x,dir=out)=>fs.writeFileSync(`${dir}/${n}.json`,JSON.stringify(x,null,2)+'\n');
const read=(n,dir=priv)=>JSON.parse(fs.readFileSync(`${dir}/${n}.json`,'utf8'));
const sql=c=>c.dataset_query.stages?.[0]?.native??c.dataset_query.native.query;
const shape=d=>d.dashcards.map(({id,card_id,dashboard_tab_id,row,col,size_x,size_y,parameter_mappings,visualization_settings,series})=>({id,card_id,dashboard_tab_id,row,col,size_x,size_y,parameter_mappings,visualization_settings,series})).sort((a,b)=>a.id-b.id);
const metric='Profit / original principal';
const tags={period:{id:'bp-period',name:'period','display-name':'Payment dates',type:'dimension',dimension:['field',82,null],'widget-type':'date/all-options',alias:'d."Date"'},borrower_id:{id:'bp-borrower',name:'borrower_id','display-name':'Borrower',type:'text'}};
const native=(query,period=true)=>({database:2,type:'native',native:{query,'template-tags':period?tags:{borrower_id:tags.borrower_id}}});
function plans(cards){
 const trend=cards.find(c=>c.id===302),history=cards.find(c=>c.id===305),repayment=cards.find(c=>c.id===306);
 const hsql=sql(history),needle='l.interest_received AS "Interest received ฿",';assert.equal(hsql.split(needle).length,2);
 const hs=structuredClone(history.visualization_settings);const i=hs['table.columns'].findIndex(x=>x.name==='Interest received ฿');assert(i>=0);
 hs['table.columns'].splice(i+1,0,{name:metric,fieldRef:['field',metric,{'base-type':'type/Decimal'}],enabled:true});
 hs.column_settings[JSON.stringify(['name',metric])]={number_style:'percent',decimals:1};
 // Metabase v0.63 table_format.ts evaluates numeric rules in order, first match wins; null matches none.
 hs['table.column_formatting']=[['<',1,'#E57373'],['<=',2,'#F0AD4E'],['>',2,'#66BB6A']].map(([operator,value,color])=>({columns:[metric],type:'single',operator,value,color,highlight_row:false}));
 const prefix=sql(repayment).split(' SELECT r."Payment Date"')[0];assert(prefix!==sql(repayment));
 const loan=alias=>`CASE WHEN ${alias}."Row ID" IS NULL THEN NULL ELSE c.borrower_name||'-'||to_char(${alias}."Principal Amount"::numeric,'FM999,999,999,990.00')||'-'||to_char(${alias}."Loan Date",'DD/MM')||'-'||to_char(${alias}."Effective Daily Interest Rate"::numeric*100,'FM999990.00')||'%' END`;
 const rq=prefix+` SELECT p.payment_date AS "Payment date",p.status AS "Status",p.amount_received AS "Amount received ฿",p.posted_amount AS "Posted amount ฿",p.planned_allocation_amount AS "Planned allocation ฿",p.payment_method AS "Payment method",p.allocation_method AS "Allocation method",p.received_holder AS "Received by",p.received_account AS "Receipt account",p.bank_reference AS "Bank reference",p.notes AS "Notes",p.created_by AS "Created by",p.created_at AS "Created at",p.processed_at AS "Processed at",${loan('tl')} AS "Target Loan Key",p.target_charge_date AS "Target charge due date",${loan('cl')} AS "Target charge Loan Key" FROM chosen c JOIN public.reporting_borrower_payments_v1 p USING(borrower_id) LEFT JOIN public.olap_loans_analytics tl ON tl."Row ID"=p.target_loan_id LEFT JOIN public.olap_loans_analytics cl ON cl."Row ID"=p.target_charge_loan_id CROSS JOIN bounds b WHERE b.valid AND p.payment_date BETWEEN b.starts AND b.ends ORDER BY p.payment_date DESC,p.created_at DESC NULLS LAST,p.payment_id`;
 return [
 {id:302,name:trend.name,display:'bar',dataset_query:trend.dataset_query,visualization_settings:{...trend.visualization_settings,'stackable.stack_type':null}},
 {id:305,name:history.name,display:'table',description:'Lifetime signed interest received / original loan principal. Gross interest before expenses. <100% red; 100–200% inclusive orange; >200% green. Invalid/nonpositive original principal gives no percentage/color. Ignores activity dates.',dataset_query:native(hsql.replace(needle,needle+`CASE WHEN l.original_principal>0 THEN l.interest_received/l.original_principal END AS "${metric}",`),false),visualization_settings:hs},
 {name:'Payments · selected payment dates',display:'table',description:'Original payment receipts, one row per Payments record, including unposted states. All payment details included by owner request. Amount received and posted amount are separate; repayments below are allocation rows. Reference IDs are resolved to readable names/Loan Keys.',dataset_query:native(rq),visualization_settings:{'table.pivot':false,column_settings:Object.fromEntries(['Amount received ฿','Posted amount ฿','Planned allocation ฿'].map(n=>[JSON.stringify(['name',n]),{number_style:'decimal',decimals:0,number_separators:'.,'}]))}}
 ];
}
if(process.argv.includes('--prepare')){
 await assertSource();assert(!fs.existsSync(priv+'/report-before.json'));
 const d=await api('GET','dashboard/3'),cards=await Promise.all([302,305,306].map(id=>api('GET','card/'+id)));save('report-before',{d,cards},priv);save('plan',{dashboard:3,tab:105,questions:plans(cards),insertBefore:306,shiftRows:10});console.log('Report package prepared; receipt query awaits V46 promotion');
}
if(process.argv.includes('--publish')){
 await assertSource();const {d,cards}=read('report-before'),live=await api('GET','dashboard/3');assert.deepEqual(shape(live),shape(d));assert.deepEqual(live.parameters,d.parameters);assert.deepEqual(live.tabs,d.tabs);
 for(const c of cards){const q=await api('GET','card/'+c.id);assert.deepEqual(q.dataset_query,c.dataset_query);assert.deepEqual(q.visualization_settings,c.visualization_settings);}
 const ps=plans(cards);for(const p of ps){const r=await api('POST','dataset',p.dataset_query);assert.equal(r.status,'completed');assert.equal(r.data.rows.length,0);}
 const backup=await api('POST','dashboard/3/copy',{name:'R042 recovery - before payment receipts and loan profit',collection_id:5});save('state',{backupDashboard:backup.id});
 const receipt=await api('POST','card',{...ps[2],collection_id:5});save('state',{backupDashboard:backup.id,payments:receipt.id});
 for(const {id,...p} of ps.slice(0,2))await api('PUT','card/'+id,p);
 const old=d.dashcards.find(x=>x.card_id===306&&x.dashboard_tab_id===105);const placements=d.dashcards.map(x=>x.dashboard_tab_id===105&&x.row>=old.row?{...x,row:x.row+10}:x);
 placements.push({id:-42001,card_id:receipt.id,dashboard_tab_id:105,row:old.row,col:0,size_x:24,size_y:10,series:[],visualization_settings:{},parameter_mappings:old.parameter_mappings.map(m=>({...m,card_id:receipt.id}))});
 await api('PUT','dashboard/3/cards',{tabs:d.tabs,cards:placements});console.log(`Published Payments ${receipt.id}; backup ${backup.id}`);
}
if(process.argv.includes('--verify')){
 await assertSource();const {d,cards}=read('report-before'),state=read('state',out),live=await api('GET','dashboard/3'),ps=plans(cards);
 assert.deepEqual(live.parameters,d.parameters);assert.deepEqual(live.tabs,d.tabs);
 const row=d.dashcards.find(x=>x.card_id===306&&x.dashboard_tab_id===105).row;
 assert.deepEqual(shape({dashcards:live.dashcards.filter(x=>x.card_id!==state.payments)}),shape({dashcards:d.dashcards.map(x=>x.dashboard_tab_id===105&&x.row>=row?{...x,row:x.row+10}:x)}));
 const source=await api('POST','dataset',native('SELECT borrower_id FROM public.reporting_borrower_directory_v1 WHERE active_loans>0 ORDER BY active_loans DESC LIMIT 2',false));assert.equal(source.status,'completed');
 const questions=[],checks=[];
 for(const [i,id] of [302,305,state.payments].entries()){
  const q=await api('GET','card/'+id);assert.equal(sql(q),sql(ps[i]));assert.equal(q.display,ps[i].display);assert.deepEqual(q.visualization_settings,ps[i].visualization_settings);
  const p=live.dashcards.find(x=>x.card_id===id&&x.dashboard_tab_id===105);
  for(const [bid] of source.data.rows){const r=await api('POST',`dashboard/3/dashcard/${p.id}/card/${id}/query`,{parameters:[{id:'bd-borrower',type:'string/=',value:[bid]}]});assert.equal(r.status,'completed');assert(!r.data.rows_truncated);
   if(id===305){const names=r.data.cols.map(c=>c.name);for(const v of r.data.rows){const principal=Number(v[names.indexOf('Original principal ฿')]),interest=v[names.indexOf('Interest received ฿')],pct=v[names.indexOf(metric)];if(principal>0&&interest!==null)assert(Math.abs(Number(pct)-Number(interest)/principal)<1e-9);else assert.equal(pct,null);}}
  }checks.push({id,twoBorrowersLoaded:true,formulaVerified:id===305});questions.push({id,name:q.name,display:q.display,description:q.description,dataset_query:q.dataset_query,visualization_settings:q.visualization_settings});
 }
 const rules=ps[1].visualization_settings['table.column_formatting'];const color=v=>v===null?null:rules.find(r=>r.operator==='<'?v<r.value:r.operator==='<='?v<=r.value:v>r.value)?.color;
 assert.deepEqual([.999,1,2,2.001,null].map(color),['#E57373','#F0AD4E','#F0AD4E','#66BB6A',null]);
 save('saved',{dashboard:3,tab:105,questions,layout:shape(live).filter(x=>x.dashboard_tab_id===105)});save('verification',{passed:true,checks,boundaries100And200Orange:true,nullUncolored:true,existingParametersAndOtherPlacementsPreserved:true});console.log('Saved definitions, two borrowers, loan percentage and exact color boundaries verified');
}
