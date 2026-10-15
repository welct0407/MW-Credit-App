import fs from 'node:fs/promises';
const edit=async(p,fn)=>{const s=await fs.readFile(p,'utf8');await fs.writeFile(p,fn(s));};
const report='[production verification and recovery](../outputs/r005-20260917/PRODUCTION_REPORT.md)';
const closure=`## R005 released — 18 September 2026\n\nPROD **OLTP 3.000172 / OLAP 1.100122 / SQL V21**, pinned implementation **2054384**, package R005-P1. Owner acceptance and production authorization are recorded; the latest instruction excludes deployment-check advisories and keeps DEV Prototype. All 2,408 core properties and 20 dashboard items match independent saved PROD readback. Both final PROD editors show No issues found; focused GUI and read-only SQL checks passed. No history backfill or DEV opening/test data was promoted. See ${report}. Earlier readiness/authorization statements below are dated historical checkpoints, superseded by this release.\n\n`;
await edit('Change Logs/CHANGE_NOTES_R005_2026-09-17.md',s=>{const n=s.indexOf('\n');return s.slice(0,n+1)+'\n'+closure+s.slice(n+1);});
await edit('Documents/Release_Tracker.md',s=>{
 s=s.replace('Current recorded production baseline: R004, preserving released R002/R003.','Current recorded production baseline: R005, preserving released R002/R003/R004.');
 const a=s.indexOf('**R005 owner acceptance/production authorization'),b=s.indexOf('| Release |',a);s=s.slice(0,a)+closure+s.slice(b);
 return s.replace(/^\| \*\*R005\*\*.*$/m,'| **R005** | **Cash custody and reversal.** OLAP ledger/transfers, source receiver/payer, shared SQL balances, settlement Delete reversal, OLTP nonzero cash deck, orange capital limit and Collection due fix. DEV opening fixtures excluded. | **Released** | Accepted, authorized and deployed 2026-09-18 | R005-P1; PROD **OLTP 3.000172 / OLAP 1.100122 / SQL V21**; pinned **2054384**. 2,408 core properties + 20 dashboard items verified, zero mismatches; both editors No issues found. Deployment advisories excluded by explicit owner instruction. [Evidence and rollback](../outputs/r005-20260917/PRODUCTION_REPORT.md), [history](../Change%20Logs/CHANGE_NOTES_R005_2026-09-17.md). |');
});
await edit('Documents/Development_Changes.md',s=>s.replace('## R005 DEV implementation — 18 September 2026',closure+'## Historical R005 DEV checkpoints — 18 September 2026').replace('## Current differences','## Historical differences — 16 September checkpoint'));
await edit('Documents/Environment_Inventory.md',s=>{
 const a=s.indexOf('Updated 18 September'),b=s.indexOf('## App identities',a);
 s=s.slice(0,a)+'Updated 18 September 2026 after R005 promotion. PROD is V21 / OLTP 3.000172 / OLAP 1.100122. DEV is V21 / live OLTP 1.000131 / OLAP 1.000128, both Prototype; accepted business definitions were 1.000125 / 1.000123 before diagnostic-only mode transitions. The databases retain the same database name; instance/host establish identity. '+report+'.\n\n'+s.slice(b);
 s=s.replace('| 3.000156 | database-2 | 10 |','| 3.000172 | database-2 | 12 |').replace('| 1.100106 | database-2 | 13 |','| 1.100122 | database-2 | 16 |').replace('| 1.000125 | database-3 |','| 1.000131 | database-3 |').replace('| 1.000123 | database-3 |','| 1.000128 | database-3 |');
 return s.replace(/^\| Flyway \|.*$/m,'| Flyway | V21 migrated and validated | V21 migrated and tested | R005 cash custody and settlement reversal; no DEV data copied |');
});
await edit('Documents/AppSheet_Data_Model_Overview.md',s=>{
 s=s.replace('## R005 development implementation — 18 September 2026',closure+'## R005 current production model');
 s=s.replace('**Latest dashboard refinement: DEV V21 / OLTP 1.000125 / OLAP 1.000123.**','**PROD V21 / OLTP 3.000172 / OLAP 1.100122.**');
 s=s.replace('Twelve workbook rows supersede earlier availability/formula statements. Current delta governance supersedes historical export-coverage gates; unavailable deployment-check rerun still leaves R005 Not ready. Earlier paragraphs below are dated checkpoints.','Production workbook inventories now reflect the independently verified saved definitions.');
 s=s.replace('**Delete refinement checkpoint: DEV V21 / OLAP 1.000123 / OLTP 1.000120.**','**Settlement Delete behavior, promoted through SQL V21.**');
 const a=s.indexOf('**DEV implemented and GUI tested; Not ready to promote.**'),b=s.indexOf('The owner moved cash custody entry',a);if(a>=0)s=s.slice(0,a)+s.slice(b);
 const c=s.indexOf("The workbook's **Dev Differences** contains 103 R005"),d=s.indexOf('## R004 production release',c);if(c>=0)s=s.slice(0,c)+'The workbook production inventory records the affected saved tables, columns, rules, relationships, slices and database metadata. R005 DEV checkpoint rows remain labeled historical. Exact current properties and source evidence are in `outputs/r005-20260917/production-package.json` and `production-saved-readback.json`.\n\n'+s.slice(d);
 return s;
});
await edit('outputs/r005-20260917/PRODUCTION_PREFLIGHT.md',s=>s.replace('**Production SQL V20/V21 applied successfully at 10:36 Bangkok; AppSheet promotion in progress.**','**Released: SQL V21 / OLTP 3.000172 / OLAP 1.100122.** See [final production verification](PRODUCTION_REPORT.md).').replace('## Execution and recovery order once the gate is resolved','## Recorded execution and recovery order').replace('Post-migration validate remains required.','Post-migration validate passed; see production-validate.json.'));
console.log('R005 release records reconciled');
