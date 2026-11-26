# Change notes — Muse secret broker, 26 November 2026

## Purpose
The owner authorised a read-only Secret Manager broker on `vm-mw-credit-agent` so the assistant Muse can list secrets and read values for DEV and PROD (one shared project) without holding any Google credential. It replaces the first plan of the day, a service-account key, which the organisation policy `iam.managed.disableServiceAccountKeyCreation` refused. No key was created and the policy is unchanged.

## Changes
- IAM (gcloud; owner-accepted drift from Terraform): service account `muse-secret-reader@clever-oasis-508610-n7.iam.gserviceaccount.com` ("Muse — Secret Manager reader (read-only)") with project roles `roles/secretmanager.viewer` and `roles/secretmanager.secretAccessor` only; `mw-integration-agent@` holds `roles/iam.serviceAccountTokenCreator` on that account only. No keys exist.
- `integration-agent/muse-broker/muse_broker.py`: standard-library broker on `127.0.0.1:8793` with three GET routes: `/health`, `/v1/secrets` and `/v1/secrets/{id}[?version=N]`. Muse authenticates with a bearer key checked against its SHA-256 digest in constant time. The broker uses the metadata token and IAM Credentials impersonation, with a cached 1-hour token. It allows 60 requests per minute and 8 concurrent, and audits each request as one JSON line with no values.
- `integration-agent/systemd/mw-muse-broker.service` (hardened, `mwagent`), installed by hand and enabled; `integration-agent/tests/test_muse_broker.py`.
- VM: `/opt/mw-muse-broker/muse_broker.py` (root 0644, sha256 `19fd5272…c5c9da`), `/etc/systemd/system/mw-muse-broker.service` (sha256 `14c81bb3…6439`), `/etc/mw-integration-agent/secrets/muse-broker-api-key.sha256` (`mwagent:mwagent` 0600). The plaintext key went only to the owner.
- Cloudflare: ingress `muse-broker.mw-credit.com` → `http://127.0.0.1:8793`, path `^/(health|v1/secrets(/[A-Za-z0-9_-]+)?)$`, on tunnel `mw-collection-webhook` (`infrastructure/ecosystem-tunnels/owned.tf`; plan 0/1/0 sha256 `b6ab9259…`); proxied CNAME `muse-broker.mw-credit.com` (`infrastructure/ecosystem-dns/owned.tf`; plan 1/0/0 sha256 `1a81952e…`). The running cloudflared picked up the remote configuration without a restart.
- Docs: [OPERATIONS](../docs/OPERATIONS.md#muse-secret-broker-since-26-november-2026), the [environment inventory](../../project/Documents/Environment_Inventory.md), and the `ecosystem-dns` and `ecosystem-tunnels` READMEs.

## Checks
| Command | Result |
| --- | --- |
| `python -m unittest tests.test_muse_broker tests.test_systemd_units` | Pass, 18 broker tests plus the existing unit-file tests |
| `ruff check integration-agent` | Pass |
| Terraform baseline plans, both stacks, before the edit | No changes |
| Terraform re-plans after the applies | No changes |
| Loopback `GET /v1/secrets` with the key, on the VM | 200, count 40 = `gcloud secrets list` count 40 |
| Loopback and tunnel without a key or with a wrong key | 401; POST 405 |
| Tunnel `GET /v1/secrets` with the key, from the cloud session | 200, count 40 |
| Tunnel value fetch `mw-credit-app-dev-native-receipt-catalog` | 200, version 1, 1,046 bytes (value not shown) |
| Unknown secret / route outside the tunnel regex | 404 / 404 |
| `systemctl restart mw-muse-broker`, then tunnel list | Active, enabled, 200, count 40 |
| Journal scan for values, `Bearer` or tokens | 0 matches |
| `hooks.mw-credit.com/instagram`, `charts.mw-credit.com`; the five live services | 403 and 200 as before; all active |

## Not run
- The full agent suite was not run locally. The broker is a separate script, and CI runs the suite on push.

## Recovery
Cut Muse off by deleting the hash file (every call answers 401), then `systemctl disable --now mw-muse-broker`. Full removal: remove the TokenCreator binding, then revert the two Terraform edits and apply reviewed plans. Optionally delete the service account. The commands are in [OPERATIONS](../docs/OPERATIONS.md#muse-secret-broker-since-26-november-2026).

## Open questions
- The broker exposes every secret in the project, PROD included. Any process running as the VM identity can also mint the reader token. The owner may want an allowlist of secret ids or labels.

## Remaining work
None.
