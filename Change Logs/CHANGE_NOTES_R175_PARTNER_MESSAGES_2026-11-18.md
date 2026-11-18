# Change notes — R175 Partner message wording and reply handling, and PROD 503 fixes, 18 November 2026

## Purpose
Owner requests, 18 November 2026: (1) "the wording and text layout is not very clear in this scenario (screenshot)" and "also review other ig messages' wording, layout, and user experience", then "go with your recommendations, just don't accept thai response yet"; (2) the PROD 503 fixes and the audit index, which the owner confirmed in this session to include in R175 (batches 2 and 3, below). Agent detail is in the [agent change note](../integration-agent/Change%20Logs/CHANGE_NOTES_PARTNER_MESSAGES_2026-11-18.md). The owner approved PROD promotion ("push to prod") for all three parts; the promotion record is below.

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
| `Development checks` run 44319668978 and integration-agent tests run 44319669858 (`test`, `lab`) on the tested head `555b731e` (PR #364) | Success; merged as `5c5002f0`, tree `5d2da380` identical |
| Batch 2 (PR #363): see its section; PR `Development checks` 44318752891, agent tests 44318752881 | Success |
| Batch 3 (PR #362): agent tests 44315634410, `Development checks` 44315634031 | Success |
| `Database migrations` run 44319384863 on `cbda7a99` (guards, rebuild migrations, phase5, phase8, receiving) | Success: the V151 proof; only records differ between `cbda7a99` and `5c5002f0` |
| PROD promotion and read-back | Pass: see the PROD promotion record |
| Release tag | `R175` on `5c5002f0` (Release tag run 44327801625) |
| `python3 project/scripts/dictionary/dictionary.py validate` | 0 errors, 505 documents (batch 2) |

## Not run
- The full Playwright and `mw-db-ci` suites: the pull request's CI is the one broad run.
- No DEV agent exists, so batch 1 was verified in PROD only after promotion; the new wording and reply handling have not yet met a real reviewer.

## Recovery
Batch 1: Agent: `deploy-runtime.py rollback --commit a2d436049bd0e1989f63437e47211d65c7880d00` (the R174 package), then restart `mw-chat-relay`; no unit changed. No SQL or data change to undo; acknowledgement and re-ask notices already sent stay as ordinary records.
Batch 3 (V14): `DROP INDEX audit.events_kind_idx` (an index only; no data change), after the agent code is rolled back if needed. Batch 2: revert the pull request for the code (images redeploy from the previous commit); V151 is views only, so rolling back means re-creating the two views from V150's definitions after a verified PROD backup, with no data change.

## Open questions
None. Batch 2's database tier stays `db-g1-small`; a larger tier is an owner decision, deferred. A possible follow-up: a targeted upcoming read still simulates all loans once.

## Remaining work
Owner acceptance. Observe the partner wording and reply handling with real reviewer activity, the Grafana 5xx panel over the next days, and `pg_stat_statements` for the lookup. Everything else (pull request CI, merge, promotion, read-back, tag, closure) is done. A possible follow-up: a targeted upcoming read still simulates all loans once.

## PROD promotion record (Forge, 18 November 2026 UTC)
Authority: owner, 18 November 2026, "push to prod", all three parts confirmed by the owner in session. DEV owner window = standard temporary maintenance permission within it (approved by the orchestrator after Forge stopped on the deviation).

Package: `main` 5c5002f00c21b3e7687b9b16be5f70c1fd780b2b (PR #364), tree 5d2da380 identical to head 555b731e. CI: Development checks 44319668978; agent tests 44319669858 (test, lab); Database migrations 44319384863 on cbda7a99 (guards, rebuild migrations/phase5/phase8/receiving) — the V151 proof; only records differ between cbda7a99 and 5c5002f0. Built from a clean git archive (sha256 006244ad…2c) in a detached worktree. Baseline: R174 a2d43604; schema 150 DEV and PROD; PROD services R165 (read, command, chat; e64810b2…) and R159 (notify, jobs; 56f17745…).
Target: project clever-oasis-508610-n7, instance mw-credit-pg-20261017, loan_manager_dev / loan_manager_prod, services mw-credit-app-*-{dev,prod}, VM vm-mw-credit-agent with mw_agent.

| Step | Result |
| --- | --- |
| PROD backup (V150) | 14:07:00Z–14:09:41Z; dump sha256 d490271575380f8e1a10325d1f03be6533a20193217806ad063e5111a803f2ea; listing, isolated restore, 42 table fingerprints ok; recovery record prod-promotion-bda64aa8f1e848b1a0b1a2ebccc50f86 |
| DEV backup (V150) | 14:09:47Z–14:12:24Z; dump sha256 fabeeab498a9053f46c40efaf42cec6f55a38b4f494d6eecfe4cfe4d9da9ff68; restore and 42 fingerprints ok; record dev-refresh-bec9c92a515b4450a91ee1718ab4471d |
| DEV V151 | Invoke-Flyway.ps1 -Environment development migrate: installed 14:13:00.75Z (3.3 s, checksum 337133938). Deviation: post-migrate application-role reconcile failed 42501 (permission denied for table pwa_notification_deliveries; no DEV owner window open). Forge stopped and reported. Cause: a DEV migrate through this runner needs the six-owner DEV window (as R165, R140); "no special owner window" applies to PROD only. |
| DEV owner window (fix) | prepare 14:17:22Z–14:17:34Z (six DEV owners; state owner-authority-dev-prepare-2e56943d…); no-op migrate 14:17:41Z–14:25:24Z: migrationsExecuted 0, reconcile applied, 0 violations (snapshot application-role-979d17f2…); restore 14:25:35Z–14:25:45Z; read-back: six owners inherit/set false, no CREATE on public |
| PROD V151 | Invoke-CloudFlyway.py prepare 14:26:07Z–14:26:36Z (151 migrations; V151 sha256 d9c8d346…e777); CONNECT preflight 14:27:07Z sha256 93298ae1c8d5cc4e08741bd41a6a8847763c7e0a0b025a8ea611f4605b30c1de (18 retained roles, 0 DEV sessions); check 14:27:12Z pending ["151"], 0 writes; apply 14:27:45Z–14:29:04Z, V151 installed 14:28:27.10Z (3.2 s, checksum 337133938) |
| PROD V151 read-back | 151 successful rows, 0 failed; both views owned by postgres, ACLs unchanged, no MATERIALIZED; verify passes on both databases at 151 |
| Images | DEV Cloud Build b32a7b78-1dcb-4b62-b663-26a043e760ae (cloudbuild-command.yaml, R175) digest sha256:06c6ba44d6617670b1e69f17f43819bae581bf868b0d07e50e602d6d579d8661; PROD Cloud Build a737a75e-acac-4514-8971-bfc6bbbb97f8 (cloudbuild-business.yaml, _MW_RELEASE=R175, build-prod identity) digest sha256:237a3d22d457d477e8204478252a41c832dc4632b9600aa48a93982c7e2cfefa; both 14:30:41Z–14:31:26Z |
| DEV services | before-r175 settings planned no change; R175 plan 0 add / 5 change / 0 destroy, image only (plan sha256 a1f1d000…af6a); applied 14:33:45Z–14:34:18Z: read 00100-rs5, command 00117-n6k, chat 00069-qbj, notify 00034-744, jobs 00034-txx; settings generation 1795012465050746 (was 1794848302236700); re-plan clean |
| DEV smoke | /health R175 5c5002f0 on read, command, chat, notify; unauthenticated 401; no ERROR logs |
| PROD services | before-r175 settings (generation 1794849158807698) planned no change; R175 plan 0/5/0 image only (plan sha256 db27a259d8c97dda9301b21e1eaa1730b877a953d4350af5c6f74579da9cb472, JSON ea4421ba…1062); applied 14:37:25Z–14:38:02Z: read 00066-6vh, command 00071-tjq, chat 00050-rvb, notify 00032-khj, jobs 00032-9nr, 100% on 237a3d22…; state generation 1795012681626463; settings generation 1795012688102721; re-plan clean |
| PROD smoke | /health 200 R175 5c5002f0 on read, command, chat, notify; unauthenticated read/command 401; Hosting unchanged (R172 baca5670…); no ERROR logs since 14:27Z |
| Agent dry-run | 14:39:56Z; notice queue drained (0); changed modules exactly hold_reply, partner_notice, partner_review, receipt_hold, receipt_master, review_cycle, review_resend; no unit change; ancestry ancestor; schema through V14; nine triggers paused |
| Agent freeze --release R175 | 14:40:07.93Z–14:40:21.15Z; rollback dir runtime-20261118T144008124582Z, metadata sha256 2eecd27cb0896e7c2562be54ee61a529396443e2fecc3729ef681578f87f7835 |
| mw_agent backup | writers paused, 14:40:25Z–14:41:46Z; dump sha256 85b74ca4fd64065c414e5d18811259cbaa8f1118b542f041639b881cff1403bc; listing, restore, 28 table fingerprints ok; record prod-promotion-c7ca391c72764f61b000b5df05ec7855 |
| Agent V14 | queue re-checked 0; temporary operator file /root/r175-op 14:42:01Z; agent-state-admin.py migrate 14:42:05.74Z–14:42:06.61Z applied only V14 (installed 14:42:06.54Z, sha256 c45e2721…); events_kind_idx btree on event_kind, owner mw_agent_owner; acknowledged-notice lookup = Index Scan using events_kind_idx |
| Install, activate | install done 14:42:28.42Z (no unit changed); activate done 14:42:32.40Z, probe 8aefd324-6105-42d8-b8fd-cfba59ce65d7, nine triggers resumed; mw-chat-relay restarted 14:42:32.52Z; operator file shredded 14:42:32.61Z |
| Agent read-back | /ready true at R175 5c5002f0 (started 14:42:30.13Z); catalogue 46 → 47; recognizer/relay healthz R175; 15 units active; only COMPLETED job runs since freeze; no warning journal lines |
| Collector 14:42:59Z | code_version_match 1, all health 1; receipt_pipeline status 1, stalled_jobs 0, undelivered_reviews 0, failed_notifications 0, approved 0, unconfirmed 0 |
| 5xx read | 0 PROD 5xx since 14:37Z; the only one in the prior 24 h was 2026-11-17 16:18:51Z command-prod (the crash R175 fixes); since 14:37Z command 113×200 + 55×204, read 5×200, chat 4×200, notify 8×200; four notify 403s at 14:37:53Z were outside raw-URL hits refused by IAM |
| Dictionary | PROD capture production-r175-20261118T1444Z.json (read-only, private) 14:43:15Z–14:43:27Z |

Rollback: images — private production.activation.before-r175.tfvars (R165 e64810b2… read/command/chat; R159 56f17745… notify/jobs), 5-change image-only plan; DEV dev.activation.tfvars.before-r175 (cf5b3845…, 94768995…). SQL — V151 views only, forward-only; recreate both views from V150 definitions; restore points the V150 backups. Agent — deploy-runtime.py rollback --commit a2d436049bd0e1989f63437e47211d65c7880d00 with a fresh operator file, restart mw-chat-relay; V14 may stay or DROP INDEX audit.events_kind_idx as mw_agent_owner; mw_agent dump is the restore point.

Private evidence: gs://mw-credit-operator-private-737787224638/promotion-packages/r175/ (23 objects); backups under prod-backups/ and dev-backups/ (180-day lifecycle); local private copies in ~/.mw-private/r175/ (capture there too); detached worktree ~/.mw-private/MW-Credit-App/r175-src.

Dictionary: the reconcile of the two views from the PROD capture was run at closure (below). Not yet observed: new partner wording/reply handling with real reviewer activity; Grafana 5xx panel over the next days (00:01 Bangkok rollover); pg_stat_statements for the lookup. 

Deviation (DEV owner window): the DEV V151 migrate through the runner stopped on a post-migrate application-role reconcile (42501, permission denied on a table, because no DEV owner window was open). A DEV migrate through this runner needs the six-owner DEV window (as R165 and R140); the "no special owner window" statement for V151 applies to PROD only. Forge stopped and reported; the orchestrator approved the standard temporary maintenance permission within the owner's "push to prod". The fix: prepare the six DEV owners (14:17:22Z to 14:17:34Z), a no-op migrate that applied the reconcile with 0 violations, restore (14:25:35Z to 14:25:45Z) and a read-back (six owners inherit and set false, no CREATE on public). V151 itself was already installed; nothing was re-applied. The `database/README.md` wording is corrected.

Tag record: `R175` on `5c5002f00c21b3e7687b9b16be5f70c1fd780b2b` (PR #364), created by Release tag run 44327801625 (success, about 14:46Z), which publishes the GitHub Release. First live step of the release: the PROD backup at 14:07Z; agent freeze at 14:40:07Z (the freeze pin).

Component versions at this release (`component-versions.mjs render --write`): changed in R175: the API read, command and chat services, the notification and jobs workers (one image), the database schema (V151) and the integration agent (revision 47, `mw_agent` V14); unchanged: PWA frontend and Grafana dashboards R172, Metabase reports R144.

Drift after the tag (public facts only, `node scripts/promotion/component-versions.mjs drift --env all`): drift 0, unverified 11 (every credentialed fact, as no observed file was supplied; the public PWA, read, command and chat builds match). Forge's collector read at 14:42:59Z matched the agent at `5c5002f0` and `/health` answered R175 `5c5002f0` on read, command, chat and notify in DEV and PROD.

Dictionary reconcile (Dewey, closure): from the private PROD capture of 14:43Z, `reconcile_captures.py plan ... --postgres-only --only relation:public.oltp_upcoming_charge_events_v1 --only relation:public.oltp_upcoming_charge_coverage_v1` then `apply` rewrote the two records (`public-oltp-upcoming-charge-events-v1` and `...-coverage-v1`) from catalog facts, replacing the two `development_definition` blocks; authored keys were preserved; sanitized observations are in `project/outputs/dictionary-r175-20261118/`; the validator reports 0 errors across 505 documents.

Not yet observed: partner wording and reply handling with real reviewer activity; the Grafana 5xx panel over the next days (including the 00:01 Bangkok rollover); `pg_stat_statements` for the acknowledged-notice lookup. Owner acceptance is pending.

Closure: the tag exists; the freeze pin, this record, the tag record and the prune are published in the R175 closure pull request. Pruned (outside the window of Open plus the three newest Released releases, R175, R174 and R173): the R172 change note `Change Logs/CHANGE_NOTES_R172_FOLLOW_UPS_2026-11-18.md` (its links now point to commit `5c5002f0`).
