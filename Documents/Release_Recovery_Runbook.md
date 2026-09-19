# Release recovery and hotfix runbook

Use for a failed/partial [RC promotion](Release_Workflow.md) or an explicitly authorized hotfix. Record actions in the existing release log/manifest; don't create duplicate incident histories. This procedure grants no new production-write, notification or destructive-restoration authority.

## Before promotion

Record each affected PROD app's actual pre-upgrade/restorable version, UUID, current SQL version, pre-migration DB backup/recovery evidence and the ordered recovery plan. Verify retention covers the intended recovery window; a version string is not proof a deleted app or expired version can be restored. Where needed preserve a recoverable private app copy without active duplicate jobs. Keep raw data/credentials outside Git.

Test compatibility of the **old app and new app with expanded SQL** in DEV. Include intermediate OLTP/OLAP combinations and old/queued clients relevant to deployment order. Defer destructive column/table/function removal until a later release after app stability and client compatibility are established. A genuinely incompatible change needs an explicitly reviewed outage/data-recovery plan before promotion; don't claim additive rollback safety without evidence.

## Failure response

1. Stop dependent deployment steps and uncontrolled RC execution. Capture actual SQL migration state, each app's saved version, completed external steps and first failure. Keep integrity/calculation triggers intact. Investigate before retrying; a timeout doesn't prove an upgrade failed or authorize replaying a financial operation.
2. Choose the smallest recovery within existing scoped approval. If recovery or data loss exceeds it, explain the exact missing authority while continuing independent diagnosis. Preserve subsequent user writes and other tasks' work.
3. **SQL migrated; apps unchanged:** if the old apps remain compatible, leave additive SQL in place and stop app promotion. Fix in controlled development, make a new RC and retest. Don't restore the DB just to erase a successfully applied version.
4. **One or both apps upgraded:** use the captured versions and dependency-safe restore order from the release plan, or complete an already-approved safe forward fix. Check compatibility of the temporarily mixed app pair. Restore definitions using AppSheet's supported version restore into the same PROD IDs, never by copying current DEV or deleting/recreating PROD. A frozen RC is not edited in place.
5. **App restore:** verify saved versions, PROD sources/links/themes, production recipient configuration (no DEV-only overrides) and relevant recovery targets, both editor diagnostics and current-GUI load/sync/affected read-only flows. Restoration of an app definition does **not** reverse database schema, data changes, sent notifications or external side effects. Reconcile those separately; never describe app restore as a full database rollback.
6. **Database defect:** prefer a reviewed higher immutable Flyway forward-fix migration tested with affected app versions. Do not use ad-hoc destructive SQL, `clean`, `repair`, edited checksums or casual undo. Severe backup/PITR recovery requires explicit scope, verified restore point, write pause, treatment of newer transactions, compatible app definitions and the established database recovery procedure. Revalidate SQL/history/permissions, app consumers and scheduler ownership afterward.
7. Record the final actual state: Rolled back, partial/incomplete or forward-fixed. Update tracker, environment inventory, Development Changes, affected model records and all applicable documentation-checklist rows. If a release was reversed, reopen its differences accurately; don't delete successful deployment history or mark untested recovery passed. Publish evidence; never move an existing release tag to hide a rollback.

## Hotfix and emergency reconciliation

Normal hotfix: reserve the next Rnnn (mark it a hotfix and link the predecessor) → reproduce/reconcile the current PROD baseline in controlled DEV → implement/test → named new RC → PROD mappings/themes and containment → immutable freeze → authorized App Upgrade → validation/documentation/tag. Keep the project-wide numbering convention; don't invent `Rnnn.1` outside the tracker sequence.

If shared DEV already contains later features, preserve them and use an isolated development copy of the current production baseline for the hotfix. Integrate the fix back into main DEV and retest affected paths before its next RC. Independent feature copies must never be promoted sequentially as if App Upgrade merged them.

An unavoidable manual PROD edit is **emergency recovery only**, with explicit scoped authorization, exact before/after values and saved versions/evidence. Reconcile the change into DEV and Git immediately, before the next RC; record any remaining reconciliation as an explicit blocker to that candidate. SQL emergency changes must also be reconciled through reviewed migrations under the database procedure. Replace the emergency app state through a controlled RC release as soon as practical. Never make manual replication the normal promotion fallback.

## RC retention

Keep the frozen source identity/version and evidence while needed for recovery; ensure it cannot run production jobs/notifications or admit uncontrolled writes. Any operational containment change must be proven app-specific and leave frozen configuration intact. If it alters the definition, don't continue using that changed version as the approved RC. Record a retention/retirement decision before deleting an RC, preserving recoverable evidence and shared assets. DEV refresh cleanup never includes active/frozen RCs or PROD apps.

The [scheduled-bot guard](Release_Workflow.md#scheduled-bot-execution-guard) remains part of the frozen definition: the retained RC's internal name is excluded, so no post-release bot disabling/edit is needed for guarded scheduled business work. Preserve this exclusion when restoring/copying definitions and never rename an RC to an allowed canonical name. Review restored guard coverage and pre-existing job states together; older PROD rollback versions may predate guard installation. The canonical PROD scheduler can continue under its recorded baseline, but any new recovery copy must be contained before it can execute. Platform alerts, external jobs and interactive writes remain separate controls.
