-- R104 record the next projected charge (owner request of 28 October 2026; Archie's design). In the Upcoming Charges date
-- detail a Partner may book a loan's next projected charge (the V112 offer of pwa_next_projected_charge_v1) as an actual
-- charge on its future date, without a payment.
-- 1. pwa_submit_operation_v2 accepts the governed operation loan.book-projected-charge: target the loan, expectedVersion
--    pwa_loan_version_v2, inputs {chargeDate, principalDue, interestDue} (date string; whole-baht integer strings, 0 allowed
--    for one component, sum positive), canonical key order chargeDate, principalDue, interestDue. The charge id is not an
--    input: it is the generator's key cg8:<length>:<loan>:<date>. SQLSTATE P5B11 (unused before V116; P5B10 is
--    insufficient_funds) is recorded as the existing rejection code plan_changed, because the journal CHECK
--    pwa_versioned_outcome (V83) allows only its listed codes and V116 changes no constraint. The PWA shows the
--    "projected charge no longer available" message for plan_changed and source_conflict on this operation.
-- 2. pwa_apply_loan_source_v2 applies it under the existing borrower -> loan -> charges locks and loan version check:
--    chargeDate must be after today in Bangkok (else invalid_date, P5B08); pwa_next_projected_charge_v1(borrower, today)
--    must still return this loan with the same date and amounts (else P5B11); the charge is booked by
--    generate_loan_charge(loan, date), a generator refusal (P0001) or a NULL result is P5B11, and the inserted row must equal
--    the inputs under the generator key (else P5B11, which rolls the booking back). The result has the standard shape.
-- No table, column, constraint, role or grant change. Both functions are CREATE OR REPLACE'd from their current definition
-- with exact, counted text replacements (as V84 and V112 do), which keeps each owner and ACL; the self-check below proves it.

DO $preflight$
BEGIN
 IF current_database() NOT IN ('loan_manager_dev','payment_rehearsal','loan_manager_prod') THEN RAISE EXCEPTION 'Unsupported application database'; END IF;
 IF to_regprocedure('public.pwa_next_projected_charge_v1(text,date)') IS NULL THEN RAISE EXCEPTION 'V116 needs V112'; END IF;
END $preflight$;

CREATE TEMP TABLE v116_acl ON COMMIT DROP AS
 SELECT p.oid::regprocedure::text AS routine,pg_get_userbyid(p.proowner) AS owner,coalesce(p.proacl::text,'') AS acl,p.prosecdef AS definer
 FROM pg_proc p WHERE p.oid IN ('public.pwa_submit_operation_v2(text)'::regprocedure,'public.pwa_apply_loan_source_v2(text)'::regprocedure);

-- 1. The operation command: accepted operation, input shape and canonical text, P5B11 recorded as plan_changed.
DO $submit$
DECLARE definition text;edits text[][]:=ARRAY[
 ARRAY[$o$'loan.undo-default','loan.generate-charge','loan.close','charge.create'$o$,
       $n$'loan.undo-default','loan.generate-charge','loan.book-projected-charge','loan.close','charge.create'$n$],
 ARRAY[$o$ ELSIF op IN('borrower.delete','loan.delete','loan.undo-default','charge.delete','payment.delete','expense.delete') THEN$o$,
       $n$ ELSIF op='loan.book-projected-charge' THEN
 -- R104: the reviewed next projected charge of the loan; the generator key is derived, never sent.
 IF (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(i) key) IS DISTINCT FROM ARRAY['chargeDate','interestDue','principalDue'] OR jsonb_typeof(i->'chargeDate') IS DISTINCT FROM 'string' OR jsonb_typeof(i->'principalDue') IS DISTINCT FROM 'string' OR jsonb_typeof(i->'interestDue') IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'projected charge keys';END IF;
 IF i->>'chargeDate'!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' OR ((i->>'chargeDate')::date)::text<>i->>'chargeDate' OR i->>'principalDue'!~'^(0|[1-9][0-9]{0,16})$' OR i->>'interestDue'!~'^(0|[1-9][0-9]{0,16})$' OR (i->>'principalDue')::numeric>92233720368547758 OR (i->>'interestDue')::numeric>92233720368547758 OR (i->>'principalDue')::numeric+(i->>'interestDue')::numeric<=0 THEN RAISE EXCEPTION 'projected charge input';END IF;
 input_text:='{"chargeDate":'||to_json(i->>'chargeDate')::text||',"principalDue":'||to_json(i->>'principalDue')::text||',"interestDue":'||to_json(i->>'interestDue')::text||'}';
 ELSIF op IN('borrower.delete','loan.delete','loan.undo-default','charge.delete','payment.delete','expense.delete') THEN$n$],
 ARRAY[$o$WHEN SQLSTATE 'P5B10' THEN rejection:='insufficient_funds';END;$o$,
       $n$WHEN SQLSTATE 'P5B10' THEN rejection:='insufficient_funds';WHEN SQLSTATE 'P5B11' THEN rejection:='plan_changed';END;$n$]];
 k integer;
BEGIN
 SELECT pg_get_functiondef('public.pwa_submit_operation_v2(text)'::regprocedure) INTO definition;
 IF position('loan.book-projected-charge' IN definition)>0 THEN RAISE EXCEPTION 'V116: pwa_submit_operation_v2 already accepts the operation';END IF;
 FOR k IN 1..array_length(edits,1) LOOP
  IF (length(definition)-length(replace(definition,edits[k][1],'')))/length(edits[k][1])<>1 THEN RAISE EXCEPTION 'V116: unexpected pwa_submit_operation_v2 boundary %',k;END IF;
  definition:=replace(definition,edits[k][1],edits[k][2]);
 END LOOP;
 EXECUTE definition;
END $submit$;

-- 2. The loan source writer: book the next projected charge through the generator under the existing locks.
DO $apply$
DECLARE definition text;edits text[][]:=ARRAY[
 ARRAY[$o$ parent text;l public."Loans"%ROWTYPE;message text;$o$,
       $n$ parent text;l public."Loans"%ROWTYPE;message text;booked text;$n$],
 ARRAY[$o$'loan.undo-default','loan.generate-charge') THEN RAISE EXCEPTION USING ERRCODE='42501'$o$,
       $n$'loan.undo-default','loan.generate-charge','loan.book-projected-charge') THEN RAISE EXCEPTION USING ERRCODE='42501'$n$],
 ARRAY[$o$ IF op IN('loan.default','loan.generate-charge') AND (i->>'businessDate')::date IS DISTINCT FROM (statement_timestamp() AT TIME ZONE 'Asia/Bangkok')::date THEN RAISE EXCEPTION USING ERRCODE='P5B08';END IF;$o$,
       $n$ IF op IN('loan.default','loan.generate-charge') AND (i->>'businessDate')::date IS DISTINCT FROM (statement_timestamp() AT TIME ZONE 'Asia/Bangkok')::date THEN RAISE EXCEPTION USING ERRCODE='P5B08';END IF;
 -- R104: a projected charge is booked only for a date after today (Bangkok).
 IF op='loan.book-projected-charge' AND (i->>'chargeDate')::date<=(statement_timestamp() AT TIME ZONE 'Asia/Bangkok')::date THEN RAISE EXCEPTION USING ERRCODE='P5B08';END IF;$n$],
 ARRAY[$o$ WHEN 'loan.update' THEN$o$,
       $n$ WHEN 'loan.book-projected-charge' THEN
  -- R104: still this loan's next projected charge (V112 read, same day) with the reviewed date and amounts.
  IF NOT EXISTS(SELECT 1 FROM public.pwa_next_projected_charge_v1(parent,(statement_timestamp() AT TIME ZONE 'Asia/Bangkok')::date) p
    WHERE p.loan_id=target AND p.charge_date=(i->>'chargeDate')::date AND p.principal_due=(i->>'principalDue')::numeric AND p.interest_due=(i->>'interestDue')::numeric) THEN RAISE EXCEPTION USING ERRCODE='P5B11';END IF;
  BEGIN
   booked:=public.generate_loan_charge(target,(i->>'chargeDate')::date);
  EXCEPTION WHEN SQLSTATE 'P0001' THEN RAISE EXCEPTION USING ERRCODE='P5B11';
  END;
  IF booked IS DISTINCT FROM 'cg8:'||length(target)||':'||target||':'||(i->>'chargeDate') OR NOT EXISTS(SELECT 1 FROM public."Charges" WHERE "Row ID"=booked AND "Ref Loans"=target AND "Charge Date"=(i->>'chargeDate')::date
    AND "Principal Due"::numeric=(i->>'principalDue')::numeric AND "Interest Due"::numeric=(i->>'interestDue')::numeric) THEN RAISE EXCEPTION USING ERRCODE='P5B11';END IF;
 WHEN 'loan.update' THEN$n$]];
 k integer;
BEGIN
 SELECT pg_get_functiondef('public.pwa_apply_loan_source_v2(text)'::regprocedure) INTO definition;
 IF position('loan.book-projected-charge' IN definition)>0 THEN RAISE EXCEPTION 'V116: pwa_apply_loan_source_v2 already applies the operation';END IF;
 FOR k IN 1..array_length(edits,1) LOOP
  IF (length(definition)-length(replace(definition,edits[k][1],'')))/length(edits[k][1])<>1 THEN RAISE EXCEPTION 'V116: unexpected pwa_apply_loan_source_v2 boundary %',k;END IF;
  definition:=replace(definition,edits[k][1],edits[k][2]);
 END LOOP;
 EXECUTE definition;
END $apply$;

-- Self-check: owners, privileges and security of both functions unchanged; the operation in both bodies; PUBLIC executes neither.
DO $check$
DECLARE bad text;
BEGIN
 SELECT string_agg(o.routine,', ') INTO bad FROM v116_acl o JOIN pg_proc p ON p.oid=o.routine::regprocedure
  WHERE pg_get_userbyid(p.proowner)<>o.owner OR coalesce(p.proacl::text,'')<>o.acl OR p.prosecdef<>o.definer;
 IF bad IS NOT NULL OR (SELECT count(*) FROM v116_acl)<>2 THEN RAISE EXCEPTION 'V116 changed the owner, privileges or security of %',coalesce(bad,'a replaced function'); END IF;
 IF has_function_privilege('public','public.pwa_submit_operation_v2(text)','EXECUTE') OR has_function_privilege('public','public.pwa_apply_loan_source_v2(text)','EXECUTE') THEN RAISE EXCEPTION 'V116: PUBLIC must not execute the operation functions'; END IF;
 IF position($s$WHEN SQLSTATE 'P5B11' THEN rejection:='plan_changed'$s$ IN pg_get_functiondef('public.pwa_submit_operation_v2(text)'::regprocedure))=0
  OR position($s$WHEN 'loan.book-projected-charge' THEN$s$ IN pg_get_functiondef('public.pwa_apply_loan_source_v2(text)'::regprocedure))=0 THEN RAISE EXCEPTION 'V116: a function was not replaced'; END IF;
END $check$;
