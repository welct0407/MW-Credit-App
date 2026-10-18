# PWA release workflow

Owner revision: **17 October 2026**. A release is a tested code/configuration package, not a copied app. This short procedure replaces active AppSheet promotion steps. Git retains superseded instructions.

## Development

Use the [current Open release](../Release_Tracker.md#current-development-release) and automatic [six-agent development process](PWA_Orchestration.md#six-agent-development-process). Record the intended outcome and affected behavior in the existing task/release log. Implement the coherent change, use [proportional checks](PWA_Orchestration.md#proportional-validation), fix failures and reuse unaffected passing evidence. A small change can be designed and checked in the same record; role participation requires no separate plan or approval document.

Use DEV or disposable tests for changed behavior. Do not hold a harmless UI fix for unrelated features or unfinished credentials. An owner-requested hands-on checkpoint remains binding; otherwise no automatic extra review round is added.

Complete [required documentation maintenance](Development_Workflow.md#required-documentation-maintenance) as part of each batch. Update every affected evolving reference in place. Optional new documents need owner approval; the required release records/manifests and recovery/deployment evidence are included in the authorized deployment or migration and need no separate approval.

## Release-scope freeze and number handoff

Use the single Open release for product work. Freeze it only when authorized promotion starts, pin the package, then publish the coordinated next-number handoff in the [tracker](../Release_Tracker.md). Documentation/governance-only work needs no product release or deployment.

At authorized promotion start:
1. Re-read the current tracker; pin included source/artifacts, configuration and required SQL manifest/hashes. Resolve unfinished scope explicitly.
2. In one published tracker update mark the release Frozen with timestamp/package evidence, open the next unused number and advance the counter. Never reserve a successor before this point or create two Open releases. The same update bumps `releaseNumber` in `apps/pwa/src/release.ts` (the About screen shows it); a unit test enforces that it matches the tracker's Open row.
3. Capture the candidate independently before shared DEV advances. This normally means immutable images/Hosting assets and source/configuration pins; no AppSheet copies or third database environment.
4. Corrections to frozen scope create a new candidate revision within that release, rerunning only invalidated checks. New features go to the Open successor. Never promote unrelated later DEV changes.

Readiness, task completion and documentation publication do not freeze or allocate a release.

## Test selection and evidence reuse

[PWA Orchestration](PWA_Orchestration.md#proportional-validation) is the single test-selection policy and its [lean check routine](PWA_Orchestration.md#lean-check-routine) says who runs what once. Record actual results once and reference them. Use the same consolidated run for acceptance and promotion when the relevant inputs are unchanged. Do not rerun solely because Git has a new documentation/merge commit: the workflows skip a stage that already passed on identical stage-relevant inputs and link the run holding the evidence in the step summary; cite that run, not the skipping one.

Pin runtime/build/dependency/configuration inputs and, for test reuse, tests/fixtures/runner assumptions. A relevant changed input or observed failure invalidates affected evidence. Skipped checks and HTTP reachability alone do not prove business correctness.

## Promotion

The owner's instruction to move/deploy/promote the requested work to production is the production approval, including the required tested schema migrations (tables and columns within that scope), backups and restore verification, standard temporary maintenance permissions and their restoration, and required technical records. Record that instruction once in the existing release evidence and proceed; no magic wording is needed, and no separate approval is needed per command, migration, phase or file. Ask only about a genuinely unclear scope or a material action outside it; the [hard rules](../../../AGENTS.md#hard-rules) list what a deployment instruction does not imply. Required tests, target checks, backup/recovery and migration guards are execution requirements, not repeat owner-approval gates.

Reuse the existing release record based on the [compact promotion template](../../scripts/releases/templates/promotion-checklist.md). If a required record/manifest is missing, create it as part of the already-authorized delivery. This includes private promotion packages, tested SQL manifests, backups and recovery metadata, standard temporary maintenance-permission/restoration records, isolation preflights, deployment receipts and required verification/cleanup evidence. The tracker keeps release status and numbering only; deployment pins (Hosting version, Cloud Run revisions and image digests, Debian commit, Flyway version) live only in the [Environment Inventory](../Environment_Inventory.md), so link to it instead of copying a pin. Keep private material outside Git, use the guarded runners and fill applicable evidence only; no duplicate gate sheet or separate file-creation question.

1. **Authority and recovery:** use the owner's production instruction as scoped approval; verify the affected target and deployed baseline. Capture prior service revisions/Hosting version/configuration. UI-only deployment needs no DB backup. SQL changes need the canonical guarded migration procedure, verified restorable backup, expected schema/history, exact tested commit/hashes and all pending prerequisites. Complete these checks without requesting the same authority again.
2. **Deploy changed components:** apply in dependency order from the tested package. Preserve existing identities, access, scheduler ownership and unrelated configuration. Build a separate environment variant when bindings differ; do not relabel DEV artifacts as PROD.
3. **Verify once:** confirm deployed artifact/environment and one representative affected entry point. Add authentication, service-worker/update, database-role or delivery checks only where changed. Prefer read-only PROD smoke; never force payment, notification or job execution without scoped authority.
4. **Close once:** record actual result, recovery and limitations; complete the evolving-document coverage check and update every affected reference, including inventory/model facts and release status; publish intended files and a unique annotated Rnnn evidence tag after the required deployment verification; never move an existing tag. Cloud sessions cannot push tags directly; they start the manual **Release tag** workflow (`.github/workflows/release-tag.yml`: tag, deployed `main` commit, message, optional Markdown `notes`), which uses the repository secret `RELEASE_TAG_TOKEN`, refuses existing tags and commits not on `main`, and in the same run publishes the GitHub Release for the tag (body: `notes`, else the tag message; marked latest only for the highest Rnnn). `publish_only=true` publishes the GitHub Release for an existing tag and refuses an existing release. Fallback: the owner creates the tag and release in GitHub Releases on that commit. Later documentation corrections do not require redeployment or moving tags, and routine documentation tasks need no release tag.

Prune in the same session that marks the release Released, and list each deletion in that release's record before the deleting commit; no separate cleanup task or document. Repoint every inbound link first to a commit permalink, `https://github.com/welct0407/MW-Credit-App/blob/<commit>/<path>#anchor`, using the last commit where the target still exists (the release tag points at the package commit, which predates the promotion record, so a tag URL does not reach it). Then delete: that release's sections from [Development Changes](../Development_Changes.md); change notes outside the [retention window](Development_Workflow.md#records-change-notes-and-retention); evidence nothing current cites. Deployment pins stay only in the [Environment Inventory](../Environment_Inventory.md); the tracker row holds status and links. `npm run check:docs` must pass afterwards, and this step clears its warnings.

Relevant unresolved failures prevent “Released”; distinguish applied, verified and owner-accepted. Explicit owner deferrals remain visible. No current release requires AppSheet editor diagnostics, app modes, copying, source rebinding, App Upgrade, logo parity, bots or RC cleanup.

## Publication

After coherent completion, review the intended diff, run the relevant checks and commit and push only the task's changes to the configured branch; this is standing publication authority. Preserve unrelated dirty work and exclude secrets, backups and dependencies. Use normal pushes, verify the remote result and report publication failures honestly. Never force-push or rewrite history.

Publication does not authorize production effects or merging. Respect scoped merge and branch-cleanup authority, stacked PRs and active work, and preserve unique history before deleting any branch.

## Failure and hotfix

Follow only the applicable [recovery branch](Release_Recovery_Runbook.md). Stop dependent steps, reconcile actual state and avoid blind replay. Fixes during frozen promotion stay with its pinned scope. A new production hotfix uses the current Open release; preserve unrelated unfinished work and pin only the intended package.

## Tooling reality

Documentation does not change CI workflows or historical validators. Use maintained runners and required checks honestly. If a legacy hard-coded gate conflicts with proportional delivery, identify it once and make a scoped tested tooling correction within authorized work; never fabricate evidence, bypass a guard or silently repeat full CI. Current limitations are in [the policy](PWA_Orchestration.md#current-automation-and-follow-up).
