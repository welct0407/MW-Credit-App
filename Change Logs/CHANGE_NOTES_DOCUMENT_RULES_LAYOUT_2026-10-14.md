# Standing rules and evolving project documents

Owner requested two document sets on 14 October 2026 (Asia/Bangkok). Recovery baseline: `f28862bf778b77711f6f78f8cc2a31cc51a32a64` on `master`.

- Moved ten standing procedures into `Documents/Rules`: PWA orchestration, model mapping, development workflow, DEV preparation/refresh, release workflow/recovery, alert runbook, local storage and dictionary export. Added a Rules index; AGENTS and Documents/README explain the separation and keep routine progress out of rules.
- Kept evolving release/development state, environment/account inventories, design/data model, monitoring configuration/guide and structured Data Dictionary in Documents. Moved the changing delivery-tooling status table from orchestration into Development Changes; the old section anchor points to its new owner.
- Rebased links within moved files and repaired incoming current/historical Markdown links, release templates and the maintained profile-migration document allowlist. Immutable Git source links and historical prose remain historical. App repository guidance receives only the matching path repairs in its own commit; no product/runtime changes.
- Preserved the existing unpublished Phase 2 README/development notes, change log, outputs and unrelated app-repository work. These changes are excluded from this publication.

Checks: all 197 local links/anchors in 28 current documents passed; 93 changed incoming local links passed; maintained helper parsed successfully; promotion-checklist test passed (including generated links and cleanup); dictionary export verified all embedded bytes for 414 objects / 425 sources; scoped Git whitespace/diff review passed. The incoming-link checker initially hit Windows default text decoding and passed after explicit UTF-8 decoding; no document defect was involved. No product CI or deployment is required.

Recovery: revert the scoped path-move/link commits, preserving unrelated work, and regenerate the local ignored dictionary upload if required. No new dependencies, private exports or retained scratch were created. The checklist test removed its own temporary directory; C: free space was 60.03 GiB. Publish through normal pushes and verify remote tips.
