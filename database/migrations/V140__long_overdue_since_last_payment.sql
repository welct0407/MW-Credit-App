-- R137 (owner decision of 9 November 2026): "Long Overdue" counts from the borrower's last payment, not from the charge date.
-- A Collection borrower is Long Overdue when at least one Collection charge dated before the reporting date d is not fully
-- paid AND d minus the borrower's last payment date is 8 or more days; a borrower who never paid counts from the first
-- charge date. Overdue is an unpaid past-due charge with a payment within the last 7 days. The rule matches the PWA
-- Collection board (services/api/collection-read-contract.mjs, LONG_OVERDUE_SINCE_PAYMENT_DAYS = 8).
-- A payment is any posted repayment row of any amount, per borrower across all loans: "Repayments"."Ref Payment" set, the
-- payment's "Payment Method" neither 'Referral Rebate Offset' (V122, a rebate netted off, no cash) nor 'Net-off at
-- Disbursement' (the first-day charge netted from a disbursement, and the V138 rollover settlement netted from the new
-- loan: no cash from the borrower), Principal + Interest + Late Charge paid above 0, "Payment Date" on or before d. The
-- borrower is the borrower of the repaid charge's loan. The first charge date ignores df10: rows (default-loss charges).
--
-- Object: olap_borrowers_analytics, replaced by a counted text replacement of its current pretty definition (the V132
-- method): two CTEs (lp: last payment, fc: first charge) are added before cr, and cr's collection_long_overdue becomes 1
-- when the borrower is Long Overdue under the new rule (0 otherwise). Name, column list, types and order unchanged (no
-- "Days Since Last Payment" column: that needs its own owner authority). olap_portfolio_summary and the other dependants
-- read the view unchanged and follow automatically; CREATE OR REPLACE keeps owner, grants, options and comments, and the
-- self-check proves it. No table, column, function, trigger, grant or data change.
-- Rollback: a later migration restores the V132 text of collection_long_overdue (charge older than d - 7) and drops the
-- two CTEs by the same method.

DO $preflight$
DECLARE problems text[]:='{}'; definition text;
BEGIN
 IF current_database() NOT IN ('loan_manager_dev','payment_rehearsal','loan_manager_prod') THEN RAISE EXCEPTION 'Unsupported application database'; END IF;
 IF position('R136 V139' IN pg_get_functiondef('public.pwa_apply_loan_create_v2(text)'::regprocedure))=0 THEN problems:=problems||'V140 needs V139'::text; END IF;
 definition:=pg_get_viewdef('public.olap_borrowers_analytics'::regclass,true);
 IF position('AS last_paid' IN definition)>0 THEN problems:=problems||'V140: olap_borrowers_analytics is already patched'::text; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=current_user AND rolsuper)
  AND NOT pg_has_role(current_user,(SELECT relowner FROM pg_class WHERE oid='public.olap_borrowers_analytics'::regclass),'USAGE') THEN
  problems:=problems||format('%s cannot replace olap_borrowers_analytics',current_user); END IF;
 IF cardinality(problems)>0 THEN RAISE EXCEPTION 'V140 preflight: %',array_to_string(problems,'; '); END IF;
END $preflight$;

-- Snapshot of the replaced view and its summary dependant: owner, ACL, options, comments and columns before.
CREATE TEMP TABLE v140_views ON COMMIT DROP AS
 SELECT c.oid AS relid,c.oid::regclass::text AS relation,pg_get_userbyid(c.relowner) AS owner,coalesce(c.relacl::text,'') AS acl,
  coalesce(c.reloptions::text,'') AS options,coalesce(obj_description(c.oid,'pg_class'),'') AS comment,
  (SELECT array_agg(a.attname::text||':'||format_type(a.atttypid,a.atttypmod) ORDER BY a.attnum) FROM pg_attribute a
    WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped) AS columns,
  (SELECT coalesce(array_agg(coalesce(d.description,'') ORDER BY d.objsubid),'{}') FROM pg_description d
    WHERE d.objoid=c.oid AND d.classoid='pg_class'::regclass AND d.objsubid>0) AS column_comments
 FROM pg_class c WHERE c.oid IN ('public.olap_borrowers_analytics'::regclass,'public.olap_portfolio_summary'::regclass);

-- Each old text must occur exactly once in the pretty definition (pg_get_viewdef(view,true)); it is replaced, then the view
-- is recreated with CREATE OR REPLACE VIEW.
CREATE FUNCTION pg_temp.v140_view(relation text, edits text[]) RETURNS void LANGUAGE plpgsql AS $patch$
DECLARE definition text:=pg_get_viewdef(relation::regclass,true); k integer; o text;
BEGIN
 FOR k IN 1..array_length(edits,1)/2 LOOP
  o:=edits[2*k-1];
  IF (length(definition)-length(replace(definition,o,'')))/length(o)<>1 THEN RAISE EXCEPTION 'V140: unexpected % boundary %',relation,k; END IF;
  definition:=replace(definition,o,edits[2*k]);
 END LOOP;
 EXECUTE 'CREATE OR REPLACE VIEW '||relation||' AS '||definition;
END $patch$;

SELECT pg_temp.v140_view('public.olap_borrowers_analytics',ARRAY[
 -- 1. lp: each borrower's last payment on or before d; fc: each borrower's first charge date (df10: rows excluded).
 $o$), cr AS ($o$,
 $n$), lp AS (
                 SELECT l_1."Ref Borrowers" AS id,
                    max(r_1."Payment Date") AS last_paid
                   FROM public."Repayments" r_1
                     JOIN public."Payments" p_1 ON p_1."Row ID" = r_1."Ref Payment"
                     JOIN public."Charges" c_1 ON c_1."Row ID" = r_1."Ref Charges"
                     JOIN public."Loans" l_1 ON l_1."Row ID" = c_1."Ref Loans"
                     CROSS JOIN ctx
                  WHERE r_1."Payment Date" <= ctx.d AND p_1."Payment Method" IS DISTINCT FROM 'Referral Rebate Offset'::text
                    AND p_1."Payment Method" IS DISTINCT FROM 'Net-off at Disbursement'::text
                    AND (r_1."Principal Paid"::numeric + r_1."Interest Paid"::numeric + r_1."Late Charge Paid"::numeric) > 0::numeric
                  GROUP BY l_1."Ref Borrowers"
                ), fc AS (
                 SELECT l_1."Ref Borrowers" AS id,
                    min(c_1."Charge Date") AS first_due
                   FROM public."Charges" c_1
                     JOIN public."Loans" l_1 ON l_1."Row ID" = c_1."Ref Loans"
                  WHERE NOT starts_with(c_1."Row ID", 'df10:'::text)
                  GROUP BY l_1."Ref Borrowers"
                ), cr AS ($n$,
 -- 2. R137: Long Overdue = an unpaid past-due Collection charge and 8 or more days since the last payment (else the first charge).
 $o$count(*) FILTER (WHERE c."Ref Collection Borrower" IS NOT NULL AND c."Charge Date" < (ctx.d - 7) AND c."Payment Status" IS DISTINCT FROM 'ชำระแล้ว'::text) AS collection_long_overdue$o$,
 $n$CASE WHEN count(*) FILTER (WHERE c."Ref Collection Borrower" IS NOT NULL AND c."Charge Date" < ctx.d AND c."Payment Status" IS DISTINCT FROM 'ชำระแล้ว'::text) > 0
                      AND (max(ctx.d) - COALESCE((SELECT lp.last_paid FROM lp WHERE lp.id = l."Ref Borrowers"), (SELECT fc.first_due FROM fc WHERE fc.id = l."Ref Borrowers"))) >= 8
                    THEN 1::bigint ELSE 0::bigint END AS collection_long_overdue$n$]);

DO $selfcheck$
DECLARE bad text; definition text:=pg_get_viewdef('public.olap_borrowers_analytics'::regclass,true);
BEGIN
 IF position('AS last_paid' IN definition)=0 OR position('AS first_due' IN definition)=0 OR position('(ctx.d - 7)' IN definition)>0
  OR position('Net-off at Disbursement' IN definition)=0 OR position('Referral Rebate Offset' IN definition)=0 THEN
  RAISE EXCEPTION 'V140: olap_borrowers_analytics is not patched as intended'; END IF;
 -- Owner, privileges, options, comments and every column (name, type, order) unchanged on both views.
 SELECT string_agg(o.relation,', ') INTO bad FROM v140_views o JOIN pg_class c ON c.oid=o.relid
  WHERE pg_get_userbyid(c.relowner)<>o.owner OR coalesce(c.relacl::text,'')<>o.acl OR coalesce(c.reloptions::text,'')<>o.options
   OR coalesce(obj_description(c.oid,'pg_class'),'')<>o.comment
   OR (SELECT coalesce(array_agg(coalesce(d.description,'') ORDER BY d.objsubid),'{}') FROM pg_description d
       WHERE d.objoid=c.oid AND d.classoid='pg_class'::regclass AND d.objsubid>0) IS DISTINCT FROM o.column_comments
   OR (SELECT array_agg(a.attname::text||':'||format_type(a.atttypid,a.atttypmod) ORDER BY a.attnum) FROM pg_attribute a
       WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped) IS DISTINCT FROM o.columns;
 IF bad IS NOT NULL THEN RAISE EXCEPTION 'V140 changed the owner, privileges, options, comments or columns of %',bad; END IF;
 -- The dependants still read the view.
 PERFORM count(*) FROM public.olap_portfolio_summary;
 PERFORM count(*) FROM public.reporting_borrower_directory_v1;
END $selfcheck$;
