# Approved disabled bootstrap — 1 October 2026 (UTC)

This is the original bootstrap checkpoint. Its owner-specific browser consent/allowlist was superseded by the [approved MW Credit account switch](../account-switch/README.md) on 2 October 2026 (UTC); original receipt, parameters, journal and deployed hashes remain unchanged.

The owner directly approved the prepared bootstrap and US$2/month planning budget with VM commands disabled. Infrastructure deployment `vm01-bootstrap-e025017` and exact VM-role deployment `vm01-controller-base-role-e025017` succeeded. Flex package deployment `a3b2fec5-75bc-4d86-ac41-c9b195fb44d5` is complete/active with status4. Live UI: https://vm01-controller-50f792fa.azurewebsites.net.

- [Full nonsecret receipt and approved identities/scopes](provisioning-receipt.json)
- [Public HTTP and rejected-caller verification](http-verification.json)
- [Disabled ledger readback](ledger-readback.json)
- [Original deployed parameters](deployed-parameters.json), [original deployed ARM](deployed-main.arm.json), [deployed source checks](deployed-source-checks.json)
- [Provisioning write journal](write-journal.jsonl)
- [Current source validation](../validation.json)

Deployed source: `e02501786af5f8a9ca7073c08244eb6afc4e08af`. Original ARM SHA256: `346fc8989173b96bb8e3bcf225d9adc90bd4ef18679d362b152e207bd5f7527b`. Final locked production ZIP SHA256: `aaedfe3d24e2dedfac5338b7ab03b4e9c7a6961267d068e0b7a51c43f22b180f` (15874625 bytes). The ZIP and dependencies remain outside Git; no credentials or private state are included in this evidence.

Function `/subscriptions/50f792fa-803e-4280-833d-1fe60fef5293/resourceGroups/rg-vm01-controller/providers/Microsoft.Web/sites/vm01-controller-50f792fa` uses system identity `a671b605-43e5-4878-b3cb-b7b6bf2ce586`. Dedicated GPv2 Hot LRS storage disables shared keys and public blobs. Node24 Flex512MB, no always-ready capacity, HTTP concurrency4/max40. Full regional scale quota and remaining shared grant are unverified; capacity at max40 is not reserved and is not a spending cap.

| Registration | Client ID | Service principal object ID |
| --- | --- | --- |
| api | `f8fc0efe-38ac-489a-b2b4-98d1afc9505b` | `334488ef-db87-49e1-af98-27b0b2f31dc2` |
| browser | `c74d7869-7313-459e-93b2-50beb860812f` | `065bf299-b083-422e-916b-a94c3f13429c` |
| cloud | `af64b0c6-261c-45a0-b653-a71d382edb92` | `d01d70be-d205-4ac9-a7fc-a18dd48e0633` |

All registrations are single-tenant and owned by `8a83866b-cdcc-4f87-99be-c41e3635c73b`; password/key/federated credentials are absent. Browser callback is `https://vm01-controller-50f792fa.azurewebsites.net/auth/callback`. API token audience is the API client ID above; delegated scope is api://<API-client-ID>/vm01.control. Owner-only Principal delegated consent and four controller-only Cloud application roles were verified; Cloud has no Azure runtime roles.

The Function has only three approved Azure assignments: Blob Data Owner on the dedicated account, Blob Data Contributor on function-package, and VM01 Power Controller at the exact VM-01 resource. The VM role has only read, instanceView/read, start, restart and deallocate, with no operation-status action or exclusions/data actions. The operator's new data grant is limited to vm01-controller. Existing Grafana role, disks/IP/networking and Windows/security/auto-login were preserved.

Both VM01_ENABLE_MUTATIONS and VM01_ENABLE_OPERATION_POLLING remain lowercase `false`. Ledger generation1 has admission=false, activeRequestId=null and empty records/audit. ARM's original string(false) produced `False`; only the two live disabled values were normalized during bootstrap. The later source repair emits explicit lowercase branches and has not been redeployed.

Verified bootstrap: HTTPS/Easy Auth tenant/audience/application/principal restrictions and token-store disabled; six public UI/config routes200; assets match the pinned build with security headers; anonymous, malformed-token and spoofed-identity status requests401. No power endpoint was invoked. The supported CLI Flex publish path used Entra authentication; its separate host-key health helper was replaced in-process with deployment-status/public HTTP checks. No publishing credential or host key was retrieved.

Pending: allowed owner browser and Cloud authenticated status, effective controller VM/ledger access, separately approved Cloud credentials/environment, optional operation-read, activation and exact power-test timing. No live browser-control tool is exposed here and no alternate browser automation was used for real sign-in. These are pending acceptance/authority gates, not a claim that the disabled bootstrap failed.

US$2/month is a planning budget; actual host/storage/network activity and remaining grant are unmeasured. No always-ready capacity or paid logs workspace was created. Current source repair publication grants no redeploy, merge or activation.
