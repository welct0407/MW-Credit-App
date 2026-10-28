-- R104 follow-up (owner, after the DEV try on 28 October 2026; Archie's design with the orchestrator's choice of fallback):
-- Upcoming Charges may record several future charges of a loan, strictly in schedule order (after the charge of 11-01 is
-- booked, 11-08 becomes recordable, and so on). V116 is applied and stays as it is.
-- 1. New read function pwa_next_bookable_charge_v1(borrower, day): the body of V112's pwa_next_projected_charge_v1 without
--    its one-ahead gate (a recorded charge dated after the day no longer skips the loan). Every other gate stays: open, not
--    defaulted, Auto Charge Enabled, daily-interest or daily-installment, Loan Date on or before the day, an undated charge
--    skips the loan, a daily-interest loan with unpaid principal on a charge is skipped, a repayment after the day makes the
--    inputs invalid, and the 93-day forecast horizon. The offered date is the forecast's first Simulated date (recorded
--    future rows count as recorded), and it must be after every recorded charge of the loan (strict schedule order). The
--    amounts are generate_loan_charge's own arithmetic for that date (daily interest from the latest charge on or before the
--    date; installment from the latest charge of all), so a booking equals the offer. SECURITY INVOKER with a pinned
--    search_path; EXECUTE to mw_app_<env> only, as V112.
-- 2. pwa_apply_loan_source_v2's loan.book-projected-charge branch checks the inputs against pwa_next_bookable_charge_v1
--    instead of pwa_next_projected_charge_v1 (one counted text replacement; CREATE OR REPLACE keeps owner and ACL).
-- pwa_next_projected_charge_v1 (Pay ahead, v9 materialize) and pwa_submit_selected_charges_v1 are not changed; the
-- self-check compares their source before and after. No table, column, constraint or role change; the one new grant is
-- EXECUTE on the new function to mw_app_<env>.

DO $preflight$
BEGIN
 IF current_database() NOT IN ('loan_manager_dev','payment_rehearsal','loan_manager_prod') THEN RAISE EXCEPTION 'Unsupported application database'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=CASE current_database() WHEN 'loan_manager_prod' THEN 'mw_app_prod' ELSE 'mw_app_dev' END) THEN RAISE EXCEPTION 'V117 needs the application role'; END IF;
 IF position('loan.book-projected-charge' IN pg_get_functiondef('public.pwa_apply_loan_source_v2(text)'::regprocedure))=0 THEN RAISE EXCEPTION 'V117 needs V116'; END IF;
END $preflight$;

CREATE TEMP TABLE v117_before ON COMMIT DROP AS
 SELECT p.oid::regprocedure::text AS routine,pg_get_userbyid(p.proowner) AS owner,coalesce(p.proacl::text,'') AS acl,p.prosecdef AS definer,md5(p.prosrc) AS source
 FROM pg_proc p WHERE p.oid IN ('public.pwa_apply_loan_source_v2(text)'::regprocedure,'public.pwa_next_projected_charge_v1(text,date)'::regprocedure,'public.pwa_submit_selected_charges_v1(text)'::regprocedure);

-- 1. The next bookable charge of each eligible loan of a borrower (read only).
CREATE FUNCTION public.pwa_next_bookable_charge_v1(p_borrower text,p_day date)
 RETURNS TABLE(loan_id text,charge_id text,charge_date date,principal_due numeric,interest_due numeric)
    LANGUAGE plpgsql STABLE
    SET search_path TO 'pg_catalog', 'public'
    AS $$
DECLARE l public."Loans"%ROWTYPE; loan jsonb; charges jsonb; blocked boolean; d date; latest date; days integer; elapsed integer; remainder numeric; p numeric; i numeric;
BEGIN
 IF p_borrower IS NULL OR p_day IS NULL THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Borrower and day required'; END IF;
 FOR l IN SELECT * FROM public."Loans" x WHERE x."Ref Borrowers"=p_borrower AND x."Loan Status"='ยังไม่ปิดยอด' AND NOT coalesce(x."Defaulted",false)
   AND coalesce(x."Auto Charge Enabled",false) AND x."Loan Type" IN ('ดอกเบี้ยรายวัน','ผ่อนชำระรายวัน') AND x."Loan Date"<=p_day
   ORDER BY x."Row ID" COLLATE "C" LOOP
  -- R104 V117: no one-ahead gate; an undated row still means no offer.
  IF EXISTS(SELECT 1 FROM public."Charges" c WHERE c."Ref Loans"=l."Row ID" AND c."Charge Date" IS NULL) THEN CONTINUE; END IF;
  IF l."Loan Type"='ดอกเบี้ยรายวัน' AND EXISTS(SELECT 1 FROM public."Charges" c WHERE c."Ref Loans"=l."Row ID"
    AND c."Principal Due"::numeric>coalesce((SELECT sum(r."Principal Paid"::numeric) FROM public."Repayments" r WHERE r."Ref Charges"=c."Row ID"),0)) THEN CONTINUE; END IF;
  -- Forecast inputs for this loan and day, as reporting_forecast_inputs_v1 builds them (V48, V53).
  SELECT jsonb_build_object('status',l."Loan Status",'defaulted',coalesce(l."Defaulted",false),'start',l."Loan Date",'close',l."Close Date",
    'balance',l."Principal Amount"::numeric-coalesce(sum(r."Principal Paid"::numeric) FILTER(WHERE r."Payment Date"<=p_day),0),'daily',l."Current Daily Interest"::numeric,'auto',l."Auto Charge Enabled",
    'interval',l."Interest Payment Interval",'anchor',l."Interest Schedule Anchor Date",'type',l."Loan Type",'due',l."Due Date",
    'arrangement',l."Loan Arrangement",'original',l."Principal Amount"::numeric,'payment',l."Daily Payment Amount"::numeric,'fixed',l."Fixed Interest"::numeric,
    'invalid',l."Loan Date" IS NULL OR l."Principal Amount" IS NULL OR NOT EXISTS(SELECT 1 FROM public."Borrowers" b WHERE b."Row ID"=l."Ref Borrowers")
     OR coalesce(bool_or(r."Payment Date" IS NULL OR r."Principal Paid" IS NULL OR r."Interest Paid" IS NULL OR r."Payment Date">p_day),false),
    'original_rate',l."Original Daily Interest Rate")
   INTO loan FROM public."Repayments" r WHERE r."Ref Loans"=l."Row ID";
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',c."Row ID",'date',c."Charge Date",'pdue',c."Principal Due"::numeric,'idue',c."Interest Due"::numeric,
    'ppaid',coalesce(paid.p,0),'ipaid',coalesce(paid.i,0),'invalid',coalesce(paid.invalid,false) OR c."Charge Date" IS NULL OR c."Principal Due" IS NULL OR c."Interest Due" IS NULL)),'[]'::jsonb)
   INTO charges FROM public."Charges" c
   LEFT JOIN LATERAL (SELECT sum(r."Principal Paid"::numeric) FILTER(WHERE r."Payment Date"<=p_day) p,sum(r."Interest Paid"::numeric) FILTER(WHERE r."Payment Date"<=p_day) i,
     bool_or(r."Payment Date" IS NULL OR r."Principal Paid" IS NULL OR r."Interest Paid" IS NULL OR r."Ref Loans" IS DISTINCT FROM c."Ref Loans") invalid
    FROM public."Repayments" r WHERE r."Ref Charges"=c."Row ID") paid ON true
   WHERE c."Ref Loans"=l."Row ID";
  -- The forecast gives the next date only; every row is read, so an Exception or Notice anywhere skips the loan.
  SELECT coalesce(bool_or(s.origin IN ('Exception','Notice')),false),min(s.due_date) FILTER(WHERE s.origin='Simulated' AND s.eligible AND s.due_date>p_day AND s.principal+s.interest>0)
   INTO blocked,d FROM public.forecast_schedule_v1(loan,charges,p_day,p_day+93) s;
  IF blocked OR d IS NULL THEN CONTINUE; END IF;
  -- Strict schedule order: the offer is after every recorded charge of the loan, booked future charges included.
  IF d<=(SELECT max(c."Charge Date") FROM public."Charges" c WHERE c."Ref Loans"=l."Row ID") THEN CONTINUE; END IF;
  -- The amounts are generate_loan_charge's own arithmetic for that date.
  IF l."Loan Type"='ดอกเบี้ยรายวัน' THEN
   SELECT max(c."Charge Date") INTO latest FROM public."Charges" c WHERE c."Ref Loans"=l."Row ID" AND c."Charge Date"<=d;
   p:=0;i:=l."Current Daily Interest"::numeric*greatest(0,d-coalesce(latest,l."Loan Date"));
  ELSE
   SELECT max(c."Charge Date") INTO latest FROM public."Charges" c WHERE c."Ref Loans"=l."Row ID";
   IF latest IS NULL OR l."Due Date" IS NULL THEN CONTINUE; END IF;
   days:=l."Due Date"-l."Loan Date"+1;elapsed:=d-latest;
   IF days<=0 OR elapsed<=0 THEN CONTINUE; END IF;
   remainder:=mod(l."Principal Amount"::numeric,days);
   p:=floor(l."Principal Amount"::numeric/days)*elapsed+
     greatest(0,least(d-l."Loan Date"+1,remainder)-(latest-l."Loan Date"+1));
   i:=l."Daily Payment Amount"::numeric*elapsed-p;
  END IF;
  IF p IS NULL OR i IS NULL OR p<0 OR i<0 OR p+i<=0 OR p<>trunc(p) OR i<>trunc(i) THEN CONTINUE; END IF;
  loan_id:=l."Row ID";charge_date:=d;charge_id:='cg8:'||length(l."Row ID")||':'||l."Row ID"||':'||to_char(d,'YYYY-MM-DD');principal_due:=trunc(p);interest_due:=trunc(i);
  RETURN NEXT;
 END LOOP;
END $$;

COMMENT ON FUNCTION public.pwa_next_bookable_charge_v1(text,date) IS 'R104 V117: per eligible loan of the borrower, the next scheduled charge after the day and after every recorded charge (generator key and amounts), recordable from Upcoming Charges by loan.book-projected-charge in schedule order. Read only.';
REVOKE ALL ON FUNCTION public.pwa_next_bookable_charge_v1(text,date) FROM PUBLIC;
-- A default privilege (PROD's mw_integration_agent EXECUTE ON ROUTINES) must not reach it either.
DO $acl$
DECLARE grantee text;
BEGIN
 FOR grantee IN SELECT DISTINCT pg_get_userbyid(a.grantee) FROM pg_proc p CROSS JOIN LATERAL aclexplode(p.proacl) a
   WHERE p.oid='public.pwa_next_bookable_charge_v1(text,date)'::regprocedure AND a.grantee<>0 AND a.grantee<>p.proowner LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION public.pwa_next_bookable_charge_v1(text,date) FROM %I',grantee);
 END LOOP;
 EXECUTE format('GRANT EXECUTE ON FUNCTION public.pwa_next_bookable_charge_v1(text,date) TO %I',CASE current_database() WHEN 'loan_manager_prod' THEN 'mw_app_prod' ELSE 'mw_app_dev' END);
END $acl$;

-- 2. The book branch reads the bookable charge (exactly one occurrence of the V112 read in the loan writer).
DO $apply$
DECLARE definition text;old text:='public.pwa_next_projected_charge_v1(';new text:='public.pwa_next_bookable_charge_v1(';
BEGIN
 SELECT pg_get_functiondef('public.pwa_apply_loan_source_v2(text)'::regprocedure) INTO definition;
 IF (length(definition)-length(replace(definition,old,'')))/length(old)<>1 OR position(new IN definition)>0 THEN RAISE EXCEPTION 'V117: unexpected pwa_apply_loan_source_v2 boundary';END IF;
 EXECUTE replace(definition,old,new);
END $apply$;

-- Self-check: the loan writer kept owner, ACL and security and reads the new function only; the Pay ahead functions are
-- unchanged; the new function's ACL is exact and it runs with the caller's rights.
DO $check$
DECLARE bad text;app text:=CASE current_database() WHEN 'loan_manager_prod' THEN 'mw_app_prod' ELSE 'mw_app_dev' END;definition text;
BEGIN
 SELECT string_agg(o.routine,', ') INTO bad FROM v117_before o JOIN pg_proc p ON p.oid=o.routine::regprocedure
  WHERE pg_get_userbyid(p.proowner)<>o.owner OR coalesce(p.proacl::text,'')<>o.acl OR p.prosecdef<>o.definer
   OR (o.routine<>'pwa_apply_loan_source_v2(text)' AND md5(p.prosrc)<>o.source);
 IF bad IS NOT NULL OR (SELECT count(*) FROM v117_before)<>3 THEN RAISE EXCEPTION 'V117 changed %',coalesce(bad,'an unexpected function set'); END IF;
 definition:=pg_get_functiondef('public.pwa_apply_loan_source_v2(text)'::regprocedure);
 IF position('pwa_next_bookable_charge_v1(' IN definition)=0 OR position('pwa_next_projected_charge_v1(' IN definition)>0 THEN RAISE EXCEPTION 'V117: the loan writer was not switched'; END IF;
 IF (SELECT array_agg(DISTINCT CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END||':'||a.privilege_type)
   FROM pg_proc p CROSS JOIN LATERAL aclexplode(p.proacl) a WHERE p.oid='public.pwa_next_bookable_charge_v1(text,date)'::regprocedure AND a.grantee<>p.proowner)
   IS DISTINCT FROM ARRAY[app||':EXECUTE'] THEN RAISE EXCEPTION 'V117: unexpected access to pwa_next_bookable_charge_v1'; END IF;
 IF (SELECT prosecdef FROM pg_proc WHERE oid='public.pwa_next_bookable_charge_v1(text,date)'::regprocedure) THEN RAISE EXCEPTION 'V117: the read function runs with the caller''s rights'; END IF;
END $check$;
