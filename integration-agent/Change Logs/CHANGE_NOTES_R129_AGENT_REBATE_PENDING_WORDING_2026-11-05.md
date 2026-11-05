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
- Deploy the agent code with the R129 PROD promotion (a separate owner instruction); there is no DEV agent.
