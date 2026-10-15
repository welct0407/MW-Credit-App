# R009 DEV verification — 19 September 2026

Target: canonical DEV OLTP `500b27b6-884a-41e8-a9ec-df801b0110ad`, internal `MW-OLTP-DEV-20260919-578763613`, saved **1.000011**. SQL host `34.158.38.171`, Flyway **24**. Companion DEV OLAP `9f3422be-bc87-4a5a-a42a-67528ee80393`, **1.000013**, unchanged. Current [SDLC Gate A](../../Documents/Rules/Release_Workflow.md#61-develop-and-integrate--gate-a) and direct owner-only DEV routing applied.

## Current-GUI workflow results

All five cases used synthetic R009GUI records through the current DEV app, selected **DEV Dad Account 2**, saved once and synchronized. No production writes. Automation Monitor reported every run **Complete**. Its executed-step lists contained the payment task and closure condition in all cases; closure tasks appeared only for positive closures.

| Fixture | GUI path | Posted | SQL closures | Executed closure summary | Monitor run ID |
| --- | --- | ---: | ---: | --- | --- |
| R009GUI-A | Receive All | 10 | 0 | No | 9cc009bf-0474-4db7-a240-867f5dec4d52 |
| R009GUI-B | Receive All | 110 | 1 | R009 closure summary | eeabfbbb-9da1-4d50-89d5-0fdbfcb3eec8 |
| R009GUI-C | Single Full, from collection charge | 10 | 0 | No | 83e41e85-56ee-485a-91e4-58e9761796a2 |
| R009GUI-D | Single Full, from collection charge | 110 | 1 | Send closure summary when loans closed | b315f1e9-c8c9-4c17-92f4-f8672d47470f |
| R009GUI-E | Loan Close confirmation form | 110 | 1 | Send closure summary when loans closed | 32a1e95b-4dda-4373-8743-c2e28050fb72 |

Synthetic E required Interest Payment Interval 1 and Auto Charge Enabled Y to expose the existing Close Loan action. These were set through the current loan-edit GUI; the first combined save retained N, so the selected Y was verified before the second save. Final payment closed the loan. Other fixtures retain auto-charge disabled. Synthetic payment history is retained; no fixture deletion or financial reversal was performed.

## Recipient correction and isolation

The three corrected expressions in [recipient-mapping.json](recipient-mapping.json) explicitly qualify the command row's Row ID and Payment Request Token with `[_THISROW]` inside `SELECT(Partners[Email], ...)`. Each expression applies to both payment and closure tasks: six future RC substitutions.

The current Expression Assistant accepted each expression in its Borrowers, Charges and Loans task context without a validation error. Dialog changes were cancelled so saved DEV destinations remain `LIST("welct0407@mw-credit.com")`. The Charges assistant's Test control unexpectedly opened legacy Table Data; it was closed immediately and is **not used as verification evidence**. No legacy bot Test was used.

The [SQL cross-check](sql-readback.jsonl) independently resolves all five exact command receipt keys and confirms the owner as Created By, with zero/one closure counts matching the GUI cases. Applying the exclusion to those resolved creators excludes the creator and retains another eligible Partner. This is a SQL semantic cross-check, **not an AppSheet production-recipient execution test**. DEV notifications intentionally still include the owner under the environment override. No other Partner received a test notification.

## Saved-state checks and limits

- OLTP 1.000011 and unchanged OLAP 1.000013 both show **No issues found**, Save disabled. Versions read through current Manage → Versions → Version History.
- New closure tasks preserve original title/body/deep-link expressions, custom push channel and owner-only list. Original unconditional closure steps removed; positive branches retained their existing exact-receipt count expressions.
- Canonical app identities and database-3 isolation reused from the completed 19 September DEV refresh. Both apps remain Deployed; no repeat Deployment Check, mode toggle, source/link/schedule/guard changes, or production edit.
- SQL V24 is unchanged; all five receipts Posted. The notification-only change leaves allocation/financial logic untouched; no unrelated migration suite or report audit was warranted.
- Runtime evidence proves process completion and branch selection. It does not independently prove physical-device delivery, rendered notification text, or actual multi-user production recipient delivery. Those are not claimed.
- No RC created, production authorization, promotion or release tag. Before future promotion, restore the **R009 corrected** expressions from this mapping, not the defective R008 baseline, and verify saved RC substitutions through the current runbook.
