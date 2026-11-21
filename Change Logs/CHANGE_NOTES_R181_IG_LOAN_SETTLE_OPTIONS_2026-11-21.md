# Change notes — R181 Instagram options offer closing loans, 21 November 2026

## Purpose
Owner request of 21 November 2026: a borrower's slip equalled the combined payoff of two open loans but the Instagram request offered no way to close them. The request now offers closing one or several loans, on the Reviewer's approval. Promoted to PROD on 21 November 2026 under the owner's "Move to prod when ready".

Evidence (read-only, PROD, 21 November 2026): a 3,300 slip equal to both principals plus the day's interest; the review was "Pay forward options" with an empty principal list and both loans blocked with reason `settles`; only pay forward and recheck were offered.

## Changes
- Migration `database/migrations/V153__agent_receipt_settle.sql`: patches `pwa_submit_agent_receipt_v1` and its status function in place (owner and grants kept); command schemaVersion 11 adds the loans to settle, each pinned to its Loan Close quote; reviewed mode only, slip dated today; the server re-checks the loans and quotes; one atomic payment; versions 7 to 10 unchanged; no table or column.
- Command service: `services/agent-receipts/contract.mjs` accepts version 11.
- Agent: switch `loan_settle_options_enabled` (strict boolean, default off; needs `pay_forward_options_enabled` and `receipt_payment_api_enabled`; no catalogue revision). Up to three close choices under code 4 of the options request (one loan with the rest paid forward, or several loans), each confirmed by a plan read and every loan's quote; execution needs the identical settled set and plan hashes, else STALE "Loans not closed"; switch off after approval means manual. The legacy reply "4 = recheck" is withdrawn. The rebate is shown per loan from the quote.
- Data Dictionary: the entries for these routines are PROD captures; refresh them after promotion.
- Documents updated: `project/Documents/Release_Tracker.md`, `project/Documents/Development_Changes.md`, `integration-agent/README.md`, `integration-agent/docs/PARTNER_REVIEW.md`, `RECEIPTS.md`, `SHARED_RECEIPT_PAYMENT_API.md`, `database/README.md`.

## Checks
| Command | Result |
| --- | --- |
| ruff | Pass (Byte, `9c7f62dc`) |
| Agent unit tests | 1,184 OK, 84 skipped (Byte, `9c7f62dc`) |
| Biome; `tsc` for services; receipt-command and late-charge unit tests | Pass; 20/20 (Byte, `9c7f62dc`) |
| `mw-db-ci` migrations and phase8, including `Test-AgentReceiptSettle.sql` | Exit 0 (Byte, `9c7f62dc`) |
| Chase adversarial review of `fbe0a848..9c7f62dc` | Pass, no defect above Low. V153 only adds the v11 branches (7 to 10 unchanged); v11 is reviewed-only and today-only; all-or-nothing through the P4C05 rollback; owner and ACL kept; no table or column. Agent close choices and the STALE and manual paths pass; a legacy "4" on a request without close choices gives OPTIONS_REQUIRED and nothing posts; the rebate is recorded by the same server rule as the PWA |
| `test_r181_a_stale_close_choice_keeps_its_recheck_and_a_legacy_four_changes_nothing` (added in `4f89628b`) | File 33 OK, ruff clean (Chase) |
| `npm run check:docs` | 0 failures (Dewey) |

## Not run
- Low findings, recorded and not fixed: `Test-AgentReceiptSettle.sql` covers only the offset rebate path, not the expense path or two loans of one referrer in one payment (it needs the DEV command-IAM harness); a quote failure at execution goes STALE instead of retrying (fail-closed).
- The pull request's Development checks run (the one broad run) is pending.
- PROD promotion (V153, command-service deploy, agent deploy, switch) and any live financial write are not authorized yet.

## Recovery
Git baseline `main` `5825b2d6` (R180) plus the acceptance records. See the PROD promotion record below for the SQL, image and agent rollback. At promotion: `loan_settle_options_enabled` off stops new close choices at the next run; V153 only adds the v11 branch, so versions 7–10 keep working if the agent is rolled back.

## Open questions
None.

## Applied
Promoted to PROD on 21 November 2026 under the owner's "Move to prod when ready": V153 in DEV (10:21:16Z) and PROD (10:36:56Z) after verified V152 backups, the read, command and chat images in DEV and PROD, and the agent on R181 with `loan_settle_options_enabled` on (10:43:08Z). Tag `R181` (annotated, object `77363b83`) on `5042366b` by the Release tag workflow. Notify and jobs stay on R175; no Hosting, Grafana, catalogue or agent migration change.

## Closure records (Dewey)
- Data Dictionary: the two receipt routines (`pwa_submit_agent_receipt_v1`, `pwa_agent_receipt_status_v1`) reconciled from the private PROD capture at V153 with `reconcile_captures.py plan ... --postgres-only --only routine:...`, then `apply`; the validator reports 0 errors across 505 documents; sanitized observations are in `project/outputs/dictionary-r181-20261121/`.
- Environment inventory: the V153 rows, the R181 Cloud Run pin rows for DEV and PROD (the R176 rows are now previous) and the agent host rows; component versions regenerated (`render --write`, `render --check`).
- Pruned at closure (Open R182 plus the three newest Released: R181, R180, R179): `Change Logs/CHANGE_NOTES_R178_FTR_CHART_30_DAYS_2026-11-20.md`, with its links repointed to permalinks at `5042366b`; the R178 follow-up row of the open development changes is removed.
- Drift (`drift --env prod`): 0 drift, 7 unverified. The live read, command and chat services match R181 `5042366b`; the credentialed facts (schema, agent, Grafana tags, notify and jobs) were not observed in this session and are recorded in the promotion record below.

## Remaining work
Owner acceptance of R181, written into the next release's closure pull request. Chase's two Low findings (the offset-only rebate test, STALE on a quote failure) stay recorded. Watch for the first natural close through code 4 in PROD.

## PROD promotion record (Forge, 21 November 2026 UTC)
Authority: owner, 21 November 2026, in session: "Move to prod when ready"; it covers V153, the backups, the standard owner windows and these records. Scope: V153 (the two receipt functions patched in place; no table, column or grant), `services/agent-receipts/contract.mjs` v11 (derived changed roles: read, command, chat), the agent code and the switch `loan_settle_options_enabled`. No Hosting, Grafana, catalogue, agent migration or financial write.

Package: `main` 5042366bb80eb07a2c42638ba218b99bdd55f4a9 (PR #378, tree equal to head abd58ab4). CI: Development checks 44892813399; Database migrations 44892808940 (rebuild migrations, phase5, phase8, receiving: the V153 proof); source tar sha256 1516c69eb60741e55a18c4c33ed699439999269feb1e901443718212c1508df2. Baseline: tag R180; schema 152 in DEV and PROD; read, command and chat on R176 images, notify and jobs on R175; agent R179 `7ab7b436`; `pay_forward_options_enabled` and `receipt_payment_api_enabled` true.
Target: project clever-oasis-508610-n7, instance mw-credit-pg-20261017, `loan_manager_dev` and `loan_manager_prod`, VM vm-mw-credit-agent. Private package: `gs://mw-credit-operator-private-737787224638/promotion-packages/r181/` (24 objects).

| Step | Result |
| --- | --- |
| Clean detached source, `npm ci` | 10:13Z |
| PROD backup (V152) | 10:14:40Z to 10:17:31Z; `prod-promotion-4f765593997840bc9bdcd07b163db1a0`; dump sha256 e1b391572557439355dcbd65af828a834efebd62da96b459071dc7b739b1a1f8; isolated restore, 42 table fingerprints ok; in `prod-backups/` |
| DEV backup (V152) | 10:17:34Z to 10:20:13Z; `dev-refresh-8f70b9b863ce4f06b6c5ddb07e236cb5`; dump sha256 ef50d6d9e03aa567b2df5d547147101124580a63fa3143a31961b1a1536c7271; restore and 42 fingerprints ok; in `dev-backups/` |
| DEV six-owner window, V153 | Prepared 10:20:38Z to 10:20:50Z; `Invoke-Flyway.ps1 migrate` 10:20:54Z to 10:28:46Z; V153 installed 10:21:16.43Z (3.3 s, checksum 1696016983); reconcile 0 violations; restore 10:29:01Z to 10:29:12Z (24 statements); head 153, 0 failed; both functions owner `mw_app_dev_journal_owner`, SECURITY DEFINER, ACL unchanged |
| DEV images | Build `e09e068f-509c-44fe-87be-979d7e2731b7`, digest `sha256:7e6485287b83874de2f520b14c81c0e22066682b3fde8dc29f490aa6179de41b`; before-plan no change; plan 0/3/0 (image only: read, command, chat); apply 10:31:47Z to 10:32:24Z; read `00102-nn2`, command `00119-mlc`, chat `00071-zp2`; `/health` R181 `5042366b`; command unauthenticated 401; no ERROR logs; re-plan clean |
| PROD release file | `Invoke-CloudFlyway.py prepare` 10:33:58Z to 10:34:26Z (153 migrations) |
| PROD owner window, V153 | `mw_app_prod_journal_owner` prepare 10:35:57Z to 10:36:04Z; CONNECT preflight 10:36:10Z; check 10:35:11Z to 10:35:40Z (pending [153], 0 writes); apply 10:36:15Z to 10:37:33Z (1 migration); V153 installed 10:36:56.56Z; window restore 10:37:37Z to 10:37:43Z (4 statements); verify dev and prod: schema 153, nothing pending, PROD 0 failed; both functions owner `mw_app_prod_journal_owner`, SECURITY DEFINER, ACL md5 ddb2daad… unchanged |
| PROD images | Build `66787013-c7ec-4844-beac-b1df16fd9bc3`, digest `sha256:01a99fcae75260197d83074503e3ac41f690d701d5fb0debec2ab4c95f09fa82`; before-plan no change; plan 0/3/0 (image only: chat, command, read); apply 10:40:13Z to 10:40:49Z; read `00068-m8n`, command `00073-cpn`, chat `00052-pk4`; notify `00032-khj` and jobs `00032-9nr` unchanged on `237a3d22`; `/health` R181; command unauthenticated 401; no ERROR or 5xx; re-plan clean |
| Agent | Checkout `5042366b`; dry run (changed `cli`, `config`, `partner_review`, `receipt_api`, `review_cycle`, `review_proposal`; units unchanged; schema 15; catalogue 47); config backup `/root/config.json.pre-r181` (key added off); freeze 10:42:26Z (`runtime-20261121T104226355055Z`, metadata sha256 0f625a76…); install; activate; receiver ready R181 `5042366b` (started 10:42:43.88Z); the temporary operator file removed 10:42:46Z |
| Switch on | `config-only-change.py apply --tag r181-switches` 10:43:08Z (backup `/root/config.json.pre-r181-switches`, config sha256 317ca11a…); `check`: `loan_settle_options_enabled` and `pay_forward_options_enabled` true; recognizer and relay R181; problems none |
| Run after the switch | Receipt cycle COMPLETED 10:43:39.96Z exit 0 (normal trigger); no warnings or failed units since the freeze; temporary credential file, worktree and extracted source removed |
| Tag | `R181` on 5042366b by the Release tag workflow |

Recovery: SQL is forward-only (a later migration restoring the V132 bodies; restore points the V152 backups above). Images: `production.activation.r176.tfvars` (read, command and chat on `90ccf6fe…`) and `dev.activation.r176.tfvars` (`8500c1a1…`), image-only plans. Agent: `deploy-runtime.py rollback --commit 7ab7b4363158088733d4e6f3b3f8540b947418de`; config `/root/config.json.pre-r181` or `config-only-change.py restore --tag r181-switches`.
