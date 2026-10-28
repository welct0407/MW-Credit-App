# Change notes — record the next projected charge (R104), 28 October 2026

## Purpose
Let a Partner book a loan's next projected charge as an actual charge on its future date from Upcoming Charges, without taking a payment. Owner decisions of 28 October 2026: next projected charge only, per loan row, and the confirmation shows date, principal and interest.

## Changes
- `database/migrations/V116__book_projected_charge.sql`: replaces `pwa_submit_operation_v2` and `pwa_apply_loan_source_v2`; adds operation `loan.book-projected-charge` (target loan, expectedVersion `pwa_loan_version_v2`, inputs `chargeDate`, `principalDue`, `interestDue`). The guard compares the inputs with `pwa_next_projected_charge_v1` and books with `generate_loan_charge`; a changed forecast is journaled as the existing `plan_changed` (P5B11; no new outcome code, the journal CHECK `pwa_versioned_outcome` is unchanged). No new table, column or role.
- Payment draft GET (`/api/payment-drafts/<borrower>`, `services/payment-command/draft.mjs`): `upcoming` (next projected) rows gain `bookVersion`; the read service contract is unchanged. The Upcoming Charges detail fetches it when online.
- PWA Upcoming Charges date detail: button "Record charge" / "บันทึกรายการเรียกเก็บ" on the next projected row only, with a confirmation of date, principal and interest (UX codes UPC-01 to UPC-07 from Echo); online only, not queued offline.
- Records: `project/Documents/Development_Changes.md`, `database/README.md` (V116 paragraph), `project/Documents/PWA_Data_Model_Overview.md`, and the chat rules asset `services/chat/assets/conversation-business-rules.md` (section 5; the chat image needs a redeploy to pick it up).
- Code: `database/current/public-functions.sql`, `services/chat/assets/schema-digest.json` (rebuilt at 116; the chat image needs a redeploy for it and the rules asset), `services/contracts/operation-command.mjs`, `services/payment-command/draft.mjs`, `apps/pwa/src/UpcomingCharges.tsx`, `OperationConfirm.tsx` (optional `onBlocked`), `CollectionRecords.tsx`, `SharedBorrowerDetail.tsx`, `live-main.tsx`, `live-style.css`.
- Tests: `tests/unit/operation-command.test.mjs`, `tests/unit/collection-receiving-display.test.mjs`, `tests/integration/projected-charge-payment-independent.test.mjs`, `tests/e2e/projected-charge-payment-independent.spec.ts`.
- Deploy note: `pwa_submit_operation_v2` is owned by `mw_app_<env>_journal_owner`, so V116 on Cloud SQL needs that owner's authority window, as V107 did. Promotion components: V116, command image, Hosting; the read service is unchanged.

## Checks
All on the uncommitted tree on `9dbe334` unless noted.

| Command | Result |
| --- | --- |
| `npm run typecheck` | Pass, again after the UX fixes (Byte) |
| `npx biome lint` | Pass, 0 findings, again after the UX fixes (Byte) |
| `npm test` | Pass, 966 of 967, 0 fail (Byte) |
| Two unit files after the UX fixes | Pass, 10/10 (Byte) |
| `tests/integration/projected-charge-payment-independent.test.mjs` on a disposable cluster at V116 | Pass, 7/7 (Byte) |
| `mw-db-ci -Group migrations` | Pass, exit 0 (Byte) |
| Chat schema digest unit test | Pass (Byte) |
| Playwright projected-charge and upcoming specs | Pass, 18/18; after the UX fixes projected-charge e2e 12/12 on both projects (Byte) |
| Adversarial review of the diff and V116 | No blocking or major findings; lows kept: 401/403 on the optional offers fetch triggers authFailure (as on the payment screen), and a request queued after a connection drop is refused safely with a generic message (Chase) |
| 375px Chromium visual check | UPC-R01 (blocking, icon-only button), R02 and R03 fixed (Echo) |
| `npm run check:docs` | Pass, 0 failures, 0 warnings (Dewey) |
| Pull request `Development checks` run | Pending: the one broad run |

## Not run
Real iPhone Safari. Any DEV or PROD run: not yet applied. Chat cannot book a charge (intended).

## Recovery
Git baseline `9dbe334`. V116 is `CREATE OR REPLACE` only; rollback is a later migration that restores the V115 bodies of the two functions. A booked charge is an ordinary charge, and no other data changes.

## Open questions
Owner acceptance after first real use.

## Remaining work
Broad CI run, DEV test, then promotion on the owner's instruction.
