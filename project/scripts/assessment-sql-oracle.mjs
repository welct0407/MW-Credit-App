import fs from 'node:fs/promises';
const priv='C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/assessment-sql-20260915';
const out='C:/GitHub/AppSheet-Loan-Project/outputs/assessment-sql-20260915';
const date=s=>Math.round(Date.parse(s)/86400000),fmt=n=>new Date(n*86400000).toISOString().slice(0,10);
const sum=(a,f)=>a.reduce((s,x)=>s+Number(f(x)||0),0);
// Independent procedural oracle: direct day-by-day loops, no SQL window expressions.
export function forecast(input,amount,rate,asof,start,end){
 const ls=input.loans.map(l=>({...l,start:date(l.start_date),due:date(l.due_date),last:l.last_charge?date(l.last_charge):date(l.start_date)-1}));
 const cs=input.charges.map(c=>({...c,date:date(c.charge_date)}));
 let contractPaid=0,futurePrincipal=0,futureInterest=0,exposure=0;const rows=[];
 for(let d=date(start);d<=date(end);d++){
  const contract=ls.filter(l=>l.kind==='ผ่อนชำระรายวัน'&&l.auto&&l.due>=l.start&&l.daily_payment>0&&d>=l.start&&d<=l.due);
  const scheduled=l=>Math.floor(l.principal/(l.due-l.start+1))+(d-l.start+1<=l.principal%(l.due-l.start+1)?1:0);
  const manual=ls.filter(l=>!l.auto||(l.kind==='ดอกเบี้ยรายวัน'&&l.daily_interest===0));
  const mc=cs.filter(c=>c.date===d&&manual.some(l=>l.id===c.loan_id));
  contractPaid+=sum(contract,scheduled)+sum(mc,c=>c.principal_due);
  const future=contract.filter(l=>d>l.last),fm=d>date(asof)?mc:[];
  const fp=sum(future,scheduled)+sum(fm,c=>c.principal_remaining);
  futurePrincipal+=fp;futureInterest+=sum(future,l=>l.daily_payment)-fp+sum(fm,c=>c.amount_remaining);
  const base=ls.filter(l=>l.start<=d&&((l.kind==='ผ่อนชำระรายวัน'&&l.auto&&l.due>=l.start&&l.daily_payment>0)||manual.includes(l)));
  const co=Math.max(0,sum(base,l=>l.principal)-contractPaid);exposure+=co;
  const rolling=ls.filter(l=>(l.auto&&l.kind==='ดอกเบี้ยรายวัน'&&l.daily_interest!==0)||(l.auto&&l.kind==='กำหนดวันชำระ'&&l.due>d));
  const outstanding=ls.filter(l=>l.start<=d&&(l.kind==='ผ่อนชำระรายวัน'||manual.includes(l)));
  const principal=sum(rolling,l=>l.outstanding)+Math.max(0,sum(outstanding,l=>l.outstanding)-futurePrincipal);
  const interest=sum(ls,l=>l.received_interest)+sum(ls.filter(l=>l.auto&&l.kind==='ดอกเบี้ยรายวัน'),l=>l.daily_interest)*Math.max(d-date(asof),0)+sum(ls.filter(l=>l.auto&&l.kind==='กำหนดวันชำระ'&&l.due>date(asof)&&l.due<=d),l=>l.fixed_interest)+futureInterest;
  const minimum_profit=rate*(sum(rolling,l=>l.principal*(d-l.start+1))+exposure),coverage=principal+amount+minimum_profit;
  rows.push({day:fmt(d),principal,interest,minimum_profit,coverage,margin:interest-coverage,contract_outstanding:co});
 }
 return rows;
}
const cases=JSON.parse(await fs.readFile(priv+'/all-inputs.json','utf8')).map(c=>({...c,amount:2000,rate:0.01,asof:'2026-09-15',start:'2026-08-01',end:'2026-12-31'}));
const loan={id:'synthetic',kind:'ผ่อนชำระรายวัน',auto:true,start_date:'2026-09-01',due_date:'2026-09-07',principal:1000,outstanding:701,received_interest:40,daily_interest:0,fixed_interest:0,daily_payment:180,last_charge:'2026-09-03'};
const variants=[['empty',[]],['installment remainder',[loan]],['invalid dates',[{...loan,due_date:'2026-08-30'}]],['zero daily payment',[{...loan,daily_payment:0}]],['no charges',[{...loan,last_charge:null}]],['overpayment',[{...loan,outstanding:-10,received_interest:-20}]],['daily',[{...loan,kind:'ดอกเบี้ยรายวัน',daily_interest:100}]],['daily zero',[{...loan,kind:'ดอกเบี้ยรายวัน',daily_interest:0}]],['fixed due today',[{...loan,kind:'กำหนดวันชำระ',due_date:'2026-09-15',fixed_interest:500}]],['fixed future',[{...loan,kind:'กำหนดวันชำระ',due_date:'2026-09-20',fixed_interest:500}]],['manual',[{...loan,auto:false}]]];
for(const [label,loans] of variants)for(const amount of [0,2000,1000000])for(const rate of [0,0.01])cases.push({case:`synthetic-${label}-${amount}-${rate}`,input:{loans,charges:loans.length?[{loan_id:'synthetic',charge_date:'2026-09-18',principal_due:300,principal_remaining:200,amount_remaining:240}]:[]},amount,rate,asof:'2026-09-15',start:'2026-08-01',end:'2026-12-31'});
await fs.writeFile(priv+'/validation-cases.json',JSON.stringify(cases));
const expected=cases.map(c=>({case:c.case,rows:forecast(c.input,c.amount,c.rate,c.asof,c.start,c.end)}));
await fs.writeFile(priv+'/oracle-results.json',JSON.stringify(expected));
const literal=JSON.stringify(cases).replaceAll("'","''");
await fs.writeFile(priv+'/validation-query.sql',`WITH cases AS(SELECT * FROM jsonb_to_recordset('${literal}'::jsonb) AS c("case" text,input jsonb,amount numeric,rate numeric,asof date,start date,"end" date)) SELECT jsonb_agg(jsonb_build_object('case',"case",'rows',(SELECT jsonb_agg(to_jsonb(f)) FROM assessment_lab.forecast(input->'loans',input->'charges',amount,rate,asof,start,"end") f))) FROM cases;`);
console.log(JSON.stringify({cases:cases.length,days:expected.reduce((s,c)=>s+c.rows.length,0),comparisons:expected.reduce((s,c)=>s+c.rows.length*6,0)}));
for(let offset=0;offset<cases.length;offset+=10){
 const batch=cases.slice(offset,offset+10).map((c,i)=>({...c,expected:expected[offset+i].rows}));
 const json=JSON.stringify(batch).replaceAll("'","''");
 const query=`WITH cases AS(SELECT * FROM jsonb_to_recordset('${json}'::jsonb) AS c("case" text,input jsonb,amount numeric,rate numeric,asof date,start date,"end" date,expected jsonb)), comparison AS(SELECT "case",f.day,abs(f.principal-e.principal) dp,abs(f.interest-e.interest) di,abs(f.minimum_profit-e.minimum_profit) dm,abs(f.coverage-e.coverage) dc,abs(f.margin-e.margin) dg,abs(f.contract_outstanding-e.contract_outstanding) dout FROM cases CROSS JOIN LATERAL assessment_lab.forecast(input->'loans',input->'charges',amount,rate,asof,start,"end") f JOIN LATERAL jsonb_to_recordset(expected) AS e(day date,principal numeric,interest numeric,minimum_profit numeric,coverage numeric,margin numeric,contract_outstanding numeric) ON e.day=f.day) SELECT json_build_object('batch',${offset/10},'days',count(*),'comparisons',count(*)*6,'mismatches',count(*) FILTER(WHERE greatest(dp,di,dm,dc,dg,dout)>0.000001),'maxDifference',max(greatest(dp,di,dm,dc,dg,dout))) FROM comparison;`;
 await fs.writeFile(priv+`/validation-${offset/10}.sql`,query);
}
