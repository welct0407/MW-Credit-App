# MW Grafana Events — private connection

This source-only Agent Plugins 1.0 package connects to the existing streamable-HTTP
server at https://alerts.mw-credit.com/mcp. It contains no credentials, tokens,
private owner identifiers, callback destinations or app IDs.

The implemented read-only tools are `get_bridge_health` and `get_alert_event`.
Their names and behavior were verified in the bridge source; authenticated live
MCP tool discovery and calls remain pending the owner's secure Google consent.
The host discovers OAuth through the server's protected-resource metadata and
authorization-server discovery. Do not add static authentication headers, guess
a callback URL, or manually enter a client secret in this package.

Parent materialization: retrieve this directory from the published repository
commit, preserve its directory name, and ZIP these three files under the single
`mw-grafana-events/` root. The adjacent `mw-grafana-events.zip` is that exact
archive. Materialize it in the parent's own workspace before calling the supported
private-plugin upload tool with that actual local archive path. Do not use the
child task's temporary filesystem path as if it were shared.

Save privately, then let the owner complete Google sign-in and consent through
the host's supported connection flow. Package upload alone does not prove OAuth
or tool access. Keep event subscriptions and callback hosts denied, Scheduler
absent, and Grafana routing unchanged. First verify health/tool discovery through
the authenticated host after consent; event activation remains a later stage.
