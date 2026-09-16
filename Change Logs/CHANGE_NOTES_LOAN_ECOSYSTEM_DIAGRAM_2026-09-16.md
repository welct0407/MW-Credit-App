# Loan ecosystem architecture diagram — 16 September 2026

- Scope: requested editable draw.io architecture in Documents, excluding MW AI Collection and including MW Partner Operations and used external services.
- Status: diagram complete with owner-confirmed external component use; final visual review remains available to owner.
- Rollback point: repository HEAD at initial inspection `8b35cd18ff7adfb2e5c10b20b4b587f100c3522d`. All task files are new; unrelated existing work was preserved.
- Files: `Documents/Loan_Business_Ecosystem.drawio`, companion `.md`, `scripts/build-loan-ecosystem.cjs`, and `outputs/loan-ecosystem-20260916/` previews.
- Checks: three-page XML parses, all connector endpoints resolve, native draw.io PNG/SVG exports rendered and visually checked. Initial export used page 0; installed draw.io requires 1-based page indices, and corrected exports succeeded. Connector routes corrected after visual inspection.
- No AppSheet, SQL, report, runtime or infrastructure change; app/report backup versions do not apply to this new local documentation. No model changes require dictionary updates.
- Owner confirmed permanent Azure host and Azure Backup scope, Tailscale/RDP, active Looker/AppSheet connection, Outlook fallback and published Google Sites. Drive spreadsheet was an import source only; no commercial weather key is enabled. Diagram incorporates these answers without unresolved component labels.
- Manual review: review the three diagram pages for preferred presentation. No financial or notification test is needed.
- Rollback: remove only these new task files or revert the eventual task commit; no operational rollback is required.
- Git: publish only this task's diagram, companion notes, generator, exports and change log; preserve unrelated business-expense work. Repository publication does not deploy any service.
