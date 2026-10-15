# Independent review — overall (cross-cutting) — 15 October 2026

Baseline 0995868. Scope: cross-cutting architecture, delivery/CI, `infrastructure/`, monitoring/cost/third parties, evidence privacy and standardization. Component detail lives in the three component notes:

- App: `Change Logs/CHANGE_NOTES_REVIEW_APP_2026-10-15.md`
- Database: `Change Logs/CHANGE_NOTES_REVIEW_DATABASE_2026-10-15.md`
- Agent: `integration-agent/Change Logs/CHANGE_NOTES_REVIEW_AGENT_2026-10-15.md`

This note does not repeat their findings. It refers to their areas by name (for example "App: authentication", "Database: access model", "Agent: R063 receiver").

Method:
- Read the entry files of every runtime (Node services, agent clients, Terraform roots), the five workflows, Dockerfile, Cloud Build files and promotion script headers.
- Ran `terraform fmt`, `init -backend=false` and `validate` for all 19 roots.
- Ran bounded read-only readbacks: project IAM for `codex-cloud`, its key list (ids and dates only), firewall rules, the Debian disk snapshot policy, Cloud Monitoring uptime checks and alert policies, billing linkage, GitHub branch protection and recent CI runs, and three lines of the Debian `sshd` configuration.
- Ran two trial linters in the scratchpad only (TypeScript `checkJs` over `services/`, ruff over the agent).
- Ran a bounded privacy scan of evidence directories.

Read-only. No source, DEV, Debian or PROD change. No `terraform plan` or `apply`.

Tool limitation (stated once for the whole review): review workers run as Claude Opus/Sonnet family at the effort chosen by the orchestrator. The exact model ids in `Model_Work_Mapping.md` cannot be selected from the Agent tool.

## Checks executed

| Check | Command | Result |
| --- | --- | --- |
| Terraform format | `terraform fmt -check -recursive infrastructure` | exit 0, no files listed |
| Terraform init/validate, 19 roots | `TF_DATA_DIR=<scratch> terraform -chdir=infrastructure/<root> init -backend=false -input=false -lockfile=readonly` then `validate` | all 19 roots: init 0, validate "Success! The configuration is valid." (roots: bootstrap, dev, dev-dns, ecosystem-azure, ecosystem-azure-metadata, ecosystem-bridge, ecosystem-debian, ecosystem-dns, ecosystem-shared, ecosystem-tailnet, ecosystem-tunnels, grafana, grafana-access, network-operator-secrets, production, production-bootstrap, production-dns, production-state-bootstrap, unattended-admin). `.terraform` was kept in the scratchpad; the repository tree did not change. |
| `codex-cloud` project roles | `gcloud projects get-iam-policy … --filter='bindings.members:codex-cloud@'` | `roles/owner`, `projects/…/roles/codexCloudVmLookup` |
| Project Owner members | same, `--filter='bindings.role=roles/owner'` | 3 members: `codex-cloud` SA, `mw-credit-unattended-admin` SA, one human user |
| `codex-cloud` user-managed keys | `gcloud iam service-accounts keys list --managed-by=user` | 2 keys, created 2026-10-01 and 2026-10-15, both expire 9999-12-31 |
| Firewall rules | `gcloud compute firewall-rules list` | `default-allow-ssh 0.0.0.0/0 tcp:22`, `default-allow-rdp 0.0.0.0/0 tcp:3389`, `default-allow-icmp`, `default-allow-internal`, `allow-ssh-iap-mw-integration-agent 35.235.240.0/20` |
| Debian disk snapshot policy | `gcloud compute disks describe vm-mw-credit-agent` / `resource-policies describe default-schedule-1` | attached `default-schedule-1`; daily 07:00 UTC, 14-day retention |
| Debian SSH daemon | `mw-debian-ssh 'grep … /etc/ssh/sshd_config …'` | `PasswordAuthentication no`, `KbdInteractiveAuthentication no`, `PermitRootLogin no` |
| Cloud Monitoring | `gcloud monitoring uptime list-configs`; `gcloud monitoring policies list` | 1 uptime check (`MW webhook external health`, `/health`, 300 s); **0** alert policies |
| Billing | `gcloud billing accounts list`; `gcloud billing projects describe clever-oasis-508610-n7`; `gcloud billing budgets list` | 0 accounts visible; project linked, billing enabled; budgets: permission denied (and Budget API disabled) |
| Branch protection | `gh api repos/welct0407/MW-Credit-App/branches/main/protection`; `…/rulesets` | "Branch not protected" (404); 0 rulesets |
| Repository visibility | `gh api repos/welct0407/MW-Credit-App --jq .visibility` | `public` |
| Main CI history | `gh run list --workflow=ci.yml --branch=main --limit 8` | 8 of 8 `failure` (latest on 0995868); last green 2026-10-14T17:41Z. Run 38763869056: 438 passed, 1 failed, 11 skipped |
| Services type-check trial | scratch `tsconfig` with `allowJs`, `checkJs`, `strict:false` over `services/**/*.mjs` | 81 diagnostics in 34 of 104 files (42 TS2339, 22 TS2345, 11 TS2550, 4 TS2554) |
| Agent lint trial | `ruff 0.14.0 check --isolated --statistics integration-agent/src` | 356 findings: 268 E701 and 70 E702 (one-line style), 15 F401 unused imports. With `--select E9,F63,F7,F82,F401,F841,B`: 23 (15 F401, 5 B905, 3 B023) |
| Evidence size | `du -sh project/outputs outputs integration-agent/outputs` | 155 MB / 69 MB / 604 KB |
| Files over 1 MB | `find … -size +1M` | project/outputs 20; outputs 0; integration-agent/outputs 0 |
| Thai-mobile-shaped numbers | `grep -rlIE '(^\|[^0-9])0[689][0-9]{8}([^0-9]\|$)\|\+66[0-9]{9}'` | 12 files in project/outputs, 6 in outputs, 0 in integration-agent/outputs (160 files without the digit boundary) |

## Checks not run

| Check | Reason |
| --- | --- |
| `terraform plan` / `apply` | Forbidden in this review; needs remote state and authority. |
| `terraform test` (6 `.tftest.hcl` files) | The tests run plan commands (with mocked providers); the review rule forbids running plan. Recorded as a CI gap instead (ALL-CI-03). |
| Railway / Metabase inspection | Outside this review's authority (owner decision, ALL-MON-03). |
| Billing cost figures | `codex-cloud` cannot read the billing account. |
| Full image/workbook privacy classification | Bounded scope: one image opened and classified; 474 images and 36 workbooks remain unclassified (ALL-PRIV-02). |

## Findings

### Architecture

#### As-implemented component map

| # | Component | Runtime / entry | Callers and protocol | Caller authentication | Runtime identity | Data stores |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | PWA | Firebase Hosting (`dev-lm` / `lm.mw-credit.com`), `apps/pwa/src` | Browser → HTTPS JSON to reader and command | Firebase ID token (Google sign-in) | user | IndexedDB (offline queue, datasets, receipt blobs), Cache Storage |
| 2 | Reader DEV | Cloud Run `mw-credit-app-read-dev`, `services/api/dev-read-server.mjs` (`infrastructure/dev/read-service.tf:31`) | PWA → HTTPS GET | Firebase ID token, app-level only (`invoker_iam_disabled`, ingress all, `read-service.tf:18-19`) | `mw-credit-app-read-dev` SA, IAM DB auth | `loan_manager_dev` |
| 3 | Command DEV | Cloud Run `mw-credit-app-command-dev`, `services/payment-command/dev-server.mjs` (`command-service.tf:71`) | PWA → HTTPS; agent → HTTPS | Firebase uid-pinned single owner (`dev-server.mjs:34`); agent: Google OIDC | command SA, IAM DB auth | `loan_manager_dev`, GCS receipts |
| 4 | Reader / Command PROD | Cloud Run `mw-credit-app-{read,command}-prod`, `services/production/business-server.mjs` (`production/runtime.tf:105`) | PWA → HTTPS; agent → HTTPS | Firebase + SQL membership policy (`business-runtime.mjs:24-25`); agent: Google OIDC (`agent-conversations/policy.mjs:31-43`) | per-role SA, IAM DB auth (`runtime.tf:130`) | `loan_manager_prod`, GCS receipts |
| 5 | Notify / jobs workers (DEV and PROD) | Cloud Run `mw-credit-app-{notify,jobs}-{env}`, `services/workers/server.mjs` (`modules/dev-workers/main.tf:202`) | Command → POST `/internal/dispatch` (`notifications/postcommit.mjs:20-27`); Cloud Scheduler → POST ticks (`main.tf:270-293`) | Google OIDC (`invoker_iam_disabled=false`, `main.tf:178`; jobs ingress internal only, `:177`) | worker SAs, IAM DB auth | business DB, Web Push endpoints |
| 6 | Integration agent | Debian VM `vm-mw-credit-agent`, systemd units, `integration-agent/src` | Instagram/Meta → Cloudflare tunnel → loopback webhook; agent → command API | Meta HMAC (inbound); metadata-server ID token to command (`receipt_api.py:87-93`, `conversation_api.py:62-71`) | `mw-integration-agent` SA | `mw_agent` DB; **direct** `loan_manager_prod` DML and relay with password roles (`conversation_dml.py:55-72`, `outbox.py:12-18`) |
| 7 | Cloud SQL | `appsheet-pg-prod-20260914`, PG 18, `db-f1-micro`, PD_HDD 10 GB, zonal (`ecosystem-shared/owned.tf:35-51`) | All of the above | IAM DB auth (Cloud Run); passwords (Debian proxy, VM-01 Flyway) | — | `loan_manager_dev`, `loan_manager_prod`, `mw_agent` |
| 8 | Receipts bucket | `mw-payment-receipts-prod-508610-n7`, private, uniform access (`owned.tf:129-142`) | Command services, agent | IAM | — | GCS |
| 9 | Grafana Cloud + events bridge | Grafana stack; Cloud Run `mw-grafana-events` + Firestore (`ecosystem-bridge/owned.tf:300-316`) | Grafana → bridge → OpenAI Dots route | bridge HMAC/OAuth secrets in Secret Manager | bridge SAs | Firestore |
| 10 | Metabase | Railway (outside Terraform) | Owner browser | Metabase accounts | `metabase_borrower_reader` DB login | `loan_manager_prod` (read), Railway PostgreSQL |
| 11 | Operators | Claude cloud session (`codex-cloud`, SA key), Azure VM-01 (UAMI), GitHub Actions WIF (`deploy-dev.yml:24-27`) | gcloud / Terraform / IAP SSH / Flyway | SA key; Azure→GCP federation; GitHub OIDC | `codex-cloud` (Owner), `mw-credit-unattended-admin` (Owner), `mw-credit-app-deploy` | everything |

Business logic placement is mostly consistent. SQL owns money: triggers, allocation, cash and integrity (Database note). Node owns authentication, validation, idempotency and receipt handling. The PWA owns offline queueing only. The agent is the exception (ALL-ARCH-02).

#### ALL-ARCH-01 DEV and PROD run different command compositions
- **Type**: arch
- **Severity**: S3
- **Confidence**: confirmed
- **Evidence**:
  - DEV runs `services/payment-command/dev-server.mjs` (`infrastructure/dev/command-service.tf:71`). It uses `createDevCommandStore` (no `principalAllowed`/`resolveActor`, default draft mode; `store.mjs:336-338`), `createDevCommandHandler`, a uid-pinned single-owner verifier (`dev-server.mjs:34`, `principal.mjs:4-6`) and `createDevNotificationHandler`.
  - PROD runs `services/production/business-runtime.mjs` (`production/runtime.tf:105`). It uses `createEnvironmentCommandStore` with membership policy and `draftMode:'production-business'` (`store.mjs:341-344`), `createEnvironmentCommandHandler` and `notificationHandler`.
  - The R060 PROD outage was a `production-business` veto that DEV could not exercise (`project/Documents/Development_Changes.md:75`).
- **Impact**: Code paths that only PROD runs reach users without DEV proof. The second user's (non-owner) path is never exercised in DEV.
- **Recommendation**: Run DEV command and reader from `business-server.mjs` with DEV config (`APP_ENV=dev`, DEV membership policy, DEV origins). Then retire `dev-server.mjs` and `dev-read-server.mjs`. Until then, list "PROD-only branches" in the PR template so each release checks them.
- **Effort**: L
- **Needs**: infra change

#### ALL-ARCH-02 The agent writes PROD financial tables directly, outside the command API
- **Type**: arch
- **Severity**: S3
- **Confidence**: likely
- **Evidence**:
  - `integration-agent/src/mw_integration_agent/conversation_dml.py:18-19` allows DML on 9 tables, including `Payments`, `Charges`, `Cash Ledger` and `Settlements`.
  - `:55-72` connects as `mw_reviewer_dml` with a password file, hard-coded to `loan_manager_prod`.
  - `outbox.py:12-18` connects as `mw_agent_relay`, also PROD-only.
  - Solution design says "PWA and agent payments converge on native API/SQL command handling" (`project/Documents/Solution_Design.md:18`).
  - The agent also keeps its own protected-field list (`conversation_schema.PROTECTED_FIELDS`, imported at `conversation_dml.py:13`).
- **Impact**: There are two write paths into money tables with different authentication, idempotency and audit mechanisms. The direct path has no DEV target, so it cannot be tested before PROD. SQL triggers still guard integrity (Database note).
- **Recommendation**: Owner decision. Either (a) document reviewer DML as an approved second path in Solution_Design and add a DEV target (config `database_name` = `loan_manager_dev`, `mw_reviewer_dml_dev`), or (b) move reviewer edits behind a command-API operation. Option (a) is the smallest change.
- **Effort**: M (a) / L (b)
- **Needs**: owner decision

#### ALL-ARCH-03 Three database authentication styles and three secret stores
- **Type**: arch
- **Severity**: S3
- **Confidence**: likely
- **Evidence**:
  - Cloud Run uses IAM database auth (`business-server.mjs:10`, `runtime.tf:130`).
  - The Debian agent uses passwords from plaintext files (`config.py:206-212` `load_secret`): `database_dml_password_file`, `agent_database_relay_password_file`, `agent_database_worker_password_file`, `receipt_projector_password_file`.
  - VM-01 Flyway uses Windows password files (Database note: backup and secrets).
  - Secrets therefore live in Secret Manager, in `/etc/mw-integration-agent/secrets` on Debian, and in Windows files.
- **Impact**: Rotation, audit and disaster recovery differ per store. A Debian disk snapshot (ALL-INFRA-04) carries the password files.
- **Recommendation**: Switch the Debian Cloud SQL proxy to `--auto-iam-authn` with per-role IAM users, or one VM service account. That removes the four database password files. Keep Meta/Graph tokens in files for now.
- **Effort**: M
- **Needs**: infra change

#### ALL-ARCH-04 One small shared Cloud SQL instance carries DEV, PROD and agent state
- **Type**: arch
- **Severity**: S3
- **Confidence**: likely (configuration confirmed; load impact not measured here)
- **Evidence**: `infrastructure/ecosystem-shared/owned.tf:35` ZONAL, `:43-44` 10 GB PD_HDD, `:51` `db-f1-micro`, `:90-91` `max_connections=200`. It holds `loan_manager_dev`, `loan_manager_prod` and `mw_agent` (Grafana runbook: "An instance action can affect all three").
- **Impact**: DEV migrations, rehearsals and tests share one shared-core CPU and about 0.6 GB RAM with PROD. A zonal outage or maintenance takes everything down. Database: performance has the readback.
- **Recommendation**: Owner decision on one of: (a) move to `db-g1-small` or a 1 vCPU custom tier with SSD (smallest change, in-place, with a short restart); (b) a separate DEV instance. Keep zonal; regional HA is not proportional for two users.
- **Effort**: S (a) / M (b)
- **Needs**: owner decision, infra change

#### ALL-ARCH-05 Foundation-era DEV API is still deployed and is the only CI-deployed service
- **Type**: arch
- **Severity**: S4
- **Confidence**: confirmed
- **Evidence**:
  - `infrastructure/dev/main.tf:163-181` defines `mw-credit-app-api-dev` (ingress all, max 2 instances).
  - `.github/workflows/deploy-dev.yml:39` deploys only that service.
  - `scripts/verify-dev.mjs:3` probes it.
  - `Dockerfile:9` and `package.json` `start` default to `services/api/server.mjs`.
  - It is not in `project/Documents/Environment_Inventory.md` (DEV reader/command/workers only).
- **Impact**: This is an unused attack and maintenance surface. The only automated deployment targets a service that nothing uses.
- **Recommendation**: Confirm there is no consumer (Cloud Run request count). Then remove the service, `deploy-dev.yml`, `verify-dev.mjs` and the `start` script. Leave the Dockerfile `CMD` unset, because Terraform always sets `args`.
- **Effort**: S
- **Needs**: infra change

#### ALL-ARCH-06 Server image ships frontend packages
- **Type**: arch
- **Severity**: S4
- **Confidence**: confirmed
- **Evidence**:
  - `package.json` lists `firebase`, `react` and `react-dom` under `dependencies`. `Dockerfile:4` runs `npm ci --omit=dev`, so they are installed.
  - `grep -rhoE "from ['\"](firebase|react|react-dom|web-push)[/'\"]" services` returns no match. Services import only `firebase-admin/*`.
  - `du`: `node_modules/firebase` 54 MB, `react-dom` 7.9 MB.
- **Impact**: About 62 MB of dead weight per image. It also widens the `npm audit` surface for the server.
- **Recommendation**: Move `firebase`, `react` and `react-dom` to `devDependencies` (Vite bundles them). `web-push` is covered by App: notifications.
- **Effort**: S
- **Needs**: none

#### ALL-ARCH-07 PROD workers use a module named `dev-workers`
- **Type**: std
- **Severity**: S4
- **Confidence**: confirmed
- **Evidence**: `infrastructure/production/workers.tf:22-23` `source = "../modules/dev-workers"`. The module branches on `var.environment == "prod"` (`modules/dev-workers/main.tf:168`).
- **Impact**: The name misleads reviewers of PROD plans.
- **Recommendation**: Rename the directory to `modules/workers` and update both `source` lines. Resource addresses do not change (the module call name stays `workers`), so the plan shows no change.
- **Effort**: S
- **Needs**: none

#### ALL-ARCH-08 AppSheet-era residue: keep or retire
- **Type**: arch
- **Severity**: S4
- **Confidence**: confirmed
- **Evidence**: instance name `appsheet-pg-prod-20260914` (`owned.tf:20`); quoted-space tables and `"Row ID"` text keys (11 quoted-space tables in migrations); `money` columns and `appsheet_ref_*` constraints (Database note: schema hygiene); AppSheet editor evidence in `project/outputs` (ALL-PRIV-03).
- **Impact**: Confusion for new readers. A rename would cost far more than it is worth.
- **Recommendation**: Keep the instance name, `Row ID`, quoted names and constraint names (renaming the instance needs a new instance). Retire later: `money` → `numeric` only if a calculation bug appears (Database note). Retire now: AppSheet editor screenshots and app-model evidence, with their one-off scripts (ALL-PRIV-03). Add one "naming legacy" line to `database/README.md`.
- **Effort**: S (document) / L (any rename)
- **Needs**: owner decision

### Delivery and CI

Workflows: `ci.yml` (check, build, audit, e2e on main push or `ci:checkpoint` label, Terraform for 2 roots); `database.yml` (windows-latest migration rebuild plus Linux runner-guard unit tests); `agent-tests.yml` (Python 3.13 unittest, no lint); `deploy-dev.yml` (manual, legacy API only); `grafana-mcp-bridge.yml`. Hosting and Cloud Run delivery to DEV and PROD is operator-driven: Cloud Build files plus `scripts/deploy-hosting.mjs`, `scripts/promotion/deploy-business-hosting.mjs` and Terraform. That is proportionate for two users. The findings below are the gaps.

#### ALL-CI-01 `main` is red and nothing stops merges
- **Type**: risk
- **Severity**: S3
- **Confidence**: confirmed
- **Evidence**:
  - `gh run list --workflow=ci.yml --branch=main --limit 8` gives 8/8 failure, including baseline 0995868. The last success was 2026-10-14T17:41Z.
  - Failing tests rotate: `phase5-final-ui-independent.spec.ts:257` (P6 T9), `payment-command.spec.ts:39` (G06), `back-consumers-independent.spec.ts:194`. Run 38763869056: 438 passed, 1 failed.
  - Branch protection: "Branch not protected"; rulesets 0.
  - `playwright.config.ts` sets no `retries`.
  - An earlier red streak lasted from R061 to R063 (`Development_Changes.md:26`).
- **Impact**: Regressions and flakes are indistinguishable. Red main is normal, so a real failure is not noticed. App: tests owns the individual specs.
- **Recommendation**: (1) Set `retries: process.env.CI ? 1 : 0` so flakes report as "flaky", not failed. (2) Mark the three known flakes `test.fixme` with a one-line reason until fixed. (3) Add one ruleset on `main` requiring the `ci.yml` `test` check. No reviewer requirement.
- **Effort**: S
- **Needs**: none

#### ALL-CI-02 Browser tests run after merge, not before
- **Type**: risk
- **Severity**: S3
- **Confidence**: confirmed
- **Evidence**: `.github/workflows/ci.yml:25-28`: e2e runs only on push or when the `ci:checkpoint` label is added. Plain PR events skip it.
- **Impact**: UI regressions land on main first (ALL-CI-01).
- **Recommendation**: Run e2e on PRs that touch `apps/pwa/**`, `tests/e2e/**` or `playwright.config.ts`, using a `dorny/paths-filter`-style step or a second job with `paths`. Keep label-only for docs and backend PRs. The run takes about 12 min (run 38763869056).
- **Effort**: S
- **Needs**: none

#### ALL-CI-03 Terraform CI covers 2 of 19 roots and runs no Terraform tests
- **Type**: risk
- **Severity**: S3
- **Confidence**: confirmed
- **Evidence**:
  - `ci.yml:33-36` validates only `dev` and `dev-dns`.
  - Six `.tftest.hcl` files (`infrastructure/{dev,production,production-bootstrap,production-state-bootstrap}/tests`) use `mock_provider` but no workflow runs `terraform test`.
  - Local run: all 19 roots validate clean (Checks executed).
- **Impact**: A broken `production` or `ecosystem-*` root is found only at operator plan time.
- **Recommendation**: Add a matrix job over the 19 roots: `init -backend=false -lockfile=readonly` plus `validate`, with a provider plugin cache. Add `terraform test` for the four roots with tests. These need no cloud credentials.
- **Effort**: S
- **Needs**: none

#### ALL-CI-04 No lint, format or type check outside the PWA (proportionate toolchain proposal)
- **Type**: std
- **Severity**: S4
- **Confidence**: confirmed
- **Evidence**:
  - `tsconfig.json` `include: ["apps/pwa/src"]`. 104 `services/**/*.mjs` files and the e2e specs are never type-checked.
  - There is no lint or format configuration anywhere. 136 lines over 400 characters in `services/`.
  - Trial `checkJs` (non-strict): 81 diagnostics in 34 files, for example TS2554 at `services/api/dev-read-handler.mjs:32` and TS2345 at `services/business/record-lists.mjs:17`.
  - Trial ruff on the agent: 15 unused imports and 3 B023 (loop-variable closures) among the bug-class rules. The other 338 findings are one-line-statement style.
- **Impact**: Wrong-argument and undefined-property bugs in services are found only by tests. The dense style makes review harder.
- **Recommendation**: Sized for a two-user app, no enterprise process. Three steps, each independent:

  | Step | Tool | Scope | Effort |
  | --- | --- | --- | --- |
  | 1 | `tsconfig.services.json` with `allowJs`, `checkJs`, `strict:false`, `include: services/**/*.mjs`; add `tsc -p tsconfig.services.json` to `npm run check`. Fix or `// @ts-expect-error` the 81 diagnostics. | services | M |
  | 2 | `ruff check --select E9,F,B` in `agent-tests.yml` (no formatter). Fix 15 F401 and review the 3 B023. | agent | S |
  | 3 | Optional: Biome (one binary, lint and format) for TS/JS, lint-only at first with formatting off. Format later in one commit listed in `.git-blame-ignore-revs`. | PWA, services, e2e | S to add, M to format |

  Skip ESLint plus Prettier (two tools and more config). Skip mypy.
- **Effort**: M overall
- **Needs**: none

#### ALL-CI-05 Inconsistent action pinning, including in the job that holds deploy credentials
- **Type**: risk
- **Severity**: S3
- **Confidence**: confirmed
- **Evidence**:
  - `ci.yml:16-17,29` and `deploy-dev.yml:16-17,24,28` use tags (`@v4`, `@v3`). `deploy-dev.yml:4-6` has `id-token: write` and WIF to `mw-credit-app-deploy`.
  - `agent-tests.yml:25,30`, `database.yml:16,51` and `grafana-mcp-bridge.yml:18,20` pin commit SHAs.
- **Impact**: A moved tag in a third-party action could run with the deploy identity. The risk is small but avoidable.
- **Recommendation**: Pin all actions to SHAs with a version comment. If ALL-ARCH-05 retires `deploy-dev.yml`, `ci.yml` remains the only file to pin.
- **Effort**: S
- **Needs**: none

#### ALL-CI-06 Database and bridge workflows run twice per PR commit on Windows runners
- **Type**: std
- **Severity**: S4
- **Confidence**: confirmed
- **Evidence**:
  - `database.yml:3-7` triggers on `push: branches: ['**']` and on `pull_request`. `grafana-mcp-bridge.yml:2-7` does the same.
  - `gh run list --workflow=database.yml` shows commit 01c1067 run for both `push` and `pull_request`.
  - Both use `windows-latest` jobs (`database.yml:13`, `grafana-mcp-bridge.yml:39`).
- **Impact**: Queue time is doubled. Minutes are free while the repository is public, but would bill at the Windows rate if it becomes private (ALL-PRIV-01). The Linux early return is covered in Database: test coverage and CI.
- **Recommendation**: Limit `push` to `main` (as `agent-tests.yml:7-9` does) and add a `concurrency` group with `cancel-in-progress`.
- **Effort**: S
- **Needs**: none

#### ALL-CI-07 Promotion tooling grows a branch per release
- **Type**: std
- **Severity**: S4
- **Confidence**: confirmed
- **Evidence**:
  - `scripts/promotion/*.mjs`: `grep -oh "R0[0-9][0-9]"` counts R053×19, R054×3, R059×4, R061×5, R062×41.
  - `ui-hosting-plan.mjs:9` hard-codes release R054 and a commit.
  - `deploy-business-hosting.mjs` is 41 KB and supports schemaVersion 2 and 3 per release (`scripts/promotion/README.md`).
  - There are four Cloud Build files (`cloudbuild.yaml` has no smoke step).
  - `scripts/deploy-hosting.mjs` is a separate hand-written Firebase Hosting REST client for DEV.
- **Impact**: Every release adds code that later releases must keep passing. That is a cost on each promotion.
- **Recommendation**: Keep one manifest-driven Hosting runner for DEV and PROD and one image-build config with the smoke step. Delete the R053/R054 and foundation paths once their recovery pins are superseded (Environment_Inventory already lists current pins).
- **Effort**: M
- **Needs**: none

#### ALL-CI-08 Browser tests write into tracked evidence files
- **Type**: bug
- **Severity**: S4
- **Confidence**: confirmed
- **Evidence**:
  - 21 files in `tests/e2e` write to `outputs/r052-*` (for example `'outputs/r052-phase5-completion'`).
  - After the App worker's e2e run in this container, `git status` shows 63 modified tracked files under `outputs/` (r052-loan-read 19, r052-phase6 17, r052-phase5-completion 10, …).
- **Impact**: Every local run dirties the tree. Agents must then avoid committing binary churn, and AGENTS asks them to preserve "pre-existing uncommitted work" that is really test output.
- **Recommendation**: Write screenshots to `test-results/` (already ignored). Remove the tracked `outputs/r052-*` captures, or keep a single reference set that is never overwritten.
- **Effort**: S
- **Needs**: none

### Infrastructure

Positive: every root pins Terraform `= 1.16.5` and providers exactly (`google = 8.6.0`). Lockfiles are committed. `fmt` and `validate` are clean. Shared SQL, bucket, DNS, bridge and Debian resources carry `prevent_destroy`. The receipts bucket enforces public-access prevention. PROD services pin image digests by validation (`runtime.tf:10,28`). Cloud SQL public IP, authorized network, `connector_enforcement`, pg_cron flags, backups and PITR belong to the Database note (access model; backup and secrets) and are not repeated here.

#### ALL-INFRA-01 The cloud executor is a project Owner signed in with a non-expiring key
- **Type**: risk
- **Severity**: S3
- **Confidence**: confirmed
- **Evidence**:
  - Readback: `codex-cloud` has `roles/owner`, with 2 user-managed keys (created 2026-10-01 and 2026-10-15, expiry 9999-12-31).
  - The key is read from the environment variable `GCP_SA_KEY_B64` (`project/scripts/cloud-session-setup.sh:150-183`).
  - `codex-cloud` also holds Token Creator on `mw-credit-unattended-admin` (also Owner; `infrastructure/unattended-admin/main.tf:109-121`) and a federated credential into the Azure UAMI (Contributor and RBAC Administrator on `rg-mwcredit`; `main.tf:53-60`, `unattended-admin/README.md`).
  - The Owner binding of `codex-cloud` is not in any Terraform root (`grep -rn codex-cloud infrastructure` matches only `unattended-admin`).
  - The unattended-admin README says the design is keyless; the chain actually starts from this key.
- **Impact**: Anyone who reads the environment key controls the whole GCP project (PROD database, receipts, IAM) and the Azure resource group, indefinitely.
- **Recommendation**: (1) Identify which of the two keys the environment uses and delete the other. (2) Rotate every 90 days; set a calendar reminder rather than adding tooling. (3) Add the Owner binding to the `unattended-admin` root so it is visible and reviewable. (4) Owner decision: replace Owner with Editor plus `roles/resourcemanager.projectIamAdmin`, `roles/secretmanager.admin` and `roles/iam.serviceAccountTokenCreator`. This still covers Terraform work but removes billing and organization-level control.
- **Effort**: S (1-3) / M (4)
- **Needs**: owner decision

#### ALL-INFRA-02 SSH and RDP are open to the internet on the default network
- **Type**: risk
- **Severity**: S3
- **Confidence**: confirmed
- **Evidence**:
  - Readback: `default-allow-ssh 0.0.0.0/0 tcp:22` and `default-allow-rdp 0.0.0.0/0 tcp:3389`, neither in Terraform.
  - The Debian VM has external IP `136.85.96.197` on the `default` network (`ecosystem-debian/owned.tf:126-140`).
  - The dedicated IAP rule already exists (`owned.tf:168-189`). `sshd` is key-only (readback).
- **Impact**: The agent host (holding plaintext secrets, ALL-ARCH-03) is exposed to internet SSH scanning. Only key authentication protects it.
- **Recommendation**: Delete `default-allow-ssh` and `default-allow-rdp`; administrative SSH already uses IAP. Import the remaining default rules into `ecosystem-debian` or document them as intentionally external.
- **Effort**: S
- **Needs**: infra change

#### ALL-INFRA-03 The security-relevant configuration sits outside Terraform
- **Type**: risk
- **Severity**: S3
- **Confidence**: confirmed
- **Evidence**:
  - `ecosystem-bridge/README.md`: "Existing IAM policies/grants remain external".
  - Project Owner bindings (3 members), custom role `codexCloudVmLookup`, the default firewall rules (ALL-INFRA-02) and the uptime check `mw-webhook-external-health-*` (used by Grafana in `infrastructure/grafana/owned-services.tf.json`) are not declared in any root.
  - `grep google_monitoring infrastructure` returns nothing.
- **Impact**: Terraform's "verified no-change plans" (`Environment_Inventory.md:44`) say nothing about who can administer the project.
- **Recommendation**: Add `google_project_iam_member` for each Owner, the custom role and the uptime check (with `import` blocks) to an existing root such as `unattended-admin` or `ecosystem-shared`. Do not adopt every IAM binding; only Owner, Editor and custom roles.
- **Effort**: M
- **Needs**: infra change

#### ALL-INFRA-04 Debian VM protection and disaster-recovery gaps
- **Type**: risk
- **Severity**: S3
- **Confidence**: confirmed
- **Evidence**:
  - `ecosystem-debian/owned.tf:80` `deletion_protection = false`; only Terraform `prevent_destroy` guards it.
  - The snapshot schedule `default-schedule-1` (readback: daily 07:00 UTC, 14 days) is attached outside Terraform (`owned.tf:93` `resource_policies = []`; the policy appears only in `initialize_params` at `:116`).
  - `:158` uses scope `cloud-platform`; `:162` `enable_secure_boot = false`.
  - Snapshots include `/etc/mw-integration-agent/secrets` (Agent: credentials and host).
- **Impact**: Console or gcloud deletion is unguarded. Losing or changing the snapshot policy would go unnoticed. Anyone with snapshot read access gets the secrets.
- **Recommendation**: Set `deletion_protection = true`. Add `google_compute_disk_resource_policy_attachment` (import). Restrict `compute.snapshots.useReadOnly` to Owners, which is already the case if ALL-INFRA-01 is applied. Do one documented restore-to-new-VM rehearsal (Agent note owns the runbook).
- **Effort**: S
- **Needs**: infra change

#### ALL-INFRA-05 PROD API capacity: one instance, five requests
- **Type**: risk
- **Severity**: S4
- **Confidence**: hypothesis (no load observed)
- **Evidence**: `production/runtime.tf:96-101`: timeout 15 s, concurrency 5, max 1 instance. Pool `max:2` (`business-server.mjs:12`). Server `requestTimeout` is 20000 (`business-server.mjs:14`), which is longer than the Cloud Run timeout. Workers use max 1 and concurrency 1 (`modules/dev-workers/main.tf:193-198`).
- **Impact**: Offline-dataset traversal plus agent calls plus the second user can queue behind two DB connections. Requests over 15 s are cut by Cloud Run before the app's 20 s timeout. This is fine for two users today.
- **Recommendation**: Set `server.requestTimeout` to below 15 s (for example 14000) so the app, not the platform, returns the error. Revisit `max_instance_count = 2` only if Cloud Run 429s or latency appear (ALL-MON-01).
- **Effort**: S
- **Needs**: none

#### ALL-INFRA-06 Artifact Registry repositories keep every image
- **Type**: std
- **Severity**: S4
- **Confidence**: likely
- **Evidence**: `infrastructure/dev/main.tf:69` and `production/main.tf:77` define the app repositories without `cleanup_policies`. The bridge repository has one (`ecosystem-bridge/owned.tf:282-284`).
- **Impact**: Storage cost slowly grows with each build (several builds per release).
- **Recommendation**: Add a cleanup policy that keeps the 20 most recent versions plus any digest pinned in Environment_Inventory (`KEEP` by tag or most recent count).
- **Effort**: S
- **Needs**: infra change

### Monitoring, cost and third parties

What alerts today: one Grafana rule group with 10 rules (`infrastructure/grafana/owned-services.tf.json`; `Grafana_Alert_Troubleshooting_Runbook.md` section 3). They cover webhook external health, Debian components, Metabase, Cloud SQL connections/CPU/memory, Debian memory, Railway memory and OpenAI status. Cloud Monitoring has 0 alert policies (readback). No rule covers the PWA APIs, the notify/jobs workers, Hosting, Cloud SQL disk or backups, CI, or cost.

Last five releases: what failed, and would an alert have fired?

| Release | Failure mode (source) | Detected by | Alert? |
| --- | --- | --- | --- |
| R058 | Webhook receiver kept running pre-install code after the package update; inbound commands were not processed until a manual reload at 18:43 (`Environment_Inventory.md` Debian row; Agent: R063 receiver) | Owner noticed | No. `/health` returns a fixed string, so the external uptime check and the Debian `webhook_local` tile stayed healthy |
| R059 | Pre-release CI failures (cold 429/5xx references, draft ids, Back responses) (`Development_Changes.md` R059) | CI before freeze | Not applicable (caught pre-release) |
| R060 | PROD command store returned 403 for offline-dataset reads (production-business mode veto) (`Development_Changes.md:75`) | Owner (blank data) | No. No Cloud Run 4xx/5xx rule; the `oltp`/`olap` Debian probes use a machine identity and other routes |
| R061 | e2e failed on every `main` push from R061 to the R063 repair (`Development_Changes.md:26`) | Found during later work | No. No branch protection or CI notification route (ALL-CI-01) |
| R062 | (a) DEV V92 first apply failed on ownership and rolled back (guarded runner). (b) Language switch then navigation stranded screens with "Read changed during refresh"; this reached PROD (`Development_Changes.md:19-21`) | (a) runner guard; (b) testing after release | (a) not needed; (b) No. There is no client error signal |
| R063 | Open: carries (b) and receiver readiness | — | — |

Result: none of the four post-release failures would have produced an alert.

#### ALL-MON-01 No alert covers the PWA APIs, the workers or the database's storage and backups
- **Type**: risk
- **Severity**: S3
- **Confidence**: confirmed
- **Evidence**: `gcloud monitoring policies list` → 0. The Grafana rule list above. The table above. Services log JSON completion records (`business-server.mjs:6`, `workers/server.mjs:11`) but no log-based metric exists.
- **Impact**: An outage like R060, or a failed 00:05 daily-charge job, is found only when a user notices.
- **Recommendation**: Add three rules to the existing Grafana group, using the existing `mw-gcp-monitoring` datasource and owner push route, with no new monitor tool:
  1. Cloud Run `request_count` with `response_code_class` 4xx/5xx for `mw-credit-app-command-prod` and `-read-prod` above a small threshold over 10 min.
  2. Jobs: no successful daily-charge run by 00:30 Bangkok. Use a SQL query on the job-run table over the existing reporting connection, or a Cloud Scheduler `attempt` failure metric.
  3. Cloud SQL `disk/utilization` > 80%.

  Agent: R063 receiver owns making `/health` meaningful.
- **Effort**: M
- **Needs**: none

#### ALL-COST-01 No budget alert, and the operator cannot see billing
- **Type**: risk
- **Severity**: S3
- **Confidence**: confirmed
- **Evidence**: `gcloud billing accounts list` → 0 items. `gcloud billing budgets list` → permission denied, Budget API disabled. No `google_billing_budget` in `infrastructure/`. The runbook says there is no Cost push rule (`Grafana_Alert_Troubleshooting_Runbook.md` entry-point table). The Grafana "Cost" dashboard exists (Environment_Inventory Grafana row) but does not page.
- **Impact**: A runaway (log volume, Cloud Build loop, Firestore, Railway) is found only on the invoice.

  Billable resources from Terraform and inventory:

  | Resource | Where |
  | --- | --- |
  | Cloud SQL `db-f1-micro`, 10 GB HDD, 7 backups plus 7-day PITR (multi-region `asia`), 30-day final backup | `ecosystem-shared/owned.tf` |
  | Debian `e2-small`, 10 GB pd-balanced, static IP, 14-day snapshots | `ecosystem-debian/owned.tf` |
  | Azure VM-01 (part-time) plus Recovery Services backup | `ecosystem-azure*` |
  | Cloud Run: read/command ×2 envs, notify/jobs ×2 envs, legacy `api-dev`, `mw-grafana-events` (all scale to zero) | `dev`, `production`, `modules`, `ecosystem-bridge` |
  | Cloud Scheduler jobs (4 app plus bridge dispatch) | `modules/dev-workers`, `ecosystem-bridge` |
  | Artifact Registry ×3, Cloud Build, GCS (receipts, operator-private, tfstate, DEV bucket), Secret Manager, Firestore | various |
  | Grafana Cloud, Railway (Metabase plus its PostgreSQL), Cloudflare, Tailscale, Meta/Graph APIs | outside GCP billing |
- **Recommendation**: The owner creates one GCP budget (for example the monthly average plus 50%) with 50/90/100% email alerts in the console. It takes about 5 minutes and needs no Terraform, because the operator lacks billing access. Optionally grant `codex-cloud` `roles/billing.viewer` for readback.
- **Effort**: S
- **Needs**: owner decision

#### ALL-MON-03 Metabase on Railway is outside every control in this repository
- **Type**: risk
- **Severity**: S3
- **Confidence**: hypothesis
- **Evidence**: `Environment_Inventory.md:36` (Metabase on Railway with governed PostgreSQL sources). The runbook lists Railway as a separate surface with its own application database. `metabase_borrower_reader` reads `loan_manager_prod` (Database: access model).
- **Impact**: Metabase holds a PROD read credential for borrower data. Its sign-in method, public-link and embedding settings, and backup of its own database were not verified by this review.
- **Recommendation**: Owner decision. Check three settings once: (1) public sharing and embedding disabled; (2) SSO or strong passwords for the two users; (3) the Railway PostgreSQL backup schedule (a Grafana rule exists for it). Record the result in Environment_Inventory.
- **Effort**: S
- **Needs**: owner decision

### Evidence privacy

#### ALL-PRIV-01 The public repository contains real borrower-level financial data
- **Type**: risk
- **Severity**: S2 (privacy exposure. It is outside the S1 money/write definition; the orchestrator may escalate.)
- **Confidence**: confirmed
- **Evidence**:
  - `gh api repos/welct0407/MW-Credit-App --jq .visibility` → `public`.
  - `project/outputs/daily-loan-analysis-test-2026-08-31/previews_corrected/Borrowers.png` was opened and classified. It shows a spreadsheet of borrower identifiers, borrower names and per-borrower outstanding principal, interest, overdue and default values. No values are copied here.
  - The same folder holds 5 workbooks (largest sheet XML 186 KB) and partner loan summaries that likely contain the same data.
  - The repository also publishes the Cloud SQL public IP and authorized workstation IP (`Environment_Inventory.md:14-15`, `owned.tf:109`).
- **Impact**: Borrower financial data is readable by anyone and is retained in Git history.
- **Recommendation**:
  1. Owner decision now: switch the repository to private. This is reversible and takes minutes. Then fix ALL-CI-06 before Windows minutes start billing.
  2. Delete the borrower-data files from the tip of the branch.
  3. A full purge needs history rewriting. AGENTS forbids that without owner direction, so it is an owner decision. Forks or clones may already exist.
- **Effort**: S (private) / L (purge)
- **Needs**: owner decision

#### ALL-PRIV-02 Text scan is clean, but images and workbooks are unscanned
- **Type**: risk
- **Severity**: S3
- **Confidence**: confirmed (text); hypothesis (images)
- **Evidence**:
  - The bounded phone-number grep matched 18 files (12 in project/outputs, 6 in outputs). All 18 were sampled with digits masked, and all are false positives: digit runs inside SHA-256 hashes, commit ids or plugin ids (for example `r046-receipt-evidence/flyway-manifest.json`, `grafana-live-activation-20261003/final-verification.json`).
  - Without a digit boundary the count is 160. That is also the hash pattern; the plan's 111 was not reproduced.
  - `project/outputs` holds 474 images and 36 `.xlsx` that grep cannot read. The largest clusters are `01a05d4b-…` (32), `daily-loan-analysis-test-2026-08-31` (27), `olap-daily-installment-2026-09-01` (24), `r008-20260918` (18) and `borrower-visibility-2026-09-01` (18). Many are AppSheet dictionary renders (schema, not data).
- **Impact**: Further real-data screenshots or workbooks may exist (ALL-PRIV-01 shows at least one).
- **Recommendation**: One owner-assisted pass over the AppSheet-era image and workbook folders (August–September 2026 dates): delete anything showing rows. Add a pre-commit or CI check that rejects new `*.xlsx` and `*.png` outside `tests/` and `apps/`.
- **Effort**: M
- **Needs**: owner decision

#### ALL-PRIV-03 Over-1 MB evidence is kept alive by one-off scripts
- **Type**: doc
- **Severity**: S4
- **Confidence**: confirmed
- **Evidence**:
  - 20 files over 1 MB in `project/outputs` (largest 8.1 MB, `r005-20260917/reversal-configuration-checklist.json`).
  - 3 have no current reference: `borrower-matrix-dictionary-{before,after}/Columns.png` and `daily-loan-analysis-test-2026-08-31/previews_corrected/Charges.png`. That breaks `AGENTS.md:90`.
  - The other 17 are referenced only by historical scripts: `project/scripts/r005-*.mjs`, `update-assessment-promotion.mjs`, `reconcile-documentation.mjs`, `dictionary/migrate.py`, and `project/scripts/reference/01a05d4b-…/*`. The four `dictionary-reconciliation-20260924` files are referenced by about 97 dictionary entries and stay.
- **Impact**: About 50 MB of AppSheet-era evidence persists through a loophole in the rule.
- **Recommendation**: Delete the 3 unreferenced files. Retire the r005, assessment-promotion, documentation-reconciliation, dictionary-migration and `01a05d4b` script and evidence pairs together. The Documentation worker owns the rule wording.
- **Effort**: S
- **Needs**: none

#### ALL-PRIV-04 A second, larger evidence tree outside the rule
- **Type**: doc
- **Severity**: S4
- **Confidence**: confirmed
- **Evidence**: Root `outputs/` is 69 MB, with 1201 tracked files in 36 folders (largest `r052-phase6` 16 MB, `r052-collection-read` 14 MB). AGENTS places sanitized evidence in `project/outputs/` and applies the 1 MB rule there only.
- **Impact**: Repository size and clone time grow, and the tree is overwritten by tests (ALL-CI-08).
- **Recommendation**: Move the still-referenced items to `project/outputs` and delete the rest. Generated test captures go to `test-results/`.
- **Effort**: S
- **Needs**: none

### Standardization

Pool and connector duplication, `*-target.mjs` guards and UUID regexes are covered in App: architecture. Agent helper duplication is covered in Agent: code quality.

#### ALL-STD-01 Business-date logic is re-implemented in many places
- **Type**: std
- **Severity**: S4
- **Confidence**: confirmed
- **Evidence**:
  - `Asia/Bangkok` literal: 38 occurrences in 26 service files, 6 in the PWA, 7 in the agent, 158 in migrations, 2 in infrastructure.
  - 7 files hand-roll `Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok'})`, for example `services/api/borrower-read-store.mjs:60`, `services/agent-conversations/defaults.mjs:54`, `apps/pwa/src/CollectionRecords.tsx:60` and `read-cache.ts:45`.
  - The agent defines `BANGKOK` twice (`receipt_rules.py:13`, `cash_statement.py:14`).
  - `display-date.ts:6` appends `+07:00`.
- **Impact**: A day-boundary fix must be repeated everywhere. App: date contract owns correctness.
- **Recommendation**: One `services/contracts/business-date.mjs` (`businessToday()`, `BUSINESS_TZ`), imported by services and the PWA. One agent constant in `config.py`.
- **Effort**: S
- **Needs**: none

#### ALL-STD-02 Project id, number and service URLs are hard-coded
- **Type**: std
- **Severity**: S4
- **Confidence**: confirmed
- **Evidence**:
  - `clever-oasis-508610-n7` appears in 10 service files, 29 scripts, 41 infrastructure files and 2 PWA files.
  - The project number appears in 8 service files and 2 agent files.
  - Examples: audience built from a literal in `services/notifications/postcommit.mjs:5`, `agent-conversations/policy.mjs:2,9` and `integration-agent/.../receipt_api.py:29`; storage project at `business-server.mjs:6`.
- **Impact**: Harmless while there is one project, but every test or fixture has to carry the same literals. A project move would touch about 80 files.
- **Recommendation**: Keep Terraform literals. In services, read `APPLICATION_PROJECT_ID` and `APPLICATION_PROJECT_NUMBER` (already injected, `runtime.tf:115-116`) through one config module. In the agent, keep the audience in config (it already reads `config['…_audience']`) and drop the literal default.
- **Effort**: M
- **Needs**: none

#### ALL-STD-03 Four error-code vocabularies with no catalogue
- **Type**: std
- **Severity**: S4
- **Confidence**: confirmed
- **Evidence**:
  - SQL: 21 distinct `ERRCODE` values plus lower-case message codes (`RAISE EXCEPTION 'invalid_subscription'` ×10, `'target'` ×7, `'noncanonical'` ×7).
  - Node maps only `42501` and `P0001` (4 files, for example `code==='42501'`) and throws 53 distinct lower_snake codes.
  - The agent uses 291 distinct UPPER_SNAKE codes (`ConfigurationError('REVIEWER_DML_DISABLED')`).
  - The PWA has its own message texts (App: UX).
- **Impact**: "Stable specific reasons" (Solution_Design) depend on each layer's manual mapping, and a new SQL code surfaces as a generic error.
- **Recommendation**: One JSON catalogue (`services/contracts/error-codes.json`: code, HTTP status, en, th) used by the Node handlers and the PWA. SQL raises the catalogue code in `MESSAGE` with `ERRCODE 'P0001'`. The agent keeps its namespace but documents the codes it shows to users.
- **Effort**: M
- **Needs**: none

#### ALL-STD-04 Logs have no common shape
- **Type**: std
- **Severity**: S4
- **Confidence**: confirmed
- **Evidence**:
  - Node: 6 `console.log(JSON.stringify(...))` sites in 5 files, with no `severity`, request id or common `component` field (for example `dev-server.mjs:31`, `workers/server.mjs:11`).
  - Agent: `cli.py:90-114` prints a JSON result per run. `import logging` is used 0 times.
- **Impact**: Cloud Logging treats every line as default severity, so error-rate alerts (ALL-MON-01) need text matching.
- **Recommendation**: A 10-line `log(severity, event, fields)` helper in services that emits Cloud Logging's `severity` and `logging.googleapis.com/trace` fields. In the agent, add `"severity"` to the existing JSON print. No logging framework.
- **Effort**: S
- **Needs**: none

#### ALL-STD-05 Naming and identifier rules exist only by habit
- **Type**: doc
- **Severity**: S4
- **Confidence**: confirmed
- **Evidence**:
  - 11 quoted-space tables (AppSheet era) next to 11 snake_case tables.
  - 63 versioned `_vN` functions; `pwa_submit_selected_charges` is defined in 18 migration places.
  - Deterministic ids: Node uses SHA-256 (`createHash('sha256')` in 18 service files); the agent uses `uuid5(NAMESPACE_URL,'mw-receipt:'+…)` (`receipt_projection.py:59`, `receipt_audit.py:23`); the PWA uses random UUIDs for requests (App: offline).
- **Impact**: New contributors (mostly AI agents) guess the convention each time.
- **Recommendation**: Add five lines to `database/README.md` and `docs/Development.md`: new objects are snake_case; bump `_vN` only on signature change; request ids are client UUIDs; derived ids use the documented uuid5 namespace or SHA-256 input format. No renames.
- **Effort**: S
- **Needs**: none

## Documentation and process system

Merged by the orchestrator from Agent D — Delivery and Documentation (Claude Sonnet 5.5, medium effort), who verified each claim at the cited line on commit 0995868.

Link check for `project/Documents/*.md` + `Rules/*.md` (21 files, 207 links): 1 broken path, 3 broken anchors. Root README, `docs/*.md`, `database/*.md`, `project/*.md`, dictionary README (13 files, 73 links): 1 broken path (below). Total across all checked files: 2 broken paths and 3 broken anchors, all listed in ALL-DOC-01 to 03.

#### ALL-DOC-01 Dead link to a local-only dictionary snapshot
- **Type**: doc  **Severity**: S4  **Confidence**: confirmed  **Effort**: S  **Needs**: none
- **Evidence**: `project/Documents/README.md:20` links `Data_Dictionary_ChatGPT.md`; the file is absent (the line itself says "local-only link, ignored by Git"). `Rules/Development_Workflow.md:55` also requires regenerating "the existing dictionary upload snapshot".
- **Impact**: A fresh clone gets a dead link and a maintenance duty for a file it does not have.
- **Recommendation**: Drop the link (keep the sentence) and make the regeneration duty conditional: "if you have a local snapshot".

#### ALL-DOC-02 Three broken anchors in the inventory and tracker
- **Type**: doc  **Severity**: S4  **Confidence**: confirmed  **Effort**: S  **Needs**: none
- **Evidence**: (1) `project/Documents/Environment_Inventory.md:23` links `Development_Changes.md#r058-borrower-upcoming-batch`; the heading at `Development_Changes.md:93` is "R058 Borrower Upcoming Charges batch" (anchor `#r058-borrower-upcoming-charges-batch`). (2) `Environment_Inventory.md:30` links `.../CHANGE_NOTES_RECEIPT_NOTIFICATION_ISOLATION_2026-10-02.md#r058-promotion-status`; (3) `Release_Tracker.md:30` links the same file with `#r058-strict-instagram-fallback-candidate--14-october-2026`. `grep -n "^#"` on that note returns only its title line, and `grep -i r058` returns nothing, so the R058 Debian promotion text is not in the file the links name.
- **Impact**: The R058 Debian "existing promotion record" cited by the tracker cannot be found. The Debian pin (`a8cf949`) therefore has no verifiable record behind the link.
- **Recommendation**: Fix (1) by correcting the anchor. For (2)/(3) find where the R058 Debian verification was recorded (likely `Development_Changes.md` R058 or an integration-agent change note) and point there; if it was never written, add three lines to the existing change note.

#### ALL-DOC-03 Link into a sibling repository that is not present
- **Type**: doc  **Severity**: S4  **Confidence**: confirmed  **Effort**: S  **Needs**: none
- **Evidence**: `project/SERVICE_CATALOGUE.md:3` links `../MW-AI-Collection/SERVICE_CATALOGUE.md` ("standalone collection project at C:\GitHub\MW-AI-Collection"); `ls ../MW-AI-Collection` fails. `CLAUDE.md` says not to attach sibling repositories.
- **Impact**: Dead link; the file is a pointer only.
- **Recommendation**: Turn into plain text with no link, or delete `project/SERVICE_CATALOGUE.md` if nothing else cites it.

#### ALL-DOC-04 Reading load before a routine change
- **Type**: doc  **Severity**: S4  **Confidence**: confirmed  **Effort**: M  **Needs**: owner decision
- **Evidence**: `AGENTS.md` is 1,993 words and has 22 distinct relative links. The linked set plus AGENTS itself, the project README, rules folder, inventory, dictionary README and retirement README totals about 20,700 words (`cat ... | wc -w`). The practical minimum for a product change is `AGENTS.md` 1,993 + Release_Tracker 358 + PWA_Orchestration 1,369 + Development_Workflow 1,691 (its documentation-maintenance table) + Documents/README 328 = about 5,700 words before reading any source. The evolving-document set that table asks to keep current is 11 files and 33,461 words (Development_Changes 10,933; Resource_Monitoring_Dashboard_Guide 7,458; Resource_Monitoring 5,169; Grafana_MCP_Events_Bridge 3,113; PWA_Data_Model_Overview 2,556; project README 1,170; Environment_Inventory 929; Mapping 753; Solution_Design 694; Tracker 358; Documents README 328).
- **Impact**: For a two-person app, the rules cost more reading than most changes. Most of the length sits in release history and monitoring detail, not in rules.
- **Recommendation**: See "Recommendations" below: cut `AGENTS.md` to the hard rules plus a link table, and make a short "current state" page per component the only place that holds pins.

#### ALL-DOC-05 Same pins repeated across documents and dictionary files
- **Type**: doc  **Severity**: S4  **Confidence**: confirmed  **Effort**: M  **Needs**: none
- **Evidence**: `grep -rl` outside `outputs/`: Hosting `45b1899bbd18ba3e` appears in 4 files (`Development_Changes.md`, `Environment_Inventory.md`, `Data Dictionary/systems/pwa/human-api.yaml`, `.../pwa/application.yaml`); DEV command `00027-8sb` in the same 4; the Debian pin `a8cf94999aee33e9762614241b31904a967b7cac` in 2 (`Release_Tracker.md`, `Environment_Inventory.md`) while the catalogue still shows an older one (AGT-DOC-01). `Environment_Inventory.md:24-25` holds 4 digests/hashes in single table cells (the file is 929 words but its longest line is 1,773 characters).
- **Impact**: Each release rewrites 3-4 files with the same hex; the one place that was missed (catalogue) is already wrong. Dictionary evidence files that quote deployment ids also go stale.
- **Recommendation**: Pins live only in `Environment_Inventory.md`. Everything else says "see inventory". Remove deployment ids from dictionary evidence (keep release number plus anchor).

#### ALL-DOC-06 `Development_Changes.md` is titled "Open" but keeps all released history
- **Type**: doc  **Severity**: S4  **Confidence**: confirmed  **Effort**: M  **Needs**: owner decision
- **Evidence**: `project/Documents/Development_Changes.md:1` "# Open development changes"; 249 lines and 10,933 words. Open work is only R063 (lines 17-33). R062 (`:34`), R061 (`:55`), R060 (`:73`), R059 (`:79`) and R058 (`:93-230`, 138 lines) are Released per `Release_Tracker.md:7-24`. `AGENTS.md`: "Delete unused/superseded documentation rather than maintaining history copies; Git retains prior versions." At least 8 dictionary files cite `Development_Changes.md#r062-production-promotion` (e.g. the V92 routine entry above), so headings are used as evidence anchors.
- **Impact**: The "current work" page is 95% history; every agent that follows the trigger table reads it.
- **Recommendation**: Keep only the Open release and "Current operation". Replace each released section with its Released row in the tracker plus the Git tag. Rewrite the dictionary's `#r062-production-promotion` references to the Git tag (`R062`) before deleting the headings.

#### ALL-DOC-07 Change notes: readable sentences, unreadable paragraphs
- **Type**: doc  **Severity**: S4  **Confidence**: confirmed  **Effort**: S  **Needs**: none
- **Evidence**: `Change Logs/CHANGE_NOTES_R054_UI_BATCH_2026-10-12.md`: 972 words, 19 paragraphs, 82 sentences, average 11.8 words (longest 29), 32 code spans, 21 hex ids, longest paragraph 113 words. `Development_Changes.md` R062 section (`:34-54`): 905 words, 10 paragraphs, average 14.1 words (longest 43), 34 code spans, 31 hex ids, longest paragraph 227 words. R063 sections (`:17-33`) run 130-190 words per paragraph. (Sentence metric: split on `.!?` and newlines, inline code replaced.)
- **Impact**: Sentences are short enough, but each paragraph packs 5-10 facts (commit, check count, digest, time stamp). A reviewer cannot scan for "what changed, what ran, how to undo".
- **Recommendation**: One template, at most 150 words plus a table:

  ```
  # R0nn <title> — date
  What changed: 2-4 bullets, one fact each.
  Checks: one table row per check (command, result).
  Deploy: DEV / PROD, one line each, with pin only if not in the inventory.
  Undo: one line.
  Open items: bullets or "none".
  ```
  Hashes go in a final "Evidence" line, not in prose.

#### ALL-DOC-08 Change-note volume
- **Type**: doc  **Severity**: S4  **Confidence**: confirmed  **Effort**: S  **Needs**: owner decision
- **Evidence**: `Change Logs/` has 48 notes, 40,429 words; `integration-agent/Change Logs/` has 53 notes, 28,078 words. `AGENTS.md` asks for "one concise change log" per batch and for deleting superseded references.
- **Impact**: About 68,500 words of notes, most of them about merged and released work that Git and the tracker already record.
- **Recommendation**: Keep the last three releases' notes plus notes for anything with open rollback needs. Delete the rest in one commit; nothing is lost from Git.

#### ALL-DOC-09 `project/outputs` retention: within the letter of the rule, 155 MB in practice
- **Type**: doc  **Severity**: S4  **Confidence**: confirmed  **Effort**: M  **Needs**: owner decision
- **Evidence**: `ls project/outputs | wc -l` = 194 entries; `du -sh project/outputs` = 155 MB; 2,747 files; root `outputs/` = 69 MB; `integration-agent/outputs` = 604 KB; 3,948 files tracked under the two main trees. 20 files exceed 1 MB. The 1 MB rule (`AGENTS.md`: kept only while a current document, README or script references it) is met for all 20: each filename is cited by at least one retained script or document (check run with `grep -rIlF` over `project/Documents`, `project/scripts`, docs). The largest folder, `project/outputs/r005-20260917`, is 45 MB from 17 September and is kept alive by three one-off scripts (`project/scripts/r005-dashboard-record.mjs`, `r005-evidence.mjs`, `r005-production-dictionary.mjs`). Other large items: `01a05d4b-...` (16 MB, screenshots), `dictionary-reconciliation-20260924` (8.6 MB), `r008-20260918` (7 MB), `daily-loan-analysis-test-2026-08-31` (5 MB).
- **Impact**: The rule never triggers because the scripts that cite the files are themselves retained. Clones carry 220 MB of evidence for releases that are a month old.
- **Recommendation**: Delete the `r005-*` scripts and their output folder together (and `r008`, the August analysis, the `01a05d4b` screenshots) unless the owner names one to keep. Add to the rule: "one-off release scripts are deleted with their release's outputs."

#### ALL-DOC-10 Monitoring documents are larger than the PWA documents
- **Type**: doc  **Severity**: S4  **Confidence**: confirmed  **Effort**: M  **Needs**: owner decision
- **Evidence**: `Resource_Monitoring_Dashboard_Guide.md` 7,458 words, `Resource_Monitoring.md` 5,169, `Grafana_MCP_Events_Bridge.md` 3,113 (15,740 words) versus `PWA_Data_Model_Overview.md` 2,556 and `Solution_Design.md` 694. All three are on the "keep current each batch" list (`Development_Workflow.md:58-60`).
- **Impact**: Three documents to check for any monitoring change; the guide is a panel-by-panel description that goes stale with each dashboard edit.
- **Recommendation**: Merge the guide and the bridge into `Resource_Monitoring.md` as short sections, or reduce the guide to a list of dashboards with one line each (the dashboards themselves are in `project/scripts/monitoring/`).

#### ALL-DOC-11 `AGENTS.md` is a manual, not a front page
- **Type**: doc  **Severity**: S4  **Confidence**: likely  **Effort**: M  **Needs**: owner decision
- **Evidence**: `AGENTS.md` 1,993 words (about 105 lines). Roughly half repeats rules held in `Rules/Release_Workflow.md`, `Development_Workflow.md` and `PWA_Orchestration.md` (production approval wording, records, publication, tags). The first screenful is the repository layout table, then a seven-row trigger table; the hard safety rules (DEV/PROD separation, secrets, backups) come after 600 words of working method.
- **Impact**: Every session loads it fully. Important rules sit far from the top, while long process text competes with them.
- **Recommendation**: Target about 600 words: layout table, eight hard rules (target verification, no secrets in repo, migrations immutable, backup before PROD DB change, no force-push, preserve others' work, owner approval scope, tests on synthetic data), and the trigger table of links. Move the rest into the rules it duplicates and delete from AGENTS.

#### ALL-DOC-12 Recommended simplified structure (no new process)
- **Type**: doc  **Severity**: S4  **Confidence**: hypothesis (design proposal)  **Effort**: L  **Needs**: owner decision
- **Evidence**: Findings ALL-DOC-04 to 11.
- **Impact**: Fewer documents to open, and one home for each fact.
- **Recommendation**:
  1. One `CURRENT.md` (about 300 words) per component: PWA, database, Debian agent. Each lists: what is deployed (pin, DEV and PROD), what is open, where to roll back. `Environment_Inventory.md` becomes the PWA/infra page; `integration-agent/SERVICE_CATALOGUE.md` the agent page (table only); `database/README.md` the database page.
  2. Merge: `Resource_Monitoring_Dashboard_Guide.md` and `Grafana_MCP_Events_Bridge.md` into `Resource_Monitoring.md`; `Service_Account_Browser_Mapping.md` into the inventory if it is under 800 words of live facts.
  3. Delete: `database/OWNERSHIP.md`, `integration-agent/docs/MIGRATION_PLAN.md`, `project/SERVICE_CATALOGUE.md`, released sections of `Development_Changes.md`, the `r005`/`r008` outputs and scripts, change notes older than three releases.
  4. Change-note template as in ALL-DOC-07; `Development_Changes.md` keeps one Open release.
  5. The documentation-maintenance table becomes "update the component page you touched; update the tracker at release transitions", which matches the owner's stated preference for no enterprise process.

## Consolidated backlog

Merged by the orchestrator from the four review notes on commit `0995868`. Sorted by severity, then confidence, then effort. "Needs" marks what the owner must authorize before implementation; everything else is routine reversible work under standing authority. Component notes hold the evidence; this table is the index.

| Severity | Count |
| --- | --- |
| S1 | 1 |
| S2 | 10 |
| S3 | 74 |
| S4 | 128 |
| Total | 213 |

By component: app 39, agent 49, overall 46, db 44, app (ux) 35. Notes: app `Change Logs/CHANGE_NOTES_REVIEW_APP_2026-10-15.md` (branch `claude/beautiful-mayer-mf4t1p-review-app`), database `Change Logs/CHANGE_NOTES_REVIEW_DATABASE_2026-10-15.md` (`…-review-db`), agent `integration-agent/Change Logs/CHANGE_NOTES_REVIEW_AGENT_2026-10-15.md` (`…-review-agent`), overall this file (`…-review-overall`).

### Proposed implementation waves

| Wave | Scope | Items |
| --- | --- | --- |
| W1 | Confirmed bugs, safety and privacy gaps needing no schema or PROD-side change | 21 |
| W2 | R063 receiver readiness, recovery of the deployed R058 code, deploy-script path fixes | 12 |
| W3 | Tests, CI, toolchain, architecture and standardization | 90 |
| W4 | Schema, access, locking, index and performance (new migrations; DEV first; needs owner authorization) | 23 |
| W5 | UX improvements | 39 |
| W6 | Documentation and process cleanup | 28 |

Owner decisions needed before the waves start are listed with Needs = owner decision, schema change, PROD change or infra change below. The orchestrator recommends starting with W1 and W2 in parallel (different components), then W3; W4 waits for owner authorization of new migrations; W5 and W6 can run whenever capacity allows.

### Backlog

| # | Code | Component | Sev | Confidence | Type | Effort | Needs | Wave | Finding |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | APP-OFFLINE-01 | app | S1 | confirmed | bug | S | none | W1 | A payment recorded offline (cash received in the field) is silently deleted if one transient auth-check failur |
| 2 | AGT-DEPLOY-02 | agent | S2 | confirmed | bug | S | none | W2 | Fourteen deploy/verify scripts still assume the agent at the checkout root |
| 3 | AGT-R063-02 | agent | S2 | confirmed | risk | S | none | W2 | `/health` is a constant and the only monitor compares that constant; a stale or broken receiver is undetectable |
| 4 | ALL-PRIV-01 | overall | S2 | confirmed | risk | S | owner decision | W1 | The public repository contains real borrower-level financial data |
| 5 | APP-OFFLINE-02 | app | S2 | confirmed | ux | S | owner decision | W5 | One tap discards queued payments that have not synced. |
| 6 | APP-PAY-01 | app | S2 | confirmed | bug | S | none | W1 | On a slow mobile uplink, a queued payment with a phone photo becomes "blocked — invalid details" and needs man |
| 7 | AGT-DEPLOY-01 | agent | S2 | confirmed | bug | M | owner decision (which code is authoritat | W2 | The deployed production runtime (R058 `a8cf949`) is not in the repository; redeploying `main` would silently revert R058 |
| 8 | AGT-R063-01 | agent | S2 | confirmed (gap and timeline); the exact  | bug | M | none (the tunnel path restriction in AGT | W2 | Webhook receiver is never reloaded by the current deploy helpers (R063 root cause) |
| 9 | DB-PERF-01 | db | S2 | confirmed (size), likely (cause) | risk | M | owner decision | W4 | The agent database is ~99% of instance storage and of every automated backup/PITR log; HDD IOPS on a shared mi |
| 10 | AGT-WEBHOOK-01 | agent | S2 | likely (Meta's `is_deleted` event shape  | bug | S | none | W1 | A deleted (unsent) Instagram message makes the whole delivery fail with 503 on every retry |
| 11 | DB-ACCESS-01 | db | S2 | likely (DEV confirmed, PROD not read) | risk | S | PROD change | W3 | A role with DELETE but no SELECT can only run unqualified `DELETE FROM "<table>"` (a `WHERE` on any column nee |
| 12 | AGT-DEPLOY-03 | agent | S3 | confirmed | bug | S | none | W2 | Two "installed equals source" checks pass vacuously when the source path is wrong |
| 13 | AGT-DEPLOY-04 | agent | S3 | confirmed | bug | S | owner decision | W2 | `update-reviewed-runtime.sh` is stale beyond its path |
| 14 | AGT-DEPLOY-07 | agent | S3 | confirmed | risk | S | owner decision | W2 | Both clones are shallow, so provenance checks cannot be done |
| 15 | AGT-DOC-02 | agent | S3 | confirmed | doc | S | none | W6 | Monitoring runbook points at the old repository path (rollback step) |
| 16 | AGT-MON-01 | agent | S3 | confirmed | risk | S | none | W1 | The host monitor is not the repository copy |
| 17 | AGT-R063-03 | agent | S3 | confirmed | risk | S | none | W2 | Receiver unit lacks database ordering, umask and a readiness gate |
| 18 | AGT-R063-04 | agent | S3 | confirmed | risk | S | none | W2 | Every receiver exception becomes an unlogged 503 |
| 19 | AGT-TEST-02 | agent | S3 | confirmed | bug | S | none | W3 | One DML audit test expects the wrong error for the real role |
| 20 | ALL-CI-01 | overall | S3 | confirmed | risk | S | none | W3 | `main` is red and nothing stops merges |
| 21 | ALL-CI-02 | overall | S3 | confirmed | risk | S | none | W3 | Browser tests run after merge, not before |
| 22 | ALL-CI-03 | overall | S3 | confirmed | risk | S | none | W3 | Terraform CI covers 2 of 19 roots and runs no Terraform tests |
| 23 | ALL-CI-05 | overall | S3 | confirmed | risk | S | none | W3 | Inconsistent action pinning, including in the job that holds deploy credentials |
| 24 | ALL-COST-01 | overall | S3 | confirmed | risk | S | owner decision | W3 | No budget alert, and the operator cannot see billing |
| 25 | ALL-INFRA-01 | overall | S3 | confirmed | risk | S | owner decision | W3 | The cloud executor is a project Owner signed in with a non-expiring key |
| 26 | ALL-INFRA-02 | overall | S3 | confirmed | risk | S | infra change | W3 | SSH and RDP are open to the internet on the default network |
| 27 | ALL-INFRA-04 | overall | S3 | confirmed | risk | S | infra change | W3 | Debian VM protection and disaster-recovery gaps |
| 28 | APP-AUTH-01 | app | S3 | confirmed | risk | S | none | W1 | A transient Google-side failure looks like a revoked session to the PWA, which then signs the user out and pur |
| 29 | APP-DATE-01 | app | S3 | confirmed | bug | S | none | W1 | No wrong display today. The first UI that shows this field will be 7 h off. |
| 30 | APP-SEC-01 | app | S3 | confirmed | risk | S | PROD change | W3 | The app, which posts payments on a tap, can be framed by another site (clickjacking). There is no CSP backstop |
| 31 | APP-TEST-02 | app | S3 | confirmed | risk | S | none | W3 | A change to service SQL (read models, store) merges without running the integration suite that exercises it. |
| 32 | APP-UX-A11Y-01 | app (ux) | S3 | confirmed | ux | S | owner decision | W5 | Pinch-zoom and ctrl+wheel zoom are blocked (WCAG 1.4.4 / 1.4.10). iOS ignores the meta but the JS guard still  |
| 33 | APP-UX-BORROWER-02 | app (ux) | S3 | confirmed | ux | S | none | W5 | Two consequential toggles (one enables automated collection messaging) are the smallest targets in the app; ea |
| 34 | APP-UX-PERF-01 | app (ux) | S3 | confirmed | ux | S | none | W5 | Every cold load and every cache miss (see PERF-02) pulls a 1.5 MB image for a 36px logo; on mobile data this d |
| 35 | APP-UX-RECEIVE-01 | app (ux) | S3 | confirmed | ux | S | none | W5 | On a phone the only way to proceed from the allocation form is an unlabeled clipboard icon in the grey summary |
| 36 | APP-UX-RECEIVE-04 | app (ux) | S3 | confirmed | ux | S | none | W5 | The user cannot tell before confirming that the payment will be queued rather than posted. Receipts/notificati |
| 37 | DB-ACCESS-03 | db | S3 | confirmed | risk | S | infra change | W3 | The identity used by Linux cloud sessions (including this review) is an instance-level admin, not a reader. A  |
| 38 | DB-AGENTDB-01 | db | S3 | confirmed | risk | S | none | W4 | The second migration runner (checksum compare, out-of-order rejection, rerun no-op) is untested; a regression  |
| 39 | DB-AGENTDB-02 | db | S3 | confirmed | arch | S | schema change | W4 | Grants on business tables have no history row; a reviewer cannot tell from `flyway_schema_history` what the ag |
| 40 | DB-BACKUP-01 | db | S3 | confirmed | risk | S | owner decision | W3 | A non-release data loss (operator error, agent bug) relies on an untested restore path. |
| 41 | DB-BACKUP-03 | db | S3 | confirmed | risk | S | none | W1 | Rotating either secret (adding version 2 and disabling 1) silently breaks every cloud session and the Linux ru |
| 42 | DB-PERF-03 | db | S3 | confirmed | std | S | infra change | W4 | Flags advertise a scheduler that does not exist and `cron.database_name` names PROD; if anyone re-creates the  |
| 43 | DB-SCHEMA-02 | db | S3 | confirmed | risk | S | none | W4 | A future guard named without the `a0_`/`aa_` prefix, or a normalizer that stops using `nullif`, changes semant |
| 44 | DB-SCHEMA-03 | db | S3 | confirmed | risk | S | schema change | W4 | No measurable effect at 37 borrowers / 1.5k charges; each parent DELETE/UPDATE of a key scans the child table. |
| 45 | DB-SCHEMA-06 | db | S3 | confirmed | risk | S | none | W4 | Every release edits the guard and its test; the 89→90, 90→91 and 91→92 branches are untested. A typo blocks or |
| 46 | AGT-TEST-01 | agent | S3 | confirmed | risk | M | none | W3 | 40 PostgreSQL tests never run in CI, though they run in about 15 minutes of setup |
| 47 | AGT-TEST-03 | agent | S3 | confirmed | risk | M | none | W3 | The receiver and four other modules have no tests |
| 48 | ALL-INFRA-03 | overall | S3 | confirmed | risk | M | infra change | W3 | The security-relevant configuration sits outside Terraform |
| 49 | ALL-MON-01 | overall | S3 | confirmed | risk | M | none | W1 | No alert covers the PWA APIs, the workers or the database's storage and backups |
| 50 | ALL-PRIV-02 | overall | S3 | confirmed (text); hypothesis (images) | risk | M | owner decision | W1 | Text scan is clean, but images and workbooks are unscanned |
| 51 | APP-ARCH-01 | app | S3 | confirmed | arch | M | none | W3 | Capability behaviour (`read` vs `command`, `receipt.*`, second partner) is first exercised in PROD. A capabili |
| 52 | APP-OFFLINE-03 | app | S3 | confirmed | risk | M | schema change | W4 | Every offline-dataset poll recomputes a source fingerprint on the server; cheap change detector recommended |
| 53 | APP-TEST-03 | app | S3 | confirmed | risk | M | none | W3 | Money-reading SQL (cash, management financial, position) has no unit or Linux-run test. Regressions show up on |
| 54 | DB-ACCESS-02 | db | S3 | confirmed | risk | M | owner decision | W3 | The request-id journal, payload-hash check and successor index are enforced only by the Node path. Any process |
| 55 | DB-ACCESS-07 | db | S3 | confirmed (config), likely (exposure) | risk | M | infra change | W3 | Password roles (`postgres`, `mw_agent_*`, `mw_reviewer_dml`, `metabase_borrower_reader`) are reachable from th |
| 56 | DB-BACKUP-04 | db | S3 | confirmed | risk | M | owner decision | W3 | Loss of VM-01 (or its Azure subscription) blocks every PROD schema change and the restore rehearsal until a ne |
| 57 | DB-CI-01 | db | S3 | confirmed | risk | M | none | W3 | A cloud session's `mw-db-ci` pass does not prove the RPC, access or upgrade behaviour; those proofs run only o |
| 58 | DB-CI-02 | db | S3 | confirmed | risk | M | none | W3 | Lump-sum posting (V2/V3), interest-schedule anchor (V5/V84), the rollup chain (V12–V14) and partner reporting  |
| 59 | DB-CI-05 | db | S3 | confirmed | risk | M | none | W3 | Grant drift (DB-ACCESS-01 shows one) is invisible to CI. |
| 60 | DB-SCHEMA-01 | db | S3 | confirmed | arch | M | none | W4 | The current body of the main command RPC exists only in a live database; reviewers must replay 22 string edits |
| 61 | ALL-ARCH-01 | overall | S3 | confirmed | arch | L | infra change | W3 | DEV and PROD run different command compositions |
| 62 | DB-PAY-03 | db | S3 | confirmed | risk | — | owner decision | W4 | Totals cannot be corrupted by direct writes, but status fields and source rows can, without a journal row. |
| 63 | AGT-DEPLOY-05 | agent | S3 | likely | risk | S | none | W2 | Per-file copy into site-packages creates hybrid installs |
| 64 | AGT-HOST-04 | agent | S3 | likely | risk | S | none | W1 | `Requires=cloud-sql-auth-proxy.service` stops workers mid-run when the proxy restarts |
| 65 | AGT-R063-05 | agent | S3 | likely | risk | S | none | W2 | Lazy imports make a long-lived receiver a mixed-version process |
| 66 | AGT-SEND-01 | agent | S3 | likely | risk | S | none | W1 | Instagram failures are all "unknown", and the reason is discarded |
| 67 | AGT-SEND-02 | agent | S3 | likely | risk | S | none | W1 | Email UNKNOWN outcomes are swallowed without a reason |
| 68 | AGT-SEND-03 | agent | S3 | likely | risk | S | owner decision | W3 | A payment POST that never left the host still becomes UNKNOWN forever |
| 69 | AGT-SEND-04 | agent | S3 | likely | risk | S | none | W1 | The Graph refresh token is rewritten in place |
| 70 | AGT-STATE-01 | agent | S3 | likely (estimate from code; `mw_agent` n | risk | S | owner decision for retention | W3 | Audit rows grow without bound, including for no-op statements |
| 71 | AGT-WEBHOOK-02 | agent | S3 | likely | risk | S | none | W1 | Messages older than 24 hours are dropped with 200 and no record |
| 72 | AGT-WEBHOOK-03 | agent | S3 | likely (Terraform rule; public GET not r | risk | S | infra change | W3 | The tunnel publishes every receiver path, including `/health` |
| 73 | AGT-WEBHOOK-04 | agent | S3 | likely | risk | S | none | W1 | No socket timeout, unbounded threads, one DB connection |
| 74 | ALL-ARCH-04 | overall | S3 | likely (configuration confirmed; load im | arch | S | owner decision, infra change | W3 | One small shared Cloud SQL instance carries DEV, PROD and agent state |
| 75 | APP-OFFLINE-04 | app | S3 | likely | risk | S | owner decision | W3 | A lost or shared device keeps borrower financial data and receipt photos until the next sign-out. |
| 76 | APP-OFFLINE-05 | app | S3 | likely | ux | S | none | W5 | Tapping a notification while a form is open reloads that tab. Unsaved in-memory state is lost; autosaved draft |
| 77 | APP-PAY-02 | app | S3 | likely | risk | S | none | W1 | With a cold or slow notify service, a committed payment can return late or as a platform 504. The user sees "u |
| 78 | APP-PAY-03 | app | S3 | likely | risk | S | infra change | W3 | Slow requests are cut by the platform with an opaque 504 while the DB work continues. Safe because of status-f |
| 79 | APP-UX-SETTINGS-01 | app (ux) | S3 | likely | ux | S | none | W5 | A user whose popup was blocked (common in iOS standalone PWAs) sees nothing happen and retries blindly. |
| 80 | DB-LOCK-01 | db | S3 | likely | bug | S | none | W4 | A lock contention or NOWAIT failure is reported to the PWA as "outcome unknown", forcing the status-poll path  |
| 81 | ALL-ARCH-02 | overall | S3 | likely | arch | M | owner decision | W3 | The agent writes PROD financial tables directly, outside the command API |
| 82 | ALL-ARCH-03 | overall | S3 | likely | arch | M | infra change | W3 | Three database authentication styles and three secret stores |
| 83 | APP-PAY-04 | app | S3 | likely | risk | M | none | W1 | Two concurrent receipt operations take the whole pool; other requests wait up to 5 s, then return 503. Likely  |
| 84 | DB-ACCESS-06 | db | S3 | likely | arch | M | none | W3 | SQL guards hard-code IAM principal names, database names and owner role names per environment |
| 85 | ALL-MON-03 | overall | S3 | hypothesis | risk | S | owner decision | W3 | Metabase on Railway is outside every control in this repository |
| 86 | AGT-DEPLOY-06 | agent | S4 | confirmed | std | S | none | W2 | Package version never changes |
| 87 | AGT-DOC-01 | agent | S4 | confirmed | doc | S | none | W6 | Catalogue source pin is two releases old |
| 88 | AGT-DOC-03 | agent | S4 | confirmed | doc | S | none | W6 | Collector description still lists AppSheet probes |
| 89 | AGT-DOC-05 | agent | S4 | confirmed | doc | S | none | W6 | `docs/MIGRATION_PLAN.md` is a finished Windows-to-Debian plan |
| 90 | AGT-DOC-06 | agent | S4 | confirmed | doc | S | none | W6 | `config.example.json` lacks the PostgreSQL state keys |
| 91 | AGT-DOC-07 | agent | S4 | confirmed | doc | S | none | W6 | `mw-audit-relay.timer` is installed in source but not in the catalogue |
| 92 | AGT-DOC-09 | agent | S4 | confirmed | doc | S | none | W6 | Windows-path references remain in agent and project docs |
| 93 | AGT-HOST-01 | agent | S4 | confirmed | risk | S | owner decision | W3 | The documented read-only route cannot read logs |
| 94 | AGT-HOST-03 | agent | S4 | confirmed | std | S | none | W3 | Cloudflared unit duplicates `ProtectHome` and lacks address-family restriction |
| 95 | AGT-QUALITY-02 | agent | S4 | confirmed | std | S | none | W3 | No lint/type step; Python floor out of date |
| 96 | AGT-QUALITY-03 | agent | S4 | confirmed | std | S | none | W3 | Hard-coded workstation paths and public IP in operator scripts |
| 97 | AGT-QUALITY-04 | agent | S4 | confirmed | std | S | none | W3 | SQL built by string concatenation |
| 98 | AGT-STATE-02 | agent | S4 | confirmed (code trace) | risk | S | none | W3 | `readonly=True` is ignored on the PostgreSQL backend |
| 99 | AGT-TEST-04 | agent | S4 | confirmed | doc | S | none | W6 | The lab has undocumented prerequisites |
| 100 | AGT-TEST-05 | agent | S4 | confirmed | std | S | none | W3 | No test keeps the Markdown and JSON catalogues aligned |
| 101 | AGT-WEBHOOK-05 | agent | S4 | confirmed | std | S | none | W3 | Kill switches are read at different times; bad Content-Length gives 503 |
| 102 | ALL-ARCH-05 | overall | S4 | confirmed | arch | S | infra change | W3 | Foundation-era DEV API is still deployed and is the only CI-deployed service |
| 103 | ALL-ARCH-06 | overall | S4 | confirmed | arch | S | none | W3 | Server image ships frontend packages |
| 104 | ALL-ARCH-07 | overall | S4 | confirmed | std | S | none | W3 | PROD workers use a module named `dev-workers` |
| 105 | ALL-ARCH-08 | overall | S4 | confirmed | arch | S | owner decision | W3 | AppSheet-era residue: keep or retire |
| 106 | ALL-CI-06 | overall | S4 | confirmed | std | S | none | W3 | Database and bridge workflows run twice per PR commit on Windows runners |
| 107 | ALL-CI-08 | overall | S4 | confirmed | bug | S | none | W3 | Browser tests write into tracked evidence files |
| 108 | ALL-DOC-01 | overall | S4 | confirmed | doc | S | none | W6 | Dead link to a local-only dictionary snapshot |
| 109 | ALL-DOC-02 | overall | S4 | confirmed | doc | S | none | W6 | Three broken anchors in the inventory and tracker |
| 110 | ALL-DOC-03 | overall | S4 | confirmed | doc | S | none | W6 | Link into a sibling repository that is not present |
| 111 | ALL-DOC-07 | overall | S4 | confirmed | doc | S | none | W6 | Change notes: readable sentences, unreadable paragraphs |
| 112 | ALL-DOC-08 | overall | S4 | confirmed | doc | S | owner decision | W6 | Change-note volume |
| 113 | ALL-PRIV-03 | overall | S4 | confirmed | doc | S | none | W1 | Over-1 MB evidence is kept alive by one-off scripts |
| 114 | ALL-PRIV-04 | overall | S4 | confirmed | doc | S | none | W1 | A second, larger evidence tree outside the rule |
| 115 | ALL-STD-01 | overall | S4 | confirmed | std | S | none | W3 | Business-date logic is re-implemented in many places |
| 116 | ALL-STD-04 | overall | S4 | confirmed | std | S | none | W3 | Logs have no common shape |
| 117 | ALL-STD-05 | overall | S4 | confirmed | doc | S | none | W6 | Naming and identifier rules exist only by habit |
| 118 | APP-ARCH-02 | app | S4 | confirmed | std | S | none | W3 | Reviewers misread PROD code as DEV-only; release risk through confusion. |
| 119 | APP-ARCH-04 | app | S4 | confirmed | arch | S | none | W3 | Hard to see which code each Cloud Run role ships or depends on. |
| 120 | APP-ARCH-05 | app | S4 | confirmed | arch | S | none | W3 | Behaviour verified in the synthetic shell can differ from the shipped shell; a local `npm run check` passes wh |
| 121 | APP-AUTH-02 | app | S4 | confirmed | std | S | none | W3 | DEV accepts claims PROD rejects. A fix applied to one copy will miss the others. |
| 122 | APP-AUTH-03 | app | S4 | confirmed | std | S | none | W3 | Inconsistent behaviour and no request logging on the notification surface. No data exposure found: the browser |
| 123 | APP-AUTH-04 | app | S4 | confirmed | arch | S | owner decision | W3 | Acceptable for two users; it means DEV sign-in is also PROD authentication. |
| 124 | APP-AUTH-05 | app | S4 | confirmed | bug | S | none | W3 | Wrong status code only. |
| 125 | APP-AUTH-06 | app | S4 | confirmed | std | S | infra change | W3 | A recreated service account with the same email would be accepted by the workers but not by the agent APIs. Lo |
| 126 | APP-NOTIFY-01 | app | S4 | confirmed | risk | S | owner decision | W3 | A read-only member can register push devices for themselves. Low risk, but it does not match the `command`-for |
| 127 | APP-NOTIFY-02 | app | S4 | confirmed | ux | S | none | W5 | Edge on Windows (WNS `*.notify.windows.com`) subscriptions are rejected as `invalid_subscription`. |
| 128 | APP-OFFLINE-06 | app | S4 | confirmed | arch | S | none | W3 | Unused server code path (`business/offline-dataset.mjs` v1 reader) to maintain and test. |
| 129 | APP-PAY-05 | app | S4 | confirmed | arch | S | none | W3 | Two sources of truth; the JS copy can drift silently. |
| 130 | APP-PAY-07 | app | S4 | confirmed | std | S | owner decision | W3 | Changing who disburses loans needs a code release, and the rule is undocumented. |
| 131 | APP-PERF-01 | app | S4 | confirmed | std | S | none | W3 | About 3 MB of logos and 0.8 MB of JS on every service-worker install over mobile. |
| 132 | APP-SEC-02 | app | S4 | confirmed | ux | S | owner decision | W5 | Blocks text zoom (WCAG 1.4.4). The UX worker covers visual checks. |
| 133 | APP-SEC-03 | app | S4 | confirmed | std | S | none | W3 | Identity and target changes need edits in many places. |
| 134 | APP-SEC-04 | app | S4 | confirmed | std | S | none | W3 | Browser-only packages are installed in every Cloud Run image (size, attack surface, audit noise). |
| 135 | APP-TEST-01 | app | S4 | confirmed | risk | S | none | W3 | In cloud sessions the live-shell suite cannot be validated and the specs silently read the real DEV site (GET  |
| 136 | APP-TEST-04 | app | S4 | confirmed | std | S | none | W3 | Running the suite dirties committed evidence; a careless `git add -A` after a local run commits regenerated sc |
| 137 | APP-UX-A11Y-02 | app (ux) | S4 | confirmed | ux | S | none | W5 | The pure-red KPI colour is the weakest text colour in the app and is used for the most important number; it wo |
| 138 | APP-UX-A11Y-03 | app (ux) | S4 | confirmed | ux | S | none | W5 | Several informational texts sit at 12px on a phone, below the 14px the rest of the app uses for captions. |
| 139 | APP-UX-BORROWER-01 | app (ux) | S4 | confirmed | ux | S | none | W5 | "TE" is an AppSheet-era abbreviation the English UI never explains, and an empty English name leaves a danglin |
| 140 | APP-UX-BORROWER-03 | app (ux) | S4 | confirmed | ux | S | none | W5 | Screen readers announce an unnamed combo box; clicking the caption does not focus it. |
| 141 | APP-UX-BORROWER-04 | app (ux) | S4 | confirmed | ux | S | none | W5 | The destructive action sits beside the most-used ones with no visual distinction; on mobile it is an unlabeled |
| 142 | APP-UX-BORROWER-05 | app (ux) | S4 | confirmed | ux | S | none | W5 | On a phone the user fills 12 fields before seeing Save/Cancel, and the numeric/phone-style fields open the def |
| 143 | APP-UX-BORROWER-06 | app (ux) | S4 | confirmed | ux | S | none | W5 | Negative money is formatted two ways across adjacent screens. |
| 144 | APP-UX-CASH-01 | app (ux) | S4 | confirmed | ux | S | none | W5 | Two date notations on one screen; for a Thai operator on an en-US device the month/day order is ambiguous. |
| 145 | APP-UX-CASH-02 | app (ux) | S4 | confirmed | ux | S | none | W5 | On mobile the statement (the actionable part) is below ~1,300px of KPIs that the Dashboard already shows; the  |
| 146 | APP-UX-CASH-03 | app (ux) | S4 | confirmed | ux | S | owner decision | W5 | Partner names are baked into UI strings; the Management › Partners screen already carries partner records, so  |
| 147 | APP-UX-COLLECT-01 | app (ux) | S4 | confirmed | ux | S | none | W5 | Same chip position carries two meanings; the legend "Left: remaining · Right: collected today" does not cover  |
| 148 | APP-UX-COLLECT-02 | app (ux) | S4 | confirmed | ux | S | none | W5 | After scrolling past a heading, colour is the only status cue; fails WCAG 1.4.1 for colour-blind readers. |
| 149 | APP-UX-COLLECT-03 | app (ux) | S4 | confirmed | ux | S | none | W5 | Loan links inside charge rows are under the 44px target the rest of the app enforces; mis-taps open the charge |
| 150 | APP-UX-COLLECT-04 | app (ux) | S4 | confirmed | ux | S | none | W5 | A bare "0%" next to the search icon has no visible caption; operators cannot tell what is loading or whether i |
| 151 | APP-UX-I18N-01 | app (ux) | S4 | confirmed | ux | S | none | W5 | Thai screen-reader users hear "Pagination" and "Loan Manager" (the old product name) in English; otherwise Tha |
| 152 | APP-UX-I18N-02 | app (ux) | S4 | confirmed | ux | S | none | W5 | None observed; recorded so the owner knows Thai layout was checked at both widths. |
| 153 | APP-UX-NAV-01 | app (ux) | S4 | confirmed | ux | S | none | W5 | 12px text, no spacing and permanent placement make the single most frequent status message in the app the leas |
| 154 | APP-UX-NAV-02 | app (ux) | S4 | confirmed | ux | S | none | W5 | On a 1280×800 laptop the sidebar needs its own scroll to reach EN/ไทย, install and Sign out. |
| 155 | APP-UX-NAV-03 | app (ux) | S4 | confirmed | ux | S | none | W5 | Two identical icons on one screen do different things (open receive form vs. go to Payments list). |
| 156 | APP-UX-PERF-02 | app (ux) | S4 | confirmed | ux | S | infra change | W5 | Hashed, immutable assets are refetched on every navigation that bypasses the service worker (first load, SW up |
| 157 | APP-UX-PERF-03 | app (ux) | S4 | confirmed | ux | S | none | W5 | Load performance is good. The missing headers are already item 5 of the App brief (A + F); noted here only as  |
| 158 | APP-UX-RECEIVE-02 | app (ux) | S4 | confirmed | ux | S | none | W5 | Nested scrolling on touch devices hides charges (4 rows need 617px, box is 371px) and makes it easy to scroll  |
| 159 | APP-UX-RECEIVE-03 | app (ux) | S4 | confirmed | ux | S | none | W5 | The review screen repeats the borrower name twice and shows the receiving account and date/method as bare valu |
| 160 | APP-UX-RECEIVE-05 | app (ux) | S4 | confirmed | ux | S | none | W5 | The UUID is meaningless to the two operators; the useful next action (open "Waiting to sync") is not offered h |
| 161 | APP-UX-RECEIVE-06 | app (ux) | S4 | confirmed | ux | S | none | W5 | Disabled-until-amount button is barely readable and there is no hint that typing an amount enables it. |
| 162 | APP-UX-SETTINGS-02 | app (ux) | S4 | confirmed | ux | S | none | W5 | Before sign-in the header advertises a Dashboard, a disabled refresh with a Borrowers label, and a hamburger t |
| 163 | APP-UX-SETTINGS-03 | app (ux) | S4 | confirmed | ux | S | none | W5 | The user cannot see whether notifications are on for this device without pressing "Check notification status". |
| 164 | APP-UX-SETTINGS-05 | app (ux) | S4 | confirmed | ux | S | none | W5 | Sign-out is one mis-tap from the language switch; signing out purges the offline repository (`live-main.tsx:33 |
| 165 | DB-ACCESS-04 | db | S4 | confirmed | std | S | none | W3 | No bypass found. Residual: the depth check accepts any trigger context at depth ≥ 2, not specifically the CRUD |
| 166 | DB-ACCESS-05 | db | S4 | confirmed | std | S | owner decision | W3 | Dormant login principals widen the inventory operators must reason about. |
| 167 | DB-AGENTDB-03 | db | S4 | confirmed | std | S | none | W4 | One-time provisioning script that cannot run from the documented Linux path; schema carries SQLite conventions |
| 168 | DB-BACKUP-02 | db | S4 | confirmed | std | S | none | W3 | Sprawl; each copies connection and bucket handling, so a secret-path change must be repeated 28 times. |
| 169 | DB-BACKUP-05 | db | S4 | confirmed | std | S | owner decision | W3 | Indefinite retention of full borrower dumps per release. |
| 170 | DB-CI-03 | db | S4 | confirmed | std | S | none | W3 | Dead or silently rotting suites. |
| 171 | DB-CI-04 | db | S4 | confirmed | std | S | none | W3 | Every PR branch push runs the 15–20 minute Windows job twice. |
| 172 | DB-DOC-01 | db | S4 | confirmed | doc | S | none | W6 | Dictionary says latest migration V91; database README says V92 |
| 173 | DB-DOC-02 | db | S4 | confirmed | doc | S | none | W6 | `settings/` and misspelled `settingss/` both exist and are both indexed |
| 174 | DB-DOC-03 | db | S4 | confirmed | doc | S | none | W6 | `pwa_submit_operation_v2` entry does reflect V92; provenance fields are mixed |
| 175 | DB-DOC-04 | db | S4 | confirmed | doc | S | none | W6 | Payments trigger list: no drift found; overview is silent |
| 176 | DB-DOC-05 | db | S4 | confirmed | doc | S | none | W6 | `database/OWNERSHIP.md` still describes three repositories |
| 177 | DB-LOCK-02 | db | S4 | confirmed | arch | S | schema change | W4 | Dead state machine columns; nothing wrong today. |
| 178 | DB-LOCK-03 | db | S4 | confirmed | std | S | none | W4 | target,0)` (`V83:141-857`, `V85:37-382`, `V90:135`); `pg_locks` shows the database OID (Checks executed). `pay |
| 179 | DB-PERF-04 | db | S4 | confirmed | std | S | infra change | W4 | No per-query telemetry when a slow endpoint is reported. |
| 180 | DB-SCHEMA-04 | db | S4 | confirmed | std | S | none | W4 | `money` formatting depends on `lc_monetary`; arithmetic needs explicit `::numeric` casts everywhere. Existing  |
| 181 | DB-SCHEMA-05 | db | S4 | confirmed | std | S | none | W4 | definition`; `V32:9` `UPDATE public."Partners" SET "AI Reviewer" = true …` selects a business row inside schem |
| 182 | DB-SCHEMA-07 | db | S4 | confirmed | std | S | none | W4 | The only Linux Flyway runner cannot migrate anything newer than V58; it is dead code that reads as a supported |
| 183 | AGT-DOC-04 | agent | S4 | confirmed | doc | M | none | W6 | `docs/POSTGRESQL_OPERATIONS.md` treats AppSheet as the live API |
| 184 | AGT-QUALITY-01 | agent | S4 | confirmed | std | M | none | W3 | Duplicated helpers and broad excepts |
| 185 | ALL-CI-04 | overall | S4 | confirmed | std | M | none | W3 | No lint, format or type check outside the PWA (proportionate toolchain proposal) |
| 186 | ALL-CI-07 | overall | S4 | confirmed | std | M | none | W3 | Promotion tooling grows a branch per release |
| 187 | ALL-DOC-04 | overall | S4 | confirmed | doc | M | owner decision | W6 | Reading load before a routine change |
| 188 | ALL-DOC-05 | overall | S4 | confirmed | doc | M | none | W6 | Same pins repeated across documents and dictionary files |
| 189 | ALL-DOC-06 | overall | S4 | confirmed | doc | M | owner decision | W6 | `Development_Changes.md` is titled "Open" but keeps all released history |
| 190 | ALL-DOC-09 | overall | S4 | confirmed | doc | M | owner decision | W6 | `project/outputs` retention: within the letter of the rule, 155 MB in practice |
| 191 | ALL-DOC-10 | overall | S4 | confirmed | doc | M | owner decision | W6 | Monitoring documents are larger than the PWA documents |
| 192 | ALL-STD-02 | overall | S4 | confirmed | std | M | none | W3 | Project id, number and service URLs are hard-coded |
| 193 | ALL-STD-03 | overall | S4 | confirmed | std | M | none | W3 | Four error-code vocabularies with no catalogue |
| 194 | APP-ARCH-03 | app | S4 | confirmed | std | M | none | W3 | Fixes and timeout policy drift between services. |
| 195 | APP-QUALITY-01 | app | S4 | confirmed | std | M | none | W3 | Review and diff quality suffer; type errors in services surface only at runtime or in tests. |
| 196 | DB-AGENTDB-04 | db | S4 | confirmed | std | — | none | W4 | Sound defaults; no finding. Recorded for the access inventory. |
| 197 | DB-PAY-01 | db | S4 | confirmed | std | — | none | W4 | Guard holds. Seven definitions make the history hard to read (DB-SCHEMA-01). |
| 198 | DB-PAY-02 | db | S4 | confirmed | std | — | none | W4 | No defect found by static read; the probe could not reach these guards without a larger fixture. |
| 199 | DB-PERF-02 | db | S4 | confirmed | std | — | none | W4 | No performance defect at current scale. |
| 200 | DB-SCHEMA-08 | db | S4 | confirmed | std | — | none | W4 | Expand/contract is being followed. |
| 201 | AGT-DOC-08 | agent | S4 | likely | doc | S | none | W6 | README says the PostgreSQL design is not deployed |
| 202 | AGT-HOST-02 | agent | S4 | likely (directory modes not readable wit | risk | S | owner decision | W3 | Credentials are plaintext files; the Graph refresh token is writable by four units |
| 203 | AGT-PRIV-01 | agent | S4 | likely (journal not readable) | doc | S | none | W1 | Scheduled output is aggregate; only operator commands print content |
| 204 | AGT-QUALITY-05 | agent | S4 | likely | std | S | owner decision | W3 | One-off activation scripts outlive their purpose |
| 205 | AGT-STATE-03 | agent | S4 | likely | risk | S | none | W3 | The reply scan re-reads every reply since the review cutoff every 20 seconds |
| 206 | ALL-INFRA-06 | overall | S4 | likely | std | S | infra change | W3 | Artifact Registry repositories keep every image |
| 207 | APP-PAY-06 | app | S4 | likely | std | S | none | W3 | The outcome is in fact "not applied". Reconciliation recovers, but the user sees "unknown" for a known failure |
| 208 | APP-UX-SETTINGS-04 | app (ux) | S4 | likely | ux | S | none | W5 | The app may reload itself mid-session (list position, search, expanded groups lost) without telling the user w |
| 209 | ALL-DOC-11 | overall | S4 | likely | doc | M | owner decision | W6 | `AGENTS.md` is a manual, not a front page |
| 210 | APP-ARCH-06 | app | S4 | likely | arch | M | none | W3 | At two users and about 45 components, a router library or i18n framework is not warranted. The real cost is th |
| 211 | ALL-INFRA-05 | overall | S4 | hypothesis (no load observed) | risk | S | none | W3 | PROD API capacity: one instance, five requests |
| 212 | APP-DATE-02 | app | S4 | hypothesis | risk | S | none | W3 | If WebKit rejects it, timestamps render as `—` on iPhone. |
| 213 | ALL-DOC-12 | overall | S4 | hypothesis (design proposal) | doc | L | owner decision | W6 | Recommended simplified structure (no new process) |

## Summary

| Severity | Count |
| --- | --- |
| S1 | 0 |
| S2 | 1 |
| S3 | 16 |
| S4 | 29 |
| Total | 46 |

Counts by section: Architecture 8, Delivery and CI 8, Infrastructure 6, Monitoring/cost 3, Evidence privacy 4, Standardization 5, Documentation and process system 12 (merged from Agent D).

Top 5 items for the owner:
1. ALL-PRIV-01: the public repository contains real borrower financial data. Make it private now, then delete the files and decide on a history purge.
2. ALL-INFRA-01: `codex-cloud` is a project Owner with two non-expiring keys from an environment variable. Delete the unused key, rotate, and consider narrower roles.
3. ALL-INFRA-02: SSH and RDP are open to 0.0.0.0/0 on the default network where the agent VM has a public IP. Delete the two default rules.
4. ALL-MON-01 / ALL-COST-01: none of the last four post-release failures would have alerted, and there is no budget. Add three Grafana rules and one console budget.
5. ALL-CI-01 / ALL-ARCH-01: `main` is red with no protection, and DEV runs a different command composition from PROD (the R060 class). Add retries plus a required check, then plan running DEV on `business-server.mjs`.
