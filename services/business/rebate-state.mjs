// R129 (V137) and R184 (V155): the derived state of a referral rebate, shared by every read (no imports, so borrowers.mjs can
// use it). One rule: the pending amount is the SQL function pwa_rebate_pending_v1 (Amount less its close-time offset less the
// amounts settlements applied to it), which Loan Close, the push and the settlement command also read (D2, D12).
// A database before V137 (a rehearsal pinned to an older family head, such as the V96 borrower family) has neither the
// function nor a REFERRAL_REBATE_V3 row: nothing is pending there and every rebate is settled by its offset or was paid at
// close. A read that must work on such a database asks rebateRules(client) first and passes the answer as `rules`; with
// rules false the expressions name no object of V137 or later.
/** Whether the SQL rebate rules exist (pwa_rebate_pending_v1, V137): one catalog read without a table privilege. */
export async function rebateRules(client){
 try{return (await client.query(`SELECT to_regprocedure('public.pwa_rebate_pending_v1(text)') IS NOT NULL AS present`))?.rows?.[0]?.present===true;}catch{return false;}
}
/**
 * The derived state of a referral rebate expense row `e` with its close-time offset payment `o`: 'offset' when the offset took
 * the whole amount; for a REFERRAL_REBATE_V3 row 'pending' (no settlement applied to it), 'part-paid' (a settlement applied
 * and something is still pending) or 'paid' (a settlement applied and nothing is pending); 'paid-at-close' for V1/V2 (Lisa
 * paid the rest on the close date); null for a manual expense. "Ref Rebate Settlement" names the rebate's newest settlement
 * and is null exactly when none applied (V155), so list reads need no join.
 */
export const rebateStateSql=(e,o,rules=true)=>rules?`CASE WHEN ${e}."Source Type" IS DISTINCT FROM 'Referral Rebate' THEN NULL WHEN coalesce(${o}."Amount Received"::numeric,0)>=${e}."Amount"::numeric THEN 'offset'
 WHEN ${e}."Rule Version"='REFERRAL_REBATE_V3' AND to_jsonb(${e})->>'Ref Rebate Settlement' IS NOT NULL THEN CASE WHEN public.pwa_rebate_pending_v1(${e}."Row ID")>0 THEN 'part-paid' ELSE 'paid' END
 WHEN ${e}."Rule Version"='REFERRAL_REBATE_V3' THEN 'pending' ELSE 'paid-at-close' END`
 :`CASE WHEN ${e}."Source Type" IS DISTINCT FROM 'Referral Rebate' THEN NULL WHEN coalesce(${o}."Amount Received"::numeric,0)>=${e}."Amount"::numeric THEN 'offset' ELSE 'paid-at-close' END`;
/** The pending amount of row `e` (pwa_rebate_pending_v1): null for a manual expense, 0 for offset-only, paid and legacy rows. */
export const rebatePendingSql=(e,rules=true)=>rules?`public.pwa_rebate_pending_v1(${e}."Row ID")`:`CASE WHEN ${e}."Source Type"='Referral Rebate' THEN 0::numeric END`;
/** What settlements applied to row `e` so far (the sum of its allocations, as the identity Amount = close-time offset +
 * settled + pending gives it without reading them): null for a manual expense, 0 for a legacy row. */
export const rebateSettledSql=(e,o,rules=true)=>rules?`CASE WHEN ${e}."Source Type" IS DISTINCT FROM 'Referral Rebate' THEN NULL WHEN ${e}."Rule Version"='REFERRAL_REBATE_V3'
 THEN greatest(${e}."Amount"::numeric-coalesce(${o}."Amount Received"::numeric,0)-public.pwa_rebate_pending_v1(${e}."Row ID"),0) ELSE 0 END`:`CASE WHEN ${e}."Source Type"='Referral Rebate' THEN 0::numeric END`;
// R140 (V142): a manual expense is pending payment when it is Manual, above zero, has no payer holder or account and is no
// R005 cutover source (those historical rows carry no payer by design). mw_app_<env> reads r005_cash_cutover_sources
// through the app-role policy's read-only class (V142's preflight refuses a provisioned role without it). A boolean SQL
// expression over row `e`.
export const expensePendingSql=e=>`(${e}."Source Type"='Manual' AND ${e}."Amount"::numeric>0 AND ${e}."Ref Paid By Cash Holder" IS NULL AND ${e}."Ref Paid By Cash Account" IS NULL
 AND NOT EXISTS(SELECT 1 FROM public.r005_cash_cutover_sources r005 WHERE r005.source_type='Business Expense' AND r005.source_row_id=${e}."Row ID"))`;
