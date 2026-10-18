@AGENTS.md

## Claude Code only

These additions apply to Claude Code; `AGENTS.md` above is shared with Codex and stays the source of project rules.

- In a Claude Code cloud session this repository (`welct0407/MW-Credit-App`) is the only one needed; do not attach or clone sibling repositories. Tools come from [project/scripts/cloud-session-setup.sh](project/scripts/cloud-session-setup.sh); run `npm ci` at the repository root when the task needs it.
- The PWA team workers are the Claude Code sub-agents defined in `.claude/agents/` (`archie`, `byte`, `chase`, `dewey`, `echo`, `forge`), each carrying its [roster](project/Documents/Rules/PWA_Orchestration.md#named-workers-started-once-per-session) role, default model and effort. Start a role once with the `Agent` tool using that definition as the agent type and the display name (for example `Archie (A — Architect)`), then continue that worker with `SendMessage` to its name for every later task in the session. Use `Agent` again for a role only to replace a worker the tool reports gone or to apply a [model/effort escalation](project/Documents/Rules/Model_Work_Mapping.md#claude-alternative) it cannot adopt; pass the escalated model and effort as overrides on that call, since the definition holds only the default.
- Cloud sessions signed in to GCP as `codex-cloud` reach Azure for Terraform (as `mw-credit-unattended-admin`) on demand only: prefix the command with `scripts/azure-cloud-session.sh`, which mints a one-hour token for that command and removes it afterwards; no session hooks. See [unattended-admin](infrastructure/unattended-admin/README.md). VM-01 power: `scripts/vm01-power.sh start` (or `deallocate`, `restart`).
