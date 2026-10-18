# Open development changes

**R074 is Open**; R073 is Released (see the [release tracker](Release_Tracker.md#current-development-release)). Released releases have no section here: each tracker row links its record at a commit permalink, and the release tags mark the packages. Current runtime pins and recovery evidence live only in the [environment inventory](Environment_Inventory.md).

| Outstanding work | Owning reference |
| --- | --- |
| Deferred Collection Note concern | Unchanged by released R059; a separate owner-directed correction remains pending |
| Carried operational credential migration | R055 remains Frozen; paused work is unfinished |
| Apple push enrollment follow-up | R056 V91 deployed; Lisa retry/closure remains pending |
| Owner license action | AppSheet technical retirement complete; license revocation unconfirmed |
| Grafana revamp: alert coverage for PWA APIs, workers, Cloud SQL disk and backups; every ALL-MON item (including ALL-MON-03 checks) is a line of this entry | Pending future release (review ALL-MON-01); no alert rules applied in R063 |
| Agent migration V5 (indexes on `runtime.operation_state(last_event_id)` and `runtime.job_runs(operation_id)`) | Recommended, not written |
| Promotion runner full-CI gate requires one run with executed terraform and e2e; the CI reuse step skips them, so R073 needed a forced dispatch (39118014759). Let the runner accept the reuse-evidence chain | Future release tooling |
| Repository merge follow-ups (15 October 2026) | [Change note](https://github.com/welct0407/MW-Credit-App/blob/4a14d07/Change%20Logs/CHANGE_NOTES_REPOSITORY_MERGE_2026-10-15.md) |

Use the [release tracker](Release_Tracker.md), including the carried R016 administrative follow-up. Current runtime versions belong in [environment inventory](Environment_Inventory.md). Update this page for actual outstanding work, not completed-release history.

## R073 production promotion

- **Authority and scope.** Owner instruction, 18 October 2026 (Bangkok): "Move to prod" for R073. Scope: PROD Hosting only. The PROD runtime stays R069 (four Cloud Run services unchanged), SQL stays V95 with no migration, nothing changes on Debian, and no database backup is needed (UI only).
- **Contents.** The offline refresh fix from [PR #60](https://github.com/welct0407/MW-Credit-App/pull/60): a focus or the 30 s poll landing between two records segments now joins the running cycle instead of re-queuing finished domains (`apps/pwa/src/offline-dataset.ts`, `tests/e2e/offline-delta-independent.spec.ts`; [change note](../../Change%20Logs/CHANGE_NOTES_OFFLINE_DELTA_GAP_2026-10-18.md)). The About e2e now reads `release.ts`. The R072 closure (records, prune, `release.ts` R073) is in the same source. No data impact: only duplicate read-only refreshes were removed.
- **Owner DEV check.** The offline fix was on DEV through PR #60 before the instruction; the owner's PROD device check is pending (see Not verified).
- **Freeze and pins.** Tracker commit `d57fb7d` (R073 Frozen, R074 Open, R075 next unused; merged as PR #61). Source and artifact source `042359b585e132cb20e3f0785320c285addc7a1e` (`main` after PR #61); delivery tool the same commit (runner R073 contract); source baseline R072 `378c348`. Deployment pins are in the [environment inventory](Environment_Inventory.md).
- **Checks.** Forced full Development checks run 39118014759 (workflow_dispatch on `042359b`; every job succeeded, including Terraform and the three e2e shards). The pull request runs reuse the evidence chain and skip those stages, so the runner's full-CI gate needed this forced run (see Outstanding work). Database migrations 39108361163 on `c21884a` (database inputs unchanged). PR #60 run 39113397874 and PR #61 run 39116268119, both green. Read-only PROD verify at 10:05:20Z as `codex-cloud-read`: `loan_manager_prod` at V95, nothing pending, 0 writes. No migration and no backup needed.
- **Artifact and apply.** Package SHA256 `142886239de9225f37f0c9ac2b9625975a668d8f63b22823c581dd89ed7ad802`; `--apply` as `mw-credit-unattended-admin` (signed impersonation proof) at 10:16:47Z 18 October 2026 (17:16 Bangkok), 15 files. Version, release, public version and entry are in the inventory.
- **Smoke (read-only, 10:17Z).** 15 of 15 files byte-identical on `lm.mw-credit.com` and the `web.app` host; `/`, `sw.js`, `build-version.json` and the manifest `no-store`; CSP, nosniff and `X-Frame-Options: DENY` present. The R069 runtime is unchanged (read, command, notify and jobs services each at 100%, revisions as in the inventory); no PROD Cloud Run errors since 10:16Z.
- **Tag.** Release tag workflow run 39118675481 succeeded: annotated tag `R073` (object `8bb2663`) on `042359b` and the GitHub Release are published.
- **Recovery.** Hosting only: publish a new release of the previous R072 PROD version listed as rollback in the [environment inventory](Environment_Inventory.md). No database, runtime or agent rollback is involved.
- **Not verified.** The owner's device check on PROD, and the next natural PROD update clearing old caches.
- **Release number.** `apps/pwa/src/release.ts` stays `R073` in the artifact; the closing change bumps it to `R074`.
- **Documents updated.** Release tracker (R073 Released, tag `R073`), Environment inventory (PROD Hosting row and date line), this record and its Outstanding work row.
- **Deletions at closure (prune).** Development Changes section deleted: this R073 production promotion record (reachable by the permalink in the tracker and inventory). Change notes: none deleted; the window (R074 Open; R073, R072, R071 Released) keeps `CHANGE_NOTES_OFFLINE_DELTA_GAP_2026-10-18.md`, `CHANGE_NOTES_CI_EVIDENCE_REUSE_2026-10-18.md`, `CHANGE_NOTES_PWA_TEAM_ROSTER_2026-10-18.md` and `CHANGE_NOTES_W6_DOCUMENTATION_2026-10-17.md`; the two Wave 4 notes and the three agent notes stay because current documents link them. Evidence deleted: none.

## Current operation

The owner accepted the core operational/management flows and subsequent UI release. Native PWA/API payment receiving, Debian agent API integration, receipts, notifications, scheduled jobs and monitoring are deployed. R058 agent delivery attempts authorized Instagram sends without a local window gate and permits automatic email only after an explicit provider messaging-window rejection. Production is https://lm.mw-credit.com and DEV is https://dev-lm.mw-credit.com. Runtime identities and verified versions belong in the [environment inventory](Environment_Inventory.md). AppSheet technical retirement is complete; the owner license action remains separate. Natural business observations and the Lisa push retry retain the limits in their owning release evidence; documentation cleanup does not establish fresh live acceptance.

## Delivery tooling status

Source inspected **18 October 2026**. This policy changes no product workflow or validator; implementation limits remain explicit:

| Tool | Actual constraint |
| --- | --- |
| App `ci.yml` | Since 16 October 2026 a `changes` job routes each run: PRs run typecheck/unit/build when app files change, Terraform validation when `infrastructure/**` changes, and the full Playwright suite (three parallel shards, one CI retry with trace, artifacts kept 7 days) when the PWA, specs, Playwright/Vite config or lockfile change. Main pushes are classified the same way from the pushed commit range (a first push or an unreadable range selects everything); manual dispatch selects every stage unless `force` is set. Since 18 October 2026 every selected stage passes through `scripts/ci/reuse-evidence.mjs`: a stage that already passed on this commit, a parent or an earlier head of the branch with identical stage-relevant files is skipped and the step summary links the run with the evidence ([change note](../../Change%20Logs/CHANGE_NOTES_CI_EVIDENCE_REUSE_2026-10-18.md)). Documentation-only PRs and merges post the `Development checks result` status without running stages; that status is required on `main` since 16 October 2026. The `ci:checkpoint` label is retired. |
| `database.yml` | Push-only trigger (one run per head commit, visible on the PR); `guards` on Linux, then the four `Test-CI.ps1` groups as parallel jobs on ubuntu-latest (manual dispatch can choose windows-latest). Triggered also by `services/**`, `tests/integration/**` and `scripts/rehearsal/**`; since 18 October 2026 Markdown never triggers it and the same reuse step skips the groups when they passed on identical database inputs (same commit on another branch, a parent, an earlier head); a Windows dispatch always rebuilds. |
| `agent-tests.yml` | Integration agent tests (formerly the agent repository's `ci.yml`); path-filtered to `integration-agent/**` (Markdown excluded) with the same reuse step since 18 October 2026, so the merge of a tested PR into `main` does not repeat the suites. |
| `grafana-mcp-bridge.yml` | Path-filtered to `project/scripts/monitoring/...`. |
| Integration shared deployment helper | Receiver lifecycle/readiness correction is source tooling for R059; the existing R058 receiver was repaired by restart on 14 October at 18:43 Bangkok. No new runtime package was deployed for this repair. |
| Legacy foundation/business/R053 validators | Retain historical full-browser/manual-dispatch receipt requirements; they do not implement general proportional check selection. |

Required checks/guards remain effective. Report a concrete conflict once; update the owning tool through a scoped tested change rather than bypass it or fabricate receipts. Affected-input routing and duplicate-run suppression are in place (above); useful future tooling work is deployment consuming existing evidence. These tooling gaps do not add another documentation gate.
