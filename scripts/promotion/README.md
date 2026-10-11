# Production foundation package preparation

`manifest.mjs` validates local metadata and explicitly supplied artifact bytes. It has no cloud client, subprocess, network call or apply implementation. The CLI defaults to dry run; `--apply` is rejected. This is preparation, not a production deployment runner or proof of live IAM/WIF enforcement.

```powershell
. ./scripts/Enter-Dev.ps1
node scripts/promotion/manifest.mjs --manifest PATH --dry-run
node scripts/promotion/manifest.mjs --manifest PATH --artifact-root CURRENT_ARTIFACT_ROOT --rollback-root PREDECESSOR_ARTIFACT_ROOT
node --test tests/unit/phase3-promotion-manifest.test.mjs
```

Use `schemaVersion: 1`, `environment: "prod"`, `mode: "foundation"`. A `status: "draft"` package may leave bindings absent; validation returns an explicit missing list and never supplies DEV defaults. A `status: "reviewable"` package must provide the complete target, exact artifacts, evidence references and predecessor pins. `validateCandidate` accepts a valid package without mutation authorization, returning `reviewReady: true`, `approvalRequired: true`, `deployReady: false`. Producing this reviewable package precedes requesting scoped production approval.

The optional `validateAuthorizedPackage` export checks a supplied future authorization reference against the exact source and target fingerprint. It still returns `deployReady: false`. Reference strings cannot prove authority, live resource identity, artifact provenance or recovery readiness; a future executor must verify these independently against the approved plan. No CLI execution mode exists.

## Target and artifacts

The full target binds a separately verified application project ID/number, region, separate-project auth issuer/audience with null tenant, existing SQL instance/host/database, existing receipt bucket plus explicit separated prefixes, separate runtime service accounts, Hosting site/canonical/fallback origins, separate state project/bucket/prefix/generation, Artifact Registry and four numeric Secret Manager versions. The retained data project is `clever-oasis-508610-n7` / `737787224638`; SQL is `loan_manager_prod` on `clever-oasis-508610-n7:asia-southeast1:appsheet-pg-prod-20260914`, host `34.21.174.215`; bucket is `mw-payment-receipts-prod-508610-n7`. Canonical origin is the owner-selected `https://lm.mw-credit.com`. None of the missing new application identities is invented by the tool.

`fingerprint(target)` hashes canonical JSON with sorted object keys and preserved array order. The package pins the full 40-character source commit and target SHA256. Both image references must use immutable SHA256 digests in the bound application's repository and the exact contained entrypoint `services/production/server.mjs`. DEV entrypoints and image tags are rejected.

The frontend must be a separately configured `prod-foundation` artifact, never the existing DEV bundle. Its file allowlist carries exact SHA256 values, matching `production-config.json`, `build-version.json`, entry script, HTML and production worker version/namespace. The configuration binds application project, issuer/audience, Hosting site, canonical origin and target fingerprint. Current and predecessor artifacts are read only from explicitly supplied canonical local roots; traversal, dot/private paths, unallowlisted JSON and symlink/junction escapes are rejected. Files and metadata are bounded; secret payloads and unknown fields are forbidden. Private credentials, Terraform state and plans stay outside repositories.

Rollback metadata includes the matched target/source, immutable images, runtime revisions, Hosting version, frontend/config/worker hashes, state generation and numeric secret versions. Validation checks the predecessor artifact bytes too. These pins describe a future recovery package; they do not establish a tested live restore or reverse financial transactions.

Foundation SQL mode is exclusively `none`. No migration, database probe or business execution is included. A later SQL package must use the existing exact-tested-commit/hash runner and scoped authorization/backup procedure, rather than extending this tool into a second migration runner.

The focused test fixture provides the complete synthetic schema, current/prior local artifact recipes and deliberately fictional application identities. It proves local validation behavior, not existing production resources. Track this work in the single Phase 3 foundation batch and its owning change log; use applicable rows of the existing master promotion checklist when actual promotion starts. R052 remains Open during preparation.
