# Change notes — receipt agent late charges (R118), 3 November 2026

## Purpose
R118 adds a late charge as a third amount on a charge, paid after interest and before principal. The receipt agent plans and words slips against the three remaining parts and posts with the agent command schemaVersion 10. The product note is [R118 late charges](../../Change%20Logs/CHANGE_NOTES_R118_LATE_CHARGES_2026-11-03.md).

## Changes
- `receipt_api.py`: `LINE_KEYS` gains `lateCharge` and `expectedLateChargeRemaining` (8-key lines in the command order); the reply sends agent `schemaVersion` 10. A plan line without the late keys reads 0. The database still accepts agent versions 7 to 9.
- `review_proposal.py`: `facts()` reads `"Late Charge Remaining"` (0 in facts from before V132); a new `owed()` is principal plus interest plus late charge and replaces the two-part sums in `due_charges`, the fit check and the due total, so a late-charge-only charge is due. The Loan Close total adds every unpaid late charge of the loan. The pay-forward options carry `duePrincipal`, `dueInterest` and `dueLate` only when a late charge is due.
- `partner_review.py`: the options request names the due parts when a late charge is due, "Due today ฿150 (Interest ฿100 + Late charge ฿50)" / "ครบกำหนดวันนี้ ฿150 (ดอกเบี้ย ฿100 + ค่าปรับล่าช้า ฿50)". Without a late charge the text is unchanged. Option `4` (recheck) is unchanged. `review_cycle.py` needed no change.
- `SERVICE_CATALOGUE.md`: the `shared_receipt_payment_api` row states schemaVersion 10; wording only, no revision bump, no service, schema or configuration change.
- Tests: new `tests/test_late_charges.py` (sums, late-only charge, wording in English and Thai); `tests/test_receipt_api_v9.py` expects version 10 and 8-key lines in the command order.

## Checks
| Command | Result |
| --- | --- |
| Agent `unittest` (Byte, `673d6ea`, clean tree) | 713 OK, 70 skipped |
| `ruff check --no-cache integration-agent` (Byte, `673d6ea`) | Pass |
| Pull request agent CI (`test`, `lab`) | Pending |

## Not run
To be filled when the checks run.

## Recovery
Before deployment: none needed. After deployment: `deploy-runtime.py rollback --commit <deployed>` restores the previous runtime. The SQL accepts agent versions 7 to 10, so the agent can roll back independently, except that R117 code cannot receive a charge with a late charge above 0.

## Open questions
None.

## Remaining work
- Deploy order: the agent's facts query reads `"Late Charge Remaining"`, so V132 must be applied before the agent commit is deployed (Chase's review; consistent with the SQL-first promotion order).
- Open the pull request and test in DEV (next); the agent code is not deployed until the owner's promotion instruction.
- Deploy to `vm-mw-credit-agent` on the owner's promotion instruction (`deploy-runtime.py` dry-run, freeze, install, activate), after V132 and the images; record the deploy here in the product note and the environment inventory.
