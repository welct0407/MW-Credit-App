# Phase 3B shared authentication and contained shell — B handoff

11 October 2026. Starting commit `1dc61115632a8f2b377f36051cc60630542b6aa6`. Owner's latest shared-default authentication decision supersedes the earlier new-project/tenant preparation. No live change, cloud build, deployment, CI or existing-PWA/browser capture was performed.

## Runtime delta

Production configuration now requires exact existing project `clever-oasis-508610-n7` / `737787224638`, default Firebase authentication, and no tenant configuration. Firebase Admin uses the default project auth instance with `verifyIdToken(token,true)`; explicit claim validation rejects every tenant claim, wrong issuer/audience, invalid times/provider/email or nonowner subject. The production owner secret and numeric version remain separate. A currently verified owner may have the same UID and valid default token as DEV: tests explicitly accept this shared identity, without granting production business capabilities. No email bootstrap or DEV pin fallback is introduced.

Unchanged foundation containment: health and authenticated session only, empty capabilities, membership unverified, all business/readiness routes denied before any database/storage effect. No data grants or client are added.

## Public shell contract

`scripts/production/build-foundation-shell.mjs` exports `buildFoundationShell({config,outDir})` and `buildMaintenanceShell({outDir})`. Output must be a new empty directory. No deployment or cloud command is present. The builder creates `index.html`, `public-config.json`, `foundation-shell.json`, `firebase.json`, and `shell.js` only for authenticated phases. Hosting configuration serves all files with `Cache-Control: no-store`. No service worker, business routes, IndexedDB draft store or existing DEV PWA code is used.

Authenticated public config has exactly:

```json
{"schemaVersion":1,"environment":"prod","authIsolation":"shared-default","phase":"enrollment","origin":"https://lm.mw-credit.com","firebase":{"projectId":"clever-oasis-508610-n7","apiKey":"<actual public API key>","appId":"<actual public WebApp ID>","authDomain":"clever-oasis-508610-n7.firebaseapp.com"},"endpoints":null}
```

This is a schema illustration, not a buildable or provisioned binding. Foundation phase replaces null endpoints with exactly `{reader,command}`, each the distinct verified HTTPS Cloud Run `/api/session` URL. The builder checks URL syntax and excludes DEV hosts; D's promotion validator must match both against actual target readback. Owner UID, secret values/versions, tenant IDs and arbitrary extra fields are not allowed in public configuration.

The internal `enrollment` phase is sign-in verification of the existing shared account, not user registration or migration. It makes zero application API calls. Foundation makes only the two explicit session GETs when the signed-in user clicks access check. SDK auth uses memory persistence, resets default tenant selection on initialization/sign-in and clears tenant-scoped users. Sign-out invalidates held access work; no token, UID or raw error is rendered/logged. Successful session probes still state that business access is disabled and membership is unverified.

Maintenance config is exactly `{schemaVersion:1,environment:'prod',authIsolation:'none',phase:'maintenance',origin:'https://lm.mw-credit.com',endpoints:null}`. It contains no Firebase configuration, script, auth or API call. The same marker shape uses its own phase.

Marker: `{schemaVersion:1,kind:'production-foundation-shell',phase,cachePolicy:'no-store',worker:null,entry:'index.html',configSha256}`. `configSha256` hashes exact `public-config.json` bytes. D owns the complete artifact file hash manifest and first-deployment absence/rollback evidence. No fake worker, predecessor, endpoint or secret version is fabricated.

## Verification

`node --test tests/unit/production-shell.test.mjs tests/unit/production-foundation.test.mjs`: **11 passed**, no skips. Includes shared default token acceptance, tenant/wrong-identity denial, strict config, no-data HTTP containment, enrollment zero API calls, two exact session GETs, sign-out race, and three local synthetic artifact builds proving no-store/workerless output and maintenance without SDK/API code. Test artifacts use fresh OS temporary directories. A sandbox dependency-junction `realpath` EPERM was resolved by running this synthetic local test command outside that filesystem sandbox; no permissions/config workaround was added to product code.

Existing DEV source remains unchanged. Live account enrollment/readback, real public config/endpoints, Hosting IAM containment, service delivery and production smoke remain future scoped work. C independently verifies the revised boundary; D owns documentation/publication. Rollback is the recorded pre-change commit plus prior Phase3 candidate; this preparation has no live effects to undo.
