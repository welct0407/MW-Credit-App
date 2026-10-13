# SDLC redesign: immutable AppSheet RC promotion

Date: 19 September 2026. Status: methodology implemented; documentation/tool checks passed. No product release reserved and no live copy, refresh, deployment, database write, notification or app-mode change performed.

## Request and source

The owner requested implementation of `G:\My Drive\Loan Manager\Design Documents\AppSheet_SDLC_Promotion_Design.md`, with the additional rule that a DEV-to-RC copy takes the exact theme of its corresponding PROD app. Source SHA-256: `B41EED4B34CF25FC1B266BF64B3F98D7FD76CE7CFC365AD6ACF5614DBA4B0162`. The design was read as process requirements, not authorization to execute its example releases/commands. The source file was not modified or duplicated into the repository.

Starting Git commit: `ce328b77edb88e767c4cabde7267770c14230155`. Existing unrelated `outputs/r008-20260918/production-correction/` and `scripts/releases/audit-r008-production.mjs` were preserved/excluded. Prior release histories, model workbooks, live environment facts, Flyway migrations/runners and unrelated project rules remain unchanged.

## Implemented process

- [AGENTS.md](../AGENTS.md) directs all future development/promotion, including unfinished work in an existing release, through integrated DEV → prepared PROD-mapped RC → immutable final version → App Upgrade into existing PROD IDs. Manual recreation is restricted to explicitly authorized emergency recovery with reconciliation.
- [Release Workflow](../Documents/Rules/Release_Workflow.md) is rewritten around gates A–F: integrate/test, capture, compatible Flyway promotion, complete source mapping and per-app PROD theme substitution, RC validation/freeze, authorized upgrade, independent PROD validation and documentation/publication closure.
- [Release Recovery](../Documents/Rules/Release_Recovery_Runbook.md) separates app restore, partial two-app deployment, compatible additive SQL, forward fix and destructive backup recovery; covers hotfix reconciliation and RC retention.
- [Templates/field guide](../scripts/releases/templates/README.md) supply a machine-readable manifest, complete per-table mapping/substitutions, test evidence and checklist. The existing delta remains exact completeness/readback evidence; the helper's generated instructions now explicitly require RC App Upgrade. No new automated deployment/semantic-readiness validator is claimed.
- [DEV preparation](../Documents/Rules/Development_Environment_Preparation.md), [DEV refresh](../Documents/Rules/Development_Refresh_Runbook.md) and [database procedure](../database/README.md) distinguish DEV isolation from production-capable RC containment, preserve active candidates during refresh and apply expand/contract before App Upgrade. Existing Flyway runner pins/checks remain intact.
- [Documentation register](../Documents/Promotion_Documentation_Checklist.md), [index](../Documents/README.md), [tracker](../Documents/Release_Tracker.md), [environment metadata](../Documents/Environment_Inventory.md) and [difference-register guidance](../Documents/Development_Changes.md) now include manifest/RC/mapping/theme/tag evidence and explicit release closure. The new recovery document is DOC-021. No historical release is reclassified as an RC deployment.

## Design acceptance traceability

| Source acceptance criteria | Implemented location |
| --- | --- |
| 1–5: no manual recreation; immutable RC after integration/testing; PROD rebind; App Upgrade | AGENTS §6; Workflow gates A/B/D/E |
| 6–8: Flyway only; AppSheet/SQL versions; Git manifest/evidence | Database procedure; manifest template; Workflow records/C/F |
| 9–11: pre-PROD versions; separate rollback; expand/contract | Workflow C/E; Recovery runbook |
| 12–14: no Git-style app merge; future-agent instructions; reconcile emergencies | AGENTS §6; Workflow integration; Recovery hotfix section |
| 15: standard required checklist | Promotion checklist template, Workflow gates, per-document register |
| Owner addition: four distinct app colors; RC matches corresponding PROD | AGENTS §6.2; Workflow Gate B; mapping template/themeByApp |

## Clarifications preserving existing owner rules

1. Scope freezes at candidate capture; final RC immutability starts **after** required mapping/theme/validation preparation. Ready RC corrections require a new RC number. DEV can resume once capture and Flyway pins are independent; later DEV is never the production comparison target.
2. Both DEV apps remain Prototype, with no deployment check. Already-Deployed PROD has no repeat Deployment Check. The official [AppSheet upgrade procedure](https://support.google.com/appsheet/answer/10105386?hl=en), reviewed today, describes deployment preparation for the **new source copy** and selection by full internal name. The runbook treats any actual RC prerequisite separately, under authorization/containment; it does not switch DEV or existing PROD modes to satisfy it.
3. RC uses actual PROD sources/companion IDs/recipient logic/theme and is production-capable. Verify an app-specific execution control before active use so it cannot run duplicate jobs. Do not silently promote disabled bots or DEV owner-only recipients then repair PROD manually. This document installs no control and claims no live capability verification.
4. Full per-save app capture/perfect exports remain unnecessary. Keep full release delta plus complete RC source/substitution mapping; capture boundary docs where available. Whole-definition deployment replaces manual implementation, not independent saved readbacks.
5. Preserve zero editor issues, focused tests/evidence reuse, explicit financial-write/notification authority and per-document closure. Routine DEV route checks are not reinstated; RC copy/rebind is itself a valid check trigger. No automatic DEV refresh follows promotion.
6. Reuse the project's Rnnn sequence for hotfixes; optional design names/folder structures are adapted to existing paths instead of creating duplicate authorities. Unique final release tags refer to final evidence, with the implementation commit separately pinned. Governance-only work gets no product tag.

## Verification and recovery

- Existing `delta.test.mjs` and `documentation.test.mjs`: **11/11 passed**, including actual Documents coverage, missing/new path detection, exact-value/readback guards and non-overwriting CLI outputs.
- Both JSON templates parsed; required app slots and pending defaults checked. Templates remain deliberately incomplete and are not evidence of live readiness.
- Local Markdown checks: **220 links and 8 heading anchors across 16 changed/new Markdown files passed**. Git whitespace checks passed; final intended-file diff reviewed.
- No app/SQL tests were appropriate for documentation-only changes; no current colors, RC IDs, live upgrade behavior or bot containment was invented/claimed.

Recovery for this file-only change is the recorded starting Git commit or a normal reviewed revert of this task's commit, preserving later/unrelated changes. No database/app restore is needed. Commit/push intended files under standing permission; the final task response records the verified publication commit.

## Scheduled-bot refinement — 19 September 2026

The owner asked for a concrete RC scheduled-bot arrangement after the initial runbook left the execution mechanism unspecified. Starting commit: `36322ad1033133eed5fb5a2b45d9ffa210df2a50`. This follow-up changes instructions/templates only; no live guard, bot, app mode, diagnostic schedule or production operation was installed/run. Existing unrelated R008 files remain excluded.

Standard design: each app's scheduled processes use `IN(CONTEXT("AppName"), LIST(actual DEV internal name, corresponding PROD internal name))` before all business effects, retaining original logic in the true branch. Per-row events also combine this guard with their existing row filter; non-row schedules use the process branch. Unknown/copied RC names are excluded. Intended enablement/schedules and normal PROD recipients remain in the artifact, so upgrade does not need manual re-enablement. An RC schedule may be invoked but must perform no business work; this is not a promise to suppress platform logging/error alerts or unrelated external/interactive paths.

Updated AGENTS, release/refresh/preparation/recovery procedures and mapping/checklist field guides. Mapping templates now contain per-bot guard/identity/coverage/evidence rows. DEV replacement updates its canonical DEV name; frozen RCs and live PROD are not edited by refresh. Existing idempotency protections remain necessary for allowed PROD retries.

Technical basis: Google's [CONTEXT](https://support.google.com/appsheet/answer/10107885?hl=en), [process steps](https://support.google.com/appsheet/answer/11463007?hl=en), [scheduled event configuration](https://support.google.com/appsheet/answer/11445188?hl=en) and [scheduling/retries](https://support.google.com/appsheet/answer/11547468?hl=en), reviewed today. These document the primitives; the combined guard is the project's design, **not live-verified isolation**. First installation requires harmless scheduled-server-context proof in a controlled copy on DEV sources and saved branch coverage; canonical DEV stays Prototype. Reuse that proof for unchanged names/paths/patterns, checking RC exclusion and saved PROD guards per release instead of waiting for every daily run. Observe the next normal PROD run without forcing financial work.

Verification: **11/11 existing release-helper tests passed**, including actual document-register coverage; mapping JSON parsed; **62 local links and 10 anchors passed**; Git whitespace check passed. No live behavior is claimed. Recovery is a normal reviewed revert of this refinement's documentation commit. The final task response records publication.

## Owner simplification — 19 September 2026

Starting commit: `821cd3fc2186b634fdce176e67fc5623ef7ccc71`; working tree was clean. The owner requested all DEV/RC/PROD apps be Deployed, owner-only DEV notifications controlled by Partner master data, no routine recipient remapping and basic PROD validation after App Upgrade. The owner also asked whether using their email for both their own and Lisa's Partner rows guarantees delivery. This section supersedes earlier policies above, while preserving historical observations and release evidence.

- Change record: retain a concise complete release scope/feature/fix/dependency/test/recovery record. Exhaustive per-property AppSheet deltas and all-property PROD readbacks are optional. Exact affected model documentation, SQL manifests and necessary environment/guard/external-step evidence remain applicable.
- App modes: DEV/RC/PROD target Deployed; first-time/replacement deployment checks apply, with no repeat checks on already-Deployed apps. DEV/PROD scheduled business jobs execute; RC scheduled business execution is guard-blocked while enabled definitions remain suitable for App Upgrade. Notifications remain enabled with normal event conditions. No app was actually deployed by this documentation task.
- DEV delivery: prefer shared recipient expressions and DEV-only master-data overrides for owner/Lisa and other covered recipient sources. Reapply after every PROD-to-DEV DB restore before jobs resume; preserve/verify them for apps-only refresh. Do not put these environment-only data edits into a Flyway migration for PROD. Initial setup must reconcile existing hard-coded DEV owner recipient expressions once, rather than repeat mapping every promotion. Keep target PROD data and business recipient rules unchanged.
- Specific evidence: the recorded R008 revision-4 notification definitions select `Partners[Email]` and exclude the related payment's `Created By` email. Setting both rows to the owner email is valid when schema/dependencies permit, but if the owner created the payment, both rows are filtered out. Document that exact existing condition; do not claim delivery from master-data setup, alter audit fields, or remove PROD's exclusion without a separate behavioral decision. The evidence is dated configuration, not a fresh live audit.
- PROD validation: check upgrade provenance/versions, Deployed mode, basic sources/necessary substitutions, both editors, open/sync and representative changed entry points; verify guard outcome and applicable SQL/external steps. Reuse DEV tests and established notification routing. Broaden only for concrete risks/mismatches. Documentation closure across all registered Documents remains required.

Updated AGENTS, release/preparation/refresh/recovery procedures, tracker/inventory/difference guidance, documentation index/register, database guidance, helper/template instructions and manifest/mapping/checklist fields. The optional delta renderer now identifies itself as optional targeted verification. No model workbook, Flyway migration, Partner data, app definition/mode, bot state or live notification was changed; existing observed Prototype modes remain dated facts until an actual transition is performed.

Technical references: [scheduled event deployment requirement](https://www.appsheet.com/support/errormessages), [App Upgrade](https://support.google.com/appsheet/answer/10105386?hl=en) and [notification address/device resolution](https://support.google.com/appsheet/answer/11513089?hl=en). The documentation clarifies that using an email address as a push recipient does not convert the task to an email task.

Verification: 11/11 release-helper/document-register tests passed; both JSON templates parsed; 227 local links and 13 heading anchors passed; intended-file and whitespace diffs reviewed. Commit/push publication is recorded in the final task response. No live tests are appropriate for this documentation-only change. Recovery is a normal reviewed revert of the publication commit, preserving later work.

## Notification routing revision — owner decision, 19 September 2026

Starting commit: `0a399bd2044556ff087be0de922d02c4525e0f21`; working tree clean. This revision supersedes the master-data/shared-recipient approach above. The owner deferred creator-exclusion changes: DEV notification settings point directly to `welct0407@mw-credit.com`; RC restores production recipient configuration; PROD remains as production.

Updated AGENTS, preparation/refresh/promotion/recovery runbooks, current-policy notices in tracker/inventory/development differences, documentation index/checklist, database refresh guidance and release templates. Keep a compact DEV override → production configuration mapping; restore/read back copied overrides before RC freeze and reuse untouched routing evidence. No Partner email data edits, audit/identity changes, new release number, live app/DB changes or notifications are part of this documentation task. Deployment modes, scheduled guards, themes and other SDLC rules remain as previously agreed.

Rollback: revert only this task's documentation/template changes using the starting commit; no live rollback needed. Validation: focused policy/diff review passed; both JSON templates parsed, 222 local Markdown links and the renamed recipient-procedure anchor resolved; release-helper tests passed 11/11; git diff --check passed. No live tests required for this policy edit.
