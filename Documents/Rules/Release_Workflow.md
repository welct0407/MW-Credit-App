# PWA release workflow

Owner revision: **14 October 2026**. A release is a tested code/configuration package, not a copied app. This short procedure replaces active AppSheet promotion steps. Current recovery pins remain in the owning deployment records; Git retains superseded instructions.

## Development

Use the [current Open release](../Release_Tracker.md#current-development-release) and automatic [six-agent development process](PWA_Orchestration.md#six-agent-development-process). Record the intended outcome and affected behavior in the existing task/release log. Implement the coherent change, use [proportional checks](PWA_Orchestration.md#proportional-validation), fix failures and reuse unaffected passing evidence. A small change can be designed and checked in the same record; role participation requires no separate plan or approval document.

Use DEV or disposable tests for changed behavior. Do not hold a harmless UI fix for unrelated features or unfinished credentials. An owner-requested hands-on checkpoint remains binding; otherwise no automatic extra review round is added.

## Release-scope freeze and number handoff

At authorized promotion start:
1. Re-read the current tracker; pin included source/artifacts, configuration and required SQL manifest/hashes. Resolve unfinished scope explicitly.
2. In one published tracker update mark the release Frozen with timestamp/package evidence, open the next unused number and advance the counter. Never reserve a successor before this point or create two Open releases.
3. Capture the candidate independently before shared DEV advances. This normally means immutable images/Hosting assets and source/configuration pins; no AppSheet copies or third database environment.
4. Corrections to frozen scope create a new candidate revision within that release, rerunning only invalidated checks. New features go to the Open successor. Never promote unrelated later DEV changes.

Readiness, task completion and documentation publication do not freeze or allocate a release.

## Test selection and evidence reuse

[PWA Orchestration](PWA_Orchestration.md#proportional-validation) is the single test-selection policy. Record actual results once and reference them. Use the same consolidated run for acceptance and promotion when the relevant inputs are unchanged. Do not rerun solely because Git has a new documentation/merge commit.

Pin runtime/build/dependency/configuration inputs and, for test reuse, tests/fixtures/runner assumptions. A relevant changed input or observed failure invalidates affected evidence. Skipped checks and HTTP reachability alone do not prove business correctness.

## Promotion

Use one existing release record based on the [compact promotion template](../../scripts/releases/templates/promotion-checklist.md). Fill applicable evidence only; no second gate sheet.

1. **Authority and recovery:** reuse scoped owner approval; verify the affected target and deployed baseline. Capture prior service revisions/Hosting version/configuration. UI-only deployment needs no DB backup. SQL changes need the canonical guarded migration procedure, verified restorable backup, expected schema/history, exact tested commit/hashes and all pending prerequisites.
2. **Deploy changed components:** apply in dependency order from the tested package. Preserve existing identities, access, scheduler ownership and unrelated configuration. Build a separate environment variant when bindings differ; do not relabel DEV artifacts as PROD.
3. **Verify once:** confirm deployed artifact/environment and one representative affected entry point. Add authentication, service-worker/update, database-role or delivery checks only where changed. Prefer read-only PROD smoke; never force payment, notification or job execution without scoped authority.
4. **Close once:** record actual result, recovery and limitations; update changed inventory/model facts and release status; publish intended files and final unique Rnnn evidence tag. Later documentation corrections do not require redeployment or moving tags.

Relevant unresolved failures prevent “Released”; distinguish applied, verified and owner-accepted. Explicit owner deferrals remain visible. No current release requires AppSheet editor diagnostics, app modes, copying, source rebinding, App Upgrade, logo parity, bots or RC cleanup.

## Failure and hotfix

Follow only the applicable [recovery branch](Release_Recovery_Runbook.md). Stop dependent steps, reconcile actual state and avoid blind replay. Fixes during frozen promotion stay with its pinned scope. A new production hotfix uses the current Open release; preserve unrelated unfinished work and pin only the intended package.

## Tooling reality

Documentation does not change CI workflows or historical validators. Use maintained runners and required checks honestly. If a legacy hard-coded gate conflicts with proportional delivery, identify it once and make a scoped tested tooling correction within authorized work; never fabricate evidence, bypass a guard or silently repeat full CI. Current limitations are in [the policy](PWA_Orchestration.md#current-automation-and-follow-up).
