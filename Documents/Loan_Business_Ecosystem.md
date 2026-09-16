# Loan business ecosystem architecture

Completed 16 September 2026 using repository evidence and the owner's service confirmations. Editable diagram: [Loan_Business_Ecosystem.drawio](Loan_Business_Ecosystem.drawio).

The three pages cover the ecosystem, the independent MW Partner Operations agent, and development/access/recovery. MW AI Collection is excluded from active flows at the owner's request. No application, agent, database, notification, or infrastructure setting was changed.

## Evidence used

- `AGENTS.md`, `Documents/AppSheet_Data_Model_Overview.md` and `Documents/Environment_Inventory.md`: current production/development AppSheet and Cloud SQL architecture, PostgreSQL financial processing, AppSheet schedules, and recovery boundaries.
- `C:/GitHub/MW-Partner-Operations/AGENTS.md`, `SERVICE_CATALOGUE.md`, `docs/OPERATIONS.md`, and `docs/CODEX_CONVERSATIONS.md`: partner-only Instagram operations, Cloudflare ingress, Windows worker, durable local journals, Codex conversations, bounded AppSheet tools, Outlook fallback, and optional weather.
- `Change Logs/CHANGE_NOTES_DATA_STUDIO_WORKSPACE_MIGRATION_2026-09-04.md`: Looker uses AppSheet reporting sources through Loan Business Insights.
- `Documents/Daily_Loan_Analysis_Automation.md`: disabled export/analysis pilot and Drive templates.
- `Change Logs/CHANGE_NOTES_BORROWER_LOCATION_DIRECTORY_2026-09-13.md`: Drive location source.
- `Change Logs/CHANGE_NOTES_GITHUB_RESTORATION_2026-09-12.md` and the partner operations runbook: Azure restoration history and recovery scope.
- Read-only host inspection on 16 September: Microsoft Corporation Virtual Machine; Tailscale and WindowsAzureGuestAgent services Running. No endpoint addresses or secrets were captured.

## Owner-confirmed service use

- Azure Windows VM is the permanent partner-agent host. Azure Backup covers the VM, agent journals and credentials.
- Tailscale provides the private network for Remote Desktop to that VM.
- Loan Reports - Mobile is in use and connected through Loan Business Insights / AppSheet.
- Outlook email fallback is in use. Open-Meteo has no enabled commercial-key service and is excluded from active service flows.
- The Drive/Sheets location data was imported into AppSheet; the spreadsheet is not directly connected. It is shown as a historical import source, not a live dependency.
- The Google Sites privacy page is published. No custom-domain mapping is inferred from publication alone.

These owner confirmations establish component inclusion. This documentation task did not perform operational writes, send messages, change backups, or test live delivery. Paused/historical facilities are separated from active flows. The stopped MW AI Collection runtime is not drawn.

## Generation and checks

Run `node scripts/build-loan-ecosystem.cjs`. The diagram uses native editable draw.io shapes and connectors on three pages. The generator also creates provisional SVG layouts. For final previews, export each page using installed draw.io: `draw.io.exe --export --format png --page-index 1 --output <output.png> <diagram.drawio>`; repeat for pages 2 and 3 and SVG format. This installed version numbers export pages from 1. Final SVG/PNG files in `outputs/loan-ecosystem-20260916` are native draw.io exports. All three pages were rendered and visually checked; connectors were adjusted to avoid crossing component text. XML parsing and edge-reference checks passed.

This is documentation only; the data-model overview and dictionary do not require model changes. No live acceptance testing is implied. Final owner review should confirm service inclusion and directional relationships.
