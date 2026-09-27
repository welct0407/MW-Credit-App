# Loan ecosystem — 27 September 2026

Current editable artifact: [Loan_Business_Ecosystem.drawio](../../Documents/Loan_Business_Ecosystem.drawio). Native draw.io exports: [PNG](ecosystem.png) and [SVG](ecosystem.svg). Both are a single page; shapes/text/connectors and embedded product marks remain editable in the source.

## Evidence basis

- [Solution Design](../../Documents/Solution_Design.md): AppSheet ownership, governed SQL reporting, current Metabase architecture, receipt workflows and Looker retirement.
- [Environment Inventory](../../Documents/Environment_Inventory.md): shared instance / separate DEV, PROD and internal agent databases; Railway hosting, Auth Proxy, GCS, custom charts and recovery scopes.
- [Resource Monitoring](../../Documents/Resource_Monitoring.md): Grafana Cloud, provider metrics, availability, receipt/backup monitoring and owner mobile push through IRM.
- `C:/GitHub/MW-Integration-Agent/README.md`, `SERVICE_CATALOGUE.md`, `docs/RECEIPT_EVIDENCE.md` and `docs/VM_CONNECTIVITY_ARCHITECTURE.md`: active Debian services, API/SQL boundaries, central state, receipt processing, GCS archiving, network and snapshots. Older Windows project activation statements are superseded by this runtime's documented cutover.
- Owner confirmations in this conversation: published Google Sites privacy page, historical-only location import, private Tailscale/RDP, Outlook fallback and Azure VM recovery. MW AI Collection remains excluded as requested.

The architecture is synthesized from the current owning records; no live health, message delivery, financial write or infrastructure change was performed. The current source records resolve the retired Windows/Looker paths without inventing new active components. Archived companions and September 16 renders were preserved.

## Assets and reproduction

Run `node scripts/build-loan-ecosystem.cjs`, then export page 1 with installed draw.io in PNG and SVG formats. New marks: Metabase, Railway, Grafana, Debian and Google Cloud Storage. Source attribution is in `../loan-ecosystem-20260916/logos/SOURCES.json`; original app logos are in `resources/`. All displayed marks are embedded; viewing requires no external image fetch. Product marks do not imply endorsement; MW Integration Agent uses a text badge.

Rollback and verification are in the [task change log](../../Change%20Logs/CHANGE_NOTES_LOAN_ECOSYSTEM_DIAGRAM_2026-09-16.md#latest-architecture-refresh--27-september-2026).
