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
