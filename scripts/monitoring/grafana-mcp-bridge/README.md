# Grafana MCP Events bridge

R050 development implementation; **revision 00009-487 is Ready at 100% traffic with approved exact callback host connectors.api.openai.com and temporary hostname capture disabled**. Immutable image, owner-only auth and five secret pins are preserved. Synthetic subscription/challenge accepted; the actual single Grafana UI test delivered once (attempt1/http_200), with matching Dots receipt confirmed by parent at 11:05:48 UTC. The parent-authorized temporary-enable/run/immediate-pause sequence leaves GCP Scheduler PAUSED with annual safety schedule and zero retries unchanged; no pending deliveries. Distinct host synthetic automation stays enabled. Runtime/live Grafana routing are preserved; live cutover is separate. [Final test evidence](../../../outputs/grafana-synthetic-notification-20261003/README.md#end-to-end-notification-verified). [Current approval and rollback](../../../outputs/grafana-callback-approval-20261003/README.md).

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

The SDK is pinned to `@modelcontextprotocol/server` 2.2.0 and `/node` 2.1.0. Custom Events handlers use v2 request schemas; old v1 generic-server examples are incompatible. The server exposes only `get_bridge_health` and `get_alert_event` as read tools.

Production configuration uses the pinned ChatGPT CIMD URL and platform redirect. An empty callback allowlist permits staged OAuth startup while denying every subscription. [Current preparation evidence](../../../outputs/grafana-cimd-20261003/README.md) distinguishes mocked native-provider acceptance from the proxy-blocked live metadata GET. [Human subject helper](deploy/CLOUD_SHELL_GOOGLE_IDENTITY.md) is a standalone file tested only with mocks. The contained application now serves traffic; the inert revision is retained for rollback. See the contained deployment evidence above for current live state.
