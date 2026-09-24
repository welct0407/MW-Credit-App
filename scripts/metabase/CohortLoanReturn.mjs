// R019: same-period interest attributed to loans by issuance-week cohort.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {api,assertSource} from './ReportingApi.mjs';
import {common} from './PerformanceReview.mjs';
export const output='outputs/r019-20260924';
export const backup='C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/r019-cohort-return';
fs.mkdirSync(output,{recursive:true});
const save=(name,value)=>fs.writeFileSync(`${output}/${name}.json`,JSON.stringify(value,null,2)+'\n');
const f=(name,type='type/Decimal')=>['field',name,{'base-type':type}];
const tag=id=>({id:'r019-model-'+id,name:'#'+id,'display-name':'Model '+id,type:'card','card-id':id});
export const cohort=`
, issued AS (
 SELECT l."Loan ID",l."Loan Date",l."Principal Amount"
 FROM {{#70}} l JOIN live_days d ON l."Loan Date"=d."Date"
), received AS (
 SELECT p."Loan ID",count(*) payments,count(p."Interest Paid") known_interest,sum(p."Interest Paid") interest
 FROM {{#71}} p JOIN issued l ON l."Loan ID"=p."Loan ID"
 JOIN live_days d ON p."Payment Date"=d."Date"
 GROUP BY p."Loan ID"
), per_loan AS (
 SELECT l.*,CASE WHEN p.payments IS NULL THEN 0 WHEN p.payments=p.known_interest THEN p.interest END interest
 FROM issued l LEFT JOIN received p ON p."Loan ID"=l."Loan ID"
)
SELECT date_trunc('week',"Loan Date")::date AS "Week starting",
 CASE WHEN count(interest)=count(*) AND count("Principal Amount")=count(*)
 THEN sum(interest)/nullif(sum("Principal Amount"),0) END AS "Loan Return",
 count(*) AS "Loans in cohort",sum("Principal Amount") AS "Cohort principal",
 CASE WHEN count(interest)=count(*) THEN sum(interest) END AS "Interest in selected period"
FROM per_loan GROUP BY 1 ORDER BY 1`;
export const spec={name:'Weekly loan-cohort return · live',display:'bar',description:'For loans issued within the selected dates, group by Monday issuance week. Loan Return = interest received from those same loan IDs within the selected dates / original principal of those loans, counted once each. Includes loans with no in-period interest (0); excludes payments from other cohorts/outside the period. Gross interest, not principal repayments or net profit. Live on refresh, including today; future dates excluded. Partial weeks use selected issue dates. 100% means selected-period interest equals original cohort principal.',dataset_query:{database:2,type:'native',native:{query:common+cohort,'template-tags':{performance_period:{id:'r019-cohort-period',name:'performance_period','display-name':'Performance period',type:'dimension',dimension:['field',82,null],'widget-type':'date/all-options',alias:'d."Date"'},'#70':tag(70),'#71':tag(71)}}},visualization_settings:{'graph.dimensions':['Week starting'],'graph.metrics':['Loan Return'],'graph.colors':['#43A047'],'graph.show_legend':false,'graph.show_values':true,'graph.y_axis.auto_split':false,'graph.y_axis.title_text':'Loan-cohort return (%)','graph.x_axis.title_text':'Loan issuance week (Monday)','graph.show_goal':true,'graph.goal_value':1,'graph.goal_label':'Reference · 100%','graph.show_trendline':false,'stackable.stack_type':null,'line.missing':'none',column_settings:{'["name","Loan Return"]':{number_style:'percent',decimals:2,number_separators:'.,'},'["name","Cohort principal"]':{number_style:'decimal',decimals:0},'["name","Interest in selected period"]':{number_style:'decimal',decimals:0}},series_settings:{'Loan Return':{color:'#43A047',axis:'left'}}}};
const shape=c=>Object.fromEntries(['id','card_id','dashboard_tab_id','col','row','size_x','size_y','series','parameter_mappings','visualization_settings'].map(k=>[k,c[k]]));
const before=()=>JSON.parse(fs.readFileSync(backup+'/dashboard.json'));
const note='Loan dates and interest-payment dates both use this filter. Principal is counted once per loan. Live on refresh.';
export function layout(d){return [...d.dashcards.map(c=>{
 if(c.dashboard_tab_id!==18)return c;
 if(c.card_id===233)return {...c,col:0,row:13,size_x:24,size_y:8,parameter_mappings:[{parameter_id:'review-performance',card_id:233,target:['dimension',['template-tag','performance_period']]}]};
 return {...c,...(c.row>=13?{row:c.row+11}:{}),...(c.id===618?{col:0,size_x:24}:{})};
 }),{id:-1,card_id:null,dashboard_tab_id:18,col:0,row:21,size_x:24,size_y:3,series:[],parameter_mappings:[],visualization_settings:{'card.background':false,virtual_card:{display:'text',visualization_settings:{text:note}}}}];}
async function run(route,body){const r=await api('POST',route,body);if(r.status!=='completed'){fs.writeFileSync(backup+'/query-error.json',JSON.stringify(r));throw Error('Query failed; private diagnostic saved');}assert.ok(!r.data.rows_truncated);return r;}
const day=x=>x?.slice(0,10),near=(a,b)=>a===null||b===null?a===b:Math.abs(Number(a)-Number(b))<1e-8;
const monday=s=>{const d=new Date(s+'T12:00:00Z');d.setUTCDate(d.getUTCDate()-(d.getUTCDay()+6)%7);return day(d.toISOString());};
if(process.argv.includes('--preflight')||process.argv.includes('--verify')){
 await assertSource();const checks=[];
 const loanData=await run('dataset',{database:2,type:'query',query:{'source-table':'card__70',fields:[f('Loan ID','type/Text'),f('Loan Date','type/Date'),f('Principal Amount')]}});
 const paymentData=await run('dataset',{database:2,type:'query',query:{'source-table':'card__71',fields:[f('Repayment ID','type/Text'),f('Loan ID','type/Text'),f('Payment Date','type/Date'),f('Interest Paid')]}});
 const loans=loanData.data.rows,payments=paymentData.data.rows;assert.equal(new Set(loans.map(x=>x[0])).size,loans.length);assert.equal(new Set(payments.map(x=>x[0])).size,payments.length);assert.ok(payments.every(p=>loans.some(l=>l[0]===p[1])));checks.push('Unique loan/payment grains and payment-to-loan linkage');
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 const oracle=(start,end)=>{const groups=new Map();for(const l of loans.filter(x=>day(x[1])>=start&&day(x[1])<=end&&day(x[1])<=today)){const w=monday(day(l[1])),g=groups.get(w)??{principal:0,interest:0,n:0,missing:false};const matched=payments.filter(p=>p[1]===l[0]&&day(p[2])>=start&&day(p[2])<=end&&day(p[2])<=today);g.principal+=Number(l[2]);g.n++;g.missing||=l[2]===null||matched.some(p=>p[3]===null);g.interest+=matched.reduce((s,p)=>s+Number(p[3]),0);groups.set(w,g);}return [...groups].sort(([a],[b])=>a.localeCompare(b)).map(([w,g])=>[w,g.missing||g.principal===0?null:g.interest/g.principal,g.n,g.principal,g.missing?null:g.interest]);};
 const earliest=day(loans.map(l=>l[1]).sort()[0]),start30=day(new Date(Date.parse(today+'T12:00:00Z')-30*86400000).toISOString()),yesterday=day(new Date(Date.parse(today+'T12:00:00Z')-86400000).toISOString());
 const cases=[['2026-09-01~2026-09-30','2026-09-01','2026-09-30'],['2026-08-31~2026-09-06','2026-08-31','2026-09-06'],['2026-09-02~2026-09-04','2026-09-02','2026-09-04'],['2026-09-01','2026-09-01','2026-09-01'],[today,today,today],['2099-01-01','2099-01-01','2099-01-01'],['2000-01-01','2000-01-01','2000-01-01'],[null,earliest,today],['past30days',start30,yesterday]];
 const compare=(actual,expected)=>{assert.equal(actual.length,expected.length);actual.forEach((r,i)=>{assert.equal(day(r[0]),expected[i][0]);r.slice(1).forEach((v,j)=>assert.ok(near(v,expected[i][j+1])));});};
 let d,p;if(process.argv.includes('--verify')){d=await api('GET','dashboard/3');p=d.dashcards.find(c=>c.card_id===233&&c.dashboard_tab_id===18);}
 for(const [value,a,b] of cases){const route=p?`dashboard/3/dashcard/${p.id}/card/233/query`:'dataset';const body=p?{parameters:[{id:'review-performance',type:'date/all-options',value}]}:{...spec.dataset_query,parameters:[{type:'date/all-options',target:['dimension',['template-tag','performance_period']],value}]};const r=await run(route,body);compare(r.data.rows,oracle(a,b));checks.push((p?'Installed':'Preflight')+' cohort attribution/filter '+(value??'cleared'));}
 // Synthetic loans include unpaid loans, an older unrelated cohort, duplicate-payment risk,
 // out-of-period and future interest, and a signed correction. Reuse the actual query tail.
 const fixture=`WITH live_days AS (SELECT generate_series(DATE '2026-09-01',DATE '2026-09-30',INTERVAL '1 day')::date "Date"),
 test_loans("Loan ID","Loan Date","Principal Amount") AS (VALUES ('A',DATE '2026-09-01',100::numeric),('B',DATE '2026-09-02',100::numeric),('C',DATE '2026-09-08',200::numeric),('OLD',DATE '2026-08-01',100::numeric)),
 test_payments("Loan ID","Payment Date","Interest Paid") AS (VALUES ('A',DATE '2026-09-03',20::numeric),('A',DATE '2026-09-10',30::numeric),('A',DATE '2026-10-01',999::numeric),('A',DATE '2026-08-31',999::numeric),('C',DATE '2026-09-09',-10::numeric),('OLD',DATE '2026-09-05',999::numeric))`;
 const tail=cohort.replace('{{#70}}','test_loans').replace('{{#71}}','test_payments');const native=query=>({database:2,type:'native',native:{query}});
 const fixtureResult=await run('dataset',native(fixture+tail));compare(fixtureResult.data.rows,[['2026-08-31',.25,2,200,50],['2026-09-07',-.05,1,200,-10]]);checks.push('Synthetic exact loan attribution, unpaid denominator retained, multiple payments count principal once, outside-period/older-loan exclusion and signed correction');
 const zero=await run('dataset',native(fixture.replace("('C',DATE '2026-09-08',200::numeric)","('C',DATE '2026-09-08',0::numeric)")+tail));assert.equal(zero.data.rows[1][1],null);checks.push('Zero cohort principal remains unavailable');
 if(d){const b=before(),card=await api('GET','card/233');assert.deepEqual(card.visualization_settings,spec.visualization_settings);assert.equal(card.dataset_query.stages?.[0]?.native??card.dataset_query.native?.query,spec.dataset_query.native.query);assert.deepEqual(d.tabs,b.tabs);assert.deepEqual(d.parameters,b.parameters);checks.push('Saved cohort query/100% styling and existing tabs/filters preserved');
  const expected=layout(b).filter(x=>x.id>0);for(const old of expected){const cur=d.dashcards.find(x=>x.id===old.id);assert.deepEqual(shape(cur),shape(old));if(old.card_id&&old.card_id!==233){assert.deepEqual(cur.card.dataset_query,old.card.dataset_query);assert.deepEqual(cur.card.visualization_settings,old.card.visualization_settings);}}checks.push('Every other question unchanged; cohort chart moved into live section, EOD width restored');
  for(const [id,name] of [[70,'loans'],[71,'payments']])assert.deepEqual((await api('GET','card/'+id)).dataset_query,JSON.parse(fs.readFileSync(backup+'/'+name+'.json')).dataset_query);assert.deepEqual(await api('GET','collection/graph'),JSON.parse(fs.readFileSync(backup+'/permissions.json')));checks.push('Existing source models and permissions unchanged');
  save('plan',{card:Object.fromEntries(['id','name','description','display','dataset_query','visualization_settings','collection_id'].map(k=>[k,card[k]])),layout:d.dashcards.filter(x=>x.dashboard_tab_id===18).map(shape)});
 }
 save('verification',{at:new Date().toISOString(),installed:!!d,checks,count:checks.length,source_writes:false});console.log(`${checks.length} cohort-return checks passed.`);
}
if(process.argv.includes('--install')){
 await assertSource();assert.ok(fs.readFileSync('Documents/Release_Tracker.md','utf8').includes('**R020 — Open**'),'Publish R019 freeze first');const d=await api('GET','dashboard/3');assert.deepEqual(d.dashcards.map(shape),before().dashcards.map(shape));assert.deepEqual(d.tabs,before().tabs);
 await api('PUT','card/233',spec);await api('PUT','dashboard/3/cards',{tabs:d.tabs,cards:layout(d)});save('state',{card:233,dashboard:3,tab:18,backup});console.log('Replaced period ratio with loan-cohort return and moved it into the live section.');
}
