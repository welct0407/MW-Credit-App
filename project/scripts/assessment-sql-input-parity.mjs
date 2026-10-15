import fs from 'node:fs/promises';
const p='C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/assessment-sql-20260915/';
const read=async f=>JSON.parse(await fs.readFile(p+f+'.json','utf8'));
const loans=await read('Loans'),charges=await read('Charges'),inputs=await read('all-inputs');
const numeric=x=>Number(String(x??0).replace(/[$฿,%\s,]/g,''));
const iso=s=>{if(!s)return null;const [m,d,y]=s.split('/');return `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;};
let comparisons=0;const diffs=[];const active=loans.filter(l=>l['Loan Status']==='ยังไม่ปิดยอด');
const seen=[];
for(const c of inputs)for(const l of c.input.loans){
 seen.push(l.id);const source=active.find(x=>x['Row ID']===l.id);if(!source)throw Error('Wrong active loan population');
 const values={kind:source['Loan Type'],auto:source['Auto Charge Enabled']==='Y',start_date:iso(source['Loan Date']),due_date:iso(source['Due Date']),principal:numeric(source['Principal Amount']),outstanding:numeric(source['Outstanding Principal']),received_interest:numeric(source['Total Interest Received']),daily_interest:numeric(source['Current Daily Interest']),fixed_interest:numeric(source['Fixed Interest']),daily_payment:numeric(source['Daily Payment Amount']),last_charge:charges.filter(x=>x['Ref Loans']===l.id).map(x=>iso(x['Charge Date'])).sort().at(-1)??null};
 for(const [k,v] of Object.entries(values)){comparisons++;if(typeof v==='number'?Math.abs(v-l[k])>0.005:v!==l[k])diffs.push({case:c.case,field:k});}
}
if(seen.length!==active.length||new Set(seen).size!==active.length)throw Error('Active loan membership differs');
let chargeCount=0;
for(const c of inputs)for(const x of c.input.charges){chargeCount++;const source=charges.find(z=>z['Ref Loans']===x.loan_id&&iso(z['Charge Date'])===x.charge_date&&Math.abs(numeric(z['Principal Due'])-x.principal_due)<0.005&&Math.abs(numeric(z['Principal Remaining'])-x.principal_remaining)<0.005&&Math.abs(numeric(z['Amount Remaining'])-x.amount_remaining)<0.005);comparisons+=3;if(!source)diffs.push({case:c.case,field:'charge input'});}
const result={activeLoans:active.length,chargeRows:chargeCount,comparisons,mismatches:diffs.length};
await fs.writeFile('C:/GitHub/AppSheet-Loan-Project/outputs/assessment-sql-20260915/input-parity.json',JSON.stringify({...result,diffs},null,2));console.log(JSON.stringify(result));if(diffs.length)process.exitCode=1;
