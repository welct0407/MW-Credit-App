# Change notes — chat group lines re-pin their loan version (R139), 10 November 2026

## Purpose
After R138 the owner showed a PROD chat card where two "Edit loan · Automatic charges Yes to No" lines failed `source_conflict`; the owner then said "Yes, fix it and push into production. I've manually updated the flags for the two loans". A group confirm must not fail a loan line only because an earlier line of the same card changed that loan.

## Changes
- Cause (Archie, read-only PROD logs): a group of 32 lines was created at 08:48:50Z and confirmed 26 s later. Lines 1 to 10 (`charge.delete`) were done, lines 11 and 12 (`loan.update`) failed `source_conflict`, lines 13 to 32 (`charge.create`) were done. `loan.update` pins `expectedVersion` when the card is proposed. `pwa_loan_version_v2` hashes the loan row plus its charges and repayments, so the earlier deletes changed it. `pwa_charge_version_v2` includes the loan row, so reordering the lines cannot fix it, and the `DUPLICATE_TARGET` rule only compares targets. Pre-existing since R106 D12; the owner corrected the two flags by hand.
- Fix (Byte, chat service only; no SQL, PWA or infrastructure change), reworked after Chase's first review (6 defects, now addressed; a lab on V141 showed that a charge delete or create changes only the loan's version, while a loan-row update changes the versions of all its charges). The first design, a field-by-field comparison, is replaced by carry-forward versions in `executeGroup` (`services/chat/proposals.mjs`): at Confirm start the card reads the version of each affected line, which must equal the pinned one (else `source_conflict` as before). Around each earlier line it reads again and carries the new version forward only if the before-read matched the carried one, so only the group's own writes are absorbed. Scope: a loan line (`loan.update`, `loan.delete`, `loan.undo-default`) is carried after earlier charge lines on its loan (a moving `charge.update` counts for both loans); a charge line (`charge.update`, `charge.delete`) only after a `loan.update` on its loan; `charge.create` is unversioned; payments affect nothing; old cards without `card.target.loanId` are never carried. An unknown outcome or a failed read stops carrying: the line posts its pinned version and the database refuses it. First attempt only, with the Partner's own token, same request id and inputs; the log event `chat_proposal_repinned` carries the from and to versions. Not re-pinned: `loan.close`, `loan.book-projected-charge`, `loan.default` and `loan.generate-charge`.
- Charge cards now carry `card.target.loanId`, so Confirm all knows which loan a done `charge.delete` changed (`services/chat/proposals.mjs`, `services/chat/handler.mjs`).
- Tests (Byte): `tests/unit/chat-proposals.test.mjs`, `tests/unit/chat-handler.test.mjs`.
- Records: `project/Documents/Solution_Design.md` (R106 group paragraph), `project/Documents/Release_Tracker.md` (R139 scope), `project/Documents/Development_Changes.md`.

## Checks
| Command | Result |
| --- | --- |
| lint, typecheck (Byte) | Pass |
| Focused chat unit tests (Byte, after the rework) | Pass, 85 of 85 |
| `npm test` (Byte, after the rework) | Pass, 1270 pass, 1 skip |
| Chase diff review | First review: 6 defects, fixed by the rework. Re-review: defects 1 to 6 closed, no unsafe holes. Low notes, accepted: a split Confirm ("Confirm N remaining") loses the carry and fails as before; a large mixed group costs extra time (one version read before and after each earlier line); the lab used raw DML |
| CI, PR #279 head `d1acb883` | Pass: `Development checks` run 42789039109 (check and lint on `d1acb883`; e2e reused from run 42770027498 on `541a47e6` and terraform from run 42763518963 on `456a6c9`, no relevant change since), `Database migrations` run 42789008987 |
| DEV deployment and test | Pass, see DEV deployment evidence |
| PROD promotion | Pass, see the PROD promotion record below |
| `npm run check:docs` | Pass, 0 failures, 0 warnings (Dewey, closure) |

## DEV deployment evidence
Forge, 10 November 2026 (UTC). Package: PR #279 head `d1acb883`; CI as in the Checks table.
- Flyway DEV 141 `verify` at 09:21:19Z (no SQL in this batch).
- Image: Cloud Build `75577487-9432-4f13-bee5-cb62a35ea523`, digest `sha256:33141a4c0e70eade961357def363674ffe704da0b99564a3879b4d1ddb58e2da`.
- Terraform: plan 0 add, 3 change, 0 destroy (image only: read, command, chat), applied 09:24:10Z to 09:24:47Z, clean re-plan; settings generation `1794302647577685` (previous `1794290965690897`). Revisions: read `00080-x9v`, command `00097-zqd`, chat `00049-hh6`.
- Hosting unchanged (`d48809b344706a34`). Smoke passed.
- Rollback: settings generation `1794290965690897`.
- Functional test (Chase, restarted worker): one mixed card on the synthetic DEV loan `f500147e-…`: 3 `charge.delete`, 1 `loan.update` (Automatic charges off), 1 `charge.update` and 3 `charge.create`; proposal `f5b64cd2-…`. Confirm at 10:08:17Z returned 200 in 6.1 s (request `cb0f131e-ffa0-4762-9f8b-0727c99396ca`) with 8 of 8 done. The log event `chat_proposal_repinned` appeared twice (`loan.update` `f1fb22a6…` to `6d8d362e…`, `charge.update` `5cd16cba…` to `e4250d55…`); a charge after a charge needed no re-pin; no ERROR logs. A second card (`1346796a-cc81-4e2e-92d4-3e7545f93853`) restored Automatic charges to on. Left in DEV: the 97 "R138 DEV test" charges (1 to 3 deleted, number 4 at 2 baht) and 3 "R139 DEV test 1 to 3" charges.

## Not run
No authenticated PROD read, financial write or forced notification. No e2e run for this batch (the PWA is unchanged; CI reused the earlier e2e and terraform runs). A split Confirm with a mixed group was not tested (it fails as before by design).

## Recovery
Git baseline: `afd5d329` (the commit before this batch). Service only: roll back the chat, read and command images through the settings generation (DEV `1794290965690897`, PROD `1794295000512841`). A card proposed before the change behaves as before, except that it is re-pinned when confirmed after the deploy.

## Open questions
None.

## Remaining work
- Owner acceptance in PROD: the first real mixed group (for example loan flags with charge deletes in one card).
- Accepted limits: a millisecond race window around an earlier line's POST; after "Confirm N remaining" the lines done in the earlier run are not carried, so such a line fails as before R139; extra read time on a large mixed group.
- Known limit: `loan.close`, `loan.book-projected-charge`, `loan.default` and `loan.generate-charge` are not re-pinned, so such a line after a change to its loan in the same group can still fail `source_conflict`; the Partner re-proposes it.
- The DEV test left 97 "R138 DEV test" and 3 "R139 DEV test" synthetic charges on the DEV test loan.

## PROD promotion record (Forge, 10 November 2026, UTC)
Authority: the owner's instruction of 10 November 2026, "Yes, fix it and push into production.", relayed by the orchestrator as the scoped PROD approval for R139: the changed images, the settings apply, Hosting and the technical records. No SQL, so no backup and no owner window. No payment, notification or job was forced, and no financial correction or other data write was made; the smoke is read-only. No secret value, token or borrower data appears here. Pins are in the [environment inventory](../project/Documents/Environment_Inventory.md); private records are in `gs://mw-credit-operator-private-737787224638/promotion-packages/r139/`.

| Step | Result |
| --- | --- |
| Freeze | Release R139; package `d1acb8831f5cf796b0b1a3abaddb7de0abd9e038` (PR #279 head), merged to `main` as `69fda391` (about 10:20Z). Baseline R138 `541a47e6`. Next unused number R141 (R140 opened by the closure pull request) |
| Target | Project `clever-oasis-508610-n7`, instance `mw-credit-pg-20261017`, database `loan_manager_prod`, services `mw-credit-app-*-prod`, Hosting site `mw-credit-prod-737787224638` |
| Baseline capture | Flyway 141 `verify` at 10:12:41Z. Revisions read `00052-t7m`, command `00057-887`, chat `00036-zwl` on `843de145…`; notify `00029-2nb`, jobs `00029-9dp`; settings generation `1794295000512841`; Hosting `31c51ca5c1242984` |
| Image | Cloud Build `66515db2-e588-497f-bb02-83dc0c4f083c` (10:13:02Z to 10:13:40Z), digest `sha256:23478fa6129986b430ce3fde3e42e7616fd4176bbe844559d24363fce11b3aa2` |
| SQL | None; PROD stays at Flyway 141 |
| Terraform | Plan 0 add, 3 change, 0 destroy (image only), applied 10:15:58Z to 10:16:36Z, settings generation `1794305807490273` (previous `1794295000512841`), re-plan clean. Revisions read `00053-rhb`, command `00058-wll`, chat `00037-mvw`; notify and jobs unchanged |
| Hosting | Generic runner, 10:17:50Z to 10:18:36Z: version `daa9c69a7ae05e1c`, release `1794305909471000`, build-version R139 `023d3d56294554c62bef028e`, entry `/assets/index-C3kZiGrD.js` |
| CI receipts | `Development checks` run 42789039109 on `d1acb883`; e2e run 42770027498 on `541a47e6` and terraform run 42763518963 on `456a6c9` (no relevant change since); `Database migrations` run 42789008987 |
| Smoke (read-only) | Passed; no ERROR logs 10:12Z to 10:19:10Z |
| Rollback | Activation `before-r139` (settings generation `1794295000512841`, images `843de145…`), then Hosting `31c51ca5c1242984`; no SQL |

### Deviations
- None recorded.

### Limitations
- No authenticated PROD read, financial write or forced notification; PROD owner acceptance is pending (the first real mixed group).

### Tag record
Annotated tag `R139` on `d1acb8831f5cf796b0b1a3abaddb7de0abd9e038` (the PR #279 head, on `main` through merge `69fda391`) through the Release tag workflow, run [42798258368](https://github.com/welct0407/MW-Credit-App/actions/runs/42798258368), succeeded.

### Closure notes
- Acceptance: PROD acceptance by the owner is pending (the first real mixed group).
- Data Dictionary: not refreshed. No SQL, so no relation record changes.
- Team note: after a session container restart Chase, Forge and Dewey were restarted under their names. The earlier Dewey worker was gone, and this closure was written by the restarted Dewey.

### Prune (closure)
Deleted as outside the retention window (Git keeps them, last present at `69fda391`): `Change Logs/CHANGE_NOTES_R136_DAILY_INSTALMENT_ROLLOVER_2026-11-08.md` and `Change Logs/CHANGE_NOTES_R136_DAILY_INSTALMENT_ROLLOVER_DESIGN_2026-11-08.md`. Their inbound links (the environment inventory, release tracker, `database/README.md` and `project/outputs/r136-daily-instalment-rollover/DESIGN.md`) now point to commit permalinks at `69fda391`. The window after this closure is R139, R138 and R137. The R136 dictionary evidence `project/outputs/dictionary-r136-20261109/` (`coverage.json`, `plan.json`, `production-postgresql-observations.json`) became uncited with the R136 notes and is deleted (R137 precedent for R131); the dictionary YAML `source` fields keep the old path as provenance text. The Development Changes row for R139 is removed (the tracker row links this record).
