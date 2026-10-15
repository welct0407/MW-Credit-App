# Documentation optimization — 20 September 2026

## Scope and authority

Implemented owner-approved proposals **1, 2, 3, 5, 6, 7 and 8**, plus the request for one Markdown promotion/documentation master and a filled copy per release. Proposal 4 was not selected: DEV preparation and DEV refresh remain separate and unchanged. Documentation/tooling only; no new release number, live app/database operation, DEV refresh or production authority.

Starting Git checkpoint: `bb50d30e3108dbdd14e51c15564554acec2ad2f9`; working tree was clean. R009 remains the recorded production baseline. R010 remains Ready for review, with acceptance, RC creation and promotion authorization pending.

## Changes

1. **Historical references:** moved the two completed migration plans, model history and original reconciliation workbook into [the dated archive](../Documents/archive/2026-09-20/). Archived full pre-cleanup tracker, environment, DEV-difference, model-overview and document-register snapshots. Historical records are outside routine reads, updates and promotion closure.
2. **Current references:** shortened tracker, inventory and development differences to current facts, compact status/evidence links and the preserved R010 backlog. The five main navigation/current references fell from 20,325 to 2,579 words; full history remains available by explicit link.
3. **Model ownership:** overview explains architecture/relationships/business behavior; dictionary holds exact configuration. Formula-only changes do not force unchanged prose edits. The dictionary Guide is shortened and stale maintenance instructions removed. All other sheet values, including R010 rows 2790–2811, remain unchanged. `R008 Production` and closed technical overlays remain because they contain unique exact property evidence, not redundant narratives; no unsupported whole-model reconciliation is claimed.
5. **Diagrams:** retain both drawio files unchanged. Move companion Markdown into the archive; preserve interpretation in Solution Design and generation/asset guidance in scripts README. No parallel maintenance of companion notes.
6. **Dormant feature:** move Daily Loan Analysis to `Documents/reference/`, explicitly outside routine releases unless its contract/dependencies or activation are affected.
7. **One execution checklist:** [single master](../scripts/releases/templates/promotion-checklist.md) contains 24 conditional activities and one documentation table. Three always-reviewed documents are Release Tracker, Environment Inventory and Development Changes; add only scope-affected documents. No routine folder inventory, archive dispositions or independent document checklist. The former document register is a compatibility pointer. The Excel workbook remains frozen review evidence; its builders and separate document generator are retired. The optional delta renderer no longer appends document rows. New `checklist.mjs` creates a scoped copy without overwriting evidence.
8. **Navigation and policy:** README becomes a compact map. AGENTS defines execution policy; Release Workflow explains triggered implementation detail without another activity checklist. Recovery/templates follow the same arrangement.

[R010's filled copy](../outputs/r010-20260919/promotion-checklist.md) links recorded scope, versions and tests, labels valid reused evidence and SQL/external non-applicability, and leaves promotion/closure pending. Its manifest and log point to the same copy. Future releases create their own copy from the master; no retrospective rewrite of completed release methods.

## Verification and limitations

- Checklist/delta helper suite: **10 tests passed**, including duplicate/overwrite/archive rejection and precise delta comparison. Existing evidence is never overwritten by generation.
- Local Markdown paths/anchors checked for changed documents and incoming links; moved historical anchors point to archived sections. See [verification](../outputs/documentation-optimization-20260920/verification.json).
- Both archived XLSX files match their original Git bytes by SHA-256. An initial archive-link relocation attempt incorrectly included the historical XLSX; verification caught it before publication, the original Git bytes were restored, and the relocation code now processes Markdown only.
- Dictionary imported/exported/reimported successfully; all non-Guide sheet values matched, preserving R010 and unique production evidence. Guide before/after render reviewed; see [dictionary verification](../outputs/documentation-optimization-20260920/dictionary-verification.json).
- Both diagrams and the separate DEV preparation/refresh runbooks remain unchanged. No new live observations or product behavior were claimed.
- Existing historical evidence is retained with its dates and limitations. The cleanup does not remove unique exact definitions or turn historical pending measurements into current release blockers.

## Rollback and completion

Restore only affected documents/tooling with a scoped Git revert, preserving subsequent work. Byte-exact prior dictionaries and full dated Markdown snapshots are in the archive. No live rollback is needed. Relevant checks and intended Git diff are reviewed before normal commit/push to the configured upstream; this governance task creates no Rnnn release tag.
