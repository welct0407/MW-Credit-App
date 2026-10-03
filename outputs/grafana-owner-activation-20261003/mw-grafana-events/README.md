# MW Grafana Events — private cloud connection, 0.1.1

The parent verified the existing private cloud registration and required app
binding for `asdk_app_6ac0b2c350fc8191b08fbc67fca9696e`. The private plugin ID is
unchanged; parent-verified release: `pluginrel_6ac0b48291e8819199551306c78a187f`.
Browser verification showed Your cloud plugin, Apps 1 and Connect.

The earlier raw portable MCP package provided a desktop-only connection; it did
not establish the proper cloud-app binding. This package now declares the verified
required app in `.app.json`, references it from the portable and legacy manifests,
and leaves both `mcp.json` and `.mcp.json` with empty `mcpServers`. The legacy
manifest contains no `mcpServers` pointer. All original listing metadata and the
default prompt are preserved. This source reconciliation does not update or
recreate the already saved account plugin.

The registered server remains https://alerts.mw-credit.com/mcp with stable ChatGPT
CIMD identity and platform redirect, discovered through its OAuth metadata.
Authentication is currently failing with `request_failed`; diagnostic-only
server instrumentation is being deployed. Registration and listing readiness
do not establish successful Google consent, token exchange or MCP tool access.
Use the host's secure Connect flow for owner sign-in; never copy codes, tokens,
cookies or client secrets into source or chat.

The source-verified read-only tools are `get_bridge_health` and `get_alert_event`.
Authenticated live discovery remains pending. Callback hosts remain empty, event
subscriptions are denied, Scheduler is absent and Grafana routing is unchanged.
No event callback destination is guessed or added.

This source-only archive contains only the manifests and this README. It includes
no secrets or private owner identifiers. Parent should preserve the existing
plugin/app identity and use its own actual local archive path if materialization
is needed; the executor's temporary path is not shared.
