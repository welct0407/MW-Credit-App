# Release workflow — RC/App Upgrade implementation reference

## Execution contract

Use the [single master Markdown checklist](../scripts/releases/templates/promotion-checklist.md), copied once to the release's outputs folder and filled throughout execution. It is the promotion/documentation activity list. This runbook explains triggered operations; it is not another checklist or a reason to repeat completed checks. [Create a release copy](../scripts/releases/README.md#one-checklist-per-release). Historical releases retain their actual method/evidence.

Standing policy (app modes, notification identity/delivery, environment isolation, authorization and editor-warning gates) is in [AGENTS](../AGENTS.md#2-architecture-and-ownership). Reuse accepted configuration and tests until a relevant implementation, identity, dependency or data assumption changes. No routine whole-app comparison, DEV suite replay or archive audit. Technical version/hash pins belong in the manifest; concise scope/decisions in the change log.

## Release records and integration

The filled checklist links the manifest, log, tests, SQL pins and source-mapping evidence. Keep one source for each fact; no repeated narrative. App Upgrade replaces the whole app definition and does not merge independent feature copies. Integrate all included features and intervening PROD fixes in DEV; resolve unrelated unreleased work before copying. Include each app as Upgrade or Unchanged and test affected unchanged consumers. A delta is optional exact technical evidence, not a promotion gate or manual deployment recipe.

## 6.1 Develop and integrate — Gate A

Start each development task with the tracker's [Current development release](Release_Tracker.md#current-development-release); use that single Open number for all included features/refinements. Development owns the tests and concise scope/DEV checkpoint. At promotion, reuse that evidence; rerun only invalidated checks. Before readiness fixes, establish affected rollback points under AGENTS. Keep later work separate from a frozen release. A readiness recommendation is not a scope freeze, owner acceptance or production authority.

### Release-scope freeze and number handoff

Keep the release Open through development, tests and review. **When authorized promotion actually starts (P13, before RC capture or PROD changes)**, pin its scope, dependencies, tested commit, available DEV versions, SQL manifest/hashes and external deliverables in the existing release records. For SQL-only/report-only releases the same handoff applies; no RC is required just to freeze scope. Existing acceptance/authority is reused, not requested again.

In one coordinated tracker update, mark that release **Frozen for promotion** with date/time/timezone and evidence link, change **Current development release** to the next unused number **Open**, add that number's row and advance the next-number field. Publish the handoff before other tasks use the successor; re-read the latest tracker and reconcile a competing update instead of reserving twice. A task completing or becoming Ready never advances the number. No second current-release document or parallel counter is maintained.

The successor may begin after this handoff, with local/isolated work while shared DEV is briefly paused for capture. Resume shared DEV changes only once the frozen release's independent RC definitions and/or exact SQL/external package are captured. RC preparation may still make required PROD substitutions; final RC-version immutability starts after that preparation. Opening the next number is not production authorization for it.

After freezing, promotion fixes/retries stay with the frozen release and its fixed scope. Record corrections as a new candidate/package revision and rerun affected checks; use the pinned baseline if shared DEV has advanced, never recopy later unrelated work. Reconcile relevant fixes into the Open release. Failure/delay does not silently thaw the release or renumber its successor; preserve dependencies before any later promotion. Scope replanning/cancellation must leave at most one Open release and retain the history of allocated numbers.

### Test selection and evidence reuse

| Change | Relevant DEV checks | Broaden for affected risks |
| --- | --- | --- |
| Documentation/governance/tooling | Links, consistency, template/tool checks | No live tests for documentation alone |
| UI text/order/visibility/format | Saved exact settings and current-GUI form/view | Conditional display, permissions or financial choices |
| Expressions/slices/actions/bots | Normal and relevant invalid/boundary paths, saved/synced results, consumers | Retry/duplicates, schedules/delivery, access, shared consumers or performance |
| SQL/schema/financial behavior | Flyway chain/validation, relevant SQL regression and app reconciliation | Concurrency/idempotency, locks/backfills and old/new-app compatibility |

Critical regression subset: load/sync, borrower/loan lookup, affected critical action/form entry points and OLAP readback. Add relevant Receive All, single/lump-sum receipt, closure/default, charge, cash/expense and reporting cases according to impact; don't run all financial scenarios for a cosmetic change. Use synthetic/redacted DEV fixtures and current GUI, not legacy editor/bot Test pages. Configuration inspection does not prove execution/delivery.

Reuse passing evidence while implementation, dependencies, environment and data assumptions remain applicable; link versions/hashes, date, expected/actual results and limitations. Rerun only invalidated checks. An unrelated version increment/documentation commit alone need not invalidate a behavioral test. Final diagnostics/readbacks must cover the final state; don't repeat identical evidence. Optional `fingerprint` compares selected files/context, not live settings. Update affected dictionary rows once per batch and after promotion; update overview prose only when its explanation changes. Coordinate workbook writes.


### Warning and deployment-state rules

Use AGENTS §6.2: both DEV apps at readiness and both PROD apps at closure require final saved-state zero editor warnings/errors. New/undeployed DEV replacements and RCs need their initial Deployment Check before Deployed mode. Already-Deployed apps need no repeat check or mode toggle. Editor diagnostics and relevant functional evidence remain necessary; Deployed status alone proves neither.

## 6.2 Capture and prepare the release candidate — Gates B–D

### Gate B: integrated candidate captured

During the brief DEV edit freeze, pin the tested versions/implementation commit and, for SQL changes, create the Flyway runner manifest before later migrations advance DEV. Copy included definitions as MW-OLTP-Rnnn-RCk / MW-OLAP-Rnnn-RCk, recording complete internal names (including account suffix), UUIDs and source versions. Never copy DEV financial data into PROD. DEV resumes once independent copies/pins are verified; final RC immutability begins after preparation.

**RC creation is definition-only: never copy app/table/database data or file/document data, even temporarily.** This applies to every included app and every replacement/retry RC.

- **The copy-data checkbox is checked by default. Before clicking Copy, actively UNCHECK it every time.** Also uncheck any file-data/document-copy option, then verify all these boxes are unchecked. Do not accept defaults or submit while an option's meaning/state is unresolved. Record one concise confirmation in P14; no separate checklist or full export is needed.
- Retain references to existing sources during the definition copy; rebind them to PROD in the normal P25 mapping step. Do not create copied Google Sheets, AppSheet databases, tables or data files, and do not copy data as a shortcut before rebinding. RC has no separate database or dataset.
- During the existing source-mapping pass, check for unexpected copied sources. A candidate accidentally copied with data is rejected: contain it, record the mistake and create the next RC correctly. Do not promote it or silently treat later rebinding as compliance. Deleting the rejected app or copied assets is separate cleanup; never delete shared sources.

### RC containment and external dependencies

An RC is production-capable once PROD-bound. Restrict access and prevent unintended writes, notifications, webhooks and external/SQL jobs from copy creation. The scheduled guard is not a security boundary for other entry points. If guard proof is missing, keep the candidate DEV-bound with affected jobs paused while resolving it. No PROD-bound test writes or forced notifications without their own scoped authority. Guarded bot definitions retain intended enabled states so App Upgrade preserves production schedules.

App Upgrade does not provision external templates/files, endpoints, access grants or data. Check only affected assets; link valid existing evidence for unchanged dependencies. Use the approved maintenance/order plan for non-atomic SQL and two-app cutover, including relevant queued-client compatibility. Source-copy eligibility/ownership is reused unless access/plan/platform behavior changes.

### Scheduled-bot execution guard

**Standard arrangement:** all apps are Deployed and retain intended bot definitions/schedules. DEV and PROD are allowed by the persistent app-name guard; RC is excluded. Thus “RC scheduled bots disabled” means scheduled business execution is disabled, not that the bot definition's enabled flag is switched off. An RC timer may be invoked but must perform no business side effects. Notifications remain enabled: DEV delivery is owner-only through Partner data; RC/PROD read PROD contacts.

For each app separately, use this expression with its actual full internal names:

```appsheet
IN(
  CONTEXT("AppName"),
  LIST("<canonical DEV internal app name>", "<corresponding PROD internal app name>")
)
```

1. Capture names from verified `appName` values in the editor/app URLs; they include the account suffix and are **not UUIDs or display names**. Use only that role's DEV/PROD pair: OLTP does not allow OLAP names. Never allow an RC, use a broad prefix/substring match, or infer identity from theme, owner email or database label. Empty/unknown context must deny execution. The literals above are placeholders, not deployable values.
2. Place **Branch on a condition** as the first process step. Put the entire existing business chain inside its true branch; the false branch and any continuation after the branch must have no writes, notifications, exports, webhook/script calls or side-effecting child processes. Guard before a child-process call, which can itself update data. Preserve original business conditions, dependencies, ordering and disabled/superseded states; don't replace them with the identity check. Audit all scheduled entry points and reachable paths, including shared processes.
3. For a per-row schedule, also combine the allowlist with the existing row filter using `AND(guard, originalFilter)` (use `TRUE` only when there was no filter). This avoids starting the process for RC rows. Keep the process guard as the common protection. For a non-row schedule use the process branch; don't invent a row filter field or change the job into a per-row job. Preserve exact guard expressions and bot/event/process paths in the mapping evidence (or link an optional delta).
4. Install the guard in DEV as a recorded release change **before copying an RC**; restore intended enabled states before final candidate freeze. Do not add it to a ready-immutable RC or hand-edit PROD to activate jobs after upgrade. Existing PROD continues its current schedule until upgrade; afterward the guard evaluates in the existing PROD app. The retained RC stays excluded indefinitely. Check copied expressions retain canonical literal names, with no automatic substitution to the new RC name.
5. **First-use verification:** prove allowed/excluded identity and branch behavior in server-side scheduled context using deployed DEV and a harmless controlled copy on DEV sources, with no production effects. Use current editor/Automation Monitor, not the legacy bot Test page or preview-only evaluation. Document/retire temporary diagnostic schedules. Verify existing PROD identity after first upgrade and observe its next normal run without forcing financial work. Reuse the verified pattern afterward; do not require another verification app or experiment for each release.
6. **Subsequent releases:** reuse that verified pattern while names, placement, platform behavior and job paths remain applicable. Check saved guard coverage in the copied RC and resulting PROD, plus actual RC name exclusion. No need to wait for every daily schedule or repeat a diagnostic experiment per release. New/changed entry points or app identities invalidate only affected coverage. If runtime evidence contradicts the guard, stop the affected RC path and correct/retest before PROD binding; don't assume a green expression preview proves server behavior.
7. Record a compact per-bot row: app, bot/event/process, intended state/schedule, exact guard/placement, allowed names, RC name, saved RC/PROD evidence and first-use/reused runtime reference. Keep jobs idempotent: the guard doesn't prevent retries within an allowed PROD app. Platform error alerts and jobs outside the guarded process need separate route review; don't claim this blocks all notifications or external schedules.

Google documents [AppName context](https://support.google.com/appsheet/answer/10107885?hl=en), [conditional process steps](https://support.google.com/appsheet/answer/11463007?hl=en), [per-row scheduled filters](https://support.google.com/appsheet/answer/11445188?hl=en) and [scheduled invocation/retries](https://support.google.com/appsheet/answer/11547468?hl=en). Reviewed 19 September 2026. The allowlist/branch arrangement is this project's design using those features; live first-use proof remains required before claiming isolation.


### Gate C: compatible PROD database ready

For SQL changes, follow [Database: Each change](https://github.com/welct0407/MW-Credit-App/blob/main/database/README.md#each-change) from the pinned clean commit/original runner manifest: verified restorable backup and scoped authorization, schema-drift/history review, validate/migrate/validate, target-object/read-only checks. Include every pending migration or approved prerequisite. Compatible SQL must precede final RC PROD-source verification. App-only releases record SQL unchanged; no empty migration or repeated migration suite. SQL success followed by app failure is partial deployment; see recovery.

### Gate D: PROD-mapped RC validated and immutable

Reconcile every RC table/view/source to the intended PROD host/database/schema/object, including auxiliary sources. Record exact substitutions once: existing PROD companion IDs (not RC IDs), corresponding PROD theme/color/branding, access/endpoints and applicable legacy recipient overrides. Shared R009 recipient expressions use PROD contacts; required Login Email schema/mapping must exist. Never restore the superseded creator-by-delivery-email rule. Keep all four DEV/PROD colors; do not guess a common RC color.

**Logo preservation:** capture each included PROD app's logo setting and visible appearance with the existing branding baseline before upgrade. Preserve it in the RC; use durable PROD/shared asset storage that will survive RC deletion. If the correct image needs restoring, use the corresponding repository file: OLTP [Loan Manager App Logo.png](../resources/Loan%20Manager%20App%20Logo.png), OLAP [Loan Business Insights App Logo.png](../resources/Loan%20Business%20Insights%20App%20Logo.png). These are recovery assets, not a reason to enable data/file copying. Restore through normal RC preparation; a frozen candidate correction follows the existing new-RC rule.

Save/reload and use current-editor data validation. One focused pass covers mappings, editor issues, Ref/security/type/permission integrity, unexpected generated changes, open/sync and representative screens. Reuse DEV business tests; inspect/cancel PROD-bound forms. Complete the new RC's initial deployment check and deploy under containment, then freeze final UUID/internal name/version and evidence in the manifest. Later configuration corrections require a new RC and affected retesting, not a patch to the approved frozen version.

## 6.3 Approve and promote — Gate E

Confirm existing owner acceptance/production authority covers the final candidate and remaining effects. Record restorable PROD versions and ordered recovery once; immediately before each upgrade recheck accepted PROD baseline and frozen RC version. Reconcile intervening PROD changes into a new integrated candidate. Version retention must cover the recovery window.

In the existing PROD editor, use Manage → App Versions → App Upgrade (or current equivalent) and supply the approved RC's complete internal name. Confirm UUID/source version; record before/after versions and success before dependent operations. Never delete/recreate PROD IDs, hand-recreate app settings or silently retry ambiguous financial operations. On failure, use the matching [recovery branch](Release_Recovery_Runbook.md).

## 6.4 Validate production and close — Gate F

Use one focused PROD pass against the frozen package: upgrade provenance/version/mode, resulting sources/substitutions, guard allowing PROD and excluding RC, both editors clear, both apps open/sync and representative changed entry points. Reuse DEV/RC evidence; add only uncovered SQL, changed critical behavior or external checks. Do not compare with later DEV or run a repeat Deployment Check. Observe the first normal PROD schedule when introducing the guard; subsequent releases reuse valid proof.

During that same open/sync pass, **visually confirm each upgraded PROD app's logo loads correctly and matches its pre-promotion appearance**. A saved logo path alone is insufficient. Record the result in P39; if blank, broken or wrong, resolve the logo through the normal candidate/correction workflow using the local asset above as needed, then repeat only the affected visual check before closure.

Complete the release checklist's documentation-impact table: the three current-state records always, then only affected documents. No full-folder scan, historical dispositions or separate documentation checklist. Model formulas require exact dictionary updates; unchanged overview prose requires no edit. Preserve later DEV work. Documentation/publication gaps do not require another deployment or live test.

**Automatic RC cleanup — owner rule, 21 September 2026:** after all included upgrades and required PROD validation succeed, delete every RC app created for this promotion, including rejected/superseded attempts, as closure step P49 before final evidence publication. This is standing authorization: do not request further confirmation or a retention-window decision. Use the recorded RC UUIDs/internal names, excluding canonical DEV/PROD apps and other releases' candidates. Delete app definitions only; preserve databases, tables, folders, files/templates, logo assets and release/recovery evidence. If the UI offers associated-data/file deletion, leave it unchecked. Confirm the recorded RCs are deleted, mark their lifecycle state without erasing source IDs/versions, and update the manifest/log/checklist and inventory as applicable. Failed/incomplete promotions keep contained RCs for diagnosis; failed cleanup remains explicitly pending, without claiming deletion or repeating the deployment. See [recovery and RC cleanup](Release_Recovery_Runbook.md#rc-retention).

Commit/push sanitized final evidence including cleanup, create/push the unique final Rnnn tag at that evidence commit and verify remote targets; never move a tag. Record intended final outcome/tag before commit, resolving the commit from Git afterward. Release only when required validation, documentation, cleanup and publication complete. No automatic DEV refresh is authorized.
