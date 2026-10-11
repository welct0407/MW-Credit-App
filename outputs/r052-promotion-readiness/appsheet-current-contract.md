# Current AppSheet cutover observations

## Final owner scope for this checkpoint

At promotion, manual payment entry switches from AppSheet to PWA; the Debian integration agent continues its existing operation. The owner avoids manually recording payments already processed by the agent. No new cross-channel duplicate guard or automatic mapping for future AppSheet uploads is required. Historical AppSheet receipts remain readable, and AppSheet must continue to display PWA-created receipts. Notifications are deferred until after go-live. Only scheduled charge generation and analytical generation remain AppSheet-owned; PWA replacement schedulers remain disabled. These decisions supersede earlier three-channel coexistence and notification launch requirements in dated evidence below.

The current DEV OLTP identity/version matches the existing 4F rendering evidence (`outputs/r052-payment-command-api/receipt-compatibility-4f.json`: 1.000207, exact generated PWA path, rendered synthetic PNG, reference restoration and protected-state equality). Current PWA upload path generation is unchanged. This evidence is reusable for that DEV path; it is not a new production upload/render test. The production path uses the separately observed production storage root and retains a limited authorized post-promotion rendering check.

11 October 2026, root read-only current editor inspection using the verified work-account Chrome session. No configuration saved, test notification sent, business operation run or scheduler changed. This is configuration evidence, not natural-run or PWA-origin delivery proof. Private sharing identities are not published.

## PROD OLTP

App `93844270-6aa5-420b-a960-bcdf08abd357`, internal name `LoanManager-975338008-26-08-07`. Current preview URL identifies version **3.000274**, newer than the earlier release baseline 3.000270. Editor shows Deployed, No issues found and disabled Save/Undo. Reconcile actual promotion baseline before deployment; do not overwrite intervening changes.

- Sign-in required, Google provider, allow-all signed-in users false. Sharing dialog has owner plus one explicitly shared account with **Use app**. Shared identities must be configured privately; Partners membership alone does not establish application sharing authorization.
- Operational source security filters are none, including Borrowers, Loans, Charges, Payments, Repayments, Business Expenses, Partners and cash source tables. Cash Statement Context alone in the observed list filters Ref Partner to the normalized current Login Email mapping. This does not authorize a new generic SQL API or editing analytical mirrors.
- Partner A/B financial entitlement roles must not be interpreted as application admin/viewer roles.

## Active-looking OLTP definitions

The following definitions have no disabled banner; natural successful execution remains to be inspected. Only the named legacy definitions visibly marked disabled are recorded as disabled.

| Definition | Current trigger/ownership | Actor and output |
| --- | --- | --- |
| Generate Daily Charges | Scheduled daily 00:05, SE Asia Standard Time, for each Loans row. Filter includes canonical DEV/PROD AppName allowlist, Auto Charge Enabled, open status, missing current-date charge, loan-type/date/interval conditions. Process has a second canonical-app guard; Generate Today's Charge sets Charge Generation Request through a data action. | Retain AppSheet scheduler; no replacement activated. |
| Notification - New Loan Created | App event, Loans Adds only, no event condition. | AppSheet **Send a notification**, not an email. Created By maps to Partners.Login Email, excludes actor Row ID, nonblank Partners.Email, distinct recipients. Loans_Detail link. |
| New-loan first-day receipt step | Count of Posted Payments with Allocation Method First-day Auto and target charge belonging to that loan is greater than zero. | Same Created By actor, first-day payment notification and Payments_Detail link. |
| Notification - Charge Received | App event Payments Adds/Updates. Allocation Method is not First-day Auto; prior row absent or prior Status Error; current Status Processing or Posted. | AppSheet notification; Created By actor routing; exact Payment's repayments supply totals and Payments_Detail link. Do not equate this UI event condition with a committed SQL success: PWA capture must prove committed Posted outcome. |
| Payment closure summary | Count of Loans whose Ref Closing Payment equals the Payment Row ID is greater than zero. | Same payment actor/recipient routing; aggregate closure summary with Payment link. |
| Notification - Loan Closed | App event Loans Adds/Updates. New row with a current Ref Closing Payment, OR existing transition from nonclosed to closed with blank Ref Closing Payment. | Closed By actor routing; default/nondefault title and Loans_Detail link. |
| Notification - First-Day Charge | App event Charges Adds only; at least one Posted First-day Auto Payment targeting exact charge. | Parent Loan Created By actor; exact target payment and any payment-closed loans included; Payments_Detail link. |

All inspected notification recipient expressions resolve the recorded actor to Partner Row ID, exclude that row, require nonblank delivery email, and request distinct delivery values. Unknown actor mapping produces no recipients. Existing AppSheet notifications retain their current content; the new PWA lock-screen payload must remain generic as designed.

`Create First-Day Charge` visibly has disabled banner and Enable control. `Payments - Process Receipt` is labeled disabled. Neither was enabled. R008 command-confirmation bots exist and were not exercised.

## PROD OLAP

App `e74dd368-654f-44d7-bccf-83cf361d1cdb`, internal name `LoanBusinessInsights-975338008`, preview version **1.100214** (newer than dated 1.100212). Deployed, No issues found, Save/Undo disabled. Requires Google sign-in, allow-all false, and has the same owner plus the same one shared Use app account as OLTP.

Observed source security filters are none except Settlements: `[Status] <> "Cancelled"`. Financial entitlement Partner A/B is not a separate app-sharing role. Preserve per-user preference ownership and the operation-specific SQL controls.

`Refresh Daily Analytics Daily` is actually scheduled **hourly at minute 0**, SE Asia Standard Time, for each Statistics row filtered to `INDEX(SORT(Statistics[Row ID]), 1)` and the exact canonical DEV/PROD AppName allowlist. Process has another canonical-app guard. `Request Recent Analytics Refresh` sets `Analytics Refresh Request` to `CONCATENATE(TEXT(TODAY(), "YYYY-MM-DD"), "|Recent|", UNIQUEID())`. Do not replace its actual hourly behavior with a daily schedule inferred from the bot name. `Daily Loan Analysis Export` is visibly labeled disabled; leave it dormant.

## DEV OLTP baseline

Current canonical DEV OLTP `500b27b6-884a-41e8-a9ec-df801b0110ad` preview version **1.000207**, Deployed, No issues found, Save/Undo disabled. Google sign-in required, allow-all false, sharing owner only (zero additional users). Observed automation inventory has the same named families and disabled legacy first-day generator. Generate Daily Charges uses the same 00:05 SE Asia schedule, Loans source and exact canonical/date/loan-type filter as the observed PROD definition. No definition was changed or tested through a business write.

## Pending observations

DEV OLAP baseline and any affected unobserved task details. No complete Phase 8/9 claim follows from this partial inspection.

## PROD receipt configuration

Current PROD OLTP editor: Payments `Uploaded Receipt` is Image with image/file folder expression `"manual-receipts/prod"`. Settings > Information default app folder is `/appsheet/data/LoanManager-975338008-26-08-07`. Payments > Table settings > Storage selects `MW Receipt Images PROD`, with data source `database-2` and source ID `Table=public.Payments__Payments`. Save and Undo remained disabled; no configuration changed.

These are configuration observations, not proof of a normalized GCS object key or same-bytes receipt mapping. Exact object generations and authenticated AppSheet media provenance remain required before publishing a production native-receipt catalog. Do not reuse DEV descriptors or derive filenames from these folder strings alone.

F independently observed the actual GCS prefix at 10:58:24 UTC: bucket `mw-payment-receipts-prod-508610-n7`, prefix `appsheet/data/LoanManager_975338008_26_08_07/manual_receipts/prod/`. Complete metadata page: 36 objects, 4,114,971 bytes, generation range 1790512556260513–1791681575352253. No individual names or receipt bytes were returned. This establishes the root only, not individual reference mappings.

The current account source `database-2` connection form confirms PostgreSQL, host `34.21.174.215`, database `loan_manager_prod`, SSL required. Its username remains redacted by the available browser surface. On11October2026 the owner directly confirmed the configured username is `postgres`; the planned retained CONNECT consumer uses that owner confirmation, distinct from live UI proof. Password was not read, and no connection test/save/change was performed.

## Natural-run monitor evidence

Current Automation Monitor was opened through Manage > Monitor > Launch automation monitor, Runs tab. No Test/run/notification action was invoked. For selected PROD OLAP, `Refresh Daily Analytics Daily` has run `46530840-de63-48b0-acbe-d4462bb16eb0` marked Complete, displayed `10/11/2026 10:00:08 AM`. For selected PROD OLTP, `Generate Daily Charges` has run `04867834-b968-437d-9e9f-b88fa9e9dbad` marked Complete, displayed `10/10/2026 5:05:15 PM`, with multiple per-row completions at that time. These are literal UI timestamps; the monitor's display timezone was not established, so do not relabel them as Bangkok time. Schedule settings separately verified above use SE Asia Standard Time. Status evidence does not prove full financial reconciliation or PWA-origin trigger delivery.

Historical final preparation continuation: all35 current historical native receipt references subsequently received authenticated AppSheet source/fileName and exact-generation/full-content/decoder proofs, with final SQL reference comparison19:07:28+07 and explicit content-equivalent alias provenance where applicable. Root-owned current configuration remains unchanged; individual source references/media are private. Qualified DEV4F AppSheet rendering/current1.000207 plus unchanged generator/current PROD binding supports new PWA receipt path preparation; first actual PROD view remains postpromotion limited validation. Final sourceb40c695 passed consolidated checks and DEV87 delivery. Production business activation remains unauthorized.

Current authorized promotion: PROD SQL87 and pinned business runtime/Hosting are applied; both existing AppSheet definitions remain unchanged at OLTP3.000274/OLAP1.100214, Deployed/editor-clear and post87 load/sync verified. Existing AppSheet analytics/charges schedulers remain active; PWA notifications/replacement jobs deferred. Authenticated PWA/historical receipt GUI awaits owner Google account selection; first real new PWA receipt AppSheet rendering remains owner hands-on pending. No new financial or notification test writes. R052 Frozen, deployment applied; verification incomplete, no finaltag.
