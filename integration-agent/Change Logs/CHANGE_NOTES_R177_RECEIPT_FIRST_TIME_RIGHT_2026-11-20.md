# Change notes — R177 receipt first-time-right, 20 November 2026

## Purpose
Raise the share of genuine incoming slips that post on the first pass without a human, and make that share visible. Owner request of 20 November 2026; PROD promotion is not yet authorized.

Evidence (read-only, PROD, 6 to 20 November 2026, aggregates only): 202 incoming slip jobs, 137 auto-posted first pass (68%, median 24 s). Gaps found:
- 14 slips went to "Overpayment review" although the amount was at or below the total unpaid charges through the slip date (5 exactly equal, 9 partial; 8 of the 9 were booked as newest-first Lump Sum would book them). Cause: the plan auto-posts only when the amount is within the latest charge day's total.
- 8 slips were the partner's own outgoing transfers, shown in borrower groups; each needed a manual Reject, and one whose amount fitted a due would have auto-posted as incoming.
- One Review thread showed a stale existing-payment result with unclear wording, an unacknowledged reviewer reply and a Review count that differed from what was sent (item C).

## Changes
- A (auto-post arrears): `integration-agent/src/mw_integration_agent/review_proposal.py` plan and tests. To be filled.
- B (outgoing transfers ignored): sender detection against our active cash accounts, a distinct ignored detail code. To be filled.
- C (design only, pending owner confirmation): acknowledge a reviewer's reply to a result notice; name what differs in `POSSIBLE_EXISTING_PAYMENT_REVIEW`; align the Review list count. Not built.
- D (first-time-right on Grafana `mw-agent`): dashboard source under `project/scripts/monitoring/` and the data source it reads. To be filled.
- Documents updated: `project/Documents/Release_Tracker.md`; the rest to be filled.

## Checks
| Command | Result |
| --- | --- |
| To be filled by Byte, Echo and Chase | |
| `npm run check:docs` | To be run by Dewey after the implementation lands |

## Not run
To be filled. PROD deployment, any live financial write and the agent promotion are not authorized.

## Recovery
Git baseline `main` `ee653fa` (R176 owner acceptance). No deployment has happened; DEV or Grafana changes, once applied, are recorded here with their prior state.

## Open questions
- Item C: does the owner want the reply acknowledgement, the clearer result wording and the Review count fix?
- PROD promotion of the agent (A, B) and, if built, C awaits the owner's "move to production".

## Remaining work
Implementation (Byte), tests (Echo), review (Chase), Grafana change (Forge or Byte as assigned), then documentation and this note's Checks.
