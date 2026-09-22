export const definitions=[
 ['expenses','Business Expenses','Expense ID','One row per immutable Expense ID through Bangkok today. Existing posted expense amount and category; signed statement amount and month boundaries centralized.'],
 ['cash-accounts','Cash Account Positions','Cash Account ID','One row per immutable cash account. Existing cash-holder relationship and governed custody balances. Missing openings remain null; a holder with any missing opening has no chart total.'],
 ['income-monthly','Monthly Income','Month','One row per calendar month from first posted income/expense through the current month. Each source is aggregated before joining; current month is MTD. Live source postings, not hourly snapshots.'],
 ['income-statement','Income Statement','Statement ID','One current Bangkok MTD statement from the same Cash Dashboard provider as OLTP. Draws are completed settlements allocated to current-month profit by existing FIFO rules, not operating expenses. Cash balances are current stocks.'],
 ['settlements','Settlement Ledger','Settlement ID','One row per immutable settlement through Bangkok today, joined by immutable Partner ID. Only completed settlements feed FIFO allocation; source status remains available.'],
 ['income-daily','Daily Income Ledger','Date','One calendar date from first business activity month through Bangkok today. Income, partner expenses and completed settlements aggregate independently before joining. Running prior net profit and settled totals are calculated before visual date filtering.']
];
export const descriptions={
 'Cash Reconciliation Difference':'Business cash held minus remaining cash pool minus current-month unsettled profit. A diagnostic difference, not additional income or a claimed allocation to prior profits.',
 'Cash Reconciliation Status':'Reconciled only when the diagnostic difference is below half a satang; missing account openings stay unavailable.',
 'Tommy Withdrawn MTD':'Negative completed settlement amount allocated to current-month profit after consuming prior-month net profit (existing FIFO rule).',
 'Lisa Withdrawn MTD':'Negative completed settlement amount allocated to current-month profit after consuming prior-month net profit (existing FIFO rule).',
 'Net Profit Since Inception':'Sum of live monthly operating income minus business expenses, before partner withdrawals. Current month is partial.',
 'Holder Cash Component':'Business cash held for this account only if every account for its holder has an initialized opening; sum by immutable Cash Holder ID for complete holder totals.',
 'Net Margin':'Net operating profit divided by operating income; null when income is zero.',
 'Partner Draws MTD':'Positive magnitude of current-month FIFO-allocated Tommy and Lisa withdrawals; not an operating cost.',
 'Unsettled Profit MTD':'Current-month net profit less completed FIFO-allocated partner withdrawals; does not assert all-period cash held.'
};
