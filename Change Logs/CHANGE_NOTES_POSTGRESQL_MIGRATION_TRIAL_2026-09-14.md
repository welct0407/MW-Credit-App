# PostgreSQL migration trial — 14 September 2026

Status: provisioning/preflight in progress. No app copy or migration completed; no production app/data changes. Owner requested full OLTP/OLAP/shared-database copies, migration, thorough feature validation and detailed cutover changes. New target must support direct public-IP access with no proxy, minimum-cost sizing and the same POC password.

## Baselines and scope

Live rendered app documentation captured before edits: OLTP 3.000064 (`93844270-6aa5-420b-a960-bcdf08abd357`), OLAP 1.100041 (`e74dd368-654f-44d7-bccf-83cf361d1cdb`). Both Runnable/Deployable Yes. Existing app configuration untouched; these are source baselines, not rollback versions of yet-uncreated copies. Raw configuration snapshots kept outside Git under C:\Users\MWCredit\Documents\ChatGPT\AppSheet-Loan-Project\postgresql-migration-trial-20260914 because configuration can contain private constants. File names oltp-source-config.json and olap-source-config.json. Credential/private-file backup coverage not established.

OLTP appdoc counts 20 tables including native process state/output tables and user settings; these must not be mistaken for 20 operational SQL tables. OLAP counts 16 including native system tables. Detailed shared-table and feature inventory pending. New GUI only; no AppSheet API.

## Provisioning actions and correction

1. Inspected POC clone option. Google Cloud blocked public-IP cloning due to inherited organization policy.
2. Created empty logical database loan_manager_prod on existing appsheet-pg-test-20260914 as a proposed cheapest trial alternative. No app datasource authorized and no data migrated into it.
3. Owner clarified separate recreation with public IP and explicitly requested deletion of unused database/name reuse. Deleted loan_manager_prod. The delete dialog returned a generic error, but subsequent reload showed only appsheet_sync_poc/postgres, and the operations drawer confirmed deletion at 19:50:53 Bangkok. No repeat deletion attempted; original POC database retained.
4. Prepared new-instance form: appsheet-pg-prod-20260914, PostgreSQL 18, Enterprise Sandbox customized to db-f1-micro, Singapore, single zone, current minimum 10 GB SSD. Password blank; instance not submitted. Storage cost options and final configuration still require review. No proxy selected, provisioned or charged.
5. Normal creation also blocks public IP. Read effective project policy: legacy sql.restrictPublicIp Enforced via inheritance; newer sql.managed.restrictPublicIp inactive. The policy description states that existing public-IP instances are unaffected.
6. Prepared unsaved project-only override of sql.restrictPublicIp to Not enforced. Parent organization policy unchanged. Saving awaits explicit action-time confirmation required by browser-control policy for weakening a security restriction. No policy change has been applied.

## Rollback and remaining work

The only applied database change (empty DB creation) was reversed by the owner's deletion request. Discard the unsaved instance/policy forms to abandon provisioning. No application rollback needed. Source configuration baseline retained above. After policy approval, verify effective public-IP permission and create minimum-cost instance; password entry/submission requires owner handoff. Reuse loan_manager_prod as the database name on the new instance.

Then create complete isolated database and both app copies, confirm their versions and all connections before any test writes, isolate notifications/scheduled jobs, migrate with exact text/varchar keys/Refs, reconcile all shared consumers, test OLTP/OLAP thoroughly, and update both canonical model documents plus object-level cutover changes. No model documents changed at this checkpoint because no app model/copy or target schema exists. Only synthetic financial operations in copies; live cutover remains excluded.

Validation remains unperformed for the migration. Do not interpret the prior three-table POC as full loan-app acceptance. Production micro sizing is the owner's cost preference and still needs load testing; no SLA or performance guarantee claimed. Checkpoint files committed/pushed under the owner rule; private snapshots are not covered by Git.

## Approved policy change and password handoff

Owner explicitly instructed "set the policy and go ahead". Saved project-only sql.restrictPublicIp override to Not enforced; effective policy and saved-success message verified. Parent policy unchanged. Rollback: restore Inherit parent's policy on this project; existing public-IP instances will remain public because the constraint is non-retroactive.

Refreshed new-instance form verified Public IP checked and Private IP unchecked. Re-entered target appsheet-pg-prod-20260914, PostgreSQL 18 Enterprise, Singapore, single-zone, db-f1-micro. Selected minimum 10 GB HDD because owner requested cheapest configuration; SSD was offered at a higher storage rate. Backups/PITR/deletion protection and automatic storage increases remain at defaults; Query Insights off on micro. No proxy or private networking configured. No reliable final price loaded in the form at this checkpoint, so no new price quote claimed. Instance remains unsubmitted with blank postgres password field. Owner password entry and submission handoff required by browser-control rule; same existing POC admin password requested, no new secret generated/stored by the agent.
