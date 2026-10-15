# Metabase GitHub integration — 26 September 2026

Owner requested connecting this project repository and explicitly approved Railway App permissions restricted to `welct0407/AppSheet-Loan-Project`; owner completed GitHub identity confirmation. No access to other private repositories was selected.

## Configuration

- Existing Railway Metabase service `2959d509-c829-4420-8650-e72827d88170`, project `c8e57452-36dc-41f1-8d00-856b521a96c7`, production `df3ba125-0d62-446a-b4d8-5196780982c9`.
- GitHub source `welct0407/AppSheet-Loan-Project`, branch `master`; build root `/scripts/metabase`, existing auto-detected Dockerfile.
- Automatic deployment watches `/scripts/metabase/Dockerfile`, `/scripts/metabase/start.sh`, `/scripts/metabase/.dockerignore` only. Runtime pushes to master are production deployment events. Other repository changes do not trigger this service.
- Existing Dockerfile pins Metabase v0.63.18.1 and Cloud SQL Proxy v2.25.4; the image copies only the startup script. No dashboard installer, SQL migration or chart service deployment is executed by this Docker build.
- Wait for CI remains off: existing GitHub Actions checks concern database migrations only. No new runtime CI coverage is claimed.
- Secrets remain outside Git. Direct UI edits remain in the Metabase application database, protected by volume snapshots and PITR; they do not synchronize to GitHub. Sanitized exports, tooling, reviewed runtime changes and documentation are suitable repository activities.

## Recovery and checks

Starting repository commit `10f362de89a59f7b886b9ab26fecf2ff80517cfd`; unrelated untracked work preserved. Prior active CLI deployment `96f63773-c11c-4c7d-b729-9e005899899d` recorded before applying source changes. Existing runtime inputs were unchanged since `cd0283f397a47c922b375e2b903f61a5af8cb73b`. Source rollback can disconnect the repo and restore the known deployment/package deliberately; preserve all runtime variables and the application database.

Reviewed exactly four staged settings: repository, branch, root directory and watch patterns. Initial GitHub deployment requested from `10f362de89a59f7b886b9ab26fecf2ff80517cfd`. Final deployment and health verification recorded below.

Verified completion: GitHub deployment 93a6c7d6-31b4-435d-8fdf-085518ce1e30 became Active / Deployment successful. Public /api/health returned status ok. Reopened Settings verified repository, master, /scripts/metabase, three watch paths and enabled autodeploy (Disable button shown). [Deployment evidence](../outputs/metabase-github-20260926/deployment.png). No dashboard edits, schema changes, runtime secret edits or backup-policy changes. Documentation-only publication does not match the configured watch paths.
