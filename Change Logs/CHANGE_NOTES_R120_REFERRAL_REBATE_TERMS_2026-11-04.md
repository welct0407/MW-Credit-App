# Change notes — R120 referral rebate overrides, 4 November 2026

## Purpose
The owner asked on 4 November 2026 for per-referrer overrides of the referral rebate and accepted the design the same day. The rebate stays 10% of interest and late charges received, at most ฿1,000, unless the referrer's own Borrower record sets a different rate or maximum. Status: Open (in development).

## Changes
Scope:
- **Rule.** Rebate = least(round(profit x rate / 100), cap). The rate (whole percent 0 to 100) and the cap (whole baht, 1 or more) come from the referrer's Borrower row; null means the default (10 and 1,000). Rate 0 is valid and means no rebate for that referrer. Profit is unchanged (interest plus late charges received, R118). The terms are read when the close posts; a later change never restates a booked rebate; a re-close or correction re-post uses the terms current at that moment.
- **Authority.** The owner's instruction of 4 November 2026 authorizes the four columns and the migration. Production promotion still needs the owner's "move to prod" or equivalent, after a verified backup at V134. No financial correction, forced notification or backfill.
- **Images and hosting.** Read, command and chat images and Hosting. Notify and jobs stay on R119. No VM or integration-agent change. No Metabase change.

Design decisions (accepted by the owner):
| Decision | Choice |
| --- | --- |
| Granularity | Whole percent and whole baht only |
| Rate 0 | Allowed; no rebate for this referrer |
| No maximum | Not offered; blank means 1,000 |
| Who edits | Any Partner, like every other borrower field |
| Historical re-post | Uses the referrer's current terms |
| Defaults | Constants in `referral_rebate_terms`, not a settings table |
| Applied terms | Stored on the expense row |

Data model (V135, four nullable columns, no table, no index, no backfill):
- Borrowers `"Referral Rebate Rate"` (numeric, CHECK null or 0 to 100 and whole) and `"Referral Rebate Cap"` (numeric, CHECK null or at least 1 and whole).
- Business Expenses `"Rebate Rate"` and `"Rebate Cap"` (numeric, the terms applied when booked; null before V135). New rows carry Rule Version `REFERRAL_REBATE_V2`; V1 rows are untouched.
- CHECK constraints `borrowers_referral_rebate_rate_check` and `borrowers_referral_rebate_cap_check`. `"Business Expenses_check2"` (from V15) is replaced to accept `REFERRAL_REBATE_V1`, or `REFERRAL_REBATE_V2` with both terms present; V135 stops if the live definition differs from V15.
- The integration agent is unaffected: it reads Borrowers at table level by named columns.

Files and objects:
- `database/migrations/V135__referral_rebate_terms.sql`: new pure function `referral_rebate_terms(p_referrer text) RETURNS jsonb` returning `{rate, cap, custom}` (STABLE, holds the defaults; EXECUTE for the app role only; excluded from the chat schema digest); redefines `create_referral_rebate` (terms, applied values on the expense, `REFERRAL_REBATE_V2`), `pwa_referral_rebate_projection_v1` (adds `profit`, `rate`, `cap`, `custom`), `pwa_submit_operation_v2` (optional keys `referralRebateRate`, `referralRebateCap`, null or whole number in range, else `invalid_request`, returned as 400) and `pwa_borrower_version_v2` (both values in the hash, so a concurrent terms edit is `source_conflict`). A terms change between quote and close rolls the close back with P4C05, surfaced as `plan_changed`, as any drift does.
- `services/business/borrowers.mjs` (optional fields, validation, `versionSql` in the same key order, detail read and effective terms), `services/business/expenses.mjs` (terms through `to_jsonb(e)`), `services/payment-command/store.mjs` (pass `profit`, `rate`, `cap`, `custom` into the Loan Close `rebate` object).
- `apps/pwa/src/BorrowerRecord.tsx` ("Referral rebate" group after Referrer), `LoanClose.tsx` (basis line), `ExpenseRecords.tsx` ("Rebate terms" row), `offline-sync.ts` (optional-field merge), offline dataset files (snapshot carries the values). Offline tag `business-offline-v7` to `business-offline-v8`, so phones rebuild once.
- Chat: `services/chat/assets/command-catalogue.json` (two inputs on `borrower.create` and `borrower.update`, labels "Referral rebate rate (%)" and "Referral rebate maximum (฿)"), `conversation-business-rules.md` (section 6 and decision 15.1), schema digest regenerated at 135 (`referral_rebate_terms` excluded) (starts a new chat history epoch, as R118 and R119 did).
- Tests: SQL lab V135 case file or an extension of `Test-RebateOffset.sql`; `operation-command.test.mjs`, `phase5-borrower-independent.test.mjs`, `settings-independent.test.mjs`, `rebate-offset-independent.test.mjs`, `expense-display-read.test.mjs`; e2e `phase5-borrower-independent.spec.ts` (label order) and the Loan Close and expense detail specs.
- Docs: `database/README.md` (Byte), Release Tracker, Development Changes, Solution Design, PWA Data Model Overview, this note. The Data Dictionary entries (`borrowers.yaml`, `business-expenses.yaml`, the routine entries for `create_referral_rebate`, `pwa_referral_rebate_projection_v1`, `pwa_submit_operation_v2`, `pwa_borrower_version_v2` and the new `referral_rebate_terms`) are refreshed from a PROD capture after V135 is applied, per the dictionary tools README; see Remaining work.

UX (Echo to review wording):
| Code | Decision |
| --- | --- |
| BR-1 | Borrower record: group "Referral rebate" after Referrer, before Borrower Note, in view and edit. View shows "Default (10%)" / "Default (฿1,000)" or "15% · custom" / "฿1,500 · custom". Edit: numeric inputs with placeholders 10 and 1,000 and a help line "Leave blank to use the default (10%, maximum ฿1,000)." Clearing a field returns that term to the default (stored as null). |
| BR-2 | Inline validation before the request: "Enter a whole percent from 0 to 100", "Enter a whole baht amount above 0". The API answers 422 `invalid_request`. |
| LC-1 | Loan Close: a `field-help` basis line under the "Referral rebate ฿X" legend, "10% of ฿2,400 interest and late charges, maximum ฿1,000", or with custom terms "15% of ฿2,400 ..., maximum ฿1,500 · custom terms for <referrer>"; Thai wording as in the design. |
| EX-1 | Expense detail: "Rebate terms" row after Gross Profit Basis ("15% · maximum ฿1,500"), "—" for rows booked before V135. |
| BR-8, BR-9, LC-4 | Echo's built-UI findings on DEV; Byte is fixing them (see Remaining work). |
| NONE | Receive payment, chat card, agent and push take the amount from the projection or expense and need no new text. The referred borrower's record, Collection, Dashboard and reports are unchanged. |

Out of scope: showing the terms on the referred borrower, per-loan terms, restating booked rebates, backfill, a settings page for the defaults, push or agent wording beyond the catalogue inputs and business rules text.

## Checks
| Command | Result |
| --- | --- |
| `Test-MigrationsCloud.py` chain (Byte, c9c1c0e) | Pass: 135 migrations, the SQL batch including `Test-RebateOffset.sql` section 5, the access matrix, 9 concurrency suites, checksum tamper rejected, `public-functions.sql` matches the rebuild |
| `tests/integration/rebate-offset-independent.test.mjs` (Byte, c9c1c0e) | 16/16 |
| `Run-Phase5` and `SettingsOnly` (Byte, c9c1c0e) | 10/10 and 4/4 |
| Unit tests (Byte, c9c1c0e) | 1139 pass |
| Typecheck, lint, `npm run check:docs` (Byte, c9c1c0e) | Pass |
| The two changed Playwright specs (Byte, c9c1c0e) | 67/67 |
| `Run-Phase5` R120 V96 compatibility (Chase, c9c1c0e) | 2/2 |
| Full borrower test family (Chase, c9c1c0e) | 11/11 |
| Chase adversarial review (c9c1c0e) | Pass |
| CI `Database migrations` run 41806922523 (head 5f3a34b) | Pass (guards and 4 rebuilds) |
| CI `Development checks` run 41806917499 (head 5f3a34b) | Pass (lint, check, 3 e2e shards; terraform skipped) |
| DEV: V135, images, Hosting, smoke | Pass (Forge), see the DEV promotion record |
| DEV acceptance, API as the DEV test Partner (Chase) | Pass, details below |
| Push wording, read-only render of `pwa_notify_content_v4` on DEV events (Forge) | Pass: "Rebate ฿90 / ฿75 / ฿40 to R120 Test Referrer, transfer from Lisa"; the offset push reads "Rebate offset ฿60 · from loan …". Nothing was forced; the ordinary DEV dispatcher had already sent them |
| Echo built-UI check on DEV, 375 px and desktop, English and Thai | Pass; findings BR-9, LC-4, BR-8 and the BR-1 error style are being fixed by Byte |

DEV acceptance results:
- Custom terms 15 and 1,500: set, read back, version OK.
- Loan Close pay-out: expense ฿90 on profit 600, V2 with 15 and 1,500.
- Receive payment settle-and-close: ฿75 on 500.
- Terms cleared: defaults, ฿40 on 400 with 10 and 1,000.
- Offset path with custom terms: ฿60 offset fully covered, payment `ro122:pwa:7df58fa0…`, expense V2 with 15 and 1,500.
- Validation: 101, cap 0, "15" and 12.5 all return 400 with nothing written.

## Not run
- The remainder-payable offset case on DEV (covered by lab RO-T).
- A push on a device.
- No PROD action; PROD promotion needs the owner's instruction. No PROD data, payment, forced notification or financial correction is part of this batch.
- The checks after Byte's fixes for BR-9, LC-4, BR-8 and BR-1 (to be added with their commit).

## Recovery
- Before deployment: revert the commit.
- Deployment order risk: apply the images right after V135.
- Version change: every borrower and expense version changes once at V135, so phone edits queued before V135 hit `source_conflict` once and recover through "Check current".
- After deployment: V135 adds nullable columns and redefines functions; with no override set every close behaves as before. Pre-R120 images ignore the new columns. Restore from the verified PROD backup at V134 if the migration itself must be undone (backup reference pending, recorded in the promotion record).

## Open questions
None. Production promotion needs the owner's "move to prod" or equivalent. Accepted limitations (Chase's review):
- The drift guard (P4C05) covers only the offset path, so a terms change between quote and close on the pay-out path books the current amount (same as before R120).
- A rate set to 0 after a quote closes with no rebate.

## Remaining work
- Byte's fixes for BR-9, LC-4, BR-8 and the BR-1 error style, then a Hosting redeploy; add its id and the re-run checks.
- Data Dictionary refresh from a PROD capture after V135 is applied (the design approval covers the new `referral_rebate_terms` routine entry; deferral to closure accepted).
- Closure: promotion record, tag record, freeze pin and prune in the closure pull request.

## DEV promotion record (Forge, 4 November 2026, UTC)
No secret value, token or borrower data appears here. Pins are in the [environment inventory](../project/Documents/Environment_Inventory.md).

| Item | Result |
| --- | --- |
| Scope | V135, the read, command and chat images and DEV Hosting labelled R120, from `5f3a34b`. Notify and jobs stay on R119 |
| Backup at V134 | 09:25:31Z, listing and restore passed, 38 table fingerprints matched, folder `dev-refresh-77ebe5162593405b9906aa548672b7dc` |
| Image | Cloud Build `70e0a4b1`, digest `3556d8ec…ddde8` |
| Owner window | The five DEV owners, 20 statements, 09:33:58Z to 09:42:04Z; readback false |
| V135 | Installed 09:34:18Z (6.1 s, checksum 1602217018), reconcile 0 violations, validate pass, head 135 |
| Readback | SQL readback OK; `referral_rebate_terms` has EXECUTE for `mw_app_dev` only |
| Terraform | 0 add, 3 change, 0 destroy (image only), applied 09:41:05Z to 09:41:43Z, re-plan clean, settings generation `1793785264889957` (previous `1793764420940700`) |
| Revisions | read `00069-l8g`, command `00086-dkz`, chat `00038-p57` |
| Hosting | `9d8740e03edcaec0`, live 09:43:43Z |
| Smoke | Pass |
| Limitation | A 7.5-minute borrower-edit gap, because the post-migrate reconcile took 6.5 minutes; no edit was attempted. PROD has no reconcile step |
| Rollback | Settings generation `1793764420940700` plus Hosting `def99383e9f7b534`, or the V134 backup |

Synthetic DEV records left in place, all marked "R120 DEV acceptance synthetic":
- Borrowers: R120 Test Referrer `a47075fa…`, Referred A `e767c09e…`, Referred B `2fec85c3…`, Referred D `1095f411…`.
- Open loans: `9fe89940…`, `cfc74bda…`, `4345f6a4…`.
- Closed loans: `4e17a415…`, `5b4b3a5c…`, `40706a26…`, `c8dd59bb…`.
- Their rebate expenses and payments.
