-- R051: synchronous trigger performance; no source backfill, new tables or columns.
CREATE OR REPLACE FUNCTION public.refresh_daily_analytics_scoped(p_from date,p_to date,p_accounts text[])
RETURNS integer LANGUAGE plpgsql SET search_path=pg_catalog,public SET plan_cache_mode=force_custom_plan AS $$
DECLARE refreshed_days integer;
BEGIN
 IF p_from IS NULL OR p_to IS NULL OR p_from>p_to
    OR p_to>(statement_timestamp() AT TIME ZONE 'Asia/Bangkok')::date THEN
   RAISE EXCEPTION 'Analytics requires a valid date range ending no later than Bangkok today';
 END IF;
 IF NOT pg_try_advisory_xact_lock(7112026,7) THEN
   RAISE EXCEPTION 'Analytics refresh is busy; sync and retry';
 END IF;
 -- Missing account snapshots require a full rebuild of account coverage.
 IF p_accounts IS NOT NULL AND EXISTS (
  SELECT 1 FROM public."Cash Accounts" a CROSS JOIN generate_series(0,p_to-p_from) d
  WHERE NOT EXISTS(SELECT 1 FROM public."Cash Account Daily Analytics" s
   WHERE s."Ref Cash Account"=a."Row ID" AND s."Snapshot Date"=p_from+d)
 ) THEN p_accounts:=NULL; END IF;
 -- One statement provides one consistent source snapshot for every requested date.
 -- Model 3 corrects partially paid pending charges. Existing gross/net profit semantics
 -- remain compatible; new per-role inputs retain the governed rounded allocation rules.
 WITH dates AS (
   SELECT p_from+i AS d FROM generate_series(0,p_to-p_from) i
 ), contributions AS MATERIALIZED (
   SELECT c."Contribution Date" AS d,p."Partner Role" AS role,
     CASE WHEN c."Transaction Type"='Contribution' THEN c."Amount"::numeric
       ELSE -c."Amount"::numeric END AS net
   FROM public."Cash Pool Contributions" c
   LEFT JOIN public."Partners" p ON p."Row ID"=c."Ref Partner"
 ), repayment_days AS MATERIALIZED (
   SELECT "Payment Date" AS d,sum("Principal Paid"::numeric) AS principal,
     sum("Interest Paid"::numeric) AS interest,count(*) AS repayments
   FROM public."Repayments" GROUP BY "Payment Date"
 ), profit_days AS MATERIALIZED (
   SELECT r.d,CASE WHEN c.pool>0 THEN r.interest*coalesce(c.ab,0)/c.pool ELSE 0 END AS profit
   FROM repayment_days r CROSS JOIN LATERAL (
     SELECT sum(net) AS pool,sum(net) FILTER(WHERE role IN ('A','B')) AS ab
     FROM contributions WHERE d<=r.d
   ) c
 ), charge_payments AS MATERIALIZED (
   SELECT "Ref Charges" charge,"Payment Date" d,
    sum(coalesce("Principal Paid"::numeric,0)+coalesce("Interest Paid"::numeric,0)) paid
   FROM public."Repayments" WHERE "Payment Date"<=p_to GROUP BY 1,2
 ), charge_events AS MATERIALIZED (
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
 ), expenses AS MATERIALIZED (
   SELECT "Expense Date" d,sum("Amount"::numeric) expense FROM public."Business Expenses" GROUP BY 1
 ), partner_income AS MATERIALIZED (
   -- Keep the governed per-repayment rounded allocation, but filter its inputs
   -- before aggregation instead of evaluating the all-history running report.
   SELECT dates.d,coalesce(i.pa,0)-coalesce(e.pa,0) pa,coalesce(i.pb,0)-coalesce(e.pb,0) pb
   FROM dates LEFT JOIN (
    SELECT "Payment Date" d,sum("Partner A Profit") pa,sum("Partner B Profit") pb
    FROM public.olap_repayments_analytics WHERE "Payment Date" BETWEEN p_from AND p_to GROUP BY 1
   ) i USING(d) LEFT JOIN (
    SELECT "Expense Date" d,sum("Partner A Expense"::numeric) pa,sum("Partner B Expense"::numeric) pb
    FROM public."Business Expenses" WHERE "Expense Date" BETWEEN p_from AND p_to GROUP BY 1
   ) e USING(d)
 ), settlements AS MATERIALIZED (
   SELECT s."Transfer Date" d,sum(s."Amount"::numeric) amount,
    coalesce(sum(s."Amount"::numeric) FILTER(WHERE p."Partner Role"='A'),0) pa,
    coalesce(sum(s."Amount"::numeric) FILTER(WHERE p."Partner Role"='B'),0) pb
   FROM public."Settlements" s LEFT JOIN public."Partners" p ON p."Row ID"=s."Ref Partner"
   WHERE s."Status"='Completed' AND s."Transfer Date"<=p_to GROUP BY 1
 ), ledger AS MATERIALIZED (
   SELECT "Movement Date" d,"Ref From Cash Account" from_account,"Ref To Cash Account" to_account,"Amount" amount
   FROM public."Cash Ledger" WHERE "Movement Date"<=p_to
 ), account_flows AS MATERIALIZED (
   SELECT account,d,sum(greatest(signed,0)) cash_in,sum(greatest(-signed,0)) cash_out,count(*) n
   FROM ledger CROSS JOIN LATERAL (VALUES (from_account,-amount),(to_account,amount)) v(account,signed)
   WHERE account IS NOT NULL GROUP BY 1,2
 ), consolidated_flows AS MATERIALIZED (
   SELECT d,sum(greatest(signed,0)) cash_in,sum(greatest(-signed,0)) cash_out
   FROM (SELECT d,(CASE WHEN to_account IS NOT NULL THEN amount ELSE 0 END)
    -(CASE WHEN from_account IS NOT NULL THEN amount ELSE 0 END) signed FROM ledger) v GROUP BY 1
 ), account_seed AS MATERIALIZED (
   SELECT a."Row ID" account,(c."Cutover At" AT TIME ZONE 'Asia/Bangkok')::date available,
    c."Opening Balance"-c."Baseline Cash In"+c."Baseline Cash Out"
     +coalesce(sum(f.cash_in-f.cash_out),0) opening
   FROM public."Cash Accounts" a LEFT JOIN public.r008_cash_account_cutover c ON c."Ref Cash Account"=a."Row ID"
   LEFT JOIN account_flows f ON f.account=a."Row ID" AND f.d<p_from
   WHERE p_accounts IS NULL OR a."Row ID"=ANY(p_accounts)
   GROUP BY a."Row ID",c."Cutover At",c."Opening Balance",c."Baseline Cash In",c."Baseline Cash Out"
 ), account_grid AS (
   SELECT a.*,d.d,coalesce(f.cash_in,0) cash_in,coalesce(f.cash_out,0) cash_out,coalesce(f.n,0) n
   FROM account_seed a CROSS JOIN dates d LEFT JOIN account_flows f ON f.account=a.account AND f.d=d.d
 ), account_positions AS (
   SELECT *,CASE WHEN d>=available THEN opening+sum(cash_in-cash_out) OVER
    (PARTITION BY account ORDER BY d ROWS UNBOUNDED PRECEDING) END closing FROM account_grid
 ), computed_accounts AS MATERIALIZED (
   SELECT jsonb_build_array(account,d)::text AS "Row ID",d AS "Snapshot Date",account AS "Ref Cash Account",statement_timestamp() AT TIME ZONE 'Asia/Bangkok' AS "Generated At",3 AS "Model Version",
    cash_in AS "Money In",cash_out AS "Money Out",closing-cash_in+cash_out AS "Opening Balance",closing AS "Closing Balance",n AS "Transaction Count",available AS "Available From",
    CASE WHEN available IS NULL THEN 'Opening not initialized' WHEN d<available THEN 'Before known opening' ELSE 'Available' END AS "Balance Status"
   FROM account_positions
 ), saved_accounts AS (
   INSERT INTO public."Cash Account Daily Analytics"("Row ID","Snapshot Date","Ref Cash Account","Generated At","Model Version","Money In","Money Out","Opening Balance","Closing Balance","Transaction Count","Available From","Balance Status")
   SELECT * FROM computed_accounts
   ON CONFLICT ("Snapshot Date","Ref Cash Account") DO UPDATE SET
    "Generated At"=EXCLUDED."Generated At","Model Version"=EXCLUDED."Model Version",
    "Money In"=EXCLUDED."Money In","Money Out"=EXCLUDED."Money Out",
    "Opening Balance"=EXCLUDED."Opening Balance","Closing Balance"=EXCLUDED."Closing Balance",
    "Transaction Count"=EXCLUDED."Transaction Count","Available From"=EXCLUDED."Available From","Balance Status"=EXCLUDED."Balance Status"
   WHERE p_accounts IS NULL OR
    (to_jsonb("Cash Account Daily Analytics")-'Generated At') IS DISTINCT FROM (to_jsonb(EXCLUDED)-'Generated At')
   RETURNING *
 ), all_accounts AS (
   SELECT * FROM computed_accounts
   UNION ALL
   SELECT "Row ID","Snapshot Date","Ref Cash Account","Generated At","Model Version","Money In","Money Out","Opening Balance","Closing Balance","Transaction Count","Available From","Balance Status" FROM public."Cash Account Daily Analytics"
   WHERE p_accounts IS NOT NULL AND NOT ("Ref Cash Account"=ANY(p_accounts)) AND "Snapshot Date" BETWEEN p_from AND p_to
 ), cash_positions AS (
   SELECT "Snapshot Date" d,
    CASE WHEN bool_and("Closing Balance" IS NOT NULL) THEN sum("Closing Balance") END closing,
    CASE WHEN bool_and("Opening Balance" IS NOT NULL) THEN sum("Opening Balance") END opening,
    CASE WHEN bool_and("Available From" IS NOT NULL) THEN max("Available From") END available,
    CASE WHEN bool_and("Closing Balance" IS NOT NULL) THEN 'Available'
     WHEN bool_and("Available From" IS NOT NULL) THEN 'Before known opening' ELSE 'Opening not initialized' END status
   FROM all_accounts GROUP BY 1
 ), metrics AS (
   SELECT dates.d,l.issued,l.loans,l.issued_eod,l.active,l.borrowers,
     r.principal,r.interest,r.repayments,r.returned_eod,c.pending,p.pool,
     coalesce((SELECT sum(profit) FROM profit_days WHERE d<=dates.d),0)
       -coalesce((SELECT sum("Amount"::numeric) FROM public."Settlements"
          WHERE "Status"='Completed' AND "Transfer Date"<=dates.d),0) AS unsettled
   FROM dates
   CROSS JOIN LATERAL (
     SELECT coalesce(sum("Principal Amount"::numeric) FILTER(WHERE "Loan Date"=dates.d),0) AS issued,
       count(*) FILTER(WHERE "Loan Date"=dates.d) AS loans,
       coalesce(sum("Principal Amount"::numeric),0) AS issued_eod,
       count(*) FILTER(WHERE "Close Date" IS NULL OR "Close Date">dates.d) AS active,
       count(DISTINCT coalesce("Ref Borrowers",'')) FILTER(WHERE "Close Date" IS NULL OR "Close Date">dates.d) AS borrowers
     FROM public."Loans" WHERE "Loan Date"<=dates.d
   ) l
   CROSS JOIN LATERAL (
     SELECT coalesce(sum(principal) FILTER(WHERE d=dates.d),0) AS principal,
       coalesce(sum(interest) FILTER(WHERE d=dates.d),0) AS interest,
       coalesce(sum(repayments) FILTER(WHERE d=dates.d),0) AS repayments,
       coalesce(sum(principal),0) AS returned_eod
     FROM repayment_days WHERE d<=dates.d
   ) r
   CROSS JOIN LATERAL (
    SELECT coalesce(sum(delta),0) pending FROM pending_days WHERE d<=dates.d HAVING p_to-p_from>=3
    UNION ALL
    SELECT coalesce(sum(greatest(coalesce(c."Principal Due"::numeric,0)+coalesce(c."Interest Due"::numeric,0)-coalesce(cp.paid,0),0)),0)
    FROM public."Charges" c LEFT JOIN (SELECT charge,sum(paid) paid FROM charge_payments WHERE d<=dates.d GROUP BY charge) cp
     ON cp.charge=c."Row ID" WHERE c."Charge Date"<=dates.d HAVING p_to-p_from<3
   ) c
   CROSS JOIN LATERAL (SELECT coalesce(sum(net),0) AS pool FROM contributions WHERE d<=dates.d) p
 )
 INSERT INTO public."Daily Analytics"("Row ID","Snapshot Date","Generated At","Model Version",
   "Principal Issued","Loans Issued","Principal Returned","Interest Received","Repayments Count",
   "Outstanding Principal EOD","Active Loans EOD","Active Borrowers EOD","Pending Charges EOD",
   "Total Cash Pool EOD","Available Cash EOD","Unsettled Profit EOD","Business Expenses","Net Profit","Net Unsettled Profit EOD",
   "Capital Contributed","Capital Withdrawn","Partner Settlements","Partner A Net Profit","Partner B Net Profit","Partner A Settlements","Partner B Settlements","Cash Money In","Cash Money Out","Cash Opening Balance","Cash Balance EOD","Cash Available From","Cash Balance Status")
 SELECT 'da11:'||metrics.d::text,metrics.d,statement_timestamp() AT TIME ZONE 'Asia/Bangkok',3,
   issued::money,loans::integer,principal::money,interest::money,repayments::integer,
   (issued_eod-returned_eod)::money,active::integer,borrowers::integer,pending::money,
   pool::money,(pool+returned_eod-issued_eod)::money,unsettled::money,
   coalesce((SELECT sum("Amount") FROM public."Business Expenses" WHERE "Expense Date"=metrics.d),0::money),
   interest::money-coalesce((SELECT sum("Amount") FROM public."Business Expenses" WHERE "Expense Date"=metrics.d),0::money),
   unsettled::money-coalesce((SELECT sum("Amount") FROM public."Business Expenses" WHERE "Expense Date"<=metrics.d),0::money)
 ,coalesce((SELECT sum("Amount"::numeric) FROM public."Cash Pool Contributions" WHERE "Contribution Date"=metrics.d AND "Transaction Type"='Contribution'),0)
 ,coalesce((SELECT sum("Amount"::numeric) FROM public."Cash Pool Contributions" WHERE "Contribution Date"=metrics.d AND "Transaction Type" IS DISTINCT FROM 'Contribution'),0)
 ,coalesce(s.amount,0),coalesce(pi.pa,0),coalesce(pi.pb,0),coalesce(s.pa,0),coalesce(s.pb,0)
 ,coalesce(cf.cash_in,0),coalesce(cf.cash_out,0),cp.opening,cp.closing,cp.available,coalesce(cp.status,'Opening not initialized')
 FROM metrics LEFT JOIN settlements s ON s.d=metrics.d LEFT JOIN partner_income pi ON pi.d=metrics.d
 LEFT JOIN consolidated_flows cf ON cf.d=metrics.d LEFT JOIN cash_positions cp ON cp.d=metrics.d
 ORDER BY metrics.d
 ON CONFLICT ("Snapshot Date") DO UPDATE SET
   "Generated At"=EXCLUDED."Generated At","Model Version"=EXCLUDED."Model Version",
   "Principal Issued"=EXCLUDED."Principal Issued","Loans Issued"=EXCLUDED."Loans Issued",
   "Principal Returned"=EXCLUDED."Principal Returned","Interest Received"=EXCLUDED."Interest Received",
   "Repayments Count"=EXCLUDED."Repayments Count","Outstanding Principal EOD"=EXCLUDED."Outstanding Principal EOD",
   "Active Loans EOD"=EXCLUDED."Active Loans EOD","Active Borrowers EOD"=EXCLUDED."Active Borrowers EOD",
   "Pending Charges EOD"=EXCLUDED."Pending Charges EOD","Total Cash Pool EOD"=EXCLUDED."Total Cash Pool EOD",
   "Available Cash EOD"=EXCLUDED."Available Cash EOD","Unsettled Profit EOD"=EXCLUDED."Unsettled Profit EOD",
   "Business Expenses"=EXCLUDED."Business Expenses","Net Profit"=EXCLUDED."Net Profit",
   "Net Unsettled Profit EOD"=EXCLUDED."Net Unsettled Profit EOD",
   "Capital Contributed"=EXCLUDED."Capital Contributed",
   "Capital Withdrawn"=EXCLUDED."Capital Withdrawn",
   "Partner Settlements"=EXCLUDED."Partner Settlements",
   "Partner A Net Profit"=EXCLUDED."Partner A Net Profit",
   "Partner B Net Profit"=EXCLUDED."Partner B Net Profit",
   "Partner A Settlements"=EXCLUDED."Partner A Settlements",
   "Partner B Settlements"=EXCLUDED."Partner B Settlements",
   "Cash Money In"=EXCLUDED."Cash Money In",
   "Cash Money Out"=EXCLUDED."Cash Money Out",
   "Cash Opening Balance"=EXCLUDED."Cash Opening Balance",
   "Cash Balance EOD"=EXCLUDED."Cash Balance EOD",
   "Cash Available From"=EXCLUDED."Cash Available From",
   "Cash Balance Status"=EXCLUDED."Cash Balance Status"
 WHERE p_accounts IS NULL OR
  (to_jsonb("Daily Analytics")-'Generated At') IS DISTINCT FROM (to_jsonb(EXCLUDED)-'Generated At');
 GET DIAGNOSTICS refreshed_days=ROW_COUNT;
 RETURN refreshed_days;
END $$;

-- Existing public/scheduled API keeps its full refresh/freshness contract.
CREATE OR REPLACE FUNCTION public.refresh_daily_analytics(p_from date,p_to date)
RETURNS integer LANGUAGE sql SET search_path=pg_catalog,public SET plan_cache_mode=force_custom_plan AS $$
 SELECT public.refresh_daily_analytics_scoped(p_from,p_to,NULL);
$$;

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
 IF TG_TABLE_NAME='Cash Ledger' THEN
  PERFORM set_config('business_history.accounts',
   (coalesce(nullif(current_setting('business_history.accounts',true),'')::jsonb,'{}'::jsonb) ||
    coalesce((SELECT jsonb_object_agg(k,true) FROM unnest(ARRAY[o->>'Ref From Cash Account',o->>'Ref To Cash Account',n->>'Ref From Cash Account',n->>'Ref To Cash Account']) k WHERE k IS NOT NULL),'{}'::jsonb))::text,true);
 END IF;
 PERFORM public.request_business_history(d);
 RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.flush_business_history() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE d date; first_day date; last_day date; accounts text[];
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
 SELECT coalesce(array_agg(k),ARRAY[]::text[]) INTO accounts FROM jsonb_object_keys(coalesce(nullif(current_setting('business_history.accounts',true),'')::jsonb,'{}'::jsonb)) k;
 PERFORM set_config('business_history.accounts','',true);
 SELECT min(snapshot_day),max(snapshot_day) INTO first_day,last_day FROM (
  SELECT "Snapshot Date" snapshot_day FROM public."Daily Analytics" WHERE "Snapshot Date">=d
  UNION ALL SELECT "Snapshot Date" FROM public."Cash Account Daily Analytics" WHERE "Snapshot Date">=d) snapshots;
 IF first_day IS NOT NULL THEN PERFORM public.refresh_daily_analytics_scoped(first_day,last_day,accounts); END IF;
 RETURN NULL;
END $$;


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
