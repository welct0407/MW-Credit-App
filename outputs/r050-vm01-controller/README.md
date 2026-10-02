# R050 VM-01 controller evidence

Current controller checkpoint, 2 October 2026 UTC: owner-approved code-only diagnostics deployed from `4a506465f96b5d8eaa78ed6bf723da6de12bb740`; all live assets match the reviewed ZIP and access settings, logging, identity/roles, consent, hostname and ledger bytes are unchanged. Mutations, polling and admission remain disabled. Authenticated status remains pending; R050 stays Open and PR2 stays draft. Earlier e025017/source-not-redeployed statements below are historical checkpoints. [Deployment receipt and tests](status-diagnosis/README.md).

The owner-approved disabled bootstrap is deployed from e025017. The current source repairs Bicep boolean serialization and fixture portability; it has not been redeployed. R050 remains Open. The owner approved US$2/month as a planning budget, not an enforced cap.

The approved 2 October browser account switch is applied: MW Credit replaces the owner in both controller allowlists and user-specific consent. [Current switch evidence and focused source checks](account-switch/README.md). Authenticated API acceptance remains pending. The previous [source validation](validation.json) is the ab4fb7c repair checkpoint; the switch has its own evidence and source hash.

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
