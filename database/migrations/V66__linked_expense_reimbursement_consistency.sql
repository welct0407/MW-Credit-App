-- A linked reimbursement already requires a positive expense paid by Tommy.
-- Keep that same invariant when either side changes, including concurrent writers.
CREATE FUNCTION public.guard_linked_expense_reimbursement() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE expense_amount numeric; expense_holder text;
BEGIN
 IF TG_TABLE_NAME='Cash Ledger' THEN
  IF NEW."Entry Origin"='Manual' AND NEW."Movement Type"='Expense Reimbursement'
   AND nullif(btrim(NEW."Ref Business Expense"),'') IS NOT NULL THEN
   -- A lock alone leaves a stale REPEATABLE READ source writer able to miss
   -- this reimbursement. Version the parent without changing its values.
   -- Row ID is excluded from the source cash trigger's UPDATE column list.
   UPDATE public."Business Expenses" e SET "Row ID"=e."Row ID"
    WHERE e."Row ID"=NEW."Ref Business Expense"
    RETURNING e."Amount"::numeric,e."Ref Paid By Cash Holder"
    INTO expense_amount,expense_holder;
   IF NOT FOUND OR (expense_amount>0 AND expense_holder='ch:tommy') IS NOT TRUE THEN
    RAISE EXCEPTION 'Linked reimbursement expense must have been paid by Tommy';
   END IF;
  END IF;
 ELSE
  -- UPDATE already locks this expense. a0_cash_account has derived its holder.
  IF (NEW."Amount",NEW."Ref Paid By Cash Holder") IS DISTINCT FROM
     (OLD."Amount",OLD."Ref Paid By Cash Holder")
   AND (NEW."Amount"::numeric>0 AND NEW."Ref Paid By Cash Holder"='ch:tommy') IS NOT TRUE
   AND EXISTS(SELECT 1 FROM public."Cash Ledger" l
    WHERE l."Ref Business Expense"=OLD."Row ID" AND l."Entry Origin"='Manual'
     AND l."Movement Type"='Expense Reimbursement') THEN
   RAISE EXCEPTION 'Correct linked reimbursement before changing expense away from a positive Tommy-paid expense';
  END IF;
 END IF;
 RETURN NEW;
END $$;

CREATE TRIGGER a1_linked_expense_reimbursement BEFORE INSERT OR UPDATE
 ON public."Cash Ledger" FOR EACH ROW EXECUTE FUNCTION public.guard_linked_expense_reimbursement();
CREATE TRIGGER a1_linked_expense_reimbursement BEFORE UPDATE
 ON public."Business Expenses" FOR EACH ROW EXECUTE FUNCTION public.guard_linked_expense_reimbursement();
