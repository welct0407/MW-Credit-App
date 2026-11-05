# Change notes — R129 agent rebate wording: pending payment, 5 November 2026

## Purpose
Part of R129 (referral rebate pending payment and settlement; see the [main change note](../../Change%20Logs/CHANGE_NOTES_R129_REFERRAL_REBATE_SETTLEMENT_2026-11-05.md)). From V137 a referral rebate that is not offset is pending payment, not paid out by Lisa at close. The agent composes the rebate sentence itself, so its wording must follow.

## Changes
- `src/mw_integration_agent/partner_review.py` `rebate_lines`: the payable part of the rebate reads "Referral rebate ฿300: pending to {name}" / "ค่าแนะนำ ฿300: ค้างจ่ายให้ {name}" instead of "pay out to" / "จ่ายให้"; the offset line is unchanged. It is used by the loan close approval request and by the posted "Loan closed" notice. Byte changed the code and its tests (`tests/test_review_close.py`).
- `docs/PARTNER_REVIEW.md`: the Result paragraph says pending-payment part. `SERVICE_CATALOGUE.md` records no rebate wording, so it needs no entry; the catalogue revision stays 36 (no service or switch change).
- No new switch, route, configuration or catalogue change. The agent API is unchanged; the command service decides the rebate path and amounts.

## Checks
| Command | Result |
| --- | --- |
| `PYTHONPATH=src python3 -m unittest discover -s tests` and `ruff` in `integration-agent/` (Byte) | 789 OK, 70 skipped; ruff clean |
| `npm run check:docs` (Dewey) | Pending final run |

## Not run
Live Instagram: there is no DEV agent, so the first real close after the agent deploy is the check. A skipped check is not a pass.

## Recovery
`sudo python3 integration-agent/scripts/deploy-runtime.py rollback --commit <deployed>` restores the previous code. The wording is the only change, so nothing else needs undoing.

## Open questions
None. Whether the agent is deployed with the R129 PROD promotion is for that instruction; until the SQL side is live the command service still answers with the old rebate path.

## Remaining work
- Owner acceptance in PROD: the first real agent DM with the "pending to" wording (a loan close approval or a posted "Loan closed" notice that books a pending rebate). No forced DM or close was made.

## DEV promotion record (Forge, 5 November 2026, UTC)
There is no DEV agent, so no agent code was deployed for DEV. Evidence before PROD: Byte's unit tests (789 OK, 70 skipped, ruff clean), and Agent tests run 42038154232 green on re-run (`test_chat_relay` `BrokenPipeError` once, an unrelated oversized-body race).

## PROD promotion record (Forge, 5 November 2026, UTC)
Authority: the owner's instruction "Promote to prod and get everything done" (5 November 2026), including the agent code. Target: `vm-mw-credit-agent`. The main record is in the [R129 change note](../../Change%20Logs/CHANGE_NOTES_R129_REFERRAL_REBATE_SETTLEMENT_2026-11-05.md#prod-promotion-record-forge-5-november-2026-utc). No secret value appears here.

| Step | Result |
| --- | --- |
| Package | `0f3420367a62b6d796d53ed656a52b7a74d2cdfb` (merge of PR #251); only `partner_review.py` changed since `aaad6a87` |
| Baseline | Live `aaad6a87` (R128), catalogue revision 36, switches unchanged |
| Freeze | 15:50:07Z to 15:50:19Z; rollback directory `runtime-20261105T155012361755Z` |
| Install | 15:50:19Z to 15:50:28Z; no file removed, no unit change |
| Activate | 15:50:28Z to 15:50:37Z; catalogue revision 36, switches unchanged |
| Readback | `receiver-ready`; four receipt cycles clean; no ERROR logs 15:33Z to 15:51:43Z |
| Access | `gcloud compute ssh` exited 255; the operator key path was used and the temporary connection file was shredded |
| Not deployed | SQL on `mw_agent`, migrations, units, configuration |
| Rollback | `sudo python3 integration-agent/scripts/deploy-runtime.py rollback --commit 0f342036…` (no configuration change to undo) |

Limitations: live Instagram was not exercised; the first real "pending to" DM is the acceptance.
