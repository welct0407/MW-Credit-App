# Tracking repair and historical recovery candidate

2 October 2026 UTC. Source parent `12add518658f339a9b09c336f129ecefadea0145`; deployed source remains `614ea6496bcd796611080e69f8fc78276304bb8a`. This candidate is tested, not deployed. Historical reconciliation has not been applied. R050 remains Open and PR2 draft.

## Verified incident

The one controller deallocate was accepted at 07:31:01 UTC. Ledger generation3 has active request `1790926255648.48f25330-0f95-4827-ae7e-363f7065e8be`, ARM202 and request UUID `7edd0361-7e12-47d2-ba59-dcedeb216a9b`, but no tracking URL/kind or reason. Polling required a URL while the timeout applied only when polling was disabled: accepted could persist indefinitely. Whether the original header was absent or rejected is unproven because it was discarded.

Direct Compute GET returned the exact request UUID as operation name, start `07:31:01.1806458`, Succeeded and end `07:43:04.8662441` UTC. Activity Log independently records the controller managed identity deallocate Succeeded at `07:43:06.0995435`. A later owner-approved portal Start by MW Credit began `07:55:37.0407326` and succeeded `07:57:08.93534`. Parent observed executor reconnection by08:01. No controller Start or Restart completed in this test sequence; do not resume that sequence automatically. The parent reports an owner-granted VM Contributor assignment used for portal recovery; this executor made no role change.

The exact IDs, callers and timeline are pinned in [recovery-proof.json](recovery-proof.json). The new tool re-read the current ledger, Compute evidence, four Activity events and current expected VM running/Succeeded at08:25:32 UTC: [read-only verification](read-only-verification.json). This used the existing operator CLI identity, not the Function managed identity, and acquired no ledger lease or write. Effective managed-identity fallback polling still needs a separately approved live test.

## Candidate behavior and checks

- Persist only `missing` or `rejected` tracking-header categories, never the discarded URL/body.
- Save an immutable acceptance timestamp. Without a safe header URL, a valid recorded ARM UUID permits one due GET at the existing fixed subscription/region Compute operations endpoint. It is a candidate, not an assumed operation identity.
- Require matching response name, a start inside the dispatch window with five-second clock allowance, and valid ordered terminal end time. Reject reported target/action mismatches,404, redirects, malformed/unrecognized responses and missing evidence. No broader URL allowlist, new permission or POST retry.
- Verified success still requires a fresh expected VM identity and desired state. Failed/Canceled require verified terminal evidence. Unverified candidates retain the latch and a safe reason; after15 minutes of unresolved candidate errors they become unknown.403 remains resumable. Legacy records without immutable acceptance data do not automatically infer a candidate.
- Separate operator recovery uses the preserved acceptance audit for this legacy record, exact pinned proof, fresh Compute/Activity evidence, expected running VM, matching generation, disabled admission, actual worker fencing and lease/ETag. It marks the old deallocate completed, explicitly explains the later recovery Start, retains deduplication/audit/timeline and leaves admission disabled. Ordinary success reconciliation is unchanged.

Strict TypeScript and all45 focused tests passed: [tests.log](tests.log). Coverage includes actual response shape, mismatches,404/malformed/missing receipts, SSRF/redirect boundaries, no false completion/replay, stale generation, worker fencing, evidence mismatch, legacy audit recovery and ordinary reconciliation guard retention. No live power test or browser acceptance of this new candidate is claimed. [Full source diff](source-fix.diff).

The deployment ZIP changes only `dist/src/arm.js`, `dist/src/controller.js`, `dist/src/ledger.js` and its source manifest. All9726 production dependency entries, browser assets, Functions routes, host/auth configuration and other package files are byte-identical to the deployed routing ZIP. Administrator tooling is excluded. See [candidate-manifest.json](candidate-manifest.json).

Microsoft documents selecting the response tracking header and the Compute operations URL; it does not guarantee that every request UUID is an operation UUID. This repair validates the observed provider response before trusting the fallback. [Azure asynchronous operations](https://learn.microsoft.com/en-us/azure/azure-resource-manager/management/async-operations). Operator evidence is fetched with the documented resource/time-bounded Activity query. [Activity Logs List](https://learn.microsoft.com/en-us/rest/api/monitor/activity-logs/list?view=rest-monitor-2015-04-01).

## Exact approval scope and sequence — not executed

Requested scope: this pinned code-only deployment, temporary controller mutation/admission closure and Function-worker stop/drain/restart, exact historical reconciliation, and restoration of the previously enabled gates after validation. No VM power action, role/consent/access/domain/credential/logging change. Keep the parent VM-work hold and saved browser request.

1. Reconfirm tenant/subscription, site `vm01-controller-50f792fa`, expected VM ID, exact active receipt and current generation. Save current ledger and hashes of settings/auth/logging/roles/hostnames for recovery comparisons. Preserve the original routing ZIP. Run the new command in `--verify-only` mode using the proof hash below and actual generation; it performs reads only.
2. With approval, close ledger admission using existing `admin-ledger.js admission --approved --evidence vm01-20261002-tracking-recovery --expected-generation 3 --enable false` (expected3→4; abort on drift). Temporarily set only `VM01_ENABLE_MUTATIONS=false`. Stop the **Function app**, not VM-01. Verify site state Stopped, wait at least120 seconds after that observation (host timeout60 seconds plus lease60 seconds), confirm no new VM actions and obtain the normal blob lease without breaking it. Record real fencing evidence; a flag alone is insufficient.
3. From the reviewed local build, while fenced, run:

   ```text
   node dist/scripts/reconcile-recovered-deallocate.js --apply --approved --workers-fenced --proof <absolute-path-to-recovery-proof.json> --proof-sha256 f3851f03750d0772ad3916cf6596b11679441475adac985cf2fecfe42dcbe602 --expected-generation 4
   ```

   Expected4→5, admission remains false, only this active record becomes completed with `historical_deallocate_completed_then_recovery_start`; its latch clears. Read back exact changed fields, preserved digest/IDs/old audit and new evidence/audit. Do not restore a pre-test ledger or label the successful deallocate failed/canceled. Evidence expiry, mismatch or uncertainty stops this step with gates closed.
4. Deploy local `vm01-controller-tracking-local.zip`, SHA256 **6629b67f0cae7520f4c3702e6b852c1073b17f6ae391698a961d2835bc17e961**,15877742 bytes, using the existing reviewed Flex ZIP deployment mechanism with remote build disabled and its no-host-key status check. Record intent once; reconcile uncertain outcomes before retry. Restart the Function app when required with both mutation/admission gates still closed. Do not replay the old deployment helper unchanged: it pins the earlier package. Verify active deployment/source/runtime hashes and unchanged assets/configuration/security/roles. No infrastructure template deployment.
5. Parent cloud browser retrieves the saved receipt: historical deallocate completed after recovery Start; current VM running/Succeeded. Verify no misleading claim that the VM is currently deallocated. If all checks pass, restore only `VM01_ENABLE_MUTATIONS=true`, then reopen admission with the current expected generation (expected5→6). Confirm polling remains true and all other settings/access/roles/logging/domain unchanged. No additional power test is included.

The read-only form replaces `--apply --approved --workers-fenced` with `--verify-only` and uses the current generation; it does not close admission or acquire a lease. Load only the existing public VM01 configuration and authorized Azure CLI identity. Proof hash or generation mismatch aborts. The tool requires existing operator Activity/Compute/storage reads and storage writes only for apply; it requests no additional role.

Rollback: before reconciliation, leave the unresolved receipt and gates closed. After proven historical completion, retain that completion and deduplication evidence even if code deployment fails. A separately approved code rollback uses the retained routing ZIP while gates remain closed; never roll back the ledger to generation3 or discard the power-action history. Re-enable only after reviewed state verification. No mutation/deployment/reconciliation has been performed during candidate preparation.
