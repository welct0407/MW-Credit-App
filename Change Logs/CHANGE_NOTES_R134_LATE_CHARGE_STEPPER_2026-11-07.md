# Change notes — R134 late charge stepper shows the saved amount, 7 November 2026

## Purpose
Fix the late charge −50 / +50 control so that repeated presses on the same charge always show the amount and total charge that were actually saved.

Owner scope, 7 November 2026: "When I add late charge continuously several times on the same charge, there's a chance the latest late charge and total charge is not reflected in the app but already updated; I clicked add late 50, nothing happened, and clicking again resulted in adding 100. Engage the team to check it and fix the issue, test in dev, and let me review."

Status: Open. Authority: fix, deploy to DEV, test in DEV, then owner review. No production approval has been given.

Team: Archie (root cause), Byte (fix), Chase, Dewey, Echo. Forge for the DEV deploy.

## Changes
- Root cause (Archie): to be recorded.
- Fix (Byte): to be recorded, with files (starting point: `apps/pwa/src/LateChargeStepper.tsx` and its callers `ChargeRecord.tsx`, `CollectionRecords.tsx`, `ChargeForm.tsx`, `PaymentRecord.tsx`).
- Tests (Byte, Echo): to be recorded (`tests/unit/late-charge-fields.test.mjs`, `tests/e2e/late-charge-independent.spec.ts`).
- Documents updated: to be recorded.

## Checks
| Command | Result |
| --- | --- |
| to be recorded | to be recorded |

DEV evidence (to be recorded): Hosting version and API revisions are pinned only in the [Environment Inventory](../project/Documents/Environment_Inventory.md#latest-verified-deployments); the DEV smoke (repeated presses on one charge, amount and total charge after each) goes here.

## Not run
To be recorded.

## Recovery
Revert the R134 commits; redeploy the previous DEV Hosting version listed as rollback in the Environment Inventory. No SQL change is expected.

## Open questions
None yet. Owner review of DEV is pending.

## Remaining work
Root cause, fix, checks, DEV deploy and owner review.
