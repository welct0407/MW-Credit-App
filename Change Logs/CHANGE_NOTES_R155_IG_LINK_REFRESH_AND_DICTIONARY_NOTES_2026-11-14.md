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
| Chase's round-2 review | To follow; recorded here once |

## Not run
No live capture or PROD access (fixtures only). The first real use is the next targeted reconcile after a migration; its `plan.json` should list the preserved items. The PR's `Development checks` and DEV and PROD smoke follow the promotion.

## Recovery
Git baseline `6c7c90ba` (R154 closure). The tooling change is a revert of `reconcile_captures.py` and its tests; no data or deployment is affected. The offline change is reverted by redeploying the R154 services and Hosting version `d1f03f398962da84` together.

## Open questions
None.

## Remaining work
Chase's round-2 review, the PR's `Development checks`, the PROD promotion record (Forge), the dictionary and inventory at closure, and owner acceptance.
