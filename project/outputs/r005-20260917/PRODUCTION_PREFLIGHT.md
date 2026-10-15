# R005 P1 production preflight — 18 September 2026

Owner accepted the DEV result and authorized promotion: “everything looks fine. go ahead to promote into prod”. **Released: SQL V21 / OLTP 3.000172 / OLAP 1.100122.** See [final production verification](PRODUCTION_REPORT.md). Owner explicitly instructed bypassing deployment advisories under the updated methodology and keeping DEV apps Prototype. No further advisory checks will be run.

## Frozen candidate and recovery

- Implementation checkout: `2054384831a58a89842a42a123381fb1dc032141`, including accepted DEV evidence from `4ba73e8`. [SQL manifest](production-candidate-manifest.json) created from the clean checkout while DEV is V21. A clean detached checkout exists at `C:/GitHub/AppSheet-R005-Promotion` for the protected production runner.
- [Consolidated exact targets](production-package.json): 2,408 original/reversal properties plus 20 additive dashboard items. Excludes 4,600 DEV-only notification-generated or version/count metadata entries. These are property-level serialization counts, not independent manual edits. Original evidence/IDs retained.
- DEV tested business definitions: OLTP 1.000125, OLAP 1.000123, SQL V21. Diagnostic-only prototype/deployed transitions are recorded separately; no formula, navigation, branding, cache, recipient or table setting changed.
- Fresh PROD appdoc readback: OLTP **3.000156**, OLAP **1.100106**, database-2. Both normal editor diagnostics show No issues found. Private saved rollback definitions reside under the established external R005 folder, `prod-oltp-before-appdoc.json` and `prod-olap-before-appdoc.json`.
- PROD host **34.21.174.215**, instance **appsheet-pg-prod-20260914**, database `loan_manager_prod`. Fresh normalized public/assessment schema SHA-256 **4A4BE3E9B4469F53CFB3F90074CD382B5D439047DF3119CCF88B3B94F0777D20**, exactly matching the reviewed V19 baseline.
- [Fresh backup](production-backup.json), SHA-256 **B989EC1248F14C508197909BAFD4E7D5C3DFD8CE251A230C79438479A6918135**; [successful isolated restore](production-restore-test.json), public/assessment_lab plus Flyway history, normalized schema identical. Cloud SQL cron/instance settings are outside the logical restore rehearsal. Never restore this data over later production writes without explicit recovery authorization.
- [Flyway before](production-flyway-before.json): only V20 and V21 pending. Pre-migration `validate` reports those two unresolved pending migrations, not an applied checksum mismatch; no validation override was used. Post-migration validate passed; see production-validate.json.
- Existing Reporting Loans slice has the same prior members but Charge Generation Request / Related Payments order differs from DEV. The exact accepted target retains both members and adds Related Cash Ledgers; no field is dropped. All other existing changed core properties match their recorded starting values.

## Deployment check findings

The current GUI exposes **Run deployment check** after returning an app to prototype. Historical pre-clarification checks temporarily switched DEV state. The latest owner instruction supersedes this process: both DEV apps are to remain Prototype, and deployment advisories do not block this authorized promotion.

| Check | OLTP | OLAP | Exact finding |
|---|---|---|---|
| App definition warnings/errors and errors | Passed | Passed | No definition error |
| Data matches expected structure | Passed | Passed | No schema error |
| User signin / allowed updates / account status | Passed | Passed | No security/account error |
| App description | Warning | Warning | Please specify an industry for your app; Please specify a function for your app |
| Use custom launch icon | Warning | Warning | Custom app icon not assigned |
| Standard menu design | Passed | Warning | Consider removing some of the actions in the app menu. Too many choices may confuse the app user. |
| Data caching on server | Warning | Warning | The app has read-only data that would benefit from server-side data caching |

Exact captures: [OLTP](dev-oltp-deployment-check-20260918.txt), [OLAP](dev-olap-deployment-check-20260918.txt). The previous unavailable-diagnostic limitation is superseded by these executed checks, not by a clean result.

[Official AppSheet caching guidance](https://support.google.com/appsheet/answer/10104985?hl=en) states read-only data can be cached for up to five minutes. Enabling it solely to remove an advisory could change financial summary freshness. Removing OLAP navigation and changing icons also expands the accepted feature delta. No such change is authorized by the frozen target. Asked the owner to choose an explicit scoped policy amendment allowing these advisory categories or additional tested fixes; ordinary promotion authorization is already recorded and does not need repeating.

## Recorded execution and recovery order

1. Recheck drift only if intervening changes are observed; retain the immutable candidate, source bindings and current PROD rollback versions. Refresh backup if its age/intervening writes make it unsuitable.
2. Apply V20 and V21 with the pinned clean-checkout runner, actual owner authorization and verified backup references. V20 uses a transaction and source-table locks to capture historical identities atomically. SQL-only cutover metadata remains absent from both apps. No scheduler/notification configuration changes are planned.
3. Import Cash Holders and Cash Holder Balances in both apps; Cash Ledger only in OLAP. Regenerate affected source schemas, configure exact fields/references/defaults/forms, ledger controls/views, Delete reversal and dashboard/Collection delta. Preserve production source database-2, recipients, access, companion links and theme.
4. Read back every changed property against the frozen targets, including generated references and slice membership; validate SQL history, no history backfill, no DEV fixtures and holder reconciliation. Sync/open both current production apps and inspect/cancel forms without posting financial test records or forcing notifications.
5. Run final permitted diagnostics, record saved versions, update model documents together and close the tracker only when all required items pass or specifically approved advisory dispositions are recorded.

Recovery is coordinated app rollback to the versions above plus a reviewed SQL forward fix if necessary. Keep source/custody history. No automatic destructive down-migration or database restore over later writes. On partial failure, stop dependent steps and document actual applied state before retrying.

DEV opening entries `r005-test-opening-dad` / `r005-test-opening-lisa`, their 18,000 / 30,000 amounts, and all other DEV financial fixtures are excluded from promotion.

## Cutover execution

V20/V21 applied from pinned commit 2054384; post-migration validate passed. The initial runner attempt rejected checkout line-ending hash differences before any SQL write. Exact originally tested migration bytes were copied into the isolated checkout, each hash verified against the manifest, and Git refreshed its normalized stat cache (no staged content difference). The unchanged runner then accepted the clean pinned commit and exact hashes. No migration/checksum repair or override was used.
