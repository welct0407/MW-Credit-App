# R050 approved browser-account switch - 2 October 2026 (UTC)

The user approved switching controller browser access to MW Credit (`mwcredit@idea.100-5.com`, object ID `fa56579a-7b3a-493a-9eb1-d36671a60b32`). All four scoped changes completed with independent configuration/preservation readback. **Authenticated API acceptance remains pending.** R050 stays Open; VM mutations, operation polling and ledger admission remain disabled.

- [Applied consent, before/after allowlists and preservation receipt](receipt.json)
- [Identity, existing VM login role and privilege visibility limits](discovery.json)
- [Four-operation write journal](write-journal.jsonl)
- [Public/pinned HTTP routes and anonymous401](http-verification.json)
- [Focused source checks and current source hash](source-validation.json), [test output](tests.log)
- [Current approval manifest](../../../scripts/azure/vm01-controller/docs/approval-manifest.json)
- [Original disabled-bootstrap evidence](../bootstrap/README.md)

The replacement is an enabled Entra Member. Its existing **Virtual Machine Administrator Login** assignment remains at exact VM-01; VM Contributor was not observed. Directory active roles, membership and owned-object reads returned empty. PIM role/group eligibility could not be fully inspected through existing CLI scopes; Azure eligibility reported an Entra premium/governance licensing requirement. This is a visibility limit, not proof of no eligible privilege or a reason to change roles/licensing.

Changes: exact `Principal` consent `vm01.control` from browser service principal `065bf299-b083-422e-916b-a94c3f13429c` to API service principal `334488ef-db87-49e1-af98-27b0b2f31dc2`; runtime browser allowlist replaced; Easy Auth owner principal replaced while Cloud principal `d01d70be-d205-4ac9-a7fc-a18dd48e0633` retained; old exact controller consent removed after both allowlists passed readback. The former account's Azure/directory privileges are unchanged. Existing Cloud API grants, managed identity/RBAC, callback, hostname, other settings/authentication and ledger byte hash compare unchanged.

Public UI/assets/config still match the original deployed pin `e025017`; anonymous status is401. The signed-in screenshot with red "Connection or sign-in failed. Actions are disabled." is **incomplete API acceptance**, with cause unproven. No user token was obtained, no replacement authenticated status success or former-user authenticated token denial was exercised, and application health behind Easy Auth is not proven by anonymous401. Deleting consent prevents new tokens under that grant; existing tokens may remain valid until expiry, while both current allowlists exclude the former user. [Microsoft consent-deletion behavior](https://learn.microsoft.com/en-us/graph/api/oauth2permissiongrant-delete?view=graph-rest-1.0).

The source deployment example and current manifest now use the replacement, avoiding future restoration of the former owner. Original bootstrap receipts/parameters/hashes remain intact as historical evidence. No production TypeScript/Bicep logic changed, no code deployment/VM action/domain or credential/Azure-role change occurred. The desired future hostname `vmcontroller.mw-credit.com` remains on hold. US$2/month remains the existing planning budget, not a cap.

The prior46-test source repair remains pinned by `ab4fb7c799e0f34ee073bf2031ce0c14443c7ac1` and [its validation](https://github.com/welct0407/MW-Credit-App/blob/4a14d07/project/outputs/r050-vm01-controller/validation.json). This configuration/record change uses focused infrastructure and evidence checks recorded separately; it does not claim a repeated full46-test run. Publication updates existing draft PR2 without merge. Astra Extra High advised the exact PUT/readback and old-consent retirement sequence.
