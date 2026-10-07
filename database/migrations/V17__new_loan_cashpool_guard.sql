-- R002: new-loan gross principal may use contributed capital only.
-- No historical backfill, new business columns or changes to existing loans.
-- Retain the existing Total Cash Pool semantics: all signed contributions,
-- no date/status/borrower-visibility filter, and no retained interest/profit.
CREATE FUNCTION public.loan_cashpool_lock() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF NOT pg_try_advisory_xact_lock(9162026,2) THEN
  RAISE EXCEPTION 'Cashpool is busy; sync and retry' USING ERRCODE='55P03';
 END IF;
 RETURN NULL;
END $$;

-- Include repayments because rollup refresh is deferred and principal may be
-- returned/reversed in a transaction that also creates a loan. Try-lock avoids
-- waiting in the opposite order to existing borrower/expense locks.
CREATE TRIGGER aa_cashpool_lock BEFORE INSERT OR UPDATE OR DELETE ON public."Loans"
 FOR EACH STATEMENT EXECUTE FUNCTION public.loan_cashpool_lock();
CREATE TRIGGER aa_cashpool_lock BEFORE INSERT OR UPDATE OR DELETE ON public."Repayments"
 FOR EACH STATEMENT EXECUTE FUNCTION public.loan_cashpool_lock();
CREATE TRIGGER aa_cashpool_lock BEFORE INSERT OR UPDATE OR DELETE ON public."Cash Pool Contributions"
 FOR EACH STATEMENT EXECUTE FUNCTION public.loan_cashpool_lock();

CREATE FUNCTION public.new_loan_cashpool_guard() RETURNS trigger
LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog,public AS $$
DECLARE pool numeric; outstanding numeric; available numeric;
BEGIN
 -- A pre-existing repeatable snapshot cannot establish current capacity.
 IF current_setting('transaction_isolation') <> 'read committed' THEN
  RAISE EXCEPTION 'New loan cashpool check requires READ COMMITTED; sync and retry';
 END IF;
 IF NEW."Principal Amount" IS NULL OR NEW."Principal Amount"::numeric<=0 THEN
  RAISE EXCEPTION 'New loan principal must be greater than zero' USING ERRCODE='23514';
 END IF;
 SELECT coalesce(sum(CASE WHEN "Transaction Type"='Contribution'
  THEN "Amount"::numeric ELSE -"Amount"::numeric END),0) INTO pool
 FROM public."Cash Pool Contributions";
 -- Canonical ledger, equivalent to SUM(Loans[Outstanding Principal]); includes
 -- this transaction's earlier rows even before deferred caches are refreshed.
 SELECT coalesce(sum(coalesce(l."Principal Amount"::numeric,0)),0)
  - coalesce((SELECT sum(r."Principal Paid"::numeric) FROM public."Repayments" r
     JOIN public."Loans" x ON x."Row ID"=r."Ref Loans"),0)
 INTO outstanding FROM public."Loans" l;
 available:=pool-outstanding;
 IF NEW."Principal Amount"::numeric>available THEN
  RAISE EXCEPTION 'New loan exceeds available cashpool. Principal: %; available: %. Reduce the amount or add contributed capital, then sync and retry.',
   NEW."Principal Amount"::numeric,available USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER ab_new_loan_cashpool_guard BEFORE INSERT ON public."Loans"
 FOR EACH ROW EXECUTE FUNCTION public.new_loan_cashpool_guard();
