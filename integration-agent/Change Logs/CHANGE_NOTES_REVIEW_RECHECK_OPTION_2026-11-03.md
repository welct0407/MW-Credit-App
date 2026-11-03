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
- Nothing further: the pull request's agent CI (`test`, `lab`) passed on `7049f815` (run 41613310540).

## Recovery
Before deployment: none needed. After deployment: `deploy-runtime.py rollback --commit <deployed>` restores the previous runtime. Reviews superseded by 4 stay superseded, and their receipts are planned again or reviewed as usual.

## Open questions
None.

## Remaining work
<<<<<<< HEAD
None.

## Deploy record
Owner go in session: "Merge and deploy the agent after CI green". PR #220 merged as `5ebe13c7`. VM `vm-mw-credit-agent`, 3 November 2026 (UTC), by `deploy-runtime.py`.
| Step | Evidence |
| --- | --- |
| Checkout | `update-from-github.sh` fast-forward to `5ebe13c7c546db61b397694c8d5af69da266a8b1` |
| Dry run | live `code_version` `05562375` (ancestor); agent schema applied through V11, nothing missing; no unit changes |
| Freeze | 09:47:49Z, rollback directory `runtime-20261103T094749365538Z` (metadata sha256 `5da2842b…16dc`) |
| Install and activate | install 09:47:50Z, no files removed, no unit changes; activate 09:47:55Z to 09:47:59Z, probe `9bdc9efc-3672-428d-9311-b7425593cd21`; all six timers and path units resumed |
| Readback | `/ready` true, `code_version` `5ebe13c7`, `failed` []; `check` status ok (`pay_forward_options` true); receipt cycles after activation `failures` [] and `notification_failures` [] |
Deviation, as in R094: the deploy engine needed an `mw_agent` operator connection file that was absent on the VM. A temporary root-only file (`postgres` through the 5432 proxy; password on stdin from Secret Manager, never printed) was created and shredded after activation.
=======
- Merge, then deploy with `deploy-runtime.py` on the owner's go.

## Follow-up: 4 on a review made stale by the charge edit (same day)
- **What happened:** Ton's ฿150 slip, 3 November 2026.
  - The owner added the late fee in the app.
  - At 16:52:14 the owner sent `Review` (resend), which queued a resend of the open options.
  - Before sending, the delivery check compared the review with the edited charges and marked it `STALE` (`PROPOSAL_FACTS_CHANGED`). The "Facts changed" result went out.
  - The owner's `4` at 16:52:47 was then `ALREADY_DECIDED`.
- **Recovery:** the owner's `4` asked for a recheck, so the slip was re-queued with `receipt-reconsider` (prior review superseded). It was planned again from the current charges and posted as an ordinary Lump Sum under the automatic-payment policy: payment `pwa:26f4a3ad-06b3-4d06-94d2-cc6ac0ee34ba`.
- **Fix in `partner_review.py`:** a `4` also rechecks an options review that is `STALE` only because the charges changed (`PROPOSAL_FACTS_CHANGED`, `PAY_FORWARD_PLAN_CHANGED`) and has not expired.
  - The supersede update is guarded on the exact state and detail it read.
  - Other stale reasons, an expired review, and any reply other than `4` stay `ALREADY_DECIDED`.
- **Tests:**
  - Both stale reasons recheck.
  - Day passed, account changed and date too old stay decided.
  - `1` on a stale review stays decided.
  - An expired stale review stays decided.
  - A cycle test reproduces the incident: stale, then `4`, then a new pending review in the same run.
- **Checks:** related suites 139 tests OK; `ruff check --no-cache integration-agent` clean.
>>>>>>> origin/main
- **Deploy (owner go in session: "Merge and deploy it"):** PR #221 merged as `9703a191`; agent CI `test` and `lab` passed on `aa85d939`.
  - `deploy-runtime.py` on `vm-mw-credit-agent`, 3 November 2026 (UTC). The dry run showed live `5ebe13c7` (ancestor) and schema through V11 with nothing missing.
  - Freeze at 10:00:28Z: `runtime-20261103T100028976686Z` (metadata sha256 `c2ce5fa1…43bf`).
  - Install at 10:00:46Z: no files removed and no unit changes.
  - Activate from 10:00:51Z to 10:00:56Z, probe `96fda169-07b6-4978-af14-41fbfa6eda86`; all six timers and path units resumed.
  - Readback: `/ready` true with `code_version` `9703a191`, `check` ok, and the receipt cycles after it had no failures.
  - The same temporary root-only `mw_agent` connection file was created and shredded as above.
