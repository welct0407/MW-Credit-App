# R052 — DEV Google sign-in and Borrowers read checkpoint

Date: 7 October 2026. Status: implementation verified; live read deployment in progress. This is checkpoint 2A, not full OLTP parity or production readiness.

Owner accepted checkpoint 1B and darker separators, authorized continuation, and selected only welct0407@mw-credit.com for the first DEV pilot. The exact eight-resource Firebase/reader IAM plan was explicitly approved after automatic approval review requested scoped authorization. The owner enabled Google sign-in in Firebase; API readback confirmed it.

## Scope and rollback

Starting application commit: a3d21d5ffe6219bb4ec1caa78cf7b52e6bfa2952. Existing work preserved. Agent A designed the slice, B implemented, C independently tested. Separate live/synthetic entries, Google token verification/revocation checks, owner policy, unique Partner Login Email mapping, bounded read-only Borrowers API, in-memory browser sessions and accepted DEV styling are implemented. Collection/calculation parity, writes and offline persistence remain later work.

New infrastructure files manage Firebase web/auth configuration, dedicated read runtime identity and SQL IAM login, two Secret Manager containers, imported existing Google provider and a digest-gated new read service. The existing private readiness API and AppSheet continue unchanged. No business schema/row changes or financial writes. Shared SQL/GCS infrastructure is retained.

The applied foundation comprises 8 approved resources, followed by 2 credential containers and 1 existing Google provider import (only Terraform deletion handling changed). Existing OAuth configuration and Firebase SDK configuration were copied to version 1 of their dedicated secrets; no keys regenerated, no new runtime secret access. State/plans/recovery remain private outside Git. Browser SDK configuration is public client metadata; OAuth client secret is never bundled.

scripts/configure-dev-read-role.py prepares exact column SELECT privileges on DEV Borrowers (7 columns) and Partners (2 columns), with identity guards, before-ACL recovery snapshot and read-only/default timeout settings. Applied at 11:19 UTC with private before-ACL recovery snapshot. Readback confirms nine DEV column SELECT grants and zero PROD column grants; inherited PUBLIC CONNECT exists in both and is not changed. Source and database settings are independently recoverable; stop the new service before removing only introduced grants/settings using its private recovery instructions.

Rollback: restore the prior Hosting version/read image when deployed, preserve managed credentials, do not run terraform destroy against the shared project. The preexisting private API is unaffected. Runtime bootstrap admits only the verified Google owner email; after the first real login pin the observed Firebase UID, never fabricate one.

## Verification

Both frontend builds and independent mocked UI tests passed. C's 29 boundary tests cover configuration/token/policy/SQL/HTTP failures; the prior 42 unit checks also passed. See outputs/r052-auth-read/test-report.md. Marker guards prevent accidental cross-mode Hosting publication. Terraform formatting/validation passed. Public health does not query SQL. Actual owner sign-in and real Borrowers reads remain pending; mocked screenshots are explicitly labeled and contain synthetic records only.

Changed areas: apps/pwa live entry/styles, services/api read/auth modules, package lock, Vite/build/delivery configuration, tests/evidence, infrastructure/dev, privilege configuration tool and development guide. No changes to existing database migrations, AppSheet definitions, financial schedules, Metabase or Grafana.

## Agent D infrastructure completion checkpoint

D took infrastructure/miscellaneous execution under owner instruction; parent coordinates and reviews. Baseline for this batch: 24c198152e1987a2dbfd0acca67b47330fd76aab. New service creation succeeded at revision mw-credit-app-read-dev-00001-kmk. Domain-restricted sharing rejected allUsers membership; owner explicitly approved service-only Firebase authentication, then reviewed 0-add/1-change/0-delete plan applied invoker_iam_disabled false to true only. No organization policy or old API change.

Empty managed owner identity secret created (1 addition, no other changes), with explicit tracked bootstrap mode and numeric secret-version/fail-closed pinning support. No UID invented or set. Existing Google provider/Firebase SDK secrets and all state/plans/recovery stay private; Terraform state may contain OAuth payloads. Live SDK build passed. Prior Hosting version 911d3a1e1883b92c captured privately for rollback; live version c0872b1adcb4006f published after the unchanged prior CI rerun passed; corrected health image deployed. Actual owner sign-in/read and UID pin remain required before checkpoint completion.

Deployment readback: build 8acb768f-6fdc-448d-89c4-f214c135f030 succeeded from clean source18c3736; digest89f10f0398df19071601caf39df28dc4c26559c69ea0dd9af2d358615e0d8593 deployed to new read service revision00002-ln2 (Ready11:35UTC). Live Hosting versionc0872b1adcb4006f / release1791372927157000 published. Full72units passed. Initial CI desktop mocked timeout passed unchanged on one rerun; new source CI tracked separately. C owns final deployed smoke evidence. Real owner login/read and UID pin remain pending.

Independent live smoke passed: /health200/no-store, signed-out desktop/mobile show Google login with no records, browser errors, overflow or persistent storage. New-source CI desktop mocked first-case failure recurred; B/C investigate dev-server cold-start behavior. Prior unchanged rerun success is retained but does not close this recurrence. Real owner validation and UID pin remain pending.

Owner validation: owner reported 'Signed in; list and details work'. Exact-email Firebase lookup independently verified one enabled Google identity with verified email. Its actual UID was stored privately in managed owner-identity secret version1; tracked uid-pinned/version1 plan changed only new-service OWNER_IDENTITY_MODE and OWNER_FIREBASE_UID. Applied0add1change0destroy; revision00003-pzr Ready with pin readback. No token/UID/borrowerdata printed or committed. This reports owner-executed business reads, not agent-executed financial parity testing. Remaining checkpoint closure: B/C test-tooling fix and CI, final publication.

Test-tooling correction: B pinned Vite dependency scanning to each mode's actual entry and pre-bundles Firebase app/auth for live-dev. C isolated worker caches, added single-navigation assertion and concurrent synthetic/live verification. Four fresh-cache repeats and final two parallel-mode cases passed; no forced clicks or extended timeouts. Both builds passed. This changes dev/test tooling only; deployed API source/image remains18c3736/89f10f...8593, no rebuild required. Final GitHub CI follows this commit.

Final closure: exact source20358d1df83af2a90e45d921ba60e547325c507c CI37615986417 completed SUCCESS, independently checked by C. Owner live validation and actual UID pin complete; sanitized final evidence published. Checkpoint2A complete and team stops; full Phase2/R052 remain incomplete/Open. This final documentation-only commit reuses unchanged passing code/runtime evidence.
