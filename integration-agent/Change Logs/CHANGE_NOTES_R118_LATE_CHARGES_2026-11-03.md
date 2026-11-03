# Change notes — receipt agent late charges (R118), 3 November 2026

## Purpose
R118 adds a late charge as a third amount on a charge, paid after interest and before principal. The receipt agent plans and words slips against the three remaining parts and posts with the agent command schemaVersion 10. Stub written before Byte's batch 2 agent change exists; Dewey completes it from the final code. The product note is [R118 late charges](../../Change%20Logs/CHANGE_NOTES_R118_LATE_CHARGES_2026-11-03.md).

## Changes
Planned (to be confirmed against the code):
- `receipt_api.py`: `LINE_KEYS` gains `lateCharge` and `expectedLateChargeRemaining`; agent schemaVersion 10. Versions 7 to 9 stay accepted by the SQL validator.
- `review_proposal.py`: `facts()` reads `"Late Charge Remaining"`; `due_charges`, `fits` and `plan` sum principal, interest and late charge; the Loan Close total adds the unpaid late charge; options pass late through.
- `partner_review.py`, `review_cycle.py`: wording "Interest X + Late charge Y" and "ดอกเบี้ย X + ค่าปรับล่าช้า Y"; option `4` (recheck) unchanged.
- `SERVICE_CATALOGUE.md` and `service-catalogue.json`: wording only, no revision bump and no service change.
- No agent schema, configuration or unit change.

## Checks
| Command | Result |
| --- | --- |
| `PYTHONPATH=src python3 -m unittest` on `test_receipt_api_v9.py` (v10 added), `test_review_proposal_options.py`, `test_partner_review.py`, `test_review_cycle*.py`, `test_native_receipt_facts.py` | Pending |
| `ruff check --no-cache integration-agent` | Pending |
| Pull request agent CI (`test`, `lab`) | Pending |

## Not run
To be filled when the checks run.

## Recovery
Before deployment: none needed. After deployment: `deploy-runtime.py rollback --commit <deployed>` restores the previous runtime. The SQL accepts agent versions 7 to 10, so the agent can roll back independently, except that R117 code cannot receive a charge with a late charge above 0.

## Open questions
None.

## Remaining work
- Complete this note from Byte's batch 2 agent change.
- Deploy to `vm-mw-credit-agent` on the owner's promotion instruction (`deploy-runtime.py` dry-run, freeze, install, activate), after V132 and the images; record it in the product note and the environment inventory.
