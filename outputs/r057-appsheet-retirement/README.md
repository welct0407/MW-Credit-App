# R057 AppSheet retirement

13 October 2026 (Asia/Bangkok). **In progress; license revocation remains the owner's action.** The owner authorized retiring all four AppSheet apps and removing remaining active AppSheet integration dependencies before personally revoking the license. The apps' definitions, SQL databases, historical receipt objects and recovery evidence are retained.

## Scope and authority

The first authorized retirement mutation was at **2026-10-13T16:37:00Z**: AppSheet API-key disablement. This starts R057 production retirement and therefore triggers the scope freeze/number handoff; the earlier import-only infrastructure adoption did not itself freeze the release. R057 is Frozen; R058 is the sole Open development release, next unused R059. Published and installed integration source: `a8568e385051a20a3b7efd3374bade6c193d6882`; F evidence/application package: `5213ed2cb79aab7eed0a2f0b61c589f7b6951fc4`. Root coordinates live GUI work; B owns integration removal; F owns runtime delivery/configuration and verification; D owns these project records.

Selected apps: Loan Business Insights; Loan Manager ผู้จัดการสินเชื่อ; MW-OLTP-DEV-20260919; MW-OLAP-DEV-20260919. For each app, pause access through the current editor, separately disable enabled bots and API/key access, save, and verify persistence. Pausing access alone is not recorded as bot/API shutdown proof. This is retirement rather than an App Upgrade, so no RC copy or App Upgrade is required.

## Verified and pending state

| Component | Current evidence | Remaining |
| --- | --- | --- |
| PROD OLAP — Loan Business Insights | Starting restorable version 1.100215. Root verified saved API Enable=false, disabled API key and two disabled bots. Reload showed Resume Paused App; no editor issues. | Final version/identity and retirement closure evidence |
| PROD OLTP — Loan Manager ผู้จัดการสินเชื่อ | Starting restorable version3.000275. Root saved API Enable=false/key disabled (expired16:43UTC), ten disabled bots (seven changed/three already disabled). | Pause persistence, final version and diagnostics |
| DEV OLTP — MW-OLTP-DEV-20260919 | Pending root GUI readback | Pause, bots, API/key saved persistence, version and diagnostics |
| DEV OLAP — MW-OLAP-DEV-20260919 | Pending root GUI readback | Pause, bots, API/key saved persistence, version and diagnostics |
| Integration source removal | Published [a8568e3](https://github.com/welct0407/MW-Integration-Agent/commit/a8568e385051a20a3b7efd3374bade6c193d6882) on codex/r057-appsheet-retirement. B reports focused checks: 49 passed, one skipped. | [Draft integration PR4](https://github.com/welct0407/MW-Integration-Agent/pull/4); final B scope reconciliation |
| Deployed integration/configuration | Installed a8568e3/catalogue27; verified16:42:41.705571UTC. Both native scopes and unused-UUID receipt status passed before six unchanged original timers resumed. AppSheet enabled=false; five legacy fields and two active key files removed; all other configuration preserved. [Pinned F evidence](https://github.com/welct0407/MW-Credit-App/blob/5213ed2cb79aab7eed0a2f0b61c589f7b6951fc4/outputs/r057-appsheet-retirement/infrastructure-evidence.json) | Temporary SSH cleanup limitation below |
| License revocation | Owner will perform after technical retirement | Owner confirmation; no agent license operation |

No SQL migration, business-data deletion, receipt-object deletion, secret rotation, Azure controller change or app-definition deletion is included. Retain native receipt paths and compatibility identifiers such as `appsheet_delete` where they identify historical/native SQL behavior. Removing adapters does not rename historical financial/audit records.

## Recovery and limits

PM starting commit: `b79ff89dbe87f64c244f6ccd8eb07426033eef43`. The existing dirty Phase 2 credential section/index row, log and output are preserved and excluded from this publication. App restorable starting versions and F's runtime/configuration recovery pins belong in the final manifest. A code rollback alone must not be represented as re-enabling AppSheet; restoring access/bots/API after retirement requires coordinated owner direction and license availability. No financial write or forced notification is used for validation.

The [single R057 checklist](../r057-infrastructure-adoption/promotion-checklist.md) covers the existing adoption and this retirement extension. Completion requires saved-state proof for all four apps, published tested integration source, deployed/native smoke evidence and current documentation. License revocation remains separately labeled until the owner confirms it. No blanket claim about every historical AppSheet reference is made.

Temporary SSH cleanup was rejected by automatic approval review before execution, with reason blocked by policy. No workaround was attempted. Metadata expires2026-10-13T17:31:44Z; the private local key remains outside repositories for20October review. F verified four root-only recovery files; package recovery and exact configuration proofs are in the pinned evidence.
