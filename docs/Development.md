# Development and delivery

The root owns PWA/API/shared SQL/infrastructure, `project/` owns release coordination and current business references, and `integration-agent/` owns the Debian runtime. AppSheet is retired.

## Setup

On VM-01, dot-source `scripts/Enter-Dev.ps1`; reuse installed tooling and root dependencies. Elsewhere use supported tools matching .nvmrc/package-lock and Terraform required_version. Run npm ci only when dependencies require it. Cloud Build/GitHub handle image builds; local Docker is not a routine prerequisite.

Google project `clever-oasis-508610-n7`, region `asia-southeast1`; shared SQL `mw-credit-pg-20261017`; databases `loan_manager_dev` / `loan_manager_prod`. Receipt bucket `mw-payment-receipts-prod-508610-n7` remains private. Verify complete targets before operations. Current origins/pins are maintained in the project's Environment_Inventory.md.

## Credentials and Terraform

Cloud Run uses workload identities and IAM database authentication. Delivery uses established federation; operator tooling uses the maintained unattended route. Prefer Secret Manager references over manual password-file requests. Never print values or commit secrets, plans/state, auth exports or private data.

DEV web builds (`build:live-dev`) take their Firebase client config from Secret Manager `mw-credit-app-dev-firebase-web` into the gitignored `.env.live-dev`, which is deleted after the build. From R071 (owner decision 17 October 2026) DEV uses that secret's `appId` as is, the MW Credit DEV web app `1:737787224638:web:b98872168121353cfbe76f`. DEV builds up to R070 used the MW Credit Production web app ID instead. PROD builds keep the Production web app from the pinned public config. Only Firebase sign-in reads the app ID, and the project and API key are shared, so switching changes neither sign-in nor cost.

Use the owning infrastructure root's README/wrapper. Remote state already exists: do not bootstrap competing state. Review an exact plan before authorized apply. Terraform owns service settings; artifact delivery owns application image versions where configured. Shared SQL/bucket metadata is adopted; contents and the Azure VM controller are excluded.

## Delivery process and validation

Follow [PWA policy](../project/Documents/Rules/PWA_Orchestration.md) and its [lean check routine](../project/Documents/Rules/PWA_Orchestration.md#lean-check-routine): fast checks locally once per finished batch, the pull request's CI run as the one broad run, one push per verified batch, and reuse of that result for promotion. Required workflows remain in force.

CI routes by changed files: `Development checks` runs typecheck/unit/build for app changes, Terraform validation (all 20 root directories, plus `terraform test` in five of them) for infrastructure changes and the sharded Playwright suite when the PWA, specs or front-end configuration change; main pushes are classified from the pushed commit range, and manual dispatch selects everything unless the `force` input is set. Every selected stage then goes through `scripts/ci/reuse-evidence.mjs` (stage definitions in `scripts/ci/stages.json`, tests in `tests/unit/ci-reuse-evidence.test.mjs`): a stage that already passed on this commit (pushed to another branch or tested on its pull request), on a parent or on an earlier head of the branch whose stage-relevant files are identical is skipped, and the run's step summary links the run that holds the evidence, so records-only follow-up pushes, "merge main" commits and the merge of a tested pull request do not repeat the suites. `Database migrations` runs once per pushed commit as `guards` plus four parallel groups of `scripts/database/Test-CI.ps1` (`-Group migrations|receiving|phase5|phase8`; no argument runs all groups locally); changes under `services/**`, `tests/integration/**` and `scripts/rehearsal/**` also trigger it, Markdown never does, and the same reuse step skips the groups when they already passed on identical database inputs (a Windows dispatch always rebuilds). `Agent tests` reuses in the same way. Maintained release tooling owns package and Hosting delivery; there is no separate DEV deploy workflow. Every workflow has a concurrency group, every action is pinned to a commit SHA, and the database, e2e and check jobs fail if they leave the working tree dirty. Do not bypass validators or claim this documentation changed workflows.

## Toolchain and lint

Biome 2.5.14 lints TS/JS (`npm run lint`, rules in `biome.json`, formatter off); it blocks CI on errors, while warnings are reported as annotations and do not fail the job. Ruff 0.16.8 checks `integration-agent` with the rule set in its `pyproject.toml` and blocks CI.

`npm run check:docs` (`scripts/check-docs.mjs`, run by CI on every event) fails on broken relative Markdown links or anchors, Cloud Run revision, image digest or Firebase Hosting version pins in current documents outside the [environment inventory](../project/Documents/Environment_Inventory.md), and change notes dated from 18 October 2026 that lack the [template headings](../project/Documents/Rules/Development_Workflow.md#records-change-notes-and-retention). It only warns about change notes older than 14 days that no current document links to, evidence files nothing current cites, and an `AGENTS.md` over 800 words.

## Database CI on Linux

`mw-db-ci [checkout] [-Group migrations|receiving|phase5|phase8]` runs all four groups as `postgres` (installed by `project/scripts/cloud-session-setup.sh`; the checkout defaults to the current Git checkout, then `$MW_CREDIT_APP_ROOT`). GitHub runs them on ubuntu-latest; a manual dispatch can choose windows-latest. `Test-AccessMatrix.sql` asserts the migration-owned grants, so grant drift fails CI. The migrations group also runs `Test-TriggerOrder.sql` (trigger firing-order snapshot) and `Test-LedgerAccess.sql` (cash-ledger definer under the real roles), and checks that the committed `database/current/public-functions.sql` equals a fresh rebuild. When a migration changes a public function, regenerate that file with `MW_WRITE_PUBLIC_FUNCTIONS=1 pwsh -NoProfile -File scripts/database/Update-PublicFunctions.ps1` (it refuses a `pg_dump` major other than the toolchain's) and commit it with the migration. The `phase8` group adds `Run-R053OperatorIndependent.ps1 -LedgerOwner`, which migrates V93 as a non-superuser operator with the temporary owner authority.

## Error codes

21 SQL ERRCODEs (custom P4C01-P4C05, P5B01-P5B10). Node maps SQLSTATE to code to HTTP in `payment-command/store.mjs`, `agent-receipts/runtime.mjs` and `agent-conversations/{handler,command-metadata,command-provider,policy}.mjs`. A new SQL code gets its Node mapping in the same change.

## Request ids and time zone

Each HTTP request gets a `randomUUID()`, returned as `X-Request-ID` and logged by the shared HTTP boundary (`services/lib/http-boundary.mjs`). The command `requestId` is the client's idempotency key (`contracts/payment-command.mjs`); worker job ids are deterministic (`workers/runtime.mjs`). The agent derives deterministic UUIDs from SHA-256 (`uuid_from_sha256` in `integration-agent/src/mw_integration_agent/http.py`).

Each runtime has one business time zone constant: `BUSINESS_TZ` in the Node `services/lib` business-date module and `BANGKOK` in `mw_integration_agent.business_time`. Do not add another.

## Browser fixtures

Canonical e2e fixtures launch Chromium with `--proxy-server=direct://` plus `--host-resolver-rules`. `--no-proxy-server` is ignored when a container proxy is set. A fixture that served no request fails with "canonical fixture served nothing".

Use one promotion record plus runner-required manifest. Pin immutable artifacts and dependencies, record existing scoped authority/recovery, deploy the intended components, run one bounded smoke and update changed facts. No AppSheet validation or duplicate design/checklist/continuation inventory.

## Recovery

Restore a verified Cloud Run digest/Hosting version or agent package/configuration for affected code. This does not reverse financial writes or SQL. SQL recovery follows [database procedure](../database/README.md); preserve later user data. Review Git configuration/state together for infrastructure recovery; never blindly destroy resources or restore old state.

No live service or financial operation is authorized by these development instructions.