// Authorized trial-only AppSheet reads. Never accepts a write action or production app ID.
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
const appId='494cd013-0d9b-482f-9559-c9d83059de91';
const root='C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/postgresql-migration-trial-20260914';
const tables=['Borrowers','Loans','Repayments','Charges','Loan Assessment','Cash Pool Contributions','Partners','Settlements','Daily Analytics','Payment Allocations','Payments'];
const after=process.argv.includes('--after');
const full=process.argv.includes('--full');
const requested=process.argv.slice(2).filter(v=>!['--after','--full'].includes(v));
const folder=full?'bulk-full-after':after?'bulk-after':'bulk-source';
if(requested.some(t=>!tables.includes(t)))throw Error('Table outside authorized native-database extraction');
const key=(await fs.readFile(`${root}/appsheet-trial-api-key.txt`,'utf8')).trim();
await fs.mkdir(`${root}/${folder}`,{recursive:true});
for(const table of requested.length?requested:tables){
 try { await fs.access(`${root}/${folder}/${table}.json`); throw Error(`Refusing to overwrite frozen ${folder} snapshot: ${table}`); }
 catch(error){ if(error.code!=='ENOENT')throw error; }
 const response=await fetch(`https://www.appsheet.com/api/v2/apps/${appId}/tables/${encodeURIComponent(table)}/Action`,{
  method:'POST',headers:{'Content-Type':'application/json',ApplicationAccessKey:key},
  body:JSON.stringify({Action:'Find',Properties:{Locale:'en-US',Timezone:'Asia/Bangkok'},Rows:[]}),signal:AbortSignal.timeout(180000)
 });
 const text=await response.text();
 if(!response.ok){await fs.writeFile(`${root}/${folder}/error-${table}.txt`,text);throw Error(`${table}: HTTP ${response.status}; private error saved`);}
 const rows=JSON.parse(text);
 if(!Array.isArray(rows))throw Error(`${table}: Unexpected response shape`);
 const keys=rows.map(r=>r['Row ID']);
 if(keys.some(k=>typeof k!=='string'||!k)||new Set(keys).size!==keys.length)throw Error(`${table}: invalid or duplicate keys`);
 await fs.writeFile(`${root}/${folder}/${table}.json`,JSON.stringify(rows));
 console.log(JSON.stringify({table,rows:rows.length,fields:rows[0]?Object.keys(rows[0]).length:0,sha256:crypto.createHash('sha256').update(text).digest('hex')}));
}
