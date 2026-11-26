# Change notes — Muse Secret Manager reader account, 26 November 2026

## Purpose
The owner authorised a read-only Secret Manager identity for the personal assistant Muse: one service account with `roles/secretmanager.viewer` and `roles/secretmanager.secretAccessor` at project level, and one JSON key. The task stopped at key creation because organisation policy blocks service-account keys.

## Changes
- Project `clever-oasis-508610-n7` (number 737787224638, checked against `services/lib/identity.mjs`): created service account `muse-secret-reader@clever-oasis-508610-n7.iam.gserviceaccount.com`, display name "Muse — Secret Manager reader (read-only)", with gcloud as `codex-cloud`. The account is not in Terraform (owner-accepted drift).
- No IAM roles granted to it, no key created, and no other resource changed.

## Checks
| Command | Result |
| --- | --- |
| `gcloud resource-manager org-policies describe iam.disableServiceAccountKeyCreation --project=clever-oasis-508610-n7 --effective` | Enforced; no project-level override, so it comes from organisation 594773370606 |
| `gcloud iam service-accounts keys create … --iam-account=muse-secret-reader@…` | Failed: `FAILED_PRECONDITION`, `CUSTOM_ORG_POLICY_VIOLATION` on `constraints/iam.managed.disableServiceAccountKeyCreation` |
| `gcloud iam service-accounts keys list --managed-by=user` | 0 keys |
| `gcloud projects get-iam-policy` filtered to the account | No roles |

## Not run
Role bindings and the `gcloud secrets list` check as the new account: the owner's instruction was to stop when key creation is blocked.

## Recovery
`gcloud iam service-accounts delete muse-secret-reader@clever-oasis-508610-n7.iam.gserviceaccount.com --project=clever-oasis-508610-n7`.

## Open questions
- How Muse should authenticate without a key: impersonate this account from an identity Muse already has, use Workload Identity Federation, or add an owner-approved exception to the organisation policy for this project.

## Remaining work
Grant the two roles and set up Muse's authentication once the owner chooses a route.
