# R052 Phase3 production foundation readiness batch

Bangkok date: 11 October2026. Status: readiness preparation in progress; no production apply or activation authorized by this batch.

Owner explicitly verified/accepted Phase5 and6 and requested starting Phase3. This clears the earlier owner checkpoint. R052 stays Open; no scope freeze or successor allocation. No specific owner-tested device/result is inferred.

Starting sources: PM9e037c98ac902c82d161d32e03d4be416ad7f6b8; application24532742bd65a9fbf2bd53810b35e68100b5c3db. Current DEV85 reader00016-k4l/command00017-q5n, backendaf1dfc44, Hosting300fa698bebf6de5/version33577e39b896de7ad5ca6a62 remain unchanged. Retain existing app manifest rollback and private catalog/state/recovery; preserve unrelated dirty CI/router/process/captures and PM DNS log. Primary PM checkout untouched; canonical existing worktree only.

Design and executable test plan: [A Phase3 foundation plan](phase3-foundation-design-and-test-plan.md). No duplicate design/tracker.

Ownership: Agent A — Architect, design/test contract; Agent F — Infrastructure, separate production configuration/state/identities/secrets and read-only inventory; Agent D — Miscellaneous / Delivery and Documentation, tooling/publication/readiness records. Agent B — Coding owns the contained foundation runtime; Agent C — Testing independently verifies the agreed preparation contract; Agent E — User Experience remains request-only/inactive. Roles confer no production authority.

Included first batch: inert separate production/bootstrap Terraform and guarded delivery schema preparation; explicit server-enforced issuer/audience/tenant/membership isolation contract; immutable artifact promotion/rollback, access/credential-consumer, monitoring and recovery inventory. Existing DEV-bound application images are not production-capable by substituting environment values. F proposes exact resources/state/access boundaries for root review. No PROD resources/IAM/DNS/auth-policy/business commands/schedules/notifications/financial writes are applied.

## Owner-selected production topology

Owner confirmed preparation design on11October2026: a new GCP/Firebase production application project under the existing organization/billing, with canonical hostname lm.mw-credit.com. Existing Cloud SQL and GCS remain retained external dependencies. No new actual project ID, binding or live resource is asserted before inventory and reviewed concrete plan. Selection is settled; production mutations remain awaiting scoped approval for the exact resource plan.

Promotion/tooling contract for A review: require exact immutable frontend/API artifact and SQL-package identifiers, verified source/input hashes and explicit target fingerprint; dry-run by default; explicit production scope; no implicit DEV fallback. Existing master applicable promotion rows remain the checklist when actual promotion begins. D implements local scripts/promotion/manifest.mjs with README and focused synthetic tests. Complete reviewable candidates require exact target/artifact/evidence/rollback pins but do not require mutation authorization yet: approvalRequired=true, deployReady=false. Optional future authorization-reference validation is separate. CLI defaults to dry run and has no apply, cloud, subprocess or SQL execution path.

## Tooling delta and reusable evidence

- Maintained DEV Hosting helper pins DEV site/service origins and accepts synthetic/live-dev only; production target/config/worker rollback must be designed explicitly.
- Terraform wrapper accepts bootstrap/dev with existing private activation/state paths. No production apply path is established by copying those defaults.
- Existing deploy-dev workflow builds/deploys its DEV API and synthetic page, not the maintained live PWA or a protected immutable production promotion.
- Published CI supports a consolidated checkpoint; unrelated dirty local routing changes are not an approved Phase3 implementation input. No CI has been run for this preparation batch; focused local checks validate changed code and contracts.
- Existing guarded Invoke-Flyway/New-Release reuse a clean exact commit, DEV verification and migration hashes, with actual production approval/backup references for writes. Historical CloudFlyway scope is constrained and must not be replayed as general promotion.
- Existing single master promotion checklist remains authoritative for applicable production authorization/backup/SQL/documentation activities when promotion starts. AppSheet RC/App Upgrade rows do not implement PWA artifact delivery; A specifies affected PWA activities without parallel promotion checklists. Phase3 start does not start production promotion or freeze R052.

## Checkpoint and handoff

A/F produce one coherent design/preparation checkpoint; root reviews exact scope and proposed actions before publication/any live production work. D records current findings once and links detailed evidence. Production mutation and auth-policy activation require explicit scoped owner authority covering the reviewed plan. Local syntax/plan checks are preparation evidence, never a deployment claim. Root staged review passed; this preparation checkpoint is completed for normal [skip ci] upstream publication. No CI or apply occurred.

Phase5/6 green source44682ad and live DEV read smoke remain prior evidence, valid only for unchanged inputs. Historical503 cause is unproven; fresh bounded inventory found no additional unmapped native reference beyond known two. Device-specific evidence and future native reconciliation retain their limits without retaining a pending owner acceptance gate.

Current prepared evidence: B services/production/server.mjs contained foundation plus 34 focused tests (30 existing DEV); D promotion 12/12 focused local tests; F two Terraform roots fmt/validate and three mocked tests each. F saved read-only bootstrap plan SHA2565685b7bf353eecf897517f27b0a2283529e4726da1e067a96589480f3230f878 has exactly three creates and zero updates/deletes; not applied. Application optional resources are a separate scope. WIF/GitHub production environment enforcement is an unconfigured proposal, not verified live protection. C independent verification passed 52/52 focused checks with zero skips; exact evidence in app outputs/r052-phase3/independent-foundation-verification.md SHA256798788ffc5d11d60a6a0671fcceb1e4078280bd7283aae440b10c0fcd77aa36d. P3A06 proves disabled readiness only; P3A08 live IAM/WIF remains unimplemented; P3A09 verifies local matched pins, not a live recovery. Root staged review passed. Next: scoped owner bootstrap approval after verified publication. Actual tokens unavailable; no CI/deployment timing exists for this batch yet.

## Reviewable bootstrap decision packet (not execution)

Root reviewed the saved Terraform bootstrap plan SHA256 `5685b7bf353eecf897517f27b0a2283529e4726da1e067a96589480f3230f878`: exactly three creates (new proposed application project/billing association, Storage API, protected private versioned state bucket), zero updates/deletes and no VPC. F owns the precise inventory and backend migration/recovery procedure in `infrastructure/production-bootstrap/README.md` and `infrastructure/production/READINESS_INVENTORY.md` in MW-Credit-App. The saved plan/state stay in the established private location, outside Git.

Proposed project ID `mw-credit-app-prod-20261011` is not a created or verified runtime project. Organization/billing selection and canonical hostname are recorded design inputs, not resource creation. No runtime, Firebase/auth policy, Hosting/domain binding, WIF/IAM grants, SQL/GCS access or business activation is included in this bootstrap scope. The optional application foundation resources are a separate plan and authorization scope.

Following independent preparation verification and coherent publication, the owner can review a concrete scoped bootstrap request against this exact saved plan. Only an explicitly authorized unchanged plan may be applied; changed inputs/plan require a refreshed concrete review. Current result is preparation only: no apply has occurred and full Phase3 remains in progress. No production activation or release freeze is inferred.
Creation recovery disposition: on partial creation or failed state migration, stop and retain inert resources plus private state/recovery for reconciliation; no automatic destroy, shared-resource change or blind old-state restore. Actual runtime provisioning, DB/GCS access, auth, Hosting/domain/DNS and business activation remain later reviewed scopes.

Application preparation published and upstream-verified: 1dc61115632a8f2b377f36051cc60630542b6aa6 ([skip ci]). This PM checkpoint records the completed preparation batch; full Phase3 remains in progress with no production mutations. PM publication uses the same normal upstream [skip ci] process and is reported externally after verification.
