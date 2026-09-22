# Reviewer-only operational DML — 22 September 2026

**Outcome: deployed and active on Debian at 11:48:59 Bangkok.** Reviewer DML and reviewer-only API authority are installed; the specific historical posted-payment correction was not executed and its immutable financial fields remain protected.

## Scope and authority

Owner requested operational corrections/database DML (not DDL), reviewer-only authority and a database connection. Preserve the earlier requirement that Codex choose operations without fixed scripts for every business case. Current `Partners.AI Reviewer` governs this capability and existing conversational API writes. Ordinary Partner questions remain available. No historical request replay or execution of the previously discussed closing-payment correction is included.

Starting source: `4300b00eacf714ff3146928b815a8215dcc1a877`, clean local tree. Debian source checkout was `5b9c64c58f8a479aa5cfddba91142749db503ff5`; subsequent local commits contained recorded operational status. No unrelated source edits were overwritten.

## Changes

- Added generic live database discovery/read and atomic parameterized INSERT/UPDATE tools, with exact-row observations, final assertions, authenticated actors, durable before/after audit, duplicate insert reservation and unknown-commit blocking across API/DML.
- Added fresh reviewer checks to both DML and API writes; DML has a separate flag, activation cutoff, service entry and credential/role.
- Added psycopg 3.2.10/binary and typing-extensions 4.16.0 pins, operator role setup, disposable transaction tests and private restored-production role rehearsal.
- Updated configuration example, service catalogue revision 14, README and operating guides. No AppSheet model/workbook, Flyway migration, database table/column/function/trigger or application data change is made by deployment.
- Nine data resources bound transport; this is not a fixed operation list. DDL, raw SQL, identity edits, derived-value bypass, direct DELETE and session/trigger controls remain unavailable. Existing posted-financial-input protection remains; the earlier closing-payment amount cannot simply be overwritten via this capability.

## Recovery and checks

Private PROD backup: `C:/Users/MWCredit/Documents/ChatGPT/MW-Integration-Agent/reviewer-dml-20260922-113745/production.dump`, SHA256 `a9a4c73e47abd6ee3e1f5516deb016b8aa56581dbf079eebabc21fc308e5208a`. Public and assessment_lab restored successfully into a disposable loopback PostgreSQL 18 lab, V32 verified. Cloud SQL instance/cron configuration is outside that logical restore scope.

The restored rehearsal verified DML role INSERT/UPDATE, payment posting and dependent allocations/repayments/cash triggers. Reviewer self-grant, durable public DDL, direct borrower Delete and posted amount overwrite were rejected. All synthetic financial rows were rolled back. A first rehearsal exposed PostgreSQL's UPDATE privilege requirement for existing cash-account/holder row locks; narrow label-column grants resolved it without changing trigger code or exposing those tables to model mutation.

Disposable PostgreSQL transaction tests: 19 passed, including atomic second-step rollback, stale snapshot rejection, final-state mismatch rollback, reviewer revocation before commit, actor protection, SQL-text-as-literal and lost-commit acknowledgement across journal reopen. Existing suite before new tests: 132 run, 3 platform skips, passed.

Deployment/activation: pending final checks at this checkpoint. Package/config/journal backup and live read-only connection evidence will be recorded below. No forced Partner messages or production financial writes are used for acceptance. Owner interaction remains the acceptance test for a real intended correction that existing database guards permit.

Production role provisioning completed with the rehearsed grants; no application data/schema changes. The Debian credential matches the retained private workstation recovery original (digest comparison without printing credentials). Conversation timer stopped for the bounded installation; other schedules retain ownership.


Initial Debian package installation passed 150 tests (13 disposable-PostgreSQL tests skipped there; separately run locally). Package/config/journals backup: `/var/lib/mw-integration-agent/rollback/reviewed-20260922T044415Z`. Before activation, inspected installed App Server schema and found resumed threads cannot replace their tool definitions. Added typed database aliases through the existing discovery/read/write tools, retaining thread IDs/history and the identical DML authority checks. Real synthetic two-process acceptance is pending at this refinement checkpoint.


## Deployment and closure

- Implementation commits `e2f0dee802cdbaf99bbf96e8916306a12e9b898d` and `5bd6c7ebb52e347424ec35b07f2f92b0456c53eb` published to `origin/main`, installed in the Debian Python 3.13 environment. Final package/config/journal backup: `/var/lib/mw-integration-agent/rollback/reviewed-20260922T044807Z`; original pre-feature backup above remains available.
- Final Debian suite: 151 tests, 14 disposable-PostgreSQL tests skipped. All 14 database tests plus 5 shared boundary tests passed in the local PostgreSQL 18 runner (19 total), covering the skipped paths. Full production-schema restoration and synthetic posting rehearsal also passed.
- Live read-only checks: role `mw_reviewer_dml`, database `loan_manager_prod`, proxy loopback verified; schema/database CREATE and AI Reviewer column UPDATE denied; all nine operational table INSERT/UPDATE grants present. One current reviewer authorized, one non-reviewer denied. Live metadata/constraints/trigger discovery passed for all nine resources. No business rows printed or mutated.
- Actual Codex App Server two-process test passed: same thread ID, remembered synthetic token, database operation chosen via the pre-existing tool schema aliases, one simulated transaction, zero production writes and zero outbound messages. Service model/settings were preserved.
- Activated `reviewer_dml_enabled=true` with cutoff `2026-09-22T04:48:59.453352+00:00` (11:48:59 Bangkok). Activation config backup: `/var/lib/mw-integration-agent/rollback/reviewer-dml-20260922T044859Z`. Existing conversation/receipt flags, cutoffs and journals were retained. Credential installation digest matched its private retained workstation recovery original; no credentials are in Git.
- Post-activation: conversation timer enabled/active; last worker result success, exit 0. Poll, receipt, cash-statement and email-retry timers all active. No historical replay requested or performed.
- Rollback: disable the dedicated DML flag and stop the conversation worker before restoring compatible package/config; preserve all journals and accepted changes. Retain the reviewer-only API gate. Role LOGIN may be disabled separately; do not restore old data over accepted financial events.
- Limitations/acceptance: current posted-payment/repayment guards still reject amount overwrites, and controlled cash adjustment flags are not exposed. Direct DML does not invoke AppSheet-only validation/bots. A real intended reviewer correction through Partner messaging remains owner acceptance; no production financial fixture or forced notification was used for testing.

Sanitized result: [verification](../outputs/reviewer-dml-20260922/verification.json). No AppSheet/Flyway release, model-workbook update or app promotion applies: this batch changes only the integration runtime, its own journal schema, and separately managed database role/grants.
