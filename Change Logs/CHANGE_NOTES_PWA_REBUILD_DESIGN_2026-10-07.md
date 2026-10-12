# PWA rebuild design change notes

Date: 7 October 2026, Asia/Bangkok.

## Scope and purpose

Prepare the owner's requested high-level replacement design from the shared PWA discussion and maintained AppSheet business/environment references. Require a new application repository, retain the existing databases, Metabase and Grafana, cover all OLTP capabilities on mobile and all OLTP/OLAP capabilities on desktop. Owner selected online payment confirmation with offline viewing and drafts.

Owner refinement in the same task: both old and new apps must run in parallel before seamless cutover. The design now explicitly covers concurrent frontends, shared database contracts, AppSheet bot-trigger differences, cross-client retries, one executor per background effect, phased adoption, old-client sync drain and data-preserving fallback.

## Changed files

- `Documents/PWA_Rebuild_High_Level_Design.md`: proposed architecture, coverage baseline, retained service enhancements, financial/API contracts, offline/push behavior, repository/migration ownership, delivery, cutover and acceptance.
- `Documents/README.md`: navigation entry for the proposal.
- This log: scope, baseline, verification and publication status.

## Baseline and rollback

Starting commit: `7755fe2eae3dee98c64fb51e9afba08fa8ebba37`, local `master`. Design work uses `codex/pwa-rebuild-design`. Existing modified `scripts/metabase/PartnersTab.mjs` and untracked risk/payment-health/partner-share artifacts and helper were present before this task and are excluded.

File-only rollback: revert the design commit or remove the two new documents and their documentation-map entry. No app, database, report, dashboard, infrastructure, access or service mutation was performed. No product release number is allocated for this design-only task.

## Checks and evidence

- Read the shared chat through the browser, including its PWA architecture and later GitHub-first refinement.
- Cross-checked maintained solution/model/inventory references and bounded dictionary navigation/automation names. This is not a complete live app inventory or feature-parity certification.
- Verified relevant platform capabilities against official Firebase, Google Cloud, WebKit, Metabase and Playwright references linked in the design.
- Preserved current financial rules rather than adopting illustrative shared-chat rules, tables, schedules or costs.
- Owner's online-only posting choice incorporated; all current OLAP management remains in desktop scope.
- Local Markdown links passed; saved design and navigation entry read back; whitespace check passed. Final staged scope is restricted to the three listed design/documentation files.

## Status and remaining work

High-level design complete for owner review. Publication target: `codex/pwa-rebuild-design` in the existing ecosystem repository; the final task response supplies the verified publication result. The new application repository is proposed, not created; no implementation, schema approval or production authorization is claimed. Detailed feature mapping, live dependency verification, role/device decisions and all implementation/device/financial tests remain future work as described in the design.
