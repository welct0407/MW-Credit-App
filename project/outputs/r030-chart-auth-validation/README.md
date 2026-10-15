# Custom matrix authentication validation — 25 September 2026

## Decision

For the owner's single-user custom matrix, select a separately hosted Debian chart protected by a random shared bearer secret. The owner explicitly accepted this fallback if reusing Metabase authentication required disproportionate routing work or cost. This is a validation result, not a deployed chart or a completed production release. R030 remains Open.

The supported custom-visualization plugin requires a paid Metabase entitlement. Live Metabase is v0.63.18.1; its `custom-viz` and `custom-viz-available` entitlement flags are false. No paid feature is needed for an ordinary iframe card.

## Verified findings

| Check | Result |
| --- | --- |
| Installed-version iframe renderer | Supports scripts, same-origin behaviour, forms and popups. Iframe hosts must be allowed in Metabase settings. |
| Live allowed iframe hosts | Proposed chart host is not yet allowed; no setting changed. |
| Session implementation | Normal Metabase session is an HttpOnly cookie with path `/`; source does not set a broad parent-domain cookie. A separate chart hostname cannot assume access to it. |
| Live unauthenticated `/api/user/current` | HTTP 401. No browser session was exported or copied. |
| Existing runtime | Metabase is hosted on Railway; `reports.mw-credit.com` is recorded as DNS-only. Reusing the session under that same origin requires a new path-routing gateway in front of the existing site. |
| Debian identity | GCP `clever-oasis-508610-n7`, `asia-southeast1-a`, `vm-mw-credit-agent`, e2-small; verified hostname over ordinary SSH through Tailscale. |
| Debian capacity snapshot | 1,971 MiB RAM total; 1,333 MiB available at inspection. This is a point-in-time observation, not a load test. |
| Tunnel | Existing `mw-cloudflared-instagram.service` active. Its configuration, routes and business services were untouched. |
| Synthetic authentication proof | Eight tests passed locally and eight on Debian with Python stdlib, random loopback port, synthetic data and an ephemeral random secret. Server shut down after tests. |
| Existing dashboard visibility | Dashboard 3 is in collection 5; Loan Report Partners currently has read permission. It is not an owner-only location for a shared secret. |

The first SSH attempt used the VM public endpoint and did not connect; it was stopped. Verification used the documented Tailscale path. No network rules were relaxed.

## Why session reuse is not selected

It remains technically plausible, without an identified license requirement, but has not been proven end to end. It would require a gateway routing `reports.mw-credit.com/custom-charts/...` to Debian and all other traffic to Railway. The gateway would validate the user's session and actual report permission, without substituting an administrator API key. Cookie forwarding, login/logout, redirects, request limits and failure behaviour would require regression checks. Debian/gateway failure could then affect the ordinary report site as well. A same-origin chart also becomes trusted code in the Metabase origin.

No extra infrastructure charge is proven necessary for that approach; operational coupling and additional work are the reason for choosing the owner-authorized fallback. Do not describe the fallback as avoiding a mandatory paid gateway.

## Fallback implementation contract

1. Use a dedicated HTTPS hostname, provisionally `charts.mw-credit.com`, routed through a reviewed Cloudflare tunnel route to a separate loopback-only chart service on Debian. Reuse capacity, not the collection worker's process, service identity or credentials. No public application port or database port.
2. Keep the present report hostname and Railway routing unchanged. Add only the exact chart hostname to Metabase's iframe allowlist, preserving existing values.
3. Place the iframe initially in an **owner-only dashboard/collection**. Do not place its secret in dashboard 3 while that dashboard remains shared. Private dashboards protect metadata from ordinary readers; Metabase administrators and anyone possessing the secret remain trusted.
4. Generate a 32-byte random secret and retain it privately, outside Git. Store a verification digest in the server's protected configuration. Use an iframe URL fragment (`#key=...`), not a query-string credential. The fragment is not sent in the initial HTTP request. Client code reads it, clears it from its own address and sends the credential only as an HTTPS Authorization header to the chart's same-origin API. No external analytics/scripts, credential logging or persistent browser storage.
5. Treat this as possession-based access, not personal identity. Anyone who obtains the key can read the scoped data until rotation. It remains visible in Metabase's saved iframe definition and to an authorized browser viewer. Fragment use reduces routine URL/referrer logging; it does not make a shared secret non-copyable.
6. Authenticate every data request. Serve only the chart's required fields through fixed, read-only queries against the existing governed reporting views. Never put SQL credentials, Metabase administrative API keys or unrestricted query execution in the browser. SQL categorization stays authoritative.
7. Use `Cache-Control: no-store`, no permissive CORS, a restricted chart CSP and `frame-ancestors https://reports.mw-credit.com`. Framing restrictions and Referer checks are not authentication. Rate/size/concurrency limits and secret rotation belong in the deployed service.
8. Keep refresh self-contained in the iframe, display freshness/error state, and clear private rendered data when authentication fails. No additional login page or Google sign-in is required. No promise of automatic Metabase filter/refresh propagation: wire only explicitly supported parameters.

## Test evidence and limits

`scripts/metabase/chart-auth-proof.py` is an executable synthetic HTTP proof, not a production server. It binds `127.0.0.1` on an OS-selected port for the test duration only. No files, persistent processes, secrets, data connections or configuration were installed on Debian; source was passed through SSH stdin.

Passing checks: missing key denied; wrong key denied; correct key returns synthetic data; forged Metabase Referer does not authenticate; query-string key is not accepted; response does not echo the key; response is non-cacheable with no cross-origin read permission and restricted framing policy; rotation invalidates the previous key.

These tests establish server-side HTTP authentication behaviour only. A real Metabase iframe over public HTTPS, fragment processing, CSP enforcement in the browser, reload/mobile behaviour, long-running refresh and actual read-only SQL data access remain implementation acceptance checks. No production borrower data was used in the proof. HTTPS is a requirement for deployment; the temporary loopback tests used HTTP.

No new subscription, VM or Metabase license is expected for the proposed fallback. Existing resource and traffic usage may increase; tunnel/DNS provisioning and a workload measurement remain to be verified. No services were purchased or activated.

## Recovery and scope

Starting Git commit: `4c8481e9734eed60da15aea81b6bda36de877c7a`. Only the prototype, this evidence, its change log and tracker description were changed. No SQL, AppSheet, Metabase definitions, VM services, firewall, DNS or tunnel routes changed. No release freeze, production rollout or release tag is appropriate for this validation checkpoint.

Future deployment must retain the current native chart, capture affected report/route rollback definitions, add a parallel owner-only custom chart, and remove only its service/route/iframe on rollback. The existing collection runtime is outside the chart scope.

## Primary implementation references

- [Installed iframe renderer](https://github.com/metabase/metabase/blob/v0.63.18.1/frontend/src/metabase/dashboard/visualizations/IFrameViz/IFrameViz.tsx)
- [Installed session middleware](https://github.com/metabase/metabase/blob/v0.63.18.1/src/metabase/server/middleware/session.clj)
- [Installed cookie implementation](https://github.com/metabase/metabase/blob/v0.63.18.1/src/metabase/request/cookies.clj)
- [Metabase custom visualization licensing](https://www.metabase.com/docs/latest/developers-guide/custom-visualizations)
