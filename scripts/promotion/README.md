# Contained production package preparation

Current owner decision: reuse project clever-oasis-508610-n7 /737787224638 and its default Firebase authentication/same user group; production API authorization and resource/deployment bindings remain separate. The earlier new-project/tenant proposals are superseded. Park partial project219146337993/private tainted state; this tool never recovers or mutates it.

manifest.mjs checks explicitly supplied local metadata/artifact bytes. No cloud client, subprocess, network, SQL or apply implementation exists. CLI defaults to dry run and rejects --apply. This is not a deployment runner, evidence of live IAM enforcement or an authorization grant.

```powershell
. ./scripts/Enter-Dev.ps1
node scripts/promotion/manifest.mjs --manifest PATH --dry-run
node scripts/promotion/manifest.mjs --manifest PATH --artifact-root CURRENT_ROOT --rollback-root RECOVERY_ROOT
node --test tests/unit/phase3-promotion-manifest.test.mjs
```

## Linux cloud sessions

`deploy-business-hosting.mjs` runs unchanged from a Claude Code cloud session. The cloud account `codex-cloud` holds Token Creator on the pinned operator `mw-credit-unattended-admin`, so supply the operator token and the impersonation source token from gcloud:

```bash
GOOGLE_OAUTH_ACCESS_TOKEN=$(gcloud auth print-access-token --impersonate-service-account=mw-credit-unattended-admin@clever-oasis-508610-n7.iam.gserviceaccount.com) \
GOOGLE_IMPERSONATION_SOURCE_TOKEN=$(gcloud auth print-access-token) \
node scripts/promotion/deploy-business-hosting.mjs --apply --inputs ABSOLUTE_PRIVATE_PACKAGE --approval-reference '...' --output ~/.mw-private/MW-Credit-App/RECEIPT.json
```

The private root is `MW_PRIVATE_ROOT/MW-Credit-App` (default `~/.mw-private`); each receipt write is also copied to `gs://mw-credit-operator-private-737787224638/promotion-receipts/`. Keep packages there too, since the session disk is discarded.

## R103 Hosting-only promotion on the R102 runtime

`schemaVersion: 34`, `release: R103`, `scope: frontend-only`, `status: prepared`: R083's Hosting-only kind (shared code path) on the unchanged R102 runtime and V115. R103's only PROD change is the PWA chat progress row ("Looking up data…" with elapsed seconds); there is no SQL, image or Terraform change.

- **Source.** The source (`sourceCommit`, equal to `artifactSourceCommit`) must descend from the R102 package `b216968` (`sourceBaseline`), and the runtime, SQL and infrastructure inputs are compared with `b216968` in R074's strict name form (`package.json` in `scripts` only, `database/` only in `.md` outside `database/migrations/`). The delivery-tool commit may carry only the runner, its unit test, this README and documents, with the runner's unit test recorded as `deliveryToolChecks`.
- **No runtime or SQL change.** No `build`, `plan`, `applied` or `activation`. `sql` is baseline and target 115 with no migrations, plus `sql.verified` (`loan_manager_prod`, latest `115`, all successful, a UTC `verifiedAt`). `runtime.services` must be exactly the five R102 PROD services as pinned in the runner (`R103_RUNTIME`): read `00029-tzt`, command `00034-8m8` and chat `00012-7lz` on `599e19b6…`, notify `00022-4lt` and jobs `00022-42m` on `50953149…`. `rollback` pins the current Hosting version and release.
- **Live readback at apply.** Each of the five services must read back on its pinned image and revision with 100% traffic, and the R102 live chat check holds: Claude Opus 5.5 as the default plus the three Gemini models (all available, `maxRounds` 16), `CHAT_RELAY_URL` the VM relay, private-range VPC egress on chat (none on read or notify), the chat service account.
- **CI.** R074's per-job gate, with stage-hash evidence allowed.
- **Artifact and operator proof.** The marker and the entry bundle carry `"R103"`; `chatOrigin` stays the R090 PROD chat origin (public config, bundle and CSP). The audience is `https://lm.mw-credit.com/promotion/r103`.
- **Run.** `--check --inputs ABSOLUTE_PRIVATE_PACKAGE` validates offline; `--apply` as in [Linux cloud sessions](#linux-cloud-sessions).
- **Not covered.** The R103 dictionary capture and the Metabase baselines (operator tooling, no PROD runtime).

## R102 read, command, chat, SQL and frontend promotion with V114 and V115

`schemaVersion: 33`, `release: R102`, `scope: runtime-workers-frontend`, `status: prepared|applied`. This is R101's chat-era kind (shared code path) for two changes: the Collection "Long overdue" status (V114) and Claude Opus 5.5 in the chat through the keyless VM relay (V115). Read, command and chat get new images; the chat change also carries its relay wiring.

- **Source.** The source must descend from the R101 package `10d543d` (tag R101; the source PROD runs at 113). It adds exactly two migrations, each pinned to its reviewed SHA-256 (the bytes applied to DEV):
  - `database/migrations/V114__long_overdue_collection_status.sql`: `af10766e…84af9`
  - `database/migrations/V115__chat_claude_model_ids.sql`: `669d9b31…7252e`

  A later delivery-tool commit may carry only the runner, its unit test, this README, the R101 database delivery files and documents. Record the runner's unit test as `deliveryToolChecks`.
- **SQL.** `V113 to V115` runs as two migrations in one grouped release transaction. It needs a verified backup at 113 and a read-only 115-row readback, as R101.
  - Owner window: `mw_chat_owner_prod` only. V115 replaces the CHECK on `pwa_chat_threads` and the functions `pwa_chat_thread_create_v1` and `pwa_chat_thread_update_v1`, all owned by the chat owner. V114 replaces two `postgres`-owned views.
  - The runner does not gate the owner window.
- **Order.** SQL first, then the images: `applied.sqlVersion` is 115, and `applied.appliedAt` is no earlier than `sql.applied.finishedAt`. The read and command images select V114's column, and the chat image needs V115 for `claude-*` threads.
- **Plan.** `{add:0, change:3, destroy:0}` with exactly these actions, in this order (`R102_PLAN_ACTIONS`, kept in one place in the runner):
  - `read.image`
  - `command.image`
  - `chat.image`
  - `chat.modelsJson`
  - `chat.relayUrl`
  - `chat.vpcAccess`

  Forge confirms the labels against the reviewed saved PROD plan before any apply.
- **Recovery and applied readback.** Recovery pins Hosting and all five services. The applied readback must show read, command and chat on the new image with a new revision, and notify and jobs exactly on their pinned image and revision.
- **Live readback.** As R101, except the chat checks:
  - `CHAT_MODELS_JSON` is exactly `claude-opus-5-5` (the default), `gemini-4-argon`, `gemini-3.8-flash` and `gemini-3.5-flash`, all available, with `maxRounds` 16.
  - `CHAT_RELAY_URL` is `http://10.148.0.2:8791/v1/chat/messages`.
  - Chat has private-range Direct VPC egress on `default/default`.
  - Read and notify carry no relay URL and no VPC egress.
  - The older kinds keep their three-Gemini rule.
- **Artifact and operator.** The marker and the entry bundle carry `"R102"`; `chatOrigin` stays the R090 PROD chat origin. The operator audience is `https://lm.mw-credit.com/promotion/r102`.

## R101 read, command, chat, SQL and frontend promotion with V112 and V113

`schemaVersion: 32`, `release: R101`, `scope: runtime-workers-frontend`, `status: prepared|applied`: R095's chat-era kind (shared code path) for paying the next charge early (V112, payment command v9) and Loan Close ignoring unpaid interest on future-dated charges (V113), with new read, command and chat images.

- **Source.** The source must descend from the R100 package `c7ea78d` (PR #166; the source PROD runs) and add exactly `database/migrations/V112__pay_next_projected_charge.sql` and `database/migrations/V113__loan_close_future_interest.sql`, pinned to their reviewed SHA-256 values `a9910bb3…0366` and `c7ea9657…39e8` (the bytes applied to DEV at `293c64d`). A later delivery-tool commit may carry only the runner, its unit test, this README, `scripts/database/R053_OPERATOR.md` and documents, with the runner's unit test recorded as `deliveryToolChecks`.
- **SQL.** `V111 to V113`, two migrations in one grouped release transaction, a verified backup at 111 and a read-only 113-row readback, as R095. Owner window: `mw_app_prod_journal_owner` only (V112 replaces `pwa_submit_selected_charges_v1`, which it owns; `pwa_next_projected_charge_v1`, `pwa_effective_payment_plan_v2`, `forecast_schedule_v1` and the two Loan Close functions are owned by `postgres`); see [R053_OPERATOR.md](../database/R053_OPERATOR.md#journal-owner-window-v112-and-v113-r101).
- **Order.** SQL first, then the images: `applied.sqlVersion` is 113 and `applied.appliedAt` is no earlier than `sql.applied.finishedAt` (the R101 command image needs V112 for v9 and V113 for Loan Close).
- **Plan.** `{add:0, change:3, destroy:0}` with exactly `read.image`, `command.image`, `chat.image`. Recovery pins Hosting and all five services; the applied readback names the five services: read, command and chat on the new image with a new revision, notify and jobs exactly on their pinned image and revision.
- **Live readback and artifact.** As R095 (chat-era checks). The marker and the entry bundle carry `"R101"`; `chatOrigin` stays the R090 PROD chat origin. The operator audience is `https://lm.mw-credit.com/promotion/r101`.

## R100 read, command, chat and frontend promotion with no SQL

`schemaVersion: 31`, `release: R100`, `scope: runtime-workers-frontend`, `status: prepared|applied`: R097's kind (shared code path) for the CI tune-up lint batches (unused code removed, explicit button types, label/control associations, the sync-outcome listener reading the latest result and language).

- **Source.** The source must descend from the R097 package `e040373` (PR #155, frozen at promotion start; the source PROD runs) and add no file under `database/migrations`. A later delivery-tool commit may carry only the runner, its unit test, this README and documents, with the runner's unit test recorded as `deliveryToolChecks`.
- **SQL, order and plan.** As R097: no migration, a read-only PROD readback at 111, `{add:0, change:3, destroy:0}` with exactly `read.image`, `command.image`, `chat.image`; notify and jobs read back on their pinned image and revision.
- **Live readback and artifact.** As R097. The marker and the entry bundle carry `"R100"`; `chatOrigin` stays the R090 PROD chat origin. The operator audience is `https://lm.mw-credit.com/promotion/r100`.

## R097 read, command, chat and frontend promotion with no SQL

`schemaVersion: 30`, `release: R097`, `scope: runtime-workers-frontend`, `status: prepared|applied`: R096's kind (shared code path) for the Collection board row (the right amount adds what was paid on earlier days toward today's charges; the status line reads "Paid in advance" when every charge dated today was paid earlier; offline tag `business-offline-v5`).

- **Source.** The source must descend from the R096 package `3cbbcea` (PR #151, frozen at promotion start) and add no file under `database/migrations`. A later delivery-tool commit may carry only the runner, its unit test, this README and documents, with the runner's unit test recorded as `deliveryToolChecks`.
- **SQL, order and plan.** As R096: no migration, a read-only PROD readback at 111, `{add:0, change:3, destroy:0}` with exactly `read.image`, `command.image`, `chat.image`; notify and jobs read back on their pinned image and revision.
- **Live readback and artifact.** As R096. The marker and the entry bundle carry `"R097"`; `chatOrigin` stays the R090 PROD chat origin. The operator audience is `https://lm.mw-credit.com/promotion/r097`.

## R096 read, command, chat and frontend promotion with no SQL

`schemaVersion: 29`, `release: R096`, `scope: runtime-workers-frontend`, `status: prepared|applied`: R090's chat-era kind (shared code path) for the Collection change (every charge dated today, also one paid on an earlier day, with a "Paid in advance" caption), with no migration and new read, command and chat images.

- **Source.** The source must descend from the R095 package `14c4a40` (PR #148, frozen at promotion start) and add no file under `database/migrations`. A later delivery-tool commit may carry only the runner, its unit test, this README and documents, with the runner's unit test recorded as `deliveryToolChecks`.
- **SQL.** None: `sql` is exactly `{baselineVersion:111, targetVersion:111, migrations:[], verified}`, where `verified` is a read-only PROD readback (`latestVersion` `"111"`, `historyRows` 111, all successful). No release manifest, apply or backup.
- **Order.** The images roll out on the unchanged version: `applied.sqlVersion` is 111 and `applied.appliedAt` is no earlier than `sql.verified.verifiedAt`.
- **Plan.** `{add:0, change:3, destroy:0}` with exactly `read.image`, `command.image`, `chat.image` (the Collection read contract runs in the business runtime of read and command, the chat virtual `Collection Today` in chat). Recovery pins Hosting and all five services; the applied readback names the five services: read, command and chat on the new image with a new revision, notify and jobs exactly on their pinned image and revision.
- **Live readback and artifact.** As R095. The marker and the entry bundle carry `"R096"`; `chatOrigin` stays the R090 PROD chat origin. The operator audience is `https://lm.mw-credit.com/promotion/r096`.

## R095 command, chat, SQL and frontend promotion with V111

`schemaVersion: 28`, `release: R095`, `scope: runtime-workers-frontend`, `status: prepared|applied`: R090's chat-era kind (shared code path) for payer name matching, with V111 and new command and chat images only.

- **Source.** The source must descend from `e3d5bc2` (the PR #146 merge carrying V110, which was applied to DEV and PROD separately on 24 October 2026) and add exactly `database/migrations/V111__payer_name.sql`, pinned to its reviewed SHA-256 `657d4660…c03a`. A later delivery-tool commit may also carry the payer backfill script and its test.
- **SQL.** `V110 to V111`, one migration, grouped release, verified backup and a read-only 111-row readback, as R091.
- **Order.** SQL first, then the one-time payer backfill (`scripts/database/Backfill-PayerNames.py apply --execute`), then the images: `applied.sqlVersion` is 111 and `applied.appliedAt` is no earlier than `sql.applied.finishedAt`.
- **Plan.** `{add:0, change:2, destroy:0}` with exactly `command.image`, `chat.image`. Recovery pins Hosting and all five services; the applied readback names the five services: command and chat on the new image with a new revision, read, notify and jobs exactly on their pinned image and revision.
- **Live readback and artifact.** As R090 (chat-era checks; the five services against the applied pins). The marker and the entry bundle carry `"R095"`; `chatOrigin` stays the R090 PROD chat origin. The operator audience is `https://lm.mw-credit.com/promotion/r095`.

## R091 runtime, SQL and frontend promotion with V107

`schemaVersion: 27`, `release: R091`, `scope: runtime-workers-frontend`, `status: prepared|applied`: R090's kind (shared code path) for the Instagram conversation decommission, with V107 and one new image on the five services.

- **Source.** The source must descend from the R090 package `297b764` (tag `R090`) and add exactly `database/migrations/V107__drop_agent_native_operation.sql` (R074's strict name form). A later delivery-tool commit may carry only the runner, its unit test, this README, `scripts/database/Backup-ProductionPromotion.py`, `scripts/database/R053_OPERATOR.md`, `scripts/database/connect_preflight.py` with its test (the Grafana roles `mw_agent_dashboard` and `mw_grafana_reader` hold CONNECT on `loan_manager_prod` since R091 step 1 and are configured consumers, not expected-connected ones) and documents (`project/Documents/`, root `Change Logs/`, and the integration agent's Markdown documents under `integration-agent/docs/` and `integration-agent/Change Logs/`), with the runner's unit test recorded as `deliveryToolChecks`; `database/README.md` and any other `integration-agent/` file belong in the source, not the tool commit.
- **SQL.** Baseline 106, target 107, one migration in the grouped transaction: its hash is checked against the source bytes and against the reviewed SHA-256 `06aae62b…6b54aec8` (the bytes applied on DEV); the tested grouped 106-to-107 release manifest (complete); `sql.applied` with the `prod-promotion-…` backup taken at 106 (dump SHA256, passed restore); `sql.verified`, a read-only readback of 107 successful history rows. Owner window: `mw_app_prod_journal_owner` only ([R053_OPERATOR.md](../database/R053_OPERATOR.md#journal-owner-window-v107-r091)).
- **Order.** The images go first, on 106, and V107 after them, because V107 drops `pwa_submit_agent_operation_v1`, which the R090 command image still calls: `applied.sqlVersion` is 106 and `applied.appliedAt` is no later than `sql.applied.startedAt`. Hosting is the last step.
- **Plan.** `{add:0, change:5, destroy:0}` with exactly these actions, in this order: `read.image`, `command.image`, `command.conversationEnvRemoved` (the `AGENT_CONVERSATION_*` env leaves command), `notify.image`, `jobs.image`, `chat.image`. The enabled recognizer wiring and the R077 timeouts stay. `rollback.services` pins all five live R090 services, chat included, on the R090 image; `applied.services` holds the five services on the build image at 100% traffic, each on a new revision.
- **Live readback.** As R090 (the four services as R089, command `cpuIdle` not true, the jobs dispatch wake, the chat and jobs callers on notify, the chat service with timeout `300s`, three Gemini models and `maxRounds` 16), plus no env name starting `AGENT_CONVERSATION_` on any of the five services.
- **Artifact and operator proof.** The marker and the entry bundle carry `"R091"`; `chatOrigin` stays the R090 PROD chat origin in the public config, the compiled bundle and the Hosting CSP `connect-src`. The audience is `https://lm.mw-credit.com/promotion/r091`. R091 refuses the other kinds' packages, and they refuse R091's.
- **Not covered.** The integration agent (deploy freeze, agent V11), the policy secrets and the DEV identity (the follow-up pull request), and the three inert VM keys (R092).

## R090 chat service, runtime, SQL and frontend promotion after V106

`schemaVersion: 26`, `release: R090`, `scope: runtime-workers-frontend`, `status: prepared|applied`: R089's SQL kind (shared code path) after V104 to V106, plus the new PROD chat service `mw-credit-app-chat-prod` (in-app chat).

- **Source.** The source must descend from the R089 release `99758c7` (tag `R089`, the PR #121 merge) and add exactly `database/migrations/V104__pwa_chat.sql`, `V105__chat_reply_notification_and_job_status.sql` and `V106__chat_turn_presence.sql` (R074's strict name form). A later delivery-tool commit may carry only the runner, its unit test, this README, `scripts/database/Backup-ProductionPromotion.py`, `scripts/database/R053_OPERATOR.md`, `scripts/database/connect_preflight.py` with its test, and documents, with the runner's unit test recorded as `deliveryToolChecks`.
- **SQL.** Baseline 103, target 106, three migrations executed in one grouped transaction: each migration hash is checked against the source bytes and against its reviewed SHA-256 (V104 `bb0ec215…2f64e40`, V105 `795515c6…4bbe32d`, V106 `92fd4c5d…ed62a6d`, the bytes applied on DEV); the tested grouped 103-to-106 release manifest (complete); `sql.applied` with the `prod-promotion-…` backup (dump SHA256, passed restore); `sql.verified`, a read-only readback of 106 successful history rows. Owner windows: `mw_chat_owner_prod` for V104 to V106 and `mw_notify_owner_prod` for V105 ([R053_OPERATOR.md](../database/R053_OPERATOR.md)). `connect_preflight.py` accepts the chat IAM database user `mw-credit-app-chat-prod@clever-oasis-508610-n7.iam` (derived in `infrastructure/production/chat-service.tf`).
- **Plan.** `{add:10, change:4, destroy:0}` with exactly these actions, in this order (`infrastructure/production/chat-service.tf` with `chat_authorized = true`, `workers.chat_dispatch_enabled` and `jobs_dispatch_enabled`):
  - added: `chat.serviceAccount` (`google_service_account.chat[0]`), `chat.projectRole.cloudsqlClient`, `chat.projectRole.cloudsqlInstanceUser`, `chat.projectRole.aiplatformUser` (`google_project_iam_member.chat[...]`), `chat.authStatusRole` (`google_project_iam_member.chat_auth[0]`), `chat.databaseUser` (`google_sql_user.chat[0]`), `chat.capabilityPolicyAccessor` (`google_secret_manager_secret_iam_member.chat_policy[0]`), `chat.service` (`google_cloud_run_v2_service.chat[0]`), `notify.chatInvoker` and `notify.jobsInvoker` (`module.workers.google_cloud_run_v2_service_iam_member.chat_dispatch[0]` and `.jobs_dispatch[0]`);
  - changed (one new image on each): `read.image`; `command.image` and `command.cpuIdle` (`cpu_idle = false`); `notify.image` and `notify.callerSubjects` (chat and jobs callers); `jobs.image` and `jobs.dispatchWake` (`NOTIFICATION_DISPATCH_*`).
  The enabled recognizer wiring and the R077 timeouts stay. `rollback.services` pins the four live R089 services only (the chat service is new); `applied.services` holds the five services, chat included, each on the build image at 100% traffic.
- **Live readback.** As R089 for the four services (Cloud Build digest, identities, database bindings, recognizer wiring, worker subjects, timeouts), plus: command `cpuIdle` not true (the v2 API omits a false boolean, so an absent `cpuIdle` is false and only an explicit `true` is refused); jobs `NOTIFICATION_DISPATCH_ENABLED/URL/AUDIENCE` naming the PROD notify service; notify `WORKER_CALLER_SUBJECTS_JSON` with the chat and jobs service accounts; and the chat service (identity `mw-credit-app-chat-prod@…`, image, ready revision at 100%, database binding, timeout `300s`, `cpuIdle` not true (absent or false), the three dispatch variables, `CHAT_MODELS_JSON` with three Gemini models and `maxRounds` 16).
- **Artifact and operator proof.** The marker and the entry bundle carry `"R090"`; `chatOrigin` in `production-public-config.json` is `https://mw-credit-app-chat-prod-pvrgvyg3oq-as.a.run.app`, and the compiled entry bundle and the Hosting CSP `connect-src` (`scripts/hosting-headers.mjs`) name it. The audience is `https://lm.mw-credit.com/promotion/r090`. R090 refuses the other kinds' packages, and they refuse R090's.
- **Not covered.** The integration agent and the Grafana collector.

## R089 runtime, SQL and frontend promotion after V103

`schemaVersion: 25`, `release: R089`, `scope: runtime-workers-frontend`, `status: prepared|applied`: R081's kind (shared code path) after V103, notification history text.

- **Source.** V102 (`V102__monitoring_ops_health.sql`, the R089 Grafana work) was applied to DEV and PROD separately, before this package. The source must descend from `0a93c0a` (the PR #123 merge on main, which carries V102 and descends from the R087 release `bf11e40`, the live PROD runtime source with V101 and the R083 runner contract) and add exactly `database/migrations/V103__notification_history_content.sql` (R074's strict name form). The source is the merge of PR #121, which carries this contract; a later delivery-tool commit may carry only the runner, its unit test, this README, `scripts/database/Backup-ProductionPromotion.py` (baseline 102 is accepted, derived from the migration head), `scripts/database/R053_OPERATOR.md` and documents, with the runner's unit test recorded as `deliveryToolChecks`.
- **SQL.** As R081 with baseline 102 and target 103: the V103 hash checked against the source bytes, the tested grouped 102-to-103 release manifest (complete, so it also pins the V102 bytes), `sql.applied` with one migration executed and the `prod-promotion-…` backup (dump SHA256, passed restore), and `sql.verified`, a read-only readback of 103 successful history rows after the apply. The notify owner window (`mw_notify_owner_prod`) follows [R053_OPERATOR.md](../database/R053_OPERATOR.md#notify-owner-authority-v103).
- **Plan, recognition pin, CI and apply.** As R081 (R087 changed the four images only): `{add:0, change:4, destroy:0}` with exactly the four image actions, the unchanged enabled recognizer wiring, R074's per-job CI, and the live readback with request timeouts command `55s`, reader `15s`, notify and jobs `120s`. `rollback.services` pins the live R087 revisions and image. `applied.sqlVersion` is 103 and the runtime apply follows the SQL apply.
- **Artifact and operator proof.** The marker and the entry bundle carry `"R089"`; the audience is `https://lm.mw-credit.com/promotion/r089`. R089 refuses the other kinds' packages, and they refuse R089's.
- **Not covered.** The integration agent and the Grafana collector.

## R083 Hosting-only promotion on the R081 runtime

`schemaVersion: 24`, `release: R083`, `scope: frontend-only`, `status: prepared`: R074's Hosting-only kind (shared code path) on the unchanged R081 runtime and V100, with the release marker in the artifact.

- **Source.** The source (`sourceCommit`, equal to `artifactSourceCommit`) must descend from the R081 release `b36dce9` (`sourceBaseline`, the PR #100 merge), and the runtime, SQL and infrastructure inputs are compared with `b36dce9` in R074's strict name form: `package.json` may change in `scripts` only and `database/` only in `.md` files outside `database/migrations/`. R082 changed only the integration agent, so the R083 package commit `a4fc75d` (the PR #104 merge) differs from `b36dce9` only in PWA sources, tests and documents. The delivery-tool commit (`deliveryToolSource`, the checked-out `HEAD`) may carry only the runner, its unit test, this README and documents, with the runner's unit test recorded as `deliveryToolChecks`.
- **No runtime or SQL change.** The package carries no `build`, `plan`, `applied` or `activation`; R081's plan, image and V100 stay. `sql` is baseline and target 100 with no migrations, plus `sql.verified` (`loan_manager_prod`, latest version `100`, all successful, a UTC `verifiedAt`). `runtime.services` pins the four live R081 services (image and revision), which apply re-reads; any drift refuses. `rollback` pins the current Hosting version and release.
- **CI.** R074's per-job gate, with stage-hash evidence allowed.
- **Artifact and operator proof.** The marker and the entry bundle carry `"R083"`; the audience is `https://lm.mw-credit.com/promotion/r083`.
- **Run.** `--check --inputs ABSOLUTE_PRIVATE_PACKAGE` validates offline and prints the dry-run summary; `--apply` takes the tokens, approval reference and private `--output` as in [Linux cloud sessions](#linux-cloud-sessions).
- **Not covered.** The integration agent (R082).

## R081 runtime, SQL and frontend promotion after V100

`schemaVersion: 23`, `release: R081`, `scope: runtime-workers-frontend`, `status: prepared|applied`: R080's kind (shared code path) after V100, English-name push body.

- **Source.** The source must descend from the R080 release `4a7e199` (the PR #98 merge, which carried the R080 runner contract) and add exactly `database/migrations/V100__notification_english_name.sql` (R074's strict name form). The source may be the merge of the PR that carries this contract; a later delivery-tool commit may carry only the runner, its unit test, this README, `scripts/database/Backup-ProductionPromotion.py` (baseline 99 accepted), `scripts/database/R053_OPERATOR.md` and documents, with the runner's unit test recorded as `deliveryToolChecks`.
- **SQL.** As R080 with baseline 99 and target 100: the V100 hash checked against the source bytes, the tested grouped 99-to-100 release manifest, `sql.applied` with one migration executed and the `prod-promotion-…` backup (dump SHA256, passed restore), and `sql.verified`, a read-only readback of 100 successful history rows after the apply. The V100 owner window (`mw_notify_owner_prod`) follows [R053_OPERATOR.md](../database/R053_OPERATOR.md#notify-owner-authority-v100).
- **Plan, recognition pin, CI and apply.** As R080: `{add:0, change:4, destroy:0}` with exactly the four image actions, the unchanged enabled recognizer wiring, R074's per-job CI, and the live readback with request timeouts command `55s`, reader `15s`, notify and jobs `120s`. `applied.sqlVersion` is 100 and the runtime apply follows the SQL apply.
- **Artifact and operator proof.** The marker and the entry bundle carry `"R081"`; the audience is `https://lm.mw-credit.com/promotion/r081`. R079, R080 and R081 refuse each other's packages.
- **Not covered.** The integration agent.

## R080 runtime, SQL and frontend promotion after V99

`schemaVersion: 22`, `release: R080`, `scope: runtime-workers-frontend`, `status: prepared|applied`: R078's kind (shared code path) after V99, push notification content.

- **Source.** The source must descend from the R079 release `823e9e5` (the PR #95 merge, which carried the R079 runner contract) and add exactly `database/migrations/V99__notification_content_facts.sql` (R074's strict name form). The source may be the merge of the PR that carries this contract; a later delivery-tool commit may carry only the runner, its unit test, this README, `scripts/database/Backup-ProductionPromotion.py` (baseline 98 accepted), `scripts/database/R053_OPERATOR.md` and documents, with the runner's unit test recorded as `deliveryToolChecks`.
- **SQL.** As R078 with baseline 98 and target 99: the V99 hash checked against the source bytes, the tested grouped 98-to-99 release manifest (absolute private path, SHA256, commit; no callbacks; every source migration pinned), `sql.applied` with one migration executed and the `prod-promotion-…` backup (dump SHA256, passed restore), and `sql.verified`, a read-only readback of 99 successful history rows after the apply. The V99 owner window (`mw_notify_owner_prod`) follows [R053_OPERATOR.md](../database/R053_OPERATOR.md#notify-owner-authority-v99).
- **Plan.** `{add:0, change:4, destroy:0}` with exactly `read.image`, `command.image`, `notify.image` and `jobs.image`.
- **Recognition pin.** `recognition` is exactly `{activation: "enabled", url: "http://10.148.0.2:8790/v1/receipt-recognition"}`, unchanged.
- **CI.** The gate is R074's per-job CI with stage-hash evidence, as R078 and R079.
- **Apply.** As R078: Cloud Build source and digest, the four live services, worker caller subjects, the unchanged enabled recognizer wiring on the command service only, and the live request timeouts command `55s`, reader `15s`, notify and jobs `120s` (R077's, unchanged by R079). `applied.sqlVersion` is 99 and the runtime apply follows the SQL apply.
- **Artifact and operator proof.** The marker and the entry bundle carry `"R080"`; the audience is `https://lm.mw-credit.com/promotion/r080`. R078, R079 and R080 refuse each other's packages.
- **Not covered.** The integration agent.

## R079 runtime and frontend hotfix on V98

`schemaVersion: 21`, `release: R079`, `scope: runtime-workers-frontend`, `status: prepared|applied`: the R076 and R077 kind on V98 with no SQL, sharing their code path.

- **Source.** The source must descend from the R078 release `68ce669` and from the V98 commit `7ae8469` (`V98__pwa_row_changes_app_read.sql`), and carry no change under `database/migrations` since the V98 commit (R074's strict name form). The delivery-tool commit may also carry this README and documents, with the runner's unit test recorded as `deliveryToolChecks`.
- **SQL.** No migration and no apply: `sql` is baseline 98, target 98, `migrations: []`, and `sql.verified` is a read-only PROD readback of `loan_manager_prod` at 98 with 98 successful history rows. `applied.sqlVersion` is 98.
- **Plan.** `{add:0, change:4, destroy:0}` with exactly `read.image`, `command.image`, `notify.image` and `jobs.image`.
- **Recognition pin.** `recognition` is exactly `{activation: "enabled", url: "http://10.148.0.2:8790/v1/receipt-recognition"}`, unchanged.
- **CI.** The gate is R074's per-job CI with stage-hash evidence, as R078.
- **Apply.** As R077: Cloud Build source and digest, the four live services, worker caller subjects, the recognizer wiring on the command service only, and the live request timeouts command `55s`, reader `15s`, notify and jobs `120s`.
- **Artifact and operator proof.** The marker and the entry bundle carry `"R079"`; the audience is `https://lm.mw-credit.com/promotion/r079`.
- **Delivered.** R079 went to DEV and PROD on 20 October 2026 with this contract. The package's per-job CI cites, for each stage the lean routine skipped, the earlier run that holds its evidence: `check`, `e2e` 1 to 3, `terraform` and the four rebuild groups cite hash-named evidence artifacts (any trusted run, no ancestry check), and only `guards` cites an input-equivalent ancestor run.
- **Not covered.** The integration agent (it already accepts the grouped thousands comma since `55964c7`).

## R078 runtime, SQL and frontend promotion after V97

`schemaVersion: 20`, `release: R078`, `scope: runtime-workers-frontend`, `status: prepared|applied`: R075's SQL evidence with R077's runtime readback.

- **Source.** The source must descend from the R077 release `683cfce` and add exactly `database/migrations/V97__pwa_row_changes.sql`. The delivery-tool commit may also carry this README and `scripts/database/Backup-ProductionPromotion.py` (baseline 96 accepted), with the runner's unit test recorded as `deliveryToolChecks`.
- **SQL.** As R075 with baseline 96 and target 97: the V97 hash checked against the source bytes, the tested grouped 96-to-97 release manifest (absolute private path, SHA256, commit; no callbacks; every source migration pinned), `sql.applied` with one migration executed and the `prod-promotion-…` backup (dump SHA256, passed restore), and `sql.verified`, a read-only readback of 97 successful history rows after the apply. The V97 owner window (`mw_changes_owner_prod`) follows [R053_OPERATOR.md](../database/R053_OPERATOR.md#change-log-owner-authority-v97).
- **Plan.** `{add:0, change:4, destroy:0}` with exactly `read.image`, `command.image`, `notify.image` and `jobs.image`.
- **Apply.** As R077: Cloud Build source and digest, the four live services, worker caller subjects, the unchanged enabled recognizer wiring on the command service only, and the live request timeouts command `55s`, reader `15s`, notify and jobs `120s`. `applied.sqlVersion` is 97 and the runtime apply follows the SQL apply.
- **Artifact and operator proof.** The marker and the entry bundle carry `"R078"`; the audience is `https://lm.mw-credit.com/promotion/r078`.

## R077 runtime, command timeout and frontend on V96

`schemaVersion: 19`, `release: R077`, `scope: runtime-workers-frontend`, `status: prepared|applied`: the R076 contract with these differences.

- **Source.** The source must descend from the R076 release `fa67607` and carry no change under `database/migrations` since it. The SQL rule (verified V96, no migration), runtime, rollback, recognition pin (enabled, unchanged), per-job CI gate and delivery-tool allowance are R076's.
- **Plan.** `{add:0, change:4, destroy:0}` with exactly the actions `read.image`, `command.image`, `notify.image`, `jobs.image` and `command.timeout`: the command service request timeout goes from 15 s to 55 s (receipt recognition: recognizer 42 s < route 45 s < command 55 s < PWA 60 s).
- **Apply.** As R076, plus the live request timeouts of the four services: command `55s`, reader `15s`, notify and jobs `120s`.
- **Artifact and operator proof.** The marker and the entry bundle carry `"R077"`; the audience is `https://lm.mw-credit.com/promotion/r077`.
- **Not covered.** The integration agent (recognizer bound and slip downscale) is deployed and verified separately.

## R076 runtime and frontend hotfix on V96

`deploy-business-hosting.mjs` accepts `schemaVersion: 18`, `release: R076`, `scope: runtime-workers-frontend`, `status: prepared|applied` (`--apply` needs `applied`), modelled on R069 with R075's per-job CI, release marker and live recognizer readback.

- **Source.** The source must descend from the R075 release `96b0a0b` and from the R075 PROD SQL tooling commit `6b58f00`, and carry no change under `database/migrations` (R074's strict name form). The delivery-tool commit may also carry this README and documents, with the runner's unit test recorded as `deliveryToolChecks`.
- **SQL.** No migration: `sql` is baseline 96, target 96, `migrations: []`, and `sql.verified` is a read-only PROD readback of `loan_manager_prod` at 96 with 96 successful history rows.
- **Runtime.** `build` is the PROD Cloud Build of the source; the four applied revisions run that image, are ready at 100% traffic and differ from the rollback revisions, whose image differs too.
- **Plan.** The saved plan is `{add:0, change:4, destroy:0}` with exactly the actions `read.image`, `command.image`, `notify.image` and `jobs.image`.
- **Recognition pin.** `recognition` is exactly `{activation: "enabled", url: "http://10.148.0.2:8790/v1/receipt-recognition"}`: the R075 wiring, unchanged.
- **CI.** The gate is R074's per-job CI with stage-hash evidence.
- **Artifact.** `build-version.json` is `exact({schemaVersion:1, version, entry, release:"R076"})` and the entry bundle names `"R076"`.
- **Apply.** Apply re-reads every cited run, the Cloud Build source and digest, all four live services and the worker caller subjects, and checks the recognizer wiring live as for R075: the command service has `PROD_RECEIPT_RECOGNITION=enabled`, the pinned URL, `PROD_RECEIPTS=enabled` and private-range Direct VPC egress on the default network and subnet without a connector; the reader and the workers have no VPC access and no recognizer env.
- **Operator proof.** The audience is `https://lm.mw-credit.com/promotion/r076`.

## R075 runtime, SQL and frontend promotion after V96

`deploy-business-hosting.mjs` accepts `schemaVersion: 17`, `release: R075`, `scope: runtime-workers-frontend`, `status: prepared|applied` (`--apply` needs `applied`), modelled on R068. The former R075 Hosting-only kind (`schemaVersion: 16`) is no longer accepted.

- **Source.** The source must descend from the R074 release `b88653d` and add exactly `database/migrations/V96__manual_payment_command_v7_bank_reference.sql` (name lists use R074's strict form). The delivery-tool commit may also carry this README, `scripts/database/Backup-ProductionPromotion.py` and the read-only CONNECT preflight collector `scripts/database/connect_preflight.py` with its test, with the runner's unit test recorded as `deliveryToolChecks`.
- **SQL.** `sql` pins baseline 95 and target 96 and the V96 hash, checked against the source bytes. `sql.release` is the tested grouped manifest: absolute private path, SHA256 and commit. The commit descends from the source with no `database` change, its `productionTransaction` is 95 to 96 grouped in one transaction without callbacks, and it pins every source migration. `sql.applied` records the PROD apply: instance, start and finish, one migration executed, and the dump SHA256 with a passed restore and its `prod-promotion-…` reference. `sql.verified` is a read-only readback of 96 successful history rows taken after the apply.
- **Runtime.** `build` is the PROD Cloud Build of the source, and the four applied revisions run that image and differ from the rollback revisions, whose image differs too. `applied.appliedAt` follows the SQL apply.
- **Plan.** The saved plan is `{add:0, change:4, destroy:0}` with actions `read.image`, `command.image`, `notify.image`, `jobs.image`, `command.vpcAccess`, `command.receiptRecognition` and `command.receiptRecognitionUrl`. That is the four images plus, on the command service only, Direct VPC egress (`PRIVATE_RANGES_ONLY`, default network and subnet) and the env `PROD_RECEIPT_RECOGNITION` and `PROD_RECEIPT_RECOGNITION_URL` (`infrastructure/production/receipt-recognizer.tf` with `receipt_recognizer.enabled = true`).
- **Recognition pin.** `recognition` is `{activation: "disabled"|"enabled", url: "http://10.148.0.2:8790/v1/receipt-recognition"}` and must match the planned `receipt_recognizer.activation`.
- **CI.** The gate is R074's per-job CI with stage-hash evidence.
- **Artifact.** The artifact must carry the release: `build-version.json` is `exact({schemaVersion:1, version, entry, release:"R075"})` and the entry bundle names `"R075"`.
- **Apply.** Apply re-reads every cited run, the Cloud Build source and digest, all four live services and the worker caller subjects. It also checks the recognizer wiring live:
  - The command service has the planned activation and URL, `PROD_RECEIPTS=enabled` when the activation is `enabled`, and private-range Direct VPC egress on the default network and subnet without a connector.
  - The reader and the workers have no VPC access and no recognizer env.
- **Operator proof.** The audience is `https://lm.mw-credit.com/promotion/r075`.

## R074 contract

Shared delivery-tool document allowance (all runtime kinds, since R091): besides `project/Documents/**` and the root `Change Logs/**`, a delivery-tool commit may carry `*.md` files under `integration-agent/docs/` and `integration-agent/Change Logs/` (for example an unrelated main commit that edits only agent documents). Any other `integration-agent/` path, such as code, configuration, SQL, the catalogue or the agent's root `README.md`, is still refused.

`schemaVersion: 15`, `release: R074`, `scope: frontend-only`, `status: prepared`: the R073 contract with the source baseline moved to the R073 release `042359b` (the source must descend from it) and CI gated per job instead of per kind. Runtime, SQL and infrastructure rules (R069 `9c4a4cb`, V95, scripts-only `package.json`, database Markdown) and the delivery-tool allowance are R073's; the operator proof audience is `https://lm.mw-credit.com/promotion/r074`. R065 to R073 keep their kind-level gate unchanged.

`applicationCi` is `{runs:{"<runId>":{run,jobs}}, ci:{jobs:{…}}, database:{jobs:{…}}}`. `ci.jobs` names exactly `check`, `e2e (shard 1 of 3)`, `e2e (shard 2 of 3)`, `e2e (shard 3 of 3)` and `terraform`; `database.jobs` exactly `guards`, `rebuild (migrations)`, `rebuild (receiving)`, `rebuild (phase5)` and `rebuild (phase8)`; each entry is `{runId, headSha}`, and several jobs may cite one run. For every job the cited receipt must be that run at that head, in `welct0407/MW-Credit-App`, from `.github/workflows/ci.yml` (ci) or `.github/workflows/database.yml` (database), a `push`, `pull_request` or `workflow_dispatch` run that completed with success, and hold exactly one job of that name that concluded `success` (a skipped job does not count). The head is either the delivery-tool commit (the same alternative as R073) or an ancestor of the source whose `git diff --name-only head source --no-renames -z` contains no file relevant to the job's stage in `scripts/ci/stages.json`, using that file's `isRelevant` rule as CI does for reuse; `guards` is gated as the database `rebuild` stage. For R074 every name list (this CI diff, the delivery-tool diff, the runtime comparison and the working-drift check) uses `--no-renames` and `-z`, so a moved file is listed at its old path too and non-ASCII, tab, quote or backslash names are not quoted; R065 to R073 keep their original diffs. The runner and its unit test are `check`-relevant, so `check` evidence must come from a run whose tree has the final runner. Apply reads each distinct cited run and its jobs once from GitHub and applies the same gate to the live receipts, then requires the four pinned R069 services as before.

A stage job's entry may instead be `{runId, headSha, evidence}`, naming the stage-hash evidence artifact that run uploaded (`scripts/ci/reuse-evidence.mjs`; `evidence-ci-<stage>-<hash>[-<shard>]` or `evidence-database-rebuild-<hash>-<group>`), with `applicationCi.artifacts[<name>]` holding the artifact objects as GitHub's artifact list returns them. The run receipt and the one successful job of that name are checked as above. `evidence` must equal the name computed from the source commit's own tree (`git ls-tree -r -z --full-tree <sourceCommit>`, the workflow key `ci` or `database` and the job's stage and variant), and an artifact of that name must be unexpired, from the cited run at the cited head and from a same-repository (not fork) head. Content equality is then the proof, so no ancestry or diff check applies: a pull request run that tested the synthetic merge, or a run on a squashed or cherry-picked head, can count. `guards` is not a stage and uploads no evidence, so it keeps the input-equivalent ancestor rule only. Entries without `evidence` keep the ancestor or delivery-tool rule. Apply re-reads each cited artifact name from GitHub (`actions/artifacts?name=…&per_page=20`) and judges the live list, not the package's. Only Linux database runs upload evidence (the name has no OS).

## R073 Hosting-only promotion on the R069 runtime

`schemaVersion: 14`, `release: R073`, `scope: frontend-only`, `status: prepared`: the R072 contract with the source baseline moved to the R072 release `378c348` (the source must descend from it). Runtime, SQL and infrastructure rules, the CI gate and the delivery-tool allowance are R072's; the operator proof audience is `https://lm.mw-credit.com/promotion/r073`.

## R072 Hosting-only promotion on the R069 runtime

`schemaVersion: 13`, `release: R072`, `scope: frontend-only`, `status: prepared`: the R071 contract with the source baseline moved to the R071 release `cb333f5` (the source must descend from it). The runtime, SQL and infrastructure inputs are still compared with R069 `9c4a4cb`, except that `package.json` may change in `scripts` only (both manifests deeply equal once `scripts` is removed) and `database/` may change only in `.md` files outside `database/migrations/`; `package-lock.json` must stay unchanged, and R065, R066 and R070 keep the strict rules. `sql` pins verified V95 with no migration. The CI gate is R071's, and the delivery-tool commit may carry the runner, its unit test, documents and this README.

## R071 Hosting-only promotion on the R069 runtime

`schemaVersion: 12`, `release: R071`, `scope: frontend-only`, `status: prepared`: the R070 contract with the source baseline moved to the R070 release `038b5c9` (the source must descend from it). The runtime, SQL and infrastructure inputs are still compared with R069 `9c4a4cb`, except that `package.json` may change in `scripts` only: it leaves the name-only diff, and both manifests must be deeply equal once `scripts` is removed (the image runs `npm ci --omit=dev` and no npm script), and `database/` may change only in `.md` files outside `database/migrations/`. `package-lock.json` must stay unchanged, and R065, R066 and R070 keep the strict `package.json` and `database` rules. `sql` pins verified V95 with no migration. The CI gate is R070's (`full`, `check`, `database`, each an input-equivalent ancestor or the delivery-tool commit), and `full` and `check` cover `package.json`, so their runs must include the final `package.json`. The delivery-tool commit may carry the runner, its unit test, documents and this README.

## R070 Hosting-only promotion on the R069 runtime

`schemaVersion: 11`, `release: R070`, `scope: frontend-only`, `status: prepared`: the R065/R066 Hosting-only contract moved onto the R069 runtime. The source must descend from the R069 release `9c4a4cb` and change none of the R069 runtime, SQL or infrastructure inputs (compared with `9c4a4cb`, not R064); `sql` pins verified V95 with no migration; `runtime.services` pins the four live R069 services, which apply re-reads. The delivery-tool commit may carry the runner, its unit test, documents and this README.

## R069 runtime and frontend promotion on V95

`schemaVersion: 10`, `release: R069`, `scope: runtime-workers-frontend`, the R068 contract without SQL. The source must descend from the R068 release `73a4420` and change nothing under `database/migrations`. `sql` is baseline and target 95 with no migrations, plus a read-only readback (`sql.verified`: `loan_manager_prod`, latest version 95, 95 successful history rows, a UTC `verifiedAt`). Plan, applied revisions, rollback pins and the CI gate are as for R068; the delivery-tool commit may carry the runner, its unit test, documents and this README only.

## R068 runtime and frontend promotion after V94 and V95

`deploy-business-hosting.mjs` accepts `schemaVersion: 9`, `release: R068`, `scope: runtime-workers-frontend`, modelled on R064. The source must descend from the R067 release `7f8ef53` and add exactly `V94__job_run_contract_and_shared_lock_key.sql` and `V95__agent_role_session_pair.sql`. `sql` pins baseline 93 and target 95, both migration hashes (checked against the source bytes), the tested grouped release manifest (`sql.release`: absolute private path, SHA256 and commit; the commit descends from the source with no `database` change, its `productionTransaction` is 93 to 95 grouped in one transaction without callbacks, and it pins every source migration), the applied record (`sql.applied`: instance, start and finish, two migrations executed, dump SHA256 with a passed restore and its `prod-promotion-…` reference) and a read-only readback of 95 successful history rows taken after the apply. The plan is the saved 0/4/0 image-only plan and the four applied revisions must run the build image and differ from the rollback revisions, whose image must differ too. The CI gate is R064's (`full`, `check`, `database`; each an input-equivalent ancestor or the delivery-tool commit); for R068 the delivery-tool commit may also carry `scripts/database/Backup-ProductionPromotion.py` and this README. Apply re-reads the three runs, the Cloud Build source and digest, all four live services and the worker caller subjects.

## R065 and R066 Hosting-only promotions on the R064 runtime

R066 uses the same contract with `schemaVersion: 8`, `release: R066` and baseline R065 `74ad26b` (the source must descend from it); the runtime, SQL and production Terraform inputs are still compared with R064 `9420c85`.

`deploy-business-hosting.mjs` accepts `schemaVersion: 7`, `release: R065`, `scope: frontend-only`, `status: prepared`. The source must descend from the R064 release `9420c85` and change none of `services`, `database`, `Dockerfile`, `.dockerignore`, `.gcloudignore`, the Cloud Build files, `package.json`, `package-lock.json`, `infrastructure/production` or `infrastructure/modules`; the package carries no `build`, `plan`, `applied` or `activation`, pins verified V93 with no migration, the four unchanged R064 services (`runtime.services`) and the Hosting rollback. CI is gated as for R064 (`full`, `check`, `database`, each an input-equivalent ancestor or the delivery-tool commit). Apply re-reads the three runs and requires the live services to still run the pinned images and revisions. (R064, `schemaVersion: 6`, used the same CI gate with an applied four-image runtime.)

## R063 runtime, workers and frontend promotion

`deploy-business-hosting.mjs` accepts `schemaVersion: 5`, `release: R063`, `scope: runtime-workers-frontend`. The package pins one PROD image for reader, command, notify and jobs, V92 with no migration plus a read-only V92 readback, the reviewed `infrastructure/production` plan (0 add / 4 change / 0 destroy, four images and the worker caller subjects) and all four applied revisions, which must differ from the rollback revisions. CI is reused, not rerun: `full` (check, three e2e shards, Terraform), `check` and `database` runs must each be ancestors of the source with no change to the inputs they cover. A delivery-tool commit may add only the runner, its unit test and documents. Apply re-reads the three runs, the Cloud Build source and digest, all four live services and the worker `WORKER_CALLER_SUBJECTS_JSON`. Headers come from `hostingHeaders('live-prod')`. Delivered on 16 October 2026; pins in the [R063 record](https://github.com/welct0407/MW-Credit-App/blob/4a14d07/project/Documents/Development_Changes.md#r063-production-promotion).

## R061 frontend-only promotion

`deploy-business-hosting.mjs` also accepts the separate `schemaVersion: 3`, `release: R061`, `environment: prod`, `scope: frontend-only`, `status: prepared` package. It forbids runtime build/plan/SQL/applied fields and preserves the existing API/SQL baseline. Source must descend from the deployed frontend baseline, with only allowed frontend/test changes; separately pinned delivery-tool changes are limited to the runner and its unit tests with passing focused checks.

This path validates the successful exact-source PR CI and reads the actual GitHub run/jobs back before apply. Browser workflow steps may be skipped, but the package must supply the 12 passing/zero-skip focused cases, three commands and an immutable PM Development_Changes record commit/hash. It validates exact PROD bindings, all artifact bytes and Hosting recovery pins. Existing signed-operator verification and exclusive private pending-reconciliation receipt handling remain mandatory. A failed/unknown mutation outcome requires reconciliation before retry. This path does not fabricate the R059 two-image apply or require unrelated full browser dispatch.

R061 was delivered at app/artifact source1e0dd73 and runner5e823791; exact environment versions, verification limits and recovery live in the existing PM R061 record/inventory. Creation of its private package/receipt was explicitly owner-approved. Historical R059/foundation/R053 contracts remain separate.

## Current R059 app-only promotion

`deploy-business-hosting.mjs` supports a separate `schemaVersion: 2`, `release: R059`, `environment: prod`, `scope: app-only` package. Historical foundation/R053 contracts remain unchanged. Use an absolute private `--inputs` path with `--check`; `--apply` also requires owner approval and an absolute private `--output` receipt. Creating a missing package/receipt requires explicit document-creation approval.

The package pins one immutable source/build, exact PROD target, V91→V91 with no migrations, a reviewed reader/command-image-only plan and prior Hosting plus all four runtime recovery pins. Apply requires Ready/100% reader and command readback and unchanged notify/jobs. Artifact bytes, public bindings, mode/marker/entry and matched PROD service worker are validated. Source drift rejects.

Application evidence must be the successful exact-source `.github/workflows/ci.yml` `workflow_dispatch` run with executed check, live-dev build, audit and full `test:e2e`; a PR run with skipped browsers cannot satisfy this gate. Operator verification checks the supplied access-token principal and signed audience-bound impersonation proof for the established unattended admin, then verifies the live package identities/configuration before Hosting effects.

The runner reserves the private receipt exclusively as `pending-reconciliation` before mutation and replaces it with actual applied release identity. If the outcome or final receipt write is unknown, do not replay: retain emitted identities and reconcile the live Hosting release first. `manifest.mjs` remains preparation-only; it is not this apply route.

## Draft, candidate and authority

Use schemaVersion1, environment prod, mode foundation. status draft accepts unbound inputs and returns an explicit missing list; it never invents DEV defaults. status reviewable requires complete exact target, stage artifacts, evidence links and recovery. validateCandidate (alias validateReviewable) accepts a complete candidate before owner mutation approval: reviewReady=true, approvalRequired=true, deployReady=false. Optional validateAuthorizedPackage checks a future reference against source/target but still cannot execute or prove authority. A future executor must independently verify scope, live identities, plan hashes, provenance and recovery.

Current shared target requires isolation shared-project-default-auth, exact existing application/data IDs, auth.projectId/audience same project, issuer https://securetoken.google.com/clever-oasis-508610-n7, auth.tenant:null. Project equality without explicit isolation rejects; tenant auth is not selected. Authentication is intentionally shared; there is no claim that a correct shared-user token is denied solely because obtained from DEV. Production serverVerifier and devDeliveryContainment evidence references are mandatory, but a reference alone is not actual IAM proof. Project administrators are outside this logical isolation.

Target binds separate production service names/runtime SAs, site/canonical/fallback origins, state bucket/prefix/generation and mw-credit-app-prod registry instead of DEV mw-credit-app. Retained SQL/receipt identities are reference pins only, not access capability. No production receipt/health prefix is required while no data capability exists. Numeric secret refs are purpose scoped: foundation requires owner-identity only; optional sign-in diagnostic/enrollment phase requires no runtime secret version. Empty unused containers need no dummy versions.

fingerprint(target) is SHA256 of canonical JSON with sorted object keys and preserved array order. Candidate source is a full40-character commit, matching target SHA. Foundation images are immutable own-repository digests with exact contained services/production/server.mjs entrypoint. Optional enrollment phase has no application images or endpoints; it diagnoses the existing sign-in, never requires another account.

## Exact B shell artifacts

The initial shell explicitly has publicWorker:false, cachePolicy:no-store, entry:index.html, phase enrollment/foundation. No worker hash or fake public version is accepted. It uses B's actual public-config.json and foundation-shell.json schema plus index.html/shell.js and firebase.json global no-store config; all files carry SHA256. The marker binds phase/cachePolicy/worker:null/entry/configSHA. Public config uses authIsolation shared-default, exact Firebase projectId/apiKey/appId/authDomain (no tenantId), canonical origin and endpoints:null or exactly the two verified production /api/session URLs. Runtime origins are target readback pins; bundled shell values must match public config. Public API key/WebApp IDs are application identifiers; OAuth secrets, UID pins, tokens and catalogs are forbidden.

All artifact reads use explicit canonical roots with bounded size/count and an allowlisted file manifest. Unknown fields, unallowlisted JSON, private payloads, traversal/dot paths, changed bytes and junction/symlink escapes reject. Earlier separately configured matched-worker update packages remain checked under their original strict contract; a shared-project initial shell cannot use that legacy worker form.

## First deployment and updates

rollback.kind:first-deployment requires exact project/number, state generation/lineage, evidence of absent prior reader/command/Hosting version, observed DNS before-state (including verified empty records), explicit withhold/retain traffic/route actions, and immutable maintenance frontend bytes. Maintenance has authIsolation:none, endpoints:null, no Firebase configuration or auth/API calls. Actual B buildMaintenanceShell output is tested. No fictional predecessor revisions/Hosting version or SQL rollback. These references/local checks do not establish a measured live recovery.

When a real predecessor exists, kind:update (or legacy omitted kind) retains matched immutable images, revisions, Hosting version, configuration/worker or workerless artifact hashes, numeric secret pins and state generation. Update checks remain strict. Creation/deployment failure stops dependent activation and preserves inert resources/history/private state, never destroys shared resources to undo application failure.

SQL mode is exclusively none. Future migration packages reuse the existing exact-tested-commit/hash/backup/authorization runner, not this tool. Credentials, Terraform state/plans and recovery payloads stay outside Git. Use the single PM Phase3 batch and existing owning logs; actual promotion uses applicable master-checklist rows. R052 remains Open and Phase3 in progress. Focused fixtures are synthetic local evidence, with no CI or live-action claim.

## Controlled operator Hosting delivery

The separate scripts/production/deploy-foundation-hosting.mjs executor implements only the approved contained PROD Hosting route. The manifest validator above remains local-only. Required explicit inputs: --manifest PATH --artifact-root CURRENT_ROOT --rollback-root RECOVERY_ROOT --ci-run RUN_ID; default is dry run. --apply verifies the exact source successful CI workflow with its actually executed browser step before reading an operator credential. It then independently verifies the approved human OAuth identity and both actual Hosting sites, rechecks artifact bytes and publishes only mw-credit-prod-737787224638 with no-store and no service worker. Failure preserves the package/any created version; inspect sanitized stage evidence before continuing.

Use the established signed-in gcloud account welct0407@mw-credit.com to capture a short-lived token into GOOGLE_OAUTH_ACCESS_TOKEN in the same process and clear it in finally. Existing GitHub read credentials go into GITHUB_TOKEN only for that process. Never print/store either token, change sign-in stores or create ADC solely for this helper. A default ADC is not required. Production identity/site readbacks do not themselves prove deployment success. Current owner scope already authorizes this contained delivery; manifest authorization references and the flag record that scope, rather than seeking it again.

DEV workflow API steps remain unchanged. Its Hosting step now reports controlled operator instructions; the automated DEV identity must not publish either site. DEV Hosting continues through the maintained scripts/deploy-hosting.mjs --live-dev route using its exact DEV artifact. Coordinate verified human access before F removes the project-wide automated Hosting grant.

cloudbuild-foundation.yaml builds only exact Docker/package/services input into the separate mw-credit-app-prod registry with the verified production build service account/source bucket. Do not submit a dirty repository or reuse the DEV repository. Record build/source/input hashes, immutable digest and final source input-equivalence; successful artifact build does not substitute for final full CI or live proof.

## Business candidate preparation â€” no production execution

`mode: business` is a separate local contract. Drafts list missing inputs. A complete reviewable package still returns `deploymentAuthorized:false`, `deployReady:false` and `approvalRequired:true`. `validateAuthorizedPackage` and the existing foundation Hosting executor reject business mode; `--apply` remains unsupported by candidate validation. No production business migration, grants, Hosting publication, notification or job switch is implemented here.

Supply explicit absolute current/rollback artifact roots, private policy/catalog files, migration root, sanitized build/CI evidence and the actual foundation delivery baseline:

```powershell
node scripts/promotion/manifest.mjs --manifest PRIVATE_CANDIDATE --artifact-root CURRENT_ROOT --rollback-root FOUNDATION_ROOT --policy-file PRIVATE_POLICY --receipt-catalog-file PRIVATE_CATALOG --migration-root MIGRATIONS --baseline-file BASELINE_EVIDENCE --ci-evidence-file CI_EVIDENCE --build-evidence-file BUILD_EVIDENCE --dry-run
```

The business contract checks the exact shared PROD tuple/services/site/origins; immutable business-server image digests and exact-source build/input hashes; successful executed full browser CI source/run pins; all migration filenames/hashes; complete private current-sharing Partner policy and numeric policy/catalog secret versions; B's production receipt parser with a separately reviewed object-root/evidence binding; compiled PROD public config/entry/worker hashes; inactive notification/job/purge flags; retained AppSheet job ownership; source-adapter/recovery evidence; and the real foundation revision/image/Hosting pins with unchanged rollback bytes. It emits counts/hashes, never policy members or catalog keys. Synthetic tests are contract proof, not live readiness or a production authorization grant.

The production policy preparer (`Prepare-ProductionPolicy.ps1`, deleted on 17 October 2026 with the retired direct route, DB-ACCESS-07; Git history keeps it) read only the two reviewed sharing identities' current Partner key, financial role and Login Email, from PROD under a read-only session. Any replacement must keep this scope: inputs and output stay under the private current-user candidate-policy root, outputs never overwrite existing files, and capabilities come from explicit reviewed sharing/action evidence. Financial A/B does not select authorization rights. Policy preparation creates no secret version, account or grant.

## Later grouped SQL promotion

Fresh read-only 11 October PROD history is V77; pending migrations are V78 through the final candidate (including V87 environment isolation). The maintained `Invoke-Flyway.ps1` requires its existing clean tested commit, full migration hashes, owner production approval and verified backup. This task prepares the following later execution contract; it does not execute it:

```powershell
./scripts/database/Invoke-Flyway.ps1 -Environment production -Command migrate -ReleaseFile PRIVATE_TESTED_RELEASE -ApprovalReference SCOPED_OWNER_APPROVAL -BackupReference VERIFIED_RESTORE_REFERENCE -GroupedProduction -ConnectPreflightFile PRIVATE_FRESH_CONTAINMENT_PROOF
```

The tested release's `productionTransaction` pins `baselineVersion:77`, complete final target, `group:true`, `mixed:false`, `executeInTransaction:true`, empty `callbacks`, and exact CONNECT preflight SHA256. Callback/sidecar/nontransactional SQL and ambient overrides refuse. The runner re-reads actual PROD history/pending scope immediately before the later write. A fresh CONNECT preflight must verify current configured legitimate consumers (not only active sessions), explicit reconnect, PUBLIC CONNECT removal, every DEV principal's direct/inherited denial and zero pre-existing DEV sessions. Current observed PUBLIC/DEV CONNECT means that prerequisite is still incomplete; no permissions changed during preparation.

The operator separately snapshots, temporarily establishes only the exact reviewed SET/INHERIT/schema CREATE prerequisites, and restores original grantors/options in `finally`. Failure preserves persistent CONNECT containment; never automatically regrant PUBLIC, repair history, delete new audit tables or replay uncertain effects. The actual shared-cluster group observer/failure/authority restoration rehearsal remains required before promotion readiness. Pure guard tests alone do not establish atomic Flyway behavior.

Maintained full migration fixtures now use a disposable `loan_manager_dev` database so V87's database mapping is exercised rather than relaxed. Concurrency helpers accept a bounded optional database name and preserve their original `postgres` default for other callers. No live database is renamed.
The role-prerequisite CLI accepts `--environment production --creator-file <reviewed-private-registry>` for read-only plans. Production `--apply` is rejected before credential lookup. `--grouped-maintenance` and `--restore-grouped-maintenance` use the two-owner helper; both exact membership/schema grantors must be reviewed. The helper restores only its own tuples and preserves unrelated permanent V87 ACL changes, but callers must verify the final V87 manifest and run restoration in `finally`. It never restores PUBLIC CONNECT. Pure planner checks do not replace actual nonsuperuser/grantor/failure-path verification. The generic coarse role-recovery helper remains DEV-only.

## Prepared package and applied receipts

`status: prepared` uses planned secret `{status:"planned",projectId,name,payloadSha256}` and never invents numeric versions. Supply `--connect-evidence-file`, `--preparation-evidence-file`, `--source-set-file`, `--required-tests-file`, `--rollback-backup-file` in addition to current artifact/policy/catalog/migration/CI/build/baseline inputs. Actual bytes must match preparation hashes; ordered apply/recovery actions and current configured-consumer sources/planned CONNECT diff are required. Complete pending78–87 includes inactive86. Both prepared and applied reports retain deployReady=false/deploymentAuthorized=false.

The applied contract requires numeric versions and fresh real CONNECT denial/reconnect/session evidence. `validateBusinessApplyReceipts` binds prepared canonical digest, exact source/artifacts/SQL/rollback, intended resources and actual version/readback hashes. Drift rejects; no execution is implemented. build-mode.json schemaVersion1/mode live-prod and actual compiled API/Firebase bindings are checked; successful Vite exit alone does not establish artifact readiness. Preserve current historical catalog provenance privately and refresh at cutover; approved PWA→AppSheet proof is actual DEV rendering plus PROD binding, with first real PROD view after authorized promotion.


## R053 jobs-only recovery image override

The reviewed timestamp recovery is a targeted PROD jobs image rebuild from published959b118; API and notification services retain their existing42534b image. F records the actual new jobs digest, revision, saved jobs-only plan and private recovery tfvars in the sanitized R053 deployment evidence. Actual build625ecf30/deployment receipt is project/outputs/r053-notifications-jobs/production-jobs-recovery-deployment.json: jobs00003-q4h uses11c149; reader/command/notify retain42534b. Next natural invocation verification is pending.

The shared `workers.image` value cannot by itself describe this temporary split. Future planning must preserve the actual corrected jobs image **and** the existing notification image: load the exact retained recovery inputs and review the per-service image diff. Do not apply a full plan that silently rolls jobs back to42534b or upgrades notification/API services. Keep the approved jobs-only target for this recovery; reconcile the split under an explicit later reviewed batch before unrestricted full applies. R063 (16 October 2026) reconciled it: one image on all four services and empty `runtime_image_overrides` and `workers.image_overrides`. No new generic Terraform feature, forced financial job, or full CI is required for this operator instruction. The next natural invocation must verify the live result; the earlier400 cause is still unproven.

PROD notification activation after owner-confirmed DEV phone receipt: notify00002-cth and command00004-xkp use42534b; function capture and minute recovery are enabled. DEV subscription/receipt never establishes PROD enrollment or receipt. The maintained fixed PROD capture-enable command requires explicit source/approval/recovery inputs and exact preparation/restoration in finally; keep the saved proconfig/OID/owner and restore only that marker on scoped recovery. No arbitrary test push or forced financial job.
