-- R111 follow-up (Archie): V122's pay-forward booking helper pwa_apply_pay_forward_v1(jsonb,jsonb,date) is SECURITY INVOKER
-- and trusts the plan it is given, so it is journal-owner-only by design (V122). The guarded runner's application-role
-- reconcile granted it EXECUTE to mw_app_<env> on DEV because the function carried no governance comment. V122 is
-- applied and stays; this migration closes the helper:
-- 1. the governance comment, so the reconcile's protectedObject rule (app-role-policy.mjs) leaves it alone (as V88, V99);
-- 2. EXECUTE revoked from mw_app_<env> and PUBLIC (and any other grantee but the journal owner);
-- 3. the same body with a guard first: only the journal owner (the definer commands pwa_submit_selected_charges_v1 and
--    pwa_submit_operation_v2, whose referral trigger books the rebate offset) may run it (42501 otherwise);
-- 4. a self-check of the ACL, the comment and the guard. Functions and privileges only; no table, column or trigger.

DO $preflight$
BEGIN
 IF current_database() NOT IN ('loan_manager_dev','payment_rehearsal','loan_manager_prod') THEN RAISE EXCEPTION 'Unsupported application database'; END IF;
 IF to_regprocedure('public.pwa_apply_pay_forward_v1(jsonb,jsonb,date)') IS NULL THEN RAISE EXCEPTION 'V123 needs V122'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=CASE current_database() WHEN 'loan_manager_prod' THEN 'mw_app_prod_journal_owner' ELSE 'mw_app_dev_journal_owner' END) THEN RAISE EXCEPTION 'V123 needs the journal owner'; END IF;
END $preflight$;

CREATE OR REPLACE FUNCTION public.pwa_apply_pay_forward_v1(p_principal jsonb, p_materialize jsonb, p_today date) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
DECLARE entry jsonb; booked text; principal_loans text[];
BEGIN
 -- R111 V123: the booking trusts its plan, so only the governed definer commands (the journal owner) may run it.
 IF (current_database() NOT IN ('loan_manager_dev','payment_rehearsal','loan_manager_prod') OR current_user<>CASE current_database() WHEN 'loan_manager_prod' THEN 'mw_app_prod_journal_owner' ELSE 'mw_app_dev_journal_owner' END) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Governed operation required';END IF;
 IF jsonb_typeof(p_principal) IS DISTINCT FROM 'array' OR jsonb_typeof(p_materialize) IS DISTINCT FROM 'array' OR p_today IS NULL THEN RAISE EXCEPTION USING ERRCODE='P4C05'; END IF;
 SELECT coalesce(array_agg(value->>'loanId'),ARRAY[]::text[]) INTO principal_loans FROM jsonb_array_elements(p_principal);
 FOR entry IN SELECT value FROM jsonb_array_elements(p_principal) LOOP
  IF entry->>'kind'='raise' THEN
   -- guard_charge_consistency allows raising a due; the expected old due makes a concurrent change a rejection.
   UPDATE public."Charges" SET "Principal Due"=(entry->>'principalDue')::numeric::money WHERE "Row ID"=entry->>'chargeId' AND "Ref Loans"=entry->>'loanId' AND "Charge Date"=p_today
    AND "Principal Due"::numeric=(entry->>'principalDue')::numeric-(entry->>'amount')::numeric;
   IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P4C05';END IF;
  ELSE
   IF EXISTS(SELECT 1 FROM public."Charges" WHERE "Row ID"=entry->>'chargeId') THEN RAISE EXCEPTION USING ERRCODE='P4C05';END IF;
   INSERT INTO public."Charges"("Row ID","Ref Loans","Charge Date","Principal Due","Interest Due")
    VALUES(entry->>'chargeId',entry->>'loanId',p_today,(entry->>'principalDue')::numeric::money,(entry->>'accruedInterest')::numeric::money);
  END IF;
  -- D9 interval reset: the first later scheduled charge is today plus the interval (a no-op on a schedule day).
  UPDATE public."Loans" SET "Interest Schedule Anchor Date"=p_today WHERE "Row ID"=entry->>'loanId';
 END LOOP;
 FOR entry IN SELECT value FROM jsonb_array_elements(p_materialize) LOOP
  BEGIN
   booked:=public.generate_loan_charge(entry->>'loanId',(entry->>'chargeDate')::date);
  EXCEPTION WHEN SQLSTATE 'P0001' THEN RAISE EXCEPTION USING ERRCODE='P4C05';
  END;
  IF booked IS DISTINCT FROM entry->>'chargeId' THEN RAISE EXCEPTION USING ERRCODE='P4C05';END IF;
  -- Current Daily Interest is recomputed only once the principal repayment posts, so for a loan repaying principal the
  -- generator priced this charge at the old daily amount; its Interest Due becomes the plan's server-recomputed value
  -- (new daily amount x days, never from the client), and the new daily amount is verified after posting.
  IF entry->>'loanId'=ANY(principal_loans) THEN
   UPDATE public."Charges" SET "Interest Due"=(entry->>'interestDue')::numeric::money WHERE "Row ID"=booked AND "Interest Due"::numeric<>(entry->>'interestDue')::numeric;
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public."Charges" WHERE "Row ID"=booked AND "Ref Loans"=entry->>'loanId' AND "Charge Date"=(entry->>'chargeDate')::date
    AND "Principal Due"::numeric=(entry->>'principalDue')::numeric AND "Interest Due"::numeric=(entry->>'interestDue')::numeric) THEN RAISE EXCEPTION USING ERRCODE='P4C05';END IF;
 END LOOP;
END $$;


COMMENT ON FUNCTION public.pwa_apply_pay_forward_v1(jsonb,jsonb,date) IS 'mw-access:governance R111 pay-forward booking of a server-recomputed plan (v10 command and the Loan Close rebate offset); journal owner only, P4C05 on drift.';

DO $acl$
DECLARE grantee text; owner text:=CASE current_database() WHEN 'loan_manager_prod' THEN 'mw_app_prod_journal_owner' ELSE 'mw_app_dev_journal_owner' END;
BEGIN
 REVOKE ALL ON FUNCTION public.pwa_apply_pay_forward_v1(jsonb,jsonb,date) FROM PUBLIC;
 FOR grantee IN SELECT DISTINCT pg_get_userbyid(a.grantee) FROM pg_proc p CROSS JOIN LATERAL aclexplode(p.proacl) a
   WHERE p.oid='public.pwa_apply_pay_forward_v1(jsonb,jsonb,date)'::regprocedure AND a.grantee<>0 AND a.grantee<>p.proowner AND pg_get_userbyid(a.grantee)<>owner LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION public.pwa_apply_pay_forward_v1(jsonb,jsonb,date) FROM %I',grantee);
 END LOOP;
 EXECUTE format('GRANT EXECUTE ON FUNCTION public.pwa_apply_pay_forward_v1(jsonb,jsonb,date) TO %I',owner);
END $acl$;

DO $check$
DECLARE app text:=CASE current_database() WHEN 'loan_manager_prod' THEN 'mw_app_prod' ELSE 'mw_app_dev' END;
BEGIN
 IF (SELECT array_agg(DISTINCT CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END||':'||a.privilege_type) FROM pg_proc p CROSS JOIN LATERAL aclexplode(p.proacl) a
   WHERE p.oid='public.pwa_apply_pay_forward_v1(jsonb,jsonb,date)'::regprocedure AND a.grantee<>p.proowner) IS DISTINCT FROM ARRAY[app||'_journal_owner:EXECUTE'] THEN RAISE EXCEPTION 'V123: pwa_apply_pay_forward_v1 must be executable by the journal owner only'; END IF;
 IF has_function_privilege(app,'public.pwa_apply_pay_forward_v1(jsonb,jsonb,date)','EXECUTE') OR has_function_privilege('public','public.pwa_apply_pay_forward_v1(jsonb,jsonb,date)','EXECUTE') THEN RAISE EXCEPTION 'V123: the application role still executes pwa_apply_pay_forward_v1'; END IF;
 IF obj_description('public.pwa_apply_pay_forward_v1(jsonb,jsonb,date)'::regprocedure,'pg_proc') NOT LIKE 'mw-access:governance%' THEN RAISE EXCEPTION 'V123: the governance comment is missing'; END IF;
 IF position('Governed operation required' IN pg_get_functiondef('public.pwa_apply_pay_forward_v1(jsonb,jsonb,date)'::regprocedure))=0
  OR (SELECT prosecdef FROM pg_proc WHERE oid='public.pwa_apply_pay_forward_v1(jsonb,jsonb,date)'::regprocedure) THEN RAISE EXCEPTION 'V123: the guarded invoker body was not installed'; END IF;
END $check$;
