import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
const out='outputs/r005-20260917';
const priv='C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/r005-20260917';
const read=async n=>JSON.parse(await fs.readFile(`${out}/${n}.json`,'utf8'));
const phases={};
for(const phase of ['before','created','deleted','pending','final']) phases[phase]=(await fs.readFile(`${priv}/reversal-gui-${phase}.ndjson`,'utf8')).replace(/^\uFEFF/,'').trim().split(/\r?\n/).map(JSON.parse);
const balances=p=>Object.fromEntries(phases[p].filter(r=>r['Current Balance']!==undefined).map(r=>[r['Ref Cash Holder'],r['Current Balance']]));
const base=balances('before');
assert.equal(balances('created')['ch:lisa'],base['ch:lisa']-1);
for(const p of ['deleted','pending','final']) assert.deepEqual(balances(p),base);
const completed=phases.created.find(r=>r.Notes?.startsWith('R005 GUI synthetic reversal completed'));
const pending=phases.pending.find(r=>r.Notes?.startsWith('R005 GUI synthetic reversal pending'));
assert.equal(completed.Status,'Completed'); assert.equal(completed.cash_amount,1);
assert.equal(pending.Status,'Pending'); assert.equal(pending.cash_id,null);
for(const original of [completed,pending]){
 const final=phases.final.find(r=>r['Row ID']===original['Row ID']);
 assert.equal(final.Status,'Cancelled'); assert.equal(final.cash_id,null);
 for(const k of ['Row ID','Ref Partner','Amount','Transfer Date']) assert.equal(final[k],original[k]);
 assert.ok(final.Notes.startsWith(original.Notes+' | Deleted settlement by '));
}
const report={release:'R005',date:'2026-09-18',environment:'DEV',versions:{oltp:'1.000120',olap:'1.000123',sql:'V21'},
 tests:[
  {id:'REV-GUI-01',result:'Passed',case:'Completed synthetic settlement: create 1 baht, sync, Delete, sync',cashDeltaCreated:-1,cashDeltaAfterDelete:0,availableDeltaCreated:-1,availableDeltaAfterDelete:0,relatedCountBefore:2,relatedCountAfter:2,sourceFactsRetained:true},
  {id:'REV-GUI-02',result:'Passed',case:'Pending synthetic settlement: create 1 baht, sync, Delete, sync',cashDeltaCreated:0,cashDeltaAfterDelete:0,pendingAmountCreated:1,pendingAmountAfter:0,sourceFactsRetained:true},
  {id:'REV-SQL-01',result:'Passed',case:'Isolated V19 fixture followed by V20/V21: exact holder balance and historical snapshot restoration, source retention, retry, reopen/delete rejection, reservation release/reuse and no history backfill',runner:'scripts/database/Test-Migrations.ps1',sql:'scripts/database/Test-R005Reversal.sql'},
  {id:'REV-UI-01',result:'Passed',case:'Only Delete added, trash icon, confirmation, forms offer Pending/Completed, filtered rows absent after sync, cash dashboard restored'},
  {id:'REV-DIAG-01',result:'Partial',case:'Both current editors show No issues found; deployment-check rerun absent in deployed-state current editor'}],
 limitations:['Current app sync is required to refresh SQL-derived cash and remove the filtered row from an already-open detail.','Existing failed physical-delete requests on other devices are not rewritten by this update.','No new concurrency suite: existing shared expense-allocation advisory lock is unchanged.','No PROD edits, owner acceptance or production authorization.'],readiness:'Not ready: existing full-release deployment-check and notification-delivery verification remain open'};
await fs.writeFile(`${out}/reversal-test-results.json`,JSON.stringify(report,null,2)+'\n');
const diff=await read('dev-olap-reversal-save2-diff');
assert.deepEqual(diff.changes.map(c=>c.path).sort(),['Action/Settlements/Delete Settlement/With these properties/Assignments/1/ColumnToEdit','App/Version'].sort());
assert.equal(diff.changes.find(c=>c.path.includes('Assignments')).after.value,'Notes');
const candidate=await read('dev-olap-reversal-save2');
const action=candidate.tables.find(t=>t.rows[0][0]==='Action name'&&t.rows[0][1]==='Delete Settlement');
const props=Object.fromEntries(action.rows); const assignments=JSON.parse(props['With these properties']).Assignments;
assert.deepEqual(assignments.map(a=>a.ColumnToEdit),['Status','Notes']);
assert.equal(props['Display name'],'"Delete"');
assert.equal(candidate.tables.filter(t=>t.rows[0][0]==='Action name'&&/cancel settlement/i.test(t.rows[0][1])).length,0);
const inventory=[];
let schema='';
for(const t of candidate.tables){
 const [kind,name]=t.rows[0]; if(kind==='Schema Name')schema=name;
 const id=kind==='Column name'?`Column/${schema}/${name}`:kind==='Action name'?`Action/${Object.fromEntries(t.rows)['For a record of this table']}/${name}`:`${kind}/${name}`;
 if(['Table name/Settlements','Column/Settlements_Schema/Status','Column/Partners_Schema/Total Settlement Created','Action/Settlements/Delete Settlement'].includes(id)) inventory.push({object:'OLAP '+id,property:'R005 Delete refinement: exact saved configuration',value:JSON.stringify(Object.fromEntries(t.rows))});
}
inventory.push({object:'SQL Settlements',property:'R005 Delete reversal',value:'V21__settlement_delete_reversal.sql: guard_settlement_reversal / settlement_reversal_guard; validate_net_settlement excludes Cancelled; refresh_reversed_settlement_analytics / zz_settlement_reversal_analytics refresh existing snapshots. Original facts retained, V20 removes derived cash. No new columns/tables.'});
inventory.push({object:'OLAP Action/Settlements/Delete',property:'R005 Delete refinement: system action removal',value:'Absent from final saved export because Settlements permits ADDS_AND_UPDATES. Physical DELETE is blocked by SQL; visible replacement Delete writes Status and Notes. No Cancel Settlement action exists.'});
await fs.writeFile(`${out}/reversal-model-inventory.json`,JSON.stringify(inventory,null,2)+'\n');
const previous=await read('configuration-checklist');
const fullDiff=await read('dev-olap-reversal-candidate-diff');
const batches=await Promise.all(['dev-olap-reversal-save1-diff','dev-olap-reversal-save2-diff'].map(async name=>({name:name+'.json',data:await read(name)})));
const rows=previous.rows.filter(r=>r.app==='oltp');
for(const c of fullDiff.changes){
 const old=previous.rows.find(r=>r.id===c.id);
 const evidence=[...new Set([...(old?.perSaveEvidence||[]),...batches.filter(b=>b.data.changes.some(x=>x.id===c.id)).map(b=>b.name)])];
 assert.ok(evidence.length,c.path);
 const changed=batches.some(b=>b.data.changes.some(x=>x.id===c.id));
 rows.push({...old,...c,sourceVersion:fullDiff.before.version,candidateVersion:fullDiff.after.version,candidateArtifact:fullDiff.after.file,perSaveEvidence:evidence,
  disposition:c.path==='App/Version'?'Version metadata; no independent PROD edit':changed?'R005 owner-requested Delete reversal':old.disposition,
  intendedProd:c.path==='App/Version'?{operation:'No independent edit; retain PROD baseline configuration'}:changed?c.after:old.intendedProd,
  devStatus:changed?'Verified saved values and current-GUI reversal tests; export icon blank supplemented by observed trash icon':old.devStatus,
  prodStatus:'Pending; no production authorization or write',actualProdBefore:null,savedProdObserved:null});
}
await fs.writeFile(`${out}/reversal-configuration-checklist.json`,JSON.stringify({release:'R005',candidate:'V21 / OLTP 1.000120 / OLAP 1.000123',status:'Not frozen; full-release readiness checks remain open',counts:{discovered:rows.length,mapped:rows.length,unmapped:0},coverage:'Full release baseline-to-current exported property diff, including prior R005 changes. Omitted settings remain subject to approved limited coverage exception.',rows},null,2)+'\n');
await fs.writeFile(`${out}/reversal-save-reconciliation.json`,JSON.stringify({release:'R005',batches:batches.map(b=>({file:b.name,...b.data.counts,before:b.data.before.version,after:b.data.after.version})),unmapped:0,intermediate:'1.000121 had its second assignment incorrectly targeting Status. Saved 1.000123 corrects it to Notes; no test writes used the incorrect action. AppSheet advanced through 1.000122 during the coherent save/reload batch; its separate definition was not captured, so intermediate coverage remains explicitly unverified.',editorSupplement:{action:'Delete Settlement',display:'Delete',icon:'fas fa-trash-alt',iconLabel:'trash-alt (Solid)',exportIcon:'',verified:'Editor tree and runtime display a trash icon; underlying selection observed in editor before save.'}},null,2)+'\n');
for(const app of ['olap','oltp']){
 const file=`reversal-final-${app}-editor.txt`;
 try {await fs.writeFile(`${out}/${file}`,(await fs.readFile(`${priv}/${file}`,'utf8')).trimEnd()+'\n');} catch(e){if(e.code!=='ENOENT')throw e;}
}
console.log(JSON.stringify({guiAssertions:'passed',modelRecords:inventory.length,sqlMigrationSha256:crypto.createHash('sha256').update(await fs.readFile('database/migrations/V21__settlement_delete_reversal.sql')).digest('hex')}));
