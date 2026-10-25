# Change notes — R099 hotfix: Grafana MCP Events bridge SDK redeploy, 25 October 2026

## Purpose
PR #162 (merged as `8cc81c7`) pinned the bridge's `@modelcontextprotocol/server` 2.2.0 to 2.4.0 and `zod` 4.3.6 to 4.6.7 for GHSA-jm63-cq47-j5jp, GHSA-46jr-4wx8-v453, GHSA-rvq5-wwqv-78pq and GHSA-mrhx-c7xc-m3w5. This batch puts that code in production. Owner instruction, 25 October 2026: "redeploy the Grafana bridge to production"; classified as an R099 production hotfix ([release workflow](../project/Documents/Rules/Release_Workflow.md#failure-and-hotfix)).

## Changes
- `infrastructure/ecosystem-bridge/builder-iam.tf` (new): `roles/artifactregistry.writer` for `mw-credit-app-build-prod` on the `mw-monitoring` repository only. Owner decision of 25 October 2026 (option 1), because no established builder could push bridge images and the default Cloud Build identities are unusable (the legacy account is refused as a build identity; the compute default has no roles).
- Bridge image built from `main` `d428e04` with Cloud Build as `mw-credit-app-build-prod`; the build's container check confirmed server 2.4.0, zod 4.6.7, `dist/main.js` present and a non-root user. Tagged `keep-grafana-events-d428e04`.
- `infrastructure/ecosystem-bridge/owned.tf`: the bridge image digest and the pinned traffic revision. The two zero `scaling` utilization values were removed from the template: the first image apply failed with `400 ... At least one of cpu_utilization and concurrency_utilization must be enabled`, and omitting them gives the same plan (image only) and the same live configuration.
- `infrastructure/ecosystem-bridge/README.md`: the IAM exception and the image update procedure.
- `project/Documents/Environment_Inventory.md`: the bridge row and the keep-tag table. Pins are only there.
- No change to secrets, OAuth, networking, Scheduler, Firestore or other services. No data change.

## Checks
| Command | Result |
| --- | --- |
| `terraform plan` (ecosystem-bridge, baseline) | No changes |
| `terraform fmt -check`, `terraform validate` | Pass |
| IAM plan and apply | Plan 1 add, 0 change, 0 destroy (that one member only); applied 12:08:38Z to 12:08:57Z; repository policy readback shows the one binding |
| Cloud Build `84619db4-e782-4be7-8468-2f75c6d33a99` | SUCCESS 12:09:13Z to 12:09:55Z; container check `{"server":"2.4.0","zod":"4.6.7","dist":true,"uid":1000}` |
| Image plan and apply | Plan 0/1/0, image only; applied 12:13:03Z to 12:13:29Z; new revision Ready with no traffic |
| Revision configuration diff (old against new) | Equal except the image; the new revision also lists four default annotations with the same effective values (min 0, CPU throttling, ingress all, no session affinity) |
| Traffic plan and apply | Plan 0/1/0, traffic revision only; applied 12:14:21Z to 12:14:45Z; 100% on the new revision |
| `GET https://alerts.mw-credit.com/health` | 200 `{"status":"ok"}` |
| Startup logs | Startup probe passed on the first attempt, `bridge_started`, no ERROR |
| Natural Scheduler tick | `/internal/dispatch` 200 at 12:15:02Z on the new revision |
| `terraform plan` after the applies | No changes |
| Bridge CI (`grafana-mcp-bridge.yml` offline-security, both Docker builds) | Pass on PR #162 (cited, not repeated) |

## Not run
- `get_bridge_health` over `/mcp`: it needs an owner OAuth token; `/health` was used instead.
- Synthetic alerts, subscriptions or notifications: out of scope.
- Four browser GETs to `/` and `/favicon.ico` at 12:14:41Z returned 400 (not routes; not from this session). Not investigated further.

## Recovery
Set the `owned.tf` image back to the previous digest and the `traffic` revision back to the previous revision (both in the [Environment inventory](../project/Documents/Environment_Inventory.md)), then plan and apply in `infrastructure/ecosystem-bridge`. The previous image keeps its `keep-grafana-events-live` tag. To remove the IAM grant, delete `builder-iam.tf` and apply (plan must show 1 destroy only).

## Open questions
None.

## Remaining work
None. The PWA and test lint changes merged in #163 and #164 are not deployed and move to R100.

## Promotion record

[Template](../project/scripts/releases/templates/promotion-checklist.md). Recovery: [Release recovery runbook](../project/Documents/Rules/Release_Recovery_Runbook.md) and Recovery above. Deployment pins are only in the [Environment inventory](../project/Documents/Environment_Inventory.md). Status: **applied and verified** in PROD (25 October 2026).

### Continue here
- Outcome/scope and affected components: R099 hotfix to PROD: the Grafana MCP Events bridge (`mw-grafana-events`) image and revision, and the builder's Artifact Registry writer grant. Bridge only. No SQL, PWA, API, Hosting or VM change. The PWA and test lint changes merged in #163 and #164 are not deployed and move to R100.
- State and next action or actual blocker: applied and verified; tag `R099` exists on `d428e04`. No blocker.
- Source/artifact/configuration pins; runner manifest link: `main` `d428e04`; bridge image and revision in the inventory; Cloud Build `84619db4-e782-4be7-8468-2f75c6d33a99`. No SQL manifest.
- Existing owner authority and any explicit hands-on checkpoint: the owner's instruction of 25 October 2026, "redeploy the Grafana bridge to production", and the owner's decision of the same day for option 1 (repository-scoped `roles/artifactregistry.writer` for `mw-credit-app-build-prod` on `mw-monitoring`). No financial write or forced notification. No hands-on checkpoint.
- Previous deployed baseline and recovery: revision `00015-qcs` on the image tagged `keep-grafana-events-live`; recovery per Recovery above.
- Scope freeze/next-number handoff: freeze pinned at `d428e04` in this record; the closure pull request marks R099 Released and opens R100 (counter R101). The hotfix uses the current Open release ([release workflow](../project/Documents/Rules/Release_Workflow.md#failure-and-hotfix)).
- Checks: Checks above; bridge CI on PR #162 cited.

### Promotion
| Step | Completion evidence |
| --- | --- |
| Scope, target, authority and usable recovery confirmed | Owner instruction and option 1 above; baseline plan no changes; previous image keeps its `keep-grafana-events-live` tag |
| Required affected checks passed or explicit owner deferral recorded | Terraform fmt and validate; bridge CI on #162; container check of the built image |
| Tested package captured; freeze pinned in this record | `d428e04`, image tag `keep-grafana-events-d428e04` |
| Changed components deployed in dependency order | IAM grant, then image (no traffic), then traffic (100% on `00016-hzz`) |
| Version/environment and affected PROD smoke verified once | `/health` 200, clean startup, natural Scheduler `/internal/dispatch` 200 |
| Final tag created on the package commit; actual outcome/changed owning facts recorded; closure pull request published once | Tag `R099` on `d428e04`; records in the closure pull request |

### Close
- Outcome: applied and verified in PROD (25 October 2026); bridge only.
- Recovery reference: Recovery above.
- Changed documents: this note, Environment inventory (bridge row and keep tags), `infrastructure/ecosystem-bridge/README.md`, Release tracker (R099 Released, R100 Open, counter R101) and Development Changes.
- Published evidence/tag: tag `R099` on `d428e04` through the Release tag workflow.
- Outstanding owner action, if any: none. Acceptance is recorded in the next closure or product pull request.

### Closure pruning (release workflow, 25 October 2026)
- Inbound links repointed first to the commit permalink of `d428e04` (the last commit where the target exists): the R096 paragraph and the R096 row in `project/Documents/Release_Tracker.md`.
- Change note deleted (R096 left the retention window of R099, R098 and R097): `Change Logs/CHANGE_NOTES_R096_COLLECTION_PREPAID_TODAY_2026-10-25.md`.
- Development Changes: one R099 follow-up row added; no section to delete.
- Evidence deleted: none.
