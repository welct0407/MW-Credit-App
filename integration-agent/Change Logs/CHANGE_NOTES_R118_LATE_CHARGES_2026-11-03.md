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
| Pull request `Agent tests` (`changes`, `test`, `lab`), runs 41649243078 and 41649432921 on `f29679a`, 41664290089 on `c4dbc3a`, 41671674164 on `34d3aec` | Success |

## Not run
Nothing further: no live Instagram slip was run through the new wording in PROD, so the "Interest X + Late charge Y" request text is covered by unit tests only.

## Recovery
`deploy-runtime.py rollback` to the freeze below restores `9703a191`. The SQL accepts agent versions 7 to 10, so the agent can roll back independently, except that R117 code cannot receive a charge with a late charge above 0 (zero every late charge first).

## Open questions
None.

## Remaining work
None for the agent. PROD acceptance (a real slip against a charge with a late charge) is recorded in the next closure or product pull request.

## Deploy record
Owner go: "Move to prod" (3 November 2026, about 16:25Z), after V132 and V133 (the agent's facts query reads `"Late Charge Remaining"`). VM `vm-mw-credit-agent`, 3 November 2026 (UTC), by `deploy-runtime.py`. The catalogue is unchanged (wording only, no revision bump). Pins are in the [environment inventory](../../project/Documents/Environment_Inventory.md).

| Step | Evidence |
| --- | --- |
| Checkout | `update-from-github.sh` to `22712b0` |
| Dry run | Schema through V11, no drift, 3 modules changed |
| Freeze | 17:27:16Z, rollback directory `runtime-20261103T172716283524Z` (metadata sha256 `55c3c53e…b83b`) |
| Install | No removed files, no unit changes |
| Activate | 17:27:21Z to 17:27:25Z, probe `fdcc4529-…`; six timers resumed |
| Readback | `/ready` true, `code_version` `22712b0`; `check` passes; no failed units; receipt cycles after activation with no failures |
| Deviation | The deploy engine needed an `mw_agent` operator connection file that was absent on the VM (as in R113). A temporary root-only file was used and shredded afterwards |
| Rollback | `deploy-runtime.py rollback` to the freeze above, which restores `9703a191` |
