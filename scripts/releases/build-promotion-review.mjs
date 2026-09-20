// Historical first-draft builder (57 rows). The reviewed workbook was streamlined
// by streamline-promotion-review.mjs; do not use this to replace that workbook.
// Never overwrite an owner-edited workbook.
import fs from 'node:fs/promises';
import path from 'node:path';
import { Workbook, SpreadsheetFile } from '@oai/artifact-tool';
import { documentationRows } from './documentation.mjs';

const out = path.resolve('outputs/promotion-checklist-review-20260920');
const target = path.join(out, 'DEV_to_PROD_Promotion_Checklist_REVIEW.xlsx');
await fs.mkdir(out, { recursive: true });
await fs.mkdir(path.join(out, '.tmp'), { recursive: true });
try { await fs.access(target); throw new Error('Output exists. Preserve owner edits; choose a new review revision.'); }
catch (e) { if (e.code !== 'ENOENT') throw e; }

// Stage, applicability, action and completion criterion, source.
const steps = [
  ['A Readiness','Always','Confirm the reserved Rnnn, included changes, dependencies and acceptance criteria. Mark each app Upgrade or Unchanged; identify SQL and external scope.','AGENTS: tracking; Workflow A'],
  ['A Readiness','Always','Read continuation, manifest, log and affected evidence; reuse completed checks. Preserve other tasks’ work. If readiness fixes require edits, record the starting Git commit, affected restorable app versions and applicable DB recovery first.','AGENTS: working method; §4'],
  ['A Readiness','Always','Confirm integrated DEV includes every release feature and prior PROD fix, with no unrelated unreleased configuration. Resolve scope/dependency conflicts before RC copy.','Workflow A1–4'],
  ['A Readiness','SQL changes','Verify immutable, ordered Flyway migrations and justified/approved new tables or columns. Confirm migration-chain, DEV migrate/validate and affected SQL tests passed from the intended candidate.','Database: Each change 1–4'],
  ['A Readiness','SQL / compatibility impact','Verify old/new apps, mixed OLTP/OLAP states and relevant offline/queued clients work with expanded SQL. Record migration locks/backfills, deployment order and any reviewed maintenance window.','Recovery: Before promotion'],
  ['A Readiness','New/changed guards or app IDs','Establish scheduled guards in DEV before RC copy. Use exact canonical DEV/PROD internal names. Guard all scheduled side effects and child calls; add the guard to existing per-row filters. Preserve intended states/schedules.','Workflow: Scheduled guard 1–4'],
  ['A Readiness','First use / invalidated guard proof','Prove guard behavior in server-side scheduling using deployed DEV and a harmless DEV-bound copy. Show allowed DEV and excluded copy; retire diagnostics. Later releases reuse valid runtime evidence.','Workflow: Scheduled guard 5–7'],
  ['A Readiness','Setup / changed notification routes','Verify DEV-only sources/links/delivery and affected external routes. For R009, preserve distinct Login Email, set DEV delivery Email to owner, exclude recorded actor by Partner ID, deduplicate nonblank addresses. Investigate unmapped actors. Reuse untouched routing evidence.','AGENTS §2; DEV preparation'],
  ['A Readiness','DEV not yet Deployed / replacement','After isolation and guards are ready, complete initial DEV deployment checks and mark apps Deployed. Already-Deployed apps need no repeat check or mode toggle.','Workflow: App mode rules'],
  ['A Readiness','Always; reuse valid results','Confirm integrated DEV tests cover changed behavior and consumers in the current GUI. Include relevant normal/boundary/retry/financial paths and SQL reconciliation. Rerun only invalidated checks; distinguish configuration, execution and delivery evidence.','Workflow: Test selection'],
  ['A Readiness','Always','Record both DEV apps’ final saved versions and zero editor warnings/errors, including pre-existing issues. Resolve defects; do not hide or waive the editor gate.','Workflow A5; warning rules'],
  ['A Readiness','Always','Reconcile concise scope/change record, DEV checkpoint and affected model overview/dictionary. State Ready, Conditional or Not ready with open checks. Record owner acceptance separately from deployment authority.','Workflow A5; AGENTS §5–6'],
  ['B Capture','App Upgrade scope','Confirm App Upgrade availability, ownership and copy prerequisites. Record existing PROD target IDs, app order, window and recovery approach. Avoid discovering eligibility after PROD changes.','Workflow B2'],
  ['B Capture','Always','Briefly freeze affected shared DEV edits. Pin tested app/SQL versions, implementation commit, scope revision, test references and recovery. Record unchanged companion apps explicitly.','Workflow B1'],
  ['B Capture','SQL changes','From the clean tested commit, run New-Release.ps1 before later DEV migrations advance. Retain original private manifest and publish sanitized hashes/target. Account for every pending migration and approved prerequisite.','Database: Each change 5'],
  ['B Capture','App Upgrade scope','Copy included integrated DEV definitions to MW-OLTP-Rnnn-RCk / MW-OLAP-Rnnn-RCk. Record complete internal names, UUIDs, versions, copy options and time. Do not copy DEV financial data to PROD.','Workflow B3'],
  ['B Capture','App Upgrade scope','Contain RC from creation: restricted access, no uncontrolled writes/delivery or external execution. Keep it DEV-bound with affected jobs paused if guard proof is missing. PROD-bound tests need scoped authority.','Workflow: RC containment'],
  ['B Capture','App Upgrade scope','Capture each corresponding PROD theme/branding separately; apply it after DEV-to-RC copy. Check exact saved colors and appearance, display name/icon. Preserve all four DEV/PROD themes; no DEV/RC branding leaks into PROD.','Workflow B4'],
  ['B Capture','Always','Confirm captures and migration pins are independent and reproducible, then release the DEV edit freeze. Later DEV work must not change this candidate or its validation baseline.','Workflow B5'],
  ['C PROD database','Before PROD writes / RC PROD effects','Confirm existing scoped owner authorization covers the package, SQL and RC production effects. Record approval reference; request only missing scope. No forced financial tests or notifications without their own coverage.','Workflow C; AGENTS §1'],
  ['C PROD database','Always','Verify actual PROD host/instance and app identities against inventory; record current SQL/app baseline and dependencies. For no-SQL releases record migrations N/A; do not create empty migrations.','Workflow C'],
  ['C PROD database','SQL changes / PROD DB writes','Establish a verified restorable PROD backup and recovery reference. Inspect expected pre-release schema versus live drift and Flyway history/checksums. Stop on unexplained drift; validate alone is insufficient.','Database: Each change 6'],
  ['C PROD database','SQL changes','Use the existing production Flyway runner from the pinned clean commit/original manifest: validate, migrate, validate. Include approval/backup references. Never repair, clean, edit checksums or skip migrations to conceal drift.','Database: Each change 7'],
  ['C PROD database','SQL changes','Confirm target history/schema/objects with relevant read-only SQL checks. Record pre-migration and post-migration versions. Compatible migrations must succeed before final RC PROD-source validation.','Workflow C'],
  ['D RC preparation','App Upgrade scope','Rebind and reconcile every RC table/view/source to PROD. Verify host, database, schema and object, plus auxiliary/file/internal sources. No DEV source remains in the production definition.','Workflow D1'],
  ['D RC preparation','App Upgrade scope','Set inter-app links to the actual PROD OLTP/OLAP pair, never DEV or RC companions. Verify saved mappings and navigation without submitting production actions.','Workflow D2'],
  ['D RC preparation','App Upgrade scope','Keep R009 shared recipient expressions and verify PROD Login Email schema/actor mapping prerequisites. RC reads PROD contact data. Restore only remaining documented legacy DEV overrides; never restore superseded email-based actor exclusion.','AGENTS §6.2; Workflow D2'],
  ['D RC preparation','Affected external assets / access','Verify/provision production templates, files, endpoints, access grants and integrations that App Upgrade does not transfer. Record external steps and destinations once, without secrets.','Workflow: RC external dependencies'],
  ['D RC preparation','App Upgrade scope','Verify copied scheduled guards retain exact canonical DEV/PROD names, exclude this RC and precede every scheduled business effect. Preserve intended enabled/retired states and schedules. Reuse valid first-use proof.','Workflow: Scheduled guard'],
  ['D RC preparation','App Upgrade scope','Save/reload and run current-editor data validation. Check source/Ref/security/type/permission integrity and affected generated metadata; resolve zero editor issues. Investigate unexpected copy/regeneration changes only.','Workflow D3–4'],
  ['D RC preparation','App Upgrade scope','Perform basic RC open/sync, access and affected-screen checks. Reuse DEV business tests; inspect/cancel forms. Record real limitations; no full suite, whole-app diff or forced production delivery.','Workflow D3–4; RC containment'],
  ['D RC preparation','New RC','With containment verified, complete initial RC Deployment Check, resolve findings and mark it Deployed. Do not toggle an already-Deployed app to rerun a check.','Workflow: App mode rules'],
  ['D RC preparation','App Upgrade scope','Freeze final deployed RC UUID/internal name/version, mappings/substitutions, guard evidence, tests and package revision in the manifest. Set ready-immutable only now. Later fixes require a new RC and affected retesting.','Workflow D5'],
  ['E App Upgrade','Always','Confirm owner acceptance and production authorization cover the final package, named RC revisions, SQL and remaining operational steps. Reuse valid prior authorization; a manifest entry is not approval.','Workflow E1'],
  ['E App Upgrade','App Upgrade scope','Record PROD pre-upgrade/restorable versions, IDs, SQL state, smoke baseline and ordered recovery plan. Ensure app-version retention covers the recovery window; preserve private recovery copies only if needed.','Workflow E2; Recovery'],
  ['E App Upgrade','Immediately before each upgrade','Confirm PROD has not changed from the accepted baseline and RC still has its frozen version. If PROD changed, integrate those changes into a new candidate and retest; do not overwrite intervening work.','AGENTS §6.3; Workflow E1–3'],
  ['E App Upgrade','Each included app','Run App Upgrade in the existing PROD target using the frozen RC’s full internal name. Verify target UUID and source version. Record source/target, timestamp and before/after versions; confirm success before dependent upgrades.','Workflow E3–4'],
  ['E App Upgrade','Operational pauses / external steps','Complete approved external cutover steps and reconcile temporary pauses in the planned order. Keep integrity triggers active and one scheduler per business job/environment. No manual recreation of app settings in PROD.','Workflow E4; AGENTS §2'],
  ['F PROD validation','App Upgrade scope','Verify upgrade provenance, resulting PROD version/Deployed state, PROD sources and necessary link/theme/access substitutions against the frozen RC/package. Use focused saved checks; never compare to later DEV.','Workflow F1'],
  ['F PROD validation','Always','Open/sync both PROD apps, check access and representative changed entry points/affected consumers. Inspect/cancel forms. Reuse DEV tests; use only separately authorized mutating actions or notification tests.','Workflow F2'],
  ['F PROD validation','Changed SQL / critical / external behavior','Run the selected read-only SQL reconciliation and targeted critical/external checks. Expand only for observed mismatches or concrete uncertainty. Configuration readback is not proof of execution/delivery.','Workflow F2–3'],
  ['F PROD validation','Changed recipient logic / identity prerequisites','Verify affected actor mapping and shared recipient rules against the frozen package. No routine recipient rewrite/audit for untouched routes. Resolve unknown actors before accepting affected notification tests.','AGENTS §2, §6.4'],
  ['F PROD validation','App Upgrade / scheduler impact','Confirm PROD is allowed and RC excluded by scheduled guards, intended states/schedules preserved and duplicate execution contained. At first introduction observe the next normal PROD run; later releases reuse valid proof.','Workflow: Guard 5–7; F3'],
  ['F PROD validation','Always','Record final app/Flyway versions, both PROD editors’ zero warnings/errors and smoke/SQL results. No fresh Deployment Check for already-Deployed PROD. Required missing checks mean verification incomplete, not Released.','Workflow F3–4'],
  ['G Documentation','Always','Reconcile a fresh recursive Documents inventory with the Documents tab/register. Add/classify new or moved files. Complete every document row with a disposition and evidence/reason; no uncatalogued, Pending or Blocked item at closure.','Documentation checklist 2–6'],
  ['G Documentation','Always','Reconcile manifest, release log/checklist, source mappings, approvals/tests, implementation/Flyway pins and DEV/RC/PROD versions. Update model overview/dictionary together when triggered; close only promoted differences and preserve later DEV.','Workflow F5; Documentation checklist'],
  ['G Documentation','Always','Run relevant document/model/link checks, inspect intended Git diff, preserve unrelated work and exclude secrets/private data/backups/dependencies. A documentation gap needs repair, not another deployment or repeated live tests.','AGENTS §5; Documentation checklist 7'],
  ['H Publication','Always','Prepare final outcome and intended tag in records. Commit/push sanitized evidence/docs to configured upstream. Create/push unique annotated Rnnn tag at the final evidence commit and verify remote branch/tag targets. Never move an existing tag.','Workflow F6; AGENTS publication'],
  ['H Publication','RC exists','Record RC recovery/retention window and continued containment without editing frozen definitions. Retire only under the recorded decision, preserving recoverable evidence/shared assets. No automatic RC deletion or DEV refresh.','Recovery: RC retention; Workflow F7'],
  ['H Publication','Always','Confirm validation, documentation and publication complete before final Released report. Give release outcome, versions, tag/evidence, rollback and limitations. Otherwise state the specific incomplete phase; repair publication without redeploying.','Workflow F4–7'],
  ['X Exceptions','Unlisted necessary work / required check unavailable','Record the concrete gap and its effect on the affected step. Continue independent work. Seek owner disposition for missing scope or checklist amendment; do not silently add unrelated gates or waive zero-editor-issue requirements.','AGENTS working method; proposed checklist-use rule'],
  ['X Exceptions','Deployment failure / uncertain result','Stop dependent steps and uncontrolled RC effects. Record actual SQL/apps/external state and first failure. Investigate before retrying; a timeout is not proof of failure and does not authorize financial replay.','Recovery: Failure 1–2'],
  ['X Exceptions','SQL succeeded; app upgrade incomplete','Keep compatible additive SQL if safe. Correct in controlled development, create a new RC and retest. Do not restore the database merely to remove a successful compatible migration.','Recovery: Failure 3'],
  ['X Exceptions','App rollback / forward recovery needed','Use recorded restorable versions in dependency order or an approved forward fix. Keep existing PROD IDs, preserve newer data and verify mixed-app compatibility. Recheck sources/links/themes/recipients, editors and affected runtime paths.','Recovery: Failure 4–5'],
  ['X Exceptions','Database recovery needed','Prefer a tested higher Flyway forward fix. Destructive backup/PITR recovery needs scoped approval, verified restore point, write pause and treatment of newer writes. Revalidate history/schema/access and affected consumers; app restore does not undo SQL or sent messages.','Recovery: Failure 6'],
  ['X Exceptions','Emergency manual PROD change','Require scoped approval and exact before/after/version evidence. Reconcile app changes into DEV/Git and SQL into reviewed migrations before the next candidate. Resume normal RC promotion; never make manual edits the default fallback.','Recovery: Hotfix/emergency'],
  ['X Exceptions','Rollback / hotfix / failed closure','Record actual partial/rolled-back/forward-fixed state and repair tracker, development differences and affected documentation. Reopen reversed differences, preserve history and publish evidence. A new hotfix gets the next Rnnn and normal controlled RC workflow.','Recovery: Failure 7; Hotfix']
];

const registered = await documentationRows();
if (registered.some(r => r.note || r.rule === 'Uncatalogued')) throw new Error('Resolve documentation inventory before generating draft.');
const register = await fs.readFile('Documents/Promotion_Documentation_Checklist.md', 'utf8');
const details = new Map(register.split(/\r?\n/).filter(l=>/^\| DOC-/.test(l)).map(l=>{const cells=l.split('|').map(s=>s.trim());return [cells[1],cells[4]];}));
const wb = Workbook.create();
const main = wb.worksheets.add('Promotion');
const docs = wb.worksheets.add('Documents');
const headers=['ID','Stage','When required','Activity and completion criterion','Status','Review decision','Notes / evidence / proposed wording','Source section'];
const rows=steps.map((s,i)=>[`P${String(i+1).padStart(2,'0')}`,s[0],s[1],s[2],'Not started','Review','',s[3]]);
const docRows=registered.map(r=>[r.id,r.file,r.rule,details.get(r.id),'Pending','Review','']);

function layout(sheet, title, intro, tableHeaders, data, widths, tableName) {
  sheet.showGridLines=false; sheet.tabColor='#253B53';
  const last=10+data.length, end=String.fromCharCode(64+tableHeaders.length);
  sheet.getRange(`A1:${end}${last}`).format.font={name:'Arial',size:11,color:'#233448'};
  sheet.getRange(`A1:${end}${last}`).format.verticalAlignment='top';
  widths.forEach((width,i)=>sheet.getRange(`${String.fromCharCode(65+i)}1:${String.fromCharCode(65+i)}${last}`).format.columnWidthPx=width);
  sheet.getRange('A2').values=[[title]]; sheet.getRange('A2').format.font={size:16,bold:true};
  sheet.getRange(`A2:${end}2`).format.rowHeight=28;
  sheet.getRange(`A3:${end}3`).format.borders={bottom:{style:'thin',color:'#71859B'}};
  intro.forEach((v,i)=>{sheet.getRange(`A${i+4}`).values=[[v]];sheet.getRange(`A${i+4}:${end}${i+4}`).format.rowHeight=20;});
  sheet.getRange(`A10:${end}10`).values=[tableHeaders];
  sheet.getRange(`A11:${end}${last}`).values=data;
  const table=sheet.tables.add(`A10:${end}${last}`,true,tableName);
  table.showFilterButton=true;
  sheet.getRange(`A10:${end}10`).format={fill:'#253B53',font:{name:'Arial',size:11,bold:true,color:'#FFFFFF'},wrapText:true,horizontalAlignment:'center',verticalAlignment:'center',rowHeight:34};
  sheet.getRange(`A11:${end}${last}`).format.wrapText=true;
  sheet.getRange(`E11:G${last}`).format.fill='#FFF4CC';
  data.forEach((row,i)=>{
    const lines=Math.max(...row.map((value,c)=>String(value||'').split('\n').reduce((n,t)=>n+Math.max(1,Math.ceil(t.length/(widths[c]/7.5))),0)));
    sheet.getRange(`A${11+i}:${end}${11+i}`).format.rowHeight=Math.max(52,lines*14+16);
    sheet.getRange(`A${11+i}:D${11+i}`).format.fill=i%2===0?'#EFF3F7':'#FFFFFF';
    if(i>0 && sheet===main && row[1]!==data[i-1][1])sheet.getRange(`A${11+i}:${end}${11+i}`).format.borders={top:{style:'medium',color:'#A2B4C6'}};
  });
  sheet.freezePanes.freezeRows(10); sheet.freezePanes.freezeColumns(2);
  sheet.getRange(`F11:F${last}`).dataValidation={rule:{type:'list',values:['Review','Keep','Revise','Remove','Add']}};
  sheet.getRange(`F11:F${last}`).conditionalFormats.add('containsText',{text:'Revise',format:{fill:'#FFE1B2'}});
  sheet.getRange(`F11:F${last}`).conditionalFormats.add('containsText',{text:'Remove',format:{fill:'#FAD8D8'}});
  return last;
}
const mainLast=layout(main,'DEV to PROD promotion checklist',[
  'REVIEW DRAFT. 20 Sep 2026. Based on current R009 policy. No promotion has been performed.',
  'Review: choose Keep / Revise / Remove, edit wording or add table rows. Put proposed changes in Notes. All cells are editable.',
  'Execute after approval: copy per release, filter When required, reuse valid evidence, and record one result per applicable row.',
  'Done requires evidence. Reused requires a valid reference. N/A requires a reason. Resolve Blocked/Pending before Released.',
  'Open only the source section needed for a triggered step. No full-app diff, repeated DEV suite or routine recipient audit.',
  'Approval will make the revised checklist the execution scope; until then, current AGENTS/runbooks remain authoritative.'
],headers,rows,[65,132,190,590,108,118,300,190],'PromotionTasks');
main.getRange(`E11:E${mainLast}`).dataValidation={rule:{type:'list',values:['Not started','In progress','Done','Reused','N/A','Blocked']}};
main.getRange(`E11:E${mainLast}`).conditionalFormats.add('containsText',{text:'Blocked',format:{fill:'#FAD8D8',font:{color:'#9B1C1C',bold:true}}});
const docsLast=layout(docs,'Promotion documentation closure',[
  'Every listed document receives its own disposition; update only affected content. Preserve dated evidence and later DEV work.',
  'Always: Updated or Verified current. Conditional: update/verify when triggered, otherwise N/A with a reason.',
  'Historical: Preserved history unless the historical document itself is explicitly in scope. Read only relevant sections.',
  'Reconcile a fresh Documents inventory at closure. Add/classify new or moved paths; no missing or Pending/Blocked rows.',
  'Use Review decision / Notes to propose changes now. Status remains Pending until an actual promotion is performed.',
  'Source: Documents/Promotion_Documentation_Checklist.md at commit 5cecc67580a8a401c7dc8e4d8a147f119f161edf.'
],['ID','Document (under Documents/)','Rule','Update trigger and required content','Disposition','Review decision','Notes / evidence / proposed wording'],docRows,[78,345,110,620,160,118,300],'DocumentClosure');
docs.getRange(`E11:E${docsLast}`).dataValidation={rule:{type:'list',values:['Pending','Updated','Verified current','Not applicable','Preserved history','Blocked']}};
docs.getRange(`E11:E${docsLast}`).conditionalFormats.add('containsText',{text:'Blocked',format:{fill:'#FAD8D8',font:{color:'#9B1C1C',bold:true}}});

wb.recalculate();
const check=await wb.inspect({kind:'table',range:'Promotion!A10:F13',include:'values',tableMaxRows:4,tableMaxCols:6,maxChars:1800});
console.log(check.ndjson);
console.log((await wb.inspect({kind:'match',searchTerm:'#REF!|#DIV/0!|#VALUE!|#NAME\\?|#NUM!',options:{useRegex:true,maxResults:5},summary:'Error scan'})).ndjson);
for (const [sheet,range,file] of [['Promotion','A1:F15','promotion-preview.png'],['Documents','A10:F15','documents-preview.png']]) {
  const preview=await wb.render({sheetName:sheet,range,scale:1,format:'png'});
  await fs.writeFile(path.join(out,'.tmp',file),new Uint8Array(await preview.arrayBuffer()));
}
await (await SpreadsheetFile.exportXlsx(wb)).save(target);
await fs.writeFile(path.join(out,'review-inventory.json'),JSON.stringify({draft:true,sourceCommit:'5cecc67580a8a401c7dc8e4d8a147f119f161edf',activities:rows.length,documents:docRows.length,activityIds:rows.map(r=>r[0]),documentIds:docRows.map(r=>r[0])},null,2)+'\n');
console.log(JSON.stringify({target,activities:rows.length,documents:docRows.length}));
