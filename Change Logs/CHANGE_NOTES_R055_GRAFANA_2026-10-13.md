# R055 Grafana proposal — 13 October 2026

Scope: read-only discovery and no-GUI adoption/monitoring proposal, requested while root/D close R054. Baseline PM commit `3e0372b3ac0bd40ff639fff88ee4d16ec4eacb9a`.

Added `outputs/r055-grafana/plan.md`. Confirmed five native-monitoring recovery paths in owner stash `5f795805afe82208d83de61c46bbffd4fda57bda`; current tracked collector remains AppSheet-based. Checked only two maintained setup-token filenames (both absent) and Secret Manager Grafana container names (five bridge secrets, no platform admin token). Read official provider/provisioning documentation. No secret payloads, live changes, stash application or core-document edits.

Proposal covers selective source recovery, authenticated API inventory, no-change Terraform adoption, native collector/label repair, PWA monitoring coverage, focused verification and rollback. Authenticated platform inventory and all implementation/import/deployment steps remain pending owner review. Related credential work preserved.

Validation: read back new Markdown, verified scope/paths and stash pin; documentation-only, no runtime suite required. Rollback: remove the two new files. Publication: root/D authorized exact-file commit/push on PM master; live work remains proposal-only.
