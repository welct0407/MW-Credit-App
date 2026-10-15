# R014 production promotion — 21 September 2026

Status: Released. Owner authorized the complete integrated R014 on 21 September, including the other session's AI Reviewer change. Rejected forecast changes remain excluded.

## Recovery and SQL

- Starting repository commit: `f595801`; tested SQL commit `75f847d9ba31c580b8c8f336df92a606635b2f6e`.
- PROD app rollback: OLTP `3.000242`, OLAP `1.100191`, including separately authorized API enablement. Both live baselines were refreshed and unchanged immediately before promotion.
- Private backup label `r014-production-before-20260921-2050`; SHA256 `F3AE27FCB6577A45A3AE8CB58AF6F6AC86B1A486552249A9DDBBAF49AE9D2E19`. Maintained restore test succeeded, normalized schema matched, V31 rehearsal succeeded. V32 full-chain tests reused.
- Target `appsheet-pg-prod-20260914` / `34.21.174.215` / `loan_manager_prod`. Normalized schema unchanged from prior V30 snapshot; stable Tommy identity confirmed before V32.
- Maintained pinned runner migrated V30 to V32 at `2026-09-21T20:50:30.4955784+07:00`. Two migrations succeeded; post-validation passed all 33 history entries without warnings or invalid migrations. Flyway manifest SHA256 `b0a68b2f49169a2bec7fe31d428e1722562fc67cbfb0a50ce50202adb1b5f6cf`.
- A checkout EOL difference in V15 initially failed the manifest hash check. Restoring the exact tested bytes reconciled it; clean pinned Git state and all hashes passed before migration. No checksum repair/history modification.

## Frozen candidates

| App | DEV version | RC ID | Full internal name | Frozen version |
| --- | --- | --- | --- | --- |
| OLTP | 1.000075 | 7de4438a-90b9-47f8-a6db-6c62b995c5c1 | MW-OLTP-R014-RC1-578763613 | 1.000007 |
| OLAP | 1.000031 | 4936b576-e35a-4b24-b258-51e89f5a2e57 | MW-OLAP-R014-RC1-578763613 | 1.000006 |

Both copies were definition-only: data and file-copy boxes actively unchecked and verified before Copy. Both are Deployed, saved, and show **No issues found**. All 18 OLTP and 19 OLAP source mappings were independently read back after saving: `database-2`, existing public objects; OLAP retained its analytical views. No DEV connection remains.

Production substitutions: existing PROD display names, light theme, OLTP `#D81B60`, OLAP `#0abab5`, existing production logo URLs, Colored style, Rubik 20, production default folders and canonical PROD companion links; API Enable true preserves the separately authorized production access. No new keys requested. Shared recipient expressions retained; PROD Partner data supplies delivery contacts.

Initial deployment checks passed definition/errors/data structure/security/account. Nonblocking inherited advice concerned classification, menu size and server caching; existing production branding preserved. Final editor configuration diagnostics are zero in both candidates.

Scheduled guards were inspected in both copied process first branches and per-row filters. Canonical DEV/PROD pairs remain allowed; both RC names excluded. Enabled schedules and disabled superseded bots retained. Existing runtime proof in `outputs/dev-app-refresh-20260919/verification.json` reused; no forced production writes or notifications.

## Production results

- App Upgrade succeeded: existing OLTP ID → **3.000245**, existing OLAP ID → **1.100194**. No new major-version break was selected. Both remain Deployed, saved and No issues found.
- Both current GUI apps loaded/synced. Income MTD exposes eight metrics, account/owner balances load, Borrowers shows Active grouping, and Partner detail exposes AI Reviewer and Set Amount. Exact-amount form opened; Paid From Account listed an existing account with Clear/Done and no New. Unsaved form discarded; no settlement was posted.
- Affected PROD source readbacks passed. Both production branch guards still allow their canonical PROD names and exclude RCs. Frozen mapping/branding/companion settings promoted as one definition; no manual PROD recreation.
- Read-only production SQL: exactly one Cash Dashboard row; net=income+signed expenses; unsettled=net+signed withdrawals; both withdrawal signs nonpositive. Tommy selected, Lisa unselected, exactly one reviewer. Installed agent master selection matches that reviewer.
- Reviewed VM updater installed runtime matching pinned agent business code 83e1b56afef56a660aeff518ec32a09eee520790. Checkout 40076e6cbf3f81703a073326de4c8385fdd507a9 includes only later documentation/diagram changes; exact runtime/test/catalogue/updater equivalence checked before installation. IAP SSH respected the other session's Tailscale hardening; no firewall change.
- Private VM rollback directory: /var/lib/mw-integration-agent/rollback/reviewed-20260921T142836Z. Configuration/package and SQLite journals backed up; integrity checks passed. All **102 Debian tests passed**, installed CLI check returned OK, and all four previously active timers resumed. Activation controls/cutoffs retained.
- Bounded production AppSheet API probes authenticated to the original OLTP and OLAP IDs and returned two Partner rows each, using existing protected keys. No credentials exposed or regenerated.

## Closure, limitations and recovery

Dictionary rows A2880:E2915 promoted and verified with all unrelated values/formulas preserved. Tracker, inventory, development differences, model overview, database checkpoint and agent reviewer references updated. Existing exports/Looker and unrelated automation contracts unchanged; no separate dashboard publication required.

Physical-phone/offline/separate-login checks and a real customer reviewer direct-reply event were not exercised. Existing DEV behavior tests and reviewer negative-path tests are reused; no synthetic production payment or forced message was created. This limitation does not claim live reply delivery testing.

Both RC1 definitions were retired by explicit owner direction on 21 September 2026; both exact editor URLs returned 404. See [retirement evidence](rc-retirement.md). Historical frozen versions above are no longer live recovery sources. App rollback versions above do not undo database or financial data. Keep compatible V32 schema and journals; prefer a reviewed forward fix. If runtime recovery is necessary, restore its private backup under review because the former policy allowed all Partners to decide; reconcile pending reviews rather than copying an old approval.

Final evidence is published on the configured upstream with unique annotated tag **R014**. Resolve the tag for the final evidence commit; remote branch/tag verification is recorded in the final task result.
