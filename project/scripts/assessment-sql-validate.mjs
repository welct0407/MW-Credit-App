import fs from 'node:fs/promises';
const dir='C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/assessment-sql-20260915';
const out='C:/GitHub/AppSheet-Loan-Project/outputs/assessment-sql-20260915';
const load=async n=>JSON.parse(await fs.readFile(`${dir}/${n}.json`,'utf8'));
const calendar=await load('Calendar'),sql=(await load('baseline-sql'))[0];
const iso=s=>{const [m,d,y]=s.split('/');return `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;};
const n=v=>Number(String(v??0).replace(/[$฿,%\s,]/g,''));
const fields={principal:'Projected Outstanding Principal',interest:'Projected Interest',minimum_profit:'Minimum Required Profit',coverage:'Required Coverage',margin:'Coverage Margin',contract_outstanding:'Assessment Installment Contract Outstanding'};
const differences=[];let comparisons=0;
for(const row of calendar){const r=sql.find(x=>x.day===iso(row.Date));if(!r)throw Error('Missing forecast day');for(const [f,c] of Object.entries(fields)){comparisons++;if(Math.abs(n(row[c])-n(r[f]))>0.005)differences.push({date:r.day,field:f,difference:n(r[f])-n(row[c])});}}
const result={calendarDays:calendar.length,comparisons,differenceCount:differences.length,differences};
await fs.writeFile(`${out}/baseline-parity.json`,JSON.stringify(result,null,2));
console.log(JSON.stringify({...result,differences:differences.slice(0,10)}));
