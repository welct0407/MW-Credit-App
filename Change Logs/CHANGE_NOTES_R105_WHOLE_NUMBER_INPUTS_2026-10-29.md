# Change notes — whole-number amount inputs (R105), 29 October 2026

## Purpose
Make every numeric amount field a whole number with the iOS numeric keypad, so entry on a phone is quicker and cannot carry stray decimals. PWA only: no SQL, API, infrastructure or VM change.

## Changes
- New: `apps/pwa/src/whole-number-input.ts` (whole-number helper: numeric keypad, digits only), `tests/unit/whole-number-input.test.mjs`.
- Changed: `apps/pwa/src/LoanForm.tsx`, `loan-form-values.ts`, `ChargeForm.tsx`, `ManagementAssessments.tsx`, `ManagementFinancialForm.tsx`, `ManagementForm.tsx`, `live-style.css`.
- Tests changed: `tests/unit/loan-form-values.test.mjs`, `tests/e2e/phase5-borrower-independent.spec.ts`, `back-consumers-independent.spec.ts`, `phase5-final-ui-independent.spec.ts`. The management P6 T9 test (Sort Order minus) is in `phase5-final-ui-independent.spec.ts`.
- Behaviour: all numeric amount fields are whole numbers; no native `pattern`, the app shows "Whole baht only. Enter amounts without decimals or separators."; leading zeros are rejected.
- Payment interval: minus and plus stepper (step 1, minimum 1), capped at 2147483647. A plus or minus on a legacy decimal rounds half-up first (1000.50 + 500 gives 1501).
- Charge form: blank Principal Due and Interest Due count as 0, placeholder "0".
- Legacy decimals that are unchanged save as they are on the loan, charge, assessment and financial forms. Auto daily interest rounds half-up to whole baht.
- After a failed loan Save the error scrolls into view and the first failing field gets focus and `aria-invalid` (UX-NUM-05). Sort Order allows a leading minus.
- Kept decimal: Minimum Daily Profit Rate (percentage).
- No SQL: server contracts already accept integers (Archie, `database/current/public-functions.sql`).
- Known limitation (pre-existing): a negative Interest Due cannot be typed on the iOS numeric pad.
- Records: `project/Documents/Development_Changes.md` (R105 row), `project/Documents/PWA_Data_Model_Overview.md` (input precision sentence). Unaffected: dictionary (UI-only), Solution Design, Release Tracker, Environment Inventory.

## Checks
Base `65b4838`, uncommitted tree; the commit SHA comes from the pull request.

| Command | Result |
| --- | --- |
| Byte lint | Pass, clean (572 files) |
| Byte typecheck | Pass, clean |
| `npm test` | Pass: 984 pass, 1 skip, 0 fail |
| Borrower spec (desktop and mobile chromium) | Pass, 76/76 |
| Management P6 T9 spec | Pass, 2/2 |
| Other touched specs | Pass, 10/10 |
| Chase adversarial review | No blocking defects; 4 low findings (2 fixed, 2 accepted: the iOS negative Interest Due limit and legacy-decimal behaviour above) |
| Echo Pixel 7 viewport check | Pass; UX-NUM-05 fixed |
| `npm run check:docs` | Pass, 0 failures, 0 warnings |
| Pull request `Development checks` | Pending |

## Not run
Real iPhone keypad check and DEV deploy. A skipped check is not a pass.

## Recovery
Revert the batch's Git commit. No database, infrastructure or deployed-artifact change exists to undo.

## Open questions
None.

## Remaining work
Byte and Chase results in the Checks table, DEV check on an iPhone, owner acceptance.
