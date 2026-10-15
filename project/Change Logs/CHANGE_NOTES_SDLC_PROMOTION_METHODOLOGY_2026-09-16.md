# Development and production promotion methodology — 16 September 2026

Status: documentation implemented and checked; no product release allocated, live configuration changed or production deployment performed. Owner authorization: this task's request to consolidate development/promotion rules around release batches and DEV/PROD automation parity with owner-only DEV notifications.

## Scope and decisions

- Consolidated AGENTS.md development/promotion rules into capture, test/readiness/freeze, approved batch promotion, and production validation/closure. Related work shares a release number and one detailed checklist maintained throughout development.
- Made the frozen package the promotion and validation authority: exact AppSheet properties/definitions and versions, intended PROD substitutions, test evidence, pinned Git commit, Flyway manifest/hashes, dependencies and coordinated recovery. Later DEV work does not alter the candidate. Candidate revisions require affected checks and renewed acceptance/approval for changed scope.
- Preserved item-by-item coverage across both consuming apps, including slice membership, explicit view orders, forms/details and actual navigation. Added overlapping-release/drift handling, migration dependency closure, partial-deployment status and failure recovery. Tests are proportional to changed behavior; production checks use the package and safe current-GUI/read-only checks.
- Replaced conflicting DEV notification exceptions/blanket disabling with released PROD automation/schedule parity, DEV-only destinations and notifications exclusively to `welct0407@mw-credit.com`. Unverified routes remain disabled as unresolved gaps; old disabled-state evidence is not a new baseline. Both directions of OLTP/OLAP links must remain within their environment.
- Kept one record per purpose: tracker for status/links, release log/checklist for exact scope/evidence, and existing model documents for production and labeled DEV differences. No new mandatory tool, duplicate model, report suite or recurring monitor.

## Files and rollback

Changed `AGENTS.md`, `Documents/Development_Environment_Preparation.md`, `Documents/Release_Tracker.md`, the methodology references in `Documents/Development_Changes.md` and `Documents/README.md`, `database/README.md`, and this change log. The preparation guide was consolidated; historical evidence remains in linked reports/change logs and Git history. Existing release entries/statuses and numbering remain unchanged (next R004).

Pre-change repository rollback point: `1e7acaf08d525621f51fe910569f7a77addc6875`. Roll back only this task's documentation diff with a new commit, preserve intervening work, and record the reversal here. No AppSheet/report/database backup is applicable because no live object was edited. No data-model object changed, so the model overview and workbook require no inventory edits.

## Checks and limitations

Reviewed the policy against all ten requested principles and the existing current-GUI, shared-consumer, backup, owner-approval, data-protection and Flyway requirements. Inspected `New-Release.ps1` and `Invoke-Flyway.ps1`: the existing runner pins a clean Git commit and full migration manifest, so the methodology requires freezing before later DEV migrations and includes every pending migration through the candidate target. No runner behavior was changed.

Checked the diff for preservation of unrelated AGENTS.md sections, consistent current-policy references, valid local documentation links and whitespace errors. Repository publication follows the standing commit/push rule; the completion response records the verified publication outcome. No runtime tests apply to this documentation-only task.

The next live preparation must verify automation parity, owner-only recipient paths and DEV companion links; existing recorded disabled notification bots were not enabled by this task. The next promotion must exercise the frozen checklist, verify both production apps and PROD links, account for every migration/item, and record unresolved checks or explicitly approved exceptions. No prior release was retrospectively revalidated. Owner review of the methodology is separate from acceptance of any product release.
