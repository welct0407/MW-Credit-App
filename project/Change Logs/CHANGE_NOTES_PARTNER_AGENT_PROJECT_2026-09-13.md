# New Partner Operations project — 13 September 2026

Owner accepted the OLTP setup and authorized the planned agent implementation. New agent source, project instructions, service catalogue, documentation, tests and synthetic samples now belong to `C:\GitHub\MW-Partner-Operations`, private repository https://github.com/welct0407/MW-Partner-Operations.

The staged proposal under outputs/partner-operations-proposal-20260913 is retained as historical design. The new repository's AGENTS.md and docs/DECISIONS.md carry the latest implementation authorization, reuse of existing Instagram/Outlook accounts, and instruction to use the old collection template for initial samples with the bank-transfer section removed.

No AppSheet definition, schema, slice or production row changed in this task. OLAP continues to own partner management. Existing versions remain OLTP 3.000052 / OLAP 1.100033. The data-model overview/dictionary require no schema update for the separate agent implementation. OLTP/OLAP health remains the primary verification priority; no Looker report was changed.

Checks: current OLTP Collection navigation and sign-in/security-filter/access inspection were read-only. Existing partner email access matched the app owner/user list. Source, Instagram and Outlook identity reads passed. The independent agent passed 46 synthetic tests and a tool-free Codex planner check; sample files contain synthetic data only. Live activation, partner GUI sessions, sample delivery and financial workflow acceptance are pending in the new project. No messages or financial records were created.

Rollback: AppSheet Git baseline `12d18068d045ddde1e4176e70ea6072c01c41c01`; this task adds this documentation pointer only. Revert this file to remove the pointer. Agent code/state recovery follows its own initial implementation change log; do not restore app versions or replay old queues for this documentation change. Scoped commit/push follows the owner rule.
