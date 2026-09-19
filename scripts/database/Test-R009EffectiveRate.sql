-- R009 calculation contract: current daily income divided by principal still outstanding.
-- The assertions are data-independent and cover full, partial, and zero-balance cases.
DO $$
DECLARE
    actual numeric;
BEGIN
    -- Daily-interest loan: partial repayment doubles the return on the remaining half.
    SELECT CASE WHEN outstanding <= 0 THEN 0 ELSE daily_income / outstanding END
      INTO actual
      FROM (VALUES (10::numeric, 50::numeric)) v(daily_income, outstanding);
    IF actual <> 0.2 THEN
        RAISE EXCEPTION 'daily-interest partial-balance rate: expected 0.2, got %', actual;
    END IF;

    -- The same contract remains unchanged before principal is repaid.
    SELECT CASE WHEN outstanding <= 0 THEN 0 ELSE daily_income / outstanding END
      INTO actual
      FROM (VALUES (10::numeric, 100::numeric)) v(daily_income, outstanding);
    IF actual <> 0.1 THEN
        RAISE EXCEPTION 'daily-interest full-balance rate: expected 0.1, got %', actual;
    END IF;

    -- Fixed-date loan: 30 total interest over 10 days against 50 outstanding.
    SELECT CASE WHEN outstanding <= 0 THEN 0 ELSE fixed_interest / term_days / outstanding END
      INTO actual
      FROM (VALUES (30::numeric, 10::numeric, 50::numeric)) v(fixed_interest, term_days, outstanding);
    IF actual <> 0.06 THEN
        RAISE EXCEPTION 'fixed-date partial-balance rate: expected 0.06, got %', actual;
    END IF;

    -- Daily-installment loan: (12*10-100)/10 = 2 income per day, against 50 outstanding.
    SELECT CASE WHEN outstanding <= 0 THEN 0 ELSE (daily_payment * term_days - principal) / term_days / outstanding END
      INTO actual
      FROM (VALUES (12::numeric, 10::numeric, 100::numeric, 50::numeric)) v(daily_payment, term_days, principal, outstanding);
    IF actual <> 0.04 THEN
        RAISE EXCEPTION 'installment partial-balance rate: expected 0.04, got %', actual;
    END IF;

    -- Fully repaid/closed balances never divide by zero.
    SELECT CASE WHEN outstanding <= 0 THEN 0 ELSE daily_income / outstanding END
      INTO actual
      FROM (VALUES (10::numeric, 0::numeric)) v(daily_income, outstanding);
    IF actual <> 0 THEN
        RAISE EXCEPTION 'zero-balance rate: expected 0, got %', actual;
    END IF;
END
$$;

DO $$
DECLARE
    definition text;
BEGIN
    SELECT pg_get_viewdef('public.olap_loans_analytics'::regclass, true) INTO definition;
    IF definition NOT LIKE '%Outstanding Principal%Effective Daily Interest Rate%' THEN
        RAISE EXCEPTION 'OLAP Loans view does not expose the outstanding-principal rate expression';
    END IF;
END
$$;
