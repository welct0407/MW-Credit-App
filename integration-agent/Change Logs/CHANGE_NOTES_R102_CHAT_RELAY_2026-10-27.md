# Change notes — R102 keyless chat relay, 27 October 2026

## Purpose
R102 makes Claude Opus 5.5 selectable in the in-app chat through this VM (owner decision: the Anthropic API, not Vertex; then a keyless relay). The chat service on Cloud Run reaches the relay over the VPC with a Google ID token. The relay gets short-lived Anthropic credentials through workload identity federation and streams Messages API responses back. No Anthropic API key exists anywhere. Deployed and enabled for DEV on 28 October 2026 under the owner's VM relay deploy authorization (see Deployment); PROD stays unconfigured.

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
- The end-to-end Messages call through the relay. It needs a Google ID token for `mw-credit-app-chat-dev@` with the relay audience. The operator identity cannot mint one (impersonation denied: no Token Creator role, and none was granted). It runs as the DEV proof once the chat service has `chat_relay.enabled` (R102 design §2.5).
- PROD: no PROD federation rule exists yet. PROD is not configured on the VM and PROD callers are refused.

## Deployment (Forge, 28 October 2026, UTC; owner authorization for the VM relay deploy relayed by the orchestrator)
Target: `vm-mw-credit-agent`, project `clever-oasis-508610-n7`, checkout `/opt/mw-integration-agent-src`.
- **Before:** checkout and live `code_version` `374551d60fda07f4768f0beafa4dd100bfa6954b` (detached), clean. `config.json` sha256 `4ecf9721…a71`, 81 keys. Catalogue revision 32, sha256 `ea14932c…4aa`. Running: receiver, recognizer, cloudflared, Grafana PDC, report charts. The seven `mw-*` timers and `mw-receipt-wake.path` were active. No failed units.
- **Code:** the branch commit `49f604493531ee67ddeda41648d732a411a7c82f` (`claude/wonderful-sagan-uc24wu`, not yet on `main`) was fetched by name and checked out detached. `374551d` is its ancestor. The engine requires only a clean checkout at the pinned commit. There was no migration, lock or existing-unit change.
  - Agent schema check: shipped and applied through V11, no gap or drift. It ran through a temporary root-only operator connection file (`codex-cloud` IAM user, one-hour token), which was removed after the deploy.
  - `deploy-runtime.py` freeze 04:34:20Z (rollback `/var/lib/mw-integration-agent/rollback/runtime-20261028T043420974563Z`, metadata sha256 `2ab66ccf…bb86`). Install 04:34:21Z to 04:34:27Z (no unit changed). Activate 04:34:27Z to 04:34:32Z, probe `21f47ed8-6d62-498a-a323-39f9b68bf426`, timers resumed.
  - The catalogue went from revision 32 to 33, adding `chat_messages_relay` disabled.
- **Config only (documented procedure):** backups `/root/config.json.pre-r102-relay` and `/root/service-catalogue.json.pre-r102-relay` (the post-activate state).
  - Worker timers and the wake path stopped 04:35:09Z, workers idle.
  - Added the `chat_relay_*` keys: enabled, listen `10.148.0.2:8791`, audience `http://10.148.0.2:8791/v1/chat/messages`, upstream timeout 110 s.
  - Only one caller, `mw-credit-app-chat-dev@` (subject `110567525407665876362`, `dev`).
  - Organization `fe93c72e-d3c5-4710-8de5-465493fd3c57`. `chat_relay_wif.dev`: rule `fdrl_015LhxsBXmuQTpNgZ88DMofy`, service account `svac_012cXQHFn4eG1b21um6iHEpF`, workspace `wrkspc_013UyN3VKLEsFST7c5jvq6Y5`, audience `https://api.anthropic.com/mw-credit-chat-dev`. There is no `prod` entry.
  - Catalogue `chat_messages_relay` enabled.
  - `check` ok. The receiver restarted with `/ready` true at `49f60449…`. The recognizer restarted, `/healthz` ok and enabled. Timers started 04:35:14Z.
  - Result: `config.json` sha256 `9363d74c…5c5c`, 89 keys. Catalogue sha256 `56a660e6…25`.
- **Unit:** `mw-chat-relay.service` installed from the checkout (none existed before), `daemon-reload`, enabled and started 04:35:28Z, matching the recognizer, which is also enabled.

## Live verification (28 October 2026; no token printed)
| Check | Result |
| --- | --- |
| `mw-chat-relay` | active and enabled, listening only on `10.148.0.2:8791` |
| `GET /healthz` | `{"status":"ok","enabled":true}` |
| `POST /v1/chat/messages` without a token | 401 `token_missing` |
| Malformed bearer token | 403 `token_rejected` |
| Valid Google ID token of a caller not on the list (the VM's own identity, relay audience) | 403 `token_rejected` (PROD callers are not listed and are refused the same way) |
| Federation exchange on the VM (DEV rule, audience `…/mw-credit-chat-dev`) | 200, `Bearer`, `expires_in` 600, scope `workspace:developer`, `sk-ant-oat01-` prefix |
| Other services | Receiver `/ready` true at `49f60449…`; recognizer `/healthz` ok. Cloudflared, Grafana PDC and report charts running; all timers and the wake path active. Receipt summary ran cleanly after the restart. No failed units. |
| Firewall `allow-chat-relay-run-egress` | tcp 8791 from 10.148.0.0/20 to the VM identity (applied 27 October 2026) |

Pending: the chat Cloud Run switch (`chat_relay.enabled`) waits for the pull request CI run. After that comes the DEV proof, then the PROD rule and the PROD relay entry at promotion.

## Recovery
- **Relay off (config only):** set `chat_relay_enabled` false, or stop and disable `mw-chat-relay.service`. Claude then answers MODEL_UNAVAILABLE in the chat while Gemini stays selectable.
- **Config back to before the relay:** use the config-only procedure with `/root/config.json.pre-r102-relay` and `/root/service-catalogue.json.pre-r102-relay`.
- **Package back to `374551d`:** `sudo python3 integration-agent/scripts/deploy-runtime.py rollback --commit 49f604493531ee67ddeda41648d732a411a7c82f`. This restores the freeze `runtime-20261028T043420974563Z`: package, revision 32 catalogue, config and units. First stop, disable and remove `/etc/systemd/system/mw-chat-relay.service` and run `daemon-reload`, because the older package has no `serve-chat-relay`. Then `git checkout --detach 374551d60fda07f4768f0beafa4dd100bfa6954b` in the checkout.
- **After the branch merges:** if `main` does not contain `49f6044` (squash merge), `update-from-github.sh` (fast-forward only) cannot move the detached checkout. Check out `main` first.
- **Revoke credentials:** archive the DEV federation rule in the Claude Console.
- No state, key or data needs cleanup.

## Open questions
- The `anthropic-version` header follows Forge's spec (`2023-06-01`). The request body sent by the chat is also valid on `2026-10-21`, so a later switch is a one-constant change.

## Remaining work
Steps 1 to 5 of the activation list are done for DEV (see Deployment). Still open:
1. Turn on the chat Cloud Run switch (`chat_relay.enabled`) after the pull request CI run.
2. Run the DEV proof from the R102 design (§2.5).
3. At promotion: the owner creates the PROD rule. Then add the PROD caller and the `chat_relay_wif.prod` ids (config only), and turn on the PROD Cloud Run switch.
