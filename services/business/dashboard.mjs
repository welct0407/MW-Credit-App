import {readCashOverview} from './cash.mjs';
import {LATE_CHARGE_SCHEMA_SQL} from '../lib/late-charge-schema.mjs';
const metrics={pendingPaymentAmount:'Pending Payment Amount',todayProfit:"Today's Profit",yesterdayProfit:"Yesterday's Profit",netProfit:'Net Profit',notPaid:'Borrowers Not Paid Today',partiallyPaid:'Borrowers Partially Paid Today',overdue:'Borrowers with Overdue Payment',longOverdue:'Borrowers with Long Overdue Payment',fullyPaid:'Borrowers Fully Paid Today',expectedDailyInterest:'Expected Daily Interest',realizedProfitMtd:'Realized Profit MTD',forecastRemainingInterest:'Forecast Remaining Interest',projectedMonthlyProfit:'Projected Monthly Profit',totalCashPool:'Total Cash Pool',activeLoanProfit:'Total Profit of Outstanding Loans',profitCoverageRatio:'Profit Coverage of Outstanding Principal'};
/* R187 (owner): last month's Realized Profit (before write-offs) for the KPI row. Exactly the V132 olap_portfolio_summary
   rr.mtd sum (interest plus late charge of every repayment, write-off pairs excluded through is_principal_writeoff and the
   same "Charges" lookup) over the previous Bangkok month of olap_reporting_date(). Read-only and inline (no migration); it
   names only the Repayments and Charges columns the record reads already use (no wx.*, so column grants suffice). A
   schema before V130/V132 has no predicate or late column, so the field is omitted; the read runs under a savepoint and any
   failure or non-numeric answer omits it too, never failing the Dashboard. */
const WRITEOFF_PREDICATE="to_regprocedure('public.is_principal_writeoff(text,text,numeric,numeric,text,numeric,numeric,bigint)') IS NOT NULL";
export const LAST_MONTH_REALIZED_PROFIT_SQL=`WITH ctx AS (SELECT date_trunc('month',d)::date ms FROM (SELECT public.olap_reporting_date() d) q)
SELECT coalesce(sum(r."Interest Paid"::numeric+r."Late Charge Paid"::numeric) FILTER(WHERE NOT r.loss_pair),0)::text AS "lastMonthRealizedProfit"
FROM (SELECT wx."Interest Paid",wx."Late Charge Paid",public.is_principal_writeoff(wx."Row ID",wx."Ref Payment",wx."Principal Paid"::numeric,wx."Interest Paid"::numeric,wx."Ref Charges",wc.principal,wc.interest,wc.repayments) AS loss_pair
 FROM public."Repayments" wx CROSS JOIN ctx LEFT JOIN LATERAL (SELECT c."Principal Due"::numeric AS principal,c."Interest Due"::numeric AS interest,(SELECT count(*) FROM public."Repayments" n WHERE n."Ref Charges"=c."Row ID") AS repayments FROM public."Charges" c WHERE c."Row ID"=wx."Ref Charges" AND wx."Ref Payment" IS NULL AND wx."Principal Paid"::numeric>0 AND wx."Interest Paid"::numeric=-wx."Principal Paid"::numeric) wc ON true
 WHERE wx."Payment Date" BETWEEN (ctx.ms-interval '1 month')::date AND ctx.ms-1) r`;
async function readLastMonthRealizedProfit(client){
 try{
  const gate=(await client.query(`SELECT (${LATE_CHARGE_SCHEMA_SQL}) AND ${WRITEOFF_PREDICATE} AS ready`))?.rows?.[0]?.ready===true;if(!gate)return undefined;
  await client.query('SAVEPOINT dashboard_last_month');
  try{const value=(await client.query(LAST_MONTH_REALIZED_PROFIT_SQL))?.rows?.[0]?.lastMonthRealizedProfit;await client.query('RELEASE SAVEPOINT dashboard_last_month');return typeof value==='string'&&/^-?[0-9]+(?:\.[0-9]+)?$/.test(value)?value:undefined}
  catch{await client.query('ROLLBACK TO SAVEPOINT dashboard_last_month');await client.query('RELEASE SAVEPOINT dashboard_last_month');return undefined}
 }catch{return undefined}
}
export async function readDashboard(client){
 const projection=Object.entries(metrics).map(([key,column])=>`"${column}"::text AS "${key}"`).join(',');
 // R109: "Total Principal Loss" (V120) is read by name from the row, so a database before V120 omits the figure (the PWA
 // hides a missing row) instead of failing the whole Dashboard; a present value must be numeric like every other metric.
 const rows=(await client.query(`SELECT DISTINCT ${projection},to_jsonb(s)->>'Total Principal Loss' AS "principalLoss" FROM public.olap_portfolio_summary s LIMIT 2`)).rows;
 const loss=rows[0]?.principalLoss;if(rows.length===1&&loss!==null&&(typeof loss!=='string'||!/^-?[0-9]+(?:\.[0-9]+)?$/.test(loss)))throw Error('Dashboard provider unavailable');
 if(rows.length===1)delete rows[0].principalLoss;
 if(rows.length!==1||Object.keys(metrics).some(key=>!Object.hasOwn(rows[0],key))||Object.values(rows[0]).some(value=>typeof value!=='string'||! /^-?[0-9]+(?:\.[0-9]+)?$/.test(value)))throw Error('Dashboard provider unavailable');
 const row=rows[0],counts={};for(const key of ['notPaid','partiallyPaid','overdue','longOverdue','fullyPaid']){const number=Number(row[key]);if(!Number.isSafeInteger(number)||number<0)throw Error('Invalid provider count');counts[key]=number;}
 const stamp=(await client.query(`SELECT to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "asOf",(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date::text AS "businessDate"`)).rows[0],cash=await readCashOverview(client),lastMonth=await readLastMonthRealizedProfit(client);
 return {...stamp,pendingPaymentAmount:row.pendingPaymentAmount,todayProfit:row.todayProfit,yesterdayProfit:row.yesterdayProfit,netProfit:row.netProfit,...(loss===null||loss===undefined?{}:{principalLoss:loss}),...(lastMonth===undefined?{}:{lastMonthRealizedProfit:lastMonth}),collection:counts,forecast:Object.fromEntries(['expectedDailyInterest','realizedProfitMtd','forecastRemainingInterest','projectedMonthlyProfit'].map(key=>[key,row[key]])),portfolio:Object.fromEntries(['totalCashPool','activeLoanProfit','profitCoverageRatio'].map(key=>[key,row[key]])),incomeMtd:cash.dashboard,businessCashHeld:cash.accounts};
}
