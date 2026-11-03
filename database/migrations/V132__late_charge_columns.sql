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
--     late_charge_amount (v1 and v2 stay for older dispatchers).
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
 IF to_regprocedure('public.pwa_notify_content_v3(uuid,bigint)') IS NOT NULL THEN problems:=problems||'V132: pwa_notify_content_v3 already exists'::text; END IF;
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
  'public.undo_loan_default(public."Loans")','public.close_payment_loans(text)','public.payment_crud_finish_core_v83(public."Payments",public."Payments",text)'
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
  ('public.olap_repayments_analytics',ARRAY['Late Charge Paid:money'])
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

-- @@SECTION3@@
