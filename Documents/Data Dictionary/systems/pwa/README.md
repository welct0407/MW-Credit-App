# PWA and native API contracts

Source reconciled at MW-Credit-App commit `808cdf53225ce627ea41ef4d3666bf97a3c9cbfe` (see exact source URLs in each object for the authoritative pin). Current deployments are recorded in [environment inventory](../../../Environment_Inventory.md).

- [Application](application.yaml): environment bindings, pages, authentication and ownership.
- [Human API](human-api.yaml): key route families and exact owning validation contracts.
- [Agent API](agent-api.yaml): authenticated machine operations and receipt command identity.
- [Receipts](receipts.yaml): private storage evidence/path rules and retained compatibility.
- [Notifications and jobs](notifications-jobs.yaml): tables, routes, post-commit dispatch and schedule definitions.

These use the format-1 envelope. Contract references point to immutable application source; they do not duplicate entire handlers or claim a complete OpenAPI specification. Current SQL column/routine definitions remain in the PostgreSQL namespace.