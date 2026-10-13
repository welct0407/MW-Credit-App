# Merge validation fixture corrections — 14 October 2026

PR #5 database checks exposed a historical payment fixture using UTC current_date while its charge used Bangkok business time. The fixture now explicitly uses Asia/Bangkok. A local continuation also exposed a notification timeout mock that listened for abort only after an asynchronous database query; it now rejects an already-aborted signal, matching fetch behavior.

Changed tests/integration/agent-native-historical-fixture.sql and tests/integration/r053-wakeup-independent.test.mjs. Starting commit: 574f87635447617fc317a305924f4b72f91f7f35. No production logic, migration or deployment changed. Recovery uses a normal revert.

Validation: all stages of scripts/database/Test-CI.ps1 passed across a consolidated run with scoped continuations. The five migration/upgrade stages passed first; the missing worktree dependencies were resolved through the existing shared node_modules junction with matching package-lock hashes. Receiving, role maintenance, unified receiving and all Phase 5 stages passed next. After correcting the timeout mock, R053, agent native operations, agent reads and both isolated operator provisioning stages passed. PGTZ=UTC was set for psql fixture sessions. All databases were disposable and local; no live financial writes occurred. git diff --check passed.

Private diagnostics are merge-ci-20261014.log, merge-ci-resume-20261014.log and merge-ci-final-20261014.log in C:/Users/ideaadmin/Documents/ChatGPT/MW-Credit-App/terraform/r057-adoption; review by 20 October 2026. Earlier passing stages were reused without another full-suite repeat. Generated local timing evidence is excluded from the commit. No manual CI workflow dispatch was made.
