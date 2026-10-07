"""Generate the unapplied V73 candidate from immutable current definitions."""
from pathlib import Path
import re
root = Path(__file__).resolve().parents[2]
source = (root/'database/migrations/V64__aggregate_charge_payments_per_snapshot_date.sql').read_text(encoding='utf-8')
source = source[source.index('CREATE OR REPLACE FUNCTION'):]
source = source.replace('public.refresh_daily_analytics(p_from date,p_to date)', 'public.refresh_daily_analytics_scoped(p_from date,p_to date,p_accounts text[])', 1)
source = source.replace(' -- One statement provides', ''' -- Missing account snapshots require a full rebuild of account coverage.
 IF p_accounts IS NOT NULL AND EXISTS (
  SELECT 1 FROM public."Cash Accounts" a CROSS JOIN generate_series(0,p_to-p_from) d
  WHERE NOT EXISTS(SELECT 1 FROM public."Cash Account Daily Analytics" s
   WHERE s."Ref Cash Account"=a."Row ID" AND s."Snapshot Date"=p_from+d)
 ) THEN p_accounts:=NULL; END IF;
 -- One statement provides''', 1)
source = source.replace(' ), expenses AS MATERIALIZED (', ''' ), charge_events AS MATERIALIZED (
   SELECT c."Row ID" charge,c."Charge Date" d,
    coalesce(c."Principal Due"::numeric,0)+coalesce(c."Interest Due"::numeric,0) due,
    coalesce(sum(cp.paid),0) paid
   FROM public."Charges" c LEFT JOIN charge_payments cp
    ON cp.charge=c."Row ID" AND cp.d<=c."Charge Date"
   WHERE p_to-p_from>=3 AND c."Charge Date"<=p_to GROUP BY 1,2,3
   UNION ALL
   SELECT c."Row ID",cp.d,coalesce(c."Principal Due"::numeric,0)+coalesce(c."Interest Due"::numeric,0),cp.paid
   FROM public."Charges" c JOIN charge_payments cp ON cp.charge=c."Row ID" AND cp.d>c."Charge Date"
   WHERE p_to-p_from>=3 AND c."Charge Date"<=p_to
 ), charge_positions AS (
   SELECT charge,d,greatest(due-sum(paid) OVER(PARTITION BY charge ORDER BY d ROWS UNBOUNDED PRECEDING),0) pending
   FROM charge_events
 ), pending_changes AS (
   SELECT d,pending-coalesce(lag(pending) OVER(PARTITION BY charge ORDER BY d),0) delta FROM charge_positions
 ), pending_days AS MATERIALIZED (
   SELECT d,sum(delta) delta FROM pending_changes GROUP BY d
 ), expenses AS MATERIALIZED (''', 1)
source = source.replace('   GROUP BY a."Row ID",c."Cutover At"', '   WHERE p_accounts IS NULL OR a."Row ID"=ANY(p_accounts)\n   GROUP BY a."Row ID",c."Cutover At"', 1)
source = source.replace('''   SELECT "Date" d,"Partner A Net Profit" pa,"Partner B Net Profit" pb FROM public.reporting_income_daily
   WHERE "Date" BETWEEN p_from AND p_to''', '''   -- Keep the governed per-repayment rounded allocation, but filter its inputs
   -- before aggregation instead of evaluating the all-history running report.
   SELECT dates.d,coalesce(i.pa,0)-coalesce(e.pa,0) pa,coalesce(i.pb,0)-coalesce(e.pb,0) pb
   FROM dates LEFT JOIN (
    SELECT "Payment Date" d,sum("Partner A Profit") pa,sum("Partner B Profit") pb
    FROM public.olap_repayments_analytics WHERE "Payment Date" BETWEEN p_from AND p_to GROUP BY 1
   ) i USING(d) LEFT JOIN (
    SELECT "Expense Date" d,sum("Partner A Expense"::numeric) pa,sum("Partner B Expense"::numeric) pb
    FROM public."Business Expenses" WHERE "Expense Date" BETWEEN p_from AND p_to GROUP BY 1
   ) e USING(d)''', 1)
a=source.index(' ), saved_accounts AS ('); b=source.index('   ON CONFLICT ("Snapshot Date","Ref Cash Account")',a)
old=source[a:b]
select=old[old.index('   SELECT jsonb_build_array'):]
select=select.replace('::text,d,account,statement_timestamp()', '::text AS "Row ID",d AS "Snapshot Date",account AS "Ref Cash Account",statement_timestamp()',1)
select=select.replace("AT TIME ZONE 'Asia/Bangkok',3,", "AT TIME ZONE 'Asia/Bangkok' AS \"Generated At\",3 AS \"Model Version\",",1)
select=select.replace('    cash_in,cash_out,closing-cash_in+cash_out,closing,n,available,','    cash_in AS "Money In",cash_out AS "Money Out",closing-cash_in+cash_out AS "Opening Balance",closing AS "Closing Balance",n AS "Transaction Count",available AS "Available From",',1)
select=select.replace("ELSE 'Available' END", "ELSE 'Available' END AS \"Balance Status\"",1)
columns='"Row ID","Snapshot Date","Ref Cash Account","Generated At","Model Version","Money In","Money Out","Opening Balance","Closing Balance","Transaction Count","Available From","Balance Status"'
source=source[:a]+' ), computed_accounts AS MATERIALIZED (\n'+select+' ), saved_accounts AS (\n   INSERT INTO public."Cash Account Daily Analytics"('+columns+')\n   SELECT * FROM computed_accounts\n'+source[b:]
source=source.replace('   RETURNING *\n ), cash_positions AS (', '''   WHERE p_accounts IS NULL OR
    (to_jsonb("Cash Account Daily Analytics")-'Generated At') IS DISTINCT FROM (to_jsonb(EXCLUDED)-'Generated At')
   RETURNING *
 ), all_accounts AS (
   SELECT * FROM computed_accounts
   UNION ALL
   SELECT '''+columns+''' FROM public."Cash Account Daily Analytics"
   WHERE p_accounts IS NOT NULL AND NOT ("Ref Cash Account"=ANY(p_accounts)) AND "Snapshot Date" BETWEEN p_from AND p_to
 ), cash_positions AS (''',1)
source=source.replace('FROM saved_accounts GROUP BY 1','FROM all_accounts GROUP BY 1',1)
a=source.index('   CROSS JOIN LATERAL (\n     SELECT coalesce(sum(greatest('); b=source.index('   CROSS JOIN LATERAL (SELECT coalesce(sum(net)',a)
source=source[:a]+'''   CROSS JOIN LATERAL (
    SELECT coalesce(sum(delta),0) pending FROM pending_days WHERE d<=dates.d HAVING p_to-p_from>=3
    UNION ALL
    SELECT coalesce(sum(greatest(coalesce(c."Principal Due"::numeric,0)+coalesce(c."Interest Due"::numeric,0)-coalesce(cp.paid,0),0)),0)
    FROM public."Charges" c LEFT JOIN (SELECT charge,sum(paid) paid FROM charge_payments WHERE d<=dates.d GROUP BY charge) cp
     ON cp.charge=c."Row ID" WHERE c."Charge Date"<=dates.d HAVING p_to-p_from<3
   ) c
'''+source[b:]
source=source.replace('"Cash Balance Status"=EXCLUDED."Cash Balance Status";', '''"Cash Balance Status"=EXCLUDED."Cash Balance Status"
 WHERE p_accounts IS NULL OR
  (to_jsonb("Daily Analytics")-'Generated At') IS DISTINCT FROM (to_jsonb(EXCLUDED)-'Generated At');''',1)
source += '''
-- Existing public/scheduled API keeps its full refresh/freshness contract.
CREATE OR REPLACE FUNCTION public.refresh_daily_analytics(p_from date,p_to date)
RETURNS integer LANGUAGE sql SET search_path=pg_catalog,public SET plan_cache_mode=force_custom_plan AS $$
 SELECT public.refresh_daily_analytics_scoped(p_from,p_to,NULL);
$$;
'''
history=(root/'database/migrations/V63__one_history_refresh_per_source_statement.sql').read_text(encoding='utf-8')
a=history.index('CREATE OR REPLACE FUNCTION public.business_history_refresh()'); b=history.index('CREATE OR REPLACE FUNCTION public.payment_crud_finish()',a)
collector=history[a:b]
collector=collector.replace(' PERFORM public.request_business_history(d);', ''' IF TG_TABLE_NAME='Cash Ledger' THEN
  PERFORM set_config('business_history.accounts',
   (coalesce(nullif(current_setting('business_history.accounts',true),'')::jsonb,'{}'::jsonb) ||
    coalesce((SELECT jsonb_object_agg(k,true) FROM unnest(ARRAY[o->>'Ref From Cash Account',o->>'Ref To Cash Account',n->>'Ref From Cash Account',n->>'Ref To Cash Account']) k WHERE k IS NOT NULL),'{}'::jsonb))::text,true);
 END IF;
 PERFORM public.request_business_history(d);''',1)
a=history.index('CREATE FUNCTION public.flush_business_history()'); b=history.index('\nDO $$',a)
flush=history[a:b].replace('CREATE FUNCTION','CREATE OR REPLACE FUNCTION',1)
flush=flush.replace('DECLARE d date; first_day date; last_day date;', 'DECLARE d date; first_day date; last_day date; accounts text[];',1)
flush=flush.replace(" PERFORM set_config('business_history.from','',true);", """ PERFORM set_config('business_history.from','',true);
 SELECT coalesce(array_agg(k),ARRAY[]::text[]) INTO accounts FROM jsonb_object_keys(coalesce(nullif(current_setting('business_history.accounts',true),'')::jsonb,'{}'::jsonb)) k;
 PERFORM set_config('business_history.accounts','',true);""",1)
flush=flush.replace('public.refresh_daily_analytics(first_day,last_day)','public.refresh_daily_analytics_scoped(first_day,last_day,accounts)',1)
path=root/'database/migrations/V73__scoped_history_and_coalesced_parent_refresh.sql'
parents = '''
-- Transaction-local dirty sets: each deferred callback drains current work once.
-- Later writes (including after SET CONSTRAINTS or a savepoint) mark it again.
CREATE FUNCTION public.r051_queue_parent(kind text, ids text[]) RETURNS void
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 PERFORM set_config('r051_dirty.'||kind,
  (coalesce(nullif(current_setting('r051_dirty.'||kind,true),'')::jsonb,'{}'::jsonb)||
   coalesce((SELECT jsonb_object_agg(k,true) FROM unnest(ids) k WHERE k IS NOT NULL),'{}'::jsonb))::text,true);
END $$;

CREATE FUNCTION public.r051_parent_dirty() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE o jsonb:=CASE WHEN TG_OP='INSERT' THEN '{}'::jsonb ELSE to_jsonb(OLD) END;
 n jsonb:=CASE WHEN TG_OP='DELETE' THEN '{}'::jsonb ELSE to_jsonb(NEW) END;
 borrowers text[]; fields text[];
BEGIN
 fields:=CASE TG_TABLE_NAME
 WHEN 'Loans' THEN ARRAY['Ref Borrowers','Principal Amount','Loan Status','Auto Charge Enabled','Loan Type','Loan Date','Due Date','Current Daily Interest','Daily Payment Amount']
 WHEN 'Repayments' THEN ARRAY['Ref Loans','Ref Charges','Ref Payment','Principal Paid','Interest Paid','Payment Date']
 ELSE ARRAY['Ref Payment','Allocated Amount'] END;
 IF TG_OP='UPDATE' AND NOT EXISTS(SELECT 1 FROM unnest(fields) k WHERE o->k IS DISTINCT FROM n->k) THEN RETURN NULL; END IF;
 IF TG_TABLE_NAME='Repayments' THEN
  PERFORM public.r051_queue_parent('charge',ARRAY[o->>'Ref Charges',n->>'Ref Charges']);
  PERFORM public.r051_queue_parent('loan',ARRAY[o->>'Ref Loans',n->>'Ref Loans']);
 END IF;
 IF TG_TABLE_NAME IN ('Repayments','Payment Allocations') THEN
  PERFORM public.r051_queue_parent('payment',ARRAY[o->>'Ref Payment',n->>'Ref Payment']);
 END IF;
 IF TG_TABLE_NAME='Loans' THEN borrowers:=ARRAY[o->>'Ref Borrowers',n->>'Ref Borrowers'];
 ELSIF TG_TABLE_NAME='Repayments' THEN
  SELECT array_agg("Ref Borrowers") INTO borrowers FROM public."Loans" WHERE "Row ID" IN(o->>'Ref Loans',n->>'Ref Loans');
 END IF;
 IF borrowers IS NOT NULL THEN PERFORM public.r051_queue_parent('borrower',borrowers); END IF;
 RETURN NULL;
END $$;

CREATE FUNCTION public.r051_flush_parents(kind text) RETURNS void
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE dirty jsonb:=coalesce(nullif(current_setting('r051_dirty.'||kind,true),'')::jsonb,'{}'::jsonb); k text;
BEGIN
 IF dirty='{}'::jsonb THEN RETURN; END IF;
 PERFORM set_config('r051_dirty.'||kind,'',true);
 FOR k IN SELECT jsonb_object_keys(dirty) ORDER BY 1 LOOP
  CASE kind
   WHEN 'charge' THEN PERFORM public.vc_refresh_charge(k);
   WHEN 'loan' THEN PERFORM public.vc_refresh_loan(k);
   WHEN 'payment' THEN PERFORM public.vc_refresh_payment(k);
   WHEN 'borrower' THEN PERFORM public.vc_refresh_borrower(k);
   ELSE RAISE EXCEPTION 'Unknown parent refresh kind';
  END CASE;
 END LOOP;
END $$;
CREATE TRIGGER a001_parent_dirty AFTER INSERT OR UPDATE OR DELETE ON public."Loans" FOR EACH ROW EXECUTE FUNCTION public.r051_parent_dirty();
CREATE TRIGGER a001_parent_dirty AFTER INSERT OR UPDATE OR DELETE ON public."Repayments" FOR EACH ROW EXECUTE FUNCTION public.r051_parent_dirty();
CREATE TRIGGER a001_parent_dirty AFTER INSERT OR UPDATE OR DELETE ON public."Payment Allocations" FOR EACH ROW EXECUTE FUNCTION public.r051_parent_dirty();
CREATE OR REPLACE FUNCTION public.vc_repayment_changed() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN PERFORM public.r051_flush_parents('charge'); PERFORM public.r051_flush_parents('loan'); RETURN NULL; END $$;
CREATE OR REPLACE FUNCTION public.vc_payment_changed() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN PERFORM public.r051_flush_parents('payment'); RETURN NULL; END $$;
CREATE OR REPLACE FUNCTION public.vc_borrower_changed() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN PERFORM public.r051_flush_parents('borrower'); RETURN NULL; END $$;
'''
assert not path.exists(), 'Never overwrite an existing migration; preserve immutable applied bytes'
path.write_text('-- R051: synchronous trigger performance; no source backfill, new tables or columns.\n'+source+'\n'+collector+'\n'+flush+'\n'+parents,encoding='utf-8')
print(path.name)
