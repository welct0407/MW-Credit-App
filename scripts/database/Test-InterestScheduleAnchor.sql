\set ON_ERROR_STOP on
BEGIN;
INSERT INTO "Loans" ("Row ID","Loan Date","Interest Payment Interval")
VALUES ('ANCHOR-REGRESSION',date '2026-09-03',3);
DO $$ BEGIN
 IF (SELECT "Interest Schedule Anchor Date" IS NOT NULL FROM "Loans" WHERE "Row ID"='ANCHOR-REGRESSION') THEN
  RAISE EXCEPTION 'Existing schedule must remain the default';
 END IF;
 BEGIN
  UPDATE "Loans" SET "Interest Schedule Anchor Date"=date '2026-09-02' WHERE "Row ID"='ANCHOR-REGRESSION';
  RAISE EXCEPTION 'Invalid anchor was accepted';
 EXCEPTION WHEN check_violation THEN NULL;
 END;
END $$;
UPDATE "Loans" SET "Interest Schedule Anchor Date"=date '2026-09-14' WHERE "Row ID"='ANCHOR-REGRESSION';
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM "Loans" WHERE "Row ID"='ANCHOR-REGRESSION' AND "Loan Date"=date '2026-09-03' AND "Interest Schedule Anchor Date"=date '2026-09-14') THEN
  RAISE EXCEPTION 'Anchor update changed loan date';
 END IF;
END $$;
ROLLBACK;
