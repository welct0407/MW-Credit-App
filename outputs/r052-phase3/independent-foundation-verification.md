# Phase 3A independent foundation verification

**Current checkpoint is the Phase3B shared-default section at the end of this file.** The initial separate-project record below is historical and superseded; its target/tenant/readiness assertions are not the current release contract.

Agent C, 11 October 2026. Starting application commit `24532742bd65a9fbf2bd53810b35e68100b5c3db`. Contract read from A's uncommitted design at `C:/Users/ideaadmin/.codex/worktrees/pwa-implementation-plan/AppSheet-Loan-Project/outputs/r052-pwa/phase3-foundation-design-and-test-plan.md`. Owner Phase5/6 verification and new-project/domain selection are retained; no additional cloud mutation authority was inferred.

**Local preparation checks passed: 52/52, zero skips.** This is not full Phase3 completion, live PROD readiness, a deployment or cutover result. No browser, full CI, cloud API, SQL, receipt upload or notification was executed by C. Existing source/output changes were preserved; synthetic CLI artifacts were created in bounded temporary directories outside the repository and cleaned by the tests. No historical screenshots were written.

## Commands and scope

After `. ./scripts/Enter-Dev.ps1`, Node24.21.0:

```text
node --test tests/unit/production-independent.test.mjs tests/unit/production-foundation.test.mjs tests/unit/dev-read-boundary.test.mjs
node --test tests/unit/production-promotion-independent.test.mjs tests/unit/phase3-promotion-manifest.test.mjs
```

First command:38 passed; second:14 passed. Relevant checks were run once against the saved implementation; unchanged broad/browser suites were not repeated. C added four independent server/runtime cases and two actual-subprocess CLI cases. B/D's maintained cases complement these independent integration proofs.

| A contract | Actual independent proof and boundary |
| --- | --- |
| P3A03 configuration | Ambient DB/storage/readiness/emulator/tenant fields reject before credentials/Admin initialization; B's mandatory-input/DEV identity/origin/version matrices and preserved DEV boundary tests pass. Exact project ID/number correspondence, attached principal and secret payload/version binding still require live readback. |
| P3A04 authentication | Real local HTTP runs through the production runtime and Admin-verifier seam for both reader/command roles. Equal owner UID/email with DEV issuer/audience denies; wrong issuer, tenant including null, provider, email verification, expired/future claims and unapproved owner deny. SDK seam always receives revocation=true and exact project/default-auth configuration. Thrown revoked/private errors return generic401; successful session exposes no UID/email or business permissions. This uses synthetic SDK claims, not signed-token/live revocation proof. |
| P3A05 containment/privacy | Raw absolute-form, encoded, traversal, query/bootstrap, duplicate-slash and trailing-slash targets across GET/POST/HEAD/OPTIONS deny before auth. Wrong origins/preflight headers and unsafe methods deny. Liveness is static. Correlated unique request IDs and fixed log keys contain no path/token/raw identity/private error. Dependency graph imports no SQL/GCS driver or business dispatcher. No data clients are reachable. |
| P3A06 readiness | **Disabled branch only:** no driver/probe exists, readiness routes deny, ambient enablement rejects and zero data/storage access occurs. Authorized identity/SELECT1 exact-tuple tests, wrong-live-principal checks and approved PROD health-prefix storage probes are deferred, not passed or silently skipped. |
| P3A07 promotion | Actual CLI subprocesses with current/prior synthetic hashed artifacts yield byte-identical sanitized review output, approvalRequired=true/deployReady=false/sqlAction=none. Apply is unsupported. Changed predecessor bytes, wrong environment/entrypoint, mutable image, wrong secret scope, missing predecessor, hostile fields, traversal and junction/symlink escapes reject with generic private-safe stderr and no output/actions. D's worker/marker/config hash matrices also pass. This validates metadata/bytes; it does not prove image content, compiled production behavior or live target/evidence authenticity. |
| P3A08 IAM/WIF | Bounded review of both Terraform roots and all six mock-case definitions confirms inert defaults, bounded enabled resource inventories, state protections and no shared SQL/bucket ownership. F's six successful mock executions are reused at the hashes below; no duplicate unchanged Terraform run was needed. Production WIF/trust/IAM bindings and deployed exclusion of DEV/PR/preview/runtime authorities are **not implemented or live-proven** by these roots. Proposed principal tables are requirements, not grants. |
| P3A09 rollback | Real CLI returns exactly the matched prior reader/command digests, frontend/config/worker versions, secret versions and state generation from a second artifact root. Changed/incomplete/wrong-target predecessor rejects. No SQL rollback/reset, deletion, runtime restore or recovery drill occurs. This is a local rollback-plan rehearsal; a future executor and actual predecessor/reconciliation evidence remain required. |

## Defect found and corrected

D's initial image validator accepted `services/foundation/*.mjs`, while B's actual contained entrypoint is `services/production/server.mjs`. C handed the mismatch directly to D. The validator now requires the exact existing entrypoint for both roles; the independent CLI regression rejects the former nonexistent path. No server defect or product change was needed from C's verification.

## Exact reviewed pins

SHA256 at verification; D owns coherent publication/change log:

| Source | SHA256 |
| --- | --- |
| `services/production/config.mjs` | `3ced73f4b79250189b31fb68bdcf86516d07a735e049beff0a58209723ce4369` |
| `services/production/principal.mjs` | `620b93be8f567efcbb1bab0885f5d406eb637fb65961bda1bcb4242c097c5062` |
| `services/production/handler.mjs` | `6e9d3d29674463d912ec048aeb86bae1038453db5f32c54ae90dbbd2cbe142ed` |
| `services/production/runtime.mjs` | `f0209ee8fcbffcbdc3a0a061f416b58ae49a52c09c60d192e8b36566addd11fd` |
| `services/production/server.mjs` | `913e8354d2cd3d573239c24c090e29213ae500f344eed923adc8ead9a4063c32` |
| `scripts/promotion/manifest.mjs` | `9c18a7010a55d2c8a30b83ae0d700bc2c0e2077779b72f9d2f1dbbfc348efd60` |
| `infrastructure/production/main.tf` | `68f2a85944694ee5132730cdfd07760bd2f2a73043c4327dea15b3ca26979318` |
| `infrastructure/production-bootstrap/main.tf` | `b2938317258519326d072799a87dda2de5a64a301772cec17134e289a12e34c6` |

C intended paths: `tests/unit/production-independent.test.mjs`, `tests/unit/production-promotion-independent.test.mjs`, and this evidence. Diff checks passed. Rollback is removal/reversion of these additive tests/evidence; no live recovery is needed. No unrelated source or deployment file was edited.

The reviewed code is ready for coherent preparation publication. Actual bootstrap creation remains subject to its concrete saved plan and scoped owner authorization; F/root's separately reviewed read-only plan is not a C execution. Project availability/number, organization/billing admission, state recovery, production auth/Hosting/runtime, cross-project SQL/GCS access, monitoring/capacity, live IAM isolation and contained deployment smoke remain separate pending deliverables. Business activation/notifications/cutover are outside this result.

## Current Phase3B shared-default checkpoint — 11 October 2026

Starting commit `1dc61115632a8f2b377f36051cc60630542b6aa6`. Read the revised A design at the same absolute worktree path above, current application AGENTS, B's [shared-auth shell contract](shared-auth-shell-evidence.md), D's current manifest contract and F's current Terraform files. Latest owner decision selects existing `clever-oasis-508610-n7` / `737787224638`, existing default Firebase authentication/same users, and `lm.mw-credit.com`. Neither a new application project nor a tenant is current. The partial new project/private recovery and old `production-bootstrap` root are parked; no replay/deletion/recovery action was performed here.

**69/69 focused Node tests and7/7 Terraform mock cases passed, zero failures/skips.** Commands after Enter-Dev:

```text
node --test tests/unit/production-independent.test.mjs tests/unit/production-foundation.test.mjs tests/unit/production-shell.test.mjs tests/unit/dev-read-boundary.test.mjs
node --test tests/unit/production-promotion-independent.test.mjs tests/unit/phase3-promotion-manifest.test.mjs
terraform -chdir=infrastructure/production validate
terraform -chdir=infrastructure/production test
terraform -chdir=infrastructure/production-state-bootstrap validate
terraform -chdir=infrastructure/production-state-bootstrap test
```

Node commands passed45 and24 respectively. Terraform validate succeeded for both roots; mock cases passed5 and2. Terraform used F's already initialized backend-disabled private provider caches via external `TF_DATA_DIR` (`production-validation-data`, then `production-state-validation-data` under the established private Terraform directory). No backend initialization, cloud plan/apply, browser, full CI or existing capture writes occurred. Synthetic shell/CLI builds used fresh OS temporary artifact directories.

Independent runtime proof now explicitly accepts the **same valid default-project owner token in both DEV and PROD**. Both production runtime roles select the exact shared project and call Admin verification with revocation=true. Foreign issuer/audience, wrong owner/email/provider, unverified/expired/future claims, tenant claims including null and SDK revocation errors deny. Production session retains empty capabilities/businessAccess=false/membershipVerified=false; raw malformed/business/readiness routes deny before auth/data effects. Earlier unchanged privacy, dependency-graph, private error and disabled-probe assertions passed against the new configuration. These are synthetic verifier seams, not signed-token or live account/IAM proof.

Shell checks establish optional enrollment/sign-in verification zero application API calls, foundation sign-in alone zero calls and explicit check exactly two pinned session GETs with credentials omitted/no-store/redirect-error. Held token acquisition followed by sign-out cannot dispatch or revive success. Tenant-scoped identities clear and auth is reset to default. Actual B builder outputs are workerless, globally no-store, strict public identifiers only; maintenance has no script/auth/API code. Independent actual CLI cases consume B-built enrollment/foundation plus B-built maintenance artifacts, not fabricated workers or predecessor versions.

Promotion checks require explicit shared isolation, exact project/default null tenant, production registry/runtime endpoints, server-verifier and DEV-delivery-containment references, owner-only numeric secret for foundation and no runtime image/secret/API endpoints for enrollment. First deployment binds measured-absence/state/DNS references and explicit withhold/retain actions plus immutable maintenance bytes. Wrong/default aliases, tenant fields, missing containment evidence, invented predecessor, changed bytes, enrollment images and worker/cache-policy changes reject; prior strong matched-update/path/private-error tests remain intact. References/local hashes still do not authenticate their live evidence or execute recovery.

C found a numeric WebApp-ID validation mismatch: D's initial public config validator accepted any numeric project component, while B required737787224638. D corrected it to the exact target project number. C then changed config, marker and bundled script to the same wrong App ID and recomputed every artifact hash; the actual CLI still rejected the self-consistent wrong binding. No B product defect was found.

F source/mock review confirms production default inert; wrong superseded project rejects; owner enrollment creates no runtime; runtime needs immutable image/actual numeric owner secret and only auth-user lookup plus its secret. Exact repository/owner/main/production subject is pinned, separate PROD registry/service-scoped delivery grants are proposed, and no automated Hosting admin/shared auth ownership/API/SQL/GCS-business grant exists. New `production-state-bootstrap` owns only one separately named protected state bucket in the existing project, default false. Old new-project bootstrap is not an apply path. Mock assertions establish planned policy only: inherited project authority, live DEV/PR denial and actual provisioning remain unproven. Project administrators retain shared-project authority.

### Current SHA256 pins

| Source | SHA256 |
| --- | --- |
| `services/production/config.mjs` | `929c820d502ee794db2f0b932892155f10691278a844c1c8899421fe773b3214` |
| `apps/production-foundation/config.mjs` | `85ed9cbfd6bbbb3c4a6ba3cea3cdb5077994f42951fba057268f60dc4265774e` |
| `apps/production-foundation/controller.mjs` | `19c6b67bade4cd44fe510076047e65d05753707daf391483fa1d0e78f4a379b5` |
| `scripts/production/build-foundation-shell.mjs` | `98d2898eb3493d9c08f0ccebcfd62303d71988f137c7d9973c957d7749a588a1` |
| `scripts/promotion/manifest.mjs` | `2e3f1b203c519e0bc220fc1783e3636be9fb5cae459f1d79dfaece2d59939ba7` |
| `infrastructure/production/main.tf` | `17b92f922d4367812f93c17cd092bf2af15731bbf9d03198e6ff1b3620469a23` |
| `infrastructure/production/enrollment.tf` | `42be6abaf5699e917ba22f2ffa1029c9800975a7342da667d1233152e7f7d0ee` |
| `infrastructure/production/runtime.tf` | `99597cc752f8c0c9c8fc663738d0e1a7705a8952892bef067acc5f8778abb516` |
| `infrastructure/production/delivery.tf` | `71d1a9c623db6bd4303e04e824d986b29e61574a36326b77d17569b6558ae606` |
| `infrastructure/production-state-bootstrap/main.tf` | `deeb2f837a17c2b0b99849979e7343ffb1f11a8d669d1b841edeb4b7c19f266b` |

Principal, handler, runtime/server unchanged hashes remain as recorded above. C revised its same two independent test files and this additive evidence only; diff checks passed, no staging/commit. D owns coherent publication. Preparation verification is complete; live state/provisioning/IAM containment, authoritative owner-secret readback, actual WebApp/endpoints, Hosting/DNS activation, contained smoke, monitoring/capacity and recovery remain pending. Readiness is still disabled, with no authorized SQL/storage probe proof or business activation/cutover claim.

## Approved deployment — independent before baseline

The owner subsequently approved the revised shared-project/default-auth foundation deployment. F owns infrastructure, D owns artifacts/delivery and root owns orchestration/private browser authentication. C performs bounded read-only verification; no financial writes, forced notifications, new data capability or C cloud mutation/CI is included. Existing69 Node/seven mock results are reused only while their exact inputs remain unchanged; any invalidated inputs receive affected checks.

At `2026-10-11T04:33:24.220Z`, independent live HTTP requests returned:

| DEV request | Observed result |
| --- | --- |
| `https://dev-lm.mw-credit.com/` |200, HTML, Cache-Control no-store; SHA256 `dce3548578d632a0b128892b2644ab4961fa4c80a477cb00f1b4d8a598c5439a` |
| `https://dev-lm.mw-credit.com/build-version.json` |200/no-store; version `33577e39b896de7ad5ca6a62`, entry `/assets/index-CN0TdzFd.js`; SHA256 `ea2e6bb862a643ce5b266ff9d75f3243980b904efd957501330ace677157f374` |
| `https://mw-credit-app-read-dev-pvrgvyg3oq-as.a.run.app/health` |200/no-store; body SHA256 `6230cd14c2787e6e3a0b1d73da5d060c0ad72337a69d0a902de9255d283d394b` |
| `https://mw-credit-app-command-dev-pvrgvyg3oq-as.a.run.app/health` |200/no-store; body SHA256 `4062edaf750fb8074e7e83e0c9028c94e32468a8b6f1614774328ef045150f93` |

Requests used `fetch` with redirect error and20-second abort bound, without credentials, bearer tokens or business rows. Only safe public marker/status/headers/hashes were recorded in isolated scratch `outputs/.tmp/phase3-live-independent-20261011/dev-before.json`; no historical capture was overwritten. HTTP availability alone does not establish authenticated DEV workflows or immutable service revisions; D/F's accepted image/revision pins remain separate evidence.

C is ready for deployed PROD health, anonymous session/business/readiness/receipt denial, final Hosting/config hashes/no-store/no-worker and matching DEV after-baseline checks once actual milestones are available. Actual valid shared-owner sessions require root's browser-owned token kept in memory/private; no token/UID/secret is copied into this repository or output. Foreign signed issuer/user/tenant/revoked-token checks, effective deployed IAM/state denial and absence of SQL/GCS grants/effects require actual bounded evidence; the earlier synthetic checks cannot be labeled as those live results. No PROD smoke pass is claimed yet.

## Controlled operator delivery verification and DEV after containment

C independently reviewed D's new `scripts/production/deploy-foundation-hosting.mjs` and the DEV workflow delta. The helper defaults to dry-run, validates the authorized exact package/site/bytes before delivery, requires successful same-source `ci.yml` plus an actually successful `npm run test:e2e` step before operator credential readback, verifies the approved human and both exact Hosting sites, and publishes only the PROD site with global no-store/no worker/no DEV rewrite. The automated DEV workflow keeps its existing API path and now emits a nonfailing operator Hosting instruction; it no longer attempts Hosting publication with the removed authority.

C found a real stage-binding gap: finalization checked status but not the returned immutable version name, and release checked site but not its linked version. D now requires both to equal the exact created version. Independent negative tests demonstrate wrong/missing stage bindings stop; unknown upload hashes/hosts stop before finalize/release. Failures make no delete calls and preserve partial versions for inspected recovery; this is a stop/retain behavior, not an automatic rollback claim.

Focused command: `node --test tests/unit/production-hosting-independent.test.mjs tests/unit/production-hosting-delivery.test.mjs`: **10/10 passed, zero skips**. Four C-authored cases cover stage-short-circuit CI proof, approved human/exact site readback, immutable finalize/release binding and malformed/wrong-site rejection. All requests were injected synthetic fixtures; no network/cloud call occurred in these tests. Helper SHA256 `82f60bc20817a81f16825e3de50bce9040b9e7a4720815a65abcdaff204b48f8`; diff checks passed. Prior69 Node/seven mock evidence remains conditional unchanged-input proof; C did not run CI or repeat a broad suite.

At `2026-10-11T04:47:12.423Z`, after F reported existing-auth domain additions and automated DEV Hosting-admin removal, C repeated the same four public DEV requests. All returned200/no-store, with **all four body hashes identical** to the04:33 before baseline and the same33577e39b896de7ad5ca6a62/CN0TdzFd marker. Safe scratch record: `outputs/.tmp/phase3-live-independent-20261011/dev-after-containment.json`. No credentials/business reads were used. Separately, root reported actual-owner canonical DEV GUI refresh completed with Dashboard visible/Ready/zero alerts; that is root's observation, not a C browser execution.

F's reported state/IAM readback is configuration evidence: new protected state bucket/matched migration and no direct DEV-SA bucket role; it is **not an impersonated denial test**. Root/F own those exact records. Actual PROD services/Hosting release are still pending at this checkpoint; C will verify their supplied real URLs/artifacts after delivery. Signed wrong-user/issuer/tenant/revocation and live state-IAM exclusion are not simulated passes. C intended scope adds only `tests/unit/production-hosting-independent.test.mjs` and this existing evidence; no helper/workflow, cloud or Git mutation was performed by C.

### Narrow GitHub step-name compatibility correction

During the sole consolidated CI38112831074 on product checkpoint184d199, D observed GitHub's actual default step name `Run npm run test:e2e`; the helper previously accepted only the explicit name `npm run test:e2e`. D changed the allowlist to those **two exact names only**. C independently verified both successful forms, rejection of skipped/failed steps or failed/cancelled jobs, and rejection of case/whitespace/command-suffix/affected-suite near matches. Same source, run success, repository and exact workflow guards remain intact.

Focused helper command above now passes **11/11, zero skips**. Current helper SHA256 `339eb2c425208e225431735af6f877e66b0e06362e7cd5f5f714d2b58c264a6a`. Only the delivery-tool/test/evidence contract changed; root/D separately record product/backend/shell input equivalence and the tooling correction commit. C did not rerun broad tests, trigger CI, or deploy. The sole CI is still in progress at this observation; no successful final CI or actual PROD smoke is inferred from these synthetic tests.
