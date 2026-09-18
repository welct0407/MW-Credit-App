// Read-only baseline through the established DEV OLAP AppSheet API.
// Financial rows and authentication stay outside Git.
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
const root='C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project';
const phase=process.argv[2];
if(!['before','after'].includes(phase))throw Error('Use before or after');
const dir=`${root}/r007-20260918/${phase}`;
await fs.mkdir(dir,{recursive:true});
const key=(await fs.readFile(`${root}/postgresql-migration-trial-20260914/appsheet-trial-api-key.txt`,'utf8')).trim();
for(const table of ['Charges','Repayments','Loans','Borrowers','Statistics','Partners','Cash Pool Contributions','Settlements','Daily Analytics','Business Expenses']){
 const file=`${dir}/${table}.json`;
 try{await fs.access(file);throw Error(`Capture already exists: ${table}`);}catch(e){if(e.code!=='ENOENT')throw e;}
 const started=Date.now();
 const response=await fetch(`https://www.appsheet.com/api/v2/apps/494cd013-0d9b-482f-9559-c9d83059de91/tables/${encodeURIComponent(table)}/Action`,{method:'POST',headers:{'Content-Type':'application/json',ApplicationAccessKey:key},body:JSON.stringify({Action:'Find',Properties:{Locale:'en-US',Timezone:'Asia/Bangkok'},Rows:[]}),signal:AbortSignal.timeout(180000)});
 if(!response.ok)throw Error(`Read failed: ${table}, HTTP ${response.status}`);
 const rows=await response.json();if(!Array.isArray(rows))throw Error('Unexpected API response');
 if(rows.some(r=>!r['Row ID'])||new Set(rows.map(r=>r['Row ID'])).size!==rows.length)throw Error(`Invalid keys: ${table}`);
 const body=JSON.stringify(rows);await fs.writeFile(file,body);
 console.log(JSON.stringify({phase,table,rows:rows.length,elapsedMs:Date.now()-started,capturedUtc:new Date().toISOString(),sha256:crypto.createHash('sha256').update(body).digest('hex')}));
}
