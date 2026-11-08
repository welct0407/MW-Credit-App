-- R128 Loan Close slip facts (owner instruction of 5 November 2026: close a loan from the Instagram receipt review, and
-- read the slip on the Close Loan page as on Receive payment; promotion authorized). Functions only: no table, column,
-- grant or trigger change. V135 is applied and stays.
-- Objects:
--  1. pwa_submit_operation_v2, loan.close: two optional inputs after rebatePath, each only when present (the rebatePath
--     pattern, so a command saved by an older PWA stays valid and canonical): bankReference (string of 1 to 256 bytes, not
--     blank, no CR or LF) and transferTime (HH:MM). Either one needs paymentMethod 'Bank Transfer'.
--  2. pwa_apply_loan_close_v2 writes "Bank Reference" (the reference, else null as before) and "Created At" (paymentDate and
--     transferTime, else null as before) on the closing payment. The payment date stays the business day the command checks,
--     so an agent close carries the facts attach_payment_receipt_evidence verifies (date, clock, reference) and the receipt
--     image can be linked after posting, as for an agent receipt payment.
-- The agent's Instagram-approved close posts this same command through the shared command service (contract 2, the agent's
-- own actor and request id namespace); version, business day, plan hash, rebate and idempotency are checked here as for a
-- PWA close. Nothing is disabled; every integrity and calculation trigger runs as before.
-- Preflight: V135 is applied, neither routine is patched, the runner can replace them. Self-check: owner, ACL, security,
-- volatility, configuration and comment of both routines unchanged; the R128 patches are in place.
-- Rollback: a later migration restores the V135 bodies (a command with the new keys would then be refused as invalid).

DO $preflight$
DECLARE problems text[]:='{}'; r record;
BEGIN
 IF current_database() NOT IN ('loan_manager_dev','payment_rehearsal','loan_manager_prod') THEN RAISE EXCEPTION 'Unsupported application database'; END IF;
 IF to_regprocedure('public.referral_rebate_terms(text)') IS NULL THEN problems:=problems||'V136 needs V135 (referral_rebate_terms)'::text; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='public."Payments"'::regclass AND attname='Bank Reference' AND NOT attisdropped)
  OR NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='public."Payments"'::regclass AND attname='Created At' AND NOT attisdropped) THEN
  problems:=problems||'V136 needs "Payments"."Bank Reference" and "Created At"'::text; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=current_user AND rolsuper) THEN
  -- Replacing a routine needs its owner's authority (the owner window of the release).
  FOR r IN SELECT DISTINCT pg_get_userbyid(p.proowner) AS owner FROM pg_proc p WHERE p.oid IN ('public.pwa_submit_operation_v2(text)'::regprocedure,
    'public.pwa_apply_loan_close_v2(text)'::regprocedure) LOOP
   IF NOT pg_has_role(current_user,r.owner,'USAGE') THEN problems:=problems||format('%s cannot replace routines owned by %s (owner window required)',current_user,r.owner); END IF;
  END LOOP;
 END IF;
 IF cardinality(problems)>0 THEN RAISE EXCEPTION 'V136 preflight: %',array_to_string(problems,'; '); END IF;
END $preflight$;

-- Snapshot of both routines: owner, effective ACL, security, volatility, configuration and comment.
CREATE TEMP TABLE v136_routines ON COMMIT DROP AS
 SELECT r.name AS routine,pg_get_userbyid(p.proowner) AS owner,coalesce(p.proacl,acldefault('f',p.proowner)) AS effective,
  p.prosecdef AS definer,p.provolatile AS volatile,p.proconfig AS config,obj_description(p.oid,'pg_proc') AS comment
 FROM unnest(ARRAY['public.pwa_submit_operation_v2(text)','public.pwa_apply_loan_close_v2(text)']) r(name) JOIN pg_proc p ON p.oid=r.name::regprocedure;

-- Exact, counted replacements in a routine's current definition (V132/V135 method): every boundary must occur exactly once,
-- else the migration fails; bodies first created from a CRLF file keep CRLF line ends and are matched as written.
CREATE FUNCTION pg_temp.v136_patch(routine text, edits text[]) RETURNS void LANGUAGE plpgsql AS $patch$
DECLARE definition text:=pg_get_functiondef(routine::regprocedure); k integer; o text; n text;
BEGIN
 IF position('R128' IN definition)>0 THEN RAISE EXCEPTION 'V136: % is already patched',routine; END IF;
 FOR k IN 1..array_length(edits,1)/2 LOOP
  o:=edits[2*k-1];n:=edits[2*k];
  IF position(o IN definition)=0 AND position(E'\n' IN o)>0 THEN o:=replace(o,E'\n',E'\r\n');n:=replace(n,E'\n',E'\r\n'); END IF;
  IF (length(definition)-length(replace(definition,o,'')))/length(o)<>1 THEN RAISE EXCEPTION 'V136: unexpected % boundary %',routine,k; END IF;
  definition:=replace(definition,o,n);
 END LOOP;
 IF position('R128' IN definition)=0 THEN RAISE EXCEPTION 'V136: % patch carries no R128 marker',routine; END IF;
 EXECUTE definition;
END $patch$;

-- 1. The loan.close inputs: optional bankReference and transferTime after rebatePath, bank transfers only.
SELECT pg_temp.v136_patch('public.pwa_submit_operation_v2(text)',ARRAY[
 $o$keys:=ARRAY['paymentDate','cashAccountId','paymentMethod','notes','expectedAmount','expectedPlanHash']||CASE WHEN i ? 'rebatePath' THEN ARRAY['rebatePath'] ELSE ARRAY[]::text[] END;$o$,
 $n$keys:=ARRAY['paymentDate','cashAccountId','paymentMethod','notes','expectedAmount','expectedPlanHash']||CASE WHEN i ? 'rebatePath' THEN ARRAY['rebatePath'] ELSE ARRAY[]::text[] END
  -- R128: the slip's bank reference and transfer time, each only when present (an older PWA's command stays canonical).
  ||CASE WHEN i ? 'bankReference' THEN ARRAY['bankReference'] ELSE ARRAY[]::text[] END||CASE WHEN i ? 'transferTime' THEN ARRAY['transferTime'] ELSE ARRAY[]::text[] END;$n$,
 $o$ OR (i ? 'rebatePath' AND i->>'rebatePath' NOT IN('offset','expense')) THEN RAISE EXCEPTION 'close input';END IF;$o$,
 $n$ OR (i ? 'rebatePath' AND i->>'rebatePath' NOT IN('offset','expense'))
  OR (i ? 'bankReference' AND (octet_length(i->>'bankReference') NOT BETWEEN 1 AND 256 OR btrim(i->>'bankReference')='' OR i->>'bankReference'~'[\r\n]'))
  OR (i ? 'transferTime' AND i->>'transferTime'!~'^([01][0-9]|2[0-3]):[0-5][0-9]$')
  OR ((i ? 'bankReference' OR i ? 'transferTime') AND i->>'paymentMethod'<>'Bank Transfer') /* R128 */ THEN RAISE EXCEPTION 'close input';END IF;$n$]);

-- 2. The closing payment carries the slip's reference and transfer time (null without them, as before).
SELECT pg_temp.v136_patch('public.pwa_apply_loan_close_v2(text)',ARRAY[
 $o$"Ref Received By Cash Account","Notes","Uploaded Receipt","Created By","Status")$o$,
 $n$"Ref Received By Cash Account","Notes","Uploaded Receipt","Created By","Status","Bank Reference","Created At")$n$,
 $o$i->>'notes',e#>>'{receipt,storageReference}',a->>'loginEmail','Processing');$o$,
 $n$i->>'notes',e#>>'{receipt,storageReference}',a->>'loginEmail','Processing',
  -- R128: the slip's reference and transfer time on the business day (the receipt evidence link verifies both).
  i->>'bankReference',CASE WHEN i ? 'transferTime' THEN ((i->>'paymentDate')||' '||(i->>'transferTime')||':00')::timestamp END);$n$]);

-- Self-check.
DO $check$
DECLARE bad text;
BEGIN
 SELECT string_agg(o.routine,', ') INTO bad FROM v136_routines o JOIN pg_proc p ON p.oid=o.routine::regprocedure
  WHERE pg_get_userbyid(p.proowner)<>o.owner OR p.prosecdef<>o.definer OR p.provolatile<>o.volatile OR p.proconfig IS DISTINCT FROM o.config
   OR obj_description(p.oid,'pg_proc') IS DISTINCT FROM o.comment
   OR (SELECT array_agg(a.grantee::text||':'||a.privilege_type ORDER BY a.grantee,a.privilege_type) FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee<>p.proowner)
    IS DISTINCT FROM (SELECT array_agg(a.grantee::text||':'||a.privilege_type ORDER BY a.grantee,a.privilege_type) FROM aclexplode(o.effective) a WHERE a.grantee<>p.proowner);
 IF bad IS NOT NULL OR (SELECT count(*) FROM v136_routines)<>2 THEN RAISE EXCEPTION 'V136 changed the owner, privileges, attributes or comment of %',coalesce(bad,'an unexpected routine set'); END IF;
 SELECT string_agg(r,', ') INTO bad FROM unnest(ARRAY['public.pwa_submit_operation_v2(text)','public.pwa_apply_loan_close_v2(text)']) r
  WHERE position('R128' IN pg_get_functiondef(r::regprocedure))=0;
 IF bad IS NOT NULL THEN RAISE EXCEPTION 'V136: not patched: %',bad; END IF;
 IF position($s$"Bank Reference","Created At")$s$ IN pg_get_functiondef('public.pwa_apply_loan_close_v2(text)'::regprocedure))=0
  OR position($s$ARRAY['transferTime']$s$ IN pg_get_functiondef('public.pwa_submit_operation_v2(text)'::regprocedure))=0 THEN
  RAISE EXCEPTION 'V136: the slip facts are missing'; END IF;
END $check$;
