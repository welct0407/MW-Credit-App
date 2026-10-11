# VM-01 task cleanup rule — 11 October 2026

Owner requested cleanup of disposable files after each development job and will separately validate the installed tools. Baseline: `92bf9d6dcb66f030799174b6d8cc3c0e0ba02d13`.

Added the VM-01 storage lifecycle rule to AGENTS, referencing AppSheet-Loan-Project `Documents/VM01_Local_Storage.md`. Task completion now includes scoped cleanup, dependency reuse and a purpose/review date for retained diagnostics. Existing migration runners retain local clusters; the rule requires explicit cleanup of the completed task's exact paths using the maintained AppSheet helper. Secrets, private recovery data, installed tools and unrelated active work remain protected.

No database runner, migration, application or infrastructure behavior changed; database CI and full tool validation were not rerun. Checked the staged diff to isolate this addition from existing AGENTS edits. Other dirty source, outputs and test artifacts remain with their existing tasks. Detailed findings, helper checks, storage measurements and retained exceptions are in AppSheet-Loan-Project `Change Logs/CHANGE_NOTES_VM01_STORAGE_LIFECYCLE_2026-10-11.md`.

Rollback: revert this task's instruction/log addition. Commit/push only these intended changes; no production effect or scheduled cleanup.
