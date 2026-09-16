-- DEV-first expense ledger. No historical referral backfill; gross ledgers unchanged.
ALTER TABLE public."Borrowers" ADD COLUMN "Ref Referrer" text
 REFERENCES public."Borrowers"("Row ID");
ALTER TABLE public."Borrowers" ADD CONSTRAINT borrower_not_own_referrer
 CHECK ("Ref Referrer" IS DISTINCT FROM "Row ID");
CREATE INDEX borrowers_referrer_idx ON public."Borrowers"("Ref Referrer");
CREATE TRIGGER appsheet_referrer_blank BEFORE INSERT OR UPDATE ON public."Borrowers"
 FOR EACH ROW EXECUTE FUNCTION public.appsheet_normalize_blank_refs('Ref Referrer');

CREATE TABLE public."Business Expenses" (
 "Row ID" text PRIMARY KEY,
 "Expense Date" date NOT NULL,
 "Expense Category" text NOT NULL CHECK (btrim("Expense Category")<>''),
 "Amount" money NOT NULL CHECK ("Amount"::numeric<>0 AND "Amount"::numeric=round("Amount"::numeric)),
 "Payee Name" text,
 "Ref Payee Borrower" text REFERENCES public."Borrowers"("Row ID"),
 "Ref Related Borrower" text REFERENCES public."Borrowers"("Row ID"),
 "Ref Related Loan" text REFERENCES public."Loans"("Row ID"),
 "Notes" text,
 "Source Type" text NOT NULL DEFAULT 'Manual' CHECK ("Source Type" IN ('Manual','Referral Rebate')),
 "Source Key" text,
 "Gross Profit Basis" money,
 "Allocation Basis" text NOT NULL,
 "Partner A Share" numeric NOT NULL,
 "Partner B Share" numeric NOT NULL,
 "Partner A Expense" money NOT NULL,
 "Partner B Expense" money NOT NULL,
 "Rule Version" text,
 "Created At" timestamp without time zone NOT NULL DEFAULT (statement_timestamp() AT TIME ZONE 'Asia/Bangkok'),
 "Created By" text NOT NULL DEFAULT 'SQL',
 CHECK ("Partner A Expense"+"Partner B Expense"="Amount"),
 CHECK ("Partner A Share"+"Partner B Share"=1),
 CHECK ("Source Type"<>'Referral Rebate' OR ("Amount"::numeric>0 AND "Ref Related Loan" IS NOT NULL
   AND "Ref Related Borrower" IS NOT NULL AND "Ref Payee Borrower" IS NOT NULL
   AND "Source Key"='REFERRAL_REBATE:'||"Ref Related Loan" AND "Rule Version"='REFERRAL_REBATE_V1'))
);
CREATE UNIQUE INDEX business_expense_source_unique ON public."Business Expenses"("Source Key")
 WHERE nullif(btrim("Source Key"),'') IS NOT NULL;
CREATE INDEX business_expense_date_idx ON public."Business Expenses"("Expense Date");
CREATE INDEX business_expense_loan_idx ON public."Business Expenses"("Ref Related Loan");
CREATE INDEX business_expense_payee_idx ON public."Business Expenses"("Ref Payee Borrower");
CREATE TRIGGER appsheet_blank_refs BEFORE INSERT OR UPDATE ON public."Business Expenses"
 FOR EACH ROW EXECUTE FUNCTION public.appsheet_normalize_blank_refs('Ref Payee Borrower','Ref Related Borrower','Ref Related Loan');

-- Serialize contribution corrections, allocations and settlement reservations. Fail promptly
-- rather than introduce a lock-order deadlock with the existing borrower payment locks.
CREATE FUNCTION public.expense_allocation_lock() RETURNS trigger
 LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF NOT pg_try_advisory_xact_lock(9152026,15) THEN
   RAISE EXCEPTION 'Partner allocation is busy; sync and retry';
 END IF;
 RETURN NULL;
END $$;
CREATE TRIGGER expense_allocation_lock BEFORE INSERT OR UPDATE OR DELETE ON public."Business Expenses"
 FOR EACH STATEMENT EXECUTE FUNCTION public.expense_allocation_lock();
CREATE TRIGGER expense_allocation_lock BEFORE INSERT OR UPDATE OR DELETE ON public."Cash Pool Contributions"
 FOR EACH STATEMENT EXECUTE FUNCTION public.expense_allocation_lock();
CREATE TRIGGER expense_allocation_lock BEFORE INSERT OR UPDATE OR DELETE ON public."Partners"
 FOR EACH STATEMENT EXECUTE FUNCTION public.expense_allocation_lock();
CREATE TRIGGER expense_allocation_lock BEFORE INSERT OR UPDATE OR DELETE ON public."Settlements"
 FOR EACH STATEMENT EXECUTE FUNCTION public.expense_allocation_lock();

CREATE FUNCTION public.partner_pool_share_at_date(p_date date,p_role text) RETURNS numeric
 LANGUAGE plpgsql STABLE SET search_path=pg_catalog,public AS $$
DECLARE pool numeric; a numeric; b numeric; unknown_count integer;
BEGIN
 SELECT sum(n),coalesce(sum(n) FILTER(WHERE role='A'),0),coalesce(sum(n) FILTER(WHERE role='B'),0),
   count(*) FILTER(WHERE role IS NULL OR role NOT IN ('A','B'))
 INTO pool,a,b,unknown_count FROM (
 SELECT CASE WHEN c."Transaction Type"='Contribution' THEN c."Amount"::numeric ELSE -c."Amount"::numeric END n,
 p."Partner Role" role FROM public."Cash Pool Contributions" c
 LEFT JOIN public."Partners" p ON p."Row ID"=c."Ref Partner" WHERE c."Contribution Date"<=p_date) s;
 IF p_date IS NULL OR coalesce(pool,0)<=0 OR unknown_count>0 OR a<0 OR b<0 OR p_role NOT IN ('A','B') THEN
   RAISE EXCEPTION 'Expense allocation requires a positive A/B contribution pool on its allocation date';
 END IF;
 RETURN CASE WHEN p_role='A' THEN a/pool ELSE 1-a/pool END;
END $$;

CREATE FUNCTION public.calculate_business_expense() RETURNS trigger
 LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE allocation_date date;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Expenses are retained; record a documented manual adjustment instead'; END IF;
 IF TG_OP='UPDATE' THEN
   IF NEW."Row ID" IS DISTINCT FROM OLD."Row ID" OR NEW."Source Type" IS DISTINCT FROM OLD."Source Type"
     OR NEW."Created At" IS DISTINCT FROM OLD."Created At" OR NEW."Created By" IS DISTINCT FROM OLD."Created By" THEN
     RAISE EXCEPTION 'Expense identity, source and creation audit are immutable';
   END IF;
   IF OLD."Source Type"='Referral Rebate' AND
     (to_jsonb(NEW)-ARRAY['Partner A Share','Partner B Share','Partner A Expense','Partner B Expense','Allocation Basis'])
       IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['Partner A Share','Partner B Share','Partner A Expense','Partner B Expense','Allocation Basis']) THEN
     RAISE EXCEPTION 'Automatic referral expenses are system-managed';
   END IF;
 END IF;
 IF NEW."Source Type"='Referral Rebate' THEN
   IF TG_OP='INSERT' AND pg_trigger_depth()<2 THEN RAISE EXCEPTION 'Referral expenses require a qualifying loan-close event'; END IF;
   SELECT "Close Date" INTO allocation_date FROM public."Loans" WHERE "Row ID"=NEW."Ref Related Loan";
   IF allocation_date IS NULL THEN RAISE EXCEPTION 'Referral allocation requires a loan closing date'; END IF;
   NEW."Allocation Basis":='Closing Date Contribution Ratio';
 ELSE
   IF nullif(btrim(NEW."Source Key"),'') IS NOT NULL OR NEW."Gross Profit Basis" IS NOT NULL OR NEW."Rule Version" IS NOT NULL THEN
     RAISE EXCEPTION 'Manual expense cannot supply automated source fields';
   END IF;
   IF NEW."Amount"::numeric<0 AND nullif(btrim(NEW."Notes"),'') IS NULL THEN
     RAISE EXCEPTION 'A negative manual adjustment requires an explanatory note';
   END IF;
   allocation_date:=NEW."Expense Date";
   NEW."Allocation Basis":='Expense Date Contribution Ratio';
 END IF;
 IF NEW."Ref Related Loan" IS NOT NULL AND NEW."Ref Related Borrower" IS NOT NULL AND
   NOT EXISTS(SELECT 1 FROM public."Loans" WHERE "Row ID"=NEW."Ref Related Loan" AND "Ref Borrowers"=NEW."Ref Related Borrower") THEN
   RAISE EXCEPTION 'Related loan does not belong to related borrower';
 END IF;
 NEW."Partner A Share":=public.partner_pool_share_at_date(allocation_date,'A');
 NEW."Partner B Share":=1-NEW."Partner A Share";
 NEW."Partner A Expense":=round(NEW."Amount"::numeric*NEW."Partner A Share")::money;
 NEW."Partner B Expense":=NEW."Amount"-NEW."Partner A Expense";
 RETURN NEW;
END $$;
CREATE TRIGGER calculate_business_expense BEFORE INSERT OR UPDATE OR DELETE ON public."Business Expenses"
 FOR EACH ROW EXECUTE FUNCTION public.calculate_business_expense();

CREATE FUNCTION public.recalculate_business_expenses_from_date(p_date date) RETURNS void
 LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 UPDATE public."Business Expenses" e SET "Amount"=e."Amount"
 WHERE CASE WHEN e."Source Type"='Referral Rebate' THEN
   (SELECT "Close Date" FROM public."Loans" WHERE "Row ID"=e."Ref Related Loan") ELSE e."Expense Date" END>=p_date;
END $$;
CREATE FUNCTION public.expense_contribution_changed() RETURNS trigger
 LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE first_date date;
BEGIN
 IF TG_TABLE_NAME='Partners' THEN
   IF TG_OP='UPDATE' AND NEW."Partner Role" IS NOT DISTINCT FROM OLD."Partner Role" THEN RETURN NULL; END IF;
   first_date:='0001-01-01';
 ELSE
   IF TG_OP='INSERT' THEN first_date:=NEW."Contribution Date";
   ELSIF TG_OP='DELETE' THEN first_date:=OLD."Contribution Date";
   ELSE first_date:=least(OLD."Contribution Date",NEW."Contribution Date"); END IF;
 END IF;
 PERFORM public.recalculate_business_expenses_from_date(first_date);
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER expense_contribution_changed AFTER INSERT OR UPDATE OR DELETE ON public."Cash Pool Contributions"
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.expense_contribution_changed();
CREATE CONSTRAINT TRIGGER expense_partner_changed AFTER INSERT OR UPDATE OR DELETE ON public."Partners"
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.expense_contribution_changed();

CREATE FUNCTION public.create_referral_rebate(p_loan text) RETURNS void
 LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE l public."Loans"%ROWTYPE; referrer text; payee text; principal numeric; profit numeric; rebate numeric;
BEGIN
 IF pg_trigger_depth()<1 THEN RAISE EXCEPTION 'Referral creation is only supported by loan-close trigger'; END IF;
 SELECT * INTO l FROM public."Loans" WHERE "Row ID"=p_loan FOR UPDATE;
 IF l."Loan Status" IS DISTINCT FROM 'ปิดยอดแล้ว' OR coalesce(l."Defaulted",false)
   OR l."Close Date" IS NULL OR l."Ref Closing Payment" IS NULL THEN RETURN; END IF;
 IF EXISTS(SELECT 1 FROM public."Business Expenses" WHERE "Source Key"='REFERRAL_REBATE:'||p_loan) THEN RETURN; END IF;
 IF NOT EXISTS(SELECT 1 FROM public."Payments" WHERE "Row ID"=l."Ref Closing Payment" AND "Status"='Posted' AND "Amount Received"::numeric>0) THEN RETURN; END IF;
 SELECT sum("Principal Paid"::numeric),sum("Interest Paid"::numeric) INTO principal,profit
 FROM public."Repayments" WHERE "Ref Loans"=p_loan;
 IF coalesce(principal,0)<l."Principal Amount"::numeric OR coalesce(profit,0)<=0 THEN RETURN; END IF;
 SELECT "Ref Referrer" INTO referrer FROM public."Borrowers" WHERE "Row ID"=l."Ref Borrowers";
 IF referrer IS NULL THEN RETURN; END IF;
 SELECT "Borrower Name" INTO payee FROM public."Borrowers" WHERE "Row ID"=referrer;
 rebate:=least(round(profit*0.10),1000);
 IF rebate<=0 THEN RETURN; END IF;
 INSERT INTO public."Business Expenses"("Row ID","Expense Date","Expense Category","Amount","Payee Name",
  "Ref Payee Borrower","Ref Related Borrower","Ref Related Loan","Source Type","Source Key","Gross Profit Basis","Rule Version","Created By")
 VALUES('rr1:'||p_loan,l."Close Date",'Referral Rebate',rebate::money,payee,referrer,l."Ref Borrowers",p_loan,
  'Referral Rebate','REFERRAL_REBATE:'||p_loan,profit::money,'REFERRAL_REBATE_V1','SQL:loan-close')
 ON CONFLICT ("Source Key") WHERE nullif(btrim("Source Key"),'') IS NOT NULL DO NOTHING;
END $$;
CREATE FUNCTION public.referral_loan_closed() RETURNS trigger
 LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF NEW."Loan Status"='ปิดยอดแล้ว' AND OLD."Loan Status" IS DISTINCT FROM NEW."Loan Status" THEN
   PERFORM public.create_referral_rebate(NEW."Row ID");
 ELSIF NEW."Close Date" IS DISTINCT FROM OLD."Close Date" THEN
   UPDATE public."Business Expenses" SET "Amount"="Amount" WHERE "Ref Related Loan"=NEW."Row ID" AND "Source Type"='Referral Rebate';
 END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER referral_loan_closed AFTER UPDATE ON public."Loans"
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.referral_loan_closed();

COMMENT ON TABLE public."Business Expenses" IS 'Incurred expenses, no payment status. SQL recalculates allocations from historical contributions; referral transaction identity is immutable. No historical backfill.';

-- Same unrounded gross allocation as existing OLAP Repayments virtual columns.
CREATE FUNCTION public.partner_net_profit(p_partner text) RETURNS numeric
 LANGUAGE sql STABLE SET search_path=pg_catalog,public AS $$
 WITH partner AS (SELECT "Partner Role" role FROM public."Partners" WHERE "Row ID"=p_partner),
 gross AS (
 SELECT coalesce(sum(r."Interest Paid"::numeric*CASE WHEN c.pool>0 THEN coalesce(c.owned,0)/c.pool ELSE 0 END),0) n
 FROM public."Repayments" r CROSS JOIN LATERAL (
 SELECT sum(CASE WHEN c."Transaction Type"='Contribution' THEN c."Amount"::numeric ELSE -c."Amount"::numeric END) pool,
 sum(CASE WHEN c."Transaction Type"='Contribution' THEN c."Amount"::numeric ELSE -c."Amount"::numeric END)
 FILTER(WHERE p."Partner Role"=(SELECT role FROM partner)) owned
 FROM public."Cash Pool Contributions" c LEFT JOIN public."Partners" p ON p."Row ID"=c."Ref Partner"
 WHERE c."Contribution Date"<=r."Payment Date") c)
 SELECT gross.n-coalesce((SELECT sum(CASE WHEN (SELECT role FROM partner)='A' THEN "Partner A Expense"::numeric
 WHEN (SELECT role FROM partner)='B' THEN "Partner B Expense"::numeric ELSE 0 END) FROM public."Business Expenses"),0) FROM gross;
$$;
CREATE FUNCTION public.validate_net_settlement() RETURNS trigger
 LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE available numeric;
BEGIN
 -- Completing/reversing an already reserved settlement does not reserve it twice.
 IF TG_OP='UPDATE' AND NEW."Amount" IS NOT DISTINCT FROM OLD."Amount"
   AND NEW."Ref Partner" IS NOT DISTINCT FROM OLD."Ref Partner" THEN RETURN NEW; END IF;
 IF NEW."Ref Partner" IS NULL OR NEW."Amount" IS NULL OR NEW."Amount"::numeric<=0 THEN
   RAISE EXCEPTION 'Settlement requires a partner and a positive amount';
 END IF;
 -- Flush pending contribution corrections before checking their materialized expense side.
 PERFORM public.recalculate_business_expenses_from_date('0001-01-01');
 SELECT public.partner_net_profit(NEW."Ref Partner")-coalesce(sum("Amount"::numeric),0) INTO available
 FROM public."Settlements" WHERE "Ref Partner"=NEW."Ref Partner" AND "Row ID"<>NEW."Row ID";
 IF NEW."Amount"::numeric>available THEN RAISE EXCEPTION 'Settlement exceeds net available to settle'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER validate_net_settlement BEFORE INSERT OR UPDATE ON public."Settlements"
 FOR EACH ROW EXECUTE FUNCTION public.validate_net_settlement();
ALTER TABLE public."Daily Analytics" ADD COLUMN "Business Expenses" money, ADD COLUMN "Net Profit" money, ADD COLUMN "Net Unsettled Profit EOD" money;
CREATE OR REPLACE FUNCTION public.refresh_daily_analytics(p_from date,p_to date)
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
   "Total Cash Pool EOD","Available Cash EOD","Unsettled Profit EOD","Business Expenses","Net Profit","Net Unsettled Profit EOD")
 SELECT 'da11:'||d::text,d,statement_timestamp() AT TIME ZONE 'Asia/Bangkok',2,
   issued::money,loans::integer,principal::money,interest::money,repayments::integer,
   (issued_eod-returned_eod)::money,active::integer,borrowers::integer,pending::money,
   pool::money,(pool+returned_eod-issued_eod)::money,unsettled::money,
   coalesce((SELECT sum("Amount") FROM public."Business Expenses" WHERE "Expense Date"=metrics.d),0::money),
   interest::money-coalesce((SELECT sum("Amount") FROM public."Business Expenses" WHERE "Expense Date"=metrics.d),0::money),
   unsettled::money-coalesce((SELECT sum("Amount") FROM public."Business Expenses" WHERE "Expense Date"<=metrics.d),0::money)
 FROM metrics ORDER BY d
 ON CONFLICT ("Snapshot Date") DO UPDATE SET
   "Generated At"=EXCLUDED."Generated At","Model Version"=EXCLUDED."Model Version",
   "Principal Issued"=EXCLUDED."Principal Issued","Loans Issued"=EXCLUDED."Loans Issued",
   "Principal Returned"=EXCLUDED."Principal Returned","Interest Received"=EXCLUDED."Interest Received",
   "Repayments Count"=EXCLUDED."Repayments Count","Outstanding Principal EOD"=EXCLUDED."Outstanding Principal EOD",
   "Active Loans EOD"=EXCLUDED."Active Loans EOD","Active Borrowers EOD"=EXCLUDED."Active Borrowers EOD",
   "Pending Charges EOD"=EXCLUDED."Pending Charges EOD","Total Cash Pool EOD"=EXCLUDED."Total Cash Pool EOD",
   "Available Cash EOD"=EXCLUDED."Available Cash EOD","Unsettled Profit EOD"=EXCLUDED."Unsettled Profit EOD",
   "Business Expenses"=EXCLUDED."Business Expenses","Net Profit"=EXCLUDED."Net Profit",
   "Net Unsettled Profit EOD"=EXCLUDED."Net Unsettled Profit EOD";
 GET DIAGNOSTICS n=ROW_COUNT;
 RETURN n;
END $$;


CREATE OR REPLACE FUNCTION public.analytics_refresh_request()
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
 SELECT min(d) INTO first_date FROM (SELECT "Loan Date" d FROM public."Loans" UNION ALL SELECT "Expense Date" FROM public."Business Expenses") dates WHERE d<=today;
 IF first_date IS NULL THEN RETURN NEW; END IF;
 IF parts[2]='Recent' THEN first_date:=greatest(first_date,today-1); END IF;
 PERFORM public.refresh_daily_analytics(first_date,today);
 RETURN NEW;
END $$;

