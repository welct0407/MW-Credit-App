import { databaseRoot } from './database-location.mjs';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
const root='C:/GitHub/AppSheet-Loan-Project',out=root+'/outputs/lumpsum-db-20260915';
const priv='C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/lumpsum-20260915';
const read=async p=>JSON.parse((await fs.readFile(p,'utf8')).replace(/^\uFEFF/,''));
const jsonl=async p=>(await fs.readFile(p,'utf8')).replace(/^\uFEFF/,'').trim().split(/\r?\n/).filter(Boolean).map(JSON.parse);
const write=async(n,v)=>fs.writeFile(out+'/'+n,JSON.stringify(v,null,2)+'\n');
const median=a=>{const b=[...a].sort((x,y)=>x-y);return b.length%2?b[(b.length-1)/2]:(b[b.length/2-1]+b[b.length/2])/2;};
const summary=a=>({n:a.length,median:median(a),min:Math.min(...a),max:Math.max(...a)});
const timings=(await read(priv+'/ui-timings.json')).map(t=>({...t,seconds:(t.ready-t.start)/1000,observationGapMs:t.lastBusy?t.ready-t.lastBusy:null,include:!['LS26-BASE-02','LS26-CHECK-150'].includes(t.name)}));
const servers=await read(out+'/server-results.json');
const control=servers.filter(r=>r.utc<'09/15/2026 07:05:00').sort((a,b)=>a.utc.localeCompare(b.utc));
const final=servers.filter(r=>r.utc>='09/15/2026 07:14:00'&&r.utc<='09/15/2026 07:18:00').sort((a,b)=>a.utc.localeCompare(b.utc));
if(control.length!==5||final.length!==5)throw Error('Expected exactly five server measurements per group');
const b=summary(control.map(r=>r.seconds)),f=summary(final.map(r=>r.seconds));
const bui=summary(timings.filter(t=>t.include&&t.name.startsWith('LS26-BASE')).map(t=>t.seconds)),fui=summary(timings.filter(t=>t.name.startsWith('LS26-FINAL')).map(t=>t.seconds));
const results=await jsonl(out+'/final-results.jsonl');
for(const p of results.filter(r=>r.receipt)){if(p.status!=='Posted'||p.amount!==p.allocated||p.amount!==p.posted)throw Error('Receipt reconciliation failure '+p.note);}
for(const a of results.filter(r=>r.receipt_note)){if(!a.ledger_matches)throw Error('Child mismatch');}
const original=await jsonl(out+'/before-fingerprints.jsonl'),after=await jsonl(out+'/after-original-fingerprints.jsonl');
const unchanged=original.filter(r=>r.table).map(r=>({table:r.table,rows:r.rows,unchanged:after.some(a=>a.table===r.table&&a.rows===r.rows&&a.fingerprint===r.fingerprint)}));
if(unchanged.some(r=>!r.unchanged))throw Error('Original data changed');
const migrations=[];for(const filename of ['V2__atomic_lump_sum.sql','V3__lump_sum_guard_compatibility.sql']){const bytes=await fs.readFile(databaseRoot+'/database/migrations/'+filename);migrations.push({filename,sha256:crypto.createHash('sha256').update(bytes).digest('hex')});}
const parse=async path=>{
 const raw=(await read(path)).map(t=>Object.fromEntries(t.rows.filter(r=>r.length===2)));
 const tables=raw.filter(t=>t['Table name']),schemas=new Map(tables.map(t=>[t.Schema,t['Table name']]));let schema;const columns=[];
 for(const t of raw){if(t['Schema Name'])schema=t['Schema Name'];if(t['Column name'])columns.push({table:schemas.get(schema)||schema,...t});}
 const clean=v=>JSON.parse(JSON.stringify(v).replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,'<redacted-email>'));
 return clean({version:raw.find(t=>t.Version)?.Version,tables,columns,slices:raw.filter(t=>t['Slice Name']),actions:raw.filter(t=>t['Action name']),views:raw.filter(t=>t['View name'])});
};
const oltp=await parse(priv+'/oltp-after-tables.json'),olap=await parse(priv+'/olap-tables.json');
if(oltp.version!=='1.000014'||olap.version!=='1.000027')throw Error('Unexpected app version');
const condition='AND([Status] = "Processing", [Allocation Method] <> "Lump Sum")';
if(oltp.actions.find(a=>a['Action name']==='Payment - Process Receipt')['Only if this condition is true']!=='='+condition)throw Error('Routing differs');
const relevant=['Borrowers','Loans','Charges','Payments','Payment Allocations','Repayments'];
const consumers=Object.fromEntries([['OLTP',oltp],['OLAP',olap]].map(([n,a])=>[n,{version:a.version,tables:a.tables.filter(t=>relevant.includes(t['Table name'])),columns:a.columns.filter(c=>relevant.includes(c.table)),slices:a.slices.filter(s=>relevant.includes(s['Source Table'])),actions:a.actions.filter(x=>/Process Receipt|Reporting App|Operations App|Open.*App/.test(x['Action name'])),views:a.views.filter(v=>/Reporting App|Operations App/.test(v['View name']))}]));
await write('consumer-definitions.json',consumers);
await write('ui-timings.json',timings);
const metrics={server:{control,final,controlSummary:b,finalSummary:f,reductionPercent:100*(1-f.median/b.median),speedup:b.median/f.median,historicalBaselineMedian:15.582,historicalReductionPercent:100*(1-f.median/15.582)},ui:{definition:'Successful Save click to borrower action ready and sync complete',control:bui,final:fui,reductionPercent:100*(1-fui.median/bui.median),excluded:['BASE-01 not timed','BASE-02 observation gap; 34.511s excluded','Four SQL exploratory runs use V2 and are reported separately','Two pre-dispatch Save timeouts excluded after form/database absence verification']},migrations,originalData:unchanged,postedReceipts:results.filter(r=>r.receipt).length};
await write('verification.json',metrics);
const changes=[['OLTP','Payments - Process Receipt','Only if this condition is true','[Status] = "Processing"',condition],['OLTP','Payments - Process Receipt / Payment queued or retried','Bot event condition','[Status] = "Processing"',condition],['OLTP + OLAP','Payments / Payment Allocations / Repayments','Lump-sum processor','Five AppSheet stages','V2 + V3 atomic PostgreSQL transaction. Dev OLTP 1.000014; Dev OLAP 1.000027 readback verified. Owner review pending.'],['OLTP + OLAP','Payment Allocations.Charge Row Number Snapshot','Stored meaning for new SQL receipts','Provider row number snapshot','Negative Allocation Order (-1, -2, ...); newest date then immutable charge key descending. Existing rows unchanged.'],['OLTP + OLAP','Payment Allocations.Row ID / Repayments.Row ID','SQL receipt child keys','AppSheet-generated keys','ls2:<Payment Row ID>:<Charge Row ID>. Positive allocations only; SQL child rows immutable.'],['OLTP + OLAP','Payments.Status / Processed At','Lump-sum posting state','AppSheet reconciler','DB assigns Posted atomically; rejects invalid receipts; stale metadata retry stays Posted. Other methods retain AppSheet bot.'],['OLTP + OLAP','Borrowers.Closed Loan Principle','Existing display limitation','Total Amount Loaned minus Total Outstanding Principal','Same pre-existing formula; includes repaid principal on open loans. Do not use this label to verify closure.'],['Database','Flyway','Schema version','V1 (production unchanged)','V3 in development. Exact migration SHA256 in outputs/lumpsum-db-20260915/verification.json.']];
const v2=await fs.readFile(databaseRoot+'/database/migrations/V2__atomic_lump_sum.sql','utf8');
for(const sql of v2.match(/CREATE INDEX[^;]+;/g)||[])changes.push(['Database',sql.match(/CREATE INDEX (\w+)/)[1],'Development index','Absent',sql]);
const logic=[];
for(const name of ['lump_sum_receipt_guard','process_lump_sum','lump_sum_child_guard'])logic.push(['Development function','public',name,'V3 development only; owner review pending',`database/migrations/${name==='process_lump_sum'?migrations[0].filename:migrations[1].filename}; returns trigger; exact migration hash recorded in verification.json`]);
for(const [table,name]of [['Payments','lump_sum_receipt_guard'],['Payments','process_lump_sum'],['Payment Allocations','lump_sum_child_guard'],['Repayments','lump_sum_child_guard']])logic.push(['Development trigger',table,name,'Enabled in Dev only',`${name==='process_lump_sum'?'AFTER INSERT OR UPDATE':name==='lump_sum_receipt_guard'?'BEFORE INSERT OR UPDATE':'BEFORE INSERT OR UPDATE OR DELETE'} FOR EACH ROW EXECUTE FUNCTION public.${name}()`]);
await write('dictionary-additions.json',{'Dev Differences':changes,'DB Logic':logic,'Guide':[['Development lump sum','Dev OLTP 1.000014; Dev OLAP 1.000027; Flyway V3','2026-09-15: see Dev Differences and Development function/trigger rows in DB Logic. Production inventory remains unchanged. Tests and review: outputs/lumpsum-db-20260915/REPORT.md.']]});
console.log(JSON.stringify({server:metrics.server.finalSummary,serverReduction:metrics.server.reductionPercent,ui:metrics.ui,posted:metrics.postedReceipts,originalTablesUnchanged:unchanged.length,migrations},null,2));
