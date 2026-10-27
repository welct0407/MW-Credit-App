# Change notes — R102 keyless chat relay, 27 October 2026

## Purpose
R102 makes Claude Opus 5.5 selectable in the in-app chat through this VM (owner decision: the Anthropic API, not Vertex; then a keyless relay). The chat service on Cloud Run reaches the relay over the VPC with a Google ID token. The relay gets short-lived Anthropic credentials through workload identity federation and streams Messages API responses back. No Anthropic API key exists anywhere. This change is source only: nothing is deployed or enabled, and the service stays disabled (default deny).

## Changes
- `src/mw_integration_agent/chat_relay_api.py` (new):
  - `POST /v1/chat/messages` and `GET /healthz` on the VM's private VPC address (default port 8791).
  - Callers are verified with the receipt recognizer's Google ID-token verifier (pinned issuer, audience, verified email, email and numeric subject). Each allowed caller is the chat service account of its environment, and its email must name that environment.
  - Accepted requests: JSON up to 1 MB, a `claude-*` model, `stream` true, only the Messages keys the chat sends, and custom tools only (no server-side tools).
  - The request bytes are forwarded unchanged to `api.anthropic.com/v1/messages` with `authorization: Bearer <federated token>` and `anthropic-version: 2023-06-01`. No `x-api-key` is sent and the caller's token is never forwarded. The SSE bytes stream back as they arrive.
  - At most four relays run at once. Each one is bounded by `chat_relay_upstream_timeout_seconds` (110 s), which is below the chat service's 120 s request bound.
  - The switch and the catalogue entry are read per request.
  - Each authenticated request writes one audit operation (route `internal`) and one stderr line. Both carry caller, environment, rule id, model, status, code, duration, byte counts and the upstream request id. They never carry a body, token or credential.
  - `serve` refuses to start when `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN` or `ANTHROPIC_PROFILE` is set.
- `CredentialProvider` (Forge's federation spec of 27 October 2026; the one place the upstream auth is decided):
  - For each environment it mints a fresh VM ID token from the metadata server: audience `https://api.anthropic.com/mw-credit-chat-<env>`, `format=full`, 5 s timeout.
  - It exchanges that token at `POST /v1/oauth/token` (jwt-bearer grant, plus the rule, organization, service account and workspace ids; 10 s timeout).
  - The token is cached in memory only. Refresh is advisory from 120 s before expiry (a failure keeps the cached token) and mandatory from 30 s before expiry (a failure fails the request). Exchanges run single flight per environment.
  - After an upstream 401, the relay drops the token, does one fresh exchange and retries once.
  - Error mapping, all answered 503:
    - metadata server failure: `RELAY_IDENTITY_UNAVAILABLE`
    - exchange 400: `RELAY_FEDERATION_CONFIG`
    - exchange 401/403: `RELAY_FEDERATION_DENIED`
    - exchange 429, 5xx or timeout (one retry after 1 s when the deadline allows): `RELAY_FEDERATION_UNAVAILABLE`
    - upstream 403: `RELAY_SCOPE_DENIED`
  - Upstream 429, 529, 5xx and 400 statuses pass through with their error body (`UPSTREAM_<code>`). An upstream timeout answers 504 and a connection failure 502.
  - A DEV caller can use only the DEV rule and a PROD caller only the PROD rule.
- `src/mw_integration_agent/config.py`: calls the relay validation. The catalogue validator knows `chat_messages_relay`.
- Settings (all `chat_relay_*`; the retired `claude_` prefix stays refused):
  - `chat_relay_enabled`, `chat_relay_listen_host`, `chat_relay_listen_port`, `chat_relay_audience`, `chat_relay_upstream_timeout_seconds`
  - `chat_relay_callers`: email, subject, environment
  - `chat_relay_wif_organization_id`
  - `chat_relay_wif.{dev,prod}`: `federation_rule_id`, `service_account_id`, `workspace_id`, `audience`
  - When the relay is enabled, incomplete or placeholder ids fail closed. `config.example.json` keeps them empty with the relay disabled; Forge fills them at deploy.
- `src/mw_integration_agent/cli.py`: new `serve-chat-relay` command, which runs outside job audit like `serve-receipt-recognition`. `check` reports `chat_relay`.
- `systemd/mw-chat-relay.service`: new unit with the recognizer's hardening; install it disabled.
- Catalogue revision 33: `chat_messages_relay` (implemented, disabled), with its `SERVICE_CATALOGUE.md` row and revision paragraph.
- `scripts/deploy-runtime.py`: accepts the live revision 32 to 33 change only when it adds exactly `chat_messages_relay`, disabled. Live switches are kept.
- Tests:
  - New `tests/test_chat_relay.py` (17 tests): configuration, exchange body and audience per environment, cache, refresh at T-120 and T-30, single flight, error mapping, the 401 re-exchange, the environment-to-rule binding, request shape, streaming pass-through, status mapping, disabled paths, and no secret in the log.
  - Updated pins in `test_config.py`, `test_receipt_recognition.py`, `test_deploy_runtime.py` (plus an R102 transition test), `test_cli.py` and `test_systemd_units.py`.

## Checks
| Command | Result |
| --- | --- |
| `PYTHONPATH=src python3 -m unittest discover -s tests` (in `integration-agent/`, cloud session Python 3.13 with the session's dependency path) | 637 tests OK, 70 skipped (lab suites) |
| `python3 -m unittest tests.test_chat_relay` | 17 tests OK |
| `ruff check --no-cache integration-agent` | All checks passed |

## Not run
- Live: no Anthropic workspace, service account or federation rule exists yet (owner steps in the Claude Console), no VM deploy, no unit install, and no activation. The relay was not exercised against the real token endpoint or the Messages API.

## Recovery
Turn the switch off or stop the unit. That is config only, and the chat falls back to MODEL_UNAVAILABLE for Claude while Gemini stays selectable. To revoke credentials, archive the federation rule of the environment in the Claude Console. No state, key or data needs cleanup.

## Open questions
- The `anthropic-version` header follows Forge's spec (`2023-06-01`). The request body sent by the chat is also valid on `2026-10-21`, so a later switch is a one-constant change.

## Remaining work
Activation is a separate owner authorization:
1. The owner creates the two workspaces, service accounts and rules (Forge's spec) and sends the ids.
2. Deploy the code with `deploy-runtime.py`, which also applies the catalogue revision 33 change.
3. Fill the `chat_relay_*` ids and callers in the live config.
4. Install `mw-chat-relay.service`.
5. Turn on `chat_relay_enabled` and the catalogue switch, start the unit, and check `/healthz`.
6. Run the DEV proof from the R102 design (§2.5).
