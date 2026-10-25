# Grafana MCP Events bridge

Current deployed revision and traffic: [Environment Inventory](../../../Documents/Environment_Inventory.md#latest-verified-deployments). Live dashboards and remaining work: [Grafana row 5 evidence](../../../outputs/grafana-row5-vm01-20261004/README.md).

Live dispatch, routing and rollback evidence: [activation record](../../../outputs/grafana-live-activation-20261003/README.md).

GCP Scheduler dispatches every minute (Asia/Singapore) with the exact target, OIDC, deadline and zero retries; the callback host allowlist and hostname capture setting are described in the guide below. End-to-end notification evidence: [test record](../../../outputs/grafana-synthetic-notification-20261003/README.md#end-to-end-notification-verified).

The [design and operating guide](../../../Documents/Grafana_MCP_Events_Bridge.md) owns deployment prerequisites, OAuth, durable delivery, security, cost and recovery. `deploy/service.yaml.example` is a review template with unresolved placeholders, not an executable deployment instruction.

The owner-run [phase-one bootstrap](deploy/OWNER_BOOTSTRAP.md) prepares approved resources and an inert domain/TLS revision; it is never executed by local checks.

## Local checks

Requires Node 24 and npm. From this directory:

```sh
npm ci --ignore-scripts
npm test
python3 deploy/test_owner_bootstrap.py
python3 deploy/test_cloud_shell_seed.py
python3 deploy/test_cloud_shell_google_identity.py
npm audit --omit=dev --audit-level=moderate
npm run estimate
docker build -t mw-grafana-events:offline .
```

Tests use synthetic credentials, in-memory storage, simulated DNS/callbacks and localhost HTTP. They never contact Grafana, Google OAuth, Firestore, ChatGPT or Dots. The real downstream OAuth provider and MCP SDK are exercised locally, including a cookie jar that honors path/domain/Secure/expiry and actual HTTP token revocation; Firestore's transaction ordering is checked with a fake contract. Actual Firestore indexes/IAM, Google login and host connection remain deployment acceptance checks.

For the real-browser consent regression, after npm test/build run `python tools/test-browser-consent.py` with Python Playwright, `/usr/bin/chromium` and OpenSSL installed. It exercises the API-only browser form, signed cookies, CSRF, authorization code and token exchange entirely on localhost with a disposable in-memory store and an ephemeral TLS certificate. The isolated test browser accepts that local certificate; no external OAuth/API host or production TLS policy is changed. Its eight scenarios cover historical no-referrer Origin:null rejection and self-only CSP redirect blocking, API-only requests with and without prompt=consent, OpenID plus API scope, session-only, cancellation and an unknown form destination. Current consent permits only self and the configured callback in form-action. The callback uses a different local origin and receives GET with no form body; code replay is rejected. Synthetic metadata verifies durable versus session-bound refresh and fixed grant deadlines. Only fixed outcomes, booleans and counts are printed; no cookie/code/token values or URLs are printed.

`tools/cost-assumptions.json` contains editable USD workload/rate inputs. `node tools/estimate-cost.mjs [path-to-assumptions.json]` emits reproducible scenarios. It does not inspect billing or measure Cloud Run latency.

For the saved Codex Cloud environment, dependency downloads use its existing proxy. Supply standard Docker proxy build arguments and the existing public trust certificate with `--secret id=build-ca,src=<existing NODE_EXTRA_CA_CERTS path>`. The optional BuildKit CA mount applies only to dependency installation, remains out of image layers/runtime trust, and keeps TLS verification enabled. When the proxy hostname is unavailable in build DNS, map that same hostname to its address returned by the host resolver for this invocation; do not change network policy or bypass a denial. Builds without that mount use their normal system trust.

The container uses a pinned Linux amd64 Node image, a locked dependency tree and the non-root `node` user. No credentials or local environment files are copied. Runtime configuration is validated at startup; secrets come only from mounted files. The process uses workload ADC for Firestore and Google public signing keys for token verification.

## Source map

| File | Responsibility |
| --- | --- |
| `src/app.ts` | HTTP routing, app authentication, MCP 2.0 custom Events handlers and read tools |
| `src/cimd.ts` | Exact official ChatGPT metadata/client/redirect pins, bounded TLS fetch and method intersection |
| `src/oauth.ts` | Owner Google login, PKCE OAuth server, encrypted persistent grants/tokens and revocation |
| `src/events.ts` | Filtering, subscription verification/refresh, transition deduplication, atomic outbox and retry leases |
| `src/security.ts` | Grafana HMAC, constant-time comparison, public DNS checks, pinned HTTPS and sanitized logs |
| `src/store.ts` | Firestore transaction adapter and isolated in-memory test store |
| `src/config.ts`, `src/main.ts` | Canonical origin, mounted configuration, startup and shutdown |
| `deploy/` | Owner-run bootstrap, inert revision, secure secret seeding, service template and Firestore policies |
| `test/` | Synthetic behavior and security regression checks |

The SDK is pinned to `@modelcontextprotocol/server` 2.4.0 (with `zod` 4.6.7, after the October 2026 advisories against 2.2.0 and 4.3.6) and `/node` 2.1.0. Custom Events handlers use v2 request schemas; old v1 generic-server examples are incompatible. The server exposes only `get_bridge_health` and `get_alert_event` as read tools.

Production configuration uses the pinned ChatGPT CIMD URL and platform redirect. An empty callback allowlist permits staged OAuth startup while denying every subscription. [Current preparation evidence](../../../outputs/grafana-cimd-20261003/README.md) distinguishes mocked native-provider acceptance from the proxy-blocked live metadata GET. [Human subject helper](deploy/CLOUD_SHELL_GOOGLE_IDENTITY.md) is a standalone file tested only with mocks. The contained application now serves traffic; the inert revision is retained for rollback. See the contained deployment evidence above for current live state.

## Telemetry and offline image build

Telemetry rollout evidence is in [rollout](../../../outputs/grafana-row5-vm01-20261004/rollout/); pins are in the inventory. Scheduler, owner access, OAuth, subscriptions, callback/security and mounted secret references are preserved. One deliveries state/createdAt index and the runtime Metric Writer role are applied. Eight IRM alerts remain uncreated. Exact expected subscriber membership and legacy grant expiry are Unknown until verified through the existing owner document/ordinary renewal routes.

If build-container downloads stall, populate `.build-cache/npm-cache.tar` from the already verified locked npm install cache using `tar -cf .build-cache/npm-cache.tar -C <private-npm-cache> _cacache`. Include only `_cacache`, never npmrc, logs or credentials. The ignored archive is bind-mounted transiently; `npm ci --offline --ignore-scripts` verifies lockfile integrity, and extracted cache is removed in the same RUN. It is absent from runtime layers. With no archive, the existing normal dependency-download path remains available. No network/security-policy change is required.
