\set ON_ERROR_STOP on
-- R140 V145 upgrade route, state at V144 (disposable cluster only; synthetic rows): a paid manual expense whose paid date is
-- before its expense date (allowed before V145) and one whose paid date is after it.
SET TIME ZONE 'Asia/Bangkok';
\ir Test-CashAccountFixtures.sql
INSERT INTO "Partners"("Row ID","Partner Role") VALUES('PDO-A','A'),('PDO-B','B');
INSERT INTO "Cash Pool Contributions"("Row ID","Ref Partner","Contribution Date","Transaction Type","Amount") VALUES
 ('PDO-CA','PDO-A',current_date-30,'Contribution',60000::money),('PDO-CB','PDO-B',current_date-30,'Contribution',40000::money);
INSERT INTO "Business Expenses"("Row ID","Expense Date","Expense Category","Amount","Ref Paid By Cash Account","Paid Date") VALUES
 ('PDO-EARLY',current_date-3,'Other',40::money,'CI-DAD',current_date-5),('PDO-LATER',current_date-5,'Other',60::money,'CI-DAD',current_date-3);
