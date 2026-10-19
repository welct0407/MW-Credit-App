-- V97 (R078 item 7): the PWA change log under the real roles, at the migration head, in a disposable
-- cluster (Test-AppRolePrerequisites.sql provides mw_changes_owner_dev). One rolled-back transaction.
-- The DEV capability grants that the operator policy provides live are emulated (app-role-policy.mjs:
-- every table, read-only protected relations incl. pwa_row_changes), then each DML kind, each writer
-- role and the hourly retention are exercised. Trigger placement is asserted by Test-TriggerOrder.sql.
\set ON_ERROR_STOP on
BEGIN;
GRANT USAGE ON SCHEMA public TO mw_app_dev; GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO mw_app_dev; GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO mw_app_dev;
REVOKE INSERT,UPDATE,DELETE ON "Cash Ledger",pwa_payment_commands,r005_cash_cutover_sources,r008_cash_account_cutover,pwa_row_changes FROM mw_app_dev;
REVOKE USAGE,UPDATE ON SEQUENCE pwa_row_changes_seq_seq FROM mw_app_dev;
-- Source-table writers other than the capability, with their source DML (reviewer shape as configure-reviewer-dml.py).
GRANT USAGE ON SCHEMA public TO mw_reviewer_dml; GRANT SELECT ON ALL TABLES IN SCHEMA public TO mw_reviewer_dml;
GRANT INSERT,UPDATE ON "Borrowers" TO mw_reviewer_dml;
CREATE TEMP TABLE rc_mark ON COMMIT DROP AS SELECT coalesce(max(seq),0) AS seq FROM public.pwa_row_changes;
GRANT SELECT ON rc_mark TO PUBLIC;
CREATE FUNCTION pg_temp.rc_since() RETURNS text LANGUAGE sql AS
 $$SELECT coalesce(string_agg(table_name||':'||row_key,' ' ORDER BY seq),'') FROM public.pwa_row_changes WHERE seq>(SELECT seq FROM rc_mark)$$;
GRANT EXECUTE ON FUNCTION pg_temp.rc_since() TO PUBLIC;

-- A. Each DML kind by the application capability records one change through the definer; an identical
-- UPDATE records nothing; a key change records the old and the new key; txid and changed_at are set.
SET SESSION AUTHORIZATION mw_app_dev;
INSERT INTO "Borrowers"("Row ID","Borrower Name") VALUES('RC-B1','Synthetic change log');
UPDATE "Borrowers" SET "Borrower Note"='edited' WHERE "Row ID"='RC-B1';
UPDATE "Borrowers" SET "Borrower Note"='edited' WHERE "Row ID"='RC-B1';
UPDATE "Borrowers" SET "Row ID"='RC-B2' WHERE "Row ID"='RC-B1';
DELETE FROM "Borrowers" WHERE "Row ID"='RC-B2';
DO $$ DECLARE got text:=pg_temp.rc_since(); BEGIN
 IF got IS DISTINCT FROM 'Borrowers:RC-B1 Borrowers:RC-B1 Borrowers:RC-B1 Borrowers:RC-B2 Borrowers:RC-B2' THEN RAISE EXCEPTION 'Change log by DML kind differs: %',got; END IF;
 IF EXISTS(SELECT 1 FROM public.pwa_row_changes WHERE seq>(SELECT seq FROM rc_mark) AND (txid<>pg_current_xact_id() OR changed_at>clock_timestamp() OR changed_at<now())) THEN RAISE EXCEPTION 'txid/changed_at not recorded from the writing transaction'; END IF;
END $$;
-- B. The capability reads the log and cannot write it, re-own it, call the retention or attach the trigger.
DO $$ BEGIN
 PERFORM max(seq) FROM public.pwa_row_changes;
 BEGIN INSERT INTO public.pwa_row_changes(table_name,row_key) VALUES('Borrowers','forged'); RAISE EXCEPTION 'app insert allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN UPDATE public.pwa_row_changes SET row_key='forged'; RAISE EXCEPTION 'app update allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN DELETE FROM public.pwa_row_changes; RAISE EXCEPTION 'app delete allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN TRUNCATE public.pwa_row_changes; RAISE EXCEPTION 'app truncate allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM nextval('public.pwa_row_changes_seq_seq'); RAISE EXCEPTION 'app nextval allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM public.pwa_row_changes_prune_v1(); RAISE EXCEPTION 'app retention allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET SESSION AUTHORIZATION;
-- C. Other source-table writers: the journal owner (governed commands) and the reviewer DML role write
-- sources (recorded through the definer) but cannot write the log directly.
SET SESSION AUTHORIZATION mw_app_dev_journal_owner;
DO $$ BEGIN
 BEGIN INSERT INTO public.pwa_row_changes(table_name,row_key) VALUES('Payments','forged'); RAISE EXCEPTION 'journal owner insert allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN DELETE FROM public.pwa_row_changes; RAISE EXCEPTION 'journal owner delete allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET SESSION AUTHORIZATION;
SET SESSION AUTHORIZATION mw_reviewer_dml;
SELECT agent_audit.begin_operation('0c970c97-0c97-4c97-8c97-0c970c970c97','synthetic-reviewer','synthetic@example.invalid',repeat('0',64),'V97 change log regression','[]'::jsonb,'v97');
INSERT INTO "Borrowers"("Row ID","Borrower Name") VALUES('RC-B3','Synthetic reviewer write');
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.pwa_row_changes WHERE table_name='Borrowers' AND row_key='RC-B3') THEN RAISE EXCEPTION 'reviewer source write not recorded'; END IF;
 BEGIN INSERT INTO public.pwa_row_changes(table_name,row_key) VALUES('Borrowers','forged'); RAISE EXCEPTION 'reviewer insert allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN UPDATE public.pwa_row_changes SET row_key='forged'; RAISE EXCEPTION 'reviewer update allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET SESSION AUTHORIZATION;
-- D. The jobs owner (hourly job) runs the retention but cannot write the log directly.
SET SESSION AUTHORIZATION mw_jobs_owner_dev;
DO $$ BEGIN
 BEGIN INSERT INTO public.pwa_row_changes(table_name,row_key) VALUES('Statistics','forged'); RAISE EXCEPTION 'jobs owner insert allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET SESSION AUTHORIZATION;
-- E. Every tracked table records an INSERT under its primary-key column (the superuser stands in for each
-- table's real writer; the trigger is the same for all). Non-"Row ID" keys: r008 and pwa_payment_commands.
\ir Test-CashAccountFixtures.sql
DELETE FROM public.pwa_row_changes WHERE seq>(SELECT seq FROM rc_mark);
INSERT INTO "Borrowers"("Row ID","Borrower Name") VALUES('RC-B','Synthetic RC');
INSERT INTO "Partners"("Row ID","Partner Role") VALUES('RC-A','A');
INSERT INTO "Cash Pool Contributions"("Row ID","Ref Partner","Contribution Date","Transaction Type","Amount") VALUES('RC-CP','RC-A',current_date-30,'Contribution',10000::money);
INSERT INTO "Loans"("Ref Disbursed From Cash Account","Row ID","Ref Borrowers","Loan Date","Principal Amount","Loan Status","Loan Type","Auto Charge Enabled") VALUES('CI-LISA','RC-L','RC-B',current_date-10,1000::money,'ยังไม่ปิดยอด','กำหนดวันชำระ',false);
INSERT INTO "Charges"("Row ID","Ref Loans","Charge Date","Principal Due","Interest Due") VALUES('RC-C','RC-L',current_date-2,100::money,10::money);
INSERT INTO "Payments"("Ref Received By Cash Account","Row ID","Status","Ref Borrower","Amount Received","Payment Date","Allocation Method") VALUES('CI-DAD','RC-P','Processing','RC-B',50::money,current_date,'Lump Sum');
INSERT INTO "Business Expenses"("Row ID","Expense Date","Expense Category","Amount","Ref Paid By Cash Account","Ref Paid By Cash Holder","Notes") VALUES('RC-I',current_date-2,'Other',(-200)::money,'CI-LISA','ch:lisa','synthetic income for settlement headroom');
INSERT INTO "Settlements"("Row ID","Ref Partner","Amount","Status","Settlement Date","Ref Paid From Cash Account") VALUES('RC-S','RC-A',10::money,'Pending',current_date,'CI-LISA');
SET CONSTRAINTS ALL IMMEDIATE;
DO $$ DECLARE missing text[]; extra text[]; BEGIN
 -- Tables whose rows the fixtures above insert directly or through the existing triggers (ledger projection,
 -- lump-sum allocation/repayment, cash account and holder fixtures).
 missing:=ARRAY(SELECT v.t FROM (VALUES ('Borrowers'),('Partners'),('Cash Pool Contributions'),('Loans'),('Charges'),('Payments'),('Payment Allocations'),('Repayments'),
   ('Business Expenses'),('Settlements'),('Cash Ledger'),('Cash Statement Context')) v(t) WHERE NOT EXISTS(SELECT 1 FROM public.pwa_row_changes c WHERE c.seq>(SELECT seq FROM rc_mark) AND c.table_name=v.t));
 IF cardinality(missing)>0 THEN RAISE EXCEPTION 'No change recorded for %',missing; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.pwa_row_changes WHERE seq>(SELECT seq FROM rc_mark) AND table_name='Cash Ledger' AND row_key='cash:LOAN:RC-L') THEN RAISE EXCEPTION 'ledger projection (definer inside definer) not recorded'; END IF;
 -- Cash Statement Context is keyed by "Ref Partner" and seeded by the Partners trigger.
 IF NOT EXISTS(SELECT 1 FROM public.pwa_row_changes WHERE seq>(SELECT seq FROM rc_mark) AND table_name='Cash Statement Context' AND row_key='RC-A') THEN RAISE EXCEPTION 'Cash Statement Context seed not recorded under Ref Partner'; END IF;
END $$;
INSERT INTO "Cash Holders"("Row ID","Holder Name","Sort Order") VALUES('ch:rc','Synthetic RC holder',99);
INSERT INTO "Cash Accounts"("Row ID","Ref Cash Holder","Account Label","Bank Name") VALUES('RC-ACC','ch:rc','Synthetic RC account','Synthetic');
SET LOCAL r008.initializing='on'; -- the controlled initializer's flag, only for this synthetic opening
INSERT INTO r008_cash_account_cutover("Ref Cash Account","Cutover At","Opening Balance","Baseline Cash In","Baseline Cash Out","Created By","Notes") VALUES('RC-ACC',clock_timestamp(),0,0,0,'synthetic','synthetic');
SET LOCAL r008.initializing='off';
INSERT INTO "Statistics"("Row ID") VALUES('RC-ST');
INSERT INTO "Daily Analytics"("Row ID","Snapshot Date") VALUES('RC-DA',current_date-400);
INSERT INTO "Loan Assessment SQL Lab"("Row ID") VALUES('RC-LA');
DO $$ DECLARE got text; BEGIN
 SELECT string_agg(table_name||':'||row_key,' ' ORDER BY seq) INTO got FROM public.pwa_row_changes WHERE seq>(SELECT seq FROM rc_mark) AND row_key IN ('ch:rc','RC-ACC','RC-ST','RC-DA','RC-LA');
 IF got IS DISTINCT FROM 'Cash Holders:ch:rc Cash Accounts:RC-ACC r008_cash_account_cutover:RC-ACC Statistics:RC-ST Daily Analytics:RC-DA Loan Assessment SQL Lab:RC-LA' THEN RAISE EXCEPTION 'Change log for keyed tables differs: %',got; END IF;
END $$;

-- F. Retention (hourly job): rows older than 7 days go, newer rows stay, the newest row always stays.
UPDATE public.pwa_row_changes SET changed_at=clock_timestamp()-interval '8 days';
INSERT INTO "Borrowers"("Row ID","Borrower Name") VALUES('RC-NEW','Synthetic recent');
DO $$ DECLARE newest bigint; removed bigint; BEGIN
 SELECT max(seq) INTO newest FROM public.pwa_row_changes;
 SET LOCAL ROLE mw_jobs_owner_dev; removed:=public.pwa_row_changes_prune_v1(); RESET ROLE;
 IF removed<1 OR (SELECT count(*) FROM public.pwa_row_changes)<>1 OR (SELECT max(seq) FROM public.pwa_row_changes)<>newest THEN RAISE EXCEPTION 'retention removed % and kept %',removed,(SELECT count(*) FROM public.pwa_row_changes); END IF;
 UPDATE public.pwa_row_changes SET changed_at=clock_timestamp()-interval '30 days';
 SET LOCAL ROLE mw_jobs_owner_dev; removed:=public.pwa_row_changes_prune_v1(); RESET ROLE;
 IF removed<>0 OR (SELECT max(seq) FROM public.pwa_row_changes)<>newest THEN RAISE EXCEPTION 'retention must keep the newest row as the cursor'; END IF;
 -- The hourly job calls it from the recent-analytics branch only.
 IF position('ELSE affected:=public.refresh_daily_analytics($2-1,$2); PERFORM public.pwa_row_changes_prune_v1(); END IF;' in (SELECT prosrc FROM pg_proc WHERE oid='public.pwa_job_run_v1(text,date,text)'::regprocedure))=0 THEN
  RAISE EXCEPTION 'pwa_job_run_v1 does not run the change-log retention'; END IF;
END $$;
SELECT 'Row change log regression passed' AS result;
ROLLBACK;
