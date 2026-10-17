# Change notes — Wave 6 documentation cleanup, 17 October 2026

## Purpose
Wave 6 of the 15 October 2026 review: documentation and process cleanup (30 backlog rows). It makes `AGENTS.md` a front page, gives each deployment pin one home and deletes history that no current document needs. Documentation only; no release number, deployment or live change. Open release at the time: R071.

## Changes
Branch `claude/review-w6-docs` from main `cbc8843`. Six-agent process for a documentation-only wave: Agent D (Sonnet 5.5 medium) owned the edits, one writer per file. Rules were authored and reviewed by Fable 5.1 high (session owner instruction; a first Sonnet draft and a Fable medium start were stopped and superseded). Agent A — Architect (Fable 5.1 high) reviewed the structure; Agent C — Testing (Sonnet 5.5 medium) ran the checks. Agents E and F: not applicable (no UX or infrastructure fact needed correcting).

The active branch `claude/r071-style-decisions` was editing `Development_Changes.md`, `Release_Tracker.md`, `Data Dictionary/systems/pwa/application.yaml`, `PWA_Data_Model_Overview.md` and two change notes. By agreement with that session, Wave 6 did not touch them; the items marked "held" wait for that merge.

- **DB-DOC-01** done: the dictionary `README.md` and `systems/postgresql/README.md` link the `database/README.md` current state instead of stating a version.
- **DB-DOC-02** done: `systems/postgresql/settingss/` merged into `settings/` (two files moved); `index.json` and the README updated; dictionary validation clean.
- **DB-DOC-03** done: `pwa_submit_operation_v2` entry drops the dead `candidate_v92` block; source is the W4 database note (V94 patched it after R062); one line lists V83 create and V84 (2), V85 (17), V92 (3), V94 in-place patches.
- **DB-DOC-04** held: text for `PWA_Data_Model_Overview.md` is ready (25 own triggers on "Payments", name-ordered firing, `payments.yaml` and `Test-TriggerOrder.sql`, do not rename).
- **DB-DOC-05** done: `database/OWNERSHIP.md` folded into `database/README.md` (`MW_CREDIT_APP_ROOT`, `MW_DB_TOOL_ROOT`, directory ownership) and deleted.
- **DB-DOC-06** done: directory wording in `Solution_Design.md`, `systems/postgresql/README.md`, `Rules/VM01_Local_Storage.md`.
- **ALL-STD-05** done: "Naming and identifiers" in `database/README.md` (quoted legacy names kept, snake_case and `pwa_` prefix for PWA objects in `public`, `_vN` bumped on signature change, client UUID request ids, derived-id sources cited, lock-key and trigger-order facts).
- **AGT-DOC-01** done: SHAs and "current production" pins removed from the agent catalogue, `SHARED_RECEIPT_PAYMENT_API.md`, `PARTNER_CONVERSATIONS.md`, `OPERATIONS.md`, `POSTGRESQL_OPERATIONS.md`, `MONITORING_IMPLEMENTATION_HANDOVER.md`; they link the inventory.
- **AGT-DOC-02** done: `OPERATIONS.md` monitoring paragraph points at `project/scripts/monitoring/` and `Resource_Monitoring.md`.
- **AGT-DOC-03** done: collector description lists the native probes in `debian-health.py`; AppSheet probes retired in R057.
- **AGT-DOC-04** done: `POSTGRESQL_OPERATIONS.md` governance describes the native API with SQL fallback; V33 reference is `database/migrations/V33__agent_transaction_audit.sql`.
- **AGT-DOC-05** done: `integration-agent/docs/MIGRATION_PLAN.md` deleted with its README link and diagram label (`BUSINESS_PROCESS.drawio`, `generate-business-process.py` label text).
- **AGT-DOC-06** done: `config.example.json` has `state_backend` (`sqlite`, the inert default), `state_generation`, `state_cutover_at` and the `agent_database_*` keys; it still passes `validate_config`.
- **AGT-DOC-07** partly done: the audit relay is documented in `SERVICE_CATALOGUE.md`. Blocked for `service-catalogue.json`: `validate_catalogue` accepts only listed service names, so a new key needs a source change (open question).
- **AGT-DOC-08** done: README points at `POSTGRESQL_OPERATIONS.md`; the design `HANDOVER.md` is marked implemented 22 September 2026, historical.
- **AGT-DOC-09** done: Windows paths and old repository names removed from agent docs; `project/SERVICE_CATALOGUE.md` (sibling-repository pointer) deleted.
- **AGT-DOC-10** done: the inventory Debian entry records checkout `/opt/mw-integration-agent-src`, deployed monorepo commit `1feb6cd` (R069; `integration-agent/` identical to `9c4a4cb`), venv, package `0.1.0`, catalogue 27; the archived-repository SHA is labelled. The host HEAD is inferred from the deploy helper, not read.
- **AGT-TEST-04** done: `OPERATIONS.md` "Test lab prerequisites" summarises the lab needs and links the W3 `tests/lab/README.md` and `setup.sh`.
- **ALL-DOC-01** done: dead `Data_Dictionary_ChatGPT.md` link removed; the snapshot row is conditional on a local snapshot.
- **ALL-DOC-02** (1) and (2) not reproduced, fixed on main before this wave. (3) held: `Release_Tracker.md` links a heading that does not exist in the receipt-isolation note; drop the anchor after R071 merges.
- **ALL-DOC-03** done: see AGT-DOC-09.
- **ALL-DOC-04/12** done: "Current state" sections (at most 15 lines; inventory link; read-next page) in `Solution_Design.md`, `database/README.md`, `integration-agent/README.md`.
- **ALL-DOC-05** partly done: `Environment_Inventory.md` "Latest verified deployments" holds per-target tables (Hosting, Cloud Run revisions and digests, Flyway, Debian). Copies removed from the dictionary (`human-api.yaml`, `systems/pwa/README.md`), the agent catalogue and docs, the bridge README and `docs/Development_PWA_Delivery.md`. `Release_Workflow.md` says pins live only in the inventory. Held: tracker, `Development_Changes.md`, `application.yaml`.
- **ALL-DOC-06** held: `Development_Changes.md` trim waits for R071. Released-section links elsewhere already use permalinks at `cbc8843` (release tags point at package commits that predate their promotion records).
- **ALL-DOC-07** done: change-note template in `Rules/Development_Workflow.md` "Records, change notes and retention"; this note uses it.
- **ALL-DOC-08** done: change notes older than R068 deleted unless a current document needs them (434 notes; list below). Links from current documents were repointed to permalinks at `cbc8843` first. Kept: the four review notes, R068+ notes, notes linked from the held files, and three live records (Railway backups, VM-01 cleanup exceptions, receipt backfill recovery).
- **ALL-DOC-09** done: the retention rule in `Development_Workflow.md` and `project/README.md` lets only a current document, README or maintained runtime script keep evidence. 1,541 uncited evidence files under `project/outputs` deleted (list below). Root `outputs/` did not exist (not reproduced). `integration-agent/outputs` kept (a maintained generator writes it). `scripts/binary-evidence-allowlist.txt` lost 329 entries for deleted files.
- **ALL-DOC-10** done: `Resource_Monitoring.md`, `Resource_Monitoring_Dashboard_Guide.md`, `Grafana_MCP_Events_Bridge.md` trimmed to current operation and limits; one panel table per dashboard; inbound anchors kept. Grafana revamp stays pending.
- **ALL-DOC-11** done: `AGENTS.md` is a front page: hard rules first (authority, credentials, data, PROD, migrations, publication, records), layout table, trigger-to-page table. Detail moved into `Development_Workflow.md`, `Release_Workflow.md`, `PWA_Orchestration.md`, `Model_Work_Mapping.md`. `CLAUDE.md` unchanged.
- Links: 106 links in kept evidence that used the pre-merge layout now point at the current path; 24 links to files that are gone are plain text.
- Indexes: `project/Documents/README.md`, `Rules/README.md`, `project/README.md` link every current document once.

<details>
<summary>Deleted files (1,978)</summary>

**other** (3)

- `database/OWNERSHIP.md`
- `integration-agent/docs/MIGRATION_PLAN.md`
- `project/SERVICE_CATALOGUE.md`

**Change Logs/** (48)

- `Change Logs/CHANGE_NOTES_CI_EFFICIENCY_2026-10-16.md`
- `Change Logs/CHANGE_NOTES_DATABASE_OWNERSHIP_2026-10-07.md`
- `Change Logs/CHANGE_NOTES_DOCUMENT_RULE_LINKS_2026-10-14.md`
- `Change Logs/CHANGE_NOTES_IDEAADMIN_INDEPENDENCE_2026-10-11.md`
- `Change Logs/CHANGE_NOTES_INFRASTRUCTURE_2026-10-07.md`
- `Change Logs/CHANGE_NOTES_INFRASTRUCTURE_ADOPTION_2026-10-13.md`
- `Change Logs/CHANGE_NOTES_MERGE_CI_FIX_2026-10-14.md`
- `Change Logs/CHANGE_NOTES_PWA_COLLECTION_NOTE_UI_2026-10-09.md`
- `Change Logs/CHANGE_NOTES_PWA_COLLECTION_RECEIVING_UI_2026-10-09.md`
- `Change Logs/CHANGE_NOTES_PWA_CONSOLIDATED_UI_CHECKPOINTS_2026-10-09.md`
- `Change Logs/CHANGE_NOTES_PWA_DELIVERY_POLICY_2026-10-12.md`
- `Change Logs/CHANGE_NOTES_PWA_DOCUMENTATION_2026-10-14.md`
- `Change Logs/CHANGE_NOTES_PWA_PAGE_FIVE_UI_2026-10-09.md`
- `Change Logs/CHANGE_NOTES_PWA_PAGE_FOURTEEN_UI_2026-10-09.md`
- `Change Logs/CHANGE_NOTES_PWA_WORKSPACE_UI_2026-10-09.md`
- `Change Logs/CHANGE_NOTES_R052_BILINGUAL_SEARCH_2026-10-08.md`
- `Change Logs/CHANGE_NOTES_R052_COLLECTION_READ_2026-10-07.md`
- `Change Logs/CHANGE_NOTES_R052_DEV_APPLICATION_CAPABILITY_2026-10-08.md`
- `Change Logs/CHANGE_NOTES_R052_DEV_AUTH_READ_2026-10-07.md`
- `Change Logs/CHANGE_NOTES_R052_DEV_COMMAND_ACTIVATION_2026-10-08.md`
- `Change Logs/CHANGE_NOTES_R052_DEV_CUSTOM_DOMAIN_2026-10-08.md`
- `Change Logs/CHANGE_NOTES_R052_DISPOSABLE_COMMAND_JOURNAL_2026-10-08.md`
- `Change Logs/CHANGE_NOTES_R052_DURABLE_COMMAND_RECEIPT_PLAN_2026-10-08.md`
- `Change Logs/CHANGE_NOTES_R052_LOAN_READ_2026-10-07.md`
- `Change Logs/CHANGE_NOTES_R052_LOCAL_COMMAND_API_2026-10-08.md`
- `Change Logs/CHANGE_NOTES_R052_PAYMENT_NOTES_RECEIPT_REHEARSAL_2026-10-08.md`
- `Change Logs/CHANGE_NOTES_R052_PAYMENT_REHEARSAL_2026-10-08.md`
- `Change Logs/CHANGE_NOTES_R052_PHASE3_FOUNDATION_2026-10-11.md`
- `Change Logs/CHANGE_NOTES_R052_PHASE4_COMPLETION_2026-10-08.md`
- `Change Logs/CHANGE_NOTES_R052_PHASE5_COMPLETION_2026-10-08.md`
- `Change Logs/CHANGE_NOTES_R052_PROMOTION_READINESS_2026-10-11.md`
- `Change Logs/CHANGE_NOTES_R052_PWA_FOUNDATION_2026-10-08.md`
- `Change Logs/CHANGE_NOTES_R052_READER_RECEIPT_CONTINUATION_2026-10-11.md`
- `Change Logs/CHANGE_NOTES_R052_READ_ACCESS_CONTRACTS_2026-10-07.md`
- `Change Logs/CHANGE_NOTES_R052_READ_ERROR_TRACING_2026-10-08.md`
- `Change Logs/CHANGE_NOTES_R052_RECEIVING_UX_2026-10-08.md`
- `Change Logs/CHANGE_NOTES_R052_REVIEW_SHELL_2026-10-07.md`
- `Change Logs/CHANGE_NOTES_R052_UNIFIED_RECEIVING_2026-10-08.md`
- `Change Logs/CHANGE_NOTES_R053_AGENT_NATIVE_API_2026-10-12.md`
- `Change Logs/CHANGE_NOTES_R053_APPSHEET_RETIREMENT_2026-10-12.md`
- `Change Logs/CHANGE_NOTES_R053_NOTIFICATIONS_JOBS_2026-10-11.md`
- `Change Logs/CHANGE_NOTES_R054_UI_BATCH_2026-10-12.md`
- `Change Logs/CHANGE_NOTES_R055_GRAFANA_INFRASTRUCTURE_2026-10-13.md`
- `Change Logs/CHANGE_NOTES_R056_APPLE_PUSH_2026-10-13.md`
- `Change Logs/CHANGE_NOTES_R057_APPSHEET_INFRASTRUCTURE_RETIREMENT_2026-10-13.md`
- `Change Logs/CHANGE_NOTES_VM01_STORAGE_LIFECYCLE_2026-10-11.md`
- `Change Logs/CHANGE_NOTES_VM01_TERRAFORM_POWER_2026-10-15.md`
- `Change Logs/CHANGE_NOTES_VM01_TOOL_VALIDATION_2026-10-11.md`

**integration-agent/Change Logs/** (51)

- `integration-agent/Change Logs/CHANGE_NOTES_AGENT_OVERVIEW_2026-09-21.md`
- `integration-agent/Change Logs/CHANGE_NOTES_AGENT_POSTGRESQL_DESIGN_2026-09-22.md`
- `integration-agent/Change Logs/CHANGE_NOTES_AGENT_POSTGRESQL_IMPLEMENTATION_2026-09-22.md`
- `integration-agent/Change Logs/CHANGE_NOTES_AGENT_PROCESS_REVIEW_2026-09-21.md`
- `integration-agent/Change Logs/CHANGE_NOTES_APPROVED_OVERPAYMENTS_2026-09-23.md`
- `integration-agent/Change Logs/CHANGE_NOTES_APPSHEET_RETIREMENT_2026-10-13.md`
- `integration-agent/Change Logs/CHANGE_NOTES_AUTOMATIC_RECEIPTS_2026-09-22.md`
- `integration-agent/Change Logs/CHANGE_NOTES_BANK_REFERENCE_DUPLICATES_2026-09-25.md`
- `integration-agent/Change Logs/CHANGE_NOTES_CONVERSATION_POLL_2026-09-21.md`
- `integration-agent/Change Logs/CHANGE_NOTES_DAILY_CASH_STATEMENT_2026-09-20.md`
- `integration-agent/Change Logs/CHANGE_NOTES_DAILY_GROUP_POLLING_2026-09-25.md`
- `integration-agent/Change Logs/CHANGE_NOTES_DURABLE_OPERATOR_AUDIT_HEALTH_2026-10-04.md`
- `integration-agent/Change Logs/CHANGE_NOTES_GCP_VM_FOUNDATION_2026-09-20.md`
- `integration-agent/Change Logs/CHANGE_NOTES_GITHUB_CLOUD_SQL_CONNECTIVITY_2026-09-20.md`
- `integration-agent/Change Logs/CHANGE_NOTES_GROUP_RECEIPT_BACKFILL_2026-09-21.md`
- `integration-agent/Change Logs/CHANGE_NOTES_HELD_RECEIPT_REJECTION_2026-09-25.md`
- `integration-agent/Change Logs/CHANGE_NOTES_IDEAADMIN_INDEPENDENCE_2026-10-11.md`
- `integration-agent/Change Logs/CHANGE_NOTES_INSTAGRAM_TRANSPORT_FOUNDATION_2026-09-20.md`
- `integration-agent/Change Logs/CHANGE_NOTES_MANUAL_PAYMENT_GUARD_2026-09-21.md`
- `integration-agent/Change Logs/CHANGE_NOTES_MONITORING_HANDOVER_COMPLETION_2026-09-25.md`
- `integration-agent/Change Logs/CHANGE_NOTES_NATIVE_APPSHEET_RETIREMENT_2026-10-12.md`
- `integration-agent/Change Logs/CHANGE_NOTES_NOTICE_STATUS_EMOJI_2026-09-22.md`
- `integration-agent/Change Logs/CHANGE_NOTES_OPERATOR_AUDIT_RECONCILIATION_2026-10-04.md`
- `integration-agent/Change Logs/CHANGE_NOTES_PARTNER_CONVERSATIONS_2026-09-22.md`
- `integration-agent/Change Logs/CHANGE_NOTES_PARTNER_INSTAGRAM_FORMAT_2026-09-27.md`
- `integration-agent/Change Logs/CHANGE_NOTES_PARTNER_REVIEW_2026-09-21.md`
- `integration-agent/Change Logs/CHANGE_NOTES_PROCESS_DIAGRAM_STYLE_2026-09-21.md`
- `integration-agent/Change Logs/CHANGE_NOTES_PRODUCTION_DATA_CONNECTIVITY_2026-09-20.md`
- `integration-agent/Change Logs/CHANGE_NOTES_PWA_DOCUMENTATION_2026-10-14.md`
- `integration-agent/Change Logs/CHANGE_NOTES_R014_AI_REVIEWER_2026-09-21.md`
- `integration-agent/Change Logs/CHANGE_NOTES_R053_RECEIPT_TRANSPORT_RETIREMENT_2026-10-12.md`
- `integration-agent/Change Logs/CHANGE_NOTES_RECEIPT_AUDIT_REPAIR_2026-09-27.md`
- `integration-agent/Change Logs/CHANGE_NOTES_RECEIPT_CHARGE_CLASSIFICATION_2026-09-25.md`
- `integration-agent/Change Logs/CHANGE_NOTES_RECEIPT_EVIDENCE_2026-09-27.md`
- `integration-agent/Change Logs/CHANGE_NOTES_RECEIPT_NOTICE_RECOVERY_2026-09-22.md`
- `integration-agent/Change Logs/CHANGE_NOTES_RECEIPT_RELIABILITY_2026-09-25.md`
- `integration-agent/Change Logs/CHANGE_NOTES_RECEIPT_REVIEW_CORRECTIONS_2026-09-21.md`
- `integration-agent/Change Logs/CHANGE_NOTES_RECEIPT_SUMMARIES_2026-09-21.md`
- `integration-agent/Change Logs/CHANGE_NOTES_REPOSITORY_FOUNDATION_2026-09-20.md`
- `integration-agent/Change Logs/CHANGE_NOTES_RESOURCE_MONITORING_2026-09-22.md`
- `integration-agent/Change Logs/CHANGE_NOTES_REVIEWED_BRANCH_CLEANUP_2026-10-04.md`
- `integration-agent/Change Logs/CHANGE_NOTES_REVIEWER_DML_2026-09-22.md`
- `integration-agent/Change Logs/CHANGE_NOTES_REVIEW_RESEND_2026-09-29.md`
- `integration-agent/Change Logs/CHANGE_NOTES_SCHEDULED_CASH_STATEMENT_2026-09-20.md`
- `integration-agent/Change Logs/CHANGE_NOTES_SHARED_RECEIPT_PAYMENT_API_2026-10-12.md`
- `integration-agent/Change Logs/CHANGE_NOTES_TAILSCALE_HARDENING_2026-09-21.md`
- `integration-agent/Change Logs/CHANGE_NOTES_VM_CONNECTIVITY_DIAGRAM_2026-09-21.md`
- `integration-agent/Change Logs/CHANGE_NOTES_VM_DOWNSIZE_2026-09-21.md`
- `integration-agent/Change Logs/CHANGE_NOTES_VM_OS_INFO_2026-09-21.md`
- `integration-agent/Change Logs/CHANGE_NOTES_VM_TELEMETRY_2026-09-21.md`
- `integration-agent/Change Logs/CHANGE_NOTES_VM_TIMEZONE_2026-09-20.md`

**project/Change Logs/** (335)

- `project/Change Logs/CHANGE_NOTES_2026-08-29.md`
- `project/Change Logs/CHANGE_NOTES_AGENTS_FULL_REVIEW_2026-09-17.md`
- `project/Change Logs/CHANGE_NOTES_AI_COLLECTION_BUILD_1_2026-09-07.md`
- `project/Change Logs/CHANGE_NOTES_AI_COLLECTION_BUILD_2_2026-09-07.md`
- `project/Change Logs/CHANGE_NOTES_AI_COLLECTION_BUILD_3_2026-09-07.md`
- `project/Change Logs/CHANGE_NOTES_AI_COLLECTION_BUILD_4_2026-09-08.md`
- `project/Change Logs/CHANGE_NOTES_AI_COLLECTION_BUILD_6_2026-09-08.md`
- `project/Change Logs/CHANGE_NOTES_AI_COLLECTION_BUILD_7_2026-09-08.md`
- `project/Change Logs/CHANGE_NOTES_AI_COLLECTION_CLOSURE_TEMPLATE_2026-09-07.md`
- `project/Change Logs/CHANGE_NOTES_AI_COLLECTION_CYCLE_OPTIMIZATION_2026-09-08.md`
- `project/Change Logs/CHANGE_NOTES_AI_COLLECTION_FULL_REVIEW_2026-09-09.md`
- `project/Change Logs/CHANGE_NOTES_AI_COLLECTION_HOURLY_SCHEDULE_2026-09-07.md`
- `project/Change Logs/CHANGE_NOTES_AI_COLLECTION_MANUAL_FORWARD_BATCH_2026-09-08.md`
- `project/Change Logs/CHANGE_NOTES_AI_COLLECTION_MASTER_CYCLE_2026-09-07.md`
- `project/Change Logs/CHANGE_NOTES_ALL_BORROWER_COLLECTION_2026-09-08.md`
- `project/Change Logs/CHANGE_NOTES_APPROVED_RECEIPT_CHAT_HOLD_2026-09-09.md`
- `project/Change Logs/CHANGE_NOTES_APPSHEET_API_COMPLETE_READS_2026-09-08.md`
- `project/Change Logs/CHANGE_NOTES_APPSHEET_API_CUTOVER_2026-09-08.md`
- `project/Change Logs/CHANGE_NOTES_APPSHEET_API_READ_ADAPTER_2026-09-08.md`
- `project/Change Logs/CHANGE_NOTES_APPSHEET_API_READ_PROBE_2026-09-08.md`
- `project/Change Logs/CHANGE_NOTES_APPSHEET_CLEANUP_2026-09-15.md`
- `project/Change Logs/CHANGE_NOTES_APPSHEET_WARNING_CLEARANCE_2026-09-16.md`
- `project/Change Logs/CHANGE_NOTES_APP_SHORTCUTS_2026-08-31.md`
- `project/Change Logs/CHANGE_NOTES_ASSESSMENT_PROMOTION_2026-09-15.md`
- `project/Change Logs/CHANGE_NOTES_ASSESSMENT_SAVE_WORKFLOW_2026-09-15.md`
- `project/Change Logs/CHANGE_NOTES_ATOMIC_LOAN_CLOSE_2026-09-15.md`
- `project/Change Logs/CHANGE_NOTES_AUTOMATIC_GIT_PUBLICATION_2026-09-10.md`
- `project/Change Logs/CHANGE_NOTES_AUTOMATION_PLAN_DIAGRAM_2026-09-07.md`
- `project/Change Logs/CHANGE_NOTES_BCG_CHART_DESIGN_2026-09-25.md`
- `project/Change Logs/CHANGE_NOTES_BELL2_PAYMENT_DEFERRAL_2026-09-29.md`
- `project/Change Logs/CHANGE_NOTES_BELL_PAYMENT_REVERSAL_2026-09-18.md`
- `project/Change Logs/CHANGE_NOTES_BORROWER_COLLECTION_CLEANUP_2026-09-13.md`
- `project/Change Logs/CHANGE_NOTES_BORROWER_LOCATION_DIRECTORY_2026-09-13.md`
- `project/Change Logs/CHANGE_NOTES_BORROWER_MATRIX_SIMULATION_2026-09-24.md`
- `project/Change Logs/CHANGE_NOTES_BORROWER_NAME_UNIQUENESS_2026-08-30.md`
- `project/Change Logs/CHANGE_NOTES_BORROWER_NAME_VC_2026-09-15.md`
- `project/Change Logs/CHANGE_NOTES_BORROWER_PAGES_DESIGN_2026-09-25.md`
- `project/Change Logs/CHANGE_NOTES_BORROWER_PREFERRED_ACCOUNTS_2026-09-22.md`
- `project/Change Logs/CHANGE_NOTES_BORROWER_PRINCIPAL_COVERAGE_2026-09-01.md`
- `project/Change Logs/CHANGE_NOTES_BORROWER_VALUE_STABILITY_MATRIX_2026-09-02.md`
- `project/Change Logs/CHANGE_NOTES_BORROWER_VISIBILITY_2026-09-01.md`
- `project/Change Logs/CHANGE_NOTES_BROWSER_ACCOUNT_ROUTING_2026-09-24.md`
- `project/Change Logs/CHANGE_NOTES_BUSINESS_CASH_OPENING_2026-09-18.md`
- `project/Change Logs/CHANGE_NOTES_BUSINESS_EXPENSES_2026-09-16.md`
- `project/Change Logs/CHANGE_NOTES_BUSINESS_EXPENSES_PRODUCTION_2026-09-16.md`
- `project/Change Logs/CHANGE_NOTES_CHARGE_GENERATION_FLAG_2026-09-08.md`
- `project/Change Logs/CHANGE_NOTES_CHARGE_GENERATION_SQL_2026-09-15.md`
- `project/Change Logs/CHANGE_NOTES_CLOUD_FIRST_READINESS_2026-09-30.md`
- `project/Change Logs/CHANGE_NOTES_CLOUD_SQL_MICRO_CONNECTIONS_2026-09-15.md`
- `project/Change Logs/CHANGE_NOTES_CLOUD_SQL_POC_2026-09-14.md`
- `project/Change Logs/CHANGE_NOTES_CLOUD_SQL_RESTART_2026-09-15.md`
- `project/Change Logs/CHANGE_NOTES_CLOUD_SQL_UPSIZE_2026-09-15.md`
- `project/Change Logs/CHANGE_NOTES_CODEX_CONFIG_2026-10-06.md`
- `project/Change Logs/CHANGE_NOTES_COLLECTION_MONITOR_DESIGN_2026-09-24.md`
- `project/Change Logs/CHANGE_NOTES_COLLECTION_PROJECT_MIGRATION_2026-09-09.md`
- `project/Change Logs/CHANGE_NOTES_COLLECTION_SETTINGS_PRODUCTION_2026-09-08.md`
- `project/Change Logs/CHANGE_NOTES_COMMUNICATION_NAMES_2026-09-08.md`
- `project/Change Logs/CHANGE_NOTES_CONFIGURABLE_REVIEWERS_2026-09-09.md`
- `project/Change Logs/CHANGE_NOTES_CORE_PAYMENT_PROMOTION_2026-09-15.md`
- `project/Change Logs/CHANGE_NOTES_CORE_PAYMENT_SQL_2026-09-15.md`
- `project/Change Logs/CHANGE_NOTES_DAD_CASH_ACCOUNT_INITIALIZATION_2026-09-19.md`
- `project/Change Logs/CHANGE_NOTES_DAD_WITHDRAWAL_SPLIT_2026-09-20.md`
- `project/Change Logs/CHANGE_NOTES_DAILY_ANALYTICS_REFRESH_2026-09-26.md`
- `project/Change Logs/CHANGE_NOTES_DAILY_COLLECTION_MESSAGE_REVIEW_2026-09-03.md`
- `project/Change Logs/CHANGE_NOTES_DAILY_INSTALLMENT_LOAN_TEST_2026-08-31.md`
- `project/Change Logs/CHANGE_NOTES_DAILY_LOAN_ANALYSIS_2026-08-31.md`
- `project/Change Logs/CHANGE_NOTES_DATABASE_CI_2026-09-21.md`
- `project/Change Logs/CHANGE_NOTES_DATABASE_OWNERSHIP_2026-10-07.md`
- `project/Change Logs/CHANGE_NOTES_DATA_DICTIONARY_EXPORTER_2026-09-23.md`
- `project/Change Logs/CHANGE_NOTES_DATA_DICTIONARY_MIGRATION_2026-09-23.md`
- `project/Change Logs/CHANGE_NOTES_DATA_DICTIONARY_RECONCILIATION_2026-09-24.md`
- `project/Change Logs/CHANGE_NOTES_DATA_DICTIONARY_RECONCILIATION_PROMPT_2026-09-24.md`
- `project/Change Logs/CHANGE_NOTES_DATA_MODEL_RECONCILIATION_2026-08-30.md`
- `project/Change Logs/CHANGE_NOTES_DATA_STUDIO_REFRESH_REVIEW_2026-09-26.md`
- `project/Change Logs/CHANGE_NOTES_DATA_STUDIO_WORKSPACE_MIGRATION_2026-09-04.md`
- `project/Change Logs/CHANGE_NOTES_DB_LUMPSUM_2026-09-15.md`
- `project/Change Logs/CHANGE_NOTES_DEFAULT_LOAN_SQL_2026-09-15.md`
- `project/Change Logs/CHANGE_NOTES_DELETE_OLTP_PROTOTYPES_2026-08-31.md`
- `project/Change Logs/CHANGE_NOTES_DELTA_BASED_RELEASE_CAPTURE_2026-09-17.md`
- `project/Change Logs/CHANGE_NOTES_DEPENDENCY_FOLDER_CLEANUP_2026-09-10.md`
- `project/Change Logs/CHANGE_NOTES_DEPLOYED_PROD_VALIDATION_2026-09-18.md`
- `project/Change Logs/CHANGE_NOTES_DEVELOPMENT_INSTANCE_2026-09-15.md`
- `project/Change Logs/CHANGE_NOTES_DEVELOPMENT_WORKFLOW_2026-10-01.md`
- `project/Change Logs/CHANGE_NOTES_DEV_APP_REFRESH_2026-09-19.md`
- `project/Change Logs/CHANGE_NOTES_DEV_AUTOMATION_POLICY_2026-09-15.md`
- `project/Change Logs/CHANGE_NOTES_DEV_DB_CONSOLIDATION_2026-09-20.md`
- `project/Change Logs/CHANGE_NOTES_DEV_PROTOTYPE_VALIDATION_2026-09-18.md`
- `project/Change Logs/CHANGE_NOTES_DEV_REFRESH_RUNBOOK_2026-09-16.md`
- `project/Change Logs/CHANGE_NOTES_DIRECT_REVIEW_REPLIES_2026-09-09.md`
- `project/Change Logs/CHANGE_NOTES_DOCUMENTATION_GOVERNANCE_2026-08-30.md`
- `project/Change Logs/CHANGE_NOTES_DOCUMENTATION_OPTIMIZATION_2026-09-20.md`
- `project/Change Logs/CHANGE_NOTES_DOCUMENTATION_RECONCILIATION_2026-09-15.md`
- `project/Change Logs/CHANGE_NOTES_DOCUMENTS_AND_SIX_AGENT_WORKFLOW_2026-10-14.md`
- `project/Change Logs/CHANGE_NOTES_DOCUMENT_RULES_LAYOUT_2026-10-14.md`
- `project/Change Logs/CHANGE_NOTES_DOTS_ORCHESTRATION_2026-10-02.md`
- `project/Change Logs/CHANGE_NOTES_DRIVE_SCOPE_AND_SIZE_2026-09-10.md`
- `project/Change Logs/CHANGE_NOTES_ECOSYSTEM_EXECUTOR_MATRIX_2026-10-03.md`
- `project/Change Logs/CHANGE_NOTES_EXACT_APPSHEET_RELEASE_CAPTURE_2026-09-16.md`
- `project/Change Logs/CHANGE_NOTES_EXPENSE_DASHBOARD_REFINEMENT_2026-09-16.md`
- `project/Change Logs/CHANGE_NOTES_EXTERNAL_CREDENTIAL_STORAGE_2026-09-10.md`
- `project/Change Logs/CHANGE_NOTES_FLYWAY_2026-09-15.md`
- `project/Change Logs/CHANGE_NOTES_FORECAST_PLANNING_DESIGN_2026-09-27.md`
- `project/Change Logs/CHANGE_NOTES_FUTURE_CHARGES_RESTRUCTURING_2026-09-08.md`
- `project/Change Logs/CHANGE_NOTES_GCP_COST_FORMAT_2026-09-24.md`
- `project/Change Logs/CHANGE_NOTES_GCP_SESSION_POLICY_2026-09-24.md`
- `project/Change Logs/CHANGE_NOTES_GIFT_SETTLEMENT_PLAN_2026-09-20.md`
- `project/Change Logs/CHANGE_NOTES_GITHUB_FOLDER_CLEANUP_2026-10-01.md`
- `project/Change Logs/CHANGE_NOTES_GITHUB_RESTORATION_2026-09-12.md`
- `project/Change Logs/CHANGE_NOTES_GRAFANA_ALERT_RUNBOOK_2026-10-03.md`
- `project/Change Logs/CHANGE_NOTES_GRAFANA_INFRASTRUCTURE_UPTIME_2026-10-05.md`
- `project/Change Logs/CHANGE_NOTES_GRAFANA_MCP_BRIDGE_2026-10-02.md`
- `project/Change Logs/CHANGE_NOTES_GRAFANA_ROW5_VM01_UPTIME_2026-10-04.md`
- `project/Change Logs/CHANGE_NOTES_GROUP_SCANNING_COMPLETION_2026-09-26.md`
- `project/Change Logs/CHANGE_NOTES_INFRASTRUCTURE_CLEANUP_PHASE1_2026-10-12.md`
- `project/Change Logs/CHANGE_NOTES_INSTAGRAM_API_AGENT_2026-09-08.md`
- `project/Change Logs/CHANGE_NOTES_INSTAGRAM_EVENT_WORKER_2026-09-08.md`
- `project/Change Logs/CHANGE_NOTES_INTERVAL_ANCHOR_2026-09-15.md`
- `project/Change Logs/CHANGE_NOTES_LISA_CASH_ACCOUNT_INITIALIZATION_2026-09-20.md`
- `project/Change Logs/CHANGE_NOTES_LISA_HISTORICAL_EXPENSE_CASH_2026-09-18.md`
- `project/Change Logs/CHANGE_NOTES_LOAN_CHARGE_SETTLEMENT_2026-09-15.md`
- `project/Change Logs/CHANGE_NOTES_LOAN_DURATION_VISIBILITY_2026-09-11.md`
- `project/Change Logs/CHANGE_NOTES_LOAN_ECOSYSTEM_DIAGRAM_2026-09-16.md`
- `project/Change Logs/CHANGE_NOTES_LOAN_ECOSYSTEM_THREE_PAGES_2026-10-04.md`
- `project/Change Logs/CHANGE_NOTES_LOAN_MANAGER_COPY_CLEANUP_2026-09-06.md`
- `project/Change Logs/CHANGE_NOTES_LOOKER_OVERDUE_2026-09-14.md`
- `project/Change Logs/CHANGE_NOTES_LOOKER_PAGE_8_PROFIT_FORECAST_2026-09-02.md`
- `project/Change Logs/CHANGE_NOTES_LOOKER_STUDIO_RETIREMENT_2026-09-27.md`
- `project/Change Logs/CHANGE_NOTES_MASTER_API_ONLY_REQUIREMENT_2026-09-08.md`
- `project/Change Logs/CHANGE_NOTES_METABASE_GITHUB_2026-09-26.md`
- `project/Change Logs/CHANGE_NOTES_METABASE_POC_2026-09-22.md`
- `project/Change Logs/CHANGE_NOTES_METABASE_RAILWAY_2026-09-22.md`
- `project/Change Logs/CHANGE_NOTES_METABASE_RECOVERY_MONITORING_2026-09-26.md`
- `project/Change Logs/CHANGE_NOTES_METABASE_SAMPLE_DATABASE_2026-09-23.md`
- `project/Change Logs/CHANGE_NOTES_MINT_SETTLEMENT_2026-09-28.md`
- `project/Change Logs/CHANGE_NOTES_MODEL_MAPPING_2026-10-15.md`
- `project/Change Logs/CHANGE_NOTES_MONITORED_JOBS_2026-09-15.md`
- `project/Change Logs/CHANGE_NOTES_MONTHLY_FORECAST_2026-08-30.md`
- `project/Change Logs/CHANGE_NOTES_NAN_PAYMENT_2026-09-27.md`
- `project/Change Logs/CHANGE_NOTES_OEY_CLOSING_PAYMENT_2026-09-22.md`
- `project/Change Logs/CHANGE_NOTES_OLAP_ACCRUED_INTEREST_DEPENDENCY_REPAIR_2026-08-30.md`
- `project/Change Logs/CHANGE_NOTES_OLAP_ASSESSMENT_SQL_2026-09-15.md`
- `project/Change Logs/CHANGE_NOTES_OLAP_AUTOMATION_MIGRATION_REPAIR_2026-09-05.md`
- `project/Change Logs/CHANGE_NOTES_OLAP_DAILY_INTEREST_CONTRIBUTION_2026-09-01.md`
- `project/Change Logs/CHANGE_NOTES_OLAP_PROJECTED_MONTHLY_PROFIT_CONTRIBUTION_2026-09-02.md`
- `project/Change Logs/CHANGE_NOTES_OLAP_SHARED_VC_ALIGNMENT_2026-08-30.md`
- `project/Change Logs/CHANGE_NOTES_OLAP_WARNINGS_KPI_RECONCILIATION_2026-09-06.md`
- `project/Change Logs/CHANGE_NOTES_OLTP_2026-08-30.md`
- `project/Change Logs/CHANGE_NOTES_OLTP_ANALYSIS_REVIEW_2026-09-12.md`
- `project/Change Logs/CHANGE_NOTES_OLTP_AUDIT_INTEGRITY_REVIEW_2026-09-10.md`
- `project/Change Logs/CHANGE_NOTES_OLTP_BUSINESS_PROCESS_DIAGRAM_2026-09-12.md`
- `project/Change Logs/CHANGE_NOTES_OLTP_COMBINED_PERFORMANCE_2026-09-13.md`
- `project/Change Logs/CHANGE_NOTES_OLTP_FINANCIAL_INPUT_VALIDATION_2026-08-31.md`
- `project/Change Logs/CHANGE_NOTES_OLTP_PERFORMANCE_LAB_2026-09-12.md`
- `project/Change Logs/CHANGE_NOTES_OLTP_TEST_ROUND_2026-08-30.md`
- `project/Change Logs/CHANGE_NOTES_OLTP_TODAYS_PAYMENT_AMOUNT_2026-09-04.md`
- `project/Change Logs/CHANGE_NOTES_OLTP_UPCOMING_CHARGES_DESIGN_2026-09-29.md`
- `project/Change Logs/CHANGE_NOTES_OPENAI_STATUS_HOVER_2026-09-24.md`
- `project/Change Logs/CHANGE_NOTES_ORGAN_PAYMENT_2026-09-19.md`
- `project/Change Logs/CHANGE_NOTES_PAGE_7_2026-08-29.md`
- `project/Change Logs/CHANGE_NOTES_PARTNERS_TAB_DESIGN_2026-09-26.md`
- `project/Change Logs/CHANGE_NOTES_PARTNER_AGENT_PROJECT_2026-09-13.md`
- `project/Change Logs/CHANGE_NOTES_PARTNER_BORROWER_SETUP_2026-09-13.md`
- `project/Change Logs/CHANGE_NOTES_PARTNER_LANGUAGE_ENUM_2026-09-13.md`
- `project/Change Logs/CHANGE_NOTES_PARTNER_OPERATIONS_PROPOSAL_2026-09-13.md`
- `project/Change Logs/CHANGE_NOTES_PARTNER_SAMPLE_ACTIVATION_2026-09-13.md`
- `project/Change Logs/CHANGE_NOTES_PAYMENT_PLAN_REPLACEMENT_2026-09-15.md`
- `project/Change Logs/CHANGE_NOTES_PAYMENT_RECEIVER_CORRECTION_2026-09-19.md`
- `project/Change Logs/CHANGE_NOTES_PENDING_COLLECTION_RECONCILIATION_2026-09-01.md`
- `project/Change Logs/CHANGE_NOTES_PIM_PAYMENT_ALLOCATION_2026-09-25.md`
- `project/Change Logs/CHANGE_NOTES_POLLING_HOVER_2026-09-24.md`
- `project/Change Logs/CHANGE_NOTES_POSTGRESQL_MIGRATION_TRIAL_2026-09-14.md`
- `project/Change Logs/CHANGE_NOTES_POSTGRESQL_OLTP_VALIDATION_2026-09-14.md`
- `project/Change Logs/CHANGE_NOTES_POSTGRESQL_PRODUCTION_CUTOVER_2026-09-15.md`
- `project/Change Logs/CHANGE_NOTES_POSTGRESQL_SYNC_OPTIONS_2026-09-15.md`
- `project/Change Logs/CHANGE_NOTES_PREEM_SETTLEMENT_PLAN_2026-09-25.md`
- `project/Change Logs/CHANGE_NOTES_PRIVACY_SITE_2026-09-08.md`
- `project/Change Logs/CHANGE_NOTES_PRODUCTION_API_ACCESS_2026-09-21.md`
- `project/Change Logs/CHANGE_NOTES_PRODUCTION_APPSHEET_API_ACCESS_2026-09-20.md`
- `project/Change Logs/CHANGE_NOTES_PROMOTION_CHECKLIST_REVIEW_2026-09-20.md`
- `project/Change Logs/CHANGE_NOTES_PROMOTION_DOCUMENTATION_CHECKLIST_2026-09-18.md`
- `project/Change Logs/CHANGE_NOTES_PROMOTION_RECONCILIATION_GOVERNANCE_2026-09-16.md`
- `project/Change Logs/CHANGE_NOTES_PROTOTYPE_DESIGN_PRINCIPLE_2026-08-31.md`
- `project/Change Logs/CHANGE_NOTES_PR_MERGES_2026-10-14.md`
- `project/Change Logs/CHANGE_NOTES_PWA_CI_BATCHING_2026-10-08.md`
- `project/Change Logs/CHANGE_NOTES_PWA_COLLECTION_NOTE_UI_2026-10-09.md`
- `project/Change Logs/CHANGE_NOTES_PWA_COLLECTION_RECEIVING_UI_2026-10-09.md`
- `project/Change Logs/CHANGE_NOTES_PWA_CONSOLIDATED_UI_CHECKPOINTS_2026-10-09.md`
- `project/Change Logs/CHANGE_NOTES_PWA_DELIVERY_POLICY_2026-10-12.md`
- `project/Change Logs/CHANGE_NOTES_PWA_IMPLEMENTATION_PLAN_2026-10-07.md`
- `project/Change Logs/CHANGE_NOTES_PWA_INFRASTRUCTURE_2026-10-07.md`
- `project/Change Logs/CHANGE_NOTES_PWA_PAGE_FIVE_UI_2026-10-09.md`
- `project/Change Logs/CHANGE_NOTES_PWA_PAGE_FOURTEEN_UI_2026-10-09.md`
- `project/Change Logs/CHANGE_NOTES_PWA_PROCESS_STREAMLINING_2026-10-08.md`
- `project/Change Logs/CHANGE_NOTES_PWA_PROGRESS_2026-10-07.md`
- `project/Change Logs/CHANGE_NOTES_PWA_REBUILD_DESIGN_2026-10-07.md`
- `project/Change Logs/CHANGE_NOTES_PWA_TEAM_CHECKPOINT_ORDER_2026-10-11.md`
- `project/Change Logs/CHANGE_NOTES_PWA_TEAM_GOVERNANCE_2026-10-08.md`
- `project/Change Logs/CHANGE_NOTES_PWA_UI_FAST_PATH_2026-10-08.md`
- `project/Change Logs/CHANGE_NOTES_PWA_WORKFLOW_CLEANUP_2026-10-14.md`
- `project/Change Logs/CHANGE_NOTES_PWA_WORKSPACE_UI_2026-10-09.md`
- `project/Change Logs/CHANGE_NOTES_R001_APPSHEET_RECONCILIATION_2026-09-16.md`
- `project/Change Logs/CHANGE_NOTES_R002_2026-09-16.md`
- `project/Change Logs/CHANGE_NOTES_R003_PRODUCTION_APPSHEET_RECONCILIATION_2026-09-16.md`
- `project/Change Logs/CHANGE_NOTES_R004_2026-09-17.md`
- `project/Change Logs/CHANGE_NOTES_R005_2026-09-17.md`
- `project/Change Logs/CHANGE_NOTES_R006_2026-09-18.md`
- `project/Change Logs/CHANGE_NOTES_R007_2026-09-18.md`
- `project/Change Logs/CHANGE_NOTES_R008_2026-09-18.md`
- `project/Change Logs/CHANGE_NOTES_R009_2026-09-19.md`
- `project/Change Logs/CHANGE_NOTES_R010_2026-09-19.md`
- `project/Change Logs/CHANGE_NOTES_R011_2026-09-20.md`
- `project/Change Logs/CHANGE_NOTES_R013_2026-09-21.md`
- `project/Change Logs/CHANGE_NOTES_R014_2026-09-21.md`
- `project/Change Logs/CHANGE_NOTES_R015_2026-09-22.md`
- `project/Change Logs/CHANGE_NOTES_R016_2026-09-22.md`
- `project/Change Logs/CHANGE_NOTES_R017_2026-09-24.md`
- `project/Change Logs/CHANGE_NOTES_R018_2026-09-24.md`
- `project/Change Logs/CHANGE_NOTES_R019_2026-09-24.md`
- `project/Change Logs/CHANGE_NOTES_R020_2026-09-24.md`
- `project/Change Logs/CHANGE_NOTES_R021_2026-09-24.md`
- `project/Change Logs/CHANGE_NOTES_R022_2026-09-24.md`
- `project/Change Logs/CHANGE_NOTES_R023_2026-09-24.md`
- `project/Change Logs/CHANGE_NOTES_R024_2026-09-24.md`
- `project/Change Logs/CHANGE_NOTES_R025_2026-09-24.md`
- `project/Change Logs/CHANGE_NOTES_R026_2026-09-24.md`
- `project/Change Logs/CHANGE_NOTES_R027_2026-09-24.md`
- `project/Change Logs/CHANGE_NOTES_R028_2026-09-25.md`
- `project/Change Logs/CHANGE_NOTES_R029_2026-09-25.md`
- `project/Change Logs/CHANGE_NOTES_R030_2026-09-25.md`
- `project/Change Logs/CHANGE_NOTES_R031_2026-09-25.md`
- `project/Change Logs/CHANGE_NOTES_R032_2026-09-25.md`
- `project/Change Logs/CHANGE_NOTES_R033_2026-09-25.md`
- `project/Change Logs/CHANGE_NOTES_R034_2026-09-25.md`
- `project/Change Logs/CHANGE_NOTES_R035_2026-09-25.md`
- `project/Change Logs/CHANGE_NOTES_R036_COLLECTION_STATUS_COLORS_2026-09-25.md`
- `project/Change Logs/CHANGE_NOTES_R036_OLTP_LOCALIZATION_2026-09-25.md`
- `project/Change Logs/CHANGE_NOTES_R036_PRINCIPAL_INTEREST_2026-09-25.md`
- `project/Change Logs/CHANGE_NOTES_R036_PRODUCTION_2026-09-25.md`
- `project/Change Logs/CHANGE_NOTES_R037_2026-09-26.md`
- `project/Change Logs/CHANGE_NOTES_R038_2026-09-26.md`
- `project/Change Logs/CHANGE_NOTES_R039_2026-09-26.md`
- `project/Change Logs/CHANGE_NOTES_R040_BORROWER_LIFETIME_DISPLAY_2026-09-26.md`
- `project/Change Logs/CHANGE_NOTES_R041_BORROWER_DETAIL_2026-09-26.md`
- `project/Change Logs/CHANGE_NOTES_R042_BORROWER_PAYMENTS_2026-09-26.md`
- `project/Change Logs/CHANGE_NOTES_R043_BORROWER_NAVIGATION_2026-09-26.md`
- `project/Change Logs/CHANGE_NOTES_R044_2026-09-26.md`
- `project/Change Logs/CHANGE_NOTES_R045_2026-09-27.md`
- `project/Change Logs/CHANGE_NOTES_R046_2026-09-27.md`
- `project/Change Logs/CHANGE_NOTES_R047_2026-09-27.md`
- `project/Change Logs/CHANGE_NOTES_R048_2026-09-27.md`
- `project/Change Logs/CHANGE_NOTES_R049_2026-09-29.md`
- `project/Change Logs/CHANGE_NOTES_R050_BORROWER_DETAIL_CATEGORY_2026-09-29.md`
- `project/Change Logs/CHANGE_NOTES_R050_BORROWER_LIFETIME_2026-09-29.md`
- `project/Change Logs/CHANGE_NOTES_R050_DURABLE_OPERATOR_AUDIT_2026-10-04.md`
- `project/Change Logs/CHANGE_NOTES_R050_FORECAST_PARTNERS_2026-09-29.md`
- `project/Change Logs/CHANGE_NOTES_R050_INTEREST_REALLOCATION_2026-10-04.md`
- `project/Change Logs/CHANGE_NOTES_R050_R016_OWNER_CLOSEOUT_2026-10-05.md`
- `project/Change Logs/CHANGE_NOTES_R050_VM01_CLOUD_CERTIFICATE_2026-10-04.md`
- `project/Change Logs/CHANGE_NOTES_R050_VM01_CONTROLLER_2026-10-01.md`
- `project/Change Logs/CHANGE_NOTES_R051_APPSHEET_LATENCY_2026-10-06.md`
- `project/Change Logs/CHANGE_NOTES_R051_CRUD_2026-10-05.md`
- `project/Change Logs/CHANGE_NOTES_R051_GRAFANA_OFFLINE_AUTH_2026-10-04.md`
- `project/Change Logs/CHANGE_NOTES_R051_PAYMENT_PERFORMANCE_2026-10-06.md`
- `project/Change Logs/CHANGE_NOTES_R051_PRODUCTION_2026-10-07.md`
- `project/Change Logs/CHANGE_NOTES_R051_RELATED_LIST_VIEWS_2026-10-07.md`
- `project/Change Logs/CHANGE_NOTES_R051_TRIGGER_PERFORMANCE_2026-10-06.md`
- `project/Change Logs/CHANGE_NOTES_R052_BILINGUAL_SEARCH_2026-10-08.md`
- `project/Change Logs/CHANGE_NOTES_R052_CHECKPOINT_2B_2026-10-07.md`
- `project/Change Logs/CHANGE_NOTES_R052_CHECKPOINT_2C_2026-10-07.md`
- `project/Change Logs/CHANGE_NOTES_R052_DEV_APPLICATION_CAPABILITY_2026-10-08.md`
- `project/Change Logs/CHANGE_NOTES_R052_DEV_AUTH_READ_2026-10-07.md`
- `project/Change Logs/CHANGE_NOTES_R052_DEV_COMMAND_ACTIVATION_2026-10-08.md`
- `project/Change Logs/CHANGE_NOTES_R052_DEV_CUSTOM_DOMAIN_2026-10-08.md`
- `project/Change Logs/CHANGE_NOTES_R052_DISPOSABLE_COMMAND_JOURNAL_2026-10-08.md`
- `project/Change Logs/CHANGE_NOTES_R052_DURABLE_COMMAND_RECEIPT_PLAN_2026-10-08.md`
- `project/Change Logs/CHANGE_NOTES_R052_LOCAL_COMMAND_API_2026-10-08.md`
- `project/Change Logs/CHANGE_NOTES_R052_PAYMENT_NOTES_RECEIPT_REHEARSAL_2026-10-08.md`
- `project/Change Logs/CHANGE_NOTES_R052_PAYMENT_REHEARSAL_2026-10-08.md`
- `project/Change Logs/CHANGE_NOTES_R052_PHASE3_READINESS_2026-10-11.md`
- `project/Change Logs/CHANGE_NOTES_R052_PHASE4_COMPLETION_2026-10-08.md`
- `project/Change Logs/CHANGE_NOTES_R052_PHASE5_COMPLETION_2026-10-08.md`
- `project/Change Logs/CHANGE_NOTES_R052_PHASE6_2026-10-10.md`
- `project/Change Logs/CHANGE_NOTES_R052_PWA_CHECKPOINT_2026-10-07.md`
- `project/Change Logs/CHANGE_NOTES_R052_PWA_FOUNDATION_2026-10-08.md`
- `project/Change Logs/CHANGE_NOTES_R052_PWA_READ_CONTRACTS_2026-10-07.md`
- `project/Change Logs/CHANGE_NOTES_R052_READ_ERROR_TRACING_2026-10-08.md`
- `project/Change Logs/CHANGE_NOTES_R052_RECEIVING_UX_2026-10-08.md`
- `project/Change Logs/CHANGE_NOTES_R052_UNIFIED_RECEIVING_2026-10-08.md`
- `project/Change Logs/CHANGE_NOTES_R053_APPSHEET_RETIREMENT_2026-10-12.md`
- `project/Change Logs/CHANGE_NOTES_R053_NOTIFICATIONS_JOBS_2026-10-11.md`
- `project/Change Logs/CHANGE_NOTES_R054_UI_PREVIEW_2026-10-12.md`
- `project/Change Logs/CHANGE_NOTES_R054_UI_PRODUCTION_2026-10-13.md`
- `project/Change Logs/CHANGE_NOTES_R055_GRAFANA_2026-10-13.md`
- `project/Change Logs/CHANGE_NOTES_R055_NATIVE_MONITORING_2026-10-13.md`
- `project/Change Logs/CHANGE_NOTES_R056_APPLE_PUSH_2026-10-13.md`
- `project/Change Logs/CHANGE_NOTES_R057_APPSHEET_RETIREMENT_2026-10-13.md`
- `project/Change Logs/CHANGE_NOTES_R057_INFRASTRUCTURE_ADOPTION_2026-10-13.md`
- `project/Change Logs/CHANGE_NOTES_RAILWAY_PENDING_REGION_CLEANUP_2026-09-24.md`
- `project/Change Logs/CHANGE_NOTES_RC_CLEANUP_AND_LOGOS_2026-09-21.md`
- `project/Change Logs/CHANGE_NOTES_RC_DEFINITION_ONLY_COPY_2026-09-21.md`
- `project/Change Logs/CHANGE_NOTES_RECEIPT_BACKFILL_2026-09-27.md`
- `project/Change Logs/CHANGE_NOTES_RECEIPT_CONTEXT_FIX_2026-09-08.md`
- `project/Change Logs/CHANGE_NOTES_RECEIPT_DATE_WINDOW_2026-09-09.md`
- `project/Change Logs/CHANGE_NOTES_RECEIPT_HOLD_MONITORING_SEMANTICS_2026-09-25.md`
- `project/Change Logs/CHANGE_NOTES_RECEIPT_MONITORING_HANDOVER_2026-09-25.md`
- `project/Change Logs/CHANGE_NOTES_RECEIPT_MONITORING_IMPLEMENTATION_2026-09-25.md`
- `project/Change Logs/CHANGE_NOTES_RECEIPT_NOTIFICATION_HEALTH_TEXT_2026-10-02.md`
- `project/Change Logs/CHANGE_NOTES_RECEIPT_STORAGE_DESIGN_2026-09-27.md`
- `project/Change Logs/CHANGE_NOTES_RELEASE_TRACKING_2026-09-16.md`
- `project/Change Logs/CHANGE_NOTES_REPOSITORY_CONSOLIDATION_2026-10-12.md`
- `project/Change Logs/CHANGE_NOTES_REPOSITORY_OUTPUTS_AND_DEPENDENCIES_2026-09-10.md`
- `project/Change Logs/CHANGE_NOTES_RESOURCE_MONITORING_2026-09-22.md`
- `project/Change Logs/CHANGE_NOTES_RESOURCE_MONITORING_ALERTS_2026-09-23.md`
- `project/Change Logs/CHANGE_NOTES_RESOURCE_MONITORING_COST_DETAIL_2026-09-26.md`
- `project/Change Logs/CHANGE_NOTES_RESTORE_OUTPUT_TRACKING_2026-09-10.md`
- `project/Change Logs/CHANGE_NOTES_REVIEWED_BRANCH_CLEANUP_2026-10-04.md`
- `project/Change Logs/CHANGE_NOTES_REVIEWER_LANGUAGE_2026-09-09.md`
- `project/Change Logs/CHANGE_NOTES_REVIEW_REQUEST_DETAILS_2026-09-09.md`
- `project/Change Logs/CHANGE_NOTES_SCHEDULE_CONSISTENCY_SIMULATION_2026-09-25.md`
- `project/Change Logs/CHANGE_NOTES_SDLC_EFFICIENCY_2026-09-17.md`
- `project/Change Logs/CHANGE_NOTES_SDLC_PROMOTION_METHODOLOGY_2026-09-16.md`
- `project/Change Logs/CHANGE_NOTES_SDLC_RC_PROMOTION_2026-09-19.md`
- `project/Change Logs/CHANGE_NOTES_SHARED_ACCOUNT_CHAT_RELEVANCE_2026-09-09.md`
- `project/Change Logs/CHANGE_NOTES_SINGLE_OPEN_RELEASE_2026-09-24.md`
- `project/Change Logs/CHANGE_NOTES_TARGETED_ROUTING_CHECKS_2026-09-17.md`
- `project/Change Logs/CHANGE_NOTES_TOMMY_BORROWER_LOAN_2026-09-08.md`
- `project/Change Logs/CHANGE_NOTES_TOMMY_SEPARATE_REVIEWER_ACCOUNT_2026-09-09.md`
- `project/Change Logs/CHANGE_NOTES_UNIVERSAL_PAYMENTS_CLONE_2026-09-05.md`
- `project/Change Logs/CHANGE_NOTES_UNIVERSAL_PAYMENTS_PRODUCTION_2026-09-06.md`
- `project/Change Logs/CHANGE_NOTES_VC_MATERIALIZATION_2026-09-16.md`
- `project/Change Logs/CHANGE_NOTES_VC_PRODUCTION_2026-09-16.md`
- `project/Change Logs/CHANGE_NOTES_VM01_PROFILE_CLEANUP_2026-10-11.md`
- `project/Change Logs/CHANGE_NOTES_VM01_STORAGE_LIFECYCLE_2026-10-11.md`
- `project/Change Logs/CHANGE_NOTES_WA_SETTLEMENT_2026-09-27.md`
- `project/Change Logs/CHANGE_NOTES_YING_PRINCIPAL_CORRECTION_2026-09-29.md`

**project/outputs/appsheet-cleanup-20260915/** (4)

- `project/outputs/appsheet-cleanup-20260915/apps-after.txt`
- `project/outputs/appsheet-cleanup-20260915/databases-after.txt`
- `project/outputs/appsheet-cleanup-20260915/navigation.json`
- `project/outputs/appsheet-cleanup-20260915/verification.json`

**project/outputs/assessment-sql-20260915/** (22)

- `project/outputs/assessment-sql-20260915/01-calculation.sql`
- `project/outputs/assessment-sql-20260915/02-lab-table.sql`
- `project/outputs/assessment-sql-20260915/03-freshness.sql`
- `project/outputs/assessment-sql-20260915/04-calendar-view.sql`
- `project/outputs/assessment-sql-20260915/REPORT.md`
- `project/outputs/assessment-sql-20260915/app-definition-diff.json`
- `project/outputs/assessment-sql-20260915/app-verification.json`
- `project/outputs/assessment-sql-20260915/baseline-parity.json`
- `project/outputs/assessment-sql-20260915/behavior-verification.json`
- `project/outputs/assessment-sql-20260915/calendar-paired-sync-timings.json`
- `project/outputs/assessment-sql-20260915/dictionary-after.png`
- `project/outputs/assessment-sql-20260915/dictionary-before.png`
- `project/outputs/assessment-sql-20260915/dictionary-formula.png`
- `project/outputs/assessment-sql-20260915/dictionary-verification.json`
- `project/outputs/assessment-sql-20260915/dom-sync-timings-all.json`
- `project/outputs/assessment-sql-20260915/input-parity.json`
- `project/outputs/assessment-sql-20260915/oracle-validation.json`
- `project/outputs/assessment-sql-20260915/paired-sync-timings.json`
- `project/outputs/assessment-sql-20260915/performance-summary.json`
- `project/outputs/assessment-sql-20260915/sync-timings.json`
- `project/outputs/assessment-sql-20260915/trigger-timings.json`
- `project/outputs/assessment-sql-20260915/ui-tests.json`

**project/outputs/assessment-workflow-20260915/** (4)

- `project/outputs/assessment-workflow-20260915/before.png`
- `project/outputs/assessment-workflow-20260915/recommendation.png`
- `project/outputs/assessment-workflow-20260915/verification.json`
- `project/outputs/assessment-workflow-20260915/workflow.png`

**project/outputs/atomic-close-20260915/** (15)

- `project/outputs/atomic-close-20260915/REPORT.md`
- `project/outputs/atomic-close-20260915/appsheet-configuration.md`
- `project/outputs/atomic-close-20260915/dictionary-after-DB-Logic.png`
- `project/outputs/atomic-close-20260915/dictionary-after-Dev-Differences.png`
- `project/outputs/atomic-close-20260915/dictionary-after-Guide.png`
- `project/outputs/atomic-close-20260915/dictionary-before.png`
- `project/outputs/atomic-close-20260915/dictionary-changes.json`
- `project/outputs/atomic-close-20260915/dictionary-error-scan.jsonl`
- `project/outputs/atomic-close-20260915/dictionary-native-features.json`
- `project/outputs/atomic-close-20260915/dictionary-verified-row-265.png`
- `project/outputs/atomic-close-20260915/dictionary-verified-row-298.png`
- `project/outputs/atomic-close-20260915/dictionary-verified-row-326.png`
- `project/outputs/atomic-close-20260915/disposable-regression.txt`
- `project/outputs/atomic-close-20260915/gui-reconciliation.txt`
- `project/outputs/atomic-close-20260915/original-record-preservation.json`

**project/outputs/borrower-cleanup-20260913/** (5)

- `project/outputs/borrower-cleanup-20260913/dictionary-after.png`
- `project/outputs/borrower-cleanup-20260913/dictionary-before.png`
- `project/outputs/borrower-cleanup-20260913/dictionary-final.png`
- `project/outputs/borrower-cleanup-20260913/final-schema.json`
- `project/outputs/borrower-cleanup-20260913/schema-check.json`

**project/outputs/borrower-name-vc-20260915/** (9)

- `project/outputs/borrower-name-vc-20260915/database-verification.json`
- `project/outputs/borrower-name-vc-20260915/dependencies.json`
- `project/outputs/borrower-name-vc-20260915/dictionary-after.png`
- `project/outputs/borrower-name-vc-20260915/dictionary-before.png`
- `project/outputs/borrower-name-vc-20260915/dictionary-verification.json`
- `project/outputs/borrower-name-vc-20260915/remove-stored-name.sql`
- `project/outputs/borrower-name-vc-20260915/restore-stored-name.sql`
- `project/outputs/borrower-name-vc-20260915/runtime-and-alerts.json`
- `project/outputs/borrower-name-vc-20260915/verification.json`

**project/outputs/borrower-visibility-2026-09-01/** (20)

- `project/outputs/borrower-visibility-2026-09-01/AppSheet_Data_Dictionary.xlsx`
- `project/outputs/borrower-visibility-2026-09-01/render-after/00-contact-sheet.png`
- `project/outputs/borrower-visibility-2026-09-01/render-after/01-README.png`
- `project/outputs/borrower-visibility-2026-09-01/render-after/02-Tables.png`
- `project/outputs/borrower-visibility-2026-09-01/render-after/03-Columns.png`
- `project/outputs/borrower-visibility-2026-09-01/render-after/04-Relationships.png`
- `project/outputs/borrower-visibility-2026-09-01/render-after/05-Slices.png`
- `project/outputs/borrower-visibility-2026-09-01/render-after/06-Slice_Columns.png`
- `project/outputs/borrower-visibility-2026-09-01/render-after/07-App_Variances.png`
- `project/outputs/borrower-visibility-2026-09-01/render-after/08-Change_Log.png`
- `project/outputs/borrower-visibility-2026-09-01/render-before/00-contact-sheet.png`
- `project/outputs/borrower-visibility-2026-09-01/render-before/01-README.png`
- `project/outputs/borrower-visibility-2026-09-01/render-before/02-Tables.png`
- `project/outputs/borrower-visibility-2026-09-01/render-before/03-Columns.png`
- `project/outputs/borrower-visibility-2026-09-01/render-before/04-Relationships.png`
- `project/outputs/borrower-visibility-2026-09-01/render-before/05-Slices.png`
- `project/outputs/borrower-visibility-2026-09-01/render-before/06-Slice_Columns.png`
- `project/outputs/borrower-visibility-2026-09-01/render-before/07-App_Variances.png`
- `project/outputs/borrower-visibility-2026-09-01/render-before/08-Change_Log.png`
- `project/outputs/borrower-visibility-2026-09-01/update_dictionary.py`

**project/outputs/business-expenses-20260916/** (22)

- `project/outputs/business-expenses-20260916/REPORT.md`
- `project/outputs/business-expenses-20260916/backup-verification.json`
- `project/outputs/business-expenses-20260916/dev-final-reconciliation.jsonl`
- `project/outputs/business-expenses-20260916/dev-final-validation.json`
- `project/outputs/business-expenses-20260916/dev-migration.json`
- `project/outputs/business-expenses-20260916/dev-net-reconciliation.jsonl`
- `project/outputs/business-expenses-20260916/dev-v16-info.json`
- `project/outputs/business-expenses-20260916/dev-v16-migration.json`
- `project/outputs/business-expenses-20260916/dev-v16-validation.json`
- `project/outputs/business-expenses-20260916/dev-validation.json`
- `project/outputs/business-expenses-20260916/dictionary-after.png`
- `project/outputs/business-expenses-20260916/dictionary-before.png`
- `project/outputs/business-expenses-20260916/dictionary-changes.json`
- `project/outputs/business-expenses-20260916/dictionary-error-scan.jsonl`
- `project/outputs/business-expenses-20260916/existing-regression.log`
- `project/outputs/business-expenses-20260916/gross-analytics-reconciliation.json`
- `project/outputs/business-expenses-20260916/gui-manual-expense.jsonl`
- `project/outputs/business-expenses-20260916/gui-referral-normal.jsonl`
- `project/outputs/business-expenses-20260916/regression-final.log`
- `project/outputs/business-expenses-20260916/regression-v16.log`
- `project/outputs/business-expenses-20260916/regression.log`
- `project/outputs/business-expenses-20260916/rounding-diagnostic.jsonl`

**project/outputs/business-expenses-production-20260916/** (2)

- `project/outputs/business-expenses-production-20260916/REPORT.md`
- `project/outputs/business-expenses-production-20260916/production-acceptance.txt`

**project/outputs/charge-generation-20260915/** (26)

- `project/outputs/charge-generation-20260915/REPORT.md`
- `project/outputs/charge-generation-20260915/dictionary-after-DB-Logic.png`
- `project/outputs/charge-generation-20260915/dictionary-after-Dev-Differences.png`
- `project/outputs/charge-generation-20260915/dictionary-after-Guide.png`
- `project/outputs/charge-generation-20260915/dictionary-before.png`
- `project/outputs/charge-generation-20260915/dictionary-changes.json`
- `project/outputs/charge-generation-20260915/dictionary-error-scan.jsonl`
- `project/outputs/charge-generation-20260915/dictionary-native-features.json`
- `project/outputs/charge-generation-20260915/dictionary-verified-row-339.png`
- `project/outputs/charge-generation-20260915/dictionary-verified-row-360.png`
- `project/outputs/charge-generation-20260915/dictionary-verified-row-380.png`
- `project/outputs/charge-generation-20260915/disposable-regression.txt`
- `project/outputs/charge-generation-20260915/final-fixtures.txt`
- `project/outputs/charge-generation-20260915/final-scheduler-state.jsonl`
- `project/outputs/charge-generation-20260915/manual-gui-data.txt`
- `project/outputs/charge-generation-20260915/migration.json`
- `project/outputs/charge-generation-20260915/nightly-enabled.jsonl`
- `project/outputs/charge-generation-20260915/original-due-dryrun.txt`
- `project/outputs/charge-generation-20260915/original-preservation.json`
- `project/outputs/charge-generation-20260915/scheduler-installed.jsonl`
- `project/outputs/charge-generation-20260915/scheduler-test-finish.jsonl`
- `project/outputs/charge-generation-20260915/scheduler-test-results.jsonl`
- `project/outputs/charge-generation-20260915/scheduler-test-start.jsonl`
- `project/outputs/charge-generation-20260915/schema-after.normalized.sql`
- `project/outputs/charge-generation-20260915/validate-final.json`
- `project/outputs/charge-generation-20260915/validate.json`

**project/outputs/charge-generation-flag-20260908/** (10)

- `project/outputs/charge-generation-flag-20260908/AppSheet_Data_Dictionary.xlsx`
- `project/outputs/charge-generation-flag-20260908/dictionary-before.png`
- `project/outputs/charge-generation-flag-20260908/dictionary.before.xlsx`
- `project/outputs/charge-generation-flag-20260908/flag-after.png`
- `project/outputs/charge-generation-flag-20260908/live-model-hashes.json`
- `project/outputs/charge-generation-flag-20260908/model-formulas.json`
- `project/outputs/charge-generation-flag-20260908/oum-plan-and-before.json`
- `project/outputs/charge-generation-flag-20260908/overview.before.md`
- `project/outputs/charge-generation-flag-20260908/readme-after.png`
- `project/outputs/charge-generation-flag-20260908/update_dictionary.mjs`

**project/outputs/cloud-sql-poc-20260914/** (11)

- `project/outputs/cloud-sql-poc-20260914/ENGINE_TEST_RESULTS.md`
- `project/outputs/cloud-sql-poc-20260914/IMPLEMENTATION_PLAN.md`
- `project/outputs/cloud-sql-poc-20260914/POC_TEST_REPORT.md`
- `project/outputs/cloud-sql-poc-20260914/app-config-1.000007.json`
- `project/outputs/cloud-sql-poc-20260914/app-config-1.000008.json`
- `project/outputs/cloud-sql-poc-20260914/dictionary-after.png`
- `project/outputs/cloud-sql-poc-20260914/dictionary-before.png`
- `project/outputs/cloud-sql-poc-20260914/dictionary-final-state.png`
- `project/outputs/cloud-sql-poc-20260914/dictionary-verification.json`
- `project/outputs/cloud-sql-poc-20260914/lab-config.json`
- `project/outputs/cloud-sql-poc-20260914/ui-test-evidence.json`

**project/outputs/core-payment-20260915/** (11)

- `project/outputs/core-payment-20260915/REPORT.md`
- `project/outputs/core-payment-20260915/appsheet-configuration.md`
- `project/outputs/core-payment-20260915/dictionary-after-DB-Logic.png`
- `project/outputs/core-payment-20260915/dictionary-after-Dev-Differences.png`
- `project/outputs/core-payment-20260915/dictionary-after-Guide.png`
- `project/outputs/core-payment-20260915/dictionary-before.png`
- `project/outputs/core-payment-20260915/dictionary-changes.json`
- `project/outputs/core-payment-20260915/dictionary-error-scan.jsonl`
- `project/outputs/core-payment-20260915/disposable-regression.txt`
- `project/outputs/core-payment-20260915/gui-ledger-verification.txt`
- `project/outputs/core-payment-20260915/original-record-preservation.json`

**project/outputs/core-promotion-20260915/** (22)

- `project/outputs/core-promotion-20260915/REPORT.md`
- `project/outputs/core-promotion-20260915/analytics-difference.json`
- `project/outputs/core-promotion-20260915/appsheet-configuration.md`
- `project/outputs/core-promotion-20260915/database-after.jsonl`
- `project/outputs/core-promotion-20260915/database-before.jsonl`
- `project/outputs/core-promotion-20260915/dictionary-after-Column-Rules.png`
- `project/outputs/core-promotion-20260915/dictionary-after-DB-Columns.png`
- `project/outputs/core-promotion-20260915/dictionary-after-Guide.png`
- `project/outputs/core-promotion-20260915/dictionary-after-Prod-Columns.png`
- `project/outputs/core-promotion-20260915/dictionary-before.png`
- `project/outputs/core-promotion-20260915/dictionary-changes.json`
- `project/outputs/core-promotion-20260915/dictionary-error-scan.jsonl`
- `project/outputs/core-promotion-20260915/dictionary-native-features.json`
- `project/outputs/core-promotion-20260915/dictionary-rule-2887.png`
- `project/outputs/core-promotion-20260915/dictionary-rule-3033.png`
- `project/outputs/core-promotion-20260915/dictionary-rule-4644.png`
- `project/outputs/core-promotion-20260915/flyway-validation.txt`
- `project/outputs/core-promotion-20260915/model-evidence.json`
- `project/outputs/core-promotion-20260915/preservation-comparison.json`
- `project/outputs/core-promotion-20260915/release-manifest.json`
- `project/outputs/core-promotion-20260915/restored-analytics.jsonl`
- `project/outputs/core-promotion-20260915/scheduler-enabled.jsonl`

**project/outputs/default-loan-20260915/** (14)

- `project/outputs/default-loan-20260915/REPORT.md`
- `project/outputs/default-loan-20260915/dictionary-after-DB-Logic.png`
- `project/outputs/default-loan-20260915/dictionary-after-Dev-Differences.png`
- `project/outputs/default-loan-20260915/dictionary-after-Guide.png`
- `project/outputs/default-loan-20260915/dictionary-before.png`
- `project/outputs/default-loan-20260915/dictionary-changes.json`
- `project/outputs/default-loan-20260915/dictionary-default-rules.png`
- `project/outputs/default-loan-20260915/dictionary-error-scan.jsonl`
- `project/outputs/default-loan-20260915/dictionary-native-features.json`
- `project/outputs/default-loan-20260915/flyway-validation.json`
- `project/outputs/default-loan-20260915/gui-posting-results.txt`
- `project/outputs/default-loan-20260915/original-row-preservation.json`
- `project/outputs/default-loan-20260915/regression-results.txt`
- `project/outputs/default-loan-20260915/schema-verification.json`

**project/outputs/development-instance-20260915/** (7)

- `project/outputs/development-instance-20260915/VERIFY_DEVELOPMENT.sql`
- `project/outputs/development-instance-20260915/dictionary-assessment.png`
- `project/outputs/development-instance-20260915/dictionary-before.png`
- `project/outputs/development-instance-20260915/dictionary-development.png`
- `project/outputs/development-instance-20260915/status.json`
- `project/outputs/development-instance-20260915/trigger-verification.sql`
- `project/outputs/development-instance-20260915/verification.json`

**project/outputs/dictionary-reconciliation-20260924/** (5)

- `project/outputs/dictionary-reconciliation-20260924/baseline-validation.json`
- `project/outputs/dictionary-reconciliation-20260924/development-flyway-validation.json`
- `project/outputs/dictionary-reconciliation-20260924/plan.json`
- `project/outputs/dictionary-reconciliation-20260924/production-flyway-validation.json`
- `project/outputs/dictionary-reconciliation-20260924/reference-validation.json`

**project/outputs/documentation-optimization-20260920/** (5)

- `project/outputs/documentation-optimization-20260920/dictionary-guide-after.png`
- `project/outputs/documentation-optimization-20260920/dictionary-guide-before.png`
- `project/outputs/documentation-optimization-20260920/dictionary-verification.json`
- `project/outputs/documentation-optimization-20260920/relocated-paths.json`
- `project/outputs/documentation-optimization-20260920/verification.json`

**project/outputs/expense-dashboard-refinement-20260916/** (7)

- `project/outputs/expense-dashboard-refinement-20260916/before-reconciliation.jsonl`
- `project/outputs/expense-dashboard-refinement-20260916/dictionary-after.png`
- `project/outputs/expense-dashboard-refinement-20260916/dictionary-before.png`
- `project/outputs/expense-dashboard-refinement-20260916/dictionary-changes.json`
- `project/outputs/expense-dashboard-refinement-20260916/dictionary-error-scan.jsonl`
- `project/outputs/expense-dashboard-refinement-20260916/dictionary-kpis-olap.png`
- `project/outputs/expense-dashboard-refinement-20260916/dictionary-kpis-oltp.png`

**project/outputs/future-charges-20260908/** (15)

- `project/outputs/future-charges-20260908/AppSheet_Data_Dictionary.xlsx`
- `project/outputs/future-charges-20260908/collection-after.png`
- `project/outputs/future-charges-20260908/dictionary-before.png`
- `project/outputs/future-charges-20260908/dictionary-inspect.json`
- `project/outputs/future-charges-20260908/dictionary.before.xlsx`
- `project/outputs/future-charges-20260908/final-readme.png`
- `project/outputs/future-charges-20260908/finalize_plan.mjs`
- `project/outputs/future-charges-20260908/formula-after.json`
- `project/outputs/future-charges-20260908/kpi-after.png`
- `project/outputs/future-charges-20260908/overview.before.md`
- `project/outputs/future-charges-20260908/prepare_plan.mjs`
- `project/outputs/future-charges-20260908/repayment-plan-review.md`
- `project/outputs/future-charges-20260908/repayment-plan.json`
- `project/outputs/future-charges-20260908/scenario-checks.md`
- `project/outputs/future-charges-20260908/update_dictionary.mjs`

**project/outputs/grafana-callback-host-diagnostic-20261003/** (3)

- `project/outputs/grafana-callback-host-diagnostic-20261003/README.md`
- `project/outputs/grafana-callback-host-diagnostic-20261003/after.json`
- `project/outputs/grafana-callback-host-diagnostic-20261003/https-acceptance.json`

**project/outputs/grafana-mcp-bridge-20261002/** (2)

- `project/outputs/grafana-mcp-bridge-20261002/README.md`
- `project/outputs/grafana-mcp-bridge-20261002/cost-estimate.json`

**project/outputs/grafana-offline-auth-20261004/** (3)

- `project/outputs/grafana-offline-auth-20261004/browser-callback-regression.json`
- `project/outputs/grafana-offline-auth-20261004/callback-rollout.json`
- `project/outputs/grafana-offline-auth-20261004/native-acceptance.json`

**project/outputs/grafana-rpc-diagnostics-20261003/** (10)

- `project/outputs/grafana-rpc-diagnostics-20261003/README.md`
- `project/outputs/grafana-rpc-diagnostics-20261003/after.json`
- `project/outputs/grafana-rpc-diagnostics-20261003/before.json`
- `project/outputs/grafana-rpc-diagnostics-20261003/https-acceptance.json`
- `project/outputs/grafana-rpc-diagnostics-20261003/image.json`
- `project/outputs/grafana-rpc-diagnostics-20261003/prior-discovery-evidence.json`
- `project/outputs/grafana-rpc-diagnostics-20261003/refresh-085616.json`
- `project/outputs/grafana-rpc-diagnostics-20261003/staged.json`
- `project/outputs/grafana-rpc-diagnostics-20261003/subscribe-085944.json`
- `project/outputs/grafana-rpc-diagnostics-20261003/tests.json`

**project/outputs/interval-anchor-20260915/** (12)

- `project/outputs/interval-anchor-20260915/configuration-verification.json`
- `project/outputs/interval-anchor-20260915/consumers-before.json`
- `project/outputs/interval-anchor-20260915/definition-comparison.json`
- `project/outputs/interval-anchor-20260915/dictionary-after-DB-Logic.png`
- `project/outputs/interval-anchor-20260915/dictionary-after-Dev-Differences.png`
- `project/outputs/interval-anchor-20260915/dictionary-after-Guide.png`
- `project/outputs/interval-anchor-20260915/dictionary-before.png`
- `project/outputs/interval-anchor-20260915/dictionary-changes.json`
- `project/outputs/interval-anchor-20260915/dictionary-error-scan.jsonl`
- `project/outputs/interval-anchor-20260915/expressions.json`
- `project/outputs/interval-anchor-20260915/fixture-closed-readback.txt`
- `project/outputs/interval-anchor-20260915/gui-test-sql-readback.txt`

**project/outputs/interval-promotion-20260915/** (18)

- `project/outputs/interval-promotion-20260915/configuration-verification.json`
- `project/outputs/interval-promotion-20260915/definition-comparison.json`
- `project/outputs/interval-promotion-20260915/dictionary-after-Column-Rules.png`
- `project/outputs/interval-promotion-20260915/dictionary-after-DB-Columns.png`
- `project/outputs/interval-promotion-20260915/dictionary-after-DB-Constraints.png`
- `project/outputs/interval-promotion-20260915/dictionary-after-Guide.png`
- `project/outputs/interval-promotion-20260915/dictionary-after-Prod-Columns.png`
- `project/outputs/interval-promotion-20260915/dictionary-before.png`
- `project/outputs/interval-promotion-20260915/dictionary-changes.json`
- `project/outputs/interval-promotion-20260915/dictionary-error-scan.jsonl`
- `project/outputs/interval-promotion-20260915/dictionary-preservation.json`
- `project/outputs/interval-promotion-20260915/migration.json`
- `project/outputs/interval-promotion-20260915/preflight.json`
- `project/outputs/interval-promotion-20260915/production-verification.json`
- `project/outputs/interval-promotion-20260915/restore-verification.json`
- `project/outputs/interval-promotion-20260915/schema-after.json`
- `project/outputs/interval-promotion-20260915/tested-release.json`
- `project/outputs/interval-promotion-20260915/validate.json`

**project/outputs/loan-duration-visibility-20260911/** (6)

- `project/outputs/loan-duration-visibility-20260911/AppSheet_Data_Dictionary.xlsx`
- `project/outputs/loan-duration-visibility-20260911/app-verification.json`
- `project/outputs/loan-duration-visibility-20260911/dictionary-after.png`
- `project/outputs/loan-duration-visibility-20260911/dictionary-before.png`
- `project/outputs/loan-duration-visibility-20260911/dictionary-verification.json`
- `project/outputs/loan-duration-visibility-20260911/xlsx-scope-verification.json`

**project/outputs/loan-ecosystem-20260916/** (24)

- `project/outputs/loan-ecosystem-20260916/logos/SOURCES.json`
- `project/outputs/loan-ecosystem-20260916/logos/appsheet.png`
- `project/outputs/loan-ecosystem-20260916/logos/azurebackup.svg`
- `project/outputs/loan-ecosystem-20260916/logos/cloudflare.svg`
- `project/outputs/loan-ecosystem-20260916/logos/debian.svg`
- `project/outputs/loan-ecosystem-20260916/logos/flyway.svg`
- `project/outputs/loan-ecosystem-20260916/logos/github.svg`
- `project/outputs/loan-ecosystem-20260916/logos/googlecloud.svg`
- `project/outputs/loan-ecosystem-20260916/logos/googlecloudstorage.svg`
- `project/outputs/loan-ecosystem-20260916/logos/googledrive.svg`
- `project/outputs/loan-ecosystem-20260916/logos/googlesheets.svg`
- `project/outputs/loan-ecosystem-20260916/logos/googlesites.png`
- `project/outputs/loan-ecosystem-20260916/logos/grafana.svg`
- `project/outputs/loan-ecosystem-20260916/logos/instagram.svg`
- `project/outputs/loan-ecosystem-20260916/logos/looker.svg`
- `project/outputs/loan-ecosystem-20260916/logos/metabase.svg`
- `project/outputs/loan-ecosystem-20260916/logos/microsoftazure.svg`
- `project/outputs/loan-ecosystem-20260916/logos/microsoftoutlook.svg`
- `project/outputs/loan-ecosystem-20260916/logos/openai.svg`
- `project/outputs/loan-ecosystem-20260916/logos/postgresql.svg`
- `project/outputs/loan-ecosystem-20260916/logos/railway.svg`
- `project/outputs/loan-ecosystem-20260916/logos/sqlite.svg`
- `project/outputs/loan-ecosystem-20260916/logos/tailscale.svg`
- `project/outputs/loan-ecosystem-20260916/logos/windows.svg`

**project/outputs/loan-ecosystem-20261004/** (6)

- `project/outputs/loan-ecosystem-20261004/README.md`
- `project/outputs/loan-ecosystem-20261004/page-1.png`
- `project/outputs/loan-ecosystem-20261004/page-2.png`
- `project/outputs/loan-ecosystem-20261004/page-3.png`
- `project/outputs/loan-ecosystem-20261004/source-checks.json`
- `project/outputs/loan-ecosystem-20261004/validation.json`

**project/outputs/lumpsum-db-20260915/** (41)

- `project/outputs/lumpsum-db-20260915/REPORT.md`
- `project/outputs/lumpsum-db-20260915/after-original-fingerprints.jsonl`
- `project/outputs/lumpsum-db-20260915/after-partial-results.jsonl`
- `project/outputs/lumpsum-db-20260915/app-routing-verification.json`
- `project/outputs/lumpsum-db-20260915/baseline-results.jsonl`
- `project/outputs/lumpsum-db-20260915/baseline-server.json`
- `project/outputs/lumpsum-db-20260915/before-fingerprints.jsonl`
- `project/outputs/lumpsum-db-20260915/bot-isolation-verification.json`
- `project/outputs/lumpsum-db-20260915/checkpoint-results.jsonl`
- `project/outputs/lumpsum-db-20260915/consumer-definitions.json`
- `project/outputs/lumpsum-db-20260915/development-migrate-v3.json`
- `project/outputs/lumpsum-db-20260915/development-migrate.json`
- `project/outputs/lumpsum-db-20260915/development-validate-v3.json`
- `project/outputs/lumpsum-db-20260915/development-validate.json`
- `project/outputs/lumpsum-db-20260915/dictionary-App-Settings.png`
- `project/outputs/lumpsum-db-20260915/dictionary-DB-Logic.png`
- `project/outputs/lumpsum-db-20260915/dictionary-Dev-Differences.png`
- `project/outputs/lumpsum-db-20260915/dictionary-Guide.png`
- `project/outputs/lumpsum-db-20260915/dictionary-additions.json`
- `project/outputs/lumpsum-db-20260915/dictionary-before.png`
- `project/outputs/lumpsum-db-20260915/dictionary-error-scan.jsonl`
- `project/outputs/lumpsum-db-20260915/dictionary-native-verification.json`
- `project/outputs/lumpsum-db-20260915/dictionary-verification.json`
- `project/outputs/lumpsum-db-20260915/final-results.jsonl`
- `project/outputs/lumpsum-db-20260915/local-regression-final.txt`
- `project/outputs/lumpsum-db-20260915/local-regression-v3.txt`
- `project/outputs/lumpsum-db-20260915/local-regression.txt`
- `project/outputs/lumpsum-db-20260915/navigation-verification.json`
- `project/outputs/lumpsum-db-20260915/schema-verification.json`
- `project/outputs/lumpsum-db-20260915/server-results.json`
- `project/outputs/lumpsum-db-20260915/staged-migration-verification.json`
- `project/outputs/lumpsum-db-20260915/ui-closure.txt`
- `project/outputs/lumpsum-db-20260915/ui-legacy-partial.txt`
- `project/outputs/lumpsum-db-20260915/ui-metadata-edit.txt`
- `project/outputs/lumpsum-db-20260915/ui-olap-borrower.txt`
- `project/outputs/lumpsum-db-20260915/ui-olap-closed-loan.txt`
- `project/outputs/lumpsum-db-20260915/ui-olap-repayment.txt`
- `project/outputs/lumpsum-db-20260915/ui-partial-receipt.txt`
- `project/outputs/lumpsum-db-20260915/ui-timings.json`
- `project/outputs/lumpsum-db-20260915/ui-validation.json`
- `project/outputs/lumpsum-db-20260915/verification.json`

**project/outputs/lumpsum-promotion-20260915/** (26)

- `project/outputs/lumpsum-promotion-20260915/REPORT.md`
- `project/outputs/lumpsum-promotion-20260915/action-expressions.json`
- `project/outputs/lumpsum-promotion-20260915/backup-verification.json`
- `project/outputs/lumpsum-promotion-20260915/dev-expression-verification.json`
- `project/outputs/lumpsum-promotion-20260915/development-validate.json`
- `project/outputs/lumpsum-promotion-20260915/dictionary-before.png`
- `project/outputs/lumpsum-promotion-20260915/dictionary-changes-development.json`
- `project/outputs/lumpsum-promotion-20260915/dictionary-changes-production.json`
- `project/outputs/lumpsum-promotion-20260915/dictionary-development-App-Settings.png`
- `project/outputs/lumpsum-promotion-20260915/dictionary-development-DB-Logic.png`
- `project/outputs/lumpsum-promotion-20260915/dictionary-development-Dev-Differences.png`
- `project/outputs/lumpsum-promotion-20260915/dictionary-development-Guide.png`
- `project/outputs/lumpsum-promotion-20260915/dictionary-error-scan-development.jsonl`
- `project/outputs/lumpsum-promotion-20260915/dictionary-error-scan-production.jsonl`
- `project/outputs/lumpsum-promotion-20260915/dictionary-native-verification-development.json`
- `project/outputs/lumpsum-promotion-20260915/dictionary-native-verification-production.json`
- `project/outputs/lumpsum-promotion-20260915/dictionary-production-App-Settings.png`
- `project/outputs/lumpsum-promotion-20260915/dictionary-production-DB-Logic.png`
- `project/outputs/lumpsum-promotion-20260915/dictionary-production-Dev-Differences.png`
- `project/outputs/lumpsum-promotion-20260915/dictionary-production-Guide.png`
- `project/outputs/lumpsum-promotion-20260915/local-v4-regression.txt`
- `project/outputs/lumpsum-promotion-20260915/original-data-after-v4.jsonl`
- `project/outputs/lumpsum-promotion-20260915/production-migrate.json`
- `project/outputs/lumpsum-promotion-20260915/production-validate.json`
- `project/outputs/lumpsum-promotion-20260915/production-verification.json`
- `project/outputs/lumpsum-promotion-20260915/release-manifest.json`

**project/outputs/metabase-poc-20260922/** (1)

- `project/outputs/metabase-poc-20260922/query-reconciliation.json`

**project/outputs/monitored-jobs-20260915/** (27)

- `project/outputs/monitored-jobs-20260915/REPORT.md`
- `project/outputs/monitored-jobs-20260915/analytics-bot-first.jsonl`
- `project/outputs/monitored-jobs-20260915/analytics-full.jsonl`
- `project/outputs/monitored-jobs-20260915/analytics-recent.jsonl`
- `project/outputs/monitored-jobs-20260915/charge-fixtures-before.jsonl`
- `project/outputs/monitored-jobs-20260915/charge-fixtures-final.jsonl`
- `project/outputs/monitored-jobs-20260915/charge-fixtures-fixed.jsonl`
- `project/outputs/monitored-jobs-20260915/charge-test-corrected.jsonl`
- `project/outputs/monitored-jobs-20260915/charge-test-first.jsonl`
- `project/outputs/monitored-jobs-20260915/cron-paused.jsonl`
- `project/outputs/monitored-jobs-20260915/database-before.jsonl`
- `project/outputs/monitored-jobs-20260915/dictionary-acceptance.json`
- `project/outputs/monitored-jobs-20260915/dictionary-after-DB-Logic.png`
- `project/outputs/monitored-jobs-20260915/dictionary-after-Dev-Differences.png`
- `project/outputs/monitored-jobs-20260915/dictionary-after-Guide.png`
- `project/outputs/monitored-jobs-20260915/dictionary-before.png`
- `project/outputs/monitored-jobs-20260915/dictionary-changes.json`
- `project/outputs/monitored-jobs-20260915/dictionary-error-scan.jsonl`
- `project/outputs/monitored-jobs-20260915/dictionary-native-features.json`
- `project/outputs/monitored-jobs-20260915/flyway-migrate.json`
- `project/outputs/monitored-jobs-20260915/flyway-validate.json`
- `project/outputs/monitored-jobs-20260915/model-evidence.json`
- `project/outputs/monitored-jobs-20260915/natural-daily.jsonl`
- `project/outputs/monitored-jobs-20260915/natural-hourly.jsonl`
- `project/outputs/monitored-jobs-20260915/natural-monitor.json`
- `project/outputs/monitored-jobs-20260915/original-record-preservation.json`
- `project/outputs/monitored-jobs-20260915/reconciliation.jsonl`

**project/outputs/monitored-jobs-production-20260916/** (16)

- `project/outputs/monitored-jobs-production-20260916/REPORT.md`
- `project/outputs/monitored-jobs-production-20260916/analytics-reconciliation.json`
- `project/outputs/monitored-jobs-production-20260916/cron-paused.jsonl`
- `project/outputs/monitored-jobs-production-20260916/dictionary-after-Guide.png`
- `project/outputs/monitored-jobs-production-20260916/dictionary-after-Prod-Columns.png`
- `project/outputs/monitored-jobs-production-20260916/dictionary-after-Prod-Tables.png`
- `project/outputs/monitored-jobs-production-20260916/dictionary-changes.json`
- `project/outputs/monitored-jobs-production-20260916/dictionary-error-scan.jsonl`
- `project/outputs/monitored-jobs-production-20260916/flyway-migrate.json`
- `project/outputs/monitored-jobs-production-20260916/flyway-validate.json`
- `project/outputs/monitored-jobs-production-20260916/model-evidence.json`
- `project/outputs/monitored-jobs-production-20260916/monitor-evidence.json`
- `project/outputs/monitored-jobs-production-20260916/production-audit-after-appsheet.txt`
- `project/outputs/monitored-jobs-production-20260916/production-audit-final.txt`
- `project/outputs/monitored-jobs-production-20260916/regression-evidence.json`
- `project/outputs/monitored-jobs-production-20260916/restore-verification.json`

**project/outputs/olap-daily-installment-2026-09-01/** (26)

- `project/outputs/olap-daily-installment-2026-09-01/AppSheet_Data_Dictionary.xlsx`
- `project/outputs/olap-daily-installment-2026-09-01/render-after/00-contact-sheet.png`
- `project/outputs/olap-daily-installment-2026-09-01/render-after/01-README.png`
- `project/outputs/olap-daily-installment-2026-09-01/render-after/02-Tables.png`
- `project/outputs/olap-daily-installment-2026-09-01/render-after/03-Columns.png`
- `project/outputs/olap-daily-installment-2026-09-01/render-after/04-Relationships.png`
- `project/outputs/olap-daily-installment-2026-09-01/render-after/05-Slices.png`
- `project/outputs/olap-daily-installment-2026-09-01/render-after/06-Slice_Columns.png`
- `project/outputs/olap-daily-installment-2026-09-01/render-after/07-App_Variances.png`
- `project/outputs/olap-daily-installment-2026-09-01/render-after/08-Change_Log.png`
- `project/outputs/olap-daily-installment-2026-09-01/render-before/00-contact-sheet.png`
- `project/outputs/olap-daily-installment-2026-09-01/render-before/01-README.png`
- `project/outputs/olap-daily-installment-2026-09-01/render-before/02-Tables.png`
- `project/outputs/olap-daily-installment-2026-09-01/render-before/03-Columns.png`
- `project/outputs/olap-daily-installment-2026-09-01/render-before/04-Relationships.png`
- `project/outputs/olap-daily-installment-2026-09-01/render-before/05-Slices.png`
- `project/outputs/olap-daily-installment-2026-09-01/render-before/06-Slice_Columns.png`
- `project/outputs/olap-daily-installment-2026-09-01/render-before/07-App_Variances.png`
- `project/outputs/olap-daily-installment-2026-09-01/render-before/08-Change_Log.png`
- `project/outputs/olap-daily-installment-2026-09-01/render-focus/01-Controls.png`
- `project/outputs/olap-daily-installment-2026-09-01/render-focus/02-Tables.png`
- `project/outputs/olap-daily-installment-2026-09-01/render-focus/03-Columns_Focus.png`
- `project/outputs/olap-daily-installment-2026-09-01/render-focus/04-Slices_Focus.png`
- `project/outputs/olap-daily-installment-2026-09-01/render-focus/05-Slice_Columns_Focus.png`
- `project/outputs/olap-daily-installment-2026-09-01/render-focus/06-Variances_Focus.png`
- `project/outputs/olap-daily-installment-2026-09-01/update_dictionary.py`

**project/outputs/olap-reconciliation-20260907/** (8)

- `project/outputs/olap-reconciliation-20260907/AppSheet_Data_Dictionary.xlsx`
- `project/outputs/olap-reconciliation-20260907/columns.png`
- `project/outputs/olap-reconciliation-20260907/dictionary.before.xlsx`
- `project/outputs/olap-reconciliation-20260907/overview.before.md`
- `project/outputs/olap-reconciliation-20260907/readme.png`
- `project/outputs/olap-reconciliation-20260907/tables.png`
- `project/outputs/olap-reconciliation-20260907/update_dictionary.mjs`
- `project/outputs/olap-reconciliation-20260907/verification.json`

**project/outputs/oltp-combined-performance-20260913/** (10)

- `project/outputs/oltp-combined-performance-20260913/COMBINED_PERFORMANCE_REPORT.md`
- `project/outputs/oltp-combined-performance-20260913/benchmark-summary.json`
- `project/outputs/oltp-combined-performance-20260913/dictionary-after.png`
- `project/outputs/oltp-combined-performance-20260913/dictionary-before.png`
- `project/outputs/oltp-combined-performance-20260913/dictionary-final-state.png`
- `project/outputs/oltp-combined-performance-20260913/dictionary-verification.json`
- `project/outputs/oltp-combined-performance-20260913/lab-config.json`
- `project/outputs/oltp-combined-performance-20260913/live-receipt-validation.json`
- `project/outputs/oltp-combined-performance-20260913/logic-validation.json`
- `project/outputs/oltp-combined-performance-20260913/receipt-timings.csv`

**project/outputs/oltp-performance-lab-20260912/** (11)

- `project/outputs/oltp-performance-lab-20260912/MATERIALIZED_BALANCE_TEST_PROPOSAL.md`
- `project/outputs/oltp-performance-lab-20260912/PERFORMANCE_TEST_REPORT.md`
- `project/outputs/oltp-performance-lab-20260912/benchmark-summary.json`
- `project/outputs/oltp-performance-lab-20260912/dictionary-after.png`
- `project/outputs/oltp-performance-lab-20260912/dictionary-before.png`
- `project/outputs/oltp-performance-lab-20260912/dictionary-final-state.png`
- `project/outputs/oltp-performance-lab-20260912/dictionary-verification.json`
- `project/outputs/oltp-performance-lab-20260912/lab-config.json`
- `project/outputs/oltp-performance-lab-20260912/new-gui-receipt-timings.csv`
- `project/outputs/oltp-performance-lab-20260912/receipt-timings.csv`
- `project/outputs/oltp-performance-lab-20260912/sync-timings.csv`

**project/outputs/oltp-process-diagram-20260912/** (3)

- `project/outputs/oltp-process-diagram-20260912/page-1.png`
- `project/outputs/oltp-process-diagram-20260912/page-2.png`
- `project/outputs/oltp-process-diagram-20260912/page-3.png`

**project/outputs/oltp-todays-payment-2026-09-04/** (21)

- `project/outputs/oltp-todays-payment-2026-09-04/AppSheet_Data_Dictionary.before.xlsx`
- `project/outputs/oltp-todays-payment-2026-09-04/AppSheet_Data_Dictionary.xlsx`
- `project/outputs/oltp-todays-payment-2026-09-04/count_dictionary.mjs`
- `project/outputs/oltp-todays-payment-2026-09-04/inspect_dictionary.mjs`
- `project/outputs/oltp-todays-payment-2026-09-04/inspect_styles.mjs`
- `project/outputs/oltp-todays-payment-2026-09-04/inspect_targets.mjs`
- `project/outputs/oltp-todays-payment-2026-09-04/polish_dictionary.mjs`
- `project/outputs/oltp-todays-payment-2026-09-04/previews-after/App-Variances.png`
- `project/outputs/oltp-todays-payment-2026-09-04/previews-after/Columns-Borrowers.png`
- `project/outputs/oltp-todays-payment-2026-09-04/previews-after/Columns-Charges.png`
- `project/outputs/oltp-todays-payment-2026-09-04/previews-after/Columns-Repayments.png`
- `project/outputs/oltp-todays-payment-2026-09-04/previews-after/README.png`
- `project/outputs/oltp-todays-payment-2026-09-04/previews-after/Tables.png`
- `project/outputs/oltp-todays-payment-2026-09-04/previews-before/App-Variances.png`
- `project/outputs/oltp-todays-payment-2026-09-04/previews-before/Columns-Borrowers.png`
- `project/outputs/oltp-todays-payment-2026-09-04/previews-before/Columns-Charges.png`
- `project/outputs/oltp-todays-payment-2026-09-04/previews-before/Columns-Repayments.png`
- `project/outputs/oltp-todays-payment-2026-09-04/previews-before/README.png`
- `project/outputs/oltp-todays-payment-2026-09-04/previews-before/Tables.png`
- `project/outputs/oltp-todays-payment-2026-09-04/update_dictionary.mjs`
- `project/outputs/oltp-todays-payment-2026-09-04/verify_dictionary.mjs`

**project/outputs/partner-borrower-setup-20260913/** (10)

- `project/outputs/partner-borrower-setup-20260913/after-Columns.png`
- `project/outputs/partner-borrower-setup-20260913/after-Tables.png`
- `project/outputs/partner-borrower-setup-20260913/before-Columns.png`
- `project/outputs/partner-borrower-setup-20260913/before-Tables.png`
- `project/outputs/partner-borrower-setup-20260913/language-enum-Columns.png`
- `project/outputs/partner-borrower-setup-20260913/language-enum-review.json`
- `project/outputs/partner-borrower-setup-20260913/olap-Columns.png`
- `project/outputs/partner-borrower-setup-20260913/olap-Slices.png`
- `project/outputs/partner-borrower-setup-20260913/olap-schema-review.json`
- `project/outputs/partner-borrower-setup-20260913/slice-columns.json`

**project/outputs/postgresql-migration-trial-20260914/** (79)

- `project/outputs/postgresql-migration-trial-20260914/FOREIGN_KEYS.md`
- `project/outputs/postgresql-migration-trial-20260914/MASTER_TABLE_MIGRATION.md`
- `project/outputs/postgresql-migration-trial-20260914/OLTP_LIFECYCLE_TEST_STATUS.md`
- `project/outputs/postgresql-migration-trial-20260914/OLTP_SQL_VALIDATION_REPORT.md`
- `project/outputs/postgresql-migration-trial-20260914/RESTART_CHECKLIST.md`
- `project/outputs/postgresql-migration-trial-20260914/RESTART_RESULT.md`
- `project/outputs/postgresql-migration-trial-20260914/STATISTICS_MANUAL_COPY.md`
- `project/outputs/postgresql-migration-trial-20260914/STATUS.md`
- `project/outputs/postgresql-migration-trial-20260914/appsheet-network-plan.json`
- `project/outputs/postgresql-migration-trial-20260914/bulk-app-verification.json`
- `project/outputs/postgresql-migration-trial-20260914/bulk-copy-executed.json`
- `project/outputs/postgresql-migration-trial-20260914/bulk-copy-plan.json`
- `project/outputs/postgresql-migration-trial-20260914/bulk-readback-verification.json`
- `project/outputs/postgresql-migration-trial-20260914/bulk-ui-validation.json`
- `project/outputs/postgresql-migration-trial-20260914/cleanup-verification.json`
- `project/outputs/postgresql-migration-trial-20260914/clone-column-comparison.json`
- `project/outputs/postgresql-migration-trial-20260914/dictionary-after.png`
- `project/outputs/postgresql-migration-trial-20260914/dictionary-before.png`
- `project/outputs/postgresql-migration-trial-20260914/dictionary-final-state.png`
- `project/outputs/postgresql-migration-trial-20260914/dictionary-verification.json`
- `project/outputs/postgresql-migration-trial-20260914/final-cleanup-ui.json`
- `project/outputs/postgresql-migration-trial-20260914/fk-after.json`
- `project/outputs/postgresql-migration-trial-20260914/fk-app-validation.json`
- `project/outputs/postgresql-migration-trial-20260914/fk-apply.sql`
- `project/outputs/postgresql-migration-trial-20260914/fk-before-fingerprints.json`
- `project/outputs/postgresql-migration-trial-20260914/fk-before.json`
- `project/outputs/postgresql-migration-trial-20260914/fk-catalog.sql`
- `project/outputs/postgresql-migration-trial-20260914/fk-fingerprint.sql`
- `project/outputs/postgresql-migration-trial-20260914/fk-plan.json`
- `project/outputs/postgresql-migration-trial-20260914/fk-postflight.json`
- `project/outputs/postgresql-migration-trial-20260914/fk-preflight.json`
- `project/outputs/postgresql-migration-trial-20260914/fk-preflight.sql`
- `project/outputs/postgresql-migration-trial-20260914/fk-rollback.sql`
- `project/outputs/postgresql-migration-trial-20260914/fk-test.sql`
- `project/outputs/postgresql-migration-trial-20260914/fk-ui-validation.json`
- `project/outputs/postgresql-migration-trial-20260914/fk-validation.json`
- `project/outputs/postgresql-migration-trial-20260914/full-app-verification.json`
- `project/outputs/postgresql-migration-trial-20260914/full-ui-validation.json`
- `project/outputs/postgresql-migration-trial-20260914/lab-config.json`
- `project/outputs/postgresql-migration-trial-20260914/lifecycle-reconciliation.json`
- `project/outputs/postgresql-migration-trial-20260914/loan-name-lookup-rollback.sql`
- `project/outputs/postgresql-migration-trial-20260914/loan-name-lookup-test.sql`
- `project/outputs/postgresql-migration-trial-20260914/loan-name-lookup.sql`
- `project/outputs/postgresql-migration-trial-20260914/native-lookup-inventory.json`
- `project/outputs/postgresql-migration-trial-20260914/oltp-native-source-verification.json`
- `project/outputs/postgresql-migration-trial-20260914/oltp-original-row-integrity.json`
- `project/outputs/postgresql-migration-trial-20260914/oltp-pg-config-verification.json`
- `project/outputs/postgresql-migration-trial-20260914/restart-copy-dialog.txt`
- `project/outputs/postgresql-migration-trial-20260914/restart-postgres-errors.txt`
- `project/outputs/postgresql-migration-trial-20260914/restart-row-counts.json`
- `project/outputs/postgresql-migration-trial-20260914/restart-source-bindings.json`
- `project/outputs/postgresql-migration-trial-20260914/statistics-manual-verification.json`
- `project/outputs/postgresql-migration-trial-20260914/tommy-all-final.json`
- `project/outputs/postgresql-migration-trial-20260914/tommy-borrower-created.json`
- `project/outputs/postgresql-migration-trial-20260914/tommy-cleanup.sql`
- `project/outputs/postgresql-migration-trial-20260914/tommy-d1-closed-i1-created.json`
- `project/outputs/postgresql-migration-trial-20260914/tommy-d1-first-day-settled.json`
- `project/outputs/postgresql-migration-trial-20260914/tommy-d1-first-day.json`
- `project/outputs/postgresql-migration-trial-20260914/tommy-d1-partial.json`
- `project/outputs/postgresql-migration-trial-20260914/tommy-d1-recovery.json`
- `project/outputs/postgresql-migration-trial-20260914/tommy-d1-today.json`
- `project/outputs/postgresql-migration-trial-20260914/tommy-d2-created.json`
- `project/outputs/postgresql-migration-trial-20260914/tommy-d2-default-ready.json`
- `project/outputs/postgresql-migration-trial-20260914/tommy-d2-defaulted.json`
- `project/outputs/postgresql-migration-trial-20260914/tommy-d2-final.json`
- `project/outputs/postgresql-migration-trial-20260914/tommy-f1-charge.json`
- `project/outputs/postgresql-migration-trial-20260914/tommy-f1-closed.json`
- `project/outputs/postgresql-migration-trial-20260914/tommy-f1-created.json`
- `project/outputs/postgresql-migration-trial-20260914/tommy-f1-final.json`
- `project/outputs/postgresql-migration-trial-20260914/tommy-f1-partial-posted.json`
- `project/outputs/postgresql-migration-trial-20260914/tommy-f1-partial.json`
- `project/outputs/postgresql-migration-trial-20260914/tommy-i1-closed.json`
- `project/outputs/postgresql-migration-trial-20260914/tommy-i1-receipt-start.json`
- `project/outputs/postgresql-migration-trial-20260914/tommy-i1-today.json`
- `project/outputs/postgresql-migration-trial-20260914/tommy-lump-posted.json`
- `project/outputs/postgresql-migration-trial-20260914/tommy-lump-start.json`
- `project/outputs/postgresql-migration-trial-20260914/tommy-multi-created.json`
- `project/outputs/postgresql-migration-trial-20260914/tommy-receive-all-processing.json`
- `project/outputs/postgresql-migration-trial-20260914/tommy-receive-all-start.json`

**project/outputs/postgresql-production-cutover-20260915/** (10)

- `project/outputs/postgresql-production-cutover-20260915/analytics-refresh-verification.json`
- `project/outputs/postgresql-production-cutover-20260915/cutover-verification.json`
- `project/outputs/postgresql-production-cutover-20260915/daily-charge-verification.json`
- `project/outputs/postgresql-production-cutover-20260915/dictionary-after.png`
- `project/outputs/postgresql-production-cutover-20260915/dictionary-before.png`
- `project/outputs/postgresql-production-cutover-20260915/dictionary-final-state.png`
- `project/outputs/postgresql-production-cutover-20260915/dictionary-verification.json`
- `project/outputs/postgresql-production-cutover-20260915/lab-config.json`
- `project/outputs/postgresql-production-cutover-20260915/runtime-checks.json`
- `project/outputs/postgresql-production-cutover-20260915/source-sql-before.json`

**project/outputs/postgresql-sync-settings-20260915/** (1)

- `project/outputs/postgresql-sync-settings-20260915/verification.json`

**project/outputs/projected-monthly-profit-analysis/** (1)

- `project/outputs/projected-monthly-profit-analysis/dictionary-after.png`

**project/outputs/promotion-checklist-review-20260920/** (1)

- `project/outputs/promotion-checklist-review-20260920/README.md`

**project/outputs/r002-20260916/** (24)

- `project/outputs/r002-20260916/PROMOTION_CHECKLIST.md`
- `project/outputs/r002-20260916/app-configuration.json`
- `project/outputs/r002-20260916/backup-verification.json`
- `project/outputs/r002-20260916/collection-ref-correction.json`
- `project/outputs/r002-20260916/dev-context.json`
- `project/outputs/r002-20260916/dev-migration-v18.json`
- `project/outputs/r002-20260916/dev-migration.json`
- `project/outputs/r002-20260916/dev-validation-v18.json`
- `project/outputs/r002-20260916/dev-validation.json`
- `project/outputs/r002-20260916/dictionary-after.png`
- `project/outputs/r002-20260916/dictionary-before.png`
- `project/outputs/r002-20260916/dictionary-collection-link.png`
- `project/outputs/r002-20260916/dictionary-error-scan.jsonl`
- `project/outputs/r002-20260916/dictionary-native-ref.png`
- `project/outputs/r002-20260916/dictionary-production-correction.png`
- `project/outputs/r002-20260916/dictionary-refinement.png`
- `project/outputs/r002-20260916/dictionary-verification.json`
- `project/outputs/r002-20260916/migration-manifest.json`
- `project/outputs/r002-20260916/production-backup-restore.json`
- `project/outputs/r002-20260916/production-backup.json`
- `project/outputs/r002-20260916/refinement-verification.json`
- `project/outputs/r002-20260916/release-manifest-f3a0d66.json`
- `project/outputs/r002-20260916/sql-tests-v18.txt`
- `project/outputs/r002-20260916/sql-tests.txt`

**project/outputs/r002-production-20260916/** (9)

- `project/outputs/r002-production-20260916/REPORT.md`
- `project/outputs/r002-production-20260916/appsheet-promotion.json`
- `project/outputs/r002-production-20260916/collection-correction.json`
- `project/outputs/r002-production-20260916/dictionary-error-scan.jsonl`
- `project/outputs/r002-production-20260916/dictionary-production.png`
- `project/outputs/r002-production-20260916/dictionary-verification.json`
- `project/outputs/r002-production-20260916/full-migration-tests.txt`
- `project/outputs/r002-production-20260916/production-sql-promotion.json`
- `project/outputs/r002-production-20260916/r002-tests.txt`

**project/outputs/r003-production-appsheet-reconciliation-20260916/** (5)

- `project/outputs/r003-production-appsheet-reconciliation-20260916/REPORT.md`
- `project/outputs/r003-production-appsheet-reconciliation-20260916/dictionary-app-settings.png`
- `project/outputs/r003-production-appsheet-reconciliation-20260916/dictionary-error-scan.jsonl`
- `project/outputs/r003-production-appsheet-reconciliation-20260916/dictionary-r003-status.png`
- `project/outputs/r003-production-appsheet-reconciliation-20260916/dictionary-verification.json`

**project/outputs/r004-20260917/** (8)

- `project/outputs/r004-20260917/category-valid-if.txt`
- `project/outputs/r004-20260917/definition-diff.json`
- `project/outputs/r004-20260917/dictionary-after.png`
- `project/outputs/r004-20260917/dictionary-before.png`
- `project/outputs/r004-20260917/dictionary-error-scan.jsonl`
- `project/outputs/r004-20260917/dictionary-verification.json`
- `project/outputs/r004-20260917/frozen-manifest.json`
- `project/outputs/r004-20260917/production-sql-verification.json`

**project/outputs/r006-20260918/** (25)

- `project/outputs/r006-20260918/DESIGN.md`
- `project/outputs/r006-20260918/DEV_REPORT.md`
- `project/outputs/r006-20260918/benchmark.json`
- `project/outputs/r006-20260918/checklist-r1.md`
- `project/outputs/r006-20260918/dev-comparison-r1.json`
- `project/outputs/r006-20260918/dev-readback-r1.json`
- `project/outputs/r006-20260918/dictionary-after-1.png`
- `project/outputs/r006-20260918/dictionary-after-2.png`
- `project/outputs/r006-20260918/dictionary-after-3.png`
- `project/outputs/r006-20260918/dictionary-after-4.png`
- `project/outputs/r006-20260918/dictionary-before.png`
- `project/outputs/r006-20260918/dictionary-error-scan.jsonl`
- `project/outputs/r006-20260918/dictionary-promoted-1.png`
- `project/outputs/r006-20260918/dictionary-promoted-2.png`
- `project/outputs/r006-20260918/dictionary-promoted-3.png`
- `project/outputs/r006-20260918/dictionary-promoted-4.png`
- `project/outputs/r006-20260918/dictionary-promotion-error-scan.jsonl`
- `project/outputs/r006-20260918/dictionary-promotion-verification.json`
- `project/outputs/r006-20260918/dictionary-verification.json`
- `project/outputs/r006-20260918/fixture-readback.jsonl`
- `project/outputs/r006-20260918/prod-comparison-r1.json`
- `project/outputs/r006-20260918/prod-readback-r1.json`
- `project/outputs/r006-20260918/prod-saved-observations.json`
- `project/outputs/r006-20260918/release-delta.json`
- `project/outputs/r006-20260918/saved-editor-observations.json`

**project/outputs/r007-20260918/** (37)

- `project/outputs/r007-20260918/AppSheet_Data_Dictionary.xlsx`
- `project/outputs/r007-20260918/FROZEN.md`
- `project/outputs/r007-20260918/REPORT.md`
- `project/outputs/r007-20260918/after-parity.json`
- `project/outputs/r007-20260918/before-contract.json`
- `project/outputs/r007-20260918/candidate-parity.json`
- `project/outputs/r007-20260918/dev-comparison-r1.json`
- `project/outputs/r007-20260918/dev-query-plan-summary.json`
- `project/outputs/r007-20260918/dev-readback-r1.json`
- `project/outputs/r007-20260918/dictionary-after-1.png`
- `project/outputs/r007-20260918/dictionary-after-2.png`
- `project/outputs/r007-20260918/dictionary-after-3.png`
- `project/outputs/r007-20260918/dictionary-before.png`
- `project/outputs/r007-20260918/dictionary-promotion-verification.json`
- `project/outputs/r007-20260918/dictionary-promotion.png`
- `project/outputs/r007-20260918/dictionary-verification.json`
- `project/outputs/r007-20260918/flyway-manifest-r1.json`
- `project/outputs/r007-20260918/navigation-after.json`
- `project/outputs/r007-20260918/navigation-before.json`
- `project/outputs/r007-20260918/olap-diagnostics.json`
- `project/outputs/r007-20260918/oltp-diagnostics.json`
- `project/outputs/r007-20260918/post-refresh-check.json`
- `project/outputs/r007-20260918/preservation-and-refresh.json`
- `project/outputs/r007-20260918/prod-comparison-r1.json`
- `project/outputs/r007-20260918/prod-diagnostics.json`
- `project/outputs/r007-20260918/prod-readback-r1.json`
- `project/outputs/r007-20260918/prod-runtime-smoke.json`
- `project/outputs/r007-20260918/production-backup.json`
- `project/outputs/r007-20260918/production-migration.json`
- `project/outputs/r007-20260918/production-sql-summary.json`
- `project/outputs/r007-20260918/promotion-documentation-checklist.md`
- `project/outputs/r007-20260918/release-delta.json`
- `project/outputs/r007-20260918/snapshot-reconciliation.json`
- `project/outputs/r007-20260918/source-readbacks.json`
- `project/outputs/r007-20260918/sql-dev-parity.json`
- `project/outputs/r007-20260918/sync-after.json`
- `project/outputs/r007-20260918/sync-before.json`

**project/outputs/r008-20260918/** (78)

- `project/outputs/r008-20260918/FROZEN.md`
- `project/outputs/r008-20260918/REPORT.md`
- `project/outputs/r008-20260918/appsheet-edit-record.md`
- `project/outputs/r008-20260918/checklist-r1.md`
- `project/outputs/r008-20260918/dev-appdoc-readback.json`
- `project/outputs/r008-20260918/dev-bots-readback.json`
- `project/outputs/r008-20260918/dev-comparison-r1.json`
- `project/outputs/r008-20260918/dev-saved-observations.json`
- `project/outputs/r008-20260918/dev-synthetic-sql-readback.txt`
- `project/outputs/r008-20260918/dictionary-after-1.png`
- `project/outputs/r008-20260918/dictionary-after-2.png`
- `project/outputs/r008-20260918/dictionary-after-3.png`
- `project/outputs/r008-20260918/dictionary-before.png`
- `project/outputs/r008-20260918/dictionary-verification.json`
- `project/outputs/r008-20260918/flyway-manifest-r1.json`
- `project/outputs/r008-20260918/prod-recipient-baseline.json`
- `project/outputs/r008-20260918/production-correction/REPORT.md`
- `project/outputs/r008-20260918/production-correction/appdoc-comparison.json`
- `project/outputs/r008-20260918/production-correction/dictionary-R008-Production-A1-G7.png`
- `project/outputs/r008-20260918/production-correction/dictionary-R008-Production-A194-G200.png`
- `project/outputs/r008-20260918/production-correction/dictionary-error-scan.jsonl`
- `project/outputs/r008-20260918/production-correction/editor-and-runtime-evidence.json`
- `project/outputs/r008-20260918/production/AppSheet_Data_Dictionary.xlsx`
- `project/outputs/r008-20260918/production/REPORT.md`
- `project/outputs/r008-20260918/production/appsheet-observations.json`
- `project/outputs/r008-20260918/production/backup-after-verification.json`
- `project/outputs/r008-20260918/production/backup-before-verification.json`
- `project/outputs/r008-20260918/production/dictionary-Dev-Differences-A2769-E2769.png`
- `project/outputs/r008-20260918/production/dictionary-Guide-A3-C23.png`
- `project/outputs/r008-20260918/production/dictionary-R008-Production-A1-G6.png`
- `project/outputs/r008-20260918/production/dictionary-R008-Production-A197-G200.png`
- `project/outputs/r008-20260918/production/dictionary-error-scan.jsonl`
- `project/outputs/r008-20260918/production/dictionary-verification.json`
- `project/outputs/r008-20260918/production/documentation-checklist.md`
- `project/outputs/r008-20260918/production/sql-readback.json`
- `project/outputs/r008-20260918/r2/FROZEN.md`
- `project/outputs/r008-20260918/r2/REPORT.md`
- `project/outputs/r008-20260918/r2/checklist.md`
- `project/outputs/r008-20260918/r2/dev-comparison.json`
- `project/outputs/r008-20260918/r2/dev-saved-observations.json`
- `project/outputs/r008-20260918/r2/dictionary-after-1.png`
- `project/outputs/r008-20260918/r2/dictionary-after-2.png`
- `project/outputs/r008-20260918/r2/dictionary-after-3.png`
- `project/outputs/r008-20260918/r2/dictionary-before.png`
- `project/outputs/r008-20260918/r2/dictionary-verification.json`
- `project/outputs/r008-20260918/r2/release-delta.json`
- `project/outputs/r008-20260918/r2/saved-sync-repair.json`
- `project/outputs/r008-20260918/r2/sync-test-evidence.json`
- `project/outputs/r008-20260918/r3/FROZEN.md`
- `project/outputs/r008-20260918/r3/REPORT.md`
- `project/outputs/r008-20260918/r3/checklist.md`
- `project/outputs/r008-20260918/r3/dev-comparison.json`
- `project/outputs/r008-20260918/r3/dev-saved-observations.json`
- `project/outputs/r008-20260918/r3/release-delta.json`
- `project/outputs/r008-20260918/r3/saved-action.json`
- `project/outputs/r008-20260918/r4/AA.json`
- `project/outputs/r008-20260918/r4/AT.json`
- `project/outputs/r008-20260918/r4/AUDIT_A.json`
- `project/outputs/r008-20260918/r4/AUDIT_T.json`
- `project/outputs/r008-20260918/r4/BA.json`
- `project/outputs/r008-20260918/r4/BT.json`
- `project/outputs/r008-20260918/r4/FROZEN.md`
- `project/outputs/r008-20260918/r4/GENERATED_ACTIONS_A.json`
- `project/outputs/r008-20260918/r4/GENERATED_ACTIONS_T.json`
- `project/outputs/r008-20260918/r4/RECEIVE_SAVED.json`
- `project/outputs/r008-20260918/r4/REPORT.md`
- `project/outputs/r008-20260918/r4/checklist.md`
- `project/outputs/r008-20260918/r4/dev-comparison.json`
- `project/outputs/r008-20260918/r4/dev-saved-observations.json`
- `project/outputs/r008-20260918/r4/dictionary-after-1.png`
- `project/outputs/r008-20260918/r4/dictionary-after-2.png`
- `project/outputs/r008-20260918/r4/dictionary-after-3.png`
- `project/outputs/r008-20260918/r4/dictionary-before.png`
- `project/outputs/r008-20260918/r4/dictionary-verification.json`
- `project/outputs/r008-20260918/r4/refinement-items.json`
- `project/outputs/r008-20260918/r4/release-delta.json`
- `project/outputs/r008-20260918/release-delta.json`
- `project/outputs/r008-20260918/saved-global_diagnostics.json`

**project/outputs/r009-20260919/** (22)

- `project/outputs/r009-20260919/EFFECTIVE_RATE_TESTS.md`
- `project/outputs/r009-20260919/IDENTITY_TESTS.md`
- `project/outputs/r009-20260919/TESTS.md`
- `project/outputs/r009-20260919/dictionary-effective-rate/after.png`
- `project/outputs/r009-20260919/dictionary-effective-rate/before.png`
- `project/outputs/r009-20260919/dictionary-effective-rate/error-scan.jsonl`
- `project/outputs/r009-20260919/dictionary-effective-rate/verification.json`
- `project/outputs/r009-20260919/dictionary/preview.png`
- `project/outputs/r009-20260919/dictionary/verification.json`
- `project/outputs/r009-20260919/effective-rate-sql-readback.json`
- `project/outputs/r009-20260919/identity-routing.json`
- `project/outputs/r009-20260919/identity-sql-readback.jsonl`
- `project/outputs/r009-20260919/production/REPORT.md`
- `project/outputs/r009-20260919/production/dictionary/after.png`
- `project/outputs/r009-20260919/production/dictionary/error-scan.jsonl`
- `project/outputs/r009-20260919/production/dictionary/login-columns.png`
- `project/outputs/r009-20260919/production/dictionary/verification.json`
- `project/outputs/r009-20260919/production/documentation-checklist.md`
- `project/outputs/r009-20260919/production/source-mapping-validation.json`
- `project/outputs/r009-20260919/recipient-mapping.json`
- `project/outputs/r009-20260919/release-manifest.json`
- `project/outputs/r009-20260919/sql-readback.jsonl`

**project/outputs/r010-20260919/** (26)

- `project/outputs/r010-20260919/REPORT.md`
- `project/outputs/r010-20260919/TESTS.md`
- `project/outputs/r010-20260919/cash-statement/GUI_TESTS.md`
- `project/outputs/r010-20260919/cash-statement/SQL_TESTS.md`
- `project/outputs/r010-20260919/cash-statement/ZERO_INITIALIZATION.md`
- `project/outputs/r010-20260919/cash-statement/appsheet-config.json`
- `project/outputs/r010-20260919/cash-statement/dictionary-rows.json`
- `project/outputs/r010-20260919/cash-statement/dictionary/after.png`
- `project/outputs/r010-20260919/cash-statement/dictionary/before.png`
- `project/outputs/r010-20260919/cash-statement/dictionary/verification.json`
- `project/outputs/r010-20260919/cash-statement/flyway-release.json`
- `project/outputs/r010-20260919/dev-saved-readback.json`
- `project/outputs/r010-20260919/dictionary-after.png`
- `project/outputs/r010-20260919/dictionary-update-inspect.ndjson`
- `project/outputs/r010-20260919/production/REPORT.md`
- `project/outputs/r010-20260919/production/dictionary/AppSheet_Data_Dictionary.xlsx`
- `project/outputs/r010-20260919/production/dictionary/after.png`
- `project/outputs/r010-20260919/production/dictionary/error-scan-summary.json`
- `project/outputs/r010-20260919/production/dictionary/error-scan.ndjson`
- `project/outputs/r010-20260919/production/dictionary/final-verification.json`
- `project/outputs/r010-20260919/production/dictionary/guide.png`
- `project/outputs/r010-20260919/production/dictionary/payment-rows.png`
- `project/outputs/r010-20260919/production/dictionary/verification.json`
- `project/outputs/r010-20260919/production/source-mapping-validation.json`
- `project/outputs/r010-20260919/promotion-checklist.md`
- `project/outputs/r010-20260919/release-manifest.json`

**project/outputs/r011-20260920/** (30)

- `project/outputs/r011-20260920/account-alias/dictionary-after.png`
- `project/outputs/r011-20260920/account-alias/dictionary-before.png`
- `project/outputs/r011-20260920/account-alias/dictionary-verification.json`
- `project/outputs/r011-20260920/account-alias/flyway-manifest.json`
- `project/outputs/r011-20260920/account-alias/receipt-continuation.md`
- `project/outputs/r011-20260920/account-alias/test-results.md`
- `project/outputs/r011-20260920/cash-ledger-recent/test-results.md`
- `project/outputs/r011-20260920/dictionary-labels/after.png`
- `project/outputs/r011-20260920/dictionary-labels/before.png`
- `project/outputs/r011-20260920/dictionary-labels/verification.json`
- `project/outputs/r011-20260920/dictionary-localization/after.png`
- `project/outputs/r011-20260920/dictionary-localization/before.png`
- `project/outputs/r011-20260920/dictionary-localization/error-scan.jsonl`
- `project/outputs/r011-20260920/dictionary-localization/verification.json`
- `project/outputs/r011-20260920/dictionary-production/app-settings.png`
- `project/outputs/r011-20260920/dictionary-production/closed-dev-differences.png`
- `project/outputs/r011-20260920/dictionary-production/prod-columns.png`
- `project/outputs/r011-20260920/dictionary-production/verification.json`
- `project/outputs/r011-20260920/dictionary/after.png`
- `project/outputs/r011-20260920/dictionary/before.png`
- `project/outputs/r011-20260920/dictionary/rows.json`
- `project/outputs/r011-20260920/dictionary/verification.json`
- `project/outputs/r011-20260920/flyway-manifest.json`
- `project/outputs/r011-20260920/localization/verification.json`
- `project/outputs/r011-20260920/production/REPORT.md`
- `project/outputs/r011-20260920/production/rc-retirement.md`
- `project/outputs/r011-20260920/production/source-mapping-validation.json`
- `project/outputs/r011-20260920/promotion-checklist.md`
- `project/outputs/r011-20260920/release-manifest.json`
- `project/outputs/r011-20260920/test-results.md`

**project/outputs/r013-20260921/** (9)

- `project/outputs/r013-20260921/dictionary-after.png`
- `project/outputs/r013-20260921/dictionary-promoted.png`
- `project/outputs/r013-20260921/dictionary-promotion-verification.json`
- `project/outputs/r013-20260921/dictionary-verification.json`
- `project/outputs/r013-20260921/flyway-manifest.json`
- `project/outputs/r013-20260921/production/REPORT.md`
- `project/outputs/r013-20260921/promotion-checklist.md`
- `project/outputs/r013-20260921/release-manifest.json`
- `project/outputs/r013-20260921/test-results.md`

**project/outputs/r014-20260921/** (31)

- `project/outputs/r014-20260921/REPORT.md`
- `project/outputs/r014-20260921/backup.json`
- `project/outputs/r014-20260921/dictionary-first.png`
- `project/outputs/r014-20260921/dictionary-last.png`
- `project/outputs/r014-20260921/dictionary-production-first.png`
- `project/outputs/r014-20260921/dictionary-production-reviewer.png`
- `project/outputs/r014-20260921/dictionary-production-verification.json`
- `project/outputs/r014-20260921/dictionary-refinements-first.png`
- `project/outputs/r014-20260921/dictionary-refinements-last.png`
- `project/outputs/r014-20260921/dictionary-refinements-verification.json`
- `project/outputs/r014-20260921/dictionary-reviewer-first.png`
- `project/outputs/r014-20260921/dictionary-reviewer-last.png`
- `project/outputs/r014-20260921/dictionary-reviewer-verification.json`
- `project/outputs/r014-20260921/dictionary-verification.json`
- `project/outputs/r014-20260921/flyway-release.json`
- `project/outputs/r014-20260921/inspect.sql`
- `project/outputs/r014-20260921/production-report.md`
- `project/outputs/r014-20260921/production-source-mapping.json`
- `project/outputs/r014-20260921/promotion-checklist.md`
- `project/outputs/r014-20260921/rc-retirement.md`
- `project/outputs/r014-20260921/refinements.json`
- `project/outputs/r014-20260921/release-manifest.json`
- `project/outputs/r014-20260921/reviewer-agent-read.json`
- `project/outputs/r014-20260921/reviewer-backup.json`
- `project/outputs/r014-20260921/reviewer-ci.txt`
- `project/outputs/r014-20260921/reviewer-dev-migrate.txt`
- `project/outputs/r014-20260921/reviewer-dev-validate.txt`
- `project/outputs/r014-20260921/reviewer-migration-test.txt`
- `project/outputs/r014-20260921/reviewer-report.md`
- `project/outputs/r014-20260921/verify-dashboard.sql`
- `project/outputs/r014-20260921/verify-settlement.sql`

**project/outputs/r015-20260922/** (15)

- `project/outputs/r015-20260922/dev-gui.json`
- `project/outputs/r015-20260922/development-backup.json`
- `project/outputs/r015-20260922/development-validation.json`
- `project/outputs/r015-20260922/dictionary-DB-Columns.png`
- `project/outputs/r015-20260922/dictionary-DB-Constraints.png`
- `project/outputs/r015-20260922/dictionary-DB-Logic.png`
- `project/outputs/r015-20260922/dictionary-additions.json`
- `project/outputs/r015-20260922/dictionary-verification.json`
- `project/outputs/r015-20260922/flyway-manifest.json`
- `project/outputs/r015-20260922/prod-gui.json`
- `project/outputs/r015-20260922/production-backup.json`
- `project/outputs/r015-20260922/production-report.md`
- `project/outputs/r015-20260922/production-sql.json`
- `project/outputs/r015-20260922/promotion-checklist.md`
- `project/outputs/r015-20260922/release-manifest.json`

**project/outputs/r016-20260922/** (71)

- `project/outputs/r016-20260922/browser-verification.json`
- `project/outputs/r016-20260922/cashflow-development.json`
- `project/outputs/r016-20260922/cashflow-grants.json`
- `project/outputs/r016-20260922/cashflow-plan.json`
- `project/outputs/r016-20260922/cashflow-state.json`
- `project/outputs/r016-20260922/cashflow-table-refinement.json`
- `project/outputs/r016-20260922/cashflow-verification.json`
- `project/outputs/r016-20260922/daily-snapshots/dictionary.json`
- `project/outputs/r016-20260922/examples-cleanup.json`
- `project/outputs/r016-20260922/grants-before.csv`
- `project/outputs/r016-20260922/growth-window-verification.json`
- `project/outputs/r016-20260922/income-arrow.json`
- `project/outputs/r016-20260922/income-asof-development.json`
- `project/outputs/r016-20260922/income-asof-grants.json`
- `project/outputs/r016-20260922/income-asof-performance.json`
- `project/outputs/r016-20260922/income-asof-production.json`
- `project/outputs/r016-20260922/income-backup.json`
- `project/outputs/r016-20260922/income-browser-verification.json`
- `project/outputs/r016-20260922/income-completion-backup.json`
- `project/outputs/r016-20260922/income-dashboard.json`
- `project/outputs/r016-20260922/income-db-views-development.json`
- `project/outputs/r016-20260922/income-db-views-grants.json`
- `project/outputs/r016-20260922/income-db-views-plan.json`
- `project/outputs/r016-20260922/income-db-views-production.json`
- `project/outputs/r016-20260922/income-db-views-switch-verification.json`
- `project/outputs/r016-20260922/income-db-views-switch.json`
- `project/outputs/r016-20260922/income-period-proposed-grants.sql`
- `project/outputs/r016-20260922/income-proposed-grants.sql`
- `project/outputs/r016-20260922/income-questions.json`
- `project/outputs/r016-20260922/income-refinement-backup.json`
- `project/outputs/r016-20260922/income-refinement-complete.json`
- `project/outputs/r016-20260922/income-state.json`
- `project/outputs/r016-20260922/manifest.json`
- `project/outputs/r016-20260922/model-questions.json`
- `project/outputs/r016-20260922/performance-redesign/DESIGN.md`
- `project/outputs/r016-20260922/performance-redesign/IMPLEMENTATION.md`
- `project/outputs/r016-20260922/performance-redesign/SCOPE_FREEZE.md`
- `project/outputs/r016-20260922/performance-redesign/SEVEN_DAY_TRENDS_DESIGN.md`
- `project/outputs/r016-20260922/performance-redesign/plan.json`
- `project/outputs/r016-20260922/performance-redesign/rolling-browser-verification.json`
- `project/outputs/r016-20260922/performance-redesign/rolling-package.json`
- `project/outputs/r016-20260922/performance-redesign/rolling-plan.json`
- `project/outputs/r016-20260922/performance-redesign/rolling-verification.json`
- `project/outputs/r016-20260922/performance-redesign/state.json`
- `project/outputs/r016-20260922/performance-redesign/verification.json`
- `project/outputs/r016-20260922/promotion-checklist.md`
- `project/outputs/r016-20260922/remaining-backup.json`
- `project/outputs/r016-20260922/remaining-browser-verification.json`
- `project/outputs/r016-20260922/remaining-completion-backup.json`
- `project/outputs/r016-20260922/remaining-filter-smoke.json`
- `project/outputs/r016-20260922/remaining-grants-rollback.sql`
- `project/outputs/r016-20260922/remaining-install-state.json`
- `project/outputs/r016-20260922/remaining-partner-assessment-access.json`
- `project/outputs/r016-20260922/remaining-partner-context-access.json`
- `project/outputs/r016-20260922/remaining-proposed-grants.json`
- `project/outputs/r016-20260922/remaining-requested-columns.json`
- `project/outputs/r016-20260922/remaining-source-access.json`
- `project/outputs/r016-20260922/resource-limits.json`
- `project/outputs/r016-20260922/scalar-hover-cleanup.json`
- `project/outputs/r016-20260922/semantic-relationships.json`
- `project/outputs/r016-20260922/statement-cleanup-inspection.json`
- `project/outputs/r016-20260922/statement-cleanup-plan.json`
- `project/outputs/r016-20260922/statement-cleanup/browser-verification.json`
- `project/outputs/r016-20260922/statement-cleanup/development-backup.json`
- `project/outputs/r016-20260922/statement-cleanup/development-verification.json`
- `project/outputs/r016-20260922/statement-cleanup/dictionary-validation.json`
- `project/outputs/r016-20260922/statement-cleanup/production-backup.json`
- `project/outputs/r016-20260922/statement-cleanup/production-verification.json`
- `project/outputs/r016-20260922/statement-cleanup/provider-columns.json`
- `project/outputs/r016-20260922/statement-cleanup/sql-promotion.json`
- `project/outputs/r016-20260922/statement-cleanup/tab-reorder.json`

**project/outputs/r017-20260924/** (6)

- `project/outputs/r017-20260924/browser-verification.json`
- `project/outputs/r017-20260924/manifest.json`
- `project/outputs/r017-20260924/plan.json`
- `project/outputs/r017-20260924/promotion-checklist.md`
- `project/outputs/r017-20260924/state.json`
- `project/outputs/r017-20260924/verification.json`

**project/outputs/r018-20260924/** (6)

- `project/outputs/r018-20260924/browser-verification.json`
- `project/outputs/r018-20260924/manifest.json`
- `project/outputs/r018-20260924/plan.json`
- `project/outputs/r018-20260924/promotion-checklist.md`
- `project/outputs/r018-20260924/state.json`
- `project/outputs/r018-20260924/verification.json`

**project/outputs/r019-20260924/** (6)

- `project/outputs/r019-20260924/browser-verification.json`
- `project/outputs/r019-20260924/manifest.json`
- `project/outputs/r019-20260924/plan.json`
- `project/outputs/r019-20260924/promotion-checklist.md`
- `project/outputs/r019-20260924/state.json`
- `project/outputs/r019-20260924/verification.json`

**project/outputs/r020-20260924/** (5)

- `project/outputs/r020-20260924/browser-verification.json`
- `project/outputs/r020-20260924/manifest.json`
- `project/outputs/r020-20260924/plan.json`
- `project/outputs/r020-20260924/promotion-checklist.md`
- `project/outputs/r020-20260924/verification.json`

**project/outputs/r021-20260924/** (9)

- `project/outputs/r021-20260924/browser-verification.json`
- `project/outputs/r021-20260924/installed.json`
- `project/outputs/r021-20260924/manifest.json`
- `project/outputs/r021-20260924/plan.json`
- `project/outputs/r021-20260924/preflight.json`
- `project/outputs/r021-20260924/promotion-checklist.md`
- `project/outputs/r021-20260924/specs.json`
- `project/outputs/r021-20260924/state.json`
- `project/outputs/r021-20260924/verification.json`

**project/outputs/r022-20260924/** (5)

- `project/outputs/r022-20260924/browser-verification.json`
- `project/outputs/r022-20260924/manifest.json`
- `project/outputs/r022-20260924/plan.json`
- `project/outputs/r022-20260924/promotion-checklist.md`
- `project/outputs/r022-20260924/verification.json`

**project/outputs/r023-20260924/** (5)

- `project/outputs/r023-20260924/browser-verification.json`
- `project/outputs/r023-20260924/manifest.json`
- `project/outputs/r023-20260924/plan.json`
- `project/outputs/r023-20260924/promotion-checklist.md`
- `project/outputs/r023-20260924/verification.json`

**project/outputs/r024-20260924/** (4)

- `project/outputs/r024-20260924/browser-verification.json`
- `project/outputs/r024-20260924/plan.json`
- `project/outputs/r024-20260924/promotion-checklist.md`
- `project/outputs/r024-20260924/verification.json`

**project/outputs/r025-20260924/** (6)

- `project/outputs/r025-20260924/browser-verification.json`
- `project/outputs/r025-20260924/cutover-dictionary-patch.json`
- `project/outputs/r025-20260924/dictionary-patch.json`
- `project/outputs/r025-20260924/dictionary-verification.json`
- `project/outputs/r025-20260924/manifest.json`
- `project/outputs/r025-20260924/top-card-dictionary-patch.json`

**project/outputs/r026-dictionary-fixes/** (1)

- `project/outputs/r026-dictionary-fixes/cron-guard-tests.json`

**project/outputs/r027-payment-health/** (17)

- `project/outputs/r027-payment-health/appsheet-cleanup.json`
- `project/outputs/r027-payment-health/browser-verification.json`
- `project/outputs/r027-payment-health/continuation.md`
- `project/outputs/r027-payment-health/dashboard-metadata.json`
- `project/outputs/r027-payment-health/database-ci.txt`
- `project/outputs/r027-payment-health/dev-before-info.json`
- `project/outputs/r027-payment-health/dev-migrate.json`
- `project/outputs/r027-payment-health/dev-validate.json`
- `project/outputs/r027-payment-health/dev-verification.json`
- `project/outputs/r027-payment-health/development-backup.json`
- `project/outputs/r027-payment-health/frozen-package.json`
- `project/outputs/r027-payment-health/implementation-manifest.json`
- `project/outputs/r027-payment-health/metabase-plan.json`
- `project/outputs/r027-payment-health/production-before-info.json`
- `project/outputs/r027-payment-health/production-sql-definitions.json`
- `project/outputs/r027-payment-health/promotion-checklist.md`
- `project/outputs/r027-payment-health/sql-definitions.json`

**project/outputs/r028-schedule-health/** (3)

- `project/outputs/r028-schedule-health/production-before-info.json`
- `project/outputs/r028-schedule-health/promotion-checklist.md`
- `project/outputs/r028-schedule-health/release-manifest.json`

**project/outputs/r029-bcg-matrix/** (19)

- `project/outputs/r029-bcg-matrix/dependency-preflight.json`
- `project/outputs/r029-bcg-matrix/development-backup.json`
- `project/outputs/r029-bcg-matrix/development-migrate.json`
- `project/outputs/r029-bcg-matrix/development-query-checks.json`
- `project/outputs/r029-bcg-matrix/development-rehearsal.json`
- `project/outputs/r029-bcg-matrix/development-validate.json`
- `project/outputs/r029-bcg-matrix/development-verification.json`
- `project/outputs/r029-bcg-matrix/flyway-manifest.json`
- `project/outputs/r029-bcg-matrix/metabase-plan.json`
- `project/outputs/r029-bcg-matrix/metabase-state.json`
- `project/outputs/r029-bcg-matrix/migration-chain.txt`
- `project/outputs/r029-bcg-matrix/production-backup.json`
- `project/outputs/r029-bcg-matrix/production-grant.json`
- `project/outputs/r029-bcg-matrix/production-migrate.json`
- `project/outputs/r029-bcg-matrix/production-rehearsal.json`
- `project/outputs/r029-bcg-matrix/production-validate.json`
- `project/outputs/r029-bcg-matrix/promotion-checklist.md`
- `project/outputs/r029-bcg-matrix/prototype.json`
- `project/outputs/r029-bcg-matrix/release-manifest.json`

**project/outputs/r030-custom-matrix/** (6)

- `project/outputs/r030-custom-matrix/candidate-tests.json`
- `project/outputs/r030-custom-matrix/dictionary-patch.json`
- `project/outputs/r030-custom-matrix/https-verification.json`
- `project/outputs/r030-custom-matrix/metabase-backup.json`
- `project/outputs/r030-custom-matrix/production-backup.json`
- `project/outputs/r030-custom-matrix/service-local-verification.json`

**project/outputs/r033-matrix-cutover/** (2)

- `project/outputs/r033-matrix-cutover/backup.json`
- `project/outputs/r033-matrix-cutover/dictionary-patch.json`

**project/outputs/r034-matrix-order/** (2)

- `project/outputs/r034-matrix-order/backup.json`
- `project/outputs/r034-matrix-order/dictionary-patch.json`

**project/outputs/r035-borrower-pages/** (17)

- `project/outputs/r035-borrower-pages/database-ci.txt`
- `project/outputs/r035-borrower-pages/dependency-parity.json`
- `project/outputs/r035-borrower-pages/development-backup.json`
- `project/outputs/r035-borrower-pages/development-migrate.json`
- `project/outputs/r035-borrower-pages/development-rehearsal.json`
- `project/outputs/r035-borrower-pages/development-validate.json`
- `project/outputs/r035-borrower-pages/development-verification.json`
- `project/outputs/r035-borrower-pages/dictionary-validation.txt`
- `project/outputs/r035-borrower-pages/final-invariants.json`
- `project/outputs/r035-borrower-pages/metabase-plan.json`
- `project/outputs/r035-borrower-pages/metabase-preflight.json`
- `project/outputs/r035-borrower-pages/metabase-state.json`
- `project/outputs/r035-borrower-pages/production-migrate.json`
- `project/outputs/r035-borrower-pages/production-rehearsal.json`
- `project/outputs/r035-borrower-pages/production-validate.json`
- `project/outputs/r035-borrower-pages/production-verification.json`
- `project/outputs/r035-borrower-pages/release-manifest.json`

**project/outputs/r036-collection-status-colors/** (2)

- `project/outputs/r036-collection-status-colors/dictionary-patch.json`
- `project/outputs/r036-collection-status-colors/order-dictionary-patch.json`

**project/outputs/r036-oltp-localization/** (1)

- `project/outputs/r036-oltp-localization/README.md`

**project/outputs/r036-principal-interest/** (6)

- `project/outputs/r036-principal-interest/README.md`
- `project/outputs/r036-principal-interest/app-verification.json`
- `project/outputs/r036-principal-interest/ci-evidence.json`
- `project/outputs/r036-principal-interest/development-backup.json`
- `project/outputs/r036-principal-interest/development-routines.json`
- `project/outputs/r036-principal-interest/no-backfill-verification.json`

**project/outputs/r036-production/** (1)

- `project/outputs/r036-production/promotion-checklist.md`

**project/outputs/r037-borrower-contribution/** (5)

- `project/outputs/r037-borrower-contribution/dictionary-validation.txt`
- `project/outputs/r037-borrower-contribution/plan.json`
- `project/outputs/r037-borrower-contribution/promotion-checklist.md`
- `project/outputs/r037-borrower-contribution/release-manifest.json`
- `project/outputs/r037-borrower-contribution/state.json`

**project/outputs/r038-lifetime-return/** (5)

- `project/outputs/r038-lifetime-return/dictionary-validation.txt`
- `project/outputs/r038-lifetime-return/plan.json`
- `project/outputs/r038-lifetime-return/promotion-checklist.md`
- `project/outputs/r038-lifetime-return/release-manifest.json`
- `project/outputs/r038-lifetime-return/state.json`

**project/outputs/r039-restore-borrower-bars/** (5)

- `project/outputs/r039-restore-borrower-bars/dictionary-validation.txt`
- `project/outputs/r039-restore-borrower-bars/plan.json`
- `project/outputs/r039-restore-borrower-bars/promotion-checklist.md`
- `project/outputs/r039-restore-borrower-bars/release-manifest.json`
- `project/outputs/r039-restore-borrower-bars/state.json`

**project/outputs/r040-borrower-lifetime-display/** (1)

- `project/outputs/r040-borrower-lifetime-display/state.json`

**project/outputs/r040-borrower-punctuality/** (3)

- `project/outputs/r040-borrower-punctuality/plan.json`
- `project/outputs/r040-borrower-punctuality/release-manifest.json`
- `project/outputs/r040-borrower-punctuality/state.json`

**project/outputs/r041-borrower-detail/** (3)

- `project/outputs/r041-borrower-detail/plan.json`
- `project/outputs/r041-borrower-detail/release-manifest.json`
- `project/outputs/r041-borrower-detail/state.json`

**project/outputs/r042-borrower-payments/** (9)

- `project/outputs/r042-borrower-payments/database-verification.json`
- `project/outputs/r042-borrower-payments/development-backup.json`
- `project/outputs/r042-borrower-payments/development-report-checks.json`
- `project/outputs/r042-borrower-payments/flyway-manifest.json`
- `project/outputs/r042-borrower-payments/migration-test.json`
- `project/outputs/r042-borrower-payments/plan.json`
- `project/outputs/r042-borrower-payments/production-backup.json`
- `project/outputs/r042-borrower-payments/release-manifest.json`
- `project/outputs/r042-borrower-payments/state.json`

**project/outputs/r043-borrower-navigation/** (1)

- `project/outputs/r043-borrower-navigation/state.json`

**project/outputs/r044-partners/** (9)

- `project/outputs/r044-partners/browser-verification.json`
- `project/outputs/r044-partners/development-catalog.json`
- `project/outputs/r044-partners/development-migrate.json`
- `project/outputs/r044-partners/development-validate.json`
- `project/outputs/r044-partners/dictionary-validation.txt`
- `project/outputs/r044-partners/plan.json`
- `project/outputs/r044-partners/production-catalog.json`
- `project/outputs/r044-partners/production-migrate.json`
- `project/outputs/r044-partners/production-validate.json`

**project/outputs/r045-forecast-planning/** (19)

- `project/outputs/r045-forecast-planning/baseline.json`
- `project/outputs/r045-forecast-planning/database-ci.txt`
- `project/outputs/r045-forecast-planning/development-backup.json`
- `project/outputs/r045-forecast-planning/development-migration.json`
- `project/outputs/r045-forecast-planning/development-queries.json`
- `project/outputs/r045-forecast-planning/development-validation.json`
- `project/outputs/r045-forecast-planning/dictionary-validation.txt`
- `project/outputs/r045-forecast-planning/forecast-tests.txt`
- `project/outputs/r045-forecast-planning/plan.json`
- `project/outputs/r045-forecast-planning/preflight.json`
- `project/outputs/r045-forecast-planning/production-backup.json`
- `project/outputs/r045-forecast-planning/production-migration.json`
- `project/outputs/r045-forecast-planning/production-validation.json`
- `project/outputs/r045-forecast-planning/restore-rehearsal.json`
- `project/outputs/r045-forecast-planning/saved-reconciliation.json`
- `project/outputs/r045-forecast-planning/schema-preflight.json`
- `project/outputs/r045-forecast-planning/verification-development.json`
- `project/outputs/r045-forecast-planning/verification-production.json`
- `project/outputs/r045-forecast-planning/verification.json`

**project/outputs/r046-receipt-evidence/** (33)

- `project/outputs/r046-receipt-evidence/AUDIT_REPAIR.md`
- `project/outputs/r046-receipt-evidence/IMPLEMENTATION.md`
- `project/outputs/r046-receipt-evidence/agent-tests-final.json`
- `project/outputs/r046-receipt-evidence/agent-tests.txt`
- `project/outputs/r046-receipt-evidence/bucket-iam-agent.json`
- `project/outputs/r046-receipt-evidence/bucket-iam-before-agent.json`
- `project/outputs/r046-receipt-evidence/central-and-restore-tests.json`
- `project/outputs/r046-receipt-evidence/central-production-migration.json`
- `project/outputs/r046-receipt-evidence/database-ci.txt`
- `project/outputs/r046-receipt-evidence/dev-app-verification.json`
- `project/outputs/r046-receipt-evidence/dev-backup.json`
- `project/outputs/r046-receipt-evidence/dev-demo.json`
- `project/outputs/r046-receipt-evidence/dev-migration-v50.txt`
- `project/outputs/r046-receipt-evidence/dev-migration.json`
- `project/outputs/r046-receipt-evidence/dev-payment-review.png`
- `project/outputs/r046-receipt-evidence/dev-projector.json`
- `project/outputs/r046-receipt-evidence/dev-receipt-expanded.png`
- `project/outputs/r046-receipt-evidence/dev-validation.json`
- `project/outputs/r046-receipt-evidence/dictionary-update.json`
- `project/outputs/r046-receipt-evidence/flyway-manifest.json`
- `project/outputs/r046-receipt-evidence/frozen-package.json`
- `project/outputs/r046-receipt-evidence/prod-app-verification.json`
- `project/outputs/r046-receipt-evidence/prod-backups.json`
- `project/outputs/r046-receipt-evidence/prod-projector.json`
- `project/outputs/r046-receipt-evidence/prod-restore-tests.json`
- `project/outputs/r046-receipt-evidence/prod-validation.json`
- `project/outputs/r046-receipt-evidence/promotion-checklist.md`
- `project/outputs/r046-receipt-evidence/release-manifest.json`
- `project/outputs/r046-receipt-evidence/sql-tests-v50.txt`
- `project/outputs/r046-receipt-evidence/sql-tests.txt`
- `project/outputs/r046-receipt-evidence/synthetic-receipt.png`
- `project/outputs/r046-receipt-evidence/vm-initial-verification.json`
- `project/outputs/r046-receipt-evidence/vm-production-verification.json`

**project/outputs/r047-collection-receipts/** (1)

- `project/outputs/r047-collection-receipts/HANDOVER.md`

**project/outputs/r047-production/** (20)

- `project/outputs/r047-production/collection-definitions.json`
- `project/outputs/r047-production/dictionary-closure-plan.json`
- `project/outputs/r047-production/flyway-manifest.json`
- `project/outputs/r047-production/local-checks.json`
- `project/outputs/r047-production/olap-affected-definitions.json`
- `project/outputs/r047-production/oltp-affected-definitions.json`
- `project/outputs/r047-production/prod-olap-branding.png`
- `project/outputs/r047-production/prod-oltp-branding.png`
- `project/outputs/r047-production/production-backup.json`
- `project/outputs/r047-production/production-migrate.json`
- `project/outputs/r047-production/production-validate.json`
- `project/outputs/r047-production/production-verification.json`
- `project/outputs/r047-production/promotion-checklist.md`
- `project/outputs/r047-production/rc-olap-branding.png`
- `project/outputs/r047-production/rc-oltp-branding.png`
- `project/outputs/r047-production/rc-verification.json`
- `project/outputs/r047-production/release-manifest.json`
- `project/outputs/r047-production/schema-postflight.json`
- `project/outputs/r047-production/schema-preflight.json`
- `project/outputs/r047-production/source-mapping.json`

**project/outputs/r047-receipt-upload/** (23)

- `project/outputs/r047-receipt-upload/HANDOVER.md`
- `project/outputs/r047-receipt-upload/agent-compatibility.txt`
- `project/outputs/r047-receipt-upload/ci.txt`
- `project/outputs/r047-receipt-upload/continuation.md`
- `project/outputs/r047-receipt-upload/dev-collection-uploaded.png`
- `project/outputs/r047-receipt-upload/dev-edit-upload-form.png`
- `project/outputs/r047-receipt-upload/dev-manual-fullsize.png`
- `project/outputs/r047-receipt-upload/dev-metadata.json`
- `project/outputs/r047-receipt-upload/dev-migrate.json`
- `project/outputs/r047-receipt-upload/dev-olap-editor.png`
- `project/outputs/r047-receipt-upload/dev-oltp-editor.png`
- `project/outputs/r047-receipt-upload/dev-replacement-fullsize.png`
- `project/outputs/r047-receipt-upload/dev-validate.json`
- `project/outputs/r047-receipt-upload/development-backup.json`
- `project/outputs/r047-receipt-upload/gcs-verification.json`
- `project/outputs/r047-receipt-upload/gui-after-create.json`
- `project/outputs/r047-receipt-upload/gui-after-edit.json`
- `project/outputs/r047-receipt-upload/gui-after-replace.json`
- `project/outputs/r047-receipt-upload/gui-before.json`
- `project/outputs/r047-receipt-upload/release-manifest.json`
- `project/outputs/r047-receipt-upload/synthetic-replacement.png`
- `project/outputs/r047-receipt-upload/synthetic-upload.png`
- `project/outputs/r047-receipt-upload/verification.json`

**project/outputs/r047-selected-charges/** (24)

- `project/outputs/r047-selected-charges/BAHT_FORMATTING.md`
- `project/outputs/r047-selected-charges/HANDOVER.md`
- `project/outputs/r047-selected-charges/IMPLEMENTATION.md`
- `project/outputs/r047-selected-charges/LABEL_REFINEMENT.md`
- `project/outputs/r047-selected-charges/READONLY_TOTAL.md`
- `project/outputs/r047-selected-charges/ci.txt`
- `project/outputs/r047-selected-charges/dev-baht-allocation.png`
- `project/outputs/r047-selected-charges/dev-baht-payment.png`
- `project/outputs/r047-selected-charges/dev-form.png`
- `project/outputs/r047-selected-charges/dev-label-loan-key.png`
- `project/outputs/r047-selected-charges/dev-loan-key-whole-percent.png`
- `project/outputs/r047-selected-charges/dev-metadata.json`
- `project/outputs/r047-selected-charges/dev-migrate.json`
- `project/outputs/r047-selected-charges/dev-olap-editor.png`
- `project/outputs/r047-selected-charges/dev-olap-payment.png`
- `project/outputs/r047-selected-charges/dev-oltp-editor.png`
- `project/outputs/r047-selected-charges/dev-posted-payment.png`
- `project/outputs/r047-selected-charges/dev-readonly-total.png`
- `project/outputs/r047-selected-charges/dev-reconciliation.json`
- `project/outputs/r047-selected-charges/dev-validate.json`
- `project/outputs/r047-selected-charges/development-backup.json`
- `project/outputs/r047-selected-charges/fixture-retired.json`
- `project/outputs/r047-selected-charges/release-manifest.json`
- `project/outputs/r047-selected-charges/verification.json`

**project/outputs/r048-forecast-original-rate/** (1)

- `project/outputs/r048-forecast-original-rate/backup.json`

**project/outputs/r048-forecast-watchlist/** (1)

- `project/outputs/r048-forecast-watchlist/backup.json`

**project/outputs/r048-loan-interest-correction/** (3)

- `project/outputs/r048-loan-interest-correction/README.md`
- `project/outputs/r048-loan-interest-correction/correction-verification.json`
- `project/outputs/r048-loan-interest-correction/rehearsal.json`

**project/outputs/r048-loan-interest-production/** (18)

- `project/outputs/r048-loan-interest-production/README.md`
- `project/outputs/r048-loan-interest-production/app-config-observations.json`
- `project/outputs/r048-loan-interest-production/ci-evidence.json`
- `project/outputs/r048-loan-interest-production/closure-verification.json`
- `project/outputs/r048-loan-interest-production/database-ci.log`
- `project/outputs/r048-loan-interest-production/dictionary-closure-plan.json`
- `project/outputs/r048-loan-interest-production/dictionary-validation.json`
- `project/outputs/r048-loan-interest-production/flyway-before.json`
- `project/outputs/r048-loan-interest-production/flyway-manifest.json`
- `project/outputs/r048-loan-interest-production/flyway-migrate.json`
- `project/outputs/r048-loan-interest-production/flyway-validate.json`
- `project/outputs/r048-loan-interest-production/gui-verification.json`
- `project/outputs/r048-loan-interest-production/missing-basis-summary.json`
- `project/outputs/r048-loan-interest-production/production-backup.json`
- `project/outputs/r048-loan-interest-production/production-manifest.json`
- `project/outputs/r048-loan-interest-production/production-original-rate.png`
- `project/outputs/r048-loan-interest-production/slices-observed.json`
- `project/outputs/r048-loan-interest-production/sql-verification.json`

**project/outputs/r048-loan-interest/** (12)

- `project/outputs/r048-loan-interest/IMPLEMENTATION.md`
- `project/outputs/r048-loan-interest/MANUAL_PROD_STEPS.md`
- `project/outputs/r048-loan-interest/app-evidence.json`
- `project/outputs/r048-loan-interest/ci-evidence.json`
- `project/outputs/r048-loan-interest/ci-output.txt`
- `project/outputs/r048-loan-interest/dev-migrate.json`
- `project/outputs/r048-loan-interest/dev-validate.json`
- `project/outputs/r048-loan-interest/development-backup.json`
- `project/outputs/r048-loan-interest/partial-repayment.png`
- `project/outputs/r048-loan-interest/postgresql-affected-definitions.json`
- `project/outputs/r048-loan-interest/repository-checks.json`
- `project/outputs/r048-loan-interest/review-manifest.json`

**project/outputs/r048-production/** (7)

- `project/outputs/r048-production/dictionary-closure-plan.json`
- `project/outputs/r048-production/logo-after-cleanup.png`
- `project/outputs/r048-production/logo-before.png`
- `project/outputs/r048-production/logo-restored-rc.png`
- `project/outputs/r048-production/oltp-affected-definitions.json`
- `project/outputs/r048-production/production-version.png`
- `project/outputs/r048-production/rc-cleanup.png`

**project/outputs/r048-upcoming-charges/** (3)

- `project/outputs/r048-upcoming-charges/HANDOVER.md`
- `project/outputs/r048-upcoming-charges/dictionary-closure-plan.json`
- `project/outputs/r048-upcoming-charges/feature-manifest.json`

**project/outputs/r049-production/** (1)

- `project/outputs/r049-production/oltp-affected-definitions.json`

**project/outputs/r049-upcoming-summary/** (1)

- `project/outputs/r049-upcoming-summary/sql-dictionary-plan.json`

**project/outputs/r050-borrower-detail-category/** (2)

- `project/outputs/r050-borrower-detail-category/patch-dashboard.json`
- `project/outputs/r050-borrower-detail-category/patch-question369.json`

**project/outputs/r050-borrower-lifetime/** (3)

- `project/outputs/r050-borrower-lifetime/charge-day-recovery.json`
- `project/outputs/r050-borrower-lifetime/daily-light-recovery.json`
- `project/outputs/r050-borrower-lifetime/date-label-recovery.json`

**project/outputs/r050-remove-forecast-partners/** (2)

- `project/outputs/r050-remove-forecast-partners/dictionary-validation.txt`
- `project/outputs/r050-remove-forecast-partners/plan.json`

**project/outputs/r051-payment-performance/** (1)

- `project/outputs/r051-payment-performance/dictionary-update.json`

**project/outputs/r051-production/** (4)

- `project/outputs/r051-production/development-backup.json`
- `project/outputs/r051-production/dictionary-closure-plan.json`
- `project/outputs/r051-production/production-migration.json`
- `project/outputs/r051-production/rc-cleanup.png`

**project/outputs/r051-receipt-corrections/** (65)

- `project/outputs/r051-receipt-corrections/additional-ui-fixtures-local.json`
- `project/outputs/r051-receipt-corrections/default-charge-v69-plan.json`
- `project/outputs/r051-receipt-corrections/dev-acceptance-v64.json`
- `project/outputs/r051-receipt-corrections/dev-daily-conversion-preflight-v67.json`
- `project/outputs/r051-receipt-corrections/dev-daily-conversion-preflight-v68.json`
- `project/outputs/r051-receipt-corrections/dev-daily-conversion-v68.json`
- `project/outputs/r051-receipt-corrections/dev-default-charge-preflight-v68.json`
- `project/outputs/r051-receipt-corrections/dev-default-charge-preflight-v69.json`
- `project/outputs/r051-receipt-corrections/dev-default-charge-v69.json`
- `project/outputs/r051-receipt-corrections/dev-default-repayment-preflight-v69.json`
- `project/outputs/r051-receipt-corrections/dev-grouped-v63-attempt.json`
- `project/outputs/r051-receipt-corrections/dev-migration-v61.json`
- `project/outputs/r051-receipt-corrections/dev-migration-v62.json`
- `project/outputs/r051-receipt-corrections/dev-migration-v63.json`
- `project/outputs/r051-receipt-corrections/dev-migration-v64.json`
- `project/outputs/r051-receipt-corrections/dev-migration-v65.json`
- `project/outputs/r051-receipt-corrections/dev-migration-v66.json`
- `project/outputs/r051-receipt-corrections/dev-migration-v67.json`
- `project/outputs/r051-receipt-corrections/dev-migration-v68.json`
- `project/outputs/r051-receipt-corrections/dev-migration-v69.json`
- `project/outputs/r051-receipt-corrections/dev-migration-v70.json`
- `project/outputs/r051-receipt-corrections/dev-normal-monolithic-attempt.json`
- `project/outputs/r051-receipt-corrections/dev-partial-tests-v63.json`
- `project/outputs/r051-receipt-corrections/dev-planner-settings.json`
- `project/outputs/r051-receipt-corrections/dev-receipt-delete-v65.json`
- `project/outputs/r051-receipt-corrections/dev-receipt-delete-v67.json`
- `project/outputs/r051-receipt-corrections/dev-recipient-containment.json`
- `project/outputs/r051-receipt-corrections/dev-v61-test-attempt.json`
- `project/outputs/r051-receipt-corrections/dev-v62-test-attempt.json`
- `project/outputs/r051-receipt-corrections/expense-form-cycle-failure.json`
- `project/outputs/r051-receipt-corrections/history-aggregate-validation.json`
- `project/outputs/r051-receipt-corrections/history-plan-diagnostic.json`
- `project/outputs/r051-receipt-corrections/history-read-plan.json`
- `project/outputs/r051-receipt-corrections/income-read-plan.json`
- `project/outputs/r051-receipt-corrections/local-additional-fixtures-v67.json`
- `project/outputs/r051-receipt-corrections/local-daily-conversion-dev-harness.json`
- `project/outputs/r051-receipt-corrections/local-dev-acceptance-v67-rehearsal.json`
- `project/outputs/r051-receipt-corrections/local-fixture-helpers-v69.json`
- `project/outputs/r051-receipt-corrections/local-fixture-preparation-validation.json`
- `project/outputs/r051-receipt-corrections/local-validation-v60.json`
- `project/outputs/r051-receipt-corrections/local-validation-v61.json`
- `project/outputs/r051-receipt-corrections/local-validation-v62.json`
- `project/outputs/r051-receipt-corrections/local-validation-v63.json`
- `project/outputs/r051-receipt-corrections/local-validation-v64.json`
- `project/outputs/r051-receipt-corrections/local-validation-v68.json`
- `project/outputs/r051-receipt-corrections/local-validation-v69.json`
- `project/outputs/r051-receipt-corrections/local-validation.json`
- `project/outputs/r051-receipt-corrections/receipt-creation-bootstrap.json`
- `project/outputs/r051-receipt-corrections/recovery-v64.json`
- `project/outputs/r051-receipt-corrections/recovery-v65.json`
- `project/outputs/r051-receipt-corrections/recovery-v67.json`
- `project/outputs/r051-receipt-corrections/recovery-v68.json`
- `project/outputs/r051-receipt-corrections/recovery.json`
- `project/outputs/r051-receipt-corrections/restored-data-profile.json`
- `project/outputs/r051-receipt-corrections/settlement-account-preflight.json`
- `project/outputs/r051-receipt-corrections/timeout-reconciliation.json`
- `project/outputs/r051-receipt-corrections/ui-fixture-local-test.json`
- `project/outputs/r051-receipt-corrections/ui-fixture-readback.json`
- `project/outputs/r051-receipt-corrections/ui-fixtures.json`
- `project/outputs/r051-receipt-corrections/ui-progress-parent.json`
- `project/outputs/r051-receipt-corrections/ui-readback-after-v65.json`
- `project/outputs/r051-receipt-corrections/ui-readback-after-v67.json`
- `project/outputs/r051-receipt-corrections/vm01-completion-manifest.json`
- `project/outputs/r051-receipt-corrections/vm01-continuation-20261006.md`
- `project/outputs/r051-receipt-corrections/vm01-validate-v72.json`

**project/outputs/r051-related-list-views/** (18)

- `project/outputs/r051-related-list-views/README.md`
- `project/outputs/r051-related-list-views/after-contract.json`
- `project/outputs/r051-related-list-views/before-contract.json`
- `project/outputs/r051-related-list-views/final-cleanup.jpg`
- `project/outputs/r051-related-list-views/final-preservation.json`
- `project/outputs/r051-related-list-views/flyway-migrate-v76.json`
- `project/outputs/r051-related-list-views/flyway-migrate.json`
- `project/outputs/r051-related-list-views/flyway-validate-v76.json`
- `project/outputs/r051-related-list-views/flyway-validate.json`
- `project/outputs/r051-related-list-views/formula-trial.json`
- `project/outputs/r051-related-list-views/gui-results.json`
- `project/outputs/r051-related-list-views/local-ci-v76.txt`
- `project/outputs/r051-related-list-views/local-ci.txt`
- `project/outputs/r051-related-list-views/measurements.json`
- `project/outputs/r051-related-list-views/production-query.json`
- `project/outputs/r051-related-list-views/v76-after-contract.json`
- `project/outputs/r051-related-list-views/v76-before-contract.json`
- `project/outputs/r051-related-list-views/vm01-development-backup.json`

**project/outputs/r051-transparent-performance/** (14)

- `project/outputs/r051-transparent-performance/README.md`
- `project/outputs/r051-transparent-performance/after-contract.json`
- `project/outputs/r051-transparent-performance/before-contract.json`
- `project/outputs/r051-transparent-performance/completion-manifest.json`
- `project/outputs/r051-transparent-performance/coverage-candidate.sql`
- `project/outputs/r051-transparent-performance/development-query-experiment.json`
- `project/outputs/r051-transparent-performance/dictionary-validation.json`
- `project/outputs/r051-transparent-performance/flyway-migrate.json`
- `project/outputs/r051-transparent-performance/flyway-validate.json`
- `project/outputs/r051-transparent-performance/gui-verification.json`
- `project/outputs/r051-transparent-performance/local-ci.txt`
- `project/outputs/r051-transparent-performance/production-dependency-reads.json`
- `project/outputs/r051-transparent-performance/production-query-experiment.json`
- `project/outputs/r051-transparent-performance/vm01-development-backup.json`

**project/outputs/r051-trigger-performance/** (5)

- `project/outputs/r051-trigger-performance/dictionary-validation.json`
- `project/outputs/r051-trigger-performance/flyway-before.json`
- `project/outputs/r051-trigger-performance/flyway-migrate.json`
- `project/outputs/r051-trigger-performance/flyway-validate.json`
- `project/outputs/r051-trigger-performance/migration-before-verification.json`

**project/outputs/r052-phase6/** (1)

- `project/outputs/r052-phase6/ux-ipad-review-2026-10-11.md`

**project/outputs/r052-promotion-readiness/** (1)

- `project/outputs/r052-promotion-readiness/dev87-model-catalog.json`

**project/outputs/r053-notifications-jobs/** (1)

- `project/outputs/r053-notifications-jobs/production-contained-runtime-evidence.json`

**project/outputs/r055-grafana/** (3)

- `project/outputs/r055-grafana/datasource-query-evidence.json`
- `project/outputs/r055-grafana/pwa-coverage-inventory.md`
- `project/outputs/r055-grafana/worker-log-operations.md`

**project/outputs/r056-apple-push/** (2)

- `project/outputs/r056-apple-push/dictionary-patch.json`
- `project/outputs/r056-apple-push/infrastructure-preflight.json`

**project/outputs/receipt-backfill-20260927/** (3)

- `project/outputs/receipt-backfill-20260927/HANDOVER.md`
- `project/outputs/receipt-backfill-20260927/backups.json`
- `project/outputs/receipt-backfill-20260927/verification.json`

**project/outputs/receipt-storage-design-20260927/** (1)

- `project/outputs/receipt-storage-design-20260927/APPSHEET_CONNECTION.md`

**project/outputs/universal-payments-20260905/** (23)

- `project/outputs/universal-payments-20260905/AppSheet_Data_Dictionary.before.xlsx`
- `project/outputs/universal-payments-20260905/AppSheet_Data_Dictionary.xlsx`
- `project/outputs/universal-payments-20260905/AppSheet_Data_Model_Overview.before.md`
- `project/outputs/universal-payments-20260905/action_checkpoint_v1.000028.json`
- `project/outputs/universal-payments-20260905/action_checkpoint_v1.000052.json`
- `project/outputs/universal-payments-20260905/checkpoint_066.py`
- `project/outputs/universal-payments-20260905/clone_slices_checkpoint065.json`
- `project/outputs/universal-payments-20260905/configuration_checkpoint_after052.json`
- `project/outputs/universal-payments-20260905/dictionary-allocation-after.png`
- `project/outputs/universal-payments-20260905/dictionary-before.png`
- `project/outputs/universal-payments-20260905/dictionary-clone-after.png`
- `project/outputs/universal-payments-20260905/dictionary-default-after.png`
- `project/outputs/universal-payments-20260905/dictionary-helpers-after.png`
- `project/outputs/universal-payments-20260905/dictionary-readme-after.png`
- `project/outputs/universal-payments-20260905/dictionary-slices-after.png`
- `project/outputs/universal-payments-20260905/dictionary-validation-after.png`
- `project/outputs/universal-payments-20260905/finalize_checkpoint065.py`
- `project/outputs/universal-payments-20260905/functional-test-results.md`
- `project/outputs/universal-payments-20260905/inspect_dictionary.mjs`
- `project/outputs/universal-payments-20260905/reconcile_final_notes.py`
- `project/outputs/universal-payments-20260905/update_dictionary.mjs`
- `project/outputs/universal-payments-20260905/update_overview_checkpoint052.py`
- `project/outputs/universal-payments-20260905/verify_dictionary.py`

**project/outputs/universal-payments-production-20260906/** (16)

- `project/outputs/universal-payments-production-20260906/AppSheet_Data_Dictionary.before.xlsx`
- `project/outputs/universal-payments-production-20260906/AppSheet_Data_Dictionary.xlsx`
- `project/outputs/universal-payments-production-20260906/AppSheet_Data_Model_Overview.before.md`
- `project/outputs/universal-payments-production-20260906/Universal_Payments_Clone_Migration_Runbook.before.md`
- `project/outputs/universal-payments-production-20260906/dictionary_update_summary.json`
- `project/outputs/universal-payments-production-20260906/dictionary_verification.json`
- `project/outputs/universal-payments-production-20260906/production-columns.png`
- `project/outputs/universal-payments-production-20260906/production-membership.png`
- `project/outputs/universal-payments-production-20260906/production-readme.png`
- `project/outputs/universal-payments-production-20260906/production-refs.png`
- `project/outputs/universal-payments-production-20260906/production-slices.png`
- `project/outputs/universal-payments-production-20260906/production-tables.png`
- `project/outputs/universal-payments-production-20260906/production-variances.png`
- `project/outputs/universal-payments-production-20260906/update_dictionary.mjs`
- `project/outputs/universal-payments-production-20260906/update_overview.py`
- `project/outputs/universal-payments-production-20260906/verify_dictionary.py`

**project/outputs/vc-materialization-20260916/** (26)

- `project/outputs/vc-materialization-20260916/PRODUCTION_PERFORMANCE_REVIEW.md`
- `project/outputs/vc-materialization-20260916/REPORT.md`
- `project/outputs/vc-materialization-20260916/backup-verification.json`
- `project/outputs/vc-materialization-20260916/benchmark.json`
- `project/outputs/vc-materialization-20260916/dictionary-after-Dev-Differences.png`
- `project/outputs/vc-materialization-20260916/dictionary-after-Guide.png`
- `project/outputs/vc-materialization-20260916/dictionary-before.png`
- `project/outputs/vc-materialization-20260916/dictionary-changes.json`
- `project/outputs/vc-materialization-20260916/dictionary-error-scan.jsonl`
- `project/outputs/vc-materialization-20260916/final-flyway-validation.json`
- `project/outputs/vc-materialization-20260916/final-parity.jsonl`
- `project/outputs/vc-materialization-20260916/gui-final.txt`
- `project/outputs/vc-materialization-20260916/gui-partial.txt`
- `project/outputs/vc-materialization-20260916/local-regression.log`
- `project/outputs/vc-materialization-20260916/migration-hashes.json`
- `project/outputs/vc-materialization-20260916/model-evidence.json`
- `project/outputs/vc-materialization-20260916/original-data-preservation.json`
- `project/outputs/vc-materialization-20260916/phase1-migration.json`
- `project/outputs/vc-materialization-20260916/phase1-parity.jsonl`
- `project/outputs/vc-materialization-20260916/phase1-regression.log`
- `project/outputs/vc-materialization-20260916/phase3-migration.json`
- `project/outputs/vc-materialization-20260916/phase3-parity.jsonl`
- `project/outputs/vc-materialization-20260916/phase3-regression.log`
- `project/outputs/vc-materialization-20260916/phase4-migration.json`
- `project/outputs/vc-materialization-20260916/phase4-parity.jsonl`
- `project/outputs/vc-materialization-20260916/phase4-regression.log`

**project/outputs/vc-production-20260916/** (11)

- `project/outputs/vc-production-20260916/REPORT.md`
- `project/outputs/vc-production-20260916/app-verification.json`
- `project/outputs/vc-production-20260916/backup-verification.json`
- `project/outputs/vc-production-20260916/dictionary-after.png`
- `project/outputs/vc-production-20260916/dictionary-changes.json`
- `project/outputs/vc-production-20260916/dictionary-error-scan.jsonl`
- `project/outputs/vc-production-20260916/dictionary-independent-verification.json`
- `project/outputs/vc-production-20260916/flyway-validation.json`
- `project/outputs/vc-production-20260916/migration.json`
- `project/outputs/vc-production-20260916/original-data-preservation.json`
- `project/outputs/vc-production-20260916/parity.jsonl`

</details>

## Checks
Run once on the completed batch (Agent C at `d31a86f`; link check rerun at `cf0ad55`).

| Command | Result |
| --- | --- |
| Link and anchor check over all tracked `*.md` (scratch script `w6linkcheck.py`) | Before (`cbc8843`): 838 files, 2,519 relative links, 339 broken. After: 253 files, 1,392 links, 1 broken (held `Release_Tracker.md:46` anchor) |
| Rule inventory: every imperative rule in the old `AGENTS.md`, checked against its new home | 148 rules: 144 same, 2 stronger, 2 reworded per owner decision (see Open questions), 0 lost |
| `python3 project/scripts/dictionary/dictionary.py validate` | 416 documents, 0 errors |
| `cd integration-agent && PYTHONPATH=src python -m unittest tests.test_service_catalogue -v` | 1 test, OK |
| `node scripts/check-binary-evidence.mjs` | Passed, 41 tracked PNG/XLSX files, all allowed |
| Index check over the three indexes | 21 documents, 0 unlinked, 0 links to deleted files |
| `git diff --name-only cbc8843..HEAD` scope review | Documentation, dictionary, example config, evidence, allowlist data and one diagram label only; no source, SQL, Terraform or CI logic |
| `wc -w AGENTS.md` | 1,993 to 749 |
| `wc -w` monitoring documents | `Resource_Monitoring.md` 5,242 to 2,410; dashboard guide 7,462 to 3,872; events bridge 3,113 to 1,549 |
| `wc -w project/Documents/Development_Changes.md` | 17,996, unchanged (held) |
| `wc -w` Rules pages that received moved text | `Development_Workflow.md` 1,691 to 2,879; `Release_Workflow.md` 914 to 1,134; `PWA_Orchestration.md` 1,401 to 1,462 |
| `du -sh project/outputs integration-agent/outputs` | 66M to 21M; 284K unchanged |
| Change notes per folder (files, words) | `Change Logs` 61 / 95,407 to 13 / 54,789; `project/Change Logs` 337 / 276,589 to 2 / 1,741; `integration-agent/Change Logs` 57 / 41,269 to 6 / 16,748 |

## Not run
| Check | Why |
| --- | --- |
| Product CI, deployment, smoke | Documentation only; no product change |
| `node --test` | No test reads a documentation file this wave changed or deleted |
| `tests.test_config` | Not a requested check; it errors identically at `cbc8843` (missing `psycopg` in the sandbox) |
| Read of the Debian host checkout HEAD | Read-only host access not used; the inventory infers it from the deploy helper |

## Recovery
Revert the Wave 6 commits on `claude/review-w6-docs` (or on main after merge). Every deleted file is recoverable from Git at `cbc8843` (`git checkout cbc8843 -- <path>`); permalinks in the documents point there.

## Open questions
- Change-note files: the records rule now says a new change note file needs no approval (the root-app rule already required "one concise change log under `Change Logs/`", and the agent requires a note per change). Please confirm this reading.
- Evidence retention: per ALL-DOC-09 the old "retain evidence needed for active recovery or pending work" clause is replaced by "only a current document, README or maintained runtime script keeps evidence". Recovery records stay alive because the inventory and runbooks cite them. Confirm no extra exception is wanted.
- `AGENTS.md` is 749 words, not about 600. The reviewer found no further cut that keeps every hard rule. Accept, or name rules to move to a Rules page.
- Audit relay in `service-catalogue.json` (AGT-DOC-07) needs `validate_catalogue` to accept a new service name, a source change with a coordinated live-catalogue rollout. Authorize, or keep it Markdown-only?
- One-off scripts: 50 release or dictionary scripts in `project/scripts/` (and more top-level `r0xx-*` scripts, 132 in all) still name deleted evidence. Delete them with `project/scripts/reference/`?
- Deleted uncited September backup and restore verification files (R002, R007, R008, business expenses, lump sum, monitored jobs). No current document, inventory row or runbook cited them. Restore any?

## Remaining work
- After `claude/r071-style-decisions` merges: trim `Development_Changes.md` (ALL-DOC-06), remove pins from the tracker, `Development_Changes.md` and `application.yaml` (ALL-DOC-05), drop the tracker R058 anchor (ALL-DOC-02), add DB-DOC-04, add the Wave 6 line under the open release and close the review documentation rows, then delete the notes linked only from those files (`REPOSITORY_MERGE`, `W1_APP`, `W1_OPS`, `W3_APP`, `W3_OPS`, `W1_AGENT`, `W2_AGENT_DEPLOYMENT`, `W3_AGENT`, `RECEIPT_NOTIFICATION_ISOLATION`, `R064_SYNC` if released) after repointing.
- `integration-agent/docs/BUSINESS_PROCESS.png` still shows the old label; re-export needs draw.io.
- Dated pins remain in historical records outside this wave's list: `infrastructure/production/READINESS_INVENTORY.md`, `scripts/promotion/README.md` (R063 narrative), earlier dated paragraphs of `docs/Development_PWA_Delivery.md`.
- `CHANGE_NOTES_VM01_TOOL_VALIDATION_2026-10-11.md` records two cleanup exceptions due for review on 18 October 2026.
