# R048 production promotion — 29 September 2026

OLTP was upgraded through normal App Upgrade from the PROD-mapped, deployed RC1 version1.000009 into the existing PROD app, version3.000257 →3.000260. OLAP remains1.100208. PostgreSQL migrated53 →55. Production validation and closure passed in the [single checklist](promotion-checklist.md); final release tag **R048**.

The owner accepted DEV1.000151 and explicitly requested promotion. The frozen implementation is47efcbf0fe59c30a152a585b94b9cfc24be3be68. R049 is the sole Open development release; the independent candidate and SQL pin allow shared DEV work to resume.

Scope: direct Upcoming Charges menu table for seven future dates, grouped by date then borrower with daily sums; Collection shows today's charges, bilingual upcoming summary (date/total), then details, capped at five distinct borrower due dates within three months. Whole-baht display and issue-only notes are preserved. Earlier R048 receipt, original-rate and report changes remain intact.

Evidence: [manifest](manifest.json), [source mapping](source-mapping.json), [backup](production-backup.json), [schema preflight](schema-preflight.json), [migration](production-migrate.json), [validation](production-validate.json), [catalog](postgresql-affected-definitions.json). Detailed accepted DEV tests are reused from [implementation](../r048-upcoming-charges/IMPLEMENTATION.md).

The pre-upgrade logo's old signed transport link rendered broken. During candidate preparation, the original shared Drive Loan Manager logo was reselected; production now renders the correct pink logo. RC1 was deleted after validation; the logo still renders after PROD reload, and shared assets are preserved.

Rollback: restore OLTP3.000257 if required; the four additive read-only views can remain unused by the prior app. The verified private production dump was restored into disposable PostgreSQL and matched all captured table fingerprints; V54/V55 rehearsal preserved existing public values. Do not restore this dump over subsequent financial activity without a reconciled recovery decision.

No production financial test writes or forced notifications were performed. Existing DEV behavioral tests and previously proven scheduled-guard runtime evidence are reused. Private AppDoc/runtime captures and recovery dumps remain outside Git.
