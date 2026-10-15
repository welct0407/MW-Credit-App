# Independent review — overall (cross-cutting) — 15 October 2026

Baseline 0995868. Scope: cross-cutting architecture, delivery/CI, `infrastructure/`, monitoring/cost/third parties, evidence privacy and standardization. Component detail lives in the three component notes and is referred to by area name, not repeated:

- App: `Change Logs/CHANGE_NOTES_REVIEW_APP_2026-10-15.md`
- Database: `Change Logs/CHANGE_NOTES_REVIEW_DATABASE_2026-10-15.md`
- Agent: `integration-agent/Change Logs/CHANGE_NOTES_REVIEW_AGENT_2026-10-15.md`

Method: read the runtime entry files (`services/production/business-server.mjs`, `business-runtime.mjs`, `services/payment-command/dev-server.mjs`, `services/api/dev-read-server.mjs`, `services/workers/server.mjs`, `services/notifications/postcommit.mjs`, agent `conversation_dml.py`, `outbox.py`, `receipt_api.py`, `conversation_api.py`, `config.py`), all 19 Terraform roots and the workers module, the five workflows, `Dockerfile`, four `cloudbuild*.yaml`, `scripts/deploy-hosting.mjs`, `scripts/promotion/*.mjs` headers, `tsconfig.json`, `.claude/settings.json`, `project/scripts/cloud-session-setup.sh`, `scripts/azure-cloud-session.sh`, `infrastructure/unattended-admin/README.md`, the Grafana runbook and `Development_Changes.md` R058–R063. Ran `terraform fmt`/`init -backend=false`/`validate` for every root in a scratch `TF_DATA_DIR`, read-only `gcloud` and GitHub Actions readbacks, bounded greps for standardization counts, and a bounded privacy sample (18 text matches classified with digits masked, 4 images opened, 3 workbooks inspected by structure only). Read-only; no source, DEV, Debian or PROD change. No `terraform plan` or `apply`.

Orchestrator: Claude Fable 5.1, medium effort (owner setting). An earlier Opus review of this group was re-verified, not copied.

Tool limitation (stated once for the whole review): review workers run as the Claude family and effort chosen by the orchestrator; the exact model ids in `Model_Work_Mapping.md` cannot be selected from the Agent tool.

## Checks executed

| Check | Command | Result |
| --- | --- | --- |
| Terraform format | `terraform fmt -check -recursive infrastructure` | exit 0, no files listed (Terraform v1.16.5) |
| Terraform init/validate, 19 roots | `TF_DATA_DIR=<scratch> terraform -chdir=infrastructure/<root> init -backend=false -input=false -lockfile=readonly`, then `validate` | init 0 and "Success! The configuration is valid." for bootstrap, dev, dev-dns, ecosystem-azure, ecosystem-azure-metadata, ecosystem-bridge, ecosystem-debian, ecosystem-dns, ecosystem-shared, ecosystem-tailnet, ecosystem-tunnels, grafana, grafana-access, network-operator-secrets, production, production-bootstrap, production-dns, production-state-bootstrap, unattended-admin. `git status --short` empty afterwards |
| Project IAM | `gcloud projects get-iam-policy clever-oasis-508610-n7 --format=json` (members filtered in Python) | `roles/owner`: `codex-cloud` SA, `mw-credit-unattended-admin` SA, one human user. `codex-cloud` also holds custom `codexCloudVmLookup` |
| `codex-cloud` keys | `gcloud iam service-accounts keys list --iam-account=codex-cloud@…` | 1 system-managed; 2 user-managed created 2026-10-01 and 2026-10-15, both expire 9999-12-31 |
| Firewall | `gcloud compute firewall-rules list` | `default-allow-ssh 0.0.0.0/0 tcp:22`, `default-allow-rdp 0.0.0.0/0 tcp:3389`, `default-allow-icmp 0.0.0.0/0`, `default-allow-internal 10.128.0.0/9`, `allow-ssh-iap-mw-integration-agent 35.235.240.0/20 tcp:22` |
| Compute | `gcloud compute instances list`; `disks describe vm-mw-credit-agent` | `vm-mw-credit-agent` e2-small, NAT IP present, `deletionProtection: False`; disk attached to `default-schedule-1` |
| Cloud Run / Scheduler | `gcloud run services list`; `gcloud scheduler jobs list` | 10 services (incl. `mw-credit-app-api-dev`, max 2, ingress all). 7 jobs: 3 PROD app jobs ENABLED, 3 DEV app jobs PAUSED, `mw-grafana-dispatch` ENABLED (`Asia/Singapore`) |
| Legacy API traffic | `gcloud logging read … service_name="mw-credit-app-api-dev" --freshness=30d --limit=5` | Latest entries 2026-10-07: one `/api/borrowers`, the rest `/readyz` |
| Cloud Monitoring | `gcloud monitoring policies list`; `gcloud monitoring uptime list-configs` | 0 alert policies; 1 uptime check (`MW webhook external health`, `hooks.mw-credit.com/health`, 300 s) |
| Grafana rules | parsed `infrastructure/grafana/owned-services.tf.json` | 1 rule group `Performance 2m`, 10 rules (Metabase ×3, webhook, Cloud SQL ×3, Debian ×2, OpenAI status) |
| Billing | `gcloud billing projects describe clever-oasis-508610-n7`; `gcloud billing budgets list` | billing enabled, account linked; budgets: `billingbudgets.googleapis.com` not enabled and `codex-cloud` lacks billing-account permission |
| GitHub CI on `main` | `mcp__github__actions_list list_workflow_runs ci.yml branch=main` and `list_workflow_jobs 38763869056` | Latest 10 runs on `main` all `failure` (run 251 on 0995868 down to run 226); last success run 218 on `66af7a5` at 2026-10-14T17:41Z. In run 38763869056 steps 1–8 passed, step 9 `npm run test:e2e` failed, steps 10–15 (Terraform) skipped |
| Database workflow duplicates | `list_workflow_runs database.yml` | runs 176 (`push`) and 177 (`pull_request`) on the same sha `01c1067`, both `windows-latest` |
| Branch protection / visibility | `gh api repos/welct0407/MW-Credit-App/branches/main/protection`; `…/rulesets`; `… --jq .visibility` | 404 "Branch not protected"; 0 rulesets; `public` |
| Evidence size | `du -sh project/outputs outputs integration-agent/outputs` | 155 MB / 67 MB / 604 KB; tracked files 2747 / 1201 / 14; pack size 142 MiB |
| Files over 1 MB | `find … -size +1M` | 20, all in `project/outputs` (largest 8.3 MB) |
| Phone-shaped text scan | `grep -rlIE '(^\|[^0-9])0[689][0-9]{8}([^0-9]\|$)\|\+66[0-9]{9}'` over the three trees; Python classification with digits masked | 18 files; all 18 matches are digit runs embedded in longer hex tokens (hashes, ids). 0 standalone numbers |
| Image / workbook sample | `Read` of 4 PNGs; zip-structure counts of 3 XLSX (no cell values printed) | see ALL-PRIV-01/02 |
| Standardization counts | bounded `grep -c`/`grep -l` over services, PWA, agent, migrations, scripts | quoted in ALL-STD-* |

## Checks not run

| Check | Reason |
| --- | --- |
| `terraform plan` / `apply` | Forbidden in this review; needs remote state and authority |
| `terraform test` (6 `.tftest.hcl` files) | Runs plan under mocked providers; recorded as a CI gap (ALL-CI-03) instead |
| `gcloud alpha monitoring policies list` | Alpha component not installed; the GA `gcloud monitoring policies list` was used instead |
| Billing cost figures and budgets | `codex-cloud` cannot read the billing account; Budget API disabled |
| Railway / Metabase settings | Outside this review's authority (ALL-MON-03) |
| Full image/workbook classification | Bounded: 4 of 477 images and 3 of 36 workbooks opened (ALL-PRIV-02) |
| Trial linters (`checkJs`, ruff) | Not repeated; counts of missing configuration and long lines are sufficient for ALL-CI-04 |

## Findings

### Architecture

#### As-implemented component map

| # | Component | Runtime / entry | Callers and protocol | Caller authentication | Runtime identity | Data stores |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | PWA | Firebase Hosting `dev-lm` / `lm.mw-credit.com`; `apps/pwa/src/live-main.tsx` | Browser → HTTPS JSON to reader and command | Firebase ID token (Google sign-in; issuer pinned in `environment.ts:13,20`) | the user | IndexedDB (offline queue, datasets, receipt blobs), Cache Storage |
| 2 | Reader DEV | Cloud Run `mw-credit-app-read-dev`, `services/api/dev-read-server.mjs` (`infrastructure/dev/read-service.tf:31`) | PWA → GET | Firebase token, app-level only (`read-service.tf:18-19` ingress all, `invoker_iam_disabled`) | read SA, IAM DB auth | `loan_manager_dev` |
| 3 | Command DEV | Cloud Run `mw-credit-app-command-dev`, `services/payment-command/dev-server.mjs` (`command-service.tf:71`) | PWA → HTTPS; agent → HTTPS | uid-pinned single owner (`dev-server.mjs:33`, `OWNER_FIREBASE_UID` at `command-service.tf:111`); agent by Google OIDC | command SA, IAM DB auth (`dev-server.mjs:24-25`) | `loan_manager_dev`, GCS receipts |
| 4 | Reader / Command PROD | Cloud Run `mw-credit-app-{read,command}-prod`, `services/production/business-server.mjs` (`production/runtime.tf:105`) | PWA → HTTPS; agent → HTTPS | Firebase token plus SQL membership policy (`business-runtime.mjs:25-26`); ingress all, `invoker_iam_disabled` (`runtime.tf:61-62`) | per-role SA, IAM DB auth (`runtime.tf:130`) | `loan_manager_prod`, GCS receipts |
| 5 | Notify / jobs workers, DEV and PROD | Cloud Run `mw-credit-app-{notify,jobs}-{env}`, `services/workers/server.mjs` (`modules/dev-workers/main.tf:202`) | Command → POST `/internal/dispatch` (`notifications/postcommit.mjs:5-9,27-33`); Cloud Scheduler ticks (`main.tf:270-276`) | Google OIDC, IAM invoker (`main.tf:178`); jobs ingress internal only (`:177`) | worker SAs, IAM DB auth | business DB; Web Push endpoints |
| 6 | Integration agent | Debian `vm-mw-credit-agent`, systemd units, `integration-agent/src` | Meta → Cloudflare tunnel → loopback receiver; agent → command API | Meta HMAC inbound; metadata-server ID token outbound (`receipt_api.py:87-89`, `conversation_api.py:62-65`) | `mw-integration-agent` SA; password roles for SQL | `mw_agent` DB; direct `loan_manager_prod` DML as `mw_reviewer_dml` (`conversation_dml.py:59-72`) and relay as `mw_agent_relay` (`outbox.py:12-18`) |
| 7 | Cloud SQL | `appsheet-pg-prod-20260914`, `db-f1-micro`, 10 GB PD_HDD, ZONAL (`ecosystem-shared/owned.tf:20,35,43-44,51`) | all of the above | IAM DB auth (Cloud Run, cloud sessions); passwords (Debian proxy, VM-01 Flyway, Metabase) | — | `loan_manager_dev`, `loan_manager_prod`, `mw_agent` |
| 8 | Receipts bucket | `mw-payment-receipts-prod-508610-n7` (`owned.tf:137`) | command services, agent | IAM | — | GCS |
| 9 | Grafana Cloud + events bridge | Grafana stack; Cloud Run `mw-grafana-events` + Scheduler `mw-grafana-dispatch` | Grafana → bridge → Dots route | bridge secrets in Secret Manager | bridge SAs | Firestore |
| 10 | Metabase | Railway, outside Terraform | owner browser | Metabase accounts | `metabase_borrower_reader` DB login | `loan_manager_prod` (read), Railway PostgreSQL |
| 11 | Operators | Claude cloud session (`codex-cloud`, SA key from `GCP_SA_KEY_B64`, `cloud-session-setup.sh:150-173`); Azure VM-01 (UAMI); GitHub Actions WIF (`deploy-dev.yml:24-27`) | gcloud, Terraform, IAP SSH, Flyway | SA key; Azure↔GCP federation; GitHub OIDC | `codex-cloud` (Owner), `mw-credit-unattended-admin` (Owner), `mw-credit-app-deploy` | everything |

Business-logic placement: SQL owns money (triggers, allocation, cash, integrity; Database note). Node owns authentication, validation, idempotency and receipt handling. The PWA owns offline queueing. The agent is the one exception (ALL-ARCH-02). The split is consistent apart from that.

#### ALL-ARCH-01 DEV and PROD run different command compositions
- **Type**: arch
- **Severity**: S3
- **Confidence**: confirmed
- **Evidence**: DEV runs `services/payment-command/dev-server.mjs` (`infrastructure/dev/command-service.tf:71`) with `createDevCommandStore` (`store.mjs:336`, no `principalAllowed`/`resolveActor`, default `draftMode`), a uid-pinned verifier (`dev-server.mjs:33`) and `createDevNotificationHandler`. PROD runs `services/production/business-runtime.mjs` (`production/runtime.tf:105`) with `createEnvironmentCommandStore` (`store.mjs:341-343`, `draftMode:'production-business'`, membership policy) and `createEnvironmentCommandHandler`. The R060 PROD outage was a `production-business` veto that DEV could not exercise (`Development_Changes.md:75`). DEV worker schedulers are PAUSED (readback), so DEV never runs the daily-charge or notification jobs either.
- **Impact**: PROD-only branches (membership veto, second user, scheduled jobs) reach users without a DEV proof.
- **Recommendation**: Run DEV reader and command from `business-server.mjs` with DEV configuration (`APP_ENV=dev`, DEV membership policy, DEV origins), then retire `dev-server.mjs` and `dev-read-server.mjs`. Owner decision whether the DEV schedulers stay paused; if yes, say so in `Environment_Inventory.md`.
- **Effort**: L
- **Needs**: infra change, owner decision (schedulers)

#### ALL-ARCH-02 The agent writes PROD financial tables directly, outside the command API
- **Type**: arch
- **Severity**: S3
- **Confidence**: confirmed (code path); impact likely
- **Evidence**: `integration-agent/src/mw_integration_agent/conversation_dml.py:18-19` allows DML on 9 tables incl. `Payments`, `Charges`, `Cash Ledger`, `Settlements`; `:59-72` connects as `mw_reviewer_dml` with a password file, hard-coded to `loan_manager_prod` (no DEV target). `outbox.py:12-18` connects as `mw_agent_relay`, PROD-only. `Solution_Design.md:18` says PWA and agent payments converge on the native API/SQL command path.
- **Impact**: Two write paths into money tables with different authentication, idempotency and audit. The direct path cannot be rehearsed in DEV. SQL triggers still guard integrity (Database note).
- **Recommendation**: Owner decision: (a) document reviewer DML as an approved second path in `Solution_Design.md` and add a DEV target (`database_name` configurable, `mw_reviewer_dml_dev`), or (b) move reviewer edits behind a command-API operation. (a) is the smaller change.
- **Effort**: M (a) / L (b)
- **Needs**: owner decision

#### ALL-ARCH-03 Three database authentication styles and three secret stores
- **Type**: arch
- **Severity**: S3
- **Confidence**: likely
- **Evidence**: Cloud Run uses IAM DB auth (`business-server.mjs:10`, `dev-server.mjs:24`, `runtime.tf:130`). The agent uses password files (`config.py:76-77,105,198` validate `*_password_file`; `load_secret` at `:206`). VM-01 Flyway uses Windows password files and `scripts/database/Common.ps1:41` reads a Secret Manager version. Metabase holds a fourth password login.
- **Impact**: Rotation, audit and recovery differ per store; a Debian disk snapshot carries the password files (ALL-INFRA-04).
- **Recommendation**: Run the Debian Cloud SQL proxy with `--auto-iam-authn` and per-role IAM users (or one VM SA), removing the four database password files. Keep Meta/Graph tokens in files for now.
- **Effort**: M
- **Needs**: infra change

#### ALL-ARCH-04 One small shared Cloud SQL instance carries DEV, PROD and agent state
- **Type**: arch
- **Severity**: S3
- **Confidence**: likely (configuration confirmed, load not measured here)
- **Evidence**: `ecosystem-shared/owned.tf:35` ZONAL, `:43-44` 10 GB PD_HDD, `:51` `db-f1-micro`, `:90-91` `max_connections=200`. The Grafana runbook states an instance action affects all three databases.
- **Impact**: DEV rehearsals share one shared-core CPU with PROD; a zonal or maintenance event takes everything down. Database: performance holds the readback.
- **Recommendation**: Owner decision: (a) `db-g1-small` or 1 vCPU custom tier with SSD in place; or (b) a separate DEV instance. Keep zonal.
- **Effort**: S (a) / M (b)
- **Needs**: owner decision, infra change

#### ALL-ARCH-05 Foundation-era DEV API is still deployed and is the only CI-deployed service
- **Type**: arch
- **Severity**: S4
- **Confidence**: confirmed
- **Evidence**: `infrastructure/dev/main.tf:165-176` defines `mw-credit-app-api-dev` (ingress all, max 2). `deploy-dev.yml:39` deploys only it; `scripts/verify-dev.mjs` is its only reference. `Dockerfile:9` and `package.json` `start` default to `services/api/server.mjs`. Readback: last 30 days show health probes and a single `/api/borrowers` request on 2026-10-07. It is absent from `Environment_Inventory.md`.
- **Impact**: An unused, internet-reachable surface, and the one automated deployment targets a service nothing uses.
- **Recommendation**: Remove the service, `deploy-dev.yml`, `verify-dev.mjs` and the `start` script; leave `CMD` unset because Terraform sets `args`.
- **Effort**: S
- **Needs**: infra change

#### ALL-ARCH-06 Server image ships frontend packages
- **Type**: arch
- **Severity**: S4
- **Confidence**: confirmed
- **Evidence**: `package.json` `dependencies` include `firebase`, `react`, `react-dom`, `web-push`. `Dockerfile:4` runs `npm ci --omit=dev`. `grep -rhoE "from ['\"](firebase|react|react-dom|web-push)[/'\"]" services` returns nothing (services import `firebase-admin/*` only).
- **Impact**: Dead weight in every Cloud Run image and a wider server `npm audit` surface.
- **Recommendation**: Move `firebase`, `react`, `react-dom` to `devDependencies`; `web-push` is App: notifications.
- **Effort**: S
- **Needs**: none

#### ALL-ARCH-07 PROD workers use a module named `dev-workers`
- **Type**: std
- **Severity**: S4
- **Confidence**: confirmed
- **Evidence**: `infrastructure/production/workers.tf:23` `source = "../modules/dev-workers"`; the module branches on `var.environment == "prod"` (`modules/dev-workers/main.tf:26,168`).
- **Impact**: Misleads reviewers of PROD plans.
- **Recommendation**: Rename to `modules/workers`; update two `source` lines. Resource addresses are unchanged.
- **Effort**: S
- **Needs**: none

#### ALL-ARCH-08 AppSheet-era residue: keep or retire
- **Type**: arch
- **Severity**: S4
- **Confidence**: confirmed
- **Evidence**: instance name `appsheet-pg-prod-20260914` (`owned.tf:20`); 11 quoted-space tables vs 6 snake_case `CREATE TABLE` in migrations; `money` columns and `appsheet_ref_*` constraints (Database note); 36 AppSheet dictionary workbooks and 473 PNGs under `project/outputs` (ALL-PRIV-03/04).
- **Impact**: Confusion for new readers; renames cost more than they return.
- **Recommendation**: Keep the instance name, `Row ID`, quoted names and constraint names. Retire the AppSheet evidence and one-off scripts now (ALL-PRIV-03). Add one "naming legacy" paragraph to `database/README.md`.
- **Effort**: S (document) / L (any rename)
- **Needs**: owner decision

### Delivery and CI

Workflows: `ci.yml` (check, live build, audit, e2e on main push or `ci:checkpoint` label, Terraform for 2 roots); `database.yml` (`windows-latest` rebuild plus Linux runner-guard tests); `agent-tests.yml` (Python 3.13 unittest only); `deploy-dev.yml` (manual, legacy API only); `grafana-mcp-bridge.yml`. Hosting and Cloud Run delivery to DEV and PROD is operator-driven through four Cloud Build files, `scripts/deploy-hosting.mjs`, `scripts/promotion/deploy-business-hosting.mjs`, `scripts/production/deploy-foundation-hosting.mjs` and Terraform. That is proportionate for two users; the gaps follow.

#### ALL-CI-01 `main` is red on every push since R060 and nothing stops merges
- **Type**: risk
- **Severity**: S3
- **Confidence**: confirmed
- **Evidence**: GitHub Actions readback: the latest 10 `ci.yml` runs on `main` (run 226 through 251, including baseline 0995868) all concluded `failure`; last success was run 218 on `66af7a5` (2026-10-14T17:41Z). Run 38763869056: step 9 `npm run test:e2e` failed; everything before it passed. Branch protection 404, 0 rulesets. `playwright.config.ts` sets no `retries`. `Development_Changes.md:26` records the earlier red streak R061→R063.
- **Impact**: Regressions and flakes look the same; a real failure on `main` is invisible. App: tests owns the failing specs.
- **Recommendation**: (1) `retries: process.env.CI ? 1 : 0` so flakes report as flaky. (2) `test.fixme` the known flakes with a one-line reason. (3) One ruleset on `main` requiring the `test` check; no reviewer requirement.
- **Effort**: S
- **Needs**: none

#### ALL-CI-02 Browser tests run after merge, not before
- **Type**: risk
- **Severity**: S3
- **Confidence**: confirmed
- **Evidence**: `.github/workflows/ci.yml:25-28`: Playwright runs on `push` or only when the `ci:checkpoint` label is added to a PR.
- **Impact**: UI regressions land on `main` first (ALL-CI-01).
- **Recommendation**: Run e2e on PRs that change `apps/pwa/**`, `tests/e2e/**` or `playwright.config.ts` (path filter step); keep label-only for the rest. A run is about 12 min (run 38763869056).
- **Effort**: S
- **Needs**: none

#### ALL-CI-03 Terraform CI covers 2 of 19 roots and runs no Terraform tests
- **Type**: risk
- **Severity**: S3
- **Confidence**: confirmed
- **Evidence**: `ci.yml:33-36` validates only `dev` and `dev-dns`. Six `.tftest.hcl` files exist under `infrastructure/*/tests` and no workflow runs `terraform test`. All 19 roots validate locally (Checks executed).
- **Impact**: A broken `production` or `ecosystem-*` root is found at operator plan time.
- **Recommendation**: Matrix job over the 19 roots (`init -backend=false -lockfile=readonly`, `validate`, provider cache) plus `terraform test` for the four roots with tests; no cloud credentials needed.
- **Effort**: S
- **Needs**: none

#### ALL-CI-04 No lint, format or type check outside the PWA (proportionate toolchain)
- **Type**: std
- **Severity**: S4
- **Confidence**: confirmed
- **Evidence**: `tsconfig.json:16-18` `include: ["apps/pwa/src"]`; `services/**/*.mjs` and `tests/e2e` are never type-checked. No `eslint`, `prettier`, `biome` or `ruff` configuration exists (`ls` of the usual files fails; `package.json` and `pyproject.toml` name none). Lines over 400 characters: services 137, PWA 379, e2e 521. `agent-tests.yml:35-40` runs unittest only.
- **Impact**: Wrong-argument and undefined-property bugs in services are found only by tests; the dense style makes review slow.
- **Recommendation**: Three independent, small steps, sized for a two-user app:
  1. `tsconfig.services.json` (`allowJs`, `checkJs`, `strict:false`, `include: services/**/*.mjs`) added to `npm run check`; fix or `@ts-expect-error` what it reports.
  2. `ruff check --select E9,F,B` in `agent-tests.yml` (no formatter).
  3. Optional: Biome lint-only for TS/JS; format later in one commit listed in `.git-blame-ignore-revs`.
  Skip ESLint+Prettier and mypy.
- **Effort**: M overall
- **Needs**: none

#### ALL-CI-05 Inconsistent action pinning
- **Type**: std
- **Severity**: S4
- **Confidence**: confirmed
- **Evidence**: `ci.yml:16-17,29` and `deploy-dev.yml:16-17,24,28` use floating tags (`@v4`, `@v3`); `agent-tests.yml`, `database.yml` and `grafana-mcp-bridge.yml` pin SHAs (readback: 5 SHA-pinned `checkout`, 2 tag-pinned). `deploy-dev.yml` holds `id-token: write` and WIF to `mw-credit-app-deploy`, but that identity deploys only the unused DEV API (ALL-ARCH-05) under the `development` environment.
- **Impact**: A moved tag could run with the DEV deploy identity. Small, because no PROD or Hosting credential is in Actions.
- **Recommendation**: Pin all actions to SHAs with a version comment; if ALL-ARCH-05 deletes `deploy-dev.yml`, only `ci.yml` remains.
- **Effort**: S
- **Needs**: none

#### ALL-CI-06 Database and bridge workflows run twice per PR commit on Windows runners
- **Type**: std
- **Severity**: S4
- **Confidence**: confirmed
- **Evidence**: `database.yml:3-7` triggers on `push: branches: ['**']` and `pull_request`; `grafana-mcp-bridge.yml:2-7` likewise. Readback: runs 176 (`push`) and 177 (`pull_request`) on the same sha `01c1067`. Both use `windows-latest` (`database.yml:13`, `grafana-mcp-bridge.yml:39`).
- **Impact**: Doubled queue time; minutes bill at the Windows rate if the repository goes private (ALL-PRIV-01).
- **Recommendation**: `push` on `main` only (as `agent-tests.yml:7-9`), plus a `concurrency` group with `cancel-in-progress`.
- **Effort**: S
- **Needs**: none

#### ALL-CI-07 Promotion tooling grows a branch per release and Hosting delivery exists three times
- **Type**: std
- **Severity**: S4
- **Confidence**: confirmed
- **Evidence**: `grep -oh "R0[0-9][0-9]" scripts/promotion/*.mjs`: R052×1, R053×19, R054×3, R059×4, R061×5, R062×41. `ui-hosting-plan.mjs:9` hard-codes release R054 and a commit. `deploy-business-hosting.mjs` is 41 KB. Three separate Firebase Hosting REST uploaders exist: `scripts/deploy-hosting.mjs` (DEV), `scripts/promotion/deploy-business-hosting.mjs` (PROD), `scripts/production/deploy-foundation-hosting.mjs`. Four Cloud Build files; `cloudbuild.yaml` has no smoke step.
- **Impact**: Each release adds code the next release must keep passing.
- **Recommendation**: One manifest-driven Hosting runner for DEV and PROD; one image build config with the smoke step; delete the R053/R054 and foundation paths once their recovery pins are superseded.
- **Effort**: M
- **Needs**: none

#### ALL-CI-08 Browser tests write into tracked evidence files
- **Type**: bug
- **Severity**: S4
- **Confidence**: confirmed
- **Evidence**: 21 files in `tests/e2e` write under `outputs/r052-*` (top targets `outputs/r052-phase6`, `outputs/r052-phase5-completion`, 11 specs each). `outputs/` has 1201 tracked files; `.gitignore:11` ignores only `test-results/`.
- **Impact**: Every local e2e run dirties the tree with binary churn that agents must then avoid committing.
- **Recommendation**: Write captures to `test-results/`; delete the tracked `outputs/r052-*` captures or keep one reference set that is never overwritten.
- **Effort**: S
- **Needs**: none

#### ALL-CI-09 A failing e2e step skips the Terraform checks on `main`
- **Type**: risk
- **Severity**: S4
- **Confidence**: confirmed
- **Evidence**: `ci.yml` runs all steps in one job in sequence; in run 38763869056 steps 10–15 (`setup-terraform`, `fmt`, `init`, `validate` ×2) were `skipped` after step 9 failed. With ALL-CI-01, no `main` push since 2026-10-14 has had its Terraform checked by CI.
- **Impact**: Infra validation silently stops while `main` is red.
- **Recommendation**: Split Terraform into its own job (or add `if: always()` to those steps). This also makes ALL-CI-03's matrix natural.
- **Effort**: S
- **Needs**: none

### Infrastructure

Positive: every root pins Terraform `= 1.16.5` and providers exactly; lockfiles are committed; `fmt` and `validate` are clean on all 19 roots. Shared SQL, bucket, Debian and address resources carry `prevent_destroy`. PROD services pin image digests by validation (`runtime.tf:28`). Cloud SQL public IP, authorized network, `connector_enforcement`, pg_cron flags, backups and PITR belong to the Database note and are not repeated.

#### ALL-INFRA-01 The cloud executor is a project Owner signed in with non-expiring keys
- **Type**: risk
- **Severity**: S3
- **Confidence**: confirmed
- **Evidence**: Readback: `codex-cloud` has `roles/owner` and 2 user-managed keys (created 2026-10-01 and 2026-10-15, expiry 9999-12-31). The key is read from `GCP_SA_KEY_B64` (`project/scripts/cloud-session-setup.sh:150-173`). `codex-cloud` also holds Token Creator on `mw-credit-unattended-admin` (also Owner; `unattended-admin/main.tf:68-70,117-119`) and the Azure federated credential (`main.tf:55`). The Owner binding of `codex-cloud` is in no Terraform root (`grep -rln codex-cloud infrastructure` → only `unattended-admin`). The unattended-admin README calls the design keyless; the chain starts from this key.
- **Impact**: Whoever reads the environment key controls the whole GCP project and the Azure resource group, indefinitely.
- **Recommendation**: (1) Delete the key the environment does not use. (2) Rotate every 90 days by calendar. (3) Declare the Owner binding in `unattended-admin` so it is reviewable. (4) Owner decision: replace Owner with Editor plus `projectIamAdmin`, `secretmanager.admin`, `iam.serviceAccountTokenCreator`.
- **Effort**: S (1–3) / M (4)
- **Needs**: owner decision

#### ALL-INFRA-02 SSH and RDP are open to the internet on the default network
- **Type**: risk
- **Severity**: S3
- **Confidence**: confirmed
- **Evidence**: Readback: `default-allow-ssh 0.0.0.0/0 tcp:22`, `default-allow-rdp 0.0.0.0/0 tcp:3389`, neither in Terraform. The Debian VM has an external address on `default` (`ecosystem-debian/owned.tf:126-139`). The IAP rule already exists (`owned.tf:179-183`). Agent: credentials and host owns the `sshd` readback.
- **Impact**: The host holding plaintext secrets is exposed to internet SSH scanning; only key authentication protects it.
- **Recommendation**: Delete `default-allow-ssh` and `default-allow-rdp` (IAP SSH is the admin path). Import or document the remaining default rules.
- **Effort**: S
- **Needs**: infra change

#### ALL-INFRA-03 Security-relevant configuration sits outside Terraform
- **Type**: risk
- **Severity**: S3
- **Confidence**: confirmed
- **Evidence**: Owner bindings (3 members), custom role `codexCloudVmLookup`, the default firewall rules (ALL-INFRA-02) and the uptime check `MW webhook external health` (readback; referenced from `infrastructure/grafana/owned-services.tf.json`) are declared in no root. `grep -rniE 'google_monitoring|google_billing_budget' infrastructure` matches nothing.
- **Impact**: "Verified no-change plans" (`Environment_Inventory.md:44`) say nothing about who can administer the project.
- **Recommendation**: Add `google_project_iam_member` for each Owner, the custom role and the uptime check with `import` blocks to `unattended-admin` or `ecosystem-shared`. Adopt only Owner/Editor/custom roles, not every binding.
- **Effort**: M
- **Needs**: infra change

#### ALL-INFRA-04 Debian VM protection and disaster-recovery gaps
- **Type**: risk
- **Severity**: S3
- **Confidence**: confirmed
- **Evidence**: `ecosystem-debian/owned.tf:80` `deletion_protection = false` (readback `False`). The snapshot schedule `default-schedule-1` is attached (readback) but Terraform records `resource_policies = []` at `:93` and lists the policy only inside `initialize_params` at `:116`. `:158` scope `cloud-platform`; `:162` `enable_secure_boot = false`. Snapshots include `/etc/mw-integration-agent/secrets` (Agent note).
- **Impact**: Console deletion is unguarded; a changed snapshot policy would go unnoticed; snapshot readers get the secrets.
- **Recommendation**: `deletion_protection = true`; add `google_compute_disk_resource_policy_attachment` (import); one documented restore-to-new-VM rehearsal (Agent note owns the runbook).
- **Effort**: S
- **Needs**: infra change

#### ALL-INFRA-05 PROD API capacity: one instance, five requests, platform timeout shorter than app timeout
- **Type**: risk
- **Severity**: S4
- **Confidence**: hypothesis (no load observed)
- **Evidence**: `production/runtime.tf:96-100`: timeout 15 s, concurrency 5, max 1 instance. `business-server.mjs:12` pool `max:2`; `:14` `server.requestTimeout=20000`. Workers: max 1, concurrency 1 (`modules/dev-workers/main.tf:193-197`).
- **Impact**: Offline-dataset traversal plus agent calls plus the second user can queue behind two connections; a slow request is cut by Cloud Run before the app answers. Fine for two users today.
- **Recommendation**: `requestTimeout` below 15 s (e.g. 14000). Revisit `max_instance_count` only if 429s or latency appear (ALL-MON-01).
- **Effort**: S
- **Needs**: none

#### ALL-INFRA-06 Artifact Registry repositories keep every image
- **Type**: std
- **Severity**: S4
- **Confidence**: confirmed
- **Evidence**: `grep -rn cleanup_polic infrastructure` → only `ecosystem-bridge/owned.tf:284`. `dev/main.tf:69` and `production/main.tf:77` define the app repositories without a policy.
- **Impact**: Storage grows with every build.
- **Recommendation**: Cleanup policy keeping the 20 most recent versions; pinned digests in `Environment_Inventory.md` stay within that window or get a `KEEP` tag.
- **Effort**: S
- **Needs**: infra change

#### ALL-INFRA-07 Every cloud session holds Azure administrator tokens as a side effect of any Bash call
- **Type**: risk
- **Severity**: S4
- **Confidence**: confirmed
- **Evidence**: `.claude/settings.json` runs `scripts/azure-cloud-session.sh --session-start` on SessionStart and `--refresh` as a `PreToolUse` hook on every Bash call. The script mints a Google ID token for `api://AzureADTokenExchange` (`azure-cloud-session.sh:21`) into `~/.config/mw-azure/oidc-token`, which exchanges for the UAMI holding Contributor and RBAC Administrator on `rg-mwcredit` (`unattended-admin/main.tf:34-47`). The only Azure use case named in `CLAUDE.md` is VM-01 power.
- **Impact**: Sessions doing PWA or documentation work carry Azure admin authority they never need; a prompt-injected command can use it without any extra step.
- **Recommendation**: Drop the `PreToolUse` hook; keep `--session-start` off and mint on demand inside the three VM-01 power commands (`azure-cloud-session.sh <command>` already supports this).
- **Effort**: S
- **Needs**: owner decision

### Monitoring, cost and third parties

What alerts today: one Grafana rule group `Performance 2m` with 10 rules (`infrastructure/grafana/owned-services.tf.json`): Metabase component, Metabase backup, webhook external health, Cloud SQL connections/CPU/memory, Debian memory, Metabase Railway memory, Debian component, OpenAI status. Cloud Monitoring: 0 alert policies, 1 uptime check on `/health` (readback). Nothing covers the PWA reader/command services, the notify/jobs workers, Hosting, Cloud SQL disk or backups, CI, or cost.

Last five releases: what failed, and would an alert have fired?

| Release | Failure mode (source) | Detected by | Alert? |
| --- | --- | --- | --- |
| R058 | Webhook receiver kept pre-install code after the package update; inbound commands unprocessed until a manual reload (`Environment_Inventory.md:30`; Agent: R063 receiver) | Owner | No. `/health` is a constant, so the uptime check and Debian tile stayed green |
| R059 | Pre-release CI failures (cold 429/5xx, draft ids, Back responses) (`Development_Changes.md:83`) | CI before freeze | Not applicable |
| R060 | PROD command store returned 403 for offline-dataset reads (`Development_Changes.md:75`) | Owner saw blank data | No. No Cloud Run 4xx/5xx rule |
| R061 | e2e failed on every `main` push from R061 until the R063 repair (`Development_Changes.md:26`) | Noticed during later work | No. No branch protection or CI notification (ALL-CI-01) |
| R062 | (a) DEV V92 first apply failed on ownership and rolled back (runner guard); (b) language switch then navigation stranded screens, reached PROD (`Development_Changes.md:19-21,31`) | (a) runner; (b) testing after release | (a) not needed; (b) No client error signal |
| R063 | Open: carries (b) and receiver readiness | — | — |

None of the four post-release failures would have paged.

#### ALL-MON-01 No alert covers the PWA APIs, the workers or database storage and backups
- **Type**: risk
- **Severity**: S3
- **Confidence**: confirmed
- **Evidence**: `gcloud monitoring policies list` → 0. The 10 Grafana rules above. Services log JSON completion records (`business-server.mjs:6`, `workers/server.mjs:11`) but no log-based metric or alert consumes them.
- **Impact**: An outage like R060, or a failed 00:05 daily-charge run, is found only when a user notices.
- **Recommendation**: Three rules in the existing Grafana group via the existing GCP datasource and owner route: (1) Cloud Run `request_count` 5xx (and 403 spike) for `mw-credit-app-{command,read}-prod`; (2) no successful daily-charge run by 00:30 Bangkok (job-run table or Scheduler attempt failures); (3) Cloud SQL `disk/utilization` > 80%. Agent: R063 receiver owns a meaningful `/health`.
- **Effort**: M
- **Needs**: none

#### ALL-COST-01 No budget alert, and the operator cannot see billing
- **Type**: risk
- **Severity**: S3
- **Confidence**: confirmed
- **Evidence**: `gcloud billing projects describe` → billing enabled; `gcloud billing budgets list` → Budget API not enabled and `codex-cloud` lacks billing-account permission. No `google_billing_budget` in `infrastructure/`. The runbook names no Cost push rule (`Grafana_Alert_Troubleshooting_Runbook.md`, entry-point table).

  Billable set from Terraform and readback: Cloud SQL `db-f1-micro` + 10 GB HDD + 7 backups + PITR; Debian `e2-small` + static IP + 14-day snapshots; Azure VM-01 (part-time) + Recovery Services; 10 Cloud Run services (scale to zero); 7 Scheduler jobs; 3 Artifact Registry repositories (no cleanup); Cloud Build; GCS (receipts, operator-private, tfstate, DEV builds); Secret Manager; Firestore; outside GCP: Grafana Cloud, Railway (Metabase + PostgreSQL), Cloudflare, Tailscale, Meta/Graph. GitHub Actions `windows-latest` minutes are free only while the repository is public.
- **Impact**: A runaway (logs, build loop, Firestore, Railway) is found on the invoice.
- **Recommendation**: Owner creates one GCP budget (monthly average + 50%, 50/90/100% emails) in the console; about 5 minutes, no Terraform. Optionally grant `codex-cloud` `roles/billing.viewer`.
- **Effort**: S
- **Needs**: owner decision

#### ALL-MON-03 Metabase on Railway is outside every control in this repository
- **Type**: risk
- **Severity**: S3
- **Confidence**: hypothesis
- **Evidence**: `Environment_Inventory.md:36`; the runbook treats Railway as a separate surface with its own application database; the only Terraform references are Grafana rules and dashboards. `metabase_borrower_reader` reads `loan_manager_prod` (Database: access model).
- **Impact**: A PROD read credential for borrower data lives in a service whose sign-in, public-sharing and backup settings this review could not inspect.
- **Recommendation**: Owner decision: check once that public sharing/embedding is off, both accounts use SSO or strong passwords, and the Railway PostgreSQL backup is scheduled; record the result in `Environment_Inventory.md`.
- **Effort**: S
- **Needs**: owner decision

### Evidence privacy

#### ALL-PRIV-01 The public repository contains real borrower-level financial data
- **Type**: risk
- **Severity**: S2 (privacy exposure; outside the S1 money/write definition. The orchestrator may escalate.)
- **Confidence**: confirmed
- **Evidence**:
  - Repository visibility `public` (readback). The orchestrator confirmed `project/outputs/daily-loan-analysis-test-2026-08-31/previews_corrected/Borrowers.png` shows borrower names and balances.
  - This review opened 4 further images. `…/previews_corrected/Loans.png`: a loan ledger with borrower and loan ids, principal, received totals, status and default flags (~30 rows). `project/outputs/01a066b1-…/daily-collection-messages-2026-09-03/preview-Collection_Summary.png` and `preview-Draft_Messages.png`: borrower nicknames with outstanding/overdue amounts and ready-to-send Thai collection messages. `olap-daily-installment-2026-09-01/render-after/03-Columns.png`: schema only (no data).
  - Workbook structure (no values read): `…/daily-loan-analysis-test-2026-08-31/Loan_Daily_Analysis20260831_014143_190.xlsx` has 7 sheets, 627 rows, 750 shared strings incl. Thai text: a data export, not a template. The two AppSheet dictionary workbooks sampled are schema only.
  - The repository also publishes the Cloud SQL public IP and the authorized workstation IP (`Environment_Inventory.md:14`, `ecosystem-shared/owned.tf:109`).
- **Impact**: Borrower financial data is readable by anyone and stays in Git history.
- **Recommendation**: (1) Owner decision now: make the repository private (minutes, reversible), then fix ALL-CI-06 before Windows minutes bill. (2) Delete the data-bearing folders from the branch tip: `daily-loan-analysis-test-2026-08-31`, `daily-loan-analysis-2026-08-31`, `01a066b1-…/daily-collection-messages-2026-09-03`. (3) A history purge is an owner decision (AGENTS forbids rewriting without direction; clones may exist).
- **Effort**: S (private + delete) / L (purge)
- **Needs**: owner decision

#### ALL-PRIV-02 Text scan is clean; images and workbooks need one owner-assisted pass
- **Type**: risk
- **Severity**: S3
- **Confidence**: confirmed (sample); hypothesis (remainder)
- **Evidence**: The bounded phone-number grep matched 18 files (12 `project/outputs`, 6 `outputs`); the Python classifier found all 18 matches embedded in longer hex tokens (hashes, ids), 0 standalone. 473 PNG + 36 XLSX in `project/outputs` and 850 PNG in `outputs` remain unscanned by text tools. Of 4 images opened, 3 showed borrower data (ALL-PRIV-01); the dictionary renders (`render-before/after`, `01a05d4b-…`, `documentation-reconciliation-*`, `assessment-promotion-*`) are schema renders.
- **Impact**: More data-bearing captures likely exist in August–September folders (`universal-payments-*`, `oltp-todays-payment-*`, `olap-reconciliation-*`, `r005`–`r010`).
- **Recommendation**: One owner-assisted pass over `project/outputs` folders dated before R011; delete anything showing rows. Add a CI check rejecting new `*.xlsx`/`*.png` outside `tests/` and `apps/`.
- **Effort**: M
- **Needs**: owner decision

#### ALL-PRIV-03 Over-1 MB evidence is kept alive by one-off scripts or by nothing
- **Type**: doc
- **Severity**: S4
- **Confidence**: confirmed
- **Evidence**: 20 files over 1 MB, all in `project/outputs`. Directory-level reference check: `borrower-matrix-dictionary-{before,after}/` and `daily-loan-analysis-test-2026-08-31/previews_corrected/` are cited by no document or script (0 directory references; their basename matches are generic `Columns.png`/`Charges.png`). `r005-20260917` (6 files, 28 MB) is cited only by `project/scripts/r005-*.mjs`; `01a05d4b-…` (4 PNGs) by its own reference scripts; `dictionary-reconciliation-20260924` (4 files) by ~97 dictionary entries and stays.
- **Impact**: The 1 MB rule never fires because the citing scripts are themselves retained (`AGENTS.md` project section).
- **Recommendation**: Delete the 3 unreferenced files now; retire `r005`, assessment-promotion, documentation-reconciliation, dictionary-migration and `01a05d4b` script/evidence pairs together. The documentation worker owns the rule wording.
- **Effort**: S
- **Needs**: none

#### ALL-PRIV-04 A second, larger evidence tree outside the rule
- **Type**: doc
- **Severity**: S4
- **Confidence**: confirmed
- **Evidence**: Root `outputs/` is 67 MB with 1201 tracked files (850 PNG) and is overwritten by e2e (ALL-CI-08). `AGENTS.md` applies the 1 MB rule to `project/outputs` only. Pack size 142 MiB.
- **Impact**: Clone size and churn.
- **Recommendation**: Move still-referenced items to `project/outputs`; delete the rest; captures go to `test-results/`.
- **Effort**: S
- **Needs**: none

### Standardization

Pool/connector duplication, `*-target.mjs` guards and UUID regexes are App: architecture. Agent helper duplication is Agent: code quality.

#### ALL-STD-01 Business-date logic is re-implemented in many places
- **Type**: std
- **Severity**: S4
- **Confidence**: confirmed
- **Evidence**: `Asia/Bangkok` literal: services 38 occurrences in 26 files, PWA 6, agent 7, migrations 158 in 44 files, scripts 147 in 82 files, infrastructure 4. Seven files hand-roll `Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok'})` (`services/api/borrower-read-store.mjs`, `services/agent-conversations/defaults.mjs`, `apps/pwa/src/CollectionRecords.tsx`, `read-cache.ts`, `cash-view.ts`, `ManagementFinancialWorkspace.tsx`, `SharedBorrowerDetail.tsx`). Agent defines `BANGKOK` twice (`receipt_rules.py:13`, `cash_statement.py:14`). `display-date.ts:6` appends `+07:00`. Scheduler `mw-grafana-dispatch` uses `Asia/Singapore` while app jobs use `Asia/Bangkok`.
- **Impact**: A day-boundary fix must be repeated everywhere. App: date contract owns correctness.
- **Recommendation**: One `services/contracts/business-date.mjs` (`BUSINESS_TZ`, `businessToday()`) imported by services and PWA; one constant in agent `config.py`.
- **Effort**: S
- **Needs**: none

#### ALL-STD-02 Project id, number and service URLs are hard-coded
- **Type**: std
- **Severity**: S4
- **Confidence**: confirmed
- **Evidence**: `clever-oasis-508610-n7` in services 10 files, PWA 2 (`environment.ts:13,20`, `live-main.tsx:119`), scripts 29, `project/scripts` 22, infrastructure 41. Project number in services 8 files and agent 2 (`receipt_api.py:29`, `conversation_api.py:32`). Audience literals: `notifications/postcommit.mjs:5`; storage project at `business-server.mjs:6`.
- **Impact**: Harmless with one project; every fixture repeats the literals, and a move touches ~110 files.
- **Recommendation**: Keep Terraform literals. Services read `APPLICATION_PROJECT_ID`/`_NUMBER` (already injected, `runtime.tf:115-116`) through one config module; the agent keeps audiences in config and drops the literal.
- **Effort**: M
- **Needs**: none

#### ALL-STD-03 Four error-code vocabularies with no catalogue
- **Type**: std
- **Severity**: S4
- **Confidence**: confirmed
- **Evidence**: SQL: 21 distinct `ERRCODE` values (custom `P5B01`–`P5B08`, `22023` ×55, `42501` ×42) plus lower-case message codes (`'date'` ×12, `'actor'` ×12, `'invalid_subscription'` ×10). Node maps SQLSTATE in 5 sites across 4 files (`payment-command/store.mjs`, `agent-receipts/runtime.mjs`, `agent-conversations/{handler,command-metadata}.mjs`) and throws 53 distinct `lower_snake` codes. Agent: 291 distinct `UPPER_SNAKE` codes. The PWA has its own message texts (App: UX).
- **Impact**: "Stable specific reasons" (`Solution_Design.md:22`) depend on manual mapping per layer; a new SQL code surfaces as a generic error.
- **Recommendation**: One `services/contracts/error-codes.json` (code, HTTP status, en, th) used by Node handlers and PWA; SQL raises the catalogue code with `P0001`; the agent documents the codes it shows users.
- **Effort**: M
- **Needs**: none

#### ALL-STD-04 Logs have no common shape
- **Type**: std
- **Severity**: S4
- **Confidence**: confirmed
- **Evidence**: Node: 7 `console.log(JSON.stringify(...))` sites in 6 files (`dev-server.mjs`, `dev-read-server.mjs`, `api/server.mjs`, `production/server.mjs`, `business-server.mjs`, `workers/server.mjs`); `severity` appears 0 times in services. Agent: `logging` used 0 times; 16 `print(json.dumps(...))` sites.
- **Impact**: Cloud Logging treats every line as default severity, so ALL-MON-01's error rules need text matching.
- **Recommendation**: A 10-line `log(severity, event, fields)` helper emitting `severity` and `logging.googleapis.com/trace`; add `"severity"` to the agent's JSON print. No framework.
- **Effort**: S
- **Needs**: none

#### ALL-STD-05 Naming and identifier rules exist only by habit
- **Type**: doc
- **Severity**: S4
- **Confidence**: confirmed
- **Evidence**: 11 quoted-space tables vs 6 snake_case `CREATE TABLE`s; 63 distinct `_vN` functions. Deterministic ids: Node SHA-256 in 18 service files (`agent-receipts/contract.mjs:8`); agent `uuid5(NAMESPACE_URL,'mw-receipt:'+…)` (`receipt_projection.py:59`, `receipt_audit.py:23`); PWA `randomUUID()` at 43 sites and the contract accepts any UUID (`services/contracts/payment-command.mjs:18`).
- **Impact**: New contributors (mostly agents) guess the convention each time.
- **Recommendation**: Five lines in `database/README.md` and `docs/Development.md`: new objects snake_case; bump `_vN` only on signature change; request ids are client UUIDs; derived ids use the documented uuid5 namespace or SHA-256 input format. No renames.
- **Effort**: S
- **Needs**: none

## Documentation and process system
Merged by the orchestrator from Agent D — Delivery and Documentation (documentation focus-group orchestrator, Claude Fable 5.1, medium effort), who verified each claim at the cited line on commit 0995868.

Link check for `project/Documents/*.md`, `Rules/*.md`, root `README.md`, `docs/*.md`, `database/*.md`, `project/*.md`, dictionary README: 31 files, 2 broken paths, 3 broken anchors (all listed in ALL-DOC-01 to 03).

#### ALL-DOC-01 Dead link to a local-only dictionary snapshot
- **Type**: doc
- **Severity**: S4
- **Confidence**: confirmed
- **Evidence**: `project/Documents/README.md:20` links `Data_Dictionary_ChatGPT.md` ("local-only link, ignored by Git"); file absent. `Rules/Development_Workflow.md:55` requires regenerating "the existing dictionary upload snapshot" each batch.
- **Impact**: Every clone has a dead link and a maintenance duty for a file it cannot see.
- **Recommendation**: Remove the link; make the regeneration row conditional on having a local snapshot.
- **Effort**: S
- **Needs**: none

#### ALL-DOC-02 Three broken anchors; the R058 Debian promotion record they point to does not exist
- **Type**: doc
- **Severity**: S4
- **Confidence**: confirmed
- **Evidence**: (1) `project/Documents/Environment_Inventory.md:23` → `Development_Changes.md#r058-borrower-upcoming-batch`; actual heading `Development_Changes.md:93` "R058 Borrower Upcoming Charges batch". (2) `Environment_Inventory.md:30` → `…/CHANGE_NOTES_RECEIPT_NOTIFICATION_ISOLATION_2026-10-02.md#r058-promotion-status`. (3) `Release_Tracker.md:30` → same file `#r058-strict-instagram-fallback-candidate--14-october-2026`. That note (26 lines) has one heading, its title; `grep -i r058` in it returns nothing; `grep -rn "^#.*promotion status"` across all Markdown returns nothing; `grep -rl "14:53"` finds only the tracker and inventory. So the heading exists nowhere, settling the disputed claim.
- **Impact**: The tracker's "existing promotion record" for the Debian R058 release is a sentence, not a record.
- **Recommendation**: Fix (1). For (2)/(3), add a short dated section to the receipt-isolation note (or the R058 section of `Development_Changes.md`) with what was deployed and how to roll back, then point both links at it.
- **Effort**: S
- **Needs**: none

#### ALL-DOC-03 Pointer file links into a sibling repository that is not present
- **Type**: doc
- **Severity**: S4
- **Confidence**: confirmed
- **Evidence**: `project/SERVICE_CATALOGUE.md:3` links `../MW-AI-Collection/SERVICE_CATALOGUE.md` at `C:\GitHub\MW-AI-Collection`; `CLAUDE.md` forbids attaching sibling repositories. Nothing current links to this file (grep over `AGENTS.md`, `project/README.md`, `project/Documents`).
- **Impact**: Dead link in a file that is only a pointer.
- **Recommendation**: Delete the file; AGENTS.md already says AI Collection is a separate scope.
- **Effort**: S
- **Needs**: none

#### ALL-DOC-04 Reading load before a routine change is about 6,000 words of rules, 16,000 one level out
- **Type**: doc
- **Severity**: S4
- **Confidence**: confirmed
- **Evidence**: `wc -w`: `AGENTS.md` 1,993, `CLAUDE.md` 97, 24 distinct `.md` links. One level transitively: `Development_Workflow.md` 1,691, `PWA_Orchestration.md` 1,369, `project/README.md` 1,170, `database/README.md` 995, `Environment_Inventory.md` 929, `Model_Work_Mapping.md` 910, `VM01_Local_Storage.md` 896, `r057-appsheet-retirement/README.md` 879, `Release_Workflow.md` 825, `integration-agent/AGENTS.md` 662, `Release_Recovery_Runbook.md` 464, `docs/Development.md` 373, `Release_Tracker.md` 358, `Development_Refresh_Runbook.md` 345, `project/scripts/README.md` 344, `Documents/README.md` 328, `dictionary/README.md` 309, `Development_Environment_Preparation.md` 287, `promotion-checklist.md` 267, `Data Dictionary/README.md` 266, `Rules/README.md` 254 = 13,921, about 16,000 with AGENTS and CLAUDE. The minimum the trigger table asks for a product change (AGENTS + tracker + PWA_Orchestration + Development_Workflow + Documents README) is about 5,700 words. The evolving set that `Development_Workflow.md:47-61` says to check each batch is 13 files, 33,821 words (`Development_Changes.md` 10,933; dashboard guide 7,458; `Resource_Monitoring.md` 5,169; events bridge 3,113; data model 2,556; rest under 1,200 each).
- **Impact**: For a two-person app, the rules cost more reading than most changes; most of the volume is release history and monitoring panel prose, not rules.
- **Recommendation**: See ALL-DOC-11/12.
- **Effort**: M
- **Needs**: owner decision

#### ALL-DOC-05 Each deployment pin is copied into four files
- **Type**: doc
- **Severity**: S4
- **Confidence**: confirmed
- **Evidence**: `grep -rl` over `project/`, `Change Logs/`, `integration-agent/` excluding outputs: Hosting `45b1899bbd18ba3e` in 4 files (`Development_Changes.md`, `Environment_Inventory.md`, `Data Dictionary/systems/pwa/human-api.yaml`, `…/pwa/application.yaml`); DEV revision `00027-8sb` in the same 4; Debian `a8cf949` in 3 (`Release_Tracker.md`, `Environment_Inventory.md`, merge note); `e9fd149` in 6. `Environment_Inventory.md` is 929 words with a longest line of 1,773 characters (table cells holding digests, times and narrative).
- **Impact**: Every release rewrites four files with the same hex; the one not rewritten (catalogue) is already wrong. Dictionary YAML goes stale on every deploy for no data-contract reason.
- **Recommendation**: Pins live only in `Environment_Inventory.md`, one row per target, one pin per cell. Dictionary and change notes cite the release number and tag.
- **Effort**: M
- **Needs**: none

#### ALL-DOC-06 "Open development changes" is 95 percent released history
- **Type**: doc
- **Severity**: S4
- **Confidence**: confirmed
- **Evidence**: `project/Documents/Development_Changes.md:1` "# Open development changes", 249 lines, 10,933 words. Open work: R063 (`:17-33`). Released per `Release_Tracker.md`: R062 (`:34`), R061 (`:55`), R060 (`:73`), R059 (`:79`), R058 (`:93-230`, 138 lines). Dictionary YAML cites `Development_Changes.md#r062-production-promotion` as evidence (e.g. the `pwa_submit_operation_v2` entry lines 191,196). AGENTS.md: "Delete unused/superseded documentation rather than maintaining history copies."
- **Impact**: The "current operation" page is read by every session that follows the trigger table and is mostly history.
- **Recommendation**: Keep the Open release, "Current operation" and "Delivery tooling status". Released sections become one tracker row plus the Git tag; re-point dictionary evidence to the tag before deleting headings.
- **Effort**: M
- **Needs**: owner decision

#### ALL-DOC-07 Change notes: short sentences, unreadable paragraphs
- **Type**: doc
- **Severity**: S4
- **Confidence**: confirmed
- **Evidence**: `readability.py` (code blocks and tables removed, inline code counted): `Change Logs/CHANGE_NOTES_R054_UI_BATCH_2026-10-12.md` 972 words, 19 paragraphs, 79 sentences, average 12.3 words, longest sentence 32, 32 code spans, 26 hex ids, longest paragraph 113 words. `Development_Changes.md` R062 section (`:34-54`) 905 words, 10 paragraphs, 63 sentences, average 14.4 words, 34 code spans, 39 hex ids, longest paragraph 227 words, three paragraphs over 100 words. R063 sections: paragraphs of 151 and 122 words.
- **Impact**: Sentence length is fine; density is not. A paragraph carries commit, digest, timestamp, check count and limitation together, so "what changed / what ran / how to undo" cannot be scanned.
- **Recommendation**: One fixed shape, under 150 words plus one table: `What changed` (2-4 bullets), `Checks` (table: command, result), `Deploy` (DEV/PROD, one line each), `Undo` (one line), `Open` (bullets or "none"), `Evidence` (hashes, last line only).
- **Effort**: S
- **Needs**: none

#### ALL-DOC-08 Change-note volume: 437 notes, about 342,000 words, 336 of them pre-merge project notes
- **Type**: doc
- **Severity**: S4
- **Confidence**: confirmed
- **Evidence**: `Change Logs/` 48 notes, 40,426 words; `integration-agent/Change Logs/` 53 notes, 25,452 words; `project/Change Logs/` 336 notes, 276,437 words (16 from August, 239 from September, 81 from October 2026). No current document in `project/README.md`, `project/Documents/*.md`, `Rules/*.md` or `AGENTS.md` links to any note under `project/Change Logs/` (grep for `Change Logs/CHANGE_NOTES` returns 0 links).
- **Impact**: The largest body of text in the repository is unreferenced history of AppSheet-era work, searched by every full-text grep.
- **Recommendation**: Delete `project/Change Logs/` outright (Git keeps it), keep the last three releases' notes in the other two folders plus any with open rollback. One commit.
- **Effort**: S
- **Needs**: owner decision

#### ALL-DOC-09 `project/outputs` is 155 MB and the 1 MB rule never fires because one-off scripts keep citing it
- **Type**: doc
- **Severity**: S4
- **Confidence**: confirmed
- **Evidence**: `du -sh project/outputs` 155 MB, 194 entries, 2,747 tracked files; root `outputs/` 67 MB, 1,201 files; 20 files over 1 MB (largest `r005-20260917/reversal-configuration-checklist.json` 7.9 MB). Folders: `r005-20260917` 45 MB, `01a05d4b-…` 16 MB, `dictionary-reconciliation-20260924` 9 MB, `r008-20260918` 7 MB, `daily-loan-analysis-test-2026-08-31` 5 MB. Each large file is referenced only by one-off scripts: 10 `project/scripts/r005-*.mjs`, 6 `r008-*.mjs`, and 47 files under `project/scripts/reference/` listed in `reference-manifest.json`; none of these scripts is described in `project/scripts/README.md` (0 mentions of r005/r008). AGENTS.md rule: "Evidence over 1 MB is kept only while a current document, README or script references it."
- **Impact**: The rule is satisfied in letter by retained scripts whose only purpose was that release; clones carry 220 MB of month-old evidence.
- **Recommendation**: Delete the `r005-*`/`r008-*` scripts, `project/scripts/reference/`, and their output folders together; amend the rule with "one-off release scripts are deleted with their release's outputs". Keep `r057-*`, `r055-*`, `r056-*` records the tracker still links.
- **Effort**: M
- **Needs**: owner decision

#### ALL-DOC-10 Monitoring prose is six times the size of the PWA architecture prose
- **Type**: doc
- **Severity**: S4
- **Confidence**: confirmed
- **Evidence**: `Resource_Monitoring_Dashboard_Guide.md` 7,458 words, `Resource_Monitoring.md` 5,169, `Grafana_MCP_Events_Bridge.md` 3,113 (15,740) versus `PWA_Data_Model_Overview.md` 2,556 and `Solution_Design.md` 694. All three monitoring files are on the per-batch maintenance list (`Development_Workflow.md:58-60`); `Resource_Monitoring.md:118,152,158` still carry old-profile and old-repository references.
- **Impact**: Three documents to check for any dashboard change; panel-by-panel prose drifts with every edit.
- **Recommendation**: Fold the bridge into `Resource_Monitoring.md`; reduce the guide to one line per dashboard with a link to its JSON in `project/scripts/monitoring/`.
- **Effort**: M
- **Needs**: owner decision

#### ALL-DOC-11 `AGENTS.md` is a manual; safety rules sit after 600 words of process
- **Type**: doc
- **Severity**: S4
- **Confidence**: likely
- **Evidence**: `AGENTS.md` 1,993 words, sections at lines 5, 17-19, 43, 49, 60, 68, 82, 88, 92, 101. The production-approval wording (`:51-52`) is also in `Rules/Release_Workflow.md:31,35`; the records rules (`:68-80`) repeat `Development_Workflow.md:41-69`; the six-agent process is summarised at `:21` and again in `PWA_Orchestration.md`. DEV/PROD target checks, secrets and backups appear from line 43 onward.
- **Impact**: Every session loads the whole file; the rules most likely to prevent damage are not at the top, and duplicated prose drifts (the three-repository wording in DB-DOC-06 is one example).
- **Recommendation**: Cut to about 600 words: layout table, eight hard rules (verify target tuple; no secrets or borrower data in Git; migrations immutable; backup before PROD DB change; synthetic test data; preserve others' work; owner-instruction scope; no force-push), then the trigger table of links. Everything else lives once, in the rule it duplicates.
- **Effort**: M
- **Needs**: owner decision

#### ALL-DOC-12 Proposed light structure: one current-state page per component, no new process
- **Type**: doc
- **Severity**: S4
- **Confidence**: hypothesis
- **Evidence**: Findings ALL-DOC-04 to 11, DB-DOC-01/05/06, AGT-DOC-01/10.
- **Impact**: One home per fact; fewer files to open; pins that cannot drift because they exist once.
- **Recommendation**: (1) Three "current state" pages of about 300 words each: `Environment_Inventory.md` for PWA/API/infra, `database/README.md` for the database (version, roles, how to migrate, how to restore), `integration-agent/SERVICE_CATALOGUE.md` as a table for the agent (service, timer, flag, cutoff, installed version). Each holds deployed pins, open work and the undo path; nothing else holds pins. (2) `Development_Changes.md` keeps only the Open release. (3) Delete `database/OWNERSHIP.md`, `integration-agent/docs/MIGRATION_PLAN.md`, `project/SERVICE_CATALOGUE.md`, `project/Change Logs/`, r005/r008 scripts and outputs. (4) Change notes use the ALL-DOC-07 shape. (5) Replace the 13-row maintenance table with "update the current-state page you touched; update the tracker at a release transition".
- **Effort**: L
- **Needs**: owner decision

## Consolidated backlog
Merged by the orchestrator from the four review notes on commit `0995868`. Sorted by severity, then confidence, then effort. "Needs" marks what the owner must authorize before implementation; everything else is routine reversible work under standing authority. Component notes hold the evidence; this table is the index.

| Severity | Count |
| --- | --- |
| S1 | 1 |
| S2 | 10 |
| S3 | 72 |
| S4 | 134 |
| Total | 217 |

By component: app 39, agent 50, overall 48, db 45, app (ux) 35. Notes: app `Change Logs/CHANGE_NOTES_REVIEW_APP_2026-10-15.md` (branch `claude/beautiful-mayer-mf4t1p-review-app`), database `Change Logs/CHANGE_NOTES_REVIEW_DATABASE_2026-10-15.md` (`…-review-db`), agent `integration-agent/Change Logs/CHANGE_NOTES_REVIEW_AGENT_2026-10-15.md` (`…-review-agent`), overall this file (`…-review-overall`).

### Proposed implementation waves

| Wave | Scope | Items |
| --- | --- | --- |
| W1 | Confirmed bugs, safety and privacy gaps needing no schema or PROD-side change | 20 |
| W2 | R063 receiver readiness, recovery of the deployed R058 code, deploy-script path fixes | 12 |
| W3 | Tests, CI, toolchain, architecture and standardization | 93 |
| W4 | Schema, access, locking, index and performance (new migrations; DEV first; needs owner authorization) | 23 |
| W5 | UX improvements | 39 |
| W6 | Documentation and process cleanup | 30 |

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
| 8 | AGT-R063-01 | agent | S2 | confirmed (gap and timeline) | bug | M | none (the tunnel path change in AGT-WEBH | W2 | Current deploy helpers never reload the webhook receiver (R063 root cause) |
| 9 | DB-PERF-01 | db | S2 | confirmed (size), likely (cause) | risk | M | owner decision | W4 | The agent database is ~99% of instance storage and of every automated backup/PITR log; HDD IOPS on a shared mi |
| 10 | AGT-WEBHOOK-01 | agent | S2 | likely (Meta's `is_deleted` event shape  | bug | S | none | W1 | A deleted (unsent) Instagram message makes the whole delivery fail with 503 on every retry |
| 11 | DB-ACCESS-01 | db | S2 | likely (DEV confirmed, PROD not read) | risk | S | PROD change | W3 | A role with DELETE but no SELECT can only run unqualified `DELETE FROM "<table>"` (a `WHERE` on any column nee |
| 12 | AGT-DEPLOY-03 | agent | S3 | confirmed | bug | S | none | W2 | Two "installed equals source" checks pass vacuously when the source path is wrong |
| 13 | AGT-DEPLOY-04 | agent | S3 | confirmed | bug | S | owner decision | W2 | `update-reviewed-runtime.sh` is stale beyond its path |
| 14 | AGT-DEPLOY-07 | agent | S3 | confirmed | risk | S | owner decision | W2 | Both clones are shallow, so provenance checks cannot be done on the host |
| 15 | AGT-R063-03 | agent | S3 | confirmed | risk | S | none | W2 | Receiver unit lacks proxy ordering, umask and a readiness gate |
| 16 | AGT-R063-04 | agent | S3 | confirmed | risk | S | none | W2 | Every receiver exception becomes an unlogged 503 |
| 17 | AGT-TEST-02 | agent | S3 | confirmed | bug | S | none | W3 | One DML audit test expects the wrong error for the real role |
| 18 | ALL-CI-01 | overall | S3 | confirmed | risk | S | none | W3 | `main` is red on every push since R060 and nothing stops merges |
| 19 | ALL-CI-02 | overall | S3 | confirmed | risk | S | none | W3 | Browser tests run after merge, not before |
| 20 | ALL-CI-03 | overall | S3 | confirmed | risk | S | none | W3 | Terraform CI covers 2 of 19 roots and runs no Terraform tests |
| 21 | ALL-COST-01 | overall | S3 | confirmed | risk | S | owner decision | W3 | No budget alert, and the operator cannot see billing |
| 22 | ALL-INFRA-01 | overall | S3 | confirmed | risk | S | owner decision | W3 | The cloud executor is a project Owner signed in with non-expiring keys |
| 23 | ALL-INFRA-02 | overall | S3 | confirmed | risk | S | infra change | W3 | SSH and RDP are open to the internet on the default network |
| 24 | ALL-INFRA-04 | overall | S3 | confirmed | risk | S | infra change | W3 | Debian VM protection and disaster-recovery gaps |
| 25 | APP-AUTH-01 | app | S3 | confirmed | risk | S | none | W1 | A transient Google-side failure looks like a revoked session to the PWA, which then signs the user out and pur |
| 26 | APP-DATE-01 | app | S3 | confirmed | bug | S | none | W1 | No wrong display today. The first UI that shows this field will be 7 h off. |
| 27 | APP-SEC-01 | app | S3 | confirmed | risk | S | PROD change | W3 | The app, which posts payments on a tap, can be framed by another site (clickjacking). There is no CSP backstop |
| 28 | APP-TEST-02 | app | S3 | confirmed | risk | S | none | W3 | A change to service SQL (read models, store) merges without running the integration suite that exercises it. |
| 29 | APP-UX-A11Y-01 | app (ux) | S3 | confirmed | ux | S | owner decision | W5 | Pinch-zoom and ctrl+wheel zoom are blocked (WCAG 1.4.4 / 1.4.10). iOS ignores the meta but the JS guard still  |
| 30 | APP-UX-BORROWER-02 | app (ux) | S3 | confirmed | ux | S | none | W5 | Two consequential toggles (one enables automated collection messaging) are the smallest targets in the app; ea |
| 31 | APP-UX-PERF-01 | app (ux) | S3 | confirmed | ux | S | none | W5 | Every cold load and every cache miss (see PERF-02) pulls a 1.5 MB image for a 36px logo; on mobile data this d |
| 32 | APP-UX-RECEIVE-01 | app (ux) | S3 | confirmed | ux | S | none | W5 | On a phone the only way to proceed from the allocation form is an unlabeled clipboard icon in the grey summary |
| 33 | APP-UX-RECEIVE-04 | app (ux) | S3 | confirmed | ux | S | none | W5 | The user cannot tell before confirming that the payment will be queued rather than posted. Receipts/notificati |
| 34 | DB-ACCESS-03 | db | S3 | confirmed | risk | S | infra change | W3 | The identity used by Linux cloud sessions (including this review) is an instance-level admin, not a reader. A  |
| 35 | DB-AGENTDB-01 | db | S3 | confirmed | risk | S | none | W4 | The second migration runner (checksum compare, out-of-order rejection, rerun no-op) is untested; a regression  |
| 36 | DB-AGENTDB-02 | db | S3 | confirmed | arch | S | schema change | W4 | Grants on business tables have no history row; a reviewer cannot tell from `flyway_schema_history` what the ag |
| 37 | DB-BACKUP-01 | db | S3 | confirmed | risk | S | owner decision | W3 | A non-release data loss (operator error, agent bug) relies on an untested restore path. |
| 38 | DB-BACKUP-03 | db | S3 | confirmed | risk | S | none | W1 | Rotating either secret (adding version 2 and disabling 1) silently breaks every cloud session and the Linux ru |
| 39 | DB-PERF-03 | db | S3 | confirmed | std | S | infra change | W4 | Flags advertise a scheduler that does not exist and `cron.database_name` names PROD; if anyone re-creates the  |
| 40 | DB-SCHEMA-02 | db | S3 | confirmed | risk | S | none | W4 | A future guard named without the `a0_`/`aa_` prefix, or a normalizer that stops using `nullif`, changes semant |
| 41 | DB-SCHEMA-03 | db | S3 | confirmed | risk | S | schema change | W4 | No measurable effect at 37 borrowers / 1.5k charges; each parent DELETE/UPDATE of a key scans the child table. |
| 42 | DB-SCHEMA-06 | db | S3 | confirmed | risk | S | none | W4 | Every release edits the guard and its test; the 89→90, 90→91 and 91→92 branches are untested. A typo blocks or |
| 43 | AGT-TEST-01 | agent | S3 | confirmed | risk | M | none | W3 | 40 PostgreSQL tests never run in CI, though they run in minutes on a disposable cluster |
| 44 | AGT-TEST-03 | agent | S3 | confirmed | risk | M | none | W3 | The receiver and five other modules have no tests |
| 45 | ALL-ARCH-02 | overall | S3 | confirmed (code path); impact likely | arch | M | owner decision | W3 | The agent writes PROD financial tables directly, outside the command API |
| 46 | ALL-INFRA-03 | overall | S3 | confirmed | risk | M | infra change | W3 | Security-relevant configuration sits outside Terraform |
| 47 | ALL-MON-01 | overall | S3 | confirmed | risk | M | none | W1 | No alert covers the PWA APIs, the workers or database storage and backups |
| 48 | ALL-PRIV-02 | overall | S3 | confirmed (sample); hypothesis (remainde | risk | M | owner decision | W1 | Text scan is clean; images and workbooks need one owner-assisted pass |
| 49 | APP-ARCH-01 | app | S3 | confirmed | arch | M | none | W3 | Capability behaviour (`read` vs `command`, `receipt.*`, second partner) is first exercised in PROD. A capabili |
| 50 | APP-OFFLINE-03 | app | S3 | confirmed | risk | M | schema change | W4 | xmin` per row). The PWA polls every domain every 60 s while visible, plus on focus/online (`offline-dataset.ts |
| 51 | APP-TEST-03 | app | S3 | confirmed | risk | M | none | W3 | Money-reading SQL (cash, management financial, position) has no unit or Linux-run test. Regressions show up on |
| 52 | DB-ACCESS-02 | db | S3 | confirmed | risk | M | owner decision | W3 | The request-id journal, payload-hash check and successor index are enforced only by the Node path. Any process |
| 53 | DB-ACCESS-07 | db | S3 | confirmed (config), likely (exposure) | risk | M | infra change | W3 | Password roles (`postgres`, `mw_agent_*`, `mw_reviewer_dml`, `metabase_borrower_reader`) are reachable from th |
| 54 | DB-BACKUP-04 | db | S3 | confirmed | risk | M | owner decision | W3 | Loss of VM-01 (or its Azure subscription) blocks every PROD schema change and the restore rehearsal until a ne |
| 55 | DB-CI-01 | db | S3 | confirmed | risk | M | none | W3 | A cloud session's `mw-db-ci` pass does not prove the RPC, access or upgrade behaviour; those proofs run only o |
| 56 | DB-CI-02 | db | S3 | confirmed | risk | M | none | W3 | Lump-sum posting (V2/V3), interest-schedule anchor (V5/V84), the rollup chain (V12–V14) and partner reporting  |
| 57 | DB-CI-05 | db | S3 | confirmed | risk | M | none | W3 | Grant drift (DB-ACCESS-01 shows one) is invisible to CI. |
| 58 | DB-SCHEMA-01 | db | S3 | confirmed | arch | M | none | W4 | The current body of the main command RPC exists only in a live database; reviewers must replay 22 string edits |
| 59 | ALL-ARCH-01 | overall | S3 | confirmed | arch | L | infra change, owner decision (schedulers | W3 | DEV and PROD run different command compositions |
| 60 | DB-PAY-03 | db | S3 | confirmed | risk | — | owner decision | W4 | Totals cannot be corrupted by direct writes, but status fields and source rows can, without a journal row. |
| 61 | AGT-DEPLOY-05 | agent | S3 | likely | risk | S | none | W2 | Per-file copy into site-packages creates hybrid installs |
| 62 | AGT-DOC-10 | agent | S3 | likely | doc | S | none | W6 | Inventory Debian pin does not match the host checkout after the monorepo cutover |
| 63 | AGT-HOST-04 | agent | S3 | likely | risk | S | none | W1 | `Requires=cloud-sql-auth-proxy.service` stops workers mid-run when the proxy restarts |
| 64 | AGT-R063-05 | agent | S3 | likely | risk | S | none | W2 | Lazy imports make a long-lived receiver a mixed-version process |
| 65 | AGT-SEND-01 | agent | S3 | likely | risk | S | none | W1 | Instagram failures are all "unknown", and the reason is discarded |
| 66 | AGT-SEND-02 | agent | S3 | likely | risk | S | none | W1 | Email UNKNOWN outcomes are swallowed without a reason |
| 67 | AGT-SEND-03 | agent | S3 | likely | risk | S | owner decision | W3 | A payment POST that never left the host still becomes UNKNOWN forever |
| 68 | AGT-SEND-04 | agent | S3 | likely | risk | S | none | W1 | The Graph refresh token is rewritten in place |
| 69 | AGT-STATE-01 | agent | S3 | likely (estimate from code; `mw_agent` n | risk | S | owner decision for retention | W3 | Audit rows grow without bound, including for no-op statements |
| 70 | AGT-WEBHOOK-02 | agent | S3 | likely | risk | S | none | W1 | Messages older than 24 hours (or timestamped in the future) are dropped with 200 and no record |
| 71 | AGT-WEBHOOK-03 | agent | S3 | likely (Terraform rule; public GET not r | risk | S | infra change | W3 | The tunnel publishes every receiver path, including `/health` |
| 72 | AGT-WEBHOOK-04 | agent | S3 | likely | risk | S | none | W1 | No socket timeout, unbounded threads, one DB connection |
| 73 | ALL-ARCH-04 | overall | S3 | likely (configuration confirmed, load no | arch | S | owner decision, infra change | W3 | One small shared Cloud SQL instance carries DEV, PROD and agent state |
| 74 | APP-OFFLINE-04 | app | S3 | likely | risk | S | owner decision | W3 | A lost or shared device keeps borrower financial data and receipt photos until the next sign-out. |
| 75 | APP-OFFLINE-05 | app | S3 | likely | ux | S | none | W5 | Tapping a notification while a form is open reloads that tab. Unsaved in-memory state is lost; autosaved draft |
| 76 | APP-PAY-02 | app | S3 | likely | risk | S | none | W1 | With a cold or slow notify service, a committed payment can return late or as a platform 504. The user sees "u |
| 77 | APP-PAY-03 | app | S3 | likely | risk | S | infra change | W3 | Slow requests are cut by the platform with an opaque 504 while the DB work continues. Safe because of status-f |
| 78 | APP-UX-SETTINGS-01 | app (ux) | S3 | likely | ux | S | none | W5 | A user whose popup was blocked (common in iOS standalone PWAs) sees nothing happen and retries blindly. |
| 79 | DB-LOCK-01 | db | S3 | likely | bug | S | none | W4 | A lock contention or NOWAIT failure is reported to the PWA as "outcome unknown", forcing the status-poll path  |
| 80 | ALL-ARCH-03 | overall | S3 | likely | arch | M | infra change | W3 | Three database authentication styles and three secret stores |
| 81 | APP-PAY-04 | app | S3 | likely | risk | M | none | W1 | Two concurrent receipt operations take the whole pool; other requests wait up to 5 s, then return 503. Likely  |
| 82 | DB-ACCESS-06 | db | S3 | likely | arch | M | none | W3 | env |
| 83 | ALL-MON-03 | overall | S3 | hypothesis | risk | S | owner decision | W3 | Metabase on Railway is outside every control in this repository |
| 84 | AGT-DEPLOY-06 | agent | S4 | confirmed | std | S | none | W2 | Package version never changes |
| 85 | AGT-DOC-01 | agent | S4 | confirmed | doc | S | none | W6 | Catalogue "current production" pin is stale and matches neither the inventory nor the host |
| 86 | AGT-DOC-02 | agent | S4 | confirmed | doc | S | none | W6 | Monitoring rollback paragraph points at a Windows path in an archived repository |
| 87 | AGT-DOC-03 | agent | S4 | confirmed | doc | S | none | W6 | Collector description still lists AppSheet probes as live |
| 88 | AGT-DOC-04 | agent | S4 | confirmed | doc | S | none | W6 | `POSTGRESQL_OPERATIONS.md` governance says AppSheet is the preferred API |
| 89 | AGT-DOC-05 | agent | S4 | confirmed | doc | S | none | W6 | `MIGRATION_PLAN.md` is a completed plan with one stage that contradicts current rules |
| 90 | AGT-DOC-06 | agent | S4 | confirmed | doc | S | none | W6 | `config.example.json` has no PostgreSQL state keys |
| 91 | AGT-DOC-07 | agent | S4 | confirmed | doc | S | none | W6 | `mw-audit-relay.timer` runs on the host but is in neither catalogue file |
| 92 | AGT-DOC-08 | agent | S4 | confirmed | doc | S | none | W6 | README says the PostgreSQL design is "not deployed"; it is running |
| 93 | AGT-DOC-09 | agent | S4 | confirmed | doc | S | none | W6 | Windows paths and old-repository names remain in agent docs |
| 94 | AGT-HOST-01 | agent | S4 | confirmed | risk | S | owner decision | W3 | The documented read-only route cannot read logs |
| 95 | AGT-HOST-03 | agent | S4 | confirmed | std | S | none | W3 | Cloudflared unit duplicates `ProtectHome` and lacks address-family restriction |
| 96 | AGT-QUALITY-02 | agent | S4 | confirmed | std | S | none | W3 | No lint/type step; Python floor out of date |
| 97 | AGT-QUALITY-03 | agent | S4 | confirmed | std | S | none | W3 | Hard-coded workstation paths and public IP in operator scripts |
| 98 | AGT-QUALITY-04 | agent | S4 | confirmed | std | S | none | W3 | SQL built by string concatenation |
| 99 | AGT-STATE-02 | agent | S4 | confirmed (code trace) | risk | S | none | W3 | `readonly=True` is ignored on the PostgreSQL backend |
| 100 | AGT-STATE-04 | agent | S4 | confirmed | std | S | none | W3 | Documented role timeouts are overridden by the connection string |
| 101 | AGT-TEST-04 | agent | S4 | confirmed | doc | S | none | W6 | The lab has undocumented prerequisites |
| 102 | AGT-TEST-05 | agent | S4 | confirmed | std | S | none | W3 | No test keeps the Markdown and JSON catalogues aligned |
| 103 | AGT-WEBHOOK-05 | agent | S4 | confirmed | std | S | none | W3 | Kill switches are read at different times; malformed requests give 503 instead of 400 |
| 104 | ALL-ARCH-05 | overall | S4 | confirmed | arch | S | infra change | W3 | Foundation-era DEV API is still deployed and is the only CI-deployed service |
| 105 | ALL-ARCH-06 | overall | S4 | confirmed | arch | S | none | W3 | Server image ships frontend packages |
| 106 | ALL-ARCH-07 | overall | S4 | confirmed | std | S | none | W3 | PROD workers use a module named `dev-workers` |
| 107 | ALL-ARCH-08 | overall | S4 | confirmed | arch | S | owner decision | W3 | AppSheet-era residue: keep or retire |
| 108 | ALL-CI-05 | overall | S4 | confirmed | std | S | none | W3 | Inconsistent action pinning |
| 109 | ALL-CI-06 | overall | S4 | confirmed | std | S | none | W3 | Database and bridge workflows run twice per PR commit on Windows runners |
| 110 | ALL-CI-08 | overall | S4 | confirmed | bug | S | none | W3 | Browser tests write into tracked evidence files |
| 111 | ALL-CI-09 | overall | S4 | confirmed | risk | S | none | W3 | A failing e2e step skips the Terraform checks on `main` |
| 112 | ALL-DOC-01 | overall | S4 | confirmed | doc | S | none | W6 | Dead link to a local-only dictionary snapshot |
| 113 | ALL-DOC-02 | overall | S4 | confirmed | doc | S | none | W6 | Three broken anchors; the R058 Debian promotion record they point to does not exist |
| 114 | ALL-DOC-03 | overall | S4 | confirmed | doc | S | none | W6 | Pointer file links into a sibling repository that is not present |
| 115 | ALL-DOC-07 | overall | S4 | confirmed | doc | S | none | W6 | Change notes: short sentences, unreadable paragraphs |
| 116 | ALL-DOC-08 | overall | S4 | confirmed | doc | S | owner decision | W6 | Change-note volume: 437 notes, about 342,000 words, 336 of them pre-merge project notes |
| 117 | ALL-INFRA-06 | overall | S4 | confirmed | std | S | infra change | W3 | Artifact Registry repositories keep every image |
| 118 | ALL-INFRA-07 | overall | S4 | confirmed | risk | S | owner decision | W3 | Every cloud session holds Azure administrator tokens as a side effect of any Bash call |
| 119 | ALL-PRIV-03 | overall | S4 | confirmed | doc | S | none | W1 | Over-1 MB evidence is kept alive by one-off scripts or by nothing |
| 120 | ALL-PRIV-04 | overall | S4 | confirmed | doc | S | none | W1 | A second, larger evidence tree outside the rule |
| 121 | ALL-STD-01 | overall | S4 | confirmed | std | S | none | W3 | Business-date logic is re-implemented in many places |
| 122 | ALL-STD-04 | overall | S4 | confirmed | std | S | none | W3 | Logs have no common shape |
| 123 | ALL-STD-05 | overall | S4 | confirmed | doc | S | none | W6 | Naming and identifier rules exist only by habit |
| 124 | APP-ARCH-02 | app | S4 | confirmed | std | S | none | W3 | Reviewers misread PROD code as DEV-only; release risk through confusion. |
| 125 | APP-ARCH-04 | app | S4 | confirmed | arch | S | none | W3 | Hard to see which code each Cloud Run role ships or depends on. |
| 126 | APP-ARCH-05 | app | S4 | confirmed | arch | S | none | W3 | Behaviour verified in the synthetic shell can differ from the shipped shell; a local `npm run check` passes wh |
| 127 | APP-AUTH-02 | app | S4 | confirmed | std | S | none | W3 | DEV accepts claims PROD rejects. A fix applied to one copy will miss the others. |
| 128 | APP-AUTH-03 | app | S4 | confirmed | std | S | none | W3 | Inconsistent behaviour and no request logging on the notification surface. No data exposure found: the browser |
| 129 | APP-AUTH-04 | app | S4 | confirmed | arch | S | owner decision | W3 | Acceptable for two users; it means DEV sign-in is also PROD authentication. |
| 130 | APP-AUTH-05 | app | S4 | confirmed | bug | S | none | W3 | Wrong status code only. |
| 131 | APP-AUTH-06 | app | S4 | confirmed | std | S | infra change | W3 | A recreated service account with the same email would be accepted by the workers but not by the agent APIs. Lo |
| 132 | APP-NOTIFY-01 | app | S4 | confirmed | risk | S | owner decision | W3 | A read-only member can register push devices for themselves. Low risk, but it does not match the `command`-for |
| 133 | APP-NOTIFY-02 | app | S4 | confirmed | ux | S | none | W5 | Edge on Windows (WNS `*.notify.windows.com`) subscriptions are rejected as `invalid_subscription`. |
| 134 | APP-OFFLINE-06 | app | S4 | confirmed | arch | S | none | W3 | Unused server code path (`business/offline-dataset.mjs` v1 reader) to maintain and test. |
| 135 | APP-PAY-05 | app | S4 | confirmed | arch | S | none | W3 | Two sources of truth; the JS copy can drift silently. |
| 136 | APP-PAY-07 | app | S4 | confirmed | std | S | owner decision | W3 | Changing who disburses loans needs a code release, and the rule is undocumented. |
| 137 | APP-PERF-01 | app | S4 | confirmed | std | S | none | W3 | About 3 MB of logos and 0.8 MB of JS on every service-worker install over mobile. |
| 138 | APP-SEC-02 | app | S4 | confirmed | ux | S | owner decision | W5 | Blocks text zoom (WCAG 1.4.4). The UX worker covers visual checks. |
| 139 | APP-SEC-03 | app | S4 | confirmed | std | S | none | W3 | Identity and target changes need edits in many places. |
| 140 | APP-SEC-04 | app | S4 | confirmed | std | S | none | W3 | Browser-only packages are installed in every Cloud Run image (size, attack surface, audit noise). |
| 141 | APP-TEST-01 | app | S4 | confirmed | risk | S | none | W3 | In cloud sessions the live-shell suite cannot be validated and the specs silently read the real DEV site (GET  |
| 142 | APP-TEST-04 | app | S4 | confirmed | std | S | none | W3 | Running the suite dirties committed evidence; a careless `git add -A` after a local run commits regenerated sc |
| 143 | APP-UX-A11Y-02 | app (ux) | S4 | confirmed | ux | S | none | W5 | The pure-red KPI colour is the weakest text colour in the app and is used for the most important number; it wo |
| 144 | APP-UX-A11Y-03 | app (ux) | S4 | confirmed | ux | S | none | W5 | Several informational texts sit at 12px on a phone, below the 14px the rest of the app uses for captions. |
| 145 | APP-UX-BORROWER-01 | app (ux) | S4 | confirmed | ux | S | none | W5 | "TE" is an AppSheet-era abbreviation the English UI never explains, and an empty English name leaves a danglin |
| 146 | APP-UX-BORROWER-03 | app (ux) | S4 | confirmed | ux | S | none | W5 | Screen readers announce an unnamed combo box; clicking the caption does not focus it. |
| 147 | APP-UX-BORROWER-04 | app (ux) | S4 | confirmed | ux | S | none | W5 | The destructive action sits beside the most-used ones with no visual distinction; on mobile it is an unlabeled |
| 148 | APP-UX-BORROWER-05 | app (ux) | S4 | confirmed | ux | S | none | W5 | On a phone the user fills 12 fields before seeing Save/Cancel, and the numeric/phone-style fields open the def |
| 149 | APP-UX-BORROWER-06 | app (ux) | S4 | confirmed | ux | S | none | W5 | Negative money is formatted two ways across adjacent screens. |
| 150 | APP-UX-CASH-01 | app (ux) | S4 | confirmed | ux | S | none | W5 | Two date notations on one screen; for a Thai operator on an en-US device the month/day order is ambiguous. |
| 151 | APP-UX-CASH-02 | app (ux) | S4 | confirmed | ux | S | none | W5 | On mobile the statement (the actionable part) is below ~1,300px of KPIs that the Dashboard already shows; the  |
| 152 | APP-UX-CASH-03 | app (ux) | S4 | confirmed | ux | S | owner decision | W5 | Partner names are baked into UI strings; the Management › Partners screen already carries partner records, so  |
| 153 | APP-UX-COLLECT-01 | app (ux) | S4 | confirmed | ux | S | none | W5 | Same chip position carries two meanings; the legend "Left: remaining · Right: collected today" does not cover  |
| 154 | APP-UX-COLLECT-02 | app (ux) | S4 | confirmed | ux | S | none | W5 | After scrolling past a heading, colour is the only status cue; fails WCAG 1.4.1 for colour-blind readers. |
| 155 | APP-UX-COLLECT-03 | app (ux) | S4 | confirmed | ux | S | none | W5 | Loan links inside charge rows are under the 44px target the rest of the app enforces; mis-taps open the charge |
| 156 | APP-UX-COLLECT-04 | app (ux) | S4 | confirmed | ux | S | none | W5 | A bare "0%" next to the search icon has no visible caption; operators cannot tell what is loading or whether i |
| 157 | APP-UX-I18N-01 | app (ux) | S4 | confirmed | ux | S | none | W5 | Thai screen-reader users hear "Pagination" and "Loan Manager" (the old product name) in English; otherwise Tha |
| 158 | APP-UX-I18N-02 | app (ux) | S4 | confirmed | ux | S | none | W5 | None observed; recorded so the owner knows Thai layout was checked at both widths. |
| 159 | APP-UX-NAV-01 | app (ux) | S4 | confirmed | ux | S | none | W5 | 12px text, no spacing and permanent placement make the single most frequent status message in the app the leas |
| 160 | APP-UX-NAV-02 | app (ux) | S4 | confirmed | ux | S | none | W5 | On a 1280×800 laptop the sidebar needs its own scroll to reach EN/ไทย, install and Sign out. |
| 161 | APP-UX-NAV-03 | app (ux) | S4 | confirmed | ux | S | none | W5 | Two identical icons on one screen do different things (open receive form vs. go to Payments list). |
| 162 | APP-UX-PERF-02 | app (ux) | S4 | confirmed | ux | S | infra change | W5 | Hashed, immutable assets are refetched on every navigation that bypasses the service worker (first load, SW up |
| 163 | APP-UX-PERF-03 | app (ux) | S4 | confirmed | ux | S | none | W5 | Load performance is good. The missing headers are already item 5 of the App brief (A + F); noted here only as  |
| 164 | APP-UX-RECEIVE-02 | app (ux) | S4 | confirmed | ux | S | none | W5 | Nested scrolling on touch devices hides charges (4 rows need 617px, box is 371px) and makes it easy to scroll  |
| 165 | APP-UX-RECEIVE-03 | app (ux) | S4 | confirmed | ux | S | none | W5 | The review screen repeats the borrower name twice and shows the receiving account and date/method as bare valu |
| 166 | APP-UX-RECEIVE-05 | app (ux) | S4 | confirmed | ux | S | none | W5 | The UUID is meaningless to the two operators; the useful next action (open "Waiting to sync") is not offered h |
| 167 | APP-UX-RECEIVE-06 | app (ux) | S4 | confirmed | ux | S | none | W5 | Disabled-until-amount button is barely readable and there is no hint that typing an amount enables it. |
| 168 | APP-UX-SETTINGS-02 | app (ux) | S4 | confirmed | ux | S | none | W5 | Before sign-in the header advertises a Dashboard, a disabled refresh with a Borrowers label, and a hamburger t |
| 169 | APP-UX-SETTINGS-03 | app (ux) | S4 | confirmed | ux | S | none | W5 | The user cannot see whether notifications are on for this device without pressing "Check notification status". |
| 170 | APP-UX-SETTINGS-05 | app (ux) | S4 | confirmed | ux | S | none | W5 | Sign-out is one mis-tap from the language switch; signing out purges the offline repository (`live-main.tsx:33 |
| 171 | DB-ACCESS-04 | db | S4 | confirmed | std | S | none | W3 | No bypass found. Residual: the depth check accepts any trigger context at depth ≥ 2, not specifically the CRUD |
| 172 | DB-ACCESS-05 | db | S4 | confirmed | std | S | owner decision | W3 | Dormant login principals widen the inventory operators must reason about. |
| 173 | DB-AGENTDB-03 | db | S4 | confirmed | std | S | none | W4 | One-time provisioning script that cannot run from the documented Linux path; schema carries SQLite conventions |
| 174 | DB-BACKUP-02 | db | S4 | confirmed | std | S | none | W3 | Sprawl; each copies connection and bucket handling, so a secret-path change must be repeated 28 times. |
| 175 | DB-BACKUP-05 | db | S4 | confirmed | std | S | owner decision | W3 | Indefinite retention of full borrower dumps per release. |
| 176 | DB-CI-03 | db | S4 | confirmed | std | S | none | W3 | Dead or silently rotting suites. |
| 177 | DB-CI-04 | db | S4 | confirmed | std | S | none | W3 | Every PR branch push runs the 15–20 minute Windows job twice. |
| 178 | DB-DOC-01 | db | S4 | confirmed | doc | S | none | W6 | Two dictionary READMEs say V91 while the database README says V92 |
| 179 | DB-DOC-02 | db | S4 | confirmed | doc | S | none | W6 | `settings/` and misspelled `settingss/` both exist, both indexed, typo documented as official |
| 180 | DB-DOC-03 | db | S4 | confirmed | doc | S | none | W6 | `pwa_submit_operation_v2` entry is current for V92; its provenance fields are not |
| 181 | DB-DOC-04 | db | S4 | confirmed | doc | S | none | W6 | Payments trigger list has no drift; the data-model overview never mentions triggers |
| 182 | DB-DOC-05 | db | S4 | confirmed | doc | S | none | W6 | `database/OWNERSHIP.md` describes three repositories that are now one |
| 183 | DB-DOC-06 | db | S4 | confirmed | doc | S | none | W6 | Pre-merge "three repositories" wording survives in three current references |
| 184 | DB-LOCK-02 | db | S4 | confirmed | arch | S | schema change | W4 | Dead state machine columns; nothing wrong today. |
| 185 | DB-LOCK-03 | db | S4 | confirmed | std | S | none | W4 | target,0)` (`V83:141-857`, `V85:37-382`, `V90:135`); `pg_locks` shows the database OID (Checks executed). `pay |
| 186 | DB-PERF-04 | db | S4 | confirmed | std | S | infra change | W4 | No per-query telemetry when a slow endpoint is reported. |
| 187 | DB-SCHEMA-04 | db | S4 | confirmed | std | S | none | W4 | `money` formatting depends on `lc_monetary`; arithmetic needs explicit `::numeric` casts everywhere. Existing  |
| 188 | DB-SCHEMA-05 | db | S4 | confirmed | std | S | none | W4 | definition`; `V32:9` `UPDATE public."Partners" SET "AI Reviewer" = true …` selects a business row inside schem |
| 189 | DB-SCHEMA-07 | db | S4 | confirmed | std | S | none | W4 | The only Linux Flyway runner cannot migrate anything newer than V58; it is dead code that reads as a supported |
| 190 | AGT-QUALITY-01 | agent | S4 | confirmed | std | M | none | W3 | Duplicated helpers and broad excepts |
| 191 | ALL-CI-04 | overall | S4 | confirmed | std | M | none | W3 | No lint, format or type check outside the PWA (proportionate toolchain) |
| 192 | ALL-CI-07 | overall | S4 | confirmed | std | M | none | W3 | Promotion tooling grows a branch per release and Hosting delivery exists three times |
| 193 | ALL-DOC-04 | overall | S4 | confirmed | doc | M | owner decision | W6 | Reading load before a routine change is about 6,000 words of rules, 16,000 one level out |
| 194 | ALL-DOC-05 | overall | S4 | confirmed | doc | M | none | W6 | Each deployment pin is copied into four files |
| 195 | ALL-DOC-06 | overall | S4 | confirmed | doc | M | owner decision | W6 | "Open development changes" is 95 percent released history |
| 196 | ALL-DOC-09 | overall | S4 | confirmed | doc | M | owner decision | W6 | `project/outputs` is 155 MB and the 1 MB rule never fires because one-off scripts keep citing it |
| 197 | ALL-DOC-10 | overall | S4 | confirmed | doc | M | owner decision | W6 | Monitoring prose is six times the size of the PWA architecture prose |
| 198 | ALL-STD-02 | overall | S4 | confirmed | std | M | none | W3 | Project id, number and service URLs are hard-coded |
| 199 | ALL-STD-03 | overall | S4 | confirmed | std | M | none | W3 | Four error-code vocabularies with no catalogue |
| 200 | APP-ARCH-03 | app | S4 | confirmed | std | M | none | W3 | Fixes and timeout policy drift between services. |
| 201 | APP-QUALITY-01 | app | S4 | confirmed | std | M | none | W3 | Review and diff quality suffer; type errors in services surface only at runtime or in tests. |
| 202 | DB-AGENTDB-04 | db | S4 | confirmed | std | — | none | W4 | Sound defaults; no finding. Recorded for the access inventory. |
| 203 | DB-PAY-01 | db | S4 | confirmed | std | — | none | W4 | Guard holds. Seven definitions make the history hard to read (DB-SCHEMA-01). |
| 204 | DB-PAY-02 | db | S4 | confirmed | std | — | none | W4 | No defect found by static read; the probe could not reach these guards without a larger fixture. |
| 205 | DB-PERF-02 | db | S4 | confirmed | std | — | none | W4 | No performance defect at current scale. |
| 206 | DB-SCHEMA-08 | db | S4 | confirmed | std | — | none | W4 | Expand/contract is being followed. |
| 207 | AGT-HOST-02 | agent | S4 | likely (directory modes not readable wit | risk | S | owner decision | W3 | Credentials are plaintext files; the Graph refresh token is writable by four units |
| 208 | AGT-PRIV-01 | agent | S4 | likely (journal not readable) | doc | S | none | W1 | Scheduled output is aggregate; only operator commands print content |
| 209 | AGT-QUALITY-05 | agent | S4 | likely | std | S | owner decision | W3 | One-off activation scripts outlive their purpose |
| 210 | AGT-STATE-03 | agent | S4 | likely | risk | S | none | W3 | The reply scan re-reads every reply since the review cutoff every 20 seconds |
| 211 | APP-PAY-06 | app | S4 | likely | std | S | none | W3 | The outcome is in fact "not applied". Reconciliation recovers, but the user sees "unknown" for a known failure |
| 212 | APP-UX-SETTINGS-04 | app (ux) | S4 | likely | ux | S | none | W5 | The app may reload itself mid-session (list position, search, expanded groups lost) without telling the user w |
| 213 | ALL-DOC-11 | overall | S4 | likely | doc | M | owner decision | W6 | `AGENTS.md` is a manual; safety rules sit after 600 words of process |
| 214 | APP-ARCH-06 | app | S4 | likely | arch | M | none | W3 | At two users and about 45 components, a router library or i18n framework is not warranted. The real cost is th |
| 215 | ALL-INFRA-05 | overall | S4 | hypothesis (no load observed) | risk | S | none | W3 | PROD API capacity: one instance, five requests, platform timeout shorter than app timeout |
| 216 | APP-DATE-02 | app | S4 | hypothesis | risk | S | none | W3 | If WebKit rejects it, timestamps render as `—` on iPhone. |
| 217 | ALL-DOC-12 | overall | S4 | hypothesis | doc | L | owner decision | W6 | Proposed light structure: one current-state page per component, no new process |

## Summary

| Severity | Count |
| --- | --- |
| S1 | 0 |
| S2 | 1 |
| S3 | 15 |
| S4 | 32 |
| Total | 48 |

Counts by section: Architecture 8, Delivery and CI 9, Infrastructure 7, Monitoring/cost/third parties 3, Evidence privacy 4, Standardization 5 (the sections above; the two placeholder sections add their own), Documentation and process system 12 (merged from Agent D).

Top 5 for the owner:
1. ALL-PRIV-01: the public repository holds real borrower ledgers, balances and draft collection messages; make it private today and delete the three folders.
2. ALL-CI-01/CI-09: `main` has failed on every push since R060 with no protection, and the red e2e step also skips the Terraform checks.
3. ALL-INFRA-01: the cloud executor is a project Owner with two never-expiring keys; delete one, rotate, and consider a narrower role.
4. ALL-MON-01 + ALL-COST-01: none of the last four post-release failures would have paged, and there is no budget alert.
5. ALL-ARCH-01/02: DEV runs different code than PROD (and paused schedulers), and the agent writes PROD money tables outside the command API with no DEV target.
