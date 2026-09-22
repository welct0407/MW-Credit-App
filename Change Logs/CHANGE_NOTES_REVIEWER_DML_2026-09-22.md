# Reviewer-only operational DML — 22 September 2026

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

Disposable PostgreSQL transaction tests: 18 passed, including atomic second-step rollback, stale snapshot rejection, final-state mismatch rollback, reviewer revocation before commit, actor protection, SQL-text-as-literal and lost-commit acknowledgement across journal reopen. Existing suite before new tests: 132 run, 3 platform skips, passed.

Deployment/activation: pending final checks at this checkpoint. Package/config/journal backup and live read-only connection evidence will be recorded below. No forced Partner messages or production financial writes are used for acceptance. Owner interaction remains the acceptance test for a real intended correction that existing database guards permit.

Production role provisioning completed with the rehearsed grants; no application data/schema changes. The Debian credential matches the retained private workstation recovery original (digest comparison without printing credentials). Conversation timer stopped for the bounded installation; other schedules retain ownership.
