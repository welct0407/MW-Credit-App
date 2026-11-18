# Change notes — Partner Instagram message wording and reply handling (R175 agent part), 18 November 2026

## Purpose
Owner request, 18 November 2026: a screenshot of an unclear pay-forward options request and "also review other ig messages' wording, layout, and user experience", then "go with your recommendations, just don't accept thai response yet". This note covers the agent part; the release record (both batches) is the [root note](../../Change%20Logs/CHANGE_NOTES_R175_PARTNER_MESSAGES_2026-11-18.md).

## Changes
- Evidence (owner, 18 November 2026): a screenshot of a pay-forward options request whose wording and layout were unclear (a slip of 400 with 300 due, two loans), then the request to review the other Instagram messages for wording, layout and user experience. Echo reviewed the messages read-only; Archie's design and Echo's copy were approved by the orchestrator.
- Agent (Byte, commits `3072688c`, `f25eb727` and `f3f8ecb1`; revision 47, services unchanged, `R175_REVISIONS` = (46, 47)): (1) the options request layout, short loan labels, first lines and fit ladder; the plain and close reply block; results (`✅ Recorded …`, rejected by the named Reviewer, stale sentences per code, manual choice line, unknown outcome); hold alert reason first; icons (hold cleared ✅, recheck 🔄, ℹ️, three-line ⌛ archive alert); new subjects ("Payment recorded", "Payment slip received", "Slip held", "Slip delayed", "Held slip cleared", "Held slip reply"). (2) One budget `BODY_LIMIT` 997 so the icon is counted (E-X-01 bug fix). (3) Behaviour change: on a plain, overpayment, manual or loan-close request only approval words approve and only `reject`, `rejected`, `no`, `ปฏิเสธ` reject; `ok`, `ไม่`, `ไม่อนุมัติ`, `3`, `recheck` and anything else now re-ask (`OPTIONS_REQUIRED`) instead of rejecting. (4) ℹ️ acknowledgements for replies to decided, replaced or expired requests and for bare answers without Reply, never emailed (`ACKNOWLEDGEMENT_NOT_EMAILED`). (5) `receipt_master` reads "Partner Name" into a separate `partner_names` map. No new Thai reply word (owner: "just don't accept thai response yet"); P-1 (extra numeric formats, Thai digits) is out of scope. No unit, setting, secret, SQL, migration, collector or dashboard change on the agent side. Risk and deploy note: drain the notice queue first (a PENDING notice re-reserved with new wording can fail `NOTICE_CONTENT_CHANGED`).
- Echo's render fixes (`f3f8ecb1`, findings E-R2-01 to E-R2-06): loans with the same terms are labelled by the amount owing with a same-terms note when their choices are identical, and the full-key fallback is removed; `Approved by {name}: {choice}` replaces "Your choice" and is omitted for automatic payments; "Other loan"; the hold alert opens "Slip arrived"; eight English hold reasons reworded; "as Lump Sum."; exact close amounts; result subjects "Slip result" and "ผลสลิป". Worst-case lengths: English 975 and 987, Thai 984 and 975.
- Team: Archie (design) and Echo (copy) done; Echo's first render pass is done and its confirmation is pending; Chase reviewed `3072688c` (no medium or high findings; the Low test gaps were closed by `f25eb727`) and the review of `f3f8ecb1` is pending.
- Code and tests (Byte, not edited here): `integration-agent/src/mw_integration_agent/` `partner_review.py`, `partner_notice.py`, `review_cycle.py`, `review_resend.py`, `receipt_hold.py`, `hold_reply.py`, `receipt_master.py`; new `tests/test_partner_messages.py` and updated message tests; `service-catalogue.json`, `scripts/deploy-runtime.py`.
- Docs: `SERVICE_CATALOGUE.md`, `docs/PARTNER_REVIEW.md`, `README.md`.

## Checks
| Command | Result |
| --- | --- |
| Byte (`3072688c`): `ruff check` | Pass |
| Byte: unit tests | `3072688c`: 1,091 run, 1 error: `test_receipt_qr` (`zxingcpp` missing locally, pre-existing). `f25eb727`: 227 tests (design cases 20 to 24) OK. `f3f8ecb1`: 1,100 run, only `test_receipt_qr` errors |
| Byte: PostgreSQL lab | 80 OK, 13 skipped |
| Echo: rendered check of the messages | First pass done, findings E-R2-01 to E-R2-06 applied in `f3f8ecb1`; confirmation PENDING |
| Chase: review | `3072688c`: no medium or high findings, lab 80 OK with 13 skipped, Low test gaps closed by `f25eb727`; `f3f8ecb1`: PENDING |
| `npm run check:docs` | 0 failures, 0 warnings |
| The pull request's `Development checks` and integration-agent tests runs | PENDING: cited at closure |

## Not run
- The full Playwright and `mw-db-ci` suites: the pull request's CI is the one broad run.
- No DEV agent exists, so the message layouts and the re-ask are verified in PROD only after promotion, on the first real reviewer message.

## Recovery
Agent: `deploy-runtime.py rollback --commit a2d436049bd0e1989f63437e47211d65c7880d00` (the R174 package), then restart `mw-chat-relay`; no unit changed. No SQL or data change to undo; acknowledgement and re-ask notices already sent stay as ordinary records.

## Open questions
None. Thai reply words stay as they are; a later owner decision would add any.

## Remaining work
Echo's confirmation, Chase's review of `f3f8ecb1`, pull request CI, merge, drain of the notice queue, PROD promotion (agent deploy at revision 47) and read-back; tag; closure.
