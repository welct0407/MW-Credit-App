# R014 promotion checklist

Template revision: 2026-09-21. **Single master:** `scripts/releases/templates/promotion-checklist.md`. Create one release copy under outputs; fill that copy throughout development/promotion. Do not maintain an Excel checklist or separate document checklist. Implementation detail: [Release Workflow](../../Documents/Release_Workflow.md); exceptions: [Recovery](../../Documents/Release_Recovery_Runbook.md).

## Continue here

- Scope / dependencies / app Upgrade or Unchanged decisions: Complete R014 including AI Reviewer; upgrade both apps, migrate V31–V32, deploy Integration Agent 83e1b56. Forecast proposal excluded; depends on released R013.
- Manifest / change log / test evidence: release-manifest.json, REPORT.md, reviewer-report.md and refinements.json; release log under Change Logs.
- DEV readiness / owner acceptance: Owner requested promotion of complete batch on 21 September. Live DEV 1.000075 / 1.000031 match tested records, saved with No issues found.
- Production authorization / approved RC revision: Owner: “I made another change in another codex session, also included in R014. now move R014 to production.” Covers integrated RC1 and normal deployment; no synthetic financial writes or forced notifications.
- DEV / RC / PROD-before / PROD-after / rollback / SQL versions: completed in release-manifest.json and production-report.md.
- Implementation commit / Flyway manifest / final tag: 75f847d / flyway-release.json / R014.
- Completed / next / blockers: Deployment, validation and documentation complete. Publication verified at final commit/tag; no live blocker.
- Documentation impact: core records, dictionary, model overview, database checkpoint and agent reviewer documents. Looker/export sources, unrelated jobs, runbooks and architecture are unchanged.

## Execution rules

Execute applicable rows in order; one result/evidence link per coherent check. Status: Pending, In progress, Done, Reused, N/A or Blocked. Reused requires still-valid evidence; N/A requires a brief reason. Skip untriggered setup/SQL/external/recovery work. Reuse existing decisions/authority, identities and passing tests; recheck pre-upgrade baseline/version and changed dependencies. No repeated DEV suite, whole-app diff, repeat deployment check for deployed apps, untouched-route audit or duplicate report. Consult only the runbook section needed to perform a triggered row. Stop affected dependent work on failure; no invented gates or silent scope expansion.

## Activities

| ID | Stage | When required | Activity / completion criterion | Status | Evidence / reason |
| --- | --- | --- | --- | --- | --- |
| P01 | A Readiness | Always | Confirm Rnnn scope, integrated DEV features/PROD fixes, dependencies and app Upgrade/Unchanged decisions. Reuse the existing manifest/log and DEV/model checkpoint; resolve unrelated unreleased work. Record readiness/owner acceptance. | Done | Complete integrated scope; owner promotion request; manifest revision 4. |
| P10 | A Readiness | Always; reuse passing evidence | Accept recorded integrated DEV tests and both apps’ final zero-warning/error diagnostics. Rerun only checks invalidated by changed behavior, dependencies or data. No new full regression or live audit merely to start promotion. | Reused | DEV reports and live saved 1.000075 / 1.000031 zero-issue checks. |
| P06 | A Readiness | First use / guard changed | Install/test scheduled guards in DEV before copy, including child calls and per-row filters. Prove canonical DEV allowed and harmless copy excluded in scheduled context. Reuse this proof in later releases. | Reused | Canonical runtime allow/exclude proof: dev-app-refresh-20260919/verification.json. |
| P08 | A Readiness | DEV setup / routing changed | Use DEV preparation only for missing/changed setup: DEV sources/links, owner-only Partner delivery data, distinct Login Email and initial deployment if needed. Keep audit fields and channels. Unmapped actors must be resolved for affected tests. | Reused | No DEV copy/refresh/routing changes in this promotion. |
| P04 | A Readiness | SQL changes | Reuse completed Flyway-chain/DEV tests and old/new-app compatibility evidence, including relevant queued clients/locks. Pin the clean tested commit with New-Release.ps1 before DEV advances; include every pending migration/prerequisite. | Reused | Pinned 75f847d; full chain/V31/V32 tests and compatible additive SQL. |
| P13 | B Capture | Always; app details if upgrading | Record PROD identities/baseline, restorable app versions and cutover/recovery order once. Confirm scoped authority before PROD effects; reuse existing approval and App Upgrade eligibility. Recheck eligibility only after access/plan changes. | Done | Live rollback 3.000242 / 1.100191; scoped owner authorization recorded. |
| P14 | B Capture | App Upgrade; SQL-only pins above | Briefly freeze DEV and pin tested versions/commit. Create named Rnnn-RCk apps by definition-only copy: the copy-data checkbox is checked by default—actively UNCHECK it for every copy/retry. Also uncheck file-data-copy options and verify all are unchecked before clicking Copy. Never copy data, even temporarily; unresolved options mean do not submit. Record this confirmation with IDs/internal names and contain execution. Rebind existing sources in P25; reject accidental data copies. Resume DEV once independent copies/pins are verified. | Done | Both copy-data and file-copy boxes actively unchecked and verified; RC IDs in manifest. |
| P22 | C SQL | SQL changes / DB writes | Verify restorable DB backup, schema drift and history; then validate/migrate/validate with the pinned manifest and existing runner. Record target/schema checks and before/after SQL versions. Complete compatible SQL before final RC PROD validation. | Done | Restored backup, unchanged normalized V30 schema; pinned migration V30→V32; 33 valid history entries. |
| P25 | D RC | App Upgrade | Rebind/reconcile every RC table/view and auxiliary source to PROD host/database/object. Save exact mappings once. No DEV source remains. Keep RC contained before PROD binding. | Done | production-source-mapping.json: all 37 saved readbacks database-2/public/PROD. |
| P18 | D RC | App Upgrade | Apply the corresponding PROD theme/branding and PROD companion links. Keep shared recipients on PROD contact data; confirm Login Email prerequisites. Restore only documented legacy DEV overrides. Verify these substitutions once. | Done | Production names, colours, logos, folders, companion links, shared recipients and API Enable retained. |
| P28 | D RC | External asset / access changes | Provision/check only affected templates, files, grants, endpoints and integrations outside App Upgrade. Link existing evidence for unchanged assets. | Done | Existing assets retained; both protected-key API probes authenticated. |
| P29 | D RC | App Upgrade | Check copied guard coverage and this RC’s exact name exclusion; retain canonical DEV/PROD literals and intended bot states/schedules. Reuse runtime proof; no repeated diagnostic app or wait for every daily job. | Done | Both copied first-branch/per-row guards inspected; RC excluded, canonical schedules retained. |
| P30 | D RC | App Upgrade | One RC validation pass: save/reload, editor data validation, zero issues, open/sync and representative changed screens. Resolve unexpected generated changes only. Complete initial Deployment Check and deploy new RC; reuse DEV business tests. | Done | Initial checks passed applicable gates; Deployed and zero editor issues; saved mappings and loaded previews. |
| P33 | E Upgrade | App Upgrade | Freeze final deployed RC identity/version and mapping evidence. Confirm authorization covers that revision. Immediately before each upgrade, confirm unchanged PROD baseline and frozen RC version; drift/fixes require a new integrated RC. | Done | Frozen RC 1.000007 / 1.000006; refreshed PROD baseline unchanged before upgrades. |
| P37 | E Upgrade | Each included app | App Upgrade the existing PROD ID from the frozen RC’s full internal name in planned order. Record source, target and before/after versions. Confirm success before dependent steps; never hand-recreate settings in PROD. | Done | App Upgrade: OLTP 3.000245; OLAP 1.100194, original IDs. |
| P39 | F Validate | Always; mappings if upgraded | One PROD pass: verify version/Deployed state, sources/substitutions, PROD-allowed/RC-excluded guards, both editors clear and both apps open/sync with changed entry points. Check recipients only if changed. Reuse DEV tests; no repeat Deployment Check. | Done | Both deployed/saved/clean; load/sync, changed entry points, affected sources and guard readbacks passed. |
| P41 | F Validate | Uncovered SQL / critical / external effects | Run only targeted checks not already covered by SQL/RC/PROD evidence. At first guard introduction observe the next normal PROD run; later releases reuse proof. Record execution/delivery limits; no forced writes/notifications without scoped authority. | Done | Live SQL arithmetic/reviewer selection, installed master and API probes passed; real reply not forced. |
| P38 | F Validate | Paused jobs / cutover steps | Complete approved external cutover steps and resume temporary pauses. Keep integrity triggers and one active scheduler per job/environment. | Done | Reviewed runtime installed; 102 VM tests, config check, four timers resumed. |
| P45 | G Close | Always | Complete the documentation table below: update/verify the three core records and add only affected documents. No archive/history dispositions or routine folder scan. | Done | Documentation table below; agent references updated separately. |
| P46 | G Close | Always | Reconcile manifest/log, versions, approvals/tests and recovery links. Close only promoted differences. Update exact dictionary rows when changed; revise overview only if explained behavior/architecture changes. Check relevant links/model values and intended Git diff once. | Done | Manifest/report/log and 36 dictionary rows reconciled; unrelated values/formulas preserved. |
| P49 | G Close | RC exists | Record RC retention/recovery window and keep execution contained without changing frozen definitions. No automatic RC deletion or DEV refresh. | Done | Owner retired both RC1 apps on 21 September 2026; exact editor URLs returned 404. See rc-retirement.md. |
| P48 | G Close | Always | Commit/push final sanitized evidence/docs; create/push unique annotated Rnnn tag at that evidence commit. Verify remote branch/tag. Do not move tags or redeploy to fix publication. | Done | Final evidence commit and unique annotated R014 tag; remote refs verified at publication. |
| P50 | G Close | Always | Report Released only after required validation, documentation and publication pass. Give versions, evidence/tag, rollback and limitations. Otherwise state the incomplete phase; repair documents without repeating live tests. | Done | Released; versions/recovery/limitations in production-report.md and final task result. |
| P51 | X Exception | Failure / drift / required gap only | Stop affected dependent steps, record actual partial state and follow only the matching recovery branch. Preserve later writes/work; no blind replay or manual PROD fallback. Ask only for missing authority/material decisions. Reconcile resulting status and documents. | N/A | No unresolved promotion failure; SSH path and checkout EOL mismatch resolved before affected actions. |

## Documentation impact and closure

The three rows below always require Updated or Verified current. Add only affected documents, with Updated / Verified current / Pending / Blocked and a section/row reference. Scope-based non-applicability belongs in the single impact note above, not a row for every untouched file. No Pending/Blocked required row at closure.

Triggers: exact model/formula changes → dictionary; changed behavior/relationships/ownership → overview/design; changed depicted flows → relevant drawio; changed operating method → affected runbook/AGENTS; changed paths/purposes → README/links; dormant pilot → only if its contract/dependencies or activation is in scope. Preserve historical evidence; archives are excluded.

| Document | Disposition | Updated section / evidence |
| --- | --- | --- |
| [Release Tracker](../../Documents/Release_Tracker.md) | Updated | R014 production checkpoint; production-report.md. |
| [Environment Inventory](../../Documents/Environment_Inventory.md) | Updated | R014 production checkpoint; production-report.md. |
| [Development Changes](../../Documents/Development_Changes.md) | Updated | R014 production checkpoint; production-report.md. |
| [AppSheet_Data_Dictionary.xlsx](../../Documents/AppSheet_Data_Dictionary.xlsx) | Updated | R014 production checkpoint; production-report.md. |
| [AppSheet_Data_Model_Overview.md](../../Documents/AppSheet_Data_Model_Overview.md) | Updated | R014 production checkpoint; production-report.md. |
| [Database checkpoint](../../database/README.md) | Updated | PROD and DEV V32; additive SQL and next migration V33. |
| MW-Integration-Agent reviewer references | Updated | SERVICE_CATALOGUE.md, PARTNER_REVIEW.md, R014 log and business-process page 17; coordinated deployment and limitations. |

## Close

- Outcome / limitations / rollback: Released; production-report.md records physical-device/real-reply limits and app/database/runtime recovery.
- Final evidence commit / Rnnn tag / remote verification: resolve annotated R014 tag; configured upstream and tag verified during final publication.
- RC retention / retirement decision: both RC1 definitions deleted by owner direction on 21 September 2026; recovery uses PROD saved versions and retained backups (rc-retirement.md).

Released requires applicable activities, documentation and publication complete. If only documents/publication remain, repair them without redeploying. Record final outcome in the manifest/tracker before the final evidence commit and verify publication afterward; do not create self-referential commit hashes.
