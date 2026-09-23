\set ON_ERROR_STOP on
DO $$
DECLARE s record; b record; starts date; ends date; bad bigint;
BEGIN
 FOR s IN SELECT id FROM public.reporting_cash_scopes LOOP
  FOR starts,ends IN SELECT * FROM (VALUES
   (public.olap_reporting_date(),public.olap_reporting_date()),
   (public.olap_reporting_date()-1,public.olap_reporting_date()-1),
   (date_trunc('month',public.olap_reporting_date())::date,public.olap_reporting_date()),
   (public.olap_reporting_date()-60,public.olap_reporting_date()-2)) p(a,b) LOOP
   SELECT count(*) INTO bad FROM (
    (SELECT * FROM public.reporting_cash_period_entries(starts,ends,s.id)
     EXCEPT ALL SELECT * FROM public.reporting_cashflow_transactions WHERE "Scope ID"=s.id AND "Date" BETWEEN starts AND ends)
    UNION ALL
    (SELECT * FROM public.reporting_cashflow_transactions WHERE "Scope ID"=s.id AND "Date" BETWEEN starts AND ends
     EXCEPT ALL SELECT * FROM public.reporting_cash_period_entries(starts,ends,s.id))
   ) difference;
   IF bad<>0 THEN RAISE EXCEPTION 'Bounded ledger differs from original'; END IF;
   SELECT * INTO b FROM public.reporting_cash_period(starts,ends,s.id);
   IF b."Opening Balance"+b."Money In"-b."Money Out" IS DISTINCT FROM b."Closing Balance"
    AND b."Opening Balance" IS NOT NULL THEN RAISE EXCEPTION 'Period equation failed'; END IF;
   IF b."Money In"<>(SELECT coalesce(sum("Money In"),0) FROM public.reporting_cash_period_entries(starts,ends,s.id))
    OR b."Money Out"<>(SELECT coalesce(sum("Money Out"),0) FROM public.reporting_cash_period_entries(starts,ends,s.id))
    THEN RAISE EXCEPTION 'Detail and summary differ'; END IF;
  END LOOP;
 END LOOP;
 IF EXISTS(SELECT 1 FROM public.reporting_cash_entries WHERE "Scope ID"='__ALL__' AND "Internal Transfer" AND ("Money In"<>0 OR "Money Out"<>0)) THEN RAISE EXCEPTION 'Transfer double count'; END IF;
 IF EXISTS(SELECT 1 FROM public.reporting_income_daily d LEFT JOIN
  (SELECT "Date",sum("Income") income,sum("Expenses") expense FROM public.reporting_income_events GROUP BY 1) e USING("Date")
  WHERE d."Operating Income"<>coalesce(e.income,0) OR d."Expenses"<>coalesce(e.expense,0)) THEN RAISE EXCEPTION 'Income semantics changed'; END IF;
 IF EXISTS(SELECT 1 FROM public.reporting_cash_period(public.olap_reporting_date()+1,public.olap_reporting_date()+1,'__ALL__')) THEN RAISE EXCEPTION 'Future period allowed'; END IF;
END $$;
SELECT 'Focused statements: period/detail parity, equation, transfers, income and future guards passed';
