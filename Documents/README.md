# AppSheet documentation

Updated 15 September 2026. Start with the production reference below. Keep one production model and a separate development difference register.

| Document | Purpose | Current status |
| --- | --- | --- |
| [Release tracker](Release_Tracker.md) | Project release numbers, content summaries, status and chat-title convention | Current baseline R001; consult tracker for the next available number |
| [Production data model](AppSheet_Data_Model_Overview.md) | Architecture, ownership, tables, relationships and current calculation boundaries | Reconciled to live app definitions and SQL schema on 15 September |
| [Data dictionary](AppSheet_Data_Dictionary.xlsx) | Exact production business columns, rules, references, slices, SQL catalog and development differences | Rebuilt from current definitions; see Guide for scope |
| [Environment inventory](Environment_Inventory.md) | App IDs/versions, database hosts, connection limits, evidence timestamps and limitations | Current read-only app/SQL checks; other configuration has dated evidence |
| [Development differences](Development_Changes.md) | Environment isolation, remaining differences and promotion history | Assessment promoted to production OLAP 1.100051 from DEV 1.000027 |
| [Database migrations](../database/README.md) | Flyway baseline, development workflow and production promotion | Authoritative SQL change procedure |
| [Development preparation](Development_Environment_Preparation.md) | Mandatory source/navigation isolation and automation review after copies/restores and relevant edits | Released PROD automation parity, DEV-only effects and owner-only notifications; verify live state |
| [OLTP business processes](OLTP_Business_Processes.md) | Business workflow narrative and editable diagram | Historical workflow synthesis with current source/version annotation; not a fresh lifecycle test |
| [Daily analysis automation](Daily_Loan_Analysis_Automation.md) | Export/analysis contract and pilot design | Deployment/delivery verification remains explicitly pending |
| [Markdown change logs](../Change%20Logs/) | Dated changes, approvals, rollback and test results | Authoritative change history |

## History

[Model history](AppSheet_Data_Model_History.md) preserves the former accumulated overview. [Original dictionary](history/AppSheet_Data_Dictionary_before_reconciliation_2026-09-15.xlsx) preserves its old production/trial sheets byte-for-byte. These records explain earlier decisions; their old versions, Money database references and trial states do not supersede the current reference.

[Universal payments clone migration runbook](Universal_Payments_Clone_Migration_Runbook.md) describes the September 6 AppSheet-native migration. It is historical, not today's PostgreSQL cutover procedure. Source materials under sources/ remain read-only. Reports under outputs/ retain their measurement dates; never relabel an earlier result as a fresh benchmark.

## Update procedure

Follow [AGENTS.md, Section 6](../AGENTS.md) for release capture, testing/readiness, freezing, approved batch promotion and production validation. The release change log/checklist is the exact promotion record; current DEV may already contain later work. Keep evidence linked rather than duplicated across these documents.

1. Capture current app versions and relevant definitions, SQL schema/catalog, and affected consumers before a change.
2. Use Flyway for PostgreSQL model changes. Keep AppSheet editor and instance settings separately recorded.
3. Update the production overview and dictionary together; record unpromoted differences in Development Changes and exact identities/settings in Environment Inventory.
4. Add or update the corresponding Markdown Change Log with tests, acceptance, backup and rollback information.
5. Verify workbook values/layout and links, commit and push the intended changes. Repository publication does not authorize a production deployment.

The current dictionary includes app formulas as literal text, not Excel calculations. Very long expressions can be inspected in the formula bar; the accompanying sanitized app-model.json retains complete property values. Raw private app snapshots and credentials remain outside Git. Any redacted email literal is marked explicitly.

No separate full development documentation copy is needed. Keep the development differences, full captured definitions, migration hashes and test evidence. On promotion, update the production reference and close the promoted differences.
