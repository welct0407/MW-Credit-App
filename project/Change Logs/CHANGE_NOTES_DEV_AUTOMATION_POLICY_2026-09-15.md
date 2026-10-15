# Standing development automation policy — 2026-09-15

Owner requested that development bots not essential to the business process, particularly notifications that could confuse users, always remain disabled. The rule must apply to future development app refreshes and preparation, not only current copies.

Implemented in AGENTS.md and Documents/Development_Environment_Preparation.md. Linked the mandatory preparation gate from Development Changes, the documentation index and the Flyway README. New/unreviewed bots default to disabled; every copy/refresh/replacement/restore and bot change requires review of events, processes, embedded tasks and destinations before test writes. Essential internal processing is retained only when its effects are confined to development. Notification tasks cannot ride along inside an otherwise essential process.

The preparation runbook records the previously verified three enabled transactional OLTP bots and seven disabled generation/notification/reporting bots across development OLTP/OLAP. Current configuration already matches this baseline from the preceding live review. This task changes standing instructions and documentation only; it does not change app versions, bots, schema, credentials, database triggers, financial data or production configuration. No new live bot-state audit is claimed here.

Rollback point: repository commit cceff0ee587aa504f4322b17e119b78592432d38. Revert this policy commit or restore only its five policy/runbook files if the owner changes the rule; no live rollback is required. Data-model overview/dictionary are unchanged because this task adds no model change.

Checks: baseline bot names/states reconciled against outputs/documentation-reconciliation-20260915/app-editor-settings.json; local document links and git diff whitespace checks. Owner review: confirm that the rule applies to all future development refreshes and that only essential internal processing may be enabled. No financial or notification test is required for a documentation-only policy change.

Status: standing rule and preparation checklist implemented. Repository commit/push follows standing authorization. This is a mandatory preparation gate, not a background monitor or automatic enforcement integration.
