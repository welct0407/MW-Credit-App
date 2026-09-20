# R011 — Borrower collection notes and required English Name

## Scope and authority — 20 September 2026

Owner requested one borrower-linked quick-edit note in the Collection daily borrower detail, plus making Borrowers.Description (English Name) required in AppSheet edit forms. Implement in DEV; production promotion is not authorized.

The note is a persistent, optional borrower-level operational text field, editable from the daily collection detail. It does not reset daily or alter payment dates, balances or collection status. OLTP owns editing; OLAP remains a read-only analytical consumer. No automatic notifications or AI Collection integration are included.

## Rollback and starting state

- Starting Git commit: `fcd24c5e50d807a1799f71621e39598cff24d945`; working tree clean.
- DEV OLTP `500b27b6-884a-41e8-a9ec-df801b0110ad`: current editor/preview version `1.000054`, Deployed, database-3.
- DEV OLAP recorded baseline `1.000017`; verify live before any edit.
- Database rollback and dependency review pending before mutation.

## Progress

- Reserved R011 and advanced next number to R012.
- Inspected current DEV Borrowers columns: no existing notes field; Description is Text, displayed as English Name, currently optional.
- Implementation, migration/dependency verification, current-GUI tests and exact dictionary updates remain pending.

Status: In development; no live changes applied yet. Owner acceptance and production authorization remain separate.
