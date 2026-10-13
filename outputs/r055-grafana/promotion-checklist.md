# R055 promotion checklist

Template revision: 2026-09-24. **Single master:** `scripts/releases/templates/promotion-checklist.md`. Create one release copy under outputs; fill that copy throughout development/promotion. Do not maintain an Excel checklist or separate document checklist. Implementation detail: [Release Workflow](../../../Documents/Release_Workflow.md); exceptions: [Recovery](../../../Documents/Release_Recovery_Runbook.md).

## Continue here

- Scope: owner-approved Grafana Terraform adoption and native PWA monitoring; CLI/Terraform/API only. No financial, scheduler or notification test writes.
- Release: R055 Open; R056 unused. Root signals actual promotion start before freeze/handoff.
- Authority: owner approved scoped live adoption/deployment13October; external saved token privately handled by F.
- Prepared: B collector/dashboard/guides and C focused verification; F authenticated metadata inventory passed (Performance40/Cost15). Exact resource/source plan pins pending F.
- Actual: no live adoption/deployment result claimed. Existing PWA/SQL/workers remain baseline.
- Recovery: authenticated exports/state/import baseline and deployed collector/unit rollback pending.
- Selected checks: existing focused fixtures, provider schema/fmt/validate, import no-change proof, guarded grouped plans, saved-definition readback and one natural collector interval. No blanket full CI.
- Current handoff: continuation.md; root owns plan/log, F infrastructure, B collector/guides, C verification, D release records.

## Execution rules

Execute applicable rows in order; one result/evidence link per coherent check. Status: Pending, In progress, Done, Reused, N/A or Blocked. Reused requires still-valid evidence; N/A requires a brief reason. Skip untriggered setup/SQL/external/recovery work. Reuse existing decisions/authority, identities and passing tests; recheck pre-upgrade baseline/version and changed dependencies. No repeated DEV suite, whole-app diff, repeat deployment check for deployed apps, untouched-route audit or duplicate report. Consult only the runbook section needed to perform a triggered row. Stop affected dependent work on failure; no invented gates or silent scope expansion.

## Activities

| ID | Stage | When required | Activity / completion criterion | Status | Evidence / reason |
| --- | --- | --- | --- | --- | --- |
| P01 | A Readiness | Always | Use the tracker's single current Open release for development; do not reserve a successor during development/review. Confirm scope, integrated DEV features/PROD fixes, dependencies and app Upgrade/Unchanged decisions. Reuse existing evidence; resolve unrelated unreleased work. Record readiness/owner acceptance; readiness does not freeze scope. | Pending | |
| P10 | A Readiness | Always; reuse passing evidence | Accept recorded integrated DEV tests and both apps’ final zero-warning/error diagnostics. Rerun only checks invalidated by changed behavior, dependencies or data. No new full regression or live audit merely to start promotion. | Pending | Reuse C focused fixtures; scoped provider/plan/source checks only. No new full CI or AppSheet editor audit. |
| P06 | A Readiness | First use / guard changed | Install/test scheduled guards in DEV before copy, including child calls and per-row filters. Prove canonical DEV allowed and harmless copy excluded in scheduled context. Reuse this proof in later releases. | N/A | Grafana/collector-only scope; no AppSheet RC/upgrade, SQL, routing or business scheduler change. |
| P08 | A Readiness | DEV setup / routing changed | Use DEV preparation only for missing/changed setup: DEV sources/links, owner-only Partner delivery data, distinct Login Email and initial deployment if needed. Keep audit fields and channels. Unmapped actors must be resolved for affected tests. | N/A | Grafana/collector-only scope; no AppSheet RC/upgrade, SQL, routing or business scheduler change. |
| P04 | A Readiness | SQL changes | Reuse completed Flyway-chain/DEV tests and old/new-app compatibility evidence, including relevant queued clients/locks. Pin the clean tested commit with New-Release.ps1 before DEV advances; include every pending migration/prerequisite. | N/A | Grafana/collector-only scope; no AppSheet RC/upgrade, SQL, routing or business scheduler change. |
| P13 | B Capture | Always, including SQL/report-only | At authorized promotion start, pin scope/package and record scope-freeze timestamp/evidence. In one published tracker handoff mark this release Frozen, open the next unused number as the sole development release and advance the counter. Hold shared DEV edits until capture completes. Record PROD baseline/recovery order and reuse scoped authority/eligibility; recheck eligibility only after access/plan changes. | Pending | |
| P14 | B Capture | App Upgrade; SQL-only pins above | Briefly freeze DEV and pin tested versions/commit. Create named Rnnn-RCk apps by definition-only copy: the copy-data checkbox is checked by default—actively UNCHECK it for every copy/retry. Also uncheck file-data-copy options and verify all are unchecked before clicking Copy. Never copy data, even temporarily; unresolved options mean do not submit. Record this confirmation with IDs/internal names and contain execution. Rebind existing sources in P25; reject accidental data copies. Resume DEV once independent copies/pins are verified. | N/A | Grafana/collector-only scope; no AppSheet RC/upgrade, SQL, routing or business scheduler change. |
| P22 | C SQL | SQL changes / DB writes | Verify restorable DB backup, schema drift and history; then validate/migrate/validate with the pinned manifest and existing runner. Record target/schema checks and before/after SQL versions. Complete compatible SQL before final RC PROD validation. | N/A | Grafana/collector-only scope; no AppSheet RC/upgrade, SQL, routing or business scheduler change. |
| P25 | D RC | App Upgrade | Rebind/reconcile every RC table/view and auxiliary source to PROD host/database/object. Save exact mappings once. No DEV source remains. Keep RC contained before PROD binding. | N/A | Grafana/collector-only scope; no AppSheet RC/upgrade, SQL, routing or business scheduler change. |
| P18 | D RC | App Upgrade | Capture the existing PROD logo setting/appearance; apply the corresponding PROD theme/branding/logo and companion links. If needed restore the correct logo from resources/ in durable PROD/shared storage, independent of RC lifetime. Keep shared recipients on PROD contact data; confirm Login Email prerequisites. Restore only documented legacy DEV overrides. Verify these substitutions once. | N/A | Grafana/collector-only scope; no AppSheet RC/upgrade, SQL, routing or business scheduler change. |
| P28 | D RC | External asset / access changes | Provision/check only affected templates, files, grants, endpoints and integrations outside App Upgrade. Link existing evidence for unchanged assets. | Pending | |
| P29 | D RC | App Upgrade | Check copied guard coverage and this RC’s exact name exclusion; retain canonical DEV/PROD literals and intended bot states/schedules. Reuse runtime proof; no repeated diagnostic app or wait for every daily job. | N/A | Grafana/collector-only scope; no AppSheet RC/upgrade, SQL, routing or business scheduler change. |
| P30 | D RC | App Upgrade | One RC validation pass: save/reload, editor data validation, zero issues, open/sync and representative changed screens. Resolve unexpected generated changes only. Complete initial Deployment Check and deploy new RC; reuse DEV business tests. | N/A | Grafana/collector-only scope; no AppSheet RC/upgrade, SQL, routing or business scheduler change. |
| P33 | E Upgrade | App Upgrade | Freeze final deployed RC identity/version and mapping evidence. Confirm authorization covers that revision. Immediately before each upgrade, confirm unchanged PROD baseline and frozen RC version; drift/fixes require a new integrated RC. | N/A | Grafana/collector-only scope; no AppSheet RC/upgrade, SQL, routing or business scheduler change. |
| P37 | E Upgrade | Each included app | App Upgrade the existing PROD ID from the frozen RC’s full internal name in planned order. Record source, target and before/after versions. Confirm success before dependent steps; never hand-recreate settings in PROD. | N/A | Grafana/collector-only scope; no AppSheet RC/upgrade, SQL, routing or business scheduler change. |
| P39 | F Validate | Always; mappings if upgraded | One PROD pass: verify version/Deployed state, sources/substitutions, PROD-allowed/RC-excluded guards, both editors clear and both apps open/sync with changed entry points. Visually verify each upgraded logo loads and matches its pre-promotion appearance; use resources/ originals if restoration is needed and recheck the affected logo. Check recipients only if changed. Reuse DEV tests; no repeat Deployment Check. | Pending | API-based saved UID/version/query/rule readback and affected monitoring views, no GUI mandate for this approved slice. |
| P41 | F Validate | Uncovered SQL / critical / external effects | Run only targeted checks not already covered by SQL/RC/PROD evidence. At first guard introduction observe the next normal PROD run; later releases reuse proof. Record execution/delivery limits; no forced writes/notifications without scoped authority. | Pending | One natural collector interval; distinguish missing/stale telemetry from service failure. No forced business job or notification. |
| P38 | F Validate | Paused jobs / cutover steps | Complete approved external cutover steps and resume temporary pauses. Keep integrity triggers and one active scheduler per job/environment. | N/A | Grafana/collector-only scope; no AppSheet RC/upgrade, SQL, routing or business scheduler change. |
| P45 | G Close | Always | Complete the documentation table below: update/verify the three core records and add only affected documents. No archive/history dispositions or routine folder scan. | Pending | |
| P46 | G Close | Always | Reconcile manifest/log, versions, approvals/tests and recovery links. Close only promoted differences. Update exact dictionary rows when changed; revise overview only if explained behavior/architecture changes. Check relevant links/model values and intended Git diff once. | Pending | |
| P49 | G Close | RC exists | After all upgrades and required PROD validation pass, automatically delete the recorded RC apps for this promotion, including rejected/superseded attempts; no further owner confirmation. Delete definitions only, preserving DEV/PROD, shared data/files/logos and recovery evidence. Verify deletion and update manifest/log/inventory/checklist before P48. Keep failed/incomplete promotion RCs contained; report cleanup failures as pending. No DEV refresh. | N/A | Grafana/collector-only scope; no AppSheet RC/upgrade, SQL, routing or business scheduler change. |
| P48 | G Close | Always | Commit/push final sanitized evidence/docs; create/push unique annotated Rnnn tag at that evidence commit. Verify remote branch/tag. Do not move tags or redeploy to fix publication. | Pending | |
| P50 | G Close | Always | Report Released only after required validation, documentation and publication pass. Give versions, evidence/tag, rollback and limitations. Otherwise state the incomplete phase; repair documents without repeating live tests. | Pending | |
| P51 | X Exception | Failure / drift / required gap only | Stop affected dependent steps, record actual partial state and follow only the matching recovery branch. Preserve later writes/work; no blind replay or manual PROD fallback. Ask only for missing authority/material decisions. Reconcile resulting status and documents. | Pending | |

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
- RC cleanup / verified deleted IDs and evidence: Pending or justified N/A

Released requires applicable activities, documentation, RC cleanup and publication complete. If only documents/publication remain, repair them without redeploying. Record final outcome in the manifest/tracker before the final evidence commit and verify publication afterward; do not create self-referential commit hashes.

## R055 scoped execution gates

| Gate | Status | Owning evidence / required result |
| --- | --- | --- |
| Authenticated exact Grafana target, resource IDs and provider/schema boundaries | In progress | F metadata: Performance40/Cost15, namespace stacks-1839781, SA20/Admin token21; exact provider/source plan pending. No token payloads in Git or Terraform state |
| Recovery exports/current remote versions and private state | Pending | F private recovery plus sanitized hash/IDs; B collector/unit rollback |
| Import adoption without configuration changes | Pending | F exact resource/import list and no-change plan proof |
| Reviewed source/resource change plan | Pending | F plan pins + B/C exact source/evidence; preserve owner route/recipients and unrelated definitions |
| Scoped deployment/readback | Pending | Actual imports/applies/collector/dashboard/rules, truthful partial failures |
| Required visual guide and operating reference closure | Prepared | B owns both; verify saved definitions match guide before completion |
| Release freeze/publication | Held | Root signal only at actual promotion start; no R056 allocation yet |

Prepared evidence is not live deployment proof. Prior template AppSheet wording applies only if separately triggered; scoped API verification above governs monitoring. Core3 records and this checklist remain D-owned. Broader carried-forward credential programme remains unfinished.
