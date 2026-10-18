# Change notes — audit routes rejected by the V1 CHECK, 18 October 2026

## Purpose
Agent code wrote audit routes that the `audit.events` CHECK in `database/migrations/V1__audit_and_control.sql` rejects (`shared-command-api`, `native_api`, `legacy_native_readback`, `gemini`), so their events were lost. This batch maps them to an allowed route, guards every route with a test, and adds a read-only-by-default tool to close the receipt payments left DISPATCHING. No migration: nothing reads `route` to tell these calls apart, and `service_name` already names each capability.

## Changes
- `src/mw_integration_agent/receipt_api.py`: `receipt_payment` audits on route `internal` (was `shared-command-api`). Before, with the old route, every outcome (posted, rejected, not sent) lost its terminal event and the operation stayed DISPATCHING; posted and rejected results reached the review cycle as an exception, and it then reconciled by status and readback as designed.
- `src/mw_integration_agent/conversation_write.py`: native command `route_selected`, `dispatch_started` and the verification event use `internal` (were `native_api` and `legacy_native_readback`). The payload keeps `'route':'native_api'`. Before, the intent insert and these events shared one transaction, so a native conversation write was rolled back before dispatch (no effect, no audit).
- `src/mw_integration_agent/receipt_recognition_api.py` and `receipt_image.py`: the recognizer's operation and its `result_observed` event, and the Gemini cycle extraction, use `internal` (were the provider name). The plan still names the provider. The Codex extraction keeps `codex`. This is the R075 recognizer fix; it was not yet on `main`.
- `tests/test_audit_routes.py` (new): parses the allowed list from V1 and scans every `event`, `activity` and `audited` call in `src/` and `scripts/` (keyword, positional and conditional routes). There are no known exceptions.
- `tests/test_receipt_recognition.py`: expects route `internal`.
- `scripts/reconcile-receipt-audit.py`: new mode `--dispatching` (`close_dispatching`). Each DISPATCHING `receipt_payment` operation must match exactly one POSTING-claim `state_change` in its job (parameter digest) and a POSTED review. The payment API status (`posted`, financial match) and `review_execution.readback` must verify the payment. Plan is read-only. `--apply` needs `--expected` and `--backup-reference`, re-checks DISPATCHING under row lock, and appends one keyed `dispatch_reconciled` event (route `migration`, state COMMITTED). Any mismatch stops the whole batch; it never submits a payment.
- `tests/test_receipt_audit_postgres.py`: lab class `DispatchingClosurePostgres` (plan is read-only, apply needs count and backup, apply closes once, unverified or unmatched closes nothing).
- Docs: `docs/POSTGRESQL_OPERATIONS.md` (new section "Audit routes and receipt payments left DISPATCHING"), `docs/RECEIPTS.md` (recognizer audit route).

## Checks
| Command | Result |
| --- | --- |
| `python -m unittest discover -s tests` (in `integration-agent/`, locked requirements, fresh venv) | 568 tests OK, 85 skipped (lab suites); baseline 562 |
| `python -m unittest tests.test_audit_routes` before the code fix | Failed as intended, 8 findings: `conversation_write.py` 178 (2 routes), 300, 301; `receipt_api.py` 106; `receipt_image.py` 166; `receipt_recognition_api.py` 254, 257 |
| Disposable PostgreSQL 18 cluster, `mw_agent` V1–V6 only: `submit` with the old route, then with the fix, for a posted, a rejected and a not-sent result | Old: all three stay DISPATCHING (posted and rejected raise `CheckViolation`). Fixed: 2 COMMITTED, 1 FAILED |
| Same cluster: `tests.test_receipt_audit_postgres.DispatchingClosurePostgres` | 3 tests OK |
| `ruff check --no-cache integration-agent` | All checks passed |
| `npm run check:docs` (repository root) | Pass, 0 failures |
| Read-only reconciliation, 18 October 2026, as `codex-cloud-read` (IAP tunnel, `default_transaction_read_only=on`), `mw_agent` and `loan_manager_prod` | See below |

Reconciliation of the 23 DISPATCHING `receipt_payment` operations (created 12 October 06:21Z to 18 October 16:54Z, 9 code versions). Only aggregates and operation IDs were read out; no borrower, amount or reference values were printed.
- Each operation's job holds exactly one POSTING claim. Its parameter digest matches exactly one review (23 of 23, all distinct). The same job set the review to POSTED, which is still its state.
- PROD `pwa_payment_commands`: exactly one schema-7 agent command per request, `outcome=posted`, recorded 0.1 to 6.6 s after dispatch. `payment_id` equals the review's key; `reviewId` matches. PROD holds exactly 23 agent commands, all posted, in the same window.
- PROD `Payments`: exactly one row per command, `Posted`. Borrower, cash account, amount, payment date, bank reference, creation minute and repayment total all match the command (the `pwa_agent_receipt_status_v1` financial-match test). 23 of 23.
- Receipt evidence links were projected APPLIED for all 23. Each operation has only `dispatch_started/internal`. No other `mw_agent` operation is DISPATCHING or UNKNOWN.
- Result: all 23 posted exactly once. None was rejected and none failed to reach the API. No retry or correction is needed; only the audit trail is open.
- The 98 earlier `receipt_payment` operations (to 11 October) used route `appsheet` and are COMMITTED.
- Live side effects seen: there are no `reviewer_api` operations since the native route was introduced. One `receipt_recognition_api` operation is AUTHORIZED (18 October 18:17:35Z). It shows that DEV recognizer requests return 503 until this fix is deployed.

## Not run
- Full PostgreSQL lab (Flyway business database) and the other lab suites: CI's `lab` job runs them.
- No deployment, no `mw_agent` write, no closure apply.

## Recovery
Revert this batch's commit. Nothing is deployed. If the closure is applied later, its events are append-only evidence under key `receipt-payment-dispatch-reconciled-v1`; recovery is the `mw_agent` backup named in `--backup-reference`.

## Open questions
1. Deploy this source to the Debian agent (`deploy-runtime.py`), so new receipt payments, native conversation writes and DEV recognizer requests audit correctly. Until then every new receipt payment stays DISPATCHING. The payments themselves are still reconciled by the review cycle.
2. After the deploy: authorize the closure of the planned operations. Steps: back up `mw_agent` (`scripts/backup-agent-database.py`, verified restore), then run as `mwagent` on the VM `scripts/reconcile-receipt-audit.py --dispatching` (plan; expect 23 plus any created before the deploy), then `--dispatching --apply --expected <plan count> --backup-reference <reference>`. Re-run the plan; it should report 0.

## Remaining work
The owner-gated steps above. `reconcile-operator-audit.py` does not apply (it links operator SQL markers only), and the default mode of `reconcile-receipt-audit.py` skips operations that already exist.
