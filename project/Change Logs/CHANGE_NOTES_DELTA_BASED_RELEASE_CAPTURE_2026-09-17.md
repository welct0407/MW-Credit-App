# Delta-based release capture — 17 September 2026

Status: documentation implemented; no live app/database changes or product release performed. Owner requested lower development overhead, replacing whole-app baseline/coverage gates with complete change capture and post-promotion delta validation.

## Change

Updated AGENTS.md Section 6 to make full app exports/comparisons and per-save snapshots optional. Authorized development no longer requires a release-specific exception for export-omitted untouched settings. This applies to current/future releases, including R005, and supersedes the previous whole-app coverage requirement; historical R004/R005 exception records remain historical evidence.

Codex keeps a lightweight record of actual edits, including refinements and generated/dependent changes. At development completion, it consolidates the full release delta into exact saved values and verifies affected dependencies. Unknown historical values may be recorded honestly when the required rollback version exists. Changed values still need final verification before readiness; missing unrelated settings do not stop independent authorized work.

Frozen release packages contain the exact delta and changed-object evidence. Production preflight inspects affected configuration, and post-promotion validation checks every delta item against its frozen target. Full app comparison is reserved for specific uncertainty where useful. Existing rollback/version, isolation, Flyway, zero-warning, approval, testing and model-documentation rules are preserved.

## Checks and limits

Reviewed the rules for the reported R005 blocker, missing untouched export fields, changed settings available only in the editor, unresolved changed values, regeneration side effects, parallel release ownership and later DEV work. Verified the scoped diff and whitespace. Existing content outside the targeted Section 6 capture/freeze/preflight/validation paragraphs is unchanged. No live tests apply to this documentation-only change, and no existing release or app was revalidated.

Files: `AGENTS.md` and this log only. Concurrent R005 implementation files are excluded. No product release number was allocated or release status changed. Future development uses the revised standing rule without another whole-app coverage exception; this does not grant production deployment approval.

## Rollback

Pre-task Git point: `97568142d8365184b33df5b07b10e7f822cda0db`. Reverse only this documentation diff in a new commit, preserving unrelated/later changes, and record the reversal here. No live rollback is applicable. Repository publication follows standing authorization; the completion response records the result.
