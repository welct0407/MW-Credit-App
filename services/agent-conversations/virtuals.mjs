// Fixed reviewed projections. This module never parses or evaluates a caller formula.
const today="(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date";
const money=value=>`CASE WHEN (${value}) IS NULL THEN NULL ELSE (CASE WHEN (${value})<0 THEN '-฿' ELSE '฿' END)||to_char(abs(round((${value})::numeric)),'FM999,999,999,999,999,999,990') END`;
const borrower=(resource,column)=>resource==='Borrowers'?`b."${column}"`:resource==='Loans'
 ?`(SELECT x."${column}" FROM public."Borrowers" x WHERE x."Row ID"=b."Ref Borrowers")`
 :`(SELECT x."${column}" FROM public."Loans" l JOIN public."Borrowers" x ON x."Row ID"=l."Ref Borrowers" WHERE l."Row ID"=b."Ref Loans")`;
export function nativeVirtualSql(resource,field){
 if(['Cash Account Daily Summary Recent','Cash Account Statement Recent'].includes(resource)){
  const thai=`coalesce((SELECT p."Language Preference"='ไทย' FROM public."Partners" p WHERE p."Row ID"=$ACTOR),false)`;
  if(field==='User Language')return `CASE WHEN ${thai} THEN 'ไทย' ELSE 'English' END`;
  if(field==='Balance Status')return `CASE WHEN b."Is Initialized" THEN '' WHEN ${thai} THEN 'ยังไม่ได้กำหนดยอดตั้งต้น' ELSE 'Balance not initialized' END`;
  if(field==='Amount Display')return `(CASE WHEN b."Signed Amount">0 THEN '+' ELSE '-' END)||(${money('abs(b."Signed Amount")')})`;
  if(field==='Counterparty')return `CASE b."Counterparty Kind" WHEN 'BORROWER' THEN (SELECT CASE WHEN NOT ${thai} AND nullif(x."Description",'') IS NOT NULL THEN x."Description" ELSE x."Borrower Name" END FROM public."Borrowers" x WHERE x."Row ID"=b."Ref Borrower") WHEN 'ACCOUNT' THEN (SELECT x."Account Label" FROM public."Cash Accounts" x WHERE x."Row ID"=b."Ref Other Cash Account") WHEN 'PARTNER' THEN (SELECT x."Partner Name" FROM public."Partners" x WHERE x."Row ID"=b."Ref Partner") WHEN 'ADJUSTMENT' THEN CASE WHEN ${thai} THEN 'ปรับปรุงยอด' ELSE 'Adjustment' END ELSE b."Counterparty Text" END`;
  if(field==='Transaction'){
   const labels=[['LOAN_PAYMENT','รับชำระเงินกู้','Loan Payment'],['FIRST_DAY_PAYMENT','รับชำระวันแรก','First-day Payment'],['LOAN_DISBURSEMENT','จ่ายเงินกู้','Loan Disbursement'],['BUSINESS_EXPENSE','ค่าใช้จ่ายธุรกิจ','Business Expense'],['REFERRAL_REBATE','เงินคืนค่าแนะนำลูกค้า','Referral Rebate'],['PARTNER_SETTLEMENT','ชำระให้หุ้นส่วน','Partner Settlement'],['ACCOUNT_TRANSFER','โอนระหว่างบัญชี','Account Transfer'],['CASH_TRANSFER','โอนเงิน','Cash Transfer'],['EXPENSE_REIMBURSEMENT','คืนค่าใช้จ่าย','Expense Reimbursement'],['OPENING_BALANCE','ยอดยกมา','Opening Balance'],['MANUAL_CORRECTION','ปรับปรุงยอด','Manual Correction']];
   return `CASE b."Transaction Type Code" ${labels.map(([code,th,en])=>`WHEN '${code}' THEN CASE WHEN ${thai} THEN '${th}' ELSE '${en}' END`).join(' ')} ELSE CASE WHEN ${thai} THEN 'รายการอื่น' ELSE 'Other' END END`;
  }
 }
 if(resource==='Partners'){
  const metrics={'Current Pool Contribution':'net_capital','Current Pool Share':'capital_share','Total Profit Earned':'interest_earned','Total Settlement Created':'reserved','Completed Settlement':'completed','Pending Settlement':'pending','Net Profit Earned':'net_earned','Net Available to Settle':'available'};
  const metric=name=>`(SELECT p.${name} FROM public.reporting_partner_position_v1 p WHERE p.partner_id=b."Row ID")`;
  if(metrics[field])return metric(metrics[field]);
  if(field==='Available to Settle')return metric('interest_earned-reserved');
  if(field==='Summary - Completed Settlement')return `'โอนแล้ว / Completed Settlement: '||(${money(metric('completed'))})`;
  if(field==='Summary - Total Profit Earned')return `'กำไรรวมที่ได้รับ / Total Profit: '||(${money(metric('net_earned'))})`;
  if(field==='Summary - Available Pending Settlement')return `CASE WHEN ${metric('pending')}>0 THEN 'รอโอน / Pending Settlement: '||(${money(metric('pending'))}) ELSE 'พร้อมโอน / Available to Settle: '||(${money(metric('available'))}) END`;
 }
 if(resource==='Loan Assessment'){
  const match='b."Ref Borrower" IS NOT DISTINCT FROM b."SQL Input Borrower" AND b."Proposed Loan Amount"::numeric=b."SQL Input Amount" AND abs(b."Minimum Daily Profit Rate"::text::numeric-b."SQL Input Rate")<0.0000001';
  const fresh=`((${match}) AND b."SQL Source Current" IS TRUE AND b."SQL As Of"=${today})`;
  const outputs={'Current Outstanding Principal':'SQL Current Principal','Interest Earned from Active Loans':'SQL Interest Received','Earliest Eligible Date':'SQL Eligible Date','Projected Interest at Eligible Date':'SQL Eligible Interest','Outstanding Principal at Eligible Date':'SQL Eligible Principal','Minimum Profit at Eligible Date':'SQL Eligible Profit','Required Coverage at Eligible Date':'SQL Eligible Coverage','Safety Margin':'SQL Eligible Margin','Current Coverage Margin':'SQL Current Margin'};
  if(outputs[field])return `CASE WHEN ${fresh} THEN b."${outputs[field]}" ELSE NULL END`;
  if(field==='Days Until Eligible')return `CASE WHEN ${fresh} THEN b."SQL Eligible Date"-${today} ELSE NULL END`;
  if(field==='Coverage Ratio at Eligible Date')return `CASE WHEN ${fresh} AND b."SQL Eligible Coverage">0 THEN b."SQL Eligible Interest"/b."SQL Eligible Coverage" ELSE 0 END`;
  if(field==='Recommendation Status')return `CASE WHEN NOT coalesce((${match}),false) THEN 'กำลังรอผล / Awaiting results' WHEN NOT coalesce(${fresh},false) THEN 'ผลไม่เป็นปัจจุบัน / Out of date' WHEN b."SQL Eligible Date" IS NULL THEN 'ยังไม่ผ่านเกณฑ์ - Not Eligible' WHEN b."SQL Eligible Date"<=${today} THEN 'ปล่อยกู้ได้ตอนนี้ - Eligible Now' ELSE 'ควรรอก่อน - Wait' END`;
  if(field==='Recommendation')return `CASE WHEN NOT coalesce((${match}),false) THEN 'กำลังรอผล / Waiting for calculation results' WHEN NOT coalesce(${fresh},false) THEN 'ผลไม่เป็นปัจจุบัน / Assessment is out of date; update and save inputs' ELSE (CASE WHEN b."SQL Eligible Date" IS NULL THEN 'ไม่พบวันที่ผ่านเกณฑ์ / No eligible date within forecast period' WHEN b."SQL Eligible Date"=${today} THEN 'สามารถปล่อยกู้ได้วันนี้ / Eligible to issue today' ELSE 'วันที่แนะนำ / Earliest recommended date: '||to_char(b."SQL Eligible Date",'DD/MM/YYYY') END)||' | คำนวณเมื่อ / Calculated: '||coalesce(to_char(b."SQL Calculated At",'DD/MM/YYYY HH24:MI:SS'),'') END`;
 }
 if(['Borrowers','Loans','Charges','Repayments'].includes(resource)){
  if(field==='Borrower Name')return borrower(resource,'Borrower Name');
  if(field==='Borrower Name TE')return `coalesce(${borrower(resource,'Borrower Name')},'')||' - '||coalesce(${borrower(resource,'Description')},'')`;
  if(field==='Borrower Reference TE')return resource==='Borrowers'?'b."Row ID"':borrower(resource,'Row ID');
 }
 const expressions={
  Borrowers:{
   'Active Profit After Principal Coverage':'b."Active Loan Interest Earned"-b."Total Outstanding Principal"',
   'Borrower Activity Group':`CASE WHEN b."Has Active Loan" THEN 'Active / มีสินเชื่อ' ELSE 'Inactive / ไม่ใช้งาน' END`,
   'Daily Collection Status - Order':`CASE (SELECT a."Daily Collection Status" FROM public.olap_borrowers_analytics a WHERE a."Row ID"=b."Row ID") WHEN 'Not Paid' THEN '1 - ยังไม่ชำระ Not Paid' WHEN 'Partially Paid' THEN '2 - ชำระบางส่วน Partially Paid' WHEN 'Overdue' THEN '3 - เกินกำหนด Overdue' WHEN 'Long Overdue' THEN '4 - เกินกำหนดนาน Long Overdue' WHEN 'Fully Paid' THEN '5 - ชำระครบ Fully Paid' ELSE '' END`,
  },
  Loans:{
   // Native original-rate label is shared with receipt planning and the PWA.
   'Loan Key':`coalesce(${borrower(resource,'Borrower Name')},'')||' - '||coalesce(${borrower(resource,'Description')},'')||'-'||coalesce((${money('b."Principal Amount"::numeric')}),'')||'-'||coalesce(to_char(b."Loan Date",'DD/MM'),'')||'-'||coalesce(b."Original Daily Interest Rate"::text||'%','Unavailable')`,
   'Loan Status TE':`CASE WHEN b."Loan Status"='ปิดยอดแล้ว' THEN 'ปิดยอดแล้ว / Closed' ELSE 'ยังไม่ปิดยอด / Active' END`,
   'Loan Type TE':`CASE b."Loan Type" WHEN 'กำหนดวันชำระ' THEN 'กำหนดวันชำระ / Fixed Due Date' WHEN 'ดอกเบี้ยรายวัน' THEN 'ดอกเบี้ยรายวัน / Daily Interest' WHEN 'ผ่อนชำระรายวัน' THEN 'ผ่อนชำระรายวัน / Daily Installment' ELSE 'ไม่ทราบประเภท / Unknown' END`,
  },
  Charges:{
   'Collection Today':`(b."Payment Status"<>'ชำระแล้ว' AND b."Charge Date"<=${today}) OR (b."Payment Status"='ชำระแล้ว' AND b."Payment Date"=${today}) OR EXISTS(SELECT 1 FROM public."Repayments" r WHERE r."Ref Charges"=b."Row ID" AND r."Payment Date"=${today}) OR b."Charge Date"=${today}`,
   'Payment Status TE':`CASE b."Payment Status" WHEN 'ชำระแล้ว' THEN 'ชำระแล้ว / Payment Received' WHEN 'รอชำระ' THEN 'รอชำระ / Pending Payment' ELSE 'ชำระบางส่วน / Partial Payment' END`,
   'Days Outstanding':`(CASE WHEN b."Payment Status"='ชำระแล้ว' THEN b."Payment Date" ELSE ${today} END)-b."Charge Date"`,
   'Payment Received Today':`(SELECT coalesce(sum(r."Principal Paid"::numeric+r."Interest Paid"::numeric),0) FROM public."Repayments" r WHERE r."Ref Charges"=b."Row ID" AND r."Payment Date"=${today})`,
  },
  Repayments:{'Payment Amount Today':`CASE WHEN b."Payment Date"=${today} THEN b."Principal Paid"::numeric+b."Interest Paid"::numeric ELSE 0 END`},
  Payments:{
   'Eligible Outstanding':`CASE WHEN b."Status" IN('Processing','Error') THEN (SELECT coalesce(sum(c."Amount Remaining"),0) FROM public."Charges" c JOIN public."Loans" l ON l."Row ID"=c."Ref Loans" WHERE l."Ref Borrowers"=b."Ref Borrower" AND c."Amount Remaining">0 AND CASE WHEN b."Allocation Method" IN('Single Full','Single Partial','First-day Auto') THEN c."Row ID"=b."Ref Target Charge" WHEN b."Allocation Method"='Loan Close' THEN c."Ref Loans"=(SELECT target."Ref Loans" FROM public."Charges" target WHERE target."Row ID"=b."Ref Target Charge") WHEN b."Allocation Method" IN('Receive All','Lump Sum') THEN c."Charge Date"<=b."Payment Date" ELSE false END) ELSE 0 END`,
   'Allocation Difference':'b."Amount Received"::numeric-b."Planned Allocation Amount"::numeric',
   'Posting Difference':'b."Amount Received"::numeric-b."Posted Amount"::numeric',
   'Payment Month':`to_char(b."Payment Date",'YYYY-MM')`,
  },
  'Cash Pool Contributions':{
   'Net Contribution':`CASE WHEN b."Transaction Type"='Contribution' THEN b."Amount"::numeric ELSE -b."Amount"::numeric END`,
   'Transaction Type TE':`CASE WHEN b."Transaction Type"='Contribution' THEN 'เพิ่มเงิน - Contribution' ELSE 'ถอนเงิน - Withdrawal' END`,
  },
  'Daily Analytics':{
   'Portfolio Slice':`CASE WHEN mod(extract(day FROM b."Snapshot Date")::integer,2)=0 THEN 'Selected borrower' ELSE 'Remaining' END`,
   // AppSheet WEEKNUM is Sunday-based, Jan 1 belongs to week 1 (not ISO).
   // https://support.google.com/appsheet/answer/10107326
   Week:`extract(year FROM b."Snapshot Date")::integer::text||'-W'||(floor((extract(doy FROM b."Snapshot Date")-1+extract(dow FROM date_trunc('year',b."Snapshot Date")))/7)+1)::integer::text`,
   Month:`to_char(b."Snapshot Date",'YYYY-MM')`,
   'Daily Capital Employed':'b."Outstanding Principal EOD"::numeric+b."Principal Returned"::numeric',
   'Daily Capital Yield':'CASE WHEN b."Outstanding Principal EOD"::numeric+b."Principal Returned"::numeric>0 THEN b."Interest Received"::numeric/(b."Outstanding Principal EOD"::numeric+b."Principal Returned"::numeric) ELSE 0 END',
  },
  'Cash Ledger':{
   'Movement Time':`to_char(b."Created At",'HH24:MI')`,
   'Ref Borrower':`CASE WHEN b."Ref Payment" IS NOT NULL THEN (SELECT p."Ref Borrower" FROM public."Payments" p WHERE p."Row ID"=b."Ref Payment") WHEN b."Ref Loan" IS NOT NULL THEN (SELECT l."Ref Borrowers" FROM public."Loans" l WHERE l."Row ID"=b."Ref Loan") ELSE (SELECT e."Ref Related Borrower" FROM public."Business Expenses" e WHERE e."Row ID"=b."Ref Business Expense") END`,
  },
 };
 return expressions[resource]?.[field]??null;
}
