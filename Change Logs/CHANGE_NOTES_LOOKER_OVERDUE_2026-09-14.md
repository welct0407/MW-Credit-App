# Looker overdue scorecard correction — 2026-09-14

## Scope and rollback
- User authorized the proposed page 5 overdue correction.
- Report: Loan Reports - Mobile - Workspace Migration 2026-09-04, ID `52954065-a261-4b97-8d19-df84126bbdc6`; page Risks `p_4qw5e58q6d`.
- Verified pre-edit report copy: **Loan Reports - Mobile - Backup 2026-09-14 pre-overdue-fix**, ID `c4bf19ac-34f8-49c0-a411-d0c73d5befec`, created 2026-09-14 Asia/Bangkok. Existing reusable source mappings retained. This is a report-configuration rollback copy, not a financial-data snapshot.
- No AppSheet, data source schema, credentials or financial records changed; no data-model documentation changes required.

## Diagnosis and intended change
- Original Overdue Exposure: Charges - WS / Amount Remaining; Auto all available dates; Charge Date date dimension.
- Original Payment Pending filter includes only Payment Status = รอชำระ, omitting partially paid balances.
- Original Charges Before Today filter **excludes** Charge Date before 24 hours ago, admitting recent/future charges instead of selecting past-due charges.
- Replace the scorecard's filters with isolated conditions: Charge Date before today; Amount Remaining > 0. Preserve existing shared filter definitions for other consumers.
- Use a concise title that makes the corrected meaning clear in the narrow mobile scorecard.
- Prior read-only audit: erroneous card 85,940; page 7 overdue 11,620; OLTP pending through today 24,680; overdue borrower-group dues through today 20,320. These are timestamp-dependent comparison values, not corrected results.

## Implemented configuration
- Detached the two original filters from this scorecard only; their shared definitions remain available.
- Attached new filter **Risks - Past Due Positive Balance**, using Charges - WS, with all three clauses joined by AND:
  1. Include Charge Date / Is Before / 1 / Seconds ago.
  2. Include Amount Remaining / Greater than (>) / 0.
  3. Exclude Charge Date / Is This / Day.
- The editor rejected the zero-day offset and Now configuration. For the existing date-only Charge Date, the past-time boundary plus explicit current-day exclusion implements before today, while excluding future dates. Do not reuse this construction for timestamp fields without reviewing its boundary behavior.
- SUM Amount Remaining, Charge Date date dimension and Auto all available dates retained. Positive remaining amounts include partial balances without relying on unpaid-only status.
- Chart title first changed to **Overdue Amount — Before Today**, then shortened to **Past-Due Amount** because the longer title was clipped in report view.

## Status and verification
- Implemented and verified in report view mode on 2026-09-14. User acceptance pending.
- Immediately before correction the refreshed erroneous card was 79,840; after correction it was **17,370**.
- Navigated to page 7 Borrower Insight and confirmed its refreshed Overdue Amount was also **17,370**, with matching outstanding principal 112,504 and lifetime interest 175,384 across pages. This verifies aggregate reconciliation at the observed refresh state, not row-level acceptance or synchronized source timestamps.
- The corrected value was verified after leaving edit mode. The final **Past-Due Amount** label was confirmed in both the title property and editor canvas; the browser connection dropped during its final report-view refresh. Other charts and apps were not modified. Earlier audit values changed with live data and must not be treated as the current expected totals.
- Daily rollover, timezone alignment and individual partial-payment edge cases remain for manual acceptance; no financial test records were created.

## Rollback instructions
Restore the affected scorecard from the backup report, or reattach its original Payment Pending and Charges Before Today filters and restore the **Overdue Exposure** title. Do not change source credentials or financial data. Preserve the backup and this log.

## Manual acceptance required
Check overdue unpaid and partially paid charges, fully paid exclusion, today/future exclusion, daily rollover and reconciliation using the same source refresh cutoff. OLTP pending/group totals include today's dues and should not be treated as identical to strictly overdue amount.
