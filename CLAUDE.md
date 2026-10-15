@AGENTS.md

## Claude Code only

These additions apply to Claude Code; `AGENTS.md` above is shared with Codex and stays the source of project rules.

- In a Claude Code cloud session this repository (`welct0407/MW-Credit-App`) is the only one needed; do not attach or clone sibling repositories. Tools come from [project/scripts/cloud-session-setup.sh](project/scripts/cloud-session-setup.sh); run `npm ci` at the repository root when the task needs it.
- Cloud sessions signed in to GCP as `codex-cloud` are also signed in to Azure for Terraform (as `mw-credit-unattended-admin`) by the hooks in `.claude/settings.json`; see [unattended-admin](infrastructure/unattended-admin/README.md). VM-01 power: `terraform -chdir=infrastructure/ecosystem-azure-metadata apply -invoke=action.azapi_resource_action.vm01_start` (or `vm01_deallocate`, `vm01_restart`).
