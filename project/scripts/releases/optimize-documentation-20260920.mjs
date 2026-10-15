// One-time approved documentation restructuring. Refuses to replace its archive.
import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import {execFileSync} from 'node:child_process';
const root=process.cwd(), archive='Documents/archive/2026-09-20';
const read=async p=>(await fs.readFile(p,'utf8')).replace(/\r\n/g,'\n');
const write=async(p,s)=>{await fs.mkdir(path.dirname(p),{recursive:true});await fs.writeFile(p,s.endsWith('\n')?s:s+'\n');};
const previous={};
for(const name of ['Release_Tracker.md','Environment_Inventory.md','Development_Changes.md','AppSheet_Data_Model_Overview.md','OLTP_Business_Processes.md','Loan_Business_Ecosystem.md','Promotion_Documentation_Checklist.md'])previous[name]=await read('Documents/'+name);
try{await fs.access(archive);throw Error('Archive exists; do not replay this migration.');}catch(e){if(e.code!=='ENOENT')throw e;}
await fs.mkdir(archive,{recursive:true});
const relocated=new Map();
for(const name of ['Core_Payment_SQL_Migration_Plan.md','Universal_Payments_Clone_Migration_Runbook.md','AppSheet_Data_Model_History.md','OLTP_Business_Processes.md','Loan_Business_Ecosystem.md']){
 const from='Documents/'+name,to=archive+'/'+name;await fs.rename(from,to);relocated.set(from,to);
}
const oldBook='Documents/history/AppSheet_Data_Dictionary_before_reconciliation_2026-09-15.xlsx';
await fs.rename(oldBook,archive+'/AppSheet_Data_Dictionary_before_reconciliation_2026-09-15.xlsx');
relocated.set(oldBook,archive+'/AppSheet_Data_Dictionary_before_reconciliation_2026-09-15.xlsx');
for(const name of ['Release_Tracker.md','Environment_Inventory.md','Development_Changes.md','AppSheet_Data_Model_Overview.md','Promotion_Documentation_Checklist.md'])await write(archive+'/'+name,previous[name]);
await fs.copyFile('Documents/AppSheet_Data_Dictionary.xlsx',archive+'/AppSheet_Data_Dictionary_before_cleanup.xlsx');

const logs=execFileSync('rg',['--files','Change Logs'],{encoding:'utf8'}).split(/\r?\n/).filter(Boolean);
const trackerRows=previous['Release_Tracker.md'].split('\n').filter(l=>/^\| \*\*R\d+/.test(l));
const brief={R010:'OLTP payment-entry validation; depends on R009',R009:'Partner login/delivery, closure notifications, rate correction and owner GUI refinements',R008:'Cash accounts and account-aware payment commands',R007:'SQL analytical views for OLAP',R006:'Four OLTP formula optimizations',R005:'Cash custody, reversals and dashboard refinements',R004:'Bilingual referral expense category',R003:'Reconcile missing R001 AppSheet configuration',R002:'Loan capacity safeguard and borrower navigation',R001:'Composite original production baseline; reconciled by R003'};
const compact=trackerRows.map(l=>{const c=l.split('|').map(v=>v.trim()),id=c[1].replaceAll('*','');const links=[...c.slice(4).join(' ').matchAll(/\[[^\]]+\]\([^)]+\)/g)].map(m=>m[0]);return `| ${id} | ${brief[id]||c[2]} | ${c[3].replaceAll('**','')} | ${id==='R010'?'2026-09-20 DEV ready; acceptance/promotion pending':id==='R009'?'2026-09-19':(c[4].match(/2026-\d{2}-\d{2}/)||['See evidence'])[0]} | ${links.slice(0,2).join(' · ')} |`;});
await write('Documents/Release_Tracker.md',`# Release tracker

Recorded PROD baseline: **R009**. Next available number: **R011**. R010 remains Ready for review, not accepted or authorized for production. Numbering/approval rules are in [AGENTS](../AGENTS.md#project-release-tracking--owner-rule-16-september-2026).

| Release | Scope / dependency | Status | Latest milestone | Evidence |
| --- | --- | --- | --- | --- |
${compact.join('\n')}

R010 [promotion checklist](../outputs/r010-20260919/promotion-checklist.md) is the continuation record for its remaining promotion work. R009 RCs were retired with owner approval; their former app IDs are not live rollback sources.

Maintain one short row per release. Versions, tests, decisions and recovery belong in the linked manifest/log/checklist; current identities belong in [Environment Inventory](Environment_Inventory.md). Preserve reserved numbers and distinguish acceptance from production authorization. Detailed past entries are retained in the [dated archive](archive/2026-09-20/Release_Tracker.md).
`);
const dev=previous['Development_Changes.md'];const active=dev.slice(dev.indexOf('## R010 ready'),dev.indexOf('## R009 promoted'));
await write('Documents/Development_Changes.md',`# Open development differences

Current production baseline is R009. This register contains open product differences and intentional environment differences, not completed-release narratives.

${active.trim()}

[R010 promotion checklist](../outputs/r010-20260919/promotion-checklist.md) owns remaining promotion checks. Close this entry only after R010 validation and documentation closure, preserving later work.

## Intentional environment differences

- Separate DEV database and app identities, DEV themes and within-DEV companion links; see [Environment Inventory](Environment_Inventory.md).
- DEV Partners.Email delivers only to the owner, while Login Email remains distinct. RC/PROD use PROD contacts with the shared actor-ID rule in [AGENTS §2](../AGENTS.md#2-architecture-and-ownership).
- Synthetic DEV fixtures and uninitialized cash-account openings are not production data to promote. Use release-specific evidence for any approved initialization.

## Closed differences

R001–R009 product differences are closed according to the [Release Tracker](Release_Tracker.md) and their dated release evidence. R009 [closure](../outputs/r009-20260919/production/REPORT.md) preserves its limitations. Older checkpoints and superseded rules remain in the [archive](archive/2026-09-20/Development_Changes.md), not the active backlog.
`);
const inventory=previous['Environment_Inventory.md'];
const appTable=inventory.slice(inventory.indexOf('| Environment |'),inventory.indexOf('\n\nR009 RC1'));
const sqlStart=inventory.indexOf('| Setting |');const sqlTable=inventory.slice(sqlStart,inventory.indexOf('\n\n',sqlStart)).replaceAll('Fresh SQL query','Recorded SQL evidence').replaceAll('fresh successful connection','recorded connection').replaceAll('SSL active on audit sessions','SSL recorded on prior audit sessions');
await write('Documents/Environment_Inventory.md',`# Environment inventory

Latest recorded checkpoint: **20 September 2026**, from [R010 DEV evidence](../outputs/r010-20260919/REPORT.md) and [R009 production evidence](../outputs/r009-20260919/production/REPORT.md). This documentation cleanup performs no fresh live audit. Current PROD is R009; R010 is DEV-only.

## App identities and bindings

${appTable}

All four canonical apps are recorded Deployed. Internal names:

| App | Internal name | Theme color |
| --- | --- | --- |
| PROD OLTP | LoanManager-975338008-26-08-07 | #d81b60 |
| PROD OLAP | LoanBusinessInsights-975338008 | #0abab5 |
| DEV OLTP | MW-OLTP-DEV-20260919-578763613 | #e8710a |
| DEV OLAP | MW-OLAP-DEV-20260919-578763613 | #1e88e5 |

Companion links join the corresponding pair. DEV uses owner-only Partner delivery data and distinct login identities. Scheduled guards allow only the canonical DEV/PROD name of the corresponding role. See [policy](../AGENTS.md#2-architecture-and-ownership) and [guard procedure](Release_Workflow.md#scheduled-bot-execution-guard); these details are not a new delivery/execution test.

R009 RCs were deleted after owner-approved retirement; captured definitions and evidence remain in its [manifest](../outputs/r009-20260919/release-manifest.json). No live RC is recorded. The historical Money AppSheet database is not a write target. Superseded DEV/backup IDs are not recovery targets.

## Cloud SQL

${sqlTable}

Host/instance, not the shared database name, establishes environment identity. Direct public-IP SSL is used; sslmode=require does not establish hostname verification. Credentials remain outside Git at the paths in the maintained environment configuration. Capacity/network facts retain their original observation dates in the [archive](archive/2026-09-20/Environment_Inventory.md); no new load/capacity or recovery coverage is asserted.

## Automation and limitations

AppSheet owns daily-charge and hourly-analytics scheduling; duplicate pg_cron financial jobs are paused. Intended enabled/retired states and RC guards follow the accepted release evidence. Daily Loan Analysis is a [dormant reference](reference/Daily_Loan_Analysis_Automation.md), not an active promotion dependency unless affected.

The last recorded common sync settings were caching/delta/Quick Sync/delayed sync Off, sync on start/automatic updates On (15 September). They are dated evidence, not a newly verified configuration. Full bot/settings history is archived; inspect only changed routes/settings or concrete problems.

R009 reported clear PROD editors, runtime/SQL checks and natural schedule observation. Physical-device receipt and actual second-user GUI testing remain declared limitations. R010 records DEV OLTP editor/form checks only. All three production cash-account openings remain uninitialized. Release-specific rollback/backup points belong in the release manifest/log, not a reusable old-version table here.
`);
await write('Documents/AppSheet_Data_Model_Overview.md',`# Production model overview

This document explains architecture and business behavior. Exact columns, expressions, types, permissions, Refs and SQL metadata belong in the [data dictionary](AppSheet_Data_Dictionary.xlsx); current versions/identities belong in [Environment Inventory](Environment_Inventory.md). Recorded production baseline: R009. Changes since that baseline are listed in [Development Changes](Development_Changes.md).

## Architecture and ownership

Each DEV/PROD environment has two AppSheet apps sharing one PostgreSQL database. OLTP owns transaction entry and operational workflows; OLAP owns partner management, cash administration and heavier analytics. Looker presents governed reporting. RC is a temporary app copy bound to PROD, not a separate database. Design decisions and diagrams are in [Solution Design](Solution_Design.md).

## Entity groups and relationships

| Group | Entities / grain | Responsibility |
| --- | --- | --- |
| Lending | Borrowers; Loans per borrower; Charges per loan; Repayments per posted allocation | OLTP entry; SQL posting and derived balances |
| Receipts | Payments per receipt; Payment Allocations per receipt/charge | OLTP requests; SQL allocation, posting and retry identity |
| Partner economics | Partners; Cash Pool Contributions; Settlements; Business Expenses | OLAP partner/settlement management; OLTP manual expense entry; SQL allocation/limits |
| Custody | Cash Holders; Cash Accounts; Cash Ledger; holder/account balance views | OLAP cash administration; source events produce deterministic SQL movements |
| Reporting/control | Statistics; Loan Form Context; Portfolio Summary; Daily Analytics; Loan Assessment | Read-only SQL providers except explicit control/input rows |

Row IDs are immutable case-sensitive text, not provider row ordinals. Loans reference Borrowers; Charges reference Loans; Allocations connect Payments to Charges; Repayments retain loan/charge/payment/allocation trace. Cash Accounts reference Cash Holders; operational account fields reference Cash Accounts. AppSheet Ref/part-of behavior and SQL foreign keys are distinct. Optional blank references are normalized before constraints. Exact relationship inventory and delete/update behavior stay in the dictionary.

## Financial behavior

- SQL owns posting, retries, borrower locking and persisted balances. Payments are receipts, Allocations are processing snapshots and Repayments are posted principal/interest; row existence alone is not payment completion. AppSheet retains lightweight form feedback and command entry.
- The three loan types retain their documented charge/repayment rules, first-day behavior, early-closure/default guards and date rules. Daily charge requests use Bangkok business dates; interval loans retain the approved schedule anchor. Common daily generation and analytics requests are monitored through AppSheet. Calendar is no longer an app source.
- Twenty-four operational derived fields are SQL-maintained and read-only. Eligibility VCs evaluate Processing/Error receipts; Posted receipts avoid redundant eligibility scans. Visible allocations retain positive amounts. The loan form capacity rule uses signed contributed capital less outstanding principal, with SQL enforcing concurrency.
- Manual Business Expenses preserve audit/source identity and signed adjustments. Historical contribution positions allocate expenses at the relevant expense/close date; rounding leaves shares reconcilable to the amount. A qualifying fully repaid, non-defaulted referred loan with a posted closing receipt generates one 10% realized-interest rebate capped at 1,000, with deterministic retry identity and no historical backfill. The bilingual referral category does not change allocation.
- Partner net entitlement subtracts allocated expenses. Net availability reserves Pending settlements; SQL guards concurrent over-reservation. Settlement Delete is an audited cancellation/reversal, not physical deletion. Cancelled rows are excluded from reservations and the app's active settlement population.
- Custody is separate from capital/profit entitlement. Positive holder balance is business cash held; negative is reimbursement/advance due. Loan disbursement, receipt, expense and completed-settlement sources produce deterministic cash movements; repayments/charges do not independently duplicate cash.

## Cash accounts and commands

Cash Accounts has immutable holder identity and active defaults. OLAP owns adds/updates; OLTP consumes it read-only. Nullable account references preserve historical holder-only rows. The preferred receipt account falls back to the active Dad default; loan disbursement/first-day custody follows the selected Lisa account. Positive manual expenses require a matching active payer account; settlements retain their selected account.

Receive All, Receive Full and Loan Close submit account plus fresh request token through dedicated update-only command slices. SQL recomputes eligibility and posts atomically. Notifications use the exact originating receipt/token. A Posted receipt may correct receiving custody with an appended reason without reposting allocations/repayments; other posted dimensions remain protected. Manual transfers support same-holder/different-account movements.

Holder/account balance views are read-only. Account cutover/opening tables remain SQL-only. Initialization requires an explicit reconciled allocation; uninitialized amounts remain NULL rather than invented zero. Current initialization status is in Environment Inventory. DEV fixtures never establish PROD opening amounts.

## Analytics and assessment

OLAP Borrowers, Loans, Charges and Repayments use read-only SQL analytical views while preserving logical names, keys, labels, reporting grain and lightweight presentation/Ref VCs. Portfolio Summary supplies heavy Statistics metrics; Statistics remains the control row for analytics refresh. Existing reporting slices retain their contracts.

Daily Analytics persists governed gross/net daily measures. Full rebuild is needed after historical corrections; source expense allocations recalculate through their SQL rules. R009 effective daily interest rate uses outstanding principal, returning zero for nonpositive balances, in OLTP presentation and the OLAP SQL loan view.

Loan Assessment exposes stored SQL results with source/input/date freshness guards. Saving inputs invokes calculation/stamping; ordinary sync does not recalculate unchanged inputs. Shared-input and forecast-horizon limits are retained in its dated evidence; no new assumption is introduced here. Exact fields/formulas and provider bindings stay in the dictionary.

## Notifications and presentation

Partners.Login Email uniquely identifies sign-in after normalized matching; Partners.Email is the possibly shared delivery address. Transaction Created By/Closed By resolves to Partner Row ID, that partner is excluded, and nonblank delivery addresses are deduplicated. Unknown actors yield no recipients. The bot runner is not the actor. Closure summaries require positive closures of the exact receipt and show Loan Key.

Native borrower Refs provide detail navigation in Loans, Charges and Repayments. Receive All remains inline in Collection and excluded from Detail views. Loan Key labels may reflect the current effective rate. Environment-specific delivery, links and colors follow AGENTS, not duplicated formulas here.

## Open DEV behavior

R010 adds bilingual form validation for required receipt inputs, appended correction reasons and ineligible quick commands. PROD remains R009. Exact unpromoted expressions and test/approval status are in the dictionary and [R010 record](../outputs/r010-20260919/REPORT.md); do not relabel them production.

## Maintenance and evidence

Update this overview only when architecture, relationships, ownership or explained business behavior changes. An exact formula/property change updates dictionary rows and the release log; it does not require rewriting unchanged prose. Keep one current explanation, without appending a release narrative. SQL changes remain immutable Flyway migrations under [database procedure](../database/README.md#each-change).

Detailed prior checkpoints, unique decisions and dated limitations are preserved in the [pre-cleanup overview](archive/2026-09-20/AppSheet_Data_Model_Overview.md) and linked release logs. The dictionary retains dated exact configuration evidence where it is not redundant; latest applicable verified values take precedence. No model recapture or live behavioral validation was performed by this restructuring.
`);

await fs.mkdir('Documents/reference',{recursive:true});
const pilotFrom='Documents/Daily_Loan_Analysis_Automation.md',pilotTo='Documents/reference/Daily_Loan_Analysis_Automation.md';
await fs.rename(pilotFrom,pilotTo);relocated.set(pilotFrom,pilotTo);
let pilot=await read(pilotTo);pilot=pilot.replace('# Daily Loan Analysis Automation','# Daily Loan Analysis Automation — dormant feature reference');
pilot=pilot.replace('**Status reviewed — 15 September 2026:**','Consult only when changing this feature/dependencies or resuming the pilot. No recurring release check is required. The dated contract below is preserved; activation must reconcile its old Calendar/source and scheduler assumptions.\n\n**Historical status reviewed — 15 September 2026:**');
await write(pilotTo,pilot);
await write('Documents/README.md',`# Documentation map

Start with [AGENTS task routing](../AGENTS.md#working-method-and-task-routing), not a full document read. The [master Markdown checklist](../scripts/releases/templates/promotion-checklist.md) is copied once per release; its filled copy is the sole promotion/documentation checklist for that release.

| Need | Reference |
| --- | --- |
| Release numbers/status | [Release Tracker](Release_Tracker.md) |
| Open DEV work | [Development Changes](Development_Changes.md) |
| Current identities/settings | [Environment Inventory](Environment_Inventory.md) |
| Business/design decisions and diagrams | [Solution Design](Solution_Design.md) |
| Model explanations | [Model Overview](AppSheet_Data_Model_Overview.md) |
| Exact model/configuration values | [Data Dictionary](AppSheet_Data_Dictionary.xlsx) |
| Triggered promotion implementation detail | [Release Workflow](Release_Workflow.md) |
| Failure/hotfix handling | [Release Recovery](Release_Recovery_Runbook.md) |
| DEV setup or changed routing | [DEV Preparation](Development_Environment_Preparation.md) |
| Requested apps/DB refresh | [DEV Refresh](Development_Refresh_Runbook.md) |
| SQL migrations | [Database procedure](../database/README.md#each-change) |
| Release record tooling | [Release helpers](../scripts/releases/README.md) |
| Dated changes/tests/decisions | [Change Logs](../Change%20Logs/) |
| Dormant analysis/export pilot | [Feature reference](reference/Daily_Loan_Analysis_Automation.md) |
| Historical evidence | [Archive index](archive/README.md) — excluded from routine work |

Update this map when paths or purposes change. Version/status facts belong in the tracker/inventory, policy in AGENTS, and completed history in release evidence. Read/update only documents affected by the task.
`);
await write('Documents/Promotion_Documentation_Checklist.md',`# Promotion checklist location

The former per-file register is retired. The single [master Markdown checklist](../scripts/releases/templates/promotion-checklist.md) includes promotion activities and documentation impact/closure. Create one filled copy per release with the [checklist helper](../scripts/releases/README.md#one-checklist-per-release).

Always update/verify Release Tracker, Environment Inventory and Development Changes. Add only documents affected by the release. No routine archive dispositions, full-folder inventory or separate documentation checklist. Historical release checklists remain dated evidence. This compatibility link contains no second template.
`);

// Preserve existing design decisions and add useful interpretation from retired companions.
let solution=await read('Documents/Solution_Design.md');
solution=solution.replace(/## Prototype scope[\s\S]*?## OLTP Operations app/,'## Scope\n\nPrototype boundaries and execution rules are defined in [AGENTS](../AGENTS.md#3-essential-implementation-rules). This file owns application responsibility and reporting design decisions.\n\n## OLTP Operations app');
solution=solution.replace(/## Model and business logic[\s\S]*?## Looker Studio dashboard/,'## Model ownership\n\nBusiness behavior and relationships are explained in the [Model Overview](AppSheet_Data_Model_Overview.md); exact values belong in the dictionary. Integrity, auditability and correction rules follow AGENTS.\n\n## Looker Studio dashboard');
solution+=`\n## Business and ecosystem diagrams\n\n- [OLTP lifecycle diagram](OLTP_Business_Processes.drawio): three editable pages cover loan lifecycle, payment processing and controls/ownership. Update only depicted behavior, not version numbers, formula refinements or presentation-only changes. Its synthesis baseline is 12 September; current business explanations/verified release evidence take precedence. It does not claim fresh lifecycle or delivery acceptance.\n- [Ecosystem diagram](Loan_Business_Ecosystem.drawio): the app/database pair, partner assistant services, access/recovery and public-site context. As confirmed on 16 September, Azure hosts the partner worker; Tailscale provides private RDP; Outlook fallback and Looker are in use. Borrower-location sheets are a historical import, not a live feed. The privacy site is published; custom-domain mapping is not inferred. AI Collection was excluded from this drawing by owner request; this does not alter that separate project's authority. Dormant facilities are not active release dependencies.\n\nGeneration/asset instructions are in [scripts guide](../scripts/README.md#diagram-maintenance). Original provenance and interpretation are preserved in the archive: [OLTP](archive/2026-09-20/OLTP_Business_Processes.md), [ecosystem](archive/2026-09-20/Loan_Business_Ecosystem.md). These archived companions are no longer maintained in parallel.\n`;
await write('Documents/Solution_Design.md',solution);

// Build the single master from the owner-reviewed 24-step reduction, not the old Excel builder.
const editor=await read('scripts/releases/streamline-promotion-review.mjs');
const groups=vm.runInNewContext(editor.match(/const groups=(\[[\s\S]*?\n\]);/)[1]);
const checklistRows=groups.map(([ids,stage,when,action])=>{
 let text=action;
 if(ids[0]===45)text='Complete the documentation table below: update/verify the three core records and add only affected documents. No archive/history dispositions or routine folder scan.';
 if(ids[0]===46)text='Reconcile manifest/log, versions, approvals/tests and recovery links. Close only promoted differences. Update exact dictionary rows when changed; revise overview only if explained behavior/architecture changes. Check relevant links/model values and intended Git diff once.';
 return `| P${String(ids[0]).padStart(2,'0')} | ${stage} | ${when} | ${text} | Pending | |`;
});
await write('scripts/releases/templates/promotion-checklist.md',`# {{RELEASE}} promotion checklist

Template revision: 2026-09-20. **Single master:** this file. Create one release copy under outputs; fill that copy throughout development/promotion. Do not maintain an Excel checklist or separate document checklist. Implementation detail: [Release Workflow](../../../Documents/Release_Workflow.md); exceptions: [Recovery](../../../Documents/Release_Recovery_Runbook.md).

## Continue here

- Scope / dependencies / app Upgrade or Unchanged decisions: Pending
- Manifest / change log / test evidence: Pending
- DEV readiness / owner acceptance: Pending
- Production authorization / approved RC revision: Pending
- DEV / RC / PROD-before / PROD-after / rollback / SQL versions: in linked manifest; Pending
- Implementation commit / Flyway manifest / final tag: in linked manifest; Pending
- Completed / next / blockers: Pending
- Documentation impact: Pending — list affected paths or None with a scope-based reason; add their closure rows below.

## Execution rules

Execute applicable rows in order; one result/evidence link per coherent check. Status: Pending, In progress, Done, Reused, N/A or Blocked. Reused requires still-valid evidence; N/A requires a brief reason. Skip untriggered setup/SQL/external/recovery work. Reuse existing decisions/authority, identities and passing tests; recheck pre-upgrade baseline/version and changed dependencies. No repeated DEV suite, whole-app diff, repeat deployment check for deployed apps, untouched-route audit or duplicate report. Consult only the runbook section needed to perform a triggered row. Stop affected dependent work on failure; no invented gates or silent scope expansion.

## Activities

| ID | Stage | When required | Activity / completion criterion | Status | Evidence / reason |
| --- | --- | --- | --- | --- | --- |
${checklistRows.join('\n')}

## Documentation impact and closure

The three rows below always require Updated or Verified current. Add only affected documents, with Updated / Verified current / Pending / Blocked and a section/row reference. Scope-based non-applicability belongs in the single impact note above, not a row for every untouched file. No Pending/Blocked required row at closure.

Triggers: exact model/formula changes → dictionary; changed behavior/relationships/ownership → overview/design; changed depicted flows → relevant drawio; changed operating method → affected runbook/AGENTS; changed paths/purposes → README/links; dormant pilot → only if its contract/dependencies or activation is in scope. Preserve historical evidence; archives are excluded.

| Document | Disposition | Updated section / evidence |
| --- | --- | --- |
| [Release Tracker](../../../Documents/Release_Tracker.md) | Pending | |
| [Environment Inventory](../../../Documents/Environment_Inventory.md) | Pending | |
| [Development Changes](../../../Documents/Development_Changes.md) | Pending | |

## Close

- Outcome / limitations / rollback: Pending
- Final evidence commit / Rnnn tag / remote verification: Pending
- RC retention / retirement decision: Pending or justified N/A

Released requires applicable activities, documentation and publication complete. If only documents/publication remain, repair them without redeploying. Record final outcome in the manifest/tracker before the final evidence commit and verify publication afterward; do not create self-referential commit hashes.
`);

// Resolve links for moved documents and snapshots, retaining historical assertions.
const origins=new Map([...relocated].map(([a,b])=>[b,a]));
for(const name of Object.keys(previous))if(!origins.has(archive+'/'+name))origins.set(archive+'/'+name,'Documents/'+name);
const tracked=execFileSync('git',['ls-files','*.md'],{encoding:'utf8'}).split(/\r?\n/).filter(Boolean);
const candidates=new Set([...tracked,...origins.keys(),pilotTo]);
for(const file of candidates){
 if(file.startsWith('sources/')||!file.endsWith('.md'))continue;
 let text;try{text=await read(file);}catch(e){if(e.code==='ENOENT')continue;throw e;}
 const origin=origins.get(file)||file;
 const changed=text.replace(/\]\(([^)]+)\)/g,(whole,url)=>{
  if(/^[a-z][a-z0-9+.-]*:|^#/i.test(url))return whole;
  const [raw,frag]=url.split('#');let decoded;try{decoded=decodeURIComponent(raw);}catch{return whole;}
  const absolute=path.resolve(path.dirname(origin),decoded);const relative=path.relative(root,absolute).replaceAll('\\','/');
  const dest=relocated.get(relative)||relative;
  if(origin===file&&!relocated.has(relative))return whole;
  const target=path.relative(path.dirname(path.resolve(file)),path.resolve(dest)).replaceAll('\\','/').replaceAll(' ','%20');
  return ']('+target+(frag?'#'+frag:'')+')';
 });
 if(changed!==text)await write(file,changed);
}
await write('Documents/archive/README.md',`# Historical documentation archive

Excluded from normal development/promotion reads, updates and checklist closure. Open only for a specific historical question, recovery investigation or explicit archive task. Current references are in the [documentation map](../README.md).

The [20 September archive](2026-09-20/) preserves superseded migration plans, accumulated model history, the original dictionary, pre-cleanup current-state snapshots and retired diagram companion notes. Markdown relative links were relocated; dated claims were not revalidated. Both archived XLSX files are preserved byte-for-byte. The former per-document register is evidence only.

The cleanup [change log](../../Change%20Logs/CHANGE_NOTES_DOCUMENTATION_OPTIMIZATION_2026-09-20.md) links preservation checks and decisions. No archive maintenance is implied by an ordinary release.
`);
await write('outputs/promotion-checklist-review-20260920/README.md',`# Superseded Excel review artifact

The owner approved Markdown execution on 20 September 2026. The XLSX and review inventory here are frozen review evidence, not templates or release checklists. Use the single [master Markdown template](../../scripts/releases/templates/promotion-checklist.md) and one filled copy per release. Do not update/regenerate this Excel file in parallel.
`);
await write('outputs/documentation-optimization-20260920/relocated-paths.json',JSON.stringify(Object.fromEntries(relocated),null,2));
console.log(JSON.stringify({archive,moved:relocated.size,masterActivities:groups.length,trackerReleases:compact.length}));
