# R057 AppSheet retirement

Started13 October2026; final networking/collector checks14 October2026 (Asia/Bangkok). **R057 technical retirement Released; license revocation remains the owner's action.** The owner authorized retiring all four AppSheet apps and remaining active integration dependencies before personally revoking the license. App definitions, SQL databases, historical receipt objects and recovery evidence are retained.

## Scope and release

Retirement began **2026-10-13T16:37:00Z**, triggering R057 freeze. The coordinated R057 Frozen/R058 Open/R059 next-number handoff is published at PM 955b6509. Integration source [a8568e385051a20a3b7efd3374bade6c193d6882](https://github.com/welct0407/MW-Integration-Agent/commit/a8568e385051a20a3b7efd3374bade6c193d6882) was merged normally in [PR4](https://github.com/welct0407/MW-Integration-Agent/pull/4) at a53a550a3326ce542a5303597e8e70927672d41d on 2026-10-13T16:59:10Z; installed Debian source remains a8568e3. F's exact infrastructure evidence is published at [5213ed2](https://github.com/welct0407/MW-Credit-App/blob/5213ed2cb79aab7eed0a2f0b61c589f7b6951fc4/outputs/r057-appsheet-retirement/infrastructure-evidence.json). This is retirement, with no App Upgrade or RC copy.

## Four retained app definitions

| App | ID | Starting restorable version | Final saved version | Verified retirement controls |
| --- | --- | --- | --- | --- |
| PROD OLAP — Loan Business Insights | e74dd368-654f-44d7-bccf-83cf361d1cdb | 1.100215 | 1.100216 | Paused after reload; API disabled/key disabled; two bots already disabled |
| PROD OLTP — Loan Manager ผู้จัดการสินเชื่อ | 93844270-6aa5-420b-a960-bcdf08abd357 | 3.000275 | 3.000277 | Paused after reload; API disabled/key disabled; ten bots disabled (seven changed/three already disabled) |
| DEV OLTP — MW-OLTP-DEV-20260919 | 500b27b6-884a-41e8-a9ec-df801b0110ad | 1.000207 | 1.000208 | Paused after reload; API already disabled/no active keys visible; ten bots disabled (eight changed/two already disabled) |
| DEV OLAP — MW-OLAP-DEV-20260919 | 9f3422be-bc87-4a5a-a42a-67528ee80393 | 1.000056 | 1.000057 | Paused after reload; API already disabled/no active keys visible; two bots disabled (one changed/one already disabled) |

All four current-editor readbacks showed **Resume Paused App** after reload and **No issues** before source access was removed. All 24 bots are disabled; exact retained bot names are in the manifest. Pause, bots and API/key controls were checked separately. No app, event/process/task definition or database integrity trigger was deleted.

## Source and integration retirement

AppSheet account **Sources** and team Sources are empty after removal of database-1/30882513, database-2/30884713, database-3/30899069 and google-2/30639753. Account and team **Integration Stores** are empty after removal of MW Receipt Images DEV and MW Receipt Images PROD. Auth Domains, Channels In, Channels Out, App Services and Apps Script were inspected and are empty. These are AppSheet connection records; backing SQL/GCS services, credentials needed by retained native consumers and receipt objects are preserved. Weekly summary setting SendWeeklyUpdates was unchecked and saved; persistence was verified.

Removing source connections can make the retained editor definitions report missing sources. The earlier zero-issue readbacks are **before-removal evidence**, not a claim that editors remain clear after their access has been retired. App source definitions/IDs remain historical binding and recovery metadata.

F verified installed a8568e3/catalogue 27 at 2026-10-13T16:42:41.705571Z: authenticated native OLTP and OLAP scopes and unused-UUID receipt status passed before six unchanged original timers resumed; final check/scopes passed. AppSheet enabled=false, five legacy configuration fields removed, two active legacy key files removed after native checks; all other flags/cutoffs preserved. Collector/AppSheet client dependencies were removed while native SQL/API receipts and compatibility identifiers such as `appsheet_delete` remain intact. B ran49 focused tests successfully; one Windows-only skip covers a Linux process-lock test. Commands used PYTHONPATH=src and `python -m unittest discover -s tests -p <file>` for test_config.py(8), test_appsheet_retirement.py(2), test_delete_compatibility.py(2), test_receipt_transport_retirement_independent.py(8), test_conversation_api.py(4) and test_partner_conversation.py(25/one skip). Automatic Agent tests run 38432653827 succeeded; no extra manual broad run or bypass. No financial write or forced notification was used.

The reviewed plan SHA256 `c6cd55b2d1bbb8982132c5fb6818b0a74feb0b65af877958ef8bbf31d98aae3d` removed73 AppSheet-only authorized networks, leaving the owner workstation entry and preserving all other settings/native connectors. Terraform apply was rejected API400 for the existing API-unset maintenance window; no successful Terraform apply is claimed. The root-approved narrow SQL Admin PATCH operation `0db362ad-89e4-4c22-ba31-5f8400000031` completed2026-10-13T17:02:37.46Z /14October00:02:37.46Bangkok. SQL is RUNNABLE; only networks/settingsVersion/etag differ and refreshed Terraform exits0/no changes. [Pinned network evidence](https://github.com/welct0407/MW-Credit-App/blob/808cdf53225ce627ea41ef4d3666bf97a3c9cbfe/outputs/r057-appsheet-retirement/network-retirement-evidence.json).

The next normal collector at2026-10-13T17:03:08.887283Z /14October00:03:08.887283Bangkok reports native OLTP/OLAP, database and DEV/PROD Hosting all UP. This is a bounded connectivity observation, not a new financial/business suite. A separate direct impersonation probe returned403; no IAM change or false direct-probe pass is claimed. No SQL schema/business-data mutation was performed.

## Recovery and remaining owner actions

PM starting commit b79ff89dbe87f64c244f6ccd8eb07426033eef43. The existing dirty Phase 2 credential section/index row, log and output are preserved and excluded from publication. App restorable versions are listed above. F verified four root-only configuration/key recovery files in `/var/backups/mw-appsheet-retirement-r057-20261013`; package recovery is `/var/lib/mw-integration-agent/rollback/r053-20261013T164158301626Z`, with the R057 rollback pointer recorded in pinned evidence. Protected private recovery is not published.

Restoring AppSheet operation requires coordinated owner direction, license availability, recreation of removed connection metadata using retained service credentials/owner OAuth sign-in and exact bindings, the retired AppSheet network entries if required, and deliberate restoration of app controls. A code or app-version rollback alone does not restore account connections or undo SQL/financial writes. No SQL migration, business-data mutation, receipt deletion, secret rotation, Azure controller change, app-definition deletion or license operation was performed. Cloud SQL authorized-network metadata changed as recorded above.

Automatic approval review rejected temporary SSH metadata/local-key cleanup **before execution**, with reason blocked by policy. No workaround was attempted. Metadata expires 2026-10-13T17:31:44Z; the private local key is retained outside repositories for 20 October review. This explicit operational cleanup limitation is separate from technical AppSheet retirement. License revocation remains the owner's action and is not claimed completed.

The [single R057 checklist](../r057-infrastructure-adoption/promotion-checklist.md) covers the existing infrastructure adoption and retirement extension. The [manifest](release-manifest.json) owns exact saved facts; the final PM evidence tag is R057; actual branch/tag publication must be verified before reporting completion.
