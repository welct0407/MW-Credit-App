# R064 local dataset sync fix and shared Cloud SQL (16 October 2026)

## Purpose

Owner instruction (16 October 2026): "Approve all four, go with one R064 promotion ... don't wait for Saturday. i want it asap. cloud sql can make it db-g1-small with ssd", then "plan the SSD move tomorrow after R064 is stable" and "the maximum connection was 200 before db upgrade. make it 200". The sync fix is an app-only R064 correction stacked on Wave 4 (`claude/review-w4-app` d4f8c3c); it travels in the single R064 promotion. No migration, no schema or dictionary change.

Diagnosis (team findings): any source change forced a full sequential re-walk of the offline dataset (PROD served 3,827 dataset requests since 14 October, 100 to 450 per sync); the walk restarted on the user's own writes and on 409 `dataset_changed` (30 in PROD); focus checks were unthrottled; IndexedDB used whole-store `getAll` and a quadratic chunk rewrite; a paging wait could last 65 s; `command-prod` ran one instance with two connections shared with agent polling; the db-f1-micro HDD instance was near its CPU limit. A PROD 503/504 burst on 16 October 14:03 to 14:11Z coincided with the DEV V93 post-migrate step on the shared instance (correlation, not proven).

## Changes

Branch `claude/sync-phase1`: server 81541c7, PWA 1f63b9d.

- Progress is kept across the user's own writes: the partial walk is re-pinned to the new revision and one trailing recheck runs.
- Torn commit: with `acceptChanged:true` the server returns `complete:true, changed:true, sourceVersion:null`; the client commits and rechecks (at most 2 in a row). Without the flag the server still answers 409. A legacy 409 retries once and stays ready; a legacy 400 drops the flag for that path.
- Packing: records 32 pages per response, detail 64 and payments 32 per page, up to 8 parents per page. Synthetic 40 borrowers and 1.5k charges now walk in 3 responses (was 50).
- `need` re-request has its own 25 s timeout; focus, visibility and online rechecks run per domain at most every 60 s (manual sync bypasses).
- `offline:` cursors are served from the complete local bundle; a missing bundle fails fast (`mw-offline-dataset-failed`). IndexedDB uses key ranges per kind; one shared pending-count store replaces the 15 s timers.
- UX (SYNC-UX-02/03/06/07): header "Updated HH:MM" or "Saved data from HH:MM" sync-now control, neutral "All synced", synced toast, new `SyncStatus.tsx`, progress bar only for first download or a foreground wait; Borrowers refresh keeps the current page.
- Capacity: command pool 4 connections (other roles 2); PROD command max instances 1 to 2; startup CPU boost on PROD and DEV reader and command (Terraform, on deploy).

## Shared Cloud SQL `appsheet-pg-prod-20260914` (applied 16 October)

- On-demand backup 1792165191960, then `gcloud sql instances patch` 15:42:54 to 15:49:21Z: tier db-f1-micro to db-g1-small, flags `cloudsql.iam_authentication=on,max_connections=50` (the four `pg_cron` flags removed, W4 DB-PERF-03), Query Insights on (string length 1024, 5 plans per minute, no application tags or client address); settingsVersion 59 to 64. Terraform apply hit the known provider 8.6.0 maintenance-window 400 (changes nothing), so the documented narrow patch exception was used; refreshed plan: No changes.
- Owner then asked for 200 connections (the pre-upgrade value, overriding W4's 50): backup 1792165979631, patch `max_connections=200` 15:54:56 to 15:55:37Z (settingsVersion 65, postmaster start 15:55:19Z); plan No changes. `owned.tf` commits e00b28d and ac6ec15.
- Post-checks: PROD and DEV `max_connections` 200, no `cron.*` settings, `monitoring.pg_stat_statements` readable, Flyway V93; read and command DEV and PROD `/health` 200; Debian `/ready` 200 (300aeb5), both proxy units active; the notify-prod worker exited during each restart and recovered.
- Disk stays PD_HDD (Google does not allow HDD to SSD in place). Cost about $12 to $37 a month.
- Pending: SSD move on 17 October after R064 is stable (restore a backup into new instance `mw-credit-pg-20261017`, db-g1-small, PD_SSD, repoint consumers, keep the old instance); needs its own scoped owner go.

## Checks

Agent B: `npm run check` 520 unit tests pass; Biome lint 0 errors; Playwright offline-delta 20/20, purge 4, retention 12, payment-offline 2, phase5-offline-sdk 1, payment-command 28 (one parallel-load flake, 3 reruns green), back-consumers 104, persistence 11, phase5-final-ui 66, error-recovery 8 (one parallel-load flake, rerun green); production-offline-independent integration passed. Independent verification (Agent C): pending. DEV deploy and smoke: pending. PROD deploy and smoke: pending.

## Rollout and compatibility

Either order is safe (old client with new server keeps 409; new client with old server drops the flag on 400 and retries on 409). Server first is preferred. No database change.

## Recovery

App: redeploy the previous image revisions and Hosting version recorded in the R064 promotion record, or `git revert` 1f63b9d and 81541c7 and redeploy. Terraform capacity (command max instances, boost) reverts with the same revert. Cloud SQL: `gcloud sql instances patch --tier=db-f1-micro` (restarts the instance); flags and backups above remain available (restore a listed backup only for data loss).

## Outcome

Pending (DEV and PROD results to be recorded by the orchestrator).
