# R013 — Receipt transfer time in existing transaction fields

Owner clarification, 21 September 2026: use existing fields for the time money was transferred, including OLTP Cash Statement and the 00:15 agent image. No separate receipt audit columns. Automatic payment creation remains deferred.

Starting AppSheet Git commit: `1cf3c0409258e9430e77b3e65133f22e7ad63ad3`, clean. R013 reserves V30, depending on released R011/V29. No production deployment is authorized in this batch.

## Implementation

The agent extracts the receipt date/time in Bangkok time and prepares existing `Payments.Payment Date` and `Payments.Created At` values. Summary-only mode does not insert them. V30 changes only `guard_cash_ledger`: on new system Payment receipts, existing `Cash Ledger.Created At` inherits Payments.Created At, falling back to the current server timestamp when absent. Other sources retain their behavior. Existing rows are not backfilled and existing update guards remain.

Both statement consumers already use this field: V27 `cash_statement_account_effects.Sort Timestamp` / `Statement Time`, the OLTP Cash Account Statement Recent view, and the agent's midnight-to-midnight image query. No new app columns or regeneration; no financial amount/allocation change. A receipt recorded after a past daily image was sent does not automatically resend that frozen historical image.

## Verification / rollback

Migration chain, DEV SQL checks, current GUI and model documentation completed. Synthetic tests use real source posting triggers in a transaction that rolls back, covering exact seconds, date/day cutoff, retry and old clients without a timestamp. Before DEV migration, preserve the database rollback snapshot. Restore the former guard through a forward migration if necessary; retain financial records. PROD stays V29 until separately authorized promotion.

## Completed DEV verification

- V1–V30 clean migration-chain test passed, repeat applied zero, altered-checksum rejection passed. Six synthetic assertions passed locally and on DEV with ROLLBACK: exact payment-to-ledger time, provider time/date, daily cutoff, retry uniqueness, missing-time fallback and unchanged non-payment behavior.
- Verified DEV tuple: appsheet-pg-prod-20260914 / 34.21.174.215 / loan_manager_dev. Custom pre-V30 dump retained privately at `C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/r013-20260921/dev-before-v30.dump`; SHA256 `18C0FB1B2BE232D96681ADFF5B498C984312B7B28CD70657A48E524832EB6BE3`. pg_restore listing passed; no restore rehearsal claimed.
- DEV migrated 29 -> 30 at 12:51 Bangkok; Flyway validate passed, 31 entries including baseline, no warnings. PROD remains V29.
- OLTP rollback 1.000062 recorded before editing. Temporary Ignore seconds=FALSE in 1.000063 was reverted on explicit owner correction. Final 1.000064 has Ignore seconds=TRUE, matching production. Existing statement/detail loads and shows hours/minutes. No remaining AppSheet product delta; OLAP unchanged 1.000021. Both saved editors have green no-issues checks and Deployed status. No regeneration or production app edit.
- Data dictionary Dev Differences rows 2877–2879 updated, with export/reimport value/formula preservation and visual review. Model overview, environment inventory and open-difference records updated. No export/Looker shape or amount change; no report changes required.

DEV complete, ready for owner production promotion decision. SQL-only promotion can use the tested V30 package; both AppSheet definitions remain functionally unchanged. Automatic payment creation is still deferred, and this change does not correct old manually entered payment times. Agent receipt summaries and its 00:15 image retain minutes-only display.
`nDEV package pinned by the maintained New-Release runner to aad17b642f38583f4dbaed8d9bfcfca2e482779d; all 30 migration hashes are in outputs/r013-20260921/flyway-manifest.json. Agent implementation 0e953464728b53db5e72b4f191578856a8381ada deployed and passed 49 Linux tests plus actual synthetic extraction and English/Thai minutes-only PNG visual checks. Production SQL remains pending.
