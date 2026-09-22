export const definitions=[
 ['cashflow-transactions','Cashflow Transactions','Entry ID','One ledger-side entry for an account, or one consolidated entry per ledger in All accounts. OLTP transaction classifications and immutable relationships; chronological balances calculated in PostgreSQL before filtering. Internal transfers have zero consolidated inflow/outflow, with their face amount shown separately.'],
 ['cashflow-daily','Cashflow Daily Balances','Position ID','One account scope and Bangkok calendar date, including zero-movement days. Opening and closing are signed net cash; missing/pre-opening balances remain unavailable. All accounts is a separate consolidated scope, never summed with individual accounts.']
];
export const specs=[
 {key:'in',name:'Money in',display:'scalar',sql:'SELECT "Money In" FROM statement',metric:'Money In',color:'#13855B'},
 {key:'out',name:'Money out',display:'scalar',sql:'SELECT "Money Out" FROM statement',metric:'Money Out',color:'#D1495B'},
 {key:'net',name:'Net cash movement',display:'scalar',sql:'SELECT "Net Movement" FROM statement',metric:'Net Movement',color:'#267DCC'},
 {key:'opening',name:'Opening balance · start of period',display:'scalar',sql:'SELECT "Opening Balance",CASE WHEN "Opening Balance" IS NULL THEN \'Unavailable\' ELSE \'฿ \' || to_char("Opening Balance",\'FM999,999,999,999,990\') END AS "Balance Display" FROM statement',metric:'Opening Balance',color:'#267DCC'},
 {key:'transactions',name:'Transactions · chronological order',display:'table',sql:'SELECT t."Date",t."Transaction Type",t."Counterparty",t."Money In",t."Money Out",t."Balance After",t."From Account",t."To Account",t."Transaction Amount",t."Notes",t."Posted At",t."Ledger ID" FROM statement s JOIN {{model:cashflow-transactions}} t ON t."Date" BETWEEN s."Period Start" AND s."Period End" WHERE t."Scope ID"={{cash_account}} AND s."Continuous Period" ORDER BY t."Date",t."Posted At",t."Ledger ID" COLLATE "C",t."Entry ID" COLLATE "C"'},
 {key:'closing',name:'Closing balance · end of period',display:'scalar',sql:'SELECT "Closing Balance",CASE WHEN "Closing Balance" IS NULL THEN \'Unavailable\' ELSE \'฿ \' || to_char("Closing Balance",\'FM999,999,999,999,990\') END AS "Balance Display" FROM statement',metric:'Closing Balance',color:'#267DCC'},
 {key:'period',name:'Statement dates & balance availability',display:'table',sql:'SELECT "Period Start","Period End","Transaction Count","Available From","Statement Status" FROM statement'}
];
