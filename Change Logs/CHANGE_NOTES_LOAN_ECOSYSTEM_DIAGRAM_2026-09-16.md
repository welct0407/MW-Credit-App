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

## Single-page visual redesign

- Owner requested one page, more shapes/icons, and a logo for each product/platform. Replaced the three-page diagram in place with a single visual map, grouped around core loan operations, partner assistance, and supporting services.
- Added embedded platform marks, people shapes, a database cylinder, shorter descriptions and colored connectors. MW Partner Operations has a text badge; no official MW logo was invented. Logos have recorded provenance in the generated assets folder.
- Rollback point: pushed first-edition commit `b53b1da5adef6cc2882fe6975b1a5dde5f8c5792`. Earlier three-page previews remain as historical evidence; current previews use the `ecosystem` filename.
- Updated the generator entry point, added the visual generator and logo-fetch script, and revised the companion document. No data model or live-system changes and no downstream operational impact.
- Checks: native draw.io export and visual review, embedded logo display, single-page XML, valid connector references, and staged whitespace/diff review. Owner presentation review remains available; no live app tests required.
- Recovery: revert this redesign commit to restore the three-page edition. Publish only this task's intended files; preserve unrelated work.
