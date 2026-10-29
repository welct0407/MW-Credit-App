# Change notes — whole-number amount inputs (R105), 29 October 2026

## Purpose
Make every numeric amount field a whole number with the iOS numeric keypad, so entry on a phone is quicker and cannot carry stray decimals. PWA only: no SQL, API, infrastructure or VM change.

## Changes
- New: `apps/pwa/src/whole-number-input.ts` (whole-number helper: numeric keypad, digits only), `tests/unit/whole-number-input.test.mjs`.
- Changed: `apps/pwa/src/LoanForm.tsx`, `loan-form-values.ts`, `ChargeForm.tsx`, `ManagementAssessments.tsx`, `ManagementFinancialForm.tsx`, `ManagementForm.tsx`, `live-style.css`.
- Tests changed: `tests/unit/loan-form-values.test.mjs`, `tests/e2e/phase5-borrower-independent.spec.ts`, `back-consumers-independent.spec.ts`, `phase5-final-ui-independent.spec.ts`. The management P6 T9 test (Sort Order minus) is in `phase5-final-ui-independent.spec.ts`.
- Behaviour: all numeric amount fields are whole numbers; no native `pattern`, the app shows "Whole baht only. Enter amounts without decimals or separators."; leading zeros are rejected.
- Payment interval: minus and plus stepper (step 1, minimum 1), capped at 2147483647. A plus or minus on a legacy decimal rounds half-up first (1000.50 + 500 gives 1501).
- Charge form: blank Principal Due and Interest Due count as 0, placeholder "0".
- Legacy decimals that are unchanged save as they are on the loan, charge, assessment and financial forms. Auto daily interest rounds half-up to whole baht.
- After a failed loan Save the error scrolls into view and the first failing field gets focus and `aria-invalid` (UX-NUM-05). Sort Order allows a leading minus.
- Kept decimal: Minimum Daily Profit Rate (percentage).
- No SQL: server contracts already accept integers (Archie, `database/current/public-functions.sql`).
- Known limitation (pre-existing): a negative Interest Due cannot be typed on the iOS numeric pad.
- Records: `project/Documents/Development_Changes.md` (R105 row), `project/Documents/PWA_Data_Model_Overview.md` (input precision sentence). Unaffected: dictionary (UI-only), Solution Design, Release Tracker, Environment Inventory.

## Checks
Base `65b4838`; source PR #187, head `4768882` (merged as `cf01602`).

| Command | Result |
| --- | --- |
| Byte lint | Pass, clean (572 files) |
| Byte typecheck | Pass, clean |
| `npm test` | Pass: 984 pass, 1 skip, 0 fail |
| Borrower spec (desktop and mobile chromium) | Pass, 76/76 |
| Management P6 T9 spec | Pass, 2/2 |
| Other touched specs | Pass, 10/10 |
| Chase adversarial review | No blocking defects; 4 low findings (2 fixed, 2 accepted: the iOS negative Interest Due limit and legacy-decimal behaviour above) |
| Echo Pixel 7 viewport check | Pass; UX-NUM-05 fixed |
| `npm run check:docs` | Pass, 0 failures, 0 warnings |
| Pull request `Development checks` (PR #187) | Pass, run 40909389936 green |

## Not run
The real iPhone keypad check (DEV proof used Playwright Chromium Pixel 7). A skipped check is not a pass.

## Recovery
Revert the batch's Git commit. No database, infrastructure or deployed-artifact change exists to undo. Hosting rollback: PROD version `8f6a70cf7235c8be` (R104), DEV version `7ddf7f8a00bb4312` (R104); details in the sections below.

## Open questions
None.

## Remaining work
Owner acceptance: the first real PROD use on the phone (including the iPhone numeric keypad).

## DEV deployment (Forge, 29 October 2026, UTC)
Authority: the owner's "Open the PR and test it in Dev". Source: PR #187 head `47688821f939418584506245548d81dd17436bc6`, CI run 40909389936 green. Only step "4. DEV Hosting" ran (no database, image or Terraform).

| Step | What ran | Result | Recovery |
| --- | --- | --- | --- |
| 4. DEV Hosting | Temporary 0600 `.env.live-dev` from `mw-credit-app-dev-firebase-web`; DEV project and auth domain asserted; live R104 bundle settings (`VITE_COMMAND_MODE=dev-owner-testing`, `VITE_NOTIFICATIONS=enabled`); env file deleted 16:24:58Z. `MW_RELEASE_NUMBER=R105 npm run build:live-dev` at `4768882`, exit 0, 16:24:30Z to 16:24:52Z. `--check` passed (site `mw-credit-app-dev-737787224638`, 15 files). Deploy 16:25:09Z to 16:25:17Z | Version `d32bba19f075953b`, release `1793291116746000`. Live build-version on `dev-lm.mw-credit.com`: R105, version `4bbb8e82b3db592e0253b396`, entry `/assets/index-D2EdhK_0.js`, byte-identical, contains `4768882` and "R105". Origins and Firebase client values equal R104's by hash | Version `7ddf7f8a00bb4312` (release `1793206589868000`, R104) |

## DEV proof (Chase, 29 October 2026, UTC)
Signed-in DEV PWA, Playwright Chromium Pixel 7, the DEV test account (token file deleted), synthetic R104 loan `7577b9b2-59c3-4da8-aab8-71cc6e95d7d6`.
- **Loan form:** amount fields text and numeric, no step. 10.5 shows "Whole baht only…" in view, focus and `aria-invalid` on the field, no POST. Interval minus is disabled at 1 or blank; plus gives 2, minus gives 1, plus on blank gives 1. Save 7 to 8, request `80bf6827-ca0a-4f12-b997-291a144f0de8`, applied 16:37:48Z, readback `paymentInterval` 8 (number). Restored 8 to 7, request `445bd89a-06cc-4d82-84eb-2fe8587266bc`, 16:40:09Z; version hash identical to before. An earlier attempt `78ae080d-707f-4ff2-b078-e42492647738` aborted client-side, was never journaled and changed nothing.
- **Charge form:** blank principal and interest 33 reviews as ฿0 and ฿33. Create `3a4a3d18-f555-4f57-89ec-088c24e44ade`, charge `90c4edd6-c942-4253-a969-35104940499c` dated 2026-11-20, sent `principalDue:"0"` and `interestDue:"33"`, applied 16:38:30Z; readback 0.00 and 33.00. Deleted `7aba0046-c273-4dcd-b143-31f2cc637528` at 16:39:25Z; charges are back to the original four.
- **Assessment (read-only):** Proposed Loan Amount is text and numeric; Minimum Daily Profit Rate is number and decimal with `step=any`.
- Nothing new is left in DEV. Not tested: a real iPhone keypad.

## Promotion record (Forge, 29 October 2026, UTC)
Pins are only in the [Environment inventory](../project/Documents/Environment_Inventory.md). No secret value, token or borrower data appears here.

**Scope and authority**
- **Scope:** R105 to PROD, Hosting only (no SQL, image, Terraform or VM).
- **Authority:** the owner's "if the test result is good, promote to production" (29 October 2026). The DEV proof above passed. No backup was taken (UI-only change).

| Item | Result |
| --- | --- |
| Package | `cf01602` (merge of `4768882`; `git diff` between them is empty). Generic runner kind, frontend-only. Baseline tag R104 `4e5ba9d` |
| Target | Project `clever-oasis-508610-n7`, site `mw-credit-prod-737787224638` |
| PROD SQL, read-only | As `codex-cloud-read` at 16:45:43Z: version 117, 117 rows all successful, 0 writes |
| Services | Five services unchanged at the R104 revisions, 100% traffic |
| Build | Clean clone of `cf01602`, 16:47:26Z to 16:47:32Z, R104 PROD public config: version `86c62523addc2adc342ee2fb`, entry `/assets/index-D9slmWEO.js`, 16 files, bundle contains `cf01602` and "R105" |
| CI cited | check and e2e x3: run 40909389936; terraform: 40653479949; rebuild x4: 40726821460; guards: 40732608013 |
| Deploy | Operator `mw-credit-unattended-admin`; `--check` passed; `--apply` 16:49:18Z to 16:49:56Z; version `14575436ca11fbc7`, release `1793292590012000` |
| Verification | 16:50:08Z on `lm.mw-credit.com` and the `web.app` host: R105, `86c62523…`, entry byte-identical, `no-store` on `build-version.json` and `sw.js`, `/` 200 |
| Rollback | Version `8f6a70cf7235c8be` (release `1793208819367000`, R104) |
| Private records | Package `promotion-packages/r105/` (sha256 `a1d54133…6a6e`) and receipt `promotion-receipts/R105-HOSTING-RECEIPT.json` in the operator bucket, outside Git |

Applied and verified. Owner acceptance is not yet given: the first real PROD use on the phone is pending.

## Closure (29 October 2026)
Tag record: the annotated tag `R105` (object `7b89a8d6`) points at the package commit `cf0160229829ec3caf02bbbfd307d226c4b5d1b3` (PR #187 on `main`), created by the Release tag workflow. Run 40915483225, 16:50:21Z to 16:50:46Z UTC: success. Baseline R104 `4e5ba9d`.

Open follow-ups:
- Owner acceptance: the first real PROD use on the phone, including the iOS numeric keypad.

Prune (this closure): deleted `Change Logs/CHANGE_NOTES_R102_AGED_OVERDUE_AND_CLAUDE_CHAT_2026-10-27.md` and `integration-agent/Change Logs/CHANGE_NOTES_R102_CHAT_RELAY_2026-10-27.md`, and the uncited evidence `project/outputs/r102-long-overdue-lane/verification.json`; the notes left the retention window (R106 Open; R105, R104, R103 Released). Their links in the Release tracker, Development Changes, Environment Inventory, the service catalogue and the config-only helper note now point to the commit permalink `cf01602`, the last commit where they exist. Development Changes lost the R105 Open row (replaced by the R105 follow-up row). No other change note or evidence file is outside the window or uncited.
