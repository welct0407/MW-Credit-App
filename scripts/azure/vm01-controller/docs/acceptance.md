# R050 controller acceptance

Current controller checkpoint, 2 October 2026 UTC: the first deallocate succeeded but its receipt is stuck accepted because no tracking URL was retained. The parent recovered VM-01 with a separately approved portal Start; current VM is running/Succeeded. No Restart was performed. A source repair and exact historical-reconciliation tool pass45 focused tests and live read-only evidence verification at08:25 UTC. Candidate deployment, temporary controller fencing, ledger reconciliation and gate restoration await exact scoped review/approval. Deployed source remains614ea649; live generation3 receipt is preserved. This executor made no power, ledger, access or setting mutation during diagnosis/repair. R050 stays Open; PR2 stays draft. [Evidence, patch and exact recovery/deployment approval bundle](../../../../outputs/r050-vm01-controller/tracking-recovery/README.md).

Source tests and separately recorded disabled-bootstrap evidence. Tests use mocked ARM, a conditional/leased in-memory Blob port, cryptographically signed isolated JWT fixtures and real headless Chromium with mocked MSAL. No Azure actions or live sign-ins are performed.

Current routing validation: strict TypeScript, bundling and23/23 focused tests pass, including the real Functions host, browser diagnostics, existing browser behavior and authorization checks. The real-host test passed again after test-port hardening. Astra Extra High passed the final diff. Parent cloud-browser Refresh status with the intended MW Credit session passed at06:19:26–06:19:34 UTC on2 October2026; no error and all power buttons disabled. [Routing test and acceptance evidence](../../../../outputs/r050-vm01-controller/status-diagnosis/routing/README.md).

Earlier full-suite repair checkpoint: **46 tests passed** with Node24.19.0/npm11.6.1 and fresh sandboxed Edge154.0.4258.48. TypeScript strict build and bundled app/redirect bridge passed. Bicep CLI0.47.16 compiled main.bicep and the exact-VM role module without diagnostics. This retained evidence does not claim a full-suite repeat for routing.

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

Historical bootstrap acceptance: owner-approved infrastructure, exact Entra/base RBAC, original pinned code and disabled ledger were deployed. HTTPS/Easy Auth configuration, callback, public UI/config and pinned assets were verified; anonymous, malformed-token and spoofed-identity status requests401. Host/deployment storage and operator ledger read/write were exercised. Actual identities/scopes and hashes remain in [bootstrap evidence](../../../../outputs/r050-vm01-controller/bootstrap/README.md). Subsequent diagnostic and routing deployments above changed code only; Bicep source repair remains template-only.

## Browser-account switch - 2 October 2026 (UTC)

The owner approved switching to MW Credit. Exact replacement-specific `vm01.control` consent, runtime browser allowlist and Easy Auth principal replacement were applied; the former controller consent was removed after both allowlists passed readback. Azure RBAC, Cloud roles/identity, managed identity, other authentication/settings, hostname/callback and ledger byte hash compare unchanged. Both switches and ledger admission remain disabled. [Sanitized account-switch evidence](../../../../outputs/r050-vm01-controller/account-switch/README.md).

The supplied screenshot shows a signed-in account and red "Connection or sign-in failed. Actions are disabled." This is incomplete authenticated API acceptance. The UI catch-all does not establish an RBAC cause. Public200/anonymous401 checks prove only those behaviors; no replacement user token was obtained, no authenticated status success or former-user authenticated token rejection is claimed.

## Remaining live acceptance

- Parent must confirm an independent Azure recovery operator can Start VM-01 if the controller fails. The cloud-browser controller session survives VM shutdown, but cannot replace that fallback. Current MW Credit portal Start permission is unproven.
- After this VM task ends and external VM work admission is held, parent performs the approved one deallocate/start/restart sequence. Verify terminal operation status and reconnection; running alone is not executor readiness.
- The separately approved subscription operation-status read role and true polling switch have passed configuration readback. Effective managed-identity polling of a real approved operation remains pending; no power request was sent to manufacture evidence.
- Intended MW Credit browser status and runtime VM/ledger access passed at06:19 UTC. Former-user token denial and direct-tool/MCP authentication remain separate unfinished checks; no new credential or adapter was created.
- Full regional scale quota, remaining shared grant and measured host/storage/network overhead remain unmeasured under the US$2/month planning budget. Custom domain is explicitly deferred.

No AppSheet app, SQL, dashboard or integration-service promotion is claimed. R050 remains Open. Earlier source repair performed no live power test. Current approved activation is documented above; this executor still sent zero power requests.
