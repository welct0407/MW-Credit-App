// Generates the reviewed R007 migration from explicit, saved-formula translations.
// Never execute against a database. Applied migration files must not be regenerated.
import fs from 'node:fs/promises';
const contract=JSON.parse(await fs.readFile('outputs/r007-20260918/before-contract.json','utf8'));
const qi=s=>'"'+s.replaceAll('"','""')+'"';
const n=s=>`coalesce(${s}::numeric,0)`;
const col=(s,a='x')=>`${a}.${qi(s)}`;

let sql=`-- R007: ordinary, read-only OLAP analytics. No base-table or trigger changes.
-- Source contract: saved DEV OLAP 1.000129, captured 2026-09-18.
-- Bangkok matches the accepted client/API reporting timezone. Stable per statement.
CREATE FUNCTION public.olap_reporting_date() RETURNS date
LANGUAGE sql STABLE SET search_path=pg_catalog AS $$
 SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date
$$;
`;
const context=`ctx AS (SELECT d, date_trunc('month',d)::date ms,
 (date_trunc('month',d)+interval '1 month - 1 day')::date me FROM (SELECT public.olap_reporting_date() d) q)`;
function view(table,name,ctes,fields){
 const targets=contract.columns[table].filter(x=>x.r007Move).map(x=>x['Column name']);
 for(const target of targets)if(!fields.includes(target))throw Error(`Missing ${table}.${target}`);
 const extras=fields.filter(x=>!targets.includes(x));
 if(extras.some(x=>x!=='Ref Collection Borrower'))throw Error(`Unexpected fields ${extras}`);
 const physical=table==='Statistics'?['Row ID','Statistics ID']:contract.columns[table].filter(x=>x['Virtual?']==='No'&&x['Column name']!=='_RowNumber').map(x=>x['Column name']);
 const output=fields.map(field=>{
  const def=contract.columns[table].find(c=>c['Column name']===field);
  const qualifier=def?JSON.parse(def['Type Qualifier']||'{}'):{};
  if(['Price','Decimal','Percent'].includes(def?.Type)){
   const digits=(qualifier.DecimalDigits??2)+(def.Type==='Percent'?2:0);
   const value=field==='Effective Daily Interest Rate'?`coalesce(${col(field)},0)`:col(field);
   return `round(${value}::numeric,${digits}) AS ${qi(field)}`;
  }
  return col(field);
 });
 sql+=`\nCREATE VIEW public.${name} AS\nWITH ${context},\n${ctes}\nSELECT ${[...physical.map(x=>col(x)),...output].join(',\n ')} FROM final x;\n`;
}
// Price values are whole-baht at the current AppSheet column boundary. Explicit
// ROUND is used only for fields with fractional results demonstrated by baseline.
view('Charges','olap_charges_analytics',`
rp AS (SELECT "Ref Charges" id,min("Payment Date") first_date,max("Payment Date") last_date,
 bool_or("Payment Date"=d) today FROM public."Repayments" CROSS JOIN ctx GROUP BY 1),
a AS (SELECT c.*, ${n('c."Principal Due"')}+${n('c."Interest Due"')} "Amount Due",
 rp.first_date "First Payment Date",rp.last_date "Last Payment Date",
 CASE WHEN c."Payment Status"='ชำระแล้ว' AND c."Payment Date" IS NOT NULL
 THEN greatest(0,c."Payment Date"-c."Charge Date") WHEN c."Charge Date"<d THEN d-c."Charge Date" ELSE 0 END "Days Late",
 CASE WHEN (c."Payment Status" IS DISTINCT FROM 'ชำระแล้ว' AND c."Charge Date"<=d)
 OR (c."Payment Status"='ชำระแล้ว' AND c."Payment Date"=d) OR rp.today
 THEN l."Ref Borrowers" END "Ref Collection Borrower"
 FROM public."Charges" c CROSS JOIN ctx LEFT JOIN rp ON rp.id=c."Row ID"
 LEFT JOIN public."Loans" l ON l."Row ID"=c."Ref Loans"),
final AS (SELECT a.*,coalesce("Charge Date"<d AND "Payment Status"='ชำระแล้ว' AND "Days Late"=0,false) "Historical On Time",
 coalesce("Charge Date"<d AND "Days Late">0,false) "Historical Late" FROM a CROSS JOIN ctx)
`,['Amount Due','Last Payment Date','First Payment Date','Days Late','Historical On Time','Historical Late','Ref Collection Borrower']);
view('Repayments','olap_repayments_analytics',`
events AS (SELECT c."Contribution Date" dt,
 sum(CASE WHEN c."Transaction Type"='Contribution' THEN c."Amount"::numeric ELSE -c."Amount"::numeric END) pool,
 sum(CASE WHEN c."Transaction Type"='Contribution' THEN c."Amount"::numeric ELSE -c."Amount"::numeric END) FILTER(WHERE p."Partner Role"='A') a,
 sum(CASE WHEN c."Transaction Type"='Contribution' THEN c."Amount"::numeric ELSE -c."Amount"::numeric END) FILTER(WHERE p."Partner Role"='B') b
 FROM public."Cash Pool Contributions" c LEFT JOIN public."Partners" p ON p."Row ID"=c."Ref Partner" GROUP BY 1),
running AS MATERIALIZED (SELECT dt,sum(pool) OVER w pool,sum(a) OVER w a,sum(b) OVER w b
 FROM events WINDOW w AS (ORDER BY dt ROWS UNBOUNDED PRECEDING)),
a AS (SELECT r.*,coalesce(h.pool,0) "Pool Total at Payment Date",coalesce(h.a,0) "Partner A Contribution at Payment Date",
 coalesce(h.b,0) "Partner B Contribution at Payment Date",
 CASE WHEN h.pool>0 THEN coalesce(h.a,0)/h.pool ELSE 0 END "Partner A Profit Share",
 CASE WHEN h.pool>0 THEN coalesce(h.b,0)/h.pool ELSE 0 END "Partner B Profit Share",
 CASE WHEN ${n('r."Principal Paid"')}<=0 OR r."Payment Date">d THEN 0
 ELSE ${n('r."Principal Paid"')}*CASE WHEN r."Payment Date" BETWEEN ms AND me THEN d-r."Payment Date"+1 ELSE extract(day FROM d) END END "Principal Returned Days MTD",
 CASE WHEN r."Payment Date"<d-29 OR r."Payment Date">d THEN 0 ELSE ${n('r."Principal Paid"')}*(d-r."Payment Date"+1) END "30D Principal Reduction Days",
 ${n('r."Principal Paid"')}+${n('r."Interest Paid"')} "Amount Received"
 FROM public."Repayments" r CROSS JOIN ctx LEFT JOIN LATERAL
 (SELECT * FROM running WHERE dt<=r."Payment Date" ORDER BY dt DESC LIMIT 1) h ON true),
final AS (SELECT a.*,round(${n('a."Interest Paid"')}*"Partner A Profit Share") "Partner A Profit",
 round(${n('a."Interest Paid"')}*"Partner B Profit Share") "Partner B Profit" FROM a)
`,contract.columns.Repayments.filter(x=>x.r007Move).map(x=>x['Column name']));
view('Loans','olap_loans_analytics',`
cr AS (SELECT "Ref Loans" id,max("Days Late") late,max("Charge Date") FILTER(WHERE "Charge Date"<=d) last_interest,
 max("Charge Date") last_charge,sum("Interest Remaining") FILTER(WHERE "Charge Date">d AND "Charge Date"<=me) scheduled
 FROM public.olap_charges_analytics CROSS JOIN ctx GROUP BY 1),
br AS (SELECT "Ref Borrowers" id,sum("Total Interest Received") total FROM public."Loans" GROUP BY 1),
a AS (SELECT l.*,coalesce(br.total,0) "Borrower Total Interest",
 CASE WHEN ${n('l."Principal Amount"')}>0 THEN coalesce(l."Total Interest Received",0)/l."Principal Amount"::numeric ELSE 0 END "Principal Recovered by Interest %",
 CASE WHEN l."Loan Date">d THEN 0 ELSE ${n('l."Principal Amount"')}*CASE WHEN l."Loan Date" BETWEEN ms AND me THEN d-l."Loan Date"+1 ELSE extract(day FROM d) END END "Principal Days MTD",
 (l."Loan Date"-date '2000-01-01')::numeric "Loan Start Day Index",
 l."Close Date" "Loan End Date",CASE WHEN l."Close Date" IS NOT NULL THEN l."Close Date"-l."Loan Date"+1 END "Loan Duration",
 CASE WHEN l."Loan Date">d THEN 0 ELSE ${n('l."Principal Amount"')}*(d-greatest(l."Loan Date",d-29)+1) END "30D Principal Days",
 d-l."Loan Date" "Loan Age Days",coalesce(l."Defaulted",false) "Defaulted Flag",
 greatest(0,cr.late) "Maximum Days Late",cr.last_interest "Last Interest Charge Date",
 greatest(0,d-coalesce(cr.last_interest,l."Loan Date")) "Accrued Interest Days",
 cr.last_charge,coalesce(cr.scheduled,0) scheduled,least(l."Due Date",me) forecast_end,
 (l."Due Date"-l."Loan Date"+1) term_days
 FROM public."Loans" l CROSS JOIN ctx LEFT JOIN cr ON cr.id=l."Row ID" LEFT JOIN br ON br.id=l."Ref Borrowers"),
b AS (SELECT a.*,${n('a."Principal Amount"')}*"Loan Start Day Index" "Principal Start Weight",
 CASE WHEN "Loan Age Days"<=10 THEN '0-10 Days' WHEN "Loan Age Days"<=20 THEN '11-20 Days' WHEN "Loan Age Days"<=30 THEN '21-30 Days' WHEN "Loan Age Days"<=60 THEN '31-60 Days' ELSE '60+ Days' END "Loan Age Bucket",
 CASE WHEN "Auto Charge Enabled" AND "Loan Type"='ดอกเบี้ยรายวัน' THEN ${n('a."Current Daily Interest"')}*"Accrued Interest Days" ELSE 0 END "Accrued Interest",
 CASE WHEN "Loan Type"='ผ่อนชำระรายวัน' AND "Loan Date" IS NOT NULL AND "Due Date">="Loan Date"
 THEN floor(${n('a."Principal Amount"')}/nullif(term_days,0)) ELSE 0 END "Daily Installment Base Principal",
 CASE "Loan Type" WHEN 'ดอกเบี้ยรายวัน' THEN ${n('a."Current Daily Interest"')}/nullif("Principal Amount"::numeric,0)
 WHEN 'กำหนดวันชำระ' THEN ${n('a."Fixed Interest"')}/nullif(term_days,0)/nullif("Principal Amount"::numeric,0)
 WHEN 'ผ่อนชำระรายวัน' THEN (${n('a."Daily Payment Amount"')}*term_days-${n('a."Principal Amount"')})/nullif(term_days,0)/nullif("Principal Amount"::numeric,0)
 ELSE 0 END "Effective Daily Interest Rate" FROM a),
final AS (SELECT b.*,CASE WHEN "Loan Status"='ปิดยอดแล้ว' THEN 0
 WHEN NOT coalesce("Auto Charge Enabled",false) OR ("Loan Type"='ดอกเบี้ยรายวัน' AND ${n('b."Current Daily Interest"')}=0) THEN scheduled
 WHEN "Loan Type"='ดอกเบี้ยรายวัน' THEN greatest(0,"Accrued Interest")+${n('b."Current Daily Interest"')}*(me-d)
 WHEN "Loan Type"='กำหนดวันชำระ' THEN CASE WHEN "Due Date">d AND "Due Date"<=me THEN ${n('b."Fixed Interest"')} ELSE 0 END
 WHEN "Loan Type"='ผ่อนชำระรายวัน' THEN CASE WHEN last_charge IS NOT NULL AND forecast_end>last_charge
 THEN ${n('b."Daily Payment Amount"')}*(forecast_end-last_charge)
 -(floor(${n('b."Principal Amount"')}/nullif(term_days,0))*(forecast_end-last_charge)
 +greatest(0,least(forecast_end-"Loan Date"+1,mod(${n('b."Principal Amount"')},nullif(term_days,0)))-(last_charge-"Loan Date"+1))) ELSE 0 END
 ELSE 0 END "Expected Interest This Month" FROM b CROSS JOIN ctx)
`,contract.columns.Loans.filter(x=>x.r007Move).map(x=>x['Column name']));

// Borrower aggregation: one grouped pass for each source, followed by scalar layers.
const cf='c."Charge Date"';
const count=pred=>`count(*) FILTER(WHERE ${pred})`;
const sum=(field,pred)=>`coalesce(sum(${field})${pred?` FILTER(WHERE ${pred})`:''},0)`;
const hist=`${cf}<d`, recent=`${cf}>=d-30 AND ${hist}`, h180=`${cf}>=d-180 AND ${hist}`, h90=`${cf}>=d-90 AND ${hist}`;
const collection='c."Ref Collection Borrower" IS NOT NULL';
const borrowerCtes=`
lr AS (SELECT l."Ref Borrowers" id,
 ${count('l."Loan Status"=\'ยังไม่ปิดยอด\'')} active,
 max(l."Loan Age Days") FILTER(WHERE l."Loan Status"='ยังไม่ปิดยอด') oldest,
 greatest(0,max(l."Principal Amount"::numeric) FILTER(WHERE l."Loan Status"='ปิดยอดแล้ว' AND l."Defaulted"=false)) largest,
 coalesce(avg(l."Principal Amount"::numeric) FILTER(WHERE l."Loan Status"='ปิดยอดแล้ว' AND l."Defaulted"=false),0) average_success,
 ${count('l."Defaulted"=true')} defaults,
 ${sum('l."Default Loss Amount"::numeric','l."Defaulted"=true')} loss,
 ${sum('l."30D Principal Days"')} gross_days,${sum('l."Expected Interest This Month"')} forecast,
 bool_or(l."Defaulted"=true AND l."Outstanding Principal">0) current_default
 FROM public.olap_loans_analytics l GROUP BY 1),
rr AS (SELECT l."Ref Borrowers" id,
 ${sum('r."Interest Paid"::numeric','r."Payment Date" BETWEEN d-29 AND d AND r."Interest Paid"::numeric>0')} profit30,
 ${sum('r."Interest Paid"::numeric','r."Payment Date">=d-10 AND r."Payment Date"<d AND r."Interest Paid"::numeric>0')} profit10,
 ${sum('r."Interest Paid"::numeric','r."Payment Date" BETWEEN ms AND me')} mtd,
 ${sum('r."30D Principal Reduction Days"')} reduction
 FROM public.olap_repayments_analytics r JOIN public."Loans" l ON l."Row ID"=r."Ref Loans" CROSS JOIN ctx GROUP BY 1),
cash AS (SELECT c."Ref Collection Borrower" id,${sum('r."Amount Received"')} collected
 FROM public.olap_repayments_analytics r JOIN public.olap_charges_analytics c ON c."Row ID"=r."Ref Charges"
 CROSS JOIN ctx WHERE r."Payment Date"=d AND c."Ref Collection Borrower" IS NOT NULL GROUP BY 1),
cr AS (SELECT l."Ref Borrowers" id,
 ${sum('c."Amount Remaining"',`${hist} AND c."Payment Status" IS DISTINCT FROM 'ชำระแล้ว'`)} overdue,
 ${count(`${hist} AND c."Payment Status" IS DISTINCT FROM 'ชำระแล้ว'`)} overdue_count,
 ${count(hist)} history,${count('c."Historical On Time"')} ontime,
 ${count(recent)} recent_count,${count(`${recent} AND c."Historical On Time"`)} recent_ontime,
 ${count('c."Historical Late"')} late_count,${count(`${recent} AND c."Historical Late"`)} recent_late,
 greatest(0,max(c."Days Late")) max_late,max(${cf}) FILTER(WHERE c."Days Late">0) last_late,
 ${count(h180)} history180,${count(`${h180} AND c."Historical On Time"`)} ontime180,
 ${count(h90)} history90,bool_or(l."Defaulted") FILTER(WHERE ${h90}) default90,
 greatest(0,max(c."Days Late") FILTER(WHERE ${h90})) late90,
 greatest(0,max(c."Days Late") FILTER(WHERE ${hist} AND c."Amount Remaining">0)) unpaid_late,
 bool_or(c."Total Paid">0) FILTER(WHERE ${cf}=d AND c."Amount Remaining">0) partial_today,
 ${count(`${cf}=d AND c."Amount Remaining">0`)} unpaid_today,
 min(${cf}) FILTER(WHERE ${hist}) first_history,
 ${count(collection)} collection_count,
 ${count(`${collection} AND ${hist} AND c."Payment Status" IS DISTINCT FROM 'ชำระแล้ว'`)} collection_overdue,
 ${count(`${collection} AND c."Payment Status"='รอชำระ'`)} collection_pending,
 ${count(`${collection} AND c."Payment Status"='ชำระบางส่วน'`)} collection_partial,
 ${count(`${collection} AND c."Payment Status"='ชำระแล้ว'`)} collection_paid,
 ${sum('c."Amount Due"',`${collection} AND ${cf}<=d`)} collection_due,
 ${sum('c."Amount Remaining"',`${collection} AND ${cf}<=d`)} collection_remaining,
 ${sum('c."Interest Remaining"',`${cf}<=d`)} interest_remaining
 FROM public.olap_charges_analytics c JOIN public."Loans" l ON l."Row ID"=c."Ref Loans" CROSS JOIN ctx GROUP BY 1),
er AS (SELECT "Ref Payee Borrower" id,sum("Amount"::numeric) rebate FROM public."Business Expenses" WHERE "Source Type"='Referral Rebate' GROUP BY 1),
pt AS (SELECT ${sum('"Outstanding Principal"')} portfolio FROM public."Loans"),
bt AS (SELECT ${sum('"Total Outstanding Principal"')} borrower_portfolio,
 ${count('"Has Active Loan"=true')} active_borrowers FROM public."Borrowers"),
a AS (SELECT b.*,
 CASE WHEN b."Total Outstanding Principal">0 THEN b."Active Loan Interest Earned"/b."Total Outstanding Principal" ELSE 0 END "Return on Active Principal",
 coalesce(rr.profit30,0) "Profit Last 30 Days",coalesce(rr.profit10,0) "Profit Last 10 Days",
 CASE WHEN b."Total Outstanding Principal"<=0 THEN NULL WHEN b."Active Loan Interest Earned">=b."Total Outstanding Principal" THEN d
 WHEN b."Active Daily Interest">0 THEN d+ceil((b."Total Outstanding Principal"-b."Active Loan Interest Earned")/b."Active Daily Interest")::integer END "Projected Interest Coverage Date",
 coalesce(b."Total Interest Earned",0)-coalesce(b."Active Loan Interest Earned",0) "Closed Loan Interest Earned",
 coalesce(b."Total Amount Loaned",0)-coalesce(b."Total Outstanding Principal",0) "Closed Loan Principle",
 coalesce(lr.gross_days,0) "30D Gross Principal Days",coalesce(rr.reduction,0) "30D Principal Reduction Days",
 round((coalesce(lr.gross_days,0)-coalesce(rr.reduction,0))/30) "30D Average Outstanding Principal",
 CASE WHEN coalesce(cr.collection_count,0)=0 THEN NULL WHEN cr.collection_overdue>0 THEN 'Overdue'
 WHEN cr.collection_pending=0 AND cr.collection_partial=0 THEN 'Fully Paid'
 WHEN cr.collection_partial>0 OR (cr.collection_paid>0 AND cr.collection_pending>0) THEN 'Partially Paid' ELSE 'Not Paid' END "Daily Collection Status",
 coalesce(cr.collection_due,0) "Todays Amount Due",coalesce(cash.collected,0) "Todays Amount Collected",coalesce(cr.collection_remaining,0) "Todays Amount Remaining",
 CASE WHEN bt.borrower_portfolio=0 THEN 0 ELSE coalesce(b."Total Outstanding Principal",0)/bt.borrower_portfolio END "Portfolio Exposure %",
 coalesce(lr.active,0) "Active Loan Count",coalesce(lr.oldest,0) "Oldest Active Loan Age",
 coalesce(cr.overdue,0) "Overdue Amount",coalesce(cr.overdue_count,0) "Overdue Charge Count",
 coalesce(cr.history,0) "Historical Charge Count",coalesce(cr.ontime,0) "On Time Charge Count",
 coalesce(cr.recent_count,0) "Recent 30D Charge Count",coalesce(cr.recent_ontime,0) "Recent 30D On Time Count",
 coalesce(cr.late_count,0) "Lifetime Late Payment Count",coalesce(cr.recent_late,0) "Recent 30D Late Payment Count",
 coalesce(cr.max_late,0) "Maximum Days Late",cr.last_late "Last Late Payment Date",
 coalesce(lr.largest,0) "Largest Successful Loan",round(coalesce(lr.average_success,0)) "Average Successful Loan Size",
 coalesce(lr.defaults,0) "Default Count",coalesce(lr.loss,0) "Lifetime Default Loss",pt.portfolio "Portfolio Outstanding Principal",
 coalesce(rr.mtd,0)+coalesce(cr.interest_remaining,0)+coalesce(lr.forecast,0) "Projected Monthly Profit Contribution",
 bt.active_borrowers "Matrix Active Borrower Count",1/nullif(bt.active_borrowers,0) "Matrix Equal Share Benchmark",
 cr.recent_ontime*100/nullif(cr.recent_count,0) "Matrix Recent Reliability Score",
 cr.ontime180*100/nullif(cr.history180,0) "Matrix Historical Reliability Score",
 CASE WHEN coalesce(cr.history90,0)=0 THEN NULL WHEN cr.default90 THEN 0 WHEN cr.late90=0 THEN 100 WHEN cr.late90<=1 THEN 90 WHEN cr.late90<=3 THEN 70 WHEN cr.late90<=7 THEN 40 ELSE 10 END "Matrix Delay Severity Score",
 CASE WHEN lr.current_default THEN 0 WHEN cr.unpaid_late>3 THEN 20 WHEN cr.unpaid_late>=2 THEN 40 WHEN cr.unpaid_late>=1 THEN 60 WHEN cr.partial_today THEN 75 WHEN cr.unpaid_today>0 THEN 90 ELSE 100 END "Matrix Current Condition Score",
 coalesce(d-cr.first_history>=3,true) "Matrix History Sufficient",
 coalesce(er.rebate,0) "Total Referral Rebate Earned"
 FROM public."Borrowers" b CROSS JOIN ctx CROSS JOIN pt CROSS JOIN bt
 LEFT JOIN lr ON lr.id=b."Row ID" LEFT JOIN rr ON rr.id=b."Row ID" LEFT JOIN cr ON cr.id=b."Row ID"
 LEFT JOIN cash ON cash.id=b."Row ID" LEFT JOIN er ON er.id=b."Row ID"),
b AS (SELECT a.*,
 CASE WHEN "Has Closed Loan" AND "Closed Loan Principle">0 THEN "Closed Loan Interest Earned"/"Closed Loan Principle" ELSE 0 END "Return on Closed Loans",
 CASE WHEN "30D Average Outstanding Principal">0 THEN "Profit Last 30 Days"/"30D Average Outstanding Principal" ELSE 0 END "30D Return on Average Principal",
 CASE WHEN "Historical Charge Count"=0 THEN 0 ELSE "On Time Charge Count"/"Historical Charge Count" END "Lifetime On Time Rate",
 CASE WHEN "Recent 30D Charge Count"=0 THEN 0 ELSE "Recent 30D On Time Count"/"Recent 30D Charge Count" END "Recent 30D On Time Rate",
 CASE WHEN sum("Profit Last 10 Days") FILTER(WHERE "Has Active Loan") OVER()>0
 THEN round("Profit Last 10 Days"/sum("Profit Last 10 Days") FILTER(WHERE "Has Active Loan") OVER(),2) END "Matrix Economic Contribution",
 trunc(round(10*(coalesce("Matrix Recent Reliability Score"*0.45,0)+coalesce("Matrix Historical Reliability Score"*0.20,0)+coalesce("Matrix Delay Severity Score"*0.20,0)+"Matrix Current Condition Score"*0.15)
 /(CASE WHEN "Matrix Recent Reliability Score" IS NOT NULL THEN 0.45 ELSE 0 END+CASE WHEN "Matrix Historical Reliability Score" IS NOT NULL THEN 0.20 ELSE 0 END+CASE WHEN "Matrix Delay Severity Score" IS NOT NULL THEN 0.20 ELSE 0 END+0.15))/10) "Matrix Stability Score"
 FROM a),
c AS (SELECT b.*,least(1,coalesce("Matrix Economic Contribution",0)*"Matrix Active Borrower Count"/2) "Matrix Scaled Economic Contribution" FROM b),
final AS (SELECT c.*,CASE WHEN "Has Active Loan"=false THEN NULL
 WHEN "Matrix Economic Contribution" IS NULL OR "Matrix Scaled Economic Contribution" IS NULL THEN 'Unclassified'
 WHEN "Matrix History Sufficient"=false THEN 'Provisional - insufficient history'
 WHEN "Matrix Economic Contribution">="Matrix Equal Share Benchmark" AND "Matrix Scaled Economic Contribution">=0.5 THEN 'Star'
 WHEN "Matrix Economic Contribution"<"Matrix Equal Share Benchmark" AND "Matrix Scaled Economic Contribution">=0.5 THEN 'Cash Cow'
 WHEN "Matrix Economic Contribution">="Matrix Equal Share Benchmark" AND "Matrix Scaled Economic Contribution"<0.5 THEN 'Question Mark' ELSE 'Dog' END "Matrix Quadrant" FROM c)
`;
view('Borrowers','olap_borrowers_analytics',borrowerCtes,contract.columns.Borrowers.filter(x=>x.r007Move).map(x=>x['Column name']));

view('Statistics','olap_portfolio_summary',`
lr AS (SELECT ${sum('"Outstanding Principal"')} principal,${count('"Loan Status"=\'ยังไม่ปิดยอด\'')} active,
 ${sum('"Expected Interest This Month"')} forecast,${sum('"Principal Days MTD"')} days,
 ${sum('"Expected Daily Interest Amount"')} daily,${sum('"Total Interest Received"','"Loan Status"=\'ยังไม่ปิดยอด\'')} active_profit FROM public.olap_loans_analytics),
rr AS (SELECT ${sum('"Interest Paid"::numeric')} profit,${sum('"Interest Paid"::numeric','"Payment Date"=d')} today,
 ${sum('"Interest Paid"::numeric','"Payment Date"=d-1')} yesterday,${sum('"Interest Paid"::numeric','"Payment Date" BETWEEN ms AND me')} mtd,
 ${sum('"Principal Returned Days MTD"')} returned_days,${sum('"Partner A Profit"')} profit_a,${sum('"Partner B Profit"')} profit_b
 FROM public.olap_repayments_analytics CROSS JOIN ctx),
cr AS (SELECT ${sum('"Amount Remaining"','nullif("Ref Loans",\'\') IS NOT NULL AND "Charge Date"<=d')} pending,
 ${sum('"Interest Remaining"','nullif("Ref Loans",\'\') IS NOT NULL AND "Charge Date"<=d')} interest,
 ${sum('"Amount Due"','"Charge Date"=d')} due,${sum('"Total Paid"','"Charge Date"=d')} paid,
 ${sum('"Amount Remaining"','"Charge Date"=d')} remaining FROM public.olap_charges_analytics CROSS JOIN ctx),
br AS (SELECT ${count('"Daily Collection Status"=\'Fully Paid\'')} full_count,${count('"Daily Collection Status"=\'Partially Paid\'')} partial_count,
 ${count('"Daily Collection Status"=\'Overdue\'')} overdue_count,${count('"Daily Collection Status"=\'Not Paid\'')} notpaid_count FROM public.olap_borrowers_analytics),
top3 AS (SELECT ${sum('v')} total FROM (SELECT "Total Outstanding Principal" v FROM public."Borrowers" WHERE "Total Outstanding Principal">0 ORDER BY 1 DESC LIMIT 3) q),
pool AS (SELECT ${sum('CASE WHEN "Transaction Type"=\'Contribution\' THEN "Amount"::numeric ELSE -"Amount"::numeric END')} total FROM public."Cash Pool Contributions"),
settled AS (SELECT ${sum('s."Amount"::numeric')} total FROM public."Settlements" s JOIN public."Partners" p ON p."Row ID"=s."Ref Partner" WHERE s."Status"='Completed'),
earned AS (SELECT ${sum('CASE p."Partner Role" WHEN \'A\' THEN rr.profit_a WHEN \'B\' THEN rr.profit_b ELSE 0 END')} total FROM public."Partners" p CROSS JOIN rr),
er AS (SELECT ${sum('"Amount"::numeric')} total,${sum('"Amount"::numeric','"Expense Date" BETWEEN ms AND d')} mtd FROM public."Business Expenses" CROSS JOIN ctx),
recent AS (SELECT a.* FROM public."Daily Analytics" a WHERE a."Snapshot Date">=(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')-interval '30 days'),
peak AS (SELECT coalesce(max("Outstanding Principal EOD"::numeric),0) amount FROM recent),
peakdate AS (SELECT max("Snapshot Date") dt FROM recent CROSS JOIN peak WHERE "Outstanding Principal EOD"::numeric=peak.amount),
a AS (SELECT s."Row ID",s."Statistics ID",rr.profit "Total Profit",lr.principal "Outstanding Principal",lr.principal "Total Outstanding Principal",
 lr.active "Active Loans",rr.today "Today's Profit",rr.yesterday "Yesterday's Profit",rr.mtd "Realized Profit MTD",
 rr.mtd+cr.interest+lr.forecast "Projected Monthly Profit",cr.pending "Pending Payment Amount",lr.forecast "Forecast Remaining Interest",cr.interest "Today's Outstanding Interest",
 lr.days-rr.returned_days "Net Principal Days MTD",lr.principal*(me-d) "Forecast Remaining Principal Days",
 round((lr.days-rr.returned_days+lr.principal*(me-d))/extract(day FROM me)) "Forecast Average Daily Outstanding Principal",
 peak.amount "Peak Cash Pool 30D",peakdate.dt "Peak Cash Pool Date 30D",lr.daily "Expected Daily Interest",lr.active_profit "Total Profit of Outstanding Loans",
 CASE WHEN lr.principal>0 THEN lr.active_profit/lr.principal ELSE 0 END "Profit Coverage of Outstanding Principal",
 pool.total "Total Cash Pool",earned.total-settled.total "Total Unsettled Profit",
 pool.total-lr.principal+earned.total-settled.total "Expected Loan Account Balance",
 CASE WHEN lr.principal=0 THEN 0 ELSE top3.total/lr.principal END "Top 3 Borrower Concentration",
 br.full_count "Borrowers Fully Paid Today",br.partial_count "Borrowers Partially Paid Today",br.overdue_count "Borrowers with Overdue Payment",br.notpaid_count "Borrowers Not Paid Today",
 cr.due "Amount Due Today",cr.paid "Amount Collected Today",cr.remaining "Amount Outstanding Today",
 CASE WHEN cr.due=0 THEN 0 ELSE cr.paid/cr.due END "Amount Collection Rate Today",
 er.total "Total Business Expenses",rr.profit-er.total "Net Profit",er.mtd "Expenses MTD",rr.mtd-er.mtd "Net Profit MTD",
 earned.total-settled.total-er.total "Net Unsettled Profit",pool.total-lr.principal+earned.total-settled.total-er.total "Net Expected Loan Account Balance",
 rr.mtd "Operating Income MTD",-er.mtd "Income Statement Expenses MTD"
 FROM public."Statistics" s CROSS JOIN ctx CROSS JOIN lr CROSS JOIN rr CROSS JOIN cr CROSS JOIN br CROSS JOIN top3 CROSS JOIN pool CROSS JOIN settled CROSS JOIN earned CROSS JOIN er CROSS JOIN peak CROSS JOIN peakdate),
final AS (SELECT a.*,CASE WHEN "Forecast Average Daily Outstanding Principal">0 THEN "Projected Monthly Profit"/"Forecast Average Daily Outstanding Principal" ELSE 0 END "Forecast Monthly Return on ADO" FROM a)
`,contract.columns.Statistics.filter(x=>x.r007Move).map(x=>x['Column name']));
await fs.writeFile('database/migrations/V22__olap_analytics_views.sql',sql,{flag:'wx'});
console.log('Wrote V22 candidate; do not regenerate after application.');
