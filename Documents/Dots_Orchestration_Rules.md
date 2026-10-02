# Dots orchestration rules

Owner instructions: **2 October 2026 (Asia/Bangkok)**. These rules govern Dots coordination for the AppSheet Loan Project ecosystem. [AGENTS.md](../AGENTS.md) remains the project entry point; [Development Workflow](Development_Workflow.md) owns execution locations and access boundaries. Model choices live only in [Model Work Mapping](Model_Work_Mapping.md).

## 1. Use the current project instructions

For project or ecosystem work, read and follow the current `AGENTS.md` in [AppSheet-Loan-Project](https://github.com/welct0407/AppSheet-Loan-Project/blob/master/AGENTS.md), then the task/continuation note and only the references relevant to the request. Treat the current owning instructions as authoritative rather than remembered or outdated copies. On VM-01 the checkout is `C:\GitHub\AppSheet-Loan-Project`; in Codex Cloud it is `/workspace/AppSheet-Loan-Project`. Confirm the actual checkout and revision before relying on it. Use the accessible published repository when local files are unavailable; never assume the cloud can read a Windows path.

Follow AGENTS links into the owning repository for work outside this repository. In particular, AI Collection requires its own AGENTS and default-deny service catalogue. Project context does not grant service authority. Treat dated logs as evidence, not current instructions. Reuse valid context and checks; do not load the whole ecosystem for each task.

## 2. Complete the task with minimal interruptions

When I ask you to perform a task, own the outcome through implementation, relevant verification, documentation and authorized publication. Continue until it is complete, I ask you to stop, or a specific missing decision, access requirement or authorization prevents further progress. Do not stop after a plan, delegation or partial result, and do not ask whether to continue at every step.

Reuse decisions and scoped approvals already given. Make reasonable reversible implementation choices within scope, state material assumptions briefly, and carry on. If a question is necessary, combine related questions, explain the concrete decision and why the answer is needed, and continue independent work. If a policy, skill or automatic approval review requires a pause, identify the exact source/action and reason. Complete the authorized preparation first so any approval concerns a concrete, reviewable result.

Keep the existing AGENTS boundaries for production, financial writes, notifications, schema changes, backups and recovery. This instruction removes redundant confirmations; it does not broaden those permissions. Once relevant checks pass, finish without unrelated audits or repeated tests. Verify publication before claiming GitHub recovery coverage.

When I ask you to stop, stop dispatching new work and stop or cancel the related delegated work using available controls. Report any in-flight action you cannot interrupt and reconcile its outcome before retrying. Pausing Dots alone must not be assumed to stop its workers.

## 3. Route work using the editable model mapping

Read [Model Work Mapping](Model_Work_Mapping.md) at the start of each new or resumed task and immediately before each model handoff. Use the current file, not a remembered model name or a copied table. A model I explicitly request for the current task overrides the default mapping for that task.

I authorize scoped delegation for the tasks I ask Dots to orchestrate. Use one executor for straightforward work; use additional workers only when their independent scope or specialist capability improves the result. Select the model and reasoning effort from the mapping, and the execution location from Development Workflow. This delegation preference does not authorize unrelated tasks, messages to other people, service activation or persistent model-setting changes.

For mixed work, resolve the design or diagnosis first, then hand the settled implementation to the execution route. Pass the compact handoff specified in Development Workflow, including the outcome, affected scope, decisions, existing authorization, rollback, completed checks and remaining work. Coordinate shared DEV objects and files; isolated branches do not isolate live apps/databases.

Stay responsible for workers' results: follow progress, inspect their evidence, resolve failures within scope and integrate the result before declaring completion. Use supported task/subagent controls; do not claim to have selected a model or reasoning effort unless the tool or UI confirms it. If a required model is unavailable, report the limitation once, continue independent work, and ask about a substitute only when needed to proceed.

## 4. Keep me updated every three minutes

For work continuing beyond three minutes, send a brief update by the three-minute mark and at least every three minutes while it remains active, including delegated work or waits. Track elapsed time from the last update. State what has completed or changed, what is happening now, the next step and any blocker. If still waiting, name what is pending without inventing progress or an ETA. Report completion, failure or a required decision immediately.

Use the current Dots conversation for these updates. They are progress messages, not repeated approval requests. Choose bounded waits that let you report on time where supported; if a tool blocks updates, report promptly when control returns and disclose the delay. Do not create a recurring schedule or send external messages merely to meet this cadence. Stop periodic updates when the task finishes or I stop it; more frequent platform-required updates take precedence.

## 5. Choose the owning repository

Before starting or delegating repository work, use the current [repository and instruction ownership table](Development_Workflow.md#repository-and-instruction-ownership). Choose by the component being changed, not the currently open checkout or the computer running it. Read the destination's applicable instructions and catalogue. For work spanning repositories, assign each change to its owner and include dependencies and revisions in the handoff. Routine questions need no repository write. Keep the task-to-repository mapping in Development Workflow so it can change without copying a second inventory into these rules.

## Ready-to-paste Custom rules

In ChatGPT **Settings > Personalization > Permissions > Custom rules**, use the five entries below. Select **Take action without asking** for each entry you add. Each scopes an action Dots may perform; the sections above explain the intended working behavior. Project safeguards are inherited through Rule 1 rather than repeated as separate Custom rules.

### Rule 1 — Read project instructions

> For AppSheet Loan Project and related ecosystem work, read and follow the current AGENTS.md at https://github.com/welct0407/AppSheet-Loan-Project/blob/master/AGENTS.md, including its task-specific references and owning-repository instructions. Treat the current owning instructions as authoritative; do not rely on remembered or outdated copies. Read only what the task needs and reuse valid evidence. The detailed orchestration rules are at https://github.com/welct0407/AppSheet-Loan-Project/blob/master/Documents/Dots_Orchestration_Rules.md.

### Rule 2 — Finish authorized work

> When I request a task, carry out the authorized implementation, checks, documentation and repository publication through completion without asking for confirmation at every step. Reuse approvals already given and make reasonable reversible choices within scope. Ask only for missing information, access or authorization that materially blocks progress; explain the specific reason and continue independent work. Preserve the separate production, financial, notification and other authority boundaries in AGENTS.md. When I ask you to stop, stop the task and its related delegated work using available controls.

### Rule 3 — Select models and delegate

> For tasks I ask you to orchestrate, select models and reasoning effort using the current file at https://github.com/welct0407/AppSheet-Loan-Project/blob/master/Documents/Model_Work_Mapping.md. Read it before each new or resumed task and model handoff so my edits take effect without rewriting this rule. An explicit model request for the current task overrides the file. Delegate scoped work when useful, coordinate workers and verify their results. Use one executor for straightforward work. Do not silently substitute an unavailable model or change unrelated chats or persistent service settings.

### Rule 4 — Send three-minute progress updates

> During any requested task lasting longer than three minutes, post a concise progress update in our current Dots conversation by the three-minute mark and at least every three minutes thereafter, including while workers are running or you are waiting. State completed work, current activity, the next step and any blocker. Report completion, failure or a needed decision immediately. These are status updates, not requests for permission. Stop them when the task finishes or I stop it. Do not create a recurring schedule or send external messages for these updates.

### Rule 5 — Choose the correct repository

> Before starting or delegating work, choose the owning repository using the current Repository and instruction ownership section at https://github.com/welct0407/AppSheet-Loan-Project/blob/master/Documents/Development_Workflow.md#repository-and-instruction-ownership. Route by the component and task type, not whichever checkout is open. Read and follow the selected repository's applicable AGENTS.md and service catalogue. For cross-repository work, keep each change in its owning repository and coordinate dependencies. Use Daily-Use only for general work without another project owner when repository files are needed; ordinary questions need no repository write. If ownership remains ambiguous after checking the references, ask one focused question rather than inventing a destination.

These Markdown files are instructions to read, not an installed routing engine. Editing the published mapping changes what Dots should select on its next read; it does not switch an already-running task. Dots account settings and live routing have not been changed or tested by creating these files.

Custom rules are action-permission instructions; they do not install a model router or precise timer. The official guidance also supports giving working preferences in the Dots conversation. Account/app access and required platform confirmations still apply. See [Control your dot](https://learn.chatgpt.com/docs/dots/controls), checked 2 October 2026.
