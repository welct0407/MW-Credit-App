# Partner operations agent design proposal — 13 September 2026

- Status: documentation draft complete; owner design review pending. Implementation, new project/repository creation, live testing and deployment have not started.
- Purpose: document a separate partner-facing agent for physical collection, Instagram OLTP commands and an 11:00 Bangkok daily briefing.
- Changed file: outputs/partner-operations-proposal-20260913/AGENTS.md. This nested draft does not replace either existing project's root instructions or service policy.
- References reviewed: current AppSheet AGENTS.md; MW-AI-Collection AGENTS.md, SERVICE_CATALOGUE.md, service-catalogue.json and mw-ai-collection/MESSAGE_FORMAT.md. Live schema/account configuration was not inspected and is explicitly pending verification.
- Rollback point: AppSheet repository HEAD 468830e9523fb77c9fd433bff6bc959b7b7c23e2 before this task. No AppSheet/Looker edits; app version/report backup requirements are not applicable to this documentation-only change.
- Checks: reviewed requirement coverage, separation of approved requirements from proposed defaults, old template adaptation, service boundaries, secret-free/synthetic content and documentation consistency; git diff --check and git diff --cached --check passed; staged diff inspected and limited to the two intended documentation files. No runtime tests or live messages/transactions were performed.
- Manual review: confirm project identity/visibility, partner scope, collection population/grouping, physical-payment terms and fees, Instagram fallback and cutover. Review the proposed borrower template rules before any sendable template is activated.
- Downstream effects: none at runtime. Old collection automation remains unchanged; deliberate cutover is required later. Data-model overview/workbook updates are not applicable because no model changed.
- Git publication: only this proposal and this change log belong to this task; preserve pre-existing OLTP performance work. Commit/push follows the standing owner rule. Actual publication outcome is reported in the task response.
- Rollback: revert the task's documentation commit with a new commit and normal push; preserve unrelated files. No app/runtime restore is required.

## Second design round — 13 September 2026

- Status: revised design complete; implementation and live acceptance not started.
- Owner changes: use existing collection dashboard/backing slice for due-today/overdue population; store Instagram account information in Partner records with no separate list; use existing Partner email for one complete briefing email on Instagram failure; allow supported partner-permitted end-user app GUI workflows while prohibiting app/database administration.
- Files: updated outputs/partner-operations-proposal-20260913/AGENTS.md; added outputs/partner-operations-proposal-20260913/DESIGN_SUMMARY.md; updated this log.
- Rollback point: repository HEAD 3787c48e51f41c6d5b82f65136dee4732be280da before the revision. Revert the revision commit with a new commit and normal push to restore the prior proposal.
- Design details: verified sender binding uses Partner as the sole authority; existing app visibility constrains the executor; dashboard/slice parity and pagination must be checked; partial Instagram failure produces a complete email and stops unsent Instagram parts; uncertain sends and financial writes must not be blindly repeated.
- Checks: requirement/consistency review and git diff --check passed; no secrets or live records included. Summary-to-instructions link and staged diff checked before commit. No runtime tests are applicable to this documentation revision; no live tests were run.
- Manual acceptance still required at implementation: actual source/filter parity, Partner mapping and email routing, app GUI operation permissions, financial readback/duplicates, full email fallback after partial Instagram delivery, and revised borrower wording.
- Downstream effect: planned Partner Instagram information requires live schema inspection, recorded app rollback versions and synchronized model overview/dictionary updates during implementation. No live column was added now, so those documents remain unchanged. Old agent remains unchanged.
- Open items: project setup, actual field/object mapping, deadline/fee/closure wording, missed-run policy, email sender setup and authorized cutover/activation. The owner has selected email fallback and dashboard-based eligibility; these are no longer open design choices.
