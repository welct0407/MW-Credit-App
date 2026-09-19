# Release workflow — integrated DEV → immutable RC → App Upgrade

Effective **19 September 2026** for all future development/promotion, including unfinished work in an existing release. Historical releases retain their actual method and evidence. Read only the applicable stage; [AGENTS.md Section 6](../AGENTS.md#6-release-development-and-production-promotion) governs standing rules.

**Promote the complete tested AppSheet definition through App Upgrade from a PROD-mapped immutable release candidate (RC).** Keep a concise complete change record for scope, testing and recovery; exhaustive per-property AppSheet transcription/readback is no longer required. Flyway deploys SQL; Git records versions and evidence. Never promote ordinary DEV directly or merge feature copies by consecutive upgrades.


## Target operating model — owner revision, 19 September 2026

| Environment | Mode | Notifications / recipients | Scheduled business execution |
| --- | --- | --- | --- |
| DEV | Deployed | Enabled; owner only via DEV recipient master data | Enabled for intended jobs |
| RC | Deployed | Enabled; PROD recipient data; no unapproved test delivery | Blocked by app-name guard |
| PROD | Deployed | Enabled; normal PROD recipient data | Enabled for intended jobs |

Supersedes earlier Prototype-only DEV rules and exhaustive delta-validation gates. Existing deliberately retired/disabled jobs stay disabled. The matrix is target policy, not a claim that live transition has occurred. Follow [DEV preparation](Development_Environment_Preparation.md) for master-data redirection and one-time removal of legacy hard-coded DEV recipient overrides. No standard recipient expression remapping during RC promotion.

## Release records and integration

Use the reserved Rnnn, one release log under `Change Logs/`, and `outputs/<release>/` for sanitized artifacts. Copy the [templates](../scripts/releases/templates/) once and link them from the log:

- `release-manifest.json`: scope, Git/Flyway pins, DEV/RC/PROD identities/versions, decisions, gates and recovery. Include OLTP and OLAP with `upgrade` or `unchanged` disposition. SQL-only releases record App Upgrade as not applicable.
- Change record in the existing log: all included features/fixes, affected components, dependencies, tests and recovery. An exact `release-delta.json` is optional for critical logic, troubleshooting or tooling; do not recreate an exhaustive property inventory merely for promotion. Exact model documentation remains required when applicable.
- `source-mapping-validation.json`: RC table/source mappings, actual environment substitutions and scheduled guard evidence. Recipient expressions normally remain identical; master data determines DEV versus PROD delivery. No routine recipient substitution inventory.
- `promotion-checklist.md`, linked test/readback artifacts and generated [per-document closure rows](Promotion_Documentation_Checklist.md). Unknown values remain null/Pending, never invented or automatically passed.

The implementation commit, Flyway manifest and final evidence/tag commit are different identifiers. A delta hash fingerprints recorded changes, not the whole app. Record complete AppSheet internal names (including suffix), UUIDs and versions; display names alone are ambiguous. Keep credentials/raw private exports outside Git. Capture generated documentation at DEV freeze, final RC, PROD-before and PROD-after where available; manual editor/version evidence is acceptable. Record unavailable captures once; perfect extraction/full-app diff is not a development prerequisite.

DEV is the integration environment. Branches/worktrees isolate files only; coordinate shared app properties, migration numbering and workbook writes. Integrate all feature experiments into main DEV and retest before RC copy. The candidate must include the latest accepted PROD baseline, all approved batch changes/prerequisites and no unrelated later work. Whole-definition replacement overwrites intervening PROD settings even outside the delta. Reconcile release history and affected evidence; broaden capture/diff only if baseline completeness is uncertain.

Maintain a short continuation note at coherent checkpoints: versions/RC revision, done, next, approval scope and evidence links. Don't reread historical logs or regenerate completed checklists solely because a new task continues the release.

## 6.1 Develop and integrate — Gate A

1. Reserve/read the release; define acceptance behavior, included apps/SQL/external dependencies and predecessors. Record its DEV checkpoint in `Development_Changes.md` and documentation impacts. Inspect affected configuration/schema and establish rollback versions/backups. Ordinary DEV edits reuse established isolation.
2. Implement in DEV and maintain the concise change record, including refinements, warning fixes and meaningful generated/dependent changes. Use relevant saved checks during development and link existing implementation artifacts. Retain exact values for model documentation, critical logic, environment substitutions and external/manual steps where needed. No mandatory all-property delta, per-save export or duplicated narrative; preserve other releases' work.
3. Keep DDL/functions/triggers/views/indexes/backfills in immutable Flyway migrations under the [database procedure](../database/README.md#each-change). Prefer expand/contract: keep old and new apps compatible with upgraded SQL; defer destructive removal. Record compatibility tests, lock/backfill effects and any maintenance/queued-client handling. Never skip migrations or alter checksums to isolate a release.
4. Test the integrated release and affected consumers using the tiers below. A feature tested on its own copy is not an integrated candidate. Reconcile PROD hotfixes and unrelated unreleased configuration before copying, not by deleting settings from PROD later.
5. Reconcile release scope, dependencies and documentation impacts; capture both DEV apps' final editor diagnostics. Report Ready to promote, Ready subject to listed checks/owner decision, or Not ready, distinguishing DEV completion from remaining RC preparation/production approval. Passing tests do not imply owner acceptance.

### Test selection and evidence reuse

| Change | Relevant DEV checks | Broaden for affected risks |
| --- | --- | --- |
| Documentation/governance/tooling | Links, consistency, template/tool checks | No live tests for documentation alone |
| UI text/order/visibility/format | Saved exact settings and current-GUI form/view | Conditional display, permissions or financial choices |
| Expressions/slices/actions/bots | Normal and relevant invalid/boundary paths, saved/synced results, consumers | Retry/duplicates, schedules/delivery, access, shared consumers or performance |
| SQL/schema/financial behavior | Flyway chain/validation, relevant SQL regression and app reconciliation | Concurrency/idempotency, locks/backfills and old/new-app compatibility |

Critical regression subset: load/sync, borrower/loan lookup, affected critical action/form entry points and OLAP readback. Add relevant Receive All, single/lump-sum receipt, closure/default, charge, cash/expense and reporting cases according to impact; don't run all financial scenarios for a cosmetic change. Use synthetic/redacted DEV fixtures and current GUI, not legacy editor/bot Test pages. Configuration inspection does not prove execution/delivery.

Reuse passing evidence while implementation, dependencies, environment and data assumptions remain applicable; link versions/hashes, date, expected/actual results and limitations. Rerun only invalidated checks. An unrelated version increment/documentation commit alone need not invalidate a behavioral test. Final diagnostics/readbacks must cover the final state; don't repeat identical evidence. Optional `fingerprint` compares selected files/context, not live settings. Batch affected overview/dictionary updates once per completed change set and after promotion; coordinate workbook writes.

### Warning and deployment-state rules

- Both DEV apps at readiness and both PROD apps at closure require **zero outstanding editor configuration warnings/errors**, including pre-existing issues. Record final saved versions, diagnostics and corrections once. Never hide warnings; an unavailable required editor check remains incomplete.
- **DEV, RC and PROD are Deployed.** DEV/PROD execute intended schedules; RC scheduled business execution is blocked by the canonical-app guard. Initial DEV setup/replacement requires a deployment check after source/recipient isolation. This supersedes the earlier Prototype-only DEV policy.
- Already-Deployed apps in every environment require no fresh Deployment Check. Preserve Deployed mode; use saved-state diagnostics and relevant tests. Never toggle to Prototype or block closure on an unavailable repeat-check control.
- RC is a new source copy: complete its initial Deployment Check, resolve applicable findings and mark it Deployed before App Upgrade. Verify scheduled execution is blocked before deployment/PROD binding. No Prototype-source alternative is part of the standard process.

## 6.2 Capture and prepare the release candidate — Gates B–D

### Gate B: integrated candidate captured

1. Briefly freeze affected shared DEV edits. Record integrated app/Flyway versions, intended PROD target, tests, concise scope/revision, implementation commit, external dependencies and recovery. For SQL changes, run `New-Release.ps1` from the clean tested commit before later migrations advance DEV; retain the original manifest privately and sanitized hashes in Git. Account for every pending migration through its target. An optional delta does not become an extra gate.
2. Check App Upgrade plan/ownership availability and source-copy prerequisites early. Record the window, app order and containment before PROD effects. SQL and two upgrades are not atomic: ensure compatible intermediate states or a maintenance window, accounting for offline/unsynced clients. Sending user communications requires explicit instructions.
3. Copy each included integrated DEV app, definition only without copying DEV data to PROD, to `MW-OLTP-Rnnn-RCk` / `MW-OLAP-Rnnn-RCk` (k starts at 1). Record actual internal names/UUIDs, copy options, timestamp and source DEV versions. Upgrade an app when its definition must change; explicitly record/test an unchanged companion. Restrict RC access and prevent unintended execution from copy creation.
4. **After DEV → RC copy, set each RC's theme to its corresponding PROD app's captured exact theme mode/color/branding values.** OLTP RC takes PROD OLTP's theme; OLAP RC takes PROD OLAP's theme. Capture each separately with version/evidence; do not guess from screenshots or assume a common color. Preserve the four existing DEV/PROD themes. Verify saved values/appearance and intended PROD-facing display name/icon; no DEV/RC label should leak into production branding. Distinguish the RC by its recorded internal name/UUID and restricted access, without relying on color. Do not rename its frozen internal identity.
5. DEV work may resume once copies and SQL pins are independent and verified. RCs are controlled preparation artifacts: only recorded PROD substitutions and validation corrections, with affected retesting, are allowed before final freeze. **Immutability starts at Gate D**, after necessary preparation edits. An unprepared DEV-bound copy is not promotion-ready. Optional RC Git tags point to checked evidence commits.

### RC containment and external dependencies

A PROD-bound RC is production-capable. It retains notification definitions and the same data-driven recipient expressions as DEV/PROD, reads PROD master data and links to the actual PROD pair. Do not perform test writes or force notifications in RC without scoped production authorization. Scheduled business execution is blocked by the guard; restricted access/reviewed entry points contain non-scheduled effects. Do not disable scheduled bot definitions in RC, which would carry disabled definitions into PROD.

Use the persistent scheduled-bot guard below, implemented/tested in controlled DEV before RC copy. It preserves the intended enabled state while allowing business execution only in canonical apps. Other entry points (interactive writes, app/external events, webhooks and external/SQL schedulers) still need their own applicable containment; this guard is not a data-access security boundary. Never disable DB integrity triggers. If the guard is missing or unverified, keep the candidate on DEV sources with affected bots disabled until prepared; do not rebind/deploy an executable RC or silently repair disabled PROD bots afterward.

Validate templates/files, endpoints, permissions and scheduler ownership that App Upgrade may not transfer. Record exact destinations and provisioning evidence separately; app copy does not guarantee external assets, access grants or data transfer. No forced notifications or financial test writes through PROD-bound RC without explicit scoped authorization. Reuse DEV behavioral tests; inspect/cancel forms in RC. Record unavailable execution checks honestly and obtain owner disposition if a required check cannot run.

### Scheduled-bot execution guard

**Standard arrangement:** all apps are Deployed and retain intended bot definitions/schedules. DEV and PROD are allowed by the persistent app-name guard; RC is excluded. Thus “RC scheduled bots disabled” means scheduled business execution is disabled, not that the bot definition's enabled flag is switched off. An RC timer may be invoked but must perform no business side effects. Notifications remain enabled: DEV recipients come from owner-only DEV master data; RC/PROD recipients come from unchanged PROD master data.

For each app separately, use this expression with its actual full internal names:

```appsheet
IN(
  CONTEXT("AppName"),
  LIST("<canonical DEV internal app name>", "<corresponding PROD internal app name>")
)
```

1. Capture names from verified `appName` values in the editor/app URLs; they include the account suffix and are **not UUIDs or display names**. Use only that role's DEV/PROD pair: OLTP does not allow OLAP names. Never allow an RC, use a broad prefix/substring match, or infer identity from theme, owner email or database label. Empty/unknown context must deny execution. The literals above are placeholders, not deployable values.
2. Place **Branch on a condition** as the first process step. Put the entire existing business chain inside its true branch; the false branch and any continuation after the branch must have no writes, notifications, exports, webhook/script calls or side-effecting child processes. Guard before a child-process call, which can itself update data. Preserve original business conditions, dependencies, ordering and disabled/superseded states; don't replace them with the identity check. Audit all scheduled entry points and reachable paths, including shared processes.
3. For a per-row schedule, also combine the allowlist with the existing row filter using `AND(guard, originalFilter)` (use `TRUE` only when there was no filter). This avoids starting the process for RC rows. Keep the process guard as the common protection. For a non-row schedule use the process branch; don't invent a row filter field or change the job into a per-row job. Preserve exact guard expressions and bot/event/process paths in the mapping evidence (or link an optional delta).
4. Install the guard in DEV as a recorded release change **before copying an RC**; restore intended enabled states before final candidate freeze. Do not add it to a ready-immutable RC or hand-edit PROD to activate jobs after upgrade. Existing PROD continues its current schedule until upgrade; afterward the guard evaluates in the existing PROD app. The retained RC stays excluded indefinitely. Check copied expressions retain canonical literal names, with no automatic substitution to the new RC name.
5. **First-use verification:** prove allowed/excluded identity and branch behavior in server-side scheduled context using deployed DEV and a harmless controlled copy on DEV sources, with no production effects. Use current editor/Automation Monitor, not the legacy bot Test page or preview-only evaluation. Document/retire temporary diagnostic schedules. Verify existing PROD identity after first upgrade and observe its next normal run without forcing financial work. Reuse the verified pattern afterward; do not require another verification app or experiment for each release.
6. **Subsequent releases:** reuse that verified pattern while names, placement, platform behavior and job paths remain applicable. Check saved guard coverage in the copied RC and resulting PROD, plus actual RC name exclusion. No need to wait for every daily schedule or repeat a diagnostic experiment per release. New/changed entry points or app identities invalidate only affected coverage. If runtime evidence contradicts the guard, stop the affected RC path and correct/retest before PROD binding; don't assume a green expression preview proves server behavior.
7. Record a compact per-bot row: app, bot/event/process, intended state/schedule, exact guard/placement, allowed names, RC name, saved RC/PROD evidence and first-use/reused runtime reference. Keep jobs idempotent: the guard doesn't prevent retries within an allowed PROD app. Platform error alerts and jobs outside the guarded process need separate route review; don't claim this blocks all notifications or external schedules.

Google documents [AppName context](https://support.google.com/appsheet/answer/10107885?hl=en), [conditional process steps](https://support.google.com/appsheet/answer/11463007?hl=en), [per-row scheduled filters](https://support.google.com/appsheet/answer/11445188?hl=en) and [scheduled invocation/retries](https://support.google.com/appsheet/answer/11547468?hl=en). Reviewed 19 September 2026. The allowlist/branch arrangement is this project's design using those features; live first-use proof remains required before claiming isolation.

### Gate C: compatible PROD database ready

Before migrations, confirm scoped owner authorization for the package/RC production effects, expected PROD app/SQL baseline, compatibility, verified restorable DB backup and recovery references. Reuse approval covering those actions; a manifest field or push is not approval.

Follow the [Flyway procedure](../database/README.md#each-change): history/schema drift review → validate → migrate from pinned clean commit/original manifest → validate and confirm target/required objects with read-only checks. Every pending migration must belong to the batch or an approved prerequisite. No DEV financial data moves to PROD. For app-only releases verify SQL baseline/dependencies and record migration as Not applicable. Failure stops dependent RC validation/App Upgrade; investigate before retrying.

Apply compatible migrations **before final RC PROD-source verification**, so required objects exist. Record the pre-migration SQL version separately from the post-migration/pre-upgrade version. SQL success followed by app failure is partial application, not permission for destructive rollback.

### Gate D: PROD-mapped RC validated and immutable

1. Rebind **every RC SQL table/view** to the verified PROD host/instance, database, schema and object. Reconcile actual RC inventory with mapping rows so missing/extra tables cannot hide. Verify auxiliary/file/internal sources separately with explicit purpose/disposition. Labels/common database names do not establish identity. No DEV source remains in the deployment definition.
2. Record necessary substitutions: connections, existing PROD companion IDs/deep links (not RC/DEV IDs), access/endpoints/files and per-app PROD themes. Keep data-driven recipient expressions unchanged: rebinding to PROD supplies normal recipients automatically. Reuse established routing coverage; inspect only changed routes, legacy hard-coded overrides, new tasks or concrete delivery issues. Resolve any recorded exception before freeze, never silently carry owner-only DEV literals to PROD. RC navigation into PROD must not execute unauthorized actions.
3. Save/reload and use Save & Verify Data (or equivalent exposed current-editor data validation). Verify Refs, security filters, types/permissions and affected slices/views/generated metadata. Resolve editor issues and complete applicable RC-source deployment prerequisites under containment. Capture saved versions, source/substitution readbacks and relevant GUI checks.
4. Reconcile the candidate with the accepted change summary and source DEV versions. Verify preparation substitutions and release-critical differences using existing evidence; complete separate external-asset steps. Do not require full business-property readback solely because the app was copied. Unexpected regeneration or copy changes require targeted investigation/retesting.
5. Freeze final deployed RC UUID/internal name/version, mapping/guard evidence, tests, scope and package revision (plus optional delta hash) in the manifest. Set `rc.state` to `ready-immutable` only now. No later configuration edits on this identity. Fixes require a new RC number and affected retesting/approval. If DEV has later work, reconstruct the earlier integrated candidate in a controlled copy without resetting others' work.

## 6.3 Approve and promote — Gate E

1. Confirm acceptance/authorization cover final named RCs, SQL target, operational steps and accepted limitations. Recheck RC identity/version and PROD baseline immediately before upgrade. If PROD changed, reconcile **all intervening changes** into a new integrated candidate and retest; whole-definition replacement cannot preserve unrelated fixes automatically.
2. Record timestamped **PROD pre-upgrade and restorable rollback versions for each included app**, current Flyway version, Deployed state, relevant smoke baseline and generated docs where available. Link pre-migration backup and compatibility evidence. Confirm versions remain restorable; retain private recoverable copies if platform retention cannot cover the recovery window.
3. In the **existing PROD target** editor use **Manage → App Versions → App Upgrade** (or current equivalent). Confirm target UUID; supply the recorded **complete RC internal name, including suffix**. Ensure its saved version still equals the frozen version: selection by name must not silently use an edited source. Upgrade only under recorded authorization. Never delete/recreate PROD IDs or send users to RC.
4. Record result and new PROD version in dependency order; verify the first operation before the next dependent upgrade. An unavailable control is a capability/plan issue, not permission for manual setting recreation. Reconcile operational pauses/controls as planned, without patching business definitions in PROD.
5. On failure, record completed SQL/app/external steps and stop dependent writes. Follow [recovery](Release_Recovery_Runbook.md); no blind retries, financial replay or restoration over newer writes. A changed frozen source requires a new RC even after one app already upgraded.

Google's [Upgrade an app](https://support.google.com/appsheet/answer/10105386?hl=en) documents source names, Core-plan availability, source-copy deployment preparation and queued-client schema risks (reviewed 19 September 2026). Verify actual capabilities during preparation; App Upgrade does not replace SQL/external-system deployment.

## 6.4 Validate production and close — Gate F

1. Perform limited basic validation against the frozen RC/release record: confirm correct source/target, successful App Upgrade and saved PROD version, Deployed state, PROD data bindings and necessary link/theme/access substitutions. Verify scheduled guard permits PROD and excludes RC. No mandatory every-property delta readback or whole-app comparison. Reuse RC mapping evidence with a focused resulting-PROD source check; broaden only on observed mismatch or concrete uncertainty.
2. In both PROD apps check open/sync, expected access and representative changed entry points (inspect/cancel forms without saving). Reuse passed DEV business tests; do not repeat the full workflow suite. SQL migrations, external/manual steps and changed critical behavior receive their own proportionate checks. Financial writes/mutating actions/forced notifications still need scoped authorization.
3. Record both apps' final editor diagnostics, final app/Flyway versions, basic smoke results and relevant SQL checks. Confirm intended automation states and RC exclusion. No routine recipient audit/remapping once data-driven routing is established, no comparison to later DEV and no repeat deployment check. Record any unavailable execution/delivery check honestly.
4. An incomplete required basic/targeted check means Deployment applied; verification incomplete. An optional property comparison is not a release gate unless chosen for a concrete risk and recorded as required. Exceptions remain explicit and cannot waive zero editor issues. Correct observed defects through a new RC or authorized recovery, not ad-hoc manual replication.
5. Complete **every row** of [Promotion Documentation Checklist](Promotion_Documentation_Checklist.md), checking a fresh recursive Documents inventory. Always update/verify `Release_Tracker.md`, `Environment_Inventory.md` and **`Development_Changes.md`**. Close only this release's differences; preserve later DEV. Reconcile overview/dictionary together (formula changes count), other applicable records, manifest/log, versions/approval/recovery. If runtime passed but docs are pending, report **Production validated; documentation closure incomplete**, retaining tracker incomplete status. Don't rerun live tests merely to repair docs.
6. Complete manifest/publication intent and commit/push intended sanitized evidence/docs. Create an annotated unique final `Rnnn` tag at that **evidence commit**; push and verify branch/tag targets. Never move/reuse an existing tag. The tagged manifest references the immutable implementation commit/Flyway manifest/RC versions. Avoid self-referential hashes: record intended tag name in manifest; resolve its commit from Git. A failed publication/tag is publication incomplete; repair it before final completion without redeploying.
7. Retain frozen RC/recovery evidence for the recorded recovery window under verified execution containment. Do not change/delete RCs or shared assets as routine cleanup; retirement requires a recorded retention/recovery decision. Mark Released only after validation, documentation and publication are complete. Report release/outcome, DEV/RC/PROD/SQL versions, tag/evidence, rollback and accepted limitations.

No automatic DEV refresh follows closure. A requested app-only, DB-only or combined refresh uses [DEV refresh](Development_Refresh_Runbook.md), preserving active RCs and later work.
