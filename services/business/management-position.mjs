import {expensePendingSql,rebatePendingSql} from './rebate-state.mjs';
import {readCashOverview} from './cash.mjs';
/** Read-only composition of the existing native cash providers. */
export async function readManagementPosition(client){
 const overview=await readCashOverview(client);
 const holders=(await client.query(`SELECT "Ref Cash Holder" id,"Holder Name" label,"Cash In"::numeric::text AS "cashIn","Cash Out"::numeric::text AS "cashOut","Current Balance"::numeric::text AS "currentBalance","Business Cash Held"::numeric::text AS "businessCashHeld","Reimbursement / Advance Due"::numeric::text AS "reimbursementDue" FROM public."Cash Holder Balances" ORDER BY "Holder Name" COLLATE "C","Ref Cash Holder" COLLATE "C"`)).rows;
 // R129 (V137): referral rebates booked and still pending payment (a liability beside the holder balances: Lisa holds this
 // cash until a settlement pays it), the pwa_rebate_pending_v1 rule; 0 before V137 (no REFERRAL_REBATE_V3 row).
 const rebatesPayable=(await client.query(`SELECT coalesce(sum(p.pending),0)::numeric(20,2)::text AS amount,count(*) FILTER (WHERE p.pending>0)::int AS count
  FROM public."Business Expenses" x LEFT JOIN public."Payments" o ON o."Row ID"=to_jsonb(x)->>'Ref Offset Payment' CROSS JOIN LATERAL (SELECT ${rebatePendingSql('x','o')} AS pending) p
  WHERE x."Source Type"='Referral Rebate' AND x."Rule Version"='REFERRAL_REBATE_V3'`)).rows[0]??{amount:'0.00',count:0};
 // R140 (V142): manual expenses recorded and still pending payment (no payer yet, so no cash has moved for them).
 const expensesPayable=(await client.query(`SELECT coalesce(sum(x."Amount"::numeric),0)::numeric(20,2)::text AS amount,count(*)::int AS count
  FROM public."Business Expenses" x WHERE ${expensePendingSql('x')}`)).rows[0]??{amount:'0.00',count:0};
 return {...overview,holders,rebatesPayable:{amount:rebatesPayable.amount,count:rebatesPayable.count},expensesPayable:{amount:expensesPayable.amount,count:expensesPayable.count}};
}
/** R115 Daily cash withdrawal: the holder is fixed; V127 checks every account of the command belongs to it. */
export const CASH_WITHDRAWAL_HOLDER='ch:dad';
const day=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&value>='0001-01-01'&&Number.isFinite(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
/**
 * Balance of each active account of Dad as of a Bangkok date and 10-minute time, from the governed statement views
 * (the same reading V127 recomputes before it writes): the day's opening balance ("Cash Account Daily Summary Recent")
 * plus that day's entries of "Cash Account Statement Recent" with Sort Timestamp at or before the time (ties included),
 * as `availableAsOf`; `maxWithdrawable` is the lesser of that and the lowest later running balance ("Balance After" of
 * every entry after the time), so a back-dated withdrawal never turns a later balance negative (V127 checks the same).
 * The views cover the latest 15 Bangkok days; outside them `covered` is false and every balance is null. An
 * uninitialized account has a null balance. `future` marks a date and time after now (V127 refuses it).
 * @param {{query:(text:string,values?:any[])=>Promise<{rows:any[]}>}} client
 * @param {{date?:string,time?:string}} [options]
 */
export async function readCashWithdrawal(client,{date,time}={}){
 if(!day(date)||typeof time!=='string'||!/^([01][0-9]|2[0-3]):[0-5]0$/.test(time))throw Error('invalid_request');
 const {rows}=await client.query(`WITH bounds AS (SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date AS today,date_trunc('minute',CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok') AS now),
 accounts AS (SELECT a."Row ID" id,a."Account Label" label FROM public."Cash Accounts" a JOIN public."Cash Holders" h ON h."Row ID"=a."Ref Cash Holder" WHERE h."Row ID"=$1 AND a."Active" AND h."Active"),
 balances AS (SELECT b.today,b.now,a.id,a.label,coalesce(d."Is Initialized",false) AS initialized,
  d."Opening Balance"+coalesce((SELECT sum(s."Signed Amount") FROM public."Cash Account Statement Recent" s WHERE s."Ref Cash Account"=a.id AND s."Statement Date"=$2::date AND s."Sort Timestamp"<=$2::date+$3::time),0) AS as_of,
  (SELECT min(s."Balance After") FROM public."Cash Account Statement Recent" s WHERE s."Ref Cash Account"=a.id AND (s."Statement Date">$2::date OR (s."Statement Date"=$2::date AND s."Sort Timestamp">$2::date+$3::time))) AS later_min
  FROM bounds b LEFT JOIN accounts a ON true LEFT JOIN public."Cash Account Daily Summary Recent" d ON d."Ref Cash Account"=a.id AND d."Statement Date"=$2::date)
 SELECT today::text AS today,to_char(now,'HH24:MI') AS "nowTime",$2::date BETWEEN today-14 AND today AS covered,($2::date+$3::time)>now AS future,id,label,initialized,
  as_of::text AS "availableAsOf",(CASE WHEN as_of IS NOT NULL THEN least(as_of,later_min) END)::text AS "maxWithdrawable"
 FROM balances ORDER BY label COLLATE "C",id COLLATE "C"`,[CASH_WITHDRAWAL_HOLDER,date,time]);
 const head=rows[0];
 return {date,time,holderId:CASH_WITHDRAWAL_HOLDER,today:head.today,nowTime:head.nowTime,covered:head.covered,future:head.future,
  accounts:rows.filter(row=>row.id!=null).map(row=>({id:row.id,label:row.label,initialized:row.initialized,availableAsOf:head.covered?row.availableAsOf:null,maxWithdrawable:head.covered?row.maxWithdrawable:null}))};
}
