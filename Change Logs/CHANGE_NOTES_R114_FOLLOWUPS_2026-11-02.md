# Change notes — R114 follow-ups after the Pay Forward releases, 2026-11-02

## Purpose
After R110 to R113 the team listed six follow-ups. The owner answered "Do all 1-6". R114 does them in one release: two Receive payment form fixes, a Linux fix for a test script, the missing Data Dictionary entries, the Collection rebate-offset caption and the DEV test Partner as an AI Reviewer.

## Changes
Owner authority (2 November 2026): "Do all 1-6", in answer to the coordinator's list. It also covers building, DEV test and PROD promotion of the tested scope.

The six items:
1. The stale "Paid through" summary on a blocked Split (R113 observation).
2. Offer "X more closes" for loans a slip cannot fully settle (R113 observation: such a loan is not offered at all).
3. Fix `Run-ProductionAgentReceiptsIndependent.ps1` on Linux (a Windows cleanup that fails there).
4. Data Dictionary entries for `pwa_pay_forward_plan_v1`, `pwa_apply_pay_forward_v1`, `pwa_notify_content_v2`, `pwa_referral_rebate_projection_v1` and the Business Expenses column "Ref Offset Payment".
5. The COL-2 Collection "rebate offset" caption, with its read-role grant (deferred in R111).
6. The DEV test Partner as an AI Reviewer, so the chat purpose card and settle card can be exercised on DEV.

Done so far (item 4, Dewey): owner approval for the new dictionary entries is given by "Do all 1-6" (item 4), as the workflow requires for optional new dictionary documents. Read-only PROD capture at flyway head 126 (225 routines, 99 relations) through the Auth Proxy tunnel as `codex-cloud-read`, output under a private root outside the repository. The targeted reconciliation with `--only` created four new routine entries: `pwa_pay_forward_plan_v1`, `pwa_apply_pay_forward_v1`, `pwa_notify_content_v2` and `pwa_referral_rebate_projection_v1`. The column "Ref Offset Payment" is already in the regenerated "Business Expenses" relation entry (R111 closure), so it needed no new file. `dictionary.py index` and `validate` pass (476 documents, 0 errors). Evidence: [plan](../project/outputs/dictionary-r114-20261102/plan.json), [coverage](../project/outputs/dictionary-r114-20261102/coverage.json) and [observations](../project/outputs/dictionary-r114-20261102/production-postgresql-observations.json).

Items 1, 2, 3, 5 and 6: the file list, decisions and checks are filled when the code lands.

Team (six-agent process, this session): Archie designs, Byte builds, Chase verifies, Echo reviews, Dewey keeps records, Forge deploys DEV and later PROD.

## Checks
| Command | Result |
| --- | --- |
| `capture_postgresql.py production` at flyway head 126, then `reconcile_captures.py plan` and `apply` with `--only` (Dewey) | 4 new routine entries planned and applied |
| `dictionary.py index` and `validate` (Dewey) | Pass: 476 documents, 0 errors |
| Code checks for items 1, 2, 3, 5 and 6 | To be filled |

## Not run
To be filled at hand-off. A skipped check is not a pass.

## Recovery
Before release: revert the pull request (Git baseline R113 `05562375` plus later main commits). The dictionary entries are documents only; Git keeps history.

## Open questions
None for the owner.

## Remaining work
- Items 1, 2, 3, 5 and 6: build, verification, DEV test and PROD promotion.
- The "Thai wording on a real iPhone" check from R113 stays open.
