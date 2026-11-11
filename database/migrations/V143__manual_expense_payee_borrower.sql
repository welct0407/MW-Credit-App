-- R140 follow-up: the payee of a manual expense (owner, 10 November 2026: "The payee can be some existing borrower, like
-- referrers, or someone else like Dad."; Archie's design). V142 is applied and stays. No new table, column or grant: a manual
-- expense may link its payee to a borrower through the existing "Business Expenses"."Ref Payee Borrower" (the referral
-- rebate payee column), with "Payee Name" holding the borrower's name as a snapshot (reads show the live borrower label).
-- Command: expense.create and expense.update take an optional last input key payeeBorrowerId (the R128 optional-key
-- pattern: a command without it keeps its 8-key canonical form and meaning).
--  * a string: an existing borrower (else P5B04, invalid_reference); payeeName must then be null (else invalid request);
--    the row stores the link and the borrower's current "Borrower Name" in "Payee Name".
--  * null: no link; payeeName is free text.
--  * absent: create has no link; update keeps the stored link while payeeName equals the stored "Payee Name" and clears
--    it when payeeName differs (an older client that edits the name means a typed payee).
-- Only Manual rows change (a referral rebate is P5B05 as before). Deleting a borrower that is a payee stays the existing
-- dependency_conflict (P5B05: the borrower delete maps the foreign key violation).
-- Objects (replaced in place by counted text replacement of the current definition, V137/V139/V142 method; CREATE OR
-- REPLACE keeps owner, ACL, security, volatility, configuration and comment, and the self-check proves it):
--  1. pwa_submit_operation_v2: the expense branch accepts the 8 keys or the 8 keys plus payeeBorrowerId, validates the
--     reference and canonicalizes it last, only when present.
--  2. pwa_apply_expense_v2: the payee rule above.
--  3. Comments on "Payee Name" and "Ref Payee Borrower" (the chat schema digest carries them).
-- Rollback: a later migration restores the V142 bodies; links already stored stay (an 8-key edit keeps them).

DO $preflight$
DECLARE problems text[]:='{}'; r record;
BEGIN
 IF current_database() NOT IN ('loan_manager_dev','payment_rehearsal','loan_manager_prod') THEN RAISE EXCEPTION 'Unsupported application database'; END IF;
 IF position('R140 V142' IN pg_get_functiondef('public.pwa_apply_expense_v2(text)'::regprocedure))=0 THEN problems:=problems||'V143 needs V142'::text; END IF;
 IF EXISTS(SELECT 1 FROM unnest(ARRAY['public.pwa_submit_operation_v2(text)','public.pwa_apply_expense_v2(text)']) f WHERE position('R140 V143' IN pg_get_functiondef(f::regprocedure))>0) THEN
  problems:=problems||'V143: a routine is already patched'::text; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=current_user AND rolsuper) THEN
  FOR r IN SELECT DISTINCT pg_get_userbyid(p.proowner) AS owner FROM pg_proc p WHERE p.oid IN ('public.pwa_submit_operation_v2(text)'::regprocedure,'public.pwa_apply_expense_v2(text)'::regprocedure) LOOP
   IF NOT pg_has_role(current_user,r.owner,'USAGE') THEN problems:=problems||format('%s cannot replace routines owned by %s (owner window required)',current_user,r.owner); END IF;
  END LOOP;
  IF NOT pg_has_role(current_user,(SELECT relowner FROM pg_class WHERE oid='public."Business Expenses"'::regclass),'USAGE') THEN
   problems:=problems||format('%s cannot comment on "Business Expenses" columns',current_user); END IF;
 END IF;
 IF cardinality(problems)>0 THEN RAISE EXCEPTION 'V143 preflight: %',array_to_string(problems,'; '); END IF;
END $preflight$;

CREATE TEMP TABLE v143_routines ON COMMIT DROP AS
 SELECT r.name AS routine,pg_get_userbyid(p.proowner) AS owner,coalesce(p.proacl,acldefault('f',p.proowner)) AS effective,
  p.prosecdef AS definer,p.provolatile AS volatile,p.proconfig AS config,obj_description(p.oid,'pg_proc') AS comment
 FROM unnest(ARRAY['public.pwa_submit_operation_v2(text)','public.pwa_apply_expense_v2(text)']) r(name) JOIN pg_proc p ON p.oid=r.name::regprocedure;

-- Exact, counted replacements (every boundary must occur exactly once). Both bodies keep CRLF line ends, so every insertion
-- stays on its boundary's line.
CREATE FUNCTION pg_temp.v143_patch(routine text, edits text[]) RETURNS void LANGUAGE plpgsql AS $patch$
DECLARE definition text:=pg_get_functiondef(routine::regprocedure); k integer; o text; n text;
BEGIN
 FOR k IN 1..array_length(edits,1)/2 LOOP
  o:=edits[2*k-1];n:=edits[2*k];
  IF (length(definition)-length(replace(definition,o,'')))/length(o)<>1 THEN RAISE EXCEPTION 'V143: unexpected % boundary %',routine,k; END IF;
  definition:=replace(definition,o,n);
 END LOOP;
 IF position('R140 V143' IN definition)=0 THEN RAISE EXCEPTION 'V143: % patch carries no R140 V143 marker',routine; END IF;
 EXECUTE definition;
END $patch$;

-- 1. The canonical command: payeeBorrowerId is an optional last key (string reference or null); with a borrower, payeeName is null.
SELECT pg_temp.v143_patch('public.pwa_submit_operation_v2(text)',ARRAY[
 $o$keys:=ARRAY['expenseDate','category','amount','payeeName','relatedBorrowerId','relatedLoanId','notes','paidByAccountId'];$o$,
 $n$keys:=ARRAY['expenseDate','category','amount','payeeName','relatedBorrowerId','relatedLoanId','notes','paidByAccountId']||CASE WHEN i ? 'payeeBorrowerId' THEN ARRAY['payeeBorrowerId'] ELSE ARRAY[]::text[] END; /* R140 V143: the optional payee borrower, last */$n$,
 $o$IF k IN('relatedBorrowerId','relatedLoanId','paidByAccountId') AND$o$,
 $n$IF k IN('relatedBorrowerId','relatedLoanId','paidByAccountId','payeeBorrowerId') AND$n$,
 $o$abs((i->>'amount')::numeric)>92233720368547758 THEN RAISE EXCEPTION 'expense input';END IF;$o$,
 $n$abs((i->>'amount')::numeric)>92233720368547758 THEN RAISE EXCEPTION 'expense input';END IF; IF i->>'payeeBorrowerId' IS NOT NULL AND i->'payeeName'<>'null'::jsonb THEN RAISE EXCEPTION 'expense payee';END IF; /* R140 V143: a borrower payee carries no typed name */$n$]);

-- 2. The apply: the payee link and its name snapshot.
SELECT pg_temp.v143_patch('public.pwa_apply_expense_v2(text)',ARRAY[
 $o$holder text;message text;$o$,
 $n$holder text;message text;payee text;payee_name text; /* R140 V143 */$n$,
 $o$/* R140 V142: a positive expense without an account is created pending payment (no cash movement until it is paid). */$o$,
 $n$/* R140 V142: a positive expense without an account is created pending payment (no cash movement until it is paid). */ /* R140 V143: the payee is a borrower (key present: the link and the borrower's name as a snapshot) or a typed name; an update without the key keeps the stored link while the name is unchanged. */ payee_name:=i->>'payeeName'; IF i ? 'payeeBorrowerId' THEN payee:=i->>'payeeBorrowerId'; ELSIF op='expense.update' AND (i->>'payeeName') IS NOT DISTINCT FROM old."Payee Name" THEN payee:=old."Ref Payee Borrower"; END IF; IF i ? 'payeeBorrowerId' AND payee IS NOT NULL THEN SELECT "Borrower Name" INTO payee_name FROM public."Borrowers" WHERE "Row ID"=payee; IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P5B04';END IF; END IF;$n$,
 $o$"Source Type","Created By") VALUES($o$,
 $n$"Source Type","Created By","Ref Payee Borrower") VALUES($n$,
 $o$'Manual',a->>'loginEmail');$o$,
 $n$'Manual',a->>'loginEmail',payee);$n$,
 $o$(i->>'amount')::numeric::money,i->>'payeeName',i->>'relatedBorrowerId'$o$,
 $n$(i->>'amount')::numeric::money,payee_name,i->>'relatedBorrowerId'$n$,
 $o$"Payee Name"=i->>'payeeName'$o$,
 $n$"Payee Name"=payee_name,"Ref Payee Borrower"=payee$n$]);

-- 3. The payee columns.
COMMENT ON COLUMN public."Business Expenses"."Ref Payee Borrower" IS 'R140: the borrower who is paid: the referrer of a referral rebate, or the borrower chosen as payee of a manual expense (null when the payee is a typed name).';
COMMENT ON COLUMN public."Business Expenses"."Payee Name" IS 'R140: who is paid: a typed name, or the payee borrower''s name when the expense was saved (a snapshot; reads show the live borrower name through "Ref Payee Borrower").';

-- Self-check: owner, ACL, security, volatility, configuration and comment unchanged; both patches in place.
DO $check$
DECLARE bad text;
BEGIN
 SELECT string_agg(o.routine,', ') INTO bad FROM v143_routines o JOIN pg_proc p ON p.oid=o.routine::regprocedure
  WHERE pg_get_userbyid(p.proowner)<>o.owner OR p.prosecdef<>o.definer OR p.provolatile<>o.volatile OR p.proconfig IS DISTINCT FROM o.config
   OR obj_description(p.oid,'pg_proc') IS DISTINCT FROM o.comment
   OR (SELECT array_agg(a.grantee::text||':'||a.privilege_type ORDER BY (a.grantee::text||':'||a.privilege_type) COLLATE "C") FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee<>p.proowner)
    IS DISTINCT FROM (SELECT array_agg(a.grantee::text||':'||a.privilege_type ORDER BY (a.grantee::text||':'||a.privilege_type) COLLATE "C") FROM aclexplode(o.effective) a WHERE a.grantee<>p.proowner);
 IF bad IS NOT NULL OR (SELECT count(*) FROM v143_routines)<>2 THEN RAISE EXCEPTION 'V143 changed the owner, privileges, attributes or comment of %',coalesce(bad,'an unexpected routine set'); END IF;
 IF position($c$'Manual',a->>'loginEmail',payee);$c$ IN pg_get_functiondef('public.pwa_apply_expense_v2(text)'::regprocedure))=0
  OR position($c$"Payee Name"=payee_name,"Ref Payee Borrower"=payee$c$ IN pg_get_functiondef('public.pwa_apply_expense_v2(text)'::regprocedure))=0
  OR position($c$THEN ARRAY['payeeBorrowerId'] ELSE ARRAY[]::text[] END; /* R140 V143$c$ IN pg_get_functiondef('public.pwa_submit_operation_v2(text)'::regprocedure))=0 THEN
  RAISE EXCEPTION 'V143: not patched'; END IF;
END $check$;
