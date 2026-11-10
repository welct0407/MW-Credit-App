// R129 (V137): the derived state of a referral rebate, shared by every read (no imports, so borrowers.mjs can use it).
/**
 * The derived state of a referral rebate expense row `e` with its offset payment `o` (the V137 rule; the link is read
 * through to_jsonb(e), so a database before V137 reads the legacy states): 'offset' when the offset took the whole amount,
 * 'paid' (V3 settled), 'pending' (V3 not settled) and 'paid-at-close' (V1/V2: Lisa paid the rest on the close date); null
 * for a manual expense. The pending amount equals pwa_rebate_pending_v1.
 */
export const rebateStateSql=(e,o)=>`CASE WHEN ${e}."Source Type" IS DISTINCT FROM 'Referral Rebate' THEN NULL WHEN coalesce(${o}."Amount Received"::numeric,0)>=${e}."Amount"::numeric THEN 'offset'
 WHEN ${e}."Rule Version"='REFERRAL_REBATE_V3' AND to_jsonb(${e})->>'Ref Rebate Settlement' IS NOT NULL THEN 'paid' WHEN ${e}."Rule Version"='REFERRAL_REBATE_V3' THEN 'pending' ELSE 'paid-at-close' END`;
export const rebatePendingSql=(e,o)=>`CASE WHEN ${e}."Source Type" IS DISTINCT FROM 'Referral Rebate' THEN NULL WHEN ${e}."Rule Version"='REFERRAL_REBATE_V3' AND to_jsonb(${e})->>'Ref Rebate Settlement' IS NULL
 THEN greatest(${e}."Amount"::numeric-coalesce(${o}."Amount Received"::numeric,0),0) ELSE 0 END`;
// R140 (V142): a manual expense is pending payment when it is Manual, above zero, has no payer holder or account and is no
// R005 cutover source (those historical rows carry no payer by design). mw_app_<env> reads r005_cash_cutover_sources
// through the app-role policy's read-only class (V142's preflight refuses a provisioned role without it). A boolean SQL
// expression over row `e`.
export const expensePendingSql=e=>`(${e}."Source Type"='Manual' AND ${e}."Amount"::numeric>0 AND ${e}."Ref Paid By Cash Holder" IS NULL AND ${e}."Ref Paid By Cash Account" IS NULL
 AND NOT EXISTS(SELECT 1 FROM public.r005_cash_cutover_sources r005 WHERE r005.source_type='Business Expense' AND r005.source_row_id=${e}."Row ID"))`;
