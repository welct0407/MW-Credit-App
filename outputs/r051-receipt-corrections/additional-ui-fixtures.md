# Additional R051 GUI batches — prepared, not created

Authoring and affected local rehearsal: Astra High, 5 October 2026. No DEV records were created by this preparation. DEV is now V65 after verified fresh V64 recovery and rollback acceptance. Additional persistent batches remain uncreated. Current GUI deletion/sync investigation is independent and must be resolved before resuming applicable actions.

Run `scripts/database/R051UiAdditionalFixtures.py` with the existing private Python environment. The default transport validates project inventory, pinned connection, instance `appsheet-pg-prod-20260914`, host `34.21.174.215`, database `loan_manager_dev`, role and V65. Seed/cleanup require the current coordinated write-window reference and browser notification-containment reference. No new migration, bypass, grant, app relationship or production change is included.

All IDs below start `SYN-R051-UI-`. Every batch has its own `<batch>-B` borrower and `<batch>-DAD`/`<batch>-LISA` accounts, except PARTNER-A has no borrower. LEGACY and PARTNER-A also seed their own `<batch>-LISA2` account for a valid Lisa→Lisa source-account correction. Total source cash stays constant while the two account balances change. They do not depend on the initial `B`, `DAD` or `LISA` fixtures. Borrowers have no contact details. Auto Charge Enabled is false at seed completion. Amounts are bookkeeping test amounts; no actual transfers are requested.

| Batch | Seeded source IDs (suffixes) | Initial state and GUI assertions |
|---|---|---|
| DAILY | DAILY-B, DAILY, DAILY-C, DAILY-LATER, DAILY-P | Loan100/rate10, date business-today−2. Charge100P+10I and receipt20 on that date; later booked charge9I on today−1. Receipt20→30 gives principal80/rate8; later9 unchanged. Delete receipt restores principal100/rate10 and leaves later9. Separately edit unpaid later charge9→10. |
| DEFAULT | DEFAULT-B, DEFAULT, DEFAULT-C | Loan100/rate10 and unpaid charge100P+10I today. Seed auto=false. In a coordinated bounded GUI sequence, enable auto, confirm Default with actual actor/today, verify zero-cash loss, Undo Default, then immediately disable auto. Restored charge100/10 and principal100; no loss-row/cash residue. Do not leave auto enabled while waiting for another test. Capture any scheduler-created exact charge IDs via readback. |
| LEGACY | LEGACY-B, LEGACY, LEGACY-C, LEGACY-R | Loan100, charge100P+10I, independent repayment1I with blank Ref Payment. Edit1→2 gives remaining108; delete gives110. No new source cash; receipt-linked children remain source-managed. Loan disbursement account LISA→LISA2 must move the same loan cash key with total cash unchanged. No ordinary raw Repayment Add workflow is introduced. |
| CLOSE | CLOSE-B, CLOSE-REF, CLOSE-L, CLOSE-C, CLOSE-P | Synthetic borrower→synthetic referrer only. Loan100, charge100P+100I dated today−2; receipt200 today closes and generates referral10. Edit receipt date to today−1 moves close/referral date. Delete receipt reopens, removes its own referral and cash. Capture generated referral cash/account: existing default Lisa account is selected by business logic, no real account/default is changed. |
| PREPARED | PREPARED-B, PREPARED-L, PREPARED-C, PREPARED-FIRST, PREPARED-P | Daily loan100/rate10 dated today−2; existing today charge initially0P+10I paid by FIRST10. Seed temporarily enables auto in the same transaction, inserts Loan Close request P and immediately disables auto. P posts100; existing charge becomes100P+10I. GUI delete P reopens principal100, retains FIRST10 and augmented charge100/10. Separate charge edit principal100→0 is supported; the old amount is never guessed automatically. |
| PARTNER-A | PARTNER-A and PARTNER-A-DAD/LISA | Blank Email/Login Email, IG disabled, roleA. No contribution/settlement/fake funding seeded. Read preflight for contribution date = one day after max(today, all existing repayment/expense dates). GUI Add Contribution10→edit20/date+1→Add Withdrawal5→delete Withdrawal→delete Contribution. Capture generated IDs. Positive settlement Pending1→Complete→amount2/date/account LISA→LISA2 correction→Reverse→Complete→Cancel only if current `partner_net_profit` less existing uncancelled settlements permits2. Otherwise verify rejection and label positive GUI flow unavailable; never modify real entitlement or add funding to bypass it. |

Role-based settlement calculation is existing behavior: a synthetic roleA partner reads roleA profit, not economically independent synthetic profit. The test does not modify original partner/source records. Future contribution dates avoid reallocating existing historic repayment/expense shares; recheck dates immediately before GUI Add, preserve actual app date validation, and clean up before future scheduled business dates reach them. If UI disallows the safe future date, stop that case and report the restriction rather than backdating across real history.

## Executor procedure

Read-only preparation (safe with GUI writers; use a single repeatable-read snapshot):

```sh
/workspace/MW-Integration-Agent/.venv/bin/python scripts/database/R051UiAdditionalFixtures.py preflight PARTNER-A
/workspace/MW-Integration-Agent/.venv/bin/python scripts/database/R051UiAdditionalFixtures.py readback DAILY
```

Only after parent grants the exact write window and reconfirms borrower-no-send/owner-only routing, capture current recovery reference and execute one requested batch. Example placeholders below are deliberately not an authorization reference:

```sh
/workspace/MW-Integration-Agent/.venv/bin/python scripts/database/R051UiAdditionalFixtures.py seed DAILY --window-reference '<current parent window>' --containment-reference '<current browser proof>' --state /tmp/r051-private-daily-state.json
```

Server bounds: 30s per statement/3s lock. A seed is one transaction; all triggers stay active and deferred effects are forced before readback/commit. Batch collisions reject rather than replay. Private state is written before COMMIT; an exception/unknown commit leaves `pending`. Do not retry: run readback, inspect the named application session, reconcile committed IDs and rollback/connection state first. The fresh verified V64 recovery dump plus immutable V65 migration is the current disaster recovery route; normal fixture recovery is exact source cleanup, not restoring the shared DEV database.

Before cleanup, pause GUI/scheduler interactions for the batch, perform fresh readback, review all GUI-created UNIQUEIDs and causal refs, and save that synthetic-only result outside Git. Do not invent or assume generated keys. Pass it as `--inventory /tmp/<reviewed-readback>.json` with the same `--state`, current references and `cleanup <batch>`. Any ID-set drift or foreign parent/source link rejects cleanup. Source-owned child/referral/cash cleanup uses existing triggers. Only independent captured repayments/manual sources are directly deleted. Synthetic account daily snapshots are removed after their sources and before deleting the exact accounts to satisfy their FK.

After cleanup verify empty batch readback, no owned backend, all auto flags off/no synthetic scheduler residue, and compare private before-source fingerprints with current nonfixture source rows. Account/daily analytics may regenerate; record that separately. Concurrent legitimate GUI changes in another batch must be reconciled rather than labeled unchanged. Current helper records before fingerprints; final preservation comparison remains an explicit executor check, not a claimed automatic pass.

## Validation

Private restored V64 local rehearsal passed all six seed→affected-operation→cleanup workflows with integrity triggers active and rollback isolation. Daily rate/booked-history, default undo, legacy totals, closing date/referral, prepared charge retention/intervening receipt and positive settlement from existing available entitlement were asserted. Each cleanup left an empty scoped readback. Temporary local server was stopped. These are local checks, not DEV seed or GUI acceptance.

All additional live seeds, current future-date/entitlement preflight, new fixture readback and both-app GUI results remain pending. No new business decision is needed; the remaining gates are coordination, current eligibility and actual app behavior.
