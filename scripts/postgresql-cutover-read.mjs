// Read-only AppSheet API extraction through the existing authorized migration copy.
// Production apps are never accepted here. Actual source bindings must be verified in UI.
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
const appId='494cd013-0d9b-482f-9559-c9d83059de91';
const priv='C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/postgresql-cutover-20260914';
const key=(await fs.readFile('C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/postgresql-migration-trial-20260914/appsheet-trial-api-key.txt','utf8')).trim();
const folder=process.argv[2];
if(!['source','source-confirm','sql-after'].includes(folder))throw Error('Unexpected snapshot folder');
const tables=['Borrowers','Loans','Repayments','Statistics','Charges','Loan Assessment','Cash Pool Contributions','Partners','Settlements','Daily Analytics','Payment Allocations','Payments'];
await fs.mkdir(`${priv}/${folder}`,{recursive:true});
for(const table of tables){
 const path=`${priv}/${folder}/${table}.json`;
 try{await fs.access(path);throw Error(`Frozen snapshot exists: ${table}`);}catch(e){if(e.code!=='ENOENT')throw e;}
 const response=await fetch(`https://www.appsheet.com/api/v2/apps/${appId}/tables/${encodeURIComponent(table)}/Action`,{method:'POST',headers:{'Content-Type':'application/json',ApplicationAccessKey:key},body:JSON.stringify({Action:'Find',Properties:{Locale:'en-US',Timezone:'Asia/Bangkok'},Rows:[]}),signal:AbortSignal.timeout(180000)});
 if(!response.ok)throw Error(`Read failed: ${table}, HTTP ${response.status}`);
 const rows=await response.json();if(!Array.isArray(rows))throw Error('Unexpected API response');
 if(rows.some(r=>!r['Row ID'])||new Set(rows.map(r=>r['Row ID'])).size!==rows.length)throw Error(`Invalid keys: ${table}`);
 await fs.writeFile(path,JSON.stringify(rows));
 console.log(JSON.stringify({folder,table,rows:rows.length,sha256:crypto.createHash('sha256').update(JSON.stringify(rows)).digest('hex')}));
}
