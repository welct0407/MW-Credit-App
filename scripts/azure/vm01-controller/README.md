# Azure VM-01 controller - R050 disabled bootstrap

One Azure Function serves a small browser UI and authenticated status/start/restart/deallocate endpoints for the fixed VM-01. The approved disabled bootstrap is deployed at https://vm01-controller-50f792fa.azurewebsites.net from commit `e02501786af5f8a9ca7073c08244eb6afc4e08af`. Commands, ledger admission and operation polling remain disabled; allowed-caller authenticated acceptance is pending. [Applied identities, scopes and verification](../../../outputs/r050-vm01-controller/bootstrap/README.md). The current source repairs lowercase Bicep switch serialization and has not been redeployed. Source belongs to AppSheet-Loan-Project under the owner's 1 October 2026 clarification; Daily-Use remains personal-use only.

Current browser access is assigned to **MW Credit** (`mwcredit@idea.100-5.com`, object ID `fa56579a-7b3a-493a-9eb1-d36671a60b32`) after the approved 2 October 2026 (UTC) four-change switch. The former owner is removed from both controller allowlists and its dedicated controller consent is retired; its Azure/directory roles are unchanged. [Account-switch readback and remaining acceptance](../../../outputs/r050-vm01-controller/account-switch/README.md). Authenticated replacement status and former-user token denial are pending.

The base managed-identity role has exactly five VM actions assigned only at VM-01. Asynchronous restart acceptance is **not completion**. Without separately approved operation-status read access, the controller retains a serialization latch and requires administrator reconciliation. Optional server-side polling is implemented and disabled by default.

- [Design and decisions](docs/design.md)
- [Operations, activation and recovery](docs/operations.md)
- [Acceptance evidence and remaining tests](docs/acceptance.md)
- [Precise approval manifest](docs/approval-manifest.json)
- [Approval bundle explanation](docs/approval-bundle.md)
- [Optional operation-read proposal](infra/operation-read-proposal.json)
- [R050 change log](../../../Change%20Logs/CHANGE_NOTES_R050_VM01_CONTROLLER_2026-10-01.md)

## Local development

Use Node 24 and npm. Codex Cloud has the available supported toolchain. The project's Windows runtime/junction instructions still govern VM-01; do not change that runtime or install output-local dependencies as a side effect.

```bash
cd scripts/azure/vm01-controller
npm ci --ignore-scripts
npm test
npm run check
npm run package
```

Browser tests use system Chromium by default at `/usr/bin/chromium`; override `VM01_TEST_CHROMIUM` when its executable is elsewhere. All Azure, Entra token and browser sign-in behavior in these tests uses isolated fixtures. Ephemeral test signing keys are never Azure credentials and are not persisted.

`npm run package` stages build output under ignored `dist/package/`. It is not a deployed or final deployable ZIP: after approval, install locked production dependencies in that staging directory, create the final ZIP and record its hash. No secret or runtime ledger belongs in the staging directory. Compile Bicep without contacting Azure using `bicep build infra/main.bicep --outfile <outside-source-output>`.

Production imports require valid public configuration. `configuration.example.json` is deliberately incomplete until API/SPA registrations are approved; missing or invalid identifiers stop initialization. There is no repository-local secret setup file.

## API behavior

| Route | Meaning |
| --- | --- |
| `GET /api/vm01/status` | Fresh observation, available actions, generation and current receipt; optional `requestId` retrieves the caller's own receipt. |
| `POST /api/vm01/start` | Start the configured VM; already-running is a persisted no-op. |
| `POST /api/vm01/restart` | Confirm interruption and submit once; ARM202 remains unverified until reconciliation. |
| `POST /api/vm01/deallocate` | Confirm interruption and deallocate; already-deallocated is a no-op. |

POST JSON includes `requestId` (`<13-digit Unix milliseconds>.<UUIDv4>`), `stateVersion` and `observedAt` from status. Restart/deallocate additionally require `confirmation: {workSaved: true, admissionHeld: true, approvalReference: "scoped-owner-reference"}`. New requests expire after24 hours; observations after120 seconds. Duplicate lookup precedes freshness/state checks; reuse the same ID and identical body after a timeout.

Do not supply target resource IDs, ARM URLs, commands, credentials or arbitrary parameters. UI label **Stop — deallocate** means releasing compute allocation; retained disks and network resources can still incur costs. `executorReady` is always null in V1.
