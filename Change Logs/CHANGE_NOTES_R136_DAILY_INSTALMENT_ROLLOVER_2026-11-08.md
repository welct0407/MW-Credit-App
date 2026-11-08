# Change notes — R136 daily instalment defaults and loan rollover, implementation, 8 November 2026

## Purpose
Implement the owner-approved [R136 design](../project/outputs/r136-daily-instalment-rollover/DESIGN.md) (owner decisions of 8 November 2026, D1 to D14): daily instalment loan form defaults with the "Documentation Fee" label, and the Rollover action that closes an open daily instalment or daily interest loan through a deduction from a new loan's disbursement. The owner's instruction of 8 November 2026 was to implement it and test it in DEV; no PROD action, merge or tag is authorized here. The earlier [design note](CHANGE_NOTES_R136_DAILY_INSTALMENT_ROLLOVER_DESIGN_2026-11-08.md) records the design batch.

## Changes
- SQL (Byte): `database/migrations/V138__loan_rollover.sql`. Column `"Loans"."Ref Rollover Source Loan"` (nullable text, FK ON DELETE RESTRICT, partial index) and a COMMENT on `"Transfer Fee"` (Documentation Fee). New `loan_rollover_calculation_v1(text,date,numeric)` (read-only, EXECUTE for `mw_app_<env>`) and `pwa_apply_loan_rollover_v1(text)` (journal owner only). Redefined `pwa_submit_operation_v2` (operation `loan.rollover`, rejection `rollover_ineligible` P5B12), `pwa_effective_payment_plan_v2`, `pwa_payment_head_v2` and `first_day_charge_trigger` (skips `rl138:` charges). Journal: `pwa_versioned_outcome` constraint widened, `pwa_operation_receipt_v2` rebuilt, new `pwa_operation_settlement_receipt_v1`. Ids: closing charge `rl138:<length>:<loan>:<day>`, settlement payment `pwa:<requestId>`. Every loan and payment version hash changes once when V138 applies. `database/current/public-functions.sql`, `scripts/database/Test-Rollover.sql`, `Test-AccessMatrix.sql`, `Test-StatementBatch.sql`.
- Services (Byte): `services/business/loans.mjs`, `payments.mjs`, `services/contracts/operation-command.mjs`, `services/payment-command/handler.mjs` and `store.mjs`. Read route `GET /api/loan-records/:id/rollover-preview?day=&penalty=` (command service, beside close-preview); the loan record adds `rolloverSourceLoanId` and `rolledOverToLoanId`.
- PWA (Byte): new `apps/pwa/src/LoanRollover.tsx` and `rollover-statement.ts`; `LoanForm.tsx`, `loan-form-values.ts`, `LoanRecord.tsx`, `OfflineViewedRecord.tsx`, `Icon.tsx`, `live-style.css`, `offline-sync.ts`, `read-cache.ts`. Labels: Documentation Fee / ค่าธรรมเนียมเอกสาร, Rollover / ต่อสัญญาใหม่, Early closure penalty (original loan) / ค่าปรับปิดสินเชื่อเดิมก่อนกำหนด, Review rollover / ตรวจสอบการต่อสัญญา, Use current statement / ใช้ยอดปัจจุบัน, Rollover of / ต่อสัญญาจาก, Rolled over to / ต่อสัญญาเป็น. The rebate line under the rollover status line reuses "Rebate:" / "ค่าแนะนำ:". The rollover page keeps a device draft and re-quotes the statement on restore.
- Chat (Byte): `services/chat/assets/command-catalogue.json` fee labels relabelled, `conversation-business-rules.md` (instalment early-close path), `schema-digest.json` at 138 (starts a new chat history epoch), `scripts/chat/build-schema-digest.mjs`. `loan.rollover` is not in the command catalogue.
- Tests: `tests/unit/r136-rollover.test.mjs`, `tests/integration/loan-rollover-independent.test.mjs`, `tests/e2e/loan-form-defaults-independent.spec.ts`, `loan-rollover-independent.spec.ts`, and edits to `chat-proposals`, `chat-schema-digest`, `phase5-borrower-independent` and `Run-UnifiedReceiving.ps1`.
- Records (Dewey): [Release Tracker](../project/Documents/Release_Tracker.md), [Development Changes](../project/Documents/Development_Changes.md), [PWA Data Model](../project/Documents/PWA_Data_Model_Overview.md) (Loans row and rollover source-correction row with the reversal path), [Solution Design](../project/Documents/Solution_Design.md) (R136 current state), [Database README](../database/README.md) (V138 entry), [human-api.yaml](../project/Documents/Data%20Dictionary/systems/pwa/human-api.yaml) (route, operation, loan record fields), the DESIGN status line and this note. The Data Dictionary SQL objects (column, two functions, replaced routines) wait for a PROD capture after V138 reaches PROD, as for R128 and R129. The Environment Inventory pins wait for the DEV deployment.

### Differences from the design
- The rollover is a separate page (`LoanRollover.tsx`), not a mode of the loan form; the arrangement note is built in the PWA.
- The settlement payment posts before the new loan is created (the design listed the new loan first).
- A second rollover of a loan is refused while an `rl138:` charge exists on it.
- The reversal order is: delete the settlement, delete the `rl138:` charge, delete N's first-day net-off, delete N. Deleting the `rl138:` charge is required before a Loan Close of a reopened daily-interest original loan when another charge is dated the same day (otherwise "Multiple charges today require reconciliation before closing"); in other cases the charge stays editable or deletable.
- Known limitation: `loan.delete` of an original loan referenced by a rollover returns an untranslated foreign-key error; it cannot occur in practice because the loan's repayments block the delete first.

## Checks
| Command | Result |
| --- | --- |
| `npm run lint` | Pass (Byte, HEAD `02371dbb` plus the uncommitted tree) |
| `npm run typecheck` | Pass (Byte, same tree) |
| `npm test` | Pass, 1245 passed, 1 existing skip (Byte, same tree) |
| Focused unit tests | Pass, 58/58 including `r136-rollover` 7/7 (Byte, same tree) |
| `Test-MigrationsCloud.py --sql-only` | Pass: chain to V138, rerun applies 0, checksum tamper rejected, `Test-StatementBatch` including `Test-Rollover`, `public-functions.sql` regenerated (Byte, same tree) |
| Schema digest check | Pass, digest at 138 (Byte, same tree) |
| `tests/integration/loan-rollover-independent.test.mjs` | Pass, 3/3 (Byte, same tree) |
| Playwright `loan-form-defaults-independent` and `loan-rollover-independent`, desktop and mobile Chromium | Pass (Byte, same tree) |
| Adversarial review of SQL and services against the design and Archie's 18 cases | No blockers (Chase); borrower-totals and statement assertions added; guard, privilege and reopen probes on disposable PostgreSQL 18 pass; loan-date rollover case added, Byte applying |
| Pull request `Development checks` run | Pending (iPhone WebKit shard runs here) |
| `npm run check:docs` | Pass, 0 failures and the 4 pre-existing warnings (Dewey) |

Observation (Chase): the settlement appears on the cash statement as `LOAN_PAYMENT`, not with net-off specific wording; consistent with the design, no change.

## Not run
- Concurrent rollovers of one loan.
- Real-role privilege tests (the grants are emulated, as in other tests).
- iPhone WebKit browser run, the pull request CI run and the DEV deployment and smoke: Pending. A skipped check is not a pass.

## Recovery
Git baseline `02371dbb` (R136 design commit on `claude/ecstatic-pasteur-x58o80`, after the R135 closure `5ea4036`). DEV: Hosting redeploy of the previous version, image-only Terraform back to the prior settings generation, and the verified DEV backup at V137 taken before V138 (reference recorded with the DEV deployment evidence). V138 is forward-fix only; the new column is nullable and unused by older code.

## Open questions
None: D1 to D14 are decided.

## Remaining work
DEV deployment evidence (to be added below by Forge or the delivering session), Echo's pass on the DEV build, the dictionary refresh after PROD, and PROD only on the owner's instruction with a verified backup before V138.

## DEV deployment evidence
Pending. Fill in: package commit and `Development checks` run; V138 sha256 and DEV release manifest; backup at V137 (time, dump sha256, restore verified); owner window open and restore times; migration time and `Invoke-CloudFlyway.py verify --target dev` readback; Cloud Build id and image digest; Terraform plan and apply counts; revisions; Hosting version and build label; smoke results. Pins themselves go only in the [environment inventory](../project/Documents/Environment_Inventory.md).
