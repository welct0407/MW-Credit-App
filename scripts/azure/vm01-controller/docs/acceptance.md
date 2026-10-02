# R050 controller acceptance

Source tests and separately recorded disabled-bootstrap evidence. Tests use mocked ARM, a conditional/leased in-memory Blob port, cryptographically signed isolated JWT fixtures and real headless Chromium with mocked MSAL. No Azure actions or live sign-ins are performed.

Latest VM-01 local result: **46 tests passed** with Node24.19.0/npm11.6.1 and fresh sandboxed Edge154.0.4258.48. TypeScript strict build and bundled app/redirect bridge pass. Bicep CLI0.47.16 compiles main.bicep, including the exact-VM role module, without diagnostics. Infrastructure-policy and source-package checks pass; command output and hashes are recorded in [task evidence](../../../../outputs/r050-vm01-controller/README.md).

## Coverage

| Suite | Evidence |
| --- | --- |
| authorization-http.test.mjs | Cryptographic verification, expired/wrong audience/issuer, exact user/client/tenant/scope, app identity/roles, cookie/key/principal spoofing, foreign origins, form/GET/unknown routes, arbitrary targets,4KB body limit, credential-free errors. |
| controller.test.mjs | Duplicate receipts, conflicts across caller/body, concurrent requests, intent/result persistence failures, lost lease, ambiguous responses, fresh target/state, no-ops, work confirmation, expiry, corrupt storage, disabled admission, private receipt lookup. |
| optional polling tests | Disabled polling makes no GET; terminal success plus fresh desired state;403 pauses/resumes same operation without POST; terminal failures retain details and release latch. |
| arm-ledger.test.mjs | Exact fixed-target requests, no redirects/retries, SSRF/path/region/subscription/query rejection, invalid returned URLs discarded, Azure-AsyncOperation versus Location semantics, ETag fencing, corrupt schema/config. |
| administration.test.mjs / infrastructure.test.mjs | Guarded admission/reconciliation, operator fencing attestation, generation checks, exact base RBAC actions and empty exclusions/data-actions, inert defaults, approval/template agreement, both compiled switch branches and real configuration parsing across all four boolean combinations. |
| browser.test.mjs | Fresh sandboxed Windows Edge with deterministic fixture Date.now confirms saved-work workflow; Escape/Cancel after an earlier confirmation never submit; same-origin MSAL bridge iframe loads under CSP; server failure preserves ID; same-ID retry does not repeat POST; no localStorage token persistence. |

Astra review found three safety bugs and two integration defects: unchanged generation permitted two different IDs from the same running snapshot; stale VM sample could clear a restart latch; dialog Escape could reuse confirmation; Location200/202 semantics were incomplete; CSP omitted self frames. All were fixed with targeted controller/adapter/real-browser regressions before source publication.

## Verified disabled-bootstrap checkpoint

The owner-approved infrastructure, exact Entra/base RBAC, original pinned code and disabled ledger are deployed. HTTPS/Easy Auth configuration, exact callback, public UI/config and pinned assets were verified; anonymous, malformed-token and spoofed-identity status requests401. Host/deployment storage and operator ledger read/write were exercised. Actual identities/scopes and hashes are in [bootstrap evidence](../../../../outputs/r050-vm01-controller/bootstrap/README.md). Source repair after that checkpoint has not been redeployed.

## Browser-account switch - 2 October 2026 (UTC)

The owner approved switching to MW Credit. Exact replacement-specific `vm01.control` consent, runtime browser allowlist and Easy Auth principal replacement were applied; the former controller consent was removed after both allowlists passed readback. Azure RBAC, Cloud roles/identity, managed identity, other authentication/settings, hostname/callback and ledger byte hash compare unchanged. Both switches and ledger admission remain disabled. [Sanitized account-switch evidence](../../../../outputs/r050-vm01-controller/account-switch/README.md).

The supplied screenshot shows a signed-in account and red "Connection or sign-in failed. Actions are disabled." This is incomplete authenticated API acceptance. The UI catch-all does not establish an RBAC cause. Public200/anonymous401 checks prove only those behaviors; no replacement user token was obtained, no authenticated status success or former-user authenticated token rejection is claimed.

## Remaining live acceptance

- Actual intended MW Credit browser session and authenticated status; Cloud credential/federation decision and application-token issuance/status with idtyp/roles. No supported live browser-control tool is exposed in this VM task.
- Effective runtime managed-identity VM/ledger access and allowed/denied caller tests after RBAC propagation; the ARM assignment readback alone is not this proof.
- Full regional scale quota, remaining shared grant and measured host/storage/network overhead under the approved US$2/month planning budget.
- Optional operation-read scope decision and authorized real-operation status verification; operation polling remains disabled.
- Separate mutation/admission activation approval and exact power-test timing with held work, independent reconnection and recovery operator.

No AppSheet app, SQL, dashboard or integration-service promotion is claimed. R050 remains Open. Commands/admission/polling remain disabled; no Azure change or live sign-in/power test was performed during source repair.
