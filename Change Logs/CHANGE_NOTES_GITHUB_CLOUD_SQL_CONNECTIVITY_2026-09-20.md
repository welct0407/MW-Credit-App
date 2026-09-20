# GitHub and Cloud SQL connectivity — 2026-09-20

## Scope and purpose

Made the VM checkout independently fetchable from its private GitHub repository and established authenticated, loopback-only transport to the production Cloud SQL instance. No application database credential, SQL statement, business worker, schedule, notification, or data write was enabled.

## Changed infrastructure and files

- Created dedicated service account `mw-integration-agent@clever-oasis-508610-n7.iam.gserviceaccount.com`.
- Granted `roles/cloudsql.client` with an IAM condition restricted to resource `projects/clever-oasis-508610-n7/instances/appsheet-pg-prod-20260914` and service `sqladmin.googleapis.com`.
- Replaced the VM's default Compute Engine identity with the dedicated identity and set the `cloud-platform` OAuth scope; this required one controlled stop/start.
- Added pinned Cloud SQL Auth Proxy 2.25.4 installation and a hardened systemd unit bound only to `127.0.0.1:5432`.
- Added a clean-checkout, fast-forward-only GitHub update script.
- Configured a repository-scoped read-only GitHub deploy key outside Git; no personal token or write-capable key is stored on the VM.
- Updated `README.md` and `docs/OPERATIONS.md` with the connection and update boundaries.

## Rollback

- Disable and remove `cloud-sql-auth-proxy.service` and `/usr/local/bin/cloud-sql-proxy`.
- Stop the VM, restore its prior service account/scopes if required, restart it, then remove the conditional IAM binding and dedicated service account.
- Remove the GitHub deploy key from repository settings and delete its private key and known-hosts files from `/etc/mw-integration-agent`.
- Revert repository files with a normal follow-up commit.

## Checks

- Cloud SQL Admin API is enabled.
- Dedicated VM identity and conditional Cloud SQL Client binding read back from GCP.
- VM restarted with the same internal and static external IP addresses.
- Pinned proxy binary fingerprint: `b780c0d2c445ffd5d2fdba0925f2722c19fcd0d2c27c538e85713732698561f2`.
- Proxy service is enabled and active, and reports ready for new connections.
- Listener read back as `127.0.0.1:5432` only.
- An unauthenticated PostgreSQL startup probe reached the server and received a SCRAM-SHA-256 authentication request; no password was supplied.
- VM metadata reports the dedicated `mw-integration-agent` service account.
- Deploy-key fingerprint: `SHA256:RxBY/LgFOOWm5adSfv7X0iuYcdv05LFw47sY38y9gaU`.
- GitHub lists the key as read-only and repository-scoped.
- The VM fetched `refs/heads/main` over SSH, fast-forwarded to the published commit, and retained a clean checkout.

## Status and remaining work

Cloud SQL transport and read-only GitHub synchronization are complete. PostgreSQL login remains intentionally unavailable until a least-privilege database role and credential are explicitly approved and installed outside Git.
