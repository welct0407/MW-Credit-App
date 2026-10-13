# R055 Grafana proposal — 13 October 2026

Scope: read-only discovery and no-GUI adoption/monitoring proposal, requested while root/D close R054. Baseline PM commit `3e0372b3ac0bd40ff639fff88ee4d16ec4eacb9a`.

Added `outputs/r055-grafana/plan.md`. Confirmed five native-monitoring recovery paths in owner stash `5f795805afe82208d83de61c46bbffd4fda57bda`; current tracked collector remains AppSheet-based. Checked only two maintained setup-token filenames (both absent) and Secret Manager Grafana container names (five bridge secrets, no platform admin token). Read official provider/provisioning documentation. No secret payloads, live changes, stash application or core-document edits.

Proposal covers selective source recovery, authenticated API inventory, no-change Terraform adoption, native collector/label repair, PWA monitoring coverage, focused verification and rollback. Authenticated platform inventory and all implementation/import/deployment steps remain pending owner review. Related credential work preserved.

Validation: read back new Markdown, verified scope/paths and stash pin; documentation-only, no runtime suite required. Rollback: remove the two new files. Publication: root/D authorized exact-file commit/push on PM master; live work remains proposal-only.

Owner follow-up: no existing Grafana token; access setup is included in the proposal. Added supported authenticated bootstrap prerequisite, dedicated least-privilege provisioning identity, proposed numeric-pinned SM container and code-only management requirement. No credential was created.

Root review clarified standing authorization for local source/tooling/tests/publication; consolidated live-plan approval retained. GCP bridge adoption is optional and independent of native probe repair.

## Approved implementation

Owner authorized Grafana Terraform adoption followed by native PWA monitoring on 13 October. F owns Terraform/access/adoption; B owns selective native collector/dashboard source reconciliation and focused tests. Existing unrelated dirty credential work and stash are preserved. Code/API-only operations; missing bootstrap credential is requested from owner, with no browser-session extraction. No live adoption/deployment is yet claimed. Starting PM378a5526/app3e97140 provide source rollback; each affected live definition requires a captured baseline before mutation.

## Scoped promotion start

2026-10-13T04:10:19.463891+00:00: R055 Frozen / R056 Open / next R057, with source and exact saved-plan pins in outputs/r055-grafana/release-manifest.json. Twelve existing resources imported with zero configuration changes. Reviewed changes create PWA Platform, update only Performance panels56/57 labels, and create two protected Secret Manager containers; payloads stay outside Terraform. No IAM, recipient, financial or worker change. Apply/readback remain pending. Unrelated dirty work is preserved.

## Owner-requested UX refinement

Agent E configuration review accepted GRAF-INFO-01, GRAF-SERIES-01 and GRAF-LABEL-01. Root updated the generator and JSON, preserving targets/math/IDs/status mappings and current range. Exact delta checks passed; no broad CI. See outputs/r055-grafana/ux-review.md. F owns one corrective Terraform apply/readback. No device visual validation claimed.
