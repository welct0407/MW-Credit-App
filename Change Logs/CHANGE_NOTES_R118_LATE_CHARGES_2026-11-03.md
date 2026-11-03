# Change notes — R118 late charges, 3 November 2026

## Purpose
The owner asked (3 November 2026) for late charges kept in their own columns, with a −50 / +50 control and a separate income line, while the partner's daily interest work stays as it is. R118 is late charges only; the two smaller items planned for R118 moved to R119. Status: in development on branch `r118-late-charges`; nothing is deployed.

## Changes
Outcome: a late charge is a third amount on an existing charge, set by hand in 50-baht steps or typed in whole baht. A payment pays interest, then late charge, then principal, charges newest first. A paid late charge is profit on its payment date, exactly like interest, and every total the owner reads today keeps its value (late is 0 on every existing row). The only new reading is one "Late charges received" memo line on the income statement views and the Metabase Income page.

Owner decisions (3 November 2026, settled in the [plan](https://claude.ai/artifact/JXFYuoKyUZLz89KcBpXbAT)):
- The late charge lives on the charge row in its own columns, never as a separate charge row.
- Set by hand only: no formula and no automatic penalty. Controls: the charge edit page, the charge details page and the Collection charge row, each through Review → Confirm.
- Order inside a charge: interest, late charge, principal.
- Separate reporting is the new income line only; the Dashboard, Cash and Management Analytics tiles do not change.
- Referral rebate (owner, 3 November 2026, overriding Archie's point 4): "Count late charge also into referral rebate as that's considered as profit and referrer is responsible to chase for the payment". The rebate is now min(round(10% x (interest + late charge received)), 1,000); a late charge counts once it is received, like interest.
- Out of scope: rewriting past late fees typed into Interest Due, any automatic rule, moving a late-charge payment between charges ("Move interest" stays interest-only).

Schema (V132, Byte; definitions in `database/README.md`): `Charges` gains `"Late Charge Due"` (money, NOT NULL, default 0), `"Late Charge Paid"` and `"Late Charge Remaining"` (numeric, maintained by the charge refresh like the interest pair; `"Total Paid"` and `"Amount Remaining"` include them); `Payment Allocations` gains `"Allocated Late Charge"` (money, NOT NULL, default 0); `Repayments` gains `"Late Charge Paid"` (money, NOT NULL, default 0). Payment command schemaVersion 11, agent schemaVersion 10. Line shape, byte-exact and key-sorted: `chargeId`, `principal`, `interest`, `lateCharge`, `expectedPrincipalRemaining`, `expectedInterestRemaining`, `expectedLateChargeRemaining`, `chargeDate`.

V132 column positions (Byte, batch 1): Charges 18 `"Late Charge Due"`, 19 `"Late Charge Paid"`, 20 `"Late Charge Remaining"`; Payment Allocations 14 `"Allocated Late Charge"`; Repayments 11 `"Late Charge Paid"`; `olap_charges_analytics` 25 to 27; `olap_repayments_analytics` 21 `"Late Charge Paid"`; `oltp_upcoming_charge_events_v1` 14 `"Late Charge Remaining"`; income views: statement 20 `"Late Charges Received MTD"`, monthly 11, daily 15 and events 6 `"Late Charges Received"`. New function `pwa_notify_content_v3`, granted to the dispatcher only and revoked from `mw_integration_agent`; notify falls back from v3 to v2 to v1.

Accepted deviations from the plan (Byte, batch 1):
- Old clients keep working: `lateChargeDue` is optional on `charge.update`, so a 5-key request keeps the stored value. Auto-assign returns 8-key lines only when asked with `lineVersion` 11.
- Services read late as 0 where V132 is absent, for old-schema test runs (`services/lib/late-charge-schema.mjs`).
- The Loan Close payoff adds the unpaid late charge on every charge of the loan.
- The below-paid refusal stays P5B06 (`record_requires_reconciliation`); the PWA shows the "฿X already paid" text from `lateChargePaid`. This answers Echo's LC-ERR-2.
- A future charge whose only unpaid part is its late charge drops out of Upcoming but still shows in Collection.

Archie's decisions (accepted):
- Profit folding: explicit sums `"Interest Paid" + "Late Charge Paid"` in every profit relation. `olap_repayments_analytics."Interest Paid"` stays interest-only; its `"Amount Received"` and `"Partner A/B Profit"` include late, so the Cash Dashboard, portfolio summary and partner earnings follow without a new column. `reporting_partner_earnings_v1` allocation residual and `partner_net_profit` are updated to match.
- Loan and borrower totals: late is folded into `"Total Interest Received"` (loan) and `"Total Interest Earned"` (borrower), and into `"Total Amount Received"`. No new loan or borrower column. These columns therefore mean "interest plus late charge" from R118; with late 0 everywhere today no value changes.
- Daily Analytics snapshots (`refresh_daily_analytics_scoped`) include late in interest received, charge payments and pending charges, so a late-only charge clears from pending.
- Referral rebate basis (replaces Archie's accepted "interest only"): interest plus late charge received, per the owner decision above. `create_referral_rebate` and `pwa_referral_rebate_projection_v1` change; Chase's rebate twin now proves the rebate rises with a paid late charge and is unchanged when late is 0, with the 1,000 cap.
- Naming follows `database/README.md`: bodies are replaced in place and the version bumps only when a signature changes. `vc_charge_values` and `payment_charge_balances` are dropped and recreated with one appended column, and the snapshot restores owner, ACL and comment. New name only for `pwa_notify_content_v3` (adds `late_charge_amount` last; v1 and v2 stay).
- Legacy 6-key lines (manual v6 to v10, agent v7 to v9) are accepted on a charge with late remaining and leave the late unpaid. `pwa_plan_effects_v83` strips the two expected keys and a zero `lateCharge`, so a stored 6-key plan equals a new 8-key plan with late 0 and old journal rows replay.
- v11 keeps the v10 key set; both pay-forward lists may be empty (a deviation from v10, accepted). v10 and agent v9 stay accepted; a server plan line with late above 0 is refused for them (P4C05) and the client refreshes.
- A first-day (`fd6:`) charge with late above 0 is refused (P5B06).
- Default loss: the write-off also writes `"Late Charge Due"` down to what was paid and keeps `original_late` and `written_off_late` in the evidence; the undo restores it; `df10:` pairs carry late 0 so `is_principal_writeoff` is unchanged.
- Health views count a charge fully paid only when its late charge is paid; "Overdue Interest" stays interest-only.
- Metabase Income tab 16 takes a sixth scalar, "Late charges received" (memo; Net profit untouched). `LateCharges.mjs` defines its own live row (the R116 five-card row) and fails closed without `cards.writeoffs`.
- Chat read role grants are table-level and outside Git: no V132 action.
- The Collection row control is online only and hidden offline; the charge version is read live (a stale screen gets P5B01 and refreshes).
- Beyond the plan's V132 list: `partner_net_profit`, `payment_crud_finish_core_v83` and `close_payment_loans` (fully-paid tests), `attach_payment_receipt_evidence`, `pwa_agent_receipt_status_v1`, `reallocate_payment_interest_audited` and `lump_sum_receipt_guard` change too. Unchanged: `move_payment_interest`, the DELETE branch of `guard_charge_consistency`, `lump_sum_child_guard`, `pwa_apply_loan_source_v2`, `pwa_apply_pay_forward_v1`, `generate_*`, `pwa_next_*`.

Echo findings (first pass; orchestrator rulings applied, the rest is the build spec):
- Collection row: the stepper sits on its own grid line above the row's full-row button (blocker LC-COL-1). At late 0 only a "+50 Late charge" button shows, with − and + after that (LC-COL-2, accepted); a "Late charge ฿50" note shows when late is above 0.
- Charge details: the control sits in its own `dd`, Late Charge Due always shows, Paid and Remaining only when Due is above 0; the offline rule is the Edit pencil's.
- Charge edit page: the loan form's stepper markup and button order (accepted); − stops at what was paid, with "฿20 already paid" help text.
- Receive payment: a third "Late charge (Max ฿50)" input only on charges that carry one; rows without late render unchanged.
- Readouts: the chat proposal card totals must include late (blocker LC-READ-2); payment record and review lines show "· Late charge ฿X" only when not zero.
- Push: "Late charge ฿50 · " is added only when the payment's late part is above 0 (accepted); amounts are never cut, names shorten first.
- Labels: Late charge ค่าปรับล่าช้า; Late charge remaining ค่าปรับคงเหลือ; Late charges received ค่าปรับที่ได้รับ; Late Charge Due ค่าปรับล่าช้าเรียกเก็บ; Late Charge Paid ค่าปรับชำระแล้ว.
- Refusal: "Late charge cannot be less than the ฿20 already paid on it." The server keeps P5B06; the PWA shows the "already paid" text from `lateChargePaid` (LC-ERR-2, see the deviations above).

Forge's promotion corrections to the plan (the plan's Promotion section stands otherwise):
- All five images change: read, command, chat, notify and jobs (notify and jobs share `services/workers/server.mjs`). Rollback pins: read, command and chat to R117; notify and jobs to the R113 image they run now.
- Reader grants (operator step): Charges `"Late Charge Due"` and `"Late Charge Remaining"`, Repayments `"Late Charge Paid"`, and the new late-remaining column of the upcoming charge events view in `scripts/configure-dev-read-role.py` and `scripts/production/reader-capability-contract.json`. Keep reader views on CREATE OR REPLACE (dropping loses grants). Order: V132, reader grant, read image.
- The chat read role has table-level SELECT and EXECUTE on 12 read functions including `reporting_borrower_period_v1`; if V132 drops and recreates one, the snapshot and restore must keep EXECUTE.
- V132 keeps `pwa_notify_content_v2` and the v3 to v10 command paths working, because old images call them between the SQL apply and the image rollout and after a rollback. Revoke the default-privilege EXECUTE of `mw_integration_agent` on every new postgres-created function (the notify v3 function) or the ACL self-check fails (V103 precedent).
- Owner windows: PROD `mw_app_prod_journal_owner` and `mw_notify_owner_prod`; DEV needs the five-owner window opened before the migrate (R117 hit 42501 without it).
- The agent host is the GCP VM `vm-mw-credit-agent`, not VM-01: `deploy-runtime.py` dry-run, freeze, install, activate. Catalogue edits are wording only (no revision bump, no service change).
- No infrastructure definition, IAM or secret change. `Environment_Inventory.md`: the "Debian agent host" deployed commit is corrected from `05562375` (R113) to `9703a191` (R117 follow-up, PR #221).

Deferred to R119 (owner, 3 November 2026; R119 opens in the R118 closure pull request): every rebate line when one payment closes several referred loans (`closeRebate`, `pwa_notify_content_v2`, both `LIMIT 1`), and the receipt agent's recheck of a group slip ignored because the sender was not yet an enabled borrower (with possibly holds whose cause was fixed later in the app). See the [release tracker](../project/Documents/Release_Tracker.md#current-development-release).

Records updated in this batch (Dewey): this note; the agent note `integration-agent/Change Logs/CHANGE_NOTES_R118_LATE_CHARGES_2026-11-03.md` (stub until Byte's batch 2); `project/Documents/Release_Tracker.md` and `project/Documents/Development_Changes.md` (R118 progress); `project/Documents/PWA_Data_Model_Overview.md`; `project/Documents/Solution_Design.md` (R118 paragraph); `project/Documents/Environment_Inventory.md` (agent-host commit only); Data Dictionary column entries in `relations/charges.yaml`, `repayments.yaml` and `payment-allocations.yaml`, marked R118, DEV-pending. The other dictionary entries (olap views, income views, upcoming and health views, routines, `pwa/application.yaml`, `agent-api.yaml`, `notifications-jobs.yaml`, `index.json`) are PROD captures and are refreshed from a targeted PROD capture after promotion (R116 and R117 precedent). Byte owns the `database/README.md` V132 entry and batch 2's `services/chat/assets/conversation-business-rules.md`; the agent part has its own note.

Team: Archie (design), Byte (build), Chase (verification), Dewey (records), Echo (UX), Forge (promotion).

## Checks
| Command | Result |
| --- | --- |
| `npm run lint` | Pass, on `ab3fed8`, clean tree (Byte) |
| `npm run typecheck` | Pass, on `ab3fed8`, clean tree (Byte) |
| `node --test tests/unit` | 1,122 tests, 0 failures, on `ab3fed8`, clean tree (Byte) |
| `mw-db-ci -Group phase5` | Pass, on `ab3fed8`, clean tree (Byte) |
| `pwsh scripts/database/Test-CI.ps1 -Group migrations` | Pending (Byte) |
| `pwsh scripts/database/Test-LateCharges.sql` through `Test-MigrationsCloud --sql-only` | Pending (Chase) |
| Extended database tests (Archie's list: `Test-MaterializedBalances`, `Test-CorePayment`, `Test-LumpSum`, `Test-SelectedCharges`, `Test-PayForward`, `Test-AtomicLoanClose`, `Test-WriteOffSegregation`, `Test-NotifyContent`, `Test-AccessMatrix`, `Test-TriggerOrder`, and the rest) | Pending (Byte, Chase) |
| Nothing dated moved: `generate_due_charges` twin, `loan_close_calculation_v83` twin (`mutation` JSON identical), pay-forward twin, `pwa_next_*`, income and Cash Dashboard snapshots before and after V132 | Pending (Chase) |
| Schema digest rebuilt at 132, `--check`; `node --test tests/unit/chat-schema-digest.test.mjs` | Pending (Byte) |
| `npm run check:docs` | Pending (Dewey) |
| Browser: `late-charge-independent.spec.ts`, receiving specs at 320, 390 and 1280 px, English and Thai | Pending (Chase, Echo) |
| Agent tests: `test_receipt_api_v9.py` (v10), `test_review_proposal_options.py`, `test_partner_review.py`, `test_review_cycle*.py` | Pending (Byte, Chase) |
| Pull request `Development checks` | Pending |
| DEV acceptance scenarios (plan list, Chase on DEV, then the owner on the phone) | Pending |

## Not run
To be filled when the checks run.

## Recovery
Git baseline: the R117 package and its merged records. Before promotion nothing is deployed, so the branch can be dropped. After promotion: R117 images for read, command and chat, the R113 images for notify and jobs, the previous Hosting build and the previous agent commit. The V132 columns stay (additive, default 0); a later forward migration restores the V131 function bodies if needed, because shared migrations are never edited or removed. Data caveat: R117 code cannot receive a charge whose late charge is above 0 (Receive All compares `"Amount Remaining"`), so zero every late charge before a service rollback or keep the SQL forward. A PROD apply needs a verified restorable backup at V131, recorded in the promotion record.

## Open questions
None.

## Remaining work
- Batch 1 (Byte) is committed locally on `ab3fed8`; Chase's verification is pending; Byte writes the `database/README.md` V132 entry.
- Batch 2 (Byte): PWA screens, chat, agent wording, Metabase Income page (`LateCharges.mjs`, `Refine-LateCharges.mjs`).
- Echo second pass; owner acceptance on DEV.
- Fill the Checks table and Not run section as evidence arrives.
- Promotion on the owner's instruction only; closure pull request opens R119 with the two deferred items; PROD Data Dictionary capture refresh.
