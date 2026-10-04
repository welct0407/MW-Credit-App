# R050 - VM01 Cloud application certificate - 4 October 2026 UTC

Owner approved certificate and Personal Vault setup for the existing VM01 Controller Codex Cloud application with its four existing roles. This batch generated one certificate on VM-01 and registered only its public certificate. Shutdown remains explicitly ON HOLD. No power request, controller deployment, controller configuration, role/consent or browser-access change was performed.

## Scope and evidence

Application client `af64b0c6-261c-45a0-b653-a71d382edb92`, application object `a7f9baed-fc3c-4514-bfe8-e4436f73b202`, principal `d01d70be-d205-4ac9-a7fc-a18dd48e0633`, tenant `9e29c895-606a-420b-acc2-1c24375df4d9`. Starting documentation commit `07c8a21f337b04c128d138cd4b16679a244b0f45`; isolated documentation worktree preserves prior controller branches and unrelated work.

[Sanitized registration receipt](../outputs/r050-vm01-controller/cloud-certificate/registration-20261004.json) records fingerprints, validity, key ID and private local paths, never key material or tokens. RSA-3072, self-signed SHA-256, digital-signature use, PKCS#8 PEM private key. Valid 2026-10-04 04:43:13 UTC through 2027-01-02 04:43:13 UTC. Registration readback verified at 04:44:17 UTC.

The dedicated directory under the established owner credential location was verified outside Git before generation. Its inheritance is disabled; only AzureAD\MWCredit, VM-01\ideaadmin and SYSTEM have access. The private file's inherited permissions were independently verified against those three identities. Existing parent permissions were not modified. Exclusive file creation and a durable generation-intent record prevent blind duplicate generation. Key/public-certificate match and a local sign/verify challenge passed; public DER, fingerprint, validity and key ID match Microsoft Graph readback exactly. Exactly one certificate is registered; pre-existing certificate/password collections were empty. Selected other application properties, service principal settings and all four effective API role assignments match the captured pre-change baseline.

Only keyCredentials was patched using the [Microsoft Graph application update API](https://learn.microsoft.com/en-us/graph/api/application-update?view=graph-rest-1.0). No private key was transmitted. Files changed in this evidence batch are this log and the linked JSON receipt; no controller implementation changed.

## Handoff, recovery and remaining verification

Owner must enter the local private PEM directly into Personal Vault scoped only to the AppSheet-Loan-Project Cloud environment. Do not put it in chat, logs, Git or a tool response. The separate Cloud helper task owns Vault binding and status-only end-to-end verification. Neither Vault entry nor token acquisition/controller API success is claimed by this receipt. No live power test is authorized while the hold persists.

Recovery coverage currently consists of the private local original; Git publication covers only sanitized evidence. Preserve the original pending verified Vault handoff. Rotation must occur before expiry; no rotation automation was created. Baseline metadata is retained privately in the same restricted folder. To revoke this credential, remove only key ID `cb0bf063-6202-4c9c-83d6-0ba70b09002b` from the existing application while preserving any subsequently added credentials. Revocation was not performed, and previously issued token expiry must be considered. No prior credential was replaced or deleted.

Status: certificate generation and public registration complete; owner Vault entry, Cloud consumption and unattended invocation verification pending. R050 remains Open. No data-model, AppSheet, database or report change.
