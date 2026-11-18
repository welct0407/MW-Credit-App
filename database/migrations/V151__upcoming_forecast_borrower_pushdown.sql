-- R175 database timeouts (Archie's design, item 2). Views only: no table, column, function, trigger, grant or data change.
-- A borrower-scoped read of the upcoming forecast simulated every loan, because each view computed the forecast in a
-- MATERIALIZED CTE (raw) that a "Ref Borrower" filter cannot enter; under load that page ran into the statement budget.
--  - oltp_upcoming_charge_events_v1: raw loses MATERIALIZED. It is referenced once (amounts), so the planner inlines it and
--    a borrower filter reaches "Loans" through the window partition (borrower_id) and the grouping keys. Same rows.
--  - oltp_upcoming_charge_coverage_v1: the two aggregates over raw (issues and dates) become one GROUP BY borrower_id
--    aggregate with FILTER, so the forecast is referenced once, raw loses MATERIALIZED and the borrower filter reaches
--    "Loans" through the LEFT JOIN. "Displayed Dates" is the old dates count as a FILTER: a borrower whose forecast has
--    no displayable date now aggregates 0 where it was NULL, and both read 0 through the existing COALESCE.
-- Method: exact, counted text replacement of each view's pretty definition (pg_get_viewdef(view,true), the V132 form),
-- then CREATE OR REPLACE VIEW, which keeps owner, ACL, options and comments. The self-check proves owner, ACL, options,
-- comments and both column lists unchanged and that neither definition still materializes the forecast.
-- Tests: Test-CoverageParity.sql (the V54 reference and the frozen V150 events definition equal the new views) and
-- Test-UpcomingCharges.sql (fixtures and plan shape). Rollback: a later migration restores MATERIALIZED and the two CTEs.

DO $preflight$
BEGIN
 IF current_database() NOT IN ('loan_manager_dev','payment_rehearsal','loan_manager_prod') THEN RAISE EXCEPTION 'Unsupported application database'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='public.oltp_upcoming_charge_events_v1'::regclass AND attname='Late Charge Remaining' AND NOT attisdropped) THEN
  RAISE EXCEPTION 'V151 needs V132'; END IF;
 IF position('raw AS MATERIALIZED' IN pg_get_viewdef('public.oltp_upcoming_charge_events_v1'::regclass,true))=0
  OR position('raw AS MATERIALIZED' IN pg_get_viewdef('public.oltp_upcoming_charge_coverage_v1'::regclass,true))=0 THEN
  RAISE EXCEPTION 'V151: the upcoming views are already rewritten'; END IF;
END $preflight$;

CREATE TEMP TABLE v151_views ON COMMIT DROP AS
 SELECT c.oid AS relid,c.oid::regclass::text AS relation,pg_get_userbyid(c.relowner) AS owner,coalesce(c.relacl::text,'') AS acl,
  coalesce(c.reloptions::text,'') AS options,coalesce(obj_description(c.oid,'pg_class'),'') AS comment,
  (SELECT array_agg(a.attname::text||':'||format_type(a.atttypid,a.atttypmod) ORDER BY a.attnum) FROM pg_attribute a
    WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped) AS columns,
  (SELECT coalesce(array_agg(coalesce(d.description,'') ORDER BY d.objsubid),'{}') FROM pg_description d
    WHERE d.objoid=c.oid AND d.classoid='pg_class'::regclass AND d.objsubid>0) AS column_comments
 FROM pg_class c WHERE c.oid IN ('public.oltp_upcoming_charge_events_v1'::regclass,'public.oltp_upcoming_charge_coverage_v1'::regclass);

-- Replace each old fragment, which must occur exactly the given number of times, then recreate the view.
CREATE FUNCTION pg_temp.v151_view(relation text, edits text[], counts integer[]) RETURNS void LANGUAGE plpgsql AS $patch$
DECLARE definition text:=pg_get_viewdef(relation::regclass,true); k integer; o text; n text;
BEGIN
 FOR k IN 1..array_length(counts,1) LOOP
  o:=edits[2*k-1];n:=edits[2*k];
  IF position(o IN definition)=0 AND position(E'\n' IN o)>0 THEN o:=replace(o,E'\n',E'\r\n');n:=replace(n,E'\n',E'\r\n'); END IF;
  IF (length(definition)-length(replace(definition,o,'')))/length(o)<>counts[k] THEN RAISE EXCEPTION 'V151: unexpected % boundary %',relation,k; END IF;
  definition:=replace(definition,o,n);
 END LOOP;
 EXECUTE 'CREATE OR REPLACE VIEW '||relation||' AS '||definition;
END $patch$;

SELECT pg_temp.v151_view('public.oltp_upcoming_charge_events_v1',ARRAY['raw AS MATERIALIZED (','raw AS ('],ARRAY[1]);

SELECT pg_temp.v151_view('public.oltp_upcoming_charge_coverage_v1',ARRAY[
 'raw AS MATERIALIZED (','raw AS (',
 -- The displayed-date count joins the issue aggregate as a FILTER.
 $o$            string_agg(DISTINCT raw.issue, '; '::text ORDER BY raw.issue) FILTER (WHERE raw.origin = 'Exception'::text) AS issue_text
$o$,
 $n$            string_agg(DISTINCT raw.issue, '; '::text ORDER BY raw.issue) FILTER (WHERE raw.origin = 'Exception'::text) AS issue_text,
            LEAST(count(DISTINCT raw.due_date) FILTER (WHERE raw.due_date > raw.reporting_date AND raw.due_date <= raw.horizon_end AND (raw.principal + raw.interest) > 0::numeric AND (raw.origin = 'Recorded'::text OR raw.origin = 'Simulated'::text AND raw.eligible)), 5::bigint)::integer AS displayed_dates
$n$,
 $o$        ), dates AS (
         SELECT raw.borrower_id,
            LEAST(count(DISTINCT raw.due_date), 5::bigint)::integer AS displayed_dates
           FROM raw
          WHERE raw.due_date > raw.reporting_date AND raw.due_date <= raw.horizon_end AND (raw.principal + raw.interest) > 0::numeric AND (raw.origin = 'Recorded'::text OR raw.origin = 'Simulated'::text AND raw.eligible)
          GROUP BY raw.borrower_id
$o$,'',
 $o$
     LEFT JOIN dates d ON d.borrower_id = b."Row ID"$o$,'',
 'd.displayed_dates','i.displayed_dates'],ARRAY[1,1,1,1,3]);

-- Self-check.
DO $check$
DECLARE bad text;
BEGIN
 SELECT string_agg(o.relation,', ') INTO bad FROM v151_views o JOIN pg_class c ON c.oid=o.relid
  WHERE pg_get_userbyid(c.relowner)<>o.owner OR coalesce(c.relacl::text,'')<>o.acl OR coalesce(c.reloptions::text,'')<>o.options
   OR coalesce(obj_description(c.oid,'pg_class'),'')<>o.comment
   OR (SELECT coalesce(array_agg(coalesce(d.description,'') ORDER BY d.objsubid),'{}') FROM pg_description d
       WHERE d.objoid=c.oid AND d.classoid='pg_class'::regclass AND d.objsubid>0) IS DISTINCT FROM o.column_comments
   OR (SELECT array_agg(a.attname::text||':'||format_type(a.atttypid,a.atttypmod) ORDER BY a.attnum) FROM pg_attribute a
       WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped) IS DISTINCT FROM o.columns;
 IF bad IS NOT NULL THEN RAISE EXCEPTION 'V151 changed the owner, privileges, options, comments or columns of %',bad; END IF;
 IF (SELECT count(*) FROM v151_views)<>2 THEN RAISE EXCEPTION 'V151: a replaced view is missing'; END IF;
 SELECT string_agg(r,', ') INTO bad FROM unnest(ARRAY['public.oltp_upcoming_charge_events_v1','public.oltp_upcoming_charge_coverage_v1']) r
  WHERE position('MATERIALIZED' IN pg_get_viewdef(r::regclass,true))>0
   OR (length(pg_get_viewdef(r::regclass,true))-length(replace(pg_get_viewdef(r::regclass,true),'forecast_schedule_v1','')))/length('forecast_schedule_v1')<>1;
 IF bad IS NOT NULL THEN RAISE EXCEPTION 'V151: % still materializes or repeats the forecast',bad; END IF;
 IF position('dates AS (' IN pg_get_viewdef('public.oltp_upcoming_charge_coverage_v1'::regclass,true))>0 THEN RAISE EXCEPTION 'V151: the coverage dates CTE remains'; END IF;
END $check$;
