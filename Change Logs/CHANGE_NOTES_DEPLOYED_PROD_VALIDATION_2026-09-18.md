# Already-deployed PROD validation — 18 September 2026

Status: Promotion instructions corrected following the owner's clarification. Documentation only; no live app mode, formula, database or release-status change was performed.

## Scope and result

- [AGENTS.md Section 6.2](../AGENTS.md#62-test-recommend-readiness-and-freeze) and the [release workflow](../Documents/Rules/Release_Workflow.md) no longer require a fresh Deployment Check for already-Deployed PROD apps.
- Preserve PROD Deployed mode. Never switch it to Prototype, repeatedly search for an unavailable Run control or wait for that control to close a release.
- Retain complete independent saved-delta readback, zero current-editor configuration warnings/errors and focused runtime smoke checks. Deployed status is not proof that the delta was applied correctly.
- Mark obsolete deployment-check checklist entries **Not applicable — app already deployed**, not pending, verified or owner-waived. This supersedes the reported R006 blocker; reuse applicable recorded checks to finish normal closure if no other requirement remains. The R006 tracker/log were not independently reassessed or changed by this methodology task.
- DEV apps still remain Prototype and have no deployment-check requirement. Production authorization, rollback and other applicable validation/closure requirements remain unchanged.

## Verification and recovery

Reviewed deployment-check references across current release/preparation/refresh instructions, checked local links and the intended diff. No live tests or model-document/workbook updates apply to this policy-only change. Historical release records retain their dated evidence; the corrected runbook governs subsequent closure.

Starting commit: `7683fd8d2b1ea64e831be7b7f90f8d622bd42c05`. Revert only this documentation commit to recover the prior text; no live rollback is needed. Commit/push follows standing repository authorization.
