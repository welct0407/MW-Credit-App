# Change notes — review command lists held receipts, 8 November 2026

## Purpose
Owner request, 8 November 2026 (Asia/Bangkok): "I want the 'review' command to bring everything pending into the review list again, so I can review and approve/reject them one by one." Owner decision: held receipts are Reject-only; a genuine payment is recorded in the app by the reviewer. Read-only evidence on 8 November: one hold (`IG_CONVERSATION_IDENTITY_AMBIGUOUS`, held 29 October 01:22) never appeared in `review`; the owner's `review` commands of 6 November 15:56 and 8 November 16:08 and 18:22 were processed (`RESEND_QUEUED`) and the "no pending requests" acknowledgement was accepted by IG each time. The owner then rejected the hold (`HOLD_REJECTED`); the held count is 0.

## Changes
- `review` / `reviews` / `resend review` (standalone, signed, reviewer; authorization and cutoffs unchanged) now resend pending unexpired proposals and every active validation hold (`receipt_jobs` in `REVIEW`, no age limit; a hold whose job has a live or decided proposal is skipped), oldest first, first line prefixed `i/N · `; a resent hold starts `Still held since <date> (<n> days)`.
- Hold copy key `<receipt-held key>:resend:<sha256 of the command message id>`; `receipt_hold.base_key` makes hold reply, the dispatch guard and monitoring treat it as the same hold (Reject on either copy works once; monitoring counts it delivered without resetting age). Archive-pending alerts and decided results are not resent.
- Acknowledgement `Review list: N payment requests · M held receipts…` (English and Thai), `More follow over the next few minutes` above six notices (notify cap 6 per pass), and `Nothing is waiting for review: no payment requests and no held receipts.`
- Hold message closing block: cannot be approved here; record a genuine payment in the app; reply Reject to clear. New `HOLD_REJECTED` and `HOLD_REJECT_REQUIRED` texts. 14 missing hold reason codes get English and Thai wording; clearer fallback.
- Deviations from the design (Byte): holds are resent only when the existing `receipt_hold_notice_cutoff` is set; a hold must exist when the command was sent (`created_at` not after the command's event time); resent holds share the request priority and go out in counter order; the `i/N · ` counter is dropped on a copy that would exceed 1000 characters; the age reads `1 day` singular and `(0 days)` on the same day; `REASONS` is now a module-level table; a malformed `:resend:` suffix fails closed.
- Source (`integration-agent/src/mw_integration_agent/`): `receipt_hold.py`, `review_resend.py`, `hold_reply.py`, `review_cycle.py`, `receipt_health.py`. Tests (`integration-agent/tests/`): `test_review_resend.py`, `test_hold_reply.py`, `test_review_cycle.py`, `test_receipt_health.py`, `test_payer_resolution.py`.
- Docs: `integration-agent/docs/PARTNER_REVIEW.md` (resend section, hold rejection, held alerts), `integration-agent/SERVICE_CATALOGUE.md` (revision 24 line pointer; revision number stays 36, no service or switch change), `project/Documents/Release_Tracker.md` (R135 scope).
- No schema, configuration switch, infrastructure or PWA change. Forge: not applicable.

## Checks
| Command | Result |
| --- | --- |
| `ruff check --no-cache integration-agent` (ruff 0.16.8) | Pass (Byte) |
| Unit tests of the six affected modules (Byte) | 186 tests OK |
| `PYTHONPATH=src python3 -m unittest discover -s tests` (in `integration-agent/`, Byte) | 813 tests OK, 70 skipped (PostgreSQL lab suites) |
| `npm run check:docs` | 0 failures (Dewey) |
| Chase: 5 affected modules rerun, plus adversarial SQLite probes (authorization, crafted `:resend:` keys, changed reason, double dismissal, replay, monitoring counts, ordering) | 153 tests OK; no defects |
| Pull request `Development checks` (the broad run) | Runs when a pull request is opened for this branch |

## Not run
- A live Instagram send of the resent items: not run; it needs the agent deploy. The background evidence (the held job and the three acknowledged `review` commands) came from read-only `mw_agent` queries as `codex-cloud-read`.

## Known limitations (Chase, non-blocking)
- A delivered resent copy counts as the hold's alert, so a failed original alert stops counting in `unnotified_holds` once a copy is accepted.
- If a command is interrupted and the pending set changes before recovery, later copies get a recomputed `i/N`; a copy whose counter was dropped sorts first in its group. Cosmetic and rare.
- With every extracted field at its 100-character cap, some English hold bodies exceed 1000 characters and are refused as `NOTICE_TOO_LONG`, as before; the Reject-only closing block is about 75 characters longer than the old text. Realistic slips stay under 900.

## Recovery
Before deployment: none needed. After deployment: `deploy-runtime.py rollback --commit <deployed>` restores the previous runtime. Resent hold copies already delivered stay in the journal; rejecting a hold is the existing REVIEW to REJECTED transition and is not undone.

## Open questions
None. Activation is the normal agent deploy, to be authorized separately by the owner.

## Remaining work
The pull request's `Development checks` run; agent deploy on the owner's instruction, then a read-only check that the owner's next `review` lists any active holds.
