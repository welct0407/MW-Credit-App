# Grafana MCP Events bridge — 2 October 2026

Status: **implemented and tested locally; deployment and host acceptance pending**. R050 remains the sole Open release. No deployment, infrastructure/IAM/credential creation, DNS change, Grafana routing change or external notification occurred. No live availability claim.

## Scope and authority

Owner authorized named design followed by implementation/testing in the saved AppSheet-Loan-Project cloud environment and task-branch/draft-PR publication to the existing audience. Deployment/security changes and synthetic live notification remain outside this phase. Resource monitoring belongs here; MW-Integration-Agent business worker source is untouched. Azure power control remains in its existing browser controller, without MCP power tools.

Root `/workspace/AppSheet-Loan-Project`; starting branch `work`, commit `af38e8f2ea7818afb86a132587f1b0cbc0632f4a`, clean task baseline. Implementation branch `feat/grafana-mcp-events`. Existing R050 report work is preserved. Read AGENTS, development/model/orchestration guidance and monitoring references; no applicable `.agents/skills` were present.

Read-only target verification identified `clever-oasis-508610-n7` / `737787224638`, VM `vm-mw-credit-agent`, `asia-southeast1-a`. Runtime service/database IAM and regional billing allowances are not established by that observation. No credential material was printed or created.

## Changes and decisions

- `scripts/monitoring/grafana-mcp-bridge/`: strict TypeScript service, locked SDK v2 dependencies, owner Google-backed OAuth authorization code/S256 PKCE, encrypted durable OAuth state, grant revocation fences, authenticated Events/read tools, canonical origin/resource, Grafana raw-body HMAC.
- Durable Firestore subscriptions and atomic event/outbox ingestion, exact filters, canonical transition identity, no reminder duplication, subscription expiry/refresh/rotation, bounded leases and retries. HTTPS callbacks validate all DNS addresses, pin one public address and TLS hostname, reject redirects, and share a ten-second absolute DNS/network deadline.
- Review-only Cloud Run and Firestore index/TTL definitions, pinned non-root Linux amd64 container, offline regression tests and GitHub Actions workflow.
- Reproducible conditional cost estimator; one minute Scheduler drain selected over Cloud Tasks for minimum infrastructure and approximately 0–60-second normal latency. Public HTTPS with app OAuth is the implemented path; IAM-only/IAP compatibility is not assumed.
- [Operating guide](../Documents/Grafana_MCP_Events_Bridge.md), package README, monitoring/doc navigation, R050 tracker/development differences and [evidence](../outputs/grafana-mcp-bridge-20261002/README.md). Future hostname migration is documented; no domain/LB implementation is included.

Security review hardened transaction read/write ordering, finite short TTLs, refresh/unsubscribe revision checks, stale-worker fencing, grant tombstones, issuer-isolated OAuth records, canonical base URLs, strict state-key encoding and Node 24 DNS pinning. Cloud Run platform OAuth request-log exclusion is a concrete pre-deployment prerequisite.

## Verification and limitations

`npm test`: TypeScript build and **28/28 tests passed**. Tests cover real downstream OAuth provider/PKCE/access/refresh and MCP discovery/subscription/read flow using synthetic Google login, ingress HMAC/tamper/time skew, owner/audience/scope/grant denial, single-use OAuth state, secret encryption/rotation, filters/deduplication, transaction contract, retries/leases/exhaustion, revocation, concurrency races, SSRF classes/rebinding/redirect rejection, logger redaction and cost model scenarios. `npm audit --omit=dev --audit-level=moderate`: **0 vulnerabilities** on the locked production tree.

The normal container build retrieved the pinned base image but dependency installation stalled; a bounded host-network registry probe also failed. That build was canceled after roughly 13 minutes. A scratch Dockerfile then used the existing npm cache with the unchanged lockfile, `npm ci --offline --ignore-scripts`, compilation and production prune under `--network none`: **build passed**. Its non-root UID1000, Node24.19.0 runtime passed **28/28 tests with external networking disabled**. Local image ID `sha256:3e09adf53af5047ddb9c69a36f24d9b9848ebf3a1d3f4f29cee29519313d85b6` is test evidence, not a registry deployment digest. CI also checks the normal committed Dockerfile build and packaged runtime independently.

Sample cost is $0.048277/month with listed allowances still available and paid named Firestore, or $0.905874 when those allowances are exhausted. US$1–5 is contingency, not a quote/ceiling. Target region is asia-southeast1, while rates are explicitly reference/default table inputs, not confirmed Singapore prices. Rates/timings remain explicit editable assumptions; confirm selected regional/edition/egress rates and real account allowances before approval.

Remaining acceptance: actual Firestore/index/IAM and Google identity/consent checks, plugin connection and discovery, finite subscription refresh, synthetic event through ChatGPT/Dots action, additive Grafana route/IRM preservation and observed costs. No AppSheet/SQL/dashboard/model/live inventory values changed, so their exact-definition documents and visual guide require no edits.

## Independent review corrections

After the original `79dbe2a8` publication/CI, independent review identified three implementation gaps. The original helper sent every cookie to every route, masking Google's callback failure with oidc-provider's interaction-path cookie. Replacing it with path/domain/Secure/expiry-aware cookie storage reproduced the fresh-login failure before the source fix. The fixed registered Google callback now bounces to the interaction UID's callback subpath, where the signed browser cookie is required before single-use state consumption and Google code verification. No cookie scope, owner binding, nonce or PKCE requirement was weakened.

Enabled the supported advertised HTTP revocation endpoint with an explicit client/owner-token policy. Actual refresh-token HTTP revocation tests verify access/refresh denial, queued-callback cancellation and indistinguishable empty 200 responses for unknown, foreign and already-revoked tokens. The prior direct adapter test was insufficient endpoint coverage.

Unsubscribe now persists a cancellation generation even for an absent identity. A delayed first challenge cannot activate after a successful stop; subsequent intentional subscription is allowed without replay. Existing revision fencing remains for refresh. `subscriptionControls` stores only hashed identity/counter records without TTL so subscription cleanup cannot erase the cancellation fence. Its low-volume subscription/admin operations fall within the model's explicitly assumed extra datastore activity; sample costs are unchanged.

Four new regression tests bring the suite to 28; realistic cookie behavior also applies to existing OAuth tests. Local build, audit, cached container and packaged-runtime checks were rerun for this correction batch. Same branch/draft PR; no live changes or authority expansion.

## Recovery and publication

File-only rollback is the recorded Git baseline/task commit, reconciled with later work. Future deployed containment/rollback is in the operating guide: pause this Scheduler/new webhook only, retain IRM, revoke owner authority, restore pinned image/config/keys with the durable database, and reconcile uncertain delivery before replay. Never regenerate the state key as recovery.

Publication target is task branch `feat/grafana-mcp-events` and a draft PR against `master` for the existing audience. Inspect intended diff/secrets, use the existing authorized Git/connector route without credential creation, and verify the exact remote head and CI. The resulting commit and PR metadata/completion handoff record actual publication and check results; this source log makes no independent pre-publication success claim. No default-branch push, force-push, merge or deployment.


## Owner bootstrap preparation

Owner approved the scoped GCP bundle, public app-authenticated HTTPS, synthetic acceptance, $5 planning budget (not a cap), and native Preview alerts.mw-credit.com mapping at 17:14:50 UTC. Read-only preflight found disabled APIs and insufficient VM identity permissions; the parent browser could not reach an authenticated Console. No deployment action was taken.

Added a fixed-target human-owner preflight/resource script, bounded database condition/secret access, reviewed indexes/TTL, OAuth request-log exclusion, and an inert dependency-free non-root revision for actual run.app URL and generated mapping DNS records. Scripts stop on denied reads, conflicting resources or unexpected project roles; existing database recovery requires explicit resume. Secure owner-run seeding sends generated application keys and hidden-prompt Google client secret directly to Secret Manager without values in files/arguments/output. Existing versions are never regenerated. Standardized Google secret name to mw-grafana-google-client-secret and kept owner access false in the final-origin template. Scheduler execution/live Grafana routing and business services remain inactive/unchanged.

Offline guard tests cover resource conflicts, denied reads, database resume/location, safe inert reruns and domain collisions; the inert HTTP test checks every sensitive route returns 503. GitHub CI now includes these affected checks. Publication/check results are recorded in the completion handoff; scripts remain unexecuted against GCP.

Bootstrap verification: six offline Python guard tests passed; TypeScript build and 29/29 Node tests passed. The pinned inert Docker image built with network disabled and its endpoint regression passed inside the non-root container with network disabled. The original package checks remain valid for unchanged application/dependency code; new CI checks verify this exact bootstrap publication.


## SDK/Windows compatibility correction

VM-01's actual SDK585 rejected the original Logging command group, and bare gcloud subprocess invocation failed with WinError2. Replaced that group with named `_Default` sink exclusion add/readback, preserving all unrelated configuration; added resolved launcher paths, temporary JSON flags files for complex/repeated values, UTF-8 subprocess output and shared Secret Manager stdin handling. Docker remains the build/push route. No new publishing tools, credentials or live operations were used here.

Expanded offline regression coverage for launcher resolution, Windows CMD handling, exact flag preservation/temporary cleanup, exclusion idempotency/conflicts and readback. The Windows CI job exercises a real temporary CMD launcher. Read-only checks against installed SDK587's actual help/parser confirmed named sink exclusion support, JSON flags files and exact CEL/filter preservation. VM585 help support was independently verified by the deployment executor. Authentication findings distinguish the installed cloud SDK's empty profile/absent ADC from the IAP helper and verified VM owner CLI; no cloud login was initiated.

Correction verification: 14 Python guard tests passed locally with the one Windows-only CMD test skipped on Linux; the actual installed SDK587 parser/help checks and the new check-sdk entry point passed without API requests. Windows CI will exercise all 14, including the actual CMD launcher. Application/dependency source is unchanged; existing application checks are reused locally and rerun by exact-publication CI.


## Approved fixed service-account deployment integration

At 18:07:29 UTC the owner approved project Owner for codex-cloud on clever-oasis-508610-n7 and durable selected-environment access; the VM executor reports applying/readback-verifying that binding, with IAM API enabled and other settings preserved. Those live actions were performed by that executor, not this coding task. The separately maintained saved-environment adapter and fresh-task proof remain pending.

The bootstrap now permits exactly the approved fixed service account as an alternative to a verified human project owner, verifies the selected principal's active identity and direct unconditional roles/owner project binding using the correct user/serviceAccount member type, and also checks the exact project ID/number. Other service identities, wrong active accounts/projects, impersonation and credential overrides still fail closed. Added an explicit reviewed gcloud executable/adapter option without weakening checks; secure seeding shares the launcher and retains direct hidden credential entry. Domain mapping still requires separately verified Search Console ownership; project Owner does not satisfy that check. No bootstrap, environment edit, grant or credential operation was executed here.

The [adapter contract](../scripts/monitoring/grafana-mcp-bridge/deploy/ADAPTER_CONTRACT.md) specifies real read-only auth/config metadata checks, exact matching pinned selectors, visible Linux argv (no flags-file bypass), and separate reviewed Docker-wrapper build/push calls with private authentication. Source has configurable gcloud/Docker launchers, retaining normal SDK/Windows behavior. The generic adapter need not allow configure-docker or arbitrary auth/config operations. No adapter was executed here. Local guard suite: 23 tests run, 22 passed and Windows-only CMD skipped on Linux; Windows CI also checks this pin. Installed-SDK syntax/parser check passed.


## Explicit guarded Python/shim integration

The environment editor confirmed guarded gcloud/Docker PATH shims around the full Python bootstrap. Added explicit Linux-only adapter mode for the fixed approved service identity: direct visible gcloud arguments and no configure-docker call, including when no custom executable paths are supplied. The existing Windows/human SDK route retains JSON flags-file handling and its normal Docker setup. Identity, project, direct Owner binding, no-impersonation, domain and secure-input checks remain unchanged. Local suite: 25 tests run, 24 passed and Windows-only CMD skipped; CI covers Windows and Linux platform paths. No live adapter/bootstrap or credential action ran here.
