# Development environment preparation

Standing owner rule, 15 September 2026. Apply this checklist to every development app, not only the current Loan Manager — DEV and Loan Business Insights — DEV. Repeat it after copying, refreshing, replacing or restoring an app, and when adding/changing bots.

## Required automation policy

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

This is the last verified baseline from the 15 September editor review, not an automatic guarantee for future copies. Repeat the checklist every time.

| App | Bot | Development state | Reason |
| --- | --- | --- | --- |
| OLTP | Create First-Day Charge | Enabled | Required loan-creation processing |
| OLTP | Auto Receive First-Day Charge | Enabled | Required first-day receipt processing |
| OLTP | Payments - Process Receipt | Enabled | Required receipt/allocation processing |
| OLTP | Generate Daily Charges | Disabled | Scheduled generation is not needed for the current controlled tests |
| OLTP | Notification - New Loan Created | Disabled | User-facing notification |
| OLTP | Notification - Loan Closed | Disabled | User-facing notification |
| OLTP | Notification - Charge Received | Disabled | User-facing notification |
| OLAP | Refresh Daily Analytics Daily | Disabled | Unnecessary scheduled snapshot processing |
| OLAP | Refresh Daily Analytics Daily 2 | Disabled | Unnecessary scheduled snapshot processing |
| OLAP | Daily Loan Analysis Export | Disabled | Unnecessary outward-facing export |

A future test may require different internal processing, such as controlled charge generation. Review its necessity and development-only effects before enabling it, and record the decision. Notifications and other confusing outward-facing bots remain disabled. No bot is granted permanent permission solely by appearing in an old baseline.

## Evidence and maintenance

Use [Environment Inventory](Environment_Inventory.md) for current identities and [Development Changes](Development_Changes.md) for unpromoted behavior. The [standing rule in AGENTS.md](../AGENTS.md) makes this checklist mandatory for future agent work. SQL migrations follow [database/README.md](../database/README.md); AppSheet bot configuration must be applied and verified separately after a database/app refresh.

This is a required preparation process, not an automatic AppSheet enforcement service. There is no background monitor or automatic bot-disabling integration installed by this policy change.
