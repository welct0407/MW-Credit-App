# Azure VM-01 controller - R050 disabled bootstrap

One Azure Function serves the browser UI and authenticated fixed-VM status/start/restart/deallocate endpoints at https://vm01-controller-50f792fa.azurewebsites.net. Reviewed routing source `614ea6496bcd796611080e69f8fc78276304bb8a` is deployed; intended MW Credit browser status passed at06:19:26 UTC on2 October2026. Commands, ledger admission and operation polling are now enabled under separate scoped approval; the one-action subscription operation-status read role is assigned. Live power/operation-status verification awaits independent recovery and executor completion. Custom domain is deferred and direct-tool authentication remains parent-owned. [Activation and test handoff](../../../outputs/r050-vm01-controller/activation/README.md). [Deployment and acceptance evidence](../../../outputs/r050-vm01-controller/status-diagnosis/routing/README.md). The original e025017 bootstrap and source-only Bicep serialization repair remain historical evidence; no infrastructure deployment was included. Source belongs to AppSheet-Loan-Project under the owner's1 October clarification.

Current browser access is assigned to **MW Credit** (`mwcredit@idea.100-5.com`, object ID `fa56579a-7b3a-493a-9eb1-d36671a60b32`) after the approved 2 October 2026 (UTC) four-change switch. The former owner is removed from both controller allowlists and its dedicated controller consent is retired; its Azure/directory roles are unchanged. [Account-switch readback and remaining acceptance](../../../outputs/r050-vm01-controller/account-switch/README.md). Authenticated replacement status passes; former-user token denial remains pending.

The base managed-identity role has exactly five VM actions assigned only at VM-01. Asynchronous restart acceptance is **not completion**. Without separately approved operation-status read access, the controller retains a serialization latch and requires administrator reconciliation. Optional server-side polling is implemented and disabled by default.

The deployed source now distinguishes access-token acquisition, incomplete transport, invalid/empty HTTP responses and known JSON controller errors during status checks. HTTP failures show the status and only allowlisted public error codes; raw response bodies and authentication details are never displayed. Failed checks clear the usable snapshot, show Unknown and keep actions disabled. The owner-approved code-only package from `4a506465f96b5d8eaa78ed6bf723da6de12bb740` is deployed, its assets match the reviewed ZIP, and all access settings and disabled controls are preserved. [2 October diagnosis, tests and deployment receipt](../../../outputs/r050-vm01-controller/status-diagnosis/README.md). Authenticated live status remains unverified; the original bootstrap pin above is historical and no Bicep provisioning was reapplied.

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
