# Change notes — Offline version stamp, dictionary authored notes and stale borrower details (R155), 14 November 2026

## Purpose
Owner instructions of 14 November 2026: "do the The suggested session, and combine it with the hotfix of ig links, push both together in one release into prod"; "Do this task here: Fix stale borrower details after referrer change"; and, about the hidden invite field, "the field show for other borrowers, and even Poppy shows two links on iphone. so just ignore it and proceed with other changes". Part (a) fixes the new "IG Group Invite Link" field staying hidden on a borrower record cached on a device before V149. Part (c) fixes borrower details that stayed stale after a referrer change. Part (b) stops the Data Dictionary reconcile from dropping hand-written content: the R153 and R154 runs of `relation:public.Borrowers` removed the "Borrower Name is mandatory" rule (owner W5, 17 October 2026, source `0fdf49a`) and it was restored by hand each time.

## Changes
- (a) Offline version stamp (Byte, `services/business/offline-dataset-delta.mjs`): after a dataset shape bump, a device holding an old-shape version with a change cursor received only the changed rows labelled with the new version, so unchanged cached records kept the old shape (the hidden R154 invite field on some devices). The last 8 hex characters of the dataset version hash now carry the shape stamp (`5a9e000b` for v11); an unstamped or old-stamp version gets one full re-download of that domain. Chase verified: no loop, all four domains, the next-day path, protocol unchanged. Known gap: a device with pending local writes sends no version; it is healed by reconciliation or Full sync. Known and not fixed (the owner chose to ignore it): tapping Edit autosaves a draft holding the old record and a later open restores it, which hides the field; Byte's draft patch is saved out of tree and not applied.
- (c) Stale borrower details after a referrer change (Byte): five cases confirmed on base: a cleared referrer left the old referrer marked as a referrer; a set referrer did not mark the new one; a new borrower referred by C did not mark C; a pending expense with payee C left C's expenses owed; paying that expense did not update C. `readRecordsTargeted` now re-reads the current referrer of scoped borrowers and the payee of changed expenses, and `deltaMovesRows` treats a changed borrower `referrerId` or expense `payeeBorrowerId` as moved rows, so the client walks. The reconcile-lab harness is fixed (a racing write after the first fingerprint read). No SQL migration, no PWA source change; the shared digest module is bundled into the PWA, so Hosting is rebuilt; no agent change.
- (b) Dictionary tooling (Dewey), `project/scripts/dictionary/reconcile_captures.py`: new `preserve_authored(old, new, kind)` with `CATALOG_TOP` and `CATALOG_ENTRY`. A PostgreSQL reconcile now takes catalog facts from the capture (definition, columns, constraints, indexes, triggers, policies, dependencies; a routine's definition) and carries over every other key of the existing record: top-level `business_rules`, `purpose`, `grants`, `release`, `dev_prod_equal`, `development_definition`, and entry keys such as a column's `business_rule`. `plan.json` gains `preserved_authored` and `orphaned_authored` (authored keys on a column or object the capture no longer has; dropped with it, listed for review), and the plan's printed summary counts both. Evidence is unchanged by design: `verification.source` names the new capture and `previous_record` names the replaced record. `dictionary.py update` already patches single `/content/` pointers and was not changed.
- Tests (`project/scripts/dictionary/test_reconciliation.py`, fixtures only, no PROD capture): a record with a business rule and a changed column keeps the rule and updates the column; a catalog value is never kept from the old record; an authored key of a removed column is reported and dropped; routine and non-object content; a plan-level test that the rule survives `plan` and `apply` while `verification.source` and `previous_record` are replaced.
- Read-only check against the R154 observations and the current dictionary: the new function would have kept all 22 authored items (the Borrower Name rule, `business_rules` on Cash Holders, `purpose` and `grants` on two notify routines, `release` and `dev_prod_equal` on two R046 routines, and `development_definition` on 13 objects). Earlier runs dropped these too.
- Documents (Dewey): `project/scripts/dictionary/README.md` (the preservation rule), `project/Documents/Release_Tracker.md`, `project/Documents/Development_Changes.md`.
- Not changed: the dictionary records themselves, `Environment_Inventory.md` (pins at closure), the agent, SQL, migrations.

## Checks
| Command | Result |
| --- | --- |
| `python3 -m unittest discover -s project/scripts/dictionary -p 'test_*.py'` | 58 tests OK (the new tests included) |
| `python3 project/scripts/dictionary/dictionary.py validate` | No errors |
| `npm run check:docs` (Dewey) | Pass |
| Equality lab | 3/3 (the referrer steps are "walk (rows moved) equal"; new scenarios delta-equal) |
| Reconcile lab | 1/1 |
| `offline-delta-v4-lab` | 1/1 |
| `collection-cash-lab` | 4 pass, 1 skipped |
| `day-change-lab` | 1/1 |
| `npm test` | 1364 tests, 1363 pass, 1 skipped |
| Offline e2e (`dataset-replay`, `offline-delta`, reconcile independent), desktop and mobile chromium | 78 passed |
| `npm run typecheck`, `npm run lint` | Typecheck clean; lint 1 pre-existing info |
| Chase's verification of part (a) | No loop, all four domains, next-day path, protocol unchanged |
| `Development checks` run 43563275927 and `Database migrations` run 43563258682 on `f87ca051` | Green (e2e skipped by the classifier; local offline e2e 78 passed) |
| PROD verification | Pass, see the PROD promotion record |

## Not run
No live capture or PROD access (fixtures only). The first real use is the next targeted reconcile after a migration; its `plan.json` should list the preserved items. The PR's `Development checks` and DEV and PROD smoke follow the promotion.

## Recovery
Git baseline `6c7c90ba` (R154 closure). The tooling change is a revert of `reconcile_captures.py` and its tests; no data or deployment is affected. The offline change is reverted by redeploying the R154 services and Hosting version `d1f03f398962da84` together.

## DEV deployment record (Forge, 14 November 2026 UTC)
Authority: the three owner instructions quoted in Purpose. Package `44efb4371ad331a67a8947073d6ff5a31050f7b0` (merge of PR #321), deployed from a clean worktree (git archive). DEV was R154 at V149; no SQL and no data write. CI on `f87ca051`: `Development checks` run 43563275927 (check and lint; e2e skipped by the classifier) and `Database migrations` run 43563258682 (guards, four rebuilds); Byte's local offline e2e 78 passed.

| Item | Record |
| --- | --- |
| Image | Cloud Build `f46e6fbd-dfdf-4143-9d6c-d8268688f59f`, 05:55:40Z to 05:56:16Z, digest `sha256:e1a30fff831357d60ee7a15c8e83f3c9887aac106f1f7d675bd9a123fb60972b` |
| Terraform | 0 to add, 3 to change, 0 to destroy, image only; generation `1794635890755694` (previous `1794627823033051`), 05:58:13Z to 05:58:50Z; read `00095-62j`, command `00112-tmx`, chat `00064-7bj` |
| Hosting | Version `7ed477d4abc90d21`, release `1794635987912000`, 05:59:40Z to 05:59:48Z, build R155 `c7c7108c3dc500c18f543c7d` |
| Smoke | Health R155 `44efb437`; origins R155; `sw.js` no-store; unauthenticated 401; a full offline sync on the DEV test account completed (records 32 pages, collection 9, cash 10, management 4, notifications) |

Rollback: generation `1794627823033051` (R154 image `26aa1710…`) with Hosting `8123781109a724e9`.

## PROD promotion record (Forge, 14 November 2026 UTC)
Authority: the three owner instructions quoted in Purpose ("push both together in one release into prod"). Freeze 06:01:42Z. Package `44efb437`, baseline R154 `ff4de0d5`. Changed: read, command and chat services and Hosting (the PWA bundles `services/lib/offline-dataset-digest.mjs`). Unchanged: notify and jobs (R144), agent (R153), schema V149.

| Step | Result |
| --- | --- |
| Target | Project `clever-oasis-508610-n7`, instance `mw-credit-pg-20261017`, database `loan_manager_prod` |
| Baseline | Flyway 149 (read-only verify 06:03:03Z clean, nothing pending); read `00060-q7q`, command `00065-58s`, chat `00044-9p6` (R154 image `b35af792…`); generation `1794628350409654`; Hosting `d1f03f398962da84` |
| Backup | None: no migration, so none is needed (`database/README.md`; as R150) |
| Image | Cloud Build `a9236fa1-f183-4c74-aa09-5780e3ec1f97`, 05:55:49Z to 05:56:28Z, digest `sha256:9c14d2d626e02da7fbd92d37d5f04bb6d62fb9949812d7ee0092e572dcda8872` |
| Services | Terraform 0 to add, 3 to change, 0 to destroy, image only, generation `1794636233532039`, 06:03:10Z to 06:03:47Z; read `00061-n4n`, command `00066-njp`, chat `00045-7gr` |
| Hosting | Version `6becd9ab119af520`, release `1794636339378000`, 06:04:59Z to 06:05:46Z, build R155 `5c29ca8172fc49e0d14197c5`. The e2e receipt was R154's run 43550924310 (e2e was skipped on `f87ca051`; Byte's local offline e2e passed 78) |
| Smoke | Health R155 `44efb437`; origins R155; `sw.js` no-store; unauthenticated 401; no ERROR logs after 06:03Z (checked 06:16Z) |
| Load | 06:05Z to 06:16Z: command 165 requests (145 offline-dataset), 0 5xx, p50 0.04 s, p95 1.66 s, max 2.76 s; read 21 requests, 0 5xx, p95 0.77 s. Before the deploy: command 535 requests, p95 2.73 s |
| Tag | `R155` on `44efb437` (Release tag run [43564699893](https://github.com/welct0407/MW-Credit-App/actions/runs/43564699893), 06:06:30Z to 06:06:53Z; tag object `fe802480…` peels to `44efb437`) |
| Closure | Component versions rendered: read, command and chat R155; the PWA shows R154 because the components registry lacked `services/lib` (fixed in R156); schema R154 at V149; agent R153; notify and jobs R144. Drift 06:07:14Z: 2 drift (the PWA DEV and PROD release label, from the registry gap; the live bundles are R155) and 2 unverified (Grafana, Metabase). No dictionary capture (no schema change) |
| Link check | Read-only, 14 November: one sample borrower's stored group `conversation_id` decodes to a 61-character URL-safe base64 value (a 4-character text prefix, 1 separator byte and 40 opaque bytes, no decimal digits), so it holds no thread number; the sample's "IG Group URL" held an ig.me link. A backfill from it was dropped; nothing was written |
| Pruned | `integration-agent/Change Logs/CHANGE_NOTES_R152_REVIEW_ROW_ORDER_2026-11-13.md` and `integration-agent/Change Logs/CHANGE_NOTES_R152_GROUP_CHAT_SUMMARY_SENDERS_2026-11-13.md` (R152 is outside the three most recent Released releases; inbound links repointed to the permalink at `44efb437`) |

Rollback: `production.activation.before-r155.tfvars` (generation `1794628350409654`, R154 image `b35af792…`) with Hosting `d1f03f398962da84`; no database step.

Limitations: the owner checks that borrower details refresh after a referrer change. The e2e job was skipped by the classifier for this release (fixed in R156).

## Open questions
None.

## Remaining work
None. Owner-accepted in PROD on 14 November 2026 ("i accept R153 to R157, and i've done everything.").
