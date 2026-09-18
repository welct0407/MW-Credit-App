# R005 production release — 18 September 2026

**Released:** PROD OLTP **3.000172**, OLAP **1.100122**, PostgreSQL **V21**. Owner accepted the DEV result and authorized the complete batch: “everything looks fine. go ahead to promote into prod”. The later explicit instruction excludes deployment-check advisories and keeps both DEV apps Prototype. That instruction takes precedence over the remaining PROD deployment-check wording in AGENTS.md; advisory findings are not claimed cleared.

The deployed scope includes OLAP cash custody/ledger and manual transfers, payment receiver and expense payer fields, SQL holder balances shared with OLTP, settlement reversal through **Delete**, the compact nonzero Business Cash Held deck, Collection due = collected + remaining, and the orange Total Cash Pool before Outstanding Principal. No separate Cancel Settlement action exists. DEV opening balances and every synthetic financial record were excluded.

## Package and execution

- Frozen package **R005-P1**, tested business definitions DEV OLTP 1.000125 / OLAP 1.000123. Pinned implementation commit **2054384831a58a89842a42a123381fb1dc032141** and [exact Flyway manifest](production-candidate-manifest.json). Documentation commits do not change the deployment commit.
- SQL V20/V21 applied at **10:36 Bangkok**, then [Flyway validation passed](production-validate.json). [Migration result](production-migrate.json). Only these two migrations were pending. Initial line-ending hash rejection occurred before SQL writes; restoring exact tested bytes and refreshing Git's normalized stat cache resolved it without overrides or checksum repair.
- [Exact package](production-package.json) and [independent saved readback](production-saved-readback.json): **2,408 core properties and 20 dashboard items verified, zero mismatches**. SQL/business scope is unchanged from the accepted candidate. Generated references, Reporting Loans membership/order, forms, action conditions, exact labels and dashboard order are included.
- Final production sources remain database-2 / host 34.21.174.215 / appsheet-pg-prod-20260914. Existing production companion navigation and notification routes are preserved; 112 relevant exported route properties compare unchanged. No scheduler pause or recipient change was made.

## Verification

[Current-GUI smoke evidence](production-gui-verification.json) records both final saved editors showing **No issues found**. OLTP dashboard displays the cash-pool amount in #FF8C00 before principal and the empty nonzero-cash section after KPIs; Collection detail arithmetic reconciles. The payment form exposes Received By after Amount with Dad default and was cancelled. OLAP Cash Position renders all three zero-balance holders and an empty ledger. Its manual cash form renders the expected fields and was cancelled. No financial test row or forced notification was submitted in PROD.

[Final read-only SQL checks](production-final-readback.jsonl), 11:33 Bangkok: V21, three holders, no ledger rows, no history backfill, no legacy receiver/payer population, no DEV opening fixtures, no duplicate system sources and no holder-balance mismatches. [Affected schema metadata](production-schema-metadata.json) independently records current columns and constraints.

Reuse of DEV behavioral tests is explicit: [source workflows and concurrency](GUI_TEST_REPORT.md), [completed/pending Delete reversals](REVERSAL_REPORT.md), and [partial-payment/fully-paid/dashboard checks](DASHBOARD_REPORT.md). These tests use the same promoted SQL and exact accepted AppSheet properties. PROD financial reversals and notification delivery were not forced. Prototype mode can limit scheduled DEV execution; this is not resolved by deploying DEV. Unrelated Looker reports were not edited or re-audited.

Both DEV apps remain **Prototype**, live versions OLTP **1.000131** / OLAP **1.000128** after diagnostic-only mode transitions. The frozen business versions remain 1.000125 / 1.000123. Historical readiness/delivery/whole-export gates in earlier checkpoint reports do not describe the current release decision.

## Documentation and recovery

The production model overview and workbook are updated together, including affected tables, columns/rules, relationships, slices and SQL metadata. Earlier R005 DEV inventory rows are labeled historical; only actual environment/data differences remain. [Workbook roundtrip verification](dictionary-production-verification.json).

Rollback app versions: **OLTP 3.000156 / OLAP 1.100106**, paired with the verified V19 backup. [Backup](production-backup.json) SHA-256 **B989EC1248F14C508197909BAFD4E7D5C3DFD8CE251A230C79438479A6918135**; [isolated restore rehearsal](production-restore-test.json) matched the reviewed normalized public/assessment schema and Flyway history. Raw backups/exports remain outside Git. Cloud SQL instance/cron settings and credential recovery are outside that logical restore coverage.

Prefer a reviewed immutable forward-fix after new production writes. Any full recovery must coordinate both apps and SQL, preserve source/custody history and obtain explicit approval before restoring over later financial records. No automatic destructive down-migration is supplied. See [preflight and ordered recovery](PRODUCTION_PREFLIGHT.md).
