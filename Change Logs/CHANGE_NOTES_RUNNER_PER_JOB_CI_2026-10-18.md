# Change notes — Promotion runner per-job CI gate (R074 tooling), 18 October 2026

## Purpose
The PROD Hosting promotion runner required one CI run with executed terraform and e2e jobs, but the CI reuse step skips those, so R073 needed a forced dispatch (run 39118014759). The runner now accepts the same reuse-evidence chain CI uses, job by job, so no forced dispatch is needed.

## Changes
- `scripts/promotion/deploy-business-hosting.mjs`: new R074 Hosting-only contract (schemaVersion 15, baseline R073 release 042359b, R069 runtime, V95). R065 to R073 contracts are unchanged.
- Per-job gate: `applicationCi.runs` holds the cited run and job receipts. `applicationCi.ci` (check, e2e x3, terraform jobs) and `applicationCi.database` (guards and the four rebuild-group jobs) each name `{runId, headSha}` per job. A job counts when its run is `ci.yml` or `database.yml` in this repository, completed with success, the job executed with success exactly once, and the run head is an ancestor of the source with no stage-relevant file difference, or the head is the delivery-tool commit (existing rule). Verify-live re-reads every cited run and its jobs from GitHub before apply.
- One definition of "stage-relevant": the runner imports `loadStages` and `isRelevant` from `scripts/ci/reuse-evidence.mjs` and reads the regexes from `scripts/ci/stages.json`; `guards` uses the rebuild stage. `ci.yml` and `reuse-evidence.mjs` are unchanged.
- R074 diffs use `--no-renames -z`, so a file moved out of a relevant path, or one with a quoted name, still counts as a relevant change (from Chase's review).
- Unit test for the runner updated alongside (Byte).
- `project/Documents/Development_Changes.md`: removed the outstanding-work row for the full-CI gate; updated the delivery tooling status (new `Promotion runner` row, closing paragraph).

## Checks
| Command | Result |
| --- | --- |
| Runner unit test (`node --test tests/unit/business-hosting-delivery.test.mjs`) | 50/50 pass on the batch tree (Byte) |
| `npm run typecheck` | Exit 0 (its tsconfigs do not cover `scripts/` or `tests/`) |
| Lint (`npx biome lint` on the two changed `.mjs` files) | Exit 0; one pre-existing warning on an untouched test line |
| `npm run check:docs` | 0 failures, 0 warnings |
| `--check` dry run, synthetic R074 package (disposable clone) | Exit 0 with the real R073 split evidence; exit 1 with `check` cited from 39113397874 |
| Adversarial gate review (Chase) | Rename and quoted-path bypasses found and fixed (`--no-renames -z`); re-probe confirmed |
| Development checks (pull request) | The pull request's run on this commit |

Proof against real R073 evidence, no forced dispatch: e2e x3 from PR #60 run 39113397874 (head 01025a3), terraform from run 39108363565 (c21884a), check from PR #61 run 39116268119 (head d57fb7d, tree identical to the R073 source 042359b). Check from 39113397874 or 39108363565 is correctly rejected: both differ from the source in check-relevant files (the R073 runner contract; for c21884a also the offline fix).

## Not run
No promotion or PROD effect: the contract is exercised by the unit test and offline verification only. Live GitHub re-read of cited runs happens at the next R074 promotion.

## Recovery
Revert the batch commit. The R065 to R073 contracts are untouched, so earlier release records stay verifiable.

## Open questions
None.

## Remaining work
Limitation: `scripts/ci/reuse-evidence.mjs` `listCandidates` has the same rename and quoted-path gap (`git diff --name-only` without `--no-renames` or `-z`). It was not changed here (out of scope) and is recorded as outstanding in [Development Changes](../project/Documents/Development_Changes.md).
