-- R118 late charges (owner decisions of 3 November 2026; Archie's design memo, accepted). V131 is applied and stays.
-- A late charge is a third amount on an existing charge row, set by hand only (charge.update), paid inside its charge
-- after interest and before principal, and counted as profit on its payment date like interest. Every date rule (next
-- charge, interest day count, Loan Close gap interest) keeps reading the same rows; a new charge starts at late 0.
-- Columns (owner-approved): "Charges"."Late Charge Due" money NOT NULL DEFAULT 0 (what is owed), "Late Charge Paid" and
-- "Late Charge Remaining" numeric (maintained by the charge refresh, like the interest pair; "Total Paid" and "Amount
-- Remaining" include them); "Payment Allocations"."Allocated Late Charge" money NOT NULL DEFAULT 0; "Repayments"."Late
-- Charge Paid" money NOT NULL DEFAULT 0 (the income source). The derived pair is added with a constant default that is
-- dropped again, so every existing charge reads 0 without an UPDATE (no trigger fires, no row-change rows).
-- Sections, in Archie's order (D1 to D5):
--  1. Derived engine: vc_charge_values (DROP and CREATE, two OUT columns lp, lr appended), vc_charge_row, vc_refresh_charge,
--     default_posting_guard (the two derived names; "Late Charge Due" in the Default/Undo bypass), payment, loan and
--     borrower totals ("Total Interest Received" and "Total Interest Earned" fold the late charge in, documented),
--     guard_charge_consistency (whole baht, 0 or more, never below what was paid on it: the existing P5B06 message).
--  2. Charge operation and default: pwa_apply_charge_v2 (lateChargeDue; a 5-key request keeps the stored late charge; a
--     first-day fd6: charge refuses one), pwa_submit_operation_v2 (the optional input), post_loan_default and
--     undo_loan_default (written down with the other parts, original_late in the evidence), close_payment_loans and
--     payment_crud_finish_core_v83 (fully paid includes the late charge).
--  3. Engines: payment_charge_balances (DROP and CREATE, late appended), post_payment_legacy_v59 and
--     post_payment_explicit_v6 (interest, then late charge, then principal; 6-key lines are late 0), lump_sum_receipt_guard,
--     quick_payment_request, attach_payment_receipt_evidence, reallocate_payment_interest_audited, pwa_plan_effects_v83
--     (a 6-key plan equals an 8-key plan with late 0), pwa_apply_payment_v2.
--  4. Validators and plans: payment command schemaVersion 11 (the v10 keys, 8-key lines, both lists may be empty),
--     agent schemaVersion 10, pwa_agent_receipt_status_v1, pwa_effective_payment_plan_v2, pwa_payment_correction_text_v2
--     (8-key lines), loan_close_calculation_v83 (payoff adds every unpaid late charge of the loan; opening, latest, trail,
--     future lowering and mutation untouched), pwa_apply_loan_close_v2, pwa_pay_forward_plan_v1 (8-key lines). Versions
--     3 to 10 and agent 7 to 9 stay accepted; v10 and agent v9 compare the server plan without the two late keys and are
--     selection_unavailable when the plan pays a late charge.
--  5. Views, reporting and push content: late charges count in gross profit, partner shares and every total the owner
--     reads; "Late charges received" is appended last to the income statement, monthly, daily and events views as a memo
--     line; the upcoming events view appends "Late Charge Remaining"; health counts a charge fully paid only when its late
--     charge is paid; refresh_daily_analytics_scoped and partner_net_profit include it; pwa_notify_content_v3 = v2 plus
--     late_charge_amount (v1 and v2 stay for older dispatchers); pwa_notify_history_content_v2 = v1 plus "lateChargeAmount".
-- Referral rebates stay interest only (create_referral_rebate, pwa_referral_rebate_projection_v1 untouched). No trigger is
-- added, renamed or disabled. Grants: SELECT ("Ref Payment", "Late Charge Paid") ON "Repayments" to the notify owner; the
-- reader IAM column grants are an operator step (scripts/configure-dev-read-role.py, reader contract). Self-check: every
-- replaced routine and view keeps owner, ACL, security, configuration and comment; the views keep their columns in place
-- and gain only the appended ones; the new columns have the expected types, defaults and comments.
-- Rollback: a later migration restores the V131 bodies; the columns stay (default 0).

DO $preflight$
DECLARE suffix text:=CASE current_database() WHEN 'loan_manager_prod' THEN 'prod' ELSE 'dev' END; problems text[]:='{}'; notify_owner text; dispatcher text; r record;
BEGIN
 IF current_database() NOT IN ('loan_manager_dev','payment_rehearsal','loan_manager_prod') THEN RAISE EXCEPTION 'Unsupported application database'; END IF;
 notify_owner:='mw_notify_owner_'||suffix; dispatcher:='mw_notify_dispatch_'||suffix;
 IF position($s$offset_id:='ro122:'||l."Ref Closing Payment"||':'||p_loan;$s$ IN pg_get_functiondef('public.create_referral_rebate(text)'::regprocedure))=0 THEN problems:=problems||'V132 needs V131'::text; END IF;
 IF EXISTS(SELECT 1 FROM pg_attribute WHERE NOT attisdropped AND (attrelid,attname) IN (('public."Charges"'::regclass,'Late Charge Due'),('public."Charges"'::regclass,'Late Charge Paid'),
   ('public."Charges"'::regclass,'Late Charge Remaining'),('public."Payment Allocations"'::regclass,'Allocated Late Charge'),('public."Repayments"'::regclass,'Late Charge Paid'))) THEN
  problems:=problems||'V132: a late charge column already exists'::text; END IF;
 IF to_regprocedure('public.pwa_notify_content_v3(uuid,bigint)') IS NOT NULL OR to_regprocedure('public.pwa_notify_history_content_v2(jsonb,uuid[])') IS NOT NULL THEN problems:=problems||'V132: a v3/v2 notify content function already exists'::text; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=notify_owner) OR NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=dispatcher) THEN problems:=problems||'V132 needs the notify owner and dispatcher roles'::text; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='mw_app_'||suffix||'_journal_owner') THEN problems:=problems||'V132 needs the journal owner'::text; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=current_user AND rolsuper) THEN
  -- Replacing a routine needs its owner's authority (the owner window of the release).
  FOR r IN SELECT DISTINCT pg_get_userbyid(p.proowner) AS owner FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.proname IN
    ('pwa_submit_selected_charges_v1','pwa_submit_agent_receipt_v1','pwa_agent_receipt_status_v1','pwa_submit_operation_v2','pwa_notify_content_v2') LOOP
   IF NOT pg_has_role(current_user,r.owner,'USAGE') THEN problems:=problems||format('%s cannot replace routines owned by %s (owner window required)',current_user,r.owner); END IF;
  END LOOP;
  IF NOT pg_has_role(current_user,notify_owner,'SET') THEN problems:=problems||format('%s cannot SET ROLE %s (temporary maintenance membership required for ALTER FUNCTION OWNER)',current_user,notify_owner); END IF;
  IF NOT has_schema_privilege(notify_owner,'public','CREATE') THEN problems:=problems||format('%s lacks CREATE on schema public (required by ALTER FUNCTION OWNER; grant temporarily)',notify_owner); END IF;
 END IF;
 IF cardinality(problems)>0 THEN RAISE EXCEPTION 'V132 preflight: %',array_to_string(problems,'; '); END IF;
END $preflight$;

-- Snapshot of every routine this migration replaces (in place, or DROP and CREATE for the two RETURNS TABLE readers whose
-- result gains a column): owner, effective ACL, security, configuration and comment. The self-check compares them.
CREATE TEMP TABLE v132_routines ON COMMIT DROP AS
 SELECT r.name AS routine,p.oid AS old_oid,pg_get_userbyid(p.proowner) AS owner,coalesce(p.proacl,acldefault('f',p.proowner)) AS effective,
  p.prosecdef AS definer,p.provolatile AS volatile,p.proconfig AS config,obj_description(p.oid,'pg_proc') AS comment
 FROM unnest(ARRAY[
  'public.vc_charge_values(public."Charges")','public.vc_charge_row()','public.vc_refresh_charge(text)','public.default_posting_guard()',
  'public.vc_payment_row()','public.vc_refresh_payment(text)','public.vc_loan_row()','public.vc_refresh_loan(text)','public.vc_borrower_values(text)',
  'public.guard_charge_consistency()',
  'public.pwa_apply_charge_v2(text)','public.pwa_submit_operation_v2(text)','public.post_loan_default(public."Loans",date,text,numeric,boolean)',
  'public.undo_loan_default(public."Loans")','public.close_payment_loans(text)','public.payment_crud_finish_core_v83(public."Payments",public."Payments",text)',
  'public.payment_charge_balances(text)','public.post_payment_legacy_v59(text)','public.post_payment_explicit_v6(text)','public.lump_sum_receipt_guard()',
  'public.quick_payment_request()','public.attach_payment_receipt_evidence(text,text,text,timestamp with time zone,jsonb,uuid,text)',
  'public.reallocate_payment_interest_audited(uuid,text)','public.pwa_plan_effects_v83(jsonb)','public.pwa_apply_payment_v2(text)',
  'public.create_referral_rebate(text)','public.pwa_referral_rebate_projection_v1(text,jsonb)',
  'public.pwa_submit_selected_charges_v1(text)','public.pwa_submit_agent_receipt_v1(text)','public.pwa_agent_receipt_status_v1(uuid,text,text)',
  'public.pwa_effective_payment_plan_v2(text)','public.pwa_payment_correction_text_v2(jsonb)','public.loan_close_calculation_v83(text,date,text)',
  'public.pwa_apply_loan_close_v2(text)','public.pwa_pay_forward_plan_v1(text,numeric,date,jsonb)',
  'public.refresh_daily_analytics_scoped(date,date,text[])','public.partner_net_profit(text)'
 ]) r(name) JOIN pg_proc p ON p.oid=r.name::regprocedure;

-- Snapshot of every view this migration replaces: owner, ACL, options, comments and its column list before.
CREATE TEMP TABLE v132_views ON COMMIT DROP AS
 SELECT c.oid AS relid,c.oid::regclass::text AS relation,pg_get_userbyid(c.relowner) AS owner,coalesce(c.relacl::text,'') AS acl,
  coalesce(c.reloptions::text,'') AS options,coalesce(obj_description(c.oid,'pg_class'),'') AS comment,
  (SELECT array_agg(a.attname::text||':'||format_type(a.atttypid,a.atttypmod) ORDER BY a.attnum) FROM pg_attribute a
    WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped) AS columns,
  (SELECT coalesce(array_agg(coalesce(d.description,'') ORDER BY d.objsubid),'{}') FROM pg_description d
    WHERE d.objoid=c.oid AND d.classoid='pg_class'::regclass AND d.objsubid>0) AS column_comments,
  v.appended
 FROM (VALUES
  ('public.olap_charges_analytics',ARRAY['Late Charge Due:money','Late Charge Paid:numeric','Late Charge Remaining:numeric']),
  ('public.olap_repayments_analytics',ARRAY['Late Charge Paid:money']),
  ('public."Cash Dashboard"','{}'::text[]),('public.olap_portfolio_summary','{}'::text[]),
  ('public.reporting_income_statement',ARRAY['Late Charges Received MTD:numeric']),('public.reporting_income_monthly',ARRAY['Late Charges Received:numeric']),
  ('public.reporting_income_daily',ARRAY['Late Charges Received:numeric']),('public.reporting_income_events',ARRAY['Late Charges Received:numeric']),
  ('public.oltp_upcoming_charge_events_v1',ARRAY['Late Charge Remaining:numeric']),('public.reporting_charge_payment_health_v1','{}'::text[]),
  ('public.olap_borrowers_analytics','{}'::text[]),('public.reporting_partner_position_v1','{}'::text[]),
  ('public.reporting_borrower_directory_v1','{}'::text[]),('public.reporting_borrower_activity_daily_v1','{}'::text[]),
  ('public.reporting_borrower_matrix_v2','{}'::text[]),('public.reporting_forecast_actuals_v1','{}'::text[])
 ) v(name,appended) JOIN pg_class c ON c.oid=v.name::regclass;

-- 1. Columns.
ALTER TABLE public."Charges" ADD COLUMN "Late Charge Due" money NOT NULL DEFAULT 0;
ALTER TABLE public."Charges" ADD COLUMN "Late Charge Paid" numeric DEFAULT 0;
ALTER TABLE public."Charges" ADD COLUMN "Late Charge Remaining" numeric DEFAULT 0;
-- The derived pair has no default, like "Interest Paid" and "Interest Remaining": existing rows keep the 0 just added and
-- zz_vc_charge_row sets both on every insert and update.
ALTER TABLE public."Charges" ALTER COLUMN "Late Charge Paid" DROP DEFAULT, ALTER COLUMN "Late Charge Remaining" DROP DEFAULT;
ALTER TABLE public."Payment Allocations" ADD COLUMN "Allocated Late Charge" money NOT NULL DEFAULT 0;
ALTER TABLE public."Repayments" ADD COLUMN "Late Charge Paid" money NOT NULL DEFAULT 0;
COMMENT ON COLUMN public."Charges"."Late Charge Due" IS 'R118: late charge owed on this charge, whole baht, 0 or more; set by hand only (charge.update); never below "Late Charge Paid".';
COMMENT ON COLUMN public."Charges"."Late Charge Paid" IS 'R118: sum of "Repayments"."Late Charge Paid" of this charge (maintained by the charge refresh).';
COMMENT ON COLUMN public."Charges"."Late Charge Remaining" IS 'R118: "Late Charge Due" less "Late Charge Paid" (maintained by the charge refresh; part of "Amount Remaining").';
COMMENT ON COLUMN public."Payment Allocations"."Allocated Late Charge" IS 'R118: the late-charge part of this allocation (paid after interest, before principal); part of "Allocated Amount".';
COMMENT ON COLUMN public."Repayments"."Late Charge Paid" IS 'R118: the late-charge part of this repayment; income on its Payment Date, like "Interest Paid".';

-- The push content (section 5) reads the late part of a payment's repayments as the notify owner (V99 column-grant form).
DO $grant$
DECLARE notify_owner text:='mw_notify_owner_'||CASE current_database() WHEN 'loan_manager_prod' THEN 'prod' ELSE 'dev' END;
BEGIN
 EXECUTE format('GRANT SELECT ("Ref Payment","Late Charge Paid") ON public."Repayments" TO %I',notify_owner);
END $grant$;

-- ============================================================================================================
-- Section 1 (D1). Derived engine.
-- ============================================================================================================

-- The charge's derived values; lp and lr (late paid, late remaining) are appended, so the function is dropped and created
-- (its RETURNS TABLE shape cannot change in place). Callers name the columns (vc_charge_row, vc_refresh_charge).
DROP FUNCTION public.vc_charge_values(public."Charges");
CREATE FUNCTION public.vc_charge_values(p public."Charges") RETURNS TABLE(pp numeric, ip numeric, total numeric, pr numeric, ir numeric, remaining numeric, n integer, status text, paid_date date, lp numeric, lr numeric)
    LANGUAGE sql STABLE
    SET search_path TO 'pg_catalog', 'public'
    AS $$
 WITH a AS (
  SELECT coalesce(sum(r."Principal Paid"::numeric),0) pp,
   coalesce(sum(r."Interest Paid"::numeric),0) ip,coalesce(sum(r."Late Charge Paid"::numeric),0) lp,count(*)::integer n,max(r."Payment Date") d
  FROM public."Repayments" r WHERE r."Ref Charges"=p."Row ID"
 ), b AS (
  SELECT a.*,coalesce(p."Principal Due"::numeric,0)-pp pr,
   coalesce(p."Interest Due"::numeric,0)-ip ir,coalesce(p."Late Charge Due"::numeric,0)-lp lr FROM a
 ), c AS (
  SELECT b.*,CASE WHEN (SELECT l."Loan Status" FROM public."Loans" l WHERE l."Row ID"=p."Ref Loans")='ปิดยอดแล้ว'
   THEN 'ชำระแล้ว' WHEN pp+ip+lp=0 THEN 'รอชำระ' WHEN pr+ir+lr>0 THEN 'ชำระบางส่วน' ELSE 'ชำระแล้ว' END s FROM b
 ) SELECT pp,ip,pp+ip+lp,pr,ir,pr+ir+lr,n,s,CASE WHEN s='ชำระแล้ว' THEN d END,lp,lr FROM c;
$$;

CREATE OR REPLACE FUNCTION public.vc_charge_row() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
BEGIN
 SELECT pp,ip,total,pr,ir,remaining,n,status,paid_date,lp,lr
 INTO NEW."Principal Paid",NEW."Interest Paid",NEW."Total Paid",NEW."Principal Remaining",NEW."Interest Remaining",
  NEW."Amount Remaining",NEW."Payment Count",NEW."Payment Status",NEW."Payment Date",NEW."Late Charge Paid",NEW."Late Charge Remaining"
 FROM public.vc_charge_values(NEW);
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.vc_refresh_charge(p_id text) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
BEGIN
 UPDATE public."Charges" c SET "Principal Paid"=v.pp,"Interest Paid"=v.ip,"Total Paid"=v.total,
  "Principal Remaining"=v.pr,"Interest Remaining"=v.ir,"Amount Remaining"=v.remaining,
  "Payment Count"=v.n,"Payment Status"=v.status,"Payment Date"=v.paid_date,"Late Charge Paid"=v.lp,"Late Charge Remaining"=v.lr
 FROM (SELECT x."Row ID",v.* FROM public."Charges" x CROSS JOIN LATERAL public.vc_charge_values(x) v WHERE x."Row ID"=p_id) v
 WHERE c."Row ID"=v."Row ID" AND
 ROW(c."Principal Paid",c."Interest Paid",c."Total Paid",c."Principal Remaining",c."Interest Remaining",c."Amount Remaining",c."Payment Count",c."Payment Status",c."Payment Date",c."Late Charge Paid",c."Late Charge Remaining")
 IS DISTINCT FROM ROW(v.pp,v.ip,v.total,v.pr,v.ir,v.remaining,v.n,v.status,v.paid_date,v.lp,v.lr);
END $$;

-- The default posting guard: the two derived names are refresh output like the interest pair, and a Default write-down
-- and its Undo restore "Late Charge Due" with the other parts.
CREATE OR REPLACE FUNCTION public.default_posting_guard() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
DECLARE derived text[]:=ARRAY['Principal Paid','Interest Paid','Total Paid','Principal Remaining','Interest Remaining','Amount Remaining','Payment Count','Payment Status','Payment Date','Late Charge Paid','Late Charge Remaining'];
 parent record; parent_ids text[];
BEGIN
 IF starts_with(OLD."Row ID",'df10:') THEN
  IF TG_OP='DELETE' AND pg_trigger_depth()>=2 AND OLD."Ref Loans"=nullif(current_setting('business_crud.default',true),'') THEN RETURN OLD; END IF;
  IF TG_OP='UPDATE' AND TG_TABLE_NAME='Charges' THEN
   IF (to_jsonb(NEW)-derived) IS NOT DISTINCT FROM (to_jsonb(OLD)-derived) THEN RETURN NEW; END IF;
  END IF;
  RAISE EXCEPTION 'Default posting is immutable';
 END IF;
 IF TG_TABLE_NAME='Charges' THEN
  -- aa_vc_lock already takes the affected borrower locks NOWAIT (V12).
  -- Derived cache refreshes must not acquire a reverse-order parent lock.
  IF TG_OP='UPDATE' AND (to_jsonb(NEW)-derived) IS NOT DISTINCT FROM (to_jsonb(OLD)-derived) THEN RETURN NEW; END IF;
  -- Only existing Default/Undo component-and-note restoration may bypass the
  -- parent state check. Original-charge deletion is never part of that inverse.
  IF TG_OP='UPDATE' AND pg_trigger_depth()>=2
    AND OLD."Ref Loans"=nullif(current_setting('business_crud.default',true),'')
    AND NEW."Ref Loans" IS NOT DISTINCT FROM OLD."Ref Loans"
    AND (to_jsonb(NEW)-derived-ARRAY['Principal Due','Interest Due','Late Charge Due','Notes'])
      IS NOT DISTINCT FROM (to_jsonb(OLD)-derived-ARRAY['Principal Due','Interest Due','Late Charge Due','Notes']) THEN RETURN NEW; END IF;
  parent_ids:=ARRAY[OLD."Ref Loans",CASE WHEN TG_OP='UPDATE' THEN NEW."Ref Loans" END];
  BEGIN
   FOR parent IN SELECT "Row ID","Defaulted" FROM public."Loans"
     WHERE "Row ID"=ANY(parent_ids) ORDER BY "Row ID" COLLATE "C" FOR SHARE NOWAIT
   LOOP
    IF coalesce(parent."Defaulted",false) THEN
     RAISE EXCEPTION 'Undo Default before changing or deleting its original charges';
    END IF;
   END LOOP;
  EXCEPTION WHEN lock_not_available THEN
   RAISE EXCEPTION 'Loan is busy; sync and retry charge correction';
  END;
 ELSIF TG_TABLE_NAME='Repayments' THEN
  -- Resolve both explicit and charge-derived parents. Ref Loans may be supplied
  -- stale by a client when Ref Charges changes; neither route may escape a
  -- defaulted source or move a repayment into a defaulted target.
  parent_ids:=ARRAY[OLD."Ref Loans",CASE WHEN TG_OP='UPDATE' THEN NEW."Ref Loans" END];
  parent_ids:=parent_ids || ARRAY(SELECT c."Ref Loans" FROM public."Charges" c
    WHERE c."Row ID" IN (OLD."Ref Charges",CASE WHEN TG_OP='UPDATE' THEN NEW."Ref Charges" END));
  -- aa_vc_lock has already acquired borrower locks NOWAIT. The repayment row
  -- may already be locked, so never wait for a Default/Undo parent-row lock.
  BEGIN
   FOR parent IN SELECT "Row ID","Defaulted" FROM public."Loans"
     WHERE "Row ID"=ANY(parent_ids) ORDER BY "Row ID" COLLATE "C" FOR SHARE NOWAIT
   LOOP
    IF coalesce(parent."Defaulted",false) THEN
     RAISE EXCEPTION 'Undo Default before changing or deleting its repayments';
    END IF;
   END LOOP;
  EXCEPTION WHEN lock_not_available THEN
   RAISE EXCEPTION 'Loan is busy; sync and retry repayment correction';
  END;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;

-- A payment's posted amount is its repayments' principal, interest and late charge.
CREATE OR REPLACE FUNCTION public.vc_payment_row() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
BEGIN
 SELECT coalesce(sum("Allocated Amount"::numeric),0) INTO NEW."Planned Allocation Amount"
 FROM public."Payment Allocations" WHERE "Ref Payment"=NEW."Row ID";
 SELECT coalesce(sum(coalesce("Principal Paid"::numeric,0)+coalesce("Interest Paid"::numeric,0)+"Late Charge Paid"::numeric),0) INTO NEW."Posted Amount"
 FROM public."Repayments" WHERE "Ref Payment"=NEW."Row ID";
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.vc_refresh_payment(p_id text) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
DECLARE a numeric; r numeric;
BEGIN
 IF p_id=nullif(current_setting('payment_crud.id',true),'') AND pg_trigger_depth()>=2 THEN RETURN; END IF;
 SELECT coalesce(sum("Allocated Amount"::numeric),0) INTO a FROM public."Payment Allocations" WHERE "Ref Payment"=p_id;
 SELECT coalesce(sum(coalesce("Principal Paid"::numeric,0)+coalesce("Interest Paid"::numeric,0)+"Late Charge Paid"::numeric),0) INTO r FROM public."Repayments" WHERE "Ref Payment"=p_id;
 UPDATE public."Payments" SET "Planned Allocation Amount"=a,"Posted Amount"=r WHERE "Row ID"=p_id
 AND ROW("Planned Allocation Amount","Posted Amount") IS DISTINCT FROM ROW(a,r);
END $$;

-- Loan totals (Archie point 2, fold): "Total Interest Received" is the loan's profit received (interest plus late
-- charge) and "Total Amount Received" includes the late charge; no new loan column.
CREATE OR REPLACE FUNCTION public.vc_loan_row() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
BEGIN
 SELECT coalesce(sum("Interest Paid"::numeric+"Late Charge Paid"::numeric),0),coalesce(sum("Principal Paid"::numeric),0),
  coalesce(sum(coalesce("Principal Paid"::numeric,0)+coalesce("Interest Paid"::numeric,0)+"Late Charge Paid"::numeric),0)
 INTO NEW."Total Interest Received",NEW."Total Principal Received",NEW."Total Amount Received"
 FROM public."Repayments" WHERE "Ref Loans"=NEW."Row ID";
 NEW."Outstanding Principal":=coalesce(NEW."Principal Amount"::numeric,0)-NEW."Total Principal Received";
 NEW:=public.apply_principal_daily_interest(NEW,CASE WHEN TG_OP='UPDATE' THEN OLD ELSE NULL::public."Loans" END);
 -- zz_vc_daily_interest precedes this trigger. Refresh its result after adjusting
 -- principal/daily amount so downstream borrower rollups read the same state.
 NEW."Expected Daily Interest Amount":=public.vc_daily_interest(NEW);
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.vc_refresh_loan(p_id text) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
BEGIN
 IF pg_trigger_depth()>=2 AND p_id=nullif(current_setting('business_crud.default',true),'') THEN RETURN; END IF;
 UPDATE public."Loans" l SET "Total Interest Received"=v.i,"Total Principal Received"=v.p,
  "Total Amount Received"=v.a,"Outstanding Principal"=coalesce(l."Principal Amount"::numeric,0)-v.p
 FROM (SELECT coalesce(sum("Interest Paid"::numeric+"Late Charge Paid"::numeric),0) i,coalesce(sum("Principal Paid"::numeric),0) p,
  coalesce(sum(coalesce("Principal Paid"::numeric,0)+coalesce("Interest Paid"::numeric,0)+"Late Charge Paid"::numeric),0) a
  FROM public."Repayments" WHERE "Ref Loans"=p_id) v
 WHERE l."Row ID"=p_id AND ROW(l."Total Interest Received",l."Total Principal Received",l."Total Amount Received",l."Outstanding Principal")
 IS DISTINCT FROM ROW(v.i,v.p,v.a,coalesce(l."Principal Amount"::numeric,0)-v.p);
END $$;

-- Borrower totals: "Total Interest Earned" and "Active Loan Interest Earned" fold the late charge in, like the loan.
CREATE OR REPLACE FUNCTION public.vc_borrower_values(p_id text) RETURNS TABLE(interest numeric, principal numeric, n integer, outstanding numeric, active_interest numeric, daily numeric, closed boolean, active boolean)
    LANGUAGE sql STABLE
    SET search_path TO 'pg_catalog', 'public'
    AS $$
 SELECT coalesce(sum(r.i),0),coalesce(sum(l."Principal Amount"::numeric),0),count(*)::integer,
  coalesce(sum(coalesce(l."Principal Amount"::numeric,0)-coalesce(r.p,0)),0),
  coalesce(sum(r.i) FILTER(WHERE l."Loan Status"='ยังไม่ปิดยอด'),0),
  coalesce(sum(public.vc_daily_interest(l)),0),
  coalesce(bool_or(l."Loan Status"='ปิดยอดแล้ว'),false),coalesce(bool_or(l."Loan Status"='ยังไม่ปิดยอด'),false)
 FROM public."Loans" l LEFT JOIN LATERAL (
  SELECT sum("Interest Paid"::numeric+"Late Charge Paid"::numeric) i,sum("Principal Paid"::numeric) p
  FROM public."Repayments" WHERE "Ref Loans"=l."Row ID"
 ) r ON true WHERE l."Ref Borrowers"=p_id;
$$;

-- The charge guard: the late charge is whole baht, 0 or more, and never below what was paid on it (the existing message,
-- which pwa_apply_charge_v2 maps to P5B06).
CREATE OR REPLACE FUNCTION public.guard_charge_consistency() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
DECLARE paid_p numeric; paid_i numeric; paid_l numeric;
BEGIN
 IF TG_OP='DELETE' THEN
  IF EXISTS(SELECT 1 FROM public."Repayments" WHERE "Ref Charges"=OLD."Row ID") THEN
   RAISE EXCEPTION 'Charge has receipts; reassign or delete those receipts first'; END IF;
  RETURN OLD;
 END IF;
 IF TG_OP='UPDATE' THEN
  IF NEW."Row ID" IS DISTINCT FROM OLD."Row ID" THEN RAISE EXCEPTION 'Charge key cannot change'; END IF;
  IF (NEW."Ref Loans",NEW."Principal Due",NEW."Interest Due",NEW."Late Charge Due") IS NOT DISTINCT FROM (OLD."Ref Loans",OLD."Principal Due",OLD."Interest Due",OLD."Late Charge Due") THEN RETURN NEW; END IF;
  IF NEW."Ref Loans" IS DISTINCT FROM OLD."Ref Loans" AND EXISTS(SELECT 1 FROM public."Repayments" WHERE "Ref Charges"=OLD."Row ID") THEN
   RAISE EXCEPTION 'Charge has receipts on its original loan; reassign them first'; END IF;
 END IF;
 -- R118: a late charge is a whole-baht amount of 0 or more (NOT NULL by the column).
 IF NEW."Late Charge Due"::numeric<0 OR NEW."Late Charge Due"::numeric<>trunc(NEW."Late Charge Due"::numeric) THEN
  RAISE EXCEPTION 'Late charge must be a whole-baht amount of 0 or more'; END IF;
 -- Signed loss entries belong to the Default transition, not ordinary charges.
 IF starts_with(NEW."Row ID",'df10:') THEN RETURN NEW; END IF;
 SELECT coalesce(sum("Principal Paid"::numeric),0),coalesce(sum("Interest Paid"::numeric),0),coalesce(sum("Late Charge Paid"::numeric),0) INTO paid_p,paid_i,paid_l
  FROM public."Repayments" WHERE "Ref Charges"=NEW."Row ID";
 IF EXISTS(SELECT 1 FROM public."Repayments" WHERE "Ref Charges"=NEW."Row ID") AND (NEW."Principal Due"::numeric<paid_p OR NEW."Interest Due"::numeric<paid_i OR NEW."Late Charge Due"::numeric<paid_l) THEN
  RAISE EXCEPTION 'Charge amount cannot be less than its posted component payments'; END IF;
 RETURN NEW;
END $$;

-- Exact, counted replacements in a routine's current definition (V116/V120 method): every boundary must occur exactly
-- once, else the migration fails; bodies first created from a CRLF file keep CRLF line ends and are matched as written.
CREATE FUNCTION pg_temp.v132_patch(routine text, edits text[]) RETURNS void LANGUAGE plpgsql AS $patch$
DECLARE definition text:=pg_get_functiondef(routine::regprocedure); k integer; o text; n text;
BEGIN
 IF position('R118' IN definition)>0 THEN RAISE EXCEPTION 'V132: % is already patched',routine; END IF;
 FOR k IN 1..array_length(edits,1)/2 LOOP
  o:=edits[2*k-1];n:=edits[2*k];
  IF position(o IN definition)=0 AND position(E'\n' IN o)>0 THEN o:=replace(o,E'\n',E'\r\n');n:=replace(n,E'\n',E'\r\n'); END IF;
  IF (length(definition)-length(replace(definition,o,'')))/length(o)<>1 THEN RAISE EXCEPTION 'V132: unexpected % boundary %',routine,k; END IF;
  definition:=replace(definition,o,n);
 END LOOP;
 IF position('R118' IN definition)=0 THEN RAISE EXCEPTION 'V132: % patch carries no R118 marker',routine; END IF;
 EXECUTE definition;
END $patch$;

-- The same for a view's pretty definition (pg_get_viewdef(view,true), the V128/V130 form).
CREATE FUNCTION pg_temp.v132_view(relation text, edits text[]) RETURNS void LANGUAGE plpgsql AS $patch$
DECLARE definition text:=pg_get_viewdef(relation::regclass,true); k integer; o text;
BEGIN
 FOR k IN 1..array_length(edits,1)/2 LOOP
  o:=edits[2*k-1];
  IF (length(definition)-length(replace(definition,o,'')))/length(o)<>1 THEN RAISE EXCEPTION 'V132: unexpected % boundary %',relation,k; END IF;
  definition:=replace(definition,o,edits[2*k]);
 END LOOP;
 EXECUTE 'CREATE OR REPLACE VIEW '||relation||' AS '||definition;
END $patch$;

-- ============================================================================================================
-- Section 2 (D2). The charge operation, Default Loan and the fully-paid tests.
-- ============================================================================================================

-- charge.create / charge.update inputs: lateChargeDue (whole baht, 0 or more) after interestDue. A request without it (an
-- earlier client or queued offline edit) keeps its canonical 5-key text and the stored late charge (0 on create).
SELECT pg_temp.v132_patch('public.pwa_submit_operation_v2(text)',ARRAY[
 $o$ keys:=ARRAY['loanId','chargeDate','principalDue','interestDue','notes'];$o$,
 $n$ -- R118: lateChargeDue (optional) between interestDue and notes.
 keys:=ARRAY['loanId','chargeDate','principalDue','interestDue']||CASE WHEN i ? 'lateChargeDue' THEN ARRAY['lateChargeDue'] ELSE ARRAY[]::text[] END||ARRAY['notes'];$n$,
 $o$abs((i->>'interestDue')::numeric)>92233720368547758.07 THEN RAISE EXCEPTION 'charge input';END IF;$o$,
 $n$abs((i->>'interestDue')::numeric)>92233720368547758.07 OR (i ? 'lateChargeDue' AND (i->>'lateChargeDue'!~'^(0|[1-9][0-9]{0,16})$' OR (i->>'lateChargeDue')::numeric>92233720368547758)) THEN RAISE EXCEPTION 'charge input';END IF;$n$]);

-- The charge operation writes "Late Charge Due". Absent from the request: create 0, update keeps the stored value. A
-- late-charge-only charge (0/0/late) is valid; all three 0 stays refused (the existing paid-charge exception aside); a
-- first-day charge (the fd6: net-off) refuses a late charge; below what was paid is the guard's P5B06.
CREATE OR REPLACE FUNCTION public.pwa_apply_charge_v2(canonical text) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
DECLARE e jsonb:=canonical::jsonb;i jsonb:=e#>'{command,inputs}';a jsonb:=e->'actor';target text:=e#>>'{command,targetId}';op text:=e#>>'{command,operation}';old_loan text;new_loan text;l public."Loans"%ROWTYPE;payment text;plan jsonb;result_value jsonb;p numeric;interest numeric;message text;
 -- R118: the late charge of the request (or the stored one).
 late numeric;
BEGIN
 IF (current_database() NOT IN ('loan_manager_dev','payment_rehearsal','loan_manager_prod') OR current_user<>CASE current_database() WHEN 'loan_manager_prod' THEN 'mw_app_prod_journal_owner' ELSE 'mw_app_dev_journal_owner' END) OR op NOT IN('charge.create','charge.update','charge.delete') THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Governed operation required';END IF;
 SELECT "Ref Loans" INTO old_loan FROM public."Charges" WHERE "Row ID"=target;new_loan:=CASE WHEN op='charge.delete' THEN old_loan ELSE i->>'loanId' END;
 IF op<>'charge.create' AND old_loan IS NULL THEN RAISE EXCEPTION USING ERRCODE='P5B02';END IF;
 PERFORM 1 FROM public."Borrowers" WHERE "Row ID" IN(SELECT "Ref Borrowers" FROM public."Loans" WHERE "Row ID" IN(old_loan,new_loan)) ORDER BY "Row ID" COLLATE "C" FOR UPDATE;
 PERFORM 1 FROM public."Loans" WHERE "Row ID" IN(old_loan,new_loan) ORDER BY "Row ID" COLLATE "C" FOR UPDATE;
 SELECT * INTO l FROM public."Loans" WHERE "Row ID"=new_loan;IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P5B04';END IF;
 PERFORM pg_advisory_xact_lock(public.pwa_lock_key_v1('charge',target));
 PERFORM 1 FROM public."Charges" WHERE "Row ID"=target FOR UPDATE;
 IF op='charge.create' AND FOUND THEN RAISE EXCEPTION USING ERRCODE='P5B01';END IF;
 IF op<>'charge.create' AND public.pwa_charge_version_v2(target) IS DISTINCT FROM e#>>'{command,expectedVersion}' THEN RAISE EXCEPTION USING ERRCODE='P5B01';END IF;
 IF op<>'charge.delete' THEN
  p:=(i->>'principalDue')::numeric;interest:=(i->>'interestDue')::numeric;
  late:=CASE WHEN i ? 'lateChargeDue' THEN (i->>'lateChargeDue')::numeric WHEN op='charge.update' THEN (SELECT "Late Charge Due"::numeric FROM public."Charges" WHERE "Row ID"=target) ELSE 0 END;
  IF late IS NULL OR late<0 OR late<>trunc(late) THEN RAISE EXCEPTION USING ERRCODE='P5B06';END IF;
  IF p<0 OR (p=0 AND interest=0 AND late=0 AND NOT(op='charge.update' AND EXISTS(SELECT 1 FROM public."Payment Allocations" pa JOIN public."Payments" pay ON pay."Row ID"=pa."Ref Payment" WHERE pa."Ref Charge"=target AND pay."Status"='Posted') AND NOT EXISTS(SELECT 1 FROM public."Payment Allocations" WHERE "Ref Charge"=target AND "Allocated Amount"::numeric<>0) AND NOT EXISTS(SELECT 1 FROM public."Repayments" WHERE "Ref Charges"=target AND "Principal Paid"::numeric+"Interest Paid"::numeric+"Late Charge Paid"::numeric<>0))) THEN RAISE EXCEPTION USING ERRCODE='P5B06';END IF;
 END IF;
 IF op='charge.create' AND coalesce(l."Auto Charge Enabled",false) AND l."Loan Type" IN('ดอกเบี้ยรายวัน','ผ่อนชำระรายวัน') AND (i->>'chargeDate')::date=l."Loan Date" AND p+interest>0 AND NOT EXISTS(SELECT 1 FROM public."Repayments" WHERE "Ref Charges"=target) AND NOT EXISTS(SELECT 1 FROM public."Payments" WHERE "Ref Target Charge"=target AND "Allocation Method"='First-day Auto') THEN
  -- R118 (Archie point 7): the first-day net-off receipt pays principal and interest only.
  IF p<>trunc(p) OR interest<>trunc(interest) OR interest<0 OR late>0 THEN RAISE EXCEPTION USING ERRCODE='P5B06';END IF;
  payment:='fd6:'||target;
  plan:=jsonb_build_object('borrowerId',l."Ref Borrowers",'amountReceived',trim_scale(p+interest)::text,'allocations',jsonb_build_array(jsonb_build_object('chargeId',target,'principal',trim_scale(p)::text,'interest',trim_scale(interest)::text,'lateCharge','0','expectedPrincipalRemaining',trim_scale(p)::text,'expectedInterestRemaining',trim_scale(interest)::text,'expectedLateChargeRemaining','0','chargeDate',i->>'chargeDate')),'allocationMethod','First-day Auto','targetChargeId',target,'targetLoanId',NULL,'cashAccountId',coalesce(l."Ref Disbursed From Cash Account",public.default_cash_account('ch:lisa')),'paymentDate',l."Loan Date"::text,'paymentMethod','Net-off at Disbursement');
 END IF;
 result_value:=jsonb_build_object('operation',op,'targetType','charge','targetId',target,'paymentId',payment,'plan',plan,'predecessorRequestId',NULL,'sourceCreatedBy',CASE WHEN payment IS NOT NULL THEN l."Created By" ELSE NULL END);
 IF payment IS NOT NULL THEN INSERT INTO public.pwa_payment_commands(request_id,contract_version,actor_issuer,actor_subject,actor_partner_id,actor_login_email,canonical_json,payload_sha256,outcome,payment_id,rejection_code,result_json) VALUES((e->>'requestId')::uuid,2,a->>'issuer',a->>'subject',a->>'partnerId',a->>'loginEmail',canonical,encode(sha256(convert_to(canonical,'UTF8')),'hex'),'applied',NULL,NULL,result_value);END IF;
 BEGIN
 CASE op WHEN 'charge.create' THEN INSERT INTO public."Charges"("Row ID","Ref Loans","Charge Date","Principal Due","Interest Due","Late Charge Due","Notes") VALUES(target,new_loan,(i->>'chargeDate')::date,p::money,interest::money,late::money,i->>'notes');
 WHEN 'charge.update' THEN UPDATE public."Charges" SET "Ref Loans"=new_loan,"Charge Date"=(i->>'chargeDate')::date,"Principal Due"=p::money,"Interest Due"=interest::money,"Late Charge Due"=late::money,"Notes"=i->>'notes' WHERE "Row ID"=target;
 WHEN 'charge.delete' THEN DELETE FROM public."Charges" WHERE "Row ID"=target;END CASE;
 EXCEPTION WHEN foreign_key_violation THEN RAISE EXCEPTION USING ERRCODE='P5B05';
 WHEN SQLSTATE 'P0001' THEN GET STACKED DIAGNOSTICS message=MESSAGE_TEXT;
 IF message IN('Charge has receipts; reassign or delete those receipts first','Charge has receipts on its original loan; reassign them first') THEN RAISE EXCEPTION USING ERRCODE='P5B05';
 ELSIF message IN('Charge amount cannot be less than its posted component payments','Late charge must be a whole-baht amount of 0 or more') THEN RAISE EXCEPTION USING ERRCODE='P5B06';ELSE RAISE;END IF;
 END;
 IF payment IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public."Payments" WHERE "Row ID"=payment AND "Status"='Posted' AND "Amount Received"::numeric=p+interest AND "Created By" IS NOT DISTINCT FROM l."Created By") THEN RAISE EXCEPTION 'First-day charge receipt differs from immutable plan';END IF;
 RETURN result_value;
END $$;

-- Default Loan: a write-off writes "Late Charge Due" down to what was paid with the other parts and records original_late
-- and written_off_late in the evidence; a paid charge today and the keep-charges test count the late charge.
SELECT pg_temp.v132_patch('public.post_loan_default(public."Loans",date,text,numeric,boolean)',ARRAY[
 $o$AND coalesce(ch."Principal Due"::numeric,0)+coalesce(ch."Interest Due"::numeric,0)$o$,
 $n$AND coalesce(ch."Principal Due"::numeric,0)+coalesce(ch."Interest Due"::numeric,0)+ch."Late Charge Due"::numeric -- R118$n$,
 $o$>(SELECT coalesce(sum(coalesce(r."Principal Paid"::numeric,0)+coalesce(r."Interest Paid"::numeric,0)),0) FROM public."Repayments" r WHERE r."Ref Charges"=ch."Row ID")) THEN$o$,
 $n$>(SELECT coalesce(sum(coalesce(r."Principal Paid"::numeric,0)+coalesce(r."Interest Paid"::numeric,0)+r."Late Charge Paid"::numeric),0) FROM public."Repayments" r WHERE r."Ref Charges"=ch."Row ID")) THEN$n$,
 $o$FOR c IN SELECT ch.*,coalesce(r.p,0) AS paid_p,coalesce(r.i,0) AS paid_i$o$,
 $n$FOR c IN SELECT ch.*,coalesce(r.p,0) AS paid_p,coalesce(r.i,0) AS paid_i,coalesce(r.l,0) AS paid_l$n$,
 $o$(SELECT sum("Principal Paid"::numeric) p,sum("Interest Paid"::numeric) i$o$,
 $n$(SELECT sum("Principal Paid"::numeric) p,sum("Interest Paid"::numeric) i,sum("Late Charge Paid"::numeric) l$n$,
 $o$OR c."Principal Due"::numeric<c.paid_p OR c."Interest Due"::numeric<c.paid_i THEN$o$,
 $n$OR c."Principal Due"::numeric<c.paid_p OR c."Interest Due"::numeric<c.paid_i OR c."Late Charge Due"::numeric<c.paid_l THEN$n$,
 $o$AND c.paid_p+c.paid_i<>0$o$,
 $n$AND c.paid_p+c.paid_i+c.paid_l<>0$n$,
 $o$AND c."Principal Due"::numeric+c."Interest Due"::numeric<=c.paid_p+c.paid_i THEN$o$,
 $n$AND c."Principal Due"::numeric+c."Interest Due"::numeric+c."Late Charge Due"::numeric<=c.paid_p+c.paid_i+c.paid_l THEN$n$,
 $o$UPDATE public."Charges" SET "Principal Due"=c.paid_p::money,"Interest Due"=c.paid_i::money,$o$,
 $n$UPDATE public."Charges" SET "Principal Due"=c.paid_p::money,"Interest Due"=c.paid_i::money,"Late Charge Due"=c.paid_l::money,$n$,
 $o$'written_off_interest',c."Interest Due"::numeric-c.paid_i)::text)$o$,
 $n$'written_off_interest',c."Interest Due"::numeric-c.paid_i,
          'original_late',c."Late Charge Due"::numeric,'written_off_late',c."Late Charge Due"::numeric-c.paid_l)::text)$n$]);

-- Undo Default restores "Late Charge Due" from original_late; evidence written before V132 has no late keys and leaves the
-- late charge as it is.
SELECT pg_temp.v132_patch('public.undo_loan_default(public."Loans")',ARRAY[
 $o$IF c."Principal Due"::numeric+c."Interest Due"::numeric>0 AND$o$,
 $n$IF c."Principal Due"::numeric+c."Interest Due"::numeric+c."Late Charge Due"::numeric>0 AND -- R118$n$,
 $o$c."Interest Due"::numeric=(SELECT coalesce(sum("Interest Paid"::numeric),0) FROM public."Repayments" WHERE "Ref Charges"=c."Row ID") THEN CONTINUE; END IF;$o$,
 $n$c."Interest Due"::numeric=(SELECT coalesce(sum("Interest Paid"::numeric),0) FROM public."Repayments" WHERE "Ref Charges"=c."Row ID") AND
     c."Late Charge Due"::numeric=(SELECT coalesce(sum("Late Charge Paid"::numeric),0) FROM public."Repayments" WHERE "Ref Charges"=c."Row ID") THEN CONTINUE; END IF;$n$,
 $o$c."Interest Due"::numeric IS DISTINCT FROM (evidence->>'original_interest')::numeric-(evidence->>'written_off_interest')::numeric THEN$o$,
 $n$c."Interest Due"::numeric IS DISTINCT FROM (evidence->>'original_interest')::numeric-(evidence->>'written_off_interest')::numeric OR
    c."Late Charge Due"::numeric IS DISTINCT FROM coalesce((evidence->>'original_late')::numeric-(evidence->>'written_off_late')::numeric,c."Late Charge Due"::numeric) THEN$n$,
 $o$"Interest Due"=(evidence->>'original_interest')::numeric::money,$o$,
 $n$"Interest Due"=(evidence->>'original_interest')::numeric::money,"Late Charge Due"=coalesce((evidence->>'original_late')::numeric,c."Late Charge Due"::numeric)::money,$n$]);

-- A loan closes only when every charge is paid in full, late charge included.
CREATE OR REPLACE FUNCTION public.close_payment_loans(p_id text) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
BEGIN
  UPDATE public."Loans" l SET "Loan Status"='ปิดยอดแล้ว',
    "Close Date"=CASE WHEN coalesce(nullif(current_setting('payment_crud.parents',true),'')::jsonb,'{}') ? p_id
      THEN p."Payment Date" ELSE (statement_timestamp() AT TIME ZONE 'Asia/Bangkok')::date END,
    "Closed By"=p."Created By", "Ref Closing Payment"=p."Row ID"
  FROM public."Payments" p
  WHERE p."Row ID"=p_id AND l."Loan Status"='ยังไม่ปิดยอด'
    AND l."Row ID" IN (SELECT r."Ref Loans" FROM public."Repayments" r WHERE r."Ref Payment"=p_id)
    AND l."Principal Amount"::numeric <=
      (SELECT coalesce(sum(r."Principal Paid"::numeric),0) FROM public."Repayments" r WHERE r."Ref Loans"=l."Row ID")
    AND NOT EXISTS (
      SELECT 1 FROM public."Charges" c WHERE c."Ref Loans"=l."Row ID"
      AND (c."Principal Due" IS NULL OR c."Interest Due" IS NULL OR
        c."Principal Due"::numeric+c."Interest Due"::numeric+c."Late Charge Due"::numeric >
          (SELECT coalesce(sum(r."Principal Paid"::numeric+r."Interest Paid"::numeric+r."Late Charge Paid"::numeric),0)
           FROM public."Repayments" r WHERE r."Ref Charges"=c."Row ID")));
END $$;

SELECT pg_temp.v132_patch('public.payment_crud_finish_core_v83(public."Payments",public."Payments",text)',ARRAY[
 $o$c."Principal Due"::numeric+c."Interest Due"::numeric>$o$,
 $n$c."Principal Due"::numeric+c."Interest Due"::numeric+c."Late Charge Due"::numeric> -- R118$n$,
 $o$(SELECT coalesce(sum(r."Principal Paid"::numeric+r."Interest Paid"::numeric),0) FROM public."Repayments" r WHERE r."Ref Charges"=c."Row ID"))) THEN$o$,
 $n$(SELECT coalesce(sum(r."Principal Paid"::numeric+r."Interest Paid"::numeric+r."Late Charge Paid"::numeric),0) FROM public."Repayments" r WHERE r."Ref Charges"=c."Row ID"))) THEN$n$]);

-- ============================================================================================================
-- Section 3 (D3). The two posting engines and the checks around them: interest, then late charge, then principal.
-- ============================================================================================================

-- The legacy engine's eligible balances; late appended (DROP and CREATE: RETURNS TABLE). Caller: post_payment_legacy_v59.
DROP FUNCTION public.payment_charge_balances(text);
CREATE FUNCTION public.payment_charge_balances(p_id text) RETURNS TABLE(charge text, loan text, charge_day date, principal numeric, interest numeric, late numeric)
    LANGUAGE sql STABLE
    SET search_path TO 'pg_catalog', 'public'
    AS $$
  SELECT c."Row ID",c."Ref Loans",c."Charge Date",
    c."Principal Due"::numeric-paid.p,c."Interest Due"::numeric-paid.i,c."Late Charge Due"::numeric-paid.l
  FROM public."Payments" p
  JOIN public."Loans" l ON l."Ref Borrowers"=p."Ref Borrower"
  JOIN public."Charges" c ON c."Ref Loans"=l."Row ID"
  LEFT JOIN public."Charges" target ON target."Row ID"=p."Ref Target Charge"
  CROSS JOIN LATERAL (
    SELECT coalesce(sum(r."Principal Paid"::numeric),0) p,
           coalesce(sum(r."Interest Paid"::numeric),0) i,
           coalesce(sum(r."Late Charge Paid"::numeric),0) l
    FROM public."Repayments" r WHERE r."Ref Charges"=c."Row ID"
  ) paid
  WHERE p."Row ID"=p_id AND CASE
    WHEN p."Allocation Method" IN ('Single Full','Single Partial','First-day Auto')
      THEN c."Row ID"=p."Ref Target Charge"
    WHEN p."Allocation Method"='Loan Close' THEN c."Ref Loans"=target."Ref Loans"
    WHEN p."Allocation Method" IN ('Receive All','Lump Sum') THEN c."Charge Date"<=p."Payment Date"
    WHEN p."Allocation Method"='Selected Charges' THEN
      c."Row ID"=ANY(public.selected_charge_ids(p."Selected Charge IDs"))
      AND c."Charge Date"<=p."Payment Date"
    ELSE false END;
$$;

-- The legacy engine (v3 to v5 commands, agent v7/v8 Lump Sum, first-day, quick requests, legacy corrections): each charge
-- newest first, inside it interest, then late charge, then principal.
CREATE OR REPLACE FUNCTION public.post_payment_legacy_v59(p_id text) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
DECLARE p public."Payments"%ROWTYPE; amount numeric; available numeric;
BEGIN
  IF public.pwa_effective_payment_plan_v2(p_id) IS NOT NULL THEN RAISE EXCEPTION 'Explicit PWA receipt cannot use legacy engine';END IF;
  SELECT * INTO STRICT p FROM public."Payments" WHERE "Row ID"=p_id;
  IF p."Status"='Posted' THEN RETURN; END IF;
  IF p."Status" IS DISTINCT FROM 'Processing' THEN
    RAISE EXCEPTION 'Payment must be Processing before posting';
  END IF;
  IF p."Allocation Method" IS NULL OR p."Allocation Method" NOT IN
    ('Single Full','Single Partial','Receive All','Lump Sum','First-day Auto','Loan Close','Selected Charges') THEN
    RAISE EXCEPTION 'Unsupported payment allocation method';
  END IF;
  amount:=p."Amount Received"::numeric;
  IF amount IS NULL OR amount<=0 OR amount<>trunc(amount) THEN
    RAISE EXCEPTION 'Payment requires a positive whole-baht amount';
  END IF;
  IF p."Payment Date" IS NULL OR p."Payment Date"> (statement_timestamp() AT TIME ZONE 'Asia/Bangkok')::date THEN
    RAISE EXCEPTION 'Payment date must be present and no later than today';
  END IF;
  PERFORM 1 FROM public."Borrowers" WHERE "Row ID"=p."Ref Borrower" FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Payment borrower does not exist'; END IF;
  -- The receipt BEFORE trigger acquires this same lock before INSERT. Re-read
  -- after acquisition for callers invoking the business function directly.
  SELECT * INTO STRICT p FROM public."Payments" WHERE "Row ID"=p_id FOR UPDATE;
  IF p."Status"='Posted' THEN RETURN; END IF;
  IF EXISTS (SELECT 1 FROM public."Payments" q WHERE q."Ref Borrower"=p."Ref Borrower"
    AND q."Row ID"<>p_id AND q."Status" IN ('Processing','Error')
    AND NOT coalesce(nullif(current_setting('payment_crud.parents',true),'')::jsonb ? q."Row ID",false)) THEN
    RAISE EXCEPTION 'Another receipt for this borrower requires reconciliation';
  END IF;
  IF EXISTS (SELECT 1 FROM public."Payment Allocations" WHERE "Ref Payment"=p_id)
    OR EXISTS (SELECT 1 FROM public."Repayments" WHERE "Ref Payment"=p_id) THEN
    RAISE EXCEPTION 'Existing receipt results require reconciliation; reallocation refused';
  END IF;
  PERFORM 1 FROM public."Loans" WHERE "Ref Borrowers"=p."Ref Borrower"
    ORDER BY "Row ID" COLLATE "C" FOR UPDATE;
  PERFORM 1 FROM public."Charges" c JOIN public."Loans" l ON l."Row ID"=c."Ref Loans"
    WHERE l."Ref Borrowers"=p."Ref Borrower" ORDER BY c."Row ID" COLLATE "C" FOR UPDATE OF c;
  IF p."Allocation Method" IN ('Single Full','Single Partial','First-day Auto','Loan Close') AND NOT EXISTS (
    SELECT 1 FROM public."Charges" c JOIN public."Loans" l ON l."Row ID"=c."Ref Loans"
    WHERE c."Row ID"=p."Ref Target Charge" AND l."Ref Borrowers"=p."Ref Borrower") THEN
    RAISE EXCEPTION 'Target charge must belong to the payment borrower';
  END IF;
  IF p."Allocation Method"='First-day Auto' AND NOT EXISTS (
    SELECT 1 FROM public."Charges" c JOIN public."Loans" l ON l."Row ID"=c."Ref Loans"
    WHERE c."Row ID"=p."Ref Target Charge" AND l."Auto Charge Enabled"
      AND l."Loan Type" IN ('ดอกเบี้ยรายวัน','ผ่อนชำระรายวัน')
      AND c."Charge Date"=l."Loan Date" AND p."Payment Date"=l."Loan Date"
      AND p."Payment Method"='Net-off at Disbursement') THEN
    RAISE EXCEPTION 'First-day receipt must match an eligible loan-date net-off';
  END IF;
  IF EXISTS (SELECT 1 FROM public.payment_charge_balances(p_id)
    WHERE principal IS NULL OR interest IS NULL OR late IS NULL OR principal<0 OR interest<0 OR late<0) THEN
    RAISE EXCEPTION 'Eligible charge has missing or negative components; reconcile first';
  END IF;
  IF p."Allocation Method"='Selected Charges' AND (
    (SELECT count(*) FROM public.payment_charge_balances(p_id)) <>
      cardinality(public.selected_charge_ids(p."Selected Charge IDs"))
    OR EXISTS(SELECT 1 FROM public.payment_charge_balances(p_id) WHERE principal+interest+late<=0)) THEN
    RAISE EXCEPTION 'Selected charges changed or are not eligible; refresh and review the full selection';
  END IF;
  SELECT coalesce(sum(principal+interest+late),0) INTO available FROM public.payment_charge_balances(p_id);
  IF amount>available OR (p."Allocation Method" IN ('Single Full','Receive All','First-day Auto','Loan Close','Selected Charges') AND amount<>available) THEN
    RAISE EXCEPTION 'Payment does not match the current eligible balance';
  END IF;
  -- R118: within each charge interest first, then the late charge, then principal.
  WITH ordered AS (
    SELECT *,row_number() OVER w ord,
      coalesce(sum(principal+interest+late) OVER(ORDER BY charge_day DESC,charge COLLATE "C" DESC
        ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING),0) previous
    FROM public.payment_charge_balances(p_id) WHERE principal+interest+late>0
    WINDOW w AS(ORDER BY charge_day DESC,charge COLLATE "C" DESC)
  ), plan AS (
    SELECT *,least(principal+interest+late,greatest(0,amount-previous)) allocated FROM ordered
  ), parts AS (
    SELECT *,least(interest,allocated) paid_interest,least(late,allocated-least(interest,allocated)) paid_late FROM plan
  )
  INSERT INTO public."Payment Allocations"("Row ID","Ref Payment","Ref Charge","Charge Date Snapshot",
    "Charge Row Number Snapshot","Interest Remaining Snapshot","Principal Remaining Snapshot","Amount Remaining Snapshot",
    "Allocation Order","Allocated Interest","Allocated Late Charge","Allocated Principal","Allocated Amount","Created At")
  SELECT 'pc6:'||length(p_id)||':'||p_id||':'||charge,p_id,charge,charge_day,
    -ord::integer,interest::money,principal::money,(interest+late+principal)::money,
    ord::integer,paid_interest::money,paid_late::money,(allocated-paid_interest-paid_late)::money,allocated::money,
    statement_timestamp() AT TIME ZONE 'Asia/Bangkok' FROM parts WHERE allocated>0;
  INSERT INTO public."Repayments"("Row ID","Payment Date","Principal Paid","Interest Paid","Late Charge Paid","Notes",
    "Ref Loans","Ref Charges","Created By","Ref Payment","Ref Payment Allocation")
  SELECT a."Row ID",p."Payment Date",a."Allocated Principal",a."Allocated Interest",a."Allocated Late Charge",p."Notes",
    c."Ref Loans",a."Ref Charge",p."Created By",p_id,a."Row ID"
  FROM public."Payment Allocations" a JOIN public."Charges" c ON c."Row ID"=a."Ref Charge"
  WHERE a."Ref Payment"=p_id;
  IF amount IS DISTINCT FROM (SELECT sum("Allocated Amount"::numeric) FROM public."Payment Allocations" WHERE "Ref Payment"=p_id)
    OR amount IS DISTINCT FROM (SELECT sum("Principal Paid"::numeric+"Interest Paid"::numeric+"Late Charge Paid"::numeric) FROM public."Repayments" WHERE "Ref Payment"=p_id) THEN
    RAISE EXCEPTION 'Payment ledger reconciliation failed';
  END IF;
  PERFORM public.close_payment_loans(p_id);
  UPDATE public."Payments" SET "Status"='Posted',"Processed At"=clock_timestamp() AT TIME ZONE 'Asia/Bangkok'
    WHERE "Row ID"=p_id;
END $$;

-- The explicit engine (every command with an allocations plan): a line's lateCharge (absent on a 6-key line: 0) is paid
-- on the charge's late remaining; "Allocated Amount" is principal, interest and late charge.
CREATE OR REPLACE FUNCTION public.post_payment_explicit_v6(p_id text) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
DECLARE p public."Payments"%ROWTYPE; amount numeric; available numeric; command jsonb; projected jsonb; invalid_plan boolean;
BEGIN
  SELECT public.pwa_effective_payment_plan_v2(p_id)->'plan' INTO command;
  IF command IS NULL THEN RAISE EXCEPTION 'PWA immutable plan required';END IF;
  SELECT * INTO STRICT p FROM public."Payments" WHERE "Row ID"=p_id;
  IF p."Status"='Posted' THEN RETURN; END IF;
  IF p."Status" IS DISTINCT FROM 'Processing' THEN
    RAISE EXCEPTION 'Payment must be Processing before posting';
  END IF;
  IF p."Allocation Method" IS NULL OR p."Allocation Method" NOT IN
    ('Single Full','Single Partial','Receive All','Lump Sum','First-day Auto','Loan Close','Selected Charges') THEN
    RAISE EXCEPTION 'Unsupported payment allocation method';
  END IF;
  amount:=p."Amount Received"::numeric;
  IF amount IS NULL OR amount<=0 OR amount<>trunc(amount) THEN
    RAISE EXCEPTION 'Payment requires a positive whole-baht amount';
  END IF;
  IF p."Payment Date" IS NULL OR p."Payment Date"> (statement_timestamp() AT TIME ZONE 'Asia/Bangkok')::date THEN
    RAISE EXCEPTION 'Payment date must be present and no later than today';
  END IF;
  PERFORM 1 FROM public."Borrowers" WHERE "Row ID"=p."Ref Borrower" FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Payment borrower does not exist'; END IF;
  -- The receipt BEFORE trigger acquires this same lock before INSERT. Re-read
  -- after acquisition for callers invoking the business function directly.
  SELECT * INTO STRICT p FROM public."Payments" WHERE "Row ID"=p_id FOR UPDATE;
  IF p."Status"='Posted' THEN RETURN; END IF;
  IF EXISTS (SELECT 1 FROM public."Payments" q WHERE q."Ref Borrower"=p."Ref Borrower"
    AND q."Row ID"<>p_id AND q."Status" IN ('Processing','Error')
    AND NOT coalesce(nullif(current_setting('payment_crud.parents',true),'')::jsonb ? q."Row ID",false)) THEN
    RAISE EXCEPTION 'Another receipt for this borrower requires reconciliation';
  END IF;
  IF EXISTS (SELECT 1 FROM public."Payment Allocations" WHERE "Ref Payment"=p_id)
    OR EXISTS (SELECT 1 FROM public."Repayments" WHERE "Ref Payment"=p_id) THEN
    RAISE EXCEPTION 'Existing receipt results require reconciliation; reallocation refused';
  END IF;
  PERFORM 1 FROM public."Loans" WHERE "Ref Borrowers"=p."Ref Borrower"
    ORDER BY "Row ID" COLLATE "C" FOR UPDATE;
  PERFORM 1 FROM public."Charges" c JOIN public."Loans" l ON l."Row ID"=c."Ref Loans"
    WHERE l."Ref Borrowers"=p."Ref Borrower" ORDER BY c."Row ID" COLLATE "C" FOR UPDATE OF c;
  IF p."Allocation Method" IS DISTINCT FROM command->>'allocationMethod' OR p."Ref Borrower" IS DISTINCT FROM command->>'borrowerId' OR p."Amount Received"::numeric IS DISTINCT FROM (command->>'amountReceived')::numeric THEN RAISE EXCEPTION 'Explicit allocation identity mismatch';END IF;
  IF p."Allocation Method"='First-day Auto' AND p."Ref Received By Cash Account" IS DISTINCT FROM command->>'cashAccountId' THEN RAISE EXCEPTION 'First-day resolved account differs from immutable plan';END IF;
-- One materialized projection provides both validation and insertion inputs.
  WITH lines AS MATERIALIZED (SELECT value line FROM jsonb_array_elements(command->'allocations')),
  paid AS MATERIALIZED (
   SELECT "Ref Charges" charge,sum("Principal Paid"::numeric) principal,sum("Interest Paid"::numeric) interest,sum("Late Charge Paid"::numeric) late,count(*) FILTER(WHERE "Principal Paid" IS NULL OR "Interest Paid" IS NULL) invalid
   FROM public."Repayments" WHERE "Ref Charges" IN (SELECT line->>'chargeId' FROM lines) GROUP BY "Ref Charges"
  ), plan AS MATERIALIZED (
   SELECT line,c."Charge Date" AS day,l."Ref Borrowers" borrower,c."Principal Due"::numeric-coalesce(paid.principal,0) principal,c."Interest Due"::numeric-coalesce(paid.interest,0) interest,c."Late Charge Due"::numeric-coalesce(paid.late,0) late,coalesce(paid.invalid,0) invalid,row_number() OVER(ORDER BY c."Charge Date" DESC,(line->>'chargeId') COLLATE "C" DESC) ord
   FROM lines LEFT JOIN public."Charges" c ON c."Row ID"=line->>'chargeId' LEFT JOIN public."Loans" l ON l."Row ID"=c."Ref Loans" LEFT JOIN paid ON paid.charge=c."Row ID"
  )
  SELECT jsonb_agg(jsonb_build_object('charge',line->>'chargeId','day',day,'principal',principal,'interest',interest,'late',late,'paidPrincipal',(line->>'principal')::numeric,'paidInterest',(line->>'interest')::numeric,'paidLate',coalesce(line->>'lateCharge','0')::numeric,'ord',ord) ORDER BY ord),
   bool_or(borrower IS DISTINCT FROM p."Ref Borrower" OR invalid>0 OR day IS NULL OR principal IS NULL OR interest IS NULL OR late IS NULL OR principal<0 OR interest<0 OR late<0 OR principal<>trunc(principal) OR interest<>trunc(interest) OR late<>trunc(late) OR (line->>'principal')::numeric>principal OR (line->>'interest')::numeric>interest OR coalesce(line->>'lateCharge','0')::numeric>late)
  INTO projected,invalid_plan FROM plan;
  IF invalid_plan IS DISTINCT FROM false OR jsonb_array_length(projected)<>jsonb_array_length(command->'allocations') THEN RAISE EXCEPTION 'Explicit allocation exceeds current components';END IF;
  INSERT INTO public."Payment Allocations"("Row ID","Ref Payment","Ref Charge","Charge Date Snapshot","Charge Row Number Snapshot","Interest Remaining Snapshot","Principal Remaining Snapshot","Amount Remaining Snapshot","Allocation Order","Allocated Interest","Allocated Late Charge","Allocated Principal","Allocated Amount","Created At")
  SELECT 'pc6:'||length(p_id)||':'||p_id||':'||charge,p_id,charge,day,-ord,interest::money,principal::money,(principal+interest+late)::money,ord,"paidInterest"::money,"paidLate"::money,"paidPrincipal"::money,("paidPrincipal"+"paidInterest"+"paidLate")::money,statement_timestamp() AT TIME ZONE 'Asia/Bangkok'
  FROM jsonb_to_recordset(projected) AS x(charge text,day date,principal numeric,interest numeric,late numeric,"paidPrincipal" numeric,"paidInterest" numeric,"paidLate" numeric,ord integer);
  INSERT INTO public."Repayments"("Row ID","Payment Date","Principal Paid","Interest Paid","Late Charge Paid","Notes",
    "Ref Loans","Ref Charges","Created By","Ref Payment","Ref Payment Allocation")
  SELECT a."Row ID",p."Payment Date",a."Allocated Principal",a."Allocated Interest",a."Allocated Late Charge",p."Notes",
    c."Ref Loans",a."Ref Charge",p."Created By",p_id,a."Row ID"
  FROM public."Payment Allocations" a JOIN public."Charges" c ON c."Row ID"=a."Ref Charge"
  WHERE a."Ref Payment"=p_id;
  IF amount IS DISTINCT FROM (SELECT sum("Allocated Amount"::numeric) FROM public."Payment Allocations" WHERE "Ref Payment"=p_id)
    OR amount IS DISTINCT FROM (SELECT sum("Principal Paid"::numeric+"Interest Paid"::numeric+"Late Charge Paid"::numeric) FROM public."Repayments" WHERE "Ref Payment"=p_id) THEN
    RAISE EXCEPTION 'Payment ledger reconciliation failed';
  END IF;
  PERFORM public.close_payment_loans(p_id);
  UPDATE public."Payments" SET "Status"='Posted',"Processed At"=clock_timestamp() AT TIME ZONE 'Asia/Bangkok'
    WHERE "Row ID"=p_id;
END $$;

-- Marking a payment Posted requires its allocations and repayments to agree on all three parts.
CREATE OR REPLACE FUNCTION public.lump_sum_receipt_guard() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
DECLARE prepared boolean;
BEGIN
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  PERFORM 1 FROM public."Borrowers" WHERE "Row ID"=NEW."Ref Borrower" FOR UPDATE;
  IF TG_OP='INSERT' AND NEW."Status" IS DISTINCT FROM 'Processing' THEN
    RAISE EXCEPTION 'New payments must start in Processing';
  END IF;
  IF TG_OP='UPDATE' THEN
    SELECT EXISTS(SELECT 1 FROM public."Payment Allocations" WHERE "Ref Payment"=OLD."Row ID")
      OR EXISTS(SELECT 1 FROM public."Repayments" WHERE "Ref Payment"=OLD."Row ID") INTO prepared;
    IF OLD."Status"='Posted' AND prepared THEN
      NEW."Status":=OLD."Status"; NEW."Processed At":=OLD."Processed At";
    ELSIF NEW."Status"='Posted' AND (NOT prepared OR
      NEW."Amount Received"::numeric IS DISTINCT FROM (SELECT sum("Allocated Amount"::numeric) FROM public."Payment Allocations" WHERE "Ref Payment"=OLD."Row ID") OR
      NEW."Amount Received"::numeric IS DISTINCT FROM (SELECT sum("Principal Paid"::numeric+"Interest Paid"::numeric+"Late Charge Paid"::numeric) FROM public."Repayments" WHERE "Ref Payment"=OLD."Row ID") OR
      EXISTS(SELECT 1 FROM public."Payment Allocations" a FULL JOIN public."Repayments" r ON r."Ref Payment Allocation"=a."Row ID"
        WHERE (a."Ref Payment"=OLD."Row ID" OR r."Ref Payment"=OLD."Row ID") AND
          (a."Row ID" IS NULL OR r."Row ID" IS NULL OR a."Ref Payment" IS DISTINCT FROM r."Ref Payment"
           OR a."Ref Charge" IS DISTINCT FROM r."Ref Charges" OR a."Allocated Interest" IS DISTINCT FROM r."Interest Paid"
           OR a."Allocated Principal" IS DISTINCT FROM r."Principal Paid" OR a."Allocated Late Charge" IS DISTINCT FROM r."Late Charge Paid"
           OR a."Allocated Amount"::numeric<=0
           OR a."Allocated Interest"::numeric<0 OR a."Allocated Principal"::numeric<0 OR a."Allocated Late Charge"::numeric<0
           OR a."Allocated Amount"::numeric<>a."Allocated Interest"::numeric+a."Allocated Principal"::numeric+a."Allocated Late Charge"::numeric))) THEN
      RAISE EXCEPTION 'Cannot mark an unreconciled payment Posted';
    END IF;
  END IF;
  RETURN NEW;
END $$;

SELECT pg_temp.v132_patch('public.quick_payment_request()',ARRAY[
 $o$SELECT sum(c."Principal Due"::numeric+c."Interest Due"::numeric-coalesce(r.paid,0)) INTO amount$o$,
 $n$SELECT sum(c."Principal Due"::numeric+c."Interest Due"::numeric+c."Late Charge Due"::numeric-coalesce(r.paid,0)) INTO amount -- R118$n$,
 $o$(SELECT sum("Principal Paid"::numeric+"Interest Paid"::numeric) paid FROM public."Repayments" WHERE "Ref Charges"=c."Row ID")$o$,
 $n$(SELECT sum("Principal Paid"::numeric+"Interest Paid"::numeric+"Late Charge Paid"::numeric) paid FROM public."Repayments" WHERE "Ref Charges"=c."Row ID")$n$]);

SELECT pg_temp.v132_patch('public.attach_payment_receipt_evidence(text,text,text,timestamp with time zone,jsonb,uuid,text)',ARRAY[
 $o$(SELECT coalesce(sum("Principal Paid"::numeric+"Interest Paid"::numeric),0) FROM public."Repayments" WHERE "Ref Payment"=p_payment)$o$,
 $n$(SELECT coalesce(sum("Principal Paid"::numeric+"Interest Paid"::numeric+"Late Charge Paid"::numeric),0) FROM public."Repayments" WHERE "Ref Payment"=p_payment) /* R118 */$n$]);

SELECT pg_temp.v132_patch('public.reallocate_payment_interest_audited(uuid,text)',ARRAY[
 $o$(SELECT sum("Principal Paid"::numeric+"Interest Paid"::numeric) FROM public."Repayments" WHERE "Ref Payment"=p_payment)$o$,
 $n$(SELECT sum("Principal Paid"::numeric+"Interest Paid"::numeric+"Late Charge Paid"::numeric) FROM public."Repayments" WHERE "Ref Payment"=p_payment) /* R118 */$n$]);

-- A plan's effects: the expected keys are stripped and a zero late charge is dropped, so a stored 6-key plan and the same
-- plan in 8-key form compare equal (no spurious repost of a correction).
CREATE OR REPLACE FUNCTION public.pwa_plan_effects_v83(lines jsonb) RETURNS jsonb
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'pg_catalog', 'public'
    AS $$ SELECT coalesce(jsonb_agg(value-ARRAY['expectedPrincipalRemaining','expectedInterestRemaining','expectedLateChargeRemaining']-CASE WHEN value->>'lateCharge'='0' THEN 'lateCharge' ELSE '' END ORDER BY (value->>'chargeId') COLLATE "C"),'[]'::jsonb) FROM jsonb_array_elements(lines); $$;

-- Corrections: an 8-key line checks its expected late remaining and caps its late charge; a 6-key line pays none. A Loan
-- Close repost must still pay off every charge of the loan, late charge included.
SELECT pg_temp.v132_patch('public.pwa_apply_payment_v2(text)',ARRAY[
 $o$paid AS(SELECT "Ref Charges" id,sum("Principal Paid"::numeric) p,sum("Interest Paid"::numeric) i FROM public."Repayments" WHERE "Ref Payment" IS DISTINCT FROM target GROUP BY "Ref Charges") SELECT 1 FROM lines$o$,
 $n$paid AS(SELECT "Ref Charges" id,sum("Principal Paid"::numeric) p,sum("Interest Paid"::numeric) i,sum("Late Charge Paid"::numeric) l FROM public."Repayments" WHERE "Ref Payment" IS DISTINCT FROM target GROUP BY "Ref Charges") SELECT 1 FROM lines$n$,
 $o$OR (line->>'interest')::numeric>ch."Interest Due"::numeric-coalesce(paid.i,0)) THEN RAISE EXCEPTION USING ERRCODE='P5B09';END IF;$o$,
 $n$OR (line->>'interest')::numeric>ch."Interest Due"::numeric-coalesce(paid.i,0) /* R118 */ OR (line ? 'expectedLateChargeRemaining' AND ch."Late Charge Due"::numeric-coalesce(paid.l,0) IS DISTINCT FROM (line->>'expectedLateChargeRemaining')::numeric) OR coalesce(line->>'lateCharge','0')::numeric>ch."Late Charge Due"::numeric-coalesce(paid.l,0)) THEN RAISE EXCEPTION USING ERRCODE='P5B09';END IF;$n$,
 $o$WITH paid AS(SELECT "Ref Charges" id,sum("Principal Paid"::numeric) p,sum("Interest Paid"::numeric) i FROM public."Repayments" WHERE "Ref Payment" IS DISTINCT FROM target GROUP BY "Ref Charges"),lines AS$o$,
 $n$WITH paid AS(SELECT "Ref Charges" id,sum("Principal Paid"::numeric) p,sum("Interest Paid"::numeric) i,sum("Late Charge Paid"::numeric) l FROM public."Repayments" WHERE "Ref Payment" IS DISTINCT FROM target GROUP BY "Ref Charges"),lines AS$n$,
 $o$OR ch."Interest Due"::numeric-coalesce(paid.i,0)>0)$o$,
 $n$OR ch."Interest Due"::numeric-coalesce(paid.i,0)>0 OR ch."Late Charge Due"::numeric-coalesce(paid.l,0)>0)$n$,
 $o$OR (lines.value->>'interest')::numeric IS DISTINCT FROM ch."Interest Due"::numeric-coalesce(paid.i,0)))$o$,
 $n$OR (lines.value->>'interest')::numeric IS DISTINCT FROM ch."Interest Due"::numeric-coalesce(paid.i,0) OR coalesce(lines.value->>'lateCharge','0')::numeric IS DISTINCT FROM ch."Late Charge Due"::numeric-coalesce(paid.l,0)))$n$,
 $o$(f#>>'{allocations,0,interest}')::numeric<>(f#>>'{allocations,0,expectedInterestRemaining}')::numeric THEN$o$,
 $n$(f#>>'{allocations,0,interest}')::numeric<>(f#>>'{allocations,0,expectedInterestRemaining}')::numeric OR coalesce(f#>>'{allocations,0,lateCharge}','0')<>'0' THEN$n$]);

-- Owner decision of 3 November 2026 (overrides Archie point 4): the referral rebate counts late charges as profit, since
-- the referrer is responsible for chasing the payment. Profit = interest plus late charge received; the rule is unchanged.
SELECT pg_temp.v132_patch('public.create_referral_rebate(text)',ARRAY[
 $o$SELECT sum("Principal Paid"::numeric),sum("Interest Paid"::numeric) INTO principal,profit$o$,
 $n$-- R118: profit is interest plus late charge received (owner decision of 3 November 2026).
 SELECT sum("Principal Paid"::numeric),sum("Interest Paid"::numeric+"Late Charge Paid"::numeric) INTO principal,profit$n$]);
COMMENT ON FUNCTION public.create_referral_rebate(text) IS 'R111/R118: the referral rebate of a closed referred loan, 10% of the interest and late charges received (at most 1,000), as an expense or offset to the referrer''s open loan.';

SELECT pg_temp.v132_patch('public.pwa_referral_rebate_projection_v1(text,jsonb)',ARRAY[
 $o$SELECT coalesce(sum("Principal Paid"::numeric),0),coalesce(sum("Interest Paid"::numeric),0) INTO principal,profit FROM public."Repayments" WHERE "Ref Loans"=p_loan;$o$,
 $n$-- R118: profit is interest plus late charge (posted and in the close's lines).
 SELECT coalesce(sum("Principal Paid"::numeric),0),coalesce(sum("Interest Paid"::numeric+"Late Charge Paid"::numeric),0) INTO principal,profit FROM public."Repayments" WHERE "Ref Loans"=p_loan;$n$,
 $o$profit+coalesce(sum((x->>'interest')::numeric),0)$o$,
 $n$profit+coalesce(sum((x->>'interest')::numeric+coalesce(x->>'lateCharge','0')::numeric),0)$n$]);
COMMENT ON FUNCTION public.pwa_referral_rebate_projection_v1(text,jsonb) IS 'R111/R118: the referral rebate a Loan Close with this calculation creates (create_referral_rebate rule: 10% of interest and late charges), its referrer and whether the referrer has an open loan; null when none. Read only.';

-- ============================================================================================================
-- Section 4 (D4). Command validators, plans, Loan Close and pay forward.
-- ============================================================================================================

-- Replace every occurrence of a version list or test, with the exact count expected (a drifted body fails).
CREATE FUNCTION pg_temp.v132_replace_all(routine text, o text, n text, expected integer) RETURNS void LANGUAGE plpgsql AS $patch$
DECLARE definition text:=pg_get_functiondef(routine::regprocedure);
BEGIN
 IF (length(definition)-length(replace(definition,o,'')))/length(o)<>expected THEN RAISE EXCEPTION 'V132: % has % occurrences of %, expected %',routine,(length(definition)-length(replace(definition,o,'')))/length(o),o,expected; END IF;
 EXECUTE replace(definition,o,n);
END $patch$;

-- 4a. Payment command schemaVersion 11 (pwa_submit_selected_charges_v1): the v10 keys, 8-key allocation lines in the order
-- chargeId, principal, interest, lateCharge, expectedPrincipalRemaining, expectedInterestRemaining,
-- expectedLateChargeRemaining, chargeDate; materialize (0 to 200) and principal (0 to 20) may both be empty (Archie's
-- accepted deviation), and the server plan is recomputed and must be equal only when one of them is not. Each version list
-- that names 10 gains 11. v10 keeps its rules; its server plan is compared without the two late keys and a plan that pays
-- a late charge is selection_unavailable (the client refreshes and sends v11).
SELECT pg_temp.v132_replace_all('public.pwa_submit_selected_charges_v1(text)',$o$'10'::jsonb)$o$,$n$'10'::jsonb,'11'::jsonb)$n$,13);
SELECT pg_temp.v132_replace_all('public.pwa_submit_selected_charges_v1(text)',$o$c->'schemaVersion'='10'::jsonb$o$,$n$c->'schemaVersion' IN ('10'::jsonb,'11'::jsonb)$n$,4);
SELECT pg_temp.v132_patch('public.pwa_submit_selected_charges_v1(text)',ARRAY[
 $o$(SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(line) key) IS DISTINCT FROM ARRAY['chargeDate','chargeId','expectedInterestRemaining','expectedPrincipalRemaining','interest','principal'] THEN RAISE EXCEPTION 'line';END IF;$o$,
 $n$(SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(line) key) IS DISTINCT FROM (CASE WHEN c->'schemaVersion'='11'::jsonb
     -- R118 v11: the 8-key line with the late charge and its expected remaining.
     THEN ARRAY['chargeDate','chargeId','expectedInterestRemaining','expectedLateChargeRemaining','expectedPrincipalRemaining','interest','lateCharge','principal']
     ELSE ARRAY['chargeDate','chargeId','expectedInterestRemaining','expectedPrincipalRemaining','interest','principal'] END) THEN RAISE EXCEPTION 'line';END IF;$n$,
 $o$FOREACH k IN ARRAY ARRAY['chargeId','principal','interest','expectedPrincipalRemaining','expectedInterestRemaining','chargeDate'] LOOP
     IF jsonb_typeof(line->k) IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'line type';END IF;$o$,
 $n$FOREACH k IN ARRAY ARRAY(SELECT jsonb_object_keys(line)) LOOP
     IF jsonb_typeof(line->k) IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'line type';END IF;$n$,
 $o$FOREACH k IN ARRAY ARRAY['principal','interest','expectedPrincipalRemaining','expectedInterestRemaining'] LOOP
     IF line->>k !~ '^(0|[1-9][0-9]{0,16})$' OR (line->>k)::numeric>92233720368547758 THEN RAISE EXCEPTION 'component';END IF;$o$,
 $n$FOREACH k IN ARRAY ARRAY['principal','interest','expectedPrincipalRemaining','expectedInterestRemaining']||(CASE WHEN line ? 'lateCharge' THEN ARRAY['lateCharge','expectedLateChargeRemaining'] ELSE ARRAY[]::text[] END) LOOP
     IF line->>k !~ '^(0|[1-9][0-9]{0,16})$' OR (line->>k)::numeric>92233720368547758 THEN RAISE EXCEPTION 'component';END IF;$n$,
 $o$IF (line->>'principal')::numeric+(line->>'interest')::numeric<=0 OR (line->>'principal')::numeric>(line->>'expectedPrincipalRemaining')::numeric OR (line->>'interest')::numeric>(line->>'expectedInterestRemaining')::numeric THEN RAISE EXCEPTION 'line cap';END IF;$o$,
 $n$IF (line->>'principal')::numeric+(line->>'interest')::numeric+coalesce(line->>'lateCharge','0')::numeric<=0 OR (line->>'principal')::numeric>(line->>'expectedPrincipalRemaining')::numeric OR (line->>'interest')::numeric>(line->>'expectedInterestRemaining')::numeric
     OR coalesce(line->>'lateCharge','0')::numeric>coalesce(line->>'expectedLateChargeRemaining','0')::numeric THEN RAISE EXCEPTION 'line cap';END IF;$n$,
 $o$plan_total:=plan_total+(line->>'principal')::numeric+(line->>'interest')::numeric;$o$,
 $n$plan_total:=plan_total+(line->>'principal')::numeric+(line->>'interest')::numeric+coalesce(line->>'lateCharge','0')::numeric;$n$,
 $o$line_text:='{"chargeId":'||to_json(line->>'chargeId')::text||',"principal":'||to_json(line->>'principal')::text||',"interest":'||to_json(line->>'interest')::text||',"expectedPrincipalRemaining":'||to_json(line->>'expectedPrincipalRemaining')::text||',"expectedInterestRemaining":'||to_json(line->>'expectedInterestRemaining')::text||',"chargeDate":'||to_json(line->>'chargeDate')::text||'}';$o$,
 $n$line_text:='{"chargeId":'||to_json(line->>'chargeId')::text||',"principal":'||to_json(line->>'principal')::text||',"interest":'||to_json(line->>'interest')::text
     ||CASE WHEN line ? 'lateCharge' THEN ',"lateCharge":'||to_json(line->>'lateCharge')::text ELSE '' END
     ||',"expectedPrincipalRemaining":'||to_json(line->>'expectedPrincipalRemaining')::text||',"expectedInterestRemaining":'||to_json(line->>'expectedInterestRemaining')::text
     ||CASE WHEN line ? 'lateCharge' THEN ',"expectedLateChargeRemaining":'||to_json(line->>'expectedLateChargeRemaining')::text ELSE '' END
     ||',"chargeDate":'||to_json(line->>'chargeDate')::text||'}';$n$,
 $o$OR jsonb_array_length(c->'principal')+jsonb_array_length(c->'materialize')=0 THEN RAISE EXCEPTION 'principal';END IF;$o$,
 $n$OR (c->'schemaVersion'='10'::jsonb AND jsonb_array_length(c->'principal')+jsonb_array_length(c->'materialize')=0) THEN RAISE EXCEPTION 'principal';END IF;$n$,
 $o$   IF c->'schemaVersion' IN ('10'::jsonb,'11'::jsonb) THEN
    today:=(transaction_timestamp() AT TIME ZONE 'Asia/Bangkok')::date;$o$,
 $n$   -- R118 v11: the plan is recomputed only when the command books or raises charges.
   IF c->'schemaVersion'='10'::jsonb OR (c->'schemaVersion'='11'::jsonb AND jsonb_array_length(c->'principal')+jsonb_array_length(c->'materialize')>0) THEN
    today:=(transaction_timestamp() AT TIME ZONE 'Asia/Bangkok')::date;$n$,
 $o$IF plan->'allocations' IS DISTINCT FROM c->'allocations' OR plan->'materialize' IS DISTINCT FROM c->'materialize' OR plan->>'uncovered' IS DISTINCT FROM '0'$o$,
 $n$IF (CASE WHEN c->'schemaVersion'='10'::jsonb THEN (SELECT coalesce(jsonb_agg(pl.v-ARRAY['lateCharge','expectedLateChargeRemaining'] ORDER BY pl.o),'[]'::jsonb) FROM jsonb_array_elements(plan->'allocations') WITH ORDINALITY pl(v,o)) ELSE plan->'allocations' END) IS DISTINCT FROM c->'allocations'
     OR (c->'schemaVersion'='10'::jsonb AND EXISTS(SELECT 1 FROM jsonb_array_elements(plan->'allocations') pl(v) WHERE pl.v->>'lateCharge'<>'0'))
     OR plan->'materialize' IS DISTINCT FROM c->'materialize' OR plan->>'uncovered' IS DISTINCT FROM '0'$n$,
 $o$LEFT JOIN (SELECT "Ref Charges" charge,sum("Principal Paid"::numeric) principal,sum("Interest Paid"::numeric) interest,count(*) FILTER(WHERE "Principal Paid" IS NULL OR "Interest Paid" IS NULL) invalid FROM public."Repayments" WHERE "Ref Charges"=ANY(ids) GROUP BY "Ref Charges") paid ON paid.charge=ch."Row ID"$o$,
 $n$LEFT JOIN (SELECT "Ref Charges" charge,sum("Principal Paid"::numeric) principal,sum("Interest Paid"::numeric) interest,sum("Late Charge Paid"::numeric) late,count(*) FILTER(WHERE "Principal Paid" IS NULL OR "Interest Paid" IS NULL) invalid FROM public."Repayments" WHERE "Ref Charges"=ANY(ids) GROUP BY "Ref Charges") paid ON paid.charge=ch."Row ID"$n$,
 $o$OR ch."Charge Date" IS DISTINCT FROM (entries.item->>'chargeDate')::date$o$,
 $n$OR ch."Charge Date" IS DISTINCT FROM (entries.item->>'chargeDate')::date
     OR (entries.item ? 'expectedLateChargeRemaining' AND ch."Late Charge Due"::numeric-coalesce(paid.late,0) IS DISTINCT FROM (entries.item->>'expectedLateChargeRemaining')::numeric)$n$]);

-- 4b. Agent receipt schemaVersion 10 (pwa_submit_agent_receipt_v1): the v9 keys with 8-key lines; v9 compares the server
-- plan without the two late keys and refuses a plan that pays a late charge (selection_unavailable).
SELECT pg_temp.v132_replace_all('public.pwa_submit_agent_receipt_v1(text)',$o$c->'schemaVersion'='9'::jsonb$o$,$n$c->'schemaVersion' IN ('9'::jsonb,'10'::jsonb)$n$,6);
SELECT pg_temp.v132_patch('public.pwa_submit_agent_receipt_v1(text)',ARRAY[
 $o$c->'schemaVersion' IS DISTINCT FROM '9'::jsonb THEN RAISE EXCEPTION 'size';$o$,
 $n$c->'schemaVersion' NOT IN ('9'::jsonb,'10'::jsonb) THEN RAISE EXCEPTION 'size';$n$,
 $o$c->'schemaVersion' NOT IN ('7'::jsonb,'8'::jsonb,'9'::jsonb) OR$o$,
 $n$c->'schemaVersion' NOT IN ('7'::jsonb,'8'::jsonb,'9'::jsonb,'10'::jsonb) OR$n$,
 $o$IF c->'schemaVersion' IN ('8'::jsonb,'9'::jsonb) AND c->'payerLines'<>'null'::jsonb THEN$o$,
 $n$IF c->'schemaVersion' IN ('8'::jsonb,'9'::jsonb,'10'::jsonb) AND c->'payerLines'<>'null'::jsonb THEN$n$,
 $o$(SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(line) key) IS DISTINCT FROM ARRAY['chargeDate','chargeId','expectedInterestRemaining','expectedPrincipalRemaining','interest','principal'] THEN RAISE EXCEPTION 'line'; END IF;$o$,
 $n$(SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(line) key) IS DISTINCT FROM (CASE WHEN c->'schemaVersion'='10'::jsonb
     -- R118 agent v10: the 8-key line with the late charge and its expected remaining.
     THEN ARRAY['chargeDate','chargeId','expectedInterestRemaining','expectedLateChargeRemaining','expectedPrincipalRemaining','interest','lateCharge','principal']
     ELSE ARRAY['chargeDate','chargeId','expectedInterestRemaining','expectedPrincipalRemaining','interest','principal'] END) THEN RAISE EXCEPTION 'line'; END IF;$n$,
 $o$FOREACH k IN ARRAY ARRAY['chargeId','principal','interest','expectedPrincipalRemaining','expectedInterestRemaining','chargeDate'] LOOP
     IF jsonb_typeof(line->k) IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'line type'; END IF;$o$,
 $n$FOREACH k IN ARRAY ARRAY(SELECT jsonb_object_keys(line)) LOOP
     IF jsonb_typeof(line->k) IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'line type'; END IF;$n$,
 $o$FOREACH k IN ARRAY ARRAY['principal','interest','expectedPrincipalRemaining','expectedInterestRemaining'] LOOP
     IF line->>k !~ '^(0|[1-9][0-9]{0,16})$' OR (line->>k)::numeric>92233720368547758 THEN RAISE EXCEPTION 'component'; END IF;$o$,
 $n$FOREACH k IN ARRAY ARRAY['principal','interest','expectedPrincipalRemaining','expectedInterestRemaining']||(CASE WHEN line ? 'lateCharge' THEN ARRAY['lateCharge','expectedLateChargeRemaining'] ELSE ARRAY[]::text[] END) LOOP
     IF line->>k !~ '^(0|[1-9][0-9]{0,16})$' OR (line->>k)::numeric>92233720368547758 THEN RAISE EXCEPTION 'component'; END IF;$n$,
 $o$IF (line->>'principal')::numeric+(line->>'interest')::numeric<=0 OR (line->>'principal')::numeric>(line->>'expectedPrincipalRemaining')::numeric OR (line->>'interest')::numeric>(line->>'expectedInterestRemaining')::numeric THEN RAISE EXCEPTION 'line cap'; END IF;$o$,
 $n$IF (line->>'principal')::numeric+(line->>'interest')::numeric+coalesce(line->>'lateCharge','0')::numeric<=0 OR (line->>'principal')::numeric>(line->>'expectedPrincipalRemaining')::numeric OR (line->>'interest')::numeric>(line->>'expectedInterestRemaining')::numeric
     OR coalesce(line->>'lateCharge','0')::numeric>coalesce(line->>'expectedLateChargeRemaining','0')::numeric THEN RAISE EXCEPTION 'line cap'; END IF;$n$,
 $o$plan_total:=plan_total+(line->>'principal')::numeric+(line->>'interest')::numeric;$o$,
 $n$plan_total:=plan_total+(line->>'principal')::numeric+(line->>'interest')::numeric+coalesce(line->>'lateCharge','0')::numeric;$n$,
 $o$plan_text:=plan_text||CASE WHEN plan_text='' THEN '' ELSE ',' END||'{"chargeId":'||to_json(line->>'chargeId')::text||',"principal":'||to_json(line->>'principal')::text||',"interest":'||to_json(line->>'interest')::text
     ||',"expectedPrincipalRemaining":'||to_json(line->>'expectedPrincipalRemaining')::text||',"expectedInterestRemaining":'||to_json(line->>'expectedInterestRemaining')::text||',"chargeDate":'||to_json(line->>'chargeDate')::text||'}';$o$,
 $n$plan_text:=plan_text||CASE WHEN plan_text='' THEN '' ELSE ',' END||'{"chargeId":'||to_json(line->>'chargeId')::text||',"principal":'||to_json(line->>'principal')::text||',"interest":'||to_json(line->>'interest')::text
     ||CASE WHEN line ? 'lateCharge' THEN ',"lateCharge":'||to_json(line->>'lateCharge')::text ELSE '' END
     ||',"expectedPrincipalRemaining":'||to_json(line->>'expectedPrincipalRemaining')::text||',"expectedInterestRemaining":'||to_json(line->>'expectedInterestRemaining')::text
     ||CASE WHEN line ? 'lateCharge' THEN ',"expectedLateChargeRemaining":'||to_json(line->>'expectedLateChargeRemaining')::text ELSE '' END
     ||',"chargeDate":'||to_json(line->>'chargeDate')::text||'}';$n$,
 $o$IF plan->'allocations' IS DISTINCT FROM c->'allocations' OR plan->'materialize' IS DISTINCT FROM c->'materialize' OR plan->>'uncovered' IS DISTINCT FROM '0' OR plan->'settles' IS DISTINCT FROM '[]'::jsonb$o$,
 $n$IF (CASE WHEN c->'schemaVersion'='9'::jsonb THEN (SELECT coalesce(jsonb_agg(pl.v-ARRAY['lateCharge','expectedLateChargeRemaining'] ORDER BY pl.o),'[]'::jsonb) FROM jsonb_array_elements(plan->'allocations') WITH ORDINALITY pl(v,o)) ELSE plan->'allocations' END) IS DISTINCT FROM c->'allocations'
    OR (c->'schemaVersion'='9'::jsonb AND EXISTS(SELECT 1 FROM jsonb_array_elements(plan->'allocations') pl(v) WHERE pl.v->>'lateCharge'<>'0'))
    OR plan->'materialize' IS DISTINCT FROM c->'materialize' OR plan->>'uncovered' IS DISTINCT FROM '0' OR plan->'settles' IS DISTINCT FROM '[]'::jsonb$n$,
 $o$LEFT JOIN (SELECT "Ref Charges" charge,sum("Principal Paid"::numeric) principal,sum("Interest Paid"::numeric) interest,count(*) FILTER(WHERE "Principal Paid" IS NULL OR "Interest Paid" IS NULL) invalid FROM public."Repayments" WHERE "Ref Charges"=ANY(ids) GROUP BY "Ref Charges") paid ON paid.charge=ch."Row ID"$o$,
 $n$LEFT JOIN (SELECT "Ref Charges" charge,sum("Principal Paid"::numeric) principal,sum("Interest Paid"::numeric) interest,sum("Late Charge Paid"::numeric) late,count(*) FILTER(WHERE "Principal Paid" IS NULL OR "Interest Paid" IS NULL) invalid FROM public."Repayments" WHERE "Ref Charges"=ANY(ids) GROUP BY "Ref Charges") paid ON paid.charge=ch."Row ID"$n$,
 $o$OR ch."Charge Date" IS DISTINCT FROM (entries.item->>'chargeDate')::date$o$,
 $n$OR ch."Charge Date" IS DISTINCT FROM (entries.item->>'chargeDate')::date
     OR (entries.item ? 'expectedLateChargeRemaining' AND ch."Late Charge Due"::numeric-coalesce(paid.late,0) IS DISTINCT FROM (entries.item->>'expectedLateChargeRemaining')::numeric)$n$]);

SELECT pg_temp.v132_patch('public.pwa_agent_receipt_status_v1(uuid,text,text)',ARRAY[
 $o$IN ('7','8','9') AND p.canonical_json::jsonb->'command' ? 'reviewId';$o$,
 $n$IN ('7','8','9','10') AND p.canonical_json::jsonb->'command' ? 'reviewId'; -- R118: agent v10$n$,
 $o$CASE WHEN c->>'schemaVersion'='9' THEN 'Selected Charges' ELSE 'Lump Sum' END$o$,
 $n$CASE WHEN c->>'schemaVersion' IN ('9','10') THEN 'Selected Charges' ELSE 'Lump Sum' END$n$,
 $o$(SELECT coalesce(sum(x."Principal Paid"::numeric+x."Interest Paid"::numeric),0) FROM public."Repayments" x WHERE x."Ref Payment"=p."Row ID")$o$,
 $n$(SELECT coalesce(sum(x."Principal Paid"::numeric+x."Interest Paid"::numeric+x."Late Charge Paid"::numeric),0) FROM public."Repayments" x WHERE x."Ref Payment"=p."Row ID")$n$]);

-- The posted payment's explicit plan of a v11 command (agent v10 rows are schemaVersion '10' with a reviewId, listed).
SELECT pg_temp.v132_replace_all('public.pwa_effective_payment_plan_v2(text)',$o$IN ('6','7','8','9','10')$o$,$n$IN ('6','7','8','9','10','11')$n$,2);

-- 4c. Correction text: a pwa-plan line is the 6-key shape (as stored) or the 8-key shape; its text keeps the shape sent.
SELECT pg_temp.v132_patch('public.pwa_payment_correction_text_v2(jsonb)',ARRAY[
 $o$(SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(line) key) IS DISTINCT FROM ARRAY['chargeDate','chargeId','expectedInterestRemaining','expectedPrincipalRemaining','interest','principal'] THEN RAISE EXCEPTION 'Invalid plan line';END IF;$o$,
 $n$(SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(line) key) IS DISTINCT FROM (CASE WHEN line ? 'lateCharge'
     -- R118: the 8-key line with the late charge and its expected remaining.
     THEN ARRAY['chargeDate','chargeId','expectedInterestRemaining','expectedLateChargeRemaining','expectedPrincipalRemaining','interest','lateCharge','principal']
     ELSE ARRAY['chargeDate','chargeId','expectedInterestRemaining','expectedPrincipalRemaining','interest','principal'] END) THEN RAISE EXCEPTION 'Invalid plan line';END IF;$n$,
 $o$line_text:='{';FOREACH k IN ARRAY ARRAY['chargeId','principal','interest','expectedPrincipalRemaining','expectedInterestRemaining','chargeDate'] LOOP$o$,
 $n$line_text:='{';FOREACH k IN ARRAY (CASE WHEN line ? 'lateCharge' THEN ARRAY['chargeId','principal','interest','lateCharge','expectedPrincipalRemaining','expectedInterestRemaining','expectedLateChargeRemaining','chargeDate']
  ELSE ARRAY['chargeId','principal','interest','expectedPrincipalRemaining','expectedInterestRemaining','chargeDate'] END) LOOP$n$,
 $o$IF k IN('principal','interest','expectedPrincipalRemaining','expectedInterestRemaining') AND$o$,
 $n$IF k IN('principal','interest','lateCharge','expectedPrincipalRemaining','expectedInterestRemaining','expectedLateChargeRemaining') AND$n$,
 $o$(line->>'principal')::numeric+(line->>'interest')::numeric<=0 OR (line->>'principal')::numeric>(line->>'expectedPrincipalRemaining')::numeric OR (line->>'interest')::numeric>(line->>'expectedInterestRemaining')::numeric THEN RAISE EXCEPTION 'Invalid plan line';END IF;$o$,
 $n$(line->>'principal')::numeric+(line->>'interest')::numeric+coalesce(line->>'lateCharge','0')::numeric<=0 OR (line->>'principal')::numeric>(line->>'expectedPrincipalRemaining')::numeric OR (line->>'interest')::numeric>(line->>'expectedInterestRemaining')::numeric OR coalesce(line->>'lateCharge','0')::numeric>coalesce(line->>'expectedLateChargeRemaining','0')::numeric THEN RAISE EXCEPTION 'Invalid plan line';END IF;$n$,
 $o$total:=total+(line->>'principal')::numeric+(line->>'interest')::numeric;$o$,
 $n$total:=total+(line->>'principal')::numeric+(line->>'interest')::numeric+coalesce(line->>'lateCharge','0')::numeric;$n$]);

-- 4d. Loan Close: the payoff adds every unpaid late charge of the loan (every charge must be paid in full to close it);
-- its lines are 8-key. opening, latest, trail, future lowering and mutation are untouched, so the gap-interest day count
-- and the charge the close writes are those of the same loan without a late charge.
SELECT pg_temp.v132_patch('public.loan_close_calculation_v83(text,date,text)',ARRAY[
 $o$coalesce(sum(r."Interest Paid"::numeric),0) i FROM public."Repayments" r WHERE r."Ref Charges"=c."Row ID" AND (p_exclude_payment IS NULL OR r."Ref Payment" IS DISTINCT FROM p_exclude_payment)) paid ON true WHERE c."Ref Loans"=p_loan AND(c."Principal Due" IS NULL OR c."Interest Due" IS NULL OR c."Principal Due"::numeric<paid.p OR c."Interest Due"::numeric<paid.i))$o$,
 $n$coalesce(sum(r."Interest Paid"::numeric),0) i,coalesce(sum(r."Late Charge Paid"::numeric),0) lt FROM public."Repayments" r WHERE r."Ref Charges"=c."Row ID" AND (p_exclude_payment IS NULL OR r."Ref Payment" IS DISTINCT FROM p_exclude_payment)) paid ON true WHERE c."Ref Loans"=p_loan AND(c."Principal Due" IS NULL OR c."Interest Due" IS NULL OR c."Principal Due"::numeric<paid.p OR c."Interest Due"::numeric<paid.i OR c."Late Charge Due"::numeric<paid.lt /* R118 */))$n$,
 $o$WITH paid AS(SELECT r."Ref Charges" id,sum(r."Principal Paid"::numeric) p,sum(r."Interest Paid"::numeric) i FROM public."Repayments" r WHERE r."Ref Loans"=p_loan$o$,
 $n$WITH paid AS(SELECT r."Ref Charges" id,sum(r."Principal Paid"::numeric) p,sum(r."Interest Paid"::numeric) i,sum(r."Late Charge Paid"::numeric) lt FROM public."Repayments" r WHERE r."Ref Loans"=p_loan$n$,
 $o$END-coalesce(paid.i,0) i FROM public."Charges" c LEFT JOIN paid ON paid.id=c."Row ID" WHERE c."Ref Loans"=p_loan$o$,
 $n$END-coalesce(paid.i,0) i,c."Late Charge Due"::numeric-coalesce(paid.lt,0) lt FROM public."Charges" c LEFT JOIN paid ON paid.id=c."Row ID" WHERE c."Ref Loans"=p_loan$n$,
 $o$UNION ALL SELECT target,p_day,missing,interest WHERE mutation->>'kind'='insert')$o$,
 $n$UNION ALL SELECT target,p_day,missing,interest,0::numeric WHERE mutation->>'kind'='insert')$n$,
 $o$SELECT coalesce(jsonb_agg(jsonb_build_object('chargeId',id,'principal',trim_scale(p)::text,'interest',trim_scale(i)::text,'expectedPrincipalRemaining',trim_scale(p)::text,'expectedInterestRemaining',trim_scale(i)::text,'chargeDate',charge_day::text) ORDER BY id COLLATE "C") FILTER(WHERE p+i>0),'[]'::jsonb),sum(p+i) INTO lines,total FROM projected;$o$,
 $n$SELECT coalesce(jsonb_agg(jsonb_build_object('chargeId',id,'principal',trim_scale(p)::text,'interest',trim_scale(i)::text,'lateCharge',trim_scale(lt)::text,'expectedPrincipalRemaining',trim_scale(p)::text,'expectedInterestRemaining',trim_scale(i)::text,'expectedLateChargeRemaining',trim_scale(lt)::text,'chargeDate',charge_day::text) ORDER BY id COLLATE "C") FILTER(WHERE p+i+lt>0),'[]'::jsonb),sum(p+i+lt) INTO lines,total FROM projected;$n$]);

SELECT pg_temp.v132_patch('public.pwa_apply_loan_close_v2(text)',ARRAY[
 $o$OR line->>'interest'!~'^(0|[1-9][0-9]*)$' OR line->>'chargeDate' IS NULL)$o$,
 $n$OR line->>'interest'!~'^(0|[1-9][0-9]*)$' OR coalesce(line->>'lateCharge','0')!~'^(0|[1-9][0-9]*)$' /* R118 */ OR line->>'chargeDate' IS NULL)$n$]);

-- 4e. Pay forward: due and recorded future charges pay interest, then late charge, then principal; every line is 8-key
-- (booked, raised and booked-today charges carry late 0; a settle's lines are its Loan Close quote's).
SELECT pg_temp.v132_replace_all('public.pwa_pay_forward_plan_v1(text,numeric,date,jsonb)',
 $o$LEFT JOIN LATERAL (SELECT sum(y."Principal Paid"::numeric) p,sum(y."Interest Paid"::numeric) i FROM public."Repayments" y WHERE y."Ref Charges"=c."Row ID") paid ON true$o$,
 $n$LEFT JOIN LATERAL (SELECT sum(y."Principal Paid"::numeric) p,sum(y."Interest Paid"::numeric) i,sum(y."Late Charge Paid"::numeric) l FROM public."Repayments" y WHERE y."Ref Charges"=c."Row ID") paid ON true$n$,3);
SELECT pg_temp.v132_replace_all('public.pwa_pay_forward_plan_v1(text,numeric,date,jsonb)',
 $o$AS pr,c."Interest Due"::numeric-coalesce(paid.i,0) AS ir$o$,$n$AS pr,c."Interest Due"::numeric-coalesce(paid.i,0) AS ir,c."Late Charge Due"::numeric-coalesce(paid.l,0) AS lr$n$,2);
SELECT pg_temp.v132_replace_all('public.pwa_pay_forward_plan_v1(text,numeric,date,jsonb)',
 $o$IF ch.pr IS NULL OR ch.ir IS NULL OR ch.pr<0 OR ch.ir<0 OR ch.pr<>trunc(ch.pr) OR ch.ir<>trunc(ch.ir) THEN$o$,
 $n$IF ch.pr IS NULL OR ch.ir IS NULL OR ch.lr IS NULL OR ch.pr<0 OR ch.ir<0 OR ch.lr<0 OR ch.pr<>trunc(ch.pr) OR ch.ir<>trunc(ch.ir) OR ch.lr<>trunc(ch.lr) THEN$n$,2);
SELECT pg_temp.v132_patch('public.pwa_pay_forward_plan_v1(text,numeric,date,jsonb)',ARRAY[
 $o$p numeric; i numeric; amount numeric;$o$,
 $n$p numeric; i numeric; amount numeric;
 -- R118: the late-charge part of a line, and today's charge late remaining (raise).
 lt numeric; today_lr numeric;$n$,
 $o$due_total:=due_total+ch.pr+ch.ir;$o$,
 $n$due_total:=due_total+ch.pr+ch.ir+ch.lr;$n$,
 $o$i:=least(rest,ch.ir);rest:=rest-i;p:=least(rest,ch.pr);rest:=rest-p;$o$,
 $n$i:=least(rest,ch.ir);rest:=rest-i;lt:=least(rest,ch.lr);rest:=rest-lt;p:=least(rest,ch.pr);rest:=rest-p;$n$,
 $o$IF p+i>0 THEN$o$,
 $n$IF p+i+lt>0 THEN$n$,
 $o$jsonb_build_object('principal',p,'interest',i,'expectedPrincipalRemaining',ch.pr,'expectedInterestRemaining',ch.ir,'chargeDate',to_char(ch.d,'YYYY-MM-DD'))$o$,
 $n$jsonb_build_object('principal',p,'interest',i,'lateCharge',lt,'expectedPrincipalRemaining',ch.pr,'expectedInterestRemaining',ch.ir,'expectedLateChargeRemaining',ch.lr,'chargeDate',to_char(ch.d,'YYYY-MM-DD'))$n$,
 $o$SELECT coalesce(sum(c."Principal Due"::numeric-coalesce(paid.p,0)+c."Interest Due"::numeric-coalesce(paid.i,0)),0)$o$,
 $n$SELECT coalesce(sum(c."Principal Due"::numeric-coalesce(paid.p,0)+c."Interest Due"::numeric-coalesce(paid.i,0)+c."Late Charge Due"::numeric-coalesce(paid.l,0)),0)$n$,
 $o$jsonb_build_object('principal',(cl->>'principal')::numeric,'interest',(cl->>'interest')::numeric,$o$,
 $n$jsonb_build_object('principal',(cl->>'principal')::numeric,'interest',(cl->>'interest')::numeric,'lateCharge',coalesce(cl->>'lateCharge','0')::numeric,'expectedLateChargeRemaining',coalesce(cl->>'expectedLateChargeRemaining','0')::numeric,$n$,
 $o$INTO today_pr,today_ir FROM public."Charges" c WHERE c."Row ID"=charge_id;$o$,
 $n$INTO today_pr,today_ir FROM public."Charges" c WHERE c."Row ID"=charge_id;
   SELECT c."Late Charge Due"::numeric-coalesce((SELECT sum(y."Late Charge Paid"::numeric) FROM public."Repayments" y WHERE y."Ref Charges"=c."Row ID"),0)
    INTO today_lr FROM public."Charges" c WHERE c."Row ID"=charge_id;$n$,
 $o$jsonb_build_object('principal',0,'interest',0,'expectedPrincipalRemaining',0,'expectedInterestRemaining',today_ir,'chargeDate',to_char(p_day,'YYYY-MM-DD'))$o$,
 $n$jsonb_build_object('principal',0,'interest',0,'lateCharge',0,'expectedPrincipalRemaining',0,'expectedInterestRemaining',today_ir,'expectedLateChargeRemaining',today_lr,'chargeDate',to_char(p_day,'YYYY-MM-DD'))$n$,
 $o$jsonb_build_object('principal',amount,'interest',accrued,'expectedPrincipalRemaining',amount,'expectedInterestRemaining',accrued,'chargeDate',to_char(p_day,'YYYY-MM-DD'))$o$,
 $n$jsonb_build_object('principal',amount,'interest',accrued,'lateCharge',0,'expectedPrincipalRemaining',amount,'expectedInterestRemaining',accrued,'expectedLateChargeRemaining',0,'chargeDate',to_char(p_day,'YYYY-MM-DD'))$n$,
 $o$'pr',ch.pr,'ir',ch.ir,'book',false)$o$,
 $n$'pr',ch.pr,'ir',ch.ir,'lr',ch.lr,'book',false)$n$,
 $o$'pr',p,'ir',i,'book',true)$o$,
 $n$'pr',p,'ir',i,'lr',0,'book',true)$n$,
 $o$i:=least(rest,(r->>'ir')::numeric);rest:=rest-i;p:=least(rest,(r->>'pr')::numeric);rest:=rest-p;$o$,
 $n$i:=least(rest,(r->>'ir')::numeric);rest:=rest-i;lt:=least(rest,(r->>'lr')::numeric);rest:=rest-lt;p:=least(rest,(r->>'pr')::numeric);rest:=rest-p;$n$,
 $o$jsonb_build_object('principal',p,'interest',i,'expectedPrincipalRemaining',(r->>'pr')::numeric,'expectedInterestRemaining',(r->>'ir')::numeric,'chargeDate',to_char((r->>'d')::date,'YYYY-MM-DD'))$o$,
 $n$jsonb_build_object('principal',p,'interest',i,'lateCharge',lt,'expectedPrincipalRemaining',(r->>'pr')::numeric,'expectedInterestRemaining',(r->>'ir')::numeric,'expectedLateChargeRemaining',(r->>'lr')::numeric,'chargeDate',to_char((r->>'d')::date,'YYYY-MM-DD'))$n$,
 $o$'partial',p+i<(r->>'pr')::numeric+(r->>'ir')::numeric,$o$,
 $n$'partial',p+i+lt<(r->>'pr')::numeric+(r->>'ir')::numeric+(r->>'lr')::numeric,$n$,
 $o$IF p+i=(r->>'pr')::numeric+(r->>'ir')::numeric THEN$o$,
 $n$IF p+i+lt=(r->>'pr')::numeric+(r->>'ir')::numeric+(r->>'lr')::numeric THEN$n$,
 $o$'expectedPrincipalRemaining',trunc((e.value->>'expectedPrincipalRemaining')::numeric)::text,'expectedInterestRemaining',trunc((e.value->>'expectedInterestRemaining')::numeric)::text,$o$,
 $n$'lateCharge',trunc(coalesce((e.value->>'lateCharge')::numeric,0))::text,
    'expectedPrincipalRemaining',trunc((e.value->>'expectedPrincipalRemaining')::numeric)::text,'expectedInterestRemaining',trunc((e.value->>'expectedInterestRemaining')::numeric)::text,
    'expectedLateChargeRemaining',trunc(coalesce((e.value->>'expectedLateChargeRemaining')::numeric,0))::text,$n$]);

-- ============================================================================================================
-- Section 5 (D5). Views, reporting functions and push content.
-- ============================================================================================================
-- Late charges are profit (owner decision 5) and are summed explicitly with interest (Archie point 1): a repayment's
-- profit is "Interest Paid" + "Late Charge Paid". olap_repayments_analytics keeps "Interest Paid" interest only and appends
-- "Late Charge Paid"; its "Amount Received" and partner profits include it. Views without a migration-authored body
-- (V23 rewrote the olap views dynamically; V128/V130 patched the statement and monthly views) are CREATE OR REPLACE'd
-- from their current pretty definition with exact, counted replacements; "Cash Dashboard", olap_portfolio_summary,
-- reporting_income_daily and reporting_income_events are restated from their V130 bodies. Every existing column keeps its
-- name, type and place; appended columns are listed in the self-check.

-- 5a. Charges: the three late columns appended; "Amount Due" includes the late charge ("Total Paid" and "Amount
-- Remaining" already do, from the charge row).
SELECT pg_temp.v132_view('public.olap_charges_analytics',ARRAY[
 $o$COALESCE(c."Principal Due"::numeric, 0::numeric) + COALESCE(c."Interest Due"::numeric, 0::numeric) AS "Amount Due"$o$,
 $n$COALESCE(c."Principal Due"::numeric, 0::numeric) + COALESCE(c."Interest Due"::numeric, 0::numeric) + c."Late Charge Due"::numeric AS "Amount Due"$n$,
 $o$    b."Payment Request Token"
$o$,
 $n$    b."Payment Request Token",
    b."Late Charge Due",
    b."Late Charge Paid",
    b."Late Charge Remaining"
$n$]);

-- 5b. Repayments: "Late Charge Paid" appended; "Amount Received" and the partner profits include it.
SELECT pg_temp.v132_view('public.olap_repayments_analytics',ARRAY[
 $o$r."Interest Paid",$o$,$n$r."Interest Paid",
            r."Late Charge Paid",$n$,
 $o$COALESCE(r."Principal Paid"::numeric, 0::numeric) + COALESCE(r."Interest Paid"::numeric, 0::numeric) AS "Amount Received"$o$,
 $n$COALESCE(r."Principal Paid"::numeric, 0::numeric) + COALESCE(r."Interest Paid"::numeric, 0::numeric) + r."Late Charge Paid"::numeric AS "Amount Received"$n$,
 $o$a."Interest Paid",$o$,$n$a."Interest Paid",
            a."Late Charge Paid",$n$,
 $o$round(COALESCE(a."Interest Paid"::numeric, 0::numeric) * a."Partner A Profit Share") AS "Partner A Profit"$o$,
 $n$round((COALESCE(a."Interest Paid"::numeric, 0::numeric) + a."Late Charge Paid"::numeric) * a."Partner A Profit Share") AS "Partner A Profit"$n$,
 $o$round(COALESCE(a."Interest Paid"::numeric, 0::numeric) * a."Partner B Profit Share") AS "Partner B Profit"$o$,
 $n$round((COALESCE(a."Interest Paid"::numeric, 0::numeric) + a."Late Charge Paid"::numeric) * a."Partner B Profit Share") AS "Partner B Profit"$n$,
 $o$round("Amount Received", 0) AS "Amount Received"$o$,
 $n$round("Amount Received", 0) AS "Amount Received",
    "Late Charge Paid"$n$]);

-- 5c. Cash Dashboard (the V130 body): gross income MTD is interest plus late charge; columns unchanged.
CREATE OR REPLACE VIEW public."Cash Dashboard" AS
WITH ctx AS (SELECT d,date_trunc('month',d)::date ms FROM (SELECT public.olap_reporting_date() d) q),
profit AS (
 SELECT coalesce(sum(r."Interest Paid"::numeric+r."Late Charge Paid"::numeric) FILTER(WHERE r."Payment Date">=ms AND NOT r.loss_pair),0) income,
 coalesce(sum(r."Partner A Profit") FILTER(WHERE r."Payment Date"<ms),0) prior_a,
 coalesce(sum(r."Partner B Profit") FILTER(WHERE r."Payment Date"<ms),0) prior_b,
 coalesce(sum(r."Partner A Profit") FILTER(WHERE r."Payment Date">=ms),0) month_a,
 coalesce(sum(r."Partner B Profit") FILTER(WHERE r."Payment Date">=ms),0) month_b,
 coalesce(sum(r."Principal Paid"::numeric) FILTER(WHERE r."Payment Date">=ms AND r.loss_pair),0) writeoff
 FROM (SELECT wx.*,public.is_principal_writeoff(wx."Row ID",wx."Ref Payment",wx."Principal Paid"::numeric,wx."Interest Paid"::numeric,wx."Ref Charges",wc.principal,wc.interest,wc.repayments) AS loss_pair FROM public.olap_repayments_analytics wx LEFT JOIN LATERAL (SELECT c."Principal Due"::numeric AS principal,c."Interest Due"::numeric AS interest,(SELECT count(*) FROM public."Repayments" n WHERE n."Ref Charges"=c."Row ID") AS repayments FROM public."Charges" c WHERE c."Row ID"=wx."Ref Charges" AND wx."Ref Payment" IS NULL AND wx."Principal Paid"::numeric>0 AND wx."Interest Paid"::numeric=-wx."Principal Paid"::numeric) wc ON true) r CROSS JOIN ctx WHERE r."Payment Date"<=d
), expense AS (
 SELECT coalesce(sum(e."Amount"::numeric) FILTER(WHERE e."Expense Date">=ms),0) amount,
 coalesce(sum(e."Partner A Expense"::numeric) FILTER(WHERE e."Expense Date"<ms),0) prior_a,
 coalesce(sum(e."Partner B Expense"::numeric) FILTER(WHERE e."Expense Date"<ms),0) prior_b,
 coalesce(sum(e."Partner A Expense"::numeric) FILTER(WHERE e."Expense Date">=ms),0) month_a,
 coalesce(sum(e."Partner B Expense"::numeric) FILTER(WHERE e."Expense Date">=ms),0) month_b
 FROM public."Business Expenses" e CROSS JOIN ctx WHERE e."Expense Date"<=d
), settled AS (
 SELECT coalesce(sum(s."Amount"::numeric) FILTER(WHERE p."Partner Role"='A'),0) a,
 coalesce(sum(s."Amount"::numeric) FILTER(WHERE p."Partner Role"='B'),0) b
 FROM public."Settlements" s JOIN public."Partners" p ON p."Row ID"=s."Ref Partner"
 CROSS JOIN ctx WHERE s."Status"='Completed' AND s."Transfer Date"<=d
), allocated AS (
 SELECT profit.income,expense.amount,profit.writeoff,
 public.fifo_current_month_settled(profit.prior_a-expense.prior_a,profit.month_a-expense.month_a,settled.a) a,
 public.fifo_current_month_settled(profit.prior_b-expense.prior_b,profit.month_b-expense.month_b,settled.b) b
 FROM profit CROSS JOIN expense CROSS JOIN settled
), cash AS (
 SELECT CASE WHEN bool_and("Initialized") THEN sum("Business Cash Held") END held
 FROM public."Cash Account Balances"
)
SELECT 'cash-dashboard'::text AS "Row ID",
 allocated.income AS "Operating Income MTD",
 -allocated.amount AS "Expenses MTD",
 allocated.income-allocated.amount-allocated.writeoff AS "Net Profit MTD",
 -allocated.a AS "Tommy Withdrawn MTD",
 -allocated.b AS "Lisa Withdrawn MTD",
 allocated.income-allocated.amount-allocated.writeoff-allocated.a-allocated.b AS "Unsettled Profit MTD",
 pool."Available Cashpool"::numeric AS "Cash Pool Remaining",
 cash.held AS "Business Cash Held",
 allocated.writeoff AS "Principal Write-offs MTD"
FROM allocated CROSS JOIN public."Loan Form Context" pool CROSS JOIN cash;

-- 5d. olap_portfolio_summary (the V130 body): Total, Today's, Yesterday's and Realized MTD profit (and so Projected Monthly
-- Profit, Operating Income MTD and the net figures) are interest plus late charge; columns unchanged.
CREATE OR REPLACE VIEW public.olap_portfolio_summary AS
WITH ctx AS (SELECT d, date_trunc('month',d)::date ms,
 (date_trunc('month',d)+interval '1 month - 1 day')::date me FROM (SELECT public.olap_reporting_date() d) q),

lr AS (SELECT coalesce(sum("Outstanding Principal"),0) principal,count(*) FILTER(WHERE "Loan Status"='ยังไม่ปิดยอด') active,
 coalesce(sum("Expected Interest This Month"),0) forecast,coalesce(sum("Principal Days MTD"),0) days,
 coalesce(sum("Expected Daily Interest Amount"),0) daily,coalesce(sum("Total Interest Received") FILTER(WHERE "Loan Status"='ยังไม่ปิดยอด'),0) active_profit,
 coalesce(sum("Default Loss Amount"::numeric),0) principal_loss FROM public.olap_loans_analytics),
rr AS (SELECT coalesce(sum("Interest Paid"::numeric+"Late Charge Paid"::numeric) FILTER(WHERE NOT loss_pair),0) profit,
 coalesce(sum("Interest Paid"::numeric+"Late Charge Paid"::numeric) FILTER(WHERE "Payment Date"=d AND NOT loss_pair),0) today,
 coalesce(sum("Interest Paid"::numeric+"Late Charge Paid"::numeric) FILTER(WHERE "Payment Date"=d-1 AND NOT loss_pair),0) yesterday,
 coalesce(sum("Interest Paid"::numeric+"Late Charge Paid"::numeric) FILTER(WHERE "Payment Date" BETWEEN ms AND me AND NOT loss_pair),0) mtd,
 coalesce(sum("Principal Returned Days MTD"),0) returned_days,coalesce(sum("Partner A Profit"),0) profit_a,coalesce(sum("Partner B Profit"),0) profit_b,
 coalesce(sum("Principal Paid"::numeric) FILTER(WHERE loss_pair),0) writeoff,
 coalesce(sum("Principal Paid"::numeric) FILTER(WHERE "Payment Date" BETWEEN ms AND me AND loss_pair),0) writeoff_mtd
 FROM (SELECT wx.*,public.is_principal_writeoff(wx."Row ID",wx."Ref Payment",wx."Principal Paid"::numeric,wx."Interest Paid"::numeric,wx."Ref Charges",wc.principal,wc.interest,wc.repayments) AS loss_pair FROM public.olap_repayments_analytics wx LEFT JOIN LATERAL (SELECT c."Principal Due"::numeric AS principal,c."Interest Due"::numeric AS interest,(SELECT count(*) FROM public."Repayments" n WHERE n."Ref Charges"=c."Row ID") AS repayments FROM public."Charges" c WHERE c."Row ID"=wx."Ref Charges" AND wx."Ref Payment" IS NULL AND wx."Principal Paid"::numeric>0 AND wx."Interest Paid"::numeric=-wx."Principal Paid"::numeric) wc ON true) repayments CROSS JOIN ctx),
cr AS (SELECT coalesce(sum("Amount Remaining") FILTER(WHERE nullif("Ref Loans",'') IS NOT NULL AND "Charge Date"<=d),0) pending,
 coalesce(sum("Interest Remaining") FILTER(WHERE nullif("Ref Loans",'') IS NOT NULL AND "Charge Date"<=d),0) interest,
 coalesce(sum("Amount Due") FILTER(WHERE "Charge Date"=d),0) due,coalesce(sum("Total Paid") FILTER(WHERE "Charge Date"=d),0) paid,
 coalesce(sum("Amount Remaining") FILTER(WHERE "Charge Date"=d),0) remaining FROM public.olap_charges_analytics CROSS JOIN ctx),
br AS (SELECT count(*) FILTER(WHERE "Daily Collection Status"='Fully Paid') full_count,count(*) FILTER(WHERE "Daily Collection Status"='Partially Paid') partial_count,
 count(*) FILTER(WHERE "Daily Collection Status"='Overdue') overdue_count,count(*) FILTER(WHERE "Daily Collection Status"='Not Paid') notpaid_count,
 count(*) FILTER(WHERE "Daily Collection Status"='Long Overdue') long_overdue_count FROM public.olap_borrowers_analytics),
top3 AS (SELECT coalesce(sum(v),0) total FROM (SELECT "Total Outstanding Principal" v FROM public."Borrowers" WHERE "Total Outstanding Principal">0 ORDER BY 1 DESC LIMIT 3) q),
pool AS (SELECT coalesce(sum(CASE WHEN "Transaction Type"='Contribution' THEN "Amount"::numeric ELSE -"Amount"::numeric END),0) total FROM public."Cash Pool Contributions"),
settled AS (SELECT coalesce(sum(s."Amount"::numeric),0) total FROM public."Settlements" s JOIN public."Partners" p ON p."Row ID"=s."Ref Partner" WHERE s."Status"='Completed'),
earned AS (SELECT coalesce(sum(CASE p."Partner Role" WHEN 'A' THEN rr.profit_a WHEN 'B' THEN rr.profit_b ELSE 0 END),0) total FROM public."Partners" p CROSS JOIN rr),
er AS (SELECT coalesce(sum("Amount"::numeric),0) total,coalesce(sum("Amount"::numeric) FILTER(WHERE "Expense Date" BETWEEN ms AND d),0) mtd FROM public."Business Expenses" CROSS JOIN ctx),
recent AS (SELECT a.* FROM public."Daily Analytics" a WHERE a."Snapshot Date">=(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')-interval '30 days'),
peak AS (SELECT coalesce(max("Outstanding Principal EOD"::numeric),0) amount FROM recent),
peakdate AS (SELECT max("Snapshot Date") dt FROM recent CROSS JOIN peak WHERE "Outstanding Principal EOD"::numeric=peak.amount),
a AS (SELECT s."Row ID",s."Statistics ID",rr.profit "Total Profit",lr.principal "Outstanding Principal",lr.principal "Total Outstanding Principal",
 lr.active "Active Loans",rr.today "Today's Profit",rr.yesterday "Yesterday's Profit",rr.mtd "Realized Profit MTD",
 rr.mtd+cr.interest+lr.forecast "Projected Monthly Profit",cr.pending "Pending Payment Amount",lr.forecast "Forecast Remaining Interest",cr.interest "Today's Outstanding Interest",
 lr.days-rr.returned_days "Net Principal Days MTD",lr.principal*(me-d) "Forecast Remaining Principal Days",
 round((lr.days-rr.returned_days+lr.principal*(me-d))/extract(day FROM me)) "Forecast Average Daily Outstanding Principal",
 peak.amount "Peak Cash Pool 30D",peakdate.dt "Peak Cash Pool Date 30D",lr.daily "Expected Daily Interest",lr.active_profit "Total Profit of Outstanding Loans",
 CASE WHEN lr.principal>0 THEN lr.active_profit/lr.principal ELSE 0 END "Profit Coverage of Outstanding Principal",
 pool.total "Total Cash Pool",earned.total-settled.total "Total Unsettled Profit",
 pool.total-lr.principal+earned.total-settled.total "Expected Loan Account Balance",
 CASE WHEN lr.principal=0 THEN 0 ELSE top3.total/lr.principal END "Top 3 Borrower Concentration",
 br.full_count "Borrowers Fully Paid Today",br.partial_count "Borrowers Partially Paid Today",br.overdue_count "Borrowers with Overdue Payment",br.notpaid_count "Borrowers Not Paid Today",
 cr.due "Amount Due Today",cr.paid "Amount Collected Today",cr.remaining "Amount Outstanding Today",
 CASE WHEN cr.due=0 THEN 0 ELSE cr.paid/cr.due END "Amount Collection Rate Today",
 er.total "Total Business Expenses",rr.profit-rr.writeoff-er.total "Net Profit",er.mtd "Expenses MTD",rr.mtd-rr.writeoff_mtd-er.mtd "Net Profit MTD",
 earned.total-settled.total-er.total "Net Unsettled Profit",pool.total-lr.principal+earned.total-settled.total-er.total "Net Expected Loan Account Balance",
 rr.mtd "Operating Income MTD",-er.mtd "Income Statement Expenses MTD",br.long_overdue_count "Borrowers with Long Overdue Payment",
 lr.principal_loss "Total Principal Loss",rr.writeoff_mtd "Principal Write-offs MTD",rr.writeoff "Principal Write-offs"
 FROM public."Statistics" s CROSS JOIN ctx CROSS JOIN lr CROSS JOIN rr CROSS JOIN cr CROSS JOIN br CROSS JOIN top3 CROSS JOIN pool CROSS JOIN settled CROSS JOIN earned CROSS JOIN er CROSS JOIN peak CROSS JOIN peakdate),
final AS (SELECT a.*,CASE WHEN "Forecast Average Daily Outstanding Principal">0 THEN "Projected Monthly Profit"/"Forecast Average Daily Outstanding Principal" ELSE 0 END "Forecast Monthly Return on ADO" FROM a)

SELECT x."Row ID",
 x."Statistics ID",
 round(x."Total Profit"::numeric,0) AS "Total Profit",
 round(x."Outstanding Principal"::numeric,0) AS "Outstanding Principal",
 x."Active Loans",
 round(x."Today's Profit"::numeric,0) AS "Today's Profit",
 round(x."Yesterday's Profit"::numeric,0) AS "Yesterday's Profit",
 round(x."Realized Profit MTD"::numeric,0) AS "Realized Profit MTD",
 round(x."Projected Monthly Profit"::numeric,0) AS "Projected Monthly Profit",
 round(x."Pending Payment Amount"::numeric,0) AS "Pending Payment Amount",
 round(x."Forecast Remaining Interest"::numeric,0) AS "Forecast Remaining Interest",
 round(x."Today's Outstanding Interest"::numeric,0) AS "Today's Outstanding Interest",
 x."Net Principal Days MTD",
 x."Forecast Remaining Principal Days",
 round(x."Forecast Average Daily Outstanding Principal"::numeric,0) AS "Forecast Average Daily Outstanding Principal",
 round(x."Forecast Monthly Return on ADO"::numeric,2) AS "Forecast Monthly Return on ADO",
 round(x."Peak Cash Pool 30D"::numeric,0) AS "Peak Cash Pool 30D",
 x."Peak Cash Pool Date 30D",
 round(x."Expected Daily Interest"::numeric,0) AS "Expected Daily Interest",
 round(x."Total Profit of Outstanding Loans"::numeric,0) AS "Total Profit of Outstanding Loans",
 round(x."Profit Coverage of Outstanding Principal"::numeric,2) AS "Profit Coverage of Outstanding Principal",
 round(x."Total Cash Pool"::numeric,0) AS "Total Cash Pool",
 round(x."Total Unsettled Profit"::numeric,0) AS "Total Unsettled Profit",
 round(x."Expected Loan Account Balance"::numeric,0) AS "Expected Loan Account Balance",
 round(x."Total Outstanding Principal"::numeric,0) AS "Total Outstanding Principal",
 round(x."Top 3 Borrower Concentration"::numeric,4) AS "Top 3 Borrower Concentration",
 x."Borrowers Fully Paid Today",
 x."Borrowers Partially Paid Today",
 x."Borrowers with Overdue Payment",
 x."Borrowers Not Paid Today",
 round(x."Amount Due Today"::numeric,0) AS "Amount Due Today",
 round(x."Amount Collected Today"::numeric,0) AS "Amount Collected Today",
 round(x."Amount Outstanding Today"::numeric,0) AS "Amount Outstanding Today",
 x."Amount Collection Rate Today",
 round(x."Total Business Expenses"::numeric,0) AS "Total Business Expenses",
 round(x."Net Profit"::numeric,0) AS "Net Profit",
 round(x."Expenses MTD"::numeric,0) AS "Expenses MTD",
 round(x."Net Profit MTD"::numeric,0) AS "Net Profit MTD",
 round(x."Net Unsettled Profit"::numeric,0) AS "Net Unsettled Profit",
 round(x."Net Expected Loan Account Balance"::numeric,0) AS "Net Expected Loan Account Balance",
 round(x."Income Statement Expenses MTD"::numeric,0) AS "Income Statement Expenses MTD",
 round(x."Operating Income MTD"::numeric,0) AS "Operating Income MTD",
 x."Borrowers with Long Overdue Payment",
 round(x."Total Principal Loss"::numeric,0) AS "Total Principal Loss",
 round(x."Principal Write-offs MTD"::numeric,0) AS "Principal Write-offs MTD",
 round(x."Principal Write-offs"::numeric,0) AS "Principal Write-offs" FROM final x;

-- 5e. The income statement: "Net Profit Since Inception" includes late charges; "Late Charges Received MTD" (the memo
-- line, its own sum over the Cash Dashboard's month: month start to the reporting date) is appended last.
SELECT pg_temp.v132_view('public.reporting_income_statement',ARRAY[
 $o$r."Interest Paid"::numeric AS "Interest Paid",$o$,
 $n$r."Interest Paid"::numeric + r."Late Charge Paid"::numeric AS "Interest Paid",$n$,
 $o$    "Principal Write-offs MTD"
   FROM "Cash Dashboard" s;$o$,
 $n$    "Principal Write-offs MTD",
    ( SELECT COALESCE(sum(lc."Late Charge Paid"::numeric), 0::numeric) AS "coalesce"
           FROM olap_repayments_analytics lc
          WHERE lc."Payment Date" >= date_trunc('month'::text, olap_reporting_date()::timestamp with time zone)::date AND lc."Payment Date" <= olap_reporting_date()) AS "Late Charges Received MTD"
   FROM "Cash Dashboard" s;$n$]);

-- 5f. Monthly: income includes late charges; "Late Charges Received" per month appended last.
SELECT pg_temp.v132_view('public.reporting_income_monthly',ARRAY[
 $o$sum(unnamed_subquery."Interest Paid") FILTER (WHERE NOT unnamed_subquery."Loss Pair") AS amount,$o$,
 $n$sum(unnamed_subquery."Interest Paid") FILTER (WHERE NOT unnamed_subquery."Loss Pair") AS amount,
            sum(unnamed_subquery."Late Charge Paid") FILTER (WHERE NOT unnamed_subquery."Loss Pair") AS late,$n$,
 $o$r."Interest Paid"::numeric AS "Interest Paid",$o$,
 $n$r."Interest Paid"::numeric + r."Late Charge Paid"::numeric AS "Interest Paid",
                    r."Late Charge Paid"::numeric AS "Late Charge Paid",$n$,
 $o$wx."Amount Received",$o$,
 $n$wx."Amount Received",
                            wx."Late Charge Paid",$n$,
 $o$COALESCE(i.writeoff, 0::numeric) AS "Principal Write-offs"$o$,
 $n$COALESCE(i.writeoff, 0::numeric) AS "Principal Write-offs",
    COALESCE(i.late, 0::numeric) AS "Late Charges Received"$n$]);

-- 5g. reporting_income_daily (the V130 body): income includes late charges; "Late Charges Received" appended last.
CREATE OR REPLACE VIEW public.reporting_income_daily AS
WITH income AS (
 SELECT "Payment Date" d,sum("Interest Paid"::numeric+"Late Charge Paid"::numeric) FILTER(WHERE NOT loss_pair) income,
  sum("Partner A Profit") pa,sum("Partner B Profit") pb,
  sum("Principal Paid"::numeric) FILTER(WHERE loss_pair) writeoff,
  sum("Late Charge Paid"::numeric) FILTER(WHERE NOT loss_pair) late
 FROM (SELECT wx.*,public.is_principal_writeoff(wx."Row ID",wx."Ref Payment",wx."Principal Paid"::numeric,wx."Interest Paid"::numeric,wx."Ref Charges",wc.principal,wc.interest,wc.repayments) AS loss_pair FROM public.olap_repayments_analytics wx LEFT JOIN LATERAL (SELECT c."Principal Due"::numeric AS principal,c."Interest Due"::numeric AS interest,(SELECT count(*) FROM public."Repayments" n WHERE n."Ref Charges"=c."Row ID") AS repayments FROM public."Charges" c WHERE c."Row ID"=wx."Ref Charges" AND wx."Ref Payment" IS NULL AND wx."Principal Paid"::numeric>0 AND wx."Interest Paid"::numeric=-wx."Principal Paid"::numeric) wc ON true) repayments WHERE "Payment Date"<=(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date GROUP BY "Payment Date"
), expenses AS (
 SELECT "Expense Date" d,sum("Amount"::numeric) expense,sum("Partner A Expense"::numeric) pa,sum("Partner B Expense"::numeric) pb
 FROM public."Business Expenses" WHERE "Expense Date"<=(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date GROUP BY "Expense Date"
), settled AS (
 SELECT "Transfer Date" d,coalesce(sum("Amount") FILTER(WHERE "Partner Role"='A'),0) pa,coalesce(sum("Amount") FILTER(WHERE "Partner Role"='B'),0) pb
 FROM (SELECT s."Row ID" AS "Settlement ID",s."Ref Partner" AS "Partner ID",p."Partner Name" AS "Partner",p."Partner Role",s."Transfer Date",
   s."Amount"::numeric AS "Amount",s."Status"
  FROM public."Settlements" s LEFT JOIN public."Partners" p ON p."Row ID"=s."Ref Partner"
  WHERE s."Transfer Date"<=(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date) unnamed_subquery
 WHERE "Status"='Completed' GROUP BY "Transfer Date"
), bounds AS (
 SELECT min(d) first_date FROM (SELECT d FROM income UNION ALL SELECT d FROM expenses UNION ALL SELECT d FROM settled) dates
), calendar AS (
 SELECT generate_series(date_trunc('month',coalesce(first_date,(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date))::date,
  (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date,interval '1 day')::date d FROM bounds
), daily AS (
 SELECT c.d,coalesce(i.income,0) income,coalesce(e.expense,0) expense,coalesce(i.pa,0)-coalesce(e.pa,0) pa_net,coalesce(i.pb,0)-coalesce(e.pb,0) pb_net,
  coalesce(s.pa,0) pa_settled,coalesce(s.pb,0) pb_settled,coalesce(i.writeoff,0) writeoff,coalesce(i.late,0) late
 FROM calendar c LEFT JOIN income i USING (d) LEFT JOIN expenses e USING (d) LEFT JOIN settled s USING (d)
)
SELECT d AS "Date",date_trunc('month',d)::date AS "Month",income AS "Operating Income",expense AS "Expenses",-expense AS "Signed Expenses",
 income-expense-writeoff AS "Net Profit",pa_net AS "Partner A Net Profit",pb_net AS "Partner B Net Profit",
 coalesce(sum(pa_net) OVER (ORDER BY d ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING),0) AS "Prior Partner A Net",
 coalesce(sum(pb_net) OVER (ORDER BY d ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING),0) AS "Prior Partner B Net",
 sum(pa_settled) OVER (ORDER BY d ROWS UNBOUNDED PRECEDING) AS "Partner A Settled Through Date",
 sum(pb_settled) OVER (ORDER BY d ROWS UNBOUNDED PRECEDING) AS "Partner B Settled Through Date",
 sum(income-expense-writeoff) OVER (ORDER BY d ROWS UNBOUNDED PRECEDING) AS "Net Profit Through Date",
 writeoff AS "Principal Write-offs",
 late AS "Late Charges Received"
FROM daily;

-- 5h. reporting_income_events (the V130 body): a repayment event's income includes its late charge; "Late Charges
-- Received" (the event's late part; 0 for an expense) appended last.
CREATE OR REPLACE VIEW public.reporting_income_events AS
SELECT 'repayment:'||"Row ID" AS "Event ID","Payment Date" AS "Date",
 CASE WHEN loss_pair THEN 0::numeric ELSE "Interest Paid"::numeric+"Late Charge Paid"::numeric END AS "Income",0::numeric AS "Expenses",
 CASE WHEN loss_pair THEN "Principal Paid"::numeric ELSE 0::numeric END AS "Principal Write-offs",
 CASE WHEN loss_pair THEN 0::numeric ELSE "Late Charge Paid"::numeric END AS "Late Charges Received"
FROM (SELECT wx.*,public.is_principal_writeoff(wx."Row ID",wx."Ref Payment",wx."Principal Paid"::numeric,wx."Interest Paid"::numeric,wx."Ref Charges",wc.principal,wc.interest,wc.repayments) AS loss_pair FROM public.olap_repayments_analytics wx LEFT JOIN LATERAL (SELECT c."Principal Due"::numeric AS principal,c."Interest Due"::numeric AS interest,(SELECT count(*) FROM public."Repayments" n WHERE n."Ref Charges"=c."Row ID") AS repayments FROM public."Charges" c WHERE c."Row ID"=wx."Ref Charges" AND wx."Ref Payment" IS NULL AND wx."Principal Paid"::numeric>0 AND wx."Interest Paid"::numeric=-wx."Principal Paid"::numeric) wc ON true) repayments WHERE "Payment Date"<=public.olap_reporting_date()
UNION ALL
SELECT 'expense:'||"Row ID","Expense Date",0::numeric,"Amount"::numeric,0::numeric,0::numeric
FROM public."Business Expenses" WHERE "Expense Date"<=public.olap_reporting_date();

-- 5i. Upcoming charges: a recorded charge's late remaining is appended last and included in "Amount Remaining"
-- (projected rows 0); the summaries' "Total Charge" follows "Amount Remaining".
SELECT pg_temp.v132_view('public.oltp_upcoming_charge_events_v1',ARRAY[
 $o$            dense_rank() OVER (PARTITION BY amounts.borrower_id ORDER BY amounts.due_date)::integer AS due_rank$o$,
 $n$            dense_rank() OVER (PARTITION BY amounts.borrower_id ORDER BY amounts.due_date)::integer AS due_rank,
            COALESCE(( SELECT sum(c."Late Charge Remaining") AS sum
                   FROM "Charges" c
                  WHERE c."Ref Loans" = amounts.loan_id AND c."Charge Date" = amounts.due_date AND amounts.basis <> 'Projected'::text), 0::numeric) AS late$n$,
 $o$principal + interest AS "Amount Remaining",$o$,
 $n$principal + interest + late AS "Amount Remaining",$n$,
 $o$due_rank AS "Borrower Due Date Rank"$o$,
 $n$due_rank AS "Borrower Due Date Rank",
    late AS "Late Charge Remaining"$n$]);

-- 5j. Payment health (Archie point 10): a charge is fully paid, on time or settled only when its late charge is paid
-- too; "Overdue Amount" and the remaining amount include it; "Unpaid Interest" and "Overdue Interest" stay interest.
SELECT pg_temp.v132_view('public.reporting_charge_payment_health_v1',ARRAY[
 $o$sum(r."Interest Paid"::numeric) AS i
$o$,
 $n$sum(r."Interest Paid"::numeric) AS i,
            sum(r."Late Charge Paid"::numeric) AS l
$n$,
 $o$sum(daily.i) OVER (PARTITION BY daily.id ORDER BY daily.effective_day) AS ci$o$,
 $n$sum(daily.i) OVER (PARTITION BY daily.id ORDER BY daily.effective_day) AS ci,
            sum(daily.l) OVER (PARTITION BY daily.id ORDER BY daily.effective_day) AS cl$n$,
 $o$r.ci >= (c."Interest Due"::numeric - 0.005) AS full_paid$o$,
 $n$r.ci >= (c."Interest Due"::numeric - 0.005) AND r.cl >= (c."Late Charge Due"::numeric - 0.005) AS full_paid$n$,
 $o$COALESCE(sum(r."Interest Paid"::numeric) FILTER (WHERE r."Payment Date" <= ctx.d), 0::numeric) AS i,$o$,
 $n$COALESCE(sum(r."Interest Paid"::numeric) FILTER (WHERE r."Payment Date" <= ctx.d), 0::numeric) AS i,
            COALESCE(sum(r."Late Charge Paid"::numeric) FILTER (WHERE r."Payment Date" <= ctx.d), 0::numeric) AS l,$n$,
 $o$COALESCE(sum(r."Interest Paid"::numeric) FILTER (WHERE r."Payment Date" <= c."Charge Date" AND r."Payment Date" < ctx.d), 0::numeric) AS on_i,$o$,
 $n$COALESCE(sum(r."Interest Paid"::numeric) FILTER (WHERE r."Payment Date" <= c."Charge Date" AND r."Payment Date" < ctx.d), 0::numeric) AS on_i,
            COALESCE(sum(r."Late Charge Paid"::numeric) FILTER (WHERE r."Payment Date" <= c."Charge Date" AND r."Payment Date" < ctx.d), 0::numeric) AS on_l,$n$,
 $o$c."Interest Due"::numeric AS interest_due,$o$,
 $n$c."Interest Due"::numeric AS interest_due,
            c."Late Charge Due"::numeric AS late_due,$n$,
 $o$GREATEST(c."Interest Due"::numeric - COALESCE(p.i, 0::numeric), 0::numeric) AS interest_remaining_current,$o$,
 $n$GREATEST(c."Interest Due"::numeric - COALESCE(p.i, 0::numeric), 0::numeric) AS interest_remaining_current,
            GREATEST(c."Late Charge Due"::numeric - COALESCE(p.l, 0::numeric), 0::numeric) AS late_remaining_current,$n$,
 $o$(c."Principal Due"::numeric + c."Interest Due"::numeric) > 0::numeric AS eligible,$o$,
 $n$(c."Principal Due"::numeric + c."Interest Due"::numeric + c."Late Charge Due"::numeric) > 0::numeric AS eligible,$n$,
 $o$COALESCE(p.on_i, 0::numeric) >= (c."Interest Due"::numeric - 0.005) AS on_time_covered,$o$,
 $n$COALESCE(p.on_i, 0::numeric) >= (c."Interest Due"::numeric - 0.005) AND COALESCE(p.on_l, 0::numeric) >= (c."Late Charge Due"::numeric - 0.005) AS on_time_covered,$n$,
 $o$base.principal_remaining_current + base.interest_remaining_current AS remaining_current,$o$,
 $n$base.principal_remaining_current + base.interest_remaining_current + base.late_remaining_current AS remaining_current,$n$,
 $o$WHEN (base.principal_due + base.interest_due) = 0::numeric THEN 'Zero obligation'::text$o$,
 $n$WHEN (base.principal_due + base.interest_due + base.late_due) = 0::numeric THEN 'Zero obligation'::text$n$]);

-- 5k. Borrower analytics: the 30-day, 10-day and month profit include late charges.
SELECT pg_temp.v132_view('public.olap_borrowers_analytics',ARRAY[
 $o$COALESCE(sum(r."Interest Paid"::numeric) FILTER (WHERE r."Payment Date" >= (ctx.d - 29) AND r."Payment Date" <= ctx.d AND r."Interest Paid"::numeric > 0::numeric), 0::numeric) AS p$o$,
 $n$COALESCE(sum(r."Interest Paid"::numeric + r."Late Charge Paid"::numeric) FILTER (WHERE r."Payment Date" >= (ctx.d - 29) AND r."Payment Date" <= ctx.d AND (r."Interest Paid"::numeric + r."Late Charge Paid"::numeric) > 0::numeric), 0::numeric) AS p$n$,
 $o$COALESCE(sum(r."Interest Paid"::numeric) FILTER (WHERE r."Payment Date" >= (ctx.d - 10) AND r."Payment Date" < ctx.d AND r."Interest Paid"::numeric > 0::numeric), 0::numeric) AS pr$o$,
 $n$COALESCE(sum(r."Interest Paid"::numeric + r."Late Charge Paid"::numeric) FILTER (WHERE r."Payment Date" >= (ctx.d - 10) AND r."Payment Date" < ctx.d AND (r."Interest Paid"::numeric + r."Late Charge Paid"::numeric) > 0::numeric), 0::numeric) AS pr$n$,
 $o$COALESCE(sum(r."Interest Paid"::numeric) FILTER (WHERE r."Payment Date" >= ctx.ms AND r."Payment Date" <= ctx.me), 0::numeric) AS mtd,$o$,
 $n$COALESCE(sum(r."Interest Paid"::numeric + r."Late Charge Paid"::numeric) FILTER (WHERE r."Payment Date" >= ctx.ms AND r."Payment Date" <= ctx.me), 0::numeric) AS mtd,$n$]);

-- 5l. Partner reporting: the allocation residual is the partner profits less interest and late charge (V47).
SELECT pg_temp.v132_view('public.reporting_partner_position_v1',ARRAY[
 $o$olap_repayments_analytics."Partner A Profit" + olap_repayments_analytics."Partner B Profit" - olap_repayments_analytics."Interest Paid"::numeric$o$,
 $n$olap_repayments_analytics."Partner A Profit" + olap_repayments_analytics."Partner B Profit" - (olap_repayments_analytics."Interest Paid"::numeric + olap_repayments_analytics."Late Charge Paid"::numeric)$n$]);

-- 5m. Borrower reporting (V44) and the forecast actuals (V48): interest received includes late charges.
SELECT pg_temp.v132_view('public.reporting_borrower_directory_v1',ARRAY[
 $o$THEN sum(r."Interest Paid"::numeric) FILTER (WHERE r."Payment Date" <= olap_reporting_date())$o$,
 $n$THEN sum(r."Interest Paid"::numeric + r."Late Charge Paid"::numeric) FILTER (WHERE r."Payment Date" <= olap_reporting_date())$n$]);
SELECT pg_temp.v132_view('public.reporting_borrower_activity_daily_v1',ARRAY[
 $o$r."Interest Paid"::numeric AS "Interest Paid",$o$,$n$r."Interest Paid"::numeric + r."Late Charge Paid"::numeric AS "Interest Paid",$n$]);
SELECT pg_temp.v132_view('public.reporting_borrower_matrix_v2',ARRAY[
 $o$sum(r."Interest Paid"::numeric) AS contribution$o$,$n$sum(r."Interest Paid"::numeric + r."Late Charge Paid"::numeric) AS contribution$n$]);
SELECT pg_temp.v132_view('public.reporting_forecast_actuals_v1',ARRAY[
 $o$r."Interest Paid"::numeric AS interest,$o$,$n$r."Interest Paid"::numeric + r."Late Charge Paid"::numeric AS interest,$n$]);

-- 5n. Daily Analytics snapshots (Archie point 3): interest received and pending charges include the late charge (late is
-- 0 everywhere before R118, so a refresh of a past date reproduces its values).
SELECT pg_temp.v132_patch('public.refresh_daily_analytics_scoped(date,date,text[])',ARRAY[
 $o$sum("Interest Paid"::numeric) AS interest,count(*) AS repayments$o$,
 $n$sum("Interest Paid"::numeric+"Late Charge Paid"::numeric) AS interest,count(*) AS repayments -- R118: profit is interest plus late charge$n$,
 $o$sum(coalesce("Principal Paid"::numeric,0)+coalesce("Interest Paid"::numeric,0)) paid$o$,
 $n$sum(coalesce("Principal Paid"::numeric,0)+coalesce("Interest Paid"::numeric,0)+"Late Charge Paid"::numeric) paid$n$,
 $o$coalesce(c."Principal Due"::numeric,0)+coalesce(c."Interest Due"::numeric,0) due,$o$,
 $n$coalesce(c."Principal Due"::numeric,0)+coalesce(c."Interest Due"::numeric,0)+c."Late Charge Due"::numeric due,$n$,
 $o$SELECT c."Row ID",cp.d,coalesce(c."Principal Due"::numeric,0)+coalesce(c."Interest Due"::numeric,0),cp.paid$o$,
 $n$SELECT c."Row ID",cp.d,coalesce(c."Principal Due"::numeric,0)+coalesce(c."Interest Due"::numeric,0)+c."Late Charge Due"::numeric,cp.paid$n$]);

SELECT pg_temp.v132_patch('public.partner_net_profit(text)',ARRAY[
 $o$SELECT coalesce(sum(round(r."Interest Paid"::numeric*CASE$o$,
 $n$SELECT coalesce(sum(round((r."Interest Paid"::numeric+r."Late Charge Paid"::numeric) /* R118 */*CASE$n$]);

-- 5o. Push content v3: v2 plus late_charge_amount, the late part of a posted payment's repayments (0 when none; NULL for
-- other sources). V99 boundary: the notify owner's pinned definer, EXECUTE only for the dispatcher. v1 and v2 stay.
CREATE FUNCTION public.pwa_notify_content_v3(delivery uuid, generation bigint) RETURNS TABLE(found boolean, event_type text, language text, borrower_name text, amount numeric, rebate_amount numeric, rebate_payee text, rebate_payable numeric, payment_method text, rebate_loan text, late_charge_amount numeric)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $_$
BEGIN
 PERFORM public.pwa_worker_guard_v1('dispatch');
 RETURN QUERY SELECT src.source_found,
  -- A chat reply carries its outcome ('chat.reply:ok' / 'chat.reply:failed', from source_version 'ok:<message>').
  CASE WHEN e.event_type='chat.reply' THEN 'chat.reply:'||split_part(e.source_version,':',1) ELSE e.event_type END,
  CASE WHEN recipient."Language Preference"='ไทย' THEN 'th' ELSE 'en' END::text,
  -- Chat: the thread title. Thai: the Thai name. English: the English name only ("Description"); none when blank.
  CASE WHEN e.source_kind='chat' THEN src.source_title WHEN recipient."Language Preference"='ไทย' THEN b."Borrower Name" ELSE nullif(btrim(b."Description",E' \t\r\n\f\v'),'') END,
  src.source_amount,
  -- R111: a closed loan's referral rebate, its payee (the v1 name rule) and the part not settled by offset
  rb.rebate_amount,
  -- (an English recipient falls back to the Thai name when the referrer has no English name: the line names a payee).
  CASE WHEN rb.rebate_amount IS NULL THEN NULL WHEN recipient."Language Preference"='ไทย' THEN pb."Borrower Name" ELSE coalesce(nullif(btrim(pb."Description",E' \t\r\n\f\v'),''),pb."Borrower Name") END,
  rb.rebate_payable,
  -- R111: a posted payment's method, and for a Referral Rebate Offset the closed loan whose rebate it is (the push then
  -- reads as a rebate offset, not as cash received from the referrer).
  src.payment_method,
  (SELECT x."Ref Related Loan" FROM public."Business Expenses" x WHERE e.source_kind='payment' AND x."Ref Offset Payment"=e.source_id ORDER BY x."Row ID" COLLATE "C" LIMIT 1),
  -- R118: the late-charge part of the payment.
  CASE WHEN e.source_kind='payment' THEN (SELECT coalesce(sum(y."Late Charge Paid"::numeric),0) FROM public."Repayments" y WHERE y."Ref Payment"=e.source_id) END
 FROM public.pwa_notification_deliveries d JOIN public.pwa_notification_events e ON e.event_id=d.event_id
 LEFT JOIN public."Partners" recipient ON recipient."Row ID"=d.recipient_partner_id
 LEFT JOIN LATERAL (
  SELECT true AS source_found,p."Ref Borrower" AS borrower_id,p."Amount Received"::numeric AS source_amount,NULL::text AS source_title,p."Payment Method" AS payment_method FROM public."Payments" p WHERE e.source_kind='payment' AND p."Row ID"=e.source_id
  UNION ALL
  SELECT true,l."Ref Borrowers",l."Principal Amount"::numeric,NULL::text,NULL::text FROM public."Loans" l WHERE e.source_kind='loan' AND l."Row ID"=e.source_id
  UNION ALL
  SELECT true,NULL::text,NULL::numeric,t.title,NULL::text FROM public.pwa_chat_threads t WHERE e.source_kind='chat' AND t.id::text=e.source_id AND t.partner_id=d.recipient_partner_id
 ) source_row ON true
 CROSS JOIN LATERAL (SELECT coalesce(source_row.source_found,false) AS source_found,source_row.borrower_id,source_row.source_amount,source_row.source_title,source_row.payment_method) src
 LEFT JOIN public."Borrowers" b ON b."Row ID"=src.borrower_id
 LEFT JOIN LATERAL (
  SELECT x."Amount"::numeric AS rebate_amount,x."Ref Payee Borrower" AS payee_id,x."Amount"::numeric-coalesce(o."Amount Received"::numeric,0) AS rebate_payable
  FROM public."Business Expenses" x LEFT JOIN public."Payments" o ON o."Row ID"=x."Ref Offset Payment"
  WHERE x."Source Type"='Referral Rebate' AND ((e.event_type='loan.closed' AND e.source_kind='loan' AND x."Ref Related Loan"=e.source_id)
   -- R111 V124: the payment that closed a referred loan carries that loan's rebate (its "Payment received" push).
   OR (e.event_type='payment.posted' AND e.source_kind='payment' AND x."Ref Related Loan" IN (SELECT y."Row ID" FROM public."Loans" y WHERE y."Ref Closing Payment"=e.source_id)))
  ORDER BY x."Row ID" COLLATE "C" LIMIT 1
 ) rb ON true
 LEFT JOIN public."Borrowers" pb ON pb."Row ID"=rb.payee_id
 WHERE d.delivery_id=$1 AND d.lease_generation=$2 AND d.state='leased' AND d.lease_expires_at>clock_timestamp();
END $_$;

DO $notify$
DECLARE suffix text:=CASE current_database() WHEN 'loan_manager_prod' THEN 'prod' ELSE 'dev' END; notify_owner text; dispatcher text; grantee text;
BEGIN
 notify_owner:='mw_notify_owner_'||suffix; dispatcher:='mw_notify_dispatch_'||suffix;
 REVOKE ALL ON FUNCTION public.pwa_notify_content_v3(uuid,bigint) FROM PUBLIC;
 -- PROD's default privileges give mw_integration_agent EXECUTE on a function postgres creates (V103/V122): revoke them.
 FOR grantee IN SELECT DISTINCT pg_get_userbyid(a.grantee) FROM pg_proc p CROSS JOIN LATERAL aclexplode(p.proacl) a
   WHERE p.oid='public.pwa_notify_content_v3(uuid,bigint)'::regprocedure AND a.grantee<>0 AND a.grantee<>p.proowner LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION public.pwa_notify_content_v3(uuid,bigint) FROM %I',grantee);
 END LOOP;
 COMMENT ON FUNCTION public.pwa_notify_content_v3(uuid,bigint) IS 'mw-access:governance fixed notification boundary; explicit capability only';
 EXECUTE format('GRANT EXECUTE ON FUNCTION public.pwa_notify_content_v3(uuid,bigint) TO %I',dispatcher);
 EXECUTE format('ALTER FUNCTION public.pwa_notify_content_v3(uuid,bigint) OWNER TO %I',notify_owner);
 IF NOT (SELECT prosecdef AND pg_get_userbyid(proowner)=notify_owner AND 'search_path=pg_catalog, public'=ANY(proconfig) FROM pg_proc WHERE oid='public.pwa_notify_content_v3(uuid,bigint)'::regprocedure)
  OR EXISTS(SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(p.proacl) a WHERE p.oid='public.pwa_notify_content_v3(uuid,bigint)'::regprocedure AND a.privilege_type='EXECUTE' AND a.grantee NOT IN (p.proowner,dispatcher::regrole))
  OR NOT has_function_privilege(dispatcher,'public.pwa_notify_content_v3(uuid,bigint)','EXECUTE') THEN
  RAISE EXCEPTION 'V132: pwa_notify_content_v3 must be the notify owner''s pinned definer executable only by %',dispatcher; END IF;
END $notify$;

-- 5p. Notification history text v2: v1 plus "lateChargeAmount", the late part of a posted payment, so a history row
-- reads like its push (Echo LC-PUSH-1). Same boundary as v1 (V103): the notify owner's pinned definer, EXECUTE only for
-- the notify API role; v1 stays for an API image before R118.
CREATE FUNCTION public.pwa_notify_history_content_v2(actor jsonb, events uuid[]) RETURNS TABLE("eventId" uuid, found boolean, "eventType" text, language text, "borrowerName" text, amount numeric, "lateChargeAmount" numeric)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
DECLARE partner text:=public.pwa_notify_actor_v1(actor);
BEGIN
 IF events IS NULL OR cardinality(events)>26 THEN RAISE EXCEPTION 'invalid_request'; END IF;
 RETURN QUERY SELECT e.event_id,src.source_found,
  CASE WHEN e.event_type='chat.reply' THEN 'chat.reply:'||split_part(e.source_version,':',1) ELSE e.event_type END,
  CASE WHEN recipient."Language Preference"='ไทย' THEN 'th' ELSE 'en' END::text,
  CASE WHEN e.source_kind='chat' THEN src.source_title WHEN recipient."Language Preference"='ไทย' THEN b."Borrower Name" ELSE nullif(btrim(b."Description",E' \t\r\n\f\v'),'') END,
  src.source_amount,
  -- R118: the late-charge part of the payment.
  CASE WHEN e.source_kind='payment' THEN (SELECT coalesce(sum(y."Late Charge Paid"::numeric),0) FROM public."Repayments" y WHERE y."Ref Payment"=e.source_id) END
 FROM public.pwa_notification_events e
 LEFT JOIN public."Partners" recipient ON recipient."Row ID"=partner
 LEFT JOIN LATERAL (
  SELECT true AS source_found,p."Ref Borrower" AS borrower_id,p."Amount Received"::numeric AS source_amount,NULL::text AS source_title FROM public."Payments" p WHERE e.source_kind='payment' AND p."Row ID"=e.source_id
  UNION ALL
  SELECT true,l."Ref Borrowers",l."Principal Amount"::numeric,NULL::text FROM public."Loans" l WHERE e.source_kind='loan' AND l."Row ID"=e.source_id
  UNION ALL
  SELECT true,NULL::text,NULL::numeric,t.title FROM public.pwa_chat_threads t WHERE e.source_kind='chat' AND t.id::text=e.source_id AND t.partner_id=partner
 ) source_row ON true
 CROSS JOIN LATERAL (SELECT coalesce(source_row.source_found,false) AS source_found,source_row.borrower_id,source_row.source_amount,source_row.source_title) src
 LEFT JOIN public."Borrowers" b ON b."Row ID"=src.borrower_id
 WHERE e.event_id=ANY(events) AND EXISTS(SELECT 1 FROM public.pwa_notification_deliveries d WHERE d.event_id=e.event_id AND d.recipient_partner_id=partner);
END $$;

DO $history$
DECLARE suffix text:=CASE current_database() WHEN 'loan_manager_prod' THEN 'prod' ELSE 'dev' END; notify_owner text; api text; grantee text;
BEGIN
 notify_owner:='mw_notify_owner_'||suffix; api:='mw_notify_api_'||suffix;
 REVOKE ALL ON FUNCTION public.pwa_notify_history_content_v2(jsonb,uuid[]) FROM PUBLIC;
 FOR grantee IN SELECT DISTINCT pg_get_userbyid(a.grantee) FROM pg_proc p CROSS JOIN LATERAL aclexplode(p.proacl) a
   WHERE p.oid='public.pwa_notify_history_content_v2(jsonb,uuid[])'::regprocedure AND a.grantee<>0 AND a.grantee<>p.proowner LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION public.pwa_notify_history_content_v2(jsonb,uuid[]) FROM %I',grantee);
 END LOOP;
 COMMENT ON FUNCTION public.pwa_notify_history_content_v2(jsonb,uuid[]) IS 'mw-access:governance fixed notification boundary; explicit capability only';
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=api) THEN EXECUTE format('GRANT EXECUTE ON FUNCTION public.pwa_notify_history_content_v2(jsonb,uuid[]) TO %I',api); END IF;
 EXECUTE format('ALTER FUNCTION public.pwa_notify_history_content_v2(jsonb,uuid[]) OWNER TO %I',notify_owner);
 IF NOT (SELECT prosecdef AND pg_get_userbyid(proowner)=notify_owner AND 'search_path=pg_catalog, public'=ANY(proconfig) FROM pg_proc WHERE oid='public.pwa_notify_history_content_v2(jsonb,uuid[])'::regprocedure)
  OR EXISTS(SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(p.proacl) a WHERE p.oid='public.pwa_notify_history_content_v2(jsonb,uuid[])'::regprocedure AND a.privilege_type='EXECUTE'
   AND a.grantee<>p.proowner AND pg_get_userbyid(a.grantee)<>api) THEN
  RAISE EXCEPTION 'V132: pwa_notify_history_content_v2 must be the notify owner''s pinned definer executable only by %',api; END IF;
END $history$;

-- The two dropped and created readers get their previous ACL and comment back (a postgres-created function also carries
-- PROD's default-privilege EXECUTE for mw_integration_agent, which is revoked unless it was there before).
DO $acl$
DECLARE o record; g record; new_oid oid;
BEGIN
 FOR o IN SELECT * FROM v132_routines WHERE NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=v132_routines.old_oid) LOOP
  new_oid:=o.routine::regprocedure;
  FOR g IN SELECT DISTINCT a.grantee FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid=new_oid AND a.grantee<>p.proowner LOOP
   EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %s',o.routine,CASE WHEN g.grantee=0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(g.grantee)) END);
  END LOOP;
  FOR g IN SELECT DISTINCT a.grantee FROM aclexplode(o.effective) a WHERE a.grantee<>(SELECT proowner FROM pg_proc WHERE oid=new_oid) AND a.privilege_type='EXECUTE' LOOP
   EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO %s',o.routine,CASE WHEN g.grantee=0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(g.grantee)) END);
  END LOOP;
  IF o.comment IS NOT NULL THEN EXECUTE format('COMMENT ON FUNCTION %s IS %L',o.routine,o.comment); END IF;
 END LOOP;
END $acl$;

-- Self-check.
DO $check$
DECLARE bad text; n integer;
BEGIN
 -- Routines: owner, effective privileges, security, volatility and configuration unchanged; comments unchanged except the
 -- two rebate routines (owner decision of 3 November 2026: "interest and late charges").
 SELECT string_agg(o.routine,', '),count(*) INTO bad,n FROM v132_routines o JOIN pg_proc p ON p.oid=o.routine::regprocedure
  WHERE pg_get_userbyid(p.proowner)<>o.owner OR p.prosecdef<>o.definer OR p.provolatile<>o.volatile OR p.proconfig IS DISTINCT FROM o.config
   OR (o.routine NOT IN ('public.create_referral_rebate(text)','public.pwa_referral_rebate_projection_v1(text,jsonb)') AND obj_description(p.oid,'pg_proc') IS DISTINCT FROM o.comment)
   OR (SELECT array_agg(a.grantee::text||':'||a.privilege_type ORDER BY a.grantee,a.privilege_type) FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee<>p.proowner)
    IS DISTINCT FROM (SELECT array_agg(a.grantee::text||':'||a.privilege_type ORDER BY a.grantee,a.privilege_type) FROM aclexplode(o.effective) a WHERE a.grantee<>p.proowner);
 IF bad IS NOT NULL THEN RAISE EXCEPTION 'V132 changed the owner, privileges, attributes or comment of %',bad; END IF;
 IF (SELECT count(*) FROM v132_routines)<>(SELECT count(*) FROM v132_routines o JOIN pg_proc p ON p.oid=o.routine::regprocedure) THEN RAISE EXCEPTION 'V132: a replaced routine is missing'; END IF;
 -- Every in-place patch carries the R118 marker (the restated bodies are proven by the tests).
 SELECT string_agg(r,', ') INTO bad FROM unnest(ARRAY['public.pwa_submit_operation_v2(text)','public.post_loan_default(public."Loans",date,text,numeric,boolean)',
   'public.undo_loan_default(public."Loans")','public.payment_crud_finish_core_v83(public."Payments",public."Payments",text)','public.quick_payment_request()',
   'public.attach_payment_receipt_evidence(text,text,text,timestamp with time zone,jsonb,uuid,text)','public.reallocate_payment_interest_audited(uuid,text)',
   'public.pwa_apply_payment_v2(text)','public.create_referral_rebate(text)','public.pwa_referral_rebate_projection_v1(text,jsonb)',
   'public.pwa_submit_selected_charges_v1(text)','public.pwa_submit_agent_receipt_v1(text)','public.pwa_agent_receipt_status_v1(uuid,text,text)',
   'public.pwa_payment_correction_text_v2(jsonb)','public.loan_close_calculation_v83(text,date,text)','public.pwa_apply_loan_close_v2(text)',
   'public.pwa_pay_forward_plan_v1(text,numeric,date,jsonb)','public.refresh_daily_analytics_scoped(date,date,text[])','public.partner_net_profit(text)']) r
  WHERE position('R118' IN pg_get_functiondef(r::regprocedure))=0;
 IF bad IS NOT NULL THEN RAISE EXCEPTION 'V132: not patched: %',bad; END IF;
 IF position($s$'11'::jsonb$s$ IN pg_get_functiondef('public.pwa_submit_selected_charges_v1(text)'::regprocedure))=0
  OR position($s$'11'$s$ IN pg_get_functiondef('public.pwa_effective_payment_plan_v2(text)'::regprocedure))=0 THEN RAISE EXCEPTION 'V132: schemaVersion 11 is not accepted'; END IF;
 -- Views: owner, privileges, options and comments unchanged; every existing column in place with its type; exactly the
 -- listed columns appended.
 SELECT string_agg(o.relation,', ') INTO bad FROM v132_views o JOIN pg_class c ON c.oid=o.relid
  WHERE pg_get_userbyid(c.relowner)<>o.owner OR coalesce(c.relacl::text,'')<>o.acl OR coalesce(c.reloptions::text,'')<>o.options
   OR coalesce(obj_description(c.oid,'pg_class'),'')<>o.comment
   OR (SELECT coalesce(array_agg(coalesce(d.description,'') ORDER BY d.objsubid),'{}') FROM pg_description d
       WHERE d.objoid=c.oid AND d.classoid='pg_class'::regclass AND d.objsubid>0) IS DISTINCT FROM o.column_comments
   OR (SELECT array_agg(a.attname::text||':'||format_type(a.atttypid,a.atttypmod) ORDER BY a.attnum) FROM pg_attribute a
       WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped) IS DISTINCT FROM o.columns||o.appended;
 IF bad IS NOT NULL THEN RAISE EXCEPTION 'V132 changed the owner, privileges, options, comments or columns of %',bad; END IF;
 -- Columns: types, defaults, nullability and comments.
 IF (SELECT array_agg(format('%s.%s:%s:%s:%s',a.attrelid::regclass,a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,coalesce(pg_get_expr(d.adbin,d.adrelid),'')) ORDER BY a.attrelid::regclass::text,a.attnum)
     FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
     WHERE a.attrelid IN ('public."Charges"'::regclass,'public."Payment Allocations"'::regclass,'public."Repayments"'::regclass) AND a.attname LIKE '%Late Charge%' AND NOT a.attisdropped
       AND col_description(a.attrelid,a.attnum) LIKE 'R118:%')
    IS DISTINCT FROM ARRAY['"Charges".Late Charge Due:money:t:0','"Charges".Late Charge Paid:numeric:f:','"Charges".Late Charge Remaining:numeric:f:',
     '"Payment Allocations".Allocated Late Charge:money:t:0','"Repayments".Late Charge Paid:money:t:0'] THEN
  RAISE EXCEPTION 'V132: the late charge columns differ from the design'; END IF;
 IF EXISTS(SELECT 1 FROM public."Charges" WHERE "Late Charge Paid" IS NULL OR "Late Charge Remaining" IS NULL) THEN RAISE EXCEPTION 'V132: a charge lacks its late charge values'; END IF;
 IF NOT has_column_privilege('mw_notify_owner_'||CASE current_database() WHEN 'loan_manager_prod' THEN 'prod' ELSE 'dev' END,'public."Repayments"','Late Charge Paid','SELECT') THEN
  RAISE EXCEPTION 'V132: the notify owner cannot read the late part of a payment'; END IF;
END $check$;
