# Open development changes

The sole Open product release is **R058**. Its current product scope is the Debian agent strict Instagram-first delivery correction; source a8cf949 passed Linux Python 3.13 CI (323 passed, 42 optional skips) and production promotion is pending. The separate documentation/process cleanup does not deploy a product release.

| Outstanding work | Owning reference |
| --- | --- |
| R058 strict Instagram-first delivery | [Existing integration notification record](https://github.com/welct0407/MW-Integration-Agent/blob/codex/pwa-documentation-cleanup/Change%20Logs/CHANGE_NOTES_RECEIPT_NOTIFICATION_ISOLATION_2026-10-02.md#r058-strict-instagram-fallback-candidate--14-october-2026); email only after an explicit provider window rejection; production not authorized or changed |
| Carried operational credential migration | R055 remains Frozen; paused work is unfinished |
| Apple push enrollment follow-up | R056 V91 deployed; Lisa retry/closure remains pending |
| Owner license action | AppSheet technical retirement complete; license revocation unconfirmed |

Use the [release tracker](Release_Tracker.md), including the carried R016 administrative follow-up. Current runtime versions belong in [environment inventory](Environment_Inventory.md). Update this page for actual outstanding work, not completed-release history.

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
