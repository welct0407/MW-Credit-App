# R002 frozen promotion package and object checklist

Package revision: **R002-P1**. Frozen 16 September 2026. Status before production writes: **Approved**.

Owner acceptance and production authorization: the owner instructed, “update the current release document to match with the requirements in AGENTS.md. then go ahead to promote R002 to prod.” The same instruction records R003 as already released. R002-P1 therefore treats R003 as intervening production state and preserves it.

## Frozen package

| Item | Frozen value |
| --- | --- |
| Scope | V17 new-loan cashpool insert guard; V18 one-row Loan Form Context; OLTP form warning/title; borrower navigation in both apps; approved Collection native Ref correction; Dev owner-only notification policy documentation |
| Accepted DEV definitions | OLTP 1.000108; OLAP 1.000096; SQL V18 |
| Pinned implementation commit | `f3a0d6616fad483f5e05e234b3608873cc427739` |
| Flyway manifest | `release-manifest-f3a0d66.json`; SHA-256 `b207731f69b0eb8697f2a764fa8c2b15b0f2cd00ae6c57654357bc2df53f1ac9` |
| Included pending migrations | V17 `effa7ee2f2a01fa2cb10137d20612fe7f5c6ab7aa9c2a460b627796eb015def4`; V18 `6d0be857917b8a06cf704f30aecf89867a68736aa2d376cb21b434a27b2cbc3d` |
| DEV evidence | `app-configuration.json`, `collection-ref-correction.json`, `refinement-verification.json`, `sql-tests-v18.txt`, and the R002 change log |
| Current production prerequisite | R003 released at OLTP 3.000121 / OLAP 1.100101 / SQL V16 |
| PROD rollback apps | OLTP 3.000121; OLAP 1.100101 |
| PROD database rollback evidence | Fresh private logical dump SHA-256 `315af2048f70cdf26ed37d34a01b383f4da60bdf780e8b992375e4405a5ae7e7`; 15 business tables and normalized V16 schema restored successfully |
| Report impact | No Looker source, field, grain or report change; no report backup required |

Deployment order: verify identities/configuration and V16 drift → migrate V17/V18 from the pinned clean checkout → validate SQL/read-only context → import/configure the production OLTP context view → apply OLTP and OLAP AppSheet items individually → reload saved definitions → inspect both production apps without saving financial rows → reconcile documentation.

No write pause or scheduler pause is required. V17/V18 are transactional DDL, add no backfill, and do not modify existing financial rows. Database and app saves remain separate recovery units. If SQL fails, stop before app changes. If an app save fails, retain the compatible additive V17/V18 schema and stop dependent UI work; use a reviewed forward fix or restore only the affected app version. Restoring the database dump over later production writes requires separate recovery authorization and reconciliation.

## Object checklist

Status values are Pending, Verified, Blocked or Owner-approved exception. Exact long expressions are frozen in `app-configuration.json`; exact Ref correction properties are frozen in `collection-ref-correction.json`.

| ID | Component / environment | Object and property / operation | PROD before | Frozen intended PROD value | DEV evidence | Saved PROD value / verification | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| SQL-01 | PostgreSQL / PROD | V17 functions/triggers on Loans, Repayments and Cash Pool Contributions; add | Absent; V16 | Exact V17 migration; contributed capital less outstanding principal; retained profit excluded | SQL boundary/concurrency suite; manifest | Pending | Pending |
| SQL-02 | PostgreSQL / PROD | `Loan Form Context` view; add | Absent | Exact V18 one-row read-only view | SQL reconciliation tests; manifest | Pending | Pending |
| O-TBL-01 | OLTP / PROD | `Loan Form Context` table import/source/permission | Absent | `database-2`; source `Loan Form Context`; READ_ONLY; no security filter/menu/edit workflow | Dev 1.000108; app configuration | Pending | Pending |
| O-COL-01 | OLTP / PROD | Context schema/key/types | Absent | Row ID Text key; three Price/THB/2 fields; two Percent/2 fields; no Initial/App formulas | Dev 1.000108 | Pending | Pending |
| O-LOAN-01 | OLTP / PROD | Loans.Principal Amount Display name | Static original title | Frozen dynamic original title plus `(฿available)` on new forms | Dev GUI exact/over-limit checks | Pending | Pending |
| O-LOAN-02 | OLTP / PROD | Loans.Principal Amount Valid_If | Positive + daily whole-baht rule | Frozen expression adds new-row context/count/cap guard and preserves prior rules | `app-configuration.json` | Pending | Pending |
| O-LOAN-03 | OLTP / PROD | Loans.Principal Amount invalid error / description | Existing error/description | Frozen bilingual dynamic error; description `""` | `app-configuration.json` | Pending | Pending |
| O-NAV-01 | OLTP / PROD | Loans `View Ref (Ref Borrowers)` prominence/attach | Generated Ref action | Inline on Borrower Name TE; existing target/condition retained | Both-app current-GUI link test | Pending | Pending |
| P-NAV-01 | OLAP / PROD | Loans `View Ref (Ref Borrowers)` prominence/attach | Generated Ref action | Inline on Borrower Name TE; existing target/condition retained | Both-app current-GUI link test | Pending | Pending |
| O-NAV-02 | OLTP / PROD | `Open Borrower from Charge`; add | Absent | Inline Borrower Name TE; frozen target/condition/name; navigation only | Dev current-GUI link test | Pending | Pending |
| P-NAV-02 | OLAP / PROD | `Open Borrower from Charge`; add | Absent | Same OLAP production-local borrower target | Dev current-GUI link test | Pending | Pending |
| O-NAV-03 | OLTP / PROD | `Open Borrower from Repayment`; add | Absent | Inline Borrower Name TE; frozen target/condition/name; navigation only | Dev current-GUI link test | Pending | Pending |
| P-NAV-03 | OLAP / PROD | `Open Borrower from Repayment`; add | Absent | Same OLAP production-local borrower target | Dev current-GUI link test | Pending | Pending |
| O-VIEW-01 | OLTP / PROD | Repayments_Detail explicit order | Borrower TE absent | Append Borrower Name TE; preserve other fields/order | Dev 1.000108 | Pending | Pending |
| P-VIEW-01 | OLAP / PROD | Repayments_Detail explicit order | Borrower TE absent | Append Borrower Name TE; preserve other fields/order | Dev 1.000096 | Pending | Pending |
| P-VIEW-02 | OLAP / PROD | Charges_Detail explicit order | Plain Borrower Name | Borrower Name TE in same position; preserve all other fields/order | Dev 1.000096 | Pending | Pending |
| O-COLL-01 | OLTP / PROD | Borrowers.Borrower Name - Collection VC; remove | Present | Absent after dependency replacement | Dev 1.000108 | Pending | Pending |
| O-COLL-02 | OLTP / PROD | Borrowers.Borrower Reference TE VC; add | Absent | Ref→Borrowers by Row ID; `[Row ID]`; display `Borrower Name TE`; detail-only Show_If; read-only; not key/label/IsPartOf | Owner-approved correction; Dev GUI | Pending | Pending |
| O-COLL-03 | OLTP / PROD | Todays Collection Board slice membership | Duplicate collection VC | Borrower Name TE and Borrower Reference TE; preserve filter, permission and actions | Saved Dev definition | Pending | Pending |
| O-COLL-04 | OLTP / PROD | Visible Borrowers slice membership | Duplicate collection VC | Remove duplicate; retain Borrower Name TE; include hidden Ref as regenerated | Saved Dev definition | Pending | Pending |
| O-COLL-05 | OLTP / PROD | Collection view header/navigation/actions | Duplicate header; automatic row navigation | Borrower Name TE header; `**auto**` row selection; Receive All Charges only | Final Dev correction + GUI | Pending | Pending |
| O-COLL-06 | OLTP / PROD | Todays Collection Board_Detail explicit order | Duplicate text name | Status, Borrower Reference TE, due, collected, remaining, charges | `collection-ref-correction.json` | Pending | Pending |
| O-COLL-07 | OLTP / PROD | Four Collection borrower status rules | Target duplicate/text field | Target Borrower Name TE and Borrower Reference TE; preserve conditions/scopes/styles/colors | Red/purple GUI; green/orange saved definition | Pending | Pending |
| O-COLL-08 | OLTP / PROD | Outstanding-loan pink rule scope | Applies generally | Exclude Collection and Todays Collection Board_Detail; retain all other styling | Dev GUI outside Collection | Pending | Pending |
| O-COLL-09 | OLTP / PROD | Generated native Ref action | Absent | AppSheet-generated View Ref for Borrower Reference TE; no custom Open Borrower action/button | Owner-approved Dev correction | Pending | Pending |
| ENV-01 | Both apps / PROD | App IDs, database source and cross-app links | R003 production identities; database-2 | Preserve PROD IDs, database-2, access rules, production recipients and PROD↔PROD links | Environment inventory | Pending | Pending |
| AUTO-01 | Both apps / PROD | Bots/tasks/schedules/destinations | R003 production state | Preserve unchanged; R002 notification policy is Dev-only documentation | Saved-definition comparison | Pending | Pending |
| DOC-01 | Repository | Dev notification governance | Prior policy | Reviewed Dev notifications may target only the owner; production behavior unchanged | AGENTS/development-preparation change | Pending | Pending |

## Production verification limits

Production validation may inspect new forms and navigation without saving. No production loan, repayment, charge, payment, bot run or forced notification is authorized by this release. The V17 trigger is verified in production through migration history, object inspection and read-only context reconciliation; write rejection remains supported by the accepted DEV tests. Mobile/offline behavior and green/orange Collection rows require naturally available production states or later owner observation and must not be manufactured with financial fixtures.
