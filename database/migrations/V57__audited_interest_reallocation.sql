-- R050: admin-only whole-interest reallocation; no backfill, receipt or cash write.
-- Audit rows are both exact transition permits and retained before/after evidence.
-- No session setting alone permits an edit: the marker must join an append-only
-- operation and exact row transition in this transaction, created by postgres.
CREATE FUNCTION public.payment_reallocation_permitted(p_table text,p_old jsonb,p_new jsonb)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT session_user='postgres' AND EXISTS (
  SELECT 1 FROM agent_audit.row_changes r JOIN agent_audit.commits c
   ON (c.operation_id,c.database_txid)=(r.operation_id,r.database_txid)
  WHERE c.operation_id::text=nullif(current_setting('mw_agent.reallocation_id',true),'')
   AND c.database_txid=pg_current_xact_id() AND c.database_session_role='postgres'
   AND c.request_reason LIKE 'interest-reallocation: %'
   AND r.schema_name='public' AND r.table_name=p_table AND r.action='UPDATE'
   AND r.before_row=p_old AND r.after_row=p_new
 );
$$;
-- Boolean-only guard helper, no audit content exposed; non-admin always false.

CREATE OR REPLACE FUNCTION public.lump_sum_child_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE payment_id text; borrower_id text;
BEGIN
 IF TG_OP='UPDATE' AND public.payment_reallocation_permitted(TG_TABLE_NAME,to_jsonb(OLD),to_jsonb(NEW)) THEN
  RETURN NEW;
 END IF;
 IF TG_OP<>'INSERT' AND (starts_with(OLD."Row ID",'ls2:') OR starts_with(OLD."Row ID",'pc6:')) THEN
  RAISE EXCEPTION 'Database-posted allocation/repayment is immutable';
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 payment_id:=NEW."Ref Payment";
 SELECT "Ref Borrower" INTO borrower_id FROM public."Payments" WHERE "Row ID"=payment_id;
 PERFORM 1 FROM public."Borrowers" WHERE "Row ID"=borrower_id FOR UPDATE;
 IF EXISTS(SELECT 1 FROM public."Payments" WHERE "Row ID"=payment_id AND "Status"='Posted') THEN
  IF TG_OP='INSERT' OR NEW IS DISTINCT FROM OLD THEN
   RAISE EXCEPTION 'Cannot change results of a posted payment';
  END IF;
 END IF;
 RETURN NEW;
END $$;

CREATE FUNCTION public.reallocate_payment_interest(
 p_operation uuid,p_payment text,p_expected_receipt jsonb,p_moves jsonb,
 p_reason text,p_code_version text
) RETURNS text LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE p public."Payments"%ROWTYPE; a public."Payment Allocations"%ROWTYPE;
 r public."Repayments"%ROWTYPE; source_charge public."Charges"%ROWTYPE;
 target_charge public."Charges"%ROWTYPE; loan public."Loans"%ROWTYPE;
 new_a public."Payment Allocations"%ROWTYPE; new_r public."Repayments"%ROWTYPE;
 move jsonb; request jsonb; stored_request jsonb; observed jsonb;
 borrower text; ledger_before jsonb; loans_before jsonb; amount numeric;
 remaining numeric; ids text[]; targets text[];
BEGIN
 IF session_user<>'postgres' OR current_user<>'postgres' THEN
  RAISE EXCEPTION 'Dedicated postgres administrator required';
 END IF;
 IF p_operation IS NULL OR p_payment IS NULL OR p_expected_receipt IS NULL
  OR jsonb_typeof(p_expected_receipt) IS DISTINCT FROM 'object'
  OR jsonb_typeof(p_moves) IS DISTINCT FROM 'array' OR jsonb_array_length(p_moves) NOT BETWEEN 1 AND 20
  OR nullif(btrim(p_reason),'') IS NULL OR nullif(btrim(p_code_version),'') IS NULL THEN
  RAISE EXCEPTION 'Invalid reallocation request';
 END IF;
 request:=jsonb_build_object('kind','interest-reallocation-v1','payment',p_payment,
  'receipt',p_expected_receipt,'moves',p_moves,'reason',p_reason,'code_version',p_code_version);
 IF NOT pg_try_advisory_xact_lock(9162026,2) THEN RAISE EXCEPTION 'Cash pool is busy; retry'; END IF;
 SELECT "Ref Borrower" INTO borrower FROM public."Payments" WHERE "Row ID"=p_payment;
 IF borrower IS NULL THEN RAISE EXCEPTION 'Receipt missing'; END IF;
 PERFORM 1 FROM public."Borrowers" WHERE "Row ID"=borrower FOR UPDATE NOWAIT;
 SELECT * INTO p FROM public."Payments" WHERE "Row ID"=p_payment FOR UPDATE NOWAIT;
 SELECT direct_targets->0 INTO stored_request FROM agent_audit.commits WHERE operation_id=p_operation;
 IF FOUND THEN
  IF stored_request IS DISTINCT FROM request THEN RAISE EXCEPTION 'Operation ID reused with different request'; END IF;
  IF to_jsonb(p) IS DISTINCT FROM p_expected_receipt OR EXISTS (
   SELECT 1 FROM agent_audit.row_changes ch WHERE ch.operation_id=p_operation AND
    CASE ch.table_name
     WHEN 'Payment Allocations' THEN ch.after_row IS DISTINCT FROM
      (SELECT to_jsonb(x) FROM public."Payment Allocations" x WHERE x."Row ID"=ch.row_key->>'Row ID')
     WHEN 'Repayments' THEN ch.after_row IS DISTINCT FROM
      (SELECT to_jsonb(x) FROM public."Repayments" x WHERE x."Row ID"=ch.row_key->>'Row ID')
     WHEN 'Charges' THEN ch.after_row IS DISTINCT FROM
      (SELECT to_jsonb(x) FROM public."Charges" x WHERE x."Row ID"=ch.row_key->>'Row ID')
     ELSE true END) THEN RAISE EXCEPTION 'Applied operation state has changed'; END IF;
  RETURN 'already_applied';
 END IF;
 IF p."Status" IS DISTINCT FROM 'Posted' OR p."Allocation Method" IS DISTINCT FROM 'Lump Sum'
  OR to_jsonb(p) IS DISTINCT FROM p_expected_receipt THEN RAISE EXCEPTION 'Receipt verification conflict'; END IF;
 IF nullif(current_setting('mw_agent.reallocation_id',true),'') IS NOT NULL THEN
  RAISE EXCEPTION 'One reallocation per transaction';
 END IF;
 SELECT array_agg(x->>'allocation_id'),array_agg(x->>'target_charge') INTO ids,targets FROM jsonb_array_elements(p_moves) x;
 IF EXISTS(SELECT 1 FROM unnest(ids) k GROUP BY k HAVING k IS NULL OR count(*)>1)
  OR EXISTS(SELECT 1 FROM unnest(targets) k GROUP BY k HAVING k IS NULL OR count(*)>1) THEN
  RAISE EXCEPTION 'Duplicate or missing allocation/target';
 END IF;
 -- Lock all affected loans/charges and every child of this receipt in stable order.
 PERFORM 1 FROM public."Loans" WHERE "Ref Borrowers"=borrower ORDER BY "Row ID" FOR UPDATE NOWAIT;
 PERFORM 1 FROM public."Charges" WHERE "Row ID" IN
  (SELECT "Ref Charge" FROM public."Payment Allocations" WHERE "Row ID"=ANY(ids))
  OR "Row ID"=ANY(targets) ORDER BY "Row ID" FOR UPDATE NOWAIT;
 PERFORM 1 FROM public."Payment Allocations" WHERE "Ref Payment"=p_payment ORDER BY "Row ID" FOR UPDATE NOWAIT;
 PERFORM 1 FROM public."Repayments" WHERE "Ref Payment"=p_payment ORDER BY "Row ID" FOR UPDATE NOWAIT;
 amount:=p."Amount Received"::numeric;
 IF amount IS NULL OR amount<=0 OR amount<>trunc(amount) OR p."Payment Date" IS NULL
  OR amount IS DISTINCT FROM p."Posted Amount" OR amount IS DISTINCT FROM p."Planned Allocation Amount"
  OR amount IS DISTINCT FROM (SELECT sum("Allocated Amount"::numeric) FROM public."Payment Allocations" WHERE "Ref Payment"=p_payment)
  OR amount IS DISTINCT FROM (SELECT sum("Principal Paid"::numeric+"Interest Paid"::numeric) FROM public."Repayments" WHERE "Ref Payment"=p_payment)
  OR EXISTS(SELECT 1 FROM public."Payment Allocations" aa FULL JOIN public."Repayments" rr ON rr."Ref Payment Allocation"=aa."Row ID"
   WHERE (aa."Ref Payment"=p_payment OR rr."Ref Payment"=p_payment) AND
    (aa."Row ID" IS NULL OR rr."Row ID" IS NULL OR aa."Ref Payment" IS DISTINCT FROM rr."Ref Payment"
     OR aa."Ref Charge" IS DISTINCT FROM rr."Ref Charges" OR aa."Allocated Interest" IS DISTINCT FROM rr."Interest Paid" OR aa."Allocated Principal" IS DISTINCT FROM rr."Principal Paid")) THEN
  RAISE EXCEPTION 'Receipt child totals or references conflict';
 END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x."Row ID"),'[]') INTO ledger_before FROM public."Cash Ledger" x WHERE "Ref Payment"=p_payment;
 SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x."Row ID"),'[]') INTO loans_before FROM public."Loans" x WHERE "Ref Borrowers"=borrower;
 INSERT INTO agent_audit.commits(operation_id,reviewer_id,reviewer_login,plan_sha256,request_reason,direct_targets,code_version)
 VALUES(p_operation,'owner-approved-admin',session_user,encode(sha256(convert_to(request::text,'UTF8')),'hex'),
  'interest-reallocation: '||p_reason,jsonb_build_array(request),p_code_version);
 PERFORM set_config('mw_agent.reallocation_id',p_operation::text,true);
 FOR move IN SELECT x FROM jsonb_array_elements(p_moves) x LOOP
  SELECT * INTO a FROM public."Payment Allocations" WHERE "Row ID"=move->>'allocation_id';
  IF NOT FOUND OR a."Ref Payment" IS DISTINCT FROM p_payment OR to_jsonb(a) IS DISTINCT FROM move->'expected_allocation' THEN
   RAISE EXCEPTION 'Allocation verification conflict'; END IF;
  SELECT * INTO STRICT r FROM public."Repayments" WHERE "Ref Payment Allocation"=a."Row ID";
  SELECT * INTO STRICT source_charge FROM public."Charges" WHERE "Row ID"=a."Ref Charge";
  SELECT * INTO STRICT target_charge FROM public."Charges" WHERE "Row ID"=move->>'target_charge';
  SELECT * INTO STRICT loan FROM public."Loans" WHERE "Row ID"=source_charge."Ref Loans";
  IF to_jsonb(r) IS DISTINCT FROM move->'expected_repayment'
   OR to_jsonb(source_charge) IS DISTINCT FROM move->'expected_source_charge'
   OR to_jsonb(target_charge) IS DISTINCT FROM move->'expected_target_charge'
   OR to_jsonb(loan) IS DISTINCT FROM move->'expected_loan' THEN RAISE EXCEPTION 'Move verification conflict'; END IF;
  IF loan."Ref Borrowers" IS DISTINCT FROM borrower OR loan."Loan Status" IS DISTINCT FROM 'ยังไม่ปิดยอด'
   OR loan."Defaulted" IS TRUE OR loan."Ref Closing Payment" IS NOT NULL
   OR source_charge."Ref Loans" IS DISTINCT FROM target_charge."Ref Loans"
   OR r."Ref Loans" IS DISTINCT FROM loan."Row ID" OR r."Ref Charges" IS DISTINCT FROM a."Ref Charge"
   OR r."Ref Payment" IS DISTINCT FROM p_payment OR r."Payment Date" IS DISTINCT FROM p."Payment Date"
   OR a."Charge Date Snapshot" IS DISTINCT FROM source_charge."Charge Date"
   OR source_charge."Charge Date" IS NULL OR target_charge."Charge Date" IS NULL
   OR target_charge."Charge Date">p."Payment Date" OR target_charge."Charge Date">=source_charge."Charge Date"
   OR starts_with(source_charge."Row ID",'df10:') OR starts_with(target_charge."Row ID",'df10:')
   OR a."Allocated Principal"::numeric IS DISTINCT FROM 0 OR r."Principal Paid"::numeric IS DISTINCT FROM 0
   OR a."Allocated Interest"::numeric IS DISTINCT FROM r."Interest Paid"::numeric
   OR a."Allocated Amount"::numeric IS DISTINCT FROM a."Allocated Interest"::numeric
   OR a."Allocated Interest"::numeric IS NULL OR a."Allocated Interest"::numeric<=0 THEN RAISE EXCEPTION 'Only same-loan whole interest moves are supported'; END IF;
  SELECT coalesce(target_charge."Interest Due"::numeric,0)-coalesce(sum("Interest Paid"::numeric),0) INTO remaining
   FROM public."Repayments" WHERE "Ref Charges"=target_charge."Row ID";
  IF remaining<a."Allocated Interest"::numeric OR EXISTS(SELECT 1 FROM public."Payment Allocations"
   WHERE "Ref Payment"=p_payment AND "Ref Charge"=target_charge."Row ID") THEN RAISE EXCEPTION 'Target charge capacity conflict'; END IF;
  new_a:=a; new_r:=r;
  new_a."Ref Charge":=target_charge."Row ID"; new_a."Charge Date Snapshot":=target_charge."Charge Date";
  new_a."Interest Remaining Snapshot":=remaining::money;
  new_a."Principal Remaining Snapshot":=target_charge."Principal Remaining"::money;
  new_a."Amount Remaining Snapshot":=(remaining+target_charge."Principal Remaining")::money;
  new_r."Ref Charges":=target_charge."Row ID";
  INSERT INTO agent_audit.row_changes(operation_id,schema_name,table_name,action,row_key,before_row,after_row) VALUES
   (p_operation,'public','Payment Allocations','UPDATE',jsonb_build_object('Row ID',a."Row ID"),to_jsonb(a),to_jsonb(new_a)),
   (p_operation,'public','Repayments','UPDATE',jsonb_build_object('Row ID',r."Row ID"),to_jsonb(r),to_jsonb(new_r));
  UPDATE public."Payment Allocations" SET "Ref Charge"=new_a."Ref Charge","Charge Date Snapshot"=new_a."Charge Date Snapshot",
   "Interest Remaining Snapshot"=new_a."Interest Remaining Snapshot","Principal Remaining Snapshot"=new_a."Principal Remaining Snapshot",
   "Amount Remaining Snapshot"=new_a."Amount Remaining Snapshot" WHERE "Row ID"=a."Row ID" RETURNING to_jsonb("Payment Allocations".*) INTO observed;
  IF observed IS DISTINCT FROM to_jsonb(new_a) THEN RAISE EXCEPTION 'Unexpected allocation mutation'; END IF;
  UPDATE public."Repayments" SET "Ref Charges"=new_r."Ref Charges" WHERE "Row ID"=r."Row ID" RETURNING to_jsonb("Repayments".*) INTO observed;
  IF observed IS DISTINCT FROM to_jsonb(new_r) THEN RAISE EXCEPTION 'Unexpected repayment mutation'; END IF;
  PERFORM public.vc_refresh_charge(source_charge."Row ID");
  PERFORM public.vc_refresh_charge(target_charge."Row ID");
  INSERT INTO agent_audit.row_changes(operation_id,schema_name,table_name,action,row_key,before_row,after_row)
   SELECT p_operation,'public','Charges','UPDATE',jsonb_build_object('Row ID',x."Row ID"),
    CASE WHEN x."Row ID"=source_charge."Row ID" THEN to_jsonb(source_charge) ELSE to_jsonb(target_charge) END,to_jsonb(x)
   FROM public."Charges" x WHERE x."Row ID" IN (source_charge."Row ID",target_charge."Row ID");
 END LOOP;
 SET CONSTRAINTS ALL IMMEDIATE;
 SELECT to_jsonb(x) INTO observed FROM public."Payments" x WHERE "Row ID"=p_payment;
 IF observed IS DISTINCT FROM p_expected_receipt OR ledger_before IS DISTINCT FROM
  (SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x."Row ID"),'[]') FROM public."Cash Ledger" x WHERE "Ref Payment"=p_payment)
  OR loans_before IS DISTINCT FROM (SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x."Row ID"),'[]') FROM public."Loans" x WHERE "Ref Borrowers"=borrower) THEN
  RAISE EXCEPTION 'Receipt, cash or loan invariant changed'; END IF;
 PERFORM set_config('mw_agent.reallocation_id','',true);
 RETURN 'applied';
END $$;
REVOKE ALL ON FUNCTION public.reallocate_payment_interest(uuid,text,jsonb,jsonb,text,text) FROM PUBLIC;
COMMENT ON FUNCTION public.reallocate_payment_interest(uuid,text,jsonb,jsonb,text,text) IS
 'Admin-only audited whole-interest moves to earlier same-loan charges; full before-state guards, transactional rollback and exact retry reconciliation. No receipt or cash write.';
