\set ON_ERROR_STOP on
BEGIN;
\ir Test-CashAccountFixtures.sql
-- Test-only canonical request adapter; no central DB/production dispatch.
CREATE FUNCTION pg_temp.ir58_call(op uuid,payment text,receipt jsonb,moves jsonb,reason text,revision text)
RETURNS text LANGUAGE sql AS $$
 SELECT public.reallocate_payment_interest_audited(op,jsonb_build_object(
 'kind','interest-reallocation-v2','operation_id',op::text,'database','loan_manager_prod',
 'payment',payment,'receipt',receipt,'moves',moves,'reason',reason,'code_version',revision,
 'actor_id','synthetic-operator','actor_login','synthetic-operator','authorization_reference','synthetic-approval')::text);
$$;
CREATE FUNCTION pg_temp.assert(ok boolean,msg text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'Assertion failed: %',msg; END IF; END $$;
CREATE FUNCTION pg_temp.reject(statement text,expected text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE failed boolean:=false;
BEGIN
 BEGIN EXECUTE statement; EXCEPTION WHEN OTHERS THEN
  IF position(expected in SQLERRM)=0 THEN RAISE; END IF; failed:=true;
 END;
 IF NOT failed THEN RAISE EXCEPTION 'Expected rejection: %',expected; END IF;
END $$;
SELECT pg_temp.reject($q$SELECT public.reallocate_payment_interest('00000000-0058-4000-8000-000000000001','synthetic','{}','[]','synthetic','test')$q$,'Canonical central intent required');
INSERT INTO "Borrowers"("Row ID","Borrower Name") VALUES ('IR57-B','Synthetic reallocation'),('IR57-OTHER','Synthetic unrelated');
INSERT INTO "Partners"("Row ID","Partner Role") VALUES ('IR57-PARTNER','A');
INSERT INTO "Cash Pool Contributions"("Row ID","Ref Partner","Contribution Date","Transaction Type","Amount")
 VALUES ('IR57-CAPITAL','IR57-PARTNER',current_date,'Contribution',10000::money);
INSERT INTO "Loans"("Ref Disbursed From Cash Account","Row ID","Ref Borrowers","Loan Date","Principal Amount","Loan Status","Loan Type","Auto Charge Enabled")
 VALUES ('CI-LISA','IR57-L1','IR57-B',current_date-10,2000::money,'ยังไม่ปิดยอด','กำหนดวันชำระ',false),
 ('CI-LISA','IR57-L2','IR57-B',current_date-10,1500::money,'ยังไม่ปิดยอด','กำหนดวันชำระ',false),
 ('CI-LISA','IR57-L3','IR57-B',current_date-10,2500::money,'ยังไม่ปิดยอด','กำหนดวันชำระ',false),
 ('CI-LISA','IR57-LX','IR57-OTHER',current_date-10,100::money,'ยังไม่ปิดยอด','กำหนดวันชำระ',false);
INSERT INTO "Charges"("Row ID","Ref Loans","Charge Date","Principal Due","Interest Due")
 SELECT 'IR57-C'||n||'-'||d,'IR57-L'||n,current_date-5+d,0::money,
  (CASE n WHEN 1 THEN 200 WHEN 2 THEN 150 ELSE 250 END)::money
 FROM generate_series(1,3) n CROSS JOIN generate_series(1,3) d;
INSERT INTO "Charges"("Row ID","Ref Loans","Charge Date","Principal Due","Interest Due")
 VALUES ('IR57-X','IR57-LX',current_date-4,0::money,200::money);
INSERT INTO "Payments"("Row ID","Ref Borrower","Status","Amount Received","Payment Date","Allocation Method","Ref Received By Cash Account")
 VALUES ('IR57-P','IR57-B','Processing',1200::money,current_date-2,'Lump Sum','CI-DAD');
SET CONSTRAINTS ALL IMMEDIATE;
CREATE TEMP TABLE ir57_request AS
 SELECT to_jsonb(p) receipt,(SELECT jsonb_agg(jsonb_build_object('allocation_id',a."Row ID",'target_charge',t."Row ID",
  'expected_allocation',to_jsonb(a),'expected_repayment',to_jsonb(r),'expected_source_charge',to_jsonb(s),
  'expected_target_charge',to_jsonb(t),'expected_loan',to_jsonb(l)) ORDER BY a."Row ID")
 FROM "Payment Allocations" a JOIN "Repayments" r ON r."Ref Payment Allocation"=a."Row ID"
 JOIN "Charges" s ON s."Row ID"=a."Ref Charge" JOIN "Loans" l ON l."Row ID"=s."Ref Loans"
 JOIN "Charges" t ON t."Ref Loans"=s."Ref Loans" AND t."Charge Date"=current_date-4
 WHERE a."Ref Payment"='IR57-P' AND s."Charge Date"=current_date-2) moves FROM "Payments" p WHERE p."Row ID"='IR57-P';
CREATE TEMP TABLE ir57_preserved AS
 SELECT 'Borrowers' kind,jsonb_agg(to_jsonb(x) ORDER BY "Row ID") state FROM "Borrowers" x UNION ALL
 SELECT 'Loans',jsonb_agg(to_jsonb(x) ORDER BY "Row ID") FROM "Loans" x UNION ALL
 SELECT 'Payments',jsonb_agg(to_jsonb(x) ORDER BY "Row ID") FROM "Payments" x UNION ALL
 SELECT 'Cash Ledger',jsonb_agg(to_jsonb(x) ORDER BY "Row ID") FROM "Cash Ledger" x;
-- Snapshot staleness and malformed scope fail before mutation; exception also
-- rolls back any operation marker/intent rows created before a later failure.
DO $$ DECLARE q record; bad jsonb; BEGIN
 SELECT * INTO q FROM ir57_request;
 PERFORM pg_temp.reject(format('SELECT pg_temp.ir58_call(%L,%L,%L::jsonb,%L::jsonb,%L,%L)',
 '00000000-0057-4000-8000-000000000001','IR57-P',q.receipt||'{"Status":"Processing"}',q.moves,'test','synthetic'),'Receipt verification conflict');
 bad:=jsonb_set(q.moves,'{2,expected_repayment,Interest Paid}','"$999.00"');
 PERFORM pg_temp.reject(format('SELECT pg_temp.ir58_call(%L,%L,%L::jsonb,%L::jsonb,%L,%L)',
 '00000000-0057-4000-8000-000000000001','IR57-P',q.receipt,bad,'test','synthetic'),'Move verification conflict');
 PERFORM pg_temp.assert(NOT EXISTS(SELECT 1 FROM agent_audit.commits WHERE operation_id='00000000-0057-4000-8000-000000000001'),'later failure rolls back audit and earlier moves');
 PERFORM pg_temp.assert((SELECT sum("Total Paid")=0 FROM "Charges" WHERE "Row ID" LIKE 'IR57-C%-1'),'earlier moves rolled back');
 bad:=jsonb_set(q.moves,'{0,target_charge}','"IR57-X"');
 bad:=jsonb_set(bad,'{0,expected_target_charge}',(SELECT to_jsonb(x) FROM "Charges" x WHERE "Row ID"='IR57-X'));
 PERFORM pg_temp.reject(format('SELECT pg_temp.ir58_call(%L,%L,%L::jsonb,%L::jsonb,%L,%L)',
 '00000000-0057-4000-8000-000000000001','IR57-P',q.receipt,bad,'test','synthetic'),'same-loan whole interest');
 PERFORM pg_temp.reject(format('SELECT pg_temp.ir58_call(%L,%L,%L::jsonb,%L::jsonb,%L,%L)',
 '00000000-0057-4000-8000-000000000001','IR57-P',q.receipt,q.moves||jsonb_build_array(q.moves->0),'test','synthetic'),'Duplicate or missing');
END $$;
-- Capacity and closed-loan constraints use refreshed expected snapshots,
-- proving that the business rule itself rejects these cases.
DO $$ DECLARE q record; bad jsonb; target text; loan_id text; old_due money; BEGIN
 SELECT * INTO q FROM ir57_request; target:=q.moves->0->>'target_charge';
 SELECT "Interest Due" INTO old_due FROM "Charges" WHERE "Row ID"=target;
 UPDATE "Charges" SET "Interest Due"=1::money WHERE "Row ID"=target;
 bad:=jsonb_set(q.moves,'{0,expected_target_charge}',(SELECT to_jsonb(x) FROM "Charges" x WHERE "Row ID"=target));
 PERFORM pg_temp.reject(format('SELECT pg_temp.ir58_call(%L,%L,%L::jsonb,%L::jsonb,%L,%L)',
 '00000000-0057-4000-8000-000000000001','IR57-P',q.receipt,bad,'test','synthetic'),'Target charge capacity conflict');
 UPDATE "Charges" SET "Interest Due"=old_due WHERE "Row ID"=target;
 loan_id:=q.moves->0->'expected_loan'->>'Row ID';
 UPDATE "Loans" SET "Loan Status"='ปิดยอดแล้ว' WHERE "Row ID"=loan_id;
 bad:=jsonb_set(q.moves,'{0,expected_loan}',(SELECT to_jsonb(x) FROM "Loans" x WHERE "Row ID"=loan_id));
 bad:=jsonb_set(bad,'{0,expected_source_charge}',(SELECT to_jsonb(x) FROM "Charges" x WHERE "Row ID"=q.moves->0->'expected_source_charge'->>'Row ID'));
 bad:=jsonb_set(bad,'{0,expected_target_charge}',(SELECT to_jsonb(x) FROM "Charges" x WHERE "Row ID"=target));
 PERFORM pg_temp.reject(format('SELECT pg_temp.ir58_call(%L,%L,%L::jsonb,%L::jsonb,%L,%L)',
 '00000000-0057-4000-8000-000000000001','IR57-P',q.receipt,bad,'test','synthetic'),'same-loan whole interest');
 UPDATE "Loans" SET "Loan Status"='ยังไม่ปิดยอด' WHERE "Row ID"=loan_id;
END $$;
-- A caller-set marker is never a permit.
SELECT set_config('mw_agent.reallocation_id','00000000-0057-4000-8000-000000000001',true);
SELECT pg_temp.reject($q$UPDATE "Repayments" SET "Ref Charges"='IR57-C1-1' WHERE "Ref Payment"='IR57-P'$q$,'immutable');
SELECT set_config('mw_agent.reallocation_id','',true);
SELECT pg_temp.assert(pg_temp.ir58_call('00000000-0057-4000-8000-000000000001','IR57-P',receipt,moves,
 'synthetic owner-approved correction','synthetic-v57')='applied','correction applies') FROM ir57_request;
SELECT pg_temp.assert(pg_temp.ir58_call('00000000-0057-4000-8000-000000000001','IR57-P',receipt,moves,
 'synthetic owner-approved correction','synthetic-v57')='already_applied','same request retry is a no-op') FROM ir57_request;
DO $$ DECLARE q record; BEGIN SELECT * INTO q FROM ir57_request;
 PERFORM pg_temp.reject(format('SELECT pg_temp.ir58_call(%L,%L,%L::jsonb,%L::jsonb,%L,%L)',
 '00000000-0057-4000-8000-000000000001','IR57-P',q.receipt,q.moves,'changed reason','synthetic-v57'),'Operation ID reused');
END $$;
SELECT pg_temp.assert((SELECT sum("Total Paid")=600 AND sum("Amount Remaining")=0 FROM "Charges" WHERE "Row ID" LIKE 'IR57-C%-1'),'first date paid');
SELECT pg_temp.assert((SELECT sum("Total Paid")=600 AND sum("Amount Remaining")=0 FROM "Charges" WHERE "Row ID" LIKE 'IR57-C%-2'),'second date still paid');
SELECT pg_temp.assert((SELECT sum("Total Paid")=0 AND sum("Amount Remaining")=600 FROM "Charges" WHERE "Row ID" LIKE 'IR57-C%-3'),'third date unpaid');
SELECT pg_temp.assert((SELECT count(*)=6 AND sum("Interest Paid"::numeric)=1200 AND min("Payment Date")=current_date-2 FROM "Repayments" WHERE "Ref Payment"='IR57-P'),'receipt total and actual date retained');
SELECT pg_temp.assert((SELECT count(*)=12 FROM agent_audit.row_changes WHERE operation_id='00000000-0057-4000-8000-000000000001'),'children and charge before/after audit retained');
SELECT pg_temp.assert((SELECT count(*)=1 FROM agent_audit.commits WHERE operation_id='00000000-0057-4000-8000-000000000001'),'one audit commit after retry');
SELECT pg_temp.assert(state IS NOT DISTINCT FROM CASE kind
 WHEN 'Borrowers' THEN (SELECT jsonb_agg(to_jsonb(x) ORDER BY "Row ID") FROM "Borrowers" x)
 WHEN 'Loans' THEN (SELECT jsonb_agg(to_jsonb(x) ORDER BY "Row ID") FROM "Loans" x)
 WHEN 'Payments' THEN (SELECT jsonb_agg(to_jsonb(x) ORDER BY "Row ID") FROM "Payments" x)
 WHEN 'Cash Ledger' THEN (SELECT jsonb_agg(to_jsonb(x) ORDER BY "Row ID") FROM "Cash Ledger" x)
 END,kind||' unchanged') FROM ir57_preserved;
SELECT pg_temp.reject($q$UPDATE "Repayments" SET "Interest Paid"=1::money WHERE "Ref Payment"='IR57-P'$q$,'immutable');
SELECT pg_temp.reject($q$DELETE FROM "Payment Allocations" WHERE "Ref Payment"='IR57-P'$q$,'immutable');
SELECT pg_temp.assert(NOT EXISTS(SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl
 WHERE p.oid='public.reallocate_payment_interest_audited(uuid,text)'::regprocedure AND acl.grantee=0 AND acl.privilege_type='EXECUTE'),'PUBLIC has no correction permission');
SELECT pg_temp.assert((SELECT "Interest Due"::numeric=200 AND "Total Paid"=0 FROM "Charges" WHERE "Row ID"='IR57-X'),'unrelated charge unchanged');
-- Retry must reconcile the current corrected state, not just find an audit ID.
DO $$ DECLARE q record; BEGIN
 SELECT * INTO q FROM ir57_request;
 UPDATE "Charges" SET "Notes"='Synthetic subsequent edit' WHERE "Row ID"='IR57-C1-1';
 PERFORM pg_temp.reject(format('SELECT pg_temp.ir58_call(%L,%L,%L::jsonb,%L::jsonb,%L,%L)',
 '00000000-0057-4000-8000-000000000001','IR57-P',q.receipt,q.moves,'synthetic owner-approved correction','synthetic-v57'),'Applied operation state has changed');
END $$;
SELECT 'Interest reallocation regressions passed' result;
ROLLBACK;
