# Project tooling

This directory owns project coordination, dictionary/release helpers and retained service tooling. Shared SQL runners/migrations are in the repository root; use [database/README.md](../../database/README.md). `MW_CREDIT_APP_ROOT` is only an override; the default is the repository root.

## Runtime

Reuse installed tools and the single root dependency junction. Use load_workspace_dependencies only when locating missing bundled Node/Python. After recovery, scripts/setup-dependencies.ps1 establishes the root junction and refuses to overwrite an existing installation. Do not create output-local dependencies or modify the shared Codex bundle.

Use supported pinned tools from the owning project. A routine task needs no reinstall, global runtime audit or test of every old helper. Review selected scripts' target/path/write effects before running.

## Current commands

- [Dictionary helper](dictionary/README.md): find/read/guarded update/index/validate.
- [Export Data Dictionary.cmd](Export%20Data%20Dictionary.cmd): local ignored Markdown export, no upload.
- [cloud-session-setup.sh](cloud-session-setup.sh): Claude Code cloud environment setup script (pinned Node/PowerShell/Flyway/PostgreSQL/Terraform, the Chromium build for the root's pinned Playwright and the dictionary's PyYAML; per-shell `MW_CREDIT_APP_ROOT` and optional `GCP_SA_KEY_B64` sign-in). Paste into the environment's Setup script; `mw-db-ci` then runs the root database CI as the unprivileged `postgres` user.
- [Release helper](releases/README.md): one compact promotion record, with only affected document links.
- Monitoring/Metabase tools follow their own runbooks. Prefer current Terraform/API routes; old one-off scripts are not operational instructions.

Generated sanitized evidence belongs in outputs/. sources/ is read-only. Preserve dependencies, secrets and unrelated work during cleanup.

## Credential maintenance

Use GCP Secret Manager and established workload/unattended identities first. Consult the owning infrastructure/access runbook before requesting a local password file or new credential. Never print secret payloads or commit secrets, state/plans, private exports or backups, even in ignored folders.

Temporary project exports belong in the current user's established private directory outside the repository. Preserve originals until consumer verification; never regenerate a lost recovery key. Leave application-managed sign-in stores in place. Record real recovery coverage when credentials change; folder existence is not backup proof.

## Recovery

Git restores published source and documentation. It does not restore private credentials, business databases or uncommitted files. Reuse the owning runtime setup, verify the affected read-only operation, then resume work. Keep the local checkout out of Drive sync.