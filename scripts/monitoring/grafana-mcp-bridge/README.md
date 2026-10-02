# Grafana MCP Events bridge

R050 development implementation; **bootstrap resources provisioned; application not deployed or connected**. [Live bootstrap checkpoint](../../../outputs/grafana-mcp-bootstrap-20261002/README.md). This monitoring component belongs to AppSheet-Loan-Project. It does not control Azure VMs or replace the existing Grafana IRM/mobile route.

The [design and operating guide](../../../Documents/Grafana_MCP_Events_Bridge.md) owns deployment prerequisites, OAuth, durable delivery, security, cost and recovery. `deploy/service.yaml.example` is a review template with unresolved placeholders, not an executable deployment instruction.

The owner-run [phase-one bootstrap](deploy/OWNER_BOOTSTRAP.md) prepares approved resources and an inert domain/TLS revision; it is never executed by local checks.

## Local checks

Requires Node 24 and npm. From this directory:

```sh
npm ci --ignore-scripts
npm test
python3 deploy/test_owner_bootstrap.py
npm audit --omit=dev --audit-level=moderate
npm run estimate
docker build -t mw-grafana-events:offline .
```

Tests use synthetic credentials, in-memory storage, simulated DNS/callbacks and localhost HTTP. They never contact Grafana, Google OAuth, Firestore, ChatGPT or Dots. The real downstream OAuth provider and MCP SDK are exercised locally, including a cookie jar that honors path/domain/Secure/expiry and actual HTTP token revocation; Firestore's transaction ordering is checked with a fake contract. Actual Firestore indexes/IAM, Google login and host connection remain deployment acceptance checks.

`tools/cost-assumptions.json` contains editable USD workload/rate inputs. `node tools/estimate-cost.mjs [path-to-assumptions.json]` emits reproducible scenarios. It does not inspect billing or measure Cloud Run latency.

The container uses a pinned Linux amd64 Node image, a locked dependency tree and the non-root `node` user. No credentials or local environment files are copied. Runtime configuration is validated at startup; secrets come only from mounted files. The process uses workload ADC for Firestore and Google public signing keys for token verification.

## Source map

| File | Responsibility |
| --- | --- |
| `src/app.ts` | HTTP routing, app authentication, MCP 2.0 custom Events handlers and read tools |
| `src/oauth.ts` | Owner Google login, PKCE OAuth server, encrypted persistent grants/tokens and revocation |
| `src/events.ts` | Filtering, subscription verification/refresh, transition deduplication, atomic outbox and retry leases |
| `src/security.ts` | Grafana HMAC, constant-time comparison, public DNS checks, pinned HTTPS and sanitized logs |
| `src/store.ts` | Firestore transaction adapter and isolated in-memory test store |
| `src/config.ts`, `src/main.ts` | Canonical origin, mounted configuration, startup and shutdown |
| `deploy/` | Owner-run bootstrap, inert revision, secure secret seeding, service template and Firestore policies |
| `test/` | Synthetic behavior and security regression checks |

The SDK is pinned to `@modelcontextprotocol/server` 2.2.0 and `/node` 2.1.0. Custom Events handlers use v2 request schemas; old v1 generic-server examples are incompatible. The server exposes only `get_bridge_health` and `get_alert_event` as read tools.
