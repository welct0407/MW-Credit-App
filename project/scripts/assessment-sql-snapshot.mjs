import fs from 'node:fs/promises';
const dir='C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/assessment-sql-20260915';
await fs.mkdir(dir,{recursive:true});
const key=(await fs.readFile('C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/postgresql-migration-trial-20260914/appsheet-trial-api-key.txt','utf8')).trim();
for(const table of ['Loan Assessment','Calendar','Loans','Charges','Repayments']){
 const start=performance.now();
 const res=await fetch(`https://www.appsheet.com/api/v2/apps/494cd013-0d9b-482f-9559-c9d83059de91/tables/${encodeURIComponent(table)}/Action`,{method:'POST',headers:{'Content-Type':'application/json',ApplicationAccessKey:key},body:JSON.stringify({Action:'Find',Properties:{Locale:'en-US',Timezone:'Asia/Bangkok'},Rows:[]}),signal:AbortSignal.timeout(240000)});
 if(!res.ok)throw Error(`${table}: HTTP ${res.status}`);
 const rows=await res.json();
 await fs.writeFile(`${dir}/${table}.json`,JSON.stringify(rows));
 console.log(JSON.stringify({table,rows:rows.length,elapsedMs:performance.now()-start}));
}
