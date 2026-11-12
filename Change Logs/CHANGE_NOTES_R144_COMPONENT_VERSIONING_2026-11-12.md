# Change notes — Component versioning (R144), 12 November 2026

## Purpose
Owner request of 12 November 2026: "Engage the team and implement all your recommendations". `Rnnn` stays the one ecosystem number; each component's version becomes the last `Rnnn` that changed it plus its own counter, with a registry, a closure-time derivation, self-reporting services and a read-only drift check. No SQL, no live action.

## Changes
- Registry `scripts/promotion/components.json` (Dewey; fields in its `fields` object; seed as of R143) and `scripts/promotion/component-versions.mjs` (Byte): `derive`, `render`, `check-source`, `drift`. API roles reuse `genericRoleClosures` and `genericChangedRoles` from `deploy-business-hosting.mjs`.
- Images (Forge): `Dockerfile` ARG/ENV `MW_RELEASE_NUMBER` (default `dev`) and `MW_SOURCE_COMMIT` (default `unknown`), placed last. `cloudbuild-command.yaml` (DEV) defaults `dev` and `unknown`. `cloudbuild-business.yaml` (PROD) refuses to build unless `_MW_RELEASE` matches `^R\d{3}$` and `_MW_SOURCE_COMMIT` is 40 lowercase hex. `cloudbuild.yaml` and the legacy `cloudbuild-foundation.yaml` are unchanged, so any image they build reports `dev` and `unknown`. R144 rebuilds every API image at promotion because the Dockerfile and Cloud Build files are image inputs.
- Self-reporting (Byte): API `/health` adds `release` and `commit`; agent `/ready` and `/healthz` add them; `integration-agent/scripts/deploy-runtime.py prepare` writes `code_release`.
- Grafana: dashboards regenerated through `project/scripts/monitoring/dashboards/lib.cjs` with `DASHBOARD_RELEASE = 'R144'` and the tag `release:R144`. A later release that changes a dashboard must bump it; `check-source` enforces it. Applying it to the single PROD Grafana waits for promotion.
- Metabase: `project/scripts/metabase/Stamp-Release.mjs` (`--check` default; `--apply` is a PROD write, deferred).
- `.github/workflows/release-tag.yml` appends a "## Component versions" table to the Release notes (warns and still publishes if the derivation fails). Tags and GitHub releases are otherwise unchanged.
- Records (Dewey): `Release_Tracker.md` (R144 scope), `Release_Workflow.md` (component versions section), `scripts/promotion/README.md`, `Environment_Inventory.md` (generated block markers), `docs/Development.md`, `docs/Development_PWA_Delivery.md` (DEV build substitutions), `project/scripts/releases/templates/promotion-checklist.md` (PROD build substitutions), `project/scripts/monitoring/README.md`, `database/README.md`, `integration-agent/docs/OPERATIONS.md` and the [integration agent note](../integration-agent/Change%20Logs/CHANGE_NOTES_R144_AGENT_RELEASE_REPORTING_2026-11-12.md).
- Documents checked and unchanged: Solution Design, PWA Data Model, Data Dictionary (no schema or data change), Resource Monitoring and its Dashboard Guide (panels unchanged), Events Bridge, Service/account Mapping.

## Checks
| Command | Result |
| --- | --- |
| `npm run lint`, `npm run typecheck` (Byte, commit `080486f8`, tree `6e6493c4`) | Pass |
| `node --test` on the 14 affected unit files (Byte, same tree) | Pass, 256 pass, 0 fail |
| `component-versions.mjs check-source` and `render --check` (Byte, same tree) | Pass: 5 dashboards carry `release:R144`; render ok |
| Agent `ruff`; unittest `deploy_runtime` 24, `server` 16, `chat_relay` 20, `receipt_recognition` 81, `config` 18 (Byte, same tree) | Pass, all OK |
| Three YAML files parse; PROD build guard on bad input (Forge) | Pass: refused 7 bad inputs, including unset defaults and quote injection |
| `release-tag.yml` publish step, stub-tested (Forge) | Pass: appends the table; on failure warns and still publishes |
| `npm run test:monitoring`; `business-hosting-delivery` and `package-manifest` tests (Forge) | Pass; 139 of 139 |
| Live GET, read-only (Byte and Forge, 12 November 2026) | Pass: read, command and chat `/health` 200 unauthenticated in DEV and PROD, notify 403, jobs 404; `drift --env all`: 0 drift, 18 unverified (the deployed images predate R144); Metabase v0.63.18.1 and Grafana 13.4.0 recorded as the vendor seeds |
| Adversarial review against Archie's plan (Chase, same tree) | Pass (Chase, commit `080486f8`, tree `6e6493c4`): hostile `MW_RELEASE_NUMBER` and `MW_SOURCE_COMMIT` (injection, newline, 5000 characters, uppercase) fall back to `dev` and `unknown` in `buildInfo` and to null in the agent `build_identity`; `drift --strict` exit 2 with 10 unverified, an invalid `--env` or unknown release exit 3; GET only (redirect error, 2 MB cap, 15 s timeout), no token or environment printed; `Stamp-Release` refuses every mutating invocation without `--apply` and a valid `--release`; `generic-roles` extraction byte-identical (`business-hosting-delivery.test.mjs` lines 2473 and 2457); `business-candidate.mjs` exact-key validator serves only `mode:'business'` manifests, not the generic kind; `debian-health.py`, `deploy-shared-receipt-api.py` and the Grafana bridge assert no exact health body; `release-tag.yml` inputs env-quoted, tag validated, `fetch-depth: 0`, `publish_only` covered; the PROD build guard cannot be bypassed by defaults. Findings: two low and one info, all fixed in this batch (Byte: git argument hardening in `component-versions.mjs`; Forge: release token kept out of the derive step; Dewey: full-clone note). |
| Re-check after the `--commit` hardening (Byte, tree `1ee24b98` = `911d154b` plus the test): `npm run lint`, `npm run typecheck`, `node --test tests/unit/component-versions.test.mjs` | Pass, 8 of 8 |
| `npm run check:docs` (Dewey) | Pass, 0 failures, 0 warnings |
| CI on the pull request | Pass: `Development checks` run 43186898321 on `f1caa91b` (package tree `7f9d4087`, identical to merge `51ba52d3`) |
## Not run
Live Cloud Build submit, the agent `--release` on the real host, Docker build (no daemon here) and `Stamp-Release.mjs --check` (needs the Metabase admin key). Deferred to promotion, not authorized in this batch: image builds and deployments, the Debian agent deploy, the Grafana apply, `Stamp-Release.mjs --apply` and the first live `drift` run. Until then the live services report no release and drift reads them as unverified.

## Recovery
Git baseline `055e25fe` (R143). Nothing live changed; revert the pull request.

## Open questions
Seed fact not verified from a live target: the Metabase last-changed release (R137 from tags). notify and jobs seed R130 (verified by Byte against tags; R134 and R135 changed only package.json scripts).

## Remaining work
Owner acceptance in PROD. R145 candidate: `drift` refuses to run between the tag and the closure pull request (it reads the Open release from the tracker and finds it already tagged); see the Deviations below and Development Changes.

## PROD promotion record (Forge, 12 November 2026 UTC)
Authority: the owner's instruction of 12 November 2026, "Merge and promote R144 to production", relayed by the orchestrator as the scoped PROD approval for R144: builds, the DEV and PROD images-only applies, the agent deploy, the Grafana apply, the Metabase stamp and the technical records. No SQL, so no backup and no owner window. No payment, notification or job was forced and no financial or borrower data was written. No secret value, token or borrower data appears here. Pins are in the [environment inventory](../project/Documents/Environment_Inventory.md).

| Step | Result |
| --- | --- |
| Freeze | 09:16Z; package `51ba52d36d9f5a1bd13960fd31b2b2919acfd70a` (merge of PR #293, tree `7f9d4087` equal to the tested head `f1caa91b`, `Development checks` run 43186898321). Baseline R143 `055e25fe`. Changed: all five API images (Dockerfile and Cloud Build files are image inputs), the agent, the Grafana dashboards, the Metabase stamp; no SQL, no PWA and no Terraform source change. Next unused number R145 (opened by the closure pull request) |
| Target | Project `clever-oasis-508610-n7`, instance `mw-credit-pg-20261017`, databases `loan_manager_dev` and `loan_manager_prod` (not touched), services `mw-credit-app-*-dev` and `mw-credit-app-*-prod`, registries `mw-credit-app` (DEV) and `mw-credit-app-prod`, state `mw-credit-app-tfstate-737787224638` and `mw-credit-app-prod-tfstate-737787224638` (prefixes `application` and `grafana`), host `vm-mw-credit-agent`, Grafana `monitor.mw-credit.com`, Metabase `reports.mw-credit.com` collection 10 |
| DEV image | Cloud Build `e9f5e1f1-bcf2-4245-9d02-873b0c4f9ea9` (`cloudbuild-command.yaml`, `_MW_RELEASE=R144`, `_MW_SOURCE_COMMIT` the package), SUCCESS 09:18:28Z, digest `sha256:35bd60fe9fb21862b2cb13c13a4d0f1fce62c196211f6ede9c10859b56997189` |
| DEV apply | Plan 0 add, 5 change, 0 destroy, image only on read, command, chat, notify and jobs (plan JSON compared field by field), applied 09:19:37Z to 09:20:13Z, re-plan clean, activation published. `/health`: read, command, chat and (with an identity token) notify report R144 and `51ba52d3`; jobs serves no `/health` through its front end (404 even authenticated) and runs the same digest |
| Baseline capture (PROD) | 09:21:35Z: read `00055-sq2`, command `00060-mtz`, chat `00039-9px` on `848b26b9...` (R141); notify `00029-2nb`, jobs `00029-9dp` on `f8cb243b...` (R130); settings generation `1794406264137132`; Hosting `854b64df2b836f27` (R142); Flyway 145 |
| PROD image | Cloud Build `b1e4786b-7831-4d54-b5cb-7e8b857fdc9b` (`cloudbuild-business.yaml` as `mw-credit-app-build-prod`; the release guard step passed), 09:22:13Z to 09:22:49Z, digest `sha256:63e5b48ffb983178a47e7eec08cd2553a3da4afe2c47b08c887c4d7b0d05cfbd` |
| SQL | None; DEV and PROD stay at Flyway 145 (read back as `codex-cloud-read`) |
| PROD apply | Plan 0 add, 5 change, 0 destroy, `template.containers.image` only on the five `mw-credit-app-*-prod` services (plan sha256 `b76aa5e7...`, JSON `bb3e1877...`), applied 09:25:31Z to 09:26:06Z, settings generation `1794475576840235`, re-plan clean. Revisions read `00056-82h`, command `00061-d9h`, notify `00030-285`, jobs `00030-29l`, chat `00040-2f7` |
| Hosting | Not deployed: the PWA did not change in R144 (it stays R142, `854b64df2b836f27`) |
| Agent | `51ba52d3`, see the [agent note](../integration-agent/Change%20Logs/CHANGE_NOTES_R144_AGENT_RELEASE_REPORTING_2026-11-12.md#deployment-forge-12-november-2026-utc) |
| Grafana | Plan 0 add, 5 change, 0 destroy: `spec.tags` gains `release:R144` on the five dashboards, nothing else in the specs (provider metadata annotations and version are computed); applied 09:31:23Z to 09:31:37Z, re-plan no changes |
| Metabase | `Stamp-Release.mjs --check` stamp null, `--apply --release R144` 09:32:05Z (changed, read back), `--check` stamp R144. The previous collection description is kept privately outside Git |
| Smoke (read-only) | PROD `/health` 200 on read, command and chat with release R144 and `51ba52d3`, notify with an identity token; `lm.mw-credit.com` 200; no ERROR logs on the DEV or PROD services after the applies |
| Tag | `R144` on `51ba52d3`, Release tag workflow on `main`, GitHub Release published 09:34:37Z with the "## Component versions" table |
| Drift | `component-versions.mjs drift --env all --observed <private file> --strict`: 0 drift, 0 unverified (16 match, 5 vendor info). Credentialed facts were read read-only: notify `/health` with an identity token; jobs from its Cloud Run digest and the Cloud Build substitutions (same digest as notify); Flyway heads and `vendor-postgresql` as `codex-cloud-read` and `gcloud sql instances describe`; agent `/ready` over IAP SSH; Grafana tags with the provisioning token held in process; Metabase stamp from `--check` |
| Rollback | DEV: private `dev.activation.before-r144.tfvars`, plan and publish. PROD: settings generation `1794406264137132` (the private `production.activation.before-r144.tfvars`), plan 0/5/0 and publish. Grafana: revert `DASHBOARD_RELEASE` and apply. Metabase: restore the saved description. Agent: `deploy-runtime.py rollback`. No SQL |

### Deviations
- The generic promotion runner (`deploy-business-hosting.mjs`) was not run: its apply step is the Hosting deploy, and the PWA did not change. The images went through the reviewed images-only Terraform plans, checked against the generic kind's plan rule (only `template.containers.image` on the five services) by a JSON comparison of each resource.
- `drift` refuses to run between the tag and the closure pull request ("the Open release R144 is already tagged"), because it reads the Open release from the tracker at the commit. The 0/0 result came from a throwaway local clone with the tracker set to R145 Open (local commit only, deleted afterwards); after the closure pull request opens R145 it runs as documented. Pre-tag, with PROD expected at R143, the same facts gave the expected 8 drift and 0 unverified.
- No `keep-r144-runtime` tag was added to the images (the convention lapsed after R118); the rollback digests are within the registry's newest-20 and 30-day retention.

### Limitations
- No authenticated PROD read beyond `/health` (no sanctioned PROD token route), financial write, notification or job. Owner acceptance pending.
- The jobs service's `/health` is not reachable through its front end, so its release is inferred from its digest.

### Tag and closure record
Tag `R144` on `51ba52d3` by the Release tag workflow, run [43192592368](https://github.com/welct0407/MW-Credit-App/actions/runs/43192592368) (`workflow_dispatch` on `main`, 12 November 2026 09:34Z, success), GitHub Release published with the "## Component versions" table. The freeze pin, this record, the tag record and the prune are one records-only closure pull request.

### Prune at closure
Change notes outside the retention window deleted (inbound links repointed to commit `de281f3b`): `Change Logs/CHANGE_NOTES_R141_TAPPABLE_PENDING_EXPENSE_LINES_2026-11-11.md` and `integration-agent/Change Logs/CHANGE_NOTES_R135_REVIEW_RESEND_HOLDS_2026-11-08.md`. No Development Changes section existed for R144. No evidence directory was removed.
