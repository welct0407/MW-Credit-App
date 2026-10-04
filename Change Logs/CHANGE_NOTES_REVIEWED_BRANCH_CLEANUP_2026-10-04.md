# Reviewed branch cleanup — 4 October 2026

Status: checked deletion completed; workflow documentation checked for approved merge. Owner approved checked cleanup and automatic deletion for this repository. Connected GitHub actor: welct0407.

Fresh PR and branch reads established no open dependencies on the deleted heads. Each SHA below passed `git merge-base --is-ancestor` against master `c35eac1caec7e0bf54b328cf8407c7adf27ed54c`. All commits and evidence remain reachable from that published default branch. No default branch, existing tag or existing commit was changed by branch cleanup.

| Deleted branch | Preserved head SHA | Completion evidence |
| --- | --- | --- |
| `chore/vm01-cloud-certificate-20261004` | `53f3d74a6b8222b4e00f98f157a223f0be1024da` | PR6 certificate evidence merged |
| `codex/r050-payment-allocation-correction` | `0dd9b0225496f7c95101055d9862e885abb1c091` | PR7 merged |
| `docs/cloud-first-readiness-20260930` | `6a4a65de0c022223b3b5eef619384d2e31662541` | PR1 merged |
| `docs/ecosystem-executor-matrix-20261003` | `77830fd123ea3e27167dffd9fdb42917ffe442f3` | PR4 merged |
| `feat/grafana-mcp-events` | `50ca9c24d792033c893150f3d7cdb7262583c108` | PR3 merged |
| `fix/r050-durable-operator-audit` | `7c01977f9a3c67f47934c14a49aa29ddc942db24` | PR8 merged |
| `fix/vm01-browser-shutdown` | `d649634be675cf50e8e609e61d26e2c15ea95bc2` | PR6 merged |

Retained default master and active PR9 `fix/grafana-two-year-offline`. Following explicit owner completion approval, archived and removed the three obsolete heads below. Their unique history is preserved in full, without merging cancelled source or old release content into master. PR2/5 decisions remain documented in Documents/Development_Changes.md.

| Removed obsolete head | Preserved commit | Durable archive tag |
| --- | --- | --- |
| `feat/vm01-controller-source` (superseded PR2) | `daf6587f9947b62204c828c73035c47396d2e573` | `archive/branch-cleanup/2026-10-04/pr-2` |
| `feat/vm01-dots-idle-dryrun` (abandoned PR5) | `bd78df72f381ffc87de4d76ff33ae2e14d3d0908` | `archive/branch-cleanup/2026-10-04/pr-5` |
| `codex/r007-production-release` (retired release evidence) | `2541cc732cb5187ce520ffbcf15c2721110e36e1` | `archive/branch-cleanup/2026-10-04/r007` |

The archive tags are annotated by welct0407 and are not production release tags. Exact peeled SHAs were verified on the remote; a fresh independent bare repository fetched all three tags and passed full `git fsck`, proving complete recoverable object history. Normal GitHub branch creation at each original SHA was then exercised for all three original names, with exact remote-head readback before deleting the restored heads again. No existing tag was deleted or moved. To recover, fetch the archive tag and normally create/push the required branch at its peeled commit, or use GitHub branch creation with the recorded SHA. Preserve the archive tags while this history is needed; this cleanup grants no archive removal permission.

Recovery: normal GitHub create-branch at the recorded SHA was exercised for `chore/vm01-cloud-certificate-20261004`; `git ls-remote` confirmed the exact restored SHA before the temporary restored head was deleted again. Other deleted heads remain reachable from the same default history and have their exact SHAs above. A normal branch creation at the recorded SHA restores a head without rewriting history.

Automatic deletion: latest read showed `delete_branch_on_merge=false`. The GitHub connector exposes no repository-setting write; command-line GitHub API returned Forbidden. The approved setting is still pending, not claimed enabled. No credentials/access were changed.

Checks: fresh PR dependencies, exact remote heads, ancestry, connected actor, restoration/readback and final remote inventory. Documentation-only change: reviewed diff/whitespace; no runtime tests or product release number needed. Rollback: restore a deleted branch at its preserved SHA using normal GitHub branch creation; revert this documentation through normal review if needed. This task performs no deploy or power operation.

Final target inventory after approved documentation PR merge and head cleanup: `master` and active `fix/grafana-two-year-offline` only. Documentation PR10 carries this record; final remote publication is verified at task closure.
