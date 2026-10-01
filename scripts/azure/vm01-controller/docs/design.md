# VM-01 controller design

Design: Astra High. Source execution: Sol6.1 High. Release: R050, remaining Open. Baseline: `d351991d1a1c0895d4abc8f0f4ba4fa55fa7a4e5`. User clarified repository ownership on1 October2026: all supporting project development belongs in AppSheet-Loan-Project, personal-use work in Daily-Use and integration runtime in MW-Integration-Agent. The initial Daily-Use source workspace was relocated intact and restored.

## Target and resources

Parent discovery verified subscription `50f792fa-803e-4280-833d-1fe60fef5293`, tenant `9e29c895-606a-420b-acc2-1c24375df4d9`, resource group `RG-MWCREDIT`, VM `VM-01`, immutable `vmId` `0af4bbf5-ce75-43d7-931f-9e8c4a13dfe9`, Southeast Asia zone1, Standard_D4as_v4, Windows11 and a127GB StandardSSD_LRS OS disk. Static Standard public IP exists; networking is outside scope.

The owner-approved disabled bootstrap created `vm01-controller-50f792fa` and `stvm01ctl50f792fa` in Southeast Asia with Flex FC1, Node24 and512MB. Microsoft.App is now Registered. Full regional scale quota remains unverified; the deployed bootstrap does not prove maximum-scale capacity. Existing Grafana power-control role lacks restart and was preserved. [Applied resource/identity evidence](../../../../outputs/r050-vm01-controller/bootstrap/README.md).

Use one Linux Function app, Node24/TypeScript, Functions v4, Flex Consumption512MB, no always-ready instances, HTTP concurrency4 and maximum instance count40. Forty is a ceiling, not reserved or always-on capacity. All application APIs are HTTP-triggered; no permanent timers, idle shutdown, queue, database, Durable extension, APIM, Key Vault, private endpoint, NAT, extra website or Windows changes.

The dedicated GPv2 Hot LRS storage account holds host/deployment data and private controller state. System-assigned identity has current documented host Storage Blob Data Owner at that account, plus separately enumerated deployment-container Blob Data Contributor. The second grant is subsumed by account Owner for the same identity and adds no effective authority. Host authority can alter deployment data in this same-account design; it is not an isolated untrusted-worker boundary. Additional account/container isolation would be a separate design decision.

## Authentication

Three single-tenant Entra registrations: API, public browser SPA and dedicated Cloud caller. The static sign-in shell/assets expose no operational data. Browser uses MSAL5 authorization code+PKCE with memory-only tokens; same-origin redirect bridge at `/auth/callback`, including logout. The callback alone allows same-origin framing for silent authentication; no third-party scripts or authentication assets. No COOP header on the bridge.

API registration: request v2 access tokens; expose delegated `vm01.control`; define application roles `VM01.Status`, `VM01.Start`, `VM01.Restart`, `VM01.Deallocate`; request access-token optional claim `idtyp`. Browser check: `tid`, `aud`, SPA `azp`, exact allowed user `oid`, delegated scope and non-application identity. Cloud check: exact tenant/client/service-principal, `idtyp=app`, absence of delegated scope and the route's role. No Graph permissions are needed by the runtime.

Easy Auth requires authentication with401 responses and exact static-path exclusions. In-code jose validation independently checks the actual Bearer token using tenant-specific JWKS, RS256, issuer/audience/expiry/required claims. Cookie-only requests, Function keys, ID tokens and forged client-principal headers cannot authorize actions. This independent validation avoids mixing a cookie principal with an unrelated Authorization header. Function trigger `authLevel=anonymous` only avoids function-key authentication: deployed APIs still require platform Entra authentication and cryptographic application authorization.

POST requires JSON, a4KB body limit and no target fields. Foreign origins and cross-site browser metadata are rejected. Authorized originless machine calls are permitted. Mutations never use GET; no permissive CORS. Headers enforce no-store, CSP, no-referrer and no-sniff. Authentication material/error bodies are not logged. Operational records contain public request/caller/correlation identifiers and restricted approval references.

Cloud federation availability is unverified. Do not assume a Codex OIDC issuer or use GCP/IAP credentials. If no supported assertion exists, separately approve a certificate credential in the established private credential mechanism, with expiry/rotation/revocation ownership. No credentials or saved Cloud environments were changed in the source milestone or disabled bootstrap; allowed Cloud token issuance/status remains pending.

## ARM boundary and asynchronous behavior

The production ARM adapter explicitly uses ManagedIdentityCredential. It GETs the fixed VM with expanded instance view and can POST only start/restart/deallocate. No SDK poller can silently add access or automatically retry these POSTs. Requests have a10-second timeout and manual redirect behavior. Mutation response bodies are discarded rather than logged.

Base role: VM read, instanceView/read, start/action, restart/action and deallocate/action, assigned only at the exact resource. Runtime rechecks immutable vmId. Readiness of ChatGPT/executor is not established by power state; V1 always reports readiness unverified.

ARM202 means accepted. Start/deallocate under base permissions may resolve to `desired_state_observed` using fresh stable VM state; this is not authoritative ARM completion. Restart remains `accepted_unverified`, then unknown if the base waiting window expires; running alone never clears its latch. ARM synchronous200/204 is recorded as completed. Definitive4xx rejections release the latch; transport loss/ambiguous5xx/redirects retain unknown outcome. No automatic resubmission.

Optional polling is disabled by default. The adapter stores only vetted Azure-AsyncOperation (preferred) or Location URLs, requiring exact HTTPS `management.azure.com`, verified subscription, `Microsoft.Compute/locations/southeastasia/operations/<UUID>`, and a single date-form `api-version` query. Userinfo, ports, fragments, encoded path segments, other regions/subscriptions/hosts/endpoints and credential redirects are rejected. Unsupported returned URL formats require review, not broadening the allowlist during execution.

Azure-AsyncOperation200 requires its status body. Location202 means in progress; Location200/204 means terminal completion without requiring JSON. Retry-After is bounded15–300 seconds. Poll403 preserves accepted state, disables new commands and can resume polling after permission correction without resending POST. Succeeded requires a subsequent fresh desired-state observation before completing restart. Terminal Failed/Canceled retains status/sanitized failure code and safely releases serialization. Unknown dispatch outcomes still require manual reconciliation; knowing a tracking URL never proves a missed POST was safe to repeat.

The separate `Microsoft.Compute/locations/operations/read` proposal is unapproved. Generic ARM documentation describes resource-group permissions; Update Manager's explicit permission table lists Machine subscription scope. RG is only a candidate for approved verification. Subscription scope is a broader separately approved alternative; application URL restrictions do not restrict what that identity's RBAC can read. No operation-read deployment resource is included in main.bicep.

## Durable state and safety

One private2MB-bounded block-blob ledger uses a60-second renewable lease and conditional ETags. Before dispatch, intent is durably persisted and the lease is renewed to verify ownership. Generation advances atomically for every new admitted request, so different IDs using the same running snapshot cannot authorize repeated restarts. Dedupe lookup stays first. Lease contention returns409; clients retry the same request ID.

Seven-day completed-record retention;24-hour maximum new request age prevents old pruned IDs becoming fresh actions. Unresolved records are never pruned. Audit ring retains the latest1000 events, not an indefinite archival audit. External operator evidence may be needed for later recovery. Ledger absence/corruption/target mismatch/schema incompatibility, failed persistence or lost lease fail closed. Bootstrap is explicit, creates admission disabled, and cannot overwrite an existing ledger.

Persist-before-send cannot guarantee exactly-once delivery across Azure services: a crash at that boundary is ambiguous. The latch survives host recycling and scale-out; ambiguous actions are never automatically replayed. An administrator must disable admission, fence/drain old workers, inspect authoritative evidence and update the ledger with expected generation and ETag. A flag alone does not physically fence workers. If absence of a late dispatch cannot be proved, keep admission disabled.

Restart/deallocate require confirmation of saved work and held new VM tasks. V1 has no task heartbeat or technically enforceable idle detection. Dots/owner must coordinate admission with other executors. Auto-login/autostart were user-reported and reconnect observed by the parent; these security mechanisms were not audited or changed.

## Microsoft references

- [ARM async permissions and polling](https://learn.microsoft.com/en-us/azure/azure-resource-manager/management/async-operations)
- [Update Manager permission scopes](https://learn.microsoft.com/en-us/azure/update-manager/roles-permissions)
- [Functions identity/storage connections](https://learn.microsoft.com/en-us/azure/azure-functions/manage-connections?pivots=functions-auth-identity&tabs=host)
- [Flex identity deployment storage](https://learn.microsoft.com/en-us/azure/azure-functions/flex-consumption-how-to#configure-deployment-settings)
- [Microsoft Flex Bicep sample](https://github.com/Azure-Samples/azure-functions-flex-consumption-samples/tree/main/IaC/bicep)
- [Entra application authorization](https://learn.microsoft.com/en-us/azure/app-service/configure-authentication-provider-aad)
- [MSAL5 redirect bridge](https://github.com/AzureAD/microsoft-authentication-library-for-js/blob/dev/lib/msal-browser/docs/redirect-bridge.md)
- [Blob concurrency](https://learn.microsoft.com/en-us/azure/storage/blobs/concurrency-manage)
