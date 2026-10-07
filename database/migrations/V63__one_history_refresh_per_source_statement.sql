-- R051: source and nested cash/repayment writes share one atomic statement.
-- Collect its earliest affected date, then refresh once after all row triggers.
-- No persistent queue/table, deferred business effects, or caller ritual.
CREATE FUNCTION public.request_business_history(d date) RETURNS void
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF d IS NOT NULL THEN
  PERFORM set_config('business_history.from',least(d,nullif(current_setting('business_history.from',true),'')::date)::text,true);
 END IF;
END $$;

CREATE OR REPLACE FUNCTION public.business_history_refresh() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE o jsonb:=CASE WHEN TG_OP='INSERT' THEN '{}'::jsonb ELSE to_jsonb(OLD) END;
 n jsonb:=CASE WHEN TG_OP='DELETE' THEN '{}'::jsonb ELSE to_jsonb(NEW) END;
 fields text[]; date_column text:=TG_ARGV[0]; d date; first_day date; last_day date;
BEGIN
 fields:=CASE TG_TABLE_NAME
  WHEN 'Loans' THEN ARRAY['Loan Date','Principal Amount','Loan Status','Close Date','Defaulted','Ref Borrowers']
  WHEN 'Charges' THEN ARRAY['Charge Date','Principal Due','Interest Due','Ref Loans']
  WHEN 'Business Expenses' THEN ARRAY['Expense Date','Amount','Partner A Expense','Partner B Expense']
  WHEN 'Cash Ledger' THEN ARRAY['Movement Date','Amount','Movement Type','Ref From Cash Holder','Ref To Cash Holder','Ref From Cash Account','Ref To Cash Account']
  WHEN 'Cash Pool Contributions' THEN ARRAY['Contribution Date','Amount','Transaction Type','Ref Partner']
  WHEN 'Settlements' THEN ARRAY['Transfer Date','Amount','Status','Ref Partner']
  WHEN 'Repayments' THEN ARRAY['Payment Date','Principal Paid','Interest Paid','Ref Loans','Ref Charges']
  WHEN 'Partners' THEN ARRAY['Partner Role'] END;
 IF TG_OP='UPDATE' AND NOT EXISTS(SELECT 1 FROM unnest(fields) k WHERE o->k IS DISTINCT FROM n->k) THEN RETURN NULL; END IF;
 d:=least((o->>date_column)::date,(n->>date_column)::date);
 IF TG_TABLE_NAME='Loans' AND TG_OP='UPDATE' AND
  (o->'Loan Date',o->'Principal Amount',o->'Ref Borrowers') IS NOT DISTINCT FROM (n->'Loan Date',n->'Principal Amount',n->'Ref Borrowers') THEN
  d:=least((o->>'Close Date')::date,(n->>'Close Date')::date);
 END IF;
 IF TG_TABLE_NAME='Partners' THEN
  SELECT min("Contribution Date") INTO d FROM public."Cash Pool Contributions" WHERE "Ref Partner" IN (o->>'Row ID',n->>'Row ID');
 END IF;
 IF d IS NULL THEN RETURN NULL; END IF;
 PERFORM public.request_business_history(d);
 RETURN NULL;
END $$;
CREATE OR REPLACE FUNCTION public.payment_crud_finish() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
#variable_conflict use_column
DECLARE d date; first_day date; last_day date; previous jsonb; l public."Loans"%ROWTYPE; prior_context text;
BEGIN
 IF TG_OP='UPDATE' THEN
  IF public.payment_inputs(NEW) IS NOT DISTINCT FROM public.payment_inputs(OLD)
   AND NEW."Ref Received By Cash Account" IS NOT DISTINCT FROM OLD."Ref Received By Cash Account" THEN RETURN NULL; END IF;
  IF EXISTS(SELECT 1 FROM public."Repayments" r JOIN public."Loans" l ON l."Row ID"=r."Ref Loans"
   WHERE r."Ref Payment"=NEW."Row ID" AND l."Defaulted" IS TRUE) THEN
   RAISE EXCEPTION 'Corrected payment has a default dependency; undo default first'; END IF;
  d:=least(OLD."Payment Date",NEW."Payment Date");
 ELSE d:=OLD."Payment Date";
 END IF;
 prior_context:=current_setting('payment_crud.id',true);
 PERFORM set_config('payment_crud.id',OLD."Row ID",true);
 FOR previous IN SELECT value FROM jsonb_array_elements(coalesce(nullif(current_setting('payment_crud.parents',true),'')::jsonb->OLD."Row ID",'[]')) LOOP
  SELECT * INTO l FROM public."Loans" WHERE "Row ID"=previous->>'Row ID';
  IF l."Ref Closing Payment" IS NOT NULL AND (l."Principal Amount"::numeric>
    (SELECT coalesce(sum("Principal Paid"::numeric),0) FROM public."Repayments" WHERE "Ref Loans"=l."Row ID")
    OR EXISTS(SELECT 1 FROM public."Charges" c WHERE c."Ref Loans"=l."Row ID" AND c."Principal Due"::numeric+c."Interest Due"::numeric>
     (SELECT coalesce(sum(r."Principal Paid"::numeric+r."Interest Paid"::numeric),0) FROM public."Repayments" r WHERE r."Ref Charges"=c."Row ID"))) THEN
   UPDATE public."Loans" SET "Loan Status"='ยังไม่ปิดยอด',"Ref Closing Payment"=NULL,"Close Date"=NULL,"Closed By"=NULL
    WHERE "Row ID"=l."Row ID";
  ELSIF l."Ref Closing Payment" IS NOT NULL THEN
   -- If the original closing receipt still closes this loan, retain its actual
   -- closure date/actor; rebuilding derived rows is not a new closure event.
   IF l."Ref Closing Payment"=previous->>'Ref Closing Payment' AND l."Ref Closing Payment"<>OLD."Row ID" THEN
    UPDATE public."Loans" SET "Close Date"=(previous->>'Close Date')::date,"Closed By"=previous->>'Closed By'
     WHERE "Row ID"=l."Row ID";
   END IF;
   PERFORM public.create_referral_rebate(l."Row ID");
  END IF;
 END LOOP;
 PERFORM set_config('payment_crud.parents',(coalesce(nullif(current_setting('payment_crud.parents',true),'')::jsonb,'{}')-OLD."Row ID")::text,true);
 PERFORM set_config('payment_crud.id',coalesce(prior_context,''),true);
 PERFORM public.request_business_history(d);
 RETURN NULL;
END $$;

CREATE FUNCTION public.begin_business_history() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF pg_trigger_depth()=1 THEN PERFORM set_config('business_history.statement_active','on',true); END IF;
 RETURN NULL;
END $$;

CREATE FUNCTION public.flush_business_history() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE d date; first_day date; last_day date;
BEGIN
 -- Nested statements contribute dates; only the outer source statement flushes.
 IF pg_trigger_depth()>1 THEN RETURN NULL; END IF;
 IF TG_LEVEL='STATEMENT' THEN
  PERFORM set_config('business_history.statement_active','off',true);
 ELSIF current_setting('business_history.statement_active',true)='on' THEN
  -- An immediate constraint callback still belongs to its unfinished statement.
  RETURN NULL;
 END IF;
 d:=nullif(current_setting('business_history.from',true),'')::date;
 IF d IS NULL THEN RETURN NULL; END IF;
 PERFORM set_config('business_history.from','',true);
 SELECT min(snapshot_day),max(snapshot_day) INTO first_day,last_day FROM (
  SELECT "Snapshot Date" snapshot_day FROM public."Daily Analytics" WHERE "Snapshot Date">=d
  UNION ALL SELECT "Snapshot Date" FROM public."Cash Account Daily Analytics" WHERE "Snapshot Date">=d) snapshots;
 IF first_day IS NOT NULL THEN PERFORM public.refresh_daily_analytics(first_day,last_day); END IF;
 RETURN NULL;
END $$;

DO $$ DECLARE item record; table_name text;
BEGIN
 FOR item IN SELECT * FROM (VALUES
  ('Business Expenses','Expense Date'),('Cash Ledger','Movement Date'),
  ('Cash Pool Contributions','Contribution Date'),('Charges','Charge Date'),
  ('Loans','Loan Date'),('Settlements','Transfer Date'),('Repayments','Payment Date'),('Partners','')) v(t,d)
 LOOP
  EXECUTE format('DROP TRIGGER zzzz_business_history ON public.%I',item.t);
  EXECUTE format('CREATE TRIGGER zzzz_business_history AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.business_history_refresh(%L)',item.t,item.d);
 END LOOP;
 FOREACH table_name IN ARRAY ARRAY['Business Expenses','Cash Ledger','Cash Pool Contributions','Charges','Loans','Settlements','Repayments','Partners','Payments','Payment Allocations'] LOOP
  EXECUTE format('CREATE TRIGGER a000_business_history_begin BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH STATEMENT EXECUTE FUNCTION public.begin_business_history()',table_name);
  -- Deferred referral/expense callbacks can add dates after statement completion.
  -- Their deferred fallback sees the final source state, including nested cash.
  EXECUTE format('CREATE CONSTRAINT TRIGGER zzzzzz_business_history_commit AFTER INSERT OR UPDATE OR DELETE ON public.%I DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.flush_business_history()',table_name);
  EXECUTE format('CREATE TRIGGER zzzzz_business_history_flush AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH STATEMENT EXECUTE FUNCTION public.flush_business_history()',table_name);
 END LOOP;
END $$;
