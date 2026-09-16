# Development environment preparation

Standing owner rule, 15 September 2026. Apply this checklist to every development app, not only the current Loan Manager — DEV and Loan Business Insights — DEV. Repeat it after copying, refreshing, replacing or restoring an app, and when adding/changing bots.

## Required automation policy

**R002 owner instruction, 16 September 2026 (current policy):** Reviewed Dev notifications may deliver exclusively to `welct0407@mw-credit.com`, including owner-only test notifications. Verify all recipient paths and use `LIST("welct0407@mw-credit.com")` as the sole To expression for reviewed push tasks. No other recipients, unrelated exports or collection-service activity are authorized. Unknown/unverified routes remain disabled. Apply this exception to steps 4–7 below: owner-only notification tasks may remain enabled once reviewed, and an authorized synthetic test may send to the owner. Recheck isolation after every copy/refresh/restore and bot change. This supersedes earlier blanket disable/stub-only wording for reviewed owner-only routes; historical checkpoints below describe past states, not current verification. R002 preserves the saved disabled notification states; no bot enablement or delivery test was performed; see [R002 change log](../Change%20Logs/CHANGE_NOTES_R002_2026-09-16.md).

**Current expense-task checkpoint, 16 September 2026:** DEV OLTP 1.000081 / OLAP 1.000084. The task supplied the standing rule requiring nonessential notification bots to remain disabled. All four DEV notification bots are therefore disabled; their existing owner-only recipients/templates are unchanged. The older exception below is preserved as history, not the enabled state of this checkpoint. Generate Daily Charges (00:05 Bangkok, SQL request only) and Refresh Daily Analytics Daily (hourly Recent SQL request only) remain enabled after destination review. Superseded financial bots and Daily Loan Analysis Export remain disabled. Sources/cross-app links remain DEV. See the business-expenses report for the complete inventory and tests.

**Later owner instruction, 15 September 2026:** preserve the existing push-notification workflow in both environments; production retains its current recipients and Dev sends exclusively to `welct0407@mw-credit.com`. This explicitly authorizes the three reviewed Dev OLTP bots Notification - New Loan Created, Notification - Loan Closed and Notification - Charge Received, including real Dev test pushes to that account. Their sole To expression is `LIST("welct0407@mw-credit.com")`; events, templates and processing logic follow production. This exception supersedes the blanket notification-disable/stub guidance below for these three bots. It does not enable unrelated reminders, scheduled exports or unreviewed destinations. Recheck the recipient restriction after every copy/refresh/restore. See [lump-sum release](../outputs/lumpsum-promotion-20260915/REPORT.md).

Keep nonessential bots disabled. Notifications, reminders and outward-facing exports that could confuse users must remain disabled in development. Production parity is not a reason to enable them. An enabled business-processing bot must be necessary for the workflow under test and confined to development data and effects.

Classify bots by behavior, not their name. Inspect their event, process, every task, called actions/processes, schedules and destinations. A calculation bot that also sends a message is not acceptable as-is. Keep it disabled until the business logic can be tested through a development-only path without the outward-facing task. Notification testing should use an isolated capture/stub rather than send messages to real users.

Unknown or newly copied bots default to disabled until reviewed. A prototype label, disabled app sharing, or a development database alone does not establish notification isolation. Do not run a bot's Test/Run action to verify that it is disabled.

## Preparation checklist

1. **Record the starting point.** Identify app UUIDs, versions and intended development database. Record rollback versions before editor changes. Use the current Environment Inventory; old deleted backup apps are not rollback targets.
2. **Prevent premature execution.** During copy/refresh, use available controls to keep automations disabled. Do not enter test data, run processes, or release the refreshed app to users before this checklist is complete. Review scheduled bots immediately; do not assume copying an app disables every bot.
3. **Isolate sources and navigation.** Verify all business tables point to the development database and cross-app shortcuts open the development companion. Review task destinations for production data, users, mailboxes, chat spaces, webhooks or export locations.
4. **Inventory and classify every bot.** Record its name, event/schedule, business purpose, side effects, required state and actual state. Explicitly review new bots absent from the baseline below. Keep nonessential, confusing or unreviewed bots disabled.
5. **Apply and save states.** Retain only the essential business-processing bots needed for the test. Disable notification/reminder/export bots and unnecessary scheduled jobs. An essential process must not carry embedded outward-facing tasks. Preserve database integrity/calculation triggers; this checklist concerns AppSheet bots.
6. **Verify the saved configuration.** Reopen the current editor's Automation list and verify every bot's enabled/disabled state after saving. Confirm the app version, development bindings and relevant task destinations. Record evidence without credentials or borrower data. An unverified state is not a pass.
7. **Test essential behavior safely.** In the new app interface, verify the affected business process against development data. Check for unexpected outward-facing tasks through configuration and available logs; do not send a notification to prove isolation. Record any unavailable check.
8. **Close preparation.** Update the change log and Environment Inventory/Development Changes when settings change. Record the enabled-bot list, reasons, disabled-bot list, saved versions, checks and remaining issues. The environment is not ready for test writes while the isolation gate is unresolved.

## Current baseline

Phase 6 update, 15 September 2026: OLTP **1.000042**, OLAP **1.000040**, database V10. Current editor inventory before DF10GUI writes confirmed all seven OLTP bots and all three OLAP bots: four owner-only notification routes enabled; Create First-Day Charge, Payments - Process Receipt, Generate Daily Charges and all OLAP schedule/export bots disabled. The existing closure task now distinguishes default loss/no cash from ordinary closure, using the same approved recipient. Current task destinations were rechecked; no new bots or destinations. Appdoc comparison shows only eight intended OLTP action changes, version metadata and the OLAP loss-currency correction; bot templates are separately checked in the editor. The existing hidden-column/unsearchable OLAP warning is unrelated and unchanged. Nightly development generation remains owner-approved at 00:05 Bangkok. See the phase 6 report for synthetic tests and pending owner acceptance.

This is the last verified baseline from the 15 September editor review, not an automatic guarantee for future copies. Repeat the checklist every time.

Core payment V6 update: OLTP 1.000032 and OLAP 1.000033. The owner-authorized push workflow above now uses four reviewed notification-only bots, including the repurposed first-day-charge route; every task uses `LIST("welct0407@mw-credit.com")`. Owner confirmed tested receipt, closure-summary and first-day amounts. This replaces production-parity event/processing assumptions and the older three-bot count above. Financial processing is SQL-owned; do not re-enable its superseded AppSheet bots. This exception does not authorize other destinations or unrelated notifications.

Atomic Close Loan V7 update: both apps **1.000036**. Fresh before/after definitions confirm the same four notification-only bots and owner-only destinations, with financial/scheduled/export disabled states retained. No new bots or destinations. Current-GUI tests use only the AC7GUI synthetic family; owner confirmed receipt and closure amounts 130/150/100/70 and partial receipt 50. Test borrowers are hidden and loan auto-charge flags disabled. See the atomic-close report and change log for schema, app reconciliation and recovery evidence.

| App | Bot | Development state | Reason |
| --- | --- | --- | --- |
| OLTP | Create First-Day Charge | Disabled | Superseded by SQL |
| OLTP | Notification - First-Day Charge | Enabled, owner only | Repurposed Auto Receive First-Day Charge; notification only |
| OLTP | Payments - Process Receipt | Disabled | Superseded by unified SQL payment engine |
| OLTP | Generate Daily Charges | Disabled | Superseded in development by the reviewed pg_cron daily job |
| OLTP | Notification - New Loan Created | Enabled, owner only | Reviewed new-loan and SQL first-day receipt alerts |
| OLTP | Notification - Loan Closed | Enabled, owner only | Reviewed immediate first-day/non-payment closure alerts |
| OLTP | Notification - Charge Received | Enabled, owner only | Reviewed receipt and one summary of matching closed loans |
| OLAP | Refresh Daily Analytics Daily | Disabled | Unnecessary scheduled snapshot processing |
| OLAP | Refresh Daily Analytics Daily 2 | Disabled | Unnecessary scheduled snapshot processing |
| OLAP | Daily Loan Analysis Export | Disabled | Unnecessary outward-facing export |

A future test may require different internal processing, such as controlled charge generation. Review its necessity and development-only effects before enabling it, and record the decision. Notifications and other confusing outward-facing bots remain disabled. No bot is granted permanent permission solely by appearing in an old baseline.

## Database charge-generation schedule

Phases 4–5 checkpoint: Flyway V9, both apps 1.000039. Owner explicitly approved nightly development generation. The database job `loan-daily-charges` runs at 00:05 Asia/Bangkok after a successful synthetic scheduled test. It writes development charges only through the common V8 generator; no new outward-facing task was added. Four owner-only AppSheet notification bots and all other disabled states remain unchanged.

After a database/app refresh, inventory database jobs separately as well as AppSheet bots. Do not inherit an active scheduler without reviewing its target, necessity, timing and effects. Keep the old AppSheet Generate Daily Charges bot disabled to prevent a second generator. Do not disable payment/integrity triggers. Use `scripts/database/Get-ChargeGenerationState.ps1` and the reviewed development schedule runner to inspect/pause the current job. A future copy/instance requires a fresh identity review before adapting a pinned runner. See the [phase 4–5 report](../outputs/charge-generation-20260915/REPORT.md).

## Evidence and maintenance

Use [Environment Inventory](Environment_Inventory.md) for current identities and [Development Changes](Development_Changes.md) for unpromoted behavior. The [standing rule in AGENTS.md](../AGENTS.md) makes this checklist mandatory for future agent work. SQL migrations follow [database/README.md](../database/README.md); AppSheet bot configuration must be applied and verified separately after a database/app refresh.

This is a required preparation process, not an automatic AppSheet enforcement service. There is no background monitor or automatic bot-disabling integration installed by this policy change.
