# Change notes — version-agnostic tests and backup baselines, 21 October 2026

## Purpose
CI kept failing whenever a branch added a migration, because tests and the backup tool had the current head written in as a fixed number. A new migration no longer needs any edit to tests or tooling.

## Changes
- `tests/migration-head.mjs`: new `migrationHead()` reads the highest `V<n>__*.sql` in `database/migrations`.
- `tests/integration/ledger-owner-operator-independent.test.mjs`: both "migrated to the head" assertions use `migrationHead()` instead of `100`. The fixed V92 and V93 steps stay literal.
- `scripts/database/Backup-ProductionPromotion.py`: `--expected-version` accepts 77 and 87 up to the checkout's latest migration, except 88 and 94 (`supported_baselines`), so the hand-kept tuple is gone. The exact live-history check is unchanged.
- `tests/unit/business-hosting-delivery.test.mjs` (R062 parser test): accepts every baseline through the derived head, and refuses 76, 78, 86, 88, 94 and head + 1. It also proves that a synthetic later migration raises the accepted range.
- `database/README.md` (Each change): adding a migration needs no test or tooling edit; reviewers check that no test hard-codes the current head.
- Reviewed and left unchanged: release IDs in `about-details`, `production-build-environment` and the About e2e are fixed format examples, not current-release expectations. The per-release contracts in `business-hosting-delivery` and the Phase5 `-target=96` pin describe fixed history or deliberate upgrade targets.

## Checks
| Command | Result |
| --- | --- |
| `npm test` | Pass, 765 of 765 |
| `Run-R053OperatorIndependent.ps1 -LedgerOwner` (as `postgres`, disposable loopback cluster) | Pass at head V100; passes again at V101 after merging `main` with R086 (#114), the case that failed in run 39616869157 |
| R062 parser test with a synthetic `V101` file present | Pass |
| `npm run check:docs` | Pass, 0 failures |
| `npx biome lint` on the changed files | One warning, already present on `main` (line 36, unused `url`) |

## Not run
The full `Test-CI.ps1` and e2e suites; the pull request's `Development checks` and `Database migrations` runs are the broad check.

## Recovery
Revert this batch's commit; no data, schema or live target is touched.

## Open questions
None.

## Remaining work
The `invalid_worker_configuration` failure in `r053-worker-http-independent.test.mjs` on the DEV-refresh branch (run 39551081754) is unrelated to versions and not covered here.
