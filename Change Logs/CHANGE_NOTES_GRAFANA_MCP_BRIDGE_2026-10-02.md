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
