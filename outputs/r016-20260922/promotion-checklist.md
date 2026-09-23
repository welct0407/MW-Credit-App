# R016 — Metabase migration promotion checklist

Template revision: 2026-09-21. **Single master:** `scripts/releases/templates/promotion-checklist.md`. Create one release copy under outputs; fill that copy throughout development/promotion. Do not maintain an Excel checklist or separate document checklist. Implementation detail: [Release Workflow](../../Documents/Release_Workflow.md); exceptions: [Recovery](../../Documents/Release_Recovery_Runbook.md).

## Continue here

- Scope / dependencies / app Upgrade or Unchanged decisions: nine report pages; R015 V33 and accepted POC; both apps unchanged.
- Manifest / change log / test evidence: manifest.json, README.md and ../../Change Logs/CHANGE_NOTES_R016_2026-09-22.md.
- DEV readiness / owner acceptance: nine pages implemented and verified; owner review of migrated pages and the Income Statement pending.
- Production authorization / approved RC revision: owner explicitly authorized report build/publication and Singapore rebuild; no RC.
- DEV / RC / PROD-before / PROD-after / rollback / SQL versions: apps unchanged, V33 retained; private application/PROD restore evidence linked.
- Implementation commit / Flyway manifest / final tag: useful checkpoint on master; no Flyway change; final R016 tag deferred.
- Completed / next / blockers: 126 visual placements verified; next owner review and refinements. Existing sources do not provide borrower balance history.
- Documentation impact: tracker, inventory, differences, solution design, model overview, dictionary reporting sheet and Metabase runbook. Operational AppSheet model/workflows and diagrams are unchanged.

## Execution rules

Execute applicable rows in order; one result/evidence link per coherent check. Status: Pending, In progress, Done, Reused, N/A or Blocked. Reused requires still-valid evidence; N/A requires a brief reason. Skip untriggered setup/SQL/external/recovery work. Reuse existing decisions/authority, identities and passing tests; recheck pre-upgrade baseline/version and changed dependencies. No repeated DEV suite, whole-app diff, repeat deployment check for deployed apps, untouched-route audit or duplicate report. Consult only the runbook section needed to perform a triggered row. Stop affected dependent work on failure; no invented gates or silent scope expansion.

## Activities

| ID | Stage | When required | Activity / completion criterion | Status | Evidence / reason |
| --- | --- | --- | --- | --- | --- |
| P01 | A Readiness | Always | Confirm Rnnn scope, integrated DEV features/PROD fixes, dependencies and app Upgrade/Unchanged decisions. Reuse the existing manifest/log and DEV/model checkpoint; resolve unrelated unreleased work. Record readiness/owner acceptance. | Done | Nine pages implemented, including date-selectable Income Statement; owner review pending. AppSheet unchanged. See README and change log. |
| P10 | A Readiness | Always; reuse passing evidence | Accept recorded integrated DEV tests and both apps’ final zero-warning/error diagnostics. Rerun only checks invalidated by changed behavior, dependencies or data. No new full regression or live audit merely to start promotion. | N/A | No AppSheet upgrade or changed workflow; Metabase checks are recorded at P41. |
| P06 | A Readiness | First use / guard changed | Install/test scheduled guards in DEV before copy, including child calls and per-row filters. Prove canonical DEV allowed and harmless copy excluded in scheduled context. Reuse this proof in later releases. | N/A | No scheduled AppSheet guard change. |
| P08 | A Readiness | DEV setup / routing changed | Use DEV preparation only for missing/changed setup: DEV sources/links, owner-only Partner delivery data, distinct Login Email and initial deployment if needed. Keep audit fields and channels. Unmapped actors must be resolved for affected tests. | N/A | No DEV app setup or routing change. |
| P04 | A Readiness | SQL changes | Reuse completed Flyway-chain/DEV tests and old/new-app compatibility evidence, including relevant queued clients/locks. Pin the clean tested commit with New-Release.ps1 before DEV advances; include every pending migration/prerequisite. | N/A | No DDL/Flyway migration; V33 retained. Reporting grants are external access configuration. |
| P13 | B Capture | Always; app details if upgrading | Record PROD identities/baseline, restorable app versions and cutover/recovery order once. Confirm scoped authority before PROD effects; reuse existing approval and App Upgrade eligibility. Recheck eligibility only after access/plan changes. | Done | Owner authorized report publication, Hobby sizing and Singapore rebuild; private backups restored. |
| P14 | B Capture | App Upgrade; SQL-only pins above | Briefly freeze DEV and pin tested versions/commit. Create named Rnnn-RCk apps by definition-only copy: the copy-data checkbox is checked by default—actively UNCHECK it for every copy/retry. Also uncheck file-data-copy options and verify all are unchecked before clicking Copy. Never copy data, even temporarily; unresolved options mean do not submit. Record this confirmation with IDs/internal names and contain execution. Rebind existing sources in P25; reject accidental data copies. Resume DEV once independent copies/pins are verified. | N/A | No AppSheet RC or upgrade. |
| P22 | C SQL | SQL changes / DB writes | Verify restorable DB backup, schema drift and history; then validate/migrate/validate with the pinned manifest and existing runner. Record target/schema checks and before/after SQL versions. Complete compatible SQL before final RC PROD validation. | Done | Verified restored PROD backup reused with fresh ACL capture before the approved 73-column grants; no financial writes. remaining-backup.json and remaining-grants-applied.json. |
| P25 | D RC | App Upgrade | Rebind/reconcile every RC table/view and auxiliary source to PROD host/database/object. Save exact mappings once. No DEV source remains. Keep RC contained before PROD binding. | N/A | No AppSheet RC. |
| P18 | D RC | App Upgrade | Capture the existing PROD logo setting/appearance; apply the corresponding PROD theme/branding/logo and companion links. If needed restore the correct logo from resources/ in durable PROD/shared storage, independent of RC lifetime. Keep shared recipients on PROD contact data; confirm Login Email prerequisites. Restore only documented legacy DEV overrides. Verify these substitutions once. | N/A | No AppSheet branding or RC change. |
| P28 | D RC | External asset / access changes | Provision/check only affected templates, files, grants, endpoints and integrations outside App Upgrade. Link existing evidence for unchanged assets. | Done | Restricted report grants, existing Google partner access, DNS and proxy verified. |
| P29 | D RC | App Upgrade | Check copied guard coverage and this RC’s exact name exclusion; retain canonical DEV/PROD literals and intended bot states/schedules. Reuse runtime proof; no repeated diagnostic app or wait for every daily job. | N/A | No AppSheet RC. |
| P30 | D RC | App Upgrade | One RC validation pass: save/reload, editor data validation, zero issues, open/sync and representative changed screens. Resolve unexpected generated changes only. Complete initial Deployment Check and deploy new RC; reuse DEV business tests. | N/A | No AppSheet RC. |
| P33 | E Upgrade | App Upgrade | Freeze final deployed RC identity/version and mapping evidence. Confirm authorization covers that revision. Immediately before each upgrade, confirm unchanged PROD baseline and frozen RC version; drift/fixes require a new integrated RC. | N/A | No AppSheet upgrade. |
| P37 | E Upgrade | Each included app | App Upgrade the existing PROD ID from the frozen RC’s full internal name in planned order. Record source, target and before/after versions. Confirm success before dependent steps; never hand-recreate settings in PROD. | N/A | Both AppSheet definitions unchanged. |
| P39 | F Validate | Always; mappings if upgraded | One PROD pass: verify version/Deployed state, sources/substitutions, PROD-allowed/RC-excluded guards, both editors clear and both apps open/sync with changed entry points. Visually verify each upgraded logo loads and matches its pre-promotion appearance; use resources/ originals if restoration is needed and recheck the affected logo. Check recipients only if changed. Reuse DEV tests; no repeat Deployment Check. | Done | Metabase HTTPS and partner UI verified; nine tabs and 126 visual placements. Prior Singapore runtime checks reused; AppSheet checks not triggered. |
| P41 | F Validate | Uncovered SQL / critical / external effects | Run only targeted checks not already covered by SQL/RC/PROD evidence. At first guard introduction observe the next normal PROD run; later releases reuse proof. Record execution/delivery limits; no forced writes/notifications without scoped authority. | Done | 31/37 earlier checks retained, plus 101 Income Statement period/source/grain/permission checks. Desktop and mobile presets/rendering pass; the native fixed-date picker needs landscape on narrow phones. |
| P38 | F Validate | Paused jobs / cutover steps | Complete approved external cutover steps and resume temporary pauses. Keep integrity triggers and one active scheduler per job/environment. | Done | Singapore application database rebuilt; one healthy replica per service; obsolete volume and temporary SSH key removed. |
| P45 | G Close | Always | Complete the documentation table below: update/verify the three core records and add only affected documents. No archive/history dispositions or routine folder scan. | Done | Three core records, design, overview, runbook and dictionary reporting sheet (16 models / 236 fields) updated. Operational AppSheet worksheet contents unchanged. |
| P46 | G Close | Always | Reconcile manifest/log, versions, approvals/tests and recovery links. Close only promoted differences. Update exact dictionary rows when changed; revise overview only if explained behavior/architecture changes. Check relevant links/model values and intended Git diff once. | Done | Manifest, log, query/backup evidence and sixteen models reconciled for the nine-page review checkpoint. |
| P49 | G Close | RC exists | After all upgrades and required PROD validation pass, automatically delete the recorded RC apps for this promotion, including rejected/superseded attempts; no further owner confirmation. Delete definitions only, preserving DEV/PROD, shared data/files/logos and recovery evidence. Verify deletion and update manifest/log/inventory/checklist before P48. Keep failed/incomplete promotion RCs contained; report cleanup failures as pending. No DEV refresh. | N/A | No RC definitions created. |
| P48 | G Close | Always | Commit/push final sanitized evidence/docs; create/push unique annotated Rnnn tag at that evidence commit. Verify remote branch/tag. Do not move tags or redeploy to fix publication. | In progress | Publish the checked nine-page checkpoint; final R016 tag deferred until owner acceptance and full migration closure. |
| P50 | G Close | Always | Report Released only after required validation, documentation and publication pass. Give versions, evidence/tag, rollback and limitations. Otherwise state the incomplete phase; repair documents without repeating live tests. | In progress | Migrated pages and Income Statement ready for owner review; full migration is not Released. |
| P51 | X Exception | Failure / drift / required gap only | Stop affected dependent steps, record actual partial state and follow only the matching recovery branch. Preserve later writes/work; no blind replay or manual PROD fallback. Ask only for missing authority/material decisions. Reconcile resulting status and documents. | Done | Trial OOM resolved by bounded Hobby sizing. Failed volume moves superseded by Singapore rebuild; source incidental revisions restored. |

## Documentation impact and closure

The three rows below always require Updated or Verified current. Add only affected documents, with Updated / Verified current / Pending / Blocked and a section/row reference. Scope-based non-applicability belongs in the single impact note above, not a row for every untouched file. No Pending/Blocked required row at closure.

Triggers: exact model/formula changes → dictionary; changed behavior/relationships/ownership → overview/design; changed depicted flows → relevant drawio; changed operating method → affected runbook/AGENTS; changed paths/purposes → README/links; dormant pilot → only if its contract/dependencies or activation is in scope. Preserve historical evidence; archives are excluded.

| Document | Disposition | Updated section / evidence |
| --- | --- | --- |
| [Release Tracker](../../Documents/Release_Tracker.md) | Updated | R016 nine-page review checkpoint. |
| [Environment Inventory](../../Documents/Environment_Inventory.md) | Updated | R016 nine-page review checkpoint. |
| [Development Changes](../../Documents/Development_Changes.md) | Updated | R016 nine-page review checkpoint. |

## Close

- Outcome / limitations / rollback: nine pages implemented for review; unavailable borrower balance history is identified on page 7. Private application dump, retained encryption key and exact before/completed metadata exports provide recovery.
- Final evidence commit / Rnnn tag / remote verification: checked checkpoint publication; final R016 tag awaits full migration completion.
- RC cleanup / verified deleted IDs and evidence: N/A, no AppSheet RC.

Released requires applicable activities, documentation, RC cleanup and publication complete. If only documents/publication remain, repair them without redeploying. Record final outcome in the manifest/tracker before the final evidence commit and verify publication afterward; do not create self-referential commit hashes.

## Model and presentation refinement

The owner's subsequent review requested central reusable models and a redesigned presentation. Added six models (69–74), semantic keys/FKs and collection 8. All 22 questions now use query-builder model sources, with no per-visual SQL/joins/business expressions. All 26 business visual placements remain, with seven section headings and two notes. All 31 source-reconciliation cases pass; model grains, relationships, permissions and desktop/390px browser checks pass. See `model-verification.json`, `browser-verification.json` and the updated metric contract.

| Additional affected document | Disposition | Evidence |
| --- | --- | --- |
| AppSheet Data Dictionary | Updated | Metabase Models sheet now contains sixteen model grains and 236 fields; 13 original worksheet parts preserved. |
| AppSheet Data Model Overview / Solution Design | Updated | Shared reporting layer, grains, ownership and centralization rule. |
| Metabase runbook / model definitions | Updated | Model installation, model-only visual build, dashboard filter verification, recovery. |

Existing Tracker, Environment Inventory and Development Changes rows are updated for this refinement. Pre-change and completed object exports are private; all credentials stay outside Git. This is another checked review checkpoint, not full R016 acceptance or a final release tag.

## Remaining-page review checkpoint

The owner directed pages 3–8 and separately approved the exact 73 read-only column grants. All eight tabs now contain 109 visual placements from 105 questions: 102 model-based questions and three questions using one shared scenario snippet. Ten reusable models contain 172 documented fields. No schema, data, AppSheet or deployment changes occurred in this continuation.

P01/P28/P39/P41/P45/P46 are completed for this review checkpoint: scoped approval and grant/rollback evidence are saved; 37 new reconciliation/grain/filter/scenario/preservation checks and all 31 earlier parity cases pass; desktop/390px browser checks, model dictionary and the three core records are updated. Metabase's tab/card endpoint issue and an order-sensitive verification assertion were corrected before closure. See `remaining-verification.json`, `remaining-dashboard-verification.json`, `remaining-grants-applied.json` and `remaining-browser-verification.json`.

P48/P50 remain open for final R016 acceptance, agreed development-key revocation and the final unique tag. Pages 3–8 are implemented for owner review. Borrower/date balance history remains unavailable in the source and is visibly identified; creating it would need a separate authorized design. Lisa's own sign-in is unconfirmed. The existing application recovery dump plus exact private `remaining-pages-before` and completed metadata exports provide rollback. No RC exists and P49 remains N/A.

## Income Statement review checkpoint

### Subsequent V35 historical-cash/presentation refinement — 23 September

Owner requested the dated cash extension and seven presentation changes. P01/P13/P22/P28/P39/P41/P45/P46 are complete for the additive two-view scope: private before/after card/snippet/dashboard/dictionary metadata, fresh matching PROD schema and verified-restored dump/hash, V35 disposable CI, DEV validation and seven dated/current/grain checks, exact committed manifest at `e7fd3af40b572ab644856e7cc95d6a243f49a870`, PROD migration/validation and corresponding checks, SELECT-only view grants, full report-period reconciliation and desktop/390px review. Shared PROD source remains unchanged; no financial records or DEV data copied. AppSheet upgrades/RCs/logos/notifications are N/A because no app or existing source definition changed. Current counts are 18 models/256 fields, 120 questions/124 placements; page 9 has fifteen visuals. Three replaced questions were recoverably archived. Documentation/dictionary/manifest reflect period-end cash, calendar-day average and opening-date limits. Whole-R016 owner acceptance/key revocation/tag remain open.

### Subsequent V34 database-ownership refinement

Owner requested heavy report calculations in database views. P01/P13/P22/P28/P39/P41/P45/P46 are completed for the six-view SQL/source-switch scope: scoped owner instruction, exact private model/SQL recovery, fresh unchanged pre-promotion PROD schema, verified-restored backup hash, disposable CI, DEV V34 validation/parity, committed tested manifest at `63836d4`, PROD V34 migration/validation, six-view parity, SELECT-only grants and 101 post-switch report checks. All nine dashboard layouts/filters and model field metadata are preserved. Both AppSheet definitions are unchanged, and no existing app source is altered; app upgrade, RC creation/deletion, notification tests and new logo checks are N/A for this additive report-only scope. No financial data or DEV-to-PROD copy occurred. Dictionary, tracker, inventory, development differences, design/model notes, database runbook, manifest and this checklist record the new ownership. Earlier UI checks are reused because layout/metadata/output semantics are identical; no claim of a new physical-phone test. Final whole-R016 acceptance/key revocation/tag remain open.

Owner added page 9 and its Statement period slicer, then selected object-level SELECT for the twelve existing Metabase sources. The initial 21-column grant batch and later source-level grant batch are recorded; the proposed nine-column follow-up was superseded. No schema, financial data, app, infrastructure or sign-in changes. Six new models and one shared parameterized period snippet support seventeen visuals; all 126 placements and 122 questions are retained across nine tabs. See `income-verification.json`, `income-dashboard.json`, `income-browser-verification.json` and `reporting-sources-grants-applied.json`.

P01/P13/P22/P28/P39/P41/P45/P46 are complete for this review checkpoint, with private before/completed metadata and fresh ACL recovery. Previous page definitions/layouts and partner permissions are preserved. Date presets/ranges and cleared filters reconcile; non-contiguous exclusions produce guidance instead of a misleading allocated statement. Current cash remains explicitly unfiltered. P48/P50 remain open for owner acceptance, final key revocation and unique release tag. Native custom date-range UI is wide on portrait phones; presets work, and landscape/desktop exposes both date fields. This product limitation is documented on the page.

### 23 September presentation-only follow-up
Cash waterfall 189 archived; separate + and = symbols added; income chart title maps native Total to Unsettled Profit (axis rename unsupported). Private metadata rollback and eleven focused checks recorded in `income-symbols-verification.json`. Current counts supersede the preceding dated checkpoint: 14 Income Statement visuals, 123 placements/119 questions. No SQL/model/permission/AppSheet deployment; prior calculations unchanged. Full release acceptance remains open.

### Cashflow extension candidate — 23 September
V36 additive views tested and applied to DEV, with 13 reconciliations and 42 prepared visual query cases. PROD approval, exact candidate manifest promotion, SELECT grants, model/page installation, browser/filter checks and dictionary/documentation closure remain pending. Scoped metadata and schema backups captured in `cashflow-before`; previous nine pages unchanged. No AppSheet promotion/RC is involved.


### Cashflow extension closure — 23 September

P01/P13/P22/P28/P39/P41/P45/P46 are complete for approved V36/page 10: exact commit `d9da07a89a39a732bb1d5fcf7994f04dafe56379`, verified recovery/hash and unchanged pre-promotion schema, DEV/PROD validation and 13 reconciliations, SELECT-only grants, 72 live dashboard checks, date/account GUI and desktop/390px QA, dictionary/current-document closure. Existing nine pages and permissions preserved. AppSheet/RC/logo/notification steps are N/A; no source definition or financial record changed. P48 publication is completed by the following coherent evidence commit and normal upstream push; final whole-R016 tag/acceptance remains pending. Candidate paragraph above is superseded. Current inventory: 10 tabs, 130 visual placements, 126 distinct questions, 20 models/287 fields, three snippets; source access covers 22 named objects.

### Cashflow table presentation refinement — 23 September

Question 196 only: nine displayed columns, compact statement date/OLTP posting time and green/red positive money movement cells. Scoped private metadata backup and 93 live dashboard checks, including previous page/permission preservation. No new SQL/AppSheet promotion or RC. Source and model dictionary are unchanged; change log, current inventory, manifest and maintained installer record the presentation. Full R016 acceptance, key retirement and tag remain pending.

### Number-card hover cleanup — 23 September

Sixty-three active scalar questions had decorative ranges that generated giant hover legends. Private exact card/dashboard metadata backed up; saved queries, dashboard placements/parameters and access compared before/after. Removed the ranges and visually checked the borrower page. Number cards use Metabase default color; chart data tooltips and Cashflow table conditional colors remain. No SQL, model, AppSheet or RC action. Maintained builders and generated question inventories updated. Full R016 acceptance, key retirement and tag remain pending.

### Shared saved questions — 23 September 2026

Owner authorized reviewing and removing duplicate questions. Reviewed 155 active cards and both dashboards; consolidated ten redundant questions into existing canonical IDs, preserving 130 placements, layout, titles, per-placement formatting and filters. Current inventory is 116 distinct dashboard questions and twenty models/287 fields. Exact query comparisons, reviewed one-row/status-count equivalences, twelve real placement/filter cases and saved-state readback passed. Obsolete definitions are recoverably archived after dependency removal. Private metadata rollback: `question-reuse-before`; sanitized mapping/results: `question-reuse-verification.json`. Updated current inventory/tracker/development/model-design records and builders; dictionary fields remain correct because no model definition changed. No Flyway, source data, AppSheet, RC, access or notification change. Full R016 acceptance, key retirement and final tag remain pending.

### Overview trend and label refinement — 23 September 2026

Private rollback under `overview-trend-before` covers dashboard 3 and twelve renamed saved questions. A scoped dashboard parameter defaults the three Overview Portfolio trends to the last 30 completed Bangkok dates; live queries each returned 24 August–22 September 2026. Cash Analysis still uses its own date mapping on the shared principal question. Removed redundant THB from visible headings, titles, notes and the proposed-loan filter without changing currency formatting or monetary data fields. Saved-state verification preserved ten tabs, 130 placements and coordinates; no visible THB label remains. Evidence: `overview-trend-refinement.json`. No database, AppSheet, model, RC or access change; dictionary fields remain valid. Whole-R016 acceptance, key retirement and final tag remain pending.

### Principal chart current cash-pool comparison — 23 September 2026

Private rollback under `cash-pool-line-before` covers model 74, shared question 62, dashboard 3 and the dictionary. Model 74 repeats the current governed Total Cash Pool on each daily row; question 62 plots it as a line over outstanding principal on one THB axis, replacing the fixed 120,000 goal. The line is explicitly labeled current, not historical. Source/model/query readback confirmed 50 dates, unchanged principal values and exact current-pool parity. Overview and Cash date mappings and dashboard layout remain. Browser review confirmed both series and one axis. The dictionary has 20 models/288 fields; the new entry renders, and all thirteen operational sheets are unchanged. Evidence: `principal-cash-pool-verification.json` and `principal-cash-pool-dictionary-verification.json`. No PostgreSQL, AppSheet, RC, grant or financial-data change. Whole-R016 acceptance, key retirement and final tag remain pending.
