# Change notes — Review request built before the review row, agent (R152), 13 November 2026

## Purpose
Owner decision of 13 November 2026, "yes, fix it in R152", for the known limit recorded in the [R151 receipt note](CHANGE_NOTES_R151_RECEIPT_SENDER_FALLBACK_2026-11-13.md): when an approval request text is too long to send, the reserved `partner_reviews` row stays `PENDING` with nothing sent, the resend list shows it as a request and hides the hold, and the Reviewer gets only a hold alert. Fix: build every request text before the review row and the notices are reserved, so a failed build leaves a plain hold and no review row. PROD fact (Forge, 13 November 2026): 0 rows were ever affected and there are 0 `REVIEW_REQUEST_TOO_LONG` jobs. Nothing is deployed.

## Changes
As built.
- `integration-agent/src/` (Byte): to be filled from Byte's report.
- Documents (Dewey): `integration-agent/docs/PARTNER_REVIEW.md`, the R151 receipt note (known limit now fixed in R152), `project/Documents/Release_Tracker.md` and this note.
- Not changed: SQL, the command service contract, the catalogue (revision 38), the configuration schema, units and migrations.

## Checks
| Command | Result |
| --- | --- |
| Byte's agent unittests and `ruff` | |
| Chase's review | |
| `npm run check:docs` (Dewey) | |
| CI on the pull request | |
| PROD verification | See the PROD promotion record |

## Not run
- To be filled with the evidence.

## PROD promotion record (Forge, UTC)
Placeholder: Forge fills this section (authority, package, agent deploy and read-back; counts only; no secret, chat text, borrower name, username or amount).

## Recovery
Revert the pull request and redeploy the previous agent commit; no data, schema or configuration changed.

## Open questions
None.

## Remaining work
Byte's "As built" bullets, the Checks table and the PROD record; owner acceptance is not separately needed (no visible behaviour changes unless a request is too long).
