# Phase 1 infrastructure inventory — 12 October 2026

Read-only discovery for the owner-requested ecosystem cleanup proposal. No import, plan/apply, rotation, IAM change, VM power action or GUI operation occurred. Starting coordination commit: `f6634546`; application source: `1016c9a`. Infrastructure implementation belongs to MW-Credit-App. This report is a scoped inventory, not a complete cloud asset/IAM audit or permission to adopt resources.

## Evidence and access

Reused the four same-day private sanitized metadata files under `C:/Users/ideaadmin/Documents/ChatGPT/MW-Credit-App/diagnostics/r054-credential-infrastructure-20261012/`: `secret-metadata.json`, `terraform-ownership.json`, `live-resource-metadata.json`, `network-sql-metadata.json`. They contain metadata, not raw Terraform state. Retain for review through 19 October 2026; deletion is not part of this task.

Fresh CLI/API reads: Azure account/resource list; GCP parked-project description/Cloud Asset search; Cloudflare DNS GET; Tailscale local status. Azure uses existing application-managed CLI authentication under `C:/Users/ideaadmin/.azure`; GCP active CLI account is `welct0407@mw-credit.com`. Cloudflare uses the established `MW-Credit-App/scripts/Invoke-DevDns.ps1` Secret Manager route, existing `mw-credit-app-dev-cloudflare-dns-token` version 1, held only in process memory. No secret values or raw states were printed or saved. No local Cloudflare token file/environment credential was found in the scoped established-path checks; the maintained Secret Manager route resolved that initial gap.

## GCP ownership

Existing project `clever-oasis-508610-n7`, number `737787224638`: 21 secrets/16 Terraform-owned, 10 Cloud Run services/9 owned, 7 Scheduler jobs/6 owned, 3 registries/2 owned, 26 service accounts/16 owned, 6 buckets/4 owned. These counts describe the prior selected inventory, not all provider resource types.

| Backend bucket | State object | Resource instances |
| --- | --- | ---: |
| mw-credit-app-tfstate-737787224638 | bootstrap/default.tfstate | 1 |
| mw-credit-app-tfstate-737787224638 | development/default.tfstate | 95 |
| mw-credit-app-tfstate-737787224638 | development-dns/default.tfstate | 2 |
| mw-credit-app-prod-tfstate-737787224638 | bootstrap/default.tfstate | 1 |
| mw-credit-app-prod-tfstate-737787224638 | application/default.tfstate | 70 |
| mw-credit-app-prod-tfstate-737787224638 | dns/default.tfstate | 1 |

Total: six states, 170 instances. Source pins Terraform 1.16.5, Google/Google-beta 8.6.0 and Cloudflare 5.27.0; retain checked-in lock files. Existing state ownership must be preserved; do not import the same remote object into another state.

Unowned selected resources include SQL instance `appsheet-pg-prod-20260914`; GCE VM and disk `vm-mw-credit-agent` in `asia-southeast1-a`; regional address `vm-mw-credit-agent-ip`; IAP firewall `allow-ssh-iap-mw-integration-agent`; receipt bucket `mw-payment-receipts-prod-508610-n7`; build bucket `clever-oasis-508610-n7_cloudbuild`; Cloud Run `mw-grafana-events`, Scheduler `mw-grafana-dispatch`, registry `mw-monitoring` in `asia-southeast1`. Current app AGENTS explicitly treats SQL instance and receipt bucket as external dependencies: owner-approved ownership revision is required before adopting them. SQL databases include `loan_manager_dev`, `loan_manager_prod`, `mw_agent`, and system `postgres`; users/passwords, SQL business contents and Flyway-owned DDL are not infrastructure-import scope.

The `default` network and its regional default subnets/firewalls exist. They are shared/default resources, not automatic adoption candidates. Likewise provider-created/default identities and build artifacts require classification, not bulk import. Unowned named service accounts include integration, AppSheet receipt, Grafana, Metabase and Codex identities; each requires its owning service and grant edges to be reconciled separately.

Known coverage gaps: Grafana bridge Firestore databases/indexes/TTL and detailed IAM; monitoring billing BigQuery assets; logging exclusions; enabled-service/service-agent ownership; detailed Azure role assignments and child resources; Cloudflare account/tunnel configuration. No completeness claim is made for these. Avoid reading Firestore documents, business SQL or secret payloads merely to inventory infrastructure.

Parked project `mw-credit-app-prod-20261011`, number `219146337993`, organization `594773370606`: fresh description is ACTIVE; Cloud Asset search returned only its project asset. This supports no additional indexed assets observed, not proof of absent IAM, billing, disabled APIs or all resource types. Existing production Terraform states above remain in project 737787224638; do not confuse the parked project with current production ownership.

## Azure

Fresh access succeeded as mapped `zhcyidea@gmail.com`, subscription `50f792fa-803e-4280-833d-1fe60fef5293` (IDEA Prod Subscription), tenant `9e29c895-606a-420b-acc2-1c24375df4d9`. ARM resource list returned 25 resources. IDs below are expressed as resource-group/provider-relative paths under that subscription; casing follows returned metadata where material.

| Resource group | Provider/type | Names |
| --- | --- | --- |
| rg-mwcredit / RG-MWCREDIT | Microsoft.Compute/virtualMachines | VM-01 |
| rg-mwcredit | Microsoft.Compute/virtualMachines/extensions | VM-01/AADLoginForWindows; vm-01/AzureMonitorWindowsAgent |
| RG-MWCREDIT | Microsoft.Compute/disks | vm01-osdisk-20260912-091515 |
| rg-mwcredit | Microsoft.Network/virtualNetworks; networkSecurityGroups; networkInterfaces; publicIPAddresses | vnet-mwcredit; VM-01-nsg; vm-01366; vm01-ip |
| rg-mwcredit | Microsoft.Insights/metricalerts | Available Memory Bytes - VM-01; Percentage CPU - VM-01; VM Availability - VM-01 |
| rg-mwcredit | Microsoft.Insights/dataCollectionRules | msvmi-southeastasia-vm-01 |
| rg-mwcredit | Microsoft.Storage/storageAccounts | samwcreditbackupstaging |
| rg-backup | Microsoft.RecoveryServices/vaults | vm-backup-vault |
| AzureBackupRG_southeastasia_1 | Microsoft.Compute/restorePointCollections | AzureBackup_VM-01_87962438960743 |
| rg-vm01-controller | Microsoft.Storage/storageAccounts; Microsoft.Web/serverFarms; Microsoft.Web/sites | stvm01ctl50f792fa; vm01-controller-50f792fa-plan; vm01-controller-50f792fa |
| NetworkWatcherRG | Microsoft.Network/networkWatchers | NetworkWatcher_southeastasia |
| defaultresourcegroup-sea | microsoft.monitor/accounts | defaultazuremonitorworkspace-sea |
| MA_defaultazuremonitorworkspace-sea_southeastasia_managed | Microsoft.Insights/dataCollectionEndpoints; dataCollectionRules | defaultazuremonitorworkspace-sea (both) |
| azureapp-auto-alerts-afa7f3-zhcyidea_gmail_com | Microsoft.Insights/actiongroups; activityLogAlerts | azureapp-auto; Service Health issue in 'IDEA Prod Subscription' |
| rg04 | Microsoft.Storage/storageAccounts | saazuredemo202504091531 |

All are southeastasia except global alerts/actiongroup and westcentralus demo storage. Existing controller Bicep/source ownership must be reconciled before any Terraform adoption. No Azure Terraform state ownership was established by the six GCP states. Exclude service-created monitoring/backup artifacts and unrelated demo storage from automatic adoption. Reading account/resource metadata does not prove effective import/apply permissions; do not add IAM to remedy a future denial without scoped authorization.

## Cloudflare and Tailscale

Cloudflare zone `77d9da76cfeaaf21ae589f95a958965c` (`mw-credit.com`): fresh authenticated GET returned all 15 DNS records in one page. DNS-only names: alerts, dev-lm, lm, monitor, reports, vmcontroller, www; proxied names: charts and hooks. Remaining records: apex MX/TXT, google._domainkey TXT, _acme-challenge.dev-lm TXT, asuid.vmcontroller TXT and _railway-verify.reports TXT. Existing Terraform owns dev-lm, its ACME record, and lm. Keep email, third-party verification, unrelated www and existing managed records outside first adoption batch. DNS credential access does not prove account/tunnel administration; no broader token, refresh or permission request was made.

Tailscale local daemon reports Running, tailnet `zhcyidea@gmail.com`: VM-01 ID `nmRTc3S5bn11CNTRL` and Debian `vm-mw-credit-agent` ID `nSjJsZ6kq911CNTRL` online. Local peer view also includes localhost/iOS and two other Windows devices. This is ACL-visible local status, not a full tailnet/admin inventory. No established admin API credential was found in the scoped documentation/environment/path checks. Tailnet policy, OAuth clients, auth keys, routes and device ownership remain unverified; no credential extraction from daemon state or GUI fallback was attempted.

## Proposed import batches and exclusions

1. First reconcile source and state ownership; choose a separate ecosystem state only where no existing state owns the objects. Pin configuration and review a no-change plan before any separately authorized import/apply. This phase executed neither.
2. Candidate monitoring batch: Grafana Cloud Run/Scheduler/registry and dedicated service identities, after Firestore/index/TTL/IAM dependencies and existing runtime/deployment ownership are reconciled. Never include secret versions or change live environment/image/schedules during adoption.
3. Candidate integration batch: Debian VM/disk/reserved IP/dedicated IAP firewall, after MW-Integration-Agent ownership and immutable/replace-sensitive settings are captured. Shared default network is a referenced dependency unless separately approved.
4. Candidate Azure batch: controller or VM/network resources only after Bicep ownership, resource child settings, backup protections, provider pins/state/bootstrap and scoped authority are settled. Provider-managed backup/monitor defaults excluded.
5. Candidate DNS batch: specifically selected ecosystem service records only after exact current values/proxy/TTL and downstream owners are reconciled. Tunnel/account/Tailscale adoption remains blocked on established authorized API access and ownership evidence.

SQL instance, receipts and recovery data, default/system resources, service agents, secret values/versions, IAM wholesale replacements, parked-project provisioning/deletion, credential rotation, VM power/idle policy, runtime redeployments and financial data are excluded from Phase 1. Access gaps are evidence limitations, not a reason to create credentials or grant roles.

### Cloudflare record IDs and additional limits

| Name | Record ID |
| --- | --- |
| alerts.mw-credit.com | 12d90c87273bd42fa4f80caba62aaf4e |
| charts.mw-credit.com | 5a3e2cf73d5daf5b07ddff18f4b11b50 |
| dev-lm.mw-credit.com | bc398eb25de9e7bafcdf82d92f82c02b |
| hooks.mw-credit.com | 59f7b018abd772a52b373ef9800ecac2 |
| lm.mw-credit.com | 4dc2dba920efadeab0e5b52044d7ea7e |
| monitor.mw-credit.com | 0812c2993b6ef3b4b9553810f8ebe597 |
| reports.mw-credit.com | 68b6d51c8ab20d5ae51bf48c0a5a07cf |
| vmcontroller.mw-credit.com | fb80d9e77973ba5309c660e519413d23 |
| www.mw-credit.com | 5f4303f5421806989f6a1581aa68e93e |
| mw-credit.com (MX) | 2b5e9c76248bdf67c3da975721eee744 |
| _acme-challenge.dev-lm.mw-credit.com | 3fc3a6b71d61a8fe0f87ab9fb07e9b2a |
| asuid.vmcontroller.mw-credit.com | cb0f98835fa0d2e950b9495fc527299e |
| google._domainkey.mw-credit.com | f22cd792169f0be85661560efe984dfe |
| mw-credit.com (TXT) | f712c02e0b153276a1d05951f9460f2a |
| _railway-verify.reports.mw-credit.com | c40bbea86f79c7d12e31a361c694cbab |

The verified Cloudflare capability is DNS read only; token permission breadth and account-wide tunnel/Access administration remain unverified. Azure Function app settings and credentials were not requested. Entra application/service-principal identity, consent, federated credentials and effective authorization remain source-known reconciliation gaps for the controller, not freshly verified live configuration. Agent A owns the controller source/safeguard review.

### Cloud Run secret-reference projection

Configured template references only; they do not prove traffic revision pinning, successful access, payload correctness or rotated consumer adoption. Literal environment values are omitted.

| Service | Secret references |
| --- | --- |
| mw-credit-app-api-dev |  |
| mw-credit-app-command-dev | AGENT_CONVERSATION_POLICY_JSON -> mw-credit-app-dev-agent-conversation-policy:1; OWNER_FIREBASE_UID -> mw-credit-app-dev-owner-identity:1; NOTIFICATION_POLICY_JSON -> mw-credit-app-dev-notification-policy:2; RECEIPT_NATIVE_CATALOG_JSON -> mw-credit-app-dev-native-receipt-catalog:1 |
| mw-credit-app-command-prod | PROD_OWNER_FIREBASE_UID -> mw-credit-app-prod-owner-identity:1; AGENT_CONVERSATION_POLICY_JSON -> mw-credit-app-prod-agent-conversation-policy:1; PROD_RECEIPT_NATIVE_CATALOG_JSON -> mw-credit-app-prod-native-receipt-catalog:1; PROD_CAPABILITY_POLICY_JSON -> mw-credit-app-prod-capability-policy:1; AGENT_RECEIPT_POLICY_JSON -> mw-credit-app-prod-agent-receipt-policy:1 |
| mw-credit-app-jobs-dev |  |
| mw-credit-app-jobs-prod |  |
| mw-credit-app-notify-dev | NOTIFICATION_POLICY_JSON -> mw-credit-app-dev-notification-policy:2; WEB_PUSH_VAPID_JSON -> mw-credit-app-dev-vapid:1 |
| mw-credit-app-notify-prod | NOTIFICATION_POLICY_JSON -> mw-credit-app-prod-notification-policy:1; WEB_PUSH_VAPID_JSON -> mw-credit-app-prod-vapid:1 |
| mw-credit-app-read-dev |  |
| mw-credit-app-read-prod | PROD_OWNER_FIREBASE_UID -> mw-credit-app-prod-owner-identity:1; PROD_CAPABILITY_POLICY_JSON -> mw-credit-app-prod-capability-policy:1 |
| mw-grafana-events | volume mw-grafana-hmac-pej-jul -> mw-grafana-hmac; volume mw-grafana-state-key-qeb-muh -> mw-grafana-state-key; volume mw-grafana-cookie-keys-vuv-dav -> mw-grafana-cookie-keys; volume mw-grafana-oauth-jwks-qaf-xup -> mw-grafana-oauth-jwks; volume mw-grafana-google-client-secret-pun-paf -> mw-grafana-google-client-secret |

Per-secret IAM, inherited grants and consumer effective access are deferred; absence from this projection is not proof of unused secrets. Debian installed configuration and live legacy consumers remain unverified; source references do not establish active runtime use. Grafana unauthenticated datasource metadata returned 401 in Agent D scope; the referenced local API token files were absent. Its access gap is not retried here.

## Secret version and live reference metadata

Fresh bounded Secret Manager version metadata only; payloads were not read for this check. The earlier Cloudflare credential use was the established authentication exception described above.

| Secret | Version states |
| --- | --- |
| mw-credit-app-dev-agent-conversation-policy | 1:ENABLED |
| mw-credit-app-dev-agent-receipt-policy |  |
| mw-credit-app-dev-cloudflare-dns-token | 1:ENABLED |
| mw-credit-app-dev-firebase-web | 1:ENABLED |
| mw-credit-app-dev-google-auth | 1:ENABLED |
| mw-credit-app-dev-native-receipt-catalog | 1:ENABLED |
| mw-credit-app-dev-notification-policy | 2:ENABLED, 1:ENABLED |
| mw-credit-app-dev-owner-identity | 1:ENABLED |
| mw-credit-app-dev-vapid | 1:ENABLED |
| mw-credit-app-prod-agent-conversation-policy | 1:ENABLED |
| mw-credit-app-prod-agent-receipt-policy | 1:ENABLED |
| mw-credit-app-prod-capability-policy | 1:ENABLED |
| mw-credit-app-prod-native-receipt-catalog | 1:ENABLED |
| mw-credit-app-prod-notification-policy | 1:ENABLED |
| mw-credit-app-prod-owner-identity | 1:ENABLED |
| mw-credit-app-prod-vapid | 1:ENABLED |
| mw-grafana-cookie-keys | 1:ENABLED |
| mw-grafana-google-client-secret | 2:ENABLED, 1:ENABLED |
| mw-grafana-hmac | 1:ENABLED |
| mw-grafana-oauth-jwks | 1:ENABLED |
| mw-grafana-state-key | 1:ENABLED |

Grafana configured volume version selectors: mw-grafana-hmac:1; mw-grafana-state-key:1; mw-grafana-cookie-keys:1; mw-grafana-oauth-jwks:1; mw-grafana-google-client-secret:2.

Blank version-state entry for `mw-credit-app-dev-agent-receipt-policy` means the successful list returned no versions (container only). Blank Cloud Run reference cells mean no secretKeyRef/secret volume entries in the selected template projection; other authentication paths remain possible. DEV notification policy versions 1 and 2 and Grafana Google client-secret versions 1 and 2 remain enabled; no retirement or rotation conclusion follows without consumer/IAM reconciliation.

