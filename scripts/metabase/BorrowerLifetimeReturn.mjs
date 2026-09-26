// R038: additive shared-model fields, replacement metric on existing card314.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {api,assertSource,root} from './ReportingApi.mjs';
import {specs,modelSql} from './BorrowerContributionCharts.mjs';
const out=root+'/outputs/r038-lifetime-return';fs.mkdirSync(out,{recursive:true});
const priv='C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/r038-lifetime-return';
const before=JSON.parse(fs.readFileSync(priv+'/before.json'));
const save=(n,x)=>fs.writeFileSync(`${out}/${n}.json`,JSON.stringify(x,null,2)+'\n');
const query=q=>({database:2,type:'native',native:{query:q,'template-tags':{}}});
const sql=c=>c.dataset_query.native?.query??c.dataset_query.stages[0].native;
async function run(q){const r=await api('POST','dataset',query(q));if(r.status!=='completed'){fs.writeFileSync(priv+'/error.json',JSON.stringify(r));throw Error('Query failed; private diagnostic');}return r;}
if(process.argv.includes('--test-r038')){
 await assertSource();
 const old=sql(before.cards.find(c=>c.id===310));
 const parity=await run(`WITH old AS (${old}),new AS (${modelSql}) SELECT NOT EXISTS(SELECT 1 FROM old o FULL JOIN new n USING("Borrower ID") WHERE to_jsonb(o) IS DISTINCT FROM (to_jsonb(n)-'Total principal lent'-'Lifetime interest received'-'Lifetime interest return'))`);
 assert.equal(parity.data.rows[0][0],true,'Existing model fields changed');
 const check=await run(`WITH model AS (${modelSql}), lending AS (SELECT "Ref Borrowers" id,sum("Principal Amount"::numeric) principal FROM public.olap_loans_analytics WHERE "Loan Date"<=public.olap_reporting_date() GROUP BY 1), receipts AS (SELECT l."Ref Borrowers" id,sum(r."Interest Paid"::numeric) interest FROM public.olap_repayments_analytics r JOIN public.olap_loans_analytics l ON l."Row ID"=r."Ref Loans" WHERE r."Payment Date"<=public.olap_reporting_date() GROUP BY 1) SELECT count(*),bool_and(m."Total principal lent"=l.principal AND m."Lifetime interest received"=coalesce(r.interest,0) AND (m."Lifetime interest return" IS NOT DISTINCT FROM coalesce(r.interest,0)/nullif(l.principal,0))) FROM model m JOIN lending l ON l.id=m."Borrower ID" LEFT JOIN receipts r ON r.id=m."Borrower ID"`);
 assert.equal(check.data.rows[0][1],true,'Independent lifetime totals');
 const sample=await run(`SELECT "Lifetime interest return"=1.6 FROM (${modelSql}) m WHERE "Borrower"='Orgrand'`);assert.equal(sample.data.rows[0][0],true,'Orgrand reviewed160%');
 save('data-verification',{passed:true,borrowers:check.data.rows[0][0],existingModelFieldsUnchanged:true,independentLoanAndReceiptAggregation:true,orgrandReviewed160Percent:true,financialRowsPublished:false});
 save('plan',{modelSql,questions:specs(310).filter(s=>['coverage','context'].includes(s.key))});console.log('Lifetime totals reconcile; prior model fields unchanged; Orgrand160% verified');
}
if(process.argv.includes('--apply-r038')){
 await assertSource();const d=await api('GET','dashboard/3');
 assert.deepEqual(d.dashcards.map(c=>[c.id,c.card_id,c.row,c.col,c.size_x,c.size_y,c.parameter_mappings,c.visualization_settings]),before.dashboard.dashcards.map(c=>[c.id,c.card_id,c.row,c.col,c.size_x,c.size_y,c.parameter_mappings,c.visualization_settings]));
 for(const c of before.cards)assert.deepEqual((await api('GET',`card/${c.id}`)).dataset_query,c.dataset_query,'Affected card drift');
 const b=await api('POST','dashboard/3/copy',{name:'R038 recovery - before lifetime principal return',collection_id:5});save('state',{backupDashboard:b.id,model:310,questions:[314,315]});
 await api('PUT','card/310',{dataset_query:query(modelSql),description:'Borrower lifetime economics. R038 adds total original principal lent and lifetime interest received through today, including active and closed loans. Existing R037 fields preserved.'});
 for(const s of specs(310).filter(s=>['coverage','context'].includes(s.key))){const {key,...body}=s;await api('PUT',`card/${key==='coverage'?314:315}`,{...body,description:'R038. Lifetime interest return = all signed interest received / total original principal lent, active and closed loans, through current Bangkok date. Repeated lending counts each loan once. Gross interest before expenses/losses. Activity slicer ignored; population applies.'});}
 const cards=d.dashcards.map(c=>{const text=c.visualization_settings?.virtual_card?.visualization_settings?.text;if(c.dashboard_tab_id!==104||!text?.startsWith('**Overall charts'))return c;return {...c,visualization_settings:{...c.visualization_settings,virtual_card:{...c.visualization_settings.virtual_card,visualization_settings:{text:text.replace('Coverage = interest received on currently active loans ÷ their current outstanding principal.','Lifetime interest return = all interest received ÷ total original principal lent across active and closed loans, through today. Each repeat loan counts again; repayments do not reduce the denominator.')}}}};});
 await api('PUT','dashboard/3/cards',{tabs:d.tabs,cards});console.log('Updated model310, chart314, context315 and explanatory note');
}
if(process.argv.includes('--verify-r038')){
 const d=await api('GET','dashboard/3');assert.deepEqual(d.tabs,before.dashboard.tabs);assert.deepEqual(d.parameters,before.dashboard.parameters);
 const shape=c=>[c.id,c.card_id,c.row,c.col,c.size_x,c.size_y,c.parameter_mappings];assert.deepEqual(d.dashcards.map(shape),before.dashboard.dashcards.map(shape));
 const dc=d.dashcards.find(c=>c.card_id===314&&c.dashboard_tab_id===104);assert.deepEqual(dc.parameter_mappings.map(p=>p.parameter_id),['bp-population']);
 const endpoint=`dashboard/3/dashcard/${dc.id}/card/314/query`;
 const a=await api('POST',endpoint,{parameters:[]}),b=await api('POST',endpoint,{parameters:[{id:'bp-period',type:'date/all-options',value:'2026-01-01~2026-01-31'}]});assert.equal(a.status,'completed');assert.equal(b.status,'completed');assert.deepEqual(a.data.rows,b.data.rows);
 const qs=[];for(const id of [310,314,315]){const c=await api('GET',`card/${id}`);qs.push({id,name:c.name,type:c.type,description:c.description,display:c.display,dataset_query:c.dataset_query,visualization_settings:c.visualization_settings,result_metadata:c.result_metadata?.map(({fingerprint,...x})=>x)});}
 save('saved',{questions:qs,layout:d.dashcards.filter(c=>c.dashboard_tab_id===104).map(({card,...x})=>x)});
 save('verification',{passed:true,layoutAndMappingsPreserved:true,dateInvariant:true,rows:a.data.rows.length,questions:[310,314,315]});console.log('Saved report verified; date invariant, layout/filter mappings preserved');
}
