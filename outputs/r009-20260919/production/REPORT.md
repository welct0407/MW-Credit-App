# R009 production promotion — 19 September 2026

Production App Upgrade completed in the existing app IDs. Final documentation/publication is recorded in the [manifest](../release-manifest.json) and [document checklist](documentation-checklist.md).

| Component | Integrated DEV | Frozen RC1 | PROD before | PROD after |
| --- | --- | --- | --- | --- |
| OLTP | 1.000033 | 1.000006 | 3.000228 | 3.000231 |
| OLAP | 1.000015 | 1.000006 | 1.100178 | 1.100181 |
| PostgreSQL / Flyway | V26 | PROD-bound, no RC DB | V24 | V26 |

Owner request to promote R009 supplies acceptance and scoped authorization for the complete current batch. It supersedes the earlier in-development checkpoint. Implementation commit: `7fc856102101fdf93c54e5927a4b6ec36e1ffd6b`. Final evidence tag: `R009` (resolve its commit from Git).

## Scope and method

- Three quick-payment closure summaries execute only when the exact posted receipt closes a loan.
- V25 separates unique Partner login identity from notification delivery. All 12 push tasks exclude the acting Partner Row ID, then deduplicate nonblank delivery addresses. PROD contact addresses were retained; DEV owner-only data was not copied.
- All four closure-summary bodies display Loan Key. Receipt selectors still use immutable IDs.
- The original OLTP Effective Daily Interest Rate VC and V26 OLAP SQL view divide the applicable daily-income amount by Outstanding Principal, returning zero for nonpositive balances. Loan Key remains unchanged and reflects the rate.
- Owner OLTP GUI refinements are included in the complete saved 1.000033 definition. No manual transcription or selective recreation in PROD.

Copied both integrated DEV definitions without data or file-data copies. RCs are `MW-OLTP-R009-RC1-578763613` (`b21a5069-4897-4937-a62c-993563fcf572`) and `MW-OLAP-R009-RC1-578763613` (`5fce331d-68d5-49b8-923f-01dc1b524c9f`). Both are Deployed, owner-only with zero shared users, and frozen at 1.000006. All 13 OLTP and 19 OLAP SQL sources use PROD `database-2`; native settings/process-state tables remain app-local. [Complete source mapping](source-mapping-validation.json).

RC preparation restored each corresponding PROD short name, logo, default folder, companion link and theme: light, Colored header/footer, Rubik 20; OLTP `#d81b60`, OLAP `#0abab5`. DEV themes remain unchanged. Shared R009 recipient expressions required no substitution. Each scheduled bot retains its enabled definition and canonical DEV/PROD allowlist before business steps and in its per-row filter. RC internal names are excluded. The disabled first-day charge and analysis-export jobs remain disabled.

Initial RC deployment checks passed definition/errors, source structure, sign-in, allowed updates and account status. AppSheet marked both ready to deploy. Optional recommendations concerned missing industry/function metadata, server-side caching and OLAP menu layout; these are not editor configuration errors and no business/cache/layout change was introduced to silence them. After deployment both editors showed **No issues found**. No repeat Deployment Check or Prototype toggle was used on PROD.

PROD baselines were rechecked in version history immediately before upgrade. App Upgrade ran OLAP first, then OLTP, from the full frozen RC internal names. New-major-version was left off for this compatible additive release. Existing target UUIDs and Deployed state were retained.

## Verification

| Check | Result |
| --- | --- |
| DEV integration | Final saved 1.000033 / 1.000015, both editors clear. Reused unchanged [closure tests](../TESTS.md), [identity tests](../IDENTITY_TESTS.md) and [rate tests](../EFFECTIVE_RATE_TESTS.md). |
| PROD pre-migration drift | V24 schema normalized hash matched the accepted R008 final schema: `ef12bbd67117e9a35b1d69880559e79d464ff9daa42cb972de9bd77c79cbb41c`. |
| Backup recovery | Full private logical dump restored locally, including public, assessment_lab and Flyway history; normalized schema matched. Cloud SQL cron extension/settings remain separately governed. |
| Identity prerequisites | Both existing PROD Partner emails matched the corresponding verified DEV Login Email identities by Partner ID; only hashes/aggregate result retained publicly. |
| Flyway | Exact V25/V26 applied at 21:07:52 Bangkok. Post-validation passed 27 migrations/history entries with no warnings. Standalone pre-validation reported only the two expected pending migrations; no checksum repair or ignore flags used. |
| PROD rate reconciliation | 72 loans, including 10 partial-balance loans; zero nonzero rates on zero balances and zero calculation mismatches. |
| Saved definitions | Final PROD UUIDs/versions confirmed; both editors **No issues found**; both Deployed. All SQL sources in resulting saved documentation are database-2; app-local native sources retained. |
| Current runtime | Both apps opened and synced. OLTP dashboard, loans, revised rate/Loan Key and payment entry list loaded. OLAP dashboard, loans, partners and edit form loaded; separate Login Email visible, form cancelled unchanged. Closed-loan rate zero and a nonzero rate read consistently in both apps. |
| OLAP calculation metadata | Physical SQL-view field retained its historical AppSheet formula metadata (unchanged by R009); current read-only runtime displays V26 SQL results. Do not incorrectly document it as a new OLAP VC or as cleared metadata. |
| Environment substitutions | Exact PROD colors read back; production companion navigation and folders retained. Both canonical scheduled guard expressions read back in PROD. |
| Scheduled guard runtime | Reused server-side allowed/excluded branch proof from [refresh verification](../../dev-app-refresh-20260919/verification.json). No forced production schedule or notification. First normal post-upgrade PROD OLAP hourly run completed at 22:00 Bangkok (15:00 UTC), run `9beb94d0-8e79-426a-88bc-24aec2802685`; guard then Request Recent Analytics Refresh appeared in its completed process. PROD audit trace `ea61cdec-e583-481f-bc40-96ba89d75623` confirms Condition true and action Success; Statistics update succeeded at 15:00:05 UTC. The RC OLAP 15:00 UTC event showed Data Empty and no process/business steps, consistent with its excluded per-row filter. OLTP daily 00:05 run is not yet observed; the same verified guard pattern and saved canonical identity are reused. |

Generated documentation captures and raw GUI snapshots are private under `C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/r009-production`. AppDoc can contain stale/incomplete schema metadata; targeted current-editor/runtime checks take precedence (OLAP Login Email was verified in both). No full-property comparison with later DEV was used. No production financial test write, forced notification, access expansion or DEV refresh was performed.

Physical-device notification receipt and an actual Lisa-signed-in GUI transaction remain unverified; both actor identities were covered by prior SQL selection tests and owner acceptance via the promotion request. These are explicitly retained acceptance limitations, not claimed tests. Unrelated Looker/export pilot acceptance was not rerun.

## Recovery and retention

Restorable app rollback points were visible in history: OLTP **3.000228**, OLAP **1.100178**. Follow the [recovery runbook](../../../Documents/Release_Recovery_Runbook.md); do not automatically restore over later work. V25 is additive and V26 preserves its view signature, so an app rollback normally retains SQL V26 and uses a reviewed forward fix. It cannot undo notifications or financial writes.

Private V24 dump `prod-backup-before.dump` SHA256: `216b12a0b82a1f4968995a79adbca38e150c7ba8635938234a45c6ad17fa6e86`. Exact runner manifest SHA256: `994ddc9ea26f6b9e70f114450a80bb909ff04c716d2c5832c0addd9834a7392c`. Keep both frozen owner-only RCs and private backup/captures at least through **19 October 2026** and until a later release has verified replacement recovery coverage. No automatic deletion or disabling of copied business definitions.

## Closure

Live upgrades, required basic validation and documentation closure are complete. All 21 Documents paths have explicit dispositions. Affected dictionary rows passed round-trip preservation checks and visual review; its error scan found no spreadsheet errors. Final manifest/log and source mapping agree. The unique annotated R009 tag identifies the final evidence commit; remote branch/tag publication is verified in the task result. No redeployment is needed for documentation closure.
