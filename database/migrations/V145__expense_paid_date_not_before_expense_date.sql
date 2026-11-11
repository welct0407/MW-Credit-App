-- R140 owner decision of 11 November 2026: "yes, block paid date before expense date". V144 is applied and stays.
-- A stored "Business Expenses"."Paid Date" may not be earlier than the "Expense Date". calculate_business_expense refuses
-- it on insert and on an update that changes "Paid Date" or "Expense Date" (so moving the expense date after an existing paid
-- date is refused too); an update that changes neither leaves an existing row as it is (no retroactive failure; DEV holds
-- synthetic rows from before this rule, PROD none). pwa_apply_expense_v2 maps the refusal to P5B08 (invalid_date), as for a
-- future paid date. pwa_submit_operation_v2 refuses a command whose paidDate is earlier than its own expenseDate as a
-- non-canonical (invalid) command, like a paid date without an account (the Node contract does the same).
-- Objects: three counted text replacements (V137 method) of calculate_business_expense, pwa_apply_expense_v2 and
-- pwa_submit_operation_v2 (journal owner); CREATE OR REPLACE keeps owner, ACL, security, volatility, configuration and
-- comment, and the self-check proves it. No table, column, constraint, trigger, grant or data change.
-- Rollback: a later migration restores the V144 bodies.

DO $preflight$
DECLARE problems text[]:='{}'; r record; existing bigint;
BEGIN
 IF current_database() NOT IN ('loan_manager_dev','payment_rehearsal','loan_manager_prod') THEN RAISE EXCEPTION 'Unsupported application database'; END IF;
 IF position('R140 V144' IN pg_get_functiondef('public.pwa_apply_expense_v2(text)'::regprocedure))=0 THEN problems:=problems||'V145 needs V144'::text; END IF;
 IF EXISTS(SELECT 1 FROM unnest(ARRAY['public.calculate_business_expense()','public.pwa_apply_expense_v2(text)','public.pwa_submit_operation_v2(text)']) f
   WHERE position('R140 V145' IN pg_get_functiondef(f::regprocedure))>0) THEN problems:=problems||'V145: a routine is already patched'::text; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=current_user AND rolsuper) THEN
  FOR r IN SELECT DISTINCT pg_get_userbyid(p.proowner) AS owner FROM pg_proc p WHERE p.oid IN ('public.calculate_business_expense()'::regprocedure,
    'public.pwa_apply_expense_v2(text)'::regprocedure,'public.pwa_submit_operation_v2(text)'::regprocedure) LOOP
   IF NOT pg_has_role(current_user,r.owner,'USAGE') THEN problems:=problems||format('%s cannot replace routines owned by %s (owner window required)',current_user,r.owner); END IF;
  END LOOP;
 END IF;
 IF cardinality(problems)>0 THEN RAISE EXCEPTION 'V145 preflight: %',array_to_string(problems,'; '); END IF;
 -- Existing rows are reported, not changed: the rule applies when such a row's paid date or expense date changes.
 SELECT count(*) INTO existing FROM public."Business Expenses" WHERE "Paid Date"<"Expense Date";
 RAISE NOTICE 'V145: % existing expense row(s) have a paid date before the expense date (left as they are)',existing;
END $preflight$;

CREATE TEMP TABLE v145_routines ON COMMIT DROP AS
 SELECT r.name AS routine,pg_get_userbyid(p.proowner) AS owner,coalesce(p.proacl,acldefault('f',p.proowner)) AS effective,
  p.prosecdef AS definer,p.provolatile AS volatile,p.proconfig AS config,obj_description(p.oid,'pg_proc') AS comment
 FROM unnest(ARRAY['public.calculate_business_expense()','public.pwa_apply_expense_v2(text)','public.pwa_submit_operation_v2(text)']) r(name) JOIN pg_proc p ON p.oid=r.name::regprocedure;

-- Exact, counted replacements (every boundary must occur exactly once); insertions stay on their boundary's line.
CREATE FUNCTION pg_temp.v145_patch(routine text, edits text[]) RETURNS void LANGUAGE plpgsql AS $patch$
DECLARE definition text:=pg_get_functiondef(routine::regprocedure); k integer; o text; n text;
BEGIN
 FOR k IN 1..array_length(edits,1)/2 LOOP
  o:=edits[2*k-1];n:=edits[2*k];
  IF (length(definition)-length(replace(definition,o,'')))/length(o)<>1 THEN RAISE EXCEPTION 'V145: unexpected % boundary %',routine,k; END IF;
  definition:=replace(definition,o,n);
 END LOOP;
 IF position('R140 V145' IN definition)=0 THEN RAISE EXCEPTION 'V145: % patch carries no R140 V145 marker',routine; END IF;
 EXECUTE definition;
END $patch$;

-- The row rule (Manual branch, after the V144 paid date rule).
SELECT pg_temp.v145_patch('public.calculate_business_expense()',ARRAY[
 $o$     RAISE EXCEPTION 'A paid date belongs to a paid manual expense'; END IF;$o$,
 $n$     RAISE EXCEPTION 'A paid date belongs to a paid manual expense'; END IF;
   -- R140 V145: a paid date is never before the expense date, checked when either date is written (existing rows stay).
   IF NEW."Paid Date"<NEW."Expense Date" AND (TG_OP='INSERT' OR NEW."Paid Date" IS DISTINCT FROM OLD."Paid Date" OR NEW."Expense Date" IS DISTINCT FROM OLD."Expense Date") THEN
     RAISE EXCEPTION 'A paid date cannot be before the expense date'; END IF;$n$]);

-- The command: the refusal is invalid_date (P5B08), as for a future paid date.
SELECT pg_temp.v145_patch('public.pwa_apply_expense_v2(text)',ARRAY[
 $o$ELSIF message='A paid date belongs to a paid manual expense' THEN RAISE EXCEPTION USING ERRCODE='P5B08';$o$,
 $n$ELSIF message IN('A paid date belongs to a paid manual expense','A paid date cannot be before the expense date' /* R140 V145 */) THEN RAISE EXCEPTION USING ERRCODE='P5B08';$n$]);

-- The canonical command: a paidDate before the command's own expenseDate is not a valid command.
SELECT pg_temp.v145_patch('public.pwa_submit_operation_v2(text)',ARRAY[
 $o$OR i->>'paidByAccountId' IS NULL) THEN RAISE EXCEPTION 'expense paid date';END IF;$o$,
 $n$OR i->>'paidByAccountId' IS NULL OR (i->>'paidDate')::date<(i->>'expenseDate')::date /* R140 V145 */) THEN RAISE EXCEPTION 'expense paid date';END IF;$n$]);

-- Self-check: owner, ACL, security, volatility, configuration and comment unchanged; the three patches in place.
DO $check$
DECLARE bad text;
BEGIN
 SELECT string_agg(o.routine,', ') INTO bad FROM v145_routines o JOIN pg_proc p ON p.oid=o.routine::regprocedure
  WHERE pg_get_userbyid(p.proowner)<>o.owner OR p.prosecdef<>o.definer OR p.provolatile<>o.volatile OR p.proconfig IS DISTINCT FROM o.config
   OR obj_description(p.oid,'pg_proc') IS DISTINCT FROM o.comment
   OR (SELECT array_agg(a.grantee::text||':'||a.privilege_type ORDER BY (a.grantee::text||':'||a.privilege_type) COLLATE "C") FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee<>p.proowner)
    IS DISTINCT FROM (SELECT array_agg(a.grantee::text||':'||a.privilege_type ORDER BY (a.grantee::text||':'||a.privilege_type) COLLATE "C") FROM aclexplode(o.effective) a WHERE a.grantee<>p.proowner);
 IF bad IS NOT NULL OR (SELECT count(*) FROM v145_routines)<>3 THEN RAISE EXCEPTION 'V145 changed the owner, privileges, attributes or comment of %',coalesce(bad,'an unexpected routine set'); END IF;
 SELECT string_agg(r,', ') INTO bad FROM unnest(ARRAY['public.calculate_business_expense()','public.pwa_apply_expense_v2(text)','public.pwa_submit_operation_v2(text)']) r
  WHERE position('R140 V145' IN pg_get_functiondef(r::regprocedure))=0;
 IF bad IS NOT NULL THEN RAISE EXCEPTION 'V145: not patched: %',bad; END IF;
END $check$;
