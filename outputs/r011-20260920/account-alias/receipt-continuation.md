# Instagram receipt summaries — continuation after R011 production

Owner request: 21 September 2026. Implement the account-number prerequisite in DEV under R011; owner will promote, then agent development resumes. Delivery choice explicitly confirmed: Partners.Email and Partners.Language Preference.

## Agreed behavior to implement

1. Capture authenticated incoming Instagram webhook events durably. Treat duplicates/retries as the same event and do not replay historical messages on activation.
2. Map verified Instagram sender identity to one Borrowers record using Instagram Username. Read the live AI Collection Enabled flag; process only uniquely mapped, enabled borrowers. Ignore other message types and nonreceipt images without replies or financial actions.
3. Extract receipt image facts; validate positive amount, receipt transfer date today/yesterday on the Asia/Bangkok calendar, and duplicate transaction/reference/image evidence. Do not treat extraction as bank settlement confirmation.
4. Match the recipient identifier against active Cash Accounts.Account Number or Alternative Account Number. Preserve leading zeroes; normalize presentation separators. Both identifiers map to the same immutable Cash Accounts Row ID. Match recipient digits, never sender digits. PromptPay phone and a bank number may share one account; Lisa's two numbers may share the existing Lisa / Unspecified row. Ambiguous masked/colliding matches must not be guessed. Do not require Lisa's displayed bank name to be literally Unspecified.
5. Queue one durable summary per accepted receipt and Partner email destination, using each Partner's Language Preference. Deduplicate repeated destinations appropriately, and preserve uncertain email-send outcomes for reconciliation rather than blind retry. Check live data and the established email transport during implementation.
6. Summary-only mode: no Payments insert, payment request, reviewer approval-to-post fallback, automatic borrower acknowledgment of posting, or balance change. Example meaning: 'Receipt submitted by [borrower] for [amount] baht into [cash account]. Payment has not been recorded.' Use Thai or English per Partner preference. Switch to payment creation only on a later explicit owner instruction.

## Existing implementation references reviewed

Canonical legacy project: C:/GitHub/MW-AI-Collection. Read AGENTS.md, SERVICE_CATALOGUE.md and service-catalogue.json before changes. Relevant entry point: collection-agent/PORTFOLIO.md. Existing code includes collection-agent/agent/webhook.py, mw-ai-collection/src/receipt_engine.mjs and receipt_runner.mjs; tests include mw-ai-collection/test/receipt.test.mjs and collection-agent/tests/test_receipt_alerts.py.

The legacy receipt engine can auto-post and uses a configured/sent receiving-account snapshot. Its policy also classifies disabled/unmapped attachments for reviewer alerts. Those legacy behaviors do not establish the requested summary-only scope: implement explicit guards and update both catalogue files as applicable before activation. Existing reviewer Instagram delivery is not the requested Partner email channel. No legacy service was started, no runtime configuration changed, and no historical receipt was replayed during this prerequisite task.

## Next steps

- R011 promotion is complete: PROD V29 / OLTP 3.000240 / OLAP 1.100189. The integrated Cash Ledger scope was merged into R011 and R012 retired. Reuse the completed R011 evidence; do not reopen a separate R012 release.
- Populate the real receiving identifiers through Cash Accounts: existing Account Number plus one Alternative Account Number per row. No real numbers were inferred or backfilled; all aliases remain blank after DEV tests.
- Confirm the intended current agent deployment and email transport, adapt the existing guards/durable journals, and add synthetic tests for mapped/disabled/ambiguous borrowers, ordinary chat, date boundaries, both account identifiers, masked collisions, duplicate delivery, and zero financial writes.
- Verify webhook capture and an owner-scoped email acceptance example before reporting the end-to-end feature active. Failed/old/duplicate receipts must not be described as successful received payments; finalize exception presentation during agent implementation.
