-- Synthetic rollback-only test; no live financial transactions.
BEGIN;
CREATE TEMP TABLE alias_before AS SELECT count(*) AS n FROM public."Cash Ledger";
INSERT INTO public."Cash Holders"("Row ID","Holder Name","Sort Order") VALUES ('R011-ALIAS-HOLDER','R011 synthetic holder',99);
INSERT INTO public."Cash Accounts"("Row ID","Ref Cash Holder","Account Label","Bank Name","Account Number")
VALUES ('R011-ALIAS-ACCOUNT','R011-ALIAS-HOLDER','R011 synthetic account','Test Bank','0012345678');
DO $$ BEGIN
 IF (SELECT "Alternative Account Number" FROM public."Cash Accounts" WHERE "Row ID"='R011-ALIAS-ACCOUNT') IS NOT NULL THEN
  RAISE EXCEPTION 'Old insert must leave alias null';
 END IF;
END $$;
UPDATE public."Cash Accounts" SET "Alternative Account Number"='0812345678' WHERE "Row ID"='R011-ALIAS-ACCOUNT';
DO $$ BEGIN
 IF NOT EXISTS(SELECT FROM public."Cash Accounts" WHERE "Row ID"='R011-ALIAS-ACCOUNT' AND "Account Number"='0012345678' AND "Alternative Account Number"='0812345678') THEN
  RAISE EXCEPTION 'Identifiers or leading zeroes changed';
 END IF;
 IF (SELECT count(*) FROM public."Cash Ledger")<>(SELECT n FROM alias_before) THEN RAISE EXCEPTION 'Alias edit generated ledger movement'; END IF;
END $$;
UPDATE public."Cash Accounts" SET "Alternative Account Number"=NULL WHERE "Row ID"='R011-ALIAS-ACCOUNT';
ROLLBACK;
