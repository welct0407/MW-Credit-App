export const definitions=[
 ['expenses','Business Expenses','Expense ID','One row per immutable Expense ID through Bangkok today. Existing posted expense amount and category; signed statement amount and month boundaries centralized.'],
 ['cash-accounts','Cash Account Positions','Cash Account ID','One row per immutable cash account. Existing cash-holder relationship and governed custody balances. Missing openings remain null; a holder with any missing opening has no chart total.'],
 ['income-monthly','Monthly Income','Month','One row per calendar month from first posted income/expense through the current month. Each source is aggregated before joining; current month is MTD. Live source postings, not hourly snapshots.'],
 ['income-statement','Income Statement','Statement ID','One current Bangkok MTD statement from the same Cash Dashboard provider as OLTP. Draws are completed settlements allocated to current-month profit by existing FIFO rules, not operating expenses. Cash balances are current stocks.'],
 ['settlements','Settlement Ledger','Settlement ID','One row per immutable settlement through Bangkok today, joined by immutable Partner ID. Only completed settlements feed FIFO allocation; source status remains available.'],
 ['income-daily','Daily Income Ledger','Date','One calendar date from first business activity month through Bangkok today. Income, partner expenses and completed settlements aggregate independently before joining. Running prior net profit and settled totals are calculated before visual date filtering.'],
 ['cash-account-daily','Cash Accounts by Date','Position ID','One immutable account and Bangkok date. Dated ledger effects plus immutable opening/baseline offsets; unavailable before each account opening. Later corrections restate history.'],
 ['cash-daily','Cash Position by Date','Date','One Bangkok date. Dated capital less dated outstanding principal; account custody is available only when every opening is known. Retained profit through date, advances and reconciliation difference are distinct.']
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
export const modelDescriptions={
 'cash-daily':{
  'Cash Reconciliation Difference':'Business cash held minus advances, available cash pool and cumulative retained profit, all as of Date. A diagnostic difference, not additional income.',
  'Retained Profit Through Date':'Cumulative net profit less completed partner settlements through Date. Includes earlier periods; distinct from the selected-period unsettled profit.',
  'Cash Available From':'Latest known account opening date. Total custody remains unavailable if any account opening is missing.'
 },
 'cash-account-daily':{'Holder Cash Component':'Account cash held as of Date, only when all accounts for that holder have known balances at that date; sum by immutable Cash Holder ID.'}
};
