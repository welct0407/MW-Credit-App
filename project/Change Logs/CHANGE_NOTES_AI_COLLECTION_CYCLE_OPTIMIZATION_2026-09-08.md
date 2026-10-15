# Hourly cycle optimization

Date: 8 September2026, Asia/Bangkok. Status: implemented; scheduled-run performance measurement and user acceptance pending.

Inspection: operational state is SQLite at mw-ai-collection/state/collection.db,172032 bytes at inspection. JSON stores configuration and browser observation/cycle snapshots. Runners use built-in Node SQLite. Current status commands include completed history; multiple overlapping runbooks and browser navigation add context and work. No evidence establishes SQLite as the runtime bottleneck.

Changes: added read-only src/cycle_brief.mjs and HOURLY_ENTRY.md; linked compact entry from MASTER_CYCLE.md; shortened existing automation prompt to route through conditional instructions. Brief returns bounded pending case/receipt/operation lists with full counts, fee catch-up targets, identity and inbound anchor. Completed history and receipt/bank details are omitted. Live output is INBOX_CHECK_ONLY at01:00 with no pending work. This is not a financial observation or send authorization.

Behavior: check live Instagram continuity every run. During01:00–10:59, if there is no actionable inbound, hold, pending work, missing schema or fee catch-up, skip AppSheet and exit quietly. Otherwise load relevant runbooks and fresh sources. No stale balances used for writes/messages; no skipped catch-up or unresolved operations. Other unchanged waiting cases avoid repeated questions/full traversal. Existing schedule, financial rules and model settings retained.

Checks:28 Node tests passed. New tests cover quiet-only eligibility, daytime source requirement, completed history exclusion, missed midnight catch-up, unresolved cases/receipts/operations/local holds and missing schema. Live preflight ran successfully read-only. Automation update confirmed ACTIVE/hourly at minute00/second00. Prompt character reduction is a context-size measurement only, not a measured token/cost/runtime saving. Actual savings require comparable scheduled runs; no end-to-end timing or account usage reduction is claimed.

Rollback point: prior master runbook and automation copied to ignored local/before-cycle-optimization before edits. Restore prior runbook/prompt to remove shortcut; retain all existing SQLite/JSON evidence. No AppSheet configuration, schema, financial record or dashboard changes; data-model documents unaffected.

Manual verification: next unchanged quiet run should inspect only Instagram and exit without AppSheet. A new receipt/exception must route to full handling; missed midnight penalty must still request fresh source. Compare end-to-end duration and actual run token usage for quiet, reminder and receipt runs separately. Further optimization such as model changes or API integration should be evaluated after those measurements.
