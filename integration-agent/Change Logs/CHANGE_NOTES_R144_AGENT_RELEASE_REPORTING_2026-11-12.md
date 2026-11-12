# Change notes — Agent release reporting (R144), 12 November 2026

## Purpose
Part of R144 component versioning ([project note](../../Change%20Logs/CHANGE_NOTES_R144_COMPONENT_VERSIONING_2026-11-12.md)): the agent reports which `Rnnn` its code belongs to, so drift against the registry can be checked.

## Changes
- `scripts/deploy-runtime.py prepare` writes `code_release` beside `code_version` in the configuration (Byte).
- `/ready` and `/healthz` report `release` and `commit` (Byte).
- `docs/OPERATIONS.md`: deploy bullet describes the new fields. The service catalogue revision (37) is unchanged and remains the agent's native counter; no switch, route or runtime behavior change.

## Checks
| Command | Result |
| --- | --- |
| Agent `ruff` (Byte, commit `080486f8`, tree `6e6493c4`) | Pass |
| Agent unittest `deploy_runtime` 24, `server` 16, `chat_relay` 20, `receipt_recognition` 81, `config` 18 (Byte, same tree) | Pass, all OK |
| `npm run check:docs` (Dewey) | Pass, 0 failures, 0 warnings |
| Adversarial review (Chase, same tree) | Pass (Chase, commit `080486f8`, tree `6e6493c4`): hostile build values give null in the agent `build_identity`; `debian-health.py` and `deploy-shared-receipt-api.py` assert no exact health body. Not verified: the agent `--release` on the real host |
| CI on the pull request | Pending (PR `Development checks`) |
## Not run
Nothing further: the Debian deploy ran with the R144 promotion (see Deployment).

## Recovery
Revert the commit; the added fields are read only by the drift check.

## Open questions
None.

## Remaining work
None for the agent.

## Deployment (Forge, 12 November 2026 UTC)
Authority: the owner's R144 production instruction ("Merge and promote R144 to production"), relayed by the orchestrator; it covers this deploy of the exact package commit `51ba52d36d9f5a1bd13960fd31b2b2919acfd70a`. Host `vm-mw-credit-agent` (project `clever-oasis-508610-n7`), over IAP SSH as `codex-cloud`. No config switch, cutoff, catalogue entry, route or job changed; no secret value is recorded.

| Step | Result |
| --- | --- |
| Checkout | `update-from-github.sh` fast-forward `055e25fe` to `51ba52d3`; clean |
| Dry-run | Changed modules `chat_relay_api.py`, `config.py`, `receipt_recognition_api.py`, `server.py`; units unchanged; agent schema applied through V11 (nothing missing, no drift) |
| Operator access | The schema check needs an `mw_agent` operator connection file: temporary root-only `/root/r144-op` (`postgres` through the 5432 proxy, password piped on stdin from Secret Manager into a 0600 file, never printed), shredded 09:30:05Z |
| Deploy | `deploy-runtime.py --release R144`: freeze 09:29:37Z (rollback directory `runtime-20261112T092937308158Z`), install 09:29:46Z, activate 09:29:51Z to 09:29:55Z (probe request `f53f201e-c45f-4ab6-8271-553607846608`), timers and the wake path resumed |
| Chat relay | Not restarted by the helper; restarted by hand at 09:30:29Z so its `/healthz` serves the new package |
| Verification | Config `code_version` `51ba52d3`, `code_release` R144; `/ready` ready with release R144 and commit `51ba52d3`; recognizer and relay `/healthz` ok, enabled, R144; `mw-integration-agent check` exit 0; no error-level journal entries for the receiver, recognizer and relay; worker heartbeats from 09:32Z report `code_version` `51ba52d3`; catalogue revision 37 |
| Rollback | `deploy-runtime.py rollback --commit 51ba52d36d9f5a1bd13960fd31b2b2919acfd70a` restores `813462e7`, then restart `mw-chat-relay` |
