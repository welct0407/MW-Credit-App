# Contained production package preparation

Current owner decision: reuse project clever-oasis-508610-n7 /737787224638 and its default Firebase authentication/same user group; production API authorization and resource/deployment bindings remain separate. The earlier new-project/tenant proposals are superseded. Park partial project219146337993/private tainted state; this tool never recovers or mutates it.

manifest.mjs checks explicitly supplied local metadata/artifact bytes. No cloud client, subprocess, network, SQL or apply implementation exists. CLI defaults to dry run and rejects --apply. This is not a deployment runner, evidence of live IAM enforcement or an authorization grant.

```powershell
. ./scripts/Enter-Dev.ps1
node scripts/promotion/manifest.mjs --manifest PATH --dry-run
node scripts/promotion/manifest.mjs --manifest PATH --artifact-root CURRENT_ROOT --rollback-root RECOVERY_ROOT
node --test tests/unit/phase3-promotion-manifest.test.mjs
```

## Linux cloud sessions

`deploy-business-hosting.mjs` runs unchanged from a Claude Code cloud session. The cloud account `codex-cloud` holds Token Creator on the pinned operator `mw-credit-unattended-admin`, so supply the operator token and the impersonation source token from gcloud:

```bash
GOOGLE_OAUTH_ACCESS_TOKEN=$(gcloud auth print-access-token --impersonate-service-account=mw-credit-unattended-admin@clever-oasis-508610-n7.iam.gserviceaccount.com) \
GOOGLE_IMPERSONATION_SOURCE_TOKEN=$(gcloud auth print-access-token) \
node scripts/promotion/deploy-business-hosting.mjs --apply --inputs ABSOLUTE_PRIVATE_PACKAGE --approval-reference '...' --output ~/.mw-private/MW-Credit-App/RECEIPT.json
```

The private root is `MW_PRIVATE_ROOT/MW-Credit-App` (default `~/.mw-private`); each receipt write is also copied to `gs://mw-credit-operator-private-737787224638/promotion-receipts/`. Keep packages there too, since the session disk is discarded.

## R068 runtime and frontend promotion after V94 and V95

`deploy-business-hosting.mjs` accepts `schemaVersion: 9`, `release: R068`, `scope: runtime-workers-frontend`, modelled on R064. The source must descend from the R067 release `7f8ef53` and add exactly `V94__job_run_contract_and_shared_lock_key.sql` and `V95__agent_role_session_pair.sql`. `sql` pins baseline 93 and target 95, both migration hashes (checked against the source bytes), the tested grouped release manifest (`sql.release`: absolute private path, SHA256 and commit; the commit descends from the source with no `database` change, its `productionTransaction` is 93 to 95 grouped in one transaction without callbacks, and it pins every source migration), the applied record (`sql.applied`: instance, start and finish, two migrations executed, dump SHA256 with a passed restore and its `prod-promotion-…` reference) and a read-only readback of 95 successful history rows taken after the apply. The plan is the saved 0/4/0 image-only plan and the four applied revisions must run the build image and differ from the rollback revisions, whose image must differ too. The CI gate is R064's (`full`, `check`, `database`; each an input-equivalent ancestor or the delivery-tool commit); for R068 the delivery-tool commit may also carry `scripts/database/Backup-ProductionPromotion.py` and this README. Apply re-reads the three runs, the Cloud Build source and digest, all four live services and the worker caller subjects.

## R065 and R066 Hosting-only promotions on the R064 runtime

R066 uses the same contract with `schemaVersion: 8`, `release: R066` and baseline R065 `74ad26b` (the source must descend from it); the runtime, SQL and production Terraform inputs are still compared with R064 `9420c85`.

`deploy-business-hosting.mjs` accepts `schemaVersion: 7`, `release: R065`, `scope: frontend-only`, `status: prepared`. The source must descend from the R064 release `9420c85` and change none of `services`, `database`, `Dockerfile`, `.dockerignore`, `.gcloudignore`, the Cloud Build files, `package.json`, `package-lock.json`, `infrastructure/production` or `infrastructure/modules`; the package carries no `build`, `plan`, `applied` or `activation`, pins verified V93 with no migration, the four unchanged R064 services (`runtime.services`) and the Hosting rollback. CI is gated as for R064 (`full`, `check`, `database`, each an input-equivalent ancestor or the delivery-tool commit). Apply re-reads the three runs and requires the live services to still run the pinned images and revisions. (R064, `schemaVersion: 6`, used the same CI gate with an applied four-image runtime.)

## R063 runtime, workers and frontend promotion

`deploy-business-hosting.mjs` accepts `schemaVersion: 5`, `release: R063`, `scope: runtime-workers-frontend`. The package pins one PROD image for reader, command, notify and jobs, V92 with no migration plus a read-only V92 readback, the reviewed `infrastructure/production` plan (0 add / 4 change / 0 destroy, four images and the worker caller subjects) and all four applied revisions, which must differ from the rollback revisions. CI is reused, not rerun: `full` (check, three e2e shards, Terraform), `check` and `database` runs must each be ancestors of the source with no change to the inputs they cover. A delivery-tool commit may add only the runner, its unit test and documents. Apply re-reads the three runs, the Cloud Build source and digest, all four live services and the worker `WORKER_CALLER_SUBJECTS_JSON`. Headers come from `hostingHeaders('live-prod')`. Delivered on 16 October 2026; pins in the [R063 record](../../project/Documents/Development_Changes.md#r063-production-promotion).

## R061 frontend-only promotion

`deploy-business-hosting.mjs` also accepts the separate `schemaVersion: 3`, `release: R061`, `environment: prod`, `scope: frontend-only`, `status: prepared` package. It forbids runtime build/plan/SQL/applied fields and preserves the existing API/SQL baseline. Source must descend from the deployed frontend baseline, with only allowed frontend/test changes; separately pinned delivery-tool changes are limited to the runner and its unit tests with passing focused checks.

This path validates the successful exact-source PR CI and reads the actual GitHub run/jobs back before apply. Browser workflow steps may be skipped, but the package must supply the 12 passing/zero-skip focused cases, three commands and an immutable PM Development_Changes record commit/hash. It validates exact PROD bindings, all artifact bytes and Hosting recovery pins. Existing signed-operator verification and exclusive private pending-reconciliation receipt handling remain mandatory. A failed/unknown mutation outcome requires reconciliation before retry. This path does not fabricate the R059 two-image apply or require unrelated full browser dispatch.

R061 was delivered at app/artifact source1e0dd73 and runner5e823791; exact environment versions, verification limits and recovery live in the existing PM R061 record/inventory. Creation of its private package/receipt was explicitly owner-approved. Historical R059/foundation/R053 contracts remain separate.

## Current R059 app-only promotion

`deploy-business-hosting.mjs` supports a separate `schemaVersion: 2`, `release: R059`, `environment: prod`, `scope: app-only` package. Historical foundation/R053 contracts remain unchanged. Use an absolute private `--inputs` path with `--check`; `--apply` also requires owner approval and an absolute private `--output` receipt. Creating a missing package/receipt requires explicit document-creation approval.

The package pins one immutable source/build, exact PROD target, V91→V91 with no migrations, a reviewed reader/command-image-only plan and prior Hosting plus all four runtime recovery pins. Apply requires Ready/100% reader and command readback and unchanged notify/jobs. Artifact bytes, public bindings, mode/marker/entry and matched PROD service worker are validated. Source drift rejects.

Application evidence must be the successful exact-source `.github/workflows/ci.yml` `workflow_dispatch` run with executed check, live-dev build, audit and full `test:e2e`; a PR run with skipped browsers cannot satisfy this gate. Operator verification checks the supplied access-token principal and signed audience-bound impersonation proof for the established unattended admin, then verifies the live package identities/configuration before Hosting effects.

The runner reserves the private receipt exclusively as `pending-reconciliation` before mutation and replaces it with actual applied release identity. If the outcome or final receipt write is unknown, do not replay: retain emitted identities and reconcile the live Hosting release first. `manifest.mjs` remains preparation-only; it is not this apply route.

## Draft, candidate and authority

Use schemaVersion1, environment prod, mode foundation. status draft accepts unbound inputs and returns an explicit missing list; it never invents DEV defaults. status reviewable requires complete exact target, stage artifacts, evidence links and recovery. validateCandidate (alias validateReviewable) accepts a complete candidate before owner mutation approval: reviewReady=true, approvalRequired=true, deployReady=false. Optional validateAuthorizedPackage checks a future reference against source/target but still cannot execute or prove authority. A future executor must independently verify scope, live identities, plan hashes, provenance and recovery.

Current shared target requires isolation shared-project-default-auth, exact existing application/data IDs, auth.projectId/audience same project, issuer https://securetoken.google.com/clever-oasis-508610-n7, auth.tenant:null. Project equality without explicit isolation rejects; tenant auth is not selected. Authentication is intentionally shared; there is no claim that a correct shared-user token is denied solely because obtained from DEV. Production serverVerifier and devDeliveryContainment evidence references are mandatory, but a reference alone is not actual IAM proof. Project administrators are outside this logical isolation.

Target binds separate production service names/runtime SAs, site/canonical/fallback origins, state bucket/prefix/generation and mw-credit-app-prod registry instead of DEV mw-credit-app. Retained SQL/receipt identities are reference pins only, not access capability. No production receipt/health prefix is required while no data capability exists. Numeric secret refs are purpose scoped: foundation requires owner-identity only; optional sign-in diagnostic/enrollment phase requires no runtime secret version. Empty unused containers need no dummy versions.

fingerprint(target) is SHA256 of canonical JSON with sorted object keys and preserved array order. Candidate source is a full40-character commit, matching target SHA. Foundation images are immutable own-repository digests with exact contained services/production/server.mjs entrypoint. Optional enrollment phase has no application images or endpoints; it diagnoses the existing sign-in, never requires another account.

## Exact B shell artifacts

The initial shell explicitly has publicWorker:false, cachePolicy:no-store, entry:index.html, phase enrollment/foundation. No worker hash or fake public version is accepted. It uses B's actual public-config.json and foundation-shell.json schema plus index.html/shell.js and firebase.json global no-store config; all files carry SHA256. The marker binds phase/cachePolicy/worker:null/entry/configSHA. Public config uses authIsolation shared-default, exact Firebase projectId/apiKey/appId/authDomain (no tenantId), canonical origin and endpoints:null or exactly the two verified production /api/session URLs. Runtime origins are target readback pins; bundled shell values must match public config. Public API key/WebApp IDs are application identifiers; OAuth secrets, UID pins, tokens and catalogs are forbidden.

All artifact reads use explicit canonical roots with bounded size/count and an allowlisted file manifest. Unknown fields, unallowlisted JSON, private payloads, traversal/dot paths, changed bytes and junction/symlink escapes reject. Earlier separately configured matched-worker update packages remain checked under their original strict contract; a shared-project initial shell cannot use that legacy worker form.

## First deployment and updates

rollback.kind:first-deployment requires exact project/number, state generation/lineage, evidence of absent prior reader/command/Hosting version, observed DNS before-state (including verified empty records), explicit withhold/retain traffic/route actions, and immutable maintenance frontend bytes. Maintenance has authIsolation:none, endpoints:null, no Firebase configuration or auth/API calls. Actual B buildMaintenanceShell output is tested. No fictional predecessor revisions/Hosting version or SQL rollback. These references/local checks do not establish a measured live recovery.

When a real predecessor exists, kind:update (or legacy omitted kind) retains matched immutable images, revisions, Hosting version, configuration/worker or workerless artifact hashes, numeric secret pins and state generation. Update checks remain strict. Creation/deployment failure stops dependent activation and preserves inert resources/history/private state, never destroys shared resources to undo application failure.

SQL mode is exclusively none. Future migration packages reuse the existing exact-tested-commit/hash/backup/authorization runner, not this tool. Credentials, Terraform state/plans and recovery payloads stay outside Git. Use the single PM Phase3 batch and existing owning logs; actual promotion uses applicable master-checklist rows. R052 remains Open and Phase3 in progress. Focused fixtures are synthetic local evidence, with no CI or live-action claim.

## Controlled operator Hosting delivery

The separate scripts/production/deploy-foundation-hosting.mjs executor implements only the approved contained PROD Hosting route. The manifest validator above remains local-only. Required explicit inputs: --manifest PATH --artifact-root CURRENT_ROOT --rollback-root RECOVERY_ROOT --ci-run RUN_ID; default is dry run. --apply verifies the exact source successful CI workflow with its actually executed browser step before reading an operator credential. It then independently verifies the approved human OAuth identity and both actual Hosting sites, rechecks artifact bytes and publishes only mw-credit-prod-737787224638 with no-store and no service worker. Failure preserves the package/any created version; inspect sanitized stage evidence before continuing.

Use the established signed-in gcloud account welct0407@mw-credit.com to capture a short-lived token into GOOGLE_OAUTH_ACCESS_TOKEN in the same process and clear it in finally. Existing GitHub read credentials go into GITHUB_TOKEN only for that process. Never print/store either token, change sign-in stores or create ADC solely for this helper. A default ADC is not required. Production identity/site readbacks do not themselves prove deployment success. Current owner scope already authorizes this contained delivery; manifest authorization references and the flag record that scope, rather than seeking it again.

DEV workflow API steps remain unchanged. Its Hosting step now reports controlled operator instructions; the automated DEV identity must not publish either site. DEV Hosting continues through the maintained scripts/deploy-hosting.mjs --live-dev route using its exact DEV artifact. Coordinate verified human access before F removes the project-wide automated Hosting grant.

cloudbuild-foundation.yaml builds only exact Docker/package/services input into the separate mw-credit-app-prod registry with the verified production build service account/source bucket. Do not submit a dirty repository or reuse the DEV repository. Record build/source/input hashes, immutable digest and final source input-equivalence; successful artifact build does not substitute for final full CI or live proof.

## Business candidate preparation â€” no production execution

`mode: business` is a separate local contract. Drafts list missing inputs. A complete reviewable package still returns `deploymentAuthorized:false`, `deployReady:false` and `approvalRequired:true`. `validateAuthorizedPackage` and the existing foundation Hosting executor reject business mode; `--apply` remains unsupported by candidate validation. No production business migration, grants, Hosting publication, notification or job switch is implemented here.

Supply explicit absolute current/rollback artifact roots, private policy/catalog files, migration root, sanitized build/CI evidence and the actual foundation delivery baseline:

```powershell
node scripts/promotion/manifest.mjs --manifest PRIVATE_CANDIDATE --artifact-root CURRENT_ROOT --rollback-root FOUNDATION_ROOT --policy-file PRIVATE_POLICY --receipt-catalog-file PRIVATE_CATALOG --migration-root MIGRATIONS --baseline-file BASELINE_EVIDENCE --ci-evidence-file CI_EVIDENCE --build-evidence-file BUILD_EVIDENCE --dry-run
```

The business contract checks the exact shared PROD tuple/services/site/origins; immutable business-server image digests and exact-source build/input hashes; successful executed full browser CI source/run pins; all migration filenames/hashes; complete private current-sharing Partner policy and numeric policy/catalog secret versions; B's production receipt parser with a separately reviewed object-root/evidence binding; compiled PROD public config/entry/worker hashes; inactive notification/job/purge flags; retained AppSheet job ownership; source-adapter/recovery evidence; and the real foundation revision/image/Hosting pins with unchanged rollback bytes. It emits counts/hashes, never policy members or catalog keys. Synthetic tests are contract proof, not live readiness or a production authorization grant.

`Prepare-ProductionPolicy.ps1` reads only the two reviewed sharing identities' current Partner key, financial role and Login Email, from PROD under a read-only session. Inputs and output stay under the private current-user candidate-policy root, outputs never overwrite existing files, and capabilities come from explicit reviewed sharing/action evidence. Financial A/B does not select authorization rights. Policy preparation creates no secret version, account or grant.

## Later grouped SQL promotion

Fresh read-only 11 October PROD history is V77; pending migrations are V78 through the final candidate (including V87 environment isolation). The maintained `Invoke-Flyway.ps1` requires its existing clean tested commit, full migration hashes, owner production approval and verified backup. This task prepares the following later execution contract; it does not execute it:

```powershell
./scripts/database/Invoke-Flyway.ps1 -Environment production -Command migrate -ReleaseFile PRIVATE_TESTED_RELEASE -ApprovalReference SCOPED_OWNER_APPROVAL -BackupReference VERIFIED_RESTORE_REFERENCE -GroupedProduction -ConnectPreflightFile PRIVATE_FRESH_CONTAINMENT_PROOF
```

The tested release's `productionTransaction` pins `baselineVersion:77`, complete final target, `group:true`, `mixed:false`, `executeInTransaction:true`, empty `callbacks`, and exact CONNECT preflight SHA256. Callback/sidecar/nontransactional SQL and ambient overrides refuse. The runner re-reads actual PROD history/pending scope immediately before the later write. A fresh CONNECT preflight must verify current configured legitimate consumers (not only active sessions), explicit reconnect, PUBLIC CONNECT removal, every DEV principal's direct/inherited denial and zero pre-existing DEV sessions. Current observed PUBLIC/DEV CONNECT means that prerequisite is still incomplete; no permissions changed during preparation.

The operator separately snapshots, temporarily establishes only the exact reviewed SET/INHERIT/schema CREATE prerequisites, and restores original grantors/options in `finally`. Failure preserves persistent CONNECT containment; never automatically regrant PUBLIC, repair history, delete new audit tables or replay uncertain effects. The actual shared-cluster group observer/failure/authority restoration rehearsal remains required before promotion readiness. Pure guard tests alone do not establish atomic Flyway behavior.

Maintained full migration fixtures now use a disposable `loan_manager_dev` database so V87's database mapping is exercised rather than relaxed. Concurrency helpers accept a bounded optional database name and preserve their original `postgres` default for other callers. No live database is renamed.
The role-prerequisite CLI accepts `--environment production --creator-file <reviewed-private-registry>` for read-only plans. Production `--apply` is rejected before credential lookup. `--grouped-maintenance` and `--restore-grouped-maintenance` use the two-owner helper; both exact membership/schema grantors must be reviewed. The helper restores only its own tuples and preserves unrelated permanent V87 ACL changes, but callers must verify the final V87 manifest and run restoration in `finally`. It never restores PUBLIC CONNECT. Pure planner checks do not replace actual nonsuperuser/grantor/failure-path verification. The generic coarse role-recovery helper remains DEV-only.

## Prepared package and applied receipts

`status: prepared` uses planned secret `{status:"planned",projectId,name,payloadSha256}` and never invents numeric versions. Supply `--connect-evidence-file`, `--preparation-evidence-file`, `--source-set-file`, `--required-tests-file`, `--rollback-backup-file` in addition to current artifact/policy/catalog/migration/CI/build/baseline inputs. Actual bytes must match preparation hashes; ordered apply/recovery actions and current configured-consumer sources/planned CONNECT diff are required. Complete pending78–87 includes inactive86. Both prepared and applied reports retain deployReady=false/deploymentAuthorized=false.

The applied contract requires numeric versions and fresh real CONNECT denial/reconnect/session evidence. `validateBusinessApplyReceipts` binds prepared canonical digest, exact source/artifacts/SQL/rollback, intended resources and actual version/readback hashes. Drift rejects; no execution is implemented. build-mode.json schemaVersion1/mode live-prod and actual compiled API/Firebase bindings are checked; successful Vite exit alone does not establish artifact readiness. Preserve current historical catalog provenance privately and refresh at cutover; approved PWA→AppSheet proof is actual DEV rendering plus PROD binding, with first real PROD view after authorized promotion.


## R053 jobs-only recovery image override

The reviewed timestamp recovery is a targeted PROD jobs image rebuild from published959b118; API and notification services retain their existing42534b image. F records the actual new jobs digest, revision, saved jobs-only plan and private recovery tfvars in the sanitized R053 deployment evidence. Actual build625ecf30/deployment receipt is project/outputs/r053-notifications-jobs/production-jobs-recovery-deployment.json: jobs00003-q4h uses11c149; reader/command/notify retain42534b. Next natural invocation verification is pending.

The shared `workers.image` value cannot by itself describe this temporary split. Future planning must preserve the actual corrected jobs image **and** the existing notification image: load the exact retained recovery inputs and review the per-service image diff. Do not apply a full plan that silently rolls jobs back to42534b or upgrades notification/API services. Keep the approved jobs-only target for this recovery; reconcile the split under an explicit later reviewed batch before unrestricted full applies. R063 (16 October 2026) reconciled it: one image on all four services and empty `runtime_image_overrides` and `workers.image_overrides`. No new generic Terraform feature, forced financial job, or full CI is required for this operator instruction. The next natural invocation must verify the live result; the earlier400 cause is still unproven.

PROD notification activation after owner-confirmed DEV phone receipt: notify00002-cth and command00004-xkp use42534b; function capture and minute recovery are enabled. DEV subscription/receipt never establishes PROD enrollment or receipt. The maintained fixed PROD capture-enable command requires explicit source/approval/recovery inputs and exact preparation/restoration in finally; keep the saved proconfig/OID/owner and restore only that marker on scoped recovery. No arbitrary test push or forced financial job.
