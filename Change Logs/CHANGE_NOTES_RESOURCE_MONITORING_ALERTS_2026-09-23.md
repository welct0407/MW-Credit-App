# Resource monitoring Performance alerts — 23 September 2026

## Scope and baseline

The owner requested Grafana IRM alerts for key Performance metrics with mobile push. This is Grafana configuration and monitoring documentation only; the dashboard definitions, AppSheet apps and databases were not changed. Starting Git commit: `1f45fe4e7b5dca155c66ae47dacc136f4868c64a`. Grafana Alerting had zero rules, IRM had no integrations/escalation chains, and the connected owner mobile app already had Mobile push for Default and Mobile push important for Important notifications. No prior live rule was overwritten.

## Live configuration

- Created IRM Grafana Alerting integration **MW Performance Monitoring** (`C1MJ5YW7STIKQ`) and its Grafana IRM contact point **MW Performance IRM**. Its default route triggers escalation chain **MW owner mobile push** (`FYW3EC36EMA4L`), whose direct `Default` notify-users step targets only `welct0407@mw-credit.com`.
- Created folder **MW Resource Monitoring Alerts** (`f9w88d`) and Grafana-managed group **Performance 2m** (two-minute evaluation). Seven rules use the existing backend Infinity GCP/Railway sources, direct contact-point routing, and the Performance dashboard as runbook URL. No-data and execution error both use Keep Last State; rules do not page for monitoring Unknown or the intentionally non-24x7 Azure VM-01.

| Rule | UID | Condition | Pending |
|---|---|---|---|
| Production webhook unavailable | `efz3jiz9qmhhce` | Fresh external check reports DOWN from all three regions | 4m |
| Production access component down | `dfz3jpfj9qebkc` | Any fresh tunnel, OLTP, OLAP or database-access Debian report DOWN | 4m |
| Cloud SQL connection pressure | `efz3jt5gcrbpca` | Five-minute mean/summed backends >160 of 200 | 10m |
| Cloud SQL CPU sustained high | `efz3jvnnv8zcwb` | Five-minute mean utilization >0.85 | 10m |
| Cloud SQL used memory high | `afz3jy61wh3i8e` | Five-minute mean components/Usage >85% | 10m |
| Debian VM used memory high | `efz3k36z3ptdsb` | Five-minute mean Ops Agent `used` >85% | 10m |
| Metabase Railway memory pressure | `cfz3kb8tpk16oc` | Used GB / latest live limit GB >90% | 10m |

These 80/85/90% thresholds are operational warnings, not new provider hard limits or chart markers. For exact source/meaning and limitations, see the maintained [operating reference](../Documents/Resource_Monitoring.md#performance-alerts-and-phone-delivery-23-september-2026) and [visual guide](../Documents/Resource_Monitoring_Dashboard_Guide.md#performance--alerts-linked-to-visuals). Only the owner is in the escalation chain, within the current free-tier IRM active-user allowance; no plan upgrade or extra recipient was configured.

## Checks and rollback

The new integration's demo alert produced an IRM alert group and a mobile push; the owner confirmed receipt. The demo group auto-resolved. A separate **Grafana Alerting contact-point test** reported "Test notification sent successfully," and the owner confirmed its second mobile push, verifying the full Alerting → contact point → IRM → phone path. Each rule's backend query preview returned a Normal condition after the final query was entered, and the live Alert rules list showed **7 of 7 Normal**, including the Railway rule. Grafana rules continue to evaluate after this snapshot; mobile delivery of a real threshold event remains untested because no production resource was deliberately impaired.

To undo this batch, pause/delete the seven named rules, remove the dedicated contact point/integration, then remove the unreferenced escalation chain and folder/group. Preserve dashboards, existing data sources, provider metrics and all unrelated Grafana assets. The original zero-rule/zero-integration state was the rollback baseline. No local credential or token was added. Updated files: `Documents/Resource_Monitoring.md`, `Documents/Resource_Monitoring_Dashboard_Guide.md`, and this log.

**Status:** Live alerting and IRM mobile route configured and verified; documentation updated and checked for publication.
