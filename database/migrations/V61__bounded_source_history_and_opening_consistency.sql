-- R051 forward refinement after actual DEV timing exposed repeated historical
-- refresh from derived caches. V59/V60 remain immutable. No backfill or grants.
CREATE OR REPLACE FUNCTION public.business_history_refresh() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE o jsonb:=CASE WHEN TG_OP='INSERT' THEN '{}'::jsonb ELSE to_jsonb(OLD) END;
 n jsonb:=CASE WHEN TG_OP='DELETE' THEN '{}'::jsonb ELSE to_jsonb(NEW) END;
 fields text[]; date_column text:=TG_ARGV[0]; d date; first_day date; last_day date;
BEGIN
 fields:=CASE TG_TABLE_NAME
  WHEN 'Loans' THEN ARRAY['Loan Date','Principal Amount','Loan Status','Close Date','Defaulted','Ref Borrowers']
  WHEN 'Charges' THEN ARRAY['Charge Date','Principal Due','Interest Due','Ref Loans']
  WHEN 'Business Expenses' THEN ARRAY['Expense Date','Amount']
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
 SELECT min(snapshot_day),max(snapshot_day) INTO first_day,last_day FROM (
  SELECT "Snapshot Date" snapshot_day FROM public."Daily Analytics" WHERE "Snapshot Date">=d
  UNION ALL SELECT "Snapshot Date" FROM public."Cash Account Daily Analytics" WHERE "Snapshot Date">=d) snapshots;
 IF first_day IS NOT NULL THEN PERFORM public.refresh_daily_analytics(first_day,last_day); END IF;
 RETURN NULL;
END $$;
-- Repayment source dates also cover the retained independent legacy workflow.
CREATE CONSTRAINT TRIGGER zzzz_business_history AFTER INSERT OR UPDATE OR DELETE ON public."Repayments"
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.business_history_refresh('Payment Date');
CREATE CONSTRAINT TRIGGER zzzz_business_history AFTER INSERT OR UPDATE OR DELETE ON public."Partners"
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.business_history_refresh('');

-- Cash cutover sources are already represented in an opening balance. Ordinary
-- metadata edits are safe; silently changing their financial amount/date/account
-- would change the source without changing the opening or its cash projection.
CREATE FUNCTION public.guard_opening_included_source() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE kind text; fields text[]; o jsonb:=to_jsonb(OLD); n jsonb:=to_jsonb(NEW);
BEGIN
 kind:=CASE TG_TABLE_NAME WHEN 'Payments' THEN 'Payment' WHEN 'Loans' THEN 'Loan'
  WHEN 'Business Expenses' THEN 'Business Expense' WHEN 'Settlements' THEN 'Settlement' END;
 IF NOT EXISTS(SELECT 1 FROM public.r005_cash_cutover_sources s WHERE s.source_type=kind AND s.source_row_id=OLD."Row ID") THEN RETURN NEW; END IF;
 fields:=CASE TG_TABLE_NAME
  WHEN 'Payments' THEN ARRAY['Amount Received','Payment Date','Ref Received By Cash Holder','Ref Received By Cash Account']
  WHEN 'Loans' THEN ARRAY['Principal Amount','Loan Date','Ref Disbursed From Cash Account']
  WHEN 'Business Expenses' THEN ARRAY['Amount','Expense Date','Ref Paid By Cash Holder','Ref Paid By Cash Account']
  WHEN 'Settlements' THEN ARRAY['Amount','Transfer Date','Status','Ref Paid From Cash Account'] END;
 IF EXISTS(SELECT 1 FROM unnest(fields) k WHERE o->k IS DISTINCT FROM n->k) THEN
  RAISE EXCEPTION 'Source is included in historical cash opening; reconcile that opening before amount/date/account correction'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER a000_opening_consistency BEFORE UPDATE ON public."Payments" FOR EACH ROW EXECUTE FUNCTION public.guard_opening_included_source();
CREATE TRIGGER a000_opening_consistency BEFORE UPDATE ON public."Loans" FOR EACH ROW EXECUTE FUNCTION public.guard_opening_included_source();
CREATE TRIGGER a000_opening_consistency BEFORE UPDATE ON public."Business Expenses" FOR EACH ROW EXECUTE FUNCTION public.guard_opening_included_source();
CREATE TRIGGER a000_opening_consistency BEFORE UPDATE ON public."Settlements" FOR EACH ROW EXECUTE FUNCTION public.guard_opening_included_source();
