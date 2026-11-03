-- R117 hotfix (owner-authorized PROD hotfix, 3 November 2026; Archie's V131 design). V124 to V130 are applied and stay.
-- Defect: a Receive payment (pwa_submit_selected_charges_v1) or an agent receipt that closes two referred loans of one
-- borrower failed with 23505 on pwa_payment_commands_pkey. The V124 default offset (the ELSIF branch of
-- create_referral_rebate) named the offset ro122:<closing payment>, so the second closed loan derived the same offset
-- payment id and the same journal request id, and the whole payment rolled back (503 command_unavailable).
-- Fix: the default offset is ro122:<closing payment>:<closed loan> (one offset payment, one system.rebate-offset journal
-- row and one request id per closed loan; the request id derivation over the offset id is unchanged). Before planning,
-- the branch runs the deferred vc_repayment_changed trigger's own work (r051_flush_parents charge, then loan: the
-- transaction's pending balance refreshes): the second offset of the same transaction otherwise planned on the charges
-- the first offset had just paid (stale "Amount Remaining"), its allocation of 0 failed the posting guard and that
-- rebate fell back to a payable expense. Offsets already
-- posted keep their ids; deletion follows "Business Expenses"."Ref Offset Payment", not the id shape. The Loan Close
-- branch (pwa.rebate_offset, one loan per command) and its ro122:<closing payment> P4C05 check are unchanged.
-- One function only (CREATE OR REPLACE, full V124 body; V125 to V130 did not touch it); no table, column, constraint,
-- trigger, grant or data change. Preflight: the runner can replace the function (superuser, or inherits its owner).
-- Self-check: owner, ACL, security and comment unchanged; the new expression is in place.

DO $preflight$
DECLARE problems text[]:='{}'; definition text;
BEGIN
 IF current_database() NOT IN ('loan_manager_dev','payment_rehearsal','loan_manager_prod') THEN RAISE EXCEPTION 'Unsupported application database'; END IF;
 definition:=pg_get_functiondef('public.create_referral_rebate(text)'::regprocedure);
 IF position('system.rebate-offset' IN definition)=0 OR position($s$offset_id:='ro122:'||l."Ref Closing Payment";$s$ IN definition)=0 THEN problems:=problems||'V131 needs the V124 create_referral_rebate'::text; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid='public.create_referral_rebate(text)'::regprocedure AND (pg_has_role(current_user,p.proowner,'USAGE') OR EXISTS(SELECT 1 FROM pg_roles WHERE rolname=current_user AND rolsuper))) THEN problems:=problems||'current_user cannot replace create_referral_rebate'::text; END IF;
 IF cardinality(problems)>0 THEN RAISE EXCEPTION 'V131 preflight: %',array_to_string(problems,'; '); END IF;
END $preflight$;

CREATE TEMP TABLE v131_before ON COMMIT DROP AS
 SELECT p.oid::regprocedure::text AS routine,pg_get_userbyid(p.proowner) AS owner,coalesce(p.proacl::text,'') AS acl,p.prosecdef AS definer,obj_description(p.oid,'pg_proc') AS comment
 FROM pg_proc p WHERE p.oid='public.create_referral_rebate(text)'::regprocedure;

-- The rebate (body of V124; the changes are marked R117 V131).
CREATE OR REPLACE FUNCTION public.create_referral_rebate(p_loan text) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
DECLARE l public."Loans"%ROWTYPE; referrer text; payee text; principal numeric; profit numeric; rebate numeric;
 r jsonb; offset_id text; ids text; actual public."Payments"%ROWTYPE; loan_key text;
 -- R111 V124: the automatic offset outside the Loan Close command.
 plan jsonb; offset_plan jsonb; covered numeric; creator text; h text; request uuid; canonical text;
BEGIN
 IF pg_trigger_depth()<1 THEN RAISE EXCEPTION 'Referral creation is only supported by loan-close trigger'; END IF;
 SELECT * INTO l FROM public."Loans" WHERE "Row ID"=p_loan FOR UPDATE;
 IF l."Loan Status" IS DISTINCT FROM 'ปิดยอดแล้ว' OR coalesce(l."Defaulted",false)
   OR l."Close Date" IS NULL OR l."Ref Closing Payment" IS NULL THEN RETURN; END IF;
 IF EXISTS(SELECT 1 FROM public."Business Expenses" WHERE "Source Key"='REFERRAL_REBATE:'||p_loan) THEN RETURN; END IF;
 IF NOT EXISTS(SELECT 1 FROM public."Payments" WHERE "Row ID"=l."Ref Closing Payment" AND "Status"='Posted' AND "Amount Received"::numeric>0) THEN RETURN; END IF;
 SELECT sum("Principal Paid"::numeric),sum("Interest Paid"::numeric) INTO principal,profit
 FROM public."Repayments" WHERE "Ref Loans"=p_loan;
 IF coalesce(principal,0)<l."Principal Amount"::numeric OR coalesce(profit,0)<=0 THEN RETURN; END IF;
 SELECT "Ref Referrer" INTO referrer FROM public."Borrowers" WHERE "Row ID"=l."Ref Borrowers";
 IF referrer IS NULL THEN RETURN; END IF;
 SELECT "Borrower Name" INTO payee FROM public."Borrowers" WHERE "Row ID"=referrer;
 rebate:=least(round(profit*0.10),1000);
 IF rebate<=0 THEN RETURN; END IF;
 -- R111 V123: the notes name the closed loan by the key the app shows (paymentLoanDisplayKey: borrower - English name,
 -- principal, loan day/month, original rate), not its Row ID.
 SELECT coalesce(b."Borrower Name",'')||' - '||coalesce(b."Description",'')||'-'||coalesce('฿'||to_char(round(l."Principal Amount"::numeric),'FM999,999,999,999,990'),'')
   ||'-'||coalesce(to_char(l."Loan Date",'DD/MM'),'')||'-'||coalesce(l."Original Daily Interest Rate"::text||'%','Unavailable')
  INTO loan_key FROM public."Borrowers" b WHERE b."Row ID"=l."Ref Borrowers";
 -- R111: inside the closing command, a chosen offset books the stored plan's charges and posts the offset payment on the
 -- referrer's loans (its plan is result_json.rebate.offsetPlan); drift is P4C05 and rolls the close back.
 IF current_setting('pwa.rebate_offset',true) IS NOT DISTINCT FROM l."Ref Closing Payment" THEN
  SELECT j.result_json->'rebate' INTO r FROM public.pwa_payment_commands j WHERE j.contract_version=2 AND j.outcome='applied'
   AND j.result_json->>'paymentId'=l."Ref Closing Payment" AND j.canonical_json::jsonb#>>'{command,operation}'='loan.close';
  IF r->>'offsetPaymentId' IS NOT NULL THEN
   IF (r->>'amount')::numeric IS DISTINCT FROM rebate OR r->>'referrerId' IS DISTINCT FROM referrer OR r->>'offsetPaymentId' IS DISTINCT FROM 'ro122:'||l."Ref Closing Payment" THEN RAISE EXCEPTION USING ERRCODE='P4C05'; END IF;
   offset_id:=r->>'offsetPaymentId';
   PERFORM public.pwa_apply_pay_forward_v1('[]'::jsonb,r->'materialize',l."Close Date");
   SELECT string_agg(value->>'chargeId',' , ' ORDER BY (value->>'chargeId') COLLATE "C") INTO ids FROM jsonb_array_elements(r#>'{offsetPlan,allocations}');
   INSERT INTO public."Payments"("Row ID","Ref Borrower","Payment Date","Amount Received","Payment Method","Allocation Method","Selected Charge IDs","Ref Received By Cash Account","Notes","Created By","Status")
    VALUES(offset_id,referrer,l."Close Date",(r->>'offsetAmount')::numeric::money,'Referral Rebate Offset','Selected Charges',ids,r#>>'{offsetPlan,cashAccountId}','Rebate from loan '||coalesce(loan_key,p_loan),
     (SELECT "Created By" FROM public."Payments" WHERE "Row ID"=l."Ref Closing Payment"),'Processing');
   SELECT * INTO actual FROM public."Payments" WHERE "Row ID"=offset_id;
   IF actual."Status" IS DISTINCT FROM 'Posted' OR actual."Amount Received"::numeric IS DISTINCT FROM (r->>'offsetAmount')::numeric THEN RAISE EXCEPTION USING ERRCODE='P4C05'; END IF;
  END IF;
 -- R111 V124: a referred loan closed today by an ordinary payment (the manual command or the agent receipt command, run by
 -- the journal owner) settles the rebate on the referrer's open loans by default: the pay-forward plan (forward only) under
 -- the referrer's borrower -> loans -> charges locks (after the closing borrower's), its charges booked by the shared
 -- writer, and the offset payment ro122:<closing payment>:<closed loan> posted with an explicit plan journalled as
 -- system.rebate-offset (R117 V131: one offset per closed loan, so one payment that closes several referred loans posts
 -- one offset, one journal row and one request id for each; the Loan Close branch above keeps ro122:<closing payment>).
 -- A refused schedule (P0001, P4C05) leaves the rebate payable as before and never fails the closing payment; other
 -- errors (a deadlock, a lock timeout) propagate. A historical re-post (close date not today) stays expense only.
 ELSIF (current_user=CASE current_database() WHEN 'loan_manager_prod' THEN 'mw_app_prod_journal_owner' ELSE 'mw_app_dev_journal_owner' END
   AND l."Close Date"=(transaction_timestamp() AT TIME ZONE 'Asia/Bangkok')::date AND referrer IS DISTINCT FROM l."Ref Borrowers"
   AND EXISTS(SELECT 1 FROM public."Loans" x WHERE x."Ref Borrowers"=referrer AND x."Loan Status"='ยังไม่ปิดยอด' AND NOT coalesce(x."Defaulted",false))) THEN
  BEGIN
   PERFORM 1 FROM public."Borrowers" WHERE "Row ID"=referrer FOR UPDATE;
   PERFORM 1 FROM public."Loans" WHERE "Ref Borrowers"=referrer ORDER BY "Row ID" COLLATE "C" FOR UPDATE;
   PERFORM 1 FROM public."Charges" ch JOIN public."Loans" x ON x."Row ID"=ch."Ref Loans" WHERE x."Ref Borrowers"=referrer ORDER BY ch."Row ID" COLLATE "C" FOR UPDATE OF ch;
   -- R117 V131: an earlier offset in this transaction (another loan closed by the same payment) paid charges whose
   -- materialized balances refresh only at commit (deferred vc_repayment_changed); the plan selects on "Amount Remaining",
   -- so run that trigger's own work now (the pending charge and loan refreshes of this transaction).
   PERFORM public.r051_flush_parents('charge'); PERFORM public.r051_flush_parents('loan');
   plan:=public.pwa_pay_forward_plan_v1(referrer,rebate,l."Close Date",'{"forward":true,"principal":[],"loans":null}'::jsonb);
   covered:=rebate-(plan->>'uncovered')::numeric;
   IF covered>0 THEN
    offset_id:='ro122:'||l."Ref Closing Payment"||':'||p_loan; -- R117 V131: one offset per closed loan
    creator:=coalesce(nullif(btrim((SELECT "Created By" FROM public."Payments" WHERE "Row ID"=l."Ref Closing Payment")),''),'SQL:loan-close');
    offset_plan:=jsonb_build_object('borrowerId',referrer,'amountReceived',trunc(covered)::text,'allocations',plan->'allocations','allocationMethod','Selected Charges',
     'targetChargeId',NULL,'targetLoanId',NULL,'cashAccountId',public.default_cash_account('ch:lisa'),'paymentDate',l."Close Date"::text,'paymentMethod','Referral Rebate Offset');
    IF offset_plan->>'cashAccountId' IS NULL THEN RAISE EXCEPTION USING ERRCODE='P4C05'; END IF;
    -- One documented derivation: request id = md5('mw-credit-rebate-offset-v1:'||offset payment id) with the UUID v4 bits.
    h:=md5('mw-credit-rebate-offset-v1:'||offset_id);
    request:=(substr(h,1,8)||'-'||substr(h,9,4)||'-4'||substr(h,14,3)||'-'||substr('89ab',(get_byte(decode(substr(h,17,2),'hex'),0)%4)+1,1)||substr(h,18,3)||'-'||substr(h,21,12))::uuid;
    canonical:=jsonb_build_object('contractVersion',2,'requestId',request::text,
     'actor',jsonb_build_object('issuer','SQL','subject','loan-close','partnerId','SQL:loan-close','loginEmail',creator),
     'command',jsonb_build_object('operation','system.rebate-offset','targetType','loan','targetId',p_loan))::text;
    INSERT INTO public.pwa_payment_commands(request_id,contract_version,actor_issuer,actor_subject,actor_partner_id,actor_login_email,canonical_json,payload_sha256,outcome,payment_id,rejection_code,result_json)
    VALUES(request,2,'SQL','loan-close','SQL:loan-close',creator,canonical,encode(sha256(convert_to(canonical,'UTF8')),'hex'),'applied',NULL,NULL,
     jsonb_build_object('operation','system.rebate-offset','targetType','loan','targetId',p_loan,'paymentId',offset_id,'plan',offset_plan,'predecessorRequestId',NULL,'sourceCreatedBy',creator));
    PERFORM public.pwa_apply_pay_forward_v1('[]'::jsonb,plan->'materialize',l."Close Date");
    SELECT string_agg(value->>'chargeId',' , ' ORDER BY (value->>'chargeId') COLLATE "C") INTO ids FROM jsonb_array_elements(plan->'allocations');
    INSERT INTO public."Payments"("Row ID","Ref Borrower","Payment Date","Amount Received","Payment Method","Allocation Method","Selected Charge IDs","Ref Received By Cash Account","Notes","Created By","Status")
     VALUES(offset_id,referrer,l."Close Date",covered::money,'Referral Rebate Offset','Selected Charges',ids,offset_plan->>'cashAccountId','Rebate from loan '||coalesce(loan_key,p_loan),creator,'Processing');
    SELECT * INTO actual FROM public."Payments" WHERE "Row ID"=offset_id;
    IF actual."Status" IS DISTINCT FROM 'Posted' OR actual."Amount Received"::numeric IS DISTINCT FROM covered THEN RAISE EXCEPTION USING ERRCODE='P4C05'; END IF;
   END IF;
  EXCEPTION WHEN SQLSTATE 'P0001' OR SQLSTATE 'P4C05' THEN offset_id:=NULL;
  END;
 END IF;
 INSERT INTO public."Business Expenses"("Row ID","Expense Date","Expense Category","Amount","Payee Name",
  "Ref Payee Borrower","Ref Related Borrower","Ref Related Loan","Source Type","Source Key","Gross Profit Basis","Rule Version","Created By","Ref Offset Payment")
 VALUES('rr1:'||p_loan,l."Close Date",'Referral Rebate / เงินคืนค่าแนะนำลูกค้า',rebate::money,payee,referrer,l."Ref Borrowers",p_loan,
  'Referral Rebate','REFERRAL_REBATE:'||p_loan,profit::money,'REFERRAL_REBATE_V1','SQL:loan-close',offset_id)
 ON CONFLICT ("Source Key") WHERE nullif(btrim("Source Key"),'') IS NOT NULL DO NOTHING;
END $$;

-- Self-check: owner, privileges, security and comment unchanged; one offset per closed loan on the default path; the Loan
-- Close branch keeps its check.
DO $check$
DECLARE bad text; definition text:=pg_get_functiondef('public.create_referral_rebate(text)'::regprocedure);
BEGIN
 SELECT string_agg(o.routine,', ') INTO bad FROM v131_before o JOIN pg_proc p ON p.oid=o.routine::regprocedure
  WHERE pg_get_userbyid(p.proowner)<>o.owner OR coalesce(p.proacl::text,'')<>o.acl OR p.prosecdef<>o.definer OR obj_description(p.oid,'pg_proc') IS DISTINCT FROM o.comment;
 IF bad IS NOT NULL OR (SELECT count(*) FROM v131_before)<>1 THEN RAISE EXCEPTION 'V131 changed the owner, privileges, security or comment of %',coalesce(bad,'an unexpected function set'); END IF;
 IF position($s$offset_id:='ro122:'||l."Ref Closing Payment"||':'||p_loan;$s$ IN definition)=0
  OR position($s$offset_id:='ro122:'||l."Ref Closing Payment";$s$ IN definition)>0
  OR position($s$r->>'offsetPaymentId' IS DISTINCT FROM 'ro122:'||l."Ref Closing Payment" THEN$s$ IN definition)=0
  OR position($s$PERFORM public.r051_flush_parents('charge')$s$ IN definition)=0
  OR position($s$WHEN SQLSTATE 'P0001' OR SQLSTATE 'P4C05' THEN offset_id:=NULL$s$ IN definition)=0 THEN RAISE EXCEPTION 'V131: create_referral_rebate was not replaced as designed'; END IF;
END $check$;
