# Bridge troubleshooting cleanup inventory — 3 October 2026

Read-only inventory requested after live GCP activation. Scope is this bridge's Cloud Run revisions, bridge-named Run/Scheduler jobs and its two exact Artifact Registry packages. [Exact metadata evidence](cleanup-inventory.json). No object was deleted and no source/runtime/secret setting was changed. Parent owns duplicate plugin-wrapper and unused Grafana test-contact-point cleanup after live verification.

## Specific candidate requiring exact deletion approval

The untagged earlier bootstrap image below is **not referenced by any of the nine inventoried bridge revisions**; no bridge Cloud Run Job exists. The later bootstrap image ac81052e is the retained inert recovery image. This is a candidate for removal after parent/owner approves the exact digest and confirms no separately retained consumer; the inventory does not prove absence of consumers outside this bridge.

`asia-southeast1-docker.pkg.dev/clever-oasis-508610-n7/mw-monitoring/grafana-mcp-bootstrap@sha256:d7e7c7b322c2497896239b5007d12f20e5d7c07cbad9e024e28cbf67098b4d26`

No automatic tag/package/repository cleanup or retention policy was created. Delete only this digest if approved, preserving tagged v1/ac81052e and all application images. Registry/image deletion is permanent; Git evidence retains source metadata, not the deleted image bytes.

## Retain current and rollback resources

| Revision(s) | Image digest prefix | Disposition |
| --- | --- | --- |
| 00009-487 | e24d97a0 | Active, 100% traffic; retain |
| 00008-6r2 | e24d97a0 | Documented prior deny-all rollback; retain. It has historical capture enabled; using it requires coordinated containment/capture review |
| 00007-4zn | aa05ca2f | Documented pre-capture discovery rollback; retain |
| 00006-qm4, 00005-nt4, 00004-cff | 6856cbfa | Auth/secret-repair history and rollback stages; retain all pending exact revision-by-revision approval. 00005 is a possible redundant intermediate revision, not deleted |
| 00003-rdr, 00002-nrg | a6cc1bb7 | Owner-enabled/owner-disabled recovery baselines; retain |
| 00001-rnj | ac81052e | Inert recovery revision/image; retain |

All four `grafana-mcp-bridge` application images are referenced by retained revisions. Nine revision metadata entries are present; source deployment evidence and live service traffic establish active/current and rollback identities. Historical OAuth failures do not make a Ready rollback revision disposable. No extra bridge Run Jobs or duplicate bridge Scheduler jobs were found; earlier synthetic one-off worker was proposed, never created.

Current hostname capture is already disabled on unchanged approved revision 00009; its source additionally requires an empty callback allowlist. Removing `src/callback-host-diagnostic.ts`, its config option and corresponding tests is a possible later source cleanup requiring review, affected tests and a separately authorized deployment; leave the working immutable revision unchanged during activation. Safe RPC boolean/count diagnostics still serve operating evidence and are not credential exports. Keep sanitized troubleshooting evidence, the unused fixture as explicitly unsent history, and package source/archive recovery records. Do not delete delivered event/outbox records, secret versions/keys, database/indexes/TTL, dedicated identities, domain mapping or active job.

## Parent-owned cleanup and activation boundary

Parent identifies redundant wrapper `plugins_6ac0a359d8b0819199175c9cf34d6661` (keep canonical cloud plugin), and an unused Grafana test contact point to remove after the live route is verified. This executor did not inspect/uninstall either UI object. Parent reports same host automation 6ac0d235a960819184f5ab616a6acf0f updated to PerformanceAlertNotifications at 11:20:44 UTC with ten existing Performance2m alert names and firing/resolved filters. The additive webhook in existing MWPerformanceIRM is prepared but not saved, awaiting secure owner HMAC entry; original IRM integration MWPerformanceMonitoring remains preserved. These are parent observations, not independent GCP or browser checks.
