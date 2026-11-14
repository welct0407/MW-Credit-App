# Change notes — Sync queueing and the Payments mismatch (R159), 14 November 2026

## Purpose
Owner request of 14 November 2026: "i accept R158. after the recent feature update, the syncing takes long time and sometimes it even fails. check what's wrong". After the diagnosis the owner chose "Yes, fix both, to PROD (Recommended)": quick checks get their own lane, and the Payments mismatch is fixed. R158 is owner-accepted on 14 November 2026.

## Changes
Design (Archie, accepted). Base `origin/main` `eb9daef2`. Server only: no SQL, migration, Terraform, PWA code or shape bump (offline dataset stays v12); one command-service image. Planned file map, to be updated with the as-built result by Byte.

Evidence summary (PROD logs of the command service, 10 to 14 November 2026; no borrower data, no request ids):
- All offline dataset and notification bundle reads of an instance passed one FIFO slot (`withOfflineReadSlot`), shared by the dataset and notification stores. Unchanged checks (about 1 KB) and notification bundles (about 5 KB) took 20 to 52 s when they queued behind walk chunks (0.5 to 4 s each, 26 to 28 per records walk) and reconciliations (17 to 23 s server time each). The PWA aborts a dataset request at 25 s, so the owner saw failures. One 14 November reconciliation took 51.8 s and answered `unavailable`.
- Requests over 20 s per day: 8, 7, 5, 8 and 17 on 10 to 14 November. Records walks per device per day 3 to 13, management 15 to 30. Four shape bumps in two days (v10, v11, stamp, v12) and every device becoming due at the same 06:00 and 18:00 Bangkok boundary expose the single line. Cloud SQL `db-g1-small` CPU mean about 0.25, 2-minute maximum 0.74 during walk bursts.
- Records reconciliation `mismatch ["payments"]` alone occurred four times from 13 November (none before); the cause is the Payments finding below.
- Pool size is code, not configuration (`services/lib/pool.mjs`): the command role had 4 connections, so the slot used 1 of 4.
- Payments finding (lab, disposable PostgreSQL 18 at V149, synthetic rows, equality harness of `offline-delta-v4-equality-lab`): a records delta left `payments[].closeRebates` stale for each of these changes. Another referred loan of the same referrer closing (`owedTotal` of earlier closing payments of that payee), a rebate settled or its settlement removed (`rebateState`, `pendingAmount`, settlement fields, `owedTotal`), a rebate offset set (offset fields, `payableAmount`, `owedTotal`), a referrer renamed (`referrerLabel`, `offsetLoanLabel`) and an offset payment amount changed (`offsetAmount`, `rebateState`, `owedTotal`). Every other field of the payment detail was already covered by the dependency audit and nothing depends on the clock. `loanRelated`, `paymentHistory` and `paymentMonths` carry no rebate data. With the D5 prototype on a scratch copy all of these answered `delta` and `match`, equal to a fresh walk.
- Residual, not fixed: `pwa_rebate_settlements` is not a records source table; its rows are immutable, so only a replica-mode repair of `settlement_date` could leave a bundle stale, and adding the table would change every records version and walk every device.

Decisions:
- D1 Three lanes instead of one slot (`services/api/offline-read-slot.mjs`), each a FIFO queue per pool: `light` limit 2, `walk` 1, `reconcile` 1. `withOfflineReadSlot(pool, signal, work, {lane='light', wait=true, unless=[]})`; `wait:false` rejects with `offline_read_busy` when the lane is full, `unless:[lane]` when a named lane runs or has waiters.
- D2 A pure `offlineReadLane(protocol, input)` beside `acceptsRowDelta` in `services/business/offline-dataset-delta.mjs` (validates via `readDeltaRequest`; invalid input or a protocol other than 2 or 3 gives `light`): `reconcile` for a reconciliation, `walk` for protocol 2, a `cursor`, an older shape version or no bundle, otherwise `light`. Notification bundles are always `light`. An unknown lane passed to the slot throws `invalid_lane`.
- D3 A reconciliation never queues and never competes with a walk (`{wait:false, unless:['walk']}` in `services/payment-command/store.mjs`); busy logs INFO `offline_reconcile {domain, result:'busy'}` and answers 503 `command_unavailable` with no ERROR log and no connection taken, which the PWA retries after 30 minutes. No reconciliation is made cheaper in R159.
- D4 Command pool 4 to 6 (`services/lib/pool.mjs`, DEV and PROD). The lanes hold at most 4 connections and `containerConcurrency` 5 means an instance never needs more than 5. Cloud SQL sees at most 2 × 6 per environment against `max_connections` 200. No Cloud Run change: `max_instance_request_concurrency` stays 5 and `max_instance_count` 2, which bounds a walk chunk to wait behind at most 4 others.
- D5 The records delta (`readRecordsTargeted` in `services/business/offline-dataset-chunks.mjs`) also re-reads every closing payment of a loan that belongs to an affected borrower, is the related loan of a changed `Referral Rebate` expense, or is the related loan of a `Referral Rebate` expense whose payee is affected. As built: `basePaymentIds` (the previous rule) and `rebatePayees` feed the added ids; the 400-payment limit applies to both lists (above it the server walks); `relatedLoans` is computed from `basePaymentIds`. Chosen over moving `owedTotal` out of the payment detail, which needs PWA changes, a shape bump and a new online/offline equality proof.
- D6 No shape bump (stay v12) and no SQL. A device holding a stale payment gets one more `payments` mismatch at its next reconciliation and heals by the existing walk; a v13 bump would force four walks per device, the load this release removes.
- D7 The slot reports its queue wait; the two stores log INFO `offline_read_wait {lane, waitMs}` when `waitMs >= 3000` (`{lane, waitMs, domain}`). Forge uses it to verify PROD.

Files:
- Code (Byte): `services/api/offline-read-slot.mjs`, `services/business/offline-dataset-delta.mjs`, `services/payment-command/store.mjs`, `services/notifications/store.mjs`, `services/lib/pool.mjs`, `services/business/offline-dataset-chunks.mjs`.
- Tests (Byte): `tests/unit/offline-read-slot.test.mjs` (new), `tests/unit/notifications-rpc.test.mjs`, `tests/unit/request-budget.test.mjs`, `tests/integration/offline-delta-v4-equality-lab.test.mjs` (rebate scenarios).
- Documents (Dewey): this note, `project/Documents/Release_Tracker.md`, `project/Documents/Development_Changes.md`, `project/Documents/Solution_Design.md`, `project/Documents/Environment_Inventory.md`, `docs/Development_Read_Service.md`. `PWA_Data_Model_Overview.md` is unchanged (no table, column or row shape changed).
- Data rules: tests use synthetic rows only; no PROD financial data was read for this diagnosis, and no real name, chat text, phone or account number is recorded.

Risks (Archie): the database is the real limit (up to 4 lane reads per instance now run together, 2 before); if `offline_read_wait` or statement timeouts persist the next step is `light` limit 1, not more concurrency. A reconciliation still costs 17 to 23 s and must fit the client's 50 s. A `light` request can still be a first walk chunk or a 5 s delta. A referrer with many closed referred loans adds that many payment reads to a delta touching one of their rebates. The 25 s bound for walks is derived, not load-tested.

## Checks
| Command | Result |
| --- | --- |
| `npm run check:docs` (Dewey) | Pass |
| `node --test tests/unit/offline-read-slot.test.mjs tests/unit/notifications-rpc.test.mjs tests/unit/request-budget.test.mjs tests/unit/offline-dataset-delta.test.mjs tests/unit/offline-row-delta.test.mjs` (Byte) | 55/55 |
| `npm test`, `npm run typecheck`, `npm run lint` (Byte) | npm test 1371 tests, 1370 pass, 0 fail, 1 skipped (`MW_CHAT_DIGEST_PORT`); typecheck 0; lint 0 errors (2 warnings in untouched files) |
| Lab on a disposable PostgreSQL 18 at V149: `offline-delta-v4-equality-lab`, `offline-delta-v4-lab`, `offline-reconcile-lab`, `offline-day-change-lab`; every scenario `equal`, no `RECONCILE MISMATCH`; the new rebate scenarios fail on `eb9daef2` (negative control) | Offline v4 lab suites 6/6 pass on a fresh PostgreSQL 18 at V149 with `--test-concurrency=1` (33 scenario lines equal, no mismatch; one pre-existing fixture "change refused" by the posted-payment guard, outside R159). Negative control with the `eb9daef2` chunks file: all six new rebate scenarios answer `mismatch ["payments"]` |
| `Development checks` of the pull request (the one broad run) | Pending (Chase's verification and the pull request run outstanding) |
| DEV after deploy (Chase, Echo; synthetic data): force a records walk in one browser and confirm the other's unchanged checks and notification bundle answer in under 2 s; close a second referred loan of one referrer and confirm the next records reconciliation is `match` | Pending |

## Not run
No local wide browser suite and no e2e addition: there is no PWA change, and the pull request's `Development checks` is the one broad run. Load testing of the worst-case 25 s walk bound is not run; the DEV step and the PROD log check are the evidence.

## Recovery
Git baseline `eb9daef2`. No SQL or data change: redeploy the previous command image recorded in the environment inventory (read and chat images are unchanged); no Hosting step. A device left with a stale payment heals by the existing walk.

## PROD promotion record (Forge, to be filled)
Authority: the owner's request quoted in Purpose and "Yes, fix both, to PROD (Recommended)". Scope: command image only; no SQL, backup, Terraform, Hosting, read or chat image, or agent change.

| Step | Result |
| --- | --- |
| Baseline | To fill: Flyway head, command revision, generation, Hosting version before the deploy |
| DEV | To fill: command image at the tested commit, smoke |
| Image | To fill: Cloud Build id, digest |
| Services | To fill: Terraform plan, generation, revision |
| Smoke | To fill: health, 401, no ERROR logs |
| PROD check (read-only) | To fill: `offline_read_wait` count and lanes; requests over 20 s on `/api/offline-dataset` and `/api/notifications/offline-dataset` other than reconciliations (expected none); `offline_reconcile` results (`busy` is normal; one last `payments` mismatch per device is expected, then none); Cloud SQL connections and CPU |
| Tag | To fill |
| Closure | To fill |

## Open questions
None.

## Remaining work
Build and checks (Byte, Chase), DEV and PROD deploy (Forge), owner acceptance.
