"""Build the reviewed forward candidate from immutable function definitions.

Local source generation only; never connects to a database. Refuses an existing
migration. The resulting SQL, rather than this generator, is the deployment input.
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def function(version, name):
    source = next((ROOT / "database/migrations").glob(f"V{version}__*.sql")).read_text(encoding="utf-8")
    start = source.index(f"FUNCTION {name}(")
    start = source.rfind("CREATE", 0, start)
    end = source.index("$$;", start) + 3
    return source[start:end].replace("CREATE FUNCTION", "CREATE OR REPLACE FUNCTION", 1)


def build():
    ledger = function(60, "public.guard_cash_ledger")
    detach = '''
 -- A parent expense deletion only unlinks its independent reimbursement.
 -- Retain the actual transfer, accounts, amount, date and original audit fields.
 IF TG_OP='UPDATE' AND pg_trigger_depth()>1
  AND OLD."Entry Origin"='Manual' AND OLD."Movement Type"='Expense Reimbursement'
  AND OLD."Ref Business Expense" IS NOT NULL AND NEW."Ref Business Expense" IS NULL
  AND (to_jsonb(NEW)-'Ref Business Expense')=(to_jsonb(OLD)-'Ref Business Expense')
  AND NOT EXISTS(SELECT 1 FROM public."Business Expenses" WHERE "Row ID"=OLD."Ref Business Expense") THEN
  NEW."Notes":=concat_ws(E'\\n',nullif(OLD."Notes",''),'R051: original expense deleted; retained reimbursement source ID: '||OLD."Ref Business Expense");
  NEW."Updated At":=clock_timestamp() AT TIME ZONE 'Asia/Bangkok';
  RETURN NEW;
 END IF;
'''
    ledger = ledger.replace("BEGIN\n", "BEGIN\n" + detach, 1)
    preserve = '''
 -- FK unlink after borrower deletion preserves the last assessment snapshot.
 IF TG_OP='UPDATE' AND pg_trigger_depth()>1 AND OLD."Ref Borrower" IS NOT NULL
  AND NEW."Ref Borrower" IS NULL
  AND (to_jsonb(NEW)-'Ref Borrower')=(to_jsonb(OLD)-'Ref Borrower')
  AND NOT EXISTS(SELECT 1 FROM public."Borrowers" WHERE "Row ID"=OLD."Ref Borrower") THEN
  RETURN NEW;
 END IF;
'''
    calculations = [function(1, name).replace("BEGIN\n", "BEGIN\n" + preserve, 1)
                    for name in ("assessment_lab.calculate_row", "assessment_lab.stamp_inputs")]
    sql = '''-- R051 owner decisions, 6 October 2026: retain reimbursement transfers
-- when their expense is deleted; optional assessments do not own borrowers.
-- No financial backfill, grants, new columns, source deletion, or restrictive views.
ALTER TABLE public."Cash Ledger" DROP CONSTRAINT "Cash Ledger_Ref Business Expense_fkey";
ALTER TABLE public."Cash Ledger" ADD CONSTRAINT "Cash Ledger_Ref Business Expense_fkey"
 FOREIGN KEY ("Ref Business Expense") REFERENCES public."Business Expenses"("Row ID") ON DELETE SET NULL;

ALTER TABLE public."Loan Assessment" DROP CONSTRAINT appsheet_ref_07;
ALTER TABLE public."Loan Assessment" ADD CONSTRAINT appsheet_ref_07
 FOREIGN KEY ("Ref Borrower") REFERENCES public."Borrowers"("Row ID") ON DELETE SET NULL;

-- Existing SQL-lab history may already contain an unlinked/deleted borrower.
-- NOT VALID preserves those rows while enforcing future writes and FK unlinks.
ALTER TABLE public."Loan Assessment SQL Lab" ADD CONSTRAINT r051_assessment_borrower
 FOREIGN KEY ("Ref Borrower") REFERENCES public."Borrowers"("Row ID") ON DELETE SET NULL NOT VALID;

'''
    sql += ledger + "\n\n" + "\n\n".join(calculations) + "\n"
    target = ROOT / "database/migrations/V71__retain_reimbursement_and_optional_assessment_history.sql"
    with target.open("x", encoding="utf-8", newline="\n") as output:
        output.write(sql)


if __name__ == "__main__":
    build()
