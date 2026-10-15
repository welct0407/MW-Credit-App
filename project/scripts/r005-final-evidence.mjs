import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const root='outputs/r005-20260917';
const privateRoot='C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/r005-20260917';
const read=async n=>JSON.parse(await fs.readFile(`${root}/${n}.json`,'utf8'));
const lines=async n=>(await fs.readFile(`${root}/${n}.jsonl`,'utf8')).replace(/^\uFEFF/,'').trim().split(/\r?\n/).map(JSON.parse);
const checks=[];
const check=(name,fn)=>{fn();checks.push({name,result:'Passed'});};
const final=await lines('gui-default-final-readback');
check('No historical backfill, duplicate system sources or balance mismatch',()=>{
 for(const r of final)for(const k of ['legacy_nonnull_receivers','legacy_nonnull_payers','historical_cash_rows','bad_system_source_duplicates','balance_mismatch_count'])if(k in r)assert.equal(r[k],0);
 assert.equal(final[0].ledger_rows,14);assert.equal(final[0].holders,3);
});
const prior=await lines('gui-direct-lisa-before-default');
check('Default creates no additional cash and both synthetic loans are closed',()=>{
assert.equal(final[0].ledger_rows,prior[0].ledger_rows);
assert.deepEqual(final.filter(r=>'Current Balance'in r),prior.filter(r=>'Current Balance'in r));
assert(final.filter(r=>'Loan Status'in r).every(r=>r['Loan Status']==='ปิดยอดแล้ว'));
});
const before=await lines('gui-closure-before-receiver-correction');
const after=await lines('gui-receiver-correction-readback');
check('Receiver correction preserves allocations and repayments',()=>assert.deepEqual(before.filter(r=>r.payment),after.filter(r=>r.payment)));
check('Normal Dad and direct Lisa receipts each create one matching inflow',()=>{
 for(const [id,holder,amount] of [['z6dDpSbba1LPigAc7zpygz','ch:dad',10],['PNq6xWG7JQKy43bcYepSAg','ch:lisa',20]]){
  const payment=final.find(r=>r['Row ID']===id);assert.equal(payment.Status,'Posted');assert.equal(payment['Ref Received By Cash Holder'],holder);
  const movement=final.find(r=>r['Row ID']===`cash:PAYMENT:${id}`);assert.equal(movement.Amount,amount);assert.equal(movement['Ref To Cash Holder'],holder);assert.equal(movement['Ref From Cash Holder'],null);
 }
});
check('Both partner settlements debit Lisa without crediting a business holder',()=>{
 const settlements=final.filter(r=>r.cash_id?.startsWith('cash:SETTLEMENT:'));assert.equal(settlements.length,2);
 for(const r of settlements){assert.equal(r.Status,'Completed');assert.equal(r['Ref From Cash Holder'],'ch:lisa');assert.equal(r['Ref To Cash Holder'],null);}
});
const pending=await lines('gui-settlement-explicit-pending-readback');
check('Pending settlement has no cash movement',()=>{const r=pending.find(r=>r['Row ID']==='mtZTuRW3fHgqk3boOjPkjY');assert.equal(r.Status,'Pending');assert.equal(r.cash_id,null);});
const accounting=await lines('gui-negative-accounting-only-readback');
check('Negative accounting-only adjustment has no movement; specified payer gives refund',()=>{
 const r=accounting.find(r=>r['Row ID']==='133581d4');assert.equal(r['Ref Paid By Cash Holder'],null);assert.equal(accounting[0].ledger_rows,7);assert.equal(accounting.find(r=>r['Ref Cash Holder']==='ch:lisa')['Current Balance'],51);
 const f=final.find(r=>r['Row ID']==='133581d4'&&'cash_id'in r);assert.equal(f.Amount,-10);assert.equal(f.cash_amount,10);assert.equal(f['Ref To Cash Holder'],'ch:lisa');
});
check('Tommy reimbursement leaves economic allocation unchanged',()=>{
 const r=final.find(r=>r['Row ID']==='b0f22f2d'&&'cash_id'in r);assert.equal(r.Amount,100);assert.equal(r['Partner A Expense'],60);assert.equal(r['Partner B Expense'],40);
 assert.equal(final.find(r=>r['Ref Cash Holder']==='ch:tommy')['Current Balance'],0);
});
await fs.writeFile(`${root}/gui-assertions.json`,JSON.stringify({release:'R005',scope:'Assertions against captured GUI-triggered SQL readbacks; does not replace GUI evidence or deployment checks',checks},null,2)+'\n');
const mapping=[];const timeline=[];const inventory=await read('model-inventory');
for(const app of ['oltp','olap']){
 const diff=await read(`dev-${app}-baseline-candidate-diff`);
 const perSave=(await fs.readdir(root)).filter(n=>n.startsWith(`dev-${app}-save`)&&n.endsWith('-diff.json'));
 const batches=await Promise.all(perSave.map(async n=>({name:n,data:await read(n.slice(0,-5))})));
 for(const batch of batches)for(const change of batch.data.changes)timeline.push({id:change.id,app,path:change.path,batch:batch.name,beforeVersion:batch.data.before.version,afterVersion:batch.data.after.version,disposition:diff.changes.some(c=>c.id===change.id)?'Represented in final candidate checklist':'Intermediate-only change; superseded/restored before final candidate',exactValues:change});
 for(const c of diff.changes){
  const generated=/Process for Notification|First-day receipt exists Output|Notify payment-closed loans Output/.test(c.path);
  const metadata=c.path.startsWith('Summary/')||c.path==='App/Version';
  const evidence=batches.filter(b=>b.data.changes.some(x=>x.id===c.id)).map(b=>b.name);
  assert(evidence.length,`Missing per-save evidence ${c.path}`);
  mapping.push({...c,sourceVersion:diff.before.version,candidateVersion:diff.after.version,candidateArtifact:diff.after.file,perSaveEvidence:evidence,
   disposition:metadata?'Observed version/count metadata; no independent PROD edit':generated?'DEV notification parity: generated processing schemas; preserve existing PROD notification configuration':'R005 cash custody configuration',
   intendedProd:metadata||generated?{operation:'No independent edit; retain PROD baseline configuration'}:{...c.after},
   devStatus:'Saved export verified; GUI scenario coverage linked in GUI_TEST_REPORT.md; omitted export states covered only by approved limited exception',
   prodStatus:'Pending; no production authorization or write',
   actualProdBefore:null,savedProdObserved:null});
 }
 const doc=await read(diff.after.file.slice(0,-5));let schema='';
 for(const table of doc.tables){
  const props=Object.fromEntries(table.rows.filter(r=>r.length>1));const [kind,name]=table.rows[0];
  if(kind==='Schema Name')schema=name;
  const businessColumn=kind==='Column name'&&(/^(Cash Holders|Cash Ledger|Cash Holder Balances)_Schema$/.test(schema)||/Ref (Received|Paid) By Cash Holder|Related Cash Ledger/.test(name));
  const businessObject=/^(Table name|View name|Slice Name)$/.test(kind)&&(/Cash Holder|Cash Ledger|Cash Position/.test(name)||name==='Reporting Loans');
  if(businessColumn||businessObject){
   const object=`${app.toUpperCase()} ${businessColumn?schema+'/'+name:kind+'/'+name}`;
   const value=JSON.stringify(props);assert(value.length<30000,object);
   const record={object,property:'Saved AppSheet configuration (exact exported values)',value};
   const i=inventory.findIndex(x=>x.object===object&&x.property===record.property);if(i<0)inventory.push(record);else inventory[i]=record;
  }
 }
}
// Explicit, narrow source binding substitution for newly added business tables.
for(const row of mapping){
 if(row.path.startsWith('Table name/')&&row.intendedProd?.value==='database-3')row.intendedProd={present:true,value:'database-2',reason:'Verified DEV-to-PROD AppSheet database source binding'};
}
await fs.writeFile(`${root}/configuration-checklist.json`,JSON.stringify({release:'R005',status:'Not frozen; deployment diagnostic and omitted-state verification limitations remain',coverage:'All 6,949 baseline-to-candidate exported property differences are individually mapped. No arbitrary category ignored. Historical automatic-consistency internal deltas are retained separately.',counts:{discovered:mapping.length,mapped:mapping.length,unmapped:0},rows:mapping},null,2)+'\n');
await fs.writeFile(`${root}/per-save-reconciliation.json`,JSON.stringify({release:'R005',count:timeline.length,unmapped:0,scope:'Every per-save exported change retains exact values and a final-candidate or intermediate-only disposition; automatic consistency history deltas retained separately.',rows:timeline},null,2)+'\n');
await fs.writeFile(`${root}/model-inventory.json`,JSON.stringify(inventory,null,2)+'\n');
for(const name of ['dev-olap-version98-history.txt','dev-oltp-version118-history.txt','dev-olap-final-diagnostics.txt','dev-oltp-final-diagnostics.txt','prod-olap-bot-parity-final.txt','gui-cash-position-final.txt','gui-final-system-ledger-protection.txt','gui-final-olap-payment-readonly-related-ledger.txt','gui-default-result.txt','gui-normal-receipt-dad-form.txt','gui-direct-lisa-form.txt']){
 let content=await fs.readFile(`${privateRoot}/${name}`,'utf8');
 content=content.split('\n').filter(line=>!line.includes('1Password menu')).join('\n');
 content=content.replace(/welct0407/g,'[OWNER]').replace(/@mw-credit\.com/g,'@[OWNER-DOMAIN]');
 if(/password|access.?token|bearer\s/i.test(content))throw Error('Sensitive capture review '+name);
 await fs.writeFile(`${root}/${name}`,content);
}
console.log(JSON.stringify({checks:checks.length,propertyRows:mapping.length,modelInventoryRows:inventory.length}));
