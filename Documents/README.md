# AppSheet documentation

Use [AGENTS.md's task routing](../AGENTS.md#working-method-and-task-routing) to select relevant documents; this index is not a required reading list. Keep one production model and a separate development difference register. Historical reconciliation dates below describe their evidence, not a fresh live check.

| Document | Purpose | Current status |
| --- | --- | --- |
| [Release tracker](Release_Tracker.md) | Project release numbers, content summaries, status and chat-title convention | Consult tracker for current release status and next available number |
| [Solution design](Solution_Design.md) | Prototype scope, app ownership, financial-model principles and dashboard page order | Read the affected section for design/model/report work |
| [Production data model](AppSheet_Data_Model_Overview.md) | Architecture, ownership, tables, relationships and current calculation boundaries | Reconciled to live app definitions and SQL schema on 15 September |
| [Data dictionary](AppSheet_Data_Dictionary.xlsx) | Exact production business columns, rules, references, slices, SQL catalog and development differences | Rebuilt from current definitions; see Guide for scope |
| [Environment inventory](Environment_Inventory.md) | App IDs/versions, database hosts, connection limits, evidence timestamps and limitations | Current read-only app/SQL checks; other configuration has dated evidence |
| [Development differences](Development_Changes.md) | Environment isolation, remaining differences and promotion history | Record each release's DEV checkpoint and close its promoted differences; consult the register for current state |
| [Database migrations](../database/README.md) | Flyway baseline, development workflow and production promotion | Authoritative SQL change procedure |
| [Development preparation](Development_Environment_Preparation.md) | Mandatory source/navigation isolation and automation review after copies/restores and relevant edits | Released PROD automation parity, DEV-only effects and owner-only notifications; verify live state |
| [DEV refresh from PROD](Development_Refresh_Runbook.md) | Apps-only, database-only or combined refresh; preservation, validation and old-app cleanup | Run only on owner request; retain DEV themes, links and owner-only notification routing |
| [Release workflow](Release_Workflow.md) | Integrated DEV → PROD-mapped immutable RC → App Upgrade; Flyway, tests, approval and closure | Mandatory for future work from 19 September 2026; [templates/helpers](../scripts/releases/README.md) record manifests, mappings, exact delta/readbacks and checklists |
| [Release recovery](Release_Recovery_Runbook.md) | App-version rollback, compatible SQL/forward-fix, partial deployment, hotfix reconciliation and RC retention | Use the release's captured recovery points and actual scoped authority |
| [Promotion documentation checklist](Promotion_Documentation_Checklist.md) | Complete Documents inventory with per-file update triggers and required closure dispositions | Required for every promotion; includes narrative/diagram pairs and preserved history |
| [OLTP business processes](OLTP_Business_Processes.md) | Business workflow narrative and editable diagram | Historical workflow synthesis with current source/version annotation; not a fresh lifecycle test |
| [Daily analysis automation](Daily_Loan_Analysis_Automation.md) | Export/analysis contract and pilot design | Deployment/delivery verification remains explicitly pending |
| [Markdown change logs](../Change%20Logs/) | Dated changes, approvals, rollback and test results | Authoritative change history |

## History

[Model history](AppSheet_Data_Model_History.md) preserves the former accumulated overview. [Original dictionary](history/AppSheet_Data_Dictionary_before_reconciliation_2026-09-15.xlsx) preserves its old production/trial sheets byte-for-byte. These records explain earlier decisions; their old versions, Money database references and trial states do not supersede the current reference.

[Universal payments clone migration runbook](Universal_Payments_Clone_Migration_Runbook.md) describes the September 6 AppSheet-native migration. It is historical, not today's PostgreSQL cutover procedure. Source materials under sources/ remain read-only. Reports under outputs/ retain their measurement dates; never relabel an earlier result as a fresh benchmark.

## Update procedure

Follow [AGENTS.md, Section 6](../AGENTS.md) for integration, RC preparation/freeze, approved App Upgrade and validation. The machine-readable manifest links DEV/RC/PROD versions, Git/Flyway pins, source mappings, concise change record/checklist and decisions. Current DEV may already contain later work. Keep evidence linked rather than duplicated; optional delta rows support targeted verification, not routine all-property verification or manual PROD recreation.

1. Capture current app versions and relevant definitions, SQL schema/catalog, and affected consumers before a change.
2. Use Flyway for PostgreSQL model changes. Keep AppSheet editor and instance settings separately recorded.
3. Update affected overview sections and dictionary rows together once per coherent completed batch and after promotion; record unpromoted differences in Development Changes and exact identities/settings in Environment Inventory. Keep a concise running change record during refinements; link necessary exact evidence.
4. Add or update the corresponding Markdown Change Log with tests, acceptance, backup and rollback information.
5. On promotion, finish each row of the [documentation checklist](Promotion_Documentation_Checklist.md), including explicit Development Changes closure, before marking Released. Verify changed workbook values/layout and links, then commit/push intended files. Repository publication does not authorize a production deployment.

The current dictionary includes app formulas as literal text, not Excel calculations. Very long expressions can be inspected in the formula bar; the accompanying sanitized app-model.json retains complete property values. Raw private app snapshots and credentials remain outside Git. Any redacted email literal is marked explicitly.

No separate full development documentation copy is needed. Keep a concise complete change record, necessary mapping evidence, migration hashes, RC versions and test evidence. All apps target Deployed, DEV notification recipients are redirected through DEV master data, and PROD verification is basic and limited after App Upgrade. Capture boundary app documentation where available; perfect exports/full-app diffs are not prerequisites. Promote complete definitions from immutable RCs, update the production reference and close only promoted differences. Finish all document rows and publish evidence with the final release tag.
