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

CI routes by changed files: `Development checks` runs typecheck/unit/build for app changes, Terraform validation for infrastructure changes and the sharded Playwright suite when the PWA, specs or front-end configuration change; main pushes are classified from the pushed commit range and manual dispatch runs everything. `Database migrations` runs once per pushed commit as four parallel groups of `scripts/database/Test-CI.ps1` (`-Group migrations|receiving|phase5|phase8`; no argument runs all groups locally). Database workflow paths also match database documentation. The original manual DEV deployment workflow covers its configured API; maintained release tooling owns full package/Hosting delivery. Do not bypass validators or claim this documentation changed workflows.

Use one promotion record plus runner-required manifest. Pin immutable artifacts and dependencies, record existing scoped authority/recovery, deploy the intended components, run one bounded smoke and update changed facts. No AppSheet validation or duplicate design/checklist/continuation inventory.

## Recovery

Restore a verified Cloud Run digest/Hosting version or agent package/configuration for affected code. This does not reverse financial writes or SQL. SQL recovery follows [database procedure](../database/README.md); preserve later user data. Review Git configuration/state together for infrastructure recovery; never blindly destroy resources or restore old state.

No live service or financial operation is authorized by these development instructions.