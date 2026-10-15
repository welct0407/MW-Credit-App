# Approved Metabase connection direction

Owner approved on 22 September 2026: **Cloud SQL Auth Proxy on Railway, then DNS for a friendly address**. Railway Hobby is planned; no subscription purchase is implied by this record. Owner also requested removal of preparation that is no longer needed. The unused SSH/Tailscale assessment file was removed; neither that path nor Cloudflare database tunneling was deployed.

## Target

Metabase on Railway → private/local Google Cloud SQL Auth Proxy → existing Cloud SQL instance `appsheet-pg-prod-20260914` → `loan_manager_prod`, using a dedicated restricted reporting login. Google IAM grants access to the instance; database permissions restrict reporting objects and prevent financial writes. DEV shares the instance, so the PostgreSQL database identity must be explicitly checked.

Proxy requires outbound TCP 443 and 3307. It authenticates/encrypts its Cloud SQL connection without adding Railway IPs to Authorized networks or buying static egress. The [deployed container](../../scripts/metabase/README.md) colocates the processes and binds the application-facing listener to loopback. No public PostgreSQL listener or separate relay service. The runtime connection test and seven live report queries passed.

Live report hostname: `reports.mw-credit.com`. DNS-only CNAME points to `yq8x1vuz.up.railway.app`, with Railway's `_railway-verify.reports` TXT record. Existing DNS records were preserved. Railway terminates HTTPS; Cloudflare is used for DNS, not database transport. Metabase site URL and OAuth origin use the friendly HTTPS address; actual partner Google login succeeded.

## Execution requirements (completed implementation; acceptance details in implementation.md)

1. Capture current platform rollback/settings and back up the Metabase application database before deployment changes.
2. Verify full GCP instance identity and API availability. Create a dedicated Google service identity and scoped Cloud SQL Client permission; preserve secrets outside Git.
3. Deploy a pinned proxy and establish encrypted source-credential storage/recovery. Test network availability before saving PROD connection details.
4. Create/verify SELECT-only reporting access to the required view/projection, with denied writes and restricted base-table access. Keep financial/schema changes out of the connection setup unless separately recorded/approved.
5. Finalize two-partner collection/data access before making the source available. Google login/domain auto-signup state and pending checks are recorded in the change log.
6. Save/run seven POC questions and dashboard, verify totals and browser/mobile layout, then validate friendly DNS/TLS and account access.

References: [Google Cloud SQL Auth Proxy](https://docs.cloud.google.com/sql/docs/postgres/sql-proxy), [Railway trial networking](https://docs.railway.com/pricing/free-trial), [Railway domains](https://docs.railway.com/networking/domains/working-with-domains).
