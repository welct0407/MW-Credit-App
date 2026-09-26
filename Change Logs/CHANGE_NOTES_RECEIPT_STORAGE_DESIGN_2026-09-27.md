# Receipt storage design — 27 September 2026

## Scope and purpose

Owner requested a design based on a shared ChatGPT conversation for capturing/storing payment receipt pictures processed by the Debian agent, a task-output summary and a detailed Markdown handover. This is documentation-only work; no product release allocated and no runtime, cloud storage, app, schema, financial record or notification changed.

## Changed files

- `outputs/receipt-storage-design-20260927/HANDOVER.md`: source-grounded architecture, original/derivative storage, proposed metadata and Payment fields, authentication, reliable capture/projection, AppSheet viewing/sync, recovery, implementation map and future acceptance tests.
- `Documents/README.md`: navigation entry for the proposed design.
- This change log.

## Findings and decisions

Read the supplied shared conversation through the public Edge page after web retrieval timed out. Verified relevant AppSheet/GCS capabilities against current official documentation. Inspected collection ownership instructions, then followed the current environment reference to the canonical `MW-Integration-Agent` repository at `8efd92561f8b0550fb51e7f2993f73cbe7ee6504`.

Current Debian source normalizes media to PNG and clears transient media at terminal processing. The design captures raw retrieved bytes before normalization/cleanup, stores archive metadata in the existing `mw_agent` database, keeps unlinked originals separate from AppSheet display copies, and projects three read-only fields onto Payments only after verified linkage. Storage/projection retry cannot repeat payment posting. Older summary-only/SQLite documentation is identified as dated, not used to override the current catalogue/source.

No new tables/columns are implemented or approved by this document. Object names, grants, cutoff, capacity and tests are proposals. Native connector identity permissions/path resolution, actual sync behavior and live runtime acceptance remain implementation checks. No historical receipt replay or unsupported recovery is promised.

## Rollback and unrelated work

Starting Git commit: `23c007105714c6c56b8484968019abd17f7e9a03`, branch `master`, upstream `origin/master`. Initial unrelated untracked work was `Change Logs/CHANGE_NOTES_RISKS_REDESIGN_2026-09-24.md`, `outputs/r026-payment-health/` and `outputs/risks-redesign-20260924/`; preserve and exclude it. Rollback is a scoped revert of this documentation commit, preserving later changes. No live backup is required for file-only design work.

## Verification and status

Design complete. Saved handover was reviewed against inspected source anchors; all relative handover links resolve and Markdown code fences balance. Git whitespace checks passed. Publication review is limited to the three intended documentation files. The acceptance matrix is future implementation work, not evidence of executed tests. The final task response records verified commit/push status. Production implementation remains unperformed.
