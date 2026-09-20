# R010 promotion checklist

Template revision: 2026-09-20. Filled release copy of the [single master](../../scripts/releases/templates/promotion-checklist.md). Continue this file; do not regenerate over results or maintain an Excel/separate document checklist. Implementation detail: [Release Workflow](../../Documents/Release_Workflow.md); exceptions: [Recovery](../../Documents/Release_Recovery_Runbook.md).

## Continue here

- Scope / dependencies / app Upgrade or Unchanged decisions: OLTP payment-form guards, bilingual feedback and correction reasons; requires R009. Upgrade OLTP; OLAP and SQL unchanged. See manifest for exact scope.
- Manifest / change log / test evidence: [manifest](release-manifest.json), [log](../../Change%20Logs/CHANGE_NOTES_R010_2026-09-19.md), [DEV tests](TESTS.md), [saved readback](dev-saved-readback.json).
- DEV readiness / owner acceptance: Ready for review; owner acceptance pending.
- Production authorization / approved RC revision: Not recorded; RC not created. Documentation adoption authorizes no live promotion.
- DEV / RC / PROD-before / PROD-after / rollback / SQL versions: recorded in manifest; DEV OLTP 1.000036 and unchanged OLAP 1.000015, PROD baseline R009. RC/post-upgrade pins pending.
- Implementation commit / Flyway manifest / final tag: manifest pins eba6f4571fe86cbf3aa584c323e547933a8636fc; SQL unchanged, no new runner manifest; final R010 tag pending.
- Completed / next / blockers: DEV implementation and focused tests complete. Next: owner review/acceptance and scoped promotion authorization, then candidate capture. Reuse unchanged evidence below; verify version pins at capture/cutover.
- Documentation impact: Three core records plus model overview (R010 behavioral overlay) and dictionary (exact guards/messages). No design/ownership, depicted flow, operating procedure, paths or dormant-pilot contract change; other documents are unaffected.

## Execution rules

Execute applicable rows in order; one result/evidence link per coherent check. Status: Pending, In progress, Done, Reused, N/A or Blocked. Reused requires still-valid evidence; N/A requires a brief reason. Skip untriggered setup/SQL/external/recovery work. Reuse existing decisions/authority, identities and passing tests; recheck pre-upgrade baseline/version and changed dependencies. No repeated DEV suite, whole-app diff, repeat deployment check for deployed apps, untouched-route audit or duplicate report. Consult only the runbook section needed to perform a triggered row. Stop affected dependent work on failure; no invented gates or silent scope expansion.

## Activities

| ID | Stage | When required | Activity / completion criterion | Status | Evidence / reason |
| --- | --- | --- | --- | --- | --- |
| P01 | A Readiness | Always | Confirm Rnnn scope, integrated DEV features/PROD fixes, dependencies and app Upgrade/Unchanged decisions. Reuse the existing manifest/log and DEV/model checkpoint; resolve unrelated unreleased work. Record readiness/owner acceptance. | In progress | Scope and DEV checkpoint recorded in manifest; owner acceptance remains pending. |
| P10 | A Readiness | Always; reuse passing evidence | Accept recorded integrated DEV tests and both apps’ final zero-warning/error diagnostics. Rerun only checks invalidated by changed behavior, dependencies or data. No new full regression or live audit merely to start promotion. | Reused | [R010 tests](TESTS.md) cover final OLTP 1.000036; [R009 DEV integration](../r009-20260919/production/REPORT.md) covers unchanged OLAP 1.000015. No new live check here; invalidate only affected evidence if capture pins/dependencies change. |
| P06 | A Readiness | First use / guard changed | Install/test scheduled guards in DEV before copy, including child calls and per-row filters. Prove canonical DEV allowed and harmless copy excluded in scheduled context. Reuse this proof in later releases. | Reused | [Scheduled guard runtime evidence](../r009-20260919/production/REPORT.md) links allowed/excluded server proof. R010 does not change guard names, entry points or placement. Check the new RC identity in P29. |
| P08 | A Readiness | DEV setup / routing changed | Use DEV preparation only for missing/changed setup: DEV sources/links, owner-only Partner delivery data, distinct Login Email and initial deployment if needed. Keep audit fields and channels. Unmapped actors must be resolved for affected tests. | N/A | R010 changes form guards/messages only; no setup, identity or routing change. |
| P04 | A Readiness | SQL changes | Reuse completed Flyway-chain/DEV tests and old/new-app compatibility evidence, including relevant queued clients/locks. Pin the clean tested commit with New-Release.ps1 before DEV advances; include every pending migration/prerequisite. | N/A | SQL unchanged at V26 in both environments. |
| P13 | B Capture | Always; app details if upgrading | Record PROD identities/baseline, restorable app versions and cutover/recovery order once. Confirm scoped authority before PROD effects; reuse existing approval and App Upgrade eligibility. Recheck eligibility only after access/plan changes. | Pending | |
| P14 | B Capture | App Upgrade; SQL-only pins above | Briefly freeze DEV, pin tested versions/commit and copy included definitions to named Rnnn-RCk apps. Record IDs/internal names and restrict execution from creation. Resume DEV once independent copies/pins are verified. Never copy DEV financial data to PROD. | Pending | |
| P22 | C SQL | SQL changes / DB writes | Verify restorable DB backup, schema drift and history; then validate/migrate/validate with the pinned manifest and existing runner. Record target/schema checks and before/after SQL versions. Complete compatible SQL before final RC PROD validation. | N/A | No SQL migration or database write in the approved R010 DEV scope. |
| P25 | D RC | App Upgrade | Rebind/reconcile every RC table/view and auxiliary source to PROD host/database/object. Save exact mappings once. No DEV source remains. Keep RC contained before PROD binding. | Pending | |
| P18 | D RC | App Upgrade | Apply the corresponding PROD theme/branding and PROD companion links. Keep shared recipients on PROD contact data; confirm Login Email prerequisites. Restore only documented legacy DEV overrides. Verify these substitutions once. | Pending | |
| P28 | D RC | External asset / access changes | Provision/check only affected templates, files, grants, endpoints and integrations outside App Upgrade. Link existing evidence for unchanged assets. | N/A | No external assets, permissions or integrations changed by R010. Reopen only if candidate preparation reveals a concrete dependency. |
| P29 | D RC | App Upgrade | Check copied guard coverage and this RC’s exact name exclusion; retain canonical DEV/PROD literals and intended bot states/schedules. Reuse runtime proof; no repeated diagnostic app or wait for every daily job. | Pending | |
| P30 | D RC | App Upgrade | One RC validation pass: save/reload, editor data validation, zero issues, open/sync and representative changed screens. Resolve unexpected generated changes only. Complete initial Deployment Check and deploy new RC; reuse DEV business tests. | Pending | |
| P33 | E Upgrade | App Upgrade | Freeze final deployed RC identity/version and mapping evidence. Confirm authorization covers that revision. Immediately before each upgrade, confirm unchanged PROD baseline and frozen RC version; drift/fixes require a new integrated RC. | Pending | |
| P37 | E Upgrade | Each included app | App Upgrade the existing PROD ID from the frozen RC’s full internal name in planned order. Record source, target and before/after versions. Confirm success before dependent steps; never hand-recreate settings in PROD. | Pending | |
| P39 | F Validate | Always; mappings if upgraded | One PROD pass: verify version/Deployed state, sources/substitutions, PROD-allowed/RC-excluded guards, both editors clear and both apps open/sync with changed entry points. Check recipients only if changed. Reuse DEV tests; no repeat Deployment Check. | Pending | |
| P41 | F Validate | Uncovered SQL / critical / external effects | Run only targeted checks not already covered by SQL/RC/PROD evidence. At first guard introduction observe the next normal PROD run; later releases reuse proof. Record execution/delivery limits; no forced writes/notifications without scoped authority. | N/A | No new SQL, guard introduction or uncovered external effect in recorded scope. Existing focused DEV tests cover form guards; expand only on mismatch. |
| P38 | F Validate | Paused jobs / cutover steps | Complete approved external cutover steps and resume temporary pauses. Keep integrity triggers and one active scheduler per job/environment. | N/A | No paused job or external cutover step currently planned; reopen if preparation introduces one. |
| P45 | G Close | Always | Complete the documentation table below: update/verify the three core records and add only affected documents. No archive/history dispositions or routine folder scan. | Pending | |
| P46 | G Close | Always | Reconcile manifest/log, versions, approvals/tests and recovery links. Close only promoted differences. Update exact dictionary rows when changed; revise overview only if explained behavior/architecture changes. Check relevant links/model values and intended Git diff once. | Pending | |
| P49 | G Close | RC exists | Record RC retention/recovery window and keep execution contained without changing frozen definitions. No automatic RC deletion or DEV refresh. | Pending | |
| P48 | G Close | Always | Commit/push final sanitized evidence/docs; create/push unique annotated Rnnn tag at that evidence commit. Verify remote branch/tag. Do not move tags or redeploy to fix publication. | Pending | |
| P50 | G Close | Always | Report Released only after required validation, documentation and publication pass. Give versions, evidence/tag, rollback and limitations. Otherwise state the incomplete phase; repair documents without repeating live tests. | Pending | |
| P51 | X Exception | Failure / drift / required gap only | Stop affected dependent steps, record actual partial state and follow only the matching recovery branch. Preserve later writes/work; no blind replay or manual PROD fallback. Ask only for missing authority/material decisions. Reconcile resulting status and documents. | N/A | No active promotion failure or drift; use only if triggered. |

## Documentation impact and closure

The three rows below always require Updated or Verified current. Add only affected documents, with Updated / Verified current / Pending / Blocked and a section/row reference. Scope-based non-applicability belongs in the single impact note above, not a row for every untouched file. No Pending/Blocked required row at closure.

Triggers: exact model/formula changes → dictionary; changed behavior/relationships/ownership → overview/design; changed depicted flows → relevant drawio; changed operating method → affected runbook/AGENTS; changed paths/purposes → README/links; dormant pilot → only if its contract/dependencies or activation is in scope. Preserve historical evidence; archives are excluded.

| Document | Disposition | Updated section / evidence |
| --- | --- | --- |
| [Release Tracker](../../Documents/Release_Tracker.md) | Pending | |
| [Environment Inventory](../../Documents/Environment_Inventory.md) | Pending | |
| [Development Changes](../../Documents/Development_Changes.md) | Pending | |
| [AppSheet_Data_Model_Overview.md](../../Documents/AppSheet_Data_Model_Overview.md) | Pending | |
| [AppSheet_Data_Dictionary.xlsx](../../Documents/AppSheet_Data_Dictionary.xlsx) | Pending | |

## Close

- Outcome / limitations / rollback: DEV Ready for review; no R010 production deployment. Existing test limitations and rollback remain in the linked log; promotion closure pending.
- Final evidence commit / Rnnn tag / remote verification: Pending
- RC retention / retirement decision: Pending or justified N/A

Released requires applicable activities, documentation and publication complete. If only documents/publication remain, repair them without redeploying. Record final outcome in the manifest/tracker before the final evidence commit and verify publication afterward; do not create self-referential commit hashes.
