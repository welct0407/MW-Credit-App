-- R116 legacy default reconciliation (owner decision of 2 November 2026; Archie's design). Two loans defaulted in the
-- AppSheet era (DEV and PROD: 5,000 closed 2026-08-26 and 1,000 closed 2026-08-28) carry "Defaulted" and a
-- "Default Loss Amount" but no df10: ledger pair, so their principal is still outstanding in the ledger and the loss is in
-- no write-off figure. V130 adds the operator function that posts the missing pairs; V130 itself posts nothing.
--   public.reconcile_legacy_default_postings(p_actor text, p_apply boolean)
--     RETURNS TABLE(loan, close_date, column_amount, ledger_amount, posting_id, action)
-- Selection: Defaulted loans whose coalesce("Default Loss Amount",0) differs from the ledger sum of "Principal Paid" of
-- their df10: repayments. Refused (an error, never a skip) when the column is below the ledger, the difference exceeds the
-- ledger outstanding principal ("Principal Amount" - sum of "Principal Paid"), the loan has no Close Date, or the dated
-- posting id already exists. p_apply false lists the rows (action 'would post') and writes nothing. p_apply true, under the
-- borrower -> loan -> charges locks and the V120 posting context (business_crud.default), inserts exactly the rows
-- post_loan_default (V120, write off and close) inserts for the difference X: a Charges row and a Repayments row with
-- Row ID df10:<length>:<loan>:<Close Date>, dated on the Close Date, Principal +X and Interest -X, zero cash (no Ref
-- Payment), the V120 Notes plus "R116 legacy reconciliation", Created By p_actor; then proves that every listed loan's
-- column equals its ledger and its outstanding principal is not negative, and refreshes the Daily Analytics snapshots from
-- the earliest posted Close Date through Bangkok today inside the same transaction (refresh_daily_analytics), so the
-- postings and the history they restate commit together (action 'posted'); at commit the deferred cached-total and history
-- triggers rebuild those snapshots once more from the refreshed loans. A second run lists nothing. A dry run takes no lock
-- and writes nothing, so the operator runs it READ ONLY.
-- The function never writes "Loans" itself (the existing triggers recompute the cached totals; "Default Loss Amount",
-- "Defaulted", the dates and the status do not change), disables no trigger and needs no table, column, view or grant:
-- it is owned by the migration identity, executable by nobody else (PUBLIC and the PROD default-privilege grants are
-- revoked below), and run explicitly by the owner or migration identity after this migration, through
-- scripts/database/Invoke-LegacyWriteoffReconcile.py. Rollback: Undo Default is the reviewed path for a posted pair;
-- a later migration drops the function.

DO $preflight$
BEGIN
 IF current_database() NOT IN ('loan_manager_dev','payment_rehearsal','loan_manager_prod') THEN RAISE EXCEPTION 'Unsupported application database'; END IF;
 IF to_regprocedure('public.post_loan_default(public."Loans",date,text,numeric,boolean)') IS NULL OR to_regprocedure('public.refresh_daily_analytics(date,date)') IS NULL
  OR NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='public.olap_portfolio_summary'::regclass AND attname='Principal Write-offs' AND NOT attisdropped) THEN
  RAISE EXCEPTION 'V130 needs V129'; END IF;
 IF to_regprocedure('public.reconcile_legacy_default_postings(text,boolean)') IS NOT NULL THEN RAISE EXCEPTION 'V130: the function already exists'; END IF;
END $preflight$;

CREATE FUNCTION public.reconcile_legacy_default_postings(p_actor text, p_apply boolean)
RETURNS TABLE(loan text, close_date date, column_amount numeric, ledger_amount numeric, posting_id text, action text)
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE r record; prior text:=current_setting('business_crud.default',true); difference numeric; k integer;
 loans text[]:='{}'; dates date[]:='{}'; recorded numeric[]:='{}'; ledgers numeric[]:='{}'; ids text[]:='{}';
BEGIN
 IF p_apply IS NULL OR (p_apply AND nullif(btrim(p_actor),'') IS NULL) THEN
  RAISE EXCEPTION 'Legacy default reconciliation requires p_apply and, to apply, the actor'; END IF;
 -- To apply, the lock order of the source writers: borrowers, loans, then their charges. A dry run takes no lock and writes
 -- nothing, so it also runs in a READ ONLY transaction.
 IF p_apply THEN
  PERFORM 1 FROM public."Borrowers" b WHERE b."Row ID" IN (SELECT l."Ref Borrowers" FROM public."Loans" l WHERE coalesce(l."Defaulted",false))
   ORDER BY b."Row ID" COLLATE "C" FOR UPDATE;
  PERFORM 1 FROM public."Loans" l WHERE coalesce(l."Defaulted",false) ORDER BY l."Row ID" COLLATE "C" FOR UPDATE;
  PERFORM 1 FROM public."Charges" c WHERE c."Ref Loans" IN (SELECT l."Row ID" FROM public."Loans" l WHERE coalesce(l."Defaulted",false))
   ORDER BY c."Row ID" COLLATE "C" FOR UPDATE;
 END IF;
 FOR r IN SELECT l."Row ID" AS id,l."Close Date" AS closed,coalesce(l."Default Loss Amount"::numeric,0) AS amount,
   coalesce((SELECT sum(p."Principal Paid"::numeric) FROM public."Repayments" p WHERE p."Ref Loans"=l."Row ID" AND starts_with(p."Row ID",'df10:')),0) AS ledger,
   l."Principal Amount"::numeric-coalesce((SELECT sum(p."Principal Paid"::numeric) FROM public."Repayments" p WHERE p."Ref Loans"=l."Row ID"),0) AS remaining
  FROM public."Loans" l WHERE coalesce(l."Defaulted",false) ORDER BY l."Row ID" COLLATE "C"
 LOOP
  CONTINUE WHEN r.amount=r.ledger;
  difference:=r.amount-r.ledger;
  IF difference<0 THEN RAISE EXCEPTION 'Legacy default %: the recorded loss % is below the ledger %; reconcile by hand',r.id,r.amount,r.ledger; END IF;
  IF r.remaining IS NULL OR r.remaining<difference THEN
   RAISE EXCEPTION 'Legacy default %: outstanding principal % is below the unposted loss %; reconcile by hand',r.id,r.remaining,difference; END IF;
  IF r.closed IS NULL THEN RAISE EXCEPTION 'Legacy default %: no Close Date to date the posting',r.id; END IF;
  IF EXISTS(SELECT 1 FROM public."Charges" c WHERE c."Row ID"='df10:'||length(r.id)||':'||r.id||':'||r.closed::text)
   OR EXISTS(SELECT 1 FROM public."Repayments" p WHERE p."Row ID"='df10:'||length(r.id)||':'||r.id||':'||r.closed::text) THEN
   RAISE EXCEPTION 'Legacy default %: its dated posting id already exists; reconcile by hand',r.id; END IF;
  loans:=loans||r.id; dates:=dates||r.closed; recorded:=recorded||r.amount; ledgers:=ledgers||r.ledger;
  ids:=ids||('df10:'||length(r.id)||':'||r.id||':'||r.closed::text);
 END LOOP;
 IF p_apply AND cardinality(loans)>0 THEN
  FOR k IN 1..cardinality(loans) LOOP
   difference:=recorded[k]-ledgers[k];
   -- The V120 posting context of post_loan_default (write off and close) and its rows.
   PERFORM set_config('business_crud.default',loans[k],true);
   INSERT INTO public."Charges"("Row ID","Ref Loans","Charge Date","Principal Due","Interest Due","Notes")
    VALUES(ids[k],loans[k],dates[k],difference::money,(-difference)::money,
     'Loan default - outstanding principal recorded as loss; zero cash; R116 legacy reconciliation');
   INSERT INTO public."Repayments"("Row ID","Payment Date","Principal Paid","Interest Paid","Notes","Ref Loans","Ref Charges","Created By")
    VALUES(ids[k],dates[k],difference::money,(-difference)::money,
     'หนี้สูญ - บันทึกเงินต้นคงเหลือเป็นขาดทุน / Loan default - outstanding principal recorded as loss; R116 legacy reconciliation',
     loans[k],ids[k],p_actor);
   PERFORM set_config('business_crud.default',coalesce(prior,''),true);
  END LOOP;
  -- Every listed loan now has its column equal to its ledger, and no negative outstanding principal.
  IF EXISTS(SELECT 1 FROM public."Loans" l WHERE l."Row ID"=ANY(loans)
    AND (coalesce(l."Default Loss Amount"::numeric,0)<>coalesce((SELECT sum(p."Principal Paid"::numeric) FROM public."Repayments" p WHERE p."Ref Loans"=l."Row ID" AND starts_with(p."Row ID",'df10:')),0)
     OR l."Principal Amount"::numeric-coalesce((SELECT sum(p."Principal Paid"::numeric) FROM public."Repayments" p WHERE p."Ref Loans"=l."Row ID"),0)<0)) THEN
   RAISE EXCEPTION 'Legacy default reconciliation did not reconcile the ledger'; END IF;
  -- The snapshots from the earliest posting through today, in this transaction (the cached loan totals and the history
  -- flush are deferred constraint triggers: at commit they refresh the loans and rebuild these snapshots once more).
  PERFORM public.refresh_daily_analytics((SELECT min(d) FROM unnest(dates) d),(statement_timestamp() AT TIME ZONE 'Asia/Bangkok')::date);
 END IF;
 RETURN QUERY SELECT x.loan,x.close_date,x.column_amount,x.ledger_amount,x.posting_id,CASE WHEN p_apply THEN 'posted' ELSE 'would post' END
  FROM unnest(loans,dates,recorded,ledgers,ids) x(loan,close_date,column_amount,ledger_amount,posting_id) ORDER BY x.loan COLLATE "C";
END $$;

COMMENT ON FUNCTION public.reconcile_legacy_default_postings(text,boolean) IS
 'R116 (V130): posts the missing df10: pair of a Defaulted loan whose Default Loss Amount exceeds its ledger, dated on its Close Date, then refreshes Daily Analytics. Operator path; owner only.';

-- Owner only: no PUBLIC execute, and none of the default-privilege grants the migration role carries in PROD.
DO $acl$
DECLARE g record;
BEGIN
 FOR g IN SELECT DISTINCT a.grantee FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
   WHERE p.oid='public.reconcile_legacy_default_postings(text,boolean)'::regprocedure AND a.grantee<>p.proowner LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION public.reconcile_legacy_default_postings(text,boolean) FROM %s',CASE WHEN g.grantee=0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(g.grantee)) END);
 END LOOP;
END $acl$;

-- Self-check: only the owner may execute; the application roles cannot; nothing was posted by the migration.
DO $check$
BEGIN
 IF EXISTS(SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
   WHERE p.oid='public.reconcile_legacy_default_postings(text,boolean)'::regprocedure AND a.grantee<>p.proowner) THEN
  RAISE EXCEPTION 'V130: reconcile_legacy_default_postings must be executable by its owner only'; END IF;
 IF EXISTS(SELECT 1 FROM pg_roles r WHERE r.rolname IN ('mw_app_dev','mw_app_prod','mw_integration_agent','mw_business_audit_owner')
   AND has_function_privilege(r.oid,'public.reconcile_legacy_default_postings(text,boolean)','EXECUTE') AND NOT r.rolsuper) THEN
  RAISE EXCEPTION 'V130: an application role can execute the reconciliation'; END IF;
 IF EXISTS(SELECT 1 FROM public."Repayments" WHERE starts_with("Row ID",'df10:') AND "Notes" LIKE '%R116 legacy reconciliation%') THEN
  RAISE EXCEPTION 'V130 must not post'; END IF;
END $check$;
