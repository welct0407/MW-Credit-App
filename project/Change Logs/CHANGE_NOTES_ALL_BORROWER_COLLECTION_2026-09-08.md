# All-borrower API collection runtime — 2026-09-08

Status: Implemented and activated under the user's explicit instruction to remove the single-borrower restriction everywhere and open the automation to all borrowers. Manual user acceptance pending.

## Scope and behavior

Removed the production default borrower and fixed test recipient. Live AppSheet Borrowers flags and Instagram username mappings determine participation. Direct opening/reminder messages, event replies, receipt capture, AppSheet payment posting, acknowledgments and operator confirmations now operate with an explicit borrower scope. No borrower flag was bulk enabled. Live directory verification found two enabled borrowers and two unique authenticated conversations, including the newly created borrower.

The operator is an independently configured role in ignored local settings. Review requests go to the operator; payment acknowledgments and collection messages go to the borrower. Conflicting usernames, disabled profiles, missing conversations, changed job mappings and unresolved evidence fail closed. All bank/name fields continue to come from live AppSheet profile/default settings.

New routing, portfolio and scoped-config modules replace the legacy single-borrower CLI/batch entry paths. Historical code entry points fail explicitly in portfolio mode rather than silently using a default borrower. Old audit ledgers remain intact. Current runbooks point to collection-agent/PORTFOLIO.md; historical change logs were not rewritten.

## Files and controls changed

- collection-agent/agent: routing.py, portfolio.py and borrower-scoped webhook, store, worker, context, reply, history, media, dispatch, review and CLI integration.
- mw-ai-collection/src: scoped_config.mjs, borrower-scoped API/event/dispatch boundaries, receipt/exception access, reminder state, token confirmation and API mapping validation.
- mw-ai-collection/config.json: all-borrower mode, no default identity, hourly sending enabled, old forwarding batch retired.
- collection-agent/local/config.json: generic runtime mode and independent operator settings; processing, Instagram sends and AppSheet writes enabled. Secret values remain in ignored files.
- SQLite local runtime: scoped job bindings, contact enrollment baselines, queue/recipient indexes; no AppSheet data-model change.
- Existing AI Collection Master Cycle automation updated through Codex automation tool to ACTIVE, hourly at minute 0/second 0, same target task. Its immutable historical ID is retained to avoid creating a duplicate automation; the ID does not control borrower scope.
- Windows worker and receiver tasks restarted with their existing direct Python actions. Startup task definitions were not changed.

## Rollback point

Before implementation: collection-agent/local/before-all-borrowers-20260908 contains agent/src copies, both runtime configs and consistent SQLite backup snapshots. Original operative runbooks and automation TOML were also copied into its runbooks directory before edits. No AppSheet app definitions, production borrower records, loan definitions or dashboards were edited by this migration, so AppSheet/Looker version restoration is not applicable.

To roll back, disable processing and pause the master first; restore code/config and restart the existing worker/receiver tasks. Preserve all post-deployment outbox and financial journal entries. Do not restore old SQLite files over live state after messages/payments have occurred; use the snapshots for controlled reconciliation so completed operations cannot repeat.

## Validation

- 26 Python tests and 53 Node tests passed, including separate sender bursts, independent promises/holds, disabled/duplicate mapping rejection, cross-borrower receipt access and wrong-borrower operation token rejection. Existing fee, duplicate-send, payment readback and lost-response tests still pass.
- All JavaScript modules parsed successfully; Python modules compiled.
- Live API readback verified distinct borrower IDs, matching authenticated IG identities, current receiving setup and balances: the new dummy borrower 200, existing borrower 899. Persisted API inboxes were valid with no pending messages/holds. No new payment was fabricated for validation.
- Restarted receiver returned HTTP 200; worker health is fresh. Background saved-Codex classifier self-test passed in 10.36 seconds with zero sends and zero financial actions.
- Automation configuration readback confirms ACTIVE and exact hourly cadence.
- A manual portfolio cycle is being verified separately below; production messages are confirmed only by exact Instagram API readback.

## Downstream effects and remaining acceptance

New enabled, uniquely mapped profiles are discovered without code changes. Disabled profiles remain excluded. Meta's 24-hour messaging window remains enforced; unavailable mappings are reported rather than guessed. API pagination has no fixed borrower-count ceiling, but serial execution remains subject to provider limits and machine capacity; unlimited throughput was not claimed or load-tested. An uncertain financial dispatch retains a conservative global hold until reconciliation, while ordinary borrower receipts, promises and outbox holds are isolated.

Manual acceptance: ask for balances from two accounts and verify separate responses; disable one profile and verify exclusion; test an ordinary current receipt, a held mismatching receipt requiring operator confirmation, and a promise without changing another borrower's state. Live receipt posting for a second borrower was not performed merely to test the migration.

## Final live cycle result
The production portfolio cycle completed on September 8 at 23:08 Thailand time. Both currently enabled borrowers returned SENT, with exact Instagram API verification to their own recipient IDs. The new borrower message used its own 200 balance. The existing borrower had late penalties enabled, so the cycle caught its cumulative daily penalty up from 100 to 400 (a 300 increment), verified the existing assigned charge Interest Due changed from 400 to 700 with appended audit notes, and sent the updated remaining amount of 1,199. This was one VERIFIED fee dispatch under the existing authorized rule. No payment was fabricated or posted for validation. Worker health is fresh and no inbound queue remains pending. The scheduled master remains ACTIVE for future exact-hour runs.
