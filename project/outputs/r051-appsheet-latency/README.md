# R051 AppSheet save/sync experiment — 6 October 2026

Retain the two-field candidate in canonical DEV OLTP **1.000200** for review. Three matched receipt corrections had median save time **3.633 → 2.694 seconds (25.8% lower)**. This is a small sequential DEV sample, not a statistical guarantee. General sync improvement and improvement across all seven receiving entry points are **not established**.

Work is isolated on `codex/r051-appsheet-latency-experiment`, stacked on PR15's `codex/r051-receipt-corrections` at `7a0231d0ed964cf1e869ecd43c6521fb07a5e457`. No merge or promotion. R051 remains Open. The branch isolates repository changes; canonical DEV itself is shared and currently contains the candidate.

## Exact change and behavior

Payments' hidden `Eligible Charges` and `Eligible Outstanding` virtual columns now return an empty list and zero respectively **only when `CONTEXT("Host") = "Server"` and Status is Posted**. Otherwise each original expression runs unchanged. This avoids historical receipt eligibility scans during server sync and post-save recalculation. Browser form validation recalculates eligibility when adding/editing; the fields are form guidance, not the persisted accounting balance. Any future server-side consumer must respect this explicit contract.

Saved AppDoc readback matched both expressions in [formula-trial.json](formula-trial.json). Version199 guarded the charge list only; its dependent outstanding field still spent1.122s in a measured sync, so version200 guards both. No database migration, posting-engine split, action-chain rewrite, bot change, table removal, restrictive view, caching, delayed-sync or Quick Sync change was made. All seven methods continue using the existing unified V73 engine. The old Payments - Process Receipt bot and its grouped action are already disabled; removing them would not remove duplicate active posting.

Google documents that server virtual-column evaluation uses Host=Server, while local form evaluation uses Browser/Device: [CONTEXT](https://support.google.com/appsheet/answer/10107885?hl=en). View/ViewType was deliberately not used as a server guard. No new data-security filter was introduced.

## Measurements

Current Performance Analyzer, non-preview successful operations, same synthetic borrower/loan/account and alternating5/6-baht corrections on one receipt. Timings are server operation durations, not stopwatch measurements of the full user wait. [All captured samples](measurements.json).

| Operation | Baseline198 | Candidate200 | Interpretation |
| --- | --- | --- | --- |
| Three receipt edits | 4.212,3.633,2.976s; median3.633 | 2.930,2.694,2.513s; median2.694 | 25.8% lower median in this sample |
| Sync after those edits | 3.093,4.955,5.126s | 3.326,4.086,3.617s | Variable; these medians improve, but other baseline syncs were3.034–3.396s. No general sync gain claimed |
| New5-baht Lump Sum receipt | 7.062s | 3.550s | One each; exploratory only |
| Receive All command | No matched baseline in this experiment | 14.541s | Remaining slow path; not covered by the receipt-edit speed claim |

The matched trace supports a specific mechanism: total4.212→2.694s; virtual-column work3.142→1.765s; actual SQL row-update step0.462→0.441s. SQL step timings include connector/network overhead. Parent/child trace times overlap and must not be summed. [Baseline trace](baseline-save-trace.json) · [candidate trace](candidate-save-trace.json).

Receive All still updates the Borrowers command interface: its[14.541s trace](receive-all-trace.json) included10.301s virtual-column work and1.550s notification creation. Related Charges and Submitted Receipts were material dependencies. This experiment does not remove those useful borrower lists, change notification behavior or claim every channel is faster. A later targeted experiment can investigate a lighter command interface while keeping the same database posting engine. Merely deleting synced tables would remove existing features:22 business tables plus user settings still explain23 sync entries. [Earlier dependency review](../r051-payment-performance/README.md).

## Bounded verification

- Fresh private DEV logical backup restored locally: all26 table fingerprints matched; local restore stopped. [Recovery metadata](vm01-development-backup.json). Filename `development-before-v74.dump` is the existing helper convention; noV74 was created or applied.
- Verified app500b27b6-884a-41e8-a9ec-df801b0110ad; rollback198; saved final200 with No issues found. OLAP9f3422be-bc87-4a5a-a42a-67528ee80393 remains56; final saved version and No issues found were rechecked. Unchanged companion workflow evidence is reused because no OLAP/shared SQL definition changed.
- Existing receipt reopened with50-baht capacity including its own prior allocation; amount51 rejected; valid5/6 corrections posted. On version199, changing the date to3October recomputed capacity30; edit discarded. Complete candidate200 retained correct reopened capacity50.
- New candidate receipt showed44 remaining, defaulted to synthetic Dad account, posted5 and correctly split the last4 on one charge plus1 on the next. Both posted receipts remained6 and5 respectively.
- Receive All confirmed the synthetic account and39-baht remaining balance, posted39 across the four remaining charges. Its correction form showed39 and rejected38. The deliberate invalid edit was discarded.
- GUI Delete receipt removed that synthetic39-baht receipt; UI returned to11 total. SQL confirmed the two unrelated synthetic receipts intact and39 charge balance restored. [Readback](gui-posted-readback.json).
- Maintained fixture cleanup then removed only this experiment's bounded synthetic family, with integrity triggers enabled. All23 pre-existing source/audit/history tables, including Flyway history, matched the verified backup exactly. Three recomputed derived tables are explicitly excluded. Zero non-owner DEV delivery addresses and exactly one owner actor mapping. [Cleanup](gui-cleanup.json) · [preservation](final-preservation.json).
- Full maintained `Test-CI.ps1` passed, including immutable migrations, SQL/concurrency and historical upgrades. [Output](local-ci.txt). Existing seven-method V73 accounting/GUI coverage is reused for unchanged posting logic; this is not a claim of seven new timing runs.

## Recovery and publication

Restore only the two before-expressions in formula-trial.json (preferred if other DEV work intervenes), or restore OLTP198 if the whole app is still safe to restore. No SQL rollback is needed. Preserve the private backup and preceding R051 work. Repository helper changes add a scoped `--evidence-dir`, constrain it to outputs, and prevent backup-evidence overwrite so a new experiment cannot replace earlier recovery evidence.

The separate draft PR contains the guarded dictionary delta, current DEV version records, this evidence and helper refinements. Publication and CI must be verified at its actual head before claiming GitHub recovery coverage. Production authorization remains separate.
