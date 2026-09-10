from pathlib import Path
root=Path('C:/GitHub/AppSheet-Loan-Project')
p=root/'Documents/AppSheet_Data_Model_Overview.md'
s=(root/'outputs/universal-payments-production-20260906/AppSheet_Data_Model_Overview.before.md').read_text(encoding='utf-8-sig')
s=s.replace('| Live baselines |', '| Historical baselines (before universal payments) |',1)
s=s.replace('| Reconciliation date |', '| Earlier reconciliation dates |',1)
s=s.replace('| Reconciliation status |', '| Earlier reconciliation status |',1)
anchor='| Maintenance model |'
pos=s.index(anchor)
s=s[:pos]+'| Current universal-payment baseline | Production OLTP **v3.000002**, 6 September 2026; app `93844270-6aa5-420b-a960-bcdf08abd357`, original Money database `9Y5vh3TFzZ4sIe2JgNh4l0`. Full backup and rollback v2.300005 recorded in the production change log. 187 OLTP column definitions and 133 documented behavior/view objects compared with accepted clone. |\n| Current downstream boundary | OLAP **v1.100012** inspected; existing client and totals verified, recent Daily Analytics snapshots rebuilt after synthetic cleanup. New Payments/Payment Allocations tables and repayment trace columns are not loaded in OLAP. Its Repayments native-schema warning remains pending reconciliation. Looker Studio definition was not changed or fully re-tested. |\n'+s[pos:]
s=s.replace('> **Reconciliation boundary**  The 4 September', '> **Historical reconciliation boundary (4 September)**  The 4 September',1)
s=s.replace('**Reference authority:** This pair was reconciled directly against the three affected live OLTP AppSheet editor objects through 4 September 2026; the remaining documented scope retains its earlier dated baselines. The app editors remain authoritative if later drift occurs.', '**Reference authority:** The universal-payment model and production migration are reconciled through OLTP v3.000002 on 6 September 2026. The workbook main inventory now includes the 54 changed definitions, six native/app References and exact two-slice memberships. Historical OLAP definitions retain their dated reconciliation unless the current downstream boundary explicitly says otherwise. The app editors remain authoritative if later drift occurs.')
s=s.replace('10 AppSheet Database tables | Physical keys', '12 AppSheet Database tables | Physical keys',1)
s=s.replace('6 loaded tables; 2 slices | Data entry', '8 loaded tables; 2 slices | Data entry',1)
s=s.replace('### 2.1 Reconciliation summary', '### 2.1 Earlier reconciliation summary (before universal payments)',1)
s=s.replace('### 2.2 Isolated universal-payment implementation — in progress', '### 2.2 Accepted isolated universal-payment implementation — historical test record',1)
old='The universal-payment work uses a separate OLTP app and native AppSheet database. The production table counts and OLTP/OLAP inventories in this overview remain at their stated production reconciliation baselines. Source OLTP **v2.300005** was observed before copying; unrelated drift since the documented v2.300003 baseline has not been reconciled. No production, OLAP, or Looker Studio change has been made by this implementation.'
new='The isolated test work used a separate OLTP app and native database. This section records that test implementation and its limits; statements about production being unchanged refer to that historical test phase. The user accepted the results and authorized production migration on 6 September 2026. Section 2.3 and the production change log supersede the earlier deployment-pending status. The final test configuration is v1.000068, with data-model checkpoint v1.000065.'
s=s.replace(old,new)
section='''### 2.3 Production universal payments — deployed 6 September 2026

Production remains **Loan Manager ผู้จัดการสินเชื่อ**, app `93844270-6aa5-420b-a960-bcdf08abd357`, using the original Money database `9Y5vh3TFzZ4sIe2JgNh4l0`. Current saved version is **3.000002**. The user confirmed all clients were synced and data entry was paused before cutover. A full app/data/file-copy backup was completed before schema changes: app **LoanMgr FULL BACKUP 20260906** (`243eb391-5f6d-4720-a7e2-f0dc67151e78`, v1.000002), database **Money FULL BACKUP 20260906** (`SAYscSVuS847EarNTaAiwc`). App rollback baseline is **v2.300005**. Backup copies regenerate native Row IDs; retain the backup app and database as a pair. Restoring an app version alone does not restore physical data.

The original database now has twelve tables. New native tables are **Payments** (`O5PsoZ45Pa4-UiwXmMUzq8`) and **Payment Allocations** (`o9bAh2SCbt4umWWbdwabH9`). All six new relationship fields listed in section 2.2 are native Reference and OLTP Ref with the same required/IsPartOf rules. Both ownership branches are preserved. Historical/default repayments retain blank optional payment links. New tables were created empty; no clone business or synthetic data was migrated.

| OLTP table | Physical including ordinal | VCs | Total |
| --- | ---: | ---: | ---: |
| Borrowers | 7 | 26 | 33 |
| Loans | 20 | 20 | 40 |
| Charges | 7 | 18 | 25 |
| Repayments | 11 | 5 | 16 |
| Statistics | 3 | 23 | 26 |
| Partners | 5 | 0 | 5 |
| Payments | 14 | 9 | 23 |
| Payment Allocations | 14 | 5 | 19 |

The workbook **Columns**, **Tables**, **Relationships**, **Slices**, **Slice Columns** and **App Variances** now reflect this production model. The historical clone sheets remain test evidence. Production new-table app ordinals differ from the clone after native schema regeneration; the workbook records the actual production order. The two borrower slices are Visible Borrowers (33 columns, `NOT([Hidden Flag])`, adds/updates/deletes) and Todays Collection Board (12 columns, `ISNOTBLANK([Daily Collection Status])`, read-only). Their 45 ordered memberships match the accepted clone.

Payments owns receipt processing, snapshots, interest-first allocation, posting, reconciliation and retry. Existing charge/loan/Collection rollups continue to consume Repayments at the same grain. Full, partial, Receive All, lump sum, first-day and loan-close entry points use the universal engine. The narrowly scoped default validation and allocation-retention guards are included. No new general reversal engine was introduced.

The accepted definition was copied into a release candidate, remapped to all eight original production sources, regenerated and reconciled, then transferred using App Upgrade. The candidate is now a prototype with its daily scheduler and notifications disabled. Production's seven bots are enabled: the original six plus Payments - Process Receipt. The Charge Received notification now observes the single Payment Posted transition. Original Google sign-in, owner/one-user access, app identity and default app folder are preserved.

**Validation:** production definition/source checks passed. A fresh comparison found zero differences across 187 OLTP column definitions and 133 compared behavior/view objects relative to the accepted clone. Synthetic first-day10, invalid21 against20, valid lump sum15 and closure105 were exercised. Valid receipts automatically posted and reconciled; closure split100 principal/5 interest. Synthetic borrower cascade removed both branches and left both new tables empty. All ten operational dashboard amounts returned exactly to baseline. Notifications were suppressed during tests, then restored.

**Downstream:** OLAP retains its eleven loaded tables and previous Repayments schema (22 columns). It shows a source-schema warning for the added native trace fields, but a fresh client loaded and its existing totals reconciled. The new trace fields and payment tables remain **not loaded in OLAP; schema reconciliation pending**. The normal hourly reporting refresh captured temporary fixtures; its existing yesterday/today rebuild was run once after cleanup. Today's stored interest6486 and outstanding principal96176 then matched the cleaned operational source. The Looker definition was unchanged; its connector freshness and visual reconciliation remain manual checks.

Offline/concurrent clients, alternate roles/devices, scheduled first-day/date-boundary behavior, notification delivery and the complete Looker surface were not established by these bounded tests. Do not interpret deployment as proof of every possible scenario or external accounting compliance. Detailed object changes, intermediate corrections, results, rollback and the remaining manual checklist are in [the production change log](../Change%20Logs/CHANGE_NOTES_UNIVERSAL_PAYMENTS_PRODUCTION_2026-09-06.md).

'''
idx=s.index('\n## 3.')
s=s[:idx]+'\n'+section+s[idx:]
p.write_text(s,encoding='utf-8')
rp=root/'Documents/Universal_Payments_Clone_Migration_Runbook.md'
r=(root/'outputs/universal-payments-production-20260906/Universal_Payments_Clone_Migration_Runbook.before.md').read_text(encoding='utf-8-sig')
r=r.replace('This is a migration review document; production deployment and user acceptance are pending.','The user accepted the clone results and authorized production migration on 6 September 2026. Production is now deployed at v3.000002; the production change log records implementation, backup, validation and remaining coverage.')
r=r.replace('## Apply in dependency order after acceptance and explicit production approval','## Accepted migration checklist (production execution recorded separately)')
r+='\n## Production execution record\n\nCompleted migration to original OLTP v3.000002 and original Money database. Full backup app243eb391-5f6d-4720-a7e2-f0dc67151e78 with databaseSAYscSVuS847EarNTaAiwc; app rollback v2.300005. Both new tables are empty after synthetic validation cleanup. Production notifications/scheduler restored; release candidate returned to prototype state. OLAP loads its prior schema with a source warning; recent reporting snapshots were refreshed and reconciled. See [the authoritative production change log](../Change%20Logs/CHANGE_NOTES_UNIVERSAL_PAYMENTS_PRODUCTION_2026-09-06.md). Remaining matrix items above remain unexecuted unless that log explicitly records a result.\n'
rp.write_text(r,encoding='utf-8')
print('Updated overview and execution status; retained historical test evidence.')
