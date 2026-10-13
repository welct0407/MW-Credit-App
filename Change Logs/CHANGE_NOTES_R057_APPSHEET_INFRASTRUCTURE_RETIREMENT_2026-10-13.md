# R057 AppSheet infrastructure retirement — 13 October 2026

Owner authorized full AppSheet retirement while preserving native PWA/API/agent, shared SQL/GCS/receipts and Azure controller. Root owns AppSheet backup/deactivation/API switches and release publication. F owns bounded Debian configuration and obsolete runtime credentials.

Starting application checkout: `17da03c`; PM starting `b79ff89d`. Original application Phase 2 checkout is untouched. Live agent source was `e9fd149914a3fa49f036c1eec75a8d4dc8a07c00`; R055 collector hash matches its deployed evidence exactly.

The existing strict host pin verified Debian through its established Tailscale route. Existing local login key was rejected. A task-owned one-hour SSH metadata row supplied temporary administration through keyless Azure/GCP operator authentication; other rows and host trust were preserved. Temporary cleanup remains pending until deployment completes.

Four private files (config, catalogue, two AppSheet keys) were copied with SHA-256 equality checks to root-only `/var/backups/mw-appsheet-retirement-r057-20261013` (directory0700/files0600). Atomic config replacement set `appsheet_enabled=false` and removed five AppSheet endpoint/ID/key-path fields. Every other config field was compared unchanged. Catalogue and six business timers remain unchanged. Active obsolete key files remain until code deployment and consumer clearance.

Installed-code config validation passed. Both native workload scopes authenticated with key-only count1 before and after; no borrower values were output. Existing collector is native and unchanged. No financial operation, business cycle, test notification, database write, resource deletion or license change was performed.

Evidence: `outputs/r057-appsheet-retirement/infrastructure-evidence.json`. Remaining: exact candidate deployment, key removal after consumer clearance, focused smoke and temporary SSH cleanup. Recovery is private config/key restore only under coordinated rollback; revoked AppSheet API keys would need separately authorized re-enablement/recovery. Retain recovery artifacts, review20October2026; never restore journals over later activity.

## Applied result

Exact published source `a8568e385051a20a3b7efd3374bade6c193d6882` deployed using the minimal R057 wrapper around established freeze/install/activate mechanics. Package/configuration backup: `/var/lib/mw-integration-agent/rollback/r053-20261013T164158301626Z` (inherited folder prefix; unique R057 pointer). Native two-scope and unused-UUID receipt status checks passed before the six original timers resumed. Catalogue27, all existing activation flags and cutoffs were preserved; only `code_version` changed during deployment. Two active AppSheet key files were removed after smoke and equality checks against private recovery, at2026-10-13T16:42:41.705571Z. Final config check and both native scopes passed; six timers active. No Secret Manager AppSheet-named containers exist in the one-page metadata inventory; no payload reads or cloud deletion.

Automatic approval review rejected the exact temporary SSH metadata-row/local-key cleanup command before execution, returning only `blocked by policy`. No workaround was attempted. Metadata expires2026-10-13T17:31:44Z; task key and diagnostics remain at `C:/Users/ideaadmin/Documents/ChatGPT/MW-Credit-App/ssh-r057-retirement`, review20October2026. Other metadata keys and stable host trust remain unchanged. This is a cleanup limitation, not a failed runtime deployment.
