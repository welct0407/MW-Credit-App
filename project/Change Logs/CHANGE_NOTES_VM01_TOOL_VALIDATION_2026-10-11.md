# VM-01 development tool validation — 11 October 2026

## Scope and baseline

Owner requested validation and repair of the development tools after deleting MWCredit, including the R052 PWA branch. AppSheet baseline `7f60bdc83d15cd152d094f8252be4030ee0c0c26`; PWA baseline `39394ecb629dc893cb2281e0e1dfe2a0b078f699`, branch `codex/r052-review-shell`. Checks used the existing working trees; unrelated dirty files were preserved. This validates the local toolchain and selected workflows, not full R052 feature acceptance, production readiness or all browser scenarios. No live deployment, financial write, notification, VM power action or worker activation.

## Repairs

- Restored Azure controller and Grafana bridge dependencies using their committed locks and documented `npm ci --ignore-scripts`; retained those useful service installations. No product dependency versions or lockfiles changed.
- Installed the dictionary's pinned PyYAML 6.0.2 in the documented external `Documents/ChatGPT/AppSheet-Loan-Project/tools/dictionary-python` directory. Shared bundled Python was not modified.
- Installed Azure Functions Core Tools 4.15.2 under `AppData/Local/MWCredit/tools/functions`, following the [official Core Tools installation guidance](https://learn.microsoft.com/azure/azure-functions/functions-run-local). Extended the maintained user PATH setup to include that installation and existing `.azure/bin`; readback verified eleven existing tool directories, with no old-profile path. No separate .NET SDK was required for the Node host check.
- GitHub CLI initially had no usable login. Reusing the current Git credential was rejected for missing `read:org`; no scope was silently changed. Owner completed the device login, then user/repository API reads succeeded as `welct0407`. Existing Git authentication was preserved.
- Added exact user-level Git safe-directory entries for the three verified `welct0407` repositories MW-AI-Collection, MW-Partner-Operations and MW-Integration-Agent, which still have the former Windows owner's filesystem identity. No wildcard trust; ordinary Git access now succeeds.
- Repointed dormant AI Collection `.venv/pyvenv.cfg` from the deleted MWCredit Python to ideaadmin's identical Python 3.12.14. Its installed packages remained in place; no service was started. This was an additional dependency missed during retirement preparation.

## Results

| Tools / workflow | Observed result |
| --- | --- |
| Node 24.21.0, npm 11.19.0, TypeScript 5.9.3, Vite 7.3.7, React 19.3.0 | PWA synthetic build and all **242 unit tests passed**; live-dev build passed. |
| Playwright 1.63.0 / Chromium | Four selected existing foundation tests passed across desktop/mobile, unchanged timeouts. First run had two desktop navigation timeouts while other installations were active; mobile passed. Retest after installation passed all four in 12.1 seconds. Timing association is observed, not a proven root cause. |
| Installed Chrome and Edge | Independent headless launch, synthetic page interaction and close passed. No persistent sign-in profile used. |
| PWA native image dependency | Sharp produced a synthetic PNG in memory. |
| PostgreSQL / pg_dump 18.6, Flyway 13.6.0, Temurin Java 25.0.4 | Canonical disposable migration runner rebuilt **85 migrations**, reran with **0 changes**, exercised schema export and rejected checksum tampering. No live database connection. The reported V1-only baseline comparison was false with 85 migrations and is not applicable to that baseline-only assertion. |
| Terraform 1.16.5 | DEV, DEV-DNS and production source copies initialized with `-backend=false` and validated successfully. No remote state, plan or apply. |
| Azure CLI 2.90.0 / Bicep 0.47.16 | Signed-in account/tenant/subscription read and actual `RG-MWCREDIT` resource-group read passed. Controller Bicep compiled. An initial guessed `MW` resource-group probe returned not-found; corrected to the source-defined name. |
| Azure controller / Functions Core Tools 4.15.2 | Build/type check passed; suite **112 passed**, one opt-in real-host check initially skipped. After Core Tools installation, that real HTTPS Functions-host routing check passed separately using an ephemeral untrusted loopback certificate. No trusted certificate-store changes or Azure calls by that test. |
| Grafana bridge | TypeScript build and **78 isolated tests passed**. No live delivery or service changes. |
| Git 2.53.0.windows.3 / GitHub CLI 2.102.0 | Existing repository Git access and authenticated GitHub user/PWA-repository API reads passed; publication checked at closeout. |
| Google Cloud SDK 585.0.0 | Existing `welct0407@mw-credit.com` sign-in, project metadata and expected Cloud SQL instance metadata reads passed; instance reported RUNNABLE. No database data read. |
| Cloudflared 2026.9.1 / Tailscale 1.102.4 | Both binaries execute; Tailscale backend reports Running. No tunnel changes or connectivity/production routing claim. |
| Python 3.12.14 / project environments | Integration and Partner dependency consistency checks and representative imports passed. Repaired Collection environment imports and dependency consistency passed; its existing synthetic Edge DOM test is recorded in closure below. |
| Dictionary / shared artifact tools | All **1,415 dictionary documents** structurally validated with zero errors; Markdown export passed. Shared artifact-tool workbook creation, openpyxl/Pillow imports and private psycopg 3.2.9 import passed. Dictionary reconciliation limitations remain separately recorded. |
| draw.io | Synthetic diagram exported to valid SVG successfully. |

## Boundaries and remaining setup

The deleted profile's private credentials, SSH keys and DEV `dev.activation.tfvars` were intentionally not retained. CLI availability does not recreate them. The existing DEV plan guard still refuses missing activation configuration; reconstruct/recover the approved configuration before any infrastructure plan. Legacy secret-dependent administrative helpers need fresh credential setup when used. No key rotation or invented infrastructure values were used to obtain a green result.

Docker builds remain on Cloud Build/GitHub Actions as documented; no local Docker installation was added. Browsers were checked with isolated synthetic pages, not a blanket service-login audit. No tool upgrade was performed merely because its CLI advertised a newer version.

## Cleanup and recovery

Task scratch is `outputs/.tmp/tool-validation-20261011`, including backend-disabled Terraform copies, generated dictionary/SVG/Bicep outputs and raw logs. Only this run's recorded database cluster and temporary certificate are eligible for deletion. Keep installed dependencies, the latest in-place build outputs and pre-existing test results owned by other tasks. Preserve the earlier unpublished-work before-image/retention exception.

Source rollback uses this task's commit; local dependency installs are reproducible from existing locks/pins. Exact Git trust entries and the two added user PATH entries can be removed individually if needed; do not reset unrelated user configuration. The old Python path is no longer usable and should not be restored. Publication and final cleanup are recorded below.

Collection's existing synthetic Edge DOM test passed (1 test, 9.594 seconds). PATH helper parsing and saved user-PATH readback passed. No PostgreSQL, pg_ctl or Functions host process remained before cleanup. All recorded checks are complete; task-only scratch cleanup follows verified evidence publication.

### Final closure

- Evidence publication verified: AppSheet `02af2e6dc238f5d77e90b638c7c60220e33ded19`, PWA `57ae2ca23d8ab17b07b975def3e482ec30ce68cf`, AI Collection `2dfe6b53fe720627b6eb299f60425f632975541e`.
- Cleanup exposed a helper bug: a literal `-TargetPaths` argument made the current inspecting PowerShell process appear to be a separate user of the directory. Excluded only the inspecting PID from that path-reference check. The PostgreSQL-wide guard remains. The exact completed migration cluster was then deleted, zero skips. A separate synthetic Node process proved the active-process guard still skips its directory; after stopping that owned process, cleanup removed the fixture. No test process/fixture was left by this guard check.
- The execution policy rejected deletion of the two remaining task roots before execution, returning `blocked by policy` without a more specific reason. No retry through another deletion mechanism was attempted. Retained exception, owner/task: this tool validation; review **18 October 2026**: `C:\GitHub\AppSheet-Loan-Project\outputs\.tmp\tool-validation-20261011` (**806.98 MiB**, mostly disposable provider copies, plus summarized logs/outputs), and `C:\Users\ideaadmin\AppData\Local\Temp\mw-tool-validation-ea2ccfa7174b4975be1a2b93bd0d52b2` (under 0.01 MiB, untrusted synthetic certificate/password). The certificate expires two hours after creation and was never installed in a trusted store. Both folders can be deleted after the execution-policy restriction is resolved; useful evidence is published and no runtime uses them.
- C: free space after database/guard-fixture cleanup: **66.863 GiB**. Installed tools/dependencies were retained intentionally. Cleanup is incomplete only for the two explicit policy-blocked roots; prior unrelated work remains preserved.
