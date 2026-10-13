# Standing rules and evolving project documents

Owner requested two document sets on 14 October 2026 (Asia/Bangkok). Recovery baseline: `f28862bf778b77711f6f78f8cc2a31cc51a32a64` on `master`.

- Moved ten standing procedures into `Documents/Rules`: PWA orchestration, model mapping, development workflow, DEV preparation/refresh, release workflow/recovery, alert runbook, local storage and dictionary export. Added a Rules index; AGENTS and Documents/README explain the separation and keep routine progress out of rules.
- Kept evolving release/development state, environment/account inventories, design/data model, monitoring configuration/guide and structured Data Dictionary in Documents. Moved the changing delivery-tooling status table from orchestration into Development Changes; the old section anchor points to its new owner.
- Rebased links within moved files and repaired incoming current/historical Markdown links, release templates and the maintained profile-migration document allowlist. Immutable Git source links and historical prose remain historical. App repository guidance receives only the matching path repairs in its own commit; no product/runtime changes.
- Preserved the existing unpublished Phase 2 README/development notes, change log, outputs and unrelated app-repository work. These changes are excluded from this publication.

Checks: all 197 local links/anchors in 28 current documents passed; 93 changed incoming local links passed; maintained helper parsed successfully; promotion-checklist test passed (including generated links and cleanup); dictionary export verified all embedded bytes for 414 objects / 425 sources; scoped Git whitespace/diff review passed. The incoming-link checker initially hit Windows default text decoding and passed after explicit UTF-8 decoding; no document defect was involved. No product CI or deployment is required.

Recovery: revert the scoped path-move/link commits, preserving unrelated work, and regenerate the local ignored dictionary upload if required. No new dependencies, private exports or retained scratch were created. The checklist test removed its own temporary directory; C: free space was 60.03 GiB. Publish through normal pushes and verify remote tips.

Publication: layout commit `ce4eb8a5` is on PM master. App path-fix commit `33f6147` initially encountered a non-fast-forward push because the remote had newer R056 work overlapping unpublished local files. Integrated it with remote `53cf5c0` in isolated temporary worktree `C:/Users/ideaadmin/AppData/Local/Temp/mw-doc-rules-6b692cd0030942dda168ba10cc5673bb`, normally pushed `83c3d65`, and removed that exact worktree. Remote tips verified; all 39 pre-existing tracked app edits and the PM Phase 2 edits remain in their primary checkouts. No force push or history rewrite.

## Required maintenance and document-creation approval

Owner follow-up, 14 October 2026. Baseline `65b0ae49d8f2ddb59909048d738c5871331b9f43`. Updated existing AGENTS/workflows/model mapping/indexes and release/dictionary helper guidance: every development batch covers the full evolving-document index and updates all affected references before completion. D owns maintenance, C verifies changed facts against implementation/evidence, and the orchestrator confirms coverage. Unchanged facts need no cosmetic rewrite or new checklist.

Explicit owner approval is required before creating any new document, including logs, plans, reports, handoffs, release records/manifests, dictionary documents or export copies. Existing documents/exports may be updated. Missing required records are proposed in chat or an existing record and the dependent step waits for approval; validators are never bypassed. This entry reuses the existing log; no new document was created.

Checks: evolving-reference coverage, 109 local links/anchors across changed and pre-existing dirty documents, instruction consistency and Git whitespace review passed. This policy-only batch changes no product/release/runtime fact or dictionary-export input; other evolving references remain current without artificial edits. No product CI/live audit was needed. Existing Phase 2 work remains uncommitted and excluded. Recovery is a scoped revert to the baseline while preserving that work. No scratch/dependencies created; C: free space 60.02 GiB. Normal commit/push and remote verification complete publication.
