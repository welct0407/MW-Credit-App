# Open development changes

**R072 is Open**; R071 is Released (see the [release tracker](Release_Tracker.md#current-development-release)). Released releases have no section here: each tracker row links its record at a commit permalink, and the release tags mark the packages. Current runtime pins and recovery evidence live only in the [environment inventory](Environment_Inventory.md).

| Outstanding work | Owning reference |
| --- | --- |
| Deferred Collection Note concern | Unchanged by released R059; a separate owner-directed correction remains pending |
| Carried operational credential migration | R055 remains Frozen; paused work is unfinished |
| Apple push enrollment follow-up | R056 V91 deployed; Lisa retry/closure remains pending |
| Owner license action | AppSheet technical retirement complete; license revocation unconfirmed |
| Grafana revamp: alert coverage for PWA APIs, workers, Cloud SQL disk and backups; every ALL-MON item (including ALL-MON-03 checks) is a line of this entry | Pending future release (review ALL-MON-01); no alert rules applied in R063 |
| Agent migration V5 (indexes on `runtime.operation_state(last_event_id)` and `runtime.job_runs(operation_id)`) | Recommended, not written |
| Repository merge follow-ups (15 October 2026) | [Change note](https://github.com/welct0407/MW-Credit-App/blob/4a14d07/Change%20Logs/CHANGE_NOTES_REPOSITORY_MERGE_2026-10-15.md) |

Use the [release tracker](Release_Tracker.md), including the carried R016 administrative follow-up. Current runtime versions belong in [environment inventory](Environment_Inventory.md). Update this page for actual outstanding work, not completed-release history.

## R072 About screen

Owner approval 17 October 2026: a read-only About screen in the PWA. PWA only; no API, database, infrastructure or service change. Six-agent process: A, B, C, D, E; F not applicable.

- **Outcome.** Menu drawer and sidebar entry "About" ("เกี่ยวกับ", next to Notifications, signed-in only, a top-level view like Notifications) shows: release number (`apps/pwa/src/release.ts`, `R072`; non-PROD builds show "R072 · in development"), running build version (24-hex public version read from the controlling worker with the existing `GET_BUILD_VERSION` message; "Unavailable" without a controller), source commit (7-character git SHA injected by `vite.config.ts` define `__SOURCE_COMMIT__`; `unknown` without git), update status with the existing Update and reload button, environment and host, signed-in email (screen only), access (can record payments or read-only), app mode, connection, waiting-to-sync count with Review saved changes, language, and a Copy details button (plain text, no email or borrower data).
- **Paths.** New: `apps/pwa/src/About.tsx`, `about-details.ts`, `build-version.ts`, `release.ts`; tests `tests/unit/about-details.test.mjs`, `tests/unit/release-constant.test.mjs`, `tests/e2e/about-independent.spec.ts`. Edited: `live-main.tsx`, `live/LiveHeader.tsx`, `Icon.tsx`, `live-style.css`, `env.d.ts`, `vite.config.ts`, `tests/unit/production-build-environment.test.mjs`. A unit test pins `release.ts` to the Open row of the [release tracker](Release_Tracker.md#current-development-release); the Open and Frozen update bumps it ([Release workflow](Rules/Release_Workflow.md#release-scope-freeze-and-number-handoff)).
- **Owner decisions.** Excluded: build timestamp, release notes, health call and service URLs. Accepted consequence: the public build version changes with every commit because the commit is compiled into the bundle, so a redeploy after a documentation-only commit also offers phones an update, and input-equivalent build reuse across commits no longer applies to the frontend bundle ([PWA orchestration](Rules/PWA_Orchestration.md#evidence-reuse-and-exact-candidate-identity)).
- **Checks.** 17 October 2026, local, uncommitted batch: typecheck pass; lint 0 errors, no new warnings in changed files; unit 591/591; `build` and `build:live-dev` pass; `check:docs` 0 failures; e2e on the 30 specs touching navigation, account controls, header or sidebar (including `about-independent`, `live-read`, `pwa-canonical`, `w5-ux-independent`) 461 passed, 7 skipped, both projects. Testing found the extra button overflowed the 1280×800 desktop sidebar (`w5-ux-independent`); fixed by an icon-only About beside the language choice in the expanded sidebar, test unchanged. UX review ABOUT-UX-01 to 21 passed or applied (18, the unstyled `aria-current`, matches Notifications and stays open). iPhone Home Screen visual pass not done; 430px browser captures only.
- **Documents updated.** Development Changes, Release workflow, PWA orchestration and PWA delivery. Tracker, Solution Design, data model and dictionary need no change (UI-only, no view inventory exists).
- **DEV delivery.** Owner-requested 17 October 2026 with [PR #56](https://github.com/welct0407/MW-Credit-App/pull/56). Source `b140c90` built in a clean worktree and deployed with `scripts/deploy-hosting.mjs --live-dev` after `--check`; pins in the [environment inventory](Environment_Inventory.md). Both hosts serve public `36a64d594eb211146cbbae4f` (no-store) and the entry contains `R072` and `b140c90`. A signed-in smoke on DEV was not possible from the cloud session (Google sign-in).
- **Recovery.** `git revert` the commit; DEV Hosting rollback to the R071 version named in the [environment inventory](Environment_Inventory.md) by redeploying the reviewed `94cbfa5` build, whose worker serves the update.

## Current operation

The owner accepted the core operational/management flows and subsequent UI release. Native PWA/API payment receiving, Debian agent API integration, receipts, notifications, scheduled jobs and monitoring are deployed. R058 agent delivery attempts authorized Instagram sends without a local window gate and permits automatic email only after an explicit provider messaging-window rejection. Production is https://lm.mw-credit.com and DEV is https://dev-lm.mw-credit.com. Runtime identities and verified versions belong in the [environment inventory](Environment_Inventory.md). AppSheet technical retirement is complete; the owner license action remains separate. Natural business observations and the Lisa push retry retain the limits in their owning release evidence; documentation cleanup does not establish fresh live acceptance.

## Delivery tooling status

Source inspected **14 October 2026**. This policy changes no product workflow or validator; implementation limits remain explicit:

| Tool | Actual constraint |
| --- | --- |
| App `ci.yml` | Since 16 October 2026 a `changes` job routes each run: PRs run typecheck/unit/build when app files change, Terraform validation when `infrastructure/**` changes, and the full Playwright suite (three parallel shards, one CI retry with trace, artifacts kept 7 days) when the PWA, specs, Playwright/Vite config or lockfile change. Main pushes are classified the same way from the pushed commit range (a first push or an unreadable range runs everything); manual dispatch runs every stage. Documentation-only PRs and merges post the `Development checks result` status without running stages; that status is required on `main` since 16 October 2026. The `ci:checkpoint` label is retired. |
| `database.yml` | Push-only trigger (one run per head commit, visible on the PR); `guards` on Linux, then the four `Test-CI.ps1` groups as parallel jobs on ubuntu-latest (manual dispatch can choose windows-latest). Triggered also by `services/**`, `tests/integration/**` and `scripts/rehearsal/**`. |
| `agent-tests.yml` | Integration agent tests (formerly the agent repository's `ci.yml`); path-filtered to `integration-agent/**`. |
| `grafana-mcp-bridge.yml` | Path-filtered to `project/scripts/monitoring/...`. |
| Integration shared deployment helper | Receiver lifecycle/readiness correction is source tooling for R059; the existing R058 receiver was repaired by restart on 14 October at 18:43 Bangkok. No new runtime package was deployed for this repair. |
| Legacy foundation/business/R053 validators | Retain historical full-browser/manual-dispatch receipt requirements; they do not implement general proportional check selection. |

Required checks/guards remain effective. Report a concrete conflict once; update the owning tool through a scoped tested change rather than bypass it or fabricate receipts. Useful future tooling work is affected-input routing, duplicate-run suppression and deployment consuming existing evidence. These tooling gaps do not add another documentation gate.
