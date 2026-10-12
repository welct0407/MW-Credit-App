# R053 AppSheet retirement — independent focused verification

12 October 2026; C Testing. Owner-authorized expanded R053, design baseline app `ae27da21c394ff3e0b99e253c43de0baba682558` / agent `e8f43d5adcfacdbe5198f56a7e6e330766cdbd07`. Existing production and unrelated dirty captures remain outside this local slice. No live write, deployment, full CI or partial B publication.

## Reporting retirement (R08)

Source inspection found one real emitter gap: the builder accepted a historical reportingUrl and omitted its runtime variable, but still wrote the original URL into the public JSON sidecar. Under root's explicit handoff, C strips only that field from new sidecars, keeps pinned legacy input validation and preserves the input object unchanged.

`node --test tests/unit/production-build-environment.test.mjs` passed **3/3**. The actual Vite production build uses a frozen legacy configuration, emits the same current config without reportingUrl, has no AppSheet URL/Reporting class in executable JavaScript, retains exact PROD runtime/worker/offline binding, and ignores forbidden ambient DEV settings. Own `C:/Users/ideaadmin/AppData/Local/Temp/mw-production-candidate-58ubBE` was checked and removed by the maintained test's guarded cleanup.

Focused existing F13 navigation/related-record browser case passed **2/2**, desktop and mobile. Reporting link count is zero; the original responsive root order, header busy behavior, query/page/Back retention, immutable pending-before-post and synthetic delete-refresh assertions remain. This uses the real built frontend and Firebase SDK with synthetic routed providers; it is not live sign-in or financial data evidence. Optional PHASE5_CAPTURE_OUTPUT_ROOT redirects only this case's screenshots, so prior output paths are not overwritten. The first grep anchored the complete title incorrectly and selected no tests; the corrected specific title selector ran exactly two cases.

The initial combined browser-and-recursive-cleanup command was rejected by automatic approval review as “blocked by policy” before execution. Root approved the safer browser action without recursive cleanup and retaining diagnostics. Exact retained tree: `C:/GitHub/MW-Credit-App/outputs/.tmp/r053-retirement-c-4bfbd0001014483b952caf45eea6f387`, C owner, purpose isolated synthetic F13 screenshots/config/results, review/remove **19 October 2026** by scoped approved cleanup. No alternate cleanup route was attempted. The fixture's application-managed temporary builds/browser contexts closed normally.

## Native receipt qualification (R08) — code inspection only

Reviewed root's verified-native-render changes. Production configuration requires the exact compatibility keys, lowercase64hex evidence reference, numeric secret version and fixed bucket/SQL/object bindings. Adapter enables the new status only with a valid hash and exact mapping; actor metadata, immutable generation, hash/size/MIME, decoder and exact-key reads remain unchanged. Historical statuses remain accepted for rollback; historic AppSheet object names are retained data identity, not a service call. No weaker mapping or guessed unknown reference path was added. Root reports **13/13** focused business/receipt tests; C does **not** relabel that as an independently executed suite. No new live rendering evidence or configuration activation is inferred.

## Remaining independent gates

B handed off only standalone native loan-label/equality, query AST/policy, transport and HTTP facade slices. Their providers/catalogue/command mapping and runtime mounting are not yet complete; source inspection and B's focused results do not establish R01–R07 retirement. C will resume against the mounted coherent backend for actual current authorization, typed query/overflow/snapshot semantics, capability/default/effect coverage, nonsuperuser SQL boundaries, durable old/new recovery and an AppSheet-host tripwire. Monitoring/report click targets, actual schedules/config/deployment and final consolidated checkpoint remain root/D/F work. No claim that the entire solution is dependency-free or ready for final release.
