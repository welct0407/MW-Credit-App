-- R011: persistent operational note owned by the borrower, not a daily charge.
-- Additive and optional: older app definitions and OLAP views remain compatible.
ALTER TABLE public."Borrowers" ADD COLUMN "Borrower Note" text;
COMMENT ON COLUMN public."Borrowers"."Borrower Note" IS
 'Optional persistent borrower note, edited in OLTP collection detail. Informational only; does not change payment terms or balances.';
