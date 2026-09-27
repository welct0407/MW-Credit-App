# Service account and browser mapping

This register maps **human sign-in accounts**, not cloud service-account credentials. Account identifiers only; no passwords, tokens or recovery codes. Owner browser rule: 24 September 2026.

## Browser routing

| Task's sign-in account | Browser to use |
| --- | --- |
| welct0407@mw-credit.com | Chrome profile signed in as welct0407@mw-credit.com |
| welct0407@gmail.com | Chrome profile signed in as welct0407@gmail.com |
| Any other known account | Edge, with the intended service account selected |
| Unknown / conflicting account | Ask which account applies before account-dependent browser work |

Use the service/scope row below or the owner's explicit task instruction. Inspect available browser profiles through supported browser tools and verify the actual profile identity plus the website's selected account/tenant. Profile labels, an email recipient or an app display name alone do not establish the service account. Once verified, reuse that route unless the browser/account context changes.

If the required Chrome profile is closed or unavailable to the tool, request: **“Please open Chrome with the profile signed in as <required email> so I can continue <service/task>.”** Wait only on that dependent step and continue independent work. Do not use the other Chrome profile, Edge, an in-app/incognito session, or sign out/change a profile to bypass the requirement. If the needed Edge session is unavailable, ask the owner to open Edge with access to the intended account. No browser needs opening for this documentation update.

Browser routing applies to UI work. It does not require replacing a suitable API/CLI/connector with UI; use its correctly authorized identity. Account/profile mapping grants no additional permission for deployment, messages, data writes or the separately governed AI Collection project.

## Service register

Accounts and authentication notes were supplied by the owner in the completed review workbook and imported on 24 September 2026. Browser routing follows the rule above; Chrome work and Chrome Gmail mean the corresponding signed-in profiles. These are confirmed assignments, not a fresh live sign-in audit.

| Service | Scope | Account | Browser | Authentication notes |
| --- | --- | --- | --- | --- |
| AppSheet | PROD OLTP / Loan Manager | welct0407@mw-credit.com | Chrome work | |
| AppSheet | PROD OLAP / Loan Business Insights | welct0407@mw-credit.com | Chrome work | |
| AppSheet | DEV OLTP | welct0407@mw-credit.com | Chrome work | |
| AppSheet | DEV OLAP | welct0407@mw-credit.com | Chrome work | |
| Google Cloud Console | Cloud SQL, project access and billing | welct0407@mw-credit.com | Chrome work | |
| Google Drive / Docs / Sheets | Project files and templates | welct0407@mw-credit.com | Chrome work | |
| Metabase | Loan reports / reports.mw-credit.com | welct0407@gmail.com | Chrome Gmail | |
| Railway | Metabase hosting and billing | welct0407@gmail.com | Chrome Gmail | Using Github authentication |
| Cloudflare | DNS, domains and tunnels | zhcyidea@gmail.com | Edge | |
| Grafana Cloud | Resource dashboards / monitor.mw-credit.com | welct0407@mw-credit.com | Chrome work | |
| GitHub | AppSheet-Loan-Project repository | welct0407@gmail.com | Chrome Gmail | |
| Microsoft Azure | VM administration and billing | zhcyidea@gmail.com | Edge | |
| Tailscale | Private network administration | zhcyidea@gmail.com | Edge | Gmail authentication |
| Outlook | Existing fallback email service | welctcodex@outlook.com | Edge | |
| Google Sites | Existing privacy/public site | welct0407@mw-credit.com | Chrome work | |
| Looker Studio | Retired; Trash recovery only | welct0407@gmail.com | Chrome Gmail | Nine reports and seven data sources moved to Trash 27 September 2026 |
| ChatGPT / Codex web | Account and subscription UI | zhcyidea@gmail.com | Edge | |

## Maintenance

This Markdown register is the single maintained execution reference; the temporary workbook was retired after verifying all 17 imported rows and their notes. AGENTS.md directs browser work here. Update confirmed account/service changes directly in this table and derive Browser using the routing rule. Split rows when environments, tenants or roles use different accounts. An explicit task account can be used immediately; record a reusable assignment only when confirmed for that service/scope. Unknown assignments require clarification; do not infer them from the provider or domain. Ordinary releases do not re-audit this register.
