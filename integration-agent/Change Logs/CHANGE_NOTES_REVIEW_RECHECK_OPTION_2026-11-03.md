# Change notes — recheck option on pay-forward reviews, 3 November 2026

## Purpose
Owner request, 3 November 2026: a slip of ฿150 (due ฿100) came back as a pay-forward options request. The owner wants another choice: add a late fee for yesterday's or today's charge in the app, then have the agent process the whole slip again against the updated charges, instead of only pay forward, repay principal, split or reject.

## Changes
- `partner_review.py`: the options reply accepts `4` (also `recheck`, `ตรวจใหม่`). In the decision's transaction the pending review becomes `SUPERSEDED` with detail `REVIEWER_REQUESTED_RECHECK` and its job id renamed `<job>:superseded:<review>`. The prior job state goes into `receipt_reconsiderations`, and the receipt job returns to `VALIDATED` (attempts reset). This is the same shape as `receipt-reconsider`. A decided review, a reply to the old message or an unauthorized sender changes nothing. The request lists `4 recheck after editing charges in the app` (Thai `4 ตรวจใหม่หลังแก้ยอดในแอป`), and the unclear-reply prompt names 4.
- `review_cycle.py`: a `4` reserves an acknowledgement `review-result:<review>:RECHECK` ("Planning again from the current charges in the app; the result follows in the next message. Nothing has been posted yet."). The new request after a recheck carries the existing "Corrected request — replaces the earlier request" heading. In production (image phase) the receipt is planned again in the same run. If it is then within what is due, it posts under the existing automatic-payment policy; otherwise a new options request goes out.
- No schema, catalogue or configuration change. `SUPERSEDED` and `receipt_reconsiderations` already exist (agent V2).
- Docs: `docs/PARTNER_REVIEW.md` (pay-forward options, Recheck).

## Checks
| Command | Result |
| --- | --- |
| `PYTHONPATH=src python3 -m unittest tests.test_partner_review_options tests.test_review_cycle_options tests.test_receipt_reconsider tests.test_partner_review tests.test_review_cycle tests.test_review_resend` (in `integration-agent/`) | 135 tests OK. New: 4, `Recheck` and `ตรวจใหม่` supersede and requeue; 4 is final; 4 after a decision and from an unauthorized sender change nothing; the request offers 4; the cycle plans again with a corrected request and an acknowledgement, and a reply to the old message decides nothing; the production order plans again in the same run. |
| `PYTHONPATH=src python3 -m unittest discover -s tests` | 619 tests: the same 1 failure and 22 errors with and without this change (no `psycopg` or PostgreSQL lab in this cloud session); none new |
| `ruff check --no-cache integration-agent` | Clean |

## Not run
- The pull request's agent CI and PostgreSQL lab suites (CI).
- Deployment: `deploy-runtime.py` needs the owner's go for the exact commit after merge.

## Recovery
Before deployment: none needed. After deployment: `deploy-runtime.py rollback --commit <deployed>` restores the previous runtime. Reviews superseded by 4 stay superseded, and their receipts are planned again or reviewed as usual.

## Open questions
None.

## Remaining work
- Merge, then deploy with `deploy-runtime.py` on the owner's go.
