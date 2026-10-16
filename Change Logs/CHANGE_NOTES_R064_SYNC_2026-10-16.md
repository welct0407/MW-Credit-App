# R064 local dataset sync fix and shared Cloud SQL (16 October 2026)

## Purpose

Owner instruction (16 October 2026): "Approve all four, go with one R064 promotion ... don't wait for Saturday. i want it asap. cloud sql can make it db-g1-small with ssd", then "plan the SSD move tomorrow after R064 is stable" and "the maximum connection was 200 before db upgrade. make it 200". The sync fix is an app-only R064 correction stacked on Wave 4 (`claude/review-w4-app` d4f8c3c); it travels in the single R064 promotion. No migration, no schema or dictionary change.

Diagnosis (team findings): any source change forced a full sequential re-walk of the offline dataset (PROD served 3,827 dataset requests since 14 October, 100 to 450 per sync); the walk restarted on the user's own writes and on 409 `dataset_changed` (30 in PROD); focus checks were unthrottled; IndexedDB used whole-store `getAll` and a quadratic chunk rewrite; a paging wait could last 65 s; `command-prod` ran one instance with two connections shared with agent polling; the db-f1-micro HDD instance was near its CPU limit. A PROD 503/504 burst on 16 October 14:03 to 14:11Z coincided with the DEV V93 post-migrate step on the shared instance (correlation, not proven).

## Changes

Branch `claude/sync-phase1` (head 9420c85): server 81541c7, PWA 1f63b9d, then:

- cfaeb95: instance-name allowlist for the 17 October SSD move (`services/lib/identity.mjs`, production/worker configs, promotion scripts; business-config returns the validated env instance).
- 926ecbe: UX review fixes R01 to R06 (toast only for changes that actually waited, fixed position; live region always mounted; "All synced" name; "Syncing..." feedback; contrast; stacked header cell).
- 511d3bc: SYNC-UX-06 reverted (broke 4 CI specs); the Borrowers refresh returns to the first page as before.
- 64156fd: Hosting runner accepts the sync plan (command scaling, CPU boost).
- 9420c85: blocking defect found by Agent C: packed responses could exceed the 2048-hash need cap (400, records stuck, old clients too). Fix: server 2048-value budget per response and client need batches of at most 2048.

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
- Pending: SSD move on 17 October after R064 is stable (restore a backup into new instance `mw-credit-pg-20261017`, db-g1-small, PD_SSD, repoint consumers, keep the old instance), as the owner decided.

## Checks

- Agent B (on 1f63b9d): `npm run check` 520 unit tests; Biome 0 errors; Playwright offline-delta 20/20, purge 4, retention 12, payment-offline 2, phase5-offline-sdk 1, payment-command 28, back-consumers 104, persistence 11, phase5-final-ui 66, error-recovery 8 (two parallel-load flakes, reruns green).
- Agent C independent verification: focus storm of 10 events 50 to 0 requests (3-minute storm 180 to 10); own write mid-walk no restart (11 to 7 records requests); repeated `dataset_changed` no longer fails; foreground paging wait 65 s to 258 ms; cold sync on a real server 50 to 10 responses, about 9.5 s to 2.1 s; full re-walk 51 to 4+1; compatibility matrix (new/old client by new/old server) all converge; crash and reload resume; 10 e2e specs x2 repeats on both projects 512 passed, 4 skipped, 0 flaky. After 9420c85: largest response and need 1972, stuck case converges new-new and old-new, 154 e2e passed. Known limits: a fresh device with one failing domain stays incomplete until it recovers; the trailing recheck flag is lost on reload (minor); an offline-cursor page with a missing bundle and a hanging (not failing) request waits up to the 25 s request timeout.
- Agent E UX review: no blockers; R01 to R06 fixed except R04 (layout changed) and SYNC-UX-06 (reverted).
- CI on 9420c85: `ci.yml` run 38934694604 (all e2e shards) and Database migrations run 38934680973 green; `npm run check` 526 unit tests; Biome errors 0.
- DEV: first deploy 9d3f064 (image 3f49e010..., revisions command-00033-kpn, read-00026-b8v, jobs-00006-57s, notify-00006-84q, CPU boost on, Hosting 052fef2eef12760c); Hosting refresh c4f53da (a3c0540fe9eab297); final 9420c85: image sha256:4689ce78f0c8... (`keep-dev-20261016-4689ce78`), revisions command-00034-whm, read-00027-gfw, jobs-00007-vch, notify-00007-xrq applied 16:50:33 to 16:51:09Z, Hosting 602f053ab2081d8c (release 1792169531712000). Smoke passed, 0 errors. DEV rollback: image 3f49e010... / Hosting a3c0540fe9eab297 (pre-sync: ec4ffe05... / e0ac761a1022e40e).
- PROD (from 9420c85, Agent F): image sha256:88b4dbad1b33d3cd4819fd6023b35075360e3576ece7dad952500b3f2abe791d (`keep-r064-sync-runtime`, build 11fdb610); saved plan 875ca808... 0/4/0 applied 16:54:52 to 16:55:28Z (23:54 to 23:55 Bangkok), activation 01bc8130... published, re-plan No changes. Revisions read-00008-xp4, command-00012-67j, notify-00006-rnq, jobs-00006-rzs, Ready 100%; command max instances 2, startup CPU boost on reader and command, command pool 4. Hosting 7664add62c41bce6, release 1792169838042000, 16:56:51 to 16:57:25Z, marker 9151ce0bb3ab28cb380618b6, entry `/assets/index-CnmFQCHp.js`. The first `--apply` (16:56:27Z) was refused by the runner's live verification before any change (package source-object field order); fixed, `--check` re-passed, second apply succeeded. Package d7752d4f..., receipt 58ff0539... (private folder and operator bucket; the runner's `promotion-receipts/hosting-receipt.json` copy now holds this receipt, the Wave 4 one stays in `promotion-packages/r064/`).
- PROD smoke (16:57:36Z on): health 200; unauthenticated session and offline-dataset 401; PROD origin 204, foreign/DEV origin 403; 15 of 15 files byte-identical; CSP PROD-only; `X-Frame-Options: DENY`; logs 0 errors and 0 5xx; notify 200 on the new revision; no agent 503s.
- PROD rollback pins: image 8611c23d... (read-00007-tgd, command-00011-j4n, notify-00005-p8k, jobs-00005-fnc) via `production.activation.before.tfvars`; Hosting 2b6c25c065f1a45a (release 1792166200421000).
- Not done: authenticated PROD path (the owner's next normal sign-in is the proof; no PROD test identity) and a physical-device check.

## Rollout and compatibility

Either order is safe (old client with new server keeps 409; new client with old server drops the flag on 400 and retries on 409). Server first is preferred. No database change.

## Recovery

App: redeploy the previous pins (PROD and DEV pins are listed under Checks), or `git revert` 1f63b9d and 81541c7 and redeploy. Terraform capacity (command max instances, boost) reverts with the same revert. Cloud SQL: `gcloud sql instances patch --tier=db-f1-micro` (restarts the instance); flags and backups above remain available (restore a listed backup only for data loss).

## Outcome

DEV and PROD deployed from 9420c85 and smoke-passed; no migration. Authenticated PROD proof is the owner's next normal sign-in. R064 closure and tag belong to the Wave 4 session.
