# Change notes — offline dataset sync efficiency (R078), 19 October 2026

## Purpose
The owner wants offline dataset sync to feel instant, especially right after the owner's own write (payment and receipt upload). On 19 October 2026 the owner told the team to work on all seven recommendations of an independent review of the PROD request logs, and added the decisions listed below. Status: all batches merged into main (last `68ce669`, PR #87) and on DEV with V97 on 19 October 2026; not promoted to PROD.

## Changes
Measurement tooling:
- `project/scripts/offline-sync-log-report.py`: read-only report from Cloud Run request logs (endpoint table, unchanged polls, walk bursts, post-write cycles); listed in the [scripts README](../project/scripts/README.md).

The seven review items:
1. Cash pages 16 and management pages 8 (records 32 and collection 2 unchanged), inside the existing byte and value budgets (Byte, `1e32dd4`).
2. Client walk: no 200 ms timer when continuing, sparser progress writes, two domains in flight (Byte, `1e32dd4`).
3. Per-domain table sets: cash also includes Borrowers; records hash Daily Analytics by content without "Generated At" over Snapshot Date from the Bangkok date minus 31 days, and Statistics as ("Row ID","Statistics ID"); the hourly analytics job no longer re-walks records or collection (Byte, `1e32dd4`).
4. Cheaper fingerprint: `count(*)` plus `sum(hashtextextended(PK||':'||xmin))` with no ORDER BY; a `versions:true` body flag makes an unchanged poll 2 requests instead of 5 (Byte, `1e32dd4`).
5. `Access-Control-Max-Age: 7200` on the preflight (Byte, `1e32dd4`). Version tag `business-offline-v4`, so every installed client walks once after deploy.
6. Own write: a posted payment is applied locally to the stored records and collection bundles (`own-write-apply.ts`); rows show "Confirming…" until records, collection and cash confirm instead of a full five-domain cycle, and Correct, Move interest and Delete stay disabled meanwhile; a bundle with `localPending` rows always walks so server rows replace local ones; shown progress never decreases; the own uploaded receipt is seeded into the offline media store under the payment address with the server `receiptAt` time (`9daaabc`: never the device clock) (`ff09f7f` and follow-ups).
7. Real change tracking, V97 `pwa_row_changes` (`f22335d`, `50825c4`, `74fa0d5`): 19 source tables, row trigger and AFTER TRUNCATE statement trigger (marker `row_key` `*`), both ENABLE ALWAYS, definer function owned by `mw_changes_owner_<env>`, 7-day retention in the hourly job, `mw_app_<env>` read-only. Authorized up to DEV on 19 October 2026; PROD needs a promotion instruction and a verified backup. Documented in `database/README.md` and `scripts/database/R053_OPERATOR.md`.

Owner decisions and additions of 19 October 2026:
- Revocation is checked on writes only (Forge, `2b8f7bb`): reads verify without `checkRevoked`; writes and unknown routes are checked; the command pool idles 10 minutes with keepalive.
- Protocol v4 records delta (`e00dfa5`, `ec2cd9c`, `c45b97f`, `c99587a`): the server answers a records check from the change log as key-level patches; the per-domain fingerprint stays the authority (unchanged needs an equal fingerprint; trigger-bypassed writes and TRUNCATE walk). Fan-out audit: borrowers referring to an affected borrower, allocation loan labels, loan-related of re-read payments, payment months re-read whole; moved rows, markers, gaps, size limits (5 s, 4 x 2048 values) and errors walk.
- Full sync button (`5e7f768`, moved by `b9e209e`): the last section of the Saved changes page; sends saved changes first, then walks every domain from the start after one confirmation; disabled offline; never discards the queue or drafts.
- Twice-daily reconciliation (`35bdda2`, `ae00ee7`, `c3f9164`): at the first idle online moment after 06:00 and 18:00 Bangkok (or 12 h after the last pass) the server compares per-key digests of each stored domain; an unanswered pass backs off 30 minutes and does not repeat finished domains; a mismatch heals once per slot (cursor dropped, `needsWalk`); a request lost to a dropped connection is skipped. Client events `reconcile-match` and `reconcile-mismatch` (key names only).
- Data-check warning UX-RECON-01..07 (`666ec55`): a mismatch that persists after its heal is shown above Full sync, as a header indicator beside the refresh icon, as a dot on the side-menu All synced button and as one toast per new occurrence; a later match, a Full sync followed by a check of the flagged areas, or sign-out clears it.
- Day-change delta (`825fdc1`): request level 4 `dates`, 14-day limit; date-independent keys are kept with their business date moved and the rest re-read (records combines row changes, cash walks on any change, management accepts only changes feeding re-read keys, including Byte's two moves); the test-only `pinOfflineBusinessDate` is refused under `K_SERVICE`.

### Follow-up batch (19 Oct): collection and cash row deltas, own receipt seeding
The owner approved this batch on 19 October 2026 ("go ahead with both before production") after the DEV measurement of the merged work (14:45 to 14:49 UTC, owner's session; PROD baseline in brackets):
- Unchanged poll: 2 requests, about 0.05 s server [5 requests, 1.7 s server, 3.2 s wall]. Authenticated request floor 0.02 to 0.05 s [about 0.27 s].
- First sync after the update: about 26 s, 47 requests, about 3.3 MB. Full sync: about 14 s, 32 requests, about 0.9 MB.
- Post-write cycle: about 10 s. Records went through v4 in about 1 s, but collection walked (13 requests, about 6 s) and cash walked (15 requests, about 8 s).
- The own receipt was downloaded again (283 KB), because PaymentResult is not mounted on the online path.

Changes:
- Collection and cash row deltas (`8b274b8c`, `746d8799`): client level 5 with a `rowDeltas` flag (a 400 steps down 5 to 4 to 3) and a new `replaceWhere` patch mode. Collection: per-borrower scope, including borrowers of allocated or repaid charges; it walks on a Cash Accounts change, an unmapped table, a borrower hidden now, more than 8 borrowers or a missing row. Cash: per-account-day scope from max(date, window start); Borrowers and Partners map to their statement days instead of walking (rollup triggers update Borrowers on every payment); it walks on Cash Accounts, Cash Holders, Cash Statement Context, r008, a missing ledger row, more than 30 account-days (`CASH_ACCOUNT_DAY_LIMIT`) or `TARGETED_LIMITS`. Client moved-row checks `deltaMovesRows` and `deltaScopeMoves`. Orchestrator decision: a rename or hide/unhide may be a delta, as long as it stays byte-equal to a walk and the reconciliation matches. The fingerprint stays the authority.
- Own receipt seeding (`20a65f10`, `seedOwnReceipt`): the local file is stored for the payment when its SHA-256, size and type match the upload descriptor, otherwise one shared verified download is used. Seeded on the online post (`SelectedCharges.confirmOwnPayment`), a queued sync, a correction and a loan close; `PaymentResult` is a fallback only.

### DEV measurement after the follow-up (19 Oct, DEV on main `113691f`)
Own payment at 16:49:49Z: the post-write cycle was 6 requests, about 5.6 s (was about 10 s). Records: 2 requests, finished at about 1.9 s. Collection: 2 requests, 2.09 s and 1.73 s server. Cash: 2 requests, 1.41 s and 1.81 s server. Receipt downloads: 0 (was 283 KB). Unchanged poll: 0.02 to 0.03 s server.

### DEV measurement after inline values (19 Oct, DEV on main `68ce669`)
Own payment at 17:44:16Z: the confirming cycle was 3 requests running in parallel (records 0.27 s server, collection 1.67 s, cash 1.42 s). The cycle ended about 3.1 s after the POST and about 2.6 s after the posted response (target under 3 s). Receipt GETs: 0. Unchanged poll: 0.03 to 0.05 s. Management refreshed on the next poll, 5 requests in about 1 s. Remaining cost: the collection upcoming re-reads and the cash statement re-reads, about 27 queries per request.

### Inline values batch (`f36f313b`, owner: "go ahead with option 1")
- Client level 6, `inlineValues`: every schemaVersion 4 response carries its referenced values inline, so a delta answers in one request without the need round trip; the later day-change chunks keep the old path.
- Caps: `INLINE_VALUE_BYTES` 512 KB and `INLINE_VALUE_COUNT` 2048; above them the response falls back to manifest plus need. The manifest is identical either way. Each inline value is hash-checked and a bad one goes to need.
- Step-down 6, 5, 4, 3 on a 400; records at level 5 goes straight to 3.
- Lab timing: collection 141 to about 70 ms (54 to 27 queries); cash about 50 to about 26 ms (44 to 22 queries).

## Baseline
PROD, window 17 October 00:00 to 19 October 2026 (Bangkok), 17,051 request-log rows, from the report script (metadata only):

| Measure | Baseline |
| --- | --- |
| Unchanged poll | 5 requests, 1.7 s server, 3.2 s wall (73 polls) |
| Walks (7+ dataset requests, gaps 4 s or less) | 181; wall p50 20.0 s, p90 62.7 s; server p50 12.4 s; client gap 41% of wall; 462 KB p50 |
| Dataset POST p50 / p90 / avg size | management 0.29 / 0.37 s, 3.6 KB; cash 0.35 / 0.44 s, 3.3 KB; records 1.01 / 2.26 s, 74.9 KB; collection 0.54 / 0.93 s, 20.7 KB |
| Preflights | 1,031 OPTIONS for 6,142 dataset POSTs |
| Post-payment cycle, owner phone, 18 October 20:28Z | about 35 requests, 33 s wall, 20 s server for the follow-up cycle (the script's 4 s quiet rule counts the whole burst: 101 requests, 66.6 s) |
| Own receipt re-downloaded after own upload | 4 of 12 cases, 160 to 250 KB each |
| Walk triggers (61 full records walks) | 32 app write, 12 hourly analytics job only, 2 Bangkok day change, 15 no visible cause |

## Targets
Post-write cycle under 3 s; unchanged poll under 1 s. After DEV and PROD promotion, re-run the script with the same window rules and record the numbers here. Not yet verified: the database-side cost split of a page and the composition of the iPhone client gap (needs client timing capture).

## Checks
| Command | Result |
| --- | --- |
| `python3 -I project/scripts/offline-sync-log-report.py --env prod --from 2026-10-16T17:00:00Z --to 2026-10-19T17:00:00Z` | Pass, baseline above (before the changes) |
| Byte's fast checks (biome, `npm run typecheck`, focused unit tests, `npm test`) | Pass: `npm test` 685/685 at `1e32dd4`, rising to 715/715 at `666ec55` |
| Forge's auth floor unit tests | Pass, 46/46 at `2b8f7bb` |
| `mw-db-ci` migrations and phase8 groups (V97) | Pass, exit 0 at `f22335d`, again at `74fa0d5`, again at `50825c4` (ENABLE ALWAYS and TRUNCATE change), as reported by Forge |
| Chase's final pass at `666ec55`: `npm test` | Pass, 715/715 (re-run by Chase) |
| Chase's final pass at `666ec55`: Biome | 0 errors (790 warnings) |
| Chase's final pass at `666ec55`: targeted Playwright (offline-delta, reconcile and data-check, R078 subset) | Pass, 24/24 on both projects |
| Chase's whole-batch sweep at `666ec55` | Clean: no debug code; `pinOfflineBusinessDate` refused under `K_SERVICE`; no credentials; no `.only` or skip except the 7 environment-gated lab tests |
| Chase's labs: v4 equality against a fresh walk (serial, disposable clusters) | Pass, 22 scenarios plus the late-commit cursor |
| Chase's labs: reconciliation, per-key corruption | Pass, 49 cases detected and healed, plus a reconcile match after every scenario |
| Chase's labs: day change under a shifted database clock (libfaketime) | Pass, 4 month-end cases (31 Oct, 30 Nov, 31 Dec, 28 Feb) |
| Follow-up batch, Byte at `746d8799` (clean tree) | Pass: lint, typecheck, `npm test` 722/722; e2e 56/56 and 190/190; new specs `offline-row-delta.test.mjs` and `own-receipt-seed-independent.spec.ts` |
| Follow-up batch, Chase's collection/cash lab at `9295fbd0` (`c7dcf956`, `b11c72af`, `3898b67d`, `9295fbd0`), fresh libfaketime cluster | Pass 4/4, including the attack scenarios (renames across accounts, partner rename, cross-borrower allocations and repayments, ledger moves, loan and charge moves, limit breaches) |
| Follow-up batch, Chase's other labs | Day-change clock lab 1/1; records equality, reconcile and v4 labs 5/5; targeted e2e 12/12 |
| Inline values batch, Byte at `f36f313b` | Pass: lint, typecheck, `npm test` 726/726, e2e 194/194; Chase's labs 9/9 |
| Inline values batch, Chase's verification of `f36f313b` (tests in `41a15380`) | Pass. Each lab on its own fresh libfaketime cluster with `inlineValues:true`: collection/cash lab 4/4, day-change clock lab 1/1, records equality, reconcile and v4 labs 5/5; every scenario byte-equal to a walk and reconciled, zero need requests for deltas, limit breaches still walk. New unit test `inline-values-caps.test.mjs` 4/4 (2048/2049 count boundary, exact 512 KB boundary, identical manifest, no inline values without the flag). New e2e: tampered, truncated and wrong-key inline values fall back to need with the correct final data (8/8); step-down 6 to 5 to 3 for records (4/4). Biome 0 errors. No defects; one Info note (hash-check cost negligible) |
| DEV deploy of `113691f`, 19 October 2026 | New image on the four DEV services (Terraform plan 0/4/0), DEV Hosting release deployed; pins in the [environment inventory](../project/Documents/Environment_Inventory.md). Smoke: health 200, unauthenticated 401, `Access-Control-Max-Age` 7200, no ERRORs |
| PR #87 CI: `Development checks` run 39292701581; run 39292672784 | Pass; merged into main as `68ce669` |
| DEV deploy of `68ce669`, 19 October 2026 | New image on the four DEV services (Terraform plan 0/4/0), DEV Hosting deployed; pins in the inventory. Smoke: health 200, unauthenticated 401, `Access-Control-Max-Age` 7200, bundle `68ce669`, no ERRORs |
| Echo's UX check: local build of `666ec55` in Chromium at iPhone size (390x844, touch), mocked fixtures | Fine: UX-LIST-01/03, UX-FULL-01..06 (progress monotonic in a full sync, 0 to 94 to done), UX-RECON-01..07; Echo agreed with "Open troubleshooting" and colour #8b1a1a. Fixed in `333cf89` (CSS): UX-CHK-01 data-check toast covered SyncedToast on mobile, UX-CHK-02 troubleshooting link now a 44 px touch target, UX-CHK-03 Full sync button has a disabled look while it runs. UX-CHK-04 fixed in `6607b22` (Byte): while `localPending` is set, Correct, Move interest and Delete carry the title "Available once confirmed" / "ใช้ได้หลังยืนยันแล้ว"; `tests/e2e/payment-confirming-independent.spec.ts` passes 2/2 on desktop and mobile; lint, typecheck and `npm test` 715/715 on a clean tree |
| `npm run check:docs` | 0 failures at this note's commit |
| PR #84 CI: `Development checks` run 39266899206 | Pass (green, e2e shards 1 to 3 run in full) |
| PR #84 CI: `Database migrations` run 39265256162; `Agent tests` run 39266904301 | Pass |
| Merge-head run on `147fb1c` | Evidence reused from the PR runs (identical tree) |
| Merge into main | `06a8902` (PR #84) |
| V97 DEV apply, 19 October 2026 | Done through the guarded runner from `147fb1c` (migrations tree identical to the tested `98c7527`); backup with restore test first; owner-authority role reconciliation 0 violations. Pins and record references are in the [environment inventory](../project/Documents/Environment_Inventory.md) |
| DEV deploy, 19 October 2026 | New image on the four DEV services (Terraform plan 0/4/0), DEV Hosting deployed with release label R078; pins in the inventory |
| DEV smoke | Health 200; unauthenticated 401; OPTIONS returns `Access-Control-Max-Age: 7200` and the dev origin; the bundle carries `06a8902`; no DEV log errors |
| Re-run of the report script on DEV and PROD after promotion | Pending |

## Not run
- The wide Playwright suite (the PR CI is the broad run).
- WebKit or a real iPhone.
- Production data volume and latency of 8-page management, 16-page cash and the reconcile walk.
- A clock shift past 14 days, and a wrong phone clock end to end.
- The post-promotion report re-run.
- The iPhone client-gap composition (needs client timing capture).
- Thai rendering (checked in code only), a real recorded payment switching from Confirming to confirmed, and WebKit or a real iPhone for the UX check.
- A signed-in offline-dataset call returning the `changes` cursor on DEV (needs the owner's sign-in).
- The DEV re-measurement after the inline-values deploy (the follow-up was measured, see above); PROD measurement.
- A SHA, size or webp mismatch of the seeded receipt in a real browser; WebKit or a real iPhone for the follow-up batch.
- V97 in PROD (authorized up to DEV; PROD needs a promotion instruction and a verified backup). No PROD action.

## Recovery
Revert the batch's commits on `claude/delta-sync-efficiency`; before promotion nothing is deployed. V97 is an immutable migration: after a PROD apply, recovery is a restore from the verified backup taken at promotion; the new table is read-only for the app role and clients fall back to the protocol 3 walk when it is unreadable.

## Open questions
PROD promotion instruction for V97 and the release (the owner authorized up to DEV only).

## Remaining work
The owner's DEV check, PROD promotion on the owner's instruction, the post-change report run against the targets (post-write cycle under 3 s, unchanged poll under 1 s), promotion, and the Release Tracker row at promotion.
