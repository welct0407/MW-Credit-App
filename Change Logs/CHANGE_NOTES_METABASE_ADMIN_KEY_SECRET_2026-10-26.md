# Change notes — Metabase administrator API key in Secret Manager, 26 October 2026

## Purpose
The Metabase dashboard review needed the live layout of Loan Reports (dashboard 3), which only the REST API returns and only with an API key. The sole administrator key lived as a file on VM-01 that had been cleaned up. The owner regenerated key 3 ("Report development") and asked for Secret Manager as its home so cloud sessions can read, and later modify, the reports.

## Changes
- Secret Manager (project `clever-oasis-508610-n7`): new secret `mw-metabase-admin-api-key` (labels `system=metabase`, `purpose=report-development-admin`, automatic replication) with `roles/secretmanager.secretAccessor` for `codex-cloud@clever-oasis-508610-n7.iam.gserviceaccount.com`. Version 1 was added by the owner from Cloud Shell. A short-lived `mw-metabase-review-key` secret created earlier the same day was deleted unused.
- Metabase: the owner regenerated API key 3 in Admin → Authentication → API keys; the old value is invalid. No group or permission change.
- `project/scripts/metabase/ReportingApi.mjs`: `apiKey()` resolves the key from `METABASE_ADMIN_API_KEY`, then `gcloud secrets versions access latest --secret=mw-metabase-admin-api-key`, then the legacy VM-01 file; the private diagnostics directory can be overridden with `MW_METABASE_PRIVATE_DIR` and is created on demand. All installers and verifiers import this helper; none reads the key file directly.
- Records: `project/scripts/metabase/README.md` (credential rotation list), `project/Documents/Environment_Inventory.md` (Metabase credentials paragraph), the 22 October rotation note's open question marked resolved.

## Checks
| Command | Result |
| --- | --- |
| `gcloud secrets versions list mw-metabase-admin-api-key` | Pass: version 1 enabled |
| `GET /api/dashboard/3` with the key read from Secret Manager (scratch fetch script, key never printed) | Pass: 12 tabs, 28 parameters, 272 dashcards; matches the 272 placements recorded on 22 October |
| `node --check project/scripts/metabase/ReportingApi.mjs` | Pass |
| `assertSource()` then `api('GET','dashboard/3')` through the updated helper from the cloud session | Pass: source verified, 12 tabs, 272 dashcards |
| `npm run check:docs` | Pass: 0 failures, 0 warnings |

## Not run
- No installer or verifier was executed; the key was used read-only for the dashboard review.
- No Metabase object was changed.

## Recovery
Delete the secret or remove the IAM binding to withdraw cloud access; regenerate key 3 again in Metabase to invalidate the stored value. Revert this commit to restore the file-only key resolution. Git baseline: `374551d`.

## Open questions
None.

## Remaining work
- Retire the VM-01 file fallback from `ReportingApi.mjs` once VM-01 also reads the key from Secret Manager.
- The dashboard enhancement plan and prototype from the same session (scratch artifact, no repository change yet) remain under owner review.
