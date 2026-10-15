# Completed pull-request merges — 14 October 2026 (Bangkok)

Owner requested merging all open pull requests into the repositories default branches. Existing local uncommitted credential and documentation work was preserved. Repository integration only; no runtime deployment or release acceptance change.

- MW-Credit-App #4: merged into main at e09da64e2b0a62c714a756168268a7670f0cd1d2; existing checks passed.
- MW-Integration-Agent #5: merged into main at bed986e1dc9ed8452120254b4507bf3b607ffe69; existing agent tests passed.
- MW-Credit-App #5: retargeted from completed #4 dependency to main and merged at fce5775a549d6f94e657385acc8f6953ab430fe8, 14 October 2026 01:18 Bangkok. Test-only corrections committed as 9f36dd2: explicit Bangkok business date for historical payment fixture and already-aborted request handling in notification mock. All database Test-CI stages passed across scoped continuations, reusing unaffected passing stages. See the application repository CHANGE_NOTES_MERGE_CI_FIX_2026-10-14.md for evidence and initial failures.

Final GitHub owner-wide open-PR search returned zero open PRs. All three merges used normal merge commits without an administrator bypass or history rewrite. No additional CI workflow was manually dispatched; ordinary publication can trigger configured workflows. Recovery uses reviewed revert commits. No production operation or local checkout reset was performed. Task-owned stopped disposable database fixtures were cleaned with the maintained exact-path helper; concise private CI logs remain for review by 20 October 2026.
