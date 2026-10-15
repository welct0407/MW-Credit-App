# PWA and native API contracts

Source reconciled at MW-Credit-App commit `808cdf53225ce627ea41ef4d3666bf97a3c9cbfe` (see exact source URLs in each object for the authoritative pin). Current deployments are recorded in [environment inventory](../../../Environment_Inventory.md).

R059 is Released at exact source `7aecf695789fee3ca3b1fd1f2bece4c4a4bc8ba6`, deployed DEV-first then PROD. Current frontend/API artifacts and recovery are in the environment inventory; unchanged semantic definitions retain their earlier immutable owning source evidence. Full CI passed 403 units and 423 browser cases with 11 existing skips. No signed-in business or physical-device smoke is claimed; the deferred Collection Note concern remains unchanged. Historical DEV work used R058, whose separate integration release remains preserved. ReleasedR061 frontends use `1e0dd73ae856ef55fdcdd6fc1e8097d5d9335817`: DEVHosting248bea737cd1b078 and PRODHostingadaa39161d4af455; command remains releasedR060, SQL/other runtimes unchanged. DirectLoanDelete/sharedfeedback definitions carry their new immutable sources.

- [Application](application.yaml): environment bindings, pages, authentication and ownership.
- [Human API](human-api.yaml): key route families and exact owning validation contracts.
- [Agent API](agent-api.yaml): authenticated machine operations and receipt command identity.
- [Receipts](receipts.yaml): private storage evidence/path rules and retained compatibility.
- [Notifications and jobs](notifications-jobs.yaml): tables, routes, post-commit dispatch and schedule definitions.

These use the format-1 envelope. Contract references point to immutable application source; they do not duplicate entire handlers or claim a complete OpenAPI specification. Current SQL column/routine definitions remain in the PostgreSQL namespace.
