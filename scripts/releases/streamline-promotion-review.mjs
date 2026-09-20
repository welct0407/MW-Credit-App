// Inspect first; then edit the existing review workbook, preserving owner feedback.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {FileBlob, SpreadsheetFile} from '@oai/artifact-tool';
const dir=path.resolve('outputs/promotion-checklist-review-20260920');
const file=path.join(dir,'DEV_to_PROD_Promotion_Checklist_REVIEW.xlsx');
const tmp=path.join(dir,'.tmp'); await fs.mkdir(tmp,{recursive:true});
const bytes=await fs.readFile(file), hash=crypto.createHash('sha256').update(bytes).digest('hex');
const wb=await SpreadsheetFile.importXlsx(await FileBlob.load(file));
const main=wb.worksheets.getItem('Promotion'), docs=wb.worksheets.getItem('Documents');
if(process.argv[2]!=='--apply'){
  const snapshot={hash,promotion:main.getRange('A11:H67').values,documents:docs.getRange('A11:G31').values};
  await fs.writeFile(path.join(tmp,'before-streamline.json'),JSON.stringify(snapshot,null,2));
  await fs.writeFile(path.join(tmp,'before-streamline.xlsx'),bytes);
  const image=await wb.render({sheetName:'Promotion',range:'A1:F14',scale:1,format:'png'});
  await fs.writeFile(path.join(tmp,'before-streamline.png'),new Uint8Array(await image.arrayBuffer()));
  console.log(JSON.stringify({hash,activityCount:snapshot.promotion.filter(r=>r[0]).length,documents:snapshot.documents.length,feedback:snapshot.promotion.concat(snapshot.documents).filter(r=>!['Review',null,''].includes(r[5])||r[6]),preview:path.join(tmp,'before-streamline.png')}));
  process.exit(0);
}
const before=JSON.parse(await fs.readFile(path.join(tmp,'before-streamline.json'),'utf8'));
if(before.hash!==hash)throw Error('Workbook changed since inspection; inspect and reconcile before editing.');

// Old IDs remain traceable; rows are consolidated, not silently dropped.
const groups=[
  [[1,2,3,12],'A Readiness','Always','Confirm Rnnn scope, integrated DEV features/PROD fixes, dependencies and app Upgrade/Unchanged decisions. Reuse the existing manifest/log and DEV/model checkpoint; resolve unrelated unreleased work. Record readiness/owner acceptance.','Workflow A; AGENTS §5–6'],
  [[10,11],'A Readiness','Always; reuse passing evidence','Accept recorded integrated DEV tests and both apps’ final zero-warning/error diagnostics. Rerun only checks invalidated by changed behavior, dependencies or data. No new full regression or live audit merely to start promotion.','Workflow A; Test selection'],
  [[6,7],'A Readiness','First use / guard changed','Install/test scheduled guards in DEV before copy, including child calls and per-row filters. Prove canonical DEV allowed and harmless copy excluded in scheduled context. Reuse this proof in later releases.','Workflow: Scheduled guard'],
  [[8,9],'A Readiness','DEV setup / routing changed','Use DEV preparation only for missing/changed setup: DEV sources/links, owner-only Partner delivery data, distinct Login Email and initial deployment if needed. Keep audit fields and channels. Unmapped actors must be resolved for affected tests.','DEV preparation; AGENTS §2'],
  [[4,5,15],'A Readiness','SQL changes','Reuse completed Flyway-chain/DEV tests and old/new-app compatibility evidence, including relevant queued clients/locks. Pin the clean tested commit with New-Release.ps1 before DEV advances; include every pending migration/prerequisite.','Database: Each change 1–5'],
  [[13,20,21,35],'B Capture','Always; app details if upgrading','Record PROD identities/baseline, restorable app versions and cutover/recovery order once. Confirm scoped authority before PROD effects; reuse existing approval and App Upgrade eligibility. Recheck eligibility only after access/plan changes.','Workflow B2, C, E1–2'],
  [[14,16,17,19],'B Capture','App Upgrade; SQL-only pins above','Briefly freeze DEV, pin tested versions/commit and copy included definitions to named Rnnn-RCk apps. Record IDs/internal names and restrict execution from creation. Resume DEV once independent copies/pins are verified. Never copy DEV financial data to PROD.','Workflow B1–3, B5; RC containment'],
  [[22,23,24],'C SQL','SQL changes / DB writes','Verify restorable DB backup, schema drift and history; then validate/migrate/validate with the pinned manifest and existing runner. Record target/schema checks and before/after SQL versions. Complete compatible SQL before final RC PROD validation.','Database: Each change 6–7'],
  [[25],'D RC','App Upgrade','Rebind/reconcile every RC table/view and auxiliary source to PROD host/database/object. Save exact mappings once. No DEV source remains. Keep RC contained before PROD binding.','Workflow D1; RC containment'],
  [[18,26,27],'D RC','App Upgrade','Apply the corresponding PROD theme/branding and PROD companion links. Keep shared recipients on PROD contact data; confirm Login Email prerequisites. Restore only documented legacy DEV overrides. Verify these substitutions once.','Workflow B4, D2; AGENTS §6.2'],
  [[28],'D RC','External asset / access changes','Provision/check only affected templates, files, grants, endpoints and integrations outside App Upgrade. Link existing evidence for unchanged assets.','Workflow: External dependencies'],
  [[29],'D RC','App Upgrade','Check copied guard coverage and this RC’s exact name exclusion; retain canonical DEV/PROD literals and intended bot states/schedules. Reuse runtime proof; no repeated diagnostic app or wait for every daily job.','Workflow: Scheduled guard'],
  [[30,31,32],'D RC','App Upgrade','One RC validation pass: save/reload, editor data validation, zero issues, open/sync and representative changed screens. Resolve unexpected generated changes only. Complete initial Deployment Check and deploy new RC; reuse DEV business tests.','Workflow D3–4; App modes'],
  [[33,34,36],'E Upgrade','App Upgrade','Freeze final deployed RC identity/version and mapping evidence. Confirm authorization covers that revision. Immediately before each upgrade, confirm unchanged PROD baseline and frozen RC version; drift/fixes require a new integrated RC.','Workflow D5, E1–3'],
  [[37],'E Upgrade','Each included app','App Upgrade the existing PROD ID from the frozen RC’s full internal name in planned order. Record source, target and before/after versions. Confirm success before dependent steps; never hand-recreate settings in PROD.','Workflow E3–4'],
  [[39,40,42,43,44],'F Validate','Always; mappings if upgraded','One PROD pass: verify version/Deployed state, sources/substitutions, PROD-allowed/RC-excluded guards, both editors clear and both apps open/sync with changed entry points. Check recipients only if changed. Reuse DEV tests; no repeat Deployment Check.','Workflow F1–3; AGENTS §6.4'],
  [[41],'F Validate','Uncovered SQL / critical / external effects','Run only targeted checks not already covered by SQL/RC/PROD evidence. At first guard introduction observe the next normal PROD run; later releases reuse proof. Record execution/delivery limits; no forced writes/notifications without scoped authority.','Workflow F2–3; Guard 5–7'],
  [[38],'F Validate','Paused jobs / cutover steps','Complete approved external cutover steps and resume temporary pauses. Keep integrity triggers and one active scheduler per job/environment.','Workflow E4; AGENTS §2'],
  [[45],'G Close','Always','Complete Documents dispositions, checking the file inventory once for new/moved paths. Update/verify the three Always records plus triggered documents; batch-classify untouched conditional/history rows with brief reasons, without rereading their contents.','Promotion Documentation Checklist'],
  [[46,47],'G Close','Always','Reconcile final manifest/log, versions, tests/approval and recovery links. Close only promoted differences; update affected model overview/dictionary together. Run relevant document checks and review intended Git diff once; exclude private data.','Workflow F5; AGENTS §5'],
  [[48],'G Close','Always','Commit/push final sanitized evidence/docs; create/push unique annotated Rnnn tag at that evidence commit. Verify remote branch/tag. Do not move tags or redeploy to fix publication.','Workflow F6; AGENTS publication'],
  [[49],'G Close','RC exists','Record RC retention/recovery window and keep execution contained without changing frozen definitions. No automatic RC deletion or DEV refresh.','Workflow F7; Recovery: RC retention'],
  [[50],'G Close','Always','Report Released only after required validation, documentation and publication pass. Give versions, evidence/tag, rollback and limitations. Otherwise state the incomplete phase; repair documents without repeating live tests.','Workflow F4–7'],
  [[51,52,53,54,55,56,57],'X Exception','Failure / drift / required gap only','Stop affected dependent steps, record actual partial state and follow only the matching recovery branch. Preserve later writes/work; no blind replay or manual PROD fallback. Ask only for missing authority/material decisions. Reconcile resulting status and documents.','Release Recovery Runbook; AGENTS working method']
];
const assigned=groups.flatMap(g=>g[0]);
if(assigned.length!==57||new Set(assigned).size!==57||assigned.some(i=>i<1||i>57))throw Error('Old-step coverage mismatch');
const byId=new Map(before.promotion.map(r=>[r[0],r]));
const pid=n=>'P'+String(n).padStart(2,'0');
const rows=groups.map(([old,stage,when,action,source])=>{
  const prior=old.map(n=>byId.get(pid(n)));
  if(prior.some(r=>!r))throw Error('Missing old row');
  const feedback=prior.filter(r=>r[6]||!['Review',null,''].includes(r[5])||r[4]!=='Not started');
  const note=feedback.map(r=>`${r[0]}: ${r[5]||'Review'}; ${r[4]||''}; ${r[6]||''}`).join('\n');
  return [pid(old[0]),stage,when,action,'Not started',feedback.length?'Revise':'Review',note,source];
});
const descriptions=[
 'Always: release status, dates, manifest/checklist, final versions and publication/rollback links.',
 'Always: final app/SQL versions, identities, relevant environment mappings and RC retention link.',
 'Always: record DEV checkpoint and close only promoted differences; preserve later DEV and dated history.',
 'Model/formula changes: update affected PROD summary and DEV annotations, paired with dictionary.',
 'Model/formula changes: update exact affected rows/expressions and DEV differences; preserve other sheets.',
 'Operational behavior changed: update affected workflow narrative; reconcile its diagram.',
 'Process flow changed: update affected diagram nodes/decisions only, matching narrative.',
 'Systems/ownership/integration flows changed: update affected architecture narrative.',
 'Architecture flows changed: update affected diagram only, matching narrative.',
 'Analysis/export contract, schedule, recipients or enablement changed: update affected content/evidence.',
 'Business/design principles or reporting ownership changed: update affected design decisions.',
 'Document names, purposes or authority changed: update index links/descriptions.',
 'Promotion procedure changed: update methodology; no routine release history here.',
 'DEV setup/isolation procedure changed: update affected instructions, not routine versions.',
 'Refresh/recovery method changed: update affected instructions; no automatic refresh.',
 'Historical plan: preserve; do not treat old pending items as current blockers.',
 'Historical migration runbook: preserve; not a current PostgreSQL procedure.',
 'Historical model: preserve; current model belongs in DOC-004/005.',
 'Historical workbook: preserve byte-for-byte; never edit instead of current dictionary.',
 'Documents inventory/ownership changed: classify new/moved paths and update triggers.',
 'Recovery/hotfix/retention procedure changed: update method; release-specific recovery stays in manifest/log.'
];
if(before.documents.length!==descriptions.length)throw Error('Document inventory changed; reconcile it first.');

main.tables.items[0].delete();
main.getRange('A11:H67').clear({applyTo:'all'});
main.getRange('E11:E67').dataValidation=null;
main.getRange('F11:F67').dataValidation=null;
main.getRange('A11:H67').conditionalFormats.clear();
const last=rows.length+10;
main.getRange(`A11:H${last}`).values=rows;
const table=main.tables.add(`A10:H${last}`,true,'PromotionTasks');table.showFilterButton=true;
main.getRange(`A11:H${last}`).format={font:{name:'Arial',size:11,color:'#233448'},verticalAlignment:'top',wrapText:true};
main.getRange('A10:H10').format={fill:'#253B53',font:{name:'Arial',size:11,bold:true,color:'#FFFFFF'},wrapText:true,horizontalAlignment:'center',verticalAlignment:'center',rowHeight:34};
main.getRange(`E11:G${last}`).format.fill='#FFF4CC';
main.getRange(`E11:E${last}`).dataValidation={rule:{type:'list',values:['Not started','In progress','Done','Reused','N/A','Blocked']}};
main.getRange(`F11:F${last}`).dataValidation={rule:{type:'list',values:['Review','Keep','Revise','Remove','Add']}};
main.getRange(`E11:E${last}`).conditionalFormats.add('containsText',{text:'Blocked',format:{fill:'#FAD8D8',font:{bold:true,color:'#9B1C1C'}}});
main.getRange(`F11:F${last}`).conditionalFormats.add('containsText',{text:'Revise',format:{fill:'#FFE1B2'}});
main.getRange(`F11:F${last}`).conditionalFormats.add('containsText',{text:'Remove',format:{fill:'#FAD8D8'}});
const widths=[65,132,190,590,108,118,300,190];
rows.forEach((r,i)=>{
  const lines=Math.max(...r.map((v,c)=>String(v||'').split('\n').reduce((a,t)=>a+Math.max(1,Math.ceil(t.length/(widths[c]/7.5))),0)));
  main.getRange(`A${i+11}:H${i+11}`).format.rowHeight=Math.max(52,lines*14+16);
  main.getRange(`A${i+11}:D${i+11}`).format.fill=i%2===0?'#EFF3F7':'#FFFFFF';
  if(i&&r[1]!==rows[i-1][1])main.getRange(`A${i+11}:H${i+11}`).format.borders={top:{style:'medium',color:'#A2B4C6'}};
});
// Clear obsolete row heights below the shortened table without shifting either sheet.
main.getRange(`A${last+1}:H67`).format.rowHeight=15;
const intro=[
 'REVIEW DRAFT. 24 consolidated activities. Conditional rows run only when triggered; unchanged evidence is reused.',
 'Choose Keep / Revise / Remove, edit text or add rows. IDs retain the earlier checklist references; gaps are intentional.',
 'Use one manifest/log and one evidence link per result. Batch related reads/saves/checks; no duplicate narrative or gate report.',
 'Confirm existing approvals, identities and tests once; recheck only the pre-upgrade baseline/version or a changed dependency.',
 'No routine full-app diff, repeated DEV suite, repeated deployment check, recipient audit or reread of unaffected documents.',
 'Done/Reused needs evidence; N/A needs a reason. This remains a draft until adopted into AGENTS/runbooks after review.'
];
intro.forEach((v,i)=>main.getRange(`A${i+4}`).values=[[v]]);
docs.getRange('D11:D31').values=descriptions.map(s=>[s]);
docs.getRange('A4').values=[['Keep one disposition per document. Batch-classify unchanged Conditional/Historical rows; read only triggered content.']];
docs.getRange('A6').values=[['Historical: preserve without content reread unless explicitly in scope. No routine diagram redraw or model workbook rebuild.']];
docs.getRange('A9').values=[['Source: Promotion_Documentation_Checklist.md. Shortened wording retains its existing applicability rules.']];
descriptions.forEach((s,i)=>{
  const filename=String(before.documents[i][1]);
  const lines=Math.max(Math.ceil(s.length/(620/7.5)),Math.ceil(filename.length/(345/7.5)));
  docs.getRange(`A${i+11}:G${i+11}`).format.rowHeight=Math.max(52,lines*14+16);
});
wb.recalculate();
// Feedback, document identities/dispositions and both sheet structures must survive.
const afterDocs=docs.getRange('A11:G31').values;
before.documents.forEach((r,i)=>{for(const c of [0,1,2,4,5,6])if((r[c]??'')!==(afterDocs[i][c]??''))throw Error('Document field changed outside scope');});
console.log((await wb.inspect({kind:'table',range:'Promotion!A10:F13',include:'values',tableMaxRows:4,tableMaxCols:6,maxChars:1900})).ndjson);
console.log((await wb.inspect({kind:'match',searchTerm:'#REF!|#DIV/0!|#VALUE!|#NAME\\?|#NUM!',options:{useRegex:true,maxResults:5},summary:'Final error scan'})).ndjson);
for(const [sheet,range,name] of [['Promotion','A1:F16','streamlined-top'],['Promotion','A25:F34','streamlined-close'],['Documents','A10:F17','streamlined-docs']]){
 const preview=await wb.render({sheetName:sheet,range,scale:1,format:'png'});
 await fs.writeFile(path.join(tmp,name+'.png'),new Uint8Array(await preview.arrayBuffer()));
}
const staged=path.join(tmp,'streamlined.xlsx');
await(await SpreadsheetFile.exportXlsx(wb)).save(staged);
await fs.copyFile(staged,file);
const oldWords=before.promotion.map(r=>r[3]).join(' ').split(/\s+/).length;
const newWords=rows.map(r=>r[3]).join(' ').split(/\s+/).length;
const inventory={draft:true,sourceCommit:'34106853212e382c9aedf8c5120f8cb6a9d6851e',activities:rows.length,documents:afterDocs.length,activityIds:rows.map(r=>r[0]),documentIds:afterDocs.map(r=>r[0]),consolidation:groups.map(g=>({id:pid(g[0][0]),replaces:g[0].map(pid)})),wordCounts:{oldActivityText:oldWords,newActivityText:newWords},approach:'Reuse unchanged evidence; conditional setup/SQL/external/recovery only. Documents applicability retained.'};
await fs.writeFile(path.join(dir,'review-inventory.json'),JSON.stringify(inventory,null,2)+'\n');
console.log(JSON.stringify({activities:rows.length,documents:afterDocs.length,oldWords,newWords,reduction:Math.round((1-newWords/oldWords)*100)+'%',feedbackPreserved:true}));
