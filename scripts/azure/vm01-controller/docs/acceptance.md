# R050 controller acceptance

Source milestone only. Tests use mocked ARM, a conditional/leased in-memory Blob port, cryptographically signed isolated JWT fixtures and real headless Chromium with mocked MSAL. No Azure actions or live sign-ins are performed.

Latest local result: **45 tests passed** with Node24.19.0/npm11.9.0. TypeScript strict build and bundled app/redirect bridge pass. Bicep CLI0.47.16 compiles main.bicep, including the exact-VM role module, without diagnostics. Infrastructure-policy and source-package checks pass; command output and hashes are recorded in [task evidence](../../../../outputs/r050-vm01-controller/README.md).

## Coverage

| Suite | Evidence |
| --- | --- |
| authorization-http.test.mjs | Cryptographic verification, expired/wrong audience/issuer, exact user/client/tenant/scope, app identity/roles, cookie/key/principal spoofing, foreign origins, form/GET/unknown routes, arbitrary targets,4KB body limit, credential-free errors. |
| controller.test.mjs | Duplicate receipts, conflicts across caller/body, concurrent requests, intent/result persistence failures, lost lease, ambiguous responses, fresh target/state, no-ops, work confirmation, expiry, corrupt storage, disabled admission, private receipt lookup. |
| optional polling tests | Disabled polling makes no GET; terminal success plus fresh desired state;403 pauses/resumes same operation without POST; terminal failures retain details and release latch. |
| arm-ledger.test.mjs | Exact fixed-target requests, no redirects/retries, SSRF/path/region/subscription/query rejection, invalid returned URLs discarded, Azure-AsyncOperation versus Location semantics, ETag fencing, corrupt schema/config. |
| administration.test.mjs / infrastructure.test.mjs | Guarded admission/reconciliation, operator fencing attestation, generation checks, exact base RBAC actions and empty exclusions/data-actions, inert defaults, approval/template agreement. |
| browser.test.mjs | Real Chromium confirms saved-work workflow; Escape/Cancel after an earlier confirmation never submit; same-origin MSAL bridge iframe loads under CSP; server failure preserves ID; same-ID retry does not repeat POST; no localStorage token persistence. |

Astra review found three safety bugs and two integration defects: unchanged generation permitted two different IDs from the same running snapshot; stale VM sample could clear a restart latch; dialog Escape could reuse confirmation; Location200/202 semantics were incomplete; CSP omitted self frames. All were fixed with targeted controller/adapter/real-browser regressions before source publication.

## Remaining live acceptance

- Approved actual tenant registrations/consent/session, exact browser owner OID and daemon idtyp/role token issuance.
- Platform Easy Auth exclusions/401 behavior, Function route registration, default HTTPS hostname and callback through the actual browser.
- System-assigned identity, host/deployment storage roles, RBAC propagation, ledger bootstrap and admission switches.
- Regional quota/provider registration, pricing/grant eligibility and real host/storage overhead.
- Optional operation-read scope decision and authorized real-operation URL/status verification.
- Separate exact power-test timing with held work, reconnection observed independently and unknown-outcome recovery operator available.

No AppSheet app, SQL, dashboard or business-service runtime behavior changed. No app/DB promotion is claimed. R050 remains Open; the controller remains undeployed and live approval incomplete.
