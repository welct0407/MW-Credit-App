# Metabase on Railway — 22 September 2026

## Scope and authorization

Owner requested a Railway-hosted Metabase platform ready for the future migration of the Looker Studio / Data Studio dashboard. This batch provisions the platform; dashboard migration and connection to loan data remain separate work. No AppSheet, Cloud SQL, Looker report or financial data changes are included.

## Baseline and rollback

- Starting Git commit: `32f427e097820b7d65ef5b27d05f4dbe8a44e118`.
- Existing untracked `database/migrations/V33__agent_transaction_audit.sql` belongs to other work and is excluded.
- Railway project `c8e57452-36dc-41f1-8d00-856b521a96c7` was empty (`acceptable-flexibility`, no services). Renamed to `MW Credit Metabase`.
- No prior Metabase assets exist to restore. Preserve the PostgreSQL volume if redeploying the application. Before later upgrades, back up the application database and any encryption key; restoring only the container cannot undo application-database migrations.

## Provisioned objects

| Object | Identity |
| --- | --- |
| Railway workspace | `welct0407's Projects`, `39dfde08-39a7-4ebf-a9ad-a7701d65fc55` |
| Project | `MW Credit Metabase`, `c8e57452-36dc-41f1-8d00-856b521a96c7` |
| Railway environment | `production`, `df3ba125-0d62-446a-b4d8-5196780982c9` (Railway label; no loan production database connection) |
| Metabase service | `2959d509-c829-4420-8650-e72827d88170` |
| PostgreSQL service | `6ba627ff-bc6d-41e7-8182-6c0f1fb03998` |
| PostgreSQL volume | `a8df590c-a19f-47c8-a9ba-b49876f8fd61`, mounted at `/var/lib/postgresql/data` |
| Application URL | <https://metabase-production-ca3f.up.railway.app> |

Used the [Metabase template](https://railway.com/deploy/metabase), providing the official `metabase/metabase` image and Railway's `ghcr.io/railwayapp-templates/postgres-ssl` image. Pinned Metabase to `metabase/metabase:v0.63.18.1` after successful startup. Docker Hub confirmed that tag, with manifest digest `sha256:0ad51a232989d57795e681f9e1171c92869d6c76004943340d9d9ac1f7644bda`. PostgreSQL database/user names are `metabase`; generated passwords stay in Railway and were not exported or printed. Metabase uses private PostgreSQL host/port references, `MB_DB_TYPE=postgres`, and `MB_SITE_URL=https://${{RAILWAY_PUBLIC_DOMAIN}}`.

Template healthcheck: `/api/health`; restart on failure, maximum 10 retries. Initial region is US West. Trial service memory ceiling is 1 GB. Added `JAVA_TIMEZONE=Asia/Bangkok`, `MB_REPORT_TIMEZONE=Asia/Bangkok`, and initially `JAVA_OPTS=-Xmx640m`. Startup restarted under the memory ceiling; lowering the heap to `JAVA_OPTS=-Xmx384m` allowed initialization to finish. This is a trial bootstrap setting, not a validated live-reporting capacity.

## Checks and status

- Signed-in Railway identity verified as `welct0407@gmail.com`.
- Project remains private; trial shows 30 days or $5 credit. No paid plan purchased.
- PostgreSQL showed Online after template deployment.
- Metabase `v0.63.18.1` (`8c16a71`) connected to PostgreSQL `16.15`. Successful deployment: `6b85e07a-ad0b-4e7c-8431-3e7f7899cc7b`; initialization completed at 13:32:31 Bangkok. Railway showed Active, the HTTPS setup page loaded, and `/api/health` returned `{"status":"ok"}`.
- Owner requested inspection of Railway alerts in `welct0407@gmail.com`. Browser Gmail identity was verified; only the two matching project messages were read. The 13:28 message explicitly reported out-of-memory; the 13:30 build-failure message referred to initial deployment `d0f10d76-8ea5-40aa-8f56-fc08be3bed72`. Railway recorded that deployment's healthcheck failure. The later 384 MB-heap deployment succeeded. No emails were sent.
- Railway's actual Backups screen states creation/PITR require Pro. No managed backup created or paid plan purchased.
- Owner completed the administrator password step for `welct0407@gmail.com`; setup finished as MW Credit, self-service analytics, with usage-event collection and release-marketing emails disabled. Only the bundled Sample Database is connected.
- Created collection `5`, **Loan Reports**, at `/collection/5-loan-reports`, explicitly labeled as pending dashboard migration with no loan data connected.
- Pinned-image redeployment `332c022b-b923-46a1-a2c4-c12de2ac13f5` became Active. The sample **Product breakdown** question rendered four category percentages, reported 26 result rows and a 938 ms query. No sample content was edited.
- Reloaded the Loan Reports collection after that deployment: authenticated access and the saved title/description persisted, providing a bounded application-database persistence check. This is not a backup-restore test.
- Platform bootstrap is complete. Live reporting remains pending the source connection and operational limitations below; no claim of completed dashboard migration or production capacity.

## Constraints and next work

Railway Limited Trial restricts outbound networking and limits memory. It is not yet proven that it can reach the existing Cloud SQL PostgreSQL endpoint. Paid operation, region choice, database backup policy, credential encryption/recovery, and a least-privilege reporting connection must be settled before using this for live reporting. No loan credentials or borrower data were sent to Railway. Startup confirms saved data-source credential encryption is not configured; add and securely preserve `MB_ENCRYPTION_SECRET_KEY` before saving loan-source credentials. No AI provider API key is configured; a suggested-prompts background job logs that absence, which did not prevent initialization/health success. SMTP/password recovery delivery is not configured. PostgreSQL template image remains unpinned; review/pin it together with a verified backup before database maintenance. Trial expiry is not durable recovery coverage.

No product release number was reserved: this is an isolated platform bootstrap, with no promotion of the AppSheet/Cloud SQL/Looker product batch. Changed repository files are this log and the platform section of `Documents/Environment_Inventory.md`; no dictionary/model changes.

References: [Railway trial limits](https://docs.railway.com/pricing/free-trial), [Metabase Docker installation](https://www.metabase.com/docs/latest/installation-and-operation/running-metabase-on-docker), [Metabase environment variables](https://www.metabase.com/docs/latest/configuring-metabase/environment-variables).
