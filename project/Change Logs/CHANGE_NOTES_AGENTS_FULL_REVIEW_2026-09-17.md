# Full AGENTS review — 17 September 2026

Status: Entire root instruction file reviewed and revised; documentation checks completed. This is project governance only, with no product release allocation, live app/database operation, runtime/tool change or global Codex setting change.

## Outcome and continuation

- Current rules: [AGENTS.md](../AGENTS.md), including the new task-routing table. Use current owner instructions and the relevant procedure; historical logs retain their historical meaning.
- Done: reviewed every original section, consolidated repeated policy, clarified check/approval triggers and moved design/credential details to explicitly routed sections.
- Next: apply the rules in normal tasks; adjust a demonstrated source of wasted work at its governing location rather than appending another blanket rule.
- Authorization: the owner requested a whole-file efficiency review and implementation after the earlier release-only optimization. Existing operational approval boundaries remain.
- Verification: [review evidence](../outputs/agents-full-review-20260917/verification.json). Repository publication is represented by the commit containing this log; no live environment readiness is claimed.

## Section-by-section audit

| Original area | Finding and implemented treatment |
| --- | --- |
| Project/collection boundary | Retained separate collection project/catalogue and compatibility-junction rule at the top; no collection scope added. |
| Release tracking | Condensed numbering, continuation, reservation publication and record ownership; tracker/workflow retain field details. No automatic chat renaming or new release for governance. |
| Tooling/generated files | Kept read-only sources, script/output locations, one dependency junction and exclusions. Historical installation counts remain in scripts history, not always-loaded instructions. Setup is triggered by recovery/missing dependencies/problems, not each task. |
| Credentials | Kept external storage, no secrets under GitHub and redaction rules always visible. Routed migration/recovery detail to scripts guide; retained original preservation, recovery-key and sign-in-store protections. |
| Project boundaries | Made affected-object inspection explicit; shared changes still cover every affected consumer in both apps. Preserved current-GUI testing and AppSheet-first priority without an unrelated report audit. |
| Approval wording | Resolved generic live-notification wording against standing owner-only DEV test permission. Reuse explicit scoped authorization; ask for genuinely missing authorization/material ambiguity, not routine choices. New schema and PROD authorization requirements remain. |
| Architecture/ownership | Retained two databases/two apps per environment, host/app-ID verification and OLTP/OLAP ownership. Detailed app design, full business-state principles and Looker page order are in the new Solution Design reference. |
| DEV refresh/parity/isolation | Kept owner-only recipients, same-environment links, automation parity, single scheduler, protected triggers and targeted routing rechecks. Existing preparation/refresh runbooks remain the full procedures; no routine whole-inventory audit. |
| Database development | Kept immutable Flyway rules, adoption constraints, tested package, external credentials, direct SSL setup and exclusion of Flyway metadata from AppSheet. Database guide now specifies coherent candidate checks and excludes app/docs-only changes from SQL test/install steps. |
| Implementation/prototype | Consolidated repeated scope disclaimers while retaining immutable keys/Refs/grain, financial traceability, explicit payment states, retry safety, no routine financial deletion and lightweight virtual columns. No accounting/compliance scope added. |
| Backup | Replaced ambiguous “before any change” with asset-specific rollback: app version, report copy, applicable DB backup, or Git baseline for local files. Required rollback blocks only the affected mutation; independent work may continue. Refresh deletion still requires recoverable definitions under its runbook. |
| Change logs | One log per coherent change with updates for refinements; no log per save/generated artifact, no recursive log-of-log and no log for read-only answers. Required history/content and Markdown authority retained. |
| Model documents | Both documents still reflect model changes; batch affected updates and label DEV differences. File-only formatting/governance/tools do not trigger workbook edits. Interrupted handoff records pending documentation without falsely claiming completion or forcing an immediate workbook rebuild. |
| Release Sections 6.1–6.4 | Retained anchors and complete delta capture, exact saved readback, explicit substitutions, warning gate, testing, frozen scope, authorization, recovery and PROD validation independent of later DEV. Detailed execution stays in the existing runbook. |
| Conflict handling | Retained prototype consistency, data protection, dependency integrity, auditability, least privilege and reversibility; separated missing authorization from already-authorized actions. |
| Commit/push | Condensed standing authority and coherent completion trigger; retained intended-file staging, exclusions, normal push, remote verification, blocked-publication reporting and no production authority from Git. |
| Linked-document consistency | Removed stale R001/current wording from documentation index and false additional Drive coverage from historical scripts guidance. Relevant runbook sections reviewed for conflicts; historical release records were not rewritten. |

## Scenario review

These are a manual review of instruction behavior, not executions against apps or a model benchmark.

| Task | Result required by the revised rules |
| --- | --- |
| Status question | Read relevant state/evidence; no obligatory live audit, log, workbook, tests or commit. |
| Markdown typo/governance edit | Git rollback point, relevant documentation checks, coherent log and publication; no live app backup or warning scan. |
| DEV view label/order edit | App version rollback, exact affected delta/readback, targeted GUI check and both-app final warning gate; no routine recipient/link audit or model workbook edit without model impact. |
| Shared physical column / financial SQL change | Justified schema authorization, immutable migration, candidate SQL tests, all affected consumers and paired model updates; existing instructions do not authorize unrequested PROD writes. |
| Bot schedule change with unchanged routes | Test affected schedule behavior; reuse recipient/link evidence. No recipient inventory solely because the version changed. |
| New notification route | Inspect that route/dependencies and restrict DEV delivery to owner before execution; reviewed owner-only testing already authorized. |
| Requested DEV refresh | Full scoped refresh/preparation/recovery validation, preserve unreleased work, themes/parity/isolation; remove old apps only after replacement gates pass. |
| Production promotion while DEV advances | Use frozen exact delta/manifest, scoped approval, backups, independent PROD readback of every item, focused smoke tests and final zero-warning gate. |
| Missing full export / interrupted task | Untouched missing settings do not block work. Unverified changed settings or pending documentation remain unfinished; record handoff and continue independent work. |
| Credential migration / failed Git push | Preserve originals, verify without printing secrets; do not claim backup/publication until verified. Neither event authorizes altering unrelated work. |

## Validation and limits

All local Markdown links/anchors in changed documents were checked, Section 1–6 and 6.1–6.4 references preserved, and the intended Git diff/whitespace reviewed. Root word/byte counts are recorded in verification evidence. Reduced instruction size is not a measured credit or latency saving, and a documentation review cannot prove that every future Codex run will follow policy perfectly. No extra model calls, live tests or tool regression suites were needed for documentation-only changes.

The short always-loaded rules plus explicitly routed detail follow the instruction-loading model described in [official OpenAI AGENTS.md guidance](https://learn.chatgpt.com/docs/agent-configuration/agents-md). This review covers this project's root file and relevant linked procedures, not machine-wide settings or other projects. Existing sessions can have older loaded guidance; when continuing work, read the current project file if the session still cites superseded rules.

## Recovery

Starting commit: `44dfc9350b5895f9ed194c866f1e5dec764631bc`. Revert only this review's commit in a new commit, preserving concurrent/later work. The prior version and relocated design/credential text remain recoverable in Git. No app/database recovery is needed; current R005 work and its business-model documents were not modified by this task.
