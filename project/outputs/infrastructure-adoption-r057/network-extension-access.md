# Cloudflare tunnels and Tailscale — access history

**Current status:** The owner subsequently approved and created administrative credentials, stored in three operational Secret Manager containers at version1. Cloudflare and Tailscale authenticated reads now succeed. Seven additional resources were imported across three roots after independent review; all saved plans had zero remote actions and all ordinary refreshed post-plans exited0. See [current import evidence](network-extension-results.json); the blocked observations below are retained as dated history, not a current access limitation.

Owner authorization on 13 October 2026 extends R057 to existing Cloudflare tunnels and manageable Tailscale configuration, preserving current behavior. The completed 45 imports remain unchanged. This extension imported **zero resources**: no Terraform plan/apply was attempted without control-plane visibility.

## Cloudflare

The established Secret Manager authentication route (`mw-credit-app-dev-cloudflare-dns-token`, numeric version 1) authenticated the `mw-credit.com` zone and resolved account `03566f0be789f9d2ba2a5389dfb0f1f6`, named `Zhcyidea@gmail.com's Account`. Both bounded GETs returned HTTP 403, Cloudflare code 10000 (`Authentication error`):

- `/accounts/03566f0be789f9d2ba2a5389dfb0f1f6/cfd_tunnel?is_deleted=false`
- `/accounts/03566f0be789f9d2ba2a5389dfb0f1f6/cfd_tunnel/f75df9f1-0acf-4e8c-b797-a5fcf85b22f9/configurations`

The tunnel ID is the existing charts/hooks DNS target, not a newly verified tunnel inventory. DNS access does not supply tunnel control-plane access. No alternative established admin token/certificate was found in the scoped environment, user `.cloudflared` paths or documented private project locations. The maintained Debian unit references `/etc/mw-integration-agent/secrets/cloudflare-token.txt`; this is a connector runtime token, not an operator API credential, and was not extracted.

Cloudflare provider 5.27.0 supports tunnel and configuration imports as `account_id/tunnel_id`. Resume needs an existing provider-compatible API token for this account with **Cloudflare Tunnel Read** (or the documented equivalent Cloudflare One Connector cloudflared Read permission). Read access is the initial requirement for import-only review; no broader write grant or token creation was performed. Inject authentication through `CLOUDFLARE_API_TOKEN`, outside Terraform variables/state. Preserve the observed configuration source: locally managed routing must remain local; do not convert it to remote configuration. Do not add `tunnel_secret` or retrieve a tunnel-token data source.

[Official pinned tunnel provider documentation](https://raw.githubusercontent.com/cloudflare/terraform-provider-cloudflare/v5.27.0/docs/resources/zero_trust_tunnel_cloudflared.md) · [configuration documentation](https://raw.githubusercontent.com/cloudflare/terraform-provider-cloudflare/v5.27.0/docs/resources/zero_trust_tunnel_cloudflared_config.md)

## Tailscale

The existing CLI reports `Running`, tailnet `zhcyidea@gmail.com`, local VM-01 node ID `nmRTc3S5bn11CNTRL`. This verifies local client identity only. No Tailscale API key, OAuth client credentials or established federation configuration was found in the scoped environment, matching Secret Manager names or documented private credential locations. No unauthenticated API probe, daemon-state extraction, browser fallback, enrollment or key generation was attempted.

Resume needs an existing tailnet administrative API access token supplied as `TAILSCALE_API_KEY`, or an existing OAuth client supplied via `TAILSCALE_OAUTH_CLIENT_ID` and `TAILSCALE_OAUTH_CLIENT_SECRET`, with `TAILSCALE_TAILNET=zhcyidea@gmail.com`. For bounded discovery use only relevant read scopes: `dns:read` for DNS; `devices:core:read` for device metadata; policy inspection requires `policy_file:read` plus its documented `devices:posture_attributes:read` and `devices:core:read` dependencies. Exact manageable resources/import IDs must be determined from authenticated current metadata. Do not create auth keys/OAuth clients or grant broad scopes merely for adoption.

[Official Terraform authentication guide](https://tailscale.com/docs/integrations/terraform-provider) · [official credential scope reference](https://tailscale.com/docs/reference/trust-credentials)

## Ownership and completion boundary

The retained nine-state ownership inventory and completed R057 import matrix contain no Cloudflare tunnel or Tailscale resource addresses. This bounded reuse does not replace the exact current ownership check required once accessible import candidates are known. No placeholder root/import block was published, and no access policy, local routing, node authorization or connectivity setting changed. Azure controller exclusions remain in force.

At this historical checkpoint, both extension batches were **blocked on established administrative credentials/access**. This blocker was subsequently resolved and the authorized imports completed as recorded above. After access is available: inspect exact current resources, privately review generated configuration for credentials, pin provider/root ownership, require a reviewed import-only plan with zero remote changes, then an ordinary refreshed no-change plan. Existing R057 private diagnostic retention remains 20 October 2026.
