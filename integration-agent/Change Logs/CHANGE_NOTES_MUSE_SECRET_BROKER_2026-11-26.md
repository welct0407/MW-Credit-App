# Change notes — Muse secret broker, built and dropped, 26 November 2026

## Purpose
The owner asked for a way for the assistant Muse to read Secret Manager (DEV and PROD, one shared project). The first plan was a service-account key, which the organisation policy `iam.managed.disableServiceAccountKeyCreation` refused; no key was created and the policy is unchanged. The second plan was a read-only broker on `vm-mw-credit-agent`. It was built, verified and then dropped the same day on the owner's instruction, in favour of direct access from Muse to Google Cloud (feasibility still under review). This note records what was live for about two hours and what remains.

## Changes
- Live from 16:01Z to about 17:00Z, then removed:
  - `mw-muse-broker.service` on `127.0.0.1:8793`, a standard-library Python broker installed at `/opt/mw-muse-broker/`.
  - A key-hash file under `/etc/mw-integration-agent/secrets/`.
  - Tunnel ingress `muse-broker.mw-credit.com` on `mw-collection-webhook` and its proxied CNAME.
  - `roles/iam.serviceAccountTokenCreator` for `mw-integration-agent@` on `muse-secret-reader@`.
- Removal order:
  1. The hash file was deleted, which cut off Muse's key.
  2. The unit was stopped, disabled and deleted, and the script directory removed.
  3. The tunnel and DNS Terraform changes were reverted: plan 0/1/0, then 0/0/1. Both stacks are byte-identical to their state before the broker.
  4. The TokenCreator binding was removed.
- Repository: the broker code (`integration-agent/muse-broker/`), its unit and tests are removed. `OPERATIONS.md`, the environment inventory and the `ecosystem-dns` and `ecosystem-tunnels` READMEs are back to their state before the broker. The broker version is kept in commit `2152ed7` for reference.
- Kept: service account `muse-secret-reader@clever-oasis-508610-n7.iam.gserviceaccount.com`, created with gcloud outside Terraform. It still holds project roles `roles/secretmanager.viewer` and `roles/secretmanager.secretAccessor`, but it has no keys and no IAM bindings that let anyone act as it, so it is unusable until someone with project IAM rights grants that.

## Checks
| Command | Result |
| --- | --- |
| VM: unit files, port 8793, `/opt/mw-muse-broker`, hash file | 0 unit files, nothing listening, directory and hash file gone |
| VM: `systemctl is-active` for the webhook, cloudflared, recognizer, chat relay and charts | All active |
| Terraform re-plan `ecosystem-tunnels`, `ecosystem-dns` after the removal applies | No changes |
| `git diff 2152ed7^` for both `owned.tf` files | Empty |
| `dig muse-broker.mw-credit.com`; `https://muse-broker.mw-credit.com/health` | No record; no answer |
| `hooks.mw-credit.com/instagram`, `charts.mw-credit.com` | 403 and 200, as before |
| `get-iam-policy` on `muse-secret-reader@` | No bindings; 0 keys |
| Earlier, while live: loopback and tunnel list (40 secrets = `gcloud secrets list`), 401 on missing or wrong keys, one value fetch reported by length only, restart survival, no values in the journal | Passed (commit `2152ed7`) |

## Not run
None beyond the read-backs above; no code remains to test.

## Recovery
To restore the broker, use the files and the OPERATIONS section in commit `2152ed7`. That needs a new key, the TokenCreator grant and reviewed Terraform plans.

## Open questions
- Whether to delete `muse-secret-reader@`: `gcloud iam service-accounts delete muse-secret-reader@clever-oasis-508610-n7.iam.gserviceaccount.com --project=clever-oasis-508610-n7`.
- The direct-access route for Muse (OAuth as a dedicated organisation user through Google's remote MCP server) awaits the owner's decision and a feasibility test.

## Remaining work
None for the broker.
