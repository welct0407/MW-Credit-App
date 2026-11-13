# Change notes — Review request built before the review row, agent (R152), 13 November 2026

## Purpose
Owner decision of 13 November 2026, "yes, fix it in R152", for the known limit recorded in the [R151 receipt note](CHANGE_NOTES_R151_RECEIPT_SENDER_FALLBACK_2026-11-13.md): when an approval request text is too long to send, the reserved `partner_reviews` row stays `PENDING` with nothing sent, the resend list shows it as a request and hides the hold, and the Reviewer gets only a hold alert. Fix: build every request text before the review row and the notices are reserved, so a failed build leaves a plain hold and no review row. PROD fact (Forge, 13 November 2026): 0 rows were ever affected and there are 0 `REVIEW_REQUEST_TOO_LONG` jobs. Nothing is deployed.

## Changes
As built.
- `src/mw_integration_agent/review_cycle.py` (Byte, commit `0097d973`): `propose_validated` builds every reviewer's request (Corrected-request prefix and length check) before it reserves the review row and the notices. On a build failure there is no row and no request notice; the job goes to `REVIEW` with the hold alert. A request that is too long holds as `REVIEW_REQUEST_TOO_LONG` (alert "approval request was too long"); other build failures still hold as `RECEIPT_PROPOSAL_UNAVAILABLE`. Automatic payment is unchanged.
- Audit: this was the only reserve-before-build site; loan close, pay-forward options and reconsider/recheck go through it; the options re-send and the `review` command re-send are unchanged.
- Tests: three new in `tests/test_review_cycle.py` (standard request too long, Corrected-prefix request too long, second reviewer fails), all failing on `5b07ebdb`.
- Documents (Dewey): `integration-agent/docs/PARTNER_REVIEW.md`, the R151 receipt note (known limit now fixed in R152), `project/Documents/Release_Tracker.md` and this note.
- Not changed: SQL, the command service contract, the catalogue (revision 38), the configuration schema, units and migrations.

## Checks
| Command | Result |
| --- | --- |
| Byte's `ruff` 0.16.8 | Pass (clean export of `b0814b86` plus the patch, identical to `0097d973`) |
| Byte's focused review and payer modules | 188 OK |
| Byte's full `python -m unittest discover -s tests` | 970 OK, 74 skipped (lab suites) |
| Chase's PostgreSQL 18 lab scratch test (on `0097d973`) | Pass: `cycle()` with a `VALIDATED` job whose request is too long gives job `REVIEW` / `REVIEW_REQUEST_TOO_LONG`, 0 `partner_reviews` rows, only a `receipt-held:` notice and no `review:` notice, failures empty |
| Chase's adversarial review | Pass, no findings: the automatic-payment and `STALE` branches precede the change; `REVIEW_PROPOSAL_CHANGED` is still raised after all texts are built; no row means no notice and no reply match; `pending_items` lists a hold; all-or-nothing across reviewers; keyed reserves are idempotent |
| `npm run check:docs` (Dewey) | |
| CI on the pull request | |
| PROD verification | See the PROD promotion record |

## Not run
- Cleanup of old `PENDING` rows without a notice: not changed; PROD has none (read on 13 November 2026: 0 review rows tied to held jobs).

## PROD promotion record (Forge, UTC)
Placeholder: Forge fills this section (authority, package, agent deploy and read-back; counts only; no secret, chat text, borrower name, username or amount).

## Recovery
Revert the pull request and redeploy the previous agent commit; no data, schema or configuration changed.

## Open questions
None.

## Remaining work
the PROD record; owner acceptance is not separately needed (no visible behaviour changes unless a request is too long).
