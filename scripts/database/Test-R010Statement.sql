\set ON_ERROR_STOP on
-- Disposable runner only. Every test write rolls back.
BEGIN;
SET LOCAL TIME ZONE 'UTC';
CREATE FUNCTION pg_temp.check10(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'R010 failed: %',label; END IF; END $$;
INSERT INTO "Partners"("Row ID","Partner Name","Partner Role","Login Email") VALUES
 ('R010-A','Synthetic English','A','r010a@example.invalid'),('R010-B','Synthetic Thai','B','r010b@example.invalid');
SELECT pg_temp.check10((SELECT count(*)=2 FROM "Cash Statement Context" WHERE "Ref Partner" LIKE 'R010-%'),'new partner seeding');
INSERT INTO "Cash Accounts"("Row ID","Ref Cash Holder","Account Label","Bank Name") VALUES
 ('R010-D1','ch:dad','Synthetic D1','Synthetic'),('R010-D2','ch:dad','Synthetic D2','Synthetic'),
 ('R010-L1','ch:lisa','Synthetic L1','Synthetic'),('R010-T1','ch:tommy','Synthetic T1','Synthetic');
CREATE TEMP TABLE dates AS SELECT (now() AT TIME ZONE 'Asia/Bangkok')::date d;
SET LOCAL r005.allow_cash_adjustment='on';
INSERT INTO "Cash Ledger"("Row ID","Movement Date","Movement Type","Amount","Ref To Cash Holder","Ref To Cash Account","Notes")
 SELECT 'R010-OLD',d-15,'Opening Balance',1000,'ch:dad','R010-D1','Synthetic' FROM dates;
SELECT initialize_cash_accounts('ch:dad','{"R010-D1":800,"R010-D2":200}','synthetic','Synthetic allocation with nonzero captured baseline');
INSERT INTO "Cash Ledger"("Row ID","Movement Date","Movement Type","Amount","Ref To Cash Holder","Ref To Cash Account","Notes")
 SELECT 'R010-BOUND',d-14,'Manual Correction',100,'ch:dad','R010-D1','Synthetic boundary' FROM dates;
INSERT INTO "Cash Ledger"("Row ID","Movement Date","Movement Type","Amount","Ref From Cash Holder","Ref To Cash Holder","Ref From Cash Account","Ref To Cash Account")
 SELECT 'R010-SAME',d,'Cash Handover',30,'ch:dad','ch:dad','R010-D1','R010-D2' FROM dates UNION ALL
 SELECT 'R010-CROSS',d,'Cash Handover',20,'ch:dad','ch:lisa','R010-D2','R010-L1' FROM dates UNION ALL
 SELECT 'R010-REIMB',d,'Expense Reimbursement',10,'ch:lisa','ch:tommy','R010-L1','R010-T1' FROM dates;
SELECT pg_temp.check10(NOT EXISTS(SELECT 1 FROM "Cash Account Statement Recent" WHERE "Source Key"='MANUAL:R010-OLD'),'date -15 excluded');
SELECT pg_temp.check10(EXISTS(SELECT 1 FROM "Cash Account Statement Recent" WHERE "Source Key"='MANUAL:R010-BOUND' AND "Balance After"=900),'date -14 and true prewindow balance');
SELECT pg_temp.check10((SELECT count(*)=2 AND sum("Signed Amount")=0 AND bool_and("Transaction Type Code"='ACCOUNT_TRANSFER') FROM "Cash Account Statement Recent" WHERE "Source Key"='MANUAL:R010-SAME'),'same holder sides');
SELECT pg_temp.check10((SELECT count(*)=2 AND sum("Signed Amount")=0 AND bool_and("Transaction Type Code"='CASH_TRANSFER') FROM "Cash Account Statement Recent" WHERE "Source Key"='MANUAL:R010-CROSS'),'cross holder sides');
SELECT pg_temp.check10((SELECT count(*)=2 AND sum("Signed Amount")=0 AND bool_and("Transaction Type Code"='EXPENSE_REIMBURSEMENT') FROM "Cash Account Statement Recent" WHERE "Source Key"='MANUAL:R010-REIMB'),'reimbursement sides');
SELECT pg_temp.check10((SELECT count(*)=60 FROM "Cash Account Daily Summary Recent"),'account x 15 grid');
SELECT pg_temp.check10((SELECT count(*)=count(DISTINCT "Row ID") FROM "Cash Account Statement Recent"),'stable unique keys');
SELECT pg_temp.check10(NOT EXISTS(SELECT 1 FROM "Cash Account Statement Recent" WHERE NOT "Is Initialized" AND "Balance After" IS NOT NULL),'unknown line balances');
SELECT pg_temp.check10(NOT EXISTS(SELECT 1 FROM "Cash Account Daily Summary Recent" WHERE NOT "Is Initialized" AND ("Opening Balance" IS NOT NULL OR "Closing Balance" IS NOT NULL)),'unknown daily balances');
SELECT pg_temp.check10(EXISTS(SELECT 1 FROM "Cash Account Daily Summary Recent",dates WHERE "Ref Cash Account"='R010-D1' AND "Statement Date"=d-1 AND "Transaction Count"=0 AND "Opening Balance"=900 AND "Closing Balance"=900),'zero movement day');
SELECT pg_temp.check10(NOT EXISTS(SELECT 1 FROM "Cash Account Daily Summary Recent" s LEFT JOIN (SELECT "Ref Cash Account","Statement Date",sum("Signed Amount") n FROM "Cash Account Statement Recent" GROUP BY 1,2) l USING("Ref Cash Account","Statement Date") WHERE s."Net Movement"<>coalesce(l.n,0) OR s."Money In"-s."Money Out"<>s."Net Movement" OR (s."Is Initialized" AND s."Opening Balance"+s."Net Movement"<>s."Closing Balance")),'daily reconciliation');
SELECT pg_temp.check10(NOT EXISTS(SELECT 1 FROM "Cash Account Daily Summary Recent" s JOIN "Cash Account Balances" b USING("Ref Cash Account"),dates WHERE s."Statement Date"=d AND s."Closing Balance" IS DISTINCT FROM b."Current Balance"),'governed current balance parity');
SELECT pg_temp.check10(NOT EXISTS(SELECT 1 FROM "Cash Account Statement Recent" WHERE "Transaction Type Code"='OTHER'),'no unknown source mapping');
-- Exercise source enrichment through real posting triggers, never fabricated system ledger rows.
INSERT INTO "Cash Pool Contributions"("Row ID","Ref Partner","Contribution Date","Transaction Type","Amount")
 SELECT 'R010-CAP','R010-A',d,'Contribution',10000::money FROM dates;
INSERT INTO "Borrowers"("Row ID","Borrower Name","Description") VALUES('R010-BOR','Synthetic Thai','Synthetic English');
INSERT INTO "Loans"("Row ID","Ref Borrowers","Loan Date","Principal Amount","Loan Type","Loan Status","Auto Charge Enabled","Current Daily Interest","Ref Disbursed From Cash Account")
 SELECT 'R010-LOAN','R010-BOR',d-2,1000::money,'ดอกเบี้ยรายวัน','ยังไม่ปิดยอด',true,10::money,'R010-L1' FROM dates;
INSERT INTO "Charges"("Row ID","Ref Loans","Charge Date","Principal Due","Interest Due")
 SELECT 'R010-CHARGE','R010-LOAN',d,0::money,50::money FROM dates;
INSERT INTO "Payments"("Row ID","Status","Ref Borrower","Amount Received","Payment Date","Allocation Method","Ref Target Charge","Ref Received By Cash Account")
 SELECT 'R010-PAY','Processing','R010-BOR',50::money,d,'Single Full','R010-CHARGE','R010-D1' FROM dates;
INSERT INTO "Business Expenses"("Row ID","Expense Date","Expense Category","Amount","Payee Name","Ref Paid By Cash Account")
 SELECT 'R010-EXP',d,'Other',5::money,'Synthetic payee','R010-L1' FROM dates;
INSERT INTO "Settlements"("Row ID","Ref Partner","Amount","Status","Settlement Date","Transfer Date","Ref Paid From Cash Account","Notes")
 SELECT 'R010-SET','R010-A',1::money,'Completed',d,d,'R010-L1','Synthetic' FROM dates;
SELECT pg_temp.check10(EXISTS(SELECT 1 FROM "Cash Account Statement Recent" WHERE "Ref Loan"='R010-LOAN' AND "Ref Borrower"='R010-BOR' AND "Transaction Type Code"='LOAN_DISBURSEMENT' AND "Signed Amount"=-1000),'loan enrichment');
SELECT pg_temp.check10(EXISTS(SELECT 1 FROM "Cash Account Statement Recent" WHERE "Ref Payment"='fd6:fd6:R010-LOAN' AND "Transaction Type Code"='FIRST_DAY_PAYMENT' AND "Ref Borrower"='R010-BOR'),'first day enrichment');
SELECT pg_temp.check10(EXISTS(SELECT 1 FROM "Cash Account Statement Recent" WHERE "Ref Payment"='R010-PAY' AND "Transaction Type Code"='LOAN_PAYMENT' AND "Signed Amount"=50),'payment enrichment');
SELECT pg_temp.check10(EXISTS(SELECT 1 FROM "Cash Account Statement Recent" WHERE "Ref Business Expense"='R010-EXP' AND "Counterparty Text"='Synthetic payee' AND "Transaction Type Code"='BUSINESS_EXPENSE'),'expense enrichment');
SELECT pg_temp.check10(EXISTS(SELECT 1 FROM "Cash Account Statement Recent" WHERE "Settlement Row ID"='R010-SET' AND "Ref Partner"='R010-A' AND "Transaction Type Code"='PARTNER_SETTLEMENT'),'settlement enrichment');
CREATE TEMP TABLE keys_before AS SELECT "Row ID" FROM "Cash Account Statement Recent";
INSERT INTO "Cash Ledger"("Row ID","Movement Date","Movement Type","Amount","Ref To Cash Holder","Ref To Cash Account","Notes")
 SELECT 'R010-CORRECT',d-15,'Manual Correction',100,'ch:dad','R010-D1','Synthetic backdated compensation' FROM dates;
SELECT pg_temp.check10(EXISTS(SELECT 1 FROM "Cash Account Statement Recent" WHERE "Source Key"='MANUAL:R010-BOUND' AND "Balance After"=1000),'prewindow correction recomputes running balance');
SELECT pg_temp.check10(NOT EXISTS((SELECT "Row ID" FROM keys_before EXCEPT SELECT "Row ID" FROM "Cash Account Statement Recent") UNION ALL (SELECT "Row ID" FROM "Cash Account Statement Recent" EXCEPT SELECT "Row ID" FROM keys_before)),'keys stable after correction');
UPDATE "Cash Statement Context" SET "Ref Cash Account"='R010-D1' WHERE "Ref Partner"='R010-A';
SELECT pg_temp.check10((SELECT "Ref Cash Account" IS NULL FROM "Cash Statement Context" WHERE "Ref Partner"='R010-B'),'independent contexts');
DELETE FROM "Partners" WHERE "Row ID"='R010-B';
SELECT pg_temp.check10(NOT EXISTS(SELECT 1 FROM "Cash Statement Context" WHERE "Ref Partner"='R010-B'),'context cleanup');
SET LOCAL TIME ZONE 'Asia/Singapore';
SELECT pg_temp.check10((SELECT max("Statement Date")=(now() AT TIME ZONE 'Asia/Bangkok')::date AND min("Statement Date")=(now() AT TIME ZONE 'Asia/Bangkok')::date-14 FROM "Cash Account Daily Summary Recent"),'Singapore session does not shift window');
SELECT pg_temp.check10(('2026-09-20 16:59:59+00'::timestamptz AT TIME ZONE 'Asia/Bangkok')::date=DATE '2026-09-20' AND ('2026-09-20 17:00:00+00'::timestamptz AT TIME ZONE 'Asia/Bangkok')::date=DATE '2026-09-21','Bangkok midnight');
ROLLBACK;
SELECT 'R010 statement synthetic tests passed' result;
