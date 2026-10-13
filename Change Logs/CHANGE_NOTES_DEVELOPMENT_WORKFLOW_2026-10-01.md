# Cross-environment development workflow — 1 October 2026

## Scope and authority

The owner requested an authoritative workflow for Dots Browser, Codex Cloud, VM-01 and Debian, incorporating the verified arrangement supplied on 1 October. Requested model: Astra Extra High; routine data-task preference remains Sol 6.1 Medium. The initial task authorized documentation edits and a dedicated local branch/commit only. Publication was subsequently authorized at 12:44 UTC as recorded below; merge, deployment, infrastructure/data mutation and expanded permissions remain outside scope.

Initial checkout: clean `work` at master commit `7a23d62c4da3886d130bc40fc4fdb187cefcb9c4`. Draft [PR #1](https://github.com/welct0407/AppSheet-Loan-Project/pull/1) was inspected read-only. Its head `58a0c4a7c8aa8f7c4c1f37876278b261cbd3159c` is the parent of this work on **`docs/execution-workflow-20261001`**, preserving the draft's cloud browser routing, restored DEV versions and historical readiness evidence. During that initial local-only stage, the existing PR branch and remote refs were not changed. Review this task's incremental diff against that parent; a diff against master also includes the original draft's four files.

## Changes and ownership

- [Development Workflow](../Documents/Rules/Development_Workflow.md): authoritative executor responsibilities, repository ownership, Debian services/paths, task handoff, existing SDLC routing, safeguards, secret/access boundaries, fallback conditions and confirmed-versus-pending evidence.
- [AGENTS.md](../AGENTS.md): clear workflow link and task route; environment-specific runtime/credential wording. Release numbering, approval, financial integrity, backups, immutable migrations, RC/App Upgrade, zero-warning, recovery and publication controls remain intact.
- [Documentation map](../Documents/README.md): direct workflow entry.
- [Service account/browser register](../Documents/Service_Account_Browser_Mapping.md): current workflow pointer and Cloudflare exception; all 17 service assignments/authentication notes and VM browser mappings preserved.
- [Environment Inventory](../Documents/Environment_Inventory.md): current execution pointer; 30 September checkpoint explicitly historical, with the original DEV versions/evidence preserved.
- [Scripts guide](../scripts/README.md): distinguish Windows setup/credential storage from Cloud/Deployed-host routing.
- This change log. No product release number, release record, migration, dictionary, source script or service configuration is changed.

## Evidence and unresolved facts

Read repository AGENTS, architecture/design, release/recovery/database procedures, script/tool guidance, relevant Debian service/catalogue sources and PR #1 before editing. No applicable `.agents/skills` files were present in the checked project/workspace locations. The integration repository inspected at `c98724e6cc21bf4f49e766e4b2ee9c923eba4dd2` establishes persistent service placement; it is not claimed as the deployed version.

The owner's 1 October handoff supplies the saved-environment identifiers, gcloud/IAP/sudo, DEV/PROD SQL probes, DEV Flyway validation, backup metadata access, fresh PROD API probes and the Oum correction completed at 12:10 UTC with restored backups/rehearsals/safeguards/readback. These are explicitly attributed in the workflow; this documentation task did not re-execute them. Private execution artifacts for today's correction are not present in this checkout and were not invented or copied.

Real source conflict: the integration README still describes PostgreSQL as proposed, while its current service catalogue and PostgreSQL operations record it active. Its Operations document identifies the former SQLite updater as historical. The workflow points to the current operational authorities and requires package-specific deployment checks instead of promoting an old script to a general deployment procedure. No integration repository edits were made.

Remaining proof: small end-to-end DEV development/deploy/rollback through the new Cloud route; Cloudflare correct account/zone DNS and tunnel reads via the chosen VM-01 route; wider alert delivery; full recovery including credentials/configuration/external dependencies. Access checks and one completed production correction do not close these items. Daily-Use's README establishes no loan service/deployment ownership.

## Validation and rollback

Validation passed: 175 relative-link occurrences (including 35 newly introduced occurrences) resolve with Markdown anchors; seven new cross-repository source links resolve against the inspected local integration checkout. All 17 service-register rows are identical to the PR parent. AGENTS release-numbering policy and all sections from Project boundaries through Automatic commit and push are byte-for-byte unchanged; the draft readiness log is unchanged. Scope is exactly the seven intended Markdown files. New-document table shape/fences, Git whitespace checks and a credential-pattern scan passed; manual review found only credential identifiers/paths, no secret values. Checks are local documentation validation, not live GUI, SQL, service or deployment execution. The repository's `scripts/check-documentation.mjs` is a dated Windows-specific V1/Excel reconciliation script that writes historical output; it is not a general Markdown checker and is not applicable. Database CI is path-scoped to database/runners and is not triggered by these edits.

Rollback is a reviewed revert of this task's documentation commits, preserving the original PR #1 work and later changes. No live rollback, data restoration or release-state transition is needed. Commit identities are available from Git; publication/recovery coverage requires verification against the remote branch.

Initial completion: documentation committed locally as `5012f0bd2dfc7d995f998d169c8a4e5508135ee4`, with no live action, push or PR mutation in that stage. Remaining capability tests above are limitations of the documented workflow, not blockers to this documentation change.

## Publication authorization

At **1 October 2026, 12:44 UTC**, the owner accepted the request to push the completed changes and update the existing draft PR: **“Yes, always keep Github updated after each task.”** This supersedes the initial local-only restriction for publication and reaffirms the standing AGENTS commit/push rule. Preserve draft status; do not merge or deploy.

Publication targets the existing `docs/cloud-first-readiness-20260930` head of PR #1 with a normal fast-forward push from local `docs/execution-workflow-20261001`. The original draft commit remains an ancestor. This follow-up changes only the workflow publication paragraph and this log; validation above covers the final documentation state. The PR description and task result report the exact remote SHA and its applicable checks after readback; no success is inferred from a local commit alone.
