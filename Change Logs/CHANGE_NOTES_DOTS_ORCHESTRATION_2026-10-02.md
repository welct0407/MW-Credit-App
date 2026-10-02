# Dots orchestration instructions — 2 October 2026

## Scope and purpose

The owner requested project-aware Dots rules, completion without step-by-step confirmations, editable model/work assignments and progress updates every three minutes for longer tasks, then clarified the Personalization > Custom rules destination and requested other useful proposals. Design, troubleshooting and on-call support use Astra Extra High; execution uses Sol 6.1 High. This is governance/documentation work; no product release number or live app/database/service change is required.

## Baseline and rollback

Original checkout: `master` at `d351991d1a1c0895d4abc8f0f4ba4fa55fa7a4e5`. Preserve its unrelated modified `scripts/metabase/PartnersTab.mjs` and untracked risks-redesign, R026/R048 output and partner-share work. GitHub had advanced to `1c76dbfc2bce6222695e110ee47966496a3b9288`; the affected existing documents are unchanged between those commits.

Work is isolated in `C:\GitHub\AppSheet-Loan-Project-dots-rules`, branch `codex/dots-orchestration-rules`, based on that latest commit and tracking `origin/master`. Git's repository ownership check requires a per-command `safe.directory` for the original owner-shared checkout; no global Git trust settings were changed. The managed-worktree helper encountered the same ownership check; the standard Git worktree command succeeded with the exact per-command repository exception.

Rollback: revert this documentation commit normally, preserving subsequent work. No live asset backup is needed for file-only edits.

## Changed files and decisions

- `Documents/Dots_Orchestration_Rules.md`: current AGENTS entry point, owning-repository boundaries, completion and approval reuse, scoped delegation, worker follow-through/stop handling, three-minute updates and four requested ready-to-paste Personalization > Custom rules entries. Five additional proposed entries cover verification, recovery/preservation, efficiency, handoffs/uncertain-result reconciliation, and account/data protection; these restate existing project practices without expanding authority.
- `Documents/Model_Work_Mapping.md`: owner-editable work categories, exact model/effort identifiers, fresh-read and publication behavior, task overrides, escalation and unsupported-control handling.
- `AGENTS.md`: discoverability and standing scope for the requested Dots delegation; existing live-service and release boundaries remain in force.
- `Documents/Development_Workflow.md`: replace the dated assignment-specific Astra and routine-data Sol Medium text with a link to the current mapping. Execution locations and access remain unchanged.
- `Documents/README.md`: navigation entries for both new documents.
- This log: scope, baseline, rollback and validation/activation status.

The mapping is an instruction source, not a routing daemon or configuration automatically loaded by Dots. The Custom rules entries point to the published instructions and mapping; later published mapping edits apply when Dots next reads the file. No Dots account setting, live model selection, scheduler or persistent service model is changed. Official Dots controls and OpenAI model-selection documentation were opened to distinguish working instructions from permission rules and account capabilities.

## Checks and status

Documentation implementation and saved-file review are complete. Validation passed: 100 local Markdown link targets resolve; all six mapping rows have the expected table shape; Git whitespace checks pass; all AGENTS sections from project release tracking onward are unchanged. The six intended Markdown files contain no credentials or private business data. The isolated worktree preserves the original checkout's unrelated work. No live GUI/SQL tests apply to this file-only change.

Publication target is the branch's configured `origin/master`, using a normal fast-forward push with remote commit verification. The task result records the verified publication commit. No force-push or release tag is appropriate for this governance change.

Remaining activation check: save the requested entries and any selected proposals in ChatGPT Personalization > Custom rules, then observe a future task using the current mapping and progress cadence. This is not claimed as installed or runtime-tested behavior.
