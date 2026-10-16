-- DB-ACCESS-08 (V93): the cash-ledger projection runs as mw_ledger_owner_dev (SECURITY DEFINER);
-- no DML role writes "Cash Ledger" directly. Runs at the migration head as the superuser in a
-- disposable cluster, inside one rolled-back transaction: the DEV capability grants that the
-- operator policy provides live are emulated here, the PROD reviewer's pre-V93 grants are restored
-- and V93 is applied a second time (idempotent re-run proof), then each role is exercised.
\set ON_ERROR_STOP on
BEGIN;
\ir Test-CashAccountFixtures.sql
INSERT INTO "Borrowers"("Row ID","Borrower Name") VALUES('W4-B','Synthetic W4') ON CONFLICT DO NOTHING;
INSERT INTO "Partners"("Row ID","Partner Role") VALUES('W4-A','A'),('W4-PB','B') ON CONFLICT DO NOTHING;
INSERT INTO "Cash Pool Contributions"("Row ID","Ref Partner","Contribution Date","Transaction Type","Amount") VALUES('W4-CA','W4-A',current_date-30,'Contribution',10000::money),('W4-CB','W4-PB',current_date-30,'Contribution',10000::money) ON CONFLICT DO NOTHING;
-- DEV capability as the operator policy grants it (app-role-policy.mjs): every table, read-only protected ones.
GRANT USAGE ON SCHEMA public TO mw_app_dev; GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO mw_app_dev; GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO mw_app_dev;
REVOKE INSERT,UPDATE,DELETE ON "Cash Ledger",pwa_payment_commands,r005_cash_cutover_sources,r008_cash_account_cutover FROM mw_app_dev;
-- PROD reviewer shape before V93 (configure-reviewer-dml.py as of W3) including the retired ledger DML.
GRANT USAGE ON SCHEMA public TO mw_reviewer_dml; GRANT SELECT ON ALL TABLES IN SCHEMA public TO mw_reviewer_dml;
GRANT INSERT,UPDATE ON "Borrowers","Loans","Charges","Repayments","Payments","Business Expenses","Settlements","Cash Ledger","Cash Pool Contributions","Payment Allocations" TO mw_reviewer_dml; GRANT DELETE ON "Cash Ledger" TO mw_reviewer_dml;
GRANT UPDATE ("Account Label") ON "Cash Accounts" TO mw_reviewer_dml; GRANT UPDATE ("Holder Name") ON "Cash Holders" TO mw_reviewer_dml;
-- Second apply at the head: only "already exists" notices, and the ledger DML above is removed again.
\ir ../../database/migrations/V93__review_wave4_hygiene.sql
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM unnest(ARRAY['INSERT','UPDATE','DELETE']) p WHERE has_table_privilege('mw_reviewer_dml','public."Cash Ledger"',p) OR has_table_privilege('mw_app_dev','public."Cash Ledger"',p)) THEN RAISE EXCEPTION 'Direct ledger DML survived V93'; END IF;
 IF NOT has_column_privilege('mw_reviewer_dml','public."Cash Ledger"','Created At','UPDATE') THEN RAISE EXCEPTION 'Reviewer lock-only column grant missing'; END IF;
 IF (SELECT string_agg(p,',' ORDER BY p) FROM unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE']) p WHERE has_table_privilege('mw_app_dev_journal_owner','public."Cash Ledger"',p))<>'DELETE,INSERT,SELECT,UPDATE' THEN RAISE EXCEPTION 'Journal owner must keep ledger DML for governed commands'; END IF;
 IF NOT (SELECT prosecdef AND pg_get_userbyid(proowner)='mw_ledger_owner_dev' AND 'search_path=pg_catalog, public'=ANY(proconfig) FROM pg_proc WHERE oid='public.sync_cash_ledger(text,text)'::regprocedure) THEN RAISE EXCEPTION 'sync_cash_ledger is not the ledger owner''s pinned definer'; END IF;
 IF has_function_privilege('mw-credit-app-read-dev@clever-oasis-508610-n7.iam','public.sync_cash_ledger(text,text)','EXECUTE') OR NOT has_function_privilege('mw-credit-app-command-dev@clever-oasis-508610-n7.iam','public.sync_cash_ledger(text,text)','EXECUTE') THEN RAISE EXCEPTION 'sync_cash_ledger EXECUTE must follow the capability membership'; END IF;
END $$;

-- A. application role: each source table projects into the ledger through the definer.
SET SESSION AUTHORIZATION mw_app_dev;
INSERT INTO "Loans"("Ref Disbursed From Cash Account","Row ID","Ref Borrowers","Loan Date","Principal Amount","Loan Status","Loan Type","Auto Charge Enabled") VALUES('CI-LISA','W4-L','W4-B',current_date-10,1000::money,'ยังไม่ปิดยอด','กำหนดวันชำระ',false);
UPDATE "Loans" SET "Principal Amount"=1200::money WHERE "Row ID"='W4-L';
INSERT INTO "Business Expenses"("Row ID","Expense Date","Expense Category","Amount","Ref Paid By Cash Account","Ref Paid By Cash Holder") VALUES('W4-E',current_date-1,'Other',20::money,'CI-LISA','ch:lisa');
INSERT INTO "Business Expenses"("Row ID","Expense Date","Expense Category","Amount","Ref Paid By Cash Account","Ref Paid By Cash Holder","Notes") VALUES('W4-I',current_date-2,'Other',(-200)::money,'CI-LISA','ch:lisa','synthetic income for settlement headroom');
INSERT INTO "Settlements"("Row ID","Ref Partner","Amount","Status","Settlement Date","Ref Paid From Cash Account") VALUES('W4-S','W4-A',10::money,'Pending',current_date,'CI-LISA');
UPDATE "Settlements" SET "Status"='Completed',"Transfer Date"=current_date WHERE "Row ID"='W4-S';
DO $$ DECLARE got text; BEGIN
 SELECT string_agg("Row ID"||'='||"Amount"::numeric::text,' ' ORDER BY "Row ID") INTO got FROM "Cash Ledger" WHERE "Row ID" LIKE 'cash:%W4-%';
 IF got IS DISTINCT FROM 'cash:EXPENSE:W4-E=20.00 cash:EXPENSE:W4-I=200.00 cash:LOAN:W4-L=1200.00 cash:SETTLEMENT:W4-S=10.00' THEN RAISE EXCEPTION 'Ledger projection by the application role differs: %',got; END IF;
 IF EXISTS(SELECT 1 FROM "Cash Ledger" WHERE "Row ID" LIKE 'cash:%W4-%' AND "Entry Origin"<>'System') THEN RAISE EXCEPTION 'Projected rows must be System entries'; END IF;
 -- Direct ledger writes and direct definer calls are refused.
 BEGIN INSERT INTO "Cash Ledger"("Row ID","Movement Date","Movement Type","Amount","Ref From Cash Holder","Ref To Cash Holder") VALUES('W4-X',current_date,'Cash Handover',1,'ch:dad','ch:lisa'); RAISE EXCEPTION 'app insert allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN UPDATE "Cash Ledger" SET "Amount"=1 WHERE "Row ID"='cash:LOAN:W4-L'; RAISE EXCEPTION 'app update allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN DELETE FROM "Cash Ledger" WHERE "Row ID"='cash:LOAN:W4-L'; RAISE EXCEPTION 'app delete allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM public.sync_cash_ledger('Loan','W4-L'); RAISE EXCEPTION 'direct call allowed'; EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'Cash synchronization requires a source trigger' THEN RAISE; END IF; END;
 -- Known consequence (A-design §0, decision 4): a direct source DELETE by the application role stops at the ledger cleanup.
 BEGIN DELETE FROM "Business Expenses" WHERE "Row ID"='W4-E'; RAISE EXCEPTION 'direct source delete reached the ledger'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET SESSION AUTHORIZATION;

-- Synthetic receipt for the V94 reviewer decision: a charge on W4-L and a processing lump-sum receipt.
INSERT INTO "Charges"("Row ID","Ref Loans","Charge Date","Principal Due","Interest Due") VALUES('W4-C','W4-L',current_date-2,0::money,100::money);
INSERT INTO "Payments"("Row ID","Ref Borrower","Status","Amount Received","Payment Date","Allocation Method","Ref Target Charge","Ref Received By Cash Account") VALUES('W4-P','W4-B','Processing',50::money,current_date,'Lump Sum',NULL,'CI-DAD');
SET CONSTRAINTS ALL IMMEDIATE;

-- B. reviewer role: a source edit re-syncs, the lock-only column locks, nothing writes the ledger.
SET SESSION AUTHORIZATION mw_reviewer_dml;
SELECT agent_audit.begin_operation('0b9d0b9d-0b9d-4b9d-8b9d-0b9d0b9d0b9d','synthetic-reviewer','synthetic@example.invalid',repeat('0',64),'W4 ledger access regression','[]'::jsonb,'w4');
UPDATE "Loans" SET "Principal Amount"=1300::money WHERE "Row ID"='W4-L';
-- V94 owner decision: a metadata-only receipt edit passes; a payment-input edit fails closed (42501, named reason) and writes nothing.
UPDATE "Payments" SET "Notes"='reviewer metadata note' WHERE "Row ID"='W4-P';
DO $$ BEGIN
 IF (SELECT "Notes" FROM "Payments" WHERE "Row ID"='W4-P') IS DISTINCT FROM 'reviewer metadata note' THEN RAISE EXCEPTION 'Reviewer metadata-only payment edit did not apply'; END IF;
 BEGIN UPDATE "Payments" SET "Amount Received"=60::money WHERE "Row ID"='W4-P'; RAISE EXCEPTION 'reviewer payment input edit allowed';
 EXCEPTION WHEN insufficient_privilege THEN IF SQLERRM<>'Payment input corrections require the native payment command' THEN RAISE; END IF; END;
 IF (SELECT "Amount Received"::numeric FROM "Payments" WHERE "Row ID"='W4-P')<>50 THEN RAISE EXCEPTION 'Rejected payment input edit left a change'; END IF;
END $$;
DO $$ DECLARE n integer; BEGIN
 IF (SELECT "Amount"::numeric FROM "Cash Ledger" WHERE "Row ID"='cash:LOAN:W4-L')<>1300 THEN RAISE EXCEPTION 'Reviewer edit did not re-sync the ledger'; END IF;
 SELECT count(*) INTO n FROM (SELECT 1 FROM "Cash Ledger" WHERE "Ref Loan"='W4-L' FOR UPDATE NOWAIT) x; IF n<>1 THEN RAISE EXCEPTION 'Reviewer row lock on the ledger failed'; END IF;
 BEGIN UPDATE "Cash Ledger" SET "Amount"=1 WHERE "Row ID"='cash:LOAN:W4-L'; RAISE EXCEPTION 'reviewer amount update allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN UPDATE "Cash Ledger" SET "Created At"="Created At"+interval '1 second' WHERE "Row ID"='cash:LOAN:W4-L'; RAISE EXCEPTION 'reviewer Created At update allowed'; EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE '%immutable%' THEN RAISE; END IF; END;
 BEGIN DELETE FROM "Cash Ledger" WHERE "Row ID"='cash:LOAN:W4-L'; RAISE EXCEPTION 'reviewer delete allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET SESSION AUTHORIZATION;
-- session_user stays the reviewer inside the definer: the agent audit captured the ledger update.
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM agent_audit.row_changes WHERE table_name='Cash Ledger' AND action='UPDATE') THEN RAISE EXCEPTION 'Agent audit missed the reviewer-driven ledger update'; END IF;
END $$;

-- C. journal owner keeps ledger DML for governed commands (no row touched).
SET SESSION AUTHORIZATION mw_app_dev_journal_owner;
DELETE FROM "Cash Ledger" WHERE "Row ID"='W4-none';
UPDATE "Cash Ledger" SET "Notes"='x' WHERE "Row ID"='W4-none';
RESET SESSION AUTHORIZATION;
SELECT 'Ledger access regression passed' AS result;
ROLLBACK;
