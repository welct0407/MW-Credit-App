# R014 — Cash visibility and partial settlements

Date: 21 September 2026. Status: reserved; investigation and DEV implementation in progress. Production promotion is not authorized.

## Scope and owner decisions

- OLAP Cash Position / manual Cash Ledger form: remove inline creation of bank/cash accounts from the account selector.
- OLTP Business Cash Held: account balances grouped by account owner, with summed owner balances.
- Dashboard Income MTD: retain operating income, negative expenses, net profit, negative current-month profit withdrawals to Tommy and Lisa personal accounts, current-month unsettled profit, remaining cash pool and total business cash held. Use concise English/Thai display names and requested green/red formatting.
- Owner confirmed monthly unsettled profit means current-month net profit less completed withdrawals allocated to that month.
- Owner confirmed partial settlement accepts a positive amount up to Available to settle, leaving the remainder for later.

## Rollback and starting evidence

- Starting Git commit: `343800da2e9bddc7a8890ff808dfecdb95f7de70`; working tree clean before this task.
- DEV OLAP editor verified app ID `9f3422be-bc87-4a5a-a42a-67528ee80393`, saved version `1.000021`, Deployed, before edits.
- DEV OLTP version and affected source identity verification pending before mutation.
- Database baseline recorded V30; no SQL mutation performed.

## Checks and remaining work

Read current tracker, environment inventory, solution design, model overview and relevant SQL definitions. Confirmed R014 was unreserved and reserved it for this coherent batch. No live configuration has yet been changed. Implementation, current-GUI testing, final both-app editor diagnostics, dictionary/current-state documentation and owner acceptance remain pending.
