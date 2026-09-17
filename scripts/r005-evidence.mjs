import fs from 'node:fs/promises';
import crypto from 'node:crypto';
const priv='C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/r005-20260917';
const out='outputs/r005-20260917';
await fs.mkdir(out,{recursive:true});
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
const sql=await fs.readFile('database/migrations/V20__cash_custody_ledger.sql','utf8');
const inventory=[];
for(const name of ['Cash Holders','Cash Ledger']){
 const block=sql.split(`CREATE TABLE public."${name}" (`)[1].split('\n);')[0];
 for(const line of block.split('\n')){
  const m=line.match(/^ "([^"]+)" (.+?)(?:,)?$/);
  if(m)inventory.push({object:name,property:m[1],value:m[2].replace(/,$/,'')});
 }
}
inventory.push({object:'Payments',property:'Ref Received By Cash Holder',value:'text nullable FK to Cash Holders.Row ID, ON DELETE RESTRICT. New-row SQL default ch:dad; First-day Auto fixed ch:lisa. Historical NULLs preserved. Planned OLTP editable Dad/Lisa, OLAP read-only.'});
inventory.push({object:'Business Expenses',property:'Ref Paid By Cash Holder',value:'text nullable FK to Cash Holders.Row ID, ON DELETE RESTRICT. No manual default. Required new positive manual expense; new Referral Rebate fixed ch:lisa. Planned OLTP source entry, OLAP read-only.'});
inventory.push({object:'r005_cash_cutover_sources',property:'source_type',value:"text NOT NULL CHECK IN ('Payment','Loan','Business Expense','Settlement'); composite PK with source_row_id. Immutable SQL-only metadata, absent from both apps."});
inventory.push({object:'r005_cash_cutover_sources',property:'source_row_id',value:'text NOT NULL; composite PK with source_type. Pre-cutover source identity only. Old completed settlements excluded; old pending settlements remain eligible. Absent from both apps.'});
for(const [field,value] of Object.entries({'Ref Cash Holder':'Cash Holders.Row ID; one row per holder; planned read-only Ref key.','Holder Name':'Cash Holders.Holder Name; planned label.','Cash In':'SUM(Cash Ledger.Amount WHERE Ref To Cash Holder = holder), or 0.','Cash Out':'SUM(Cash Ledger.Amount WHERE Ref From Cash Holder = holder), or 0.','Current Balance':'Cash In - Cash Out.','Business Cash Held':'GREATEST(Current Balance, 0).','Reimbursement / Advance Due':'GREATEST(-Current Balance, 0).'}))inventory.push({object:'Cash Holder Balances',property:field,value:value+' SQL view; planned OLAP read-only, no OLTP aggregation.'});
inventory.push({object:'Cash Ledger',property:'App ownership',value:'Owner refinement: OLAP owns manual transfers, Cash Position and ledger presentation. SQL owns automatic source synchronization. System rows read-only; normal manual types Cash Handover and Expense Reimbursement. Opening/Manual Correction require controlled SQL administration. No opening amounts authorized.'});
await fs.writeFile(`${out}/model-inventory.json`,JSON.stringify(inventory,null,2)+'\n');
const manifest={release:'R005',stage:'Local implementation checkpoint; consult release log for subsequent live changes',migration:{file:'database/migrations/V20__cash_custody_ledger.sql',sha256:hash(sql)},baseline:[],coverage:'Appdoc property tables plus current-editor supplements. Full omitted/unset/inherited coverage is not established. Owner approved the limited R005 coverage exception on 17 September 2026; exact changed-property verification, per-save comparisons and final zero-warning gate remain required.'};
for(const app of ['oltp','olap']){
 const file=`dev-${app}-before-context.json`,raw=await fs.readFile(`${priv}/${file}`,'utf8');
 // Exports contain definitions, not table records. Stop if possible credentials appear.
 if(/password|access.?key|api.?key|secret|bearer\s|[?&](token|signature)=/i.test(raw))throw Error('Protected-value review required before baseline publication: '+file);
 const parsed=JSON.parse(raw);
 await fs.writeFile(`${out}/${file}`,raw);
 manifest.baseline.push({app,file,sha256:hash(raw),propertyTables:parsed.tables.length});
}
const files=(await fs.readdir(priv)).filter(n=>/^(dev|prod)-.*\.(json|txt)$/.test(n));
manifest.privateSupplementHashes=[];
for(const name of files){const raw=await fs.readFile(`${priv}/${name}`);manifest.privateSupplementHashes.push({name,sha256:hash(raw)});}
await fs.writeFile(`${out}/evidence-manifest.json`,JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({modelRows:inventory.length,baselineTables:manifest.baseline.map(x=>x.propertyTables),privateSupplementCount:files.length}));
