# PWA and native API contracts

Source reconciled at MW-Credit-App commit `808cdf53225ce627ea41ef4d3666bf97a3c9cbfe` (see exact source URLs in each object for the authoritative pin). Current deployments are recorded in [environment inventory](../../../Environment_Inventory.md).

R058 Borrower Upcoming Charges is documented separately in the Application and Human API content at immutable source `68e8a39e63e44123dcbab3f819c72d711e2a3240`. The frontend refresh-button followup is pinned at `95fab655431a4459e22ec1dbdd1541d035333d78` in Application content; the reader remains at `68e8a39`. Both are deployed to DEV; PROD promotion remains pending. Interactive middle-content Back navigation supersedes the initial swipe and is pinned separately at `5d046627481ff151f299bad30b784ca418f4b58c` in Application content and deployed to DEV. Deployment pins are in the environment inventory; other definitions retain their recorded source pins.

- [Application](application.yaml): environment bindings, pages, authentication and ownership.
- [Human API](human-api.yaml): key route families and exact owning validation contracts.
- [Agent API](agent-api.yaml): authenticated machine operations and receipt command identity.
- [Receipts](receipts.yaml): private storage evidence/path rules and retained compatibility.
- [Notifications and jobs](notifications-jobs.yaml): tables, routes, post-commit dispatch and schedule definitions.

These use the format-1 envelope. Contract references point to immutable application source; they do not duplicate entire handlers or claim a complete OpenAPI specification. Current SQL column/routine definitions remain in the PostgreSQL namespace.
