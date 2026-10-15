# Production collection settings — 8 September 2026

Status: production configuration saved at OLTP **3.000024**. Standalone checks and 37 local tests passed. User acceptance pending. The same hourly scheduler is ACTIVE again; next-run behavior awaits observation and user acceptance.

## Authorization and purpose

The user explicitly approved direct production implementation of communication names, Instagram mapping, a receiving-bank table/shared default/borrower override, AI collection and late-penalty flags, and a setup-review view. During implementation the user explicitly requested both supplied bank records, with Kasikorn as default. No Collection Mode or pause/reason fields.

These changes replace implicit name formatting, local-only bank selection and enrollment. The two native tables support stable receiving-account references and one selection shared across users/devices. Financial data grains and existing loan/payment relationships are unchanged.

## Rollback points

- Production OLTP app 93844270-6aa5-420b-a960-bcdf08abd357: **3.000014** before editing; Save disabled and no issues. Borrowers had33 app columns. Live Row ID is the key, Text with UNIQUEID("PackedUUID"); Borrower Name is not the key.
- Original Money database: 9Y5vh3TFzZ4sIe2JgNh4l0; Borrowers rnh3hHqmph4aA3LhyyStVb;29 borrower rows.
- Native copy **Money Collection Backup 20260908**, database OoVAMLPx4v4Iaggy0i4IO0, created with Copy table rows checked. All12 original tables verified. Borrowers and Loan Assessment were initially closed tabs, not missing tables; Load existing table exposed them. Borrowers29 rows verified before schema edits. Native copies regenerate Row IDs, so this is a recovery reference, not an interchangeable source pointer.
- Runner/config/runbooks and both model documents copied to ignored mw-ai-collection/local/before-app-collection-settings/. Existing operation/receipt/fee/exception ledgers retained.
- No OLAP or Looker edits. Reporting app opened successfully after the shared change. New-column loading in OLAP remains pending reconciliation; last documented OLAP1.100016 is not claimed as a fresh version audit.

## Implemented objects

Borrowers: Communication Name (Text), Instagram Username (Text), Instagram Conversation URL (native Text/app Url), Instagram Verified At (DateTime, blank initial), AI Collection Enabled (Yes/No, FALSE), Late Penalty Enabled (Yes/No, FALSE), Receiving Bank Account (optional Ref). Added Effective Receiving Bank Account (Ref VC) and Collection Setup Issues (Text VC). Final OLTP count42:14 physical+28 virtual.

Collection Bank Accounts native table dcriw5G_on4-YdjH84gd64: seven physical columns including Row ID/_RowNumber, plus three app reverse-reference VCs. Account Label is label; Account Label/Bank Name/Account Number/Account Holder Name are required; Active defaults TRUE. Numbers remain Text. Both user-authorized records are populated and active, with Kasikorn default. Sensitive values are not repeated in this log. Two unused blank starter rows removed; no financial rows deleted.

Collection Settings native table e--2iN1ryA4Kus4KkpQCK1: four physical columns, one shared row. Setting Name is label and not editable; Default Receiving Bank Account is a required independent Ref. Three blank starter rows removed. App permits updates only; bank accounts permit adds/updates without deletes. No part-of/cascade relationships.

Menu views: Collection Bank Accounts (table), Collection Settings (detail), Collection Setup Review (table). Both Borrowers and Visible Borrowers forms/details include the nine collection fields, preserving earlier layout. An incidental header-column addition during editing was removed before saving.

Slices: Visible Borrowers keeps NOT([Hidden Flag]),42 fields. Todays Collection Board retains filter/read-only mode; regeneration appended seven physical settings to the original12, giving19. Collection Setup Review has42 fields, updates only, and AND([AI Collection Enabled], ISNOTBLANK([Collection Setup Issues])). Exact membership is in the dictionary.

Lisa's existing test is configured with explicit Communication Name, the verified existing friend conversation, actual verification timestamp, both flags TRUE and no bank override. Other borrowers remain un-enrolled by default; no nicknames or mappings were guessed. An unsaved Bangkok override recalculated the effective bank correctly and was cancelled. Saved default remains Kasikorn.

During native grid entry, temporary database-title edits were corrected back to Money database. Final title and both saved bank records were checked.

## Runner integration

Build8 requires fresh production collectionSettings observations. Full-board counts retain disabled borrowers as SKIPPED_DISABLED and incomplete enabled borrowers as SETUP_REVIEW. Start-send rechecks settings; changed names/accounts/policy require re-preparation. Destination scope is unchanged: daily messages forward to the friend, later reminders and financial processing remain Lisa-only.

Messages use Communication Name; exempt templates omit penalty warnings. SQLite records daily eligibility; an observed exemption cannot re-enable mid-day and a missed opening starts at the next recorded opening. Disabling stops new additions without reversing past fees. Stable charge assignment/cumulative formula remain. Already-submitted operations still reconcile despite AI disablement.

Sent facts retain receiving-account snapshots. Receipts may match the current bank or a bank from an earlier confirmed sent message for that borrower. The matched snapshot persists through default changes; legacy receipt checks remain. Capture/assessment/reservation/acknowledgment/review-message preparation check settings. Old manual Build1 tools are not scheduled entry points.

Runner files changed: config.json; src/collection_settings.mjs (new); message_template.mjs; batch_engine.mjs; batch_runner.mjs; master_engine.mjs; master_runner.mjs; receipt_engine.mjs; receipt_runner.mjs; cycle_brief.mjs; HOURLY_ENTRY.md; COLLECTION_SETTINGS.md (new); test/collection_settings.test.mjs (new). App balances were not replaced with cached values.

## Documentation and verification

- Documents/AppSheet_Data_Model_Overview.md and Documents/AppSheet_Data_Dictionary.xlsx updated together:23 new field definitions, two tables, three relationships, slice memberships and app-availability notes. OLAP new-column loading explicitly pending reconciliation.
- Workbook edited with bundled artifact-tool; affected inventory tables extended, unrelated sheets/cell values preserved, row styles matched, before/after samples rendered. No Excel error cells. No source files changed.
- OLTP3.000024 confirmed in Manage > Versions. Workflow checks used the standalone production app, never the builder preview.
- Checked both banks/default, borrower forms/details, Lisa saved mapping/flags, clear setup-review result, unsaved override calculation/cancellation, and reporting app open/sync.
-37 local tests passed: legacy duplicate/unknown guards, disabled roster counts, settings freshness, explicit names, exempt three-paragraph template, daily penalty policy, changed settings before sending, historical receiving bank, and reconciliation despite disablement.
- No live collection message or financial test posting sent by this migration. User acceptance and the next scheduled run are separate checks.

## Manual acceptance

1. Confirm both bank records/Active flags and the selected shared default.
2. Set a borrower's intended Communication Name and verified mapping before enabling AI collection; check the independent late-penalty flag.
3. Check missing/duplicate mappings and inactive-bank cases in Collection Setup Review. Exempt borrowers get no new fees or penalty warnings; existing fees remain.
4. Verify the next hourly cycle respects enrollment and selected bank, without duplicate openings/payments. Preserve Lisa-only financial scope.

## Rollback instructions

Pause the same hourly cycle. Restore OLTP3.000014 and backed-up runner/config/runbooks if needed. Retain all ledgers and reconcile pending operations before resuming. Old runner behavior can broaden enrollment again; review its scope first. Leave new native fields/tables unused rather than deleting referenced data. Use the native backup only with an ID-aware recovery plan. Restore both model documents from the local backup and record the outcome here. No Looker rollback needed.


## Final scheduler handoff

The existing automation lisa-build-2-reminder-test, AI Collection Master Cycle, was updated through automation_update and confirmed ACTIVE. Its existing target task and hourly minute00/second00 cadence are preserved. The prompt now requires Build8 settings and retains the daily11:00 friend-forwarding batch, Lisa-only later/financial scope, duplicate guards and quiet notification policy. No new automation was created and no model/effort override was introduced.

The compact read-only cycle preflight passed with no pending operations, receipts, cases or fee catch-up. No manual collection run was triggered by this migration; the next hourly execution remains to be observed.

README.md, MASTER_CYCLE.md, BUILD_7_RUNBOOK.md, RECEIPT_POLICY.md, BUILD_4_RUNBOOK.md, BUILD_6_RUNBOOK.md and MESSAGE_FORMAT.md also received a short Build8 precedence note so older bank/enrollment instructions cannot override the new settings.

Scheduling reference checked: [official OpenAI scheduled-task documentation](https://learn.chatgpt.com/docs/automations?surface=app). Implementation used the app's existing automation tool and saved local configuration.

## Existing policy continuity

Preserved Lisa's existing late-penalty arrangement for 2026-09-08 with an idempotent, audited SQLite migration, supported by confirmed legacy fee operations and the verified production flag. Read-only verification confirmed that date's eligibility and migration audit entry. No AppSheet financial records were changed. A consistent pre-migration SQLite backup was created at `mw-ai-collection/local/before-app-collection-settings/collection-before-policy.db` (ignored, local only). Do not restore this database over subsequent operations; reconcile later ledger changes first. This exception preserves an existing arrangement and does not change the next-day rule for newly enabled exempt borrowers.
