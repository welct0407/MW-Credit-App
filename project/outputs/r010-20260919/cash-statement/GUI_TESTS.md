# R010 Cash Statement DEV verification

20 September 2026. Current AppSheet editor and app UI; DEV only.

| Check | Result |
| --- | --- |
| Baseline / preservation | Owner confirmed current OLTP 1.000038 contains intentional manual saves. Built on that definition; rollback point retained. |
| Saved OLTP | Manage > Versions: **1.000052**; saved editor **No issues found**; Deployed. |
| Companion OLAP | **1.000017**, **No issues found**, Deployed. No OLAP edits by this feature. This is newer than previously recorded 1.000015; reconcile the preserved manual scope before RC capture. |
| Context access | Saved security filter matches normalized USEREMAIL to Partners.Login Email; Ref Partner is immutable hidden Ref key; only Updates enabled. No copied login email. |
| Account selection | Mobile preview changed between three existing DEV accounts; persisted selection loaded in standalone desktop app. Summary refreshed after each selection. |
| Date selection | Desktop selection of 18 September refreshed summary and six statement rows. 5 September (outside window) reverted to the previous valid selection; 6 September (earliest permitted day) persisted and displayed a zero-movement summary. Saved Valid_If independently read back. |
| Populated day | Existing synthetic-account example: six inflows summed to 165, matching the daily In total; Out 0. Chronological time order; five headers Time, Transaction, From / To, Amount, Balance. |
| Formatting regression | First GUI pass exposed +฿฿50. Corrected Amount Display to prefix sign to TEXT(ABS(Price)), then synced and verified +฿50 and compact time without seconds. |
| Uninitialized / empty day | Account balances remain blank; summary displays Balance not initialized. No invented zero opening/closing. Zero-movement day displays In/Out 0 and no transaction rows. |
| Native source navigation | Statement line opens read-only detail with source Refs; View Ref (Ref Payment) opens the existing synthetic receipt and its allocations. No statement Add/Edit/Delete action. |
| Language | Feature labels, transaction categories, counterparty fallback and status use saved Partner language expressions; English path rendered in current owner session. Thai formulas/configuration captured; an actual Thai second-user session remains an acceptance limitation. Existing app-wide navigation/system strings retain their prior language configuration. |
| Sync / device | Current mobile editor preview and standalone desktop app loaded/synced. Account/date preferences are the only GUI data updates. Physical-phone testing and simultaneous second-user sessions were not performed. |
| Financial safety | No payment, loan, expense, settlement, opening balance or cash-ledger write performed for these GUI tests. Disposable SQL fixtures were rolled back. No notification test was forced. |

All five DEV cash accounts currently have no initialized opening. Initialized numerical balances, captured-baseline arithmetic, corrections, zero days and transfer sides were verified in the disposable SQL suite, not falsely claimed as live initialized-account GUI coverage. See [SQL evidence](SQL_TESTS.md).

The existing R010 payment-guard evidence remains valid for unchanged guard definitions. Manual owner scope and version pins must be reconciled at candidate capture. Optional Today/Previous/Next shortcuts and a dedicated full-history action were not added; the date control and existing Reporting App navigation provide those paths. No new full-history OLTP source or OLAP definition was introduced.

Exact configuration: [appsheet-config.json](appsheet-config.json). Dictionary: Dev Differences A2812:E2856; round-trip preservation passed. Production/RC authorization and owner acceptance remain pending.
