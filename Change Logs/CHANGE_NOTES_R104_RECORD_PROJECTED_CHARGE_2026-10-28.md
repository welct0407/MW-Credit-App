# Change notes — record the next projected charge (R104), 28 October 2026

## Purpose
Let a Partner book a loan's next projected charge as an actual charge on its future date from Upcoming Charges, without taking a payment. Owner decisions of 28 October 2026: next projected charge only, per loan row, and the confirmation shows date, principal and interest.

## Changes
- `database/migrations/V116__book_projected_charge.sql`: replaces `pwa_submit_operation_v2` and `pwa_apply_loan_source_v2`; adds operation `loan.book-projected-charge` (target loan, expectedVersion `pwa_loan_version_v2`, inputs `chargeDate`, `principalDue`, `interestDue`). The guard compares the inputs with `pwa_next_projected_charge_v1` and books with `generate_loan_charge`; a changed forecast is journaled as the existing `plan_changed` (P5B11; no new outcome code, the journal CHECK `pwa_versioned_outcome` is unchanged). No new table, column or role.
- Payment draft GET (`/api/payment-drafts/<borrower>`, `services/payment-command/draft.mjs`): `upcoming` (next projected) rows gain `bookVersion`; the read service contract is unchanged. The Upcoming Charges detail fetches it when online.
- PWA Upcoming Charges date detail: button "Record charge" / "บันทึกรายการเรียกเก็บ" on the next projected row only, with a confirmation of date, principal and interest (UX codes UPC-01 to UPC-07 from Echo); online only, not queued offline.
- Records: `project/Documents/Development_Changes.md`, `database/README.md` (V116 paragraph), `project/Documents/PWA_Data_Model_Overview.md`, and the chat rules asset `services/chat/assets/conversation-business-rules.md` (section 5; the chat image needs a redeploy to pick it up).
- Code: `database/current/public-functions.sql`, `services/chat/assets/schema-digest.json` (rebuilt at 116; the chat image needs a redeploy for it and the rules asset), `services/contracts/operation-command.mjs`, `services/payment-command/draft.mjs`, `apps/pwa/src/UpcomingCharges.tsx`, `OperationConfirm.tsx` (optional `onBlocked`), `CollectionRecords.tsx`, `SharedBorrowerDetail.tsx`, `live-main.tsx`, `live-style.css`.
- Tests: `tests/unit/operation-command.test.mjs`, `tests/unit/collection-receiving-display.test.mjs`, `tests/integration/projected-charge-payment-independent.test.mjs`, `tests/e2e/projected-charge-payment-independent.spec.ts`.
- Deploy note: `pwa_submit_operation_v2` is owned by `mw_app_<env>_journal_owner`, so V116 on Cloud SQL needs that owner's authority window, as V107 did. Promotion components: V116, command image, Hosting; the read service is unchanged.

## Owner feedback and follow-up
After trying it in DEV on 28 October 2026 the owner asked: "I want to be allowed to record multiple future charges." Orchestrator decision: Pay ahead stays one charge ahead.
- `database/migrations/V117__sequential_projected_charge_booking.sql`: new read function `pwa_next_bookable_charge_v1` (V112's next-projected read without the one-ahead gate; the offered date must be later than every recorded charge; 93-day horizon). The `loan.book-projected-charge` guard in `pwa_apply_loan_source_v2` uses it. New grant: EXECUTE to `mw_app_<env>`, none to PUBLIC. `pwa_next_projected_charge_v1` and `pwa_submit_selected_charges_v1` are unchanged.
- `services/payment-command/draft.mjs`: the payment-draft GET gains a `bookable` list (`upcoming` unchanged). `apps/pwa/src/UpcomingCharges.tsx` reads it, so after a booking the loan's next date shows the button.
- Also: `database/current/public-functions.sql`, `services/chat/assets/schema-digest.json` (rebuilt at 117), `scripts/database/Test-AccessMatrix.sql`, `tests/unit/collection-receiving-display.test.mjs`, `tests/integration/projected-charge-payment-independent.test.mjs`, `tests/e2e/projected-charge-payment-independent.spec.ts`.
- Records: `database/README.md` (V117 paragraph), `project/Documents/PWA_Data_Model_Overview.md` and the chat rules asset (section 5), which no longer say next only.

Follow-up checks (Byte, uncommitted tree on `3da056c`):

| Command | Result |
| --- | --- |
| `npm run typecheck`, `npx biome lint` | Pass |
| `npm test` | Pass, 967, 0 fail |
| `tests/integration/projected-charge-payment-independent.test.mjs` at V117 | Pass, 10/10; three sequential bookings per loan type equal the generator (daily interest 0/70 each; installment 196/14, 193/17, 189/21); with two booked future charges Loan Close charges 130 (principal plus 3 days) and writes the future interest down to 30 and 0, and Default writes both to 0/0 with the same loss posting as one future charge |
| `mw-db-ci -Group migrations` | Pass, exit 0 |
| `tests/e2e/projected-charge-payment-independent.spec.ts` | Pass, 12/12 |
| Review of V117 | Chase: no defects. Low, kept: `bookable` adds one forecast per eligible loan to each `scope=all` draft read (immaterial at two users). `Test-AccessMatrix.sql` is DEV only; in PROD the V117 self-check enforces the grant. Gap closed by the two Loan Close and Default cases above |

## Checks
All on the uncommitted tree on `9dbe334` unless noted.

| Command | Result |
| --- | --- |
| `npm run typecheck` | Pass, again after the UX fixes (Byte) |
| `npx biome lint` | Pass, 0 findings, again after the UX fixes (Byte) |
| `npm test` | Pass, 966 of 967, 0 fail (Byte) |
| Two unit files after the UX fixes | Pass, 10/10 (Byte) |
| `tests/integration/projected-charge-payment-independent.test.mjs` on a disposable cluster at V116 | Pass, 7/7 (Byte) |
| `mw-db-ci -Group migrations` | Pass, exit 0 (Byte) |
| Chat schema digest unit test | Pass (Byte) |
| Playwright projected-charge and upcoming specs | Pass, 18/18; after the UX fixes projected-charge e2e 12/12 on both projects (Byte) |
| Adversarial review of the diff and V116 | No blocking or major findings; lows kept: 401/403 on the optional offers fetch triggers authFailure (as on the payment screen), and a request queued after a connection drop is refused safely with a generic message (Chase) |
| 375px Chromium visual check | UPC-R01 (blocking, icon-only button), R02 and R03 fixed (Echo) |
| `npm run check:docs` | Pass, 0 failures, 0 warnings (Dewey) |
| Pull request `Development checks` run | Pass on `cdae59b`: run 40717152838 (check, lint, e2e 3 shards) and database groups run 40716885144 (migrations, receiving, phase5, phase8) |

## Not run
Real iPhone Safari. PROD: nothing run. DEV: API-level proof only (see DEV proof); the signed-in button click in the DEV PWA was not driven by Chase (Echo's visual pass is read-only and confirms no booking), so the button's rendering and the stale-offer message in DEV rest on Byte's Playwright specs. Chat cannot book a charge (intended).

## Recovery
Git baseline `9dbe334`. V116 is `CREATE OR REPLACE` only; rollback is a later migration that restores the V115 bodies of the two functions. V117 adds one read function and its grant and replaces `pwa_apply_loan_source_v2` again; roll back by a later migration that restores the V116 body of that function and drops `pwa_next_bookable_charge_v1`. A booked charge is an ordinary charge, and no other data changes.

## Open questions
Owner acceptance after first real use.

## Remaining work
Owner review in DEV, then promotion on the owner's instruction.

## DEV deployment (Forge, 28 October 2026, UTC)
Authority: the owner's instruction "open the PR and test it in Dev" (28 October 2026). It covers DEV only; nothing in PROD was touched, and no payment or notification was sent. Source: PR #182 head `cdae59bfeaed52f0bff5fdc0f7a2fdf4e996697a` (branch `claude/book-projected-charge`), CI green on that head (Development checks run 40717152838, database groups run 40716885144). All steps ran from a clean clone or `git archive` of that commit.

| Step | Evidence | Result | Recovery |
| --- | --- | --- | --- |
| 1. DEV database | Target verified before every write: project `clever-oasis-508610-n7`, instance `mw-credit-pg-20261017`, database `loan_manager_dev` (tunnel identity, `inet_server_addr` NULL, `cloudsqladmin` present). Read check as `codex-cloud-read`: head 115, 0 failed. Backup `Backup-ProductionPromotion.py --environment development --expected-version 115`, 15:44:04Z to 15:46:20Z. Owner window `owner-authority-cli.mjs prepare` on the journal, chat, notify, jobs and changes owners: dry run 15:46:34Z, applied 15:46:41Z to 15:46:51Z (20 statements). `Invoke-Flyway.ps1 -Environment development -Command migrate` at `cdae59b` (clean checkout), 15:46:55Z to 15:53:04Z. `info` 15:53:21Z, `validate` 15:53:33Z. Window restored 15:53:51Z to 15:54:00Z (`restore --apply`, 20 statements) | Backup: archive listing and restore passed, fingerprints match for 37 tables, dump sha256 `6f43fc97…e6e0`. Migrate: V116 2.7 s, installed 15:47:05Z, `targetSchemaVersion` 116; post-migrate application-role reconcile 524 statements, 0 violations. `info`: schemaVersion 116, all Success, 0 pending. `validate`: successful, 0 invalid. Readback: `pwa_submit_operation_v2` owned by `mw_app_dev_journal_owner` (SECURITY DEFINER, EXECUTE for `mw_app_dev`) and `pwa_apply_loan_source_v2` owned by `postgres`, both bodies carry `loan.book-projected-charge`; after the close, `postgres` memberships of the five owners are back to no inherit, no set, and no owner holds CREATE on `public`. The local admin credential file was deleted at 15:54:15Z | Restore backup `dev-refresh-6e076cf5ddd144e889bd90fd14e7e3d9` (V115) from `gs://mw-credit-operator-private-737787224638/dev-backups/`, or a later forward migration restoring the V115 bodies. Private records: `owner-authority-dev-prepare-d0d94bd0-5177-4f58-a3d4-c27d70a83424.json`, `application-role-c8ca0ba5-a6a5-4162-aae9-a308dce66322.json` |
| 2. DEV image | Cloud Build `153b3558-7248-4a7b-bcc2-bb240b27bc93` (`cloudbuild-command.yaml`, builder `mw-credit-app-build`, staging `mw-credit-app-builds-737787224638`) from a clean `git archive` of `cdae59b`, 15:44:41Z to 15:45:20Z, SUCCESS | `mw-credit-app/api@sha256:bb0062d32d019775863bf1d5d1a61d03eaf3fda8e3a2b5c524db80217d9ed0f2`; the container smoke steps passed. One image serves read, command and chat; it carries the changed command code and the chat assets at 116 | Previous image `7a193c9f…edae5` (`b3fa05b`, R102 DEV) |
| 3. DEV Terraform | Activation: `read_image`, `command_image` and `chat_image` pinned to `bb0062d3…`; nothing else changed. Previous generation `1793168697855428` (private copy `dev.activation.tfvars.pre-r104-gen1793168697855428`). `fmt -check` and `validate` passed. Plan 0 add, 3 change, 0 destroy, images only (binary sha256 `941056278…a534`, text sha256 `1753ba0c…d908`). Published as generation `1793202931182503`; applied 15:55:34Z to 15:56:10Z | Re-plan no changes. Revisions at 100%: read `00048-kv2`, command `00065-ph2`, chat `00017-64j`. Notify `00022-mjg` and jobs `00022-c97` unchanged (image `ef7beb4b…`). `/health` 200 on read, command and chat; no ERROR logs in read, command or chat since 15:55:30Z | Republish generation `1793168697855428` (the private copy) and apply |
| 4. DEV Hosting | Temporary 0600 `.env.live-dev` (gitignored): Firebase values from `mw-credit-app-dev-firebase-web` with the DEV project and auth domain asserted, plus the live R103 bundle's settings (read, command and chat origins, `VITE_COMMAND_MODE=dev-owner-testing`, `VITE_NOTIFICATIONS=enabled`); deleted after the build. `MW_RELEASE_NUMBER=R104 npm run build:live-dev` at `cdae59b` exit 0; `deploy-hosting.mjs --live-dev --check` passed (15 files); deploy 15:57:46Z to 15:57:53Z | Version `dc57e67a36b41e1a`, release `1793203072526000`. Live `build-version.json` on `dev-lm.mw-credit.com`: release R104, version `4ec2352e1f9e840f45c3ca7e`, entry `/assets/index-BQIKv1Bp.js`; the served entry bundle embeds `cdae59b` and `"R104"`; compiled origins equal the live R103 bundle's; `no-store` on `build-version.json` and `sw.js` | Redeploy version `10189f82a6043d36` (R103 DEV, release `1793198184174000`) |

Not done in this step: the functional DEV test of "Record charge" (Chase), the device pass and anything in PROD.

### Second DEV deploy (Forge, 28 October 2026, UTC): `e432e58`
Source: PR #182 head `e432e58f11accb4b2097fc950eea91214547f7cc`, CI green on that head (Development checks run 40726830816, database groups run 40726821460). Changes since `cdae59b`: V117 (`pwa_next_bookable_charge_v1`, and `pwa_apply_loan_source_v2` checks against it), the payment draft, the chat assets and Upcoming Charges. Authority: the owner's "open the PR and test it in Dev", DEV only; nothing in PROD, no payment or notification.

| Step | Evidence | Result | Recovery |
| --- | --- | --- | --- |
| 1. DEV database | Target verified as in the first deploy (project, instance, `loan_manager_dev`, tunnel identity). Read check as `codex-cloud-read`: head 116, 0 failed. Backup `Backup-ProductionPromotion.py --environment development --expected-version 116`, 16:42:30Z to 16:44:58Z. V117 changes only `postgres`-owned functions, but the DEV post-migrate reconcile needs the owner window (V107 lesson), so the same five owners were opened: dry run 16:45:11Z, applied 16:45:16Z to 16:45:27Z (20 statements). `Invoke-Flyway.ps1 -Environment development -Command migrate` at `e432e58` (clean checkout), 16:45:30Z to 16:52:25Z. `info` 16:52:36Z, `validate` 16:52:50Z. Window restored 16:53:04Z to 16:53:14Z (20 statements); the local admin credential file was deleted at 16:53:14Z | Backup: archive listing and restore passed, fingerprints match for 37 tables, dump sha256 `298added…8d31`. Migrate: V117 3.9 s, installed 16:45:42Z, `targetSchemaVersion` 117; reconcile 526 statements, 0 violations. `info`: schemaVersion 117, all Success, 0 pending; `validate` successful, 0 invalid. Readback: `pwa_next_bookable_charge_v1(text,date)` owned by `postgres`, SECURITY INVOKER, EXECUTE for `mw_app_dev` only; `pwa_apply_loan_source_v2` keeps owner `postgres` and its ACL and calls the new function; `pwa_submit_operation_v2` unchanged. Owner memberships back to no inherit, no set; no owner holds CREATE on `public` | Restore backup `dev-refresh-ae3abfce69ff4c06a37b36a12f3c2bd8` (V116) from `gs://mw-credit-operator-private-737787224638/dev-backups/`, or a forward migration. Private records: `owner-authority-dev-prepare-9a95c4b7-b895-40a5-84c6-7f18ef350803.json`, `application-role-dafe9809-58c0-43fd-9395-11bfd854dfda.json` |
| 2. DEV image | Cloud Build `fe7451cb-fd3f-4fe6-9c83-ea801c7d6dd4` (same config, builder and staging bucket) from a clean `git archive` of `e432e58`, 16:42:07Z to 16:42:40Z, SUCCESS | `mw-credit-app/api@sha256:b26eee4e7bd182c6a7baca6b083e301819d0a26512e4f5a9fcce0cc1d95adc0b`; smoke steps passed | Previous image `bb0062d3…d0f2` (`cdae59b`) |
| 3. DEV Terraform | Activation: the three image pins to `b26eee4e…`, nothing else. Previous generation `1793202931182503` (equal to the local file; private copy `dev.activation.tfvars.pre-r104b-gen1793202931182503`). `fmt -check` and `validate` passed. Plan 0 add, 3 change, 0 destroy, images only (binary sha256 `965e32f9…a549`, text sha256 `d727e07f…c4ca4`). Published as generation `1793206472642385`; applied 16:54:35Z to 16:55:12Z | Re-plan no changes. Revisions at 100%: read `00049-vjq`, command `00066-p2m`, chat `00018-cls`; notify `00022-mjg` and jobs `00022-c97` unchanged. `/health` 200 on read, command and chat; no ERROR logs since 16:54:30Z | Republish generation `1793202931182503` (the private copy) and apply |
| 4. DEV Hosting | Same route (temporary 0600 `.env.live-dev`, deleted after the build). `MW_RELEASE_NUMBER=R104 npm run build:live-dev` at `e432e58` exit 0; `--check` passed (15 files); deploy 16:56:23Z to 16:56:30Z | Version `7ddf7f8a00bb4312`, release `1793206589868000`. Live `build-version.json`: R104, version `67474b32c6373d86affb8968`, entry `/assets/index-BxN5R4YC.js`; the served entry bundle embeds `e432e58` and `"R104"`; origins unchanged; `no-store` on `build-version.json` and `sw.js` | Redeploy version `dc57e67a36b41e1a` (first R104 DEV deploy) |

## DEV proof (Chase, 28 October 2026, UTC)
Route as R101: DEV test account (`scripts/dev/claude-test-token.mjs`, token never printed, file deleted afterwards), DEV read and command services, API only. Release R104, DEV at V116 (read-only readback as `codex-cloud-read` through the Cloud SQL tunnel: `loan_manager_dev`, head 116). Synthetic data only, created through the normal flows: borrower `54e259f5-1409-42e8-afc5-13655e127672` ("R104 DEV proof synthetic", `POST /api/borrower-records`) and loan `7577b9b2-59c3-4da8-aab8-71cc6e95d7d6` (`loan.create` request `96b5dace-2366-4ef7-9d13-705a0d8263d6`: daily interest 10, principal 1000, loan date 2026-10-25, interval 7, auto charge on, disbursed from the synthetic account `R052-4G-ACCOUNT`; it auto-created first-day charge `fd6:7577b9b2-...` of 10, net-off). No PROD, no notification, no real borrower data.

| # | Proof | Result |
| --- | --- | --- |
| 1 | Payment draft `scope=all` offers exactly one entry for the loan: `cg8:36:7577b9b2-...:2026-11-01`, principal 0, interest 70, `bookVersion` `b1003ffa...3039f`. Upcoming dates 2026-11-01, 11-08, 11-15, 11-22, 11-29 each total 70.00 Projected; only 2026-11-01 matches an offer (11-08 has none). | Pass (data contract the button matches on); button rendering not driven here |
| 2 | `loan.book-projected-charge` request `804c2f9b-c625-4730-8b5b-282467bf5313` (chargeDate 2026-11-01, principalDue 0, interestDue 70, expectedVersion = `bookVersion`), 16:01:12Z: 200 `applied`, result shape standard. SQL: `Charges` row `cg8:36:7577b9b2-59c3-4da8-aab8-71cc6e95d7d6:2026-11-01`, date 2026-11-01, principal 0.00, interest 70.00 (equals the offer); loan now has 2 charges, 1 Repayment (the net-off), none paid for the booked row. Upcoming detail 2026-11-01 now `basis: Recorded` (remaining 70.00), so no button; journal row `applied`. | Pass |
| 3 | Replay of request `804c2f9b-...`: 200, body identical to the original (same `recordedAt`); still 2 charges. Fresh request `0c51ceac-e175-4d22-9a05-c85ec2c8c04e` with the old offer: 422 `command_rejected`, journaled `rejected` `source_conflict` (loan version moved). Fresh `a607a63d-384e-4f28-b41e-ecfa5260f0ce` (no offer remained, so also old version): `source_conflict`. Fresh `27783dd3-1aed-447f-a7bc-b6b894c6b5b8` with the loan's current version (read by SQL `pwa_loan_version_v2`): `plan_changed`; same with chargeDate 2026-11-08, request `d1ded602-871b-4f6f-a93a-4144e452487c`: `plan_changed`. Row count stays 2 after all attempts. The UI maps both codes to the "no longer available" message (unit/Playwright by Byte; not driven in DEV). | Pass |
| 4 | After booking the draft offers nothing for the loan (`upcoming: []`), and the 2026-11-08 detail stays `Projected` with no offer: one charge ahead stays enforced. The next date offers a button only once the booked 2026-11-01 has passed (the generator then has no charge after today). The coordinator's wording "now offers the button" does not match the one-ahead design; the proof is the refusal of 11-08 (`plan_changed`). | Pass (behaviour differs from the brief's expectation, matches the design) |

Journal readback (`pwa_payment_commands`): `804c2f9b...` applied; `0c51ceac...` and `a607a63d...` rejected `source_conflict` (read back by SQL). The two `plan_changed` outcomes (`27783dd3...`, `d1ded602...`) are from the API responses and were not read back by SQL. Three journal rows exist for this loan by SQL at the time of readback.

Removal if needed: the booked charge is unpaid and ordinary; delete it with `charge.delete` (Partner, expectedVersion of the charge) from the loan's charge record in the app, or close the synthetic loan. Nothing else was changed; the synthetic borrower and loan stay in DEV and can be deleted the same way (loan, then borrower). No existing financial row was altered.

## DEV visual pass (Echo, 28 October 2026, UTC)
Read-only, DEV test account, Chromium emulating iPhone 15 Pro Max; no booking confirmed. Pass: "Record charge" / "บันทึกรายการเรียกเก็บ" is a full-width button with text only on the next projected row (UPC-R01); confirm in EN and TH shows loan, date, principal, interest and the not-yet-due note, and Back returns to the detail; offline disables the button with the help line under it (UPC-R03). Optional, not applied: UPC-D01 the EN date in the note can wrap across two lines; UPC-D02 the disabled button is only faintly dimmed. Not checked: real Safari or Home Screen, the stale-offer message in DEV.

## Second DEV proof (Chase, 28 October 2026, UTC)
Release R104 with V117 (commit `e432e58`; DEV `flyway_schema_history` head 117 by SQL readback). Same route and rules as the first DEV proof: DEV test account, DEV command and read services, API only, SQL readbacks as `codex-cloud-read`, synthetic data only (borrower `54e259f5-1409-42e8-afc5-13655e127672`, loan `7577b9b2-59c3-4da8-aab8-71cc6e95d7d6`, 2026-11-01 already booked), no PROD, token file deleted afterwards.

| # | Proof | Result |
| --- | --- | --- |
| 1 | Payment draft `scope=all`: `bookable` offers 2026-11-08 (principal 0, interest 70) for the loan; `upcoming` (Pay ahead) offers nothing for it, so one ahead is unchanged there. | Pass |
| 2 | Book 2026-11-08, request `53e0cdfd-7778-42e3-b74f-006af4d5cebf`, applied 16:57:26Z; then from the fresh offer 2026-11-15, request `7ac67034-10d4-4b1d-8f37-06aa5d3b70d9`, applied 16:57:27Z. SQL: `cg8:36:7577b9b2-...:2026-11-08` and `...:2026-11-15`, each principal 0.00, interest 70.00 (equal to the offers and the 7-day interval arithmetic); the loan has 4 charges (first-day 10, then 11-01, 11-08, 11-15). Journal rows `applied`. | Pass |
| 3 | Before booking 11-22, request `dc5792d3-9401-47ac-87a2-7a863015301f` for 2026-11-29 (0/70): 422, journaled `rejected` `plan_changed`; Charges stays at 4 rows. | Pass |
| 4 | Upcoming detail: 11-08 and 11-15 `Recorded` (70.00); 11-22 `Projected` and the next `bookable` offer (principal 0, interest 70). | Pass |

Not driven here: the button in the DEV PWA (Byte's Playwright specs cover the UI), and Loan Close or Default with several booked future charges (Chase's review gap; V113 handles several unsettled future charges by design).

Removal: the three booked charges (11-01, 11-08, 11-15) are unpaid, ordinary charges. Delete them newest first (11-15, 11-08, 11-01) with `charge.delete` (Partner, charge expectedVersion) from the loan's charge record in the app, or close the synthetic loan. Nothing else changed; no existing financial row was altered.
