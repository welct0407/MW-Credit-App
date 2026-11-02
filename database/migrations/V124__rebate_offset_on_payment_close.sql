-- R111 extension (owner: "Go ahead with 1 and 2", 2 November 2026; Archie's V124 design). V122 and V123 are applied and stay.
-- 1. Default offset outside the Loan Close command: create_referral_rebate (same body otherwise) settles the rebate of a
--    referred loan closed today by an ordinary payment on the referrer's open loans through the pay-forward plan, when
--    the trigger runs for the journal owner (the manual receiving command and the agent receipt command, which now fire
--    the deferred referral trigger right after the payment posts, as the close command does). The offset payment
--    ro122:<closing payment> posts with an explicit plan journalled as one contract-2 row, operation system.rebate-offset
--    (actor SQL / loan-close; request id = md5('mw-credit-rebate-offset-v1:'||offset id) with the UUID v4 bits), which
--    pwa_effective_payment_plan_v2 now resolves. Locks: closing borrower first, then the referrer. A refused referrer
--    schedule (P0001, P4C05) leaves the rebate payable and the payment posts; deadlocks propagate (command_busy).
--    The close command's stored choice (pwa.rebate_offset) is unchanged; a historical re-post stays expense only.
-- 2. pwa_notify_content_v2 (same columns) also gives the rebate facts to the "Payment received" push of the payment that
--    closed a referred loan; the notify owner reads "Loans"."Ref Closing Payment" for it.
-- Functions and one column grant only; no table, column, constraint or trigger change. CREATE OR REPLACE and counted
-- replacements keep owners and privileges (self-check). The notify function is the notify owner's: the runner needs its
-- maintenance window as for V122.

DO $preflight$
DECLARE suffix text:=CASE current_database() WHEN 'loan_manager_prod' THEN 'prod' ELSE 'dev' END; problems text[]:='{}'; notify_owner text;
BEGIN
 IF current_database() NOT IN ('loan_manager_dev','payment_rehearsal','loan_manager_prod') THEN RAISE EXCEPTION 'Unsupported application database'; END IF;
 notify_owner:='mw_notify_owner_'||suffix;
 IF obj_description('public.pwa_apply_pay_forward_v1(jsonb,jsonb,date)'::regprocedure,'pg_proc') NOT LIKE 'mw-access:governance%' OR to_regprocedure('public.pwa_notify_content_v2(uuid,bigint)') IS NULL THEN problems:=problems||'V124 needs V122 and V123'::text; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=current_user AND rolsuper) AND EXISTS(SELECT 1 FROM pg_roles WHERE rolname=notify_owner) THEN
  IF NOT pg_has_role(current_user,notify_owner,'SET') THEN problems:=problems||format('%s cannot SET ROLE %s (temporary maintenance membership required for CREATE OR REPLACE of its function)',current_user,notify_owner); END IF;
 END IF;
 IF cardinality(problems)>0 THEN RAISE EXCEPTION 'V124 preflight: %',array_to_string(problems,'; '); END IF;
END $preflight$;

CREATE TEMP TABLE v124_before ON COMMIT DROP AS
 SELECT p.oid::regprocedure::text AS routine,pg_get_userbyid(p.proowner) AS owner,coalesce(p.proacl::text,'') AS acl,p.prosecdef AS definer,obj_description(p.oid,'pg_proc') AS comment
 FROM pg_proc p WHERE p.oid IN ('public.create_referral_rebate(text)'::regprocedure,'public.pwa_effective_payment_plan_v2(text)'::regprocedure,'public.pwa_submit_selected_charges_v1(text)'::regprocedure,
  'public.pwa_submit_agent_receipt_v1(text)'::regprocedure,'public.pwa_notify_content_v2(uuid,bigint)'::regprocedure,'public.pwa_apply_pay_forward_v1(jsonb,jsonb,date)'::regprocedure);

-- 1a. The rebate (body of V123 with the automatic offset; changes marked R111 V124).
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
 -- writer, and the offset payment ro122:<closing payment> posted with an explicit plan journalled as system.rebate-offset.
 -- A refused schedule (P0001, P4C05) leaves the rebate payable as before and never fails the closing payment; other
 -- errors (a deadlock, a lock timeout) propagate. A historical re-post (close date not today) stays expense only.
 ELSIF (current_user=CASE current_database() WHEN 'loan_manager_prod' THEN 'mw_app_prod_journal_owner' ELSE 'mw_app_dev_journal_owner' END
   AND l."Close Date"=(transaction_timestamp() AT TIME ZONE 'Asia/Bangkok')::date AND referrer IS DISTINCT FROM l."Ref Borrowers"
   AND EXISTS(SELECT 1 FROM public."Loans" x WHERE x."Ref Borrowers"=referrer AND x."Loan Status"='ยังไม่ปิดยอด' AND NOT coalesce(x."Defaulted",false))) THEN
  BEGIN
   PERFORM 1 FROM public."Borrowers" WHERE "Row ID"=referrer FOR UPDATE;
   PERFORM 1 FROM public."Loans" WHERE "Ref Borrowers"=referrer ORDER BY "Row ID" COLLATE "C" FOR UPDATE;
   PERFORM 1 FROM public."Charges" ch JOIN public."Loans" x ON x."Row ID"=ch."Ref Loans" WHERE x."Ref Borrowers"=referrer ORDER BY ch."Row ID" COLLATE "C" FOR UPDATE OF ch;
   plan:=public.pwa_pay_forward_plan_v1(referrer,rebate,l."Close Date",'{"forward":true,"principal":[],"loans":null}'::jsonb);
   covered:=rebate-(plan->>'uncovered')::numeric;
   IF covered>0 THEN
    offset_id:='ro122:'||l."Ref Closing Payment";
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


-- 1b. The offset payment's explicit plan is also the system.rebate-offset journal row's (two counted replacements).
DO $plan$
DECLARE definition text;old text:=$o$IN('loan.create','loan.close','charge.create')) OR$o$;new text:=$n$IN('loan.create','loan.close','charge.create','system.rebate-offset')) OR$n$;
BEGIN
 SELECT pg_get_functiondef('public.pwa_effective_payment_plan_v2(text)'::regprocedure) INTO definition;
 IF (length(definition)-length(replace(definition,old,'')))/length(old)<>2 THEN RAISE EXCEPTION 'V124: unexpected payment provenance';END IF;
 EXECUTE replace(definition,old,new);
END $plan$;

-- 1c. The manual receiving command and the agent receipt command run the deferred referral trigger right after the
-- payment posts (deferred before the insert even when the caller made constraints immediate), as the close command does.
-- A payment that closes no referred loan queues no referral event, so nothing else changes.
DO $commands$
DECLARE definition text;
 m_old1 text:=$o$  INSERT INTO public."Payments"("Row ID","Ref Borrower","Ref Received By Cash Account","Status","Amount Received","Payment Date","Payment Method","Allocation Method","Selected Charge IDs","Ref Target Charge","Created By","Notes","Uploaded Receipt","Bank Reference","Created At")$o$;
 m_new1 text:=$n$  SET CONSTRAINTS public.referral_loan_closed DEFERRED; -- R111 V124: fired below, once the payment is Posted.
  INSERT INTO public."Payments"("Row ID","Ref Borrower","Ref Received By Cash Account","Status","Amount Received","Payment Date","Payment Method","Allocation Method","Selected Charge IDs","Ref Target Charge","Created By","Notes","Uploaded Receipt","Bank Reference","Created At")$n$;
 m_old2 text:=$o$  IF posted_status IS DISTINCT FROM 'Posted' OR posted_amount IS DISTINCT FROM (c->>'amountReceived')::numeric THEN RAISE EXCEPTION USING ERRCODE='XX000',MESSAGE='Unexpected posting result';END IF;$o$;
 m_new2 text:=$n$  IF posted_status IS DISTINCT FROM 'Posted' OR posted_amount IS DISTINCT FROM (c->>'amountReceived')::numeric THEN RAISE EXCEPTION USING ERRCODE='XX000',MESSAGE='Unexpected posting result';END IF;
  -- R111 V124: a referred loan this payment closed gets its rebate (and default offset) now, inside this command.
  SET CONSTRAINTS public.referral_loan_closed IMMEDIATE;
  SET CONSTRAINTS public.referral_loan_closed DEFERRED;$n$;
 a_old1 text:=$o$  INSERT INTO public."Payments"("Row ID","Ref Borrower","Ref Received By Cash Account","Status","Amount Received","Payment Date","Created At","Payment Method","Allocation Method","Bank Reference","Created By","Notes")$o$;
 a_new1 text:=$n$  SET CONSTRAINTS public.referral_loan_closed DEFERRED; -- R111 V124: fired below, once the payment is Posted.
  INSERT INTO public."Payments"("Row ID","Ref Borrower","Ref Received By Cash Account","Status","Amount Received","Payment Date","Created At","Payment Method","Allocation Method","Bank Reference","Created By","Notes")$n$;
 a_old2 text:=$o$  -- R095: learn the payer lines (row locked above) only while the column still equals what the agent read; drift skips it$o$;
 a_new2 text:=$n$  -- R111 V124: a referred loan this receipt closed gets its rebate (and default offset) now, inside this command.
  SET CONSTRAINTS public.referral_loan_closed IMMEDIATE;
  SET CONSTRAINTS public.referral_loan_closed DEFERRED;
  -- R095: learn the payer lines (row locked above) only while the column still equals what the agent read; drift skips it$n$;
BEGIN
 SELECT pg_get_functiondef('public.pwa_submit_selected_charges_v1(text)'::regprocedure) INTO definition;
 IF (length(definition)-length(replace(definition,m_old1,'')))/length(m_old1)<>1 OR (length(definition)-length(replace(definition,m_old2,'')))/length(m_old2)<>1 THEN RAISE EXCEPTION 'V124: unexpected manual command text';END IF;
 EXECUTE replace(replace(definition,m_old1,m_new1),m_old2,m_new2);
 SELECT pg_get_functiondef('public.pwa_submit_agent_receipt_v1(text)'::regprocedure) INTO definition;
 IF (length(definition)-length(replace(definition,a_old1,'')))/length(a_old1)<>1 OR (length(definition)-length(replace(definition,a_old2,'')))/length(a_old2)<>1 THEN RAISE EXCEPTION 'V124: unexpected agent receipt command text';END IF;
 EXECUTE replace(replace(definition,a_old1,a_new1),a_old2,a_new2);
END $commands$;

-- 2. Push facts: the rebate of a referred loan also on the "Payment received" push of the payment that closed it.
DO $grant$
BEGIN
 EXECUTE format('GRANT SELECT ("Ref Closing Payment") ON public."Loans" TO %I','mw_notify_owner_'||CASE current_database() WHEN 'loan_manager_prod' THEN 'prod' ELSE 'dev' END);
END $grant$;
CREATE OR REPLACE FUNCTION public.pwa_notify_content_v2(delivery uuid, generation bigint) RETURNS TABLE(found boolean, event_type text, language text, borrower_name text, amount numeric, rebate_amount numeric, rebate_payee text, rebate_payable numeric, payment_method text, rebate_loan text)
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
  (SELECT x."Ref Related Loan" FROM public."Business Expenses" x WHERE e.source_kind='payment' AND x."Ref Offset Payment"=e.source_id ORDER BY x."Row ID" COLLATE "C" LIMIT 1)
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

-- Self-check: owners, privileges, security and comments unchanged; the R111 V124 changes are in place.
DO $check$
DECLARE bad text;
BEGIN
 SELECT string_agg(o.routine,', ') INTO bad FROM v124_before o JOIN pg_proc p ON p.oid=o.routine::regprocedure
  WHERE pg_get_userbyid(p.proowner)<>o.owner OR coalesce(p.proacl::text,'')<>o.acl OR p.prosecdef<>o.definer OR obj_description(p.oid,'pg_proc') IS DISTINCT FROM o.comment;
 IF bad IS NOT NULL OR (SELECT count(*) FROM v124_before)<>6 THEN RAISE EXCEPTION 'V124 changed the owner, privileges, security or comment of %',coalesce(bad,'an unexpected function set'); END IF;
 IF position('system.rebate-offset' IN pg_get_functiondef('public.create_referral_rebate(text)'::regprocedure))=0
  OR position($s$WHEN SQLSTATE 'P0001' OR SQLSTATE 'P4C05' THEN offset_id:=NULL$s$ IN pg_get_functiondef('public.create_referral_rebate(text)'::regprocedure))=0
  OR position($s$'system.rebate-offset')) OR$s$ IN pg_get_functiondef('public.pwa_effective_payment_plan_v2(text)'::regprocedure))=0
  OR position('SET CONSTRAINTS public.referral_loan_closed IMMEDIATE' IN pg_get_functiondef('public.pwa_submit_selected_charges_v1(text)'::regprocedure))=0
  OR position('SET CONSTRAINTS public.referral_loan_closed IMMEDIATE' IN pg_get_functiondef('public.pwa_submit_agent_receipt_v1(text)'::regprocedure))=0
  OR position($s$e.event_type='payment.posted' AND e.source_kind='payment' AND x."Ref Related Loan"$s$ IN pg_get_functiondef('public.pwa_notify_content_v2(uuid,bigint)'::regprocedure))=0 THEN RAISE EXCEPTION 'V124: a function was not replaced'; END IF;
 IF NOT has_column_privilege('mw_notify_owner_'||CASE current_database() WHEN 'loan_manager_prod' THEN 'prod' ELSE 'dev' END,'public."Loans"','Ref Closing Payment','SELECT') THEN RAISE EXCEPTION 'V124: the notify owner must read the closing payment of a loan'; END IF;
END $check$;
