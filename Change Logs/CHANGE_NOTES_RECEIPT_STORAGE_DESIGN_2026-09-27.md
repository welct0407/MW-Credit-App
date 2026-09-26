# Receipt storage design — 27 September 2026

## Scope and purpose

Owner requested a design based on a shared ChatGPT conversation for capturing/storing payment receipt pictures processed by the Debian agent, a task-output summary and a detailed Markdown handover. This is documentation-only work; no product release allocated and no runtime, cloud storage, app, schema, financial record or notification changed.

## Changed files

- `outputs/receipt-storage-design-20260927/HANDOVER.md`: source-grounded architecture, original/derivative storage, proposed metadata and Payment fields, authentication, reliable capture/projection, AppSheet viewing/sync, recovery, implementation map and future acceptance tests.
- `Documents/README.md`: navigation entry for the proposed design.
- This change log.

## Findings and decisions

Read the supplied shared conversation through the public Edge page after web retrieval timed out. Verified relevant AppSheet/GCS capabilities against current official documentation. Inspected collection ownership instructions, then followed the current environment reference to the canonical `MW-Integration-Agent` repository at `8efd92561f8b0550fb51e7f2993f73cbe7ee6504`.

Current Debian source normalizes media to PNG and clears transient media at terminal processing. The design captures raw retrieved bytes before normalization/cleanup, stores archive metadata in the existing `mw_agent` database, and projects three read-only fields onto Payments only after verified linkage. The original separate archive/display bucket proposal is superseded by the simplification below. Storage/projection retry cannot repeat payment posting. Older summary-only/SQLite documentation is identified as dated, not used to override the current catalogue/source.

No new tables/columns are implemented or approved by this document. Object names, grants, cutoff, capacity and tests are proposals. Native connector identity permissions/path resolution, actual sync behavior and live runtime acceptance remain implementation checks. No historical receipt replay or unsupported recovery is promised.

## Rollback and unrelated work

Starting Git commit: `23c007105714c6c56b8484968019abd17f7e9a03`, branch `master`, upstream `origin/master`. Initial unrelated untracked work was `Change Logs/CHANGE_NOTES_RISKS_REDESIGN_2026-09-24.md`, `outputs/r026-payment-health/` and `outputs/risks-redesign-20260924/`; preserve and exclude it. Rollback is a scoped revert of this documentation commit, preserving later changes. No live backup is required for file-only design work.

## Verification and status

Design complete. Saved handover was reviewed against inspected source anchors; all relative handover links resolve and Markdown code fences balance. Git whitespace checks passed. Publication review is limited to the three intended documentation files. The acceptance matrix is future implementation work, not evidence of executed tests. The final task response records verified commit/push status. Production implementation remains unperformed.

## GCS preparation and simplification — same date

Owner requested GCS configuration for review before creation, then questioned DEV buckets (there is no DEV Debian/agent) and routine separate display copies. Revised the handover to one private production bucket with direct original-object references, optional conversion only if rendering requires it, and synthetic tests without a permanent DEV storage environment.

Added `outputs/receipt-storage-design-20260927/GCS_REVIEW.md` and its `gcs-review.png` screenshot. Prepared `mw-payment-receipts-prod-508610-n7` in the mapped Chrome/Google Cloud account: Singapore, Standard, uniform IAM, public access prevented, explicit seven-day soft delete, Google-managed encryption, no versioning/retention lock/lifecycle deletion. The project initially listed no buckets and enforced private/uniform access through organization policy. Closed the superseded display draft. **No Create action, resource, IAM/key, upload or runtime change occurred.** Creation remains pending the owner's requested review.

Starting commit for this refinement: `92b9d2b21831cd2fe414a3e2b9ca30e52321f5d1`. Rollback is closing the unsaved form and a scoped documentation revert; no cloud-resource rollback is needed. UI values were read back and screenshot captured. Review links/whitespace and publish only this refinement's files; preserve the same unrelated work. New capability/runtime tests remain future implementation work.

## Approved GCS creation — same date

Owner explicitly authorized creation of the reviewed single bucket. Starting Git commit `3fe66fc1ebd57f4d54a51f8e3f036965d7d95856`; same unrelated untracked work preserved. Created `mw-payment-receipts-prod-508610-n7` in the verified project/account. Console creation timestamp: 27 September 2026, 02:44:17 Asia/Bangkok. Objects page confirmed empty/success; Configuration page verified reviewed settings, including uniform/private access, Singapore Standard, seven-day soft delete, Google-managed encryption, versioning off and no retention/lifecycle rules.

Updated review, handover status, environment inventory and documentation map; saved `gcs-created.png`. No application grants/keys, upload, agent deployment, SQL/AppSheet configuration, payment or notification change. This is the scoped infrastructure setup step, not a completed receipt feature or release promotion.

Rollback point: no prior bucket or data existed (recorded empty project list and approved draft). To abandon, leave the empty bucket unused; any later deletion requires a fresh content/dependency check and applicable owner authorization. Do not delete after ingestion without preserving evidence. No database/app backup is required for this isolated empty-bucket creation. Relevant verification is saved cloud configuration readback, not financial testing. Agent/AppSheet integration and synthetic upload/access tests remain pending. Repository publication records the configuration; it does not back up receipt objects.

## AppSheet connectivity checkpoint — same date

Owner requested connectivity for DEV and PROD. Starting commit `689aebec37af052e35c6a1ba69cc88de1bf75481`; unrelated files preserved. Verified the correct AppSheet account has Enterprise Plus, no existing object stores, and a GCS form requiring a private-key JSON. Verified the matching gcloud account and both effective key-creation restrictions: `iam.disableServiceAccountKeyCreation` and `iam.managed.disableServiceAccountKeyCreation` enforce true, with no project-local override. No dedicated receipt connector identity exists.

Prepared `APPSHEET_CONNECTION.md` with proposed PROD/DEV connection identities, the same single bucket, read-only access and synthetic-only DEV scope, exact policy blocker, scoped temporary service-account exemption decision, remaining app binding/tests and rollback. Saved the unsubmitted connector screenshot and linked the checkpoint from the handover/review. No cloud policy/IAM/key mutation, saved connector/app change or business-data write occurred. A security-policy exception requires explicit owner authorization; connectivity remains incomplete. App backups, dictionary edits and R046 implementation records become applicable when actual app configuration changes begin. Checks: UI account/form readback, read-only gcloud policy/identity checks, documentation links and whitespace. Close the form to discard its draft; revert only these documentation changes if needed.
