# Production promotion — core transactional phases 1–6

15 September 2026. **Live in production.** Owner authorization: “now you've implemented phase 1-6 in dev and tested them all. now let's move them into prod”. This request accepts the tested implementation and authorizes this release; it does not establish separate phase-6 device push delivery.

## Released behavior

- SQL posts Single Full, Single Partial, Receive All, Lump Sum, First-day Auto and Loan Close atomically, including allocations, repayments and payment-caused closure.
- Close Loan submits its target loan; SQL prepares the final charge and derives the actual receipt in the same transaction.
- New-loan first-day charge/receipt creation runs in SQL. AppSheet retains originating-event notifications.
- Manual and nightly generation share SQL rules. The production nightly job is active for **00:05 Bangkok**, first scheduled after release on **16 September 2026**.
- Default Loan submits one confirmed update. SQL records the existing prototype principal-loss/negative-interest, zero-new-cash posting and preserves earlier payment/charge keys with write-off notes.
- Four production notification-only bots retain partner routing, excluding the acting user. Payment closure uses one summary per payment. The three superseded financial bots and 12 obsolete sub-actions are disabled.

Both production apps must be synced before resuming entry. The owner was told the switch was complete and entry could resume after the successful app checks and scheduler activation. Phase 7 analytics migration is not included.

## Exact release and rollback points

| Component | Before / rollback | Released |
| --- | --- | --- |
| Production OLTP | 3.000080 | **3.000094** |
| Production OLAP | **1.100056**, freshly observed; previous inventory said 1.100055 | **1.100062** |
| Production database | Flyway V5 | **V10** |
| Development apps | OLTP 1.000042 / OLAP 1.000040 | Unchanged |
| Production SQL source | database-2, appsheet-pg-prod-20260914 | Unchanged |

Tested release commit: `33ed313f585311dcd0caffb1488ea8ac574bfb6e`. Implementation commit: `6202997846fabfc7a5c175c383cdc6184bc4322a`. [Independent migration CI passed](https://github.com/welct0407/AppSheet-Loan-Project/actions/runs/34984089290). The clean release checkout and private manifest were checked before migration; no migration was edited.

V6–V10 applied at **22:07:33 Bangkok**: 510 / 39 / 36 / 93 / 40 ms, total 718 ms. These are migration execution times, not app speed measurements. Flyway validation passed afterward. The [release manifest](release-manifest.json) records every exact SHA256.

Pre-release normalized schema: `888c78ec92780065a545bad8947e9874718ca3bb1da7d7db839efa60feebe194` (V5, expected match). Post-release normalized schema: `242404152af2760a046b1e628e7a4df1e56a1a7230e90839f8192d8e05217bba` (V10), identical to development and the tested rebuild. Schema equality excludes environment-specific scheduler activation and instance settings.

## Backup and infrastructure

A fresh full logical production dump was restored successfully into an isolated local PostgreSQL instance using `pg_restore --exit-on-error --no-owner --no-privileges`. The restored normalized V5 schema and all 14 original table fingerprints matched. The temporary local server is stopped.

Private backup: `C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/core-promotion-20260915/production-before.dump`. SHA256: `031c7015f17f66c22e1ac7beffd758890e46e052fc9b6cb121bb96fcf3a64b2b`. The workbook backup and restore diagnostics are in the same external private folder. No borrower data or credentials are committed to Git. Repository push does not establish off-device coverage of this private backup or credentials.

Cloud Console showed a completed backup at **21:46:22 Bangkok**, with automated backups, PITR and deletion protection enabled. Existing production flags `cloudsql.iam_authentication=on,max_connections=100` were preserved. Added flags: `cloudsql.enable_pg_cron=on`, `cron.database_name=loan_manager_prod`, `cron.timezone=Asia/Bangkok`, `cron.max_running_jobs=1`. The settings operation restarted the instance **22:05:38–22:06:10**. Tier, storage, network policy and credentials were unchanged.

V9 initially created the production job inactive. After app reconciliation and sync, job 1 `loan-daily-charges` was activated at **22:50:48 Bangkok**, schedule `5 0 * * *`, database `loan_manager_prod`, with the tested command:

```sql
SELECT public.generate_due_charges((statement_timestamp() AT TIME ZONE 'Asia/Bangkok')::date);
```

See [scheduler readback](scheduler-enabled.jsonl). The development job remains active independently. No synthetic job or immediate full-production charge run was created.

## Consumers and app reconciliation

OLTP owns payments, generation and default workflows. OLAP consumes shared Loans/Payments and related ledgers through read-only financial views and Reporting Loans. Existing reporting exports/Looker consume those financial results; no report was edited.

Both apps regenerated Loans/Payments and configured the approved fields. `Ref Closing Payment` is a read-only Ref to Payments. `Ref Target Loan` is a Ref to Loans, user-read-only through Editable_If FALSE in OLTP and static Read-Only in OLAP. `Charge Generation Request` is hidden Text with no default, user-read-only in both apps. The two generated reverse-reference VCs are read-only. Reporting Loans includes the three new Loans columns, with READ_ONLY/filter/actions preserved. OLAP Default Loss Amount displays baht/zero decimals.

Saved appdoc comparisons showed no change to existing business-table bindings/permissions, unrelated business-column settings, manually ordered views or existing OLAP actions. Regeneration changed Payments.Row ID's fixed-definition metadata but retained its hidden Text key, Read-Only Yes, UNIQUEID("PackedUUID") and no reset. Sixteen OLTP actions changed as intended, plus two generated navigation actions in each app. AppSheet generated process metadata changed as disabled processes were omitted and notification branches were added; these are not new SQL business tables. See [model evidence](model-evidence.json) and [configuration](appsheet-configuration.md).

An AppSheet version conflict occurred after regeneration. It was detected before treating changes as saved; the editor was reloaded and the affected settings/actions reapplied. Final saves showed no errors and disabled Save/Undo. Final appdoc versions above were captured after saving.

## Verification and limits

| Check | Result |
| --- | --- |
| Development financial cases and concurrency | Existing phase reports/CI passed; exact tested migrations promoted |
| Production backup restoration | Full restore, schema and 14 table fingerprints matched |
| Production schema drift | Expected V5 before; exact V10 after |
| Production core financial record preservation | Original Loans 65, Charges 774, Payments 160, Allocations 318, Repayments 691 and other non-analytics tables retained exact fingerprints |
| Pending/error receipts | 0 Processing / 0 Error at cutover and post-save audit |
| New fields on historical rows | 0 populated closing refs/request tokens/target-loan refs; no backfill |
| OLTP current GUI | Loaded, synced; payment form opened and cancelled without submission; operational loan list loaded |
| OLAP current GUI | Loaded, synced; read-only loan reporting loaded with no loan add/edit/delete controls |
| Notifications | Four enabled notification-only routes, saved templates/expressions/deep links and production recipients read back; no literal escaped newline artifacts |
| Production financial/notification test | Not forced; ordinary real workflow/device confirmation remains a follow-up |
| Nightly job | Correct saved command/schedule/active flag; first natural production execution not observed during this release |
| Data dictionary | Updated production catalog, rules, Refs, slice membership, bot state and differences; saved/reopened contents and native features checked |
| Looker, export delivery, offline/multiple-device recovery, app speed | Not tested by this release |

The existing **Refresh Daily Analytics Daily 2** hourly bot remained enabled. Daily Analytics retained 42 rows but its snapshot fingerprint changed during the release window. A column-level comparison found changes in Generated At, Row ID, Available Cash EOD, Interest Received, Pending Charges EOD and Unsettled Profit EOD. This is consistent with the existing rebuild of yesterday/today; no claim is made that the snapshots are identical or that every report metric was audited. All underlying transactional table fingerprints match. See [aggregate audit](database-after.jsonl) and [analytics difference](analytics-difference.json).

Default write-offs now retain charge rows instead of deleting them. Monetary component conventions are preserved, but downstream metrics that count charge rows may change. No unrelated Looker audit or report change was performed.

## Ordinary follow-up checklist

1. Sync both production apps before the next real operation.
2. On the next receipt/close/default that is actually needed, confirm the amount/status in OLTP and OLAP and the expected partner alert. A multi-loan payment should send one closure summary; a default should show loss/no cash received.
3. After the first 00:05 run, confirm the production cron run succeeded and due charges appear once after sync. Do not create a duplicate manual batch to test the scheduler.
4. If a command fails under contention, sync/review its status before retrying. Do not repeat a posted financial command as a correction.

## Coordinated rollback / forward fix

- Pause entry and use the guarded production schedule runner to pause nightly generation with the existing release manifest and actual release/incident authorization. Inspect and reconcile Processing/Error receipts first.
- Prefer a reviewed **V11 or higher** forward-fix that preserves posted history and command guards. Applied V1–V10 migrations are immutable; never use repair/clean or edit checksums.
- App rollback versions are **OLTP 3.000080 / OLAP 1.100056**. Do not restore their financial bots/actions while the new SQL processors remain active. Prepare and test a coordinated SQL/AppSheet fallback before restoring either app.
- Retain nullable reference/request columns and posted audit links. Restoring a pre-release database would discard subsequent production activity, so any such recovery requires an agreed write freeze, explicit recovery approval and reconciliation of later records. The backup proves recoverability; it is not permission to overwrite later data.
- A repository checkout does not restore live AppSheet versions, Cloud SQL flags, scheduler state or credentials. Restore each component deliberately and recheck both consuming apps.

The authoritative change log is [CHANGE_NOTES_CORE_PAYMENT_PROMOTION_2026-09-15.md](../../Change%20Logs/CHANGE_NOTES_CORE_PAYMENT_PROMOTION_2026-09-15.md).
