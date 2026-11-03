-- R118 V132 late charges (disposable cluster only; synthetic rows; everything rolls back).
-- Charge operations run as the journal owner (SET ROLE, as pwa_apply_charge_v2 checks current_user); the payment commands run as the
-- DEV command IAM user (SET SESSION AUTHORIZATION, as pwa_submit_selected_charges_v1 checks session_user); setup and checks run as postgres.
-- Proves, on behaviour and not on field order:
--  0. (pre-target route only: Test-LateCharges-Before.sql at V131) the V131 state is unchanged: the six income relations row by row
--     with the new column last and 0, every routine/view/table owner, ACL, security and comment, every trigger, a V131 default undoes;
--  1. derived columns: vc_charge_values lp/lr, "Amount Remaining" = principal + interest + late, status, loan and borrower totals,
--     the "cannot be less than posted payments" guard for late, a late-only charge, waive down to paid, all-zero rule, fd6 refusal;
--  2. order interest, late charge, principal on both engines (legacy Single Partial, explicit v11): same allocation and repayment columns;
--  3. commands: v11 with empty lists and with pay-forward lists, v10 on a late charge (selection_unavailable), 6-key v8 on a late charge
--     (late left unpaid), a v10 control without late, a correction with 8-key late-0 lines against 6-key provenance is not a repost;
--  4. nothing dated moved, against identical twins whose only difference is a late charge of 50: generate_due_charges for ten dates and the
--     schedule anchor, the Loan Close quote (mutation identical, amount + 50, lines carry late 50), the pay-forward plans (forward, principal,
--     settle), the next bookable / projected charge, the booked pay-forward charges and the next generated charge;
--  5. default write-off and undo with late paid and unpaid (evidence keys, derived-column and undo guards, paid-today refusal);
--  6. income: a payment with no late moves gross and net only; one with late 50 moves gross, net, partner shares and the memo lines by 50,
--     "Interest Paid" stays interest only; column positions of the six relations; referral rebate counts late (35 vs 30, projection = booking, cap 1000); notify content v3 and grants.
-- Figures of section 6 are deltas from the state before the fixture (other suites may leave committed rows).
\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
 IF current_database()<>'loan_manager_dev' OR inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet THEN RAISE EXCEPTION 'Disposable loopback database required'; END IF;
END $$;
SET LOCAL TIME ZONE 'Asia/Bangkok';
CREATE FUNCTION pg_temp.lc_assert(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAILED: %',label; END IF; END $$;

-- A routine ACL as a sorted list; no ACL means the default (owner and PUBLIC execute).
CREATE FUNCTION pg_temp.lc_aclnorm(acl text,owner text) RETURNS text LANGUAGE sql STABLE AS $f$
 SELECT string_agg(x,',' ORDER BY x) FROM unnest(string_to_array(trim(both '{}' from coalesce(acl,owner||'=X/'||owner||',=X/'||owner)),',')) x WHERE x NOT LIKE 'mw_integration_agent=%' $f$;
-- (The agent's EXECUTE reaches routines through PROD's default privilege, which the runner's last step removes after the V131 snapshot; Test-ProdDefaultPrivileges owns that.)
-- 0. The V131 state against V132 (needs the committed fixture of Test-LateCharges-Before.sql; before any row of this file is inserted).
DO $$
DECLARE r text;before_cols text[];now_cols text[];extra text;snap date;bad text;n integer;
BEGIN
 IF to_regnamespace('lc_before') IS NULL THEN
  RAISE NOTICE 'NOT RUN: section 0 (V131 before/after) needs the pre-target route (Test-LateCharges-Before.sql at V131); the full-chain run proves sections 1 to 6 only.';
  RETURN;
 END IF;
 SELECT snapshot_day INTO snap FROM lc_before.relation_columns LIMIT 1;
 IF snap IS DISTINCT FROM (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date THEN
  RAISE NOTICE 'NOT RUN: section 0 relation figures (snapshot day % is not today); rerun the pre-target route', snap;
 ELSE
  FOR r,extra IN SELECT * FROM (VALUES ('"Cash Dashboard"',NULL),('olap_portfolio_summary',NULL),('reporting_income_statement','Late Charges Received MTD'),
    ('reporting_income_monthly','Late Charges Received'),('reporting_income_daily','Late Charges Received'),('reporting_income_events','Late Charges Received')) v(r,extra) LOOP
   SELECT columns INTO before_cols FROM lc_before.relation_columns WHERE rel=r;
   SELECT array_agg(attname::text ORDER BY attnum) INTO now_cols FROM pg_attribute WHERE attrelid=('public.'||r)::regclass AND attnum>0 AND NOT attisdropped;
   IF now_cols IS DISTINCT FROM (before_cols||coalesce(string_to_array(extra,E'\x01'),ARRAY[]::text[])) THEN
    RAISE EXCEPTION 'FAILED: % columns: before %, now %',r,before_cols,now_cols; END IF;
   IF extra IS NOT NULL THEN
    EXECUTE format('SELECT count(*) FROM public.%s v WHERE (to_jsonb(v)->>%L)::numeric IS DISTINCT FROM 0',r,extra) INTO n;
    IF n<>0 THEN RAISE EXCEPTION 'FAILED: % %: with no late charge the new column is 0 on every row (% rows differ)',r,extra,n; END IF;
    IF (SELECT format_type(atttypid,atttypmod) FROM pg_attribute WHERE attrelid=('public.'||r)::regclass AND attname=extra)<>'numeric' THEN
     RAISE EXCEPTION 'FAILED: % %: numeric expected',r,extra; END IF;
   END IF;
   -- Row for row: the old keys equal the V131 rows (both directions), the new key removed.
   EXECUTE format('SELECT count(*) FROM (SELECT (to_jsonb(v)-%L) x FROM public.%s v EXCEPT SELECT row_value FROM lc_before.relation_rows WHERE rel=%L) q',coalesce(extra,'-'),r,r) INTO n;
   IF n<>0 THEN RAISE EXCEPTION 'FAILED: % has % rows that differ from V131',r,n; END IF;
   EXECUTE format('SELECT count(*) FROM (SELECT row_value FROM lc_before.relation_rows WHERE rel=%L EXCEPT SELECT (to_jsonb(v)-%L) FROM public.%s v) q',r,coalesce(extra,'-'),r) INTO n;
   IF n<>0 THEN RAISE EXCEPTION 'FAILED: % lost % V131 rows',r,n; END IF;
   EXECUTE format('SELECT count(*) FROM public.%s',r) INTO n;
   IF n<>(SELECT count(*) FROM lc_before.relation_rows WHERE rel=r) THEN RAISE EXCEPTION 'FAILED: % row count moved',r; END IF;
  END LOOP;
 END IF;
 -- Routines: every V131 signature still exists with the same owner, ACL, security, search_path and comment (the two DROP and CREATE
 -- readers included: vc_charge_values and payment_charge_balances).
 SELECT string_agg(b.signature||' ('||CASE WHEN a.signature IS NULL THEN 'missing' ELSE 'changed' END||')',', ') INTO bad
 FROM lc_before.routines b LEFT JOIN (SELECT p.oid::regprocedure::text AS signature,pg_get_userbyid(p.proowner) AS owner,pg_temp.lc_aclnorm(p.proacl::text,pg_get_userbyid(p.proowner)) AS acl,p.prosecdef AS security_definer,
   p.proconfig::text AS config,obj_description(p.oid,'pg_proc') AS comment FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public') a USING(signature)
 WHERE a.signature IS NULL OR (a.owner,a.acl,a.security_definer,a.config) IS DISTINCT FROM (b.owner,pg_temp.lc_aclnorm(b.acl,b.owner),b.security_definer,b.config)
  -- The two rebate functions' comments name R118 (documented change); every other comment is unchanged.
  OR (b.signature NOT IN ('create_referral_rebate(text)','pwa_referral_rebate_projection_v1(text,jsonb)') AND a.comment IS DISTINCT FROM b.comment)
  OR (b.signature IN ('create_referral_rebate(text)','pwa_referral_rebate_projection_v1(text,jsonb)') AND a.comment NOT LIKE '%R118%');
 IF bad IS NOT NULL THEN RAISE EXCEPTION 'FAILED: routine owner/ACL/security/comment drift: %',bad; END IF;
 SELECT string_agg(b.name,', ') INTO bad FROM lc_before.views b LEFT JOIN (SELECT c.oid::regclass::text AS name,pg_get_userbyid(c.relowner) AS owner,c.relacl::text AS acl,
   c.reloptions::text AS options,obj_description(c.oid,'pg_class') AS comment FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('v','m')) a USING(name)
 WHERE a.name IS NULL OR (a.owner,a.acl,a.options,a.comment) IS DISTINCT FROM (b.owner,b.acl,b.options,b.comment);
 IF bad IS NOT NULL THEN RAISE EXCEPTION 'FAILED: view owner/ACL/options/comment drift: %',bad; END IF;
 SELECT string_agg(b.name,', ') INTO bad FROM lc_before.tables b LEFT JOIN (SELECT c.oid::regclass::text AS name,pg_get_userbyid(c.relowner) AS owner,c.relacl::text AS acl
   FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p')) a USING(name)
 WHERE a.name IS NULL OR (a.owner,a.acl) IS DISTINCT FROM (b.owner,b.acl);
 IF bad IS NOT NULL THEN RAISE EXCEPTION 'FAILED: table owner/ACL drift: %',bad; END IF;
 -- No trigger added, dropped, renamed, re-timed or re-pointed (Test-TriggerOrder holds the order contract).
 IF EXISTS(SELECT 1 FROM lc_before.triggers b FULL JOIN (SELECT c.relname::text AS relation,t.tgname::text AS trigger_name,t.tgtype::integer AS trigger_type,t.tgenabled::text AS enabled,
   t.tgdeferrable AS is_deferrable,t.tginitdeferred AS is_initially_deferred,pg_get_triggerdef(t.oid) AS definition FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
   JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND NOT t.tgisinternal) a USING(relation,trigger_name)
   WHERE a.trigger_name IS NULL OR b.trigger_name IS NULL OR (a.trigger_type,a.enabled,a.is_deferrable,a.is_initially_deferred,a.definition) IS DISTINCT FROM (b.trigger_type,b.enabled,b.is_deferrable,b.is_initially_deferred,b.definition)) THEN
  RAISE EXCEPTION 'FAILED: a user trigger changed'; END IF;
END $$;
-- A loan defaulted at V131 (evidence without original_late) still undoes, and the late columns stay 0.
DO $$
BEGIN
 IF to_regnamespace('lc_before') IS NULL THEN RETURN; END IF;
 UPDATE public."Loans" SET "Defaulted"=false WHERE "Row ID"='LCB-DF';
 PERFORM pg_temp.lc_assert((SELECT "Principal Due"::numeric=20 AND "Interest Due"::numeric=10 AND "Late Charge Due"::numeric=0 AND "Late Charge Remaining"::numeric=0 AND "Notes" IS NULL
   FROM public."Charges" WHERE "Row ID"='LCB-DF-b'),'V131 default evidence without original_late undoes: components restored, late 0, note cleared');
 PERFORM pg_temp.lc_assert((SELECT "Principal Due"::numeric=20 AND "Interest Due"::numeric=10 AND "Late Charge Due"::numeric=0 AND "Notes"='Legacy note' FROM public."Charges" WHERE "Row ID"='LCB-DF-a'),
  'V131 default undo restores the paid charge and its original note');
 PERFORM pg_temp.lc_assert((SELECT "Default Loss Amount" IS NULL AND "Loan Status"='ยังไม่ปิดยอด' FROM public."Loans" WHERE "Row ID"='LCB-DF')
   AND NOT EXISTS(SELECT 1 FROM public."Repayments" WHERE "Ref Loans"='LCB-DF' AND starts_with("Row ID",'df10:')),'V131 default undone');
 UPDATE public."Loans" SET "Defaulted"=true,"Close Date"=current_date,"Closed By"='synthetic@example.invalid' WHERE "Row ID"='LCB-DF';
 PERFORM pg_temp.lc_assert((SELECT "Late Charge Due"::numeric=0 AND "Notes" LIKE '%original_late%' FROM public."Charges" WHERE "Row ID"='LCB-DF-b'),'a default after V132 writes original_late (0)');
END $$;

\ir Test-CashAccountFixtures.sql
-- 1. Schema: the five columns (types, defaults, NOT NULL, comments) and the notify owner's source columns.
DO $$
BEGIN
 PERFORM pg_temp.lc_assert((SELECT bool_and(c.ok) FROM (VALUES
   ((SELECT format_type(atttypid,atttypmod)='money' AND attnotnull AND pg_get_expr(d.adbin,d.adrelid)~'^0' FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid='public."Charges"'::regclass AND a.attname='Late Charge Due')),
   ((SELECT format_type(atttypid,atttypmod)='numeric' AND NOT attnotnull FROM pg_attribute WHERE attrelid='public."Charges"'::regclass AND attname='Late Charge Paid')),
   ((SELECT format_type(atttypid,atttypmod)='numeric' AND NOT attnotnull FROM pg_attribute WHERE attrelid='public."Charges"'::regclass AND attname='Late Charge Remaining')),
   ((SELECT format_type(atttypid,atttypmod)='money' AND attnotnull AND pg_get_expr(d.adbin,d.adrelid)~'^0' FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid='public."Payment Allocations"'::regclass AND a.attname='Allocated Late Charge')),
   ((SELECT format_type(atttypid,atttypmod)='money' AND attnotnull AND pg_get_expr(d.adbin,d.adrelid)~'^0' FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid='public."Repayments"'::regclass AND a.attname='Late Charge Paid'))
  ) c(ok)),'the five late charge columns have the expected types, NOT NULL and default 0');
 PERFORM pg_temp.lc_assert((SELECT count(*)=5 FROM pg_attribute a WHERE a.attnum>0 AND NOT a.attisdropped AND col_description(a.attrelid,a.attnum) IS NOT NULL
   AND ((a.attrelid='public."Charges"'::regclass AND a.attname IN ('Late Charge Due','Late Charge Paid','Late Charge Remaining'))
    OR (a.attrelid='public."Payment Allocations"'::regclass AND a.attname='Allocated Late Charge') OR (a.attrelid='public."Repayments"'::regclass AND a.attname='Late Charge Paid'))),'the five columns carry comments');
 PERFORM pg_temp.lc_assert(has_column_privilege('mw_notify_owner_dev','public."Repayments"','Late Charge Paid','SELECT')
   AND has_column_privilege('mw_notify_owner_dev','public."Repayments"','Ref Payment','SELECT'),'notify owner reads Repayments "Ref Payment" and "Late Charge Paid"');
END $$;

CREATE TEMP TABLE lc_day ON COMMIT DROP AS SELECT (transaction_timestamp() AT TIME ZONE 'Asia/Bangkok')::date AS d;
GRANT SELECT ON lc_day TO PUBLIC;
INSERT INTO public."Statistics"("Row ID") SELECT 'LC-ST' WHERE NOT EXISTS (SELECT 1 FROM public."Statistics");
INSERT INTO public."Partners"("Row ID","Partner Role") VALUES('LC-FUND','A');
INSERT INTO public."Partners"("Row ID","Partner Name","Partner Role","Login Email") VALUES('LC-ACT','Synthetic late charge actor','A','lc-actor@example.invalid');
INSERT INTO public."Cash Pool Contributions"("Row ID","Ref Partner","Contribution Date","Transaction Type","Amount")
 VALUES('LC-CAP','LC-FUND',(SELECT d FROM lc_day)-400,'Contribution',1000000::money);
INSERT INTO public."Borrowers"("Row ID","Borrower Name") VALUES
 ('LC-BGA','SYNTHETIC LC GENERATION A'),('LC-BGB','SYNTHETIC LC GENERATION B'),('LC-BD','SYNTHETIC LC DERIVED'),('LC-BF','SYNTHETIC LC FIRST DAY'),
 ('LC-BO','SYNTHETIC LC ORDER'),('LC-BC','SYNTHETIC LC COMMANDS'),('LC-BCV','SYNTHETIC LC V10 CONTROL'),('LC-BCA','SYNTHETIC LC CLOSE A'),('LC-BCB','SYNTHETIC LC CLOSE B'),
 ('LC-BPA','SYNTHETIC LC FORWARD A'),('LC-BPB','SYNTHETIC LC FORWARD B'),('LC-BQA','SYNTHETIC LC PRINCIPAL A'),('LC-BQB','SYNTHETIC LC PRINCIPAL B'),
 ('LC-BSA','SYNTHETIC LC SETTLE A'),('LC-BSB','SYNTHETIC LC SETTLE B'),('LC-BDF','SYNTHETIC LC DEFAULT'),('LC-BDG','SYNTHETIC LC DEFAULT GUARD'),
 ('LC-BI','SYNTHETIC LC INCOME'),('LC-BN','SYNTHETIC LC NOTIFY'),('LC-BK','SYNTHETIC LC CORRECTION'),('LC-RRA','SYNTHETIC LC REFERRER A'),('LC-RRB','SYNTHETIC LC REFERRER B'),('LC-RRC','SYNTHETIC LC REFERRER CAP');
INSERT INTO public."Borrowers"("Row ID","Borrower Name","Ref Referrer") VALUES('LC-BRA','SYNTHETIC LC REFERRED A','LC-RRA'),('LC-BRB','SYNTHETIC LC REFERRED B','LC-RRB'),('LC-BRC','SYNTHETIC LC REFERRED CAP','LC-RRC');
-- Loans are inserted with Auto Charge Enabled off (no first-day charge), then switched on, as Test-PayForward.sql does.
INSERT INTO public."Loans"("Ref Disbursed From Cash Account","Row ID","Ref Borrowers","Loan Date","Principal Amount","Loan Type","Loan Status","Auto Charge Enabled","Current Daily Interest","Interest Payment Interval","Defaulted")
 SELECT 'CI-LISA',v.id,v.b,(SELECT d FROM lc_day)+v.start,v.pa::money,'ดอกเบี้ยรายวัน','ยังไม่ปิดยอด',false,v.cdi::money,1,false FROM (VALUES
  ('LC-GA','LC-BGA',-3,1000,10),('LC-GB','LC-BGB',-3,1000,10),('LC-D1','LC-BD',-5,1000,10),('LC-F1','LC-BF',0,100,10),
  ('LC-O1','LC-BO',-3,1000,10),('LC-O2','LC-BO',-3,1000,10),('LC-C1','LC-BC',-3,1000,10),('LC-C2','LC-BCV',-3,1000,10),
  ('LC-CA','LC-BCA',-4,1000,10),('LC-CB','LC-BCB',-4,1000,10),('LC-PA','LC-BPA',-3,1000,10),('LC-PB','LC-BPB',-3,1000,10),
  ('LC-QA','LC-BQA',-3,1000,10),('LC-QB','LC-BQB',-3,1000,10),('LC-SA','LC-BSA',-3,100,1),('LC-SB','LC-BSB',-3,100,1),
  ('LC-DF','LC-BDF',-5,100,10),('LC-DG','LC-BDG',-5,100,10),('LC-I1','LC-BI',-5,1000,10),('LC-N1','LC-BN',-3,1000,10),('LC-K1','LC-BK',-3,1000,10),
  ('LC-RA','LC-BRA',-3,1000,100),('LC-RB','LC-BRB',-3,1000,100),('LC-RC','LC-BRC',-3,1000,100)) v(id,b,start,pa,cdi);
INSERT INTO public."Charges"("Row ID","Ref Loans","Charge Date","Principal Due","Interest Due")
 SELECT v.id,v.loan,(SELECT d FROM lc_day)+v.day,v.p::money,v.i::money FROM (VALUES
  ('LC-GA-today','LC-GA',0,0,10),('LC-GB-today','LC-GB',0,0,10),
  ('LC-D1-mix','LC-D1',-2,100,10),('LC-D1-w','LC-D1',-3,0,10),
  ('LC-O1-c','LC-O1',-1,200,100),('LC-O2-c','LC-O2',-1,200,100),
  ('LC-C1-c','LC-C1',0,0,10),('LC-C2-c','LC-C2',0,0,10),
  ('LC-CA-c1','LC-CA',-1,0,10),('LC-CA-c2','LC-CA',0,0,10),('LC-CB-c1','LC-CB',-1,0,10),('LC-CB-c2','LC-CB',0,0,10),
  ('LC-PA-today','LC-PA',0,0,10),('LC-PB-today','LC-PB',0,0,10),('LC-QA-today','LC-QA',0,0,10),('LC-QB-today','LC-QB',0,0,10),
  ('LC-SA-today','LC-SA',0,0,1),('LC-SB-today','LC-SB',0,0,1),
  ('LC-DF-paid','LC-DF',-3,20,10),('LC-DF-open','LC-DF',-2,20,10),
  ('LC-I1-c1','LC-I1',-2,0,10),('LC-I1-c2','LC-I1',-1,0,10),('LC-N1-c','LC-N1',-1,0,10),('LC-K1-c','LC-K1',-1,40,10),
  ('LC-RA-c','LC-RA',0,1000,300),('LC-RB-c','LC-RB',0,1000,300),('LC-RC-c','LC-RC',0,1000,10000)) v(id,loan,day,p,i);
UPDATE public."Loans" SET "Auto Charge Enabled"=true WHERE "Row ID" LIKE 'LC-%';

-- Operator grants, emulated and rolled back (as Test-PayForward.sql).
GRANT USAGE ON SCHEMA public TO mw_app_dev; GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO mw_app_dev; GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO mw_app_dev;
REVOKE INSERT,UPDATE,DELETE ON "Cash Ledger",pwa_payment_commands,r005_cash_cutover_sources,r008_cash_account_cutover,pwa_row_changes FROM mw_app_dev;
REVOKE USAGE,UPDATE ON SEQUENCE pwa_row_changes_seq_seq FROM mw_app_dev;
GRANT EXECUTE ON FUNCTION public.pwa_submit_selected_charges_v1(text) TO mw_app_dev;

-- Governed charge operations (journal owner). lc_op builds the canonical command of services/contracts/operation-command.mjs.
CREATE FUNCTION pg_temp.lc_owner_call(fn text,canonical text) RETURNS jsonb LANGUAGE plpgsql AS $f$
DECLARE r jsonb;
BEGIN
 EXECUTE 'SET LOCAL ROLE mw_app_dev_journal_owner';
 BEGIN EXECUTE format('SELECT public.%I(%L)',fn,canonical) INTO r;
 EXCEPTION WHEN OTHERS THEN EXECUTE 'RESET ROLE'; RAISE; END;
 EXECUTE 'RESET ROLE';
 RETURN r;
END $f$;
CREATE FUNCTION pg_temp.lc_actor() RETURNS jsonb LANGUAGE sql AS $f$
 SELECT jsonb_build_object('issuer','https://lc.invalid','subject','lc-owner','partnerId','LC-ACT','loginEmail','lc-actor@example.invalid') $f$;
CREATE FUNCTION pg_temp.lc_charge_op(op text,target text,inputs jsonb) RETURNS jsonb LANGUAGE sql AS $f$
 SELECT pg_temp.lc_owner_call('pwa_apply_charge_v2',jsonb_build_object('contractVersion',2,'requestId',gen_random_uuid()::text,'actor',pg_temp.lc_actor(),
  'command',jsonb_build_object('schemaVersion',1,'operation',op,'targetType','charge','targetId',target,
   'expectedVersion',CASE WHEN op='charge.create' THEN NULL ELSE public.pwa_charge_version_v2(target) END,'predecessorRequestId',NULL,'inputs',inputs),'receipt',NULL)::text) $f$;
CREATE FUNCTION pg_temp.lc_inputs(loan text,day date,p numeric,i numeric,late numeric,notes text) RETURNS jsonb LANGUAGE sql AS $f$
 SELECT jsonb_build_object('loanId',loan,'chargeDate',day::text,'principalDue',trim_scale(p)::text,'interestDue',trim_scale(i)::text,'lateChargeDue',trim_scale(late)::text,'notes',notes) $f$;
-- Set the late charge of an existing charge through charge.update (every other field as stored, the current version).
CREATE FUNCTION pg_temp.lc_setlate(target text,late numeric) RETURNS jsonb LANGUAGE sql AS $f$
 SELECT pg_temp.lc_charge_op('charge.update',target,pg_temp.lc_inputs(c."Ref Loans",c."Charge Date",c."Principal Due"::numeric,c."Interest Due"::numeric,late,c."Notes"))
 FROM public."Charges" c WHERE c."Row ID"=target $f$;
CREATE FUNCTION pg_temp.lc_create(target text,loan text,day date,p numeric,i numeric,late numeric) RETURNS jsonb LANGUAGE sql AS $f$
 SELECT pg_temp.lc_charge_op('charge.create',target,pg_temp.lc_inputs(loan,day,p,i,late,NULL)) $f$;
-- Expect a failure: by SQLSTATE (five characters) or by a fragment of the message.
CREATE FUNCTION pg_temp.lc_reject(expected text,stmt text) RETURNS void LANGUAGE plpgsql AS $f$
BEGIN
 BEGIN EXECUTE stmt;
 EXCEPTION WHEN OTHERS THEN
  IF SQLSTATE=expected OR SQLERRM LIKE '%'||expected||'%' THEN RETURN; END IF;
  RAISE EXCEPTION 'FAILED: expected % but got % (%) for %',expected,SQLSTATE,SQLERRM,stmt;
 END;
 RAISE EXCEPTION 'FAILED: expected rejection % for %',expected,stmt;
END $f$;
-- Legacy engine: one receipt posted through the Payments row (Single Partial / Single Full target one charge).
CREATE FUNCTION pg_temp.lc_legacy(id text,borrower text,charge text,amount numeric,method text DEFAULT 'Single Partial') RETURNS void LANGUAGE plpgsql AS $f$
BEGIN
 INSERT INTO public."Payments"("Ref Received By Cash Account","Row ID","Ref Borrower","Ref Target Charge","Amount Received","Payment Date","Allocation Method","Status")
  VALUES('CI-DAD',id,borrower,charge,amount::money,(SELECT d FROM lc_day),method,'Processing');
 IF (SELECT "Status" FROM public."Payments" WHERE "Row ID"=id) IS DISTINCT FROM 'Posted' THEN RAISE EXCEPTION 'FAILED: legacy payment % not posted',id; END IF;
 SET CONSTRAINTS vc_repayment_changed, vc_payment_changed, vc_borrower_changed IMMEDIATE;
END $f$;
-- What one payment wrote: allocation and repayment columns side by side.
CREATE FUNCTION pg_temp.lc_effects(payment text) RETURNS jsonb LANGUAGE sql AS $f$
 SELECT jsonb_build_object(
  'alloc',(SELECT jsonb_build_object('p',coalesce(sum("Allocated Principal"::numeric),0),'i',coalesce(sum("Allocated Interest"::numeric),0),'l',coalesce(sum("Allocated Late Charge"::numeric),0),'a',coalesce(sum("Allocated Amount"::numeric),0))
    FROM public."Payment Allocations" WHERE "Ref Payment"=payment),
  'paid',(SELECT jsonb_build_object('p',coalesce(sum("Principal Paid"::numeric),0),'i',coalesce(sum("Interest Paid"::numeric),0),'l',coalesce(sum("Late Charge Paid"::numeric),0))
    FROM public."Repayments" WHERE "Ref Payment"=payment)) $f$;
CREATE FUNCTION pg_temp.lc_norm(j jsonb,VARIADIC tokens text[]) RETURNS text LANGUAGE plpgsql IMMUTABLE AS $f$
DECLARE t text:=coalesce(j::text,'null');x text;
BEGIN FOREACH x IN ARRAY tokens LOOP t:=replace(t,x,'#'); END LOOP; RETURN t; END $f$;
CREATE FUNCTION pg_temp.lc_gen(loan text,from_day date,through date) RETURNS integer LANGUAGE plpgsql AS $f$
DECLARE n integer:=0;x date;
BEGIN FOR x IN SELECT generate_series(from_day,through,'1 day')::date LOOP n:=n+public.generate_due_charges(x,ARRAY[loan]); END LOOP; RETURN n; END $f$;

-- Submit the command held in a setting; a failure names the setting.
CREATE FUNCTION pg_temp.lc_submit(k text) RETURNS jsonb LANGUAGE plpgsql AS $f$
BEGIN RETURN public.pwa_submit_selected_charges_v1(current_setting(k));
EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'submit % failed: % (%) %',k,SQLERRM,SQLSTATE,current_setting(k); END $f$;
-- A plan without the figures that legitimately move by the late part: amount, dueTotal, the settle quote's payoff and planHash, and the lines.
CREATE FUNCTION pg_temp.lc_planstrip(p jsonb) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $f$
 SELECT (p-'allocations'-'amount'-'dueTotal')
  ||jsonb_build_object('options',coalesce((SELECT jsonb_agg(CASE WHEN o ? 'settlesWith' THEN jsonb_set(o,'{settlesWith}',(o->'settlesWith')-'payoff'-'planHash') ELSE o END) FROM jsonb_array_elements(p->'options') o),'[]'::jsonb),
   'principal',coalesce((SELECT jsonb_agg(x-'planHash'-'payoff'-'amount') FROM jsonb_array_elements(p->'principal') x),'[]'::jsonb)) $f$;
-- Payment command builders (canonical text, byte for byte as the SQL validator rebuilds it).
CREATE FUNCTION pg_temp.lc_q(v text) RETURNS text LANGUAGE sql IMMUTABLE AS $f$ SELECT to_json(v)::text $f$;
CREATE FUNCTION pg_temp.lc_line6(charge text,p int,i int,ep int,ei int,day date) RETURNS text LANGUAGE sql AS $f$
 SELECT '{"chargeId":'||pg_temp.lc_q(charge)||',"principal":"'||p||'","interest":"'||i||'","expectedPrincipalRemaining":"'||ep||'","expectedInterestRemaining":"'||ei||'","chargeDate":"'||day||'"}' $f$;
CREATE FUNCTION pg_temp.lc_line8(charge text,p int,i int,l int,ep int,ei int,el int,day date) RETURNS text LANGUAGE sql AS $f$
 SELECT '{"chargeId":'||pg_temp.lc_q(charge)||',"principal":"'||p||'","interest":"'||i||'","lateCharge":"'||l||'","expectedPrincipalRemaining":"'||ep||'","expectedInterestRemaining":"'||ei
  ||'","expectedLateChargeRemaining":"'||el||'","chargeDate":"'||day||'"}' $f$;
CREATE FUNCTION pg_temp.lc_cmd(version int,request text,borrower text,amount int,lines text,materialize text DEFAULT '[]',principal text DEFAULT '[]') RETURNS text LANGUAGE sql AS $f$
 SELECT '{"contractVersion":1,"command":{"schemaVersion":'||version||',"requestId":'||pg_temp.lc_q(request)||',"borrowerId":'||pg_temp.lc_q(borrower)||',"allocations":['||lines
  ||'],"cashAccountId":"CI-LISA","paymentDate":"'||(SELECT d FROM lc_day)||'","amountReceived":"'||amount||'","paymentMethod":"Bank Transfer","notes":null,"receiptId":null,"bankReference":null,"transferTime":null,"payerLines":null'
  ||CASE WHEN version>=10 THEN ',"materialize":'||materialize||',"principal":'||principal ELSE '' END
  ||'},"actor":{"issuer":"https://lc.invalid","subject":"lc-owner","partnerId":"LC-ACT","loginEmail":"lc-actor@example.invalid"},"receipt":null}' $f$;
-- A v11 (or v10) command built from the plan itself, as Test-PayForward.sql builds its v10.
CREATE FUNCTION pg_temp.lc_purpose(forward boolean,principal jsonb,loans jsonb) RETURNS jsonb LANGUAGE sql AS $f$
 SELECT jsonb_build_object('forward',forward,'principal',coalesce(principal,'[]'::jsonb),'loans',loans) $f$;
CREATE FUNCTION pg_temp.lc_plan(borrower text,amount int,purpose jsonb) RETURNS jsonb LANGUAGE sql AS $f$
 SELECT public.pwa_pay_forward_plan_v1(borrower,amount::numeric,(SELECT d FROM lc_day),purpose) $f$;
CREATE FUNCTION pg_temp.lc_plan_cmd(version int,request text,borrower text,amount int,purpose jsonb,header int DEFAULT NULL) RETURNS text LANGUAGE sql AS $f$
 WITH plan AS (SELECT pg_temp.lc_plan(borrower,amount,purpose) p)
 SELECT pg_temp.lc_cmd(version,request,borrower,coalesce(header,amount),
  coalesce((SELECT string_agg(CASE WHEN version>=11 THEN pg_temp.lc_line8(l->>'chargeId',(l->>'principal')::int,(l->>'interest')::int,(l->>'lateCharge')::int,(l->>'expectedPrincipalRemaining')::int,
        (l->>'expectedInterestRemaining')::int,(l->>'expectedLateChargeRemaining')::int,(l->>'chargeDate')::date)
      ELSE pg_temp.lc_line6(l->>'chargeId',(l->>'principal')::int,(l->>'interest')::int,(l->>'expectedPrincipalRemaining')::int,(l->>'expectedInterestRemaining')::int,(l->>'chargeDate')::date) END,
      ',' ORDER BY l->>'chargeId' COLLATE "C") FROM plan,jsonb_array_elements(plan.p->'allocations') l),''),
  '['||coalesce((SELECT string_agg('{"loanId":'||pg_temp.lc_q(m.e->>'loanId')||',"chargeId":'||pg_temp.lc_q(m.e->>'chargeId')||',"chargeDate":'||pg_temp.lc_q(m.e->>'chargeDate')
     ||',"principalDue":'||pg_temp.lc_q(m.e->>'principalDue')||',"interestDue":'||pg_temp.lc_q(m.e->>'interestDue')||'}',',' ORDER BY m.e->>'chargeId' COLLATE "C")
     FROM plan,jsonb_array_elements(plan.p->'materialize') m(e)),'')||']',
  '['||coalesce((SELECT string_agg('{"loanId":'||pg_temp.lc_q(x.e->>'loanId')||',"kind":'||pg_temp.lc_q(x.e->>'kind')||',"chargeId":'||pg_temp.lc_q(x.e->>'chargeId')||',"chargeDate":'||pg_temp.lc_q(x.e->>'chargeDate')
     ||',"amount":'||pg_temp.lc_q(req->>'amount')||',"accruedInterest":'||pg_temp.lc_q(x.e->>'accruedInterest')||',"principalDue":'||pg_temp.lc_q(x.e->>'principalDue')||'}',',' ORDER BY x.e->>'loanId' COLLATE "C")
     FROM plan,jsonb_array_elements(plan.p->'principal') x(e),jsonb_array_elements(purpose->'principal') req WHERE req->>'loanId'=x.e->>'loanId'),'')||']') $f$;

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- The late charges of the A side of every twin, set through the governed charge.update (no other route sets "Late Charge Due").
SELECT pg_temp.lc_setlate(id,late) FROM (VALUES
 ('LC-GA-today',50),('LC-D1-mix',50),('LC-O1-c',50),('LC-O2-c',50),('LC-C1-c',50),('LC-CA-c1',50),('LC-PA-today',50),('LC-QA-today',50),('LC-SA-today',50),
 ('LC-DF-paid',30),('LC-DF-open',50),('LC-I1-c2',50),('LC-N1-c',50),('LC-RA-c',50),('LC-RC-c',50)) v(id,late);
SELECT pg_temp.lc_assert((SELECT bool_and("Late Charge Due"::numeric=x.late AND "Late Charge Remaining"::numeric=x.late AND "Late Charge Paid"::numeric=0)
  FROM public."Charges" c JOIN (VALUES ('LC-GA-today',50),('LC-D1-mix',50),('LC-O1-c',50),('LC-DF-paid',30),('LC-RA-c',50)) x(id,late) ON x.id=c."Row ID"),
 'charge.update sets "Late Charge Due" and the derived remaining; paid is 0');
SELECT pg_temp.lc_assert((SELECT bool_and("Late Charge Due"::numeric=0 AND "Late Charge Remaining"::numeric=0) FROM public."Charges" WHERE "Row ID" IN ('LC-GB-today','LC-D1-w','LC-O1-c-never','LC-C2-c','LC-CB-c1','LC-PB-today','LC-RB-c','LC-K1-c')),
 'every other charge carries late 0');

-- The charge input lateChargeDue is optional: a 5-key update keeps the stored late charge.
SELECT pg_temp.lc_charge_op('charge.update','LC-GA-today',pg_temp.lc_inputs('LC-GA',(SELECT d FROM lc_day),0,10,50,'five keys')-'lateChargeDue');
SELECT pg_temp.lc_assert((SELECT "Late Charge Due"::numeric=50 AND "Late Charge Remaining"::numeric=50 AND "Notes"='five keys' FROM public."Charges" WHERE "Row ID"='LC-GA-today'),'a 5-key charge.update (no lateChargeDue) keeps the stored late charge');
SELECT pg_temp.lc_setlate('LC-GA-today',50);
-- Whole baht, never negative.
SELECT pg_temp.lc_reject('P5B06','SELECT pg_temp.lc_setlate(''LC-GB-today'',-5)');
SELECT pg_temp.lc_reject('P5B06','SELECT pg_temp.lc_setlate(''LC-GB-today'',2.5)');
-- A future charge with only an unpaid late charge drops out of Upcoming (a recorded future charge with interest stays).
SELECT pg_temp.lc_create('LC-D1-fut','LC-D1',(SELECT d FROM lc_day)+3,0,0,50);
SELECT pg_temp.lc_assert((SELECT "Late Charge Remaining"::numeric=50 FROM public."Charges" WHERE "Row ID"='LC-D1-fut')
  AND NOT EXISTS(SELECT 1 FROM public.oltp_upcoming_charge_events_v1 WHERE "Ref Loan"='LC-D1' AND "Due Date"=(SELECT d FROM lc_day)+3),'a future charge with only late unpaid is not in Upcoming');
-- Commands: everything built now, from the untouched fixture, and submitted below.
SELECT set_config('lc.o2a',pg_temp.lc_cmd(11,'a1000000-0000-4000-8000-000000000001','LC-BO',120,
   pg_temp.lc_line8('LC-O2-c',0,100,20,200,100,50,(SELECT d FROM lc_day)-1)),true),
 -- v10 on a late charge: the client (v10 has no late key) sends the plan lines without the late part, interest 10 + five forward charges = 60; the server plan at 60 puts 50 into late and books no forward charge.
 set_config('lc.c1_v10',pg_temp.lc_plan_cmd(10,'a2000000-0000-4000-8000-000000000001','LC-BC',110,pg_temp.lc_purpose(true,NULL,NULL),60),true),
 set_config('lc.c1_v8',pg_temp.lc_cmd(8,'a2000000-0000-4000-8000-000000000002','LC-BC',10,pg_temp.lc_line6('LC-C1-c',0,10,0,10,(SELECT d FROM lc_day))),true),
 set_config('lc.c2_v10',pg_temp.lc_plan_cmd(10,'a2000000-0000-4000-8000-000000000003','LC-BCV',60,pg_temp.lc_purpose(true,NULL,NULL)),true),
 set_config('lc.k1_v8',pg_temp.lc_cmd(8,'a3000000-0000-4000-8000-000000000001','LC-BK',50,pg_temp.lc_line6('LC-K1-c',40,10,40,10,(SELECT d FROM lc_day)-1)),true),
 set_config('lc.n1',pg_temp.lc_cmd(11,'a4000000-0000-4000-8000-000000000001','LC-BN',60,pg_temp.lc_line8('LC-N1-c',0,10,50,0,10,50,(SELECT d FROM lc_day)-1)),true),
 set_config('lc.pfa',pg_temp.lc_plan_cmd(11,'a5000000-0000-4000-8000-000000000001','LC-BPA',110,pg_temp.lc_purpose(true,NULL,NULL)),true),
 set_config('lc.pfb',pg_temp.lc_plan_cmd(11,'a5000000-0000-4000-8000-000000000002','LC-BPB',60,pg_temp.lc_purpose(true,NULL,NULL)),true);

-- 2. Legacy engine, interest then late charge then principal: 120 on a charge of principal 200, interest 100, late 50.
SELECT pg_temp.lc_legacy('LC-O1-P1','LC-BO','LC-O1-c',120);
DO $$
DECLARE e jsonb:=pg_temp.lc_effects('LC-O1-P1');
BEGIN
 PERFORM pg_temp.lc_assert(e->'alloc'=jsonb_build_object('p',0,'i',100,'l',20,'a',120) AND e->'paid'=jsonb_build_object('p',0,'i',100,'l',20),'legacy engine: 120 pays interest 100, late 20, principal 0; allocation = interest + principal + late');
 PERFORM pg_temp.lc_assert((SELECT "Interest Paid"::numeric=100 AND "Late Charge Paid"::numeric=20 AND "Principal Paid"::numeric=0 AND "Total Paid"::numeric=120 AND "Interest Remaining"::numeric=0
   AND "Late Charge Remaining"::numeric=30 AND "Principal Remaining"::numeric=200 AND "Amount Remaining"::numeric=230 AND "Payment Status"='ชำระบางส่วน' FROM public."Charges" WHERE "Row ID"='LC-O1-c'),
  'legacy engine: charge derived columns after the partial payment (late remaining 30, amount remaining 230)');
END $$;
SELECT pg_temp.lc_legacy('LC-O1-P2','LC-BO','LC-O1-c',230);
SELECT pg_temp.lc_assert(pg_temp.lc_effects('LC-O1-P2')->'alloc'=jsonb_build_object('p',200,'i',0,'l',30,'a',230)
  AND (SELECT "Amount Remaining"::numeric=0 AND "Late Charge Remaining"::numeric=0 AND "Payment Status"='ชำระแล้ว' AND "Total Paid"::numeric=350 FROM public."Charges" WHERE "Row ID"='LC-O1-c'),
 'legacy engine: the remainder pays late 30 then principal 200 and the charge is paid (Total Paid 350)');
-- A receipt for more than the three parts is still refused (no overpayment).

-- 1 (cont.) Derived columns, loan and borrower totals, guards.
DO $$
DECLARE c public."Charges"%ROWTYPE;v record;
BEGIN
 SELECT * INTO c FROM public."Charges" WHERE "Row ID"='LC-D1-mix';
 SELECT * INTO v FROM public.vc_charge_values(c);
 PERFORM pg_temp.lc_assert(v.lp=0 AND v.lr=50 AND v.pr=100 AND v.ir=10 AND v.remaining=160 AND v.total=0 AND v.status='รอชำระ','vc_charge_values: lp 0, lr 50, remaining = principal + interest + late = 160, unpaid');
 PERFORM pg_temp.lc_assert((c."Amount Remaining"::numeric=160 AND c."Late Charge Remaining"::numeric=50 AND c."Total Paid"::numeric=0 AND c."Payment Status"='รอชำระ' AND c."Late Charge Due"::numeric=50),'stored derived columns follow vc_charge_values on a charge with late 50');
END $$;
SELECT pg_temp.lc_legacy('LC-D1-P1','LC-BD','LC-D1-mix',60);
DO $$
DECLARE c public."Charges"%ROWTYPE;
BEGIN
 SELECT * INTO c FROM public."Charges" WHERE "Row ID"='LC-D1-mix';
 PERFORM pg_temp.lc_assert(c."Interest Paid"::numeric=10 AND c."Late Charge Paid"::numeric=50 AND c."Principal Paid"::numeric=0 AND c."Total Paid"::numeric=60 AND c."Late Charge Remaining"::numeric=0
   AND c."Amount Remaining"::numeric=100 AND c."Payment Status"='ชำระบางส่วน' AND c."Payment Count"=1,'late paid in full leaves principal 100: partial, Total Paid includes late');
 PERFORM pg_temp.lc_assert((SELECT "Total Interest Received"::numeric=60 AND "Total Amount Received"::numeric=60 AND "Total Principal Received"::numeric=0 FROM public."Loans" WHERE "Row ID"='LC-D1'),
  'loan totals fold late into Total Interest Received and Total Amount Received');
 PERFORM pg_temp.lc_assert((SELECT "Total Interest Earned"::numeric=60 FROM public."Borrowers" WHERE "Row ID"='LC-BD'),'borrower Total Interest Earned folds late');
END $$;
-- The guard: due cannot go below paid; equal to paid and above are allowed; the message and the P5B06 mapping are those of the other components.
SELECT pg_temp.lc_reject('Charge amount cannot be less than its posted component payments','UPDATE public."Charges" SET "Late Charge Due"=40::money WHERE "Row ID"=''LC-D1-mix''');
SELECT pg_temp.lc_reject('P5B06','SELECT pg_temp.lc_setlate(''LC-D1-mix'',40)');
SELECT pg_temp.lc_setlate('LC-D1-mix',80);
SELECT pg_temp.lc_assert((SELECT "Late Charge Remaining"::numeric=30 AND "Amount Remaining"::numeric=130 FROM public."Charges" WHERE "Row ID"='LC-D1-mix'),'raising late after a payment reopens the difference');
SELECT pg_temp.lc_setlate('LC-D1-mix',50);
SELECT pg_temp.lc_assert((SELECT "Late Charge Remaining"::numeric=0 AND "Amount Remaining"::numeric=100 FROM public."Charges" WHERE "Row ID"='LC-D1-mix'),'waive down to what was paid (50) is allowed');
-- Waive an unpaid late charge to 0 (while nothing was paid on it).
SELECT pg_temp.lc_setlate('LC-D1-w',50);
SELECT pg_temp.lc_assert((SELECT "Late Charge Remaining"::numeric=50 AND "Amount Remaining"::numeric=60 FROM public."Charges" WHERE "Row ID"='LC-D1-w'),'late 50 on an unpaid charge');
SELECT pg_temp.lc_setlate('LC-D1-w',0);
SELECT pg_temp.lc_assert((SELECT "Late Charge Due"::numeric=0 AND "Late Charge Remaining"::numeric=0 AND "Amount Remaining"::numeric=10 FROM public."Charges" WHERE "Row ID"='LC-D1-w'),'an unpaid late charge waives to 0');
-- A late-only charge (principal 0, interest 0, late 50): created, unpaid, paid, then protected.
SELECT pg_temp.lc_create('LC-D1-only','LC-D1',(SELECT d FROM lc_day)-1,0,0,50);
DO $$
DECLARE c public."Charges"%ROWTYPE;v record;
BEGIN
 SELECT * INTO c FROM public."Charges" WHERE "Row ID"='LC-D1-only';
 SELECT * INTO v FROM public.vc_charge_values(c);
 PERFORM pg_temp.lc_assert(v.pr=0 AND v.ir=0 AND v.lr=50 AND v.remaining=50 AND v.status='รอชำระ' AND c."Amount Remaining"::numeric=50,'late-only charge 0/0/50: remaining 50, unpaid');
END $$;
SELECT pg_temp.lc_legacy('LC-D1-P2','LC-BD','LC-D1-only',50,'Single Full');
SELECT pg_temp.lc_assert(pg_temp.lc_effects('LC-D1-P2')=jsonb_build_object('alloc',jsonb_build_object('p',0,'i',0,'l',50,'a',50),'paid',jsonb_build_object('p',0,'i',0,'l',50))
  AND (SELECT "Amount Remaining"::numeric=0 AND "Payment Status"='ชำระแล้ว' AND "Payment Date"=(SELECT d FROM lc_day) AND "Total Paid"::numeric=50 FROM public."Charges" WHERE "Row ID"='LC-D1-only'),
 'a late-only charge is paid by a late-only allocation and repayment; status paid, dated');
SELECT pg_temp.lc_reject('P5B06','SELECT pg_temp.lc_setlate(''LC-D1-only'',0)');
SELECT pg_temp.lc_reject('P5B05','SELECT pg_temp.lc_charge_op(''charge.delete'',''LC-D1-only'',''{}''::jsonb)');
SELECT pg_temp.lc_reject('Charge has receipts','DELETE FROM public."Charges" WHERE "Row ID"=''LC-D1-only''');
-- The all-zero rule counts late: 0/0/0 refused, 0/0/50 accepted (above).
SELECT pg_temp.lc_reject('P5B06','SELECT pg_temp.lc_create(''LC-D1-zero'',''LC-D1'',(SELECT d FROM lc_day)-1,0,0,0)');
-- fd6: the first-day auto charge refuses a late charge and still nets off without one.
SELECT pg_temp.lc_reject('P5B06','SELECT pg_temp.lc_create(''LC-F1-late'',''LC-F1'',(SELECT d FROM lc_day),100,10,50)');
SELECT pg_temp.lc_create('LC-F1-fd','LC-F1',(SELECT d FROM lc_day),100,10,0);
SELECT pg_temp.lc_assert((SELECT "Status"='Posted' AND "Amount Received"::numeric=110 FROM public."Payments" WHERE "Row ID"='fd6:LC-F1-fd')
  AND (SELECT "Late Charge Due"::numeric=0 AND "Amount Remaining"::numeric=0 FROM public."Charges" WHERE "Row ID"='LC-F1-fd'),'fd6 refuses late above 0 and nets off a first-day charge with late 0');

-- 3. Round 1 of the payment commands (explicit engine), as the DEV command user.
SET SESSION AUTHORIZATION "mw-credit-app-command-dev@clever-oasis-508610-n7.iam";
DO $$
DECLARE r jsonb;k text;
BEGIN
 -- v11 with empty lists: interest 100, late 20, principal 0 of the same charge shape as the legacy test.
 r:=pg_temp.lc_submit('lc.o2a');
 IF r->'originalOutcome'->>'status'<>'posted' THEN RAISE EXCEPTION 'v11 with empty lists must post: %',r; END IF;
 IF pg_temp.lc_submit('lc.o2a')->'originalOutcome'->>'status'<>'posted' THEN RAISE EXCEPTION 'v11 replay'; END IF;
 -- v10 on a late charge: the client refreshes (selection_unavailable); nothing is posted.
 r:=pg_temp.lc_submit('lc.c1_v10');
 IF r->'originalOutcome'->>'status'<>'rejected' OR r->'originalOutcome'->>'code'<>'selection_unavailable' THEN RAISE EXCEPTION 'v10 on a late charge must be selection_unavailable: %',r; END IF;
 -- A 6-key v8 line on a late charge posts (principal 50 + interest 10) and leaves the late charge unpaid.
 r:=pg_temp.lc_submit('lc.c1_v8');
 IF r->'originalOutcome'->>'status'<>'posted' THEN RAISE EXCEPTION '6-key v8 on a late charge must post: %',r; END IF;
 -- v10 still posts on a charge with no late charge.
 r:=pg_temp.lc_submit('lc.c2_v10');
 IF r->'originalOutcome'->>'status'<>'posted' THEN RAISE EXCEPTION 'v10 without late must still post: %',r; END IF;
 r:=pg_temp.lc_submit('lc.k1_v8');
 IF r->'originalOutcome'->>'status'<>'posted' THEN RAISE EXCEPTION 'K1 v8 must post: %',r; END IF;
 r:=pg_temp.lc_submit('lc.n1');
 IF r->'originalOutcome'->>'status'<>'posted' THEN RAISE EXCEPTION 'N1 v11 must post: %',r; END IF;
 -- Pay forward with lists: the A plan pays the due charge (interest 10, late 50) and five forward charges.
 FOREACH k IN ARRAY ARRAY['lc.pfa','lc.pfb'] LOOP
  r:=pg_temp.lc_submit(k);
  IF r->'originalOutcome'->>'status'<>'posted' THEN RAISE EXCEPTION '% (v11 pay forward) must post: %',k,r; END IF;
 END LOOP;
END $$;
RESET SESSION AUTHORIZATION;
SET CONSTRAINTS vc_repayment_changed, vc_payment_changed, vc_borrower_changed IMMEDIATE;
-- Round 2: the remainder of O2 (late 30, principal 200).
SELECT set_config('lc.o2b',pg_temp.lc_cmd(11,'a1000000-0000-4000-8000-000000000002','LC-BO',230,pg_temp.lc_line8('LC-O2-c',200,0,30,200,0,30,(SELECT d FROM lc_day)-1)),true);
SET SESSION AUTHORIZATION "mw-credit-app-command-dev@clever-oasis-508610-n7.iam";
SELECT pg_temp.lc_submit('lc.o2b')->'originalOutcome'->>'status' AS o2b;
RESET SESSION AUTHORIZATION;
SET CONSTRAINTS vc_repayment_changed, vc_payment_changed, vc_borrower_changed IMMEDIATE;

DO $$
DECLARE d date:=(SELECT d FROM lc_day);n5 integer;n6 integer;
BEGIN
 -- Order on the explicit engine equals the legacy engine (compare against LC-O1-P1 / P2).
 PERFORM pg_temp.lc_assert(pg_temp.lc_effects('pwa:a1000000-0000-4000-8000-000000000001')=pg_temp.lc_effects('LC-O1-P1'),'explicit v11 and legacy engines write the same allocation and repayment columns (120)');
 PERFORM pg_temp.lc_assert(pg_temp.lc_effects('pwa:a1000000-0000-4000-8000-000000000002')=pg_temp.lc_effects('LC-O1-P2'),'explicit v11 and legacy engines write the same columns for the remainder (230)');
 PERFORM pg_temp.lc_assert((SELECT bool_and(a."Allocated Amount"::numeric=a."Allocated Principal"::numeric+a."Allocated Interest"::numeric+a."Allocated Late Charge"::numeric) FROM public."Payment Allocations" a
   WHERE a."Ref Payment" LIKE 'pwa:a1000000-%' OR a."Ref Payment" LIKE 'LC-O1-P%'),'"Allocated Amount" = interest + principal + late on both engines');
 PERFORM pg_temp.lc_assert((SELECT bool_and(r."Principal Paid"::numeric=a."Allocated Principal"::numeric AND r."Interest Paid"::numeric=a."Allocated Interest"::numeric AND r."Late Charge Paid"::numeric=a."Allocated Late Charge"::numeric)
   FROM public."Repayments" r JOIN public."Payment Allocations" a ON a."Row ID"=r."Ref Payment Allocation" WHERE r."Ref Payment" LIKE 'pwa:a1000000-%' OR r."Ref Payment" LIKE 'LC-O1-P%'),'repayment columns equal their allocation columns');
 PERFORM pg_temp.lc_assert((SELECT "Amount Remaining"::numeric=0 AND "Payment Status"='ชำระแล้ว' AND "Total Paid"::numeric=350 FROM public."Charges" WHERE "Row ID"='LC-O2-c'),'explicit engine: the charge is paid in full after the two payments');
 -- v10 on a late charge posted nothing; the v8 6-key line left the late charge unpaid.
 PERFORM pg_temp.lc_assert(NOT EXISTS(SELECT 1 FROM public."Payments" WHERE "Row ID"='pwa:a2000000-0000-4000-8000-000000000001')
   AND (SELECT count(*)=1 FROM public.pwa_payment_commands WHERE request_id='a2000000-0000-4000-8000-000000000001' AND outcome='rejected' AND rejection_code='selection_unavailable'),'v10 on a late charge: rejected as selection_unavailable, nothing posted');
 PERFORM pg_temp.lc_assert((SELECT "Late Charge Paid"::numeric=0 AND "Late Charge Remaining"::numeric=50 AND "Principal Paid"::numeric=0 AND "Interest Paid"::numeric=10 AND "Amount Remaining"::numeric=50 FROM public."Charges" WHERE "Row ID"='LC-C1-c'),
  '6-key v8 on a late charge posts interest 10 and leaves the late charge 50 unpaid');
 PERFORM pg_temp.lc_assert(pg_temp.lc_effects('pwa:a2000000-0000-4000-8000-000000000002')=jsonb_build_object('alloc',jsonb_build_object('p',0,'i',10,'l',0,'a',10),'paid',jsonb_build_object('p',0,'i',10,'l',0)),'6-key v8: late allocation 0');
 PERFORM pg_temp.lc_assert((SELECT "Status"='Posted' AND "Amount Received"::numeric=60 FROM public."Payments" WHERE "Row ID"='pwa:a2000000-0000-4000-8000-000000000003')
   AND pg_temp.lc_effects('pwa:a2000000-0000-4000-8000-000000000003')->'paid'=jsonb_build_object('p',0,'i',60,'l',0),'v10 (forward list) without a late charge still posts');
 PERFORM pg_temp.lc_assert(pg_temp.lc_effects('pwa:a4000000-0000-4000-8000-000000000001')->'paid'=jsonb_build_object('p',0,'i',10,'l',50)
   AND (SELECT "Late Charge Remaining"::numeric=0 AND "Amount Remaining"::numeric=0 FROM public."Charges" WHERE "Row ID"='LC-N1-c'),'v11 interest 10 + late 50 paid in full');
 PERFORM pg_temp.lc_assert((public.pwa_effective_payment_plan_v2('pwa:a4000000-0000-4000-8000-000000000001')#>'{plan,allocations}')=((current_setting('lc.n1')::jsonb)#>'{command,allocations}'),'v11 keeps the explicit plan provenance (8-key lines)');
 -- v11 with pay-forward lists: due line + five forward charges (A: late 50 on the due charge; B: none).
 PERFORM pg_temp.lc_assert((SELECT "Status"='Posted' AND "Amount Received"::numeric=110 FROM public."Payments" WHERE "Row ID"='pwa:a5000000-0000-4000-8000-000000000001')
   AND (SELECT "Status"='Posted' AND "Amount Received"::numeric=60 FROM public."Payments" WHERE "Row ID"='pwa:a5000000-0000-4000-8000-000000000002'),'v11 pay-forward commands post (A 110, B 60)');
 PERFORM pg_temp.lc_assert(pg_temp.lc_effects('pwa:a5000000-0000-4000-8000-000000000001')->'paid'=jsonb_build_object('p',0,'i',60,'l',50)
   AND pg_temp.lc_effects('pwa:a5000000-0000-4000-8000-000000000002')->'paid'=jsonb_build_object('p',0,'i',60,'l',0),'pay forward: A pays interest 60 + late 50, B interest 60');
 PERFORM pg_temp.lc_assert((SELECT count(*)=5 AND bool_and("Late Charge Due"::numeric=0 AND "Amount Remaining"::numeric=0 AND "Interest Due"::numeric=10) FROM public."Charges" WHERE "Ref Loans"='LC-PA' AND "Charge Date">d),
  'booked forward charges carry late 0 and are paid');
 PERFORM pg_temp.lc_assert((SELECT jsonb_agg(jsonb_build_array("Charge Date","Principal Due"::numeric,"Interest Due"::numeric,"Late Charge Due"::numeric) ORDER BY "Charge Date") FROM public."Charges" WHERE "Ref Loans"='LC-PA' AND "Charge Date">d)
   =(SELECT jsonb_agg(jsonb_build_array("Charge Date","Principal Due"::numeric,"Interest Due"::numeric,"Late Charge Due"::numeric) ORDER BY "Charge Date") FROM public."Charges" WHERE "Ref Loans"='LC-PB' AND "Charge Date">d),
  'nothing dated moved: the forward charges booked for A equal those booked for B');
 n5:=public.generate_due_charges(d+5,ARRAY['LC-PA','LC-PB']);
 n6:=public.generate_due_charges(d+6,ARRAY['LC-PA','LC-PB']);
 PERFORM pg_temp.lc_assert(n5=0 AND n6=2
   AND (SELECT count(DISTINCT "Interest Due") =1 AND min("Interest Due"::numeric)=10 FROM public."Charges" WHERE "Ref Loans" IN ('LC-PA','LC-PB') AND "Charge Date"=d+6),
  'after a pay forward the schedule continues from the last prepaid date for A and B alike');
 PERFORM pg_temp.lc_assert((SELECT "Interest Schedule Anchor Date" IS NOT DISTINCT FROM (SELECT "Interest Schedule Anchor Date" FROM public."Loans" WHERE "Row ID"='LC-PB') FROM public."Loans" WHERE "Row ID"='LC-PA'),'pay forward: schedule anchors equal');
END $$;

-- 3 (cont.) Corrections. The plan effects (a stored 6-key plan against a new 8-key plan with late 0) are not a repost; late above 0 is.
DO $$
DECLARE six jsonb:='[{"chargeId":"X1","principal":"40","interest":"10","expectedPrincipalRemaining":"40","expectedInterestRemaining":"10","chargeDate":"2026-11-02"}]';
 eight jsonb:='[{"chargeId":"X1","principal":"40","interest":"10","lateCharge":"0","expectedPrincipalRemaining":"40","expectedInterestRemaining":"10","expectedLateChargeRemaining":"0","chargeDate":"2026-11-02"}]';
 eight_late jsonb:='[{"chargeId":"X1","principal":"40","interest":"10","lateCharge":"5","expectedPrincipalRemaining":"40","expectedInterestRemaining":"10","expectedLateChargeRemaining":"5","chargeDate":"2026-11-02"}]';
BEGIN
 PERFORM pg_temp.lc_assert(public.pwa_plan_effects_v83(six)=public.pwa_plan_effects_v83(eight),'pwa_plan_effects_v83: a 6-key plan equals the same plan as 8-key lines with late 0');
 PERFORM pg_temp.lc_assert(public.pwa_plan_effects_v83(six) IS DISTINCT FROM public.pwa_plan_effects_v83(eight_late),'pwa_plan_effects_v83: late above 0 is a different effect');
 PERFORM pg_temp.lc_assert(NOT (public.pwa_plan_effects_v83(eight_late)->0 ? 'expectedLateChargeRemaining') AND public.pwa_plan_effects_v83(eight_late)->0->>'lateCharge'='5','pwa_plan_effects_v83 strips the expected late key and keeps lateCharge when above 0');
 PERFORM pg_temp.lc_assert(NOT (public.pwa_plan_effects_v83(eight)->0 ? 'lateCharge'),'pwa_plan_effects_v83 drops lateCharge "0"');
END $$;
-- The same through pwa_apply_payment_v2: payment.correct of the 6-key v8 payment of K1 with 8-key late-0 lines and a new note changes the note only.
CREATE TEMP TABLE lc_k1_before ON COMMIT DROP AS
 SELECT (SELECT array_agg("Row ID" ORDER BY "Row ID") FROM public."Repayments" WHERE "Ref Payment"='pwa:a3000000-0000-4000-8000-000000000001') repayments,
        (SELECT array_agg("Row ID" ORDER BY "Row ID") FROM public."Payment Allocations" WHERE "Ref Payment"='pwa:a3000000-0000-4000-8000-000000000001') allocations;
SELECT pg_temp.lc_owner_call('pwa_apply_payment_v2',jsonb_build_object('contractVersion',2,'requestId','a3000000-0000-4000-8000-0000000000c1','actor',pg_temp.lc_actor(),
 'command',jsonb_build_object('schemaVersion',1,'operation','payment.correct','targetType','payment','targetId','pwa:a3000000-0000-4000-8000-000000000001',
  'expectedVersion',public.pwa_payment_version_v2('pwa:a3000000-0000-4000-8000-000000000001'),'predecessorRequestId',public.pwa_payment_head_v2('pwa:a3000000-0000-4000-8000-000000000001')::text,
  'inputs',jsonb_build_object('kind','pwa-plan','receiptMode','preserve','fields',jsonb_build_object('borrowerId','LC-BK','amountReceived','50','paymentDate',(SELECT d FROM lc_day)::text,
   'paymentMethod','Bank Transfer','cashAccountId','CI-LISA','notes','late charge correction','allocationMethod','Selected Charges','targetChargeId',NULL,'targetLoanId',NULL,
   'allocations',jsonb_build_array(jsonb_build_object('chargeId','LC-K1-c','principal','40','interest','10','lateCharge','0','expectedPrincipalRemaining','40','expectedInterestRemaining','10',
    'expectedLateChargeRemaining','0','chargeDate',((SELECT d FROM lc_day)-1)::text))))),'receipt',NULL)::text);
SET CONSTRAINTS vc_repayment_changed, vc_payment_changed, vc_borrower_changed IMMEDIATE;
SELECT pg_temp.lc_assert((SELECT "Notes"='late charge correction' AND "Status"='Posted' FROM public."Payments" WHERE "Row ID"='pwa:a3000000-0000-4000-8000-000000000001')
  AND (SELECT array_agg("Row ID" ORDER BY "Row ID") FROM public."Repayments" WHERE "Ref Payment"='pwa:a3000000-0000-4000-8000-000000000001')=(SELECT repayments FROM lc_k1_before)
  AND (SELECT array_agg("Row ID" ORDER BY "Row ID") FROM public."Payment Allocations" WHERE "Ref Payment"='pwa:a3000000-0000-4000-8000-000000000001')=(SELECT allocations FROM lc_k1_before),
 'a correction with 8-key late-0 lines against 6-key provenance is not a repost: same repayment and allocation rows, note changed');
-- Deleting a payment that paid late reopens the late charge (N1 and D1 payments).
DELETE FROM public."Payments" WHERE "Row ID"='pwa:a4000000-0000-4000-8000-000000000001';
SET CONSTRAINTS vc_repayment_changed, vc_payment_changed, vc_borrower_changed IMMEDIATE;
SELECT pg_temp.lc_assert((SELECT "Late Charge Paid"::numeric=0 AND "Late Charge Remaining"::numeric=50 AND "Amount Remaining"::numeric=60 AND "Payment Status"='รอชำระ' FROM public."Charges" WHERE "Row ID"='LC-N1-c')
  AND NOT EXISTS(SELECT 1 FROM public."Repayments" WHERE "Ref Payment"='pwa:a4000000-0000-4000-8000-000000000001'),'deleting the payment reopens the late charge (remaining 50) and removes its repayments');
SELECT pg_temp.lc_assert((SELECT "Total Interest Received"::numeric=110 FROM public."Loans" WHERE "Row ID"='LC-D1') AND (SELECT "Total Interest Received"::numeric=0 FROM public."Loans" WHERE "Row ID"='LC-N1'),
 'loan totals follow: LC-N1 back to 0 after the delete, LC-D1 unchanged (interest 10 + late 50 + late-only 50)');
-- Re-pay the N1 charge by the legacy engine so the notify case (section 6) has a payment with late 50.
SELECT pg_temp.lc_legacy('LC-N1-P1','LC-BN','LC-N1-c',60,'Single Full');

-- 4. Nothing dated moved. (a) Generation twins A/B for ten dates, with a payment in between.
DO $$
DECLARE d date:=(SELECT d FROM lc_day);a jsonb;b jsonb;
BEGIN
 PERFORM pg_temp.lc_assert(pg_temp.lc_gen('LC-GA',d+1,d+5)=5 AND pg_temp.lc_gen('LC-GB',d+1,d+5)=5,'generation: five charges for each twin through day+5');
 PERFORM pg_temp.lc_assert((SELECT jsonb_agg(jsonb_build_array("Charge Date","Principal Due"::numeric,"Interest Due"::numeric) ORDER BY "Charge Date") FROM public."Charges" WHERE "Ref Loans"='LC-GA' AND "Charge Date">d)
   =(SELECT jsonb_agg(jsonb_build_array("Charge Date","Principal Due"::numeric,"Interest Due"::numeric) ORDER BY "Charge Date") FROM public."Charges" WHERE "Ref Loans"='LC-GB' AND "Charge Date">d),
  'generation: dates, principal and interest of the next five charges are identical with and without a late charge on the last one');
END $$;
SELECT pg_temp.lc_legacy('LC-GA-P1','LC-BGA','LC-GA-today',60,'Single Full');
SELECT pg_temp.lc_legacy('LC-GB-P1','LC-BGB','LC-GB-today',10,'Single Full');
DO $$
DECLARE d date:=(SELECT d FROM lc_day);
BEGIN
 PERFORM pg_temp.lc_assert(pg_temp.lc_gen('LC-GA',d+6,d+10)=5 AND pg_temp.lc_gen('LC-GB',d+6,d+10)=5,'generation: five more charges for each twin after the late charge was paid');
 PERFORM pg_temp.lc_assert((SELECT jsonb_agg(jsonb_build_array("Charge Date","Principal Due"::numeric,"Interest Due"::numeric) ORDER BY "Charge Date") FROM public."Charges" WHERE "Ref Loans"='LC-GA' AND "Charge Date">d)
   =(SELECT jsonb_agg(jsonb_build_array("Charge Date","Principal Due"::numeric,"Interest Due"::numeric) ORDER BY "Charge Date") FROM public."Charges" WHERE "Ref Loans"='LC-GB' AND "Charge Date">d)
  AND (SELECT count(*)=10 FROM public."Charges" WHERE "Ref Loans"='LC-GA' AND "Charge Date">d),'generation: the next ten dates (principal and interest) are identical for A and B');
 PERFORM pg_temp.lc_assert((SELECT bool_and("Late Charge Due"::numeric=0 AND "Late Charge Remaining"::numeric=0) FROM public."Charges" WHERE "Ref Loans" IN ('LC-GA','LC-GB') AND "Charge Date">d),'generated charges start at late 0');
 PERFORM pg_temp.lc_assert((SELECT a."Interest Schedule Anchor Date" IS NOT DISTINCT FROM b."Interest Schedule Anchor Date" AND a."Current Daily Interest"=b."Current Daily Interest" AND a."Outstanding Principal"=b."Outstanding Principal"
   FROM public."Loans" a,public."Loans" b WHERE a."Row ID"='LC-GA' AND b."Row ID"='LC-GB'),'generation: Interest Schedule Anchor Date, daily interest and outstanding principal equal');
END $$;
-- (d) The next bookable / projected charge offers (after the generated charges: the same dates for both twins).
DO $$
DECLARE d date:=(SELECT d FROM lc_day);
BEGIN
 PERFORM pg_temp.lc_assert(pg_temp.lc_norm((SELECT jsonb_agg(to_jsonb(x)) FROM public.pwa_next_bookable_charge_v1('LC-BGA',d) x),'LC-GA','LC-GB')
   =pg_temp.lc_norm((SELECT jsonb_agg(to_jsonb(x)) FROM public.pwa_next_bookable_charge_v1('LC-BGB',d) x),'LC-GA','LC-GB')
  AND (SELECT count(*) FROM public.pwa_next_bookable_charge_v1('LC-BGA',d))=1,'pwa_next_bookable_charge_v1 is identical for A and B');
 PERFORM pg_temp.lc_assert(pg_temp.lc_norm((SELECT jsonb_agg(to_jsonb(x)) FROM public.pwa_next_projected_charge_v1('LC-BGA',d) x),'LC-GA','LC-GB')
   =pg_temp.lc_norm((SELECT jsonb_agg(to_jsonb(x)) FROM public.pwa_next_projected_charge_v1('LC-BGB',d) x),'LC-GA','LC-GB'),'pwa_next_projected_charge_v1 is identical for A and B');
END $$;
-- (b) Loan Close quote: the mutation JSON and every dated figure equal; the amount differs by exactly 50; A's lines carry late 50.
DO $$
DECLARE d date:=(SELECT d FROM lc_day);a jsonb:=public.loan_close_calculation_v83('LC-CA',d);b jsonb:=public.loan_close_calculation_v83('LC-CB',d);
 strip text[]:=ARRAY['amount','allocations','planHash','sourceVersion'];
BEGIN
 PERFORM pg_temp.lc_assert(a->'mutation' IS NOT NULL AND a->'mutation'<>'null'::jsonb AND pg_temp.lc_norm(a->'mutation','LC-CA','LC-CB')=pg_temp.lc_norm(b->'mutation','LC-CA','LC-CB'),'loan close: the mutation JSON is identical with and without a late charge');
 PERFORM pg_temp.lc_assert(pg_temp.lc_norm(a-strip,'LC-CA','LC-CB','LC-BCA','LC-BCB')=pg_temp.lc_norm(b-strip,'LC-CA','LC-CB','LC-BCA','LC-BCB'),'loan close: business date, target charge and loan and every other field equal');
 PERFORM pg_temp.lc_assert((a->>'amount')::numeric=(b->>'amount')::numeric+50,'loan close: the payoff differs by exactly the late charge (50)');
 PERFORM pg_temp.lc_assert((SELECT coalesce(sum((l->>'lateCharge')::numeric),0)=50 AND count(*) FILTER(WHERE (l->>'lateCharge')::numeric>0)=1 AND bool_and(l->>'expectedLateChargeRemaining'=l->>'lateCharge') FROM jsonb_array_elements(a->'allocations') l),'loan close: A lines carry late 50 on one line, expected late = late');
 PERFORM pg_temp.lc_assert((SELECT coalesce(sum((l->>'lateCharge')::numeric),0)=0 FROM jsonb_array_elements(b->'allocations') l)
   AND pg_temp.lc_norm((SELECT jsonb_agg(l-'lateCharge'-'expectedLateChargeRemaining' ORDER BY l->>'chargeId') FROM jsonb_array_elements(a->'allocations') l),'LC-CA','LC-CB')
     =pg_temp.lc_norm((SELECT jsonb_agg(l-'lateCharge'-'expectedLateChargeRemaining' ORDER BY l->>'chargeId') FROM jsonb_array_elements(b->'allocations') l),'LC-CA','LC-CB'),
  'loan close: B carries late 0 and the lines of A and B are equal apart from the late keys');
 PERFORM pg_temp.lc_assert((SELECT bool_and(array(SELECT jsonb_object_keys(l) ORDER BY 1)=ARRAY['chargeDate','chargeId','expectedInterestRemaining','expectedLateChargeRemaining','expectedPrincipalRemaining','interest','lateCharge','principal'])
   FROM jsonb_array_elements(a->'allocations') l),'loan close lines are the 8-key shape');
 PERFORM pg_temp.lc_assert((a->>'amount')::numeric=(SELECT sum((l->>'principal')::numeric+(l->>'interest')::numeric+(l->>'lateCharge')::numeric) FROM jsonb_array_elements(a->'allocations') l),'loan close: amount = principal + interest + late of the lines');
 PERFORM pg_temp.lc_assert((SELECT sum((l->>'lateCharge')::numeric) FROM jsonb_array_elements(a->'allocations') l)=(SELECT sum("Late Charge Remaining") FROM public."Charges" WHERE "Ref Loans"='LC-CA'),'loan close: the payoff adds the unpaid late of every charge of the loan');
END $$;
-- (c) Pay-forward plans for A (+50) against B: forward, principal and settle.
DO $$
DECLARE pa jsonb;pb jsonb;
BEGIN
 pa:=pg_temp.lc_plan('LC-BQA',160,pg_temp.lc_purpose(false,'[{"loanId":"LC-QA","amount":"100"}]',NULL));
 pb:=pg_temp.lc_plan('LC-BQB',110,pg_temp.lc_purpose(false,'[{"loanId":"LC-QB","amount":"100"}]',NULL));
 PERFORM pg_temp.lc_assert(pa->'principal'->0->>'kind' IN ('book','raise') AND pg_temp.lc_norm(pg_temp.lc_planstrip(pa),'LC-QA','LC-QB','LC-BQA','LC-BQB')=pg_temp.lc_norm(pg_temp.lc_planstrip(pb),'LC-QA','LC-QB','LC-BQA','LC-BQB'),
  'pay forward, principal: the plan (principal entries, outstanding, daily interest, next charge) is identical for A (amount + 50) and B');
 PERFORM pg_temp.lc_assert((SELECT sum((l->>'principal')::numeric+(l->>'interest')::numeric+(l->>'lateCharge')::numeric)=160 AND sum((l->>'lateCharge')::numeric)=50 FROM jsonb_array_elements(pa->'allocations') l)
   AND (SELECT sum((l->>'lateCharge')::numeric)=0 FROM jsonb_array_elements(pb->'allocations') l)
   AND pg_temp.lc_norm((SELECT jsonb_agg(l-'lateCharge'-'expectedLateChargeRemaining' ORDER BY l->>'chargeId') FROM jsonb_array_elements(pa->'allocations') l),'LC-QA','LC-QB')
     =pg_temp.lc_norm((SELECT jsonb_agg(l-'lateCharge'-'expectedLateChargeRemaining' ORDER BY l->>'chargeId') FROM jsonb_array_elements(pb->'allocations') l),'LC-QA','LC-QB'),
  'pay forward, principal: allocations equal apart from the late part, which is 50 for A and 0 for B');
 PERFORM pg_temp.lc_assert((SELECT bool_and(array(SELECT jsonb_object_keys(l) ORDER BY 1)=ARRAY['chargeDate','chargeId','expectedInterestRemaining','expectedLateChargeRemaining','expectedPrincipalRemaining','interest','lateCharge','principal'])
   FROM jsonb_array_elements(pa->'allocations') l),'pwa_pay_forward_plan_v1 always emits 8-key lines');
 -- Settle: the principal option reaches the payoff of a 100 loan with a 1-a-day charge (A also owes late 50).
 pa:=pg_temp.lc_plan('LC-BSA',151,pg_temp.lc_purpose(false,'[{"loanId":"LC-SA","amount":"100"}]',NULL));
 pb:=pg_temp.lc_plan('LC-BSB',101,pg_temp.lc_purpose(false,'[{"loanId":"LC-SB","amount":"100"}]',NULL));
 PERFORM pg_temp.lc_assert(pa->'settles' ? 'LC-SA' AND pb->'settles' ? 'LC-SB' AND pa->'principal'->0->>'kind'='settle' AND pb->'principal'->0->>'kind'='settle','pay forward, settle: both loans settle (A with the late charge in the payoff)');
 PERFORM pg_temp.lc_assert((SELECT sum((l->>'lateCharge')::numeric)=50 AND sum((l->>'principal')::numeric+(l->>'interest')::numeric+(l->>'lateCharge')::numeric)=151 FROM jsonb_array_elements(pa->'allocations') l)
   AND (SELECT sum((l->>'lateCharge')::numeric)=0 AND sum((l->>'principal')::numeric+(l->>'interest')::numeric)=101 FROM jsonb_array_elements(pb->'allocations') l),'pay forward, settle: the quote lines carry the late charge for A only');
 -- Forward, with the due charge carrying late: the forward charges, paidThrough and uncovered are those of B.
 pa:=pg_temp.lc_plan('LC-BPA',200,pg_temp.lc_purpose(true,NULL,NULL));
END $$;
-- The forward plans of the untouched twins (QA/QB) with forward only, before anything is posted on them.
DO $$
DECLARE pa jsonb:=pg_temp.lc_plan('LC-BQA',110,pg_temp.lc_purpose(true,NULL,NULL));pb jsonb:=pg_temp.lc_plan('LC-BQB',60,pg_temp.lc_purpose(true,NULL,NULL));
BEGIN
 PERFORM pg_temp.lc_assert(jsonb_array_length(pa->'materialize')=5 AND pg_temp.lc_norm(pg_temp.lc_planstrip(pa),'LC-QA','LC-QB','LC-BQA','LC-BQB')=pg_temp.lc_norm(pg_temp.lc_planstrip(pb),'LC-QA','LC-QB','LC-BQA','LC-BQB'),
  'pay forward, forward: materialize, paidThrough and uncovered are identical for A (amount + 50) and B');
 PERFORM pg_temp.lc_assert((SELECT bool_and((l->>'lateCharge')::numeric=0 OR l->>'chargeId'='LC-QA-today') FROM jsonb_array_elements(pa->'allocations') l),'pay forward: only the recorded charge carries late; forward lines carry late 0');
END $$;

-- 5. Default write-off and undo with late paid (LC-DF-paid, late 30, 40 paid) and unpaid (LC-DF-open, late 50).
SELECT pg_temp.lc_legacy('LC-DF-P1','LC-BDF','LC-DF-paid',40);
SELECT pg_temp.lc_assert(pg_temp.lc_effects('LC-DF-P1')->'paid'=jsonb_build_object('p',0,'i',10,'l',30),'default fixture: 40 paid interest 10 + late 30');
-- A paid late-only charge today prevents Default (the test counts the late part).
SELECT pg_temp.lc_create('LC-DG-today','LC-DG',(SELECT d FROM lc_day),0,0,50);
SELECT pg_temp.lc_legacy('LC-DG-P1','LC-BDG','LC-DG-today',50,'Single Full');
SELECT pg_temp.lc_reject('paid charge today','UPDATE public."Loans" SET "Defaulted"=true,"Close Date"=(SELECT d FROM lc_day),"Closed By"=''synthetic@example.invalid'' WHERE "Row ID"=''LC-DG''');
UPDATE public."Loans" SET "Defaulted"=true,"Close Date"=(SELECT d FROM lc_day),"Closed By"='synthetic@example.invalid' WHERE "Row ID"='LC-DF';
SET CONSTRAINTS vc_repayment_changed, vc_payment_changed, vc_borrower_changed IMMEDIATE;
DO $$
DECLARE ev_paid jsonb;ev_open jsonb;
BEGIN
 ev_paid:=substring((SELECT "Notes" FROM public."Charges" WHERE "Row ID"='LC-DF-paid') from 'Default write-off (\{[^\n]*\})$')::jsonb;
 ev_open:=substring((SELECT "Notes" FROM public."Charges" WHERE "Row ID"='LC-DF-open') from 'Default write-off (\{[^\n]*\})$')::jsonb;
 PERFORM pg_temp.lc_assert((ev_paid->>'original_late')::numeric=30 AND (ev_paid->>'written_off_late')::numeric=0 AND (ev_open->>'original_late')::numeric=50 AND (ev_open->>'written_off_late')::numeric=50,
  'default evidence carries original_late and written_off_late (paid 30/0, unpaid 50/50)');
 PERFORM pg_temp.lc_assert((ev_paid->>'original_principal')::numeric=20 AND (ev_paid->>'original_interest')::numeric=10 AND (ev_open->>'written_off_principal')::numeric=20,'default evidence keeps the principal and interest keys');
 PERFORM pg_temp.lc_assert((SELECT "Principal Due"::numeric=0 AND "Interest Due"::numeric=10 AND "Late Charge Due"::numeric=30 AND "Late Charge Remaining"::numeric=0 AND "Amount Remaining"::numeric=0 FROM public."Charges" WHERE "Row ID"='LC-DF-paid'),
  'default writes the paid charge down to what was paid, late included (due 30 = paid 30)');
 PERFORM pg_temp.lc_assert((SELECT "Principal Due"::numeric=0 AND "Interest Due"::numeric=0 AND "Late Charge Due"::numeric=0 AND "Late Charge Remaining"::numeric=0 AND "Amount Remaining"::numeric=0 FROM public."Charges" WHERE "Row ID"='LC-DF-open'),
  'default writes the unpaid charge to 0 in all three parts');
END $$;
SELECT pg_temp.lc_assert((SELECT "Default Loss Amount"::numeric=100 FROM public."Loans" WHERE "Row ID"='LC-DF')
  AND (SELECT c."Late Charge Due"::numeric=0 AND r."Late Charge Paid"::numeric=0 AND r."Principal Paid"::numeric=100 AND r."Interest Paid"::numeric=-100
   FROM public."Charges" c JOIN public."Repayments" r ON r."Row ID"=c."Row ID" WHERE starts_with(c."Row ID",'df10:') AND c."Ref Loans"='LC-DF'),'the df10 pair carries late 0: loss 100 principal, interest -100');
-- Guards after the default: the original charges are immutable; a derived-only update (late columns included) recomputes.
SELECT pg_temp.lc_reject('Undo Default','UPDATE public."Charges" SET "Late Charge Due"=1::money WHERE "Row ID"=''LC-DF-open''');
SELECT pg_temp.lc_reject('Undo Default','DELETE FROM public."Charges" WHERE "Row ID"=''LC-DF-open''');
UPDATE public."Charges" SET "Total Paid"=999,"Amount Remaining"=999,"Late Charge Paid"=999,"Late Charge Remaining"=999 WHERE "Row ID"='LC-DF-open';
SELECT pg_temp.lc_assert((SELECT "Total Paid"::numeric=0 AND "Amount Remaining"::numeric=0 AND "Late Charge Paid"::numeric=0 AND "Late Charge Remaining"::numeric=0 FROM public."Charges" WHERE "Row ID"='LC-DF-open'),
 'derived-only update (late paid and remaining included) recomputes on a written-off charge');
UPDATE public."Loans" SET "Defaulted"=false WHERE "Row ID"='LC-DF';
SET CONSTRAINTS vc_repayment_changed, vc_payment_changed, vc_borrower_changed IMMEDIATE;
SELECT pg_temp.lc_assert((SELECT "Principal Due"::numeric=20 AND "Interest Due"::numeric=10 AND "Late Charge Due"::numeric=30 AND "Notes" IS NULL AND "Late Charge Remaining"::numeric=0 FROM public."Charges" WHERE "Row ID"='LC-DF-paid')
  AND (SELECT "Principal Due"::numeric=20 AND "Interest Due"::numeric=10 AND "Late Charge Due"::numeric=50 AND "Notes" IS NULL AND "Late Charge Remaining"::numeric=50 AND "Amount Remaining"::numeric=80 FROM public."Charges" WHERE "Row ID"='LC-DF-open')
  AND NOT EXISTS(SELECT 1 FROM public."Repayments" WHERE starts_with("Row ID",'df10:') AND "Ref Loans"='LC-DF'),'undo restores principal, interest and late of both charges and their notes; the df10 pair is gone');
-- Evidence without original_late (a V131 write-off) undoes with late 0: section 0 above, over the committed fixture of the pre-target route.

-- 6. Income and dashboards. Every figure as a delta from the state before the two payments.
CREATE FUNCTION pg_temp.lc_inc() RETURNS jsonb LANGUAGE sql AS $f$
 SELECT jsonb_build_object(
  'cd_income',c."Operating Income MTD",'cd_net',c."Net Profit MTD",
  'ps_total',p."Total Profit",'ps_today',p."Today's Profit",'ps_realized',p."Realized Profit MTD",'ps_income',p."Operating Income MTD",'ps_net',p."Net Profit",'ps_net_mtd',p."Net Profit MTD",
  'st_income',s."Operating Income MTD",'st_net',s."Net Profit MTD",'st_late',to_jsonb(s)->'Late Charges Received MTD',
  'mo_income',m."Operating Income",'mo_net',m."Net Profit",'mo_late',to_jsonb(m)->'Late Charges Received',
  'da_income',y."Operating Income",'da_net',y."Net Profit",'da_through',y."Net Profit Through Date",'da_late',to_jsonb(y)->'Late Charges Received',
  'ev_income',ev.income,'ev_late',ev.late,
  'rp_interest',rp.interest,'rp_late',rp.late,'rp_amount',rp.amount,'rp_ab',rp.ab,'pe_a',pe.a)
 FROM public."Cash Dashboard" c
 CROSS JOIN (SELECT * FROM public.olap_portfolio_summary LIMIT 1) p
 CROSS JOIN public.reporting_income_statement s
 CROSS JOIN (SELECT * FROM public.reporting_income_monthly WHERE "Is Current Month") m
 CROSS JOIN (SELECT * FROM public.reporting_income_daily WHERE "Date"=(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date) y
 CROSS JOIN (SELECT coalesce(sum("Income"),0) income,coalesce(sum((to_jsonb(e)->>'Late Charges Received')::numeric),0) late
   FROM public.reporting_income_events e WHERE e."Date"=public.olap_reporting_date()) ev
 CROSS JOIN (SELECT coalesce(sum("Interest Paid"::numeric),0) interest,coalesce(sum("Late Charge Paid"::numeric),0) late,coalesce(sum("Amount Received"),0) amount,
   coalesce(sum("Partner A Profit"+"Partner B Profit"),0) ab FROM public.olap_repayments_analytics WHERE "Ref Loans"='LC-I1') rp
 CROSS JOIN (SELECT coalesce(sum(allocated_interest),0) a FROM public.reporting_partner_earnings_v1 WHERE event_type='Interest' AND role='A'
   AND event_id IN (SELECT "Row ID" FROM public."Repayments" WHERE "Ref Loans"='LC-I1')) pe $f$;
CREATE TEMP TABLE lc_snaps(label text PRIMARY KEY,value jsonb NOT NULL) ON COMMIT DROP;
INSERT INTO lc_snaps VALUES ('base',pg_temp.lc_inc());
CREATE FUNCTION pg_temp.lc_phase(label text,compare_to text,gross numeric,late numeric,interest numeric) RETURNS void LANGUAGE plpgsql AS $f$
DECLARE b jsonb:=(SELECT value FROM lc_snaps WHERE lc_snaps.label=compare_to);v jsonb:=pg_temp.lc_inc();k text;want numeric;bad text:='';delta numeric;
BEGIN
 INSERT INTO lc_snaps VALUES (label,v);
 FOR k,want IN SELECT key,value FROM jsonb_each_text(jsonb_build_object(
   'cd_income',gross,'ps_total',gross,'ps_today',gross,'ps_realized',gross,'ps_income',gross,'st_income',gross,'mo_income',gross,'da_income',gross,'ev_income',gross,
   'cd_net',gross,'ps_net',gross,'ps_net_mtd',gross,'st_net',gross,'mo_net',gross,'da_net',gross,'da_through',gross,
   'st_late',late,'mo_late',late,'da_late',late,'ev_late',late,
   'rp_interest',interest,'rp_late',late,'rp_amount',gross,'rp_ab',gross,'pe_a',gross)) AS x(key,value) LOOP
  delta:=(v->>k)::numeric-(b->>k)::numeric;
  IF delta IS DISTINCT FROM want THEN bad:=bad||format(' %s=%s (want %s)',k,delta,want); END IF;
 END LOOP;
 IF bad<>'' THEN RAISE EXCEPTION 'FAILED: income % against %:%',label,compare_to,bad; END IF;
END $f$;
-- X: interest 10 only (no late); Y: interest 10 + late 50.
SELECT pg_temp.lc_legacy('LC-I1-PX','LC-BI','LC-I1-c1',10,'Single Full');
SELECT pg_temp.lc_phase('x','base',10,0,10);
SELECT pg_temp.lc_legacy('LC-I1-PY','LC-BI','LC-I1-c2',60,'Single Full');
SELECT pg_temp.lc_phase('y','x',60,50,10);
-- "Interest Paid" of olap_repayments_analytics stays interest only; the late part has its own column; Amount Received and the partner profit take both.
SELECT pg_temp.lc_assert((SELECT "Interest Paid"::numeric=10 AND "Late Charge Paid"::numeric=50 AND "Amount Received"::numeric=60 AND "Partner A Profit"::numeric+"Partner B Profit"::numeric=60
  FROM public.olap_repayments_analytics WHERE "Ref Payment"='LC-I1-PY'),'olap_repayments_analytics: Interest Paid 10, Late Charge Paid 50, Amount Received 60, partner profit 60');
SELECT pg_temp.lc_assert((SELECT sum("Partner A Profit"+"Partner B Profit"-("Interest Paid"::numeric+"Late Charge Paid"::numeric))=0 FROM public.olap_repayments_analytics WHERE "Ref Loans"='LC-I1'),
 'the partner allocation residual is 0 (interest + late)');
SELECT pg_temp.lc_assert((SELECT coalesce(sum(allocated_interest),0) FROM public.reporting_partner_earnings_v1 WHERE event_type='Interest' AND role='A' AND event_id IN (SELECT "Row ID" FROM public."Repayments" WHERE "Ref Loans"='LC-I1'))
  =(SELECT coalesce(sum("Partner A Profit"),0) FROM public.olap_repayments_analytics WHERE "Ref Loans"='LC-I1'),'partner earnings follow the repayment partner profit');
-- Column positions: the existing columns in place, the late memo column appended last as numeric (the other relations keep their shape).
SELECT pg_temp.lc_assert((SELECT array_agg(attname::text ORDER BY attnum DESC) FROM (SELECT attname,attnum FROM pg_attribute
   WHERE attrelid=r.rel::regclass AND attnum>0 AND NOT attisdropped ORDER BY attnum DESC LIMIT 2) a)=ARRAY[r.appended,r.previous]
  AND (SELECT count(*) FROM pg_attribute WHERE attrelid=r.rel::regclass AND attnum>0 AND NOT attisdropped)=r.width
  AND (SELECT format_type(atttypid,atttypmod) FROM pg_attribute WHERE attrelid=r.rel::regclass AND attname=r.appended)=r.kind,r.rel||' column positions')
FROM (VALUES ('public."Cash Dashboard"','Principal Write-offs MTD','Business Cash Held',10,'numeric'),
 ('public.olap_portfolio_summary','Principal Write-offs','Principal Write-offs MTD',46,'numeric'),
 ('public.reporting_income_statement','Late Charges Received MTD','Principal Write-offs MTD',20,'numeric'),
 ('public.reporting_income_monthly','Late Charges Received','Principal Write-offs',11,'numeric'),
 ('public.reporting_income_daily','Late Charges Received','Principal Write-offs',15,'numeric'),
 ('public.reporting_income_events','Late Charges Received','Principal Write-offs',6,'numeric')) r(rel,appended,previous,width,kind);

-- Referral rebate (owner decision: interest + late charge received): rebate = min(round(10% x (interest + late)), 1000).
-- A twin close where A pays late 50 books a rebate 5 higher than B's; the Loan Close projection equals the booked rebate (the late charge is
-- paid inside the closing payment); the 1,000 cap holds. Projections are read before the closing payments.
CREATE TEMP TABLE lc_rebate_projection ON COMMIT DROP AS
 SELECT v.loan,public.pwa_referral_rebate_projection_v1(v.loan,public.loan_close_calculation_v83(v.loan,(SELECT d FROM lc_day))) AS projection
 FROM (VALUES ('LC-RA'),('LC-RB'),('LC-RC')) v(loan);
SELECT pg_temp.lc_legacy('LC-RA-P1','LC-BRA','LC-RA-c',1350,'Single Full');
SELECT pg_temp.lc_legacy('LC-RB-P1','LC-BRB','LC-RB-c',1300,'Single Full');
SELECT pg_temp.lc_legacy('LC-RC-P1','LC-BRC','LC-RC-c',11050,'Single Full');
SET CONSTRAINTS vc_repayment_changed, vc_payment_changed, vc_borrower_changed, public.referral_loan_closed IMMEDIATE;
SELECT pg_temp.lc_assert((SELECT bool_and("Loan Status"='ปิดยอดแล้ว') FROM public."Loans" WHERE "Row ID" IN ('LC-RA','LC-RB','LC-RC'))
  AND pg_temp.lc_effects('LC-RA-P1')->'paid'=jsonb_build_object('p',1000,'i',300,'l',50) AND pg_temp.lc_effects('LC-RB-P1')->'paid'=jsonb_build_object('p',1000,'i',300,'l',0),'rebate twin: all three referred loans closed, A paid late 50');
SELECT pg_temp.lc_assert((SELECT count(*)=1 AND min("Amount"::numeric)=35 FROM public."Business Expenses" WHERE "Source Key"='REFERRAL_REBATE:LC-RA')
  AND (SELECT count(*)=1 AND min("Amount"::numeric)=30 FROM public."Business Expenses" WHERE "Source Key"='REFERRAL_REBATE:LC-RB')
  AND (SELECT a."Amount"::numeric-b."Amount"::numeric=5 FROM public."Business Expenses" a,public."Business Expenses" b WHERE a."Source Key"='REFERRAL_REBATE:LC-RA' AND b."Source Key"='REFERRAL_REBATE:LC-RB'),
 'rebate counts late: A (interest 300 + late 50) books 35, exactly 5 more than B (30)');
SELECT pg_temp.lc_assert((SELECT (projection->>'amount')::numeric FROM lc_rebate_projection WHERE loan='LC-RA')=(SELECT "Amount"::numeric FROM public."Business Expenses" WHERE "Source Key"='REFERRAL_REBATE:LC-RA')
  AND (SELECT (projection->>'amount')::numeric FROM lc_rebate_projection WHERE loan='LC-RB')=(SELECT "Amount"::numeric FROM public."Business Expenses" WHERE "Source Key"='REFERRAL_REBATE:LC-RB'),
 'the Loan Close projection amount equals the booked rebate, late charge paid inside the closing payment included (35 and 30)');
SELECT pg_temp.lc_assert((SELECT "Amount"::numeric=1000 FROM public."Business Expenses" WHERE "Source Key"='REFERRAL_REBATE:LC-RC')
  AND (SELECT (projection->>'amount')::numeric=1000 FROM lc_rebate_projection WHERE loan='LC-RC'),'the 1,000 cap holds in the booking and the projection (interest 10000 + late 50)');

-- Stored daily snapshots follow a late-only change: editing nothing but "Late Charge Due" of a past charge rebuilds the snapshots from its date
-- (business_history_refresh must treat the late columns as business fields; the pending figure includes late).
DO $$
DECLARE d date:=(SELECT d FROM lc_day);before_pending numeric;after_pending numeric;
BEGIN
 PERFORM public.refresh_daily_analytics_scoped(d-5,d-1,ARRAY[]::text[]);
 SELECT "Pending Charges EOD"::numeric INTO before_pending FROM public."Daily Analytics" WHERE "Snapshot Date"=d-1;
 PERFORM pg_temp.lc_setlate('LC-D1-w',50);
 SET CONSTRAINTS ALL IMMEDIATE;
 SELECT "Pending Charges EOD"::numeric INTO after_pending FROM public."Daily Analytics" WHERE "Snapshot Date"=d-1;
 PERFORM pg_temp.lc_assert(before_pending IS NOT NULL AND after_pending=before_pending+50,'a late-only charge change rebuilds the stored daily snapshots (Pending Charges EOD +50)');
END $$;
-- Notify content v3: v2 columns unchanged, late_charge_amount last; access like v1/v2.
CREATE ROLE lc_dispatch LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
GRANT mw_notify_dispatch_dev TO lc_dispatch WITH INHERIT TRUE, SET FALSE, ADMIN FALSE;
GRANT USAGE ON SCHEMA public TO lc_dispatch;
INSERT INTO public."Partners"("Row ID","Partner Role","Partner Name","Login Email","Email","Language Preference") VALUES('LC-TH','B','Thai recipient','lc-th@example.invalid','lc-th@example.invalid','ไทย');
CREATE TEMP TABLE lc_notice(name text PRIMARY KEY,delivery uuid,generation bigint) ON COMMIT DROP;
GRANT SELECT ON lc_notice TO PUBLIC;
DO $$
DECLARE c record;e uuid;s uuid;dl uuid;
BEGIN
 FOR c IN SELECT * FROM (VALUES ('late','payment.posted','payment','LC-N1-P1'),('nolate','payment.posted','payment','LC-I1-PX'),('loan','loan.created','loan','LC-N1')) v(name,kind,source_kind,source_id) LOOP
  INSERT INTO public.pwa_notification_events(dedupe_key,event_type,source_kind,source_id,source_version,actor_partner_id,actor_login_email)
   VALUES('LC-'||c.name,c.kind,c.source_kind,c.source_id,'v1','LC-ACT','lc-actor@example.invalid') RETURNING event_id INTO e;
  INSERT INTO public.pwa_push_subscriptions(issuer,subject,partner_id,endpoint_hash,endpoint,p256dh,auth)
   VALUES('https://securetoken.google.com/clever-oasis-508610-n7','lc-'||c.name,'LC-TH',encode(sha256(convert_to('lc-'||c.name,'UTF8')),'hex'),'https://fcm.googleapis.com/fcm/send/lc-'||c.name,'synthetic','synthetic') RETURNING subscription_id INTO s;
  INSERT INTO public.pwa_notification_deliveries(event_id,channel,destination_key,recipient_partner_id,subscription_id,subscription_version,state,lease_generation,lease_expires_at)
   VALUES(e,'web-push',encode(sha256(convert_to('lc-'||c.name,'UTF8')),'hex'),'LC-TH',s,1,'leased',3,clock_timestamp()+interval '60 seconds') RETURNING delivery_id INTO dl;
  INSERT INTO lc_notice VALUES(c.name,dl,3);
 END LOOP;
END $$;
DO $$
BEGIN
 PERFORM pg_temp.lc_assert(EXISTS(SELECT 1 FROM pg_proc WHERE oid='public.pwa_notify_content_v3(uuid,bigint)'::regprocedure AND prosecdef AND pg_get_userbyid(proowner)='mw_notify_owner_dev' AND 'search_path=pg_catalog, public'=ANY(proconfig))
   AND obj_description('public.pwa_notify_content_v3(uuid,bigint)'::regprocedure,'pg_proc')=obj_description('public.pwa_notify_content_v2(uuid,bigint)'::regprocedure,'pg_proc'),'v3 has the v2 owner, definer header, pinned search path and comment');
 PERFORM pg_temp.lc_assert(has_function_privilege('mw_notify_dispatch_dev','public.pwa_notify_content_v3(uuid,bigint)','EXECUTE')
   AND NOT has_function_privilege('mw_app_dev','public.pwa_notify_content_v3(uuid,bigint)','EXECUTE') AND NOT has_function_privilege('public','public.pwa_notify_content_v3(uuid,bigint)','EXECUTE'),'v3: notify dispatch executes; the application role and PUBLIC do not');
 PERFORM pg_temp.lc_assert(NOT EXISTS(SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(p.proacl) a WHERE p.oid='public.pwa_notify_content_v3(uuid,bigint)'::regprocedure AND a.grantee<>p.proowner
   AND pg_get_userbyid(a.grantee)<>'mw_notify_dispatch_dev'),'v3 ACL: the owner and the dispatch capability only (no integration agent)');
 PERFORM pg_temp.lc_assert((SELECT array_agg(u.n ORDER BY u.o) FROM pg_proc p,unnest(p.proargnames,p.proargmodes) WITH ORDINALITY u(n,m,o) WHERE p.oid='public.pwa_notify_content_v3(uuid,bigint)'::regprocedure AND u.m='t')
   =(SELECT array_agg(u.n ORDER BY u.o) FROM pg_proc p,unnest(p.proargnames,p.proargmodes) WITH ORDINALITY u(n,m,o) WHERE p.oid='public.pwa_notify_content_v2(uuid,bigint)'::regprocedure AND u.m='t')||ARRAY['late_charge_amount']::text[],
  'v3 returns the v2 columns and late_charge_amount last');
END $$;
SET SESSION AUTHORIZATION lc_dispatch;
DO $$
DECLARE r3 record;r2 record;k record;
BEGIN
 FOR k IN SELECT * FROM lc_notice ORDER BY name LOOP
  SELECT * INTO r3 FROM public.pwa_notify_content_v3(k.delivery,k.generation);
  SELECT * INTO r2 FROM public.pwa_notify_content_v2(k.delivery,k.generation);
  IF to_jsonb(r3)-'late_charge_amount' IS DISTINCT FROM to_jsonb(r2) THEN RAISE EXCEPTION 'FAILED: v3 differs from v2 apart from late_charge_amount for %: % vs %',k.name,to_jsonb(r3),to_jsonb(r2); END IF;
  IF k.name='late' AND (r3.late_charge_amount IS DISTINCT FROM 50 OR r3.amount IS DISTINCT FROM 60) THEN RAISE EXCEPTION 'FAILED: v3 late payment: amount %, late %',r3.amount,r3.late_charge_amount; END IF;
  IF k.name='nolate' AND coalesce(r3.late_charge_amount,0)<>0 THEN RAISE EXCEPTION 'FAILED: v3 payment without late: %',r3.late_charge_amount; END IF;
  IF k.name='loan' AND coalesce(r3.late_charge_amount,0)<>0 THEN RAISE EXCEPTION 'FAILED: v3 loan event carries no late: %',r3.late_charge_amount; END IF;
 END LOOP;
 -- The capability still reads no source table directly.
 BEGIN PERFORM 1 FROM public."Repayments" LIMIT 1; RAISE EXCEPTION 'FAILED: dispatch capability read Repayments directly';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET SESSION AUTHORIZATION;
-- History content v2 (the API capability, the caller as recipient): v1 columns plus "lateChargeAmount" last.
CREATE ROLE lc_api LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
GRANT mw_notify_api_dev TO lc_api WITH INHERIT TRUE, SET FALSE, ADMIN FALSE;
GRANT USAGE ON SCHEMA public TO lc_api;
CREATE TEMP TABLE lc_event ON COMMIT DROP AS SELECT k.name,d.event_id FROM lc_notice k JOIN public.pwa_notification_deliveries d ON d.delivery_id=k.delivery;
GRANT SELECT ON lc_event TO PUBLIC;
DO $$
BEGIN
 PERFORM pg_temp.lc_assert(EXISTS(SELECT 1 FROM pg_proc WHERE oid='public.pwa_notify_history_content_v2(jsonb,uuid[])'::regprocedure AND prosecdef AND pg_get_userbyid(proowner)='mw_notify_owner_dev' AND 'search_path=pg_catalog, public'=ANY(proconfig))
   AND has_function_privilege('mw_notify_api_dev','public.pwa_notify_history_content_v2(jsonb,uuid[])','EXECUTE')
   AND NOT has_function_privilege('mw_app_dev','public.pwa_notify_history_content_v2(jsonb,uuid[])','EXECUTE') AND NOT has_function_privilege('public','public.pwa_notify_history_content_v2(jsonb,uuid[])','EXECUTE')
   AND NOT has_function_privilege('mw_notify_dispatch_dev','public.pwa_notify_history_content_v2(jsonb,uuid[])','EXECUTE'),'history v2: notify owner definer, pinned search_path, API capability executes, nobody else');
 PERFORM pg_temp.lc_assert((SELECT array_agg(u.n ORDER BY u.o) FROM pg_proc p,unnest(p.proargnames,p.proargmodes) WITH ORDINALITY u(n,m,o) WHERE p.oid='public.pwa_notify_history_content_v2(jsonb,uuid[])'::regprocedure AND u.m='t')
   =(SELECT array_agg(u.n ORDER BY u.o) FROM pg_proc p,unnest(p.proargnames,p.proargmodes) WITH ORDINALITY u(n,m,o) WHERE p.oid='public.pwa_notify_history_content_v1(jsonb,uuid[])'::regprocedure AND u.m='t')||ARRAY['lateChargeAmount']::text[],'history v2 returns the v1 columns and lateChargeAmount last');
END $$;
SET SESSION AUTHORIZATION lc_api;
DO $$
DECLARE actor jsonb:=jsonb_build_object('issuer','https://securetoken.google.com/clever-oasis-508610-n7','subject','lc-late','partnerId','LC-TH','loginEmail','lc-th@example.invalid');
 ids uuid[];r1 record;r2 record;k record;n integer:=0;
BEGIN
 SELECT array_agg(event_id) INTO ids FROM lc_event;
 FOR k IN SELECT * FROM lc_event ORDER BY name LOOP
  SELECT * INTO r1 FROM public.pwa_notify_history_content_v1(actor,ARRAY[k.event_id]) r;
  SELECT * INTO r2 FROM public.pwa_notify_history_content_v2(actor,ARRAY[k.event_id]) r;
  IF r2."eventId" IS NULL THEN CONTINUE; END IF;
  n:=n+1;
  IF to_jsonb(r2)-'lateChargeAmount' IS DISTINCT FROM to_jsonb(r1) THEN RAISE EXCEPTION 'FAILED: history v2 differs from v1 apart from lateChargeAmount for %: % vs %',k.name,to_jsonb(r2),to_jsonb(r1); END IF;
  IF k.name='late' AND (r2."lateChargeAmount" IS DISTINCT FROM 50 OR r2.amount IS DISTINCT FROM 60) THEN RAISE EXCEPTION 'FAILED: history v2 late payment: amount %, late %',r2.amount,r2."lateChargeAmount"; END IF;
  IF k.name IN ('nolate','loan') AND coalesce(r2."lateChargeAmount",0)<>0 THEN RAISE EXCEPTION 'FAILED: history v2 % carries late %',k.name,r2."lateChargeAmount"; END IF;
 END LOOP;
 IF n<>3 THEN RAISE EXCEPTION 'FAILED: history v2 returned % of 3 events for the recipient',n; END IF;
 BEGIN PERFORM public.pwa_notify_history_content_v2(actor,array_fill(gen_random_uuid(),ARRAY[27])); RAISE EXCEPTION 'FAILED: over-page request accepted';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'invalid_request' THEN RAISE; END IF; END;
END $$;
RESET SESSION AUTHORIZATION;
SELECT 'Late charge regressions passed' AS result;
ROLLBACK;
