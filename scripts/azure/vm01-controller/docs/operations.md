# Operations and recovery

No controller resources are deployed. The following is a reviewed source runbook, not authority to run its live steps. Fill [approval manifest](approval-manifest.json), capture final source/package hashes, and obtain the specific approvals in [approval bundle](approval-bundle.md).

## Approved preparation and deployment order

1. Confirm tenant/subscription, VM identity, current state, current name availability, provider registration and quota. Reuse verified discovery until evidence changes. Operator has Owner/Global Admin per parent discovery; those user privileges never become Cloud runtime credentials.
2. Obtain scoped approval for resource creation/provider registration, the exact Entra configuration/consents and storage roles. Create registrations only after that approval; API uses v2 tokens and access-token optional claim idtyp. Browser owner object ID is a candidate until actual intended session/consent is confirmed. No personal password is collected.
3. Compile/review Bicep and exact public parameters. `main.bicep` initially sets attachVmRole=false, enableMutations=false and enableOperationPolling=false. Provision into a dedicated approved controller RG. Review actual default hostname before registering the exact SPA callback; modern Azure hostnames need not be `<app>.azurewebsites.net`.
4. Verify Easy Auth and HTTPS configuration before code receives any VM power role. Package built source with locked production dependencies, exclude test/admin tooling/private state, record ZIP hash and deploy the exact pin using the approved Azure mechanism. Flex uses its deployment blob; do not assume zip-deploy/SCM behavior without checking the chosen supported CLI.
5. Bootstrap the ledger through the separately authorized administrator CLI identity. Example after approved configuration: `npm run bootstrap -- --approved --evidence <approval-reference>`. It creates disabled admission, cannot overwrite existing state and does not submit a VM action. Operator needs the dedicated storage data permissions.
6. Attach the exact VM role under separate approval, preserving the existing Grafana role. Wait for documented RBAC propagation and prove status/read authentication with both allowed and denied callers. These are status-only checks; runtime switches remain false.
7. If optional operation polling is approved, grant its separately reviewed one-action role at the explicitly approved verified scope, record assignment/permission test and only then enable its switch. No operation-read role is included in the base deployment.
8. Enable the runtime mutation switch and ledger admission only after acceptance/activation approval. Ledger administration uses `node dist/scripts/admin-ledger.js admission --approved --evidence <reference> --expected-generation <N> --enable true`. Both switches must permit new actions. Operator commands are explicit live writes, never startup scripts.
9. Obtain an exact separate timing/count/action approval before any VM power test. Hold all new VM work, save work and retain a recovery operator/session. Confirm deallocate then start/reconnect only when that exact sequence is authorized. Power state is not executor readiness.

Optional `npm run preflight -- --azure-read` performs one fixed-target read using the administrator's Azure CLI credential. Ordinary `npm run preflight` validates public configuration offline. Do not print tokens, account-export files or unrestricted configuration from an Azure CLI profile.

## Unknown outcomes and reconciliation

A202/unknown operation is never resent with a fresh ID. The caller retains the original ID/body; status and same-ID retries retrieve its receipt. Polling403 retains the original operation for later status recovery. Failed/Canceled terminal evidence releases the latch while preserving sanitized failure details; a further request still needs fresh state and authorization.

For manual recovery:

1. Disable ledger admission using the admission command with expected generation. Disable the application mutation switch and stop/drain Function workers through separately authorized control-plane access. Do not merely break a storage lease. Account for delayed old requests; an administrator attestation cannot prove fencing itself.
2. Inspect ARM operation evidence with the authorized operator identity and establish completion/failure/cancellation/non-dispatch. Do not treat running or a VM reconnect alone as proof of an exact restart's result. If uncertain, leave admission off and preserve records.
3. Run the scoped reconciliation command only with the exact active request ID, expected generation, evidence reference and worker fencing:

   `npm run reconcile -- --approved --workers-fenced --evidence <reference> --expected-generation <N> --request-id <ID> --result <succeeded|failed|canceled|not-dispatched>`

4. The command requires disabled admission and matching generation/active ID. Succeeded additionally checks fresh desired VM state; operator evidence supplies authoritative completion. The script leaves admission disabled, increments generation and preserves the receipt/audit. Confirm compatible code/configuration and fresh status before approved resumption.

## Rollback

Source-only rollback is revert the task commit through normal Git review. There are no live controller resources to roll back at this milestone. After a future deployment, first disable admission/stop workers and revoke the controller's VM action grant if required, accounting for RBAC propagation. Restore compatible pinned code while retaining current ledger/deduplication evidence. Restoring a stale ledger can repeat accepted operations and is not a normal rollback. Remove only task-created resources/identities under exact cleanup approval; preserve VM, network, existing roles, Windows sessions and unresolved operation evidence.

## Cost and logs

No always-ready instances, paid logs workspace or permanent poll timer. Native Activity Log retains90 days without an ingestion charge; controller blob events retain1000 entries. Never log incoming headers, token payloads, request URLs containing authorization codes, ARM error text or SDK credential exceptions. Azure platform diagnostic settings must be reviewed separately before enabling request logs, particularly on the SPA callback.

UnderUSD1/month excludes VM/disks/public IP and remains a target. Flex grant is subscription-shared/eligibility-dependent; required storage costs and host activity remain. With10,000 monthly requests at0.5GB and1 billed second, illustrative compute is0 with grant orUSD0.134 without. Illustrative0.1GB Hot LRS plus50,000 writes/100,000 reads isUSD0.292, giving roughly0.29–0.43 before overhead. At5 seconds, grant-free estimate approaches0.95 before overhead. Obtain the Southeast Asia quote and measure actual host/storage traffic; public shell traffic can exceed this model.

The illustrative arithmetic assumes USD0.000026/GB-s and USD0.40/million executions, plus storage USD0.02/GB-month, USD0.05/10,000 writes and USD0.004/10,000 reads. These are model assumptions, **not a verified Southeast Asia offer quote**. Microsoft pricing documentation rechecked on 1 October 2026 confirms the Flex on-demand grant (250,000 executions/100,000 GB-s per eligible paid consumption subscription), storage charged separately and no grant for always-ready billing. Pricing pages do not expose a selected regional rate in this read; the public retail API read returned HTTP403 and was not bypassed. Obtain an authorized regional offer quote before cost approval.

[Functions pricing](https://azure.microsoft.com/en-us/pricing/details/functions/) · [Cost calculation](https://learn.microsoft.com/en-us/azure/azure-functions/functions-consumption-costs) · [Blob pricing](https://azure.microsoft.com/en-us/pricing/details/storage/blobs/) · [Activity Log](https://learn.microsoft.com/en-us/azure/azure-monitor/fundamentals/activity-log).
