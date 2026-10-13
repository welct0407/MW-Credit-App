# Open development changes

The sole Open product release is **R058**. Its current scope is Upcoming Charges on the selected Borrower detail, using the existing Collection forecast presentation and calculations. Implementation and focused verification are complete in [app PR #6](https://github.com/welct0407/MW-Credit-App/pull/6); PR review/promotion remains pending. No deployment or release freeze has started.

| Outstanding work | Owning reference |
| --- | --- |
| Borrower Upcoming Charges | R058; [app PR #6](https://github.com/welct0407/MW-Credit-App/pull/6) and coordinated documentation PR review before promotion |
| Carried operational credential migration | R055 remains Frozen; paused work is unfinished |
| Apple push enrollment follow-up | R056 V91 deployed; Lisa retry/closure remains pending |
| Owner license action | AppSheet technical retirement complete; license revocation unconfirmed |

Use the [release tracker](Release_Tracker.md), including the carried R016 administrative follow-up. Current runtime versions belong in [environment inventory](Environment_Inventory.md). Update this page for actual outstanding work, not completed-release history.

## R058 Borrower Upcoming Charges batch

Source pin: MW-Credit-App `68e8a39e63e44123dcbab3f819c72d711e2a3240`. Selected visible borrowers, including those with only future charges, can view the shared Upcoming Charges summary/date detail/paging in both full borrower detail and the read-only fallback. Borrower-scoped API reads preserve existing forecast calculations, freshness and authorization; Collection membership remains unchanged. Controls do not submit borrower edits. No database schema, forecast views/calculations, grants, infrastructure or financial data changed.

Verification: synthetic and live-mode builds, final TypeScript check, upcoming units **6/6**, independent Collection/read-boundary units **33/33**, focused desktop/mobile browser checks **9/9**, and one additional populated 320px mobile capture **1/1**, with no overflow or UX blocker. Browser/API checks use synthetic fixtures and mocks; no live deployment, restricted SQL execution or production financial test is claimed.

Automatic [PR CI run 38452539714](https://github.com/welct0407/MW-Credit-App/actions/runs/38452539714) passed the full unit/build check, live-mode build, dependency audit, Terraform format and DEV/DEV-DNS validation. PR E2E was skipped by workflow selection; the focused local browser evidence above remains the browser proof.

Recovery is Git: app baseline `fce5775`, project baseline `c9af9e7`. Documentation coverage updated the release tracker, this record, user-flow model, app read-service guide, and guarded API/application dictionary definitions with immutable source references; the existing ignored dictionary upload snapshot is refreshed in the isolated checkout. Remaining evolving references are unaffected by this source-only addition. Required workflow checks and PR review remain applicable before merge/promotion.

Cleanup exception: automatic approval rejected removal of four task Vite caches as **blocked by policy**; they were retained without retry or workaround. Under `C:/GitHub/MW-Credit-App/node_modules/.cache/`: `playwright-live-5500-1791918439985`, `playwright-live-5700-1791918366243`, `playwright-live-5700-1791918470571`, and `playwright-live-5701-1791918397155`; total **17,317,412 bytes**, review by **21 October 2026**. Automatic approval also rejected cleanup of `C:/GitHub/MW-Credit-App-r058-borrower-upcoming/test-results` (**115,188 bytes**) and `C:/GitHub/MW-Credit-App-r058-borrower-upcoming/dist` (**3,287,819 bytes**). All retained task outputs total **20,720,419 bytes**, with the same review date. No test helpers remain; 22 historical screenshots were restored, zero output directories deleted, and C: had approximately **59.6 GiB** free after verification.

## Current operation

The owner accepted the core operational/management flows and subsequent UI release. Native PWA/API payment receiving, Debian agent API integration, receipts, notifications, scheduled jobs and monitoring are deployed. Production is https://lm.mw-credit.com and DEV is https://dev-lm.mw-credit.com. Runtime identities and verified versions belong in the [environment inventory](Environment_Inventory.md). AppSheet technical retirement is complete; the owner license action remains separate. Natural business observations and the Lisa push retry retain the limits in their owning release evidence; documentation cleanup does not establish fresh live acceptance.

## Delivery tooling status

Source inspected **14 October 2026**. This policy changes no product workflow or validator; implementation limits remain explicit:

| Tool | Actual constraint |
| --- | --- |
| App `ci.yml` | Main pushes/manual dispatch run broad checks including E2E; PR E2E executes only on the `ci:checkpoint` label event, not later synchronize events with the label still present. Other listed PR steps run even for docs. |
| `database.yml` | Path-filtered, but push and PR events can duplicate checks and database documentation paths also trigger it. |
| `deploy-dev.yml` | Manual main-only original API deployment; repeats checks and does not publish Hosting. It is not the complete PWA release route. |
| Legacy foundation/business/R053 validators | Retain historical full-browser/manual-dispatch receipt requirements; they do not implement general proportional check selection. |

Required checks/guards remain effective. Report a concrete conflict once; update the owning tool through a scoped tested change rather than bypass it or fabricate receipts. Useful future tooling work is affected-input routing, duplicate-run suppression and deployment consuming existing evidence. These tooling gaps do not add another documentation gate.
