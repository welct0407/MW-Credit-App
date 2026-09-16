# Production promotion reconciliation governance — 16 September 2026

Status: documentation implemented; no product release or production deployment performed.

## Scope and purpose

The owner reported that the Referrer field present in DEV Borrower views was missing in production after the release recorded under R001. Existing DEV records explicitly include view column-order changes; the production release record does not document verification of those Borrower screens. The exact live configuration cause has not been independently confirmed in this task.

Updated `AGENTS.md` Section 6 and added Section 6.1 to require an item-by-item promotion checklist, accepted DEV and intended/observed production values, saved versions and evidence. The checklist covers SQL and AppSheet configuration, including slice membership, explicit form/detail column orders and actual navigation paths. Saved-definition comparison and current production GUI checks are mandatory; successful SQL/dashboard checks cannot substitute for field-level workflow verification. Missing or unverified required items block a complete/Released claim unless the owner explicitly accepts a documented exclusion or limitation. Intentional environment differences and existing approval, backup, notification and production-write boundaries remain in force.

## Rollback and affected files

- Pre-change repository rollback point: `1c47f022e2192484fe2e21660b07a2d1b6fae4ba`.
- Files: `AGENTS.md` and this change log only. The existing uncommitted R002 change-log work is outside this task.
- No AppSheet, SQL, data-model or Looker objects changed; app/report backups and data-dictionary edits are not applicable. No new product release number was allocated for this governance-only update.
- Rollback: reverse only this task's AGENTS.md additions with a new commit and record the reversal here; preserve later governance and unrelated changes.

## Checks and limitations

Reviewed the diff for consistency with the current-GUI requirement, AppSheet-first consumer checks, owner acceptance, production authorization and environment isolation rules. `git diff --check` passed. No runtime test is applicable to this documentation-only change. The next promotion must exercise the checklist and record per-item production evidence; this update does not repair or verify the reported production Referrer omission. Repository publication follows the standing commit/push rule; the completion response records the resulting commit and push outcome.
