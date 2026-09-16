-- Current AppSheet GUI reconciliation proves that Price(0) repayment partner
-- profit is rounded per row before SUM. Preserve the existing app formulas and
-- mirror their whole-baht values in the SQL settlement guard.
CREATE OR REPLACE FUNCTION public.partner_net_profit(p_partner text) RETURNS numeric
 LANGUAGE sql STABLE SET search_path=pg_catalog,public AS $$
 WITH partner AS (SELECT "Partner Role" role FROM public."Partners" WHERE "Row ID"=p_partner),
 gross AS (
 SELECT coalesce(sum(round(r."Interest Paid"::numeric*CASE WHEN c.pool>0 THEN coalesce(c.owned,0)/c.pool ELSE 0 END)),0) n
 FROM public."Repayments" r CROSS JOIN LATERAL (
 SELECT sum(CASE WHEN c."Transaction Type"='Contribution' THEN c."Amount"::numeric ELSE -c."Amount"::numeric END) pool,
 sum(CASE WHEN c."Transaction Type"='Contribution' THEN c."Amount"::numeric ELSE -c."Amount"::numeric END)
 FILTER(WHERE p."Partner Role"=(SELECT role FROM partner)) owned
 FROM public."Cash Pool Contributions" c LEFT JOIN public."Partners" p ON p."Row ID"=c."Ref Partner"
 WHERE c."Contribution Date"<=r."Payment Date") c)
 SELECT gross.n-coalesce((SELECT sum(CASE WHEN (SELECT role FROM partner)='A' THEN "Partner A Expense"::numeric
 WHEN (SELECT role FROM partner)='B' THEN "Partner B Expense"::numeric ELSE 0 END) FROM public."Business Expenses"),0) FROM gross;
$$;
