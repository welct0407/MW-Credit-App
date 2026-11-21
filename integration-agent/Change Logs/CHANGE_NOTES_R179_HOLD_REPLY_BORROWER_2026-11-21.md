# Change notes — R179 hold reply names the borrower, 21 November 2026

## Purpose
Owner request of 21 November 2026: a reviewer can reply to a hold alert for a slip whose borrower the agent could not identify with the borrower's name, and the slip is then processed the normal way (automatic when it can be, a review with options when it needs one). Build and test are authorized; PROD promotion is not yet authorized.

Owner decisions of 21 November 2026: a designated slip that can be processed posts automatically (actor: the configured automatic actor); payer-name learning for designated slips ("Yes remember the name"). Switches: `receipt_hold_designation_enabled` (main) and `receipt_hold_designation_learn_enabled` (learning); both default off in code and are to be switched on at promotion.

Evidence (read-only, PROD, 6 to 20 November 2026, aggregates only): borrower-identity holds were mostly PAYER_UNRESOLVED (9) and PAYER_NAME_UNREADABLE (1). To be filled.

## Changes
- Hold reply naming the borrower: `hold_reply.py`, `partner_review.py`, `receipt_identity.py`, `receipt_health.py` and related modules, tests and `config.example.json` (Byte, `1dc2271f`). Part of this code was swept into the records commit `a8305afa` (a staging slip; history is left as is).
- Switches `receipt_hold_designation_enabled` (needs `receipt_hold_reply_cutoff` and `payer_name_cutoff`) and `receipt_hold_designation_learn_enabled` (needs the first); strict booleans, default off, reported by `check`; no catalogue revision.
- Eligible holds: PAYER_UNRESOLVED, PAYER_NAME_UNREADABLE, PAYER_NAME_OTHER_BORROWER, IG_CONVERSATION_IDENTITY_AMBIGUOUS; an archived image is required (else HOLD_IMAGE_UNAVAILABLE); today or yesterday (else HOLD_TOO_OLD).
- The name must resolve to exactly one AI-enabled borrower, else a re-ask with candidates; Reject words first, approval words never looked up. Accepted: 🔄 notice, one guarded requeue, sender and payer resolution skipped only, every other guard kept; automatic post for an ordinary payment (configured automatic actor), else the normal request; result notices add "Borrower named by {reviewer}".
- Audit `hold_borrower_designated`; name learning on posted receipts only, never evicting at five lines, skipping a name that matches another enabled borrower or is unreadable (`designated_payer_name_not_learned`, reason code only); `receipt_health` counts the new acknowledgements.
- Documents updated: `Release_Tracker.md`, `Development_Changes.md`, `integration-agent/README.md`, `integration-agent/docs/PARTNER_REVIEW.md`, `CONVERSATION_POLL.md`, `OPERATIONS.md`, `RECEIPTS.md`.

## Checks
| Command | Result |
| --- | --- |
| ruff | Pass (Byte, `1dc2271f`) |
| Agent unit tests | 1,165 OK, 82 skipped (Byte, `1dc2271f`) |
| Chase review (`R179_verify.md`): PostgreSQL lab proof, `test_r179_hold_designation_transaction_and_guards_on_postgres` | Pass: REVIEW to PENDING, one reconsideration and one reply row, HOLD_NOT_ACTIVE and HOLD_HAS_REVIEW refusals, stale-read UPDATE guard, a real two-connection race with Reject |
| Chase adversarial review; learning checks; HOLD_IMAGE_UNAVAILABLE fail-safe | Pass |
| Defect found by Chase (Medium): designation and learning audit raised AUDIT_TERMINAL_TRANSITION on replay on PostgreSQL | Fixed in `12b06bba` (one keyed COMPLETED event per key in one transaction); proven by `test_r179_designation_audit_is_idempotent_and_private_on_postgres` |
| Chase (Low): learning gated on `payer_name_cutoff` | Fixed in `12b06bba` |
| Disposable PostgreSQL lab `tests.test_postgres_state` | 49 OK (Byte, `12b06bba`) |
| Unit `test_hold_designation`, `test_hold_reply`, `test_payer_resolution`, `test_review_cycle`, `test_receipt_identity`; ruff | OK, ruff clean (Byte, `12b06bba`) |
| HOLD_TOO_OLD wording (Echo) | Applied in `34aa8328` |
| `npm run check:docs` | 0 failures (Dewey) |

## Not run
PROD promotion is not authorized and no live financial write was made. A skipped check is not a pass.

## Recovery
Git baseline `main` `5a418ab4` (R178 closure). No deployment has happened; the code lives in `1dc2271f` and, in part, `a8305afa`.

## Open questions
To be filled.

## Remaining work
Design (Archie), implementation (Byte), tests (Echo), review (Chase), then documentation and this note.
