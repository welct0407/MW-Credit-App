# R016 — Loan Reports migration to Metabase

22 September 2026. Owner accepted the borrower POC on PC and mobile and requested migration of all existing Data Studio visuals, starting with pages 1–2 for review. Use PostgreSQL relationships/joins and governed OLAP metrics rather than recreating Data Studio blends. Keep later pages out of the initial implementation.

Starting commit: `cd0283f397a47c922b375e2b903f61a5af8cb73b`; working tree was clean. Source: Workspace-owned report `52954065-a261-4b97-8d19-df84126bbdc6`, copied from personal report `c62727aa-a0fc-4c2a-9295-b46ebe1f82fc`. Source report is inspected only, with no edits. Live source has eight pages; this batch covers Overview (17 visuals) and Cash (9 visuals). Existing POC dashboard remains available.

Owner approved a new temporary administrator migration key and explicitly requested retaining it until development of all pages is complete. It is stored only in the private project recovery folder, not Git, and must be revoked at full migration closure. This supersedes the initial proposed per-batch revocation.

Status: inventory and implementation in progress. Rollback evidence, exact metric contracts, database grants, dashboard IDs, validation and remaining review items will be added to this log/linked evidence before publication. No new loan table/column or financial write is proposed.
