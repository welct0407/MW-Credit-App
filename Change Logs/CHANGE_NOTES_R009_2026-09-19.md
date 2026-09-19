# R009 — Payment notification fixes

Owner request: fix both diagnosed notification issues in DEV as R009. Production promotion is not authorized. Starting Git commit `acbdc4fd492b2087ded27223a2841a36b61e5e5c`; working tree clean.

Scope: R008 Receive All Confirmed, R008 Single Full Confirmed and R008 Loan Close Confirmed. Correct creator exclusion by explicitly referencing the originating command row inside Partner recipient selection. Move Send closure summary into the Yes branch of Notify payment-closed loans so zero closures send no closure message. DEV notification recipient settings remain directly owner-only; record corrected production expressions for RC substitution and verify their logic separately.

Target DEV OLTP: `500b27b6-884a-41e8-a9ec-df801b0110ad`, internal name `MW-OLTP-DEV-20260919-578763613`. Companion DEV OLAP: `9f3422be-bc87-4a5a-a42a-67528ee80393`. SQL V24 unchanged.

Status: **Ready for review — DEV closure fix verified; corrected production recipient expressions prepared under required DEV override.** Ready subject to owner acceptance and future RC preparation/authorization. No PROD edit, financial write or notification is authorized by this release. Reviewed synthetic DEV workflow tests and owner-only DEV notification delivery use standing project authorization.

## Implementation and runbook

Re-read the latest 19 September [Release Workflow Gate A](../Documents/Release_Workflow.md#61-develop-and-integrate--gate-a), AGENTS and [DEV recipient procedure](../Documents/Development_Environment_Preparation.md#dev-recipient-override-procedure) following the owner's reminder. Preserve Deployed mode, owner-only direct notification settings, existing schedules/guards and environment isolation. The R009 request authorizes correction of the diagnosed creator-exclusion bug; it does not authorize the broader deferred Partner-ID redesign or removal of DEV isolation.

DEV OLTP **1.000010 → 1.000011**. In all three quick-payment processes, recreated the existing custom push closure task in the Yes branch of Notify payment-closed loans and removed its unconditional predecessor. Original title/body/deep link retained. Receive All child is named `R009 closure summary`; Charges/Loans children are `Send closure summary when loans closed`. The exact receipt count must exceed zero. Payment notification steps and event conditions remain unchanged.

The erroneous production recipient lookup used the Partner row's unqualified Row ID. The [R009 mapping](../outputs/r009-20260919/recipient-mapping.json) contains corrected originating-row expressions for both tasks in each process. DEV still directly targets only the owner, as required by the latest runbook. Corrected production recipient selection is therefore prepared/validated separately, not activated against other Partners in DEV. Future RC must apply this mapping instead of restoring R008's defective expression.

## Verification and affected assets

[Five current-GUI cases and Automation Monitor results](../outputs/r009-20260919/TESTS.md): both zero-closure cases skipped closure tasks; three positive cases executed them; all five runs Complete and receipts Posted. [SQL readback](../outputs/r009-20260919/sql-readback.jsonl) resolves all five creator identities and confirms expected closure counts. All three production expressions accepted by current Expression Assistant; no multi-user delivery claim. Physical-device delivery is not independently verified.

Both editors **No issues found** at saved OLTP **1.000011** / unchanged OLAP **1.000013**. No schema/model/table/column/Ref/slice/view changes, so overview/dictionary workbook changes are not applicable. No Looker/export/report impact. Model reference remains PROD; notification differences belong in this log and mapping. SQL fixtures are confined to `R009GUI-*` and existing synthetic cash accounts on verified DEV; no migration or production data copy.

Repository assets: this log, tracker, environment inventory, development differences, R008 regression notice, [manifest](../outputs/r009-20260919/release-manifest.json), mapping/tests/SQL evidence and [DEV lab runner](../scripts/database/Invoke-R009Lab.ps1). The completed concurrent DEV-refresh cleanup commit `b3fefee` is preserved.

## Rollback and continuation

Recorded current restorable DEV OLTP **1.000010** before changes. Restore that definition only if appropriate; it reintroduces the two known notification defects and does not undo synthetic receipts. DEV OLAP is unchanged. Starting code commit and reservation `db59eb7` establish local rollback; use a scoped revert preserving later work.

Before synthetic writes, created private DEV dump `C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/r009-20260919/dev-before-fixtures.dump`, SHA-256 `32C00553BA4FA41D1E0109DA5B029C7538D281878B21051E4262D274568838C0`; archive listing passed, restoration not executed. Do not restore the shared database merely to remove test fixtures or overwrite later work. Synthetic history retained with no continuing auto-charge on open fixtures.

Next: owner review, then separately authorized integrated RC preparation/App Upgrade under the current runbook. No RC or PROD mutations occurred. Production still has the diagnosed defects until an authorized promotion. No final R009 production tag is created during DEV completion.
