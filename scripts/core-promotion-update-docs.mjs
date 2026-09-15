import fs from 'node:fs/promises';
async function edit(file,fn){const s=await fs.readFile(file,'utf8');await fs.writeFile(file,fn(s));}
if((await fs.readFile('Documents/AppSheet_Data_Model_Overview.md','utf8')).includes('### Core payment phases 1–6 — live in both environments'))throw Error('Production release already documented; inspect changes rather than replaying this checkpoint');
const release='[production release](../outputs/core-promotion-20260915/REPORT.md)';
await edit('Documents/AppSheet_Data_Model_Overview.md',s=>{
 s=s.replace(/The initial reconciliation captured[\s\S]*?## Architecture and ownership/,`Production is **OLTP 3.000094 / OLAP 1.100062 / Flyway V10** after the owner-authorized phases 1–6 promotion on 15 September 2026. Rollback app versions were freshly recorded as **3.000080 / 1.100056**. Production and development normalized schemas match SHA256 \`242404152af2760a046b1e628e7a4df1e56a1a7230e90839f8192d8e05217bba\`. The exact tested V6–V10 files were promoted from commit \`33ed313f585311dcd0caffb1488ea8ac574bfb6e\`.

The dictionary contains **569 production business-column entries** (202 OLTP, 367 OLAP), including the three new physical fields and two generated reverse-reference columns per app. Source bindings, existing business-table permissions, manual form/detail orders and unrelated formulas are preserved. Reporting Loans adds Ref Closing Payment, Charge Generation Request and Related Payments while remaining READ_ONLY. AppSheet internal process metadata is listed separately and is not a PostgreSQL business table.

Both current production apps loaded and synced; the unsaved payment form was inspected and cancelled. No production financial test transaction or forced push was submitted. Core historical records match their pre-release fingerprints. The pre-existing hourly OLAP process refreshed Daily Analytics during the window, so that snapshot is not byte-identical. First natural production nightly execution, ordinary device push feedback, offline/multiple-device recovery and Looker remain unverified. See ${release} for precise checks and rollback.

## Architecture and ownership`);
 s=s.replace('### Development core payment phases 1–3 — 15 September 2026','### Core payment phases 1–6 — live in both environments');
 s=s.replace(/Production remains \*\*V5[\s\S]*?with functions\/triggers in \*\*DB Logic\*\*\./,'Production uses V10 / OLTP 3.000094 / OLAP 1.100062; development uses V10 / OLTP 1.000042 / OLAP 1.000040. SQL owns the same transactional behavior in both isolated environments. Production notifications select existing partner recipients, excluding the acting user; development routes only to its approved owner account. The production catalog and exact column rules are updated in the dictionary. Development test checkpoints below are historical evidence, not additional production test claims.');
 s=s.replace('with the previously approved owner-only development destination','with production partner destinations and the separately approved owner-only development destination');
 s=s.replace('Phase 6 owner acceptance is pending.','The owner accepted the implementation through the explicit phases 1–6 production promotion request; separate phase-6 device delivery was not explicitly confirmed.');
 s=s.replace('Development pg_cron 1.6.7 job','Production and development pg_cron job');
 s=s.replace('Both apps retain database-3, existing keys and financial calculations','Production retains database-2 and development database-3, with existing keys and financial calculations');
 s=s.replace('No production release or Looker edit occurred.','These were development tests; the subsequent production release is recorded above. Looker was not edited.');
 s=s.replace('and overall owner acceptance remain pending','remain untested; overall implementation acceptance was provided through the production request');
 s=s.replace("Production's enabled 00:05 SE Asia schedule is retained; development's daily bot remains disabled.",'At the historical V5 checkpoint the production AppSheet schedule remained enabled. V9 promotion supersedes it: both AppSheet daily bots are disabled and each database runs its own 00:05 Bangkok job.');
 return s;
});
await edit('Documents/Environment_Inventory.md',s=>{
 s=s.replace('| 3.000080 | database-2 |','| 3.000094 | database-2 |').replace('| 1.100055 | database-2 |','| 1.100062 | database-2 |');
 s=s.replace('| Flyway | V5 migrated and validated | V10 migrated and validated | Core payment, atomic final-charge preparation, common generation and atomic default are development only; schemas intentionally differ |','| Flyway | V10 migrated and validated | V10 migrated and validated | Exact tested V6–V10 promoted; normalized schemas match |');
 s=s.replace('### Interval anchor verification',`### Core phases 1–6 production release — 15 September 2026

Production app rollback versions were OLTP 3.000080 and freshly observed OLAP 1.100056. A full logical backup restored successfully, with all 14 original table fingerprints matching. Production V6–V10 applied at 22:07:33 Bangkok. Normalized V10 hash: \`242404152af2760a046b1e628e7a4df1e56a1a7230e90839f8192d8e05217bba\`. Both production apps saved and synced, with business bindings/permissions and unrelated formulas preserved. No financial test transaction was submitted. Original financial records remain unchanged; the existing hourly analytics refresh changed its snapshot.

Production Cloud SQL flags saved/restarted 22:05:38–22:06:10 Bangkok: cloudsql.enable_pg_cron=on, cron.database_name=loan_manager_prod, cron.timezone=Asia/Bangkok, cron.max_running_jobs=1. Existing IAM authentication and max_connections=100 were preserved. Job loan-daily-charges was enabled at 22:50:48 for 00:05 Bangkok, first due 16 September. Development nightly generation remains active independently. No instance tier/network/credential change. ${release} records backups, exact hashes, consumers, verification and coordinated rollback.

### Interval anchor verification`);
 s=s.replace('Production rows retain the prior captured state.','Production rows reflect the phases 1–6 promotion at OLTP 3.000094 / OLAP 1.100062.');
 s=s.replace('| production-oltp | Auto Receive First-Day Charge | Yes |','| production-oltp | Notification - First-Day Charge | Yes |');
 for(const bot of ['Create First-Day Charge','Generate Daily Charges','Payments - Process Receipt'])s=s.replace(`| production-oltp | ${bot} | Yes |`,`| production-oltp | ${bot} | No |`);
 s=s.replace('Production OLTP retains seven enabled bots.','Production OLTP has four enabled notification-only bots; all three superseded financial bots are disabled.');
 s=s.replace('No production flags/job were changed.','That statement describes the development checkpoint; the later production flags/job promotion is recorded above.');
 s=s.replace('All four versions above reflect the interval release.','The following paragraph records the historical interval-release versions.');
 return s;
});
await edit('Documents/Development_Changes.md',s=>{
 s=s.replace('production OLTP **3.000080**, production OLAP **1.100055**. Development is Flyway **V10**, production **V5**.','production OLTP **3.000094**, production OLAP **1.100062**. Both databases are Flyway **V10**.');
 const start=s.indexOf('## Current differences'),end=s.indexOf('### Atomic Default Loan');
 if(start<0||end<0)throw Error('Difference register boundaries changed');
 s=s.slice(0,start)+`## Current differences

| Area | Production | Development | Status |
| --- | --- | --- | --- |
| Database instance | appsheet-pg-prod-20260914 | appsheet-pg-dev-20260915 | Isolation retained |
| AppSheet source | database-2 | database-3 | Never promote the development host |
| SQL schema | Flyway V10 | Flyway V10 | Exact migration hashes and normalized schemas match |
| Core payments, final close, first day, default | Atomic SQL | Same SQL | Phases 1–6 promoted with owner approval |
| Manual generation | Hidden dated Loans request | Same request | Same common SQL rules |
| Nightly generation | pg_cron 00:05 Bangkok, active | pg_cron 00:05 Bangkok, active | Separate jobs; AppSheet generation disabled |
| New fields | Closing-payment Ref, target-loan Ref, hidden generation request | Same model | Both consumers reconciled; no backfill |
| Notification recipients | Existing Partners emails, excluding acting user | Approved owner account only | Intentional environment difference |
| OLAP hourly analytics | Existing refresh enabled | Disabled | Preserved; phase 7 not included |
| Connections | 100 | 50 | Capacity/settings remain separate |
| Companion navigation | Production app | Development app | Isolation retained |

Owner acceptance of the implementation was provided through the explicit request to promote phases 1–6. Production rollback versions are OLTP 3.000080 / OLAP 1.100056, with a coordinated SQL forward-fix or approved database recovery. See ${release}. The workbook records current production columns/rules and the earlier development comparison history with promoted production values. The sections below retain development test checkpoints and their rollback versions; they do not supersede this current release status.

`+s.slice(end);
 s=s.replace('Original records in 14 tables are unchanged; owner acceptance pending.','Original records in 14 tables were unchanged at that development checkpoint. The owner subsequently authorized production promotion; separate phase-6 device push confirmation was not recorded.');
 return s;
});
await edit('database/README.md',s=>{
 s=s.replace('## Recovery and limits',`## Current production release

Phases 1–6 were explicitly authorized and promoted on 15 September 2026 from tested commit \`33ed313f585311dcd0caffb1488ea8ac574bfb6e\`. Both environments are **V10**. Production app versions are **3.000094 / 1.100062**; development remains **1.000042 / 1.000040**. See [release evidence and recovery](../outputs/core-promotion-20260915/REPORT.md).

Production job \`loan-daily-charges\` is active for **00:05 Asia/Bangkok**. Read it with \`Set-ProductionChargeSchedule.ps1 -Mode status\`; enable/pause operations require the actual owner approval reference and exact tested release manifest. This runner changes only scheduler activation, not financial rows or DDL. \`Get-CorePromotionAudit.ps1\` returns aggregate fingerprints/catalog metadata without borrower data. Development fixture/scheduler runners remain pinned to development.

AppSheet financial bots are disabled and notification-only routes use production partner recipients. The V6–V10 sections below retain development test and rollback checkpoints. Their former development-only scope is superseded by this release. Applied migrations are immutable; any correction now requires **V11 or higher**. Restore AppSheet and SQL together; an app version restore alone is unsafe.

## Recovery and limits`);
 s=s.replaceAll('— development only','— promoted; development test evidence below');
 s=s.replace('Owner acceptance is pending;','Owner authorized the subsequent production promotion;');
 s=s.replace('Production remains V5 and requires separate release approval.','Production now runs the same V10 schema under the release approval above.');
 s=s.replace('Production remains V5; no production release is authorized.','Production promotion is recorded above; these are historical V7 development checks.');
 s=s.replace('Production remains V5.','Production now runs V10.');
 return s;
});
for(const file of ['outputs/default-loan-20260915/REPORT.md','Change Logs/CHANGE_NOTES_DEFAULT_LOAN_SQL_2026-09-15.md'])await edit(file,s=>{
 const first=s.indexOf('\n');return s.slice(0,first)+`\n\n**Subsequent release:** the owner accepted the implementation through the explicit request to promote phases 1–6 on 15 September 2026. Production promotion is complete at OLTP 3.000094 / OLAP 1.100062 / Flyway V10; see the core-promotion-20260915 release report. Separate phase-6 device notification feedback was not explicitly received. The development-only status and rollback checkpoints below are historical.\n`+s.slice(first);
});
