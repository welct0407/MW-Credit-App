-- R129 referral rebate settlement (owner instruction of 5 November 2026: the new table pwa_rebate_settlements, the two
-- "Ref Rebate Settlement" link columns and this migration; Archie's design, decisions D1 to D9). V136 is applied and stays.
-- A referral rebate not settled by offset is pending until a settlement pays it: the expense is still booked and recognized on
-- the close date (Amount, Expense Date, Partner split unchanged); only Lisa's cash moves later, in one movement per settlement.
-- Objects:
--  1. Table pwa_rebate_settlements (owner postgres): one row per settlement (id = the command's targetId, a client UUID v4),
--     immutable after insert (guard trigger), its cash projection by zz_cash_source -> rebate_settlement_cash_source() ->
--     sync_cash_ledger('Rebate Settlement', id), removed by its own BEFORE DELETE trigger.
--  2. Columns "Business Expenses"."Ref Rebate Settlement" (no delete action; the delete command clears the links first) and
--     "Cash Ledger"."Ref Rebate Settlement" (ON DELETE RESTRICT), partial indexes. The system-row CHECK cash_ledger_source
--     gains the fifth branch 'Rebate Settlement' and every branch counts five links; "Business Expenses_check2" accepts V3.
--  3. REFERRAL_REBATE_V3 (D2): create_referral_rebate books new rows as V3 ("cash moves on settlement"); V1 and V2 keep "cash
--     moved at close". sync_cash_ledger: a V3 expense moves only its offset amount (none without an offset).
--  4. Derived state (never stored): pwa_rebate_pending_v1(expense) and pwa_rebates_owed_v1(referrer).
--  5. The V15 expense trigger: the link changes only under pwa.rebate_settlement (the apply function), the legacy conversion
--     under pwa.rebate_convert (pwa_convert_legacy_rebate_v1); a paid rebate cannot be deleted ('Remove the settlement first',
--     P5B05 in the payment operations); the allocation (Partner split) is kept on both changes.
--  6. Operations rebate-settlement.create and rebate-settlement.delete (pwa_submit_operation_v2, pwa_apply_rebate_settlement_v1,
--     version pwa_rebate_settlement_version_v1); guard_cash_ledger refuses a manual row naming a settlement.
--  7. Loan Close: the projection gains owedBefore; result_json.rebate gains pending and owedTotal (under the referrer lock the
--     settlement takes). pwa_notify_content_v5: v4 plus state, pending and owed on every rebates entry.
--  8. pwa_convert_legacy_rebate_v1(expense): the owner-authorized one-off D1 correction (V2 -> V3, ledger re-projected);
--     postgres only, run once by the operator; nothing calls it.
-- Preflight: V136 applied, no new object exists, every counted boundary occurs exactly once, the runner can replace each
-- routine and hand v5 to the notify owner, the owners exist. Self-check: owner, ACL, security, volatility, configuration and
-- comment of every replaced routine unchanged (comments of the two rebate routines change); exact ACLs of the new objects;
-- the CHECK texts; referral_rebate_terms(NULL) unchanged; v5 columns are v4's.
-- Rollback: a later migration restores the V136 bodies; the table and columns stay. Prefer a forward fix: V3 rows would then
-- never move cash. Settlements already made remain correct ledger history.

DO $preflight$
DECLARE problems text[]:='{}'; r record; suffix text:=CASE current_database() WHEN 'loan_manager_prod' THEN 'prod' ELSE 'dev' END; definition text;
 four text:='num_nonnulls("Ref Payment", "Ref Loan", "Ref Business Expense", "Ref Settlement")';
BEGIN
 IF current_database() NOT IN ('loan_manager_dev','payment_rehearsal','loan_manager_prod') THEN RAISE EXCEPTION 'Unsupported application database'; END IF;
 IF position('R128' IN pg_get_functiondef('public.pwa_apply_loan_close_v2(text)'::regprocedure))=0 THEN problems:=problems||'V137 needs V136'::text; END IF;
 IF to_regclass('public.pwa_rebate_settlements') IS NOT NULL OR to_regprocedure('public.pwa_apply_rebate_settlement_v1(text)') IS NOT NULL
  OR to_regprocedure('public.pwa_notify_content_v5(uuid,bigint)') IS NOT NULL OR to_regprocedure('public.pwa_rebate_pending_v1(text)') IS NOT NULL
  OR to_regprocedure('public.pwa_rebates_owed_v1(text)') IS NOT NULL OR to_regprocedure('public.pwa_rebate_settlement_version_v1(text)') IS NOT NULL
  OR to_regprocedure('public.pwa_convert_legacy_rebate_v1(text)') IS NOT NULL OR to_regprocedure('public.rebate_settlement_cash_source()') IS NOT NULL
  OR to_regprocedure('public.rebate_settlement_row_guard()') IS NOT NULL THEN problems:=problems||'V137: a new object already exists'::text; END IF;
 IF EXISTS(SELECT 1 FROM pg_attribute WHERE NOT attisdropped AND attnum>0 AND attname='Ref Rebate Settlement' AND attrelid IN ('public."Business Expenses"'::regclass,'public."Cash Ledger"'::regclass)) THEN
  problems:=problems||'V137: a "Ref Rebate Settlement" column already exists'::text; END IF;
 SELECT pg_get_constraintdef(oid) INTO definition FROM pg_constraint WHERE conrelid='public."Cash Ledger"'::regclass AND conname='cash_ledger_source';
 IF definition IS NULL OR (length(definition)-length(replace(definition,four,'')))/length(four)<>4
  OR (length(definition)-length(replace(definition,'("Ref Settlement" IS NULL) AND ("Movement Type" = ANY','')))/length('("Ref Settlement" IS NULL) AND ("Movement Type" = ANY')<>1 THEN
  problems:=problems||'V137: cash_ledger_source differs from V20'::text; END IF;
 IF (SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid='public."Business Expenses"'::regclass AND conname='Business Expenses_check2')
   IS DISTINCT FROM $c$CHECK ((("Source Type" <> 'Referral Rebate'::text) OR ((("Amount")::numeric > (0)::numeric) AND ("Ref Related Loan" IS NOT NULL) AND ("Ref Related Borrower" IS NOT NULL) AND ("Ref Payee Borrower" IS NOT NULL) AND ("Source Key" = ('REFERRAL_REBATE:'::text || "Ref Related Loan")) AND (("Rule Version" = 'REFERRAL_REBATE_V1'::text) OR (("Rule Version" = 'REFERRAL_REBATE_V2'::text) AND ("Rebate Rate" IS NOT NULL) AND ("Rebate Cap" IS NOT NULL))))))$c$ THEN
  problems:=problems||'V137: "Business Expenses_check2" differs from V135'::text; END IF;
 FOR r IN SELECT unnest(ARRAY['mw_app_'||suffix,'mw_app_'||suffix||'_journal_owner','mw_ledger_owner_'||suffix,'mw_notify_owner_'||suffix,'mw_notify_dispatch_'||suffix]) AS role LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=r.role) THEN problems:=problems||format('V137 needs the role %s',r.role); END IF;
 END LOOP;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=current_user AND rolsuper) THEN
  -- Replacing a routine needs its owner's authority (the owner window of the release: ledger, journal and notify owners).
  FOR r IN SELECT DISTINCT pg_get_userbyid(p.proowner) AS owner FROM pg_proc p WHERE p.oid IN ('public.calculate_business_expense()'::regprocedure,
    'public.create_referral_rebate(text)'::regprocedure,'public.pwa_referral_rebate_projection_v1(text,jsonb)'::regprocedure,'public.sync_cash_ledger(text,text)'::regprocedure,
    'public.guard_cash_ledger()'::regprocedure,'public.pwa_submit_operation_v2(text)'::regprocedure,'public.pwa_apply_payment_v2(text)'::regprocedure,
    'public.pwa_apply_loan_close_v2(text)'::regprocedure) LOOP
   IF NOT pg_has_role(current_user,r.owner,'USAGE') THEN problems:=problems||format('%s cannot replace routines owned by %s (owner window required)',current_user,r.owner); END IF;
  END LOOP;
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='mw_notify_owner_'||suffix) THEN
   IF NOT pg_has_role(current_user,'mw_notify_owner_'||suffix,'SET') THEN problems:=problems||format('%s cannot SET ROLE mw_notify_owner_%s (temporary maintenance membership required for ALTER FUNCTION OWNER)',current_user,suffix); END IF;
   IF NOT has_schema_privilege('mw_notify_owner_'||suffix,'public','CREATE') THEN problems:=problems||format('mw_notify_owner_%s lacks CREATE on schema public (required by ALTER FUNCTION OWNER; grant temporarily)',suffix); END IF;
  END IF;
 END IF;
 IF cardinality(problems)>0 THEN RAISE EXCEPTION 'V137 preflight: %',array_to_string(problems,'; '); END IF;
END $preflight$;

-- Snapshot of every routine this migration replaces in place: owner, effective ACL, security, volatility, configuration and
-- comment. The self-check compares them.
CREATE TEMP TABLE v137_routines ON COMMIT DROP AS
 SELECT r.name AS routine,pg_get_userbyid(p.proowner) AS owner,coalesce(p.proacl,acldefault('f',p.proowner)) AS effective,
  p.prosecdef AS definer,p.provolatile AS volatile,p.proconfig AS config,obj_description(p.oid,'pg_proc') AS comment
 FROM unnest(ARRAY['public.calculate_business_expense()','public.create_referral_rebate(text)','public.pwa_referral_rebate_projection_v1(text,jsonb)',
  'public.sync_cash_ledger(text,text)','public.guard_cash_ledger()','public.pwa_submit_operation_v2(text)','public.pwa_apply_payment_v2(text)',
  'public.pwa_apply_loan_close_v2(text)']) r(name) JOIN pg_proc p ON p.oid=r.name::regprocedure;
-- v1 to v4 of the push content stay byte-identical.
CREATE TEMP TABLE v137_notify ON COMMIT DROP AS
 SELECT p.oid::regprocedure::text AS routine,md5(pg_get_functiondef(p.oid)) AS body,coalesce(p.proacl::text,'') AS acl FROM pg_proc p
 WHERE p.oid IN ('public.pwa_notify_content_v1(uuid,bigint)'::regprocedure,'public.pwa_notify_content_v2(uuid,bigint)'::regprocedure,
  'public.pwa_notify_content_v3(uuid,bigint)'::regprocedure,'public.pwa_notify_content_v4(uuid,bigint)'::regprocedure);

-- 1. The settlements (D4: one referrer, whole pending rebates, one cash movement out of Lisa on the settlement date).
CREATE TABLE public.pwa_rebate_settlements (
 id text PRIMARY KEY CHECK (id ~ '^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'),
 payee_borrower_id text NOT NULL REFERENCES public."Borrowers"("Row ID"),
 settlement_date date NOT NULL,
 amount numeric NOT NULL CHECK (amount>0 AND amount<'Infinity'::numeric AND amount=trunc(amount)),
 paid_by_cash_holder text NOT NULL REFERENCES public."Cash Holders"("Row ID") CHECK (paid_by_cash_holder='ch:lisa'),
 paid_by_cash_account text NOT NULL REFERENCES public."Cash Accounts"("Row ID"),
 payment_method text NOT NULL CHECK (payment_method IN ('Bank Transfer','Cash')),
 bank_reference text CHECK (bank_reference IS NULL OR (octet_length(bank_reference) BETWEEN 1 AND 256 AND btrim(bank_reference)<>'' AND bank_reference !~ '[\r\n]' AND payment_method='Bank Transfer')),
 notes text CHECK (notes IS NULL OR octet_length(notes)<=65536),
 created_by text NOT NULL CHECK (btrim(created_by)<>''),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX pwa_rebate_settlements_payee_date ON public.pwa_rebate_settlements(payee_borrower_id,settlement_date DESC);
COMMENT ON TABLE public.pwa_rebate_settlements IS 'R129: one referral rebate settlement: whole pending rebates (REFERRAL_REBATE_V3) of one referrer paid by Lisa in one cash movement on settlement_date. Written only by pwa_apply_rebate_settlement_v1; immutable (delete and record again).';
COMMENT ON COLUMN public.pwa_rebate_settlements.id IS 'R129: the rebate-settlement.create command''s targetId (client UUID v4).';
COMMENT ON COLUMN public.pwa_rebate_settlements.payee_borrower_id IS 'R129: the referrer paid.';
COMMENT ON COLUMN public.pwa_rebate_settlements.settlement_date IS 'R129: the cash movement date; not in the future (Bangkok business date), not before the newest close date of the rebates it pays.';
COMMENT ON COLUMN public.pwa_rebate_settlements.amount IS 'R129: whole baht, the sum of the pending amounts of the rebates linked to it.';
COMMENT ON COLUMN public.pwa_rebate_settlements.paid_by_cash_holder IS 'R129: always ch:lisa (D4).';
COMMENT ON COLUMN public.pwa_rebate_settlements.paid_by_cash_account IS 'R129: an active account of ch:lisa, checked by the apply function.';

-- 2. The links.
ALTER TABLE public."Business Expenses" ADD COLUMN "Ref Rebate Settlement" text REFERENCES public.pwa_rebate_settlements(id);
CREATE INDEX business_expenses_ref_rebate_settlement ON public."Business Expenses"("Ref Rebate Settlement") WHERE "Ref Rebate Settlement" IS NOT NULL;
COMMENT ON COLUMN public."Business Expenses"."Ref Rebate Settlement" IS 'R129: the settlement that paid this pending referral rebate (REFERRAL_REBATE_V3); null while pending, on offset-only and legacy rows and on other expenses. Set and cleared by the settlement command only.';
ALTER TABLE public."Cash Ledger" ADD COLUMN "Ref Rebate Settlement" text REFERENCES public.pwa_rebate_settlements(id) ON DELETE RESTRICT;
CREATE INDEX cash_ledger_rebate_settlement ON public."Cash Ledger"("Ref Rebate Settlement") WHERE "Ref Rebate Settlement" IS NOT NULL;
COMMENT ON COLUMN public."Cash Ledger"."Ref Rebate Settlement" IS 'R129: the rebate settlement of a system ''Rebate Settlement'' movement.';

-- The system-row rule (V20, counted text replacement): every branch counts five links, a manual row links none, and the
-- fifth branch is the settlement's movement.
DO $ledger$
DECLARE definition text; four text:='num_nonnulls("Ref Payment", "Ref Loan", "Ref Business Expense", "Ref Settlement")';
 five text:='num_nonnulls("Ref Payment", "Ref Loan", "Ref Business Expense", "Ref Settlement", "Ref Rebate Settlement")';
 manual_old text:='("Ref Settlement" IS NULL) AND ("Movement Type" = ANY'; manual_new text:='("Ref Settlement" IS NULL) AND ("Ref Rebate Settlement" IS NULL) AND ("Movement Type" = ANY';
 last_old text; last_new text;
BEGIN
 SELECT pg_get_constraintdef(oid) INTO definition FROM pg_constraint WHERE conrelid='public."Cash Ledger"'::regclass AND conname='cash_ledger_source';
 definition:=replace(replace(definition,four,five),manual_old,manual_new);
 last_old:=$o$("Source Key" = ('SETTLEMENT:'::text || "Ref Settlement")) AND ("Ref Settlement" IS NOT NULL) AND ($o$||five||$o$ = 1))$o$;
 last_new:=last_old||$n$ OR (("Source Type" = 'Rebate Settlement'::text) AND ("Movement Type" = 'Rebate Settlement'::text) AND ("Source Key" = ('REBATESETTLEMENT:'::text || "Ref Rebate Settlement")) AND ("Ref Rebate Settlement" IS NOT NULL) AND ($n$||five||$n$ = 1))$n$;
 IF (length(definition)-length(replace(definition,last_old,'')))/length(last_old)<>1 THEN RAISE EXCEPTION 'V137: unexpected cash_ledger_source settlement branch'; END IF;
 ALTER TABLE public."Cash Ledger" DROP CONSTRAINT cash_ledger_source;
 EXECUTE 'ALTER TABLE public."Cash Ledger" ADD CONSTRAINT cash_ledger_source '||replace(definition,last_old,last_new);
END $ledger$;

-- The referral rebate row check (V15/V135, same name): V1, or V2 or V3 with the applied terms present.
ALTER TABLE public."Business Expenses" DROP CONSTRAINT "Business Expenses_check2",
 ADD CONSTRAINT "Business Expenses_check2" CHECK ("Source Type"<>'Referral Rebate' OR ("Amount"::numeric>0 AND "Ref Related Loan" IS NOT NULL AND "Ref Related Borrower" IS NOT NULL
  AND "Ref Payee Borrower" IS NOT NULL AND "Source Key"='REFERRAL_REBATE:'||"Ref Related Loan"
  AND ("Rule Version"='REFERRAL_REBATE_V1' OR ("Rule Version" IN ('REFERRAL_REBATE_V2','REFERRAL_REBATE_V3') AND "Rebate Rate" IS NOT NULL AND "Rebate Cap" IS NOT NULL))));

-- 3. Derived state of a referral rebate (one rule for the reads, the push, the settlement and the tests). Pending: a V3 row
-- not yet settled, the amount less its offset; owed: the sum over a referrer. Read only, invoker rights.
CREATE FUNCTION public.pwa_rebate_pending_v1(p_expense text) RETURNS numeric
    LANGUAGE sql STABLE
    SET search_path TO 'pg_catalog', 'public'
    AS $$
 SELECT CASE WHEN x."Rule Version"='REFERRAL_REBATE_V3' AND x."Ref Rebate Settlement" IS NULL
   THEN greatest(x."Amount"::numeric-coalesce(o."Amount Received"::numeric,0),0) ELSE 0 END
 FROM public."Business Expenses" x LEFT JOIN public."Payments" o ON o."Row ID"=x."Ref Offset Payment"
 WHERE x."Row ID"=p_expense AND x."Source Type"='Referral Rebate';
$$;
COMMENT ON FUNCTION public.pwa_rebate_pending_v1(text) IS 'R129: the pending (unpaid) amount of a referral rebate expense: REFERRAL_REBATE_V3, not linked to a settlement, Amount less its offset payment; 0 for offset-only, paid and legacy rows; null for an unknown or non-referral expense. Read only.';
CREATE FUNCTION public.pwa_rebates_owed_v1(p_referrer text) RETURNS numeric
    LANGUAGE sql STABLE
    SET search_path TO 'pg_catalog', 'public'
    AS $$
 SELECT coalesce(sum(greatest(x."Amount"::numeric-coalesce(o."Amount Received"::numeric,0),0)),0)
 FROM public."Business Expenses" x LEFT JOIN public."Payments" o ON o."Row ID"=x."Ref Offset Payment"
 WHERE x."Ref Payee Borrower"=p_referrer AND x."Source Type"='Referral Rebate' AND x."Rule Version"='REFERRAL_REBATE_V3' AND x."Ref Rebate Settlement" IS NULL;
$$;
COMMENT ON FUNCTION public.pwa_rebates_owed_v1(text) IS 'R129: what a referrer is owed: the sum of pwa_rebate_pending_v1 over the referrer''s referral rebate expenses. Read only.';
-- The delete command's version: the row (created_at in UTC, so the text does not depend on the session time zone).
CREATE FUNCTION public.pwa_rebate_settlement_version_v1(p_id text) RETURNS text
    LANGUAGE sql STABLE
    SET search_path TO 'pg_catalog', 'public'
    AS $$
 SELECT encode(sha256(convert_to(((to_jsonb(s)-'created_at')||jsonb_build_object('created_at',to_char(s.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')))::text,'UTF8')),'hex')
 FROM public.pwa_rebate_settlements s WHERE s.id=p_id;
$$;
COMMENT ON FUNCTION public.pwa_rebate_settlement_version_v1(text) IS 'R129: version of a rebate settlement for rebate-settlement.delete (sha256 of the row as JSON, created_at in UTC); null for an unknown id. services/business/referrers.mjs uses the identical SQL text.';

-- 4. The settlement row's triggers: the cash projection, immutability and the projection's removal on delete.
CREATE FUNCTION public.rebate_settlement_cash_source() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
BEGIN PERFORM public.sync_cash_ledger('Rebate Settlement',NEW.id); RETURN NULL; END $$;
COMMENT ON FUNCTION public.rebate_settlement_cash_source() IS 'R129: projects a rebate settlement into "Cash Ledger" (sync_cash_ledger, the ledger owner''s definer).';
CREATE FUNCTION public.rebate_settlement_row_guard() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
BEGIN
 IF TG_OP='UPDATE' THEN RAISE EXCEPTION 'Rebate settlements are immutable; delete the settlement and record it again'; END IF;
 -- The projection goes with its source (the business_source_delete pattern; the ledger guard allows it at depth 2).
 DELETE FROM public."Cash Ledger" WHERE "Entry Origin"='System' AND "Source Type"='Rebate Settlement' AND "Source Key"='REBATESETTLEMENT:'||OLD.id;
 RETURN OLD;
END $$;
COMMENT ON FUNCTION public.rebate_settlement_row_guard() IS 'R129: a rebate settlement never changes after insert; its delete removes its cash projection first.';
CREATE TRIGGER a0_rebate_settlement_guard BEFORE UPDATE OR DELETE ON public.pwa_rebate_settlements FOR EACH ROW EXECUTE FUNCTION public.rebate_settlement_row_guard();
CREATE TRIGGER zz_cash_source AFTER INSERT OR UPDATE OF amount, settlement_date, paid_by_cash_account ON public.pwa_rebate_settlements FOR EACH ROW EXECUTE FUNCTION public.rebate_settlement_cash_source();

-- 5. The cash rule (whole body of V93/V122, changes marked R129).
CREATE OR REPLACE FUNCTION public.sync_cash_ledger(p_type text, p_id text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
DECLARE d date; amount numeric; from_holder text; to_holder text; movement text; source_key text; actor text;
 payment_id text; loan_id text; expense_id text; settlement_id text; from_account text; to_account text;
 rebate_settlement_id text; rule text; offset_amount numeric; -- R129
BEGIN
 IF pg_trigger_depth()<1 THEN RAISE EXCEPTION 'Cash synchronization requires a source trigger'; END IF;
 IF EXISTS(SELECT 1 FROM public.r005_cash_cutover_sources WHERE source_type=p_type AND source_row_id=p_id) THEN RETURN; END IF;
 CASE p_type
 WHEN 'Payment' THEN
  SELECT "Payment Date","Amount Received"::numeric,"Ref Received By Cash Holder","Created By","Ref Received By Cash Account"
   INTO d,amount,to_holder,actor,to_account FROM public."Payments" WHERE "Row ID"=p_id AND "Status"='Posted';
  movement:='Payment Receipt'; source_key:='PAYMENT:'||p_id; payment_id:=p_id;
 WHEN 'Loan' THEN
  SELECT "Loan Date","Principal Amount"::numeric,"Ref Disbursed From Cash Account" INTO d,amount,from_account FROM public."Loans" WHERE "Row ID"=p_id;
  movement:='Loan Disbursement'; source_key:='LOAN:'||p_id; loan_id:=p_id; from_holder:='ch:lisa';
 WHEN 'Business Expense' THEN
  SELECT "Expense Date",abs("Amount"::numeric),CASE WHEN "Amount"::numeric>0 THEN "Ref Paid By Cash Holder" END,
   CASE WHEN "Amount"::numeric<0 THEN "Ref Paid By Cash Holder" END,"Created By",
   CASE WHEN "Amount"::numeric>0 THEN "Ref Paid By Cash Account" END, CASE WHEN "Amount"::numeric<0 THEN "Ref Paid By Cash Account" END,
   "Rule Version",(SELECT o."Amount Received"::numeric FROM public."Payments" o WHERE o."Row ID"=x."Ref Offset Payment" AND o."Status"='Posted')
   INTO d,amount,from_holder,to_holder,actor,from_account,to_account,rule,offset_amount FROM public."Business Expenses" x WHERE "Row ID"=p_id;
  IF coalesce(from_holder,to_holder) IS NULL THEN amount:=NULL; END IF;
  -- R129: a REFERRAL_REBATE_V3 rebate moves cash only for its offset (the offset receipt nets it on Lisa's account); the
  -- pending rest moves on its settlement. Without an offset there is no movement.
  IF rule='REFERRAL_REBATE_V3' AND amount IS NOT NULL THEN amount:=CASE WHEN offset_amount>0 THEN offset_amount END; END IF;
  movement:='Business Expense'; source_key:='EXPENSE:'||p_id; expense_id:=p_id;
 WHEN 'Settlement' THEN
  SELECT "Transfer Date","Amount"::numeric,"Ref Paid From Cash Account" INTO d,amount,from_account FROM public."Settlements" WHERE "Row ID"=p_id AND "Status"='Completed';
  movement:='Partner Settlement'; source_key:='SETTLEMENT:'||p_id; settlement_id:=p_id; from_holder:='ch:lisa';
 WHEN 'Rebate Settlement' THEN
  -- R129: the settlement of pending referral rebates, out of Lisa's chosen account on the settlement date.
  SELECT s.settlement_date,s.amount,s.created_by,s.paid_by_cash_account INTO d,amount,actor,from_account FROM public.pwa_rebate_settlements s WHERE s.id=p_id;
  movement:='Rebate Settlement'; source_key:='REBATESETTLEMENT:'||p_id; rebate_settlement_id:=p_id; from_holder:='ch:lisa';
 ELSE RAISE EXCEPTION 'Unsupported cash source';
 END CASE;
 IF amount IS NULL THEN
  -- Derived projection follows source qualification, never a manual deletion path.
  DELETE FROM public."Cash Ledger" WHERE "Entry Origin"='System' AND "Source Type"=p_type AND "Source Key"=source_key;
  RETURN;
 END IF;
 IF d IS NULL THEN RAISE EXCEPTION 'Qualifying cash source requires its effective movement date'; END IF;
 INSERT INTO public."Cash Ledger"("Row ID","Movement Date","Movement Type","Amount","Ref From Cash Holder","Ref To Cash Holder",
  "Ref Payment","Ref Loan","Ref Business Expense","Ref Settlement","Entry Origin","Source Type","Source Key","Created By","Ref From Cash Account","Ref To Cash Account","Ref Rebate Settlement")
 VALUES('cash:'||source_key,d,movement,amount,from_holder,to_holder,payment_id,loan_id,expense_id,settlement_id,'System',p_type,source_key,coalesce(nullif(actor,''),'SQL'),from_account,to_account,rebate_settlement_id)
 ON CONFLICT ("Source Type","Source Key") WHERE "Entry Origin"='System' DO UPDATE SET
  "Movement Date"=EXCLUDED."Movement Date","Amount"=EXCLUDED."Amount",
  "Ref From Cash Holder"=EXCLUDED."Ref From Cash Holder","Ref To Cash Holder"=EXCLUDED."Ref To Cash Holder","Ref From Cash Account"=EXCLUDED."Ref From Cash Account","Ref To Cash Account"=EXCLUDED."Ref To Cash Account"
 WHERE ("Cash Ledger"."Movement Date","Cash Ledger"."Amount","Cash Ledger"."Ref From Cash Holder","Cash Ledger"."Ref To Cash Holder","Cash Ledger"."Ref From Cash Account","Cash Ledger"."Ref To Cash Account")
  IS DISTINCT FROM (EXCLUDED."Movement Date",EXCLUDED."Amount",EXCLUDED."Ref From Cash Holder",EXCLUDED."Ref To Cash Holder",EXCLUDED."Ref From Cash Account",EXCLUDED."Ref To Cash Account");
END $$;

-- Exact, counted replacements in a routine's current definition (V132/V135/V136 method): every boundary must occur exactly
-- once, else the migration fails; bodies first created from a CRLF file keep CRLF line ends and are matched as written.
CREATE FUNCTION pg_temp.v137_patch(routine text, edits text[]) RETURNS void LANGUAGE plpgsql AS $patch$
DECLARE definition text:=pg_get_functiondef(routine::regprocedure); k integer; o text; n text;
BEGIN
 IF position('R129' IN definition)>0 THEN RAISE EXCEPTION 'V137: % is already patched',routine; END IF;
 FOR k IN 1..array_length(edits,1)/2 LOOP
  o:=edits[2*k-1];n:=edits[2*k];
  IF position(o IN definition)=0 AND position(E'\n' IN o)>0 THEN o:=replace(o,E'\n',E'\r\n');n:=replace(n,E'\n',E'\r\n'); END IF;
  IF (length(definition)-length(replace(definition,o,'')))/length(o)<>1 THEN RAISE EXCEPTION 'V137: unexpected % boundary %',routine,k; END IF;
  definition:=replace(definition,o,n);
 END LOOP;
 IF position('R129' IN definition)=0 THEN RAISE EXCEPTION 'V137: % patch carries no R129 marker',routine; END IF;
 EXECUTE definition;
END $patch$;

-- 6. The V15 expense trigger: the settlement link and the legacy conversion are the only changes to a referral row, each
-- under its own transaction setting; both keep the booked allocation. A paid rebate is never deleted.
SELECT pg_temp.v137_patch('public.calculate_business_expense()',ARRAY[
 $o$ IF TG_OP='DELETE' AND OLD."Source Type"='Referral Rebate' AND pg_trigger_depth()>=2$o$,
 $n$ -- R129: a rebate paid by a settlement goes only after the settlement (every path: a closing-payment delete or
 -- correction, a direct delete).
 IF TG_OP='DELETE' AND OLD."Source Type"='Referral Rebate' AND OLD."Ref Rebate Settlement" IS NOT NULL THEN RAISE EXCEPTION 'Remove the settlement first'; END IF;
 IF TG_OP='DELETE' AND OLD."Source Type"='Referral Rebate' AND pg_trigger_depth()>=2$n$,
 $o$   IF OLD."Source Type"='Referral Rebate' AND
     (to_jsonb(NEW)-ARRAY['Partner A Share','Partner B Share','Partner A Expense','Partner B Expense','Allocation Basis'])
       IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['Partner A Share','Partner B Share','Partner A Expense','Partner B Expense','Allocation Basis']) THEN
     RAISE EXCEPTION 'Automatic referral expenses are system-managed';
   END IF;$o$,
 $n$   -- R129: "Ref Rebate Settlement" is set (to the new value) or cleared (the old value) only while pwa.rebate_settlement
   -- names that settlement (pwa_apply_rebate_settlement_v1), never moved from one settlement to another, never on a manual row.
   IF NEW."Ref Rebate Settlement" IS DISTINCT FROM OLD."Ref Rebate Settlement" AND (OLD."Source Type" IS DISTINCT FROM 'Referral Rebate'
     OR (NEW."Ref Rebate Settlement" IS NOT NULL AND OLD."Ref Rebate Settlement" IS NOT NULL)
     OR nullif(current_setting('pwa.rebate_settlement',true),'') IS DISTINCT FROM coalesce(NEW."Ref Rebate Settlement",OLD."Ref Rebate Settlement")) THEN
     RAISE EXCEPTION 'Rebate settlement links change only through a rebate settlement';
   END IF;
   -- R129 D1: the owner-authorized legacy conversion (V1/V2 to V3) of one row, only while pwa.rebate_convert names it.
   IF OLD."Source Type"='Referral Rebate' AND NEW."Rule Version" IS DISTINCT FROM OLD."Rule Version" AND (OLD."Rule Version" NOT IN ('REFERRAL_REBATE_V1','REFERRAL_REBATE_V2')
     OR NEW."Rule Version" IS DISTINCT FROM 'REFERRAL_REBATE_V3' OR nullif(current_setting('pwa.rebate_convert',true),'') IS DISTINCT FROM OLD."Row ID") THEN
     RAISE EXCEPTION 'Automatic referral expenses are system-managed';
   END IF;
   IF OLD."Source Type"='Referral Rebate' AND
     (to_jsonb(NEW)-ARRAY['Partner A Share','Partner B Share','Partner A Expense','Partner B Expense','Allocation Basis','Ref Rebate Settlement','Rule Version'])
       IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['Partner A Share','Partner B Share','Partner A Expense','Partner B Expense','Allocation Basis','Ref Rebate Settlement','Rule Version']) THEN
     RAISE EXCEPTION 'Automatic referral expenses are system-managed';
   END IF;
   -- R129: the expense, its date and the Partner split stay as booked at the close.
   IF OLD."Source Type"='Referral Rebate' AND (NEW."Ref Rebate Settlement" IS DISTINCT FROM OLD."Ref Rebate Settlement" OR NEW."Rule Version" IS DISTINCT FROM OLD."Rule Version") THEN
     NEW."Partner A Share":=OLD."Partner A Share"; NEW."Partner B Share":=OLD."Partner B Share";
     NEW."Partner A Expense":=OLD."Partner A Expense"; NEW."Partner B Expense":=OLD."Partner B Expense"; NEW."Allocation Basis":=OLD."Allocation Basis";
     RETURN NEW;
   END IF;$n$,
 $o$ IF NEW."Source Type"='Referral Rebate' THEN
   IF TG_OP='INSERT' AND pg_trigger_depth()<2$o$,
 $n$ -- R129: a new row never starts settled.
 IF TG_OP='INSERT' AND NEW."Ref Rebate Settlement" IS NOT NULL THEN RAISE EXCEPTION 'Rebate settlement links change only through a rebate settlement'; END IF;
 IF NEW."Source Type"='Referral Rebate' THEN
   IF TG_OP='INSERT' AND pg_trigger_depth()<2$n$]);

-- 7. New rebates are REFERRAL_REBATE_V3 (D1, D2); the offset branches, terms and notes are unchanged.
SELECT pg_temp.v137_patch('public.create_referral_rebate(text)',ARRAY[
 $o$'REFERRAL_REBATE_V2','SQL:loan-close'$o$,
 $n$'REFERRAL_REBATE_V3' /* R129: cash moves on settlement */,'SQL:loan-close'$n$]);
COMMENT ON FUNCTION public.create_referral_rebate(text) IS 'R111/R118/R120/R129: the referral rebate of a closed referred loan, the referrer''s rate (default 10%) of the interest and late charges received, at most the referrer''s cap (default 1,000), offset to the referrer''s open loan where possible; the rest is pending payment until a rebate settlement (REFERRAL_REBATE_V3). The applied terms are stored on the expense.';

-- 8. The close preview and command state what the referrer is owed before this close.
SELECT pg_temp.v137_patch('public.pwa_referral_rebate_projection_v1(text,jsonb)',ARRAY[
 $o$  'hasOpenLoan',EXISTS($o$,
 $n$  -- R129: the referrer's pending rebates before this close (whole baht).
  'owedBefore',trunc(public.pwa_rebates_owed_v1(referrer."Row ID"))::text,
  'hasOpenLoan',EXISTS($n$]);
COMMENT ON FUNCTION public.pwa_referral_rebate_projection_v1(text,jsonb) IS 'R111/R118/R120/R129: the referral rebate a Loan Close with this calculation creates (create_referral_rebate rule: the referrer''s rate of interest and late charges, at most the referrer''s cap), its referrer, whether the referrer has an open loan, the profit base, the terms (rate, cap, custom) and owedBefore (the referrer''s pending rebates now); null when none. Read only.';

-- 9. Manual cash entries never name a rebate settlement.
SELECT pg_temp.v137_patch('public.guard_cash_ledger()',ARRAY[
 $o$ NEW."Ref Settlement":=nullif(btrim(NEW."Ref Settlement"),'');$o$,
 $n$ NEW."Ref Settlement":=nullif(btrim(NEW."Ref Settlement"),'');
 NEW."Ref Rebate Settlement":=nullif(btrim(NEW."Ref Rebate Settlement"),''); -- R129$n$,
 $o$  NEW."Source Key":='MANUAL:'||NEW."Row ID";$o$,
 $n$  NEW."Source Key":='MANUAL:'||NEW."Row ID";
  -- R129: only the settlement's own projection links a rebate settlement.
  IF NEW."Ref Rebate Settlement" IS NOT NULL THEN RAISE EXCEPTION 'Only a rebate settlement may link a rebate settlement'; END IF;$n$]);

-- 10. The operations: rebate-settlement.create (target a new UUID v4, no version) and rebate-settlement.delete (version
-- pwa_rebate_settlement_version_v1, no inputs); canonical inputs in the fixed key order.
SELECT pg_temp.v137_patch('public.pwa_submit_operation_v2(text)',ARRAY[
 $o$'analytics.refresh') THEN RAISE EXCEPTION 'target';$o$,
 $n$'analytics.refresh','rebate-settlement.create','rebate-settlement.delete') THEN RAISE EXCEPTION 'target';$n$,
 $o$'cash-withdrawal.create','assessment.create') THEN IF c->'expectedVersion'<>'null'::jsonb$o$,
 $n$'cash-withdrawal.create','assessment.create','rebate-settlement.create') THEN IF c->'expectedVersion'<>'null'::jsonb$n$,
 $o$ ELSIF op='payment.correct' THEN input_text:=public.pwa_payment_correction_text_v2(i);$o$,
 $n$ ELSIF op='rebate-settlement.create' THEN
 -- R129: whole pending rebates of one referrer (1 to 200 distinct expense ids, ascending), date, Lisa's account, method,
 -- optional bank reference (Bank Transfer only) and notes.
 IF (SELECT array_agg(key ORDER BY key COLLATE "C") FROM jsonb_object_keys(i) key) IS DISTINCT FROM ARRAY['bankReference','cashAccountId','expenseIds','notes','paymentMethod','referrerId','settlementDate'] THEN RAISE EXCEPTION 'settlement keys';END IF;
 IF jsonb_typeof(i->'referrerId') IS DISTINCT FROM 'string' OR octet_length(i->>'referrerId') NOT BETWEEN 1 AND 256 OR i->>'referrerId'~'[[:cntrl:]]'
  OR jsonb_typeof(i->'cashAccountId') IS DISTINCT FROM 'string' OR octet_length(i->>'cashAccountId') NOT BETWEEN 1 AND 256 OR i->>'cashAccountId'~'[[:cntrl:]]'
  OR jsonb_typeof(i->'settlementDate') IS DISTINCT FROM 'string' OR i->>'settlementDate'!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' OR ((i->>'settlementDate')::date)::text<>i->>'settlementDate'
  OR jsonb_typeof(i->'paymentMethod') IS DISTINCT FROM 'string' OR i->>'paymentMethod' NOT IN('Bank Transfer','Cash')
  OR jsonb_typeof(i->'bankReference') NOT IN('string','null') OR (i->'bankReference'<>'null'::jsonb AND (octet_length(i->>'bankReference') NOT BETWEEN 1 AND 256 OR btrim(i->>'bankReference')='' OR i->>'bankReference'~'[\r\n]' OR i->>'paymentMethod'<>'Bank Transfer'))
  OR jsonb_typeof(i->'notes') NOT IN('string','null') OR coalesce(octet_length(i->>'notes'),0)>65536
  OR jsonb_typeof(i->'expenseIds') IS DISTINCT FROM 'array' OR jsonb_array_length(i->'expenseIds') NOT BETWEEN 1 AND 200
  OR EXISTS(SELECT 1 FROM jsonb_array_elements(i->'expenseIds') x WHERE jsonb_typeof(x) IS DISTINCT FROM 'string' OR octet_length(x#>>'{}') NOT BETWEEN 1 AND 256 OR x#>>'{}'~'[[:cntrl:]]')
  OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(i->'expenseIds') WITH ORDINALITY x(v,n) JOIN jsonb_array_elements_text(i->'expenseIds') WITH ORDINALITY y(v,n) ON y.n=x.n+1 WHERE NOT (x.v COLLATE "C"<y.v COLLATE "C"))
 THEN RAISE EXCEPTION 'settlement input';END IF;
 input_text:='{"referrerId":'||to_json(i->>'referrerId')::text||',"expenseIds":['||(SELECT string_agg(to_json(x.v)::text,',' ORDER BY x.n) FROM jsonb_array_elements_text(i->'expenseIds') WITH ORDINALITY x(v,n))
  ||'],"settlementDate":'||to_json(i->>'settlementDate')::text||',"cashAccountId":'||to_json(i->>'cashAccountId')::text||',"paymentMethod":'||to_json(i->>'paymentMethod')::text
  ||',"bankReference":'||coalesce(to_json(i->>'bankReference')::text,'null')||',"notes":'||coalesce(to_json(i->>'notes')::text,'null')||'}';
 ELSIF op='payment.correct' THEN input_text:=public.pwa_payment_correction_text_v2(i);$n$,
 $o$ ELSIF op IN('borrower.delete','loan.delete','loan.undo-default','charge.delete','payment.delete','expense.delete') THEN$o$,
 $n$ ELSIF op IN('borrower.delete','loan.delete','loan.undo-default','charge.delete','payment.delete','expense.delete','rebate-settlement.delete') THEN$n$,
 $o$ELSIF split_part(op,'.',1)='expense' THEN result_value:=public.pwa_apply_expense_v2($1);$o$,
 $n$ELSIF split_part(op,'.',1)='rebate-settlement' THEN result_value:=public.pwa_apply_rebate_settlement_v1($1);ELSIF split_part(op,'.',1)='expense' THEN result_value:=public.pwa_apply_expense_v2($1);$n$]);

-- 11. Payment operations: deleting or correcting a closing payment whose rebate is paid is a dependency conflict (P5B05).
SELECT pg_temp.v137_patch('public.pwa_apply_payment_v2(text)',ARRAY[
 $o$'Remove through the closing payment','Remove through the closing payment: delete it and close again') THEN RAISE EXCEPTION USING ERRCODE='P5B05';$o$,
 $n$'Remove through the closing payment','Remove through the closing payment: delete it and close again','Remove the settlement first' /* R129 */) THEN RAISE EXCEPTION USING ERRCODE='P5B05';$n$]);

-- 12. Loan Close: the referrer's settlements serialize with the close (the settlement command's referrer lock), and the stored
-- outcome carries what stays pending and the referrer's owed total after this close.
SELECT pg_temp.v137_patch('public.pwa_apply_loan_close_v2(text)',ARRAY[
 $o$offset_plan jsonb;expense public."Business Expenses"%ROWTYPE;$o$,
 $n$offset_plan jsonb;expense public."Business Expenses"%ROWTYPE;
 owed numeric:=0; -- R129: the referrer's pending rebates before this close$n$,
 $o$ rebate:=public.pwa_referral_rebate_projection_v1(target,calculation);$o$,
 $n$ rebate:=public.pwa_referral_rebate_projection_v1(target,calculation);
 -- R129: the referrer lock of rebate-settlement.create, so owedTotal is exact when the command commits.
 IF rebate IS NOT NULL THEN
  PERFORM pg_advisory_xact_lock(public.pwa_lock_key_v1('borrower',rebate->>'referrerId'));
  owed:=public.pwa_rebates_owed_v1(rebate->>'referrerId');
 END IF;$n$,
 $o$'paidThrough',CASE WHEN offset_id IS NULL THEN '{}'::jsonb ELSE forward->'paidThrough' END));$o$,
 $n$'paidThrough',CASE WHEN offset_id IS NULL THEN '{}'::jsonb ELSE forward->'paidThrough' END,
   -- R129: the part not offset is pending payment; owedTotal is the referrer's pending total after this close.
   'pending',trunc((rebate->>'amount')::numeric-covered)::text,'owedTotal',trunc(owed+(rebate->>'amount')::numeric-covered)::text));$n$]);

-- 13. The settlement command (journal owner only, invoker rights like pwa_apply_expense_v2).
CREATE FUNCTION public.pwa_apply_rebate_settlement_v1(canonical text) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
DECLARE e jsonb:=canonical::jsonb;c jsonb:=e->'command';i jsonb:=c->'inputs';a jsonb:=e->'actor';op text:=c->>'operation';target text:=c->>'targetId';
 day date:=(statement_timestamp() AT TIME ZONE 'Asia/Bangkok')::date;s public.pwa_rebate_settlements%ROWTYPE;ids text[];referrer text;total numeric;
 settle_date date;newest date;changed integer;creator text;
BEGIN
 IF (current_database() NOT IN ('loan_manager_dev','payment_rehearsal','loan_manager_prod') OR current_user<>CASE current_database() WHEN 'loan_manager_prod' THEN 'mw_app_prod_journal_owner' ELSE 'mw_app_dev_journal_owner' END)
  OR op NOT IN('rebate-settlement.create','rebate-settlement.delete') THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Governed operation required';END IF;
 IF op='rebate-settlement.create' THEN
  referrer:=i->>'referrerId';settle_date:=(i->>'settlementDate')::date;creator:=a->>'loginEmail';
  SELECT array_agg(x.v ORDER BY x.n) INTO ids FROM jsonb_array_elements_text(i->'expenseIds') WITH ORDINALITY x(v,n);
  -- Locks: the referrer, then the chosen expenses in key order (no loan or charge changes).
  PERFORM pg_advisory_xact_lock(public.pwa_lock_key_v1('borrower',referrer));
  PERFORM 1 FROM public."Business Expenses" WHERE "Row ID"=ANY(ids) ORDER BY "Row ID" COLLATE "C" FOR UPDATE;
  IF EXISTS(SELECT 1 FROM public.pwa_rebate_settlements WHERE id=target) THEN RAISE EXCEPTION USING ERRCODE='P5B01';END IF;
  IF NOT EXISTS(SELECT 1 FROM public."Borrowers" WHERE "Row ID"=referrer) THEN RAISE EXCEPTION USING ERRCODE='P5B02';END IF;
  IF NOT EXISTS(SELECT 1 FROM public."Cash Accounts" ca JOIN public."Cash Holders" ch ON ch."Row ID"=ca."Ref Cash Holder"
    WHERE ca."Row ID"=i->>'cashAccountId' AND ca."Ref Cash Holder"='ch:lisa' AND ca."Active" IS TRUE AND ch."Active" IS TRUE) THEN RAISE EXCEPTION USING ERRCODE='P5B07';END IF;
  SELECT max(coalesce(l."Close Date",x."Expense Date")) INTO newest FROM public."Business Expenses" x LEFT JOIN public."Loans" l ON l."Row ID"=x."Ref Related Loan" WHERE x."Row ID"=ANY(ids);
  IF settle_date>day OR settle_date<newest THEN RAISE EXCEPTION USING ERRCODE='P5B08';END IF;
  -- Every chosen row is a pending V3 rebate of this referrer (a legacy row, another payee's, a settled or offset-only one is not).
  IF (SELECT count(*) FROM public."Business Expenses" x WHERE x."Row ID"=ANY(ids) AND x."Source Type"='Referral Rebate' AND x."Rule Version"='REFERRAL_REBATE_V3'
    AND x."Ref Payee Borrower"=referrer AND x."Ref Rebate Settlement" IS NULL AND public.pwa_rebate_pending_v1(x."Row ID")>0)<>cardinality(ids) THEN RAISE EXCEPTION USING ERRCODE='P5B06';END IF;
  SELECT sum(public.pwa_rebate_pending_v1(v)) INTO total FROM unnest(ids) v;
  INSERT INTO public.pwa_rebate_settlements(id,payee_borrower_id,settlement_date,amount,paid_by_cash_holder,paid_by_cash_account,payment_method,bank_reference,notes,created_by)
   VALUES(target,referrer,settle_date,total,'ch:lisa',i->>'cashAccountId',i->>'paymentMethod',i->>'bankReference',i->>'notes',creator);
  PERFORM set_config('pwa.rebate_settlement',target,true);
  UPDATE public."Business Expenses" SET "Ref Rebate Settlement"=target WHERE "Row ID"=ANY(ids);
  GET DIAGNOSTICS changed=ROW_COUNT;
  PERFORM set_config('pwa.rebate_settlement','',true);
  IF changed<>cardinality(ids) OR (SELECT count(*) FROM public."Cash Ledger" WHERE "Entry Origin"='System' AND "Source Type"='Rebate Settlement' AND "Ref Rebate Settlement"=target
    AND "Movement Type"='Rebate Settlement' AND "Amount"=total AND "Movement Date"=settle_date AND "Ref From Cash Holder"='ch:lisa' AND "Ref From Cash Account"=i->>'cashAccountId')<>1 THEN
   RAISE EXCEPTION 'Rebate settlement cash entry differs from the settlement';
  END IF;
 ELSE
  SELECT payee_borrower_id INTO referrer FROM public.pwa_rebate_settlements WHERE id=target;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P5B02';END IF;
  PERFORM pg_advisory_xact_lock(public.pwa_lock_key_v1('borrower',referrer));
  SELECT * INTO s FROM public.pwa_rebate_settlements WHERE id=target FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P5B02';END IF;
  PERFORM 1 FROM public."Business Expenses" WHERE "Ref Rebate Settlement"=target ORDER BY "Row ID" COLLATE "C" FOR UPDATE;
  IF public.pwa_rebate_settlement_version_v1(target) IS DISTINCT FROM c->>'expectedVersion' THEN RAISE EXCEPTION USING ERRCODE='P5B01';END IF;
  creator:=s.created_by;
  -- The rebates return to pending, then the settlement and (its delete trigger) its cash entry go.
  PERFORM set_config('pwa.rebate_settlement',target,true);
  UPDATE public."Business Expenses" SET "Ref Rebate Settlement"=NULL WHERE "Ref Rebate Settlement"=target;
  PERFORM set_config('pwa.rebate_settlement','',true);
  DELETE FROM public.pwa_rebate_settlements WHERE id=target;
  IF EXISTS(SELECT 1 FROM public."Cash Ledger" WHERE "Ref Rebate Settlement"=target OR ("Source Type"='Rebate Settlement' AND "Source Key"='REBATESETTLEMENT:'||target)) THEN
   RAISE EXCEPTION 'Rebate settlement cash entry was not removed';
  END IF;
 END IF;
 RETURN jsonb_build_object('operation',op,'targetType','rebate-settlement','targetId',target,'paymentId',NULL,'plan',NULL,'predecessorRequestId',NULL,'sourceCreatedBy',creator);
END $$;
COMMENT ON FUNCTION public.pwa_apply_rebate_settlement_v1(text) IS 'mw-access:governance R129 rebate-settlement.create and .delete for pwa_submit_operation_v2; journal owner only.';

-- 14. Push content: v4 plus, on every rebates entry, its state ('paid' once a settlement paid a V3 rebate; else 'offset' when
-- an offset payment took part or all of it; else 'pending' or, for a rebate booked before V137, 'paid-at-close'), the pending
-- amount, the payee's owed total and its rule version (the renderer never words a V3 rebate as Lisa's transfer at close).
-- v1 to v4 stay for older dispatchers.
CREATE FUNCTION public.pwa_notify_content_v5(delivery uuid,generation bigint)
RETURNS TABLE(found boolean,event_type text,language text,borrower_name text,amount numeric,rebate_amount numeric,rebate_payee text,rebate_payable numeric,payment_method text,rebate_loan text,late_charge_amount numeric,rebates jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 PERFORM public.pwa_worker_guard_v1('dispatch');
 RETURN QUERY SELECT src.source_found,
  -- A chat reply carries its outcome ('chat.reply:ok' / 'chat.reply:failed', from source_version 'ok:<message>').
  CASE WHEN e.event_type='chat.reply' THEN 'chat.reply:'||split_part(e.source_version,':',1) ELSE e.event_type END,
  CASE WHEN recipient."Language Preference"='ไทย' THEN 'th' ELSE 'en' END::text,
  -- Chat: the thread title. Thai: the Thai name. English: the English name only ("Description"); none when blank.
  CASE WHEN e.source_kind='chat' THEN src.source_title WHEN recipient."Language Preference"='ไทย' THEN b."Borrower Name" ELSE nullif(btrim(b."Description",E' \t\r\n\f\v'),'') END,
  src.source_amount,
  rb.rebate_amount,
  CASE WHEN rb.rebate_amount IS NULL THEN NULL WHEN recipient."Language Preference"='ไทย' THEN pb."Borrower Name" ELSE coalesce(nullif(btrim(pb."Description",E' \t\r\n\f\v'),''),pb."Borrower Name") END,
  rb.rebate_payable,
  src.payment_method,
  (SELECT x."Ref Related Loan" FROM public."Business Expenses" x WHERE e.source_kind='payment' AND x."Ref Offset Payment"=e.source_id ORDER BY x."Row ID" COLLATE "C" LIMIT 1),
  CASE WHEN e.source_kind='payment' THEN (SELECT coalesce(sum(y."Late Charge Paid"::numeric),0) FROM public."Repayments" y WHERE y."Ref Payment"=e.source_id) END,
  -- R129: every rebate (R119 order) with its state, pending amount and the payee's owed total; [] when none; NULL on chat.
  CASE WHEN e.source_kind='chat' THEN NULL ELSE (
   SELECT coalesce(jsonb_agg(jsonb_build_object('amount',x."Amount"::numeric,
     'payee',CASE WHEN recipient."Language Preference"='ไทย' THEN xb."Borrower Name" ELSE coalesce(nullif(btrim(xb."Description",E' \t\r\n\f\v'),''),xb."Borrower Name") END,
     'payable',x."Amount"::numeric-coalesce(o."Amount Received"::numeric,0),
     'state',CASE WHEN x."Rule Version"='REFERRAL_REBATE_V3' AND x."Ref Rebate Settlement" IS NOT NULL THEN 'paid' WHEN coalesce(o."Amount Received"::numeric,0)>0 THEN 'offset'
      WHEN x."Rule Version"='REFERRAL_REBATE_V3' THEN 'pending' ELSE 'paid-at-close' END,
     'ruleVersion',x."Rule Version",
     'pending',public.pwa_rebate_pending_v1(x."Row ID"),
     'owed',public.pwa_rebates_owed_v1(x."Ref Payee Borrower")) ORDER BY x."Row ID" COLLATE "C"),'[]'::jsonb)
   FROM public."Business Expenses" x LEFT JOIN public."Payments" o ON o."Row ID"=x."Ref Offset Payment" LEFT JOIN public."Borrowers" xb ON xb."Row ID"=x."Ref Payee Borrower"
   WHERE x."Source Type"='Referral Rebate' AND ((e.event_type='loan.closed' AND e.source_kind='loan' AND x."Ref Related Loan"=e.source_id)
    OR (e.event_type='payment.posted' AND e.source_kind='payment' AND x."Ref Related Loan" IN (SELECT y."Row ID" FROM public."Loans" y WHERE y."Ref Closing Payment"=e.source_id)))) END
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
   OR (e.event_type='payment.posted' AND e.source_kind='payment' AND x."Ref Related Loan" IN (SELECT y."Row ID" FROM public."Loans" y WHERE y."Ref Closing Payment"=e.source_id)))
  ORDER BY x."Row ID" COLLATE "C" LIMIT 1
 ) rb ON true
 LEFT JOIN public."Borrowers" pb ON pb."Row ID"=rb.payee_id
 WHERE d.delivery_id=$1 AND d.lease_generation=$2 AND d.state='leased' AND d.lease_expires_at>clock_timestamp();
END $$;

-- 15. The D1 one-off correction (owner addition of 5 November 2026): a legacy rebate whose cash was never paid becomes
-- pending. Run by the operator as postgres inside the release's ledger owner window, once per named expense; nothing calls it.
CREATE FUNCTION public.pwa_convert_legacy_rebate_v1(p_expense_id text) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
DECLARE x public."Business Expenses"%ROWTYPE; payee text; offset_amount numeric; ledger_before numeric; ledger_after numeric;
BEGIN
 IF current_database() NOT IN ('loan_manager_dev','payment_rehearsal','loan_manager_prod') THEN RAISE EXCEPTION 'Unsupported application database'; END IF;
 IF NOT has_function_privilege(current_user,'public.sync_cash_ledger(text,text)','EXECUTE') THEN
  RAISE EXCEPTION 'Run the conversion as a role that executes sync_cash_ledger (postgres inside the ledger owner window)'; END IF;
 SELECT "Ref Payee Borrower" INTO payee FROM public."Business Expenses" WHERE "Row ID"=p_expense_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Unknown expense %',p_expense_id; END IF;
 IF payee IS NOT NULL THEN PERFORM pg_advisory_xact_lock(public.pwa_lock_key_v1('borrower',payee)); END IF;
 SELECT * INTO x FROM public."Business Expenses" WHERE "Row ID"=p_expense_id FOR UPDATE;
 IF x."Source Type" IS DISTINCT FROM 'Referral Rebate' THEN RAISE EXCEPTION 'Only a referral rebate expense can be converted'; END IF;
 IF x."Rule Version"='REFERRAL_REBATE_V3' THEN RAISE EXCEPTION 'This rebate is already pending payment (REFERRAL_REBATE_V3)'; END IF;
 IF x."Ref Rebate Settlement" IS NOT NULL THEN RAISE EXCEPTION 'This rebate is paid by a settlement'; END IF;
 IF x."Rule Version" IS DISTINCT FROM 'REFERRAL_REBATE_V2' OR x."Rebate Rate" IS NULL OR x."Rebate Cap" IS NULL THEN
  RAISE EXCEPTION 'Only a REFERRAL_REBATE_V2 rebate with its terms can be converted (a V1 row carries no terms)'; END IF;
 IF EXISTS(SELECT 1 FROM public.r005_cash_cutover_sources WHERE source_type='Business Expense' AND source_row_id=p_expense_id) THEN
  RAISE EXCEPTION 'A cash cutover source cannot be converted'; END IF;
 offset_amount:=coalesce((SELECT o."Amount Received"::numeric FROM public."Payments" o WHERE o."Row ID"=x."Ref Offset Payment" AND o."Status"='Posted'),0);
 IF x."Amount"::numeric-offset_amount<=0 THEN RAISE EXCEPTION 'Nothing is unpaid on this rebate (settled by offset)'; END IF;
 SELECT "Amount" INTO ledger_before FROM public."Cash Ledger" WHERE "Entry Origin"='System' AND "Source Type"='Business Expense' AND "Source Key"='EXPENSE:'||p_expense_id;
 -- The rule change re-projects the expense through its own cash trigger (UPDATE OF "Amount", same value; nothing disabled).
 PERFORM set_config('pwa.rebate_convert',p_expense_id,true);
 UPDATE public."Business Expenses" SET "Rule Version"='REFERRAL_REBATE_V3',"Amount"="Amount" WHERE "Row ID"=p_expense_id;
 PERFORM set_config('pwa.rebate_convert','',true);
 SELECT "Amount" INTO ledger_after FROM public."Cash Ledger" WHERE "Entry Origin"='System' AND "Source Type"='Business Expense' AND "Source Key"='EXPENSE:'||p_expense_id;
 IF ledger_after IS DISTINCT FROM nullif(offset_amount,0) OR public.pwa_rebate_pending_v1(p_expense_id) IS DISTINCT FROM x."Amount"::numeric-offset_amount THEN
  RAISE EXCEPTION 'Converted rebate differs from the rule'; END IF;
 RETURN jsonb_build_object('expenseId',p_expense_id,'amount',x."Amount"::numeric,'offsetAmount',offset_amount,'pendingAmount',public.pwa_rebate_pending_v1(p_expense_id),
  'ledgerBefore',ledger_before,'ledgerAfter',ledger_after);
END $$;
COMMENT ON FUNCTION public.pwa_convert_legacy_rebate_v1(text) IS 'mw-access:governance R129 D1 owner-authorized one-off: a REFERRAL_REBATE_V2 rebate never paid at close becomes pending (V3); its cash entry becomes the offset amount or goes. postgres only.';

-- 16. Access. Tables: SELECT for the application role (read routes), DML for the journal owner (the command), SELECT for the
-- ledger owner (the projection), four columns for the notify owner; PROD's default grants removed. Functions: the read rules
-- for the application role (and the notify owner, which reads them in v5), the command for the journal owner, v5 for the
-- dispatcher (V99 boundary), the conversion and the trigger functions for nobody but their owner.
DO $acl$
DECLARE suffix text:=CASE current_database() WHEN 'loan_manager_prod' THEN 'prod' ELSE 'dev' END; app text; journal text; ledger text; notify_owner text; dispatcher text;
 grantee text; routine text;
BEGIN
 app:='mw_app_'||suffix; journal:=app||'_journal_owner'; ledger:='mw_ledger_owner_'||suffix; notify_owner:='mw_notify_owner_'||suffix; dispatcher:='mw_notify_dispatch_'||suffix;
 REVOKE ALL ON public.pwa_rebate_settlements FROM PUBLIC;
 FOR grantee IN SELECT DISTINCT pg_get_userbyid(a.grantee) FROM pg_class c CROSS JOIN LATERAL aclexplode(c.relacl) a
   WHERE c.oid='public.pwa_rebate_settlements'::regclass AND a.grantee<>0 AND a.grantee<>c.relowner LOOP
  EXECUTE format('REVOKE ALL ON public.pwa_rebate_settlements FROM %I',grantee);
 END LOOP;
 EXECUTE format('GRANT SELECT ON public.pwa_rebate_settlements TO %I',app);
 EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON public.pwa_rebate_settlements TO %I',journal);
 EXECUTE format('GRANT SELECT ON public.pwa_rebate_settlements TO %I',ledger);
 EXECUTE format('GRANT SELECT (id,settlement_date,payee_borrower_id,amount) ON public.pwa_rebate_settlements TO %I',notify_owner);
 EXECUTE format('GRANT SELECT ("Rule Version","Ref Rebate Settlement") ON public."Business Expenses" TO %I',notify_owner);
 FOREACH routine IN ARRAY ARRAY['public.pwa_rebate_pending_v1(text)','public.pwa_rebates_owed_v1(text)','public.pwa_rebate_settlement_version_v1(text)',
   'public.pwa_apply_rebate_settlement_v1(text)','public.pwa_convert_legacy_rebate_v1(text)','public.rebate_settlement_cash_source()','public.rebate_settlement_row_guard()',
   'public.pwa_notify_content_v5(uuid,bigint)'] LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC',routine);
  FOR grantee IN SELECT DISTINCT pg_get_userbyid(a.grantee) FROM pg_proc p CROSS JOIN LATERAL aclexplode(p.proacl) a
    WHERE p.oid=routine::regprocedure AND a.grantee<>0 AND a.grantee<>p.proowner LOOP
   EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %I',routine,grantee);
  END LOOP;
 END LOOP;
 EXECUTE format('GRANT EXECUTE ON FUNCTION public.pwa_rebate_pending_v1(text) TO %I, %I',app,notify_owner);
 EXECUTE format('GRANT EXECUTE ON FUNCTION public.pwa_rebates_owed_v1(text) TO %I, %I',app,notify_owner);
 EXECUTE format('GRANT EXECUTE ON FUNCTION public.pwa_rebate_settlement_version_v1(text) TO %I',app);
 EXECUTE format('GRANT EXECUTE ON FUNCTION public.pwa_apply_rebate_settlement_v1(text) TO %I',journal);
 -- V99 pattern for v5: grants and comment while the runner still owns it, then the owner change.
 COMMENT ON FUNCTION public.pwa_notify_content_v5(uuid,bigint) IS 'mw-access:governance fixed notification boundary; explicit capability only';
 EXECUTE format('GRANT EXECUTE ON FUNCTION public.pwa_notify_content_v5(uuid,bigint) TO %I',dispatcher);
 EXECUTE format('ALTER FUNCTION public.pwa_notify_content_v5(uuid,bigint) OWNER TO %I',notify_owner);
END $acl$;

-- Self-check.
DO $check$
DECLARE bad text; suffix text:=CASE current_database() WHEN 'loan_manager_prod' THEN 'prod' ELSE 'dev' END; app text; journal text; ledger text; notify_owner text; dispatcher text;
 definition text;
BEGIN
 app:='mw_app_'||suffix; journal:=app||'_journal_owner'; ledger:='mw_ledger_owner_'||suffix; notify_owner:='mw_notify_owner_'||suffix; dispatcher:='mw_notify_dispatch_'||suffix;
 SELECT string_agg(o.routine,', ') INTO bad FROM v137_routines o JOIN pg_proc p ON p.oid=o.routine::regprocedure
  WHERE pg_get_userbyid(p.proowner)<>o.owner OR p.prosecdef<>o.definer OR p.provolatile<>o.volatile OR p.proconfig IS DISTINCT FROM o.config
   OR (o.routine NOT IN ('public.create_referral_rebate(text)','public.pwa_referral_rebate_projection_v1(text,jsonb)') AND obj_description(p.oid,'pg_proc') IS DISTINCT FROM o.comment)
   OR (SELECT array_agg(a.grantee::text||':'||a.privilege_type ORDER BY (a.grantee::text||':'||a.privilege_type) COLLATE "C") FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee<>p.proowner)
    IS DISTINCT FROM (SELECT array_agg(a.grantee::text||':'||a.privilege_type ORDER BY (a.grantee::text||':'||a.privilege_type) COLLATE "C") FROM aclexplode(o.effective) a WHERE a.grantee<>p.proowner);
 IF bad IS NOT NULL OR (SELECT count(*) FROM v137_routines)<>8 THEN RAISE EXCEPTION 'V137 changed the owner, privileges, attributes or comment of %',coalesce(bad,'an unexpected routine set'); END IF;
 SELECT string_agg(r,', ') INTO bad FROM unnest(ARRAY['public.calculate_business_expense()','public.create_referral_rebate(text)','public.pwa_referral_rebate_projection_v1(text,jsonb)',
   'public.sync_cash_ledger(text,text)','public.guard_cash_ledger()','public.pwa_submit_operation_v2(text)','public.pwa_apply_payment_v2(text)','public.pwa_apply_loan_close_v2(text)']) r
  WHERE position('R129' IN pg_get_functiondef(r::regprocedure))=0;
 IF bad IS NOT NULL THEN RAISE EXCEPTION 'V137: not patched: %',bad; END IF;
 IF position('REFERRAL_REBATE_V2' IN pg_get_functiondef('public.create_referral_rebate(text)'::regprocedure))>0 THEN RAISE EXCEPTION 'V137: create_referral_rebate still books V2'; END IF;
 IF EXISTS(SELECT 1 FROM v137_notify n JOIN pg_proc p ON p.oid=n.routine::regprocedure WHERE md5(pg_get_functiondef(p.oid))<>n.body OR coalesce(p.proacl::text,'')<>n.acl)
  OR (SELECT count(*) FROM v137_notify)<>4 THEN RAISE EXCEPTION 'V137 changed pwa_notify_content_v1 to v4'; END IF;
 IF public.referral_rebate_terms(NULL)<>'{"cap": 1000, "rate": 10, "custom": false}'::jsonb THEN RAISE EXCEPTION 'V137: the default terms changed'; END IF;
 -- The CHECK texts.
 SELECT pg_get_constraintdef(oid) INTO definition FROM pg_constraint WHERE conrelid='public."Cash Ledger"'::regclass AND conname='cash_ledger_source' AND convalidated;
 IF definition IS NULL OR (length(definition)-length(replace(definition,'"Ref Settlement", "Ref Rebate Settlement") = 1','')))/length('"Ref Settlement", "Ref Rebate Settlement") = 1')<>5
  OR position('"Ref Payment", "Ref Loan", "Ref Business Expense", "Ref Settlement")' IN definition)>0
  OR position($c$("Source Type" = 'Rebate Settlement'::text) AND ("Movement Type" = 'Rebate Settlement'::text) AND ("Source Key" = ('REBATESETTLEMENT:'::text || "Ref Rebate Settlement"))$c$ IN definition)=0
  OR position('("Ref Settlement" IS NULL) AND ("Ref Rebate Settlement" IS NULL) AND ("Movement Type" = ANY' IN definition)=0 THEN RAISE EXCEPTION 'V137: cash_ledger_source differs from the design'; END IF;
 IF position($c$"Rule Version" = ANY (ARRAY['REFERRAL_REBATE_V2'::text, 'REFERRAL_REBATE_V3'::text])$c$ IN (SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid='public."Business Expenses"'::regclass AND conname='Business Expenses_check2' AND convalidated))=0 THEN
  RAISE EXCEPTION 'V137: "Business Expenses_check2" differs from the design'; END IF;
 -- The link columns and their foreign keys (expense: no action; ledger: restrict).
 IF NOT EXISTS(SELECT 1 FROM pg_constraint c JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=ANY(c.conkey) WHERE c.conrelid='public."Business Expenses"'::regclass AND c.contype='f'
   AND c.confrelid='public.pwa_rebate_settlements'::regclass AND a.attname='Ref Rebate Settlement' AND c.confdeltype='a')
  OR NOT EXISTS(SELECT 1 FROM pg_constraint c JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=ANY(c.conkey) WHERE c.conrelid='public."Cash Ledger"'::regclass AND c.contype='f'
   AND c.confrelid='public.pwa_rebate_settlements'::regclass AND a.attname='Ref Rebate Settlement' AND c.confdeltype='r') THEN RAISE EXCEPTION 'V137: the settlement links differ from the design'; END IF;
 -- Table ACL, exactly.
 IF (SELECT array_agg(pg_get_userbyid(a.grantee)||':'||a.privilege_type ORDER BY (pg_get_userbyid(a.grantee)||':'||a.privilege_type) COLLATE "C") FROM pg_class c CROSS JOIN LATERAL aclexplode(c.relacl) a
   WHERE c.oid='public.pwa_rebate_settlements'::regclass AND a.grantee<>c.relowner)
  IS DISTINCT FROM (SELECT array_agg(x ORDER BY x COLLATE "C") FROM unnest(ARRAY[app||':SELECT',journal||':DELETE',journal||':INSERT',journal||':SELECT',journal||':UPDATE',ledger||':SELECT']) x)
  OR (SELECT array_agg(a.attname::text ORDER BY a.attname::text COLLATE "C") FROM pg_attribute a CROSS JOIN LATERAL aclexplode(a.attacl) x WHERE a.attrelid='public.pwa_rebate_settlements'::regclass AND x.grantee=notify_owner::regrole)
   IS DISTINCT FROM ARRAY['amount','id','payee_borrower_id','settlement_date'] THEN RAISE EXCEPTION 'V137: unexpected access to pwa_rebate_settlements'; END IF;
 -- Function ACLs, exactly; v5 is the notify owner's pinned definer; the rest run with the caller's rights.
 SELECT string_agg(f.routine,', ') INTO bad FROM (VALUES
   ('public.pwa_rebate_pending_v1(text)',ARRAY[app||':EXECUTE',notify_owner||':EXECUTE']),('public.pwa_rebates_owed_v1(text)',ARRAY[app||':EXECUTE',notify_owner||':EXECUTE']),
   ('public.pwa_rebate_settlement_version_v1(text)',ARRAY[app||':EXECUTE']),('public.pwa_apply_rebate_settlement_v1(text)',ARRAY[journal||':EXECUTE']),
   ('public.pwa_notify_content_v5(uuid,bigint)',ARRAY[dispatcher||':EXECUTE']),('public.pwa_convert_legacy_rebate_v1(text)',NULL::text[]),
   ('public.rebate_settlement_cash_source()',NULL::text[]),('public.rebate_settlement_row_guard()',NULL::text[])) f(routine,expected)
  WHERE (SELECT array_agg(CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END||':'||a.privilege_type ORDER BY (CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END||':'||a.privilege_type) COLLATE "C") FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
    WHERE p.oid=f.routine::regprocedure AND a.grantee<>p.proowner) IS DISTINCT FROM (SELECT array_agg(x ORDER BY x COLLATE "C") FROM unnest(f.expected) x);
 IF bad IS NOT NULL THEN RAISE EXCEPTION 'V137: unexpected access to %',bad; END IF;
 IF NOT (SELECT prosecdef AND pg_get_userbyid(proowner)=notify_owner AND 'search_path=pg_catalog, public'=ANY(proconfig) FROM pg_proc WHERE oid='public.pwa_notify_content_v5(uuid,bigint)'::regprocedure)
  OR EXISTS(SELECT 1 FROM pg_proc WHERE prosecdef AND oid IN ('public.pwa_rebate_pending_v1(text)'::regprocedure,'public.pwa_rebates_owed_v1(text)'::regprocedure,'public.pwa_rebate_settlement_version_v1(text)'::regprocedure,
   'public.pwa_apply_rebate_settlement_v1(text)'::regprocedure,'public.pwa_convert_legacy_rebate_v1(text)'::regprocedure,'public.rebate_settlement_cash_source()'::regprocedure,'public.rebate_settlement_row_guard()'::regprocedure))
  OR EXISTS(SELECT 1 FROM unnest(ARRAY['public.pwa_apply_rebate_settlement_v1(text)','public.pwa_convert_legacy_rebate_v1(text)']) r WHERE obj_description(r::regprocedure,'pg_proc') NOT LIKE 'mw-access:governance%') THEN
  RAISE EXCEPTION 'V137: the new functions'' security or governance comments differ from the design'; END IF;
 -- v5 = v4's columns (R119 column-list assertion pattern).
 IF (SELECT proallargtypes::text||coalesce(array_to_string(proargnames,','),'') FROM pg_proc WHERE oid='public.pwa_notify_content_v5(uuid,bigint)'::regprocedure)
   IS DISTINCT FROM (SELECT proallargtypes::text||coalesce(array_to_string(proargnames,','),'') FROM pg_proc WHERE oid='public.pwa_notify_content_v4(uuid,bigint)'::regprocedure) THEN
  RAISE EXCEPTION 'V137: pwa_notify_content_v5 columns differ from v4'; END IF;
 IF NOT has_column_privilege(notify_owner,'public."Business Expenses"','Rule Version','SELECT') OR NOT has_column_privilege(notify_owner,'public."Business Expenses"','Ref Rebate Settlement','SELECT')
  OR has_table_privilege(notify_owner,'public."Business Expenses"','SELECT') THEN RAISE EXCEPTION 'V137: the notify owner reads the expense by its columns only'; END IF;
 -- The triggers on the new table.
 IF (SELECT array_agg(tgname::text ORDER BY tgname::text COLLATE "C") FROM pg_trigger WHERE tgrelid='public.pwa_rebate_settlements'::regclass AND NOT tgisinternal) IS DISTINCT FROM ARRAY['a0_rebate_settlement_guard','zz_cash_source'] THEN
  RAISE EXCEPTION 'V137: the settlement triggers differ from the design'; END IF;
END $check$;
