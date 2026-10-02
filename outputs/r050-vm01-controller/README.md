# R050 VM-01 controller evidence

Current controller checkpoint, 2 October 2026 UTC: scoped owner approval enabled controls and the separate subscription Compute operation-status read grant. Verified at 2026-10-02T06:48:49.344594+00:00: mutations=true, polling=true, ledger admission=true at generation2, no active request or operation records. The original five-action VM role, authentication/consent/callback, hostname, logging and all other settings are unchanged. Deployed routing source remains614ea649; no code deployment or VM power action occurred. Browser status was accepted at06:19 UTC. One stop/deallocate → start → restart test is authorized, but awaits verified independent recovery and this VM executor's completion. Custom domain is deferred; direct-tool authentication remains parent-owned. R050 stays Open; PR2 stays draft. [Activation receipt and test handoff](activation/README.md).

Historical disabled-bootstrap checkpoint: original e025017 deployment and source-only Bicep serialization repair remain recovery evidence. The current routing deployment above supersedes the old code pin; no infrastructure/template deployment, credentials, polling, activation or power-test authority is added.

The approved 2 October browser account switch is applied: MW Credit replaces the owner in both controller allowlists and user-specific consent. [Current switch evidence and focused source checks](account-switch/README.md). Intended browser API status is accepted; Cloud acceptance remains pending. The previous [source validation](validation.json) is the ab4fb7c repair checkpoint; the switch has its own evidence and source hash.

- [Controller source and commands](../../scripts/azure/vm01-controller/README.md)
- [Design](../../scripts/azure/vm01-controller/docs/design.md), [acceptance](../../scripts/azure/vm01-controller/docs/acceptance.md), [operations](../../scripts/azure/vm01-controller/docs/operations.md)
- [Filled approval manifest](../../scripts/azure/vm01-controller/docs/approval-manifest.json) and [reserved approval gates](../../scripts/azure/vm01-controller/docs/approval-bundle.md)
- [Change record](../../Change%20Logs/CHANGE_NOTES_R050_VM01_CONTROLLER_2026-10-01.md)
- [Source validation](validation.json), [46-test output](tests.log), [repaired compiled ARM](main.arm.json)
- [Actual disabled-bootstrap receipt and verification](bootstrap/README.md)

Repair baseline: e02501786af5f8a9ca7073c08244eb6afc4e08af on feat/vm01-controller-source; original project baseline d351991d1a1c0895d4abc8f0f4ba4fa55fa7a4e5. All46 tests passed, including a fresh sandboxed Windows Edge fixture with mock MSAL/ARM/storage and deterministic request time. The switch regression checks both settings through compiled ARM and the real configuration parser for all four boolean combinations. Strict TypeScript, offline Bicep0.47.16 with zero diagnostics, build/package integrity, JavaScript syntax, JSON, changed/local document links and diff whitespace pass. Tests perform no Azure action or real sign-in.

The staged repair package is ignored source staging without production dependencies; no repaired deployment ZIP or redeploy is claimed. The bootstrap receipt separately records the original locked production ZIP and exact hash. Deployed main.arm.json is retained under bootstrap/; the repaired root template is a review artifact with inert defaults. Git history pins the checked source/evidence without a recursive self-hash.

Commands, ledger admission and operation polling remain disabled. Allowed browser/Cloud authenticated status and effective runtime VM/ledger access remain pending; credentials/environment, optional operation-status grants, activation and exact power-test timing remain separate reserved gates. No supported live browser-control tool is exposed in this VM task; no alternate automation was used for a real sign-in. No credentials, Azure changes or VM actions were performed during source repair.

No controller GitHub Actions workflow was added. Existing database CI path filters exclude this scope; local passing evidence is not a GitHub Actions result. Publication to existing draft PR2 is verified in the task response; no merge or release freeze is authorized.
