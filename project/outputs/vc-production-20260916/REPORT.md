# VC phases 1–4 — production release

16 September 2026. Promoted with explicit owner authorization: “i'll hold those opportunities first. now, move these changes into production”. Additional optimization opportunities remain on hold.

Production is **Flyway V14 / OLTP 3.000108 / OLAP 1.100090**. Exact SQL source: tested commit `f48dd28d91e66b40485bcf7e2d118afae6682205`; immutable V12–V14 applied at 11:16:58 Bangkok. Development remains V14 / OLTP 1.000061 / OLAP 1.000064. No development financial data was copied.

## Scope and consumers

- Phase 1: nine Charges financial/status/date/count fields and four Loans financial rollups.
- Phase 2: delete OLTP Payment Allocations Calculated Order, Calculated Amount, Calculated Interest and Calculated Principal. Payment - Freeze Allocation remains hidden with FALSE condition and self-assignments of stored result fields.
- Phase 3: eight Borrowers financial/active/closed fields and Loans.Expected Daily Interest Amount.
- Phase 4: Payments.Planned Allocation Amount and Posted Amount.

All 24 OLTP replacements and 24 corresponding OLAP fields are physical, read-only and have blank App formulas. Thus the former VC calculations no longer run. Charges.Amount Due remains virtual for unsaved form feedback. Exact field scope and original expressions are recorded in the dictionary and prior development report.

OLTP owns receipt entry; OLAP consumes shared balances and retains reporting/partner workflow ownership. All saved slices, source bindings and permissions match pre-release definitions. Reporting Charges retains its original 22 columns and READ_ONLY permission. OLAP's three newly exposed physical fields are hidden/read-only. Unrelated formulas, keys, Refs, defaults, manual forms/details and cross-app links were preserved. Charges/Borrowers internal Row ID regeneration flags changed, while key, initial formula and read-only behavior remain intact. The only changed action is the obsolete OLTP freeze action. Production remains database-2; bot settings, schedules and production recipients were not copied from DEV or changed.

## Verification

| Check | Result |
| --- | --- |
| Pre-release normalized production schema | Exact match to reviewed DEV V11 baseline |
| Full private backup restore | All 14 business fingerprints and normalized schema matched |
| Flyway migrate / validate | V12–V14 applied; validation passed |
| Charges parity | 849 rows, zero mismatches |
| Loans and daily helper parity | 68 rows each, zero mismatches |
| Borrowers parity | 30 rows, zero mismatches |
| Payments parity | 166 rows, zero mismatches |
| Original business data | All 14 table fingerprints unchanged after excluding new derived fields |
| Saved app definitions | All 48 targets physical/read-only/blank App formula; four obsolete VCs absent |
| Current Chrome app interface | Both production apps synchronized without errors |
| Production payment form | Opened and cancelled without saving; no financial test transaction |
| Dictionary | All-sheet export/reimport comparison passed; error scan empty; rendered preview checked |

Prior DEV functional tests and four concurrency suites, partial/full/default GUI workflows and OLAP readback remain the financial regression evidence. Production checks were read-only except approved DDL/backfill and app configuration. No live notification was forced. Looker/export definitions were unchanged; their rendering was not retested. Native generated process/output metadata can follow regenerated schemas and is not a business table.

DEV seven-sample sync medians were baseline 5.293 s, phase 1 4.925 s, phase 2 5.422 s, phase 3 5.107 s and phase 4 4.819 s: 8.96% faster observed overall, with noise and overlapping ranges. These are DEV measurements, not a production performance claim. No further optimizations were implemented.

## Recovery

Before-edit AppSheet versions: **OLTP 3.000098 / OLAP 1.100081**. Private V11 backup: `C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/vc-production-20260916/production-before.dump`.

- Backup SHA-256: `7C2AB38D30F34768A801497BB1E1C0EAAFB5F188DAF1AD1726B911062AB65BCF`.
- Reviewed normalized schema SHA-256: `172CFB5F4C1C009F4D35EE0A6D57CD376FA6AA50ED1337DCE52B08E24E629A33`.
- Backup scope: public and assessment_lab; instance settings, cron configuration and credentials are separate. Off-device private-backup coverage is unverified; Git contains sanitized evidence only.

Prefer a reviewed V15-or-higher forward fix preserving the ledger. App restore alone over same-name physical columns is unsafe. Coordinate both app definitions and SQL recovery. Restoring the V11 snapshot would discard subsequent production writes and requires a separate recovery decision; do not automatically restore or replay financial fixtures. Applied migrations remain immutable.

## Owner checks and documentation

On the next ordinary transaction, confirm partial/full payment totals, closure/default behavior when applicable, immediate Amount Due feedback and OLAP balances/read-only permissions. Mobile/offline retry, competing-device behavior and actual notification delivery remain unverified. Promotion was authorized; these device checks are not claimed complete.

Updated the data-model overview and detailed dictionary together, environment inventory, development differences, database instructions, prior DEV release status and authoritative production change log. The read-only parity runner now accepts an explicit environment and checks the reviewed host; its default remains development. The dictionary updater has a production reconciliation mode. SQL migration files are unchanged from the tested release.

Evidence: [parity](parity.jsonl), [backup restore](backup-verification.json), [original data preservation](original-data-preservation.json), [Flyway validation](flyway-validation.json), [dictionary checks](dictionary-changes.json), [DEV benchmarks](../vc-materialization-20260916/REPORT.md).
