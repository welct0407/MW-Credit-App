import fs from 'node:fs/promises';
const root='C:/GitHub/AppSheet-Loan-Project';
const out=root+'/outputs/documentation-reconciliation-20260915';
const m=JSON.parse(await fs.readFile(out+'/app-model.json','utf8'));
const db=JSON.parse(await fs.readFile(out+'/production-database.json','utf8'));
const priv='C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/documentation-reconciliation-20260915';
const settings={};
for(const label of Object.keys(m)){
 const perf=await fs.readFile(priv+'/'+label+'-performance.txt','utf8');
 const bots=await fs.readFile(priv+'/'+label+'-bots.txt','utf8');
 const sync={};for(const name of ['Server caching','Delta sync','Quick sync','Sync on start','Delayed sync','Automatic updates']){
  const section=perf.split('heading "'+name)[1];if(!section)throw Error('Missing sync setting '+label+' '+name);
  const match=section.match(/- checkbox( \[checked\])?/);if(!match)throw Error('Missing checkbox');sync[name]=!!match[1];
 }
 const botList=[...bots.matchAll(/treeitem "[\uE000-\uF8FF] ([^"]+)"/g)].map(x=>({name:x[1].replace(/^\(disabled\) /,''),enabled:!x[1].startsWith('(disabled) ')}));
 if(botList.length!==(label.endsWith('oltp')?7:3))throw Error('Incomplete bot inventory '+label);
 settings[label]={sync,bots:botList};
}
await fs.writeFile(out+'/app-editor-settings.json',JSON.stringify({verifiedDate:'2026-09-15',method:'Read-only current AppSheet editor; no Save/Run/Enable/Disable actions',apps:settings},null,2));
const esc=s=>String(s??'').replaceAll('|','\\|').replaceAll('\n','<br>');
const table=(head,rows)=>'| '+head.join(' | ')+' |\n| '+head.map(()=>'---').join(' | ')+' |\n'+rows.map(r=>'| '+r.map(esc).join(' | ')+' |').join('\n')+'\n';
const purpose={Borrowers:'Borrower master; operational and reporting indicators',Loans:'Loan terms, lifecycle and balances',Repayments:'Posted principal/interest entries and receipt/allocation trace',Statistics:'Control row and app-level KPI virtual columns',Charges:'Amounts due and charge-level collection state',Partners:'Partner master; management owned by OLAP',Payments:'Receipt and processing state; workflow owned by OLTP','Payment Allocations':'Receipt-to-charge allocation snapshots; workflow owned by OLTP','Cash Pool Contributions':'Partner capital contributions',Settlements:'Partner settlement records','Daily Analytics':'Persisted daily portfolio snapshots','Loan Assessment':'Proposed-loan inputs and app-calculated assessment outputs',Calendar:'Date spine and assessment forecast calculations'};
const prods=['production-oltp','production-olap'];
const names=[...new Set(prods.flatMap(k=>m[k].tables.filter(t=>t['Data Source']!=='native').map(t=>t['Table name'])))];
const catalog=names.map(name=>{const cols=k=>m[k].columns.filter(c=>c.table===name);const ts=prods.map(k=>m[k].tables.find(t=>t['Table name']===name));return[name,ts[0]?'OLTP + OLAP':'OLAP',name==='Calendar'?'Google Sheets':'PostgreSQL',...prods.map(k=>cols(k).length?`${cols(k).filter(c=>c['Virtual?']!=='Yes').length} / ${cols(k).filter(c=>c['Virtual?']==='Yes').length}`:'—'),purpose[name]];});
const refs=[];for(const kind of prods)for(const c of m[kind].columns.filter(c=>names.includes(c.table)&&c.Type==='Ref')){const q=JSON.parse(c['Type Qualifier']);refs.push([kind.endsWith('oltp')?'OLTP':'OLAP',c.table,c['Column name'],q.ReferencedTableName,q.ReferencedKeyColumn,q.IsAPartOf?'Yes':'No']);}
const overview=`# AppSheet production data model

Reconciled 15 September 2026. This is the current production architecture reference. [Development differences](Development_Changes.md), [environment inventory](Environment_Inventory.md), and [documentation index](README.md) are maintained separately. The detailed inventory is in [AppSheet_Data_Dictionary.xlsx](AppSheet_Data_Dictionary.xlsx).

## Verification basis

Production app definitions were freshly captured from the read-only AppSheet documentation pages: OLTP **${m['production-oltp'].version}**, OLAP **${m['production-olap'].version}**. Captures cover tables, source bindings, column properties/formulas, references, slices and their membership, actions and views. Both database schemas were exported read-only and exactly match Flyway V1 after normalization. Runtime PostgreSQL version and connection limits were queried separately. Sync toggles and bot enablement were then checked in the current editor for all four apps. This reconciliation did not execute financial transactions or prove notification delivery, scheduled execution or Looker behavior.

The workbook contains all **555 production business-column entries** (196 OLTP, 359 OLAP), **14 slices**, their **440 membership entries**, and the live SQL catalog. Internal AppSheet process/user tables are identified in Prod Tables; their full generated schemas are retained in the [sanitized definition snapshot](../outputs/documentation-reconciliation-20260915/app-model.json), rather than mixed into the business dictionary. Counts are app-specific, not unique physical database columns.

## Architecture and ownership

Production OLTP and OLAP share Cloud SQL PostgreSQL database **loan_manager_prod** on **appsheet-pg-prod-20260914**, through AppSheet connection **database-2**. The original Money AppSheet database is historical migration reference. Production OLAP still reads its Calendar from **Calendar Help Table / Sheet1** through Google Sheets. AppSheet internal user/process tables remain native.

OLTP owns borrowers, loan operations, charges, receipts and allocation posting. OLAP owns partner management, contributions, settlement, portfolio analysis and loan assessment. Looker Studio is downstream presentation over governed feeds. Its source configuration has not been freshly reconciled in this task. External collection software remains governed in its separate repository; the presence of collection-related borrower fields here does not authorize changes to that system.

## Production table catalog

Counts below are provider/physical fields followed by virtual columns. Provider counts include AppSheet's _RowNumber where present; they must not be treated as SQL column counts. Exact PostgreSQL types/defaults/nullability are in the workbook's DB Columns sheet.

${table(['Table','Consumers','Source','OLTP provider / VC','OLAP provider / VC','Purpose'],catalog)}
## Keys and relationships

Preserve existing text **Row ID** keys byte-for-byte, including case. Do not cast imported AppSheet identifiers to PostgreSQL UUID or use _RowNumber as a stable key. Calendar uses its Date key. AppSheet Ref behavior and database foreign keys are separate controls: an AppSheet part-of relationship does not imply PostgreSQL ON DELETE CASCADE.

${table(['App','Child table','Ref column','Parent table','Parent key','Part of parent'],refs)}
PostgreSQL currently has **13 validated foreign keys**. The workbook records exact constraints, including update/delete behavior. Eight BEFORE-row blank-reference triggers call public.appsheet_normalize_blank_refs to convert optional empty-string references to NULL before constraint checking. This includes payment-related optional references and other shared tables. Historical missing payment links have not been fabricated by this documentation task. Normalizers remain in place by the owner's instruction to retain the constraints as they stand.

## Current calculations and workflow boundaries

Loans[Borrower Name] is a **Name virtual column** in both production apps, with expression **[Ref Borrowers].[Borrower Name]**. Borrowers[Borrower Name] remains physical. The obsolete Loans name column and its two maintenance triggers are absent from the live database baseline. Charges and Repayments use their existing loan-name dereferences.

Payments represent receipts; Payment Allocations represent receipt-to-charge processing snapshots; Repayments record posted principal/interest and optional payment/allocation trace. The existing OLTP action definitions and guards are captured exactly in app-model.json. Operational correctness depends on posted amounts and processing state, not merely the existence of a row. Read-only configuration capture does not establish atomicity across separate AppSheet writes.

Production loan assessment retains its **Loan Assessment input/control table**, app virtual output columns and the Google Sheets Calendar forecast path. Statistics remains a KPI/control table. The trigger-based assessment is a **development app design**, not the production app's assessment source. Lab tables/functions also exist physically in production because they were present before cloning and Flyway adoption; physical presence is not deployment in the production app.

The existing three loan types, whole-baht daily-installment allocation, first-day receipt behavior, duplicate-charge guards, early-closure/default guards and receipt retry/reconciliation rules are preserved. Detailed rule history and prior tests are retained in [model history](AppSheet_Data_Model_History.md) and the dated Change Logs. The fresh dictionary is authoritative for current exact expressions; historical narrative is not a new test result.

## SQL objects and change management

Both instances contain 14 business/lab base tables, two public views, six application functions and ten enabled application triggers. public.flyway_schema_history is an additional metadata table, excluded from both apps and the business-column inventory. The same baseline includes indexes and constraints. Source SQL is [V1__existing_schema.sql](../database/migrations/V1__existing_schema.sql); later changes require immutable higher-version migrations under [database/README.md](../database/README.md).

Changes must be tested in development, with affected OLTP/OLAP consumers checked in the new GUI. Promote the exact tested commit/migration hashes after backup, drift review, rollback planning and explicit owner release approval. Never copy development financial data into production during schema promotion. AppSheet versions/bindings and Cloud SQL capacity/network settings are recorded separately from Flyway.

## Maintenance and remaining checks

Update this overview and the dictionary together with the applicable Markdown change log. Keep one production baseline and a development difference register. On promotion, update production documentation and close the promoted development differences. Re-export app definitions and database catalogs after model changes; a Flyway checksum validation alone is not a live drift check.

No manual financial test is needed for this documentation-only change. Owner review should confirm the environment labels and prototype scope. Bot enablement and six sync toggles are freshly recorded; scheduled execution, report/export delivery and sustained capacity behavior were not retested. See [verification coverage](Environment_Inventory.md#verification-coverage). Historical source notes remain preserved and explicitly dated.
`;
await fs.writeFile(root+'/Documents/AppSheet_Data_Model_Overview.md',overview);
const envRows=[['Production OLTP','Loan Manager ผู้จัดการสินเชื่อ','93844270-6aa5-420b-a960-bcdf08abd357',m['production-oltp'].version,'database-2',8],['Production OLAP','Loan Business Insights','e74dd368-654f-44d7-bccf-83cf361d1cdb',m['production-olap'].version,'database-2',12],['Development OLTP','LoanMgr PG Test 20260914','65faacd8-2b0d-43bf-9e0a-58eb915dcf9b',m['development-oltp'].version,'database-3',8],['Development OLAP','LoanInsights PG Trial 20260914','494cd013-0d9b-482f-9559-c9d83059de91',m['development-olap'].version,'database-3',13]];
await fs.writeFile(root+'/Documents/Environment_Inventory.md',`# Environment inventory

Updated 15 September 2026. Production/development are separate Cloud SQL instances. The development database retains the name loan_manager_prod because it was cloned; use instance/host, not the database name alone, to identify the environment.

## App identities and bindings

${table(['Environment','App','App ID','Live version','SQL connection','SQL tables / views'],envRows)}
Production OLAP additionally uses Google Sheets Calendar; development OLAP uses the SQL Calendar view. Native internal tables are excluded from the SQL counts. All 41 SQL bindings across the four apps were captured. The workbook records the exact logical-to-physical mapping.

## Cloud SQL

| Setting | Production | Development | Evidence |
| --- | --- | --- | --- |
| Project | clever-oasis-508610-n7 | clever-oasis-508610-n7 | Repository environment configuration |
| Instance | appsheet-pg-prod-20260914 | appsheet-pg-prod-20260914 | Environment configuration |
| Public host | 34.21.174.215 | 34.21.174.215 | Environment configuration; fresh successful connection |
| Database | loan_manager_prod | loan_manager_dev | Fresh SQL query |
| PostgreSQL | 18.6 | 18.6 | Fresh SQL query |
| max_connections | 200 (shared instance setting) | 200 (shared instance setting) | Fresh SQL query |
| Connection | Direct public IP, SSL required | Direct public IP, SSL required | SSL active on audit sessions; configured sslmode=require |
| Tier | db-f1-micro | db-f1-micro | Latest dated capacity/development logs; not a fresh Cloud Console inspection |
| Storage | 10 GB HDD, automatic increase | 10 GB HDD | Latest dated configuration logs |
| Access list | AppSheet 73 addresses plus authorized workstation /32 | Same recorded access scope | Flyway adoption log; no network change here |
| Flyway | Successful explicit baseline 1 | Successful explicit baseline 1 | Fresh schema-history query |

Raising max_connections does not prove enough memory for that many active queries. The shared value of 200 is a connection ceiling, not measured sustainable concurrency. Capacity changes require separate documentation and may restart the instance. The runtime's sslmode=require encrypts traffic; it is not hostname verification. No proxy is used.

Passwords remain outside Git under Documents/ChatGPT/AppSheet-Loan-Project. Both environment configurations reference the existing external password file; values are never included here. Private credential/snapshot backup coverage is not established by Git or database backups. Backup/PITR/deletion-protection settings were recorded in prior instance logs; no restore was tested by this documentation task.

## Verification coverage

| Area | Latest evidence | Status / limitation |
| --- | --- | --- |
| Four AppSheet definitions | 15 Sep 12:17–12:20 Bangkok, read-only appdoc | Tables, columns, Refs, slices, actions and views captured; versions above |
| PostgreSQL schema | 15 Sep fresh exports and catalog queries | Both normalized schemas equal V1 SHA256 0edda94ee69bbcfe1e2b8bf5bad16f7dbbd46af7289a9700bff280b49ea20d38 |
| Runtime settings | Fresh SQL queries recorded in output JSON | PostgreSQL 18.6, SSL, shared-instance max_connections 200 |
| Database application objects | Fresh catalogs | 14 base tables + 2 views + 6 functions + 10 triggers + 13 validated FKs; plus Flyway metadata |
| Cloud tier/network/backups | Dated micro/development/Flyway change logs | Recorded latest configuration; not freshly checked in Console |
| Development smoke tests | Development instance verification, 15 Sep | Concurrent sync and assessment edit/readback passed earlier; not repeated here |
| Production financial lifecycle | PostgreSQL migration/cutover logs | Historical test evidence; no new production test transaction |
| Bot enablement | Current editor, all four apps | 20 bot states recorded below; scheduled execution/delivery not tested |
| Sync toggles | Current editor, all four apps | All six settings recorded below; no settings changed |
| Looker / export delivery | Existing design documents | Not freshly checked; no claim of current report or notification delivery |

The browser's full accessibility extraction timed out on the large appdoc; bounded DOM reads of the rendered documentation succeeded for all four apps. Sync settings and bot enablement were read in the current editor. This was read-only configuration capture, not legacy-GUI testing.

## Current sync settings

${table(['App','Server caching','Delta sync','Quick sync','Sync on start','Delayed sync','Automatic updates'],Object.entries(settings).map(([k,v])=>[k,...Object.values(v.sync).map(x=>x?'On':'Off')]))}
These are observed settings, not a recommendation to enable them. In particular, Quick Sync is on in all four apps and delayed sync is also on. Do not assume that an input is submitted immediately or that external database-trigger changes propagate through Quick Sync alone. Verification of automatic save/readback behavior remains a functional test, separate from this configuration inventory.

## Current bot enablement

${table(['App','Bot','Enabled'],Object.entries(settings).flatMap(([k,v])=>v.bots.map(x=>[k,x.name,x.enabled?'Yes':'No'])))}
Production Daily Loan Analysis Export remains disabled. The production OLAP Refresh Daily Analytics Daily 2 bot is enabled; its predecessor is disabled. All three development OLAP bots are disabled. Production OLTP has all seven listed bots enabled; development retains three transactional bots and disables generation/notification bots. No bot was run or changed. Codex scheduler state and delivery acceptance remain unverified.

## Evidence and rollback

[Reconciliation evidence](../outputs/documentation-reconciliation-20260915/verification.json), [production catalog](../outputs/documentation-reconciliation-20260915/production-database.json), [development catalog](../outputs/documentation-reconciliation-20260915/development-database.json), and [app definitions](../outputs/documentation-reconciliation-20260915/app-model.json) contain configuration only. Full private snapshots remain outside Git.

Documentation rollback point: Git commit 0a151318a0ddb2d6d3719eadc3979adb78446281 and the archived original workbook. No live app/database configuration changed in this task. Operational rollback must follow its own release log, not restore test apps to production sources blindly.
`);
await fs.writeFile(root+'/Documents/Development_Changes.md',`# Development differences

Updated 15 September 2026 against production OLTP ${m['production-oltp'].version} / OLAP ${m['production-olap'].version}. Development versions are OLTP ${m['development-oltp'].version} / OLAP ${m['development-olap'].version}. Maintain this difference register alongside the single [production model](AppSheet_Data_Model_Overview.md); do not maintain a second independently edited full dictionary.

## Current differences

| Area | Production | Development | Promotion status |
| --- | --- | --- | --- |
| Database identity | appsheet-pg-prod-20260914 / loan_manager_prod | appsheet-pg-prod-20260914 / loan_manager_dev | Isolation is by database; verify the full instance/host/database tuple |
| AppSheet source | database-2 | database-3 | All copied app SQL sources isolated |
| Loan Assessment | Original table and AppSheet forecast VCs | Loan Assessment SQL Lab View over Loan Assessment SQL Lab | Prototype; owner acceptance and production app rollout pending |
| Calendar | Calendar Help Table / Sheet1 | OLAP Calendar SQL Lab generated view | Prototype replacement; fixed 153-day horizon |
| Assessment outputs | Original AppSheet calculations | Stored SQL outputs read through guarded VCs | Input update fires calculation/stamp triggers; sync retrieves results |
| Navigation | Production companion app | Other development copy | Keep environments isolated |
| SQL schema | Flyway baseline 1 | Identical Flyway baseline 1 | No schema drift at current capture; schema equality does not mean equal app behavior or data |
| Connections | 200 shared-instance limit | 200 shared-instance limit | Connection ceiling; infrastructure size unchanged |

The workbook's **Dev Differences** sheet contains the exact current table, business-column, slice, action and view differences. Full definitions are in the captured app-model.json. AppSheet-generated internal process schemas may differ when disabled processes are omitted; they are not PostgreSQL business tables. Captured differences are observed configuration, not automatic promotion instructions.

## Assessment prototype design

The lab assessment table retains five input fields and adds 18 result/metadata fields. Its view adds SQL Source Current. Including the provider row ordinal, AppSheet exposes 25 provider fields and 16 VCs; nine result VCs read stored outputs with input/fingerprint/date freshness guards. Calendar retains its Date key and ten descriptive VCs over generated dates from 2026-08-01 through 2026-12-31.

The assessment_calculate and assessment_stamp BEFORE-row triggers calculate and stamp an inserted/updated assessment row. Refresh Assessment action was removed at the owner's request; its unused hidden token remains for reversible schema preservation. An ordinary sync reads results but does not recalculate an unchanged row. Unsynced/mismatched inputs show the bilingual waiting-for-results message; stale source data/as-of dates show an out-of-date message. Offline clients cannot detect unseen database changes.

Production physically contains the same lab objects, but its app remains on the original sources/formulas. This distinction is verified in the source bindings. SQL functions/trigger bodies are versioned in Flyway V1 and fresh development/production schemas match exactly.

## Test evidence and open work

The [assessment report](../outputs/assessment-sql-20260915/REPORT.md) records prior independent correctness comparisons and five interleaved sync pairs: median 6.734 to 5.613 seconds, **16.6% faster**, with 15.072 ms median SQL refresh over ten runs. These are historical prototype measurements, not a new production benchmark.

The [development verification](../outputs/development-instance-20260915/verification.json) records isolated bindings, new-GUI sync, a restored assessment input test, and prior constraint/normalizer rejection checks. Development is a snapshot, not a continuously synchronized replica; Daily Analytics differed in contents at that test. Current schema capture does not certify data equality.

Before promotion: review the fixed forecast horizon, the shared MAIN input row versus per-user workflow, automatic recalculation expectations when source data changes, current sync settings, and owner acceptance. Run affected OLAP and OLTP workflows in the new GUI and remeasure against current production capacity. Do not migrate development financial data into production.

## Automation isolation and maintenance

Fresh current-editor checks confirm transactional OLTP bots retained, daily generation/notifications disabled, and all three OLAP schedule/export bots disabled. Production server caching is on while development server caching is off. Other observed sync toggles match: Delta off; Quick Sync, sync on start, delayed sync and automatic updates on. See Environment Inventory for all current values. Recheck isolation before future write testing; this read-only review did not execute bots.

For a new change, record its migration/version, consumers, exact expressions, tests, measured results, owner decision and rollback. After an approved production deployment, update the production overview and dictionary and close the corresponding difference. Preserve earlier decisions in Change Logs. App rollback versions that restore database-2 would reconnect development apps to production; do not use them casually.
`);
console.log('Current production overview, environment inventory and development differences written');
