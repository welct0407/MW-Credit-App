# Production API access — 21 September 2026

Owner explicitly authorized enabling both PROD OLTP and PROD OLAP APIs directly, outside the release process, with no DEV change and no release number. This instruction supersedes the ordinary promotion route for this limited configuration change.

Targets: OLTP `93844270-6aa5-420b-a960-bcdf08abd357`; OLAP `e74dd368-654f-44d7-bccf-83cf361d1cdb`. Both inbound API Enable switches were initially off. Enabled and saved through the current editor. Retained the existing OLTP key; created a separate OLAP key and stored it only in the authorized private credential directory and Debian VM secrets directory.

Rollback: disable the two inbound API switches and restore the backed-up VM connection configuration if required. No product definition upgrade, data-model/column/form change, migration, financial write or DEV edit is included. AppSheet maintains its normal saved history; no Rnnn is allocated for this owner-directed operational configuration.

The Debian integration agent now selects each production API explicitly. Bounded read probes validate authentication without printing records. See the Integration Agent's `CHANGE_NOTES_AGENT_PROCESS_REVIEW_2026-09-21.md` for runtime checks and configuration backup.

The former inventory stated OLTP API was enabled but a current request returned HTTP 403 with API disabled. The exact cause is not proven. Google's upgrade guide does not explicitly guarantee API Enable preservation. Document a post-upgrade API check rather than assuming the setting survives; DEV remains unchanged as directed.

No model-workbook update is needed: this is app-level integration access, not a table/column/formula/permission-expression change. No release tracker entry or release manifest/tag is created.
