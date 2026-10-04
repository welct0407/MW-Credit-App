# Cloud certificate client — R050

This source-only helper authenticates the existing **VM01 Controller Codex Cloud** app and performs a single controller status GET. It has no power-action method, token-output command, background timer, credential creation or infrastructure setup. Shutdown remains on hold. App-only authentication removes repeated browser sign-in for this helper; it does not remove certificate renewal or authorize a power operation.

## Verified public identity and scope

Parent-supplied VM-worker metadata, **4 October 2026, 04:38:37 UTC**, verifies the tenant, app/service principal, API audience, controller/EasyAuth allowlists, v2 token configuration with optional `idtyp`, all four enabled roles, and absence of prior credentials. This Cloud executor did not repeat live discovery. Actual role assignments and configuration must remain aligned; `.default` requests the app's assigned roles and does not narrow its authority to the helper's status operation.

| Public identity | Value |
| --- | --- |
| Tenant | `9e29c895-606a-420b-acc2-1c24375df4d9` |
| Client app | `VM01 Controller Codex Cloud` |
| Client ID | `af64b0c6-261c-45a0-b653-a71d382edb92` |
| Application object | `a7f9baed-fc3c-4514-bfe8-e4436f73b202` (repository record; parent verifies before registration) |
| Service principal | `d01d70be-d205-4ac9-a7fc-a18dd48e0633` |
| API audience | `f8fc0efe-38ac-489a-b2b4-98d1afc9505b` |
| Token scope | `api://f8fc0efe-38ac-489a-b2b4-98d1afc9505b/.default` |
| Disclosed API roles | `VM01.Status`, `VM01.Start`, `VM01.Restart`, `VM01.Deallocate` |

The owner approved the dedicated certificate and Personal Vault setup for these existing roles. This grants no Azure management/Graph permissions, new application, additional role, deployment, merge or shutdown authority. The controller's existing managed identity performs its authorized server-side work; this client never calls ARM or uses the GCP credential.

**Historical parent-reported registration:** public SHA1 thumbprint `97FC04F50F819DA8042B95982E9EB0698D03C021`, key ID `cb0bf063-6202-4c9c-83d6-0ba70b09002b`, validity **2026-10-04T04:43:13Z through 2027-01-02T04:43:13Z**. [Published public registration evidence](https://github.com/welct0407/AppSheet-Loan-Project/blob/c621c773623938385f965602f79063e457fb7257/outputs/r050-vm01-controller/cloud-certificate/registration-20261004.json). The owner subsequently requested longer validity; parent is seeking approval for a **two-year replacement**. **Hold Vault key entry until the parent identifies the final approved certificate; do not transfer the earlier key.** Replacement generation/registration and retirement of the earlier certificate remain solely parent/VM-worker coordinated. SHA1 identifies portal registrations; the helper computes the assertion's SHA256 thumbprint from the supplied matching certificate and pins no certificate thumbprint or lifetime.

## Secure setup and owner handoff

The parent coordinates **one VM worker as the sole generator and registrar**. Cloud must not generate a duplicate certificate. Keep private material at the established VM private location, preferably a project folder under `C:\Users\MWCredit\Documents\ChatGPT`, outside every repository. Use an RSA key of at least 3072 bits and the certificate validity settled by the parent and owner; the current proposal is a **two-year replacement, approval pending**. The helper accepts an unencrypted PKCS#8 PEM private key and its matching X.509 PEM certificate without a maximum-lifetime restriction; protect that local private export until secure entry/recovery is verified. Do not display, attach, commit or transmit it through chat, tool arguments or agent-managed uploads.

1. Parent first settles the replacement's approval and identifies the final certificate. Before registration, verify the named existing app/client and exact approved roles using the parent's approved route. In Entra **App registrations → VM01 Controller Codex Cloud → Certificates & secrets → Certificates → Upload certificate**, register only the **public `.cer` certificate**. Preserve existing credentials until their separately authorized retirement and record only public thumbprints, validity and registration/key identifier. Never upload the private-key file to Entra.
2. The **owner** opens **Settings → Codex Cloud → Personal vault → Add**. Choose **Environment variable** under Type, enter one exact key below, and enter its value directly from the protected local source. Under **Applies to**, choose **Selected environments → AppSheet-Loan-Project**, then Save. Repeat for the second key. Do not choose All environments or Network secret.
3. Edit the saved **AppSheet-Loan-Project** Cloud environment so it requests those two exact keys. Recorded configuration identity is `asenvcfg_3a2448572dec8191953b5abcd390a004`; parent verifies the current saved identity, access scope and version. Configuration tools must request only the names, never request that the owner send their values in conversation. Personal entries are account-specific: another user's task does not acquire this owner's credentials by sharing the environment.
4. Confirm the two destinations below in the saved network policy. Personal variables do not automatically allow their destinations. Publish/republish the prepared environment as needed, then start a **fresh task** and verify the requested names are present without displaying values. The existing task's cached environment is not proof that the new saved setup works.
5. Under the parent's status-only authorization, run the helper once and verify the fixed app authenticates, the response identifies VM-01 and the observation is fresh. Record only sanitized result/public certificate expiry. Do not dump environment variables, run shell tracing or log HTTP request/response bodies. Final replacement registration, owner Vault entry, saved runtime delivery and live authentication remain pending until separate evidence confirms them.

| Requested Personal Vault key | Type and contents |
| --- | --- |
| `VM01_CONTROLLER_PRIVATE_KEY_PEM` | Environment variable; matching unencrypted PKCS#8 PEM, beginning `-----BEGIN PRIVATE KEY-----` |
| `VM01_CONTROLLER_CERTIFICATE_PEM` | Environment variable; public X.509 PEM, beginning `-----BEGIN CERTIFICATE-----` |

Both values are delivered directly to the owner's task process. This is managed credential delivery, **not nonexportable key storage**. The helper reads them only when explicitly invoked, parses/signs in memory, does not write key/token files and does not export tokens. Ordinary repository tests do not read these variables. Network substitution placeholders cannot sign an assertion locally.

**4 October formatting compatibility:** the helper also accepts a single-line PEM whose line breaks became ASCII spaces or tabs. It requires one exact matching BEGIN/END block, canonical padded base64 and one complete DER SEQUENCE, with no leading or extra material. It rejects escaped newlines, BOM, wrong labels, duplicate blocks, invalid base64 and trailing DER bytes. Normalization occurs only in memory; Vault entries and credential material are unchanged. Key strength, certificate validity and key/certificate matching checks still apply.

Fresh runtime validation after this fix: both variables present; both normalize and parse; key/certificate match; public SHA1 matches `2DCB559323F40445A04238B12E324DF2C67979AC`; expiry matches `2028-10-04T05:38:02Z`. The status attempt stops with `token_transport_failed`. A credential-free diagnostic POST to the same fixed Entra token endpoint classifies the transport as proxy-related HTTP 403 (`UND_ERR_ABORTED`); no raw error or response was emitted. Authenticated status remains unverified, and the parent must review the saved network allowlist for `login.microsoftonline.com:443` through the authorized environment route. No proxy bypass, environment/security/credential change or power operation was performed. This fresh result supersedes the earlier local PEM-format failure only; shutdown remains on hold.

| Permitted HTTPS destination | Exact request |
| --- | --- |
| `login.microsoftonline.com:443` | POST `/9e29c895-606a-420b-acc2-1c24375df4d9/oauth2/v2.0/token` |
| `vmcontroller.mw-credit.com:443` | GET `/api/vm01/status`, optional validated `requestId` query |

There is no caller-supplied URL, tenant, client, scope or VM target. Redirects are rejected. The npm launcher uses Node 24's `--use-env-proxy` to honor the Cloud environment's proxy settings. Do not bypass the platform proxy/network policy.

## Use and failure handling

From `scripts/azure/vm01-controller`, after the normal local build:

```bash
npm run cloud:status -- status
npm run cloud:status -- status --request-id 1791072000000.11111111-1111-4111-8111-111111111111
```

The second command is an example syntax only: use the original actual saved request ID. The helper validates arguments before reading credentials, makes one five-minute PS256 certificate assertion with `x5t#S256`, obtains an in-memory bearer token, and sends one status GET. It does not cache credentials/tokens, retry automatically or send a controller power POST. It bounds each HTTP request/response read to 15 seconds and JSON bodies to 64 KiB. It rejects missing/mismatched/weak keys and not-yet-valid certificates or certificates with five minutes or less remaining, malformed tokens, wrong targets, malformed/stale observations and missing/mismatched requested receipts. Microsoft documents the [certificate assertion format and registration procedure](https://learn.microsoft.com/en-us/entra/identity-platform/certificate-credentials).

Output is a projection of fixed VM identity, recognized power/provisioning states, freshness, generation/state version, boolean actions, receipt identity/action/phase/timestamps, null executor readiness and public certificate expiry/renewal flag. It omits free-form server reasons, tracking URLs and unexpected properties. Errors expose only a fixed code and optional HTTP status; no original exception, response body, assertion, key or token. Failure exits nonzero and yields no usable snapshot. A running/deallocated VM or accepted receipt does not establish verified completion or executor readiness. Unknown power state remains unknown. Status GET may perform the controller's existing ledger reconciliation; it does not dispatch power.

For 401/403, inspect the parent's public certificate registration, caller allowlists and role assignments using the existing authorized route. For transport/redirect errors, inspect permitted destinations/proxy policy and fixed-origin behavior. For invalid status data, diagnose server response semantics through sanitized evidence. Never add privileges or destinations as an automatic workaround. To revisit an accepted operation, retain its original ID and use status lookup; never manufacture another power request.

## Expiry, renewal and revocation

The owner is the renewal/revocation authority; the parent coordinates the same established worker. Record public validity and registration identifiers in the sanitized setup receipt. Begin renewal **30 days before expiry**; the helper returns `certificate.renewalDue` at that threshold. No new scheduler is installed. An expired certificate fails locally.

For routine rotation, generate/register one replacement through the same protected owner handoff, update the two scoped Vault values as a matching pair, and verify status from a fresh task before removing the old public certificate registration and protected local export. Avoid invoking the helper between the two value updates. Preserve the existing registration/secure recovery material until replacement is verified. Do not treat a lost key as authority to regenerate credentials without a coordinated authorized renewal.

For revocation, remove the affected certificate registration from the exact app, remove the two Vault entries and stop tasks holding the old environment. Already issued access tokens may remain usable until they expire; certificate removal does not guarantee their immediate revocation. If immediate caller denial is needed, the parent must use the existing access-control procedure with appropriate authorization. Do not broaden this helper into an access-management tool.

## Validation boundary

Offline tests use ephemeral mock signing keys, an injected mock credential loader/HTTP transport, and Node's public CA bundle for X.509 failure tests. No Azure certificate, token, credential registration or power operation is created by the tests. Signature verification, destination/method pins, redirect rejection, response limits, redaction, expiry/mismatch rejection, fresh observation checks and saved-receipt semantics are covered. A successful real matching certificate/key load, saved environment runtime delivery and controller app authentication require the parent's separate secure setup and live status evidence. This helper is excluded from the existing Function package's `dist/src` and `dist/web` copy; it requires no server deployment.

Personal Vault UI and delivery semantics were checked against the current [Cloud environments documentation](https://learn.chatgpt.com/docs/environments/cloud-environments). Public pins derive from the existing controller registration plus the parent-supplied fresh verification above.

**4 October 2026 source verification:** focused client suite **26 passed / 0 failed**, including the later two-year lifetime/replacement-thumbprint fixture; preceding full controller suite **110 total, 109 passed, 0 failed, 1 optional Functions-host case skipped** for unavailable fixture PFX. Production code was unchanged by that additional lifetime test. Strict TypeScript and whitespace checks pass. Real secure setup and app-only status verification remain pending; these mock results do not establish live authentication.
