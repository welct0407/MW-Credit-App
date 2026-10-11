# Consolidated UI checkpoint validation — 9 October 2026

Owner requested several related UI iterations per consolidated browser checkpoint. Routine iterations use focused type/build/affected checks and DEV visual review; additive display-only API fields or stale selectors are not automatic full-suite triggers. Financial/auth/database changes retain relevant immediate verification and applicable protections. Final promotion requires actual full proof for the consolidated source; skipped-success or older green alone is insufficient.

App changes: AGENTS.md, docs/Development.md and the four-line CI event/browser gate. PM change: Documents/PWA_Orchestration.md. Ordinary PR updates still run existing inexpensive checks but skip full browser install/E2E; apply/reapply ci:checkpoint at the agreed ref for full browser checks. A persistent label does not trigger full E2E on later synchronization. Main/manual runs remain full. The pre-existing unpublished path router and governance drafts remain uncommitted.

Rollback: normal Git revert of this governance commit. Starting app 45394f9; PM ad9faa55. Static validation parsed staged and preserved working YAML, passed eight event truth-table scenarios, and confirmed main/read permissions unchanged. No product tests, full CI, build, deployment, database, service or production change. Publication records the policy, not product acceptance.
