# Change notes — R175 Partner message wording and reply handling, and PROD 503 fixes, 18 November 2026

## Purpose
Owner requests, 18 November 2026: (1) "the wording and text layout is not very clear in this scenario (screenshot)" and "also review other ig messages' wording, layout, and user experience", then "go with your recommendations, just don't accept thai response yet"; (2) the PROD 503 fixes, which the owner confirmed in this session to include in R175 (batch 2, below). Agent detail is in the [agent change note](../integration-agent/Change%20Logs/CHANGE_NOTES_PARTNER_MESSAGES_2026-11-18.md). PROD promotion is requested for the release; the promotion record is written at closure.

## Changes
### Batch 1: Partner Instagram messages (agent)
- Evidence (owner, 18 November 2026): a screenshot of a pay-forward options request whose wording and layout were unclear (a slip of 400 with 300 due, two loans), then the request to review the other Instagram messages for wording, layout and user experience. Echo reviewed the messages read-only; Archie's design and Echo's copy were approved by the orchestrator.
- Agent (Byte, commit `3072688c`; revision 47, services unchanged, `R175_REVISIONS` = (46, 47)): (1) the options request layout, short loan labels, first lines and fit ladder; the plain and close reply block; results (`✅ Recorded …`, rejected by the named Reviewer, stale sentences per code, manual choice line, unknown outcome); hold alert reason first; icons (hold cleared ✅, recheck 🔄, ℹ️, three-line ⌛ archive alert); new subjects ("Payment recorded", "Payment slip received", "Slip held", "Slip delayed", "Held slip cleared", "Held slip reply"). (2) One budget `BODY_LIMIT` 997 so the icon is counted (E-X-01 bug fix). (3) Behaviour change: on a plain, overpayment, manual or loan-close request only approval words approve and only `reject`, `rejected`, `no`, `ปฏิเสธ` reject; `ok`, `ไม่`, `ไม่อนุมัติ`, `3`, `recheck` and anything else now re-ask (`OPTIONS_REQUIRED`) instead of rejecting. (4) ℹ️ acknowledgements for replies to decided, replaced or expired requests and for bare answers without Reply, never emailed (`ACKNOWLEDGEMENT_NOT_EMAILED`). (5) `receipt_master` reads "Partner Name" into a separate `partner_names` map. No new Thai reply word (owner: "just don't accept thai response yet"); P-1 (extra numeric formats, Thai digits) is out of scope. No unit, setting, secret, SQL, migration, collector or dashboard change on the agent side. Risk and deploy note: drain the notice queue first (a PENDING notice re-reserved with new wording can fail `NOTICE_CONTENT_CHANGED`).
- Team: Archie (design) and Echo (copy) done; Echo's rendered check and Chase's review pending; a label-collision fix may follow.
- Code and tests (Byte, not edited here): `integration-agent/src/mw_integration_agent/` `partner_review.py`, `partner_notice.py`, `review_cycle.py`, `review_resend.py`, `receipt_hold.py`, `hold_reply.py`, `receipt_master.py`; new `tests/test_partner_messages.py` and updated message tests; `service-catalogue.json`, `scripts/deploy-runtime.py`.
- Docs: `integration-agent/SERVICE_CATALOGUE.md`, `integration-agent/docs/PARTNER_REVIEW.md`, `integration-agent/README.md`, `project/Documents/Release_Tracker.md` and `project/Documents/Development_Changes.md`.

### Batch 2: PROD 503 fixes (placeholder)
Another session delivers these as a pull request into this branch: the `pg` pool `error` listener crash fix in `services/lib/pool.mjs` and speed-ups for two timing-out queries, possibly migration V151. The facts, checks, any migration and backup evidence, and the promotion steps for this batch are added here when it arrives. Nothing in this section is a claim yet.

## Checks
| Command | Result |
| --- | --- |
| Byte (`3072688c`): `ruff check` | Pass |
| Byte: unit tests | 1,091 run, 1 error: `test_receipt_qr` (`zxingcpp` missing locally, pre-existing) |
| Byte: PostgreSQL lab | 80 OK, 13 skipped |
| Echo: rendered check of the messages | PENDING |
| Chase: review | PENDING |
| `npm run check:docs` | 0 failures, 0 warnings |
| The pull request's `Development checks` and integration-agent tests runs | PENDING: cited at closure |
| Batch 2 checks | PENDING: added with the batch |

## Not run
- The full Playwright and `mw-db-ci` suites: the pull request's CI is the one broad run.
- No DEV agent exists, so batch 1 is verified in PROD only after promotion.

## Recovery
Batch 1: Agent: `deploy-runtime.py rollback --commit a2d436049bd0e1989f63437e47211d65c7880d00` (the R174 package), then restart `mw-chat-relay`; no unit changed. No SQL or data change to undo; acknowledgement and re-ask notices already sent stay as ordinary records.
Batch 2: recorded with the batch (a migration, if any, needs the guarded runner and a verified backup).

## Open questions
None for batch 1. Batch 2 scope and any migration are recorded when it arrives.

## Remaining work
Echo's rendered check, Chase's review, batch 2, pull request CI, merge, drain of the notice queue, PROD promotion (agent revision 47, and batch 2's components) and read-back; tag; closure.
