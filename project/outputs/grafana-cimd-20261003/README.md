# Pinned ChatGPT CIMD and human identity preparation — 3 October 2026

Owner approval: **04:02:15 UTC, “Ok”**, for the reviewed narrow CIMD recommendation
and human-run identity helper. Baseline `52970c3d2011930200d8fe8fdcaaf08aa9a8173f`;
isolated checkout `/workspace/grafana-bridge-verification`, branch
`feat/grafana-mcp-events`, existing draft
[PR 3](https://github.com/welct0407/AppSheet-Loan-Project/pull/3).
Original checkout preserved; R050 remains Open. This is preparation/testing,
with no live application deployment, grant, plugin creation, subscription,
secret access/change, Scheduler/Grafana activation or notification.

## Source behavior and compatibility

Official [OpenAI authentication guidance](https://developers.openai.com/plugins/build/auth)
names client URL `https://chatgpt.com/oauth/client.json`; the stable platform
redirect is `https://chatgpt.com/connector_platform_oauth_redirect` for servers
satisfying RFC 9207. [MCP authorization](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization)
requires fetched client identity/redirect validation. The installed locked
`oidc-provider` **9.12.2**, types **9.12.1**, supports native CIMD draft-02,
`allowFetch`, per-use `allowClient`, cache bounds, custom fetch/body limits and
RFC 9207 metadata plus issuer-bearing success/error responses. There is no
provider compatibility blocker or version upgrade. The experimental CIMD
revision is explicitly acknowledged and covered by real-provider tests.

Production configuration accepts only that exact client URL and redirect,
rejects conflicting environment values, and enables native CIMD. No DCR or
arbitrary client URL is accepted. Fetch is a credential-free HTTPS GET to the
pin only, no redirects, fresh public-only DNS resolution, pinned address,
original TLS hostname/certificate verification, 2.5-second provider deadline
and 8 KiB body cap. A document must match the client ID, singleton redirect,
code response and permitted grants. Public `none` authentication is selected
only when offered by the document (including the plural method list); no
shared-secret method, remote JWKS or secondary URL is imported. Provider cache
is bounded to 30–300 seconds and its client pin is checked on every use. Metadata
changes outside these pins fail closed. Existing static-client tests remain
synthetic fixtures; runtime environment loading selects CIMD only.

Exact owner verified subject/email, Google state/nonce/PKCE, token resource and
audience, S256, encrypted persistence, refresh rotation and revocation remain
in force. An absent/empty callback list loads as `[]`; subscriptions fail before
reading their signing secret, storing subscription state, DNS or challenge
traffic. No real subscription or delivery-secret capture occurred.

## Offline verification in this environment

At **04:19 UTC**:

| Check | Result |
| --- | --- |
| TypeScript build + bridge Node suite | **38 passed, 0 failed** |
| New human identity helper mock suite | **9 passed** |
| Existing Cloud Shell seeding mock suite | **16 passed** |
| Existing owner-bootstrap mock suite | **26 passed, 1 Windows-only skip** |
| Production dependency audit | **0 vulnerabilities** at moderate threshold |
| `git diff --check` | Passed |

Node tests exercise the actual pinned provider and SDK on localhost with
synthetic identities, keys and mocked metadata/DNS/callbacks. They verify CIMD
cache reuse, `none` method intersection, RFC 9207 metadata and success/error
issuer values, exact redirect/resource denial, S256 enforcement, owner-disabled
login/token denial, refresh/revocation, unknown URL/DCR rejection before fetch,
poisoned/oversized/redirected metadata rejection, stalled DNS deadline, and
empty callback denial before secret handling/persistence/outbound traffic.
Existing Google verified-sub/email/nonce and encrypted grant/outbox regressions
also pass. No test uses real Google credentials or real events.

The saved bridge dependencies were absent; a **package-local locked `npm ci
--ignore-scripts`** restored them for compatibility/tests. No global toolchain
install, SDK upgrade, lab reset or runtime/environment policy change occurred.
The CI workflow now includes the identity helper mock suite on Linux and Windows.
Fresh remote CI status is **unverified** because the earlier GitHub API Forbidden
route remains stopped; no connector/API alternative was tried. No current image
build/deployment or Windows-host run is claimed.

## Human handoff and remaining checks

Standalone [cloud-shell-google-identity.py](../../scripts/monitoring/grafana-mcp-bridge/deploy/cloud-shell-google-identity.py),
SHA-256 `a15dfffed3bfad4884340befb576325221542a4075efaada4428f831e28519a5`,
is ready for later Library delivery. [Owner instructions](../../scripts/monitoring/grafana-mcp-bridge/deploy/CLOUD_SHELL_GOOGLE_IDENTITY.md)
explain execution in the existing human Cloud Shell only. It verifies actual
active `welct0407@mw-credit.com`, rejects overrides/impersonation, captures an
existing-session gcloud access token only in memory, and sends it only in the
Authorization header to Google's documented HTTPS UserInfo endpoint. It uses
normal TLS/system proxy policy, refuses redirects, bounds time/body size,
selects only verified sub/matching email/email_verified for stdout, and stops
on credential/scope/request failure without login/consent fallback. It creates
no token file/argument/output and never replays SDK/HTTP diagnostic payloads.
The existing SDK retains its ordinary credential lifecycle; Python memory
zeroization is not promised. **Agent did not run this live; owner sub remains
unverified until the human executes it.**

One fresh-environment attempt to retrieve the public ChatGPT metadata document
returned **proxy CONNECT 403**, curl exit 56, HTTP `000`. The response body/actual
live document was not retrieved or validated. No retry, alternate route or
network-policy change occurred. Official documentation supports the URL and
redirect pins; mocked acceptance is not live ChatGPT metadata acceptance.
Deployment-time retrieval, actual Google web-app consent/owner login and full
ChatGPT/MCP Events delivery remain separate pending acceptance. The deployed
inert bridge was not changed or rechecked during this source task.
