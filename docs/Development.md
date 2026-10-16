# Development and delivery

The root owns PWA/API/shared SQL/infrastructure, `project/` owns release coordination and current business references, and `integration-agent/` owns the Debian runtime. AppSheet is retired.

## Setup

On VM-01, dot-source `scripts/Enter-Dev.ps1`; reuse installed tooling and root dependencies. Elsewhere use supported tools matching .nvmrc/package-lock and Terraform required_version. Run npm ci only when dependencies require it. Cloud Build/GitHub handle image builds; local Docker is not a routine prerequisite.

Google project `clever-oasis-508610-n7`, region `asia-southeast1`; shared SQL `appsheet-pg-prod-20260914`; databases `loan_manager_dev` / `loan_manager_prod`. Receipt bucket `mw-payment-receipts-prod-508610-n7` remains private. Verify complete targets before operations. Current origins/pins are maintained in the project's Environment_Inventory.md.

## Credentials and Terraform

Cloud Run uses workload identities and IAM database authentication. Delivery uses established federation; operator tooling uses the maintained unattended route. Prefer Secret Manager references over manual password-file requests. Never print values or commit secrets, plans/state, auth exports or private data.

Use the owning infrastructure root's README/wrapper. Remote state already exists: do not bootstrap competing state. Review an exact plan before authorized apply. Terraform owns service settings; artifact delivery owns application image versions where configured. Shared SQL/bucket metadata is adopted; contents and the Azure VM controller are excluded.

## Delivery process and validation

Follow [PWA policy](../project/Documents/Rules/PWA_Orchestration.md). Select affected unit/contract/SQL/browser checks during implementation; run one broad checkpoint when scope warrants it and reuse that result for promotion. Required workflows remain in force.

CI routes by changed files: `Development checks` runs typecheck/unit/build for app changes, Terraform validation (all 20 root directories, plus `terraform test` in five of them) for infrastructure changes and the sharded Playwright suite when the PWA, specs or front-end configuration change; main pushes and manual dispatch run everything. `Database migrations` runs once per pushed commit as four parallel groups of `scripts/database/Test-CI.ps1` (`-Group migrations|receiving|phase5|phase8`; no argument runs all groups locally); changes under `services/**`, `tests/integration/**` and `scripts/rehearsal/**` also trigger it, as do database documentation paths. Maintained release tooling owns package and Hosting delivery; there is no separate DEV deploy workflow. Every workflow has a concurrency group, every action is pinned to a commit SHA, and the database, e2e and check jobs fail if they leave the working tree dirty. Do not bypass validators or claim this documentation changed workflows.

## Toolchain and lint

Biome 2.5.14 lints TS/JS (`npm run lint`, rules in `biome.json`, formatter off); it is non-blocking in CI. Ruff 0.16.8 checks `integration-agent`: syntax errors and undefined names block, the full config is reported. Flip both to blocking once the tree is clean.

## Database CI on Linux

`mw-db-ci [checkout] [-Group migrations|receiving|phase5|phase8]` runs all four groups as `postgres` (installed by `project/scripts/cloud-session-setup.sh`; the checkout defaults to the current Git checkout, then `$MW_CREDIT_APP_ROOT`). GitHub runs them on ubuntu-latest; a manual dispatch can choose windows-latest. `Test-AccessMatrix.sql` asserts the migration-owned grants, so grant drift fails CI.

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