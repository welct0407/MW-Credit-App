-- Disposable-only metadata/constraint rehearsal, never a live data test.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL timezone='Asia/Bangkok';
\ir Test-CashAccountFixtures.sql
CREATE FUNCTION pg_temp.flag67_assert(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'Receipt flag representation: %',label; END IF; END $$;
CREATE FUNCTION pg_temp.flag67_reject(command text,expected_state text,expected_constraint text DEFAULT NULL) RETURNS void LANGUAGE plpgsql AS $$
DECLARE actual_constraint text;
BEGIN BEGIN EXECUTE command; EXCEPTION WHEN OTHERS THEN
 GET STACKED DIAGNOSTICS actual_constraint=CONSTRAINT_NAME;
 IF SQLSTATE<>expected_state OR (expected_constraint IS NOT NULL AND actual_constraint<>expected_constraint) THEN RAISE; END IF; RETURN;
 END; RAISE EXCEPTION 'Expected SQLSTATE %',expected_state; END $$;
INSERT INTO "Partners"("Row ID","Partner Role") VALUES('FLAG67-A','A');
INSERT INTO "Cash Pool Contributions"("Row ID","Ref Partner","Contribution Date","Transaction Type","Amount")
 VALUES('FLAG67-FUND','FLAG67-A',current_date-2,'Contribution',1000::money);
INSERT INTO "Borrowers"("Row ID","Borrower Name") VALUES('FLAG67-B','Synthetic flag metadata');
INSERT INTO "Loans"("Row ID","Ref Borrowers","Loan Date","Principal Amount","Loan Status","Loan Type","Auto Charge Enabled","Ref Disbursed From Cash Account")
 VALUES('FLAG67-L','FLAG67-B',current_date-1,100::money,'ยังไม่ปิดยอด','กำหนดวันชำระ',false,'CI-LISA');
INSERT INTO "Charges"("Row ID","Ref Loans","Charge Date","Principal Due","Interest Due") VALUES('FLAG67-C','FLAG67-L',current_date,100::money,10::money);
INSERT INTO "Payments"("Row ID","Ref Borrower","Payment Date","Amount Received","Allocation Method","Status","Ref Target Charge","Ref Received By Cash Account")
 VALUES('FLAG67-P','FLAG67-B',current_date,2::money,'Single Partial','Processing','FLAG67-C','CI-DAD');
INSERT INTO "Payments"("Row ID","Ref Borrower","Payment Date","Amount Received","Allocation Method","Status","Ref Target Charge","Ref Received By Cash Account","Delete Requested")
 VALUES('FLAG67-P2','FLAG67-B',current_date,2::money,'Single Partial','Processing','FLAG67-C','CI-DAD',false);
SET CONSTRAINTS ALL IMMEDIATE;
-- Rehearse the exact forward DDL on populated data with V65's representation.
ALTER TABLE "Payments" ALTER COLUMN "Delete Requested" SET NOT NULL;
ALTER TABLE "Payments" DROP CONSTRAINT payment_delete_requested_present;
SELECT pg_temp.flag67_reject($q$UPDATE "Payments" SET "Delete Requested"=NULL WHERE "Row ID"='FLAG67-P'$q$,'23502');
CREATE FUNCTION pg_temp.flag67_fingerprints() RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE r record; n bigint; digest text; result jsonb:='{}';
BEGIN FOR r IN SELECT schemaname,tablename FROM pg_tables WHERE schemaname IN ('public','assessment_lab','agent_audit') ORDER BY 1,2 LOOP
 EXECUTE format('SELECT count(*),md5(coalesce(string_agg(md5(row_to_json(t)::text),'''' ORDER BY md5(row_to_json(t)::text)),'''')) FROM %I.%I t',r.schemaname,r.tablename) INTO n,digest;
 result:=result||jsonb_build_object(r.schemaname||'.'||r.tablename,jsonb_build_array(n,digest)); END LOOP; RETURN result; END $$;
CREATE TEMP TABLE flag67_before AS SELECT pg_temp.flag67_fingerprints() rows,
 (SELECT jsonb_agg(pg_get_functiondef(oid) ORDER BY proname) FROM pg_proc WHERE oid IN ('public.payment_delete_request_guard()'::regprocedure,'public.payment_delete_requested()'::regprocedure)) functions,
 (SELECT jsonb_agg(pg_get_triggerdef(oid) ORDER BY tgname) FROM pg_trigger WHERE tgrelid='public."Payments"'::regclass AND NOT tgisinternal) triggers;
\ir ../../database/migrations/V67__receipt_delete_flag_required_check.sql
SELECT pg_temp.flag67_assert((SELECT rows=pg_temp.flag67_fingerprints() FROM flag67_before),'all table contents unchanged by exact migration');
SELECT pg_temp.flag67_assert((SELECT functions=(SELECT jsonb_agg(pg_get_functiondef(oid) ORDER BY proname) FROM pg_proc WHERE oid IN ('public.payment_delete_request_guard()'::regprocedure,'public.payment_delete_requested()'::regprocedure)) AND triggers=(SELECT jsonb_agg(pg_get_triggerdef(oid) ORDER BY tgname) FROM pg_trigger WHERE tgrelid='public."Payments"'::regclass AND NOT tgisinternal) FROM flag67_before),'V65 command functions and trigger definitions unchanged');
SELECT pg_temp.flag67_assert((SELECT NOT attnotnull FROM pg_attribute WHERE attrelid='public."Payments"'::regclass AND attname='Delete Requested'),'nullable attribute metadata');
SELECT pg_temp.flag67_assert((SELECT is_nullable='YES' AND column_default='false' FROM information_schema.columns WHERE table_schema='public' AND table_name='Payments' AND column_name='Delete Requested'),'information schema nullable/default metadata');
SELECT pg_temp.flag67_assert((SELECT convalidated AND NOT condeferrable AND pg_get_constraintdef(oid)='CHECK (("Delete Requested" IS NOT NULL))' FROM pg_constraint WHERE conrelid='public."Payments"'::regclass AND conname='payment_delete_requested_present'),'validated immediate exact non-null check');
SELECT pg_temp.flag67_assert((SELECT count(*)=2 AND bool_and(NOT "Delete Requested") AND bool_and("Status"='Posted') FROM "Payments" WHERE "Row ID" IN ('FLAG67-P','FLAG67-P2')),'omitted/default and explicit false insert post');
SELECT pg_temp.flag67_reject($q$INSERT INTO "Payments"("Row ID","Ref Borrower","Payment Date","Amount Received","Allocation Method","Status","Ref Target Charge","Ref Received By Cash Account","Delete Requested") VALUES('FLAG67-NULL','FLAG67-B',current_date,1::money,'Single Partial','Processing','FLAG67-C','CI-DAD',NULL)$q$,'23514','payment_delete_requested_present');
SELECT pg_temp.flag67_reject($q$UPDATE "Payments" SET "Delete Requested"=NULL WHERE "Row ID"='FLAG67-P'$q$,'23514','payment_delete_requested_present');
SELECT pg_temp.flag67_reject($q$UPDATE "Payments" SET "Notes"='must roll back',"Delete Requested"=CASE WHEN "Row ID"='FLAG67-P' THEN false ELSE NULL END WHERE "Row ID" IN ('FLAG67-P','FLAG67-P2')$q$,'23514','payment_delete_requested_present');
SELECT pg_temp.flag67_assert((SELECT rows=pg_temp.flag67_fingerprints() FROM flag67_before),'failed direct/null bulk commands preserve all rows');
-- COPY exercises the real source table; a good first row and NULL second row
-- must both roll back, including all trigger effects. Capture error before reset.
SAVEPOINT copy_null;
\set ON_ERROR_STOP off
COPY "Payments"("Row ID","Ref Borrower","Payment Date","Amount Received","Allocation Method","Status","Ref Target Charge","Ref Received By Cash Account","Delete Requested") FROM STDIN WITH (FORMAT csv, NULL '\N');
FLAG67-COPY1,FLAG67-B,today,1,Single Partial,Processing,FLAG67-C,CI-DAD,false
FLAG67-COPY2,FLAG67-B,today,1,Single Partial,Processing,FLAG67-C,CI-DAD,\N
\.
\set copy_state :SQLSTATE
\set ON_ERROR_STOP on
ROLLBACK TO copy_null;
SELECT pg_temp.flag67_assert(:'copy_state'='23514','COPY explicit NULL rejects with check violation');
SELECT pg_temp.flag67_assert((SELECT rows=pg_temp.flag67_fingerprints() FROM flag67_before),'failed COPY preserves all rows');
SELECT pg_temp.flag67_reject($q$INSERT INTO "Payments"("Row ID","Delete Requested") VALUES('FLAG67-TRUE',true)$q$,'P0001');
SELECT pg_temp.flag67_reject($q$UPDATE "Payments" SET "Delete Requested"=true,"Notes"='mixed' WHERE "Row ID"='FLAG67-P'$q$,'P0001');
UPDATE "Payments" SET "Delete Requested"=DEFAULT WHERE "Row ID"='FLAG67-P';
SELECT pg_temp.flag67_assert((SELECT rows=pg_temp.flag67_fingerprints() FROM flag67_before),'default/no-op preserves source/children/cash/history');
UPDATE "Payments" SET "Delete Requested"=true WHERE "Row ID"='FLAG67-P';
SELECT pg_temp.flag67_assert(NOT EXISTS(SELECT 1 FROM "Payments" WHERE "Row ID"='FLAG67-P') AND NOT EXISTS(SELECT 1 FROM "Cash Ledger" WHERE "Ref Payment"='FLAG67-P'),'true command retains atomic source deletion');
SELECT 'Receipt flag metadata and integrity passed' AS result;
ROLLBACK;
