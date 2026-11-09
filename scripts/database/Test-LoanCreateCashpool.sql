-- R136 V139 loan.create cash pool refusal (disposable cluster only; synthetic rows; everything rolls back). loan.create runs
-- as the DEV command IAM user through pwa_submit_operation_v2 with the canonical text of services/contracts/operation-command.mjs.
-- Covered: a new loan of one baht more than the available cash pool (the V17 guard: contributions less outstanding principal)
-- is recorded as rejected insufficient_funds (not a failed request), writes no loan, charge, payment or ledger row, and replays
-- the same rejection; a loan of exactly the available pool applies (with its first-day charge, net-off receipt and ledger rows).
\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
 IF current_database()<>'loan_manager_dev' OR inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet THEN RAISE EXCEPTION 'Disposable loopback database required'; END IF;
END $$;
\ir Test-CashAccountFixtures.sql
CREATE FUNCTION pg_temp.cp_assert(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAILED: %',label; END IF; END $$;
CREATE TEMP TABLE cp_day ON COMMIT DROP AS SELECT (transaction_timestamp() AT TIME ZONE 'Asia/Bangkok')::date AS d;
INSERT INTO public."Partners"("Row ID","Partner Role") VALUES('CP-FUND','A');
INSERT INTO public."Partners"("Row ID","Partner Name","Partner Role","Login Email","Language Preference") VALUES('CP-ACT','Synthetic pool actor','A','cp-actor@example.invalid','English');
INSERT INTO public."Cash Pool Contributions"("Row ID","Ref Partner","Contribution Date","Transaction Type","Amount") VALUES('CP-CAP','CP-FUND',(SELECT d FROM cp_day)-30,'Contribution',5000::money);
INSERT INTO public."Borrowers"("Row ID","Borrower Name") VALUES('CP-B1','SYNTHETIC POOL BORROWER');
-- The available pool exactly as new_loan_cashpool_guard computes it (every contribution and loan in this database).
CREATE TEMP TABLE cp_pool ON COMMIT DROP AS SELECT
 (SELECT coalesce(sum(CASE WHEN "Transaction Type"='Contribution' THEN "Amount"::numeric ELSE -"Amount"::numeric END),0) FROM public."Cash Pool Contributions")
 -(SELECT coalesce(sum(coalesce("Principal Amount"::numeric,0)),0) FROM public."Loans")
 +(SELECT coalesce(sum(r."Principal Paid"::numeric),0) FROM public."Repayments" r JOIN public."Loans" x ON x."Row ID"=r."Ref Loans") AS available;
DO $$ BEGIN PERFORM pg_temp.cp_assert((SELECT available>=1000 AND available=trunc(available) FROM cp_pool),'fixture: a whole-baht pool of at least 1000 is available'); END $$;
-- loan.create of a daily-interest loan (fee 10, daily interest 5, auto charge) for a principal, as the canonical text.
CREATE FUNCTION pg_temp.cp_cmd(request text,target text,principal numeric) RETURNS text LANGUAGE sql AS $f$
 SELECT '{"contractVersion":2,"requestId":'||to_json(request)::text||',"actor":{"issuer":"https://securetoken.google.com/clever-oasis-508610-n7","subject":"cp-owner","partnerId":"CP-ACT","loginEmail":"cp-actor@example.invalid"},'
  ||'"command":{"schemaVersion":1,"operation":"loan.create","targetType":"loan","targetId":'||to_json(target)::text||',"expectedVersion":null,"predecessorRequestId":null,"inputs":{'
  ||'"borrowerId":"CP-B1","loanDate":"'||(SELECT d FROM cp_day)||'","principal":"'||trim_scale(principal)||'","transferFee":"10","disbursingAccountId":"CI-LISA","type":"ดอกเบี้ยรายวัน","dueDate":null,"dailyPayment":null,"fixedInterest":null,'
  ||'"currentDailyInterest":"5","paymentInterval":1,"arrangement":null,"autoChargeEnabled":true}},"receipt":null}' $f$;
SELECT set_config('cp.over',pg_temp.cp_cmd('c1390000-0000-4000-8000-000000000001','c1390000-0000-4000-8000-0000000000a1',(SELECT available+1 FROM cp_pool)),true),
 set_config('cp.exact',pg_temp.cp_cmd('c1390000-0000-4000-8000-000000000002','c1390000-0000-4000-8000-0000000000a2',(SELECT available FROM cp_pool)),true);

-- Operator grants, emulated and rolled back (as Test-AgentLoanClose.sql).
GRANT USAGE ON SCHEMA public TO mw_app_dev; GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO mw_app_dev; GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO mw_app_dev;
REVOKE INSERT,UPDATE,DELETE ON "Cash Ledger",pwa_payment_commands,r005_cash_cutover_sources,r008_cash_account_cutover,pwa_row_changes,pwa_rebate_settlements FROM mw_app_dev;
REVOKE USAGE,UPDATE ON SEQUENCE pwa_row_changes_seq_seq FROM mw_app_dev;
GRANT EXECUTE ON FUNCTION public.pwa_submit_operation_v2(text) TO mw_app_dev;
GRANT EXECUTE ON FUNCTION public.pwa_operation_status_v2(uuid,text,text) TO mw_app_dev;

SET SESSION AUTHORIZATION "mw-credit-app-command-dev@clever-oasis-508610-n7.iam";
DO $$
DECLARE r jsonb;
BEGIN
 r:=public.pwa_submit_operation_v2(current_setting('cp.over'));
 IF r->>'kind' IS DISTINCT FROM 'recorded' OR r#>>'{originalOutcome,status}' IS DISTINCT FROM 'rejected' OR r#>>'{originalOutcome,code}' IS DISTINCT FROM 'insufficient_funds' THEN
  RAISE EXCEPTION 'FAILED: a loan over the cash pool must be rejected insufficient_funds: %',r; END IF;
 r:=public.pwa_submit_operation_v2(current_setting('cp.over'));
 IF r#>>'{originalOutcome,code}' IS DISTINCT FROM 'insufficient_funds' THEN RAISE EXCEPTION 'FAILED: the replay keeps the rejection: %',r; END IF;
 r:=public.pwa_submit_operation_v2(current_setting('cp.exact'));
 IF r#>>'{originalOutcome,status}' IS DISTINCT FROM 'applied' OR r#>>'{originalOutcome,result,targetId}' IS DISTINCT FROM 'c1390000-0000-4000-8000-0000000000a2' THEN
  RAISE EXCEPTION 'FAILED: a loan of exactly the available pool must apply: %',r; END IF;
END $$;
RESET SESSION AUTHORIZATION;
SET CONSTRAINTS ALL IMMEDIATE;

DO $$
DECLARE refused text:='c1390000-0000-4000-8000-0000000000a1'; created text:='c1390000-0000-4000-8000-0000000000a2';
BEGIN
 PERFORM pg_temp.cp_assert((SELECT count(*)=1 AND bool_and(outcome='rejected' AND rejection_code='insufficient_funds' AND result_json IS NULL) FROM public.pwa_payment_commands WHERE request_id='c1390000-0000-4000-8000-000000000001'),
  'one journal row, rejected insufficient_funds');
 PERFORM pg_temp.cp_assert(NOT EXISTS(SELECT 1 FROM public."Loans" WHERE "Row ID"=refused) AND NOT EXISTS(SELECT 1 FROM public."Charges" WHERE "Ref Loans"=refused)
   AND NOT EXISTS(SELECT 1 FROM public."Payments" WHERE "Row ID" LIKE '%'||refused) AND NOT EXISTS(SELECT 1 FROM public."Cash Ledger" WHERE "Ref Loan"=refused OR "Source Key" LIKE '%'||refused),
  'the refused loan writes no loan, charge, payment or ledger row');
 PERFORM pg_temp.cp_assert((SELECT "Principal Amount"::numeric=(SELECT available FROM cp_pool) FROM public."Loans" WHERE "Row ID"=created)
   AND (SELECT "Status"='Posted' AND "Amount Received"::numeric=15 FROM public."Payments" WHERE "Row ID"='fd6:fd6:'||created)
   AND EXISTS(SELECT 1 FROM public."Cash Ledger" WHERE "Ref Loan"=created)
   AND (SELECT outcome='applied' FROM public.pwa_payment_commands WHERE request_id='c1390000-0000-4000-8000-000000000002'),'a loan of exactly the available pool applies with its first-day net-off and ledger rows');
END $$;
SELECT 'Loan create cash pool regressions passed' AS result;
ROLLBACK;
