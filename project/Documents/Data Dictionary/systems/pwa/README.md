# PWA and native API contracts

Source reconciled at MW-Credit-App commit `808cdf53225ce627ea41ef4d3666bf97a3c9cbfe` (see exact source URLs in each object for the authoritative pin). Current deployments are recorded in [environment inventory](../../../Environment_Inventory.md).

R059 is Released at exact source `7aecf695789fee3ca3b1fd1f2bece4c4a4bc8ba6`, deployed DEV-first then PROD. Current frontend/API artifacts and recovery are in the environment inventory; unchanged semantic definitions retain their earlier immutable owning source evidence. Full CI passed 403 units and 423 browser cases with 11 existing skips. No signed-in business or physical-device smoke is claimed; the deferred Collection Note concern remains unchanged. Historical DEV work used R058, whose separate integration release remains preserved. Released R061 changed the frontends only; current Hosting versions are in the environment inventory. DirectLoanDelete/sharedfeedback definitions carry their new immutable sources.

- [Application](application.yaml): environment bindings, pages, authentication and ownership.
- [Human API](human-api.yaml): key route families and exact owning validation contracts.
- [Agent API](agent-api.yaml): authenticated machine operations and receipt command identity.
- [Receipts](receipts.yaml): private storage evidence/path rules and retained compatibility.
- [Notifications and jobs](notifications-jobs.yaml): tables, routes, post-commit dispatch and schedule definitions.

These use the format-1 envelope. Contract references point to immutable application source; they do not duplicate entire handlers or claim a complete OpenAPI specification. Current SQL column/routine definitions remain in the PostgreSQL namespace.

## Display conventions

The PWA shows money in one format: whole baht with the sign before the symbol (`-฿1,200`; a value that rounds to zero shows `฿0`). The Cash statement date shows `DD-Mon-YYYY` (`08-Oct-2026`, Thai month names in Thai). The borrower name is captioned "Borrower name (Thai - English)", and either side may be empty. Partner withdrawal labels use the Partner Name of role A and role B from the Partners records, with "Partner A/B" as the fallback. The SQL column names `Tommy Withdrawn MTD` and `Lisa Withdrawn MTD` are preserved compatibility identifiers and are not display labels. These conventions are presentation only; no definition in the YAML records changes.
