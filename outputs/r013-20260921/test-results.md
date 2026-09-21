# R013 DEV verification — 21 September 2026

Scope: existing receipt transfer timestamp, no new columns. See [complete change record](../../Change%20Logs/CHANGE_NOTES_R013_2026-09-21.md).

| Check | Result |
| --- | --- |
| Full V1–V30 migration chain; repeat; tamper detection | Passed |
| Exact transfer time from Payments to ledger and statement provider | Passed locally and DEV |
| Receipt calendar day cutoff, retry uniqueness, old-client fallback, other sources | Passed locally and DEV |
| Test financial fixtures | Transaction rolled back; no retained rows |
| DEV target / migration | appsheet-pg-prod-20260914 / 34.21.174.215 / loan_manager_dev, V29 to V30; validated |
| OLTP GUI | Cash Statement/detail loaded; final 1.000064 displays hours/minutes, Ignore seconds TRUE |
| OLAP GUI | 1.000021 unchanged; loaded |
| Both editors | Saved, Deployed, green no-issues checks |
| Dictionary | Three DEV rows; prior values/formulas preserved; rendered and reopened |

Production remains V29. No new payment, backfill, notification or production app change performed by this DEV batch. GUI used existing rows; exact new timestamp propagation was tested through real posting triggers in rolled-back SQL, not a retained GUI-created transaction. The receipt worker remains summary-only. No auto-reissue of previously frozen daily statements.
