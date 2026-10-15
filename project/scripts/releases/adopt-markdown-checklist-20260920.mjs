// One-time companion to the approved document cleanup; preserve current source first.
import fs from 'node:fs/promises';
const read=async p=>(await fs.readFile(p,'utf8')).replace(/\r\n/g,'\n');
const write=(p,s)=>fs.writeFile(p,s.endsWith('\n')?s:s+'\n');
let agents=await read('AGENTS.md');
if(agents.includes('Execution contract, revised 20 September 2026'))throw Error('Already adopted; do not replay over later work.');
agents=agents.replace('| DEV feature or production release | Current row in [release tracker](Documents/Release_Tracker.md), release log and relevant stage of [release workflow](Documents/Release_Workflow.md) |','| DEV feature or production release | Current [tracker](Documents/Release_Tracker.md) row and release log; for promotion use its filled copy of the [single master checklist](scripts/releases/templates/promotion-checklist.md). Read runbook detail only for a triggered step. |');
agents=agents.replace('Model changes (tables, physical/virtual columns, types, keys/labels/Refs, expressions, slices/filters/permissions/membership or app availability) must be reflected consistently in both `Documents/AppSheet_Data_Model_Overview.md` and `Documents/AppSheet_Data_Dictionary.xlsx`, plus the log. The overview covers architecture/ownership/relationships/assumptions; the workbook holds exact inventory. Keep PROD values and label DEV differences; unreconciled content stays explicitly pending.','Exact model/configuration changes (tables, columns, types, keys/Refs, expressions, filters/permissions/membership or availability) update affected rows in `Documents/AppSheet_Data_Dictionary.xlsx` and the release log. Update `Documents/AppSheet_Data_Model_Overview.md` only when architecture, relationships, ownership or its explanation of business behavior changes; no forced prose edit for an exact formula change that leaves that explanation correct. Keep PROD values and label open DEV differences. Preserve dated evidence in release logs/archive, not accumulating narratives in current-state files.');
agents=agents.replace('update affected sections/rows together once per completed batch and after promotion','update applicable sections/rows once per completed batch and after promotion');
agents=agents.replace('**Effective 19 September 2026:** All future development and promotions use [the RC/App Upgrade workflow](Documents/Release_Workflow.md), including remaining work in an already-numbered release. Preserve historical evidence; do not retroactively recast earlier deployments as RC upgrades. No live operation is authorized by this policy update.','**Execution contract, revised 20 September 2026:** all future promotions, including remaining work in existing releases, use one filled copy of the [master Markdown checklist](scripts/releases/templates/promotion-checklist.md) under `outputs/<release>/promotion-checklist.md`. The copy contains the release details, applicable activities and documentation closure; no parallel Excel or document checklist. Execute applicable rows only, reusing valid evidence. The [release workflow](Documents/Release_Workflow.md) supplies implementation detail, not extra routine gates. Add only a concrete scope/failure-driven missing activity to the same copy; do not invent unrelated checks or seek approval again when existing scope covers it. Preserve historical release methods/evidence. This governance change authorizes no live promotion.');
const old='Complete the per-document [promotion documentation checklist](Documents/Promotion_Documentation_Checklist.md): every promotion updates/verifies `Release_Tracker.md`, `Environment_Inventory.md` and `Development_Changes.md`; resolve every other document\'s applicability explicitly.';
agents=agents.replace(old,'Complete documentation closure in the release’s single checklist: always update/verify `Release_Tracker.md`, `Environment_Inventory.md` and `Development_Changes.md`, and add only documents affected by scope. Record a concise impact decision for untouched categories. No per-release archive dispositions, full Documents inventory or independent documentation checklist. Update the documentation map only when files/purposes change.');
agents=agents.replace('Keep the owner\'s model/settings unchanged unless asked.','Keep the owner\'s model/settings unchanged unless asked.');
agents=agents.replace('- Treat prior logs/exports as dated evidence,','- Archives and dormant references are excluded from routine release reads/updates. Read them only for a specific historical question or an affected/resumed feature. Keep current facts in their owning reference and link evidence instead of copying policy.\n- Treat prior logs/exports as dated evidence,');
await write('AGENTS.md',agents);

const oldWorkflow=await read('Documents/Release_Workflow.md');
const guard=oldWorkflow.slice(oldWorkflow.indexOf('### Scheduled-bot execution guard'),oldWorkflow.indexOf('### Gate C:'));
const tests=oldWorkflow.slice(oldWorkflow.indexOf('### Test selection and evidence reuse'),oldWorkflow.indexOf('### Warning and deployment-state rules'))
 .replace('Batch affected overview/dictionary updates once per completed change set and after promotion; coordinate workbook writes.','Update affected dictionary rows once per batch and after promotion; update overview prose only when its explanation changes. Coordinate workbook writes.');
await write('Documents/Release_Workflow.md',`# Release workflow — RC/App Upgrade implementation reference

## Execution contract

Use the [single master Markdown checklist](../scripts/releases/templates/promotion-checklist.md), copied once to the release's outputs folder and filled throughout execution. It is the promotion/documentation activity list. This runbook explains triggered operations; it is not another checklist or a reason to repeat completed checks. [Create a release copy](../scripts/releases/README.md#one-checklist-per-release). Historical releases retain their actual method/evidence.

Standing policy (app modes, notification identity/delivery, environment isolation, authorization and editor-warning gates) is in [AGENTS](../AGENTS.md#2-architecture-and-ownership). Reuse accepted configuration and tests until a relevant implementation, identity, dependency or data assumption changes. No routine whole-app comparison, DEV suite replay or archive audit. Technical version/hash pins belong in the manifest; concise scope/decisions in the change log.

## Release records and integration

The filled checklist links the manifest, log, tests, SQL pins and source-mapping evidence. Keep one source for each fact; no repeated narrative. App Upgrade replaces the whole app definition and does not merge independent feature copies. Integrate all included features and intervening PROD fixes in DEV; resolve unrelated unreleased work before copying. Include each app as Upgrade or Unchanged and test affected unchanged consumers. A delta is optional exact technical evidence, not a promotion gate or manual deployment recipe.

## 6.1 Develop and integrate — Gate A

Development owns the tests and concise scope/DEV checkpoint. At promotion, reuse that evidence; rerun only invalidated checks. Before readiness fixes, establish affected rollback points under AGENTS. Keep R010/later work separate from an already captured release. A readiness recommendation is not owner acceptance or production authority.

${tests}
### Warning and deployment-state rules

Use AGENTS §6.2: both DEV apps at readiness and both PROD apps at closure require final saved-state zero editor warnings/errors. New/undeployed DEV replacements and RCs need their initial Deployment Check before Deployed mode. Already-Deployed apps need no repeat check or mode toggle. Editor diagnostics and relevant functional evidence remain necessary; Deployed status alone proves neither.

## 6.2 Capture and prepare the release candidate — Gates B–D

### Gate B: integrated candidate captured

During the brief DEV edit freeze, pin the tested versions/implementation commit and, for SQL changes, create the Flyway runner manifest before later migrations advance DEV. Copy included definitions as MW-OLTP-Rnnn-RCk / MW-OLAP-Rnnn-RCk, recording complete internal names (including account suffix), UUIDs and source versions. Never copy DEV financial data into PROD. DEV resumes once independent copies/pins are verified; final RC immutability begins after preparation.

### RC containment and external dependencies

An RC is production-capable once PROD-bound. Restrict access and prevent unintended writes, notifications, webhooks and external/SQL jobs from copy creation. The scheduled guard is not a security boundary for other entry points. If guard proof is missing, keep the candidate DEV-bound with affected jobs paused while resolving it. No PROD-bound test writes or forced notifications without their own scoped authority. Guarded bot definitions retain intended enabled states so App Upgrade preserves production schedules.

App Upgrade does not provision external templates/files, endpoints, access grants or data. Check only affected assets; link valid existing evidence for unchanged dependencies. Use the approved maintenance/order plan for non-atomic SQL and two-app cutover, including relevant queued-client compatibility. Source-copy eligibility/ownership is reused unless access/plan/platform behavior changes.

${guard}
### Gate C: compatible PROD database ready

For SQL changes, follow [Database: Each change](../database/README.md#each-change) from the pinned clean commit/original runner manifest: verified restorable backup and scoped authorization, schema-drift/history review, validate/migrate/validate, target-object/read-only checks. Include every pending migration or approved prerequisite. Compatible SQL must precede final RC PROD-source verification. App-only releases record SQL unchanged; no empty migration or repeated migration suite. SQL success followed by app failure is partial deployment; see recovery.

### Gate D: PROD-mapped RC validated and immutable

Reconcile every RC table/view/source to the intended PROD host/database/schema/object, including auxiliary sources. Record exact substitutions once: existing PROD companion IDs (not RC IDs), corresponding PROD theme/color/branding, access/endpoints and applicable legacy recipient overrides. Shared R009 recipient expressions use PROD contacts; required Login Email schema/mapping must exist. Never restore the superseded creator-by-delivery-email rule. Keep all four DEV/PROD colors; do not guess a common RC color.

Save/reload and use current-editor data validation. One focused pass covers mappings, editor issues, Ref/security/type/permission integrity, unexpected generated changes, open/sync and representative screens. Reuse DEV business tests; inspect/cancel PROD-bound forms. Complete the new RC's initial deployment check and deploy under containment, then freeze final UUID/internal name/version and evidence in the manifest. Later configuration corrections require a new RC and affected retesting, not a patch to the approved frozen version.

## 6.3 Approve and promote — Gate E

Confirm existing owner acceptance/production authority covers the final candidate and remaining effects. Record restorable PROD versions and ordered recovery once; immediately before each upgrade recheck accepted PROD baseline and frozen RC version. Reconcile intervening PROD changes into a new integrated candidate. Version retention must cover the recovery window.

In the existing PROD editor, use Manage → App Versions → App Upgrade (or current equivalent) and supply the approved RC's complete internal name. Confirm UUID/source version; record before/after versions and success before dependent operations. Never delete/recreate PROD IDs, hand-recreate app settings or silently retry ambiguous financial operations. On failure, use the matching [recovery branch](Release_Recovery_Runbook.md).

## 6.4 Validate production and close — Gate F

Use one focused PROD pass against the frozen package: upgrade provenance/version/mode, resulting sources/substitutions, guard allowing PROD and excluding RC, both editors clear, both apps open/sync and representative changed entry points. Reuse DEV/RC evidence; add only uncovered SQL, changed critical behavior or external checks. Do not compare with later DEV or run a repeat Deployment Check. Observe the first normal PROD schedule when introducing the guard; subsequent releases reuse valid proof.

Complete the release checklist's documentation-impact table: the three current-state records always, then only affected documents. No full-folder scan, historical dispositions or separate documentation checklist. Model formulas require exact dictionary updates; unchanged overview prose requires no edit. Preserve later DEV work. Documentation/publication gaps do not require another deployment or live test.

Commit/push sanitized final evidence, create/push the unique final Rnnn tag at that evidence commit and verify remote targets; never move a tag. Record intended final outcome/tag before commit, resolving the commit from Git afterward. Release only when required validation, documentation and publication complete. Retain RC recovery evidence under containment according to its decision; no automatic DEV refresh or RC deletion.
`);

let recovery=await read('Documents/Release_Recovery_Runbook.md');
recovery=recovery.replace('all applicable documentation-checklist rows','the affected-document rows in the release’s single promotion checklist');
await write('Documents/Release_Recovery_Runbook.md',recovery);
let scripts=await read('scripts/README.md');
scripts+=`\n## Diagram maintenance\n\nUpdate drawings only when depicted flows/architecture change. Their interpretation lives in [Solution Design](../Documents/Solution_Design.md); provenance and prior render evidence live in the dated archive/change logs. Keep manual draw.io edits before running generators, which overwrite files.\n\n- OLTP: \`node scripts/build-oltp-process-diagram.cjs\`; three editable pages. Historical verification: \`outputs/oltp-process-diagram-20260912/\`.\n- Ecosystem: \`node scripts/build-loan-ecosystem.cjs\` calls \`build-loan-ecosystem-visual.cjs\`. Embedded assets come from \`outputs/loan-ecosystem-20260916/logos\`; pinned sources are in its SOURCES.json. Refresh logos only when required.\n- Render changed pages with the installed draw.io export UI/CLI and check text/connectors. XML or a diagram edit does not prove runtime/business tests. No routine promotion render for unchanged diagrams.\n`;
await write('scripts/README.md',scripts);
let helpers=await read('scripts/releases/README.md');
const deltaStart=helpers.indexOf('## Delta fields');
helpers=`# Release record helpers

## One checklist per release

The only promotion/documentation master is [templates/promotion-checklist.md](templates/promotion-checklist.md). Fill one release copy; never regenerate over recorded results or keep a parallel Excel/document checklist. Read only a triggered implementation section in [Release Workflow](../../Documents/Release_Workflow.md).

\`node scripts/releases/checklist.mjs Rnnn outputs/<release>/promotion-checklist.md [affected Documents/path ...]\`

Use the bundled Node runtime. The helper copies the master, fixes relative links, includes the three mandatory current-state records and adds explicitly affected documents. It does not reserve releases, enumerate the Documents tree, grant approval or execute checks. It refuses existing output files and archive paths. For an existing release continue its filled copy. If adopting a newer template, preserve evidence and mark only genuinely new required checks pending.

The manifest stores versions, Git/Flyway/RC pins and approvals; the log records concise scope/decisions. The filled checklist records completion and documentation closure. Templates for manifest/mapping/tests are supporting records, not separate activity checklists. Documentation-only work needs no product release number.

Optional exact deltas are technical evidence only. \`delta.mjs validate\`, \`render\` and \`compare\` validate recorded targets, render their detail and compare independent saved observations. Render no longer appends document rows; link its result from the single release checklist. It cannot detect unrecorded changes or certify release readiness. Existing historical deltas stay dated evidence.

Tests for helper changes: \`node --test scripts/releases/delta.test.mjs scripts/releases/checklist.test.mjs\`. No need to run these during an ordinary product promotion unless the helper changes.

`+helpers.slice(deltaStart);
await write('scripts/releases/README.md',helpers);
let templates=await read('scripts/releases/templates/README.md');
templates=templates.replace('Gates A–F; link generated documentation rows and complete them before release closure','Single master activity/documentation checklist; create and fill one copy per release');
templates=templates.replace('Generate fresh per-document rows with `documentation.mjs`, preserving prior completed outputs.','Use `checklist.mjs` once to create a scoped release copy; add only affected documents and preserve filled results. No separate document checklist or folder scan.');
templates=templates.replace('Copy these files into the existing','Copy only required supporting records into the existing');
await write('scripts/releases/templates/README.md',templates);
let delta=await read('scripts/releases/delta.mjs');
delta=delta.replace('Complete documentation dispositions in the appended rows or linked release log; preserve them when regenerating.','Record documentation closure only in the single release promotion checklist; this generated view is optional technical evidence.');
await write('scripts/releases/delta.mjs',delta);
// Retire Excel authoring commands without modifying the historical workbook.
for(const file of ['build-promotion-review.mjs','streamline-promotion-review.mjs']){
 let s=await read('scripts/releases/'+file);
 s=s.replace("import { documentationRows } from './documentation.mjs';",'// Former document-register dependency retired with this Excel builder.');
 s="throw new Error('Retired Excel review script. Use checklist.mjs and the single Markdown master.');\n"+s;
 await write('scripts/releases/'+file,s);
}
console.log('Adopted single Markdown execution contract and supporting references.');
