# Borrower reporting POC — implementation checkpoint

Prepared 22 September 2026. **No live dashboard/source connection yet. Google sign-in and named user setup partially completed. Owner approved Cloud SQL Auth Proxy and friendly DNS; implementation resumed. Railway Hobby planned.** Current state and rollback are in the [change log](../../Change%20Logs/CHANGE_NOTES_METABASE_POC_2026-09-22.md); the setup requirements below describe the remaining full implementation and must not be treated as completed checks.

## Source and metric contract

Use a live, read-only connection to `loan_manager_prod` on Cloud SQL instance `appsheet-pg-prod-20260914`, host `34.21.174.215:5432`. Metabase synchronizes metadata and executes queries; this POC does not need a copied borrower table.

The live catalog confirms five existing reporting views: `olap_borrowers_analytics`, `olap_charges_analytics`, `olap_loans_analytics`, `olap_repayments_analytics`, and `olap_portfolio_summary`. Use the borrower view first. Its grain is one Row ID per borrower; observed 30 rows / 30 distinct IDs. Its total outstanding principal reconciled with the Borrowers table. These are point-in-time observations, not a permanent data baseline.

Default population: `Hidden Flag IS NOT TRUE`, consistently on every question. One hidden borrower was observed. Counts include borrowers without active loans unless the metric explicitly says active. Principal and overdue amounts use existing view columns without reconstructing business rules. The source field `Profit Last 30 Days` is labeled **Interest received, last 30 days** because the view derives it from positive Interest Paid, not net profit after expenses. Registration trend uses Creation Date, fills empty months, and is not a history of portfolio balances. Live view calculations use Bangkok reporting dates; no snapshot-refresh timestamp is invented.

[questions.json](questions.json) contains seven prepared SQL questions spanning KPI cards, donut/pie, bar, line, and table. Pending final visualization settings: donut style; THB currency with zero decimals; three KPI cards across desktop; remaining charts in two columns; narrow borrower table; responsive single-column phone review. Table includes names only inside authenticated Metabase, never in Git evidence. Personal contacts, addresses, Instagram identifiers and notes are excluded from question results.

## Connection and access

- Railway Metabase URL: <https://metabase-production-ca3f.up.railway.app>.
- Prepared Loan Reports collection: `5`; empty at inspection.
- Metabase v0.63.18.1 is Active. Existing administrator: `welct0407@gmail.com`.
- No reporting/Metabase/Looker-named PostgreSQL role was found. Provision a dedicated SELECT-only role with access limited to the required reporting source; never save the postgres administrative password in Metabase. Disable uploads, model persistence and actions on the source. Verify denied writes and lack of base-table privileges before accepting the connection.
- The borrower view contains sensitive fields outside the POC projection. Decide and verify database-enforced projection or column grants before exposing ad-hoc access; hiding Metabase fields alone is not a database permission boundary. All seven prepared SQL statements passed read-only validation (only row counts emitted), including 29 visible borrower detail rows.
- Preserve the existing Cloud SQL IP allowlist. Owner approved Railway-local Auth Proxy with outbound 443/3307 and dedicated IAM/database identities, then friendly DNS. No fixed egress IP is needed. See [approved connection plan](connection-plan.md). Unused SSH/Tailscale preparation was removed at owner request.
- Configure and privately preserve `MB_ENCRYPTION_SECRET_KEY` before saving source credentials. Obtain an application-database rollback backup before changing existing platform settings. Existing setup evidence says neither is in place; this checkpoint did not change them.
- Google authentication now reports Active with the dedicated web OAuth client and exact Metabase HTTPS origin. Owner completed the GCP identity check and policy agreement. Google audience remains External/Testing with three named identities (two partners plus existing administrator); signup Domain remains empty. Actual Google login is unverified: only the correct account chooser was reached before owner pause.
- Tommy (`welct0407@mw-credit.com`) and Lisa (`pinpidamimi@gmail.com`) are ordinary users, matching PROD Partners.Login Email. Group `5`, Loan Report Partners, has exactly those two verified members. Saved and read back: All Users has No access to Our analytics/subcollections; Loan Report Partners has View on Loan Reports; administrator retains Curate. Configure source data permissions when the connection is added. No invitations/messages sent.
- Public sharing was disabled and read back; guest embedding was already disabled. Verify permission behavior with partner/non-member sessions; configuration alone is not a login test.
- [Deployment source](../../scripts/metabase/README.md) colocates pinned proxy v2.25.4 and existing Metabase v0.63.18.1, binds source/health listeners to loopback, and supervises both processes. Not built/deployed yet; no Docker/Bash runtime is available locally. Google Cloud SDK business-account passkey, Railway CLI scope consent and Cloudflare sign-in are pending owner browser actions.

## Remaining execution and acceptance

1. Implement the approved Auth Proxy design and verify target/network availability.
2. Establish Metabase application-database rollback and credential-encryption recovery; configure the dedicated reporting role/source with the chosen network path.
3. Reuse the saved Google OAuth configuration, memberships and collection permissions; verify login and effective source access.
4. Save the seven questions in a private POC collection/dashboard, then compare query totals with the same PROD SQL/population.
5. Verify desktop rendering and a 390px browser viewport; reset viewport afterwards. Actual phone Google login/interaction and both partners' identity checks remain owner tests unless those devices/sessions are available.
6. Publish sanitized IDs, links, permission evidence and rollback instructions; do not label the POC complete until the connection, report and access tests pass.

Existing Looker report is unchanged. Full seven-page migration follows POC acceptance; its established page order remains the reference.

References: [Metabase Google sign-in](https://www.metabase.com/docs/latest/people-and-groups/google-sign-in), [database credential encryption](https://www.metabase.com/docs/latest/databases/encrypting-details-at-rest), [database privileges](https://www.metabase.com/docs/latest/databases/users-roles-privileges), [Railway static outbound IPs](https://docs.railway.com/networking/static-outbound-ips).
