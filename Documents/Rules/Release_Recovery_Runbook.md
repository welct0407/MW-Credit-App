# PWA recovery and hotfix

Use only when deployment fails or recovery is requested. Record actions in the existing release record. This runbook does not authorize financial replay, data loss or reactivation of retired services.

## Recovery prepared with the change

Record the affected live baseline and a usable recovery target: previous Cloud Run image/revision, Hosting version, package and configuration/secret-version references. Check old/new API and schema compatibility where changed, including cached PWA clients. A file-only edit needs only its Git baseline.

For database changes retain a verified restorable backup and exact migration manifest under MW-Credit-App's database procedure. Prefer compatible additions; defer destructive removal until current and relevant older clients no longer need it. A prior version identifier is not proof an artifact or backup remains available.

## Failure response

1. Stop dependent rollout and capture the actual deployed versions, database history and first failure. Reconcile unknown outcomes before retrying.
2. Choose the smallest recovery within existing scoped authority. Preserve newer financial records, journals, queued work, identities and other tasks' changes.
3. **PWA/API regression:** restore the pinned previous Hosting/service artifacts and affected configuration in a compatible order, or use an already-authorized forward fix. Verify version/environment and affected read-only behavior once.
4. **Agent regression:** follow its catalogue/package recovery procedure; retain switches, cutoffs, accepted sends and journal state. Do not restore old queues or replay uncertain receipts/messages.
5. **Additive SQL succeeded:** leave compatible schema in place when rolling back the application. Do not restore the database merely to erase a migration version.
6. **Database defect:** use a reviewed higher immutable migration where safe. Backup/PITR restoration requires explicit scope, treatment of newer writes, a verified restore point and controlled writers. Never use clean/repair, edited checksums or ad-hoc destructive undo.
7. **Infrastructure failure:** inspect actual provider state before retry; use the reviewed configuration/plan or bounded recovery. Never blindly restore Terraform state or destroy shared SQL/storage. Record any necessary API exception and reconcile Terraform.
8. Record rolled back, partially applied or forward-fixed; update only changed records and publish evidence. Never move a tag to hide failure.

An application/package rollback does not undo SQL, financial transactions, sent notifications or external effects. Keep integrity triggers and one scheduler owner per job/environment.

## Hotfix

Reproduce the defect against the production baseline in an isolated checkout/DEV path, fix and run affected checks, then follow the short [promotion workflow](Release_Workflow.md). Preserve later DEV work and integrate the fix back. Frozen-release corrections keep that release number; new hotfix scope uses the sole Open release.

Emergency direct changes require scoped owner authority and exact before/after evidence. Reconcile them into source/Terraform or an immutable migration before the next affected release. Do not turn an emergency workaround into the normal delivery path.

AppSheet is not a fallback runtime. Its exceptional reactivation requires separate owner direction and the [retirement recovery record](../../outputs/r057-appsheet-retirement/README.md).
