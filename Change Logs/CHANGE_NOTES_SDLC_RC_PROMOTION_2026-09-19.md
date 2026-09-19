# SDLC redesign: immutable AppSheet RC promotion

Date: 19 September 2026. Status: methodology implemented; documentation/tool checks passed. No product release reserved and no live copy, refresh, deployment, database write, notification or app-mode change performed.

## Request and source

The owner requested implementation of `G:\My Drive\Loan Manager\Design Documents\AppSheet_SDLC_Promotion_Design.md`, with the additional rule that a DEV-to-RC copy takes the exact theme of its corresponding PROD app. Source SHA-256: `B41EED4B34CF25FC1B266BF64B3F98D7FD76CE7CFC365AD6ACF5614DBA4B0162`. The design was read as process requirements, not authorization to execute its example releases/commands. The source file was not modified or duplicated into the repository.

Starting Git commit: `ce328b77edb88e767c4cabde7267770c14230155`. Existing unrelated `outputs/r008-20260918/production-correction/` and `scripts/releases/audit-r008-production.mjs` were preserved/excluded. Prior release histories, model workbooks, live environment facts, Flyway migrations/runners and unrelated project rules remain unchanged.

## Implemented process

- [AGENTS.md](../AGENTS.md) directs all future development/promotion, including unfinished work in an existing release, through integrated DEV → prepared PROD-mapped RC → immutable final version → App Upgrade into existing PROD IDs. Manual recreation is restricted to explicitly authorized emergency recovery with reconciliation.
- [Release Workflow](../Documents/Release_Workflow.md) is rewritten around gates A–F: integrate/test, capture, compatible Flyway promotion, complete source mapping and per-app PROD theme substitution, RC validation/freeze, authorized upgrade, independent PROD validation and documentation/publication closure.
- [Release Recovery](../Documents/Release_Recovery_Runbook.md) separates app restore, partial two-app deployment, compatible additive SQL, forward fix and destructive backup recovery; covers hotfix reconciliation and RC retention.
- [Templates/field guide](../scripts/releases/templates/README.md) supply a machine-readable manifest, complete per-table mapping/substitutions, test evidence and checklist. The existing delta remains exact completeness/readback evidence; the helper's generated instructions now explicitly require RC App Upgrade. No new automated deployment/semantic-readiness validator is claimed.
- [DEV preparation](../Documents/Development_Environment_Preparation.md), [DEV refresh](../Documents/Development_Refresh_Runbook.md) and [database procedure](../database/README.md) distinguish DEV isolation from production-capable RC containment, preserve active candidates during refresh and apply expand/contract before App Upgrade. Existing Flyway runner pins/checks remain intact.
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
