# Repository merge — 15 October 2026

**Purpose.** One repository instead of three, so one checkout, one CI and one set of instructions serve the PWA, project records and integration agent.

**Owner decisions.** Layout: `project/` (former AppSheet-Loan-Project), root (MW-Credit-App, unchanged), `integration-agent/` (former MW-Integration-Agent). Repository name `welct0407/MW-Credit-App` and DEV/PROD deploy identity kept. Full history kept (`git subtree add`). Bulky evidence pruned per the retention rule.

**Scope.**
- Subtree imports and moves: `.claude/settings.json`, `.codex/config.toml`, `CLAUDE.md`, `.github/workflows/grafana-mcp-bridge.yml`, `.github/workflows/agent-tests.yml` (agent `ci.yml`).
- Code/workflow fixes (Agent B): `.github/workflows/agent-tests.yml`, `.github/workflows/grafana-mcp-bridge.yml`, `integration-agent/scripts/verify-reviewer-dml-restored.ps1`, `project/scripts/cloud-session-setup.sh`, `project/scripts/database-location.mjs`, `project/scripts/database_location.py`, `scripts/Enter-Dev.ps1`, `scripts/receipts/reconcile-native.mjs`.
- Documents (Agent D): merged root `AGENTS.md` (`project/AGENTS.md` removed), `CLAUDE.md`, `integration-agent/AGENTS.md`, Development_Workflow, Environment_Inventory, Development_Changes, document indexes, READMEs; cross-repository GitHub links converted to relative links.
- Evidence prune under `project/outputs/`: 59 files over 1 MB not referenced from `project/Documents`, `project/README.md` or `project/scripts` (127.9 MB) removed, mostly `r005-20260917` (33), `loan-ecosystem-*` (9), `dictionary-reconciliation-20260924` (4) and smaller single-file task folders. 20 referenced files kept. Historical change logs and other evidence untouched.

**Checks (Agent C, 15 October 2026).** `npm ci && npm run check` at the root: 426 tests pass (Node 24.21.0). `integration-agent`: `python -m unittest discover -s tests` 353 ran, 42 existing skips, 0 failures, same command as `agent-tests.yml`. All five workflows parse; both moved workflows carry `project/`/`integration-agent/` paths and keep pinned action SHAs. `database-location.mjs`/`database_location.py` resolve to the repository root without `MW_CREDIT_APP_ROOT`. No residual sibling-path logic in executable files. `terraform fmt -check` clean; no infrastructure or deploy identity change (Agent F). No E2E, database or deployment run: root application code is unchanged.

Link check: every relative link in current documents resolves except pre-existing `Data_Dictionary_ChatGPT.md` (local-only, ignored by Git) and `project/SERVICE_CATALOGUE.md` to the external MW-AI-Collection.

**Recovery.** Old repositories are untouched; this branch can be deleted; Git history holds the pruned files; nothing was deployed.

**Outcome.** Single repository ready to merge. Agents A and E returned not-applicable (settled design, no user-flow change). No release allocated (governance/documentation change).

**Debian cutover steps (Agent F; `*` = live production integration host, needs owner authorization).**
1. `*` On the host as root, generate a new ed25519 deploy key outside Git (beside the existing one, e.g. `/root/.ssh/mw-credit-app-deploy`); register its public key as a read-only deploy key on `welct0407/MW-Credit-App`. The old key stays on MW-Integration-Agent until verified. The current private key location is not recorded in `integration-agent/docs/OPERATIONS.md`; confirm it first.
2. `*` Clone with the new key into `/opt/mw-integration-agent-src.new` (full clone; `pip install -e` needs `integration-agent/pyproject.toml`).
3. Normal change in this repository: `integration-agent/scripts/update-from-github.sh` keeps `repo=/opt/mw-integration-agent-src`, `fetch --prune origin main` and `merge --ff-only origin/main`; docs/systemd references to `scripts/` become `integration-agent/scripts/`.
4. `*` Stop units; move the old checkout to `/opt/mw-integration-agent-src.old`, `.new` to the live path; `pip install -e /opt/mw-integration-agent-src/integration-agent` in the existing venv; restart units.
5. `*` Verify: `systemctl start mw-integration-agent-verify.service` (or the `check` CLI) succeeds and HEAD equals `origin/main`.
6. Rollback: swap `.old` back, reinstall `-e` from it, restart.
7. `*` After verification remove the old deploy key from MW-Integration-Agent and delete `.old`.
Record in `project/Documents/Environment_Inventory.md` (Debian entry), `integration-agent/docs/OPERATIONS.md` and this note. Also added `.dockerignore`/`.gcloudignore` entries so `project/`, `integration-agent/`, `outputs/` and `Change Logs/` stay out of the Docker and Cloud Build contexts (Agent F finding).

**Follow-ups.**
- Done 15 October 2026 (owner-authorized, after PR #11 merged as `1d5045ff`): new read-only deploy key generated on the host (`/etc/mw-integration-agent/git/github_deploy_key_mw_credit_app`, registered by the owner), MW-Credit-App `main` cloned, checkout swapped (`/opt/mw-integration-agent-src.old` retained), `update-from-github.sh` fast-forward verified, `mw-integration-agent-verify.service` ok, all units untouched. The installed package is not editable, so the deployed R058 runtime (`a8cf949`) is unchanged; later source commits remain undeployed as before.
- Remaining: remove the old deploy key from `MW-Integration-Agent` (GitHub UI) and delete `/opt/mw-integration-agent-src.old`; archive the two old repositories read-only (GitHub UI; repository-settings writes are blocked through the session proxy).
- Claude cloud environment: select only this repository and use the updated `project/scripts/cloud-session-setup.sh`.
- Optional `ci.yml` path filtering for `project/**` / `integration-agent/**` (not done; may be a required check).
- Re-apply document edits under `project/Documents/` from `claude/jolly-shannon-9p9p2c` (e2e fixes; 11 lines in the old `Documents/Development_Changes.md`) and `claude/gifted-noether-iszjkc` (`read-cache.ts` fix; small edits to the old `Development_Changes.md` and `Release_Tracker.md`) with `git diff master..branch -- Documents | git apply --directory=project`. Their root-file commits merge unchanged.
