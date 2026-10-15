from pathlib import Path

root = Path('C:/GitHub/AppSheet-Loan-Project')
path = root / 'Documents/AppSheet_Data_Model_Overview.md'
text = path.read_text(encoding='utf-8-sig')
replacements = {
    'Model checkpoint v1.000042 on 6 September 2026 plus subsequent price-format corrections; pre-edit rollback v1.000002. Runtime testing found processing issues; debugging and final version reconciliation remain incomplete.': 'Model checkpoint v1.000052 confirmed in Manage > Versions on 6 September 2026; pre-edit rollback v1.000002. Targeted payment tests pass after fixes; broader testing remains incomplete.',
    'at v1.000042 plus subsequent price-format corrections. Payments has': 'at v1.000052, including processing-time Bank Reference/Notes locks. Payments has',
    'Final saved/runtime verification remains pending.': 'Whole-baht display was subsequently verified in the client.',
    'while bank reference and notes retain their imported editing behavior.': 'while Bank Reference and Notes use `OR(NOT(IN([Row ID], Payments[Row ID])), [Status] <> "Processing")`: new form entry and Posted/Error metadata edits are allowed, but existing Processing receipts are locked. The system Edit action also requires Status other than Processing.',
    'Snapshot creation selects the single Processing receipt for the borrower and checks its eligible charge list;': 'Snapshot creation selects the single Processing receipt for the borrower and evaluates target-charge/loan/date eligibility directly in the charge context; the earlier cross-context LOOKUP was removed after multi-charge tests saved only the oldest snapshot.',
    'Reconciliation requires matching receipt/plan/posted amounts,': 'Freeze and posting row selectors require snapshot coverage before invoking child actions. Posting subtracts already-posted allocation keys. Reconciliation also requires no currently eligible charge missing from the snapshots, matching receipt/plan/posted amounts,',
    'Fresh-add behavior remains under test.': 'A subsequent fresh daily-installment first-day receipt and fresh lump-sum, partial and Receive All receipts automatically reached Posted in the recorded tests.',
    'Receive All creates one borrower receipt through today; Lump Sum is a separate action.': 'Receive All creates one borrower receipt through today; Lump Sum is a separate action. Collection retains its manual action bar and now includes Receive All Charges followed by Receive Lump Sum; the slice definition was not changed.',
}
for old, new in replacements.items():
    assert text.count(old) == 1, (old, text.count(old))
    text = text.replace(old, new)
start = text.index('**Validation boundary:** Synthetic borrower/loan creation')
end = text.index('\n\n**Rollback:**', start)
text = text[:start] + '**Validation boundary:** Initial posting and multi-charge failures are retained in the execution report. After fixes, fresh first-day processing, lump sum100 (three snapshots, one interest repayment), lump sum205 (three snapshots, P200/I5 across two repayments), cash partial2, Receive All23 and daily-interest Loan Close500 passed in synthetic fixtures. Collection reconciled to355 collected today and zero remaining before the closure receipt. Unposted receipt deletion removed its owned allocation. Posted metadata editing preserved receipt totals and row counts. These are bounded runtime tests; broader regressions, borrower cascade, competing submissions, permissions and offline behavior remain pending. No full-testing or acceptance claim is made. See [the execution report](../outputs/universal-payments-20260905/functional-test-results.md) for exact cases and interventions.' + text[end:]
path.write_text(text, encoding='utf-8')
print('Updated overview to inspected clone checkpoint 1.000052')
