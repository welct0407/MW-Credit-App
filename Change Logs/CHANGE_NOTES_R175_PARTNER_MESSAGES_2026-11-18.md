# Change notes — R175 Partner message wording and reply handling, and PROD 503 fixes, 18 November 2026

## Purpose
Owner requests, 18 November 2026: (1) "the wording and text layout is not very clear in this scenario (screenshot)" and "also review other ig messages' wording, layout, and user experience", then "go with your recommendations, just don't accept thai response yet"; (2) the PROD 503 fixes and the audit index, which the owner confirmed in this session to include in R175 (batches 2 and 3, below). Agent detail is in the [agent change note](../integration-agent/Change%20Logs/CHANGE_NOTES_PARTNER_MESSAGES_2026-11-18.md). PROD promotion is requested for the release; the promotion record is written at closure.

## Changes
### Batch 1: Partner Instagram messages (agent)
- Evidence (owner, 18 November 2026): a screenshot of a pay-forward options request whose wording and layout were unclear (a slip of 400 with 300 due, two loans), then the request to review the other Instagram messages for wording, layout and user experience. Echo reviewed the messages read-only; Archie's design and Echo's copy were approved by the orchestrator.
- Agent (Byte, commits `3072688c`, `f25eb727` and `f3f8ecb1`; revision 47, services unchanged, `R175_REVISIONS` = (46, 47)): (1) the options request layout, short loan labels, first lines and fit ladder; the plain and close reply block; results (`✅ Recorded …`, rejected by the named Reviewer, stale sentences per code, manual choice line, unknown outcome); hold alert reason first; icons (hold cleared ✅, recheck 🔄, ℹ️, three-line ⌛ archive alert); new subjects ("Payment recorded", "Payment slip received", "Slip held", "Slip delayed", "Held slip cleared", "Held slip reply"). (2) One budget `BODY_LIMIT` 997 so the icon is counted (E-X-01 bug fix). (3) Behaviour change: on a plain, overpayment, manual or loan-close request only approval words approve and only `reject`, `rejected`, `no`, `ปฏิเสธ` reject; `ok`, `ไม่`, `ไม่อนุมัติ`, `3`, `recheck` and anything else now re-ask (`OPTIONS_REQUIRED`) instead of rejecting. (4) ℹ️ acknowledgements for replies to decided, replaced or expired requests and for bare answers without Reply, never emailed (`ACKNOWLEDGEMENT_NOT_EMAILED`). (5) `receipt_master` reads "Partner Name" into a separate `partner_names` map. No new Thai reply word (owner: "just don't accept thai response yet"); P-1 (extra numeric formats, Thai digits) is out of scope. No unit, setting, secret, SQL, migration, collector or dashboard change on the agent side. Risk and deploy note: drain the notice queue first (a PENDING notice re-reserved with new wording can fail `NOTICE_CONTENT_CHANGED`).
- Echo's render fixes (`f3f8ecb1`, findings E-R2-01 to E-R2-06): loans with the same terms are labelled by the amount owing with a same-terms note when their choices are identical, and the full-key fallback is removed; `Approved by {name}: {choice}` replaces "Your choice" and is omitted for automatic payments; "Other loan"; the hold alert opens "Slip arrived"; eight English hold reasons reworded; "as Lump Sum."; exact close amounts; result subjects "Slip result" and "ผลสลิป". Worst-case lengths: English 975 and 987, Thai 984 and 975.
- Team: Archie (design) and Echo (copy) done; Echo's first render pass is done and its confirmation is pending; Chase reviewed `3072688c` (no medium or high findings; the Low test gaps were closed by `f25eb727`) and the review of `f3f8ecb1` is pending.
- Code and tests (Byte, not edited here): `integration-agent/src/mw_integration_agent/` `partner_review.py`, `partner_notice.py`, `review_cycle.py`, `review_resend.py`, `receipt_hold.py`, `hold_reply.py`, `receipt_master.py`; new `tests/test_partner_messages.py` and updated message tests; `service-catalogue.json`, `scripts/deploy-runtime.py`.
- Docs: `integration-agent/SERVICE_CATALOGUE.md`, `integration-agent/docs/PARTNER_REVIEW.md`, `integration-agent/README.md`, `project/Documents/Release_Tracker.md` and `project/Documents/Development_Changes.md`.

### Batch 2: PROD 503 fixes and upcoming-view cost (PR #363, merged as `cbda7a99`; head `6bf75c1`)
Detail is in the [batch 2 change note](CHANGE_NOTES_R175_DB_TIMEOUTS_2026-11-18.md); in short: the PROD Grafana "5xx · all services" panel was above 0 almost every day since 5 November 2026. Evidence: 9 Postgres statement timeouts from 10 to 16 November (6 in `read-prod` `upcoming_summary`, 3 in `command-prod` `offline_dataset`), coinciding with CPU spikes to 67 to 92% on `db-g1-small`; PROD `pg_stat_statements` reader snapshot mean 540 ms (max 4,526 ms) and offline `borrowerUpcomingCte` mean about 850 ms (max 7,738 ms). A command-prod crash on 17 November 2026 at 16:18:51Z was an unhandled `error` (ECONNRESET) on a checked-out pg client. One more timeout (`notify-prod` `pwa_notify_candidates_v1`, 11 November) is unexplained and has no change here.
- `services/lib/pool.mjs`: a `connect` listener so a client error no longer ends the process (every service that bundles `services/lib`).
- Migration V151 `V151__upcoming_forecast_borrower_pushdown.sql`, views only (no table, column, grant, function or data change): `oltp_upcoming_charge_events_v1` loses `MATERIALIZED` on `raw` so the borrower filter reaches the simulation; `oltp_upcoming_charge_coverage_v1` becomes one aggregate. Preflight against double application and a self-check; needs only the views' owner `postgres`.
- `services/business/offline-dataset-chunks.mjs`: `borrowerUpcomingCte` derives `forecast_dates` from `forecast_events` and filters the targeted borrowers. `services/chat/assets/schema-digest.json` changed only for the migration number.

| Measure (Byte, synthetic 320 borrowers, 650 loans; median of 5 runs) | V150 | V151 |
| --- | --- | --- |
| Reader coverage, one borrower | 165 ms | 33 ms |
| Reader snapshot | 332 ms | 36 ms |
| Offline walk metadata | 1,074 ms | 666 ms |
| Offline walk events | 1,125 ms | 695 ms |
| Targeted metadata, 1 borrower | 1,020 ms | 428 ms |
| Targeted events, 1 borrower | 1,065 ms | 414 ms |

Checks: Byte `node --test` 103 pass, `chat-schema-digest` 3 pass, lint and `tsc` clean, `mw-db-ci -Group migrations` exit 0 (chain to 151), lab V151 check (targeted equals whole; 1,500 dates equal `summary_v2`); Chase's parity review: 0 differences, a destroyed socket still rejects the in-flight query and the pool discards the client; PR `Development checks` run 44318752891 and agent tests run 44318752881. Promotion: a verified PROD backup at V150, V151 to DEV then PROD with the canonical runner, rebuild of read, command, chat, jobs and notify, a dictionary capture afterwards for the two view entries, and a Grafana 5xx check.

### Batch 3: agent migration V14, `audit.events_kind_idx` (PR #362, merged as `a1cd6d76`; head `12f6233`)
Owner confirmed (18 November 2026) that it is part of R175. Detail is in the [batch 3 change note](../integration-agent/Change%20Logs/CHANGE_NOTES_AUDIT_EVENT_KIND_INDEX_2026-11-18.md). V14 adds `audit.events_kind_idx` on `audit.events(event_kind)`: `receipt_health.acknowledged` scanned all of `audit.events` (114,759 rows, 129 MB) every 2 minutes, the largest I/O consumer on the shared instance (18,161 calls, 98.8 million blocks read). Agent tests run 44315634410 (`lab`, `test`) and `Development checks` run 44315634031 succeeded. Promotion: a verified `mw_agent` backup, freeze, `agent-state-admin.py migrate`, install, activate; undo `DROP INDEX audit.events_kind_idx`. The Environment Inventory `mw_agent` row is updated at closure.

## Checks
| Command | Result |
| --- | --- |
| Byte (`3072688c`): `ruff check` | Pass |
| Byte: unit tests | `3072688c`: 1,091 run, 1 error: `test_receipt_qr` (`zxingcpp` missing locally, pre-existing). `f25eb727`: 227 tests (design cases 20 to 24) OK. `f3f8ecb1`: 1,100 run, only `test_receipt_qr` errors |
| Byte: PostgreSQL lab | 80 OK, 13 skipped |
| Echo: rendered check of the messages | First pass done, findings E-R2-01 to E-R2-06 applied in `f3f8ecb1`. Confirmation pass on `f3f8ecb1`: no must-fix; all renders confirmed (five same-terms cases English and Thai at 957 to 987 characters, the approver line with all three name fallbacks, a close at ฿800.50) |
| Chase: review | `3072688c`: no medium or high findings, lab 80 OK with 13 skipped, Low test gaps closed by `f25eb727`. `f3f8ecb1`: no findings above Low; the code-to-loan mapping is unchanged (`review_proposal.chosen_purpose` untouched, labels keyed by loanId in offer order); the approver line is correct (the automatic policy sets no `decision_message`, every manual approval stores it); close amounts are display only; a stress of five same-terms loans returned texts of at most 997 characters, and extreme balances fall back to the `REVIEW_REQUEST_TOO_LONG` hold; lab 80 OK with 13 skipped. Lows, not fixed: the `same_loan` key fallback may omit a same-key twin from "Other loan" on fact-less proposals (display only), and legacy reviews without `decision_message` lose the approver line |
| `npm run check:docs` | 0 failures, 0 warnings |
| The pull request's `Development checks` and integration-agent tests runs | PENDING: cited at closure |
| Batch 2 (PR #363): see its section; PR `Development checks` 44318752891, agent tests 44318752881 | Success |
| Batch 3 (PR #362): agent tests 44315634410, `Development checks` 44315634031 | Success |
| `Database migrations` workflow on the branch push (V151 CI proof) | PENDING |
| `python3 project/scripts/dictionary/dictionary.py validate` | 0 errors, 505 documents (batch 2) |

## Not run
- The full Playwright and `mw-db-ci` suites: the pull request's CI is the one broad run.
- No DEV agent exists, so batch 1 is verified in PROD only after promotion.

## Recovery
Batch 1: Agent: `deploy-runtime.py rollback --commit a2d436049bd0e1989f63437e47211d65c7880d00` (the R174 package), then restart `mw-chat-relay`; no unit changed. No SQL or data change to undo; acknowledgement and re-ask notices already sent stay as ordinary records.
Batch 3 (V14): `DROP INDEX audit.events_kind_idx` (an index only; no data change), after the agent code is rolled back if needed. Batch 2: revert the pull request for the code (images redeploy from the previous commit); V151 is views only, so rolling back means re-creating the two views from V150's definitions after a verified PROD backup, with no data change.

## Open questions
None. Batch 2's database tier stays `db-g1-small`; a larger tier is an owner decision, deferred. A possible follow-up: a targeted upcoming read still simulates all loans once.

## Remaining work
The `Database migrations` run on the branch; drain of the notice queue; PROD promotion in dependency order (verified backups of `loan_manager_prod` at V150 and `mw_agent`; V151 DEV then PROD; agent freeze, V14 migrate, install, activate at revision 47; rebuild of read, command, chat, jobs and notify; dictionary capture; Grafana 5xx check) and read-back; tag; closure.
