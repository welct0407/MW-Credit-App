-- Defaulted is a state transition, carrying the confirmation date and actor.
-- No historical backfill; preserve the owner's zero-cash prototype loss posting.
CREATE FUNCTION public.post_loan_default(p_loan public."Loans", p_date date, p_actor text)
RETURNS numeric LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE outstanding numeric; c record; posting text:='df10:'||length(p_loan."Row ID")||':'||p_loan."Row ID";
BEGIN
  IF pg_trigger_depth()=0 THEN RAISE EXCEPTION 'Confirm default through the Loans state transition'; END IF;
  -- The originating Loans UPDATE already owns its row lock. Never wait for a
  -- borrower held by a payment/generator that could be waiting for this loan.
  BEGIN
    PERFORM 1 FROM public."Borrowers" WHERE "Row ID"=p_loan."Ref Borrowers" FOR UPDATE NOWAIT;
    IF NOT FOUND THEN RAISE EXCEPTION 'Default requires an existing borrower'; END IF;
  EXCEPTION WHEN lock_not_available THEN
    RAISE EXCEPTION 'Borrower is busy; sync and retry Default Loan';
  END;
  IF p_date IS DISTINCT FROM (statement_timestamp() AT TIME ZONE 'Asia/Bangkok')::date
    OR nullif(btrim(p_actor),'') IS NULL THEN
    RAISE EXCEPTION 'Default requires today confirmation date and actor; sync and confirm again';
  END IF;
  IF p_loan."Loan Status" IS DISTINCT FROM 'ยังไม่ปิดยอด'
    OR coalesce(p_loan."Defaulted",false) OR NOT coalesce(p_loan."Auto Charge Enabled",false)
    OR p_loan."Principal Amount" IS NULL THEN
    RAISE EXCEPTION 'Default requires an open auto-enabled nondefaulted loan';
  END IF;
  IF EXISTS(SELECT 1 FROM public."Payments" WHERE "Ref Borrower"=p_loan."Ref Borrowers" AND "Status" IN ('Processing','Error')) THEN
    RAISE EXCEPTION 'Resolve processing or error payments before default';
  END IF;
  PERFORM 1 FROM public."Charges" WHERE "Ref Loans"=p_loan."Row ID" ORDER BY "Row ID" COLLATE "C" FOR UPDATE;
  SELECT p_loan."Principal Amount"::numeric-coalesce(sum("Principal Paid"::numeric),0)
    INTO outstanding FROM public."Repayments" WHERE "Ref Loans"=p_loan."Row ID";
  IF outstanding<=0 THEN RAISE EXCEPTION 'Default requires outstanding principal'; END IF;
  FOR c IN SELECT ch.*,coalesce(r.p,0) AS paid_p,coalesce(r.i,0) AS paid_i
    FROM public."Charges" ch LEFT JOIN LATERAL
      (SELECT sum("Principal Paid"::numeric) p,sum("Interest Paid"::numeric) i
       FROM public."Repayments" WHERE "Ref Charges"=ch."Row ID") r ON true
    WHERE ch."Ref Loans"=p_loan."Row ID" ORDER BY ch."Row ID" COLLATE "C"
  LOOP
    IF c."Principal Due" IS NULL OR c."Interest Due" IS NULL OR c.paid_p<0 OR c.paid_i<0
      OR c."Principal Due"::numeric<c.paid_p OR c."Interest Due"::numeric<c.paid_i THEN
      RAISE EXCEPTION 'Charge components require reconciliation before default';
    END IF;
    IF c."Charge Date"=p_date AND c.paid_p+c.paid_i<>0
      AND c."Principal Due"::numeric+c."Interest Due"::numeric<=c.paid_p+c.paid_i THEN
      RAISE EXCEPTION 'A paid charge today prevents Default Loan';
    END IF;
    IF c."Principal Due"::numeric>c.paid_p OR c."Interest Due"::numeric>c.paid_i THEN
      UPDATE public."Charges" SET "Principal Due"=c.paid_p::money,"Interest Due"=c.paid_i::money,
        "Notes"=concat_ws(E'\n',nullif(c."Notes",''),'Default write-off '||jsonb_build_object(
          'posting',posting,'date',p_date,'actor',p_actor,
          'original_principal',c."Principal Due"::numeric,'original_interest',c."Interest Due"::numeric,
          'written_off_principal',c."Principal Due"::numeric-c.paid_p,
          'written_off_interest',c."Interest Due"::numeric-c.paid_i)::text)
        WHERE "Row ID"=c."Row ID";
    END IF;
  END LOOP;
  INSERT INTO public."Charges"("Row ID","Ref Loans","Charge Date","Principal Due","Interest Due","Notes")
    VALUES(posting,p_loan."Row ID",p_date,outstanding::money,(-outstanding)::money,
      'Loan default - outstanding principal recorded as loss; zero cash');
  INSERT INTO public."Repayments"("Row ID","Payment Date","Principal Paid","Interest Paid","Notes","Ref Loans","Ref Charges","Created By")
    VALUES(posting,p_date,outstanding::money,(-outstanding)::money,
      'หนี้สูญ - บันทึกเงินต้นคงเหลือเป็นขาดทุน / Loan default - outstanding principal recorded as loss',
      p_loan."Row ID",posting,p_actor);
  RETURN outstanding;
END $$;

CREATE FUNCTION public.default_loan_transition() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
  IF TG_OP='INSERT' THEN
    IF coalesce(NEW."Defaulted",false) THEN RAISE EXCEPTION 'Create the loan before confirming default'; END IF;
    RETURN NEW;
  END IF;
  IF coalesce(OLD."Defaulted",false) THEN
    IF NEW."Defaulted" IS DISTINCT FROM OLD."Defaulted" OR NEW."Default Loss Amount" IS DISTINCT FROM OLD."Default Loss Amount"
      OR NEW."Loan Status" IS DISTINCT FROM OLD."Loan Status" OR NEW."Close Date" IS DISTINCT FROM OLD."Close Date"
      OR NEW."Closed By" IS DISTINCT FROM OLD."Closed By" OR NEW."Principal Amount" IS DISTINCT FROM OLD."Principal Amount"
      OR NEW."Ref Borrowers" IS DISTINCT FROM OLD."Ref Borrowers" THEN
      RAISE EXCEPTION 'Recorded default is immutable; use a reviewed correction';
    END IF;
    RETURN NEW;
  END IF;
  IF NOT coalesce(NEW."Defaulted",false) THEN RETURN NEW; END IF;
  IF NEW."Principal Amount" IS DISTINCT FROM OLD."Principal Amount" OR NEW."Ref Borrowers" IS DISTINCT FROM OLD."Ref Borrowers"
    OR NEW."Auto Charge Enabled" IS DISTINCT FROM OLD."Auto Charge Enabled" THEN
    RAISE EXCEPTION 'Do not change loan inputs while confirming default';
  END IF;
  NEW."Default Loss Amount":=public.post_loan_default(OLD,NEW."Close Date",NEW."Closed By")::money;
  NEW."Loan Status":='ปิดยอดแล้ว';
  RETURN NEW;
END $$;
CREATE TRIGGER default_loan_transition BEFORE INSERT OR UPDATE ON public."Loans"
  FOR EACH ROW EXECUTE FUNCTION public.default_loan_transition();

-- Loss entries are never first-day receipts, including same-day defaults.
CREATE OR REPLACE FUNCTION public.first_day_charge_trigger() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
  IF NOT starts_with(NEW."Row ID",'lc7:') AND NOT starts_with(NEW."Row ID",'df10:') THEN
    PERFORM public.first_day_receipt(NEW."Row ID");
  END IF;
  RETURN NULL;
END $$;

CREATE FUNCTION public.default_posting_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
  IF starts_with(OLD."Row ID",'df10:') THEN RAISE EXCEPTION 'Default posting is immutable'; END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER default_posting_guard BEFORE UPDATE OR DELETE ON public."Charges"
  FOR EACH ROW EXECUTE FUNCTION public.default_posting_guard();
CREATE TRIGGER default_posting_guard BEFORE UPDATE OR DELETE ON public."Repayments"
  FOR EACH ROW EXECUTE FUNCTION public.default_posting_guard();
