\set ON_ERROR_STOP on
-- R140 V145 upgrade route at the head (after Test-PaidDateOrder-Before.sql at V144): a row whose paid date was already before
-- its expense date stays readable and editable in unrelated fields (its cash day unchanged); changing either date applies
-- the rule; a later paid date row behaves as before.
-- The fixture was written on the Bangkok business date (Test-PaidDateOrder-Before.sql); read current_date the same way, or
-- the route fails between 17:00 and 24:00 UTC, when the UTC date is a day behind.
SET TIME ZONE 'Asia/Bangkok';
BEGIN;
CREATE FUNCTION pg_temp.pdo_reject(command text,expected text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN BEGIN EXECUTE command; EXCEPTION WHEN OTHERS THEN IF position(expected in SQLERRM)=0 THEN RAISE; END IF; RETURN; END;
 RAISE EXCEPTION 'Expected rejection: %',expected; END $$;
DO $$ BEGIN
 IF (SELECT "Movement Date" FROM "Cash Ledger" WHERE "Ref Business Expense"='PDO-EARLY')<>current_date-5 THEN RAISE EXCEPTION 'FAILED: the existing row lost its cash day'; END IF;
END $$;
UPDATE "Business Expenses" SET "Notes"='edited after V145',"Amount"=41::money WHERE "Row ID"='PDO-EARLY';
SET CONSTRAINTS ALL IMMEDIATE;
DO $$ BEGIN
 IF (SELECT "Notes"<>'edited after V145' OR "Paid Date"<>current_date-5 FROM "Business Expenses" WHERE "Row ID"='PDO-EARLY') THEN RAISE EXCEPTION 'FAILED: the unrelated edit'; END IF;
 IF (SELECT "Movement Date"<>current_date-5 OR "Amount"<>41 FROM "Cash Ledger" WHERE "Ref Business Expense"='PDO-EARLY') THEN RAISE EXCEPTION 'FAILED: the cash row after the unrelated edit'; END IF;
END $$;
SELECT pg_temp.pdo_reject($q$UPDATE "Business Expenses" SET "Expense Date"=current_date-2 WHERE "Row ID"='PDO-EARLY'$q$,'A paid date cannot be before the expense date');
SELECT pg_temp.pdo_reject($q$UPDATE "Business Expenses" SET "Paid Date"=current_date-4 WHERE "Row ID"='PDO-EARLY'$q$,'A paid date cannot be before the expense date');
UPDATE "Business Expenses" SET "Paid Date"=current_date-3 WHERE "Row ID"='PDO-EARLY';
UPDATE "Business Expenses" SET "Expense Date"=current_date-4 WHERE "Row ID"='PDO-LATER';
SET CONSTRAINTS ALL IMMEDIATE;
DO $$ BEGIN
 IF (SELECT "Movement Date" FROM "Cash Ledger" WHERE "Ref Business Expense"='PDO-EARLY')<>current_date-3 THEN RAISE EXCEPTION 'FAILED: corrected paid date'; END IF;
 IF (SELECT "Movement Date" FROM "Cash Ledger" WHERE "Ref Business Expense"='PDO-LATER')<>current_date-3 THEN RAISE EXCEPTION 'FAILED: the later row'; END IF;
END $$;
SELECT 'Paid date order upgrade route passed' AS result;
ROLLBACK;
