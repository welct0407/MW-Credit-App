# R011 promotion checklist

Template revision: 2026-09-20. **Single master:** `scripts/releases/templates/promotion-checklist.md`. Implementation detail: [Release Workflow](../../Documents/Release_Workflow.md); exceptions: [Recovery](../../Documents/Release_Recovery_Runbook.md).

## Continue here

- Outcome: **Released 21 September 2026**.
- Scope: borrower note quick edit, required English Name, Thai/English new-borrower form labels, Partner-preference system-text localization, optional Cash Accounts alternative number, and the former R012 Cash Ledger Recent refinement. R012 was merged into R011 and its number retired.
- Records: [manifest](release-manifest.json), [log](../../Change%20Logs/CHANGE_NOTES_R011_2026-09-20.md), [tests](test-results.md), [production report](production/REPORT.md).
- Authority: owner accepted the integrated scope and directed production promotion in the current task.
- Final PROD: SQL V29 / OLTP 3.000240 / OLAP 1.100189. Rollback app versions: OLTP 3.000237 / OLAP 1.100183; retain compatible nullable V28/V29 columns unless a separately reviewed database restore is required.
- Tested package: commit `d8642d06d6bd39f0f168282b990bbc79721af3f6`; corrected private runner-manifest SHA256 `8AEE4B26AC33835A5E9B242965B3B17CA6916A41DC06323ABCF6B8AFD1F2D511`.
- Frozen candidates retained: OLTP RC3 `ba1c0e84-fba3-435c-8b4b-68653e34dea5` 1.000005 and OLAP RC3 `2aa8074e-7376-44a7-a46a-e1c597618f4b` 1.000005, both Deployed and guard-contained.

## Activities

| ID | Stage | Status | Evidence / result |
| --- | --- | --- | --- |
| P01 | A Readiness | Done | Owner merged R012 into R011, accepted the integrated batch and authorized promotion. Both apps included. |
| P10 | A Readiness | Done | DEV OLTP 1.000062 / OLAP 1.000021 editor-clear; SQL/GUI/localization/Cash Ledger tests passed. |
| P06 | A Readiness | Reused | Existing server-side canonical allow/exclude proof reused; guards unchanged and re-read on RC3/PROD. |
| P08 | A Readiness | N/A | No recipient, login mapping or DEV route changed. |
| P04 | A Readiness | Done | V29 chain tested and pinned at `d8642d06d6bd39f0f168282b990bbc79721af3f6`; all migration hashes covered. |
| P13 | B Capture | Done | PROD identities and pre-upgrade OLTP 3.000237 / OLAP 1.100183 recorded; authority and rollback established. |
| P14 | B Capture | Done | RC1 rejected unused because defaults remained selected. RC2 and final RC3 created definition-only with data/file-data copy explicitly off. |
| P22 | C SQL | Done | Verified private backup and schema comparison; PROD migrated V27→V29 and post-migrate validation passed. |
| P25 | D RC | Done | All 16 OLTP and 19 OLAP objects mapped to PROD `database-2`; exact mapping saved. |
| P18 | D RC | Done | PROD themes, display names, companion links and PROD Partner data retained/rechecked. |
| P28 | D RC | N/A | No external asset or access change. |
| P29 | D RC | Done | RC3 guard expressions contain only canonical DEV/PROD internal names; RC names excluded. |
| P30 | D RC | Done | Both RC3 apps passed initial Deployment Check, deployed, saved and editor-clear at 1.000005. |
| P33 | E Upgrade | Done | Frozen RC3 identities/versions, unchanged PROD baselines and authority confirmed immediately before upgrades. |
| P37 | E Upgrade | Done | Existing PROD IDs upgraded through App Upgrade; final OLTP 3.000240 / OLAP 1.100189. |
| P39 | F Validate | Done | Both PROD apps Deployed/editor-clear; sources, themes, links, guards, load/sync and representative changed entry points passed. |
| P41 | F Validate | Done | PROD Cash Position/Cash Ledger detail and bilingual borrower form checked without a write; SQL validation passed. |
| P38 | F Validate | N/A | No paused jobs or external cutover steps. |
| P45 | G Close | Done | Required core records and affected model records updated below. |
| P46 | G Close | Done | Manifest/log/versions/authority/recovery reconciled; dictionary rows promoted and R012 links consolidated. |
| P49 | G Close | Done | Frozen RC3 apps retained Deployed as recovery evidence; guards contain execution. |
| P48 | G Close | Done | Final sanitized evidence committed/pushed and unique annotated R011 tag published; remote verification recorded in final task report. |
| P50 | G Close | Done | Released after required validation, documentation and publication. |
| P51 | X Exception | Done | RC2 OLAP display-name mismatch stopped before OLTP upgrade; corrected through new definition-only RC3 and normal App Upgrade. No manual PROD fix or data effect. |

## Documentation impact and closure

| Document | Disposition | Updated section / evidence |
| --- | --- | --- |
| [Release Tracker](../../Documents/Release_Tracker.md) | Updated | R011 Released; R012 merged/retired; next R013. |
| [Environment Inventory](../../Documents/Environment_Inventory.md) | Updated | PROD V29 / OLTP 3.000240 / OLAP 1.100189 and retained RC3 identities. |
| [Development Changes](../../Documents/Development_Changes.md) | Updated | R011/R012 product differences closed. |
| [AppSheet_Data_Dictionary.xlsx](../../Documents/AppSheet_Data_Dictionary.xlsx) | Updated | Dev Differences closed; PROD columns/settings recorded with rendered verification. |
| [AppSheet_Data_Model_Overview.md](../../Documents/AppSheet_Data_Model_Overview.md) | Updated | Production behavior for account aliases, borrower operations/localization and Cash Ledger detail. |

## Close

- Outcome: **Released**. Production SQL V29 / OLTP 3.000240 / OLAP 1.100189.
- Recovery: app rollback OLTP 3.000237 / OLAP 1.100183; retain additive schema. Verified private pre-release dump details are in the production report.
- Limitations: no production financial test write, forced notification or forced schedule. Physical-device/offline, separate Partner-login and concurrent-edit behavior were not retested.
- RC retention: frozen RC3 definitions retained Deployed and guard-contained; no deletion authorized.
