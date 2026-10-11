# Contained production package preparation

Current owner decision: reuse project clever-oasis-508610-n7 /737787224638 and its default Firebase authentication/same user group; production API authorization and resource/deployment bindings remain separate. The earlier new-project/tenant proposals are superseded. Park partial project219146337993/private tainted state; this tool never recovers or mutates it.

manifest.mjs checks explicitly supplied local metadata/artifact bytes. No cloud client, subprocess, network, SQL or apply implementation exists. CLI defaults to dry run and rejects --apply. This is not a deployment runner, evidence of live IAM enforcement or an authorization grant.

```powershell
. ./scripts/Enter-Dev.ps1
node scripts/promotion/manifest.mjs --manifest PATH --dry-run
node scripts/promotion/manifest.mjs --manifest PATH --artifact-root CURRENT_ROOT --rollback-root RECOVERY_ROOT
node --test tests/unit/phase3-promotion-manifest.test.mjs
```

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