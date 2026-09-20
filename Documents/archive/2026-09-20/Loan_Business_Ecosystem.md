# Loan business ecosystem architecture

Completed 16 September 2026 using repository evidence and the owner's service confirmations. Editable diagram: [Loan_Business_Ecosystem.drawio](../../Loan_Business_Ecosystem.drawio).

The current diagram puts the ecosystem on one page: the loan apps and shared database on the left, the partner assistant and its connected services on the right, and access/recovery/development/public-site services below. Native people shapes, a database cylinder, colored flow arrows, and embedded platform marks make it easier to scan. MW AI Collection is excluded at the owner's request. No application, agent, database, notification, or infrastructure setting was changed.

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

Run `node scripts/build-loan-ecosystem.cjs` (the stable entry point for `build-loan-ecosystem-visual.cjs`). Assets are stored under `outputs/loan-ecosystem-20260916/logos`; the optional `fetch-ecosystem-logos.cjs` refreshes the pinned logo sources. The diagram embeds the assets and does not require a network connection to display them.

Export through installed draw.io: `draw.io.exe --export --format png --page-index 1 --output <output.png> <diagram.drawio>`. Repeat for SVG format. Current native exports are `ecosystem.png` and `ecosystem.svg`; the earlier `page-1` through `page-3` exports are retained as historical evidence of the first edition. The single-page diagram was rendered in draw.io and visually checked, including logo display, text, shapes and connectors. XML and edge references were checked.

## Product marks

Product marks identify the associated platform; they do not imply endorsement. Sources are recorded in `outputs/loan-ecosystem-20260916/logos/SOURCES.json`: Google-hosted AppSheet/Sites images, Simple Icons v11 brand vectors, and draw.io's bundled Azure Backup architecture icon. The MW Partner Operations tile uses an explicitly labeled text badge, not an invented official logo. Azure is the worker's host; Instagram, Cloudflare, OpenAI and Outlook are connected external services, not software hosted inside the VM.

## Revision and rollback

The owner requested the single-page visual redesign after reviewing the three-page edition. Restore the diagram, generator and notes from commit `b53b1da5adef6cc2882fe6975b1a5dde5f8c5792`, or revert the visual-redesign commit, to recover that edition. No live-system rollback is needed.

This is documentation only; the data-model overview and dictionary do not require model changes. No live acceptance testing is implied. Final owner review should confirm service inclusion and directional relationships.
