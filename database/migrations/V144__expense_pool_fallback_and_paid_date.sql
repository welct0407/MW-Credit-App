-- R140 owner feedback of 11 November 2026 (Archie's design). V143 is applied and stays.
-- A. Allocation pool (owner: "it should always work, just like production"; "don't ever use other contributors. use
--    existing partner A and B"). partner_pool_share_at_date counts only Partners with role A or B. When the A/B pool on
--    the date is not positive or one side is negative, it uses the latest earlier date with a valid pool, else the earliest
--    later valid date, and raises only when no valid A/B pool exists on any date. On a date with a valid pool the share is
--    the one before V144, so existing splits stay. The contribution command (pwa_apply_management_financial_v2) refuses a
--    partner whose role is not A or B on create and update with the existing P5B04 (invalid_reference); delete stays allowed.
-- B. Paid date (owner: "the cash entry should be the day it is paid, not expense date"; the owner authorized the column).
--    New nullable "Business Expenses"."Paid Date": the day a manual expense was paid; null means the cash moved on the
--    Expense Date (no backfill, no ledger row moves). It is set only on a Manual row with a paying account that is no R005
--    cutover source (calculate_business_expense refuses it otherwise: pending, referral rebate, cutover).
--    expense.create and expense.update take an optional last input paidDate (after the optional payeeBorrowerId): a date,
--    only with paidByAccountId; a date after the Bangkok business date is P5B08 (invalid_date), and a paid date the row
--    cannot carry (a cutover row) is P5B08 too; absent on create is null; absent on update keeps the stored value while the
--    expense stays paid and is null otherwise (an older client paying a pending expense records it on the Expense Date).
--    sync_cash_ledger dates a Business Expense movement by coalesce("Paid Date","Expense Date"); the zz_cash_source trigger
--    of "Business Expenses" also fires on "Paid Date".
-- Objects: the column and its comment; partner_pool_share_at_date (new body, CREATE OR REPLACE); counted text replacements
-- (V137 method) of calculate_business_expense, sync_cash_ledger (ledger owner), pwa_apply_expense_v2,
-- pwa_submit_operation_v2 (journal owner) and pwa_apply_management_financial_v2; the zz_cash_source trigger recreated with
-- the same name, timing, function and argument. The self-check proves owner, ACL, security, volatility, configuration and
-- comment of every replaced routine unchanged and the trigger in place.
-- Rollback: a later migration restores the V143 bodies and trigger; "Paid Date" stays (set rows then move their cash back
-- to the Expense Date on their next change).

DO $preflight$
DECLARE problems text[]:='{}'; r record;
BEGIN
 IF current_database() NOT IN ('loan_manager_dev','payment_rehearsal','loan_manager_prod') THEN RAISE EXCEPTION 'Unsupported application database'; END IF;
 IF position('R140 V143' IN pg_get_functiondef('public.pwa_apply_expense_v2(text)'::regprocedure))=0 THEN problems:=problems||'V144 needs V143'::text; END IF;
 IF EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='public."Business Expenses"'::regclass AND attname='Paid Date' AND NOT attisdropped) THEN problems:=problems||'V144: "Paid Date" already exists'::text; END IF;
 IF EXISTS(SELECT 1 FROM unnest(ARRAY['public.calculate_business_expense()','public.sync_cash_ledger(text,text)','public.pwa_apply_expense_v2(text)','public.pwa_submit_operation_v2(text)',
   'public.pwa_apply_management_financial_v2(text)','public.partner_pool_share_at_date(date,text)']) f WHERE position('R140 V144' IN pg_get_functiondef(f::regprocedure))>0) THEN
  problems:=problems||'V144: a routine is already patched'::text; END IF;
 IF (SELECT pg_get_triggerdef(oid) FROM pg_trigger WHERE tgrelid='public."Business Expenses"'::regclass AND tgname='zz_cash_source')
   IS DISTINCT FROM 'CREATE TRIGGER zz_cash_source AFTER INSERT OR UPDATE OF "Amount", "Expense Date", "Ref Paid By Cash Holder", "Ref Paid By Cash Account" ON public."Business Expenses" FOR EACH ROW EXECUTE FUNCTION cash_source_changed(''Business Expense'')' THEN
  problems:=problems||'V144: the "Business Expenses" zz_cash_source trigger differs from V93'::text; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=current_user AND rolsuper) THEN
  -- The ledger owner (sync_cash_ledger), the journal owner (pwa_submit_operation_v2) and the table owner.
  FOR r IN SELECT DISTINCT pg_get_userbyid(p.proowner) AS owner FROM pg_proc p WHERE p.oid IN ('public.calculate_business_expense()'::regprocedure,'public.sync_cash_ledger(text,text)'::regprocedure,
    'public.pwa_apply_expense_v2(text)'::regprocedure,'public.pwa_submit_operation_v2(text)'::regprocedure,'public.pwa_apply_management_financial_v2(text)'::regprocedure,
    'public.partner_pool_share_at_date(date,text)'::regprocedure)
   UNION SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid='public."Business Expenses"'::regclass LOOP
   IF NOT pg_has_role(current_user,r.owner,'USAGE') THEN problems:=problems||format('%s cannot change objects owned by %s (owner window required)',current_user,r.owner); END IF;
  END LOOP;
 END IF;
 IF cardinality(problems)>0 THEN RAISE EXCEPTION 'V144 preflight: %',array_to_string(problems,'; '); END IF;
END $preflight$;

CREATE TEMP TABLE v144_routines ON COMMIT DROP AS
 SELECT r.name AS routine,pg_get_userbyid(p.proowner) AS owner,coalesce(p.proacl,acldefault('f',p.proowner)) AS effective,
  p.prosecdef AS definer,p.provolatile AS volatile,p.proconfig AS config,obj_description(p.oid,'pg_proc') AS comment
 FROM unnest(ARRAY['public.calculate_business_expense()','public.sync_cash_ledger(text,text)','public.pwa_apply_expense_v2(text)','public.pwa_submit_operation_v2(text)',
  'public.pwa_apply_management_financial_v2(text)','public.partner_pool_share_at_date(date,text)']) r(name) JOIN pg_proc p ON p.oid=r.name::regprocedure;
-- The ledger before V144 (the column moves no cash row; the self-check compares).
CREATE TEMP TABLE v144_ledger ON COMMIT DROP AS SELECT count(*) AS n,md5(coalesce(string_agg(to_jsonb(c)::text,'|' ORDER BY c."Row ID" COLLATE "C"),'')) AS digest FROM public."Cash Ledger" c;

-- B. The column.
ALTER TABLE public."Business Expenses" ADD COLUMN "Paid Date" date;
COMMENT ON COLUMN public."Business Expenses"."Paid Date" IS 'R140: the day a manual expense was paid (its cash movement date). Null means the cash moved on the Expense Date. Set only on a Manual expense with a paying account that is no R005 cutover source; null while pending and on referral rebates.';

-- A. The allocation pool: A/B partners only; the nearest valid pool when the date has none.
CREATE OR REPLACE FUNCTION public.partner_pool_share_at_date(p_date date, p_role text) RETURNS numeric
    LANGUAGE plpgsql STABLE
    SET search_path TO 'pg_catalog', 'public'
    AS $$
DECLARE a numeric; b numeric;
BEGIN
 -- R140 V144: only Partners with role A or B count. The pool is a step function of the contribution dates: the state on
 -- p_date is the one of the latest contribution date on or before it; when that state is not valid (pool not positive or a
 -- side negative), the latest earlier valid state, else the earliest later one.
 IF p_date IS NULL OR p_role IS NULL OR p_role NOT IN ('A','B') THEN
   RAISE EXCEPTION 'Expense allocation requires a positive A/B contribution pool on its allocation date';
 END IF;
 WITH day AS (
  SELECT c."Contribution Date" AS d,
   coalesce(sum(CASE WHEN c."Transaction Type"='Contribution' THEN c."Amount"::numeric ELSE -c."Amount"::numeric END) FILTER (WHERE p."Partner Role"='A'),0) AS da,
   coalesce(sum(CASE WHEN c."Transaction Type"='Contribution' THEN c."Amount"::numeric ELSE -c."Amount"::numeric END) FILTER (WHERE p."Partner Role"='B'),0) AS db
  FROM public."Cash Pool Contributions" c JOIN public."Partners" p ON p."Row ID"=c."Ref Partner" AND p."Partner Role" IN ('A','B')
  WHERE c."Contribution Date" IS NOT NULL GROUP BY c."Contribution Date"),
 state AS (SELECT d,sum(da) OVER (ORDER BY d) AS sa,sum(db) OVER (ORDER BY d) AS sb FROM day)
 SELECT sa,sb INTO a,b FROM state WHERE sa+sb>0 AND sa>=0 AND sb>=0
 ORDER BY (d<=p_date) DESC,CASE WHEN d<=p_date THEN d END DESC,d LIMIT 1;
 IF NOT FOUND THEN
   RAISE EXCEPTION 'Expense allocation requires a positive A/B contribution pool on its allocation date';
 END IF;
 RETURN CASE WHEN p_role='A' THEN a/(a+b) ELSE 1-a/(a+b) END;
END $$;

-- Exact, counted replacements (every boundary must occur exactly once); insertions stay on their boundary's line, so CRLF
-- bodies keep their line ends.
CREATE FUNCTION pg_temp.v144_patch(routine text, edits text[]) RETURNS void LANGUAGE plpgsql AS $patch$
DECLARE definition text:=pg_get_functiondef(routine::regprocedure); k integer; o text; n text;
BEGIN
 FOR k IN 1..array_length(edits,1)/2 LOOP
  o:=edits[2*k-1];n:=edits[2*k];
  IF (length(definition)-length(replace(definition,o,'')))/length(o)<>1 THEN RAISE EXCEPTION 'V144: unexpected % boundary %',routine,k; END IF;
  definition:=replace(definition,o,n);
 END LOOP;
 IF position('R140 V144' IN definition)=0 THEN RAISE EXCEPTION 'V144: % patch carries no R140 V144 marker',routine; END IF;
 EXECUTE definition;
END $patch$;

-- A. The contribution command refuses a partner whose role is not A or B (create and update; P5B04).
SELECT pg_temp.v144_patch('public.pwa_apply_management_financial_v2(text)',ARRAY[
 $o$ IF i ? 'partnerId' AND NOT EXISTS(SELECT 1 FROM public."Partners" WHERE "Row ID"=i->>'partnerId') THEN RAISE EXCEPTION USING ERRCODE='P5B04';END IF;$o$,
 $n$ IF i ? 'partnerId' AND NOT EXISTS(SELECT 1 FROM public."Partners" WHERE "Row ID"=i->>'partnerId') THEN RAISE EXCEPTION USING ERRCODE='P5B04';END IF; IF kind='capital-contribution' AND action<>'delete' AND NOT EXISTS(SELECT 1 FROM public."Partners" WHERE "Row ID"=i->>'partnerId' AND "Partner Role" IN ('A','B')) THEN RAISE EXCEPTION USING ERRCODE='P5B04';END IF; /* R140 V144: contributions come from Partner A or B only */$n$]);

-- B. The row rule: a paid date only on a paid Manual expense that is no cutover source.
SELECT pg_temp.v144_patch('public.calculate_business_expense()',ARRAY[
 $o$   IF TG_OP='INSERT' AND pg_trigger_depth()<2 THEN RAISE EXCEPTION 'Referral expenses require a qualifying loan-close event'; END IF;$o$,
 $n$   IF TG_OP='INSERT' AND pg_trigger_depth()<2 THEN RAISE EXCEPTION 'Referral expenses require a qualifying loan-close event'; END IF;
   -- R140 V144: a referral rebate moves its cash at close or settlement, never on a paid date.
   IF NEW."Paid Date" IS NOT NULL THEN RAISE EXCEPTION 'A paid date belongs to a paid manual expense'; END IF;$n$,
 $o$   allocation_date:=NEW."Expense Date";$o$,
 $n$   allocation_date:=NEW."Expense Date";
   -- R140 V144: a paid date needs a paying account (not pending) and no R005 cutover identity.
   IF NEW."Paid Date" IS NOT NULL AND (NEW."Ref Paid By Cash Account" IS NULL
     OR EXISTS(SELECT 1 FROM public.r005_cash_cutover_sources WHERE source_type='Business Expense' AND source_row_id=NEW."Row ID")) THEN
     RAISE EXCEPTION 'A paid date belongs to a paid manual expense'; END IF;$n$]);

-- B. The cash projection: a Business Expense moves on its paid date when one is set.
SELECT pg_temp.v144_patch('public.sync_cash_ledger(text,text)',ARRAY[
 $o$  SELECT "Expense Date",abs("Amount"::numeric),CASE WHEN "Amount"::numeric>0 THEN "Ref Paid By Cash Holder" END,$o$,
 $n$  SELECT coalesce("Paid Date","Expense Date") /* R140 V144: the paid date, else the Expense Date */,abs("Amount"::numeric),CASE WHEN "Amount"::numeric>0 THEN "Ref Paid By Cash Holder" END,$n$]);

-- B. The expense command: the optional paidDate (date only with an account, not after today), kept on an 8-key edit while paid.
SELECT pg_temp.v144_patch('public.pwa_apply_expense_v2(text)',ARRAY[
 $o$holder text;message text;payee text;payee_name text; /* R140 V143 */$o$,
 $n$holder text;message text;payee text;payee_name text; /* R140 V143 */ paid date; /* R140 V144 */$n$,
 $o$IF i ? 'payeeBorrowerId' AND payee IS NOT NULL THEN SELECT "Borrower Name" INTO payee_name FROM public."Borrowers" WHERE "Row ID"=payee; IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P5B04';END IF; END IF;$o$,
 $n$IF i ? 'payeeBorrowerId' AND payee IS NOT NULL THEN SELECT "Borrower Name" INTO payee_name FROM public."Borrowers" WHERE "Row ID"=payee; IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P5B04';END IF; END IF; /* R140 V144: the paid date: given (not after the Bangkok business date), else kept on an update that stays paid, else null (the Expense Date) */ IF i ? 'paidDate' THEN paid:=(i->>'paidDate')::date; IF paid>(statement_timestamp() AT TIME ZONE 'Asia/Bangkok')::date THEN RAISE EXCEPTION USING ERRCODE='P5B08';END IF; ELSIF op='expense.update' AND old."Ref Paid By Cash Account" IS NOT NULL AND i->>'paidByAccountId' IS NOT NULL THEN paid:=old."Paid Date"; END IF;$n$,
 $o$"Created By","Ref Payee Borrower") VALUES($o$,
 $n$"Created By","Ref Payee Borrower","Paid Date") VALUES($n$,
 $o$'Manual',a->>'loginEmail',payee);$o$,
 $n$'Manual',a->>'loginEmail',payee,paid);$n$,
 $o$"Payee Name"=payee_name,"Ref Payee Borrower"=payee$o$,
 $n$"Payee Name"=payee_name,"Ref Payee Borrower"=payee,"Paid Date"=paid$n$,
 $o$ELSIF message='Related loan does not belong to related borrower' THEN RAISE EXCEPTION USING ERRCODE='P5B04';$o$,
 $n$ELSIF message='Related loan does not belong to related borrower' THEN RAISE EXCEPTION USING ERRCODE='P5B04';ELSIF message='A paid date belongs to a paid manual expense' THEN RAISE EXCEPTION USING ERRCODE='P5B08';$n$]);

-- B. The canonical command: paidDate is the optional last key (after the optional payeeBorrowerId); a date only with an account.
SELECT pg_temp.v144_patch('public.pwa_submit_operation_v2(text)',ARRAY[
 $o$||CASE WHEN i ? 'payeeBorrowerId' THEN ARRAY['payeeBorrowerId'] ELSE ARRAY[]::text[] END; /* R140 V143: the optional payee borrower, last */$o$,
 $n$||CASE WHEN i ? 'payeeBorrowerId' THEN ARRAY['payeeBorrowerId'] ELSE ARRAY[]::text[] END||CASE WHEN i ? 'paidDate' THEN ARRAY['paidDate'] ELSE ARRAY[]::text[] END; /* R140 V143: the optional payee borrower, last */ /* R140 V144: then the optional paid date */$n$,
 $o$IF i->>'payeeBorrowerId' IS NOT NULL AND i->'payeeName'<>'null'::jsonb THEN RAISE EXCEPTION 'expense payee';END IF;$o$,
 $n$IF i->>'payeeBorrowerId' IS NOT NULL AND i->'payeeName'<>'null'::jsonb THEN RAISE EXCEPTION 'expense payee';END IF; IF i->>'paidDate' IS NOT NULL AND (i->>'paidDate'!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' OR ((i->>'paidDate')::date)::text<>i->>'paidDate' OR i->>'paidByAccountId' IS NULL) THEN RAISE EXCEPTION 'expense paid date';END IF; /* R140 V144: a paid date is a valid date and needs an account */$n$]);

-- B. The cash trigger also fires on "Paid Date" (same name, timing, function and argument; the column list grows by one).
DROP TRIGGER zz_cash_source ON public."Business Expenses";
CREATE TRIGGER zz_cash_source AFTER INSERT OR UPDATE OF "Amount", "Expense Date", "Ref Paid By Cash Holder", "Ref Paid By Cash Account", "Paid Date" ON public."Business Expenses" FOR EACH ROW EXECUTE FUNCTION public.cash_source_changed('Business Expense');

-- Self-check.
DO $check$
DECLARE bad text;
BEGIN
 SELECT string_agg(o.routine,', ') INTO bad FROM v144_routines o JOIN pg_proc p ON p.oid=o.routine::regprocedure
  WHERE pg_get_userbyid(p.proowner)<>o.owner OR p.prosecdef<>o.definer OR p.provolatile<>o.volatile OR p.proconfig IS DISTINCT FROM o.config
   OR obj_description(p.oid,'pg_proc') IS DISTINCT FROM o.comment
   OR (SELECT array_agg(a.grantee::text||':'||a.privilege_type ORDER BY (a.grantee::text||':'||a.privilege_type) COLLATE "C") FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee<>p.proowner)
    IS DISTINCT FROM (SELECT array_agg(a.grantee::text||':'||a.privilege_type ORDER BY (a.grantee::text||':'||a.privilege_type) COLLATE "C") FROM aclexplode(o.effective) a WHERE a.grantee<>p.proowner);
 IF bad IS NOT NULL OR (SELECT count(*) FROM v144_routines)<>6 THEN RAISE EXCEPTION 'V144 changed the owner, privileges, attributes or comment of %',coalesce(bad,'an unexpected routine set'); END IF;
 SELECT string_agg(r,', ') INTO bad FROM unnest(ARRAY['public.calculate_business_expense()','public.sync_cash_ledger(text,text)','public.pwa_apply_expense_v2(text)','public.pwa_submit_operation_v2(text)',
   'public.pwa_apply_management_financial_v2(text)','public.partner_pool_share_at_date(date,text)']) r WHERE position('R140 V144' IN pg_get_functiondef(r::regprocedure))=0;
 IF bad IS NOT NULL THEN RAISE EXCEPTION 'V144: not patched: %',bad; END IF;
 IF (SELECT pg_get_triggerdef(t.oid)||'|'||t.tgenabled::text FROM pg_trigger t WHERE t.tgrelid='public."Business Expenses"'::regclass AND t.tgname='zz_cash_source')
   IS DISTINCT FROM 'CREATE TRIGGER zz_cash_source AFTER INSERT OR UPDATE OF "Amount", "Expense Date", "Ref Paid By Cash Holder", "Ref Paid By Cash Account", "Paid Date" ON public."Business Expenses" FOR EACH ROW EXECUTE FUNCTION cash_source_changed(''Business Expense'')|O' THEN
  RAISE EXCEPTION 'V144: the "Business Expenses" zz_cash_source trigger differs from the design'; END IF;
 IF (SELECT format_type(atttypid,atttypmod)||'|'||attnotnull FROM pg_attribute WHERE attrelid='public."Business Expenses"'::regclass AND attname='Paid Date' AND NOT attisdropped) IS DISTINCT FROM 'date|false'
  OR EXISTS(SELECT 1 FROM public."Business Expenses" WHERE "Paid Date" IS NOT NULL) THEN RAISE EXCEPTION 'V144: "Paid Date" differs from the design'; END IF;
 IF (SELECT n||'|'||digest FROM v144_ledger) IS DISTINCT FROM (SELECT count(*)||'|'||md5(coalesce(string_agg(to_jsonb(c)::text,'|' ORDER BY c."Row ID" COLLATE "C"),'')) FROM public."Cash Ledger" c) THEN
  RAISE EXCEPTION 'V144 moved a cash ledger row'; END IF;
END $check$;
