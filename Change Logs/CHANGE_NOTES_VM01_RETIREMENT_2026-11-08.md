# Change notes — Azure VM-01 retirement, 8 November 2026

## Purpose
The owner asked on 8 November 2026 to delete the Azure VM-01 workstation to stop its recurring cost. Nothing in the live MW Credit setup ran on it. The VM was already deallocated, and the owner confirmed no files needed copying. The chat relay, receipt recognizer and borrower charts run on the GCP Debian VM `vm-mw-credit-agent` (`10.148.0.2`), which some documents mislabelled "VM-01".

## Changes
- Azure, `ecosystem-azure` root: destroyed the VM-01 backup protected item in `vm-backup-vault` (protection stopped, backup data deleted; the shared vault and EnhancedPolicy stay for VM02). Azure refuses extension changes on a deallocated VM (409 `OperationNotAllowed`), so `AADLoginForWindows` and `AzureMonitorWindowsAgent` were removed from state with `terraform state rm` and deleted together with the VM. `owned.tf` and `imports.tf` are deleted; the root declares no resources.
- Azure, `ecosystem-azure-metadata` root: destroyed VM `VM-01` and its three metric alerts (CPU, available memory, availability) from a saved plan (`0 to add, 0 to change, 4 to destroy`). `owned.tf`, `imports.tf` and `power.tf` are deleted; its state is empty.
- `infrastructure/unattended-admin/main.tf`: removed the Backup Contributor assignment on VM-01's deleted protected item. The UAMI, `codex-cloud-google` federation, Contributor/RBAC Administrator on `rg-mwcredit` and Reader on the vault stay.
- Grafana (`infrastructure/grafana`): removed the `mw-infra` Azure VM-01 row (panels 20 to 24) and the `mw-cost` chart 110 "VM-01 · running hours by day". Row 10 is retitled "Azure · residual cost (VM-01 deleted 8 November 2026)". The `mw-azure-monitoring` health check now reads resource group `rg-mwcredit` instead of the VM. Applied from a saved plan (`0 to add, 3 to change, 0 to destroy`).
- Dashboard builders `project/scripts/monitoring/dashboards/infra.cjs` and `cost.cjs` no longer generate those panels, so `build-dashboards.cjs` reproduces the applied JSON byte for byte.
- `scripts/vm01-power.sh` deleted. `scripts/azure-cloud-session.sh` and `scripts/Invoke-Terraform.ps1` no longer point to VM-01.
- Comments in `infrastructure/{dev,production}/receipt-recognizer.tf` now name the Debian VM rather than VM-01 (comment-only change).
- Documents: `CLAUDE.md`, `.claude/agents/forge.md`, `docs/Development.md`, `database/README.md`, the two Azure root READMEs, `infrastructure/unattended-admin/README.md`, `project/scripts/azure/vm01-controller/README.md`, Environment Inventory, Development workflow, VM-01 local storage rule, Service account browser mapping, Solution design (R122 relay host), Resource monitoring, its dashboard guide and the Grafana alert runbook.

## Checks
| Command | Result |
| --- | --- |
| `terraform plan` on `ecosystem-azure-metadata` and `ecosystem-azure` before any change | Both matched Azure; VM-01 reported `VM deallocated` |
| ARM resource listing for the operator (subscription scope) | Only VM-01 resources, the shared vault, the UAMI and `samwcreditbackupstaging` (one container from the 12 September VM-01 restore) were visible |
| `terraform apply` `ecosystem-azure` saved plan (backup item and extensions) | Backup item destroyed in 1 min 3 s; both extensions failed with 409 and were moved out of state |
| `terraform apply` `ecosystem-azure-metadata` saved plan | 4 destroyed: VM-01 and three alerts |
| `scripts/grafana/manage.py terraform … apply` saved plan, sha256 `328a6687…61f5` | 3 changed; first plan attempt hit transient Grafana 503s, re-plan was clean |
| `terraform plan` `ecosystem-azure` (empty configuration) | `0 to add, 0 to change, 6 to destroy`: disk, NIC, public IP, NSG, VNet, data collection rule |
| `node project/scripts/monitoring/build-dashboards.cjs --check`; `test_build_dashboards.cjs`; `test_cost_detail.cjs` | Pass: builder output equals the applied JSON; 5 dashboards, 196 jq programs compiled |
| `npm run check:docs`; `terraform fmt -check` on changed roots | Pass: 0 failures (4 old-note warnings); formatting clean |
| `terraform plan` `unattended-admin` | `0 to add, 0 to change, 1 to destroy`: `azurerm_role_assignment.backup_operator` |

## Not run
- `test_azure_power_history.cjs` fails with the same module-format error (`module is not defined in ES module scope`) before and after this batch; it is unrelated and was not fixed here.
- The `ecosystem-azure` six-resource destroy and the `unattended-admin` one-role destroy were planned but not applied: the session's auto-mode safety check refused both applies. They wait for the owner to run them or to allow them in Accept edits mode.
- `samwcreditbackupstaging` and `rg-vm01-controller` were not deleted. The storage account is outside Terraform. The operator has no role on the controller resource group.

## Recovery
VM-01 cannot be restored: its backup data was deleted with the protected item (it may sit in the vault's soft-delete for up to 14 days). Until the six-resource apply runs, the OS disk `vm01-osdisk-20260912-091515` still exists, so a VM could be recreated from it. Configuration recovery is the previous commit of this branch (Git history holds the deleted Terraform and `vm01-power.sh`). Grafana recovery is re-applying the previous dashboard JSON and data source definition from Git.

## Open questions
None.

## Remaining work
- Apply the reviewed `ecosystem-azure` destroy (6 resources), then check that a re-plan shows no changes.
- Apply the reviewed `unattended-admin` plan (removes 1 role assignment), then check that a re-plan shows no changes.
- Delete storage account `samwcreditbackupstaging` (restore staging for VM-01 only).
- Owner: delete resource group `rg-vm01-controller` (VM-01 controller Function App and its resources) in the Azure portal. Optionally remove the unused Grafana data source `mw-azure-vm-control` and its Entra app `grafana-vm-control`.
