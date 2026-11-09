-- R136 loan.create cash pool refusal (owner instruction of 9 November 2026, "fix it now"). V138 is applied and stays.
-- A loan.create whose principal exceeds the available cash pool raised the V17 guard's check_violation (23514, 'New loan
-- exceeds available cashpool...') out of pwa_apply_loan_create_v2, which has no handler for it, so pwa_submit_operation_v2
-- failed as a whole: the command service answered 503 command_unavailable and the PWA retried the saved loan indefinitely
-- (nothing was written). V139 maps exactly that guard to P5B10, which pwa_submit_operation_v2 already records as the
-- rejection insufficient_funds (one journal row, outcome rejected), as pwa_apply_loan_rollover_v1 (V138) does for a rollover.
-- Every other error of the loan insert (other check or not-null violations, trigger refusals) is raised unchanged.
-- Object: pwa_apply_loan_create_v2(text), replaced in place by a counted text replacement of its current definition (V137/V138
-- method; CREATE OR REPLACE keeps owner, ACL, security, volatility, configuration and comment, and the self-check proves it).
-- No table, column, constraint, trigger, grant or data change. Rollback: a later migration restores the V138 body.

DO $preflight$
DECLARE problems text[]:='{}'; r record;
BEGIN
 IF current_database() NOT IN ('loan_manager_dev','payment_rehearsal','loan_manager_prod') THEN RAISE EXCEPTION 'Unsupported application database'; END IF;
 IF to_regprocedure('public.pwa_apply_loan_rollover_v1(text)') IS NULL THEN problems:=problems||'V139 needs V138'::text; END IF;
 IF position('R136 V139' IN pg_get_functiondef('public.pwa_apply_loan_create_v2(text)'::regprocedure))>0 THEN problems:=problems||'V139: pwa_apply_loan_create_v2 is already patched'::text; END IF;
 IF position($p$WHEN SQLSTATE 'P5B10' THEN rejection:='insufficient_funds'$p$ IN pg_get_functiondef('public.pwa_submit_operation_v2(text)'::regprocedure))=0 THEN
  problems:=problems||'V139: pwa_submit_operation_v2 does not record P5B10 as insufficient_funds'::text; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=current_user AND rolsuper) THEN
  FOR r IN SELECT pg_get_userbyid(p.proowner) AS owner FROM pg_proc p WHERE p.oid='public.pwa_apply_loan_create_v2(text)'::regprocedure LOOP
   IF NOT pg_has_role(current_user,r.owner,'USAGE') THEN problems:=problems||format('%s cannot replace routines owned by %s (owner window required)',current_user,r.owner); END IF;
  END LOOP;
 END IF;
 IF cardinality(problems)>0 THEN RAISE EXCEPTION 'V139 preflight: %',array_to_string(problems,'; '); END IF;
END $preflight$;

CREATE TEMP TABLE v139_routine ON COMMIT DROP AS
 SELECT pg_get_userbyid(p.proowner) AS owner,coalesce(p.proacl,acldefault('f',p.proowner)) AS effective,p.prosecdef AS definer,p.provolatile AS volatile,
  p.proconfig AS config,obj_description(p.oid,'pg_proc') AS comment
 FROM pg_proc p WHERE p.oid='public.pwa_apply_loan_create_v2(text)'::regprocedure;

DO $patch$
DECLARE definition text:=pg_get_functiondef('public.pwa_apply_loan_create_v2(text)'::regprocedure); k integer; o text; n text;
 edits text[]:=ARRAY[
  $o$component record;$o$,
  $n$component record;message text; /* R136 V139 */$n$,
  $o$ INSERT INTO public."Loans"("Row ID",$o$,
  $n$ -- R136 V139: the V17 cash pool guard is a refusal (P5B10, recorded as insufficient_funds), not a failed request.
 BEGIN
 INSERT INTO public."Loans"("Row ID",$n$,
  $o$l."Loan Status",false,l."Interest Schedule Anchor Date");$o$,
  $n$l."Loan Status",false,l."Interest Schedule Anchor Date");
 EXCEPTION WHEN check_violation THEN GET STACKED DIAGNOSTICS message=MESSAGE_TEXT;
  IF message LIKE 'New loan exceeds available cashpool%' THEN RAISE EXCEPTION USING ERRCODE='P5B10';ELSE RAISE;END IF;
 END;$n$];
BEGIN
 FOR k IN 1..array_length(edits,1)/2 LOOP
  o:=edits[2*k-1];n:=edits[2*k];
  IF position(o IN definition)=0 AND position(E'\n' IN o)>0 THEN o:=replace(o,E'\n',E'\r\n');n:=replace(n,E'\n',E'\r\n'); END IF;
  IF (length(definition)-length(replace(definition,o,'')))/length(o)<>1 THEN RAISE EXCEPTION 'V139: unexpected pwa_apply_loan_create_v2 boundary %',k; END IF;
  definition:=replace(definition,o,n);
 END LOOP;
 EXECUTE definition;
END $patch$;

-- Self-check: owner, ACL, security, volatility, configuration and comment unchanged; the mapping in place.
DO $check$
DECLARE bad boolean;
BEGIN
 SELECT pg_get_userbyid(p.proowner)<>o.owner OR p.prosecdef<>o.definer OR p.provolatile<>o.volatile OR p.proconfig IS DISTINCT FROM o.config
   OR obj_description(p.oid,'pg_proc') IS DISTINCT FROM o.comment
   OR (SELECT array_agg(a.grantee::text||':'||a.privilege_type ORDER BY (a.grantee::text||':'||a.privilege_type) COLLATE "C") FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee<>p.proowner)
    IS DISTINCT FROM (SELECT array_agg(a.grantee::text||':'||a.privilege_type ORDER BY (a.grantee::text||':'||a.privilege_type) COLLATE "C") FROM aclexplode(o.effective) a WHERE a.grantee<>p.proowner)
  INTO bad FROM pg_proc p CROSS JOIN v139_routine o WHERE p.oid='public.pwa_apply_loan_create_v2(text)'::regprocedure;
 IF bad IS DISTINCT FROM false THEN RAISE EXCEPTION 'V139 changed the owner, privileges, attributes or comment of pwa_apply_loan_create_v2'; END IF;
 IF position($c$IF message LIKE 'New loan exceeds available cashpool%' THEN RAISE EXCEPTION USING ERRCODE='P5B10'$c$ IN pg_get_functiondef('public.pwa_apply_loan_create_v2(text)'::regprocedure))=0 THEN
  RAISE EXCEPTION 'V139: pwa_apply_loan_create_v2 is not patched'; END IF;
END $check$;
