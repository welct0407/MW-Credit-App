# ideaadmin independent development — 11 October 2026

Owner scope: remove Windows development dependencies on the MWCredit profile. The owner subsequently declined all copied old-profile data/history and requested cleanup of those copies. This changes local development paths only; no live runtime deployment or activation is authorized or performed.

Starting commit: `e3af92e0f00814ef69049d4bedfb2ae041f82418`. Updated 90 maintained files by substituting the Windows profile path with ideaadmin. SQL migrations, historical evidence and unrelated work are unchanged. No credential values are committed or migrated. Existing credentials available only in MWCredit require fresh setup before the affected live helpers can be used.

Changed files:
- `database/environments.json`
- `scripts/Invoke-DevDns.ps1`
- `scripts/Invoke-Terraform.ps1`
- `scripts/analysis/simulate_schedule_consistency.py`
- `scripts/configure-dev-read-role.py`
- `scripts/database/Backup-BorrowerPages.py`
- `scripts/database/Backup-BorrowerPayments.py`
- `scripts/database/Backup-DailySnapshots.py`
- `scripts/database/Backup-FocusedStatements.py`
- `scripts/database/Backup-Forecast.py`
- `scripts/database/Backup-OriginalDailyInterest.py`
- `scripts/database/Backup-Partners.py`
- `scripts/database/Backup-PaymentHealth.py`
- `scripts/database/Backup-PrincipalDailyInterest.py`
- `scripts/database/Backup-R015.py`
- `scripts/database/Backup-R047Production.py`
- `scripts/database/Backup-R048InterestProduction.py`
- `scripts/database/Backup-R048UpcomingProduction.py`
- `scripts/database/Backup-R049Production.py`
- `scripts/database/Backup-R051Dev.py`
- `scripts/database/Backup-R051Performance.py`
- `scripts/database/Backup-R051Production.py`
- `scripts/database/Backup-R051Receiving.py`
- `scripts/database/Backup-ReceiptInfrastructure.py`
- `scripts/database/Backup-ReceiptUpload.py`
- `scripts/database/Backup-SelectedCharges.py`
- `scripts/database/Backup-UpcomingCharges.py`
- `scripts/database/Backup-UpcomingDrilldown.py`
- `scripts/database/Backup-UpcomingSummary.py`
- `scripts/database/Common.ps1`
- `scripts/database/Document-DailySnapshots.mjs`
- `scripts/database/Document-DailySnapshots.py`
- `scripts/database/Inspect-R011.ps1`
- `scripts/database/Invoke-R006Lab.ps1`
- `scripts/database/Invoke-R009Lab.ps1`
- `scripts/database/Measure-R051Coverage.py`
- `scripts/database/Measure-R051DependencyReads.py`
- `scripts/database/Measure-R051DevPerformance.py`
- `scripts/database/Measure-R051DevReceiving.py`
- `scripts/database/Measure-R051Performance.py`
- `scripts/database/Measure-R051Receiving.py`
- `scripts/database/Measure-R051RelatedView.py`
- `scripts/database/Prepare-ReceiptProjector.py`
- `scripts/database/R051PerformanceGui.py`
- `scripts/database/R051ReceivingGui.py`
- `scripts/database/R051VmFixtures.py`
- `scripts/database/R051VmOptionalAssessment.py`
- `scripts/database/R051VmOriginalCleanup.py`
- `scripts/database/R051VmReadback.py`
- `scripts/database/R051VmRecoverDefaultFixture.py`
- `scripts/database/Read-R007.ps1`
- `scripts/database/Read-R007Refresh.ps1`
- `scripts/database/Seed-ReceiptEvidenceDev.py`
- `scripts/database/Snapshot-BusinessExpenses.ps1`
- `scripts/database/Snapshot-BusinessExpensesProduction.ps1`
- `scripts/database/Snapshot-ChargeGeneration.ps1`
- `scripts/database/Snapshot-DefaultLoan.ps1`
- `scripts/database/Snapshot-LoanClose.ps1`
- `scripts/database/Snapshot-MonitoredJobs.ps1`
- `scripts/database/Snapshot-R002.ps1`
- `scripts/database/Snapshot-R002Production.ps1`
- `scripts/database/Snapshot-R004.ps1`
- `scripts/database/Snapshot-R005.ps1`
- `scripts/database/Snapshot-R007.ps1`
- `scripts/database/Snapshot-R008.ps1`
- `scripts/database/Snapshot-R010.ps1`
- `scripts/database/Snapshot-VcMaterialization.ps1`
- `scripts/database/Test-AtomicLoanClosePreservation.ps1`
- `scripts/database/Test-BusinessExpensesBackup.ps1`
- `scripts/database/Test-BusinessExpensesProductionBackup.ps1`
- `scripts/database/Test-CorePaymentPreservation.ps1`
- `scripts/database/Test-MonitoredJobsPreservation.ps1`
- `scripts/database/Test-R002Backup.ps1`
- `scripts/database/Test-R002ProductionBackup.ps1`
- `scripts/database/Test-R004Backup.ps1`
- `scripts/database/Test-R005Backup.ps1`
- `scripts/database/Test-R007Backup.ps1`
- `scripts/database/Test-R008Backup.ps1`
- `scripts/database/Test-R010Backup.ps1`
- `scripts/database/Test-ReceiptEvidenceLab.ps1`
- `scripts/database/Test-VcBackup.ps1`
- `scripts/database/Verify-ChargeGenerationPreservation.ps1`
- `scripts/database/Verify-DefaultLoanPreservation.ps1`
- `scripts/database/Verify-R051Coverage.py`
- `scripts/database/Verify-R051Performance.py`
- `scripts/database/Verify-R051Receiving.py`
- `scripts/database/Verify-R051RelatedView.py`
- `scripts/database/Verify-R051VmPreservation.py`
- `scripts/database/application-role-cli.mjs`
- `scripts/database/application-role-provision-cli.mjs`

Verification: source-before comparison confirmed the profile substitutions; applicable PowerShell/Python/JSON syntax checks passed. A further guard makes `Invoke-Terraform.ps1 -Stack dev -Command plan` refuse missing `dev.activation.tfvars` before authentication or Terraform execution. The old approved activation file was deliberately not copied; silently omitting it would risk an incorrect desired-state plan. The missing-file check passed without any cloud call. Overall VM checks, runtime/dependency details and final database CI status are recorded in AppSheet-Loan-Project `Change Logs/CHANGE_NOTES_VM01_PROFILE_CLEANUP_2026-10-11.md`. Rollback: revert this commit's changes; current-repository before-images are retained privately in ideaadmin's maintenance folder. The original MWCredit profile remains untouched by deletion. Preserve its retired worker pause; no copied state is activated.

Closure: canonical database CI retry and PWA build passed. Updated the current private Terraform path in docs/Development.md, preserving other edits. Owner deferred remaining tool validation until after profile deletion; Azure controller local TypeScript dependencies still need installation/checking. No old private configuration or keys were retained.

## Linux cloud-session Terraform — 15 October 2026

Owner scope: make Terraform and its runners work from the Claude Code cloud environment so VM-01 is needed only for Azure. Starting commit `05800bf`.

- Every stack lockfile now also records the `linux_amd64` provider checksum (`terraform providers lock -platform=windows_amd64 -platform=linux_amd64`); versions are unchanged.
- `scripts/Invoke-Terraform.ps1` is one cross-platform runner for any `infrastructure/<stack>`: partial backends for `production`, `production-dns` and `production-state-bootstrap` are supplied at init; Cloudflare, Tailscale and Grafana credentials come from the same Secret Manager references as `Invoke-UnattendedAdmin.ps1`, in process only. Azure stacks and the parked local-state `production-bootstrap` are refused off Windows. `Invoke-DevDns.ps1` delegates to it. `Enter-Dev.ps1` selects Windows or Linux tools and sets `MW_PRIVATE_ROOT`; `scripts/grafana/manage.py` uses it and PATH tools on Linux.
- Activation variables (`<stack>.activation.tfvars`, non-secret) were lost with the old profile. `dev`, `production-state-bootstrap` and `production` were reconstructed from live state until each plan showed no changes, and are kept at `gs://<state bucket>/activation/` (runner `-PublishActivation`); the runner fetches them when the private copy is missing.

Checks from a Linux cloud session with the Owner service account, read-only: `init` and `plan` show **no changes** for bootstrap, dev, dev-dns, ecosystem-shared/bridge/debian/dns/tunnels/tailnet, network-operator-secrets, grafana-access, grafana (runner and `manage.py`), production-state-bootstrap production-dns and production (runner re-fetched its activation from the bucket). Grafana runner unit tests pass. In the PROD activation, `foundation_image` is a placeholder (earliest PROD registry digest): it is required but unused while business runtime is enabled, so it cannot affect the plan; the base/override image split is likewise plan-equivalent. No apply, import or state change. Recovery: revert this commit; the published activation objects are additive and can be deleted.

## Linux cloud-session database access — 15 October 2026

Owner-authorized (15 October 2026): DEV and PROD database access from the cloud environment without VM-01.

- Live changes: instance metadata `ssh-keys` on `vm-mw-credit-agent` gained `codex-cloud` (existing `welct0407` entries preserved; a project-wide copy that `gcloud compute ssh` added was removed, restoring the original three project keys); new Secret Manager secret `mw-credit-cloud-operator-ssh-key` v1; new IAM database user `codex-cloud@clever-oasis-508610-n7.iam` with `cloudsqlsuperuser`, then `GRANT postgres TO` it using the existing `mw-credit-ops-cloudsql-postgres-admin` credential. No authorized network, firewall, proxy or schema change.
- Source: `scripts/database/cloud-db-tunnel.sh`, pinned `debian-host-key.pub`; `Common.ps1` Linux route (tunnel, Secret Manager password file, `/workspace/.setup` tools, Linux Flyway/psql paths); `Invoke-Flyway.ps1` honours a target `sslmode`.
- Checks: guarded `Invoke-Flyway.ps1 validate` succeeds for development and production (93 validated each, V92); IAM user reads both databases; `scripts/database` runner-guard tests 17/17; PowerShell parse checks.
- Recovery: remove the `codex-cloud` metadata line, `REVOKE postgres FROM` and delete the IAM database user, delete the SSH secret; revert this commit.
