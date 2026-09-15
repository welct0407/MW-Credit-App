-- Owner-approved hidden command. OLAP owns writes; OLTP only consumes Statistics.
ALTER TABLE public."Statistics" ADD COLUMN "Analytics Refresh Request" text;
COMMENT ON COLUMN public."Statistics"."Analytics Refresh Request" IS
 'OLAP command: Bangkok request-date|Recent or Full|unique token. SQL refreshes daily snapshots atomically; not a financial ledger.';

-- Preserve the existing daily grain. Fail on duplicate dates rather than discard history.
CREATE UNIQUE INDEX daily_analytics_snapshot_date_unique
 ON public."Daily Analytics"("Snapshot Date");

CREATE FUNCTION public.refresh_daily_analytics(p_from date,p_to date)
RETURNS integer LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE n integer;
BEGIN
 IF p_from IS NULL OR p_to IS NULL OR p_from>p_to
    OR p_to>(statement_timestamp() AT TIME ZONE 'Asia/Bangkok')::date THEN
   RAISE EXCEPTION 'Analytics requires a valid date range ending no later than Bangkok today';
 END IF;
 IF NOT pg_try_advisory_xact_lock(7112026,7) THEN
   RAISE EXCEPTION 'Analytics refresh is busy; sync and retry';
 END IF;
 -- One statement provides one consistent source snapshot for every requested date.
 -- Model 2 semantics are retained, including first-payment pending-charge rules,
 -- posted repayment components (also negative default interest), and role A/B profit.
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
 ), first_payments AS MATERIALIZED (
   SELECT "Ref Charges" AS charge,min("Payment Date") AS first_date
   FROM public."Repayments" GROUP BY "Ref Charges"
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
     SELECT coalesce(sum(coalesce(c."Principal Due"::numeric,0)+coalesce(c."Interest Due"::numeric,0)),0) AS pending
     FROM public."Charges" c LEFT JOIN first_payments f ON f.charge=c."Row ID"
     WHERE c."Charge Date"<=dates.d AND (f.first_date IS NULL OR f.first_date>dates.d)
   ) c
   CROSS JOIN LATERAL (SELECT coalesce(sum(net),0) AS pool FROM contributions WHERE d<=dates.d) p
 )
 INSERT INTO public."Daily Analytics"("Row ID","Snapshot Date","Generated At","Model Version",
   "Principal Issued","Loans Issued","Principal Returned","Interest Received","Repayments Count",
   "Outstanding Principal EOD","Active Loans EOD","Active Borrowers EOD","Pending Charges EOD",
   "Total Cash Pool EOD","Available Cash EOD","Unsettled Profit EOD")
 SELECT 'da11:'||d::text,d,statement_timestamp() AT TIME ZONE 'Asia/Bangkok',2,
   issued::money,loans::integer,principal::money,interest::money,repayments::integer,
   (issued_eod-returned_eod)::money,active::integer,borrowers::integer,pending::money,
   pool::money,(pool+returned_eod-issued_eod)::money,unsettled::money
 FROM metrics ORDER BY d
 ON CONFLICT ("Snapshot Date") DO UPDATE SET
   "Generated At"=EXCLUDED."Generated At","Model Version"=EXCLUDED."Model Version",
   "Principal Issued"=EXCLUDED."Principal Issued","Loans Issued"=EXCLUDED."Loans Issued",
   "Principal Returned"=EXCLUDED."Principal Returned","Interest Received"=EXCLUDED."Interest Received",
   "Repayments Count"=EXCLUDED."Repayments Count","Outstanding Principal EOD"=EXCLUDED."Outstanding Principal EOD",
   "Active Loans EOD"=EXCLUDED."Active Loans EOD","Active Borrowers EOD"=EXCLUDED."Active Borrowers EOD",
   "Pending Charges EOD"=EXCLUDED."Pending Charges EOD","Total Cash Pool EOD"=EXCLUDED."Total Cash Pool EOD",
   "Available Cash EOD"=EXCLUDED."Available Cash EOD","Unsettled Profit EOD"=EXCLUDED."Unsettled Profit EOD";
 GET DIAGNOSTICS n=ROW_COUNT;
 RETURN n;
END $$;

CREATE FUNCTION public.analytics_refresh_request()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE parts text[]; today date:=(statement_timestamp() AT TIME ZONE 'Asia/Bangkok')::date; first_date date;
BEGIN
 IF TG_OP='UPDATE' AND NEW."Analytics Refresh Request" IS NOT DISTINCT FROM OLD."Analytics Refresh Request" THEN RETURN NEW; END IF;
 IF NEW."Analytics Refresh Request" IS NULL THEN RETURN NEW; END IF;
 parts:=string_to_array(NEW."Analytics Refresh Request",'|');
 IF cardinality(parts)<>3 OR parts[1]<>today::text OR parts[2] NOT IN ('Recent','Full')
    OR coalesce(parts[3],'')='' THEN
   RAISE EXCEPTION 'Analytics refresh requires Bangkok today, Recent or Full, and a unique token';
 END IF;
 SELECT min("Loan Date") INTO first_date FROM public."Loans" WHERE "Loan Date"<=today;
 IF first_date IS NULL THEN RETURN NEW; END IF;
 IF parts[2]='Recent' THEN first_date:=greatest(first_date,today-1); END IF;
 PERFORM public.refresh_daily_analytics(first_date,today);
 RETURN NEW;
END $$;
CREATE TRIGGER analytics_refresh_request AFTER INSERT OR UPDATE OF "Analytics Refresh Request"
 ON public."Statistics" FOR EACH ROW EXECUTE FUNCTION public.analytics_refresh_request();
