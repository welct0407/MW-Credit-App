# Change notes — partner notice amount and Payment ID, 16 November 2026

## Purpose
Owner request, 16 November 2026: in the Instagram message, remove the decimals and the payment ID, because the ID means nothing to the reader.

## Changes
- `partner_notice.py`: new `notice_amount` (whole baht without decimals, separators kept; satang kept exactly, never rounded). `receipt_notice`: every notice body (Payment processed, Payment receipt received, Loan closed; English and Thai; the email fallback reuses the body) shows the amount without ".00" (thousands separator kept, for example `1,100 baht`; non-zero satang kept, for example `800.50`; never rounded) and no longer has the Payment ID / รายการชำระเงิน line. A payment ID still selects the "processed" subject.
- `partner_review.py` (`compose_request`, the payment approval request, and `close_request_text`, the loan close approval request): English and Thai use `notice_amount`.
- `review_cycle.py` (lines 211-212): the "Rechecking slip" / "ตรวจสลิปใหม่" IG notice shows the amount through `notice_amount` ("฿1,500").
- Tests: `test_review_cycle_options.py` (line 213 asserts ' ฿1,500\n'), `test_partner_notice.py`, `test_review_close.py`, `test_partner_review.py` (line 116, 450.00 to 450).
- Docs: `docs/RECEIPTS.md` (notice content and approval requests), `scripts/generate-business-process.py` and the generated `docs/BUSINESS_PROCESS.drawio` (processed template line), `project/Documents/Release_Tracker.md` (R164 scope).
- No schema, catalogue, infrastructure, financial write or deployment. The change is live only after a separate owner-authorized agent deployment.

## Checks
| Command | Result |
| --- | --- |
| `python -m unittest tests.test_partner_notice tests.test_review_close tests.test_partner_review` (in `integration-agent/`, `PYTHONPATH=src`, venv from `requirements.lock`) | 73 tests OK |
| `python -m unittest discover -s tests` (same venv) | 985 tests OK, 76 skipped |
| `ruff check src tests` | Passed |
| `npm run check:docs` | 0 failures, 0 warnings |
| Chase review (adversarial diff review) | Passed: no Payment ID printed anywhere in src; no import cycle (`partner_review`, `partner_notice`, `review_cycle`, `receipt_rules` import cleanly); `notice_amount` edge cases (exponent forms, negatives, 0, satang 800.5 to 800.50, 800.505 kept exactly). Found the recheck notice, since fixed |
| `python -m unittest discover -s tests -p 'test_review_cycle*.py'` (Byte re-run) | 102 tests OK |
| `ruff check` on the two changed files (Byte re-run) | Passed |
| Pull request `Development checks` | The one broad run; result to be added |

## Not run
- No deployment; the live effect needs an owner-authorized agent deployment.

## Recovery
Before deployment: revert the commit. After deployment: `deploy-runtime.py rollback --commit <deployed>` restores the previous runtime. Notices already sent are not changed.

## Known limitations
- The email receipt summary (`receipt_rules.summary`) still shows two decimals; it is email, not IG, and outside the ask.
- `partner_review.baht()` still rounds the ฿ option and closing lines (pre-existing; close quotes are whole baht).

## Open questions
None.

## Remaining work
Agent deployment to apply the new text live, when the owner authorizes it.
