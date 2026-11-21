# Change notes — R179 hold reply names the borrower, 21 November 2026

## Purpose
Owner request of 21 November 2026: a reviewer can reply to a hold alert for a slip whose borrower the agent could not identify with the borrower's name, and the slip is then processed the normal way (automatic when it can be, a review with options when it needs one). Promoted to PROD on 21 November 2026 under the owner's "Move to prod".

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
Not verified in PROD: a real name reply and a real learned name, which need a natural hold. No live financial write was made. A skipped check is not a pass.

## Recovery
Git baseline `main` `5a418ab4` (R178 closure). PROD baseline agent R177 `0f668aa2`; see the PROD promotion record below. The code lives in `1dc2271f` and, in part, `a8305afa`.

## Open questions
To be filled.

## Applied
Promoted to PROD on 21 November 2026 (agent freeze 05:51:27Z, activate 05:51:50Z) under the owner's "Move to prod": the Debian agent on R179 with both designation switches on. Tag `R179` (annotated, object `d497fe88`) on `7ab7b436` by the Release tag workflow. No migration, catalogue, unit, Grafana, image, Hosting or Metabase change.

## Closure records (Dewey)
- Environment inventory: the agent commit and catalogue rows; component versions regenerated (`render --write`, `render --check`).
- Pruned at closure (Open R180 plus the three newest Released: R179, R178, R177): `Change Logs/CHANGE_NOTES_R176_PROJECTED_GOAL_MONTH_2026-11-19.md`, with its links repointed to permalinks at `7ab7b436`; the R176 follow-up row of the open development changes is removed. Also deleted as evidence nothing current cites after that: `project/outputs/dictionary-r176-20261119/`, and as an unlinked note outside the window: `Change Logs/CHANGE_NOTES_IPHONE_WEBKIT_ROUTINE_2026-11-06.md`.
- Drift (`drift --env prod`): 0 drift, 7 unverified (credentialed facts such as the agent `/ready`, schema, Grafana tags and notify and jobs were not observed in this session). The agent facts are in the promotion record below.

## Remaining work
Owner acceptance of R177, R178 and R179, written into the next release's closure pull request. Watch for the first natural name reply and learned name in PROD.

## PROD promotion record (Forge, 21 November 2026 UTC)
Authority: owner, 21 November 2026, in session: "Move to prod". Scope: agent code only; no migration (`mw_agent` V15), catalogue change (47), unit change, Grafana change, Cloud Run image, Hosting, Metabase or financial write.

Package: `main` 7ab7b4363158088733d4e6f3b3f8540b947418de (PR #373). CI: Development checks 44871848577, agent tests 44871848566. Baseline: agent R177 `0f668aa2`.
Target: project clever-oasis-508610-n7, VM vm-mw-credit-agent (asia-southeast1-a).

| Step | Result |
| --- | --- |
| Checkout fast-forward | HEAD 7ab7b43, clean |
| Dry run | Changed modules `cli`, `config`, `hold_reply`, `partner_notice`, `partner_review`, `receipt_health`, `receipt_hold`, `receipt_identity`, `receipt_run`, `review_cycle`, `review_resend`; units unchanged; ancestry ancestor; schema 15; catalogue 47 |
| Config before the freeze | `/root/config.json.pre-r179`; only the two keys added (false); `receipt_hold_reply_cutoff` and `payer_name_cutoff` set; `check` ok |
| Freeze | 05:51:27Z; `runtime-20261121T055127222900Z`; metadata sha256 0848bfdfc1ced01af2973e1adbbd7935453c845a23a9ecfe2a7748d0b81644e3 |
| Install and activate | Temporary operator file for the schema check removed 05:51:52Z; units unchanged; receiver ready, release R179, commit 7ab7b43 (started 05:51:49.99Z); 9 timers and paths resumed |
| Switches on | `config-only-change.py --tag r179-switches`, backup `/root/config.json.pre-r179-switches`, config sha256 45da9a4c…915e5; `check`: both switches true; recognizer and relay R179; problems none |
| Run after the switches | Receipt cycle COMPLETED 2026-11-21T05:52:48Z exit 0 (normal trigger) |
| Warnings since the freeze | None; no failed units |

Recovery: `deploy-runtime.py rollback --commit 0f668aa27990372765a02cd8d1fb979ff9ff9847` (rollback folder above); config `/root/config.json.pre-r179` or `config-only-change.py restore --tag r179-switches`.
