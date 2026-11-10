-- R140 pending manual expense (owner request of 10 November 2026: "allow creating a manual expense that is pending payment";
-- Archie's design). V141 is applied and stays. Before V142 only an automatic referral rebate (REFERRAL_REBATE_V3) could be
-- pending payment. A manual expense is now pending payment when "Source Type"='Manual', "Amount">0, "Ref Paid By Cash
-- Holder" and "Ref Paid By Cash Account" are both null and the row is no R005 cutover source. No new table, column, command
-- key or trigger: sync_cash_ledger already writes no ledger row for an expense without a payer.
-- Paying it is the existing expense.update with paidByAccountId (the cash triggers project the System ledger row, dated on
-- the Expense Date); setting the account back to null returns it to pending and removes that row (a Tommy-paid expense with
-- a linked reimbursement refuses with the existing P5B05). Versioning, locks, the idempotent journal and history are unchanged.
-- Objects (each replaced in place by a counted text replacement of its current definition, V137/V139 method; CREATE OR
-- REPLACE keeps owner, ACL, security, volatility, configuration and comment, and the self-check proves it):
--  1. pwa_apply_expense_v2: expense.create no longer refuses a positive amount without an account (P5B07); an unknown or
--     inactive account is still P5B07.
--  2. guard_source_cash_holder: "New positive expenses require an explicit cash payer" applies to non-Manual rows only.
--  3. guard_source_cash_account: for a Manual row an account is required only when a holder is set.
--  4. guard_opening_included_source: Lisa's default account is filled in only when a holder is set, the row is not Manual or
--     the row is a cutover source (before V142 any update of a pending row would have paid it silently).
--  5. Comments on the two payer columns (the chat schema digest carries them), and SELECT on r005_cash_cutover_sources for
--     mw_app_<env> (the app-role policy already classifies the table read-only; the PWA reads exclude cutover rows from
--     pending; granted here because PROD has no post-migrate reconciliation, as V98 did; idempotent).
-- Rollback: a later migration restores the V141 bodies; pending rows created meanwhile must be paid or deleted first,
-- because the V141 guards refuse any update of a positive Manual expense without a payer.

DO $preflight$
DECLARE problems text[]:='{}'; r record; suffix text:=CASE current_database() WHEN 'loan_manager_prod' THEN 'prod' ELSE 'dev' END;
BEGIN
 IF current_database() NOT IN ('loan_manager_dev','payment_rehearsal','loan_manager_prod') THEN RAISE EXCEPTION 'Unsupported application database'; END IF;
 IF position('jsonb_array_length(lines) NOT BETWEEN 1 AND 100' IN pg_get_functiondef('public.pwa_chat_proposal_create_v1(jsonb,uuid,jsonb)'::regprocedure))=0 THEN
  problems:=problems||'V142 needs V141'::text; END IF;
 IF EXISTS(SELECT 1 FROM unnest(ARRAY['public.pwa_apply_expense_v2(text)','public.guard_source_cash_holder()','public.guard_source_cash_account()','public.guard_opening_included_source()']) f
   WHERE position('R140' IN pg_get_functiondef(f::regprocedure))>0) THEN problems:=problems||'V142: a routine is already patched'::text; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='mw_app_'||suffix) THEN problems:=problems||format('V142 needs the role mw_app_%s',suffix); END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=current_user AND rolsuper) THEN
  FOR r IN SELECT DISTINCT pg_get_userbyid(p.proowner) AS owner FROM pg_proc p WHERE p.oid IN ('public.pwa_apply_expense_v2(text)'::regprocedure,
    'public.guard_source_cash_holder()'::regprocedure,'public.guard_source_cash_account()'::regprocedure,'public.guard_opening_included_source()'::regprocedure) LOOP
   IF NOT pg_has_role(current_user,r.owner,'USAGE') THEN problems:=problems||format('%s cannot replace routines owned by %s (owner window required)',current_user,r.owner); END IF;
  END LOOP;
  IF NOT pg_has_role(current_user,(SELECT relowner FROM pg_class WHERE oid='public."Business Expenses"'::regclass),'USAGE') THEN
   problems:=problems||format('%s cannot comment on "Business Expenses" columns',current_user); END IF;
 END IF;
 IF cardinality(problems)>0 THEN RAISE EXCEPTION 'V142 preflight: %',array_to_string(problems,'; '); END IF;
END $preflight$;

-- Snapshot of every routine replaced in place: owner, effective ACL, security, volatility, configuration and comment.
CREATE TEMP TABLE v142_routines ON COMMIT DROP AS
 SELECT r.name AS routine,pg_get_userbyid(p.proowner) AS owner,coalesce(p.proacl,acldefault('f',p.proowner)) AS effective,
  p.prosecdef AS definer,p.provolatile AS volatile,p.proconfig AS config,obj_description(p.oid,'pg_proc') AS comment
 FROM unnest(ARRAY['public.pwa_apply_expense_v2(text)','public.guard_source_cash_holder()','public.guard_source_cash_account()',
  'public.guard_opening_included_source()']) r(name) JOIN pg_proc p ON p.oid=r.name::regprocedure;

-- Exact, counted replacements (every boundary must occur exactly once; a CRLF body is matched as written).
CREATE FUNCTION pg_temp.v142_patch(routine text, edits text[]) RETURNS void LANGUAGE plpgsql AS $patch$
DECLARE definition text:=pg_get_functiondef(routine::regprocedure); k integer; o text; n text;
BEGIN
 FOR k IN 1..array_length(edits,1)/2 LOOP
  o:=edits[2*k-1];n:=edits[2*k];
  IF position(o IN definition)=0 AND position(E'\n' IN o)>0 THEN o:=replace(o,E'\n',E'\r\n');n:=replace(n,E'\n',E'\r\n'); END IF;
  IF (length(definition)-length(replace(definition,o,'')))/length(o)<>1 THEN RAISE EXCEPTION 'V142: unexpected % boundary %',routine,k; END IF;
  definition:=replace(definition,o,n);
 END LOOP;
 IF position('R140' IN definition)=0 THEN RAISE EXCEPTION 'V142: % patch carries no R140 marker',routine; END IF;
 EXECUTE definition;
END $patch$;

-- 1. The command: a positive manual expense without an account is created pending payment.
SELECT pg_temp.v142_patch('public.pwa_apply_expense_v2(text)',ARRAY[
 $o$ IF op='expense.create' AND (i->>'amount')::numeric>0 AND holder IS NULL THEN RAISE EXCEPTION USING ERRCODE='P5B07';END IF;$o$,
 $n$ /* R140 V142: a positive expense without an account is created pending payment (no cash movement until it is paid). */$n$]);

-- 2. The explicit cash payer rule: non-Manual rows only (a Referral Rebate stays fixed to Lisa above it).
SELECT pg_temp.v142_patch('public.guard_source_cash_holder()',ARRAY[
 $o$   IF NEW."Amount"::numeric>0 AND NEW."Ref Paid By Cash Holder" IS NULL THEN RAISE EXCEPTION 'New positive expenses require an explicit cash payer'; END IF;$o$,
 $n$   -- R140 V142: a Manual expense without a payer is pending payment.
   IF NEW."Source Type" IS DISTINCT FROM 'Manual' AND NEW."Amount"::numeric>0 AND NEW."Ref Paid By Cash Holder" IS NULL THEN RAISE EXCEPTION 'New positive expenses require an explicit cash payer'; END IF;$n$]);

-- 3. The account rule: for a Manual row an account is required only with a holder.
SELECT pg_temp.v142_patch('public.guard_source_cash_account()',ARRAY[
 $o$  required_account:=(TG_OP='INSERT' OR account_id IS DISTINCT FROM old_account) AND (NEW."Amount"::numeric>0 OR selected_holder IS NOT NULL);$o$,
 $n$  -- R140 V142: a Manual expense without holder and account is pending payment.
  required_account:=(TG_OP='INSERT' OR account_id IS DISTINCT FROM old_account) AND ((NEW."Amount"::numeric>0 AND NEW."Source Type" IS DISTINCT FROM 'Manual') OR selected_holder IS NOT NULL);$n$]);

-- 4. The opening fill: never pays a pending manual expense; a holder, a non-Manual row or a cutover source keeps the V61 fill.
SELECT pg_temp.v142_patch('public.guard_opening_included_source()',ARRAY[
 $o$   AND (NEW."Amount"::numeric>0 OR NEW."Ref Paid By Cash Holder" IS NOT NULL) THEN$o$,
 $n$   -- R140 V142: a pending Manual expense (no payer, not a cutover source) stays pending when it is edited.
   AND (NEW."Ref Paid By Cash Holder" IS NOT NULL OR (NEW."Amount"::numeric>0 AND (NEW."Source Type" IS DISTINCT FROM 'Manual'
    OR EXISTS(SELECT 1 FROM public.r005_cash_cutover_sources WHERE source_type='Business Expense' AND source_row_id=NEW."Row ID")))) THEN$n$]);

-- 5. Comments and the cutover read.
COMMENT ON COLUMN public."Business Expenses"."Ref Paid By Cash Account" IS 'R140: the cash account that paid the expense. Null on a Manual expense above zero that is no R005 cutover source means pending payment: no cash movement until an account is set (the movement is then dated on the Expense Date).';
COMMENT ON COLUMN public."Business Expenses"."Ref Paid By Cash Holder" IS 'R140: the holder of "Ref Paid By Cash Account" (derived from it). Null together with the account on a Manual expense above zero that is no R005 cutover source means pending payment.';
DO $grant$
BEGIN
 EXECUTE format('GRANT SELECT ON public.r005_cash_cutover_sources TO %I','mw_app_'||CASE current_database() WHEN 'loan_manager_prod' THEN 'prod' ELSE 'dev' END);
END $grant$;

-- Self-check: owner, ACL, security, volatility, configuration and comment unchanged; every patch in place.
DO $check$
DECLARE bad text; app text:='mw_app_'||CASE current_database() WHEN 'loan_manager_prod' THEN 'prod' ELSE 'dev' END;
BEGIN
 SELECT string_agg(o.routine,', ') INTO bad FROM v142_routines o JOIN pg_proc p ON p.oid=o.routine::regprocedure
  WHERE pg_get_userbyid(p.proowner)<>o.owner OR p.prosecdef<>o.definer OR p.provolatile<>o.volatile OR p.proconfig IS DISTINCT FROM o.config
   OR obj_description(p.oid,'pg_proc') IS DISTINCT FROM o.comment
   OR (SELECT array_agg(a.grantee::text||':'||a.privilege_type ORDER BY (a.grantee::text||':'||a.privilege_type) COLLATE "C") FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee<>p.proowner)
    IS DISTINCT FROM (SELECT array_agg(a.grantee::text||':'||a.privilege_type ORDER BY (a.grantee::text||':'||a.privilege_type) COLLATE "C") FROM aclexplode(o.effective) a WHERE a.grantee<>p.proowner);
 IF bad IS NOT NULL OR (SELECT count(*) FROM v142_routines)<>4 THEN RAISE EXCEPTION 'V142 changed the owner, privileges, attributes or comment of %',coalesce(bad,'an unexpected routine set'); END IF;
 SELECT string_agg(r,', ') INTO bad FROM unnest(ARRAY['public.pwa_apply_expense_v2(text)','public.guard_source_cash_holder()','public.guard_source_cash_account()',
   'public.guard_opening_included_source()']) r WHERE position('R140' IN pg_get_functiondef(r::regprocedure))=0;
 IF bad IS NOT NULL THEN RAISE EXCEPTION 'V142: not patched: %',bad; END IF;
 IF position($c$holder IS NULL THEN RAISE EXCEPTION USING ERRCODE='P5B07'$c$ IN pg_get_functiondef('public.pwa_apply_expense_v2(text)'::regprocedure))>0
  OR position($c$ERRCODE='P5B07'$c$ IN pg_get_functiondef('public.pwa_apply_expense_v2(text)'::regprocedure))=0 THEN
  RAISE EXCEPTION 'V142: pwa_apply_expense_v2 must keep P5B07 for an invalid account only'; END IF;
 IF NOT has_table_privilege(app,'public.r005_cash_cutover_sources','SELECT') OR has_table_privilege(app,'public.r005_cash_cutover_sources','INSERT')
  OR has_table_privilege(app,'public.r005_cash_cutover_sources','UPDATE') OR has_table_privilege(app,'public.r005_cash_cutover_sources','DELETE') THEN
  RAISE EXCEPTION 'V142: % must read r005_cash_cutover_sources only',app; END IF;
END $check$;
