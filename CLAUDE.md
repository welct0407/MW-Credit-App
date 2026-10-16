@AGENTS.md

## Claude Code only

These additions apply to Claude Code; `AGENTS.md` above is shared with Codex and stays the source of project rules.

- In a Claude Code cloud session this repository (`welct0407/MW-Credit-App`) is the only one needed; do not attach or clone sibling repositories. Tools come from [project/scripts/cloud-session-setup.sh](project/scripts/cloud-session-setup.sh); run `npm ci` at the repository root when the task needs it.
- Cloud sessions signed in to GCP as `codex-cloud` reach Azure for Terraform (as `mw-credit-unattended-admin`) on demand only: prefix the command with `scripts/azure-cloud-session.sh`, which mints a one-hour token for that command and removes it afterwards; no session hooks. See [unattended-admin](infrastructure/unattended-admin/README.md). VM-01 power: `scripts/vm01-power.sh start` (or `deallocate`, `restart`).
