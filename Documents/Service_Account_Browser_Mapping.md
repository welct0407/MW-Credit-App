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

Account assignments are **awaiting owner input**. These service/scope names are a starter inventory from [Environment Inventory](Environment_Inventory.md), [Solution Design](Solution_Design.md), [Resource Monitoring](Resource_Monitoring.md) and this repository's Git remote. They are not a fresh service/login audit. Split a row when different environments, tenants or roles use different accounts. An explicit account provided for one task can be used immediately; record a reusable assignment only when confirmed for that service/scope.

| Service | Scope | Account | Browser |
| --- | --- | --- | --- |
| AppSheet | PROD OLTP / Loan Manager | Pending | Pending |
| AppSheet | PROD OLAP / Loan Business Insights | Pending | Pending |
| AppSheet | DEV OLTP | Pending | Pending |
| AppSheet | DEV OLAP | Pending | Pending |
| Google Cloud Console | Cloud SQL, project access and billing | Pending | Pending |
| Google Drive / Docs / Sheets | Project files and templates | Pending | Pending |
| Metabase | Loan reports / reports.mw-credit.com | Pending | Pending |
| Railway | Metabase hosting and billing | Pending | Pending |
| Cloudflare | DNS, domains and tunnels | Pending | Pending |
| Grafana Cloud | Resource dashboards / monitor.mw-credit.com | Pending | Pending |
| GitHub | AppSheet-Loan-Project repository | Pending | Pending |
| Microsoft Azure | VM administration and billing | Pending | Pending |
| Tailscale | Private network administration | Pending | Pending |
| Outlook | Existing fallback email service | Pending | Pending |
| Google Sites | Existing privacy/public site | Pending | Pending |
| Looker Studio | Existing / legacy reports | Pending | Pending |
| ChatGPT / Codex web | Account and subscription UI | Pending | Pending |

## Owner input and maintenance

Fill the yellow **Account** cells in [the temporary review workbook](../outputs/service-account-review-20260924/Service_Account_Review.xlsx); the Browser column derives the route. Add/remove services, split roles/accounts and add useful notes as needed. Enter the actual login identifier, not “work”, “personal” or a password. Additional blank rows are provided.

After the owner returns the completed workbook, reconcile its filled rows into this Markdown register and derive Browser using the routing table. Leave unanswered rows Pending; do not infer assignments from the provider or domain. This document is the execution reference; the workbook is temporary collection evidence, not a second maintained master. Ordinary releases do not re-audit this register; update only changed accounts/services or a concrete routing problem.
