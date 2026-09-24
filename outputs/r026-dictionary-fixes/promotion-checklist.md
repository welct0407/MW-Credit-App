# R026 promotion checklist

Template revision: 2026-09-24. **Single master:** `scripts/releases/templates/promotion-checklist.md`. Create one release copy under outputs; fill that copy throughout development/promotion. Do not maintain an Excel checklist or separate document checklist. Implementation detail: [Release Workflow](../../../Documents/Release_Workflow.md); exceptions: [Recovery](../../../Documents/Release_Recovery_Runbook.md).

## Continue here

- Scope / dependencies / app Upgrade or Unchanged decisions: Pending
- Release scope / freeze timestamp / successor handoff: Open until authorized promotion starts; then record P13 evidence and update the tracker's current development release.
- Manifest / change log / test evidence: Pending
- DEV readiness / owner acceptance: Pending
- Production authorization / approved RC revision: Pending
- DEV / RC / PROD-before / PROD-after / rollback / SQL versions: in linked manifest; Pending
- Implementation commit / Flyway manifest / final tag: in linked manifest; Pending
- Completed / next / blockers: Pending
- Documentation impact: Pending â€” list affected paths or None with a scope-based reason; add their closure rows below.

## Execution rules

Execute applicable rows in order; one result/evidence link per coherent check. Status: Pending, In progress, Done, Reused, N/A or Blocked. Reused requires still-valid evidence; N/A requires a brief reason. Skip untriggered setup/SQL/external/recovery work. Reuse existing decisions/authority, identities and passing tests; recheck pre-upgrade baseline/version and changed dependencies. No repeated DEV suite, whole-app diff, repeat deployment check for deployed apps, untouched-route audit or duplicate report. Consult only the runbook section needed to perform a triggered row. Stop affected dependent work on failure; no invented gates or silent scope expansion.

## Activities

| ID | Stage | When required | Activity / completion criterion | Status | Evidence / reason |
| --- | --- | --- | --- | --- | --- |
| P01 | A Readiness | Always | Use the tracker's single current Open release for development; do not reserve a successor during development/review. Confirm scope, integrated DEV features/PROD fixes, dependencies and app Upgrade/Unchanged decisions. Reuse existing evidence; resolve unrelated unreleased work. Record readiness/owner acceptance; readiness does not freeze scope. | Done | Owner request fixes matters 2/3 and removes unused pg_cron. Both apps Upgrade for explicit en-US. Unapplied V41/payment-health scope transferred to R027; paused, no live edits. |
| P10 | A Readiness | Always; reuse passing evidence | Accept recorded integrated DEV tests and both appsâ€™ final zero-warning/error diagnostics. Rerun only checks invalidated by changed behavior, dependencies or data. No new full regression or live audit merely to start promotion. | Reused | DEV current saved versions OLTP 1.000075 / OLAP 1.000031, zero editor issues and Save disabled. Existing en-US settings/workflows unchanged; prior R014 behavior evidence reused. |
| P06 | A Readiness | First use / guard changed | Install/test scheduled guards in DEV before copy, including child calls and per-row filters. Prove canonical DEV allowed and harmless copy excluded in scheduled context. Reuse this proof in later releases. | Reused | outputs/dev-app-refresh-20260919/verification.json scheduled allowed/excluded proof; same canonical names and guarded job paths. |
| P08 | A Readiness | DEV setup / routing changed | Use DEV preparation only for missing/changed setup: DEV sources/links, owner-only Partner delivery data, distinct Login Email and initial deployment if needed. Keep audit fields and channels. Unmapped actors must be resolved for affected tests. | N/A | No DEV routing/setup changes. Existing verified bindings reused until RC rebind. |
| P04 | A Readiness | SQL changes | Reuse completed Flyway-chain/DEV tests and old/new-app compatibility evidence, including relevant queued clients/locks. Pin the clean tested commit with New-Release.ps1 before DEV advances; include every pending migration/prerequisite. | Done | V40-only clean pin 8a76733761bb666dd96a08aa45282c1cde2c01a6, DEV migrated V39 → V40 and validated; private New-Release manifest generated. Full CI plus 11 guard tests passed. |
| P13 | B Capture | Always, including SQL/report-only | At authorized promotion start, pin scope/package and record scope-freeze timestamp/evidence. In one published tracker handoff mark this release Frozen, open the next unused number as the sole development release and advance the counter. Hold shared DEV edits until capture completes. Record PROD baseline/recovery order and reuse scoped authority/eligibility; recheck eligibility only after access/plan changes. | Done | 2026-09-24T14:03:59.883143+00:00 scope freeze; tracker opens R027 and next R028. Shared DEV paused until independent copies captured. PROD backup 1790257810992 SUCCESSFUL; PROD app rollback 3.000246 / 1.100195. |
| P14 | B Capture | App Upgrade; SQL-only pins above | Briefly freeze DEV and pin tested versions/commit. Create named Rnnn-RCk apps by definition-only copy: the copy-data checkbox is checked by defaultâ€”actively UNCHECK it for every copy/retry. Also uncheck file-data-copy options and verify all are unchecked before clicking Copy. Never copy data, even temporarily; unresolved options mean do not submit. Record this confirmation with IDs/internal names and contain execution. Rebind existing sources in P25; reject accidental data copies. Resume DEV once independent copies/pins are verified. | Pending | |
| P22 | C SQL | SQL changes / DB writes | Verify restorable DB backup, schema drift and history; then validate/migrate/validate with the pinned manifest and existing runner. Record target/schema checks and before/after SQL versions. Complete compatible SQL before final RC PROD validation. | Pending | |
| P25 | D RC | App Upgrade | Rebind/reconcile every RC table/view and auxiliary source to PROD host/database/object. Save exact mappings once. No DEV source remains. Keep RC contained before PROD binding. | Pending | |
| P18 | D RC | App Upgrade | Capture the existing PROD logo setting/appearance; apply the corresponding PROD theme/branding/logo and companion links. If needed restore the correct logo from resources/ in durable PROD/shared storage, independent of RC lifetime. Keep shared recipients on PROD contact data; confirm Login Email prerequisites. Restore only documented legacy DEV overrides. Verify these substitutions once. | Pending | |
| P28 | D RC | External asset / access changes | Provision/check only affected templates, files, grants, endpoints and integrations outside App Upgrade. Link existing evidence for unchanged assets. | Done | Shared template identity uploaded in-place; downloaded SHA256 equals candidate. Export remains disabled. See template/verification.json. Asset correction preceded formal freeze; recorded as sequencing deviation, no financial execution. |
| P29 | D RC | App Upgrade | Check copied guard coverage and this RCâ€™s exact name exclusion; retain canonical DEV/PROD literals and intended bot states/schedules. Reuse runtime proof; no repeated diagnostic app or wait for every daily job. | Pending | |
| P30 | D RC | App Upgrade | One RC validation pass: save/reload, editor data validation, zero issues, open/sync and representative changed screens. Resolve unexpected generated changes only. Complete initial Deployment Check and deploy new RC; reuse DEV business tests. | Pending | |
| P33 | E Upgrade | App Upgrade | Freeze final deployed RC identity/version and mapping evidence. Confirm authorization covers that revision. Immediately before each upgrade, confirm unchanged PROD baseline and frozen RC version; drift/fixes require a new integrated RC. | Pending | |
| P37 | E Upgrade | Each included app | App Upgrade the existing PROD ID from the frozen RCâ€™s full internal name in planned order. Record source, target and before/after versions. Confirm success before dependent steps; never hand-recreate settings in PROD. | Pending | |
| P39 | F Validate | Always; mappings if upgraded | One PROD pass: verify version/Deployed state, sources/substitutions, PROD-allowed/RC-excluded guards, both editors clear and both apps open/sync with changed entry points. Visually verify each upgraded logo loads and matches its pre-promotion appearance; use resources/ originals if restoration is needed and recheck the affected logo. Check recipients only if changed. Reuse DEV tests; no repeat Deployment Check. | Pending | |
| P41 | F Validate | Uncovered SQL / critical / external effects | Run only targeted checks not already covered by SQL/RC/PROD evidence. At first guard introduction observe the next normal PROD run; later releases reuse proof. Record execution/delivery limits; no forced writes/notifications without scoped authority. | Pending | |
| P38 | F Validate | Paused jobs / cutover steps | Complete approved external cutover steps and resume temporary pauses. Keep integrity triggers and one active scheduler per job/environment. | Pending | |
| P45 | G Close | Always | Complete the documentation table below: update/verify the three core records and add only affected documents. No archive/history dispositions or routine folder scan. | Pending | |
| P46 | G Close | Always | Reconcile manifest/log, versions, approvals/tests and recovery links. Close only promoted differences. Update exact dictionary rows when changed; revise overview only if explained behavior/architecture changes. Check relevant links/model values and intended Git diff once. | Pending | |
| P49 | G Close | RC exists | After all upgrades and required PROD validation pass, automatically delete the recorded RC apps for this promotion, including rejected/superseded attempts; no further owner confirmation. Delete definitions only, preserving DEV/PROD, shared data/files/logos and recovery evidence. Verify deletion and update manifest/log/inventory/checklist before P48. Keep failed/incomplete promotion RCs contained; report cleanup failures as pending. No DEV refresh. | Pending | |
| P48 | G Close | Always | Commit/push final sanitized evidence/docs; create/push unique annotated Rnnn tag at that evidence commit. Verify remote branch/tag. Do not move tags or redeploy to fix publication. | Pending | |
| P50 | G Close | Always | Report Released only after required validation, documentation and publication pass. Give versions, evidence/tag, rollback and limitations. Otherwise state the incomplete phase; repair documents without repeating live tests. | Pending | |
| P51 | X Exception | Failure / drift / required gap only | Stop affected dependent steps, record actual partial state and follow only the matching recovery branch. Preserve later writes/work; no blind replay or manual PROD fallback. Ask only for missing authority/material decisions. Reconcile resulting status and documents. | In progress | Template external-asset update preceded formal P13 handoff; no app definition/SQL production mutation. Remaining promotion follows checklist. Shared instance restart decision remains separate. |

## Documentation impact and closure

The three rows below always require Updated or Verified current. Add only affected documents, with Updated / Verified current / Pending / Blocked and a section/row reference. Scope-based non-applicability belongs in the single impact note above, not a row for every untouched file. No Pending/Blocked required row at closure.

Triggers: exact model/formula changes â†’ dictionary; changed behavior/relationships/ownership â†’ overview/design; changed depicted flows â†’ relevant drawio; changed operating method â†’ affected runbook/AGENTS; changed paths/purposes â†’ README/links; dormant pilot â†’ only if its contract/dependencies or activation is in scope. Preserve historical evidence; archives are excluded.

| Document | Disposition | Updated section / evidence |
| --- | --- | --- |
| [Release Tracker](../../../Documents/Release_Tracker.md) | Pending | |
| [Environment Inventory](../../../Documents/Environment_Inventory.md) | Pending | |
| [Development Changes](../../../Documents/Development_Changes.md) | Pending | |

## Close

- Outcome / limitations / rollback: Pending
- Final evidence commit / Rnnn tag / remote verification: Pending
- RC cleanup / verified deleted IDs and evidence: Pending or justified N/A

Released requires applicable activities, documentation, RC cleanup and publication complete. If only documents/publication remain, repair them without redeploying. Record final outcome in the manifest/tracker before the final evidence commit and verify publication afterward; do not create self-referential commit hashes.
