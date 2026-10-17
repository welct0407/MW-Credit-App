# MW Credit

MW Credit is a small loan-management and financial-operations system used by two people, including its owner. It brings daily collection work, borrower and loan management, receipts, cash operations and analytics into a mobile and desktop progressive web app (PWA).

This directory, `project/`, is the former **AppSheet-Loan-Project** repository, now part of the single [MW-Credit-App](../README.md) repository (full history kept). It is the project's coordination and documentation home; application code, shared database migrations and integration services live in the root and in `integration-agent/`.

**Status:** the native PWA is operating in production. This overview summarizes published delivery records, rather than a new live verification. The [release tracker](Documents/Release_Tracker.md) owns current release status, and the [environment inventory](Documents/Environment_Inventory.md) owns verified deployed versions.

- [Production application](https://lm.mw-credit.com)
- [Development application](https://dev-lm.mw-credit.com)
- [Project documentation](Documents/README.md)

## Project background

The project evolved from an AppSheet-based loan-management solution into a native PWA backed by the existing PostgreSQL financial engine. The transition retained financial records, calculation behavior, receipt storage and compatibility identifiers while moving user interaction, API access, notifications and scheduled work to native services.

AppSheet's **technical retirement is complete** under R057. It is no longer an application, API or scheduler dependency. The old project name is historical; that name does not indicate an active AppSheet runtime. Owner-side license revocation remains a separate unconfirmed action. See the [retirement record](outputs/r057-appsheet-retirement/README.md).

Development favors simple, reversible changes and short delivery cycles appropriate to a two-person operation. Existing financial integrity, authorization, audit history and recovery behavior remain central to the design.

## System overview

The PWA supports operational and management workflows for borrowers, loans, payments, collections, partners and cash, with private receipt access and analytical views. English/Thai language preferences and mobile-oriented interaction support everyday use.

Offline support combines prepared, owner-scoped read data with contextual form drafts and durable submitted changes. Unfinished forms still require Save/Confirm. Submitted changes synchronize automatically when connectivity returns, using stable request identities; rejected or conflicting changes remain available for review. Financial validation remains authoritative on the server. Individual actions, such as direct loan deletion, retain their documented online requirements.

| Component | Role |
| --- | --- |
| PWA and native read/command APIs | User workflows, authentication, access checks, validated commands, offline synchronization and private receipt access |
| PostgreSQL on Cloud SQL | Financial records, allocations, cash effects, integrity rules and reusable analytical calculations |
| Private Google Cloud Storage | Receipt originals and manual uploads under controlled access |
| Debian integration agent | Receipt capture/review and messaging through its owned services |
| Notification and scheduled-job workers | Web Push from persisted events, daily charges and periodic analytics |
| Metabase and Grafana | Governed reporting, operational monitoring and alerts |

DEV and PROD use separate business databases and service identities on a shared Cloud SQL instance. Delivery isolation and one scheduler owner per job/environment prevent test activity or duplicate workers from affecting normal operation. The [solution design](Documents/Solution_Design.md) explains component behavior; the [data model](Documents/PWA_Data_Model_Overview.md) and [Data Dictionary](Documents/Data%20Dictionary/README.md) hold the detailed contracts.

## Directory ownership

| Directory | Responsibility |
| --- | --- |
| `project/` — this directory | Project background, business references, dictionary, standing rules, release coordination and evidence |
| [root](../README.md) | PWA, APIs, shared SQL migrations and tests, application infrastructure and delivery tooling |
| [integration-agent/](../integration-agent/README.md) | Debian integration runtime, service catalogue and deployment operations |

AI Collection has its own instructions and service catalogue. Compatibility paths here are not additional runtime owners. Make implementation changes in the owning directory and follow its instructions.

## Development roadmap so far

These are capability milestones, not a duplicate release ledger. Detailed source pins, checks, limitations and recovery evidence remain in the [development record](Documents/Development_Changes.md), [release tracker](Documents/Release_Tracker.md) and their linked records.

| Stage | Outcome | Status |
| --- | --- | --- |
| Financial and reporting foundation | PostgreSQL financial engine, operational records and governed reporting underpin the application | In operation; R016 has an administrative follow-up |
| Native application transition | Core PWA operations/management, API-based payment receiving, private receipts, integration, notifications and scheduled jobs replace AppSheet runtime dependencies | Delivered; individual follow-ups remain below |
| Monitoring and infrastructure ownership | Monitoring and selected infrastructure adoption establish maintained operational ownership | Delivered portions recorded; R055 credential work remains unfinished |
| AppSheet retirement — R057 | Technical AppSheet dependencies retired while preserving shared SQL, storage and compatibility identifiers | Released |
| Integration delivery — R058 | Instagram-first delivery attempts; automatic email fallback only after an explicit provider messaging-window rejection | Released |
| Offline and usability package — R059/R060 | Cumulative PWA improvements, prepared offline datasets and saved-change synchronization; production command recovery completes offline dataset access | Released |
| Submitted-action feedback — R061 | Direct online loan deletion, request recovery and specific failure feedback; submitted changes synchronize without a second approval | Released |
| Editable settings — R062 | Borrower/partner settings, independent delivery email, persistent language and explicitly saved cash defaults; V92 and API/PWA delivery | Released in DEV and PROD |

## Current roadmap and remaining work

The roadmap is driven by owner priorities. The following items are recorded as outstanding; this list does not assign new dates or authorize additional scope.

| Work | Current position |
| --- | --- |
| Integration deployment reliability | Webhook receiver reload and readiness before workers resume; current status is in the [release tracker](Documents/Release_Tracker.md) |
| Collection Note concern | Deferred; a separate owner-directed correction remains pending |
| Operational credential migration | Carried R055 work is paused and unfinished |
| Apple push enrollment | R056 V91 is deployed; the remaining enrollment retry and closure are pending |
| AppSheet license closure | Technical retirement is complete; owner license revocation is unconfirmed |
| Reporting administration | R016 migration-key retirement evidence and final tag remain unresolved; this does not reopen product development |
| Delivery-tooling improvements | Existing records identify affected-input check routing, duplicate-run suppression and reuse of existing deployment evidence as future opportunities, without a committed delivery date |

New scope and changing priorities belong in [Development Changes](Documents/Development_Changes.md) and the sole Open release. Consult those records before starting work; this overview is not a substitute for the current release package or task-specific instructions.

## Working on the project

Start with [AGENTS.md](../AGENTS.md) (hard rules and a table of the page to read for each task), then the affected component and current release record. PWA development automatically follows the [six-agent process](Documents/Rules/PWA_Orchestration.md#six-agent-development-process), covering architecture, implementation, testing, documentation/delivery, UX and infrastructure. Documentation-only tasks use the roles that help.

Documentation has two sets:

- **[Standing rules and procedures](Documents/Rules/README.md):** development, release/recovery, environment preparation and other rules followed until deliberately revised.
- **[Living project references](Documents/README.md):** current design, work, releases, environments, monitoring and the structured Data Dictionary. This root README is the living entry-point overview.

Maintained project tools belong in `scripts/`; sanitized evidence in `outputs/`, kept under the [retention rule](Documents/Rules/Development_Workflow.md#records-change-notes-and-retention).

Every development batch reviews the complete living-document set and updates affected references before completion. Update this README when the project background, capability overview or roadmap materially changes; keep detailed deployment pins and execution evidence in their owning records. See the [documentation maintenance step](Documents/Rules/Development_Workflow.md#required-documentation-maintenance).
