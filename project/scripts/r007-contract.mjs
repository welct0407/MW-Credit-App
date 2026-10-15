import fs from 'node:fs/promises';
const root='C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/r007-20260918';
const data=JSON.parse(await fs.readFile(`${root}/dev-olap-before-appdoc.json`,'utf8'));
const keep={Charges:['Borrower Name','Related Repayments','Borrower Name TE','Payment Status TE','Related Payment Allocations','Related Payments'],Repayments:['Borrower Name','Header - Profit','Borrower Name TE'],Loans:['Related Repayments','Statistics Header','Related Charges','Loan Key','Borrower Name TE','Loan Status TE','Loan Type TE','Borrower Name','Related Payments','Related Business Expenses','Related Cash Ledgers'],Borrowers:['Related Loans','Header - Active Loans','Borrower Name TE','Related Loan Assessments','Header - Closed Loans','Todays Collection Charges','Portfolio Share Join Key','Matrix Bubble Label','Related Payments','Related Referral Expenses','Related Business Expenses By Ref Payee Borrower','Related Business Expenses By Ref Related Borrower'],Statistics:[]};
const result={captured:'2026-09-18',appId:'494cd013-0d9b-482f-9559-c9d83059de91',version:'1.000129',tables:{},columns:{},slices:[],views:[]};
for(const entry of data){
 const p=Object.fromEntries(entry.rows.filter(r=>r.length===2));
 if(p['Table name'] in keep)result.tables[p['Table name']]=p;
 const match=entry.heading.match(/^Schema Name (.*)_Schema$/);
 if(match&&match[1] in keep&&p['Column name']){
  const table=match[1];result.columns[table]??=[];
  result.columns[table].push({...p,r007Move:p['Virtual?']==='Yes'&&!keep[table].includes(p['Column name'])&&!p['Column name'].startsWith('Header - ')});
 }
 if(p['Slice Name'])result.slices.push(p);
 if(p['View name'])result.views.push(p);
}
for(const [table,cols] of Object.entries(result.columns))console.log(table,cols.filter(x=>x.r007Move).length);
await fs.mkdir('outputs/r007-20260918',{recursive:true});
await fs.writeFile('outputs/r007-20260918/before-contract.json',JSON.stringify(result,null,2)+'\n');
