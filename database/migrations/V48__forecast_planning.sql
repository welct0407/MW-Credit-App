-- R045: additive read-only forecast providers. No source records or app bindings change.
CREATE FUNCTION public.forecast_schedule_v1(l jsonb, charges jsonb, t date, e date)
RETURNS TABLE(due_date date, origin text, bucket text, principal numeric, interest numeric, eligible boolean, issue text)
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,public AS $$
DECLARE c jsonb; d date; latest date; anchor date; n integer; elapsed integer; term integer;
 p numeric; i numeric; balance numeric; daily_rate numeric; basis numeric[]; active boolean;
 blocked boolean:=false; scheduled_principal numeric:=0; found_today boolean:=false; today_principal numeric:=0; simulated_principal numeric:=0;
BEGIN
 IF t IS NULL OR e<t OR e>t+93 THEN RAISE EXCEPTION 'Forecast window invalid'; END IF;
 active:=coalesce(l->>'status'='ยังไม่ปิดยอด' AND NOT (l->>'defaulted')::boolean AND (l->>'start')::date<=t
  AND ((l->>'close') IS NULL OR (l->>'close')::date>t),false);
 balance:=(l->>'balance')::numeric;daily_rate:=(l->>'daily')::numeric;
 FOR c IN SELECT value FROM jsonb_array_elements(coalesce(charges,'[]'::jsonb)) ORDER BY (value->>'date')::date,value->>'id' LOOP
  d:=(c->>'date')::date;
  IF d=t THEN found_today:=true; END IF;
  IF coalesce((c->>'invalid')::boolean,false) OR d IS NULL THEN
   due_date:=d;origin:='Exception';bucket:='Source review';principal:=0;interest:=0;eligible:=false;issue:='Invalid charge or allocation';RETURN NEXT;blocked:=true;CONTINUE;
  END IF;
  -- Negative default-accounting obligations are not expected cash receipts.
  IF (c->>'pdue')::numeric<0 OR (c->>'idue')::numeric<0 THEN
   IF NOT coalesce((l->>'defaulted')::boolean,false) THEN
    due_date:=d;origin:='Exception';bucket:='Source review';principal:=0;interest:=0;eligible:=false;issue:='Negative obligation';RETURN NEXT;blocked:=true;
   END IF;CONTINUE;
  END IF;
  IF d>e THEN CONTINUE; END IF;
  p:=greatest((c->>'pdue')::numeric-coalesce((c->>'ppaid')::numeric,0),0);
  i:=greatest((c->>'idue')::numeric-coalesce((c->>'ipaid')::numeric,0),0);
  IF p+i>0 THEN
   due_date:=d;origin:='Recorded';bucket:=CASE WHEN NOT active THEN 'Recovery only' WHEN d<t THEN 'Overdue' WHEN d=t THEN 'Today' ELSE 'Future' END;
   principal:=p;interest:=i;eligible:=active;issue:=NULL;RETURN NEXT;
  END IF;
  scheduled_principal:=scheduled_principal+p;
  IF d=t THEN today_principal:=today_principal+p; END IF;
 END LOOP;
 IF l->>'status' NOT IN ('ยังไม่ปิดยอด','ปิดยอดแล้ว') OR l->>'status' IS NULL OR coalesce((l->>'invalid')::boolean,true) THEN
  due_date:=t;origin:='Exception';bucket:='Source review';principal:=0;interest:=0;eligible:=false;issue:='Invalid loan, borrower or repayment';RETURN NEXT;RETURN;
 END IF;
 IF NOT active THEN RETURN; END IF;
 IF balance IS NULL OR balance<0 OR scheduled_principal>balance+0.005 THEN
  due_date:=t;origin:='Exception';bucket:='Source review';principal:=0;interest:=0;eligible:=false;issue:='Principal obligations do not reconcile';RETURN NEXT;RETURN;
 END IF;
 IF NOT coalesce((l->>'auto')::boolean,false) THEN
  due_date:=t;origin:='Notice';bucket:='Recorded plan only';principal:=0;interest:=0;eligible:=false;issue:='Manual schedule: only recorded obligations forecast';RETURN NEXT;RETURN;
 END IF;
 IF blocked THEN RETURN; END IF;
 n:=(l->>'interval')::integer;anchor:=coalesce((l->>'anchor')::date,(l->>'start')::date);
 IF l->>'type' NOT IN ('ดอกเบี้ยรายวัน','กำหนดวันชำระ','ผ่อนชำระรายวัน')
 OR (l->>'type'<>'กำหนดวันชำระ' AND (n IS NULL OR n<1))
 OR (l->>'type'='ดอกเบี้ยรายวัน' AND (daily_rate IS NULL OR daily_rate<0 OR anchor<(l->>'start')::date))
 OR (l->>'type'<>'ดอกเบี้ยรายวัน' AND ((l->>'due') IS NULL OR (l->>'due')::date<(l->>'start')::date)) THEN
  due_date:=t;origin:='Exception';bucket:='Source review';principal:=0;interest:=0;eligible:=false;issue:='Unsupported automatic schedule';RETURN NEXT;RETURN;
 END IF;
 SELECT max((value->>'date')::date) INTO latest FROM jsonb_array_elements(coalesce(charges,'[]'::jsonb))
 WHERE l->>'type'='ผ่อนชำระรายวัน' OR (value->>'date')::date<=t;
 IF l->>'type'='ผ่อนชำระรายวัน' AND latest IS NULL THEN
  due_date:=t;origin:='Exception';bucket:='Source review';principal:=0;interest:=0;eligible:=false;issue:='Installment missing initial charge';RETURN NEXT;RETURN;
 END IF;
 IF NOT found_today AND ((l->>'type'='ดอกเบี้ยรายวัน' AND daily_rate>0 AND t>anchor AND mod(t-anchor,n)=0)
  OR (l->>'type'='กำหนดวันชำระ' AND (l->>'due')::date=t)
  OR (l->>'type'='ผ่อนชำระรายวัน' AND t>(l->>'start')::date AND t<=(l->>'due')::date AND (mod(t-(l->>'start')::date,n)=0 OR t=(l->>'due')::date))) THEN
  due_date:=t;origin:='Exception';bucket:='Source review';principal:=0;interest:=0;eligible:=false;issue:='Expected today charge missing';RETURN NEXT;
 END IF;
 IF l->>'type'='ดอกเบี้ยรายวัน' THEN
  BEGIN basis:=public.daily_interest_basis(l->>'arrangement'); EXCEPTION WHEN OTHERS THEN basis:=NULL; END;
 END IF;
 balance:=balance-today_principal;
 IF l->>'type'='ดอกเบี้ยรายวัน' AND today_principal>0 THEN
  IF basis IS NULL THEN due_date:=t;origin:='Exception';bucket:='Source review';principal:=0;interest:=0;eligible:=false;issue:='Daily interest basis unavailable after scheduled principal';RETURN NEXT;RETURN;END IF;
  daily_rate:=CASE WHEN balance=basis[2] THEN basis[1] ELSE round(basis[1]*greatest(0,balance)/basis[2],0) END;
 END IF;
 term:=(l->>'due')::date-(l->>'start')::date+1;
 FOR d IN SELECT generate_series(t+1,e,interval '1 day')::date LOOP
  p:=0;i:=0;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(charges,'[]'::jsonb)) WHERE (value->>'date')::date=d) THEN
   SELECT coalesce(sum(greatest((value->>'pdue')::numeric-coalesce((value->>'ppaid')::numeric,0),0)),0) INTO p
    FROM jsonb_array_elements(charges) WHERE (value->>'date')::date=d;
   IF l->>'type'='ดอกเบี้ยรายวัน' THEN latest:=d; END IF;
   balance:=balance-p;
   IF l->>'type'='ดอกเบี้ยรายวัน' AND p>0 THEN
    IF basis IS NULL THEN due_date:=d;origin:='Exception';bucket:='Source review';principal:=0;interest:=0;eligible:=false;issue:='Daily interest basis unavailable after scheduled principal';RETURN NEXT;RETURN;END IF;
    daily_rate:=CASE WHEN balance=basis[2] THEN basis[1] ELSE round(basis[1]*greatest(0,balance)/basis[2],0) END;
   END IF;
   CONTINUE;
  END IF;
  IF l->>'type'='ดอกเบี้ยรายวัน' THEN
   IF d<=anchor OR mod(d-anchor,n)<>0 OR daily_rate=0 THEN CONTINUE; END IF;
   i:=daily_rate*greatest(0,d-coalesce(latest,(l->>'start')::date));
  ELSIF l->>'type'='กำหนดวันชำระ' THEN
   IF d<>(l->>'due')::date THEN CONTINUE; END IF;
   p:=balance;i:=(l->>'fixed')::numeric;
  ELSE
   IF d<=(l->>'start')::date OR d>(l->>'due')::date OR (mod(d-(l->>'start')::date,n)<>0 AND d<>(l->>'due')::date) THEN CONTINUE; END IF;
   elapsed:=d-latest;IF elapsed<=0 THEN CONTINUE;END IF;
   p:=floor((l->>'original')::numeric/term)*elapsed+greatest(0,least(d-(l->>'start')::date+1,mod((l->>'original')::numeric,term))-(latest-(l->>'start')::date+1));
   i:=(l->>'payment')::numeric*elapsed-p;
  END IF;
  IF p IS NULL OR i IS NULL OR p<0 OR i<0 OR p>balance+0.005 OR scheduled_principal+simulated_principal+p>(l->>'balance')::numeric+0.005 THEN
   due_date:=d;origin:='Exception';bucket:='Source review';principal:=0;interest:=0;eligible:=false;issue:='Simulated components do not reconcile';RETURN NEXT;RETURN;
  END IF;
  due_date:=d;origin:='Simulated';bucket:='Future';principal:=p;interest:=i;eligible:=true;issue:=NULL;RETURN NEXT;
  latest:=d;balance:=balance-p;simulated_principal:=simulated_principal+p;
 END LOOP;
END $$;

CREATE VIEW public.reporting_forecast_inputs_v1 AS
WITH ctx AS (SELECT public.olap_reporting_date() t), repayments AS (
 SELECT "Ref Loans" loan_id,coalesce(sum("Principal Paid"::numeric) FILTER(WHERE "Payment Date"<=t),0) principal,
 bool_or("Payment Date" IS NULL OR "Principal Paid" IS NULL OR "Interest Paid" IS NULL OR "Payment Date">t) invalid
 FROM public."Repayments" CROSS JOIN ctx GROUP BY 1
), paid AS (
 SELECT r."Ref Charges" charge_id,sum(r."Principal Paid"::numeric) FILTER(WHERE r."Payment Date"<=t) p,
 sum(r."Interest Paid"::numeric) FILTER(WHERE r."Payment Date"<=t) i,
 bool_or(r."Payment Date" IS NULL OR r."Principal Paid" IS NULL OR r."Interest Paid" IS NULL OR r."Ref Loans" IS DISTINCT FROM c."Ref Loans") invalid
 FROM public."Repayments" r LEFT JOIN public."Charges" c ON c."Row ID"=r."Ref Charges" CROSS JOIN ctx GROUP BY 1
), charges AS (
 SELECT c."Ref Loans" loan_id,jsonb_agg(jsonb_build_object('id',c."Row ID",'date',c."Charge Date",'pdue',c."Principal Due"::numeric,
 'idue',c."Interest Due"::numeric,'ppaid',coalesce(p.p,0),'ipaid',coalesce(p.i,0),
 'invalid',coalesce(p.invalid,false) OR c."Charge Date" IS NULL OR c."Principal Due" IS NULL OR c."Interest Due" IS NULL)) charges
 FROM public."Charges" c LEFT JOIN paid p ON p.charge_id=c."Row ID" GROUP BY 1
)
SELECT l."Row ID" loan_id,l."Ref Borrowers" borrower_id,coalesce(nullif(b."Description",''),b."Borrower Name",l."Ref Borrowers",'Unmapped') borrower,
 CASE l."Loan Type" WHEN 'ดอกเบี้ยรายวัน' THEN 'Daily Interest' WHEN 'กำหนดวันชำระ' THEN 'Fixed Due Date' WHEN 'ผ่อนชำระรายวัน' THEN 'Daily Installment' ELSE 'Unknown' END loan_type,
 l."Loan Status" loan_status,coalesce(l."Defaulted",false) defaulted,
 l."Principal Amount"::numeric-coalesce(r.principal,0) outstanding_principal,
 t reporting_date,(date_trunc('month',t)+interval '1 month - 1 day')::date month_end,
 jsonb_build_object('status',l."Loan Status",'defaulted',coalesce(l."Defaulted",false),'start',l."Loan Date",'close',l."Close Date",
 'balance',l."Principal Amount"::numeric-coalesce(r.principal,0),'daily',l."Current Daily Interest"::numeric,'auto',l."Auto Charge Enabled",
 'interval',l."Interest Payment Interval",'anchor',l."Interest Schedule Anchor Date",'type',l."Loan Type",'due',l."Due Date",
 'arrangement',l."Loan Arrangement",'original',l."Principal Amount"::numeric,'payment',l."Daily Payment Amount"::numeric,'fixed',l."Fixed Interest"::numeric,
 'invalid',l."Loan Date" IS NULL OR l."Principal Amount" IS NULL OR b."Row ID" IS NULL OR coalesce(r.invalid,false)) loan,
 coalesce(c.charges,'[]'::jsonb) charges
FROM public."Loans" l LEFT JOIN public."Borrowers" b ON b."Row ID"=l."Ref Borrowers"
LEFT JOIN repayments r ON r.loan_id=l."Row ID" LEFT JOIN charges c ON c.loan_id=l."Row ID" CROSS JOIN ctx;

CREATE VIEW public.reporting_forecast_events_v1 AS
SELECT i.loan_id,i.borrower_id,i.borrower,i.loan_type,i.outstanding_principal,i.loan_status,i.defaulted,
 i.reporting_date,i.month_end,s.* FROM public.reporting_forecast_inputs_v1 i
CROSS JOIN LATERAL public.forecast_schedule_v1(i.loan,i.charges,i.reporting_date,i.month_end) s;

CREATE VIEW public.reporting_forecast_actuals_v1 AS
SELECT r."Row ID" repayment_id,r."Ref Loans" loan_id,l."Ref Borrowers" borrower_id,
 coalesce(nullif(b."Description",''),b."Borrower Name",'Unmapped') borrower,
 CASE l."Loan Type" WHEN 'ดอกเบี้ยรายวัน' THEN 'Daily Interest' WHEN 'กำหนดวันชำระ' THEN 'Fixed Due Date' WHEN 'ผ่อนชำระรายวัน' THEN 'Daily Installment' ELSE 'Unknown' END loan_type,
 r."Payment Date" payment_date,r."Interest Paid"::numeric interest,r."Principal Paid"::numeric principal,
 l."Row ID" IS NULL OR b."Row ID" IS NULL OR r."Interest Paid" IS NULL OR r."Principal Paid" IS NULL invalid
FROM public."Repayments" r LEFT JOIN public."Loans" l ON l."Row ID"=r."Ref Loans"
LEFT JOIN public."Borrowers" b ON b."Row ID"=l."Ref Borrowers"
WHERE r."Payment Date" BETWEEN date_trunc('month',public.olap_reporting_date())::date AND public.olap_reporting_date();

CREATE VIEW public.reporting_forecast_loans_v1 AS
WITH ev AS (SELECT loan_id,
 coalesce(sum(interest) FILTER(WHERE eligible AND bucket IN ('Today','Future')),0) ui,
 coalesce(sum(principal) FILTER(WHERE eligible AND bucket IN ('Today','Future')),0) up,
 coalesce(sum(interest) FILTER(WHERE eligible AND bucket='Overdue'),0) oi,
 coalesce(sum(principal) FILTER(WHERE eligible AND bucket='Overdue'),0) op,
 coalesce(sum(interest) FILTER(WHERE bucket='Recovery only'),0) xi,
 coalesce(sum(principal) FILTER(WHERE bucket='Recovery only'),0) xp,
 coalesce(sum(interest) FILTER(WHERE eligible AND bucket IN ('Today','Future') AND origin='Recorded'),0) recorded_interest,
 coalesce(sum(interest) FILTER(WHERE origin='Simulated'),0) simulated_interest,
 min(due_date) FILTER(WHERE eligible AND bucket IN ('Today','Future') AND principal+interest>0) next_due,
 bool_or(origin='Exception') incomplete,string_agg(DISTINCT issue,'; ' ORDER BY issue) issues
 FROM public.reporting_forecast_events_v1 GROUP BY 1), actual AS (SELECT loan_id,sum(interest) actual_interest FROM public.reporting_forecast_actuals_v1 GROUP BY 1)
SELECT i.loan_id,i.borrower_id,i.borrower,i.loan_type,i.loan_status,i.defaulted,i.outstanding_principal,
 i.reporting_date,i.month_end,coalesce(e.ui,0) ui,coalesce(e.up,0) up,coalesce(e.oi,0) oi,coalesce(e.op,0) op,
 coalesce(e.xi,0) xi,coalesce(e.xp,0) xp,coalesce(e.recorded_interest,0) recorded_interest,coalesce(e.simulated_interest,0) simulated_interest,
 coalesce(a.actual_interest,0) actual_interest,e.next_due,coalesce(e.incomplete,false) incomplete,e.issues,
 coalesce(h.arrangement_status,'Not assessed') arrangement_status
FROM public.reporting_forecast_inputs_v1 i LEFT JOIN ev e USING(loan_id) LEFT JOIN actual a USING(loan_id)
LEFT JOIN public.reporting_loan_schedule_health_v1 h USING(loan_id);

CREATE FUNCTION public.forecast_scenario_v1(ui numeric,up numeric,oi numeric,op numeric,ci numeric,cp numeric,rr numeric,scenario text)
RETURNS TABLE(remaining_interest numeric,remaining_principal numeric) LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $$
BEGIN
 IF ci IS NULL OR cp IS NULL OR rr IS NULL OR ci<0 OR ci>100 OR cp<0 OR cp>100 OR rr<0 OR rr>100
 OR ci::text='NaN' OR cp::text='NaN' OR rr::text='NaN' OR scenario NOT IN ('Planning','Schedule','Stress') OR scenario IS NULL
 THEN RAISE EXCEPTION 'Scenario inputs require percentages 0 to 100 and a valid scenario';END IF;
 RETURN QUERY SELECT CASE scenario WHEN 'Schedule' THEN ui WHEN 'Stress' THEN greatest(ci-20,0)*ui/100 ELSE (ci*ui+rr*oi)/100 END,
 CASE scenario WHEN 'Schedule' THEN up WHEN 'Stress' THEN greatest(cp-20,0)*up/100 ELSE (cp*up+rr*op)/100 END;
END $$;

CREATE VIEW public.reporting_forecast_context_v1 AS
SELECT public.olap_reporting_date() reporting_date,statement_timestamp() calculated_at,
 c."Business Cash Held" current_cash,c."Cash Status" cash_status,
 (SELECT count(*) FROM public."Repayments" WHERE "Payment Date" IS NULL OR "Interest Paid" IS NULL OR "Principal Paid" IS NULL) invalid_receipts,
 (SELECT count(*) FROM public."Charges" c LEFT JOIN public."Loans" l ON l."Row ID"=c."Ref Loans" WHERE l."Row ID" IS NULL) orphan_charges
FROM (SELECT 1) anchor LEFT JOIN public.reporting_cash_daily c ON c."Date"=public.olap_reporting_date();

REVOKE ALL ON FUNCTION public.forecast_schedule_v1(jsonb,jsonb,date,date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.forecast_scenario_v1(numeric,numeric,numeric,numeric,numeric,numeric,numeric,text) FROM PUBLIC;
DO $$ DECLARE obj text; BEGIN
 FOREACH obj IN ARRAY ARRAY['inputs','events','actuals','loans','context'] LOOP
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC','reporting_forecast_'||obj||'_v1');
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='metabase_borrower_reader') THEN
   EXECUTE format('GRANT SELECT ON public.%I TO metabase_borrower_reader','reporting_forecast_'||obj||'_v1');
  END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='metabase_borrower_reader') THEN
  GRANT EXECUTE ON FUNCTION public.forecast_schedule_v1(jsonb,jsonb,date,date),public.forecast_scenario_v1(numeric,numeric,numeric,numeric,numeric,numeric,numeric,text) TO metabase_borrower_reader;
 END IF;
END $$;
