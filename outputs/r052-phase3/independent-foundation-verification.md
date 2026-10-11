# Phase 3A independent foundation verification

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
