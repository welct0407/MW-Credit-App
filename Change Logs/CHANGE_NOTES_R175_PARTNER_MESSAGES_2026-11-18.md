# Change notes — R175 Partner message wording and reply handling, and PROD 503 fixes, 18 November 2026

## Purpose
Owner requests, 18 November 2026: (1) "the wording and text layout is not very clear in this scenario (screenshot)" and "also review other ig messages' wording, layout, and user experience", then "go with your recommendations, just don't accept thai response yet"; (2) the PROD 503 fixes, which the owner confirmed in this session to include in R175 (batch 2, below). Agent detail is in the [agent change note](../integration-agent/Change%20Logs/CHANGE_NOTES_PARTNER_MESSAGES_2026-11-18.md). PROD promotion is requested for the release; the promotion record is written at closure.

## Changes
### Batch 1: Partner Instagram messages (agent)
- Evidence (owner, 18 November 2026): a screenshot of a pay-forward options request whose wording and layout were unclear (a slip of 400 with 300 due, two loans), then the request to review the other Instagram messages for wording, layout and user experience. Echo reviewed the messages read-only; Archie's design and Echo's copy were approved by the orchestrator.
- Agent (Byte, commits `3072688c`, `f25eb727` and `f3f8ecb1`; revision 47, services unchanged, `R175_REVISIONS` = (46, 47)): (1) the options request layout, short loan labels, first lines and fit ladder; the plain and close reply block; results (`✅ Recorded …`, rejected by the named Reviewer, stale sentences per code, manual choice line, unknown outcome); hold alert reason first; icons (hold cleared ✅, recheck 🔄, ℹ️, three-line ⌛ archive alert); new subjects ("Payment recorded", "Payment slip received", "Slip held", "Slip delayed", "Held slip cleared", "Held slip reply"). (2) One budget `BODY_LIMIT` 997 so the icon is counted (E-X-01 bug fix). (3) Behaviour change: on a plain, overpayment, manual or loan-close request only approval words approve and only `reject`, `rejected`, `no`, `ปฏิเสธ` reject; `ok`, `ไม่`, `ไม่อนุมัติ`, `3`, `recheck` and anything else now re-ask (`OPTIONS_REQUIRED`) instead of rejecting. (4) ℹ️ acknowledgements for replies to decided, replaced or expired requests and for bare answers without Reply, never emailed (`ACKNOWLEDGEMENT_NOT_EMAILED`). (5) `receipt_master` reads "Partner Name" into a separate `partner_names` map. No new Thai reply word (owner: "just don't accept thai response yet"); P-1 (extra numeric formats, Thai digits) is out of scope. No unit, setting, secret, SQL, migration, collector or dashboard change on the agent side. Risk and deploy note: drain the notice queue first (a PENDING notice re-reserved with new wording can fail `NOTICE_CONTENT_CHANGED`).
- Echo's render fixes (`f3f8ecb1`, findings E-R2-01 to E-R2-06): loans with the same terms are labelled by the amount owing with a same-terms note when their choices are identical, and the full-key fallback is removed; `Approved by {name}: {choice}` replaces "Your choice" and is omitted for automatic payments; "Other loan"; the hold alert opens "Slip arrived"; eight English hold reasons reworded; "as Lump Sum."; exact close amounts; result subjects "Slip result" and "ผลสลิป". Worst-case lengths: English 975 and 987, Thai 984 and 975.
- Team: Archie (design) and Echo (copy) done; Echo's first render pass is done and its confirmation is pending; Chase reviewed `3072688c` (no medium or high findings; the Low test gaps were closed by `f25eb727`) and the review of `f3f8ecb1` is pending.
- Code and tests (Byte, not edited here): `integration-agent/src/mw_integration_agent/` `partner_review.py`, `partner_notice.py`, `review_cycle.py`, `review_resend.py`, `receipt_hold.py`, `hold_reply.py`, `receipt_master.py`; new `tests/test_partner_messages.py` and updated message tests; `service-catalogue.json`, `scripts/deploy-runtime.py`.
- Docs: `integration-agent/SERVICE_CATALOGUE.md`, `integration-agent/docs/PARTNER_REVIEW.md`, `integration-agent/README.md`, `project/Documents/Release_Tracker.md` and `project/Documents/Development_Changes.md`.

### Batch 3: agent migration V14, `audit.events_kind_idx` (PR #362, another session; not merged yet)
Owner confirmed in this session (18 November 2026) that it is part of R175. Migration V14 adds `audit.events_kind_idx` on `audit.events(event_kind)`. Purpose: `receipt_health.acknowledged` scanned all of `audit.events` (114,759 rows, 129 MB) every 2 minutes, the largest I/O consumer on the shared Cloud SQL instance. Its lab job failed on two tests that pin V13 as the last agent migration, and that is being fixed in the PR. Promotion: a verified `mw_agent` backup, freeze, `agent-state-admin.py migrate`, install, activate; undo is `DROP INDEX`. The PR brings its own agent change note, referenced here when it is merged; the Environment Inventory `mw_agent` row is updated at closure. Nothing in this section is verified until the PR merges and the promotion runs.

### Batch 2: PROD 503 fixes (placeholder)
Another session delivers these as a pull request into this branch: the `pg` pool `error` listener crash fix in `services/lib/pool.mjs` and speed-ups for two timing-out queries, possibly migration V151. The facts, checks, any migration and backup evidence, and the promotion steps for this batch are added here when it arrives. Nothing in this section is a claim yet.

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
| Batch 2 checks | PENDING: added with the batch |
| Batch 3 (V14) checks | PENDING: PR #362's lab job failed on two tests pinning V13 as last; being fixed; added with the batch |

## Not run
- The full Playwright and `mw-db-ci` suites: the pull request's CI is the one broad run.
- No DEV agent exists, so batch 1 is verified in PROD only after promotion.

## Recovery
Batch 1: Agent: `deploy-runtime.py rollback --commit a2d436049bd0e1989f63437e47211d65c7880d00` (the R174 package), then restart `mw-chat-relay`; no unit changed. No SQL or data change to undo; acknowledgement and re-ask notices already sent stay as ordinary records.
Batch 3 (V14): `DROP INDEX audit.events_kind_idx` (an index only; no data change), after the agent code is rolled back if needed. Batch 2: recorded with the batch (a migration, if any, needs the guarded runner and a verified backup).

## Open questions
None for batch 1. Batch 2 scope and any migration are recorded when it arrives; batch 3 is owner-confirmed.

## Remaining work
Echo's confirmation, Chase's review of `f3f8ecb1`, batch 2, batch 3 (V14), pull request CI, merge, drain of the notice queue, PROD promotion (agent revision 47, and batch 2's components) and read-back; tag; closure.
