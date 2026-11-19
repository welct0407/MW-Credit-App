-- R176 projected monthly goal: this month's charges only (Archie's design). Owner request, 19 November 2026: "limit the
-- goal to this month's charges only". Views only: no table, column, function, trigger, grant or data change.
-- "Projected Monthly Profit" was Realized Profit MTD + every unpaid interest charge up to today + the forecast of the rest
-- of the month, so interest still unpaid from earlier months inflated this month's goal.
--  - olap_portfolio_summary: the charges aggregate gains month_interest, the unpaid interest of charges dated from the
--    first of the reporting month to the reporting date, and "Projected Monthly Profit" (and so "Forecast Monthly Return
--    on ADO", which divides it) uses it. "Today's Outstanding Interest" and "Pending Payment Amount" keep every unpaid
--    charge up to today.
--  - olap_borrowers_analytics: interest_remaining, whose only reader is "Projected Monthly Profit Contribution", counts the
--    same month window, so the borrower contributions still add up to the portfolio goal.
-- Method (as V151): exact, counted text replacement of each view's pretty definition (pg_get_viewdef(view,true)), then
-- CREATE OR REPLACE VIEW, which keeps owner, ACL, options and comments. The preflight refuses a second application; the
-- self-check proves owner, ACL, options, comments and both column lists unchanged and that both views still read.
-- Test: Test-ProjectedMonthGoal.sql. Rollback: a later migration restores the "Charge Date" <= ctx.d windows.

DO $preflight$
BEGIN
 IF current_database() NOT IN ('loan_manager_dev','payment_rehearsal','loan_manager_prod') THEN RAISE EXCEPTION 'Unsupported application database'; END IF;
 IF position('AS last_paid' IN pg_get_viewdef('public.olap_borrowers_analytics'::regclass,true))=0 THEN RAISE EXCEPTION 'V152 needs V140'; END IF;
 IF position('AS month_interest' IN pg_get_viewdef('public.olap_portfolio_summary'::regclass,true))>0
  OR position('c."Charge Date" >= ctx.ms AND c."Charge Date" <= ctx.d), 0::numeric) AS interest_remaining' IN pg_get_viewdef('public.olap_borrowers_analytics'::regclass,true))>0 THEN
  RAISE EXCEPTION 'V152: the projected goal views are already rewritten'; END IF;
END $preflight$;

CREATE TEMP TABLE v152_views ON COMMIT DROP AS
 SELECT c.oid AS relid,c.oid::regclass::text AS relation,pg_get_userbyid(c.relowner) AS owner,coalesce(c.relacl::text,'') AS acl,
  coalesce(c.reloptions::text,'') AS options,coalesce(obj_description(c.oid,'pg_class'),'') AS comment,
  (SELECT array_agg(a.attname::text||':'||format_type(a.atttypid,a.atttypmod) ORDER BY a.attnum) FROM pg_attribute a
    WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped) AS columns,
  (SELECT coalesce(array_agg(coalesce(d.description,'') ORDER BY d.objsubid),'{}') FROM pg_description d
    WHERE d.objoid=c.oid AND d.classoid='pg_class'::regclass AND d.objsubid>0) AS column_comments
 FROM pg_class c WHERE c.oid IN ('public.olap_portfolio_summary'::regclass,'public.olap_borrowers_analytics'::regclass);

-- Replace each old fragment, which must occur exactly the given number of times, then recreate the view.
CREATE FUNCTION pg_temp.v152_view(relation text, edits text[], counts integer[]) RETURNS void LANGUAGE plpgsql AS $patch$
DECLARE definition text:=pg_get_viewdef(relation::regclass,true); k integer; o text; n text;
BEGIN
 FOR k IN 1..array_length(counts,1) LOOP
  o:=edits[2*k-1];n:=edits[2*k];
  IF (length(definition)-length(replace(definition,o,'')))/length(o)<>counts[k] THEN RAISE EXCEPTION 'V152: unexpected % boundary %',relation,k; END IF;
  definition:=replace(definition,o,n);
 END LOOP;
 EXECUTE 'CREATE OR REPLACE VIEW '||relation||' AS '||definition;
END $patch$;

SELECT pg_temp.v152_view('public.olap_portfolio_summary',ARRAY[
 -- month_interest follows the unchanged all-dates interest aggregate in the cr CTE.
 $o$COALESCE(sum(olap_charges_analytics."Interest Remaining") FILTER (WHERE NULLIF(olap_charges_analytics."Ref Loans", ''::text) IS NOT NULL AND olap_charges_analytics."Charge Date" <= ctx.d), 0::numeric) AS interest,$o$,
 $n$COALESCE(sum(olap_charges_analytics."Interest Remaining") FILTER (WHERE NULLIF(olap_charges_analytics."Ref Loans", ''::text) IS NOT NULL AND olap_charges_analytics."Charge Date" <= ctx.d), 0::numeric) AS interest,
            COALESCE(sum(olap_charges_analytics."Interest Remaining") FILTER (WHERE NULLIF(olap_charges_analytics."Ref Loans", ''::text) IS NOT NULL AND olap_charges_analytics."Charge Date" >= ctx.ms AND olap_charges_analytics."Charge Date" <= ctx.d), 0::numeric) AS month_interest,$n$,
 'rr.mtd + cr.interest + lr.forecast AS "Projected Monthly Profit"','rr.mtd + cr.month_interest + lr.forecast AS "Projected Monthly Profit"'],ARRAY[1,1]);

SELECT pg_temp.v152_view('public.olap_borrowers_analytics',ARRAY[
 'FILTER (WHERE c."Charge Date" <= ctx.d), 0::numeric) AS interest_remaining',
 'FILTER (WHERE c."Charge Date" >= ctx.ms AND c."Charge Date" <= ctx.d), 0::numeric) AS interest_remaining'],ARRAY[1]);

-- Self-check.
DO $check$
DECLARE bad text; portfolio text:=pg_get_viewdef('public.olap_portfolio_summary'::regclass,true);
 borrowers text:=pg_get_viewdef('public.olap_borrowers_analytics'::regclass,true);
BEGIN
 SELECT string_agg(o.relation,', ') INTO bad FROM v152_views o JOIN pg_class c ON c.oid=o.relid
  WHERE pg_get_userbyid(c.relowner)<>o.owner OR coalesce(c.relacl::text,'')<>o.acl OR coalesce(c.reloptions::text,'')<>o.options
   OR coalesce(obj_description(c.oid,'pg_class'),'')<>o.comment
   OR (SELECT coalesce(array_agg(coalesce(d.description,'') ORDER BY d.objsubid),'{}') FROM pg_description d
       WHERE d.objoid=c.oid AND d.classoid='pg_class'::regclass AND d.objsubid>0) IS DISTINCT FROM o.column_comments
   OR (SELECT array_agg(a.attname::text||':'||format_type(a.atttypid,a.atttypmod) ORDER BY a.attnum) FROM pg_attribute a
       WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped) IS DISTINCT FROM o.columns;
 IF bad IS NOT NULL THEN RAISE EXCEPTION 'V152 changed the owner, privileges, options, comments or columns of %',bad; END IF;
 IF (SELECT count(*) FROM v152_views)<>2 THEN RAISE EXCEPTION 'V152: a replaced view is missing'; END IF;
 IF position('rr.mtd + cr.month_interest + lr.forecast AS "Projected Monthly Profit"' IN portfolio)=0
  OR position('ctx.ms AND olap_charges_analytics."Charge Date" <= ctx.d), 0::numeric) AS month_interest' IN portfolio)=0
  OR position('cr.interest AS "Today''s Outstanding Interest"' IN portfolio)=0 OR position('cr.pending AS "Pending Payment Amount"' IN portfolio)=0
  OR position('c."Charge Date" >= ctx.ms AND c."Charge Date" <= ctx.d), 0::numeric) AS interest_remaining' IN borrowers)=0 THEN
  RAISE EXCEPTION 'V152: a rewritten goal fragment is missing'; END IF;
 PERFORM count(*) FROM public.olap_portfolio_summary;
 PERFORM count(*) FROM public.olap_borrowers_analytics;
END $check$;
