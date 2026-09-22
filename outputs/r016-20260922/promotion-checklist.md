# R016 — Metabase migration promotion checklist

Template revision: 2026-09-21. **Single master:** `scripts/releases/templates/promotion-checklist.md`. Create one release copy under outputs; fill that copy throughout development/promotion. Do not maintain an Excel checklist or separate document checklist. Implementation detail: [Release Workflow](../../Documents/Release_Workflow.md); exceptions: [Recovery](../../Documents/Release_Recovery_Runbook.md).

## Continue here

- Scope / dependencies / app Upgrade or Unchanged decisions: Overview/Cash; R015 V33 and accepted POC; both apps unchanged.
- Manifest / change log / test evidence: manifest.json, README.md and ../../Change Logs/CHANGE_NOTES_R016_2026-09-22.md.
- DEV readiness / owner acceptance: initial pages implemented and verified; owner page review pending.
- Production authorization / approved RC revision: owner explicitly authorized report build/publication and Singapore rebuild; no RC.
- DEV / RC / PROD-before / PROD-after / rollback / SQL versions: apps unchanged, V33 retained; private application/PROD restore evidence linked.
- Implementation commit / Flyway manifest / final tag: useful checkpoint on master; no Flyway change; final R016 tag deferred.
- Completed / next / blockers: 26 visuals verified; next owner review and later-page work.
- Documentation impact: tracker, inventory, differences, solution design, Metabase runbook and POC acceptance. No AppSheet dictionary/overview or diagram change: model/workflows unchanged.

## Execution rules

Execute applicable rows in order; one result/evidence link per coherent check. Status: Pending, In progress, Done, Reused, N/A or Blocked. Reused requires still-valid evidence; N/A requires a brief reason. Skip untriggered setup/SQL/external/recovery work. Reuse existing decisions/authority, identities and passing tests; recheck pre-upgrade baseline/version and changed dependencies. No repeated DEV suite, whole-app diff, repeat deployment check for deployed apps, untouched-route audit or duplicate report. Consult only the runbook section needed to perform a triggered row. Stop affected dependent work on failure; no invented gates or silent scope expansion.

## Activities

| ID | Stage | When required | Activity / completion criterion | Status | Evidence / reason |
| --- | --- | --- | --- | --- | --- |
| P01 | A Readiness | Always | Confirm Rnnn scope, integrated DEV features/PROD fixes, dependencies and app Upgrade/Unchanged decisions. Reuse the existing manifest/log and DEV/model checkpoint; resolve unrelated unreleased work. Record readiness/owner acceptance. | Done | Pages 1–2 scope; later pages pending; AppSheet unchanged. See README and change log. |
| P10 | A Readiness | Always; reuse passing evidence | Accept recorded integrated DEV tests and both apps’ final zero-warning/error diagnostics. Rerun only checks invalidated by changed behavior, dependencies or data. No new full regression or live audit merely to start promotion. | N/A | No AppSheet upgrade or changed workflow; Metabase checks are recorded at P41. |
| P06 | A Readiness | First use / guard changed | Install/test scheduled guards in DEV before copy, including child calls and per-row filters. Prove canonical DEV allowed and harmless copy excluded in scheduled context. Reuse this proof in later releases. | N/A | No scheduled AppSheet guard change. |
| P08 | A Readiness | DEV setup / routing changed | Use DEV preparation only for missing/changed setup: DEV sources/links, owner-only Partner delivery data, distinct Login Email and initial deployment if needed. Keep audit fields and channels. Unmapped actors must be resolved for affected tests. | N/A | No DEV app setup or routing change. |
| P04 | A Readiness | SQL changes | Reuse completed Flyway-chain/DEV tests and old/new-app compatibility evidence, including relevant queued clients/locks. Pin the clean tested commit with New-Release.ps1 before DEV advances; include every pending migration/prerequisite. | N/A | No DDL/Flyway migration; V33 retained. Reporting grants are external access configuration. |
| P13 | B Capture | Always; app details if upgrading | Record PROD identities/baseline, restorable app versions and cutover/recovery order once. Confirm scoped authority before PROD effects; reuse existing approval and App Upgrade eligibility. Recheck eligibility only after access/plan changes. | Done | Owner authorized report publication, Hobby sizing and Singapore rebuild; private backups restored. |
| P14 | B Capture | App Upgrade; SQL-only pins above | Briefly freeze DEV and pin tested versions/commit. Create named Rnnn-RCk apps by definition-only copy: the copy-data checkbox is checked by default—actively UNCHECK it for every copy/retry. Also uncheck file-data-copy options and verify all are unchecked before clicking Copy. Never copy data, even temporarily; unresolved options mean do not submit. Record this confirmation with IDs/internal names and contain execution. Rebind existing sources in P25; reject accidental data copies. Resume DEV once independent copies/pins are verified. | N/A | No AppSheet RC or upgrade. |
| P22 | C SQL | SQL changes / DB writes | Verify restorable DB backup, schema drift and history; then validate/migrate/validate with the pinned manifest and existing runner. Record target/schema checks and before/after SQL versions. Complete compatible SQL before final RC PROD validation. | Done | PROD backup restored before column-only grants; no financial writes. backup-verification.json. |
| P25 | D RC | App Upgrade | Rebind/reconcile every RC table/view and auxiliary source to PROD host/database/object. Save exact mappings once. No DEV source remains. Keep RC contained before PROD binding. | N/A | No AppSheet RC. |
| P18 | D RC | App Upgrade | Capture the existing PROD logo setting/appearance; apply the corresponding PROD theme/branding/logo and companion links. If needed restore the correct logo from resources/ in durable PROD/shared storage, independent of RC lifetime. Keep shared recipients on PROD contact data; confirm Login Email prerequisites. Restore only documented legacy DEV overrides. Verify these substitutions once. | N/A | No AppSheet branding or RC change. |
| P28 | D RC | External asset / access changes | Provision/check only affected templates, files, grants, endpoints and integrations outside App Upgrade. Link existing evidence for unchanged assets. | Done | Restricted report grants, existing Google partner access, DNS and proxy verified. |
| P29 | D RC | App Upgrade | Check copied guard coverage and this RC’s exact name exclusion; retain canonical DEV/PROD literals and intended bot states/schedules. Reuse runtime proof; no repeated diagnostic app or wait for every daily job. | N/A | No AppSheet RC. |
| P30 | D RC | App Upgrade | One RC validation pass: save/reload, editor data validation, zero issues, open/sync and representative changed screens. Resolve unexpected generated changes only. Complete initial Deployment Check and deploy new RC; reuse DEV business tests. | N/A | No AppSheet RC. |
| P33 | E Upgrade | App Upgrade | Freeze final deployed RC identity/version and mapping evidence. Confirm authorization covers that revision. Immediately before each upgrade, confirm unchanged PROD baseline and frozen RC version; drift/fixes require a new integrated RC. | N/A | No AppSheet upgrade. |
| P37 | E Upgrade | Each included app | App Upgrade the existing PROD ID from the frozen RC’s full internal name in planned order. Record source, target and before/after versions. Confirm success before dependent steps; never hand-recreate settings in PROD. | N/A | Both AppSheet definitions unchanged. |
| P39 | F Validate | Always; mappings if upgraded | One PROD pass: verify version/Deployed state, sources/substitutions, PROD-allowed/RC-excluded guards, both editors clear and both apps open/sync with changed entry points. Visually verify each upgraded logo loads and matches its pre-promotion appearance; use resources/ originals if restoration is needed and recheck the affected logo. Check recipients only if changed. Reuse DEV tests; no repeat Deployment Check. | Done | Metabase HTTPS, partner UI, 26 visuals and Singapore deployments verified; AppSheet checks not triggered. |
| P41 | F Validate | Uncovered SQL / critical / external effects | Run only targeted checks not already covered by SQL/RC/PROD evidence. At first guard introduction observe the next normal PROD run; later releases reuse proof. Record execution/delivery limits; no forced writes/notifications without scoped authority. | Done | 31 SQL reconciliation cases, relationship checks, desktop/date/mobile UI checks passed. |
| P38 | F Validate | Paused jobs / cutover steps | Complete approved external cutover steps and resume temporary pauses. Keep integrity triggers and one active scheduler per job/environment. | Done | Singapore application database rebuilt; one healthy replica per service; obsolete volume and temporary SSH key removed. |
| P45 | G Close | Always | Complete the documentation table below: update/verify the three core records and add only affected documents. No archive/history dispositions or routine folder scan. | Done | Three core records and affected design/runbook updated. No AppSheet model/dictionary change. |
| P46 | G Close | Always | Reconcile manifest/log, versions, approvals/tests and recovery links. Close only promoted differences. Update exact dictionary rows when changed; revise overview only if explained behavior/architecture changes. Check relevant links/model values and intended Git diff once. | Done | Manifest, log, query/backup/deployment evidence reconciled for initial review checkpoint. |
| P49 | G Close | RC exists | After all upgrades and required PROD validation pass, automatically delete the recorded RC apps for this promotion, including rejected/superseded attempts; no further owner confirmation. Delete definitions only, preserving DEV/PROD, shared data/files/logos and recovery evidence. Verify deletion and update manifest/log/inventory/checklist before P48. Keep failed/incomplete promotion RCs contained; report cleanup failures as pending. No DEV refresh. | N/A | No RC definitions created. |
| P48 | G Close | Always | Commit/push final sanitized evidence/docs; create/push unique annotated Rnnn tag at that evidence commit. Verify remote branch/tag. Do not move tags or redeploy to fix publication. | In progress | Publish checked pages 1–2 checkpoint now; final R016 tag deferred until full migration closure. |
| P50 | G Close | Always | Report Released only after required validation, documentation and publication pass. Give versions, evidence/tag, rollback and limitations. Otherwise state the incomplete phase; repair documents without repeating live tests. | In progress | Pages 1–2 ready for owner review; full migration is not Released. |
| P51 | X Exception | Failure / drift / required gap only | Stop affected dependent steps, record actual partial state and follow only the matching recovery branch. Preserve later writes/work; no blind replay or manual PROD fallback. Ask only for missing authority/material decisions. Reconcile resulting status and documents. | Done | Trial OOM resolved by bounded Hobby sizing. Failed volume moves superseded by Singapore rebuild; source incidental revisions restored. |

## Documentation impact and closure

The three rows below always require Updated or Verified current. Add only affected documents, with Updated / Verified current / Pending / Blocked and a section/row reference. Scope-based non-applicability belongs in the single impact note above, not a row for every untouched file. No Pending/Blocked required row at closure.

Triggers: exact model/formula changes → dictionary; changed behavior/relationships/ownership → overview/design; changed depicted flows → relevant drawio; changed operating method → affected runbook/AGENTS; changed paths/purposes → README/links; dormant pilot → only if its contract/dependencies or activation is in scope. Preserve historical evidence; archives are excluded.

| Document | Disposition | Updated section / evidence |
| --- | --- | --- |
| [Release Tracker](../../Documents/Release_Tracker.md) | Updated | R016 initial page review checkpoint. |
| [Environment Inventory](../../Documents/Environment_Inventory.md) | Updated | R016 initial page review checkpoint. |
| [Development Changes](../../Documents/Development_Changes.md) | Updated | R016 initial page review checkpoint. |

## Close

- Outcome / limitations / rollback: pages 1–2 review ready; copied legacy semantics and later pages pending. Private application dump plus existing encryption key provides recovery.
- Final evidence commit / Rnnn tag / remote verification: checked checkpoint publication; final R016 tag awaits full migration completion.
- RC cleanup / verified deleted IDs and evidence: N/A, no AppSheet RC.

Released requires applicable activities, documentation, RC cleanup and publication complete. If only documents/publication remain, repair them without redeploying. Record final outcome in the manifest/tracker before the final evidence commit and verify publication afterward; do not create self-referential commit hashes.

## Model and presentation refinement

The owner's subsequent review requested central reusable models and a redesigned presentation. Added six models (69–74), semantic keys/FKs and collection 8. All 22 questions now use query-builder model sources, with no per-visual SQL/joins/business expressions. All 26 business visual placements remain, with seven section headings and two notes. All 31 source-reconciliation cases pass; model grains, relationships, permissions and desktop/390px browser checks pass. See `model-verification.json`, `browser-verification.json` and the updated metric contract.

| Additional affected document | Disposition | Evidence |
| --- | --- | --- |
| AppSheet Data Dictionary | Updated | Metabase Models sheet: six model grains and 68 fields; 13 original worksheet parts preserved. |
| AppSheet Data Model Overview / Solution Design | Updated | Shared reporting layer, grains, ownership and centralization rule. |
| Metabase runbook / model definitions | Updated | Model installation, model-only visual build, dashboard filter verification, recovery. |

Existing Tracker, Environment Inventory and Development Changes rows are updated for this refinement. Pre-change and completed object exports are private; all credentials stay outside Git. This is another checked review checkpoint, not full R016 acceptance or a final release tag.
