# R052 checkpoint 4E — local authenticated command API candidate

8 October 2026 (Asia/Bangkok). Owner-authorized candidate implementation and disposable verification only. R052 remains Open; no release freeze, live schema application, command runtime grants/deployment, GCS writes, event activation or production authority.

## Scope and baselines

App baseline `30b9ddcec7b1b1ecde63951d02a0ab0afcd1697b`, branch `codex/r052-review-shell`, PR3. PM baseline `fd0f51467ae1d3664cd4318637941c8b09352ad2`, branch `codex/pwa-implementation-plan`, PR19. Preserve unrelated untracked PM DNS/layout draft. Accepted 4B preview and existing live read/PWA services are unchanged.

A supplied the 4E design and executable test plan. B implemented isolated `services/payment-command/{principal,store,handler}.mjs` and focused disposable integration tests/runner. C authored independent cases and executes the final combined API runner. D prepared the separate runtime/authority proposal and runs maintained database CI once. No deployed fake authentication or cloud launcher is added.

Authentication tests inject synthetic claims at the cryptographic-verifier seam. Candidate logic requests revocation verification, requires pinned owner identity and derives the actor from a unique current Partners.Login Email mapping in the SQL transaction. This verifies local authorization boundaries, not real Firebase token verification or effective live IAM/SQL privileges.

The HTTP candidate has strict body/origin/method/privacy controls, retained original-outcome submit/status semantics, and actual disposable V78 posting. New receipt-bearing commands fail closed by default; synthetic descriptors test binding without GCS. A review corrections are implemented: unsupported media returns 415; resolver outage returns 503 separately from invalid binding 422; uncertain commit or rollback failure quarantines the connection. A subsequent C diagnostic found remapped known-request status classified as 503; A/root settled 403 access_denied after successful rollback, while rollback failure remains 503. B implemented the correction; C's final 22/22 API retest passed, superseding the interim 21/21 result.

V78 is unchanged SHA256 `8ea5009d29bf8c78fadcdaa478680defd3f161ef2a7e22e7999c2a2aa7170c30`. Live DEV/PROD remain V77. SECURITY INVOKER routines require more than EXECUTE-only grants; a later reviewed nonlogin-owner/definer wrapper migration and full transitive permission tests are proposed, not implemented. Manual receipt SQL/GCS/AppSheet/PWA roundtrip is unverified. The journal is not an outbox/delivery ledger; event ownership and deduplication remain open.

## Evidence and validation

Maintained `scripts/database/Test-CI.ps1` passed once, exit 0, on owned disposable clusters; see outputs/r052-payment-command-api/database-ci.json. Final combined B/C API tests passed 22/22 (C 19, B 3), and pure contract tests passed 5/5: 27 unique named cases. Final response classifications and connection quarantine passed. Sanitized C report/results are retained in outputs/r052-payment-command-api; candidate source 20ad195017a4476ab7655f85b5f7265f15a68699 was normally pushed and its remote SHA verified; exact-source Development 37730466738 and Database migrations 37730466768 both passed. See source-ci.json. A design/test plan and D authority proposal are linked from current PM progress/evidence records. No broad browser rerun or live audit is required for this isolated backend candidate.

PM updates: current affected checkpoint summaries in PWA_Progress, PWA_Implementation_Plan, Development_Changes, Environment_Inventory, Release_Tracker and outputs/r052-pwa/README; A design, D authority plan, this log and final evidence. Preserve historical logs and generic team mappings. No AppSheet dictionary/model definition changed, so no YAML/dictionary regeneration is required.

## Recovery and status

Stop/discard only owned disposable clusters; revert candidate code/docs if rejected. Retain immutable V78 source and any future live journal/financial history. No down-migration, table drop or financial rollback is part of this checkpoint. Current status: local candidate verification complete, orchestrator authorized publication following C's final pass. Owner checkpoint review remains pending. GitHub CI is distinct from the local disposable API evidence and must be reported at its actual status. Owner review/acceptance and live readiness are not inferred.

Publication closeout: exact candidate source `20ad195017a4476ab7655f85b5f7265f15a68699` passed both GitHub workflows. PR3/PR19 summaries were updated with the scoped deliverable and test limitations. Final commits add only evidence/documentation; candidate code, runner and migration bytes remain unchanged. Final remote evidence hashes are verified after normal push; no merge, deploy or live activation occurs.
