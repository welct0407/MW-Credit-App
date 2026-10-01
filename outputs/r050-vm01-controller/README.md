# R050 VM-01 controller source evidence

Source-only implementation; controller undeployed and all live Azure stages unapproved. R050 remains Open. The owning repository is AppSheet-Loan-Project; Daily-Use was restored clean and MW-Integration-Agent is unchanged.

- [Controller source and local commands](../../scripts/azure/vm01-controller/README.md)
- [Design](../../scripts/azure/vm01-controller/docs/design.md), [acceptance](../../scripts/azure/vm01-controller/docs/acceptance.md), [operations](../../scripts/azure/vm01-controller/docs/operations.md)
- [Exact approval manifest](../../scripts/azure/vm01-controller/docs/approval-manifest.json) and [approval explanation](../../scripts/azure/vm01-controller/docs/approval-bundle.md)
- [Change record](../../Change%20Logs/CHANGE_NOTES_R050_VM01_CONTROLLER_2026-10-01.md)
- [Validation record](validation.json), [test output](tests.log), [compiled ARM template](main.arm.json)

Baseline: `d351991d1a1c0895d4abc8f0f4ba4fa55fa7a4e5`. Branch: `feat/vm01-controller-source`. Validation uses synthetic fixtures only and performs no Azure or real Entra calls. The recorded 45 passing tests include real headless Chromium and the corrected strict RBAC policy assertion. Bicep compilation is offline; compiled templates are review artifacts with defaults disabled, not provisioning authorization. TypeScript, staged package contents, JSON/document links and whitespace were checked.

`dist/package/` is ignored local staging, not a final deployment ZIP. A deployment must pin its reviewed Git commit, install locked production dependencies, hash the final ZIP, complete public configuration and record approved resource/identity values. The manifest's deployment commit field deliberately remains a future deployment pin; this evidence's Git history identifies the checked source commit without a recursive self-hash.

No GitHub controller CI workflow is added. The existing database workflow has path filters excluding this change; passing local evidence must not be described as a GitHub Actions run. Remote branch/PR verification is reported in the final response.
