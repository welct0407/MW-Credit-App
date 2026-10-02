# Dots orchestration instructions — 2 October 2026

## Scope and purpose

The owner requested project-aware Dots rules, completion without step-by-step confirmations, editable model/work assignments and progress updates every three minutes for longer tasks, then clarified the Personalization > Custom rules destination and requested other useful proposals. Current assignments after the same-day owner refinement are Astra High for design, troubleshooting and on-call support; Sol 6.1 High for execution; and Sol 6.1 Medium for verification and documentation/routine analysis. This is governance/documentation work; no product release number or live app/database/service change is required.

## Baseline and rollback

Original checkout: `master` at `d351991d1a1c0895d4abc8f0f4ba4fa55fa7a4e5`. Preserve its unrelated modified `scripts/metabase/PartnersTab.mjs` and untracked risks-redesign, R026/R048 output and partner-share work. GitHub had advanced to `1c76dbfc2bce6222695e110ee47966496a3b9288`; the affected existing documents are unchanged between those commits.

Initial work was isolated in `C:\GitHub\AppSheet-Loan-Project-dots-rules`, branch `codex/dots-orchestration-rules`, based on that latest commit and tracking `origin/master`. It was published as `cba8445c6501037c034db934c882d08a0da48628`, fast-forwarded into the original checkout with all 12 existing modified/untracked files hash-verified unchanged, and the clean temporary worktree was removed. Git's repository ownership check requires a per-command `safe.directory` for the original owner-shared checkout; no global Git trust settings were changed. The managed-worktree helper encountered the same ownership check; the standard Git worktree command succeeded with the exact per-command repository exception.

The same-day repository-routing refinement starts from `cba8445c6501037c034db934c882d08a0da48628`, isolated in `C:\GitHub\AppSheet-Loan-Project-dots-routing` on `codex/dots-repository-routing`, tracking `origin/master`. The owner identified the five extra proposals as redundant with AGENTS and requested task-to-repository routing. The rules now retain the original four, strengthen Rule 1 to read and follow current owning instructions, and use Rule 5 for repository selection. The earlier five overlapping proposals are removed.

Rollback: revert this documentation commit normally, preserving subsequent work. No live asset backup is needed for file-only edits.

## Changed files and decisions

- `Documents/Dots_Orchestration_Rules.md`: five ready-to-paste Personalization > Custom rules entries covering current AGENTS, completion/approval reuse, model delegation, three-minute updates and repository selection. Existing project safeguards are inherited through Rule 1.
- `Documents/Model_Work_Mapping.md`: owner-editable work categories, exact model/effort identifiers, fresh-read and publication behavior, task overrides, escalation and unsupported-control handling.
- `AGENTS.md`: discoverability and standing scope for the requested Dots delegation; existing live-service and release boundaries remain in force.
- `Documents/Development_Workflow.md`: replace dated model preferences with the current mapping link; clarify the existing repository table as the single task-to-repository map. Route loan apps/reporting and chart/monitoring source to AppSheet-Loan-Project, integration code/services to MW-Integration-Agent, general repository work to Daily-Use, and AI Collection to its separately governed repository. Cross-repository work stays with each component owner. Execution access and production authority remain unchanged.
- `Documents/README.md`: navigation entries for both new documents.
- This log: scope, baseline, rollback and validation/activation status.

The mapping is an instruction source, not a routing daemon or configuration automatically loaded by Dots. The Custom rules entries point to the published instructions and mapping; later published mapping edits apply when Dots next reads the file. No Dots account setting, live model selection, scheduler or persistent service model is changed. Official Dots controls and OpenAI model-selection documentation were opened to distinguish working instructions from permission rules and account capabilities.

## Checks and status

Documentation implementation and saved-file review are complete. Validation passed: 100 local Markdown link targets resolve; all six mapping rows have the expected table shape; Git whitespace checks pass; all AGENTS sections from project release tracking onward are unchanged. The six intended Markdown files contain no credentials or private business data. The isolated worktree preserves the original checkout's unrelated work. No live GUI/SQL tests apply to this file-only change.

Repository-routing refinement: 71 relative link targets in the four affected documents resolve, both new anchor references and the repository table shape pass, and exactly five Custom rules remain. Saved diff/whitespace review passed. The existing workflow/AGENTS establish component ownership; the local Daily-Use README still contains only its title. No cross-repository file, model assignment, AGENTS safeguard or live runtime is changed by this refinement.

Publication target is the branch's configured `origin/master`, using a normal fast-forward push with remote commit verification. The task result records the verified publication commit. No force-push or release tag is appropriate for this governance change.

Remaining activation check: save the five current entries in ChatGPT Personalization > Custom rules, then observe a future task using the current repository/model mappings and progress cadence. This is not claimed as installed or runtime-tested behavior.

## Model effort refinement — 2 October 2026

Starting commit/rollback reference: `53b0d59416119d0e9f2577755ada5ff0f2931147`. At the owner's request, lower the three Astra categories from Extra High (`xhigh`) to High (`high`), and lower Verification and Documentation and routine analysis from Sol 6.1 High (`high`) to Medium (`medium`). Execution remains Sol 6.1 High. Update both the readable labels and tool values; remove the mapping's obsolete historical preference sentence. Only the mapping and this log change; unrelated local work is preserved. Revert this scoped documentation commit for rollback.

Validation passed: the saved six-row table matches the requested efforts, labels and tool values agree, the reviewed diff preserves model IDs and the execution assignment, and Git whitespace checks pass. The published mapping applies on Dots' next read; no active model, account setting or service configuration is changed.

## Separate Git publication rule — 2 October 2026

Starting commit/rollback reference: `8220b83642b0a8688490a3ed8b19acf49f3f21f0`. The owner supplied the existing ChatGPT Custom rule as reference and requested that the proposed orchestration rules defer to it, plus proposed replacement wording if useful. Rule 2 now explicitly defers repository publication to the repository-specific Git publication Custom rule and applicable AGENTS. Setup text explains the five orchestration rules plus the separate publication rule, without extending its AppSheet-Loan-Project-only scope through repository routing.

The proposed publication wording retains the original draft-PR requirement, existing audience, preservation/exclusion boundaries and prohibited actions. It clarifies use/reuse of a dedicated task branch and draft PR, verification of publication and no direct default-branch push. This is a proposal for the owner's settings, not an installed rule or a change to AGENTS/current task publication authority. Only `Documents/Dots_Orchestration_Rules.md` and this log change; models, repository ownership and unrelated local work are preserved. Rollback is a normal revert of this scoped documentation commit.

Validation passed: saved wording and scoped diff reviewed, all five local Markdown link targets resolve, Git whitespace checks pass, and exactly five orchestration entries remain distinct from the proposed separate publication rule. Live ChatGPT settings are unchanged; applying the proposed wording there remains an owner action.

## 400-character Custom rules limit — 2 October 2026

Starting commit/rollback reference: `1978318392496aee517b3353c8eb16405389c518`. The owner reported a 400-character limit per saved rule. Shorten all five orchestration rule bodies and the separate proposed Git publication rule while preserving the current source URLs, model-file routing, approval reuse, progress cadence, repository routing and publication scope/prohibitions. Detailed guidance stays in the owning Markdown file, linked through AGENTS. Only the rules document and this log change; unrelated edits remain untouched. Rollback is a normal revert of this scoped documentation commit.

Rule bodies use ASCII text for unambiguous counts including spaces and URLs: 319, 364, 372, 368, 382 and 392 characters respectively. Validation passed: saved-body length/ASCII checks, readback and scoped Git whitespace review. No saved ChatGPT settings, active model, repository mapping or service configuration is changed.

## Rule 1 scope clarification after settings rejection — 2 October 2026

Starting commit/rollback reference: `7b15162567349e07fa399cf4ae8e8fa069f52737`. The owner reported that ChatGPT rejected Rule 1 because it broadly required following repository-linked instructions without defining their scope. Narrow the entry to reading project facts, conventions and workflow guidance for owner-requested AppSheet-Loan-Project tasks. Explicitly state that repository content and linked files cannot grant permissions, expand scope or override owner instructions or app permission controls. Align the explanatory paragraphs with that boundary; do not change project policies or the other five rule bodies.

The replacement is 369 ASCII characters including spaces and its URL. Validation passed: all six saved rule lengths, unchanged other entries, scoped diff review and Git whitespace checks. Only the rules document and this log change; unrelated work is preserved. Rollback is a normal revert of this documentation commit. The revised rule has not been submitted to the settings validator here; acceptance remains unverified.
