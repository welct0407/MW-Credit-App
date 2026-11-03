-- R118 V132 late charges, the "before" half (run at V131 by Test-CI's pre-target route; disposable cluster only; synthetic rows).
-- Committed on purpose, like Test-PayerName-Before.sql: Test-LateCharges.sql applies V132 over this state and proves, on the
-- same cluster, that nothing the owner reads today moved. It records, at V131:
--  * the six income relations ("Cash Dashboard", olap_portfolio_summary, reporting_income_statement / _monthly / _daily / _events)
--    row by row and their column lists, over a fixture with interest, principal, an expense and a default write-off (no late charge);
--  * every routine's and view's owner, ACL, security, search_path and comment, and every user trigger on the public tables;
--  * a loan defaulted by the V131 write-off (legacy evidence without original_late), which V132 must still undo.
\set ON_ERROR_STOP on
\ir Test-CashAccountFixtures.sql
SET TIME ZONE 'Asia/Bangkok';
INSERT INTO public."Statistics"("Row ID") SELECT 'LCB-ST' WHERE NOT EXISTS (SELECT 1 FROM public."Statistics");
INSERT INTO public."Partners"("Row ID","Partner Role") VALUES('LCB-FUND','A');
INSERT INTO public."Cash Pool Contributions"("Row ID","Ref Partner","Contribution Date","Transaction Type","Amount")
 VALUES('LCB-CAP','LCB-FUND',current_date-400,'Contribution',1000000::money);
INSERT INTO public."Borrowers"("Row ID","Borrower Name") VALUES('LCB-B1','SYNTHETIC LC BEFORE INCOME'),('LCB-BD','SYNTHETIC LC BEFORE DEFAULT');
INSERT INTO public."Loans"("Ref Disbursed From Cash Account","Row ID","Ref Borrowers","Loan Date","Principal Amount","Loan Type","Loan Status","Auto Charge Enabled","Current Daily Interest")
 VALUES('CI-LISA','LCB-L1','LCB-B1',current_date-5,1000::money,'ดอกเบี้ยรายวัน','ยังไม่ปิดยอด',false,10::money),
       ('CI-LISA','LCB-DF','LCB-BD',current_date-5,100::money,'ดอกเบี้ยรายวัน','ยังไม่ปิดยอด',false,10::money);
INSERT INTO public."Charges"("Row ID","Ref Loans","Charge Date","Principal Due","Interest Due","Notes") VALUES
 ('LCB-L1-c1','LCB-L1',current_date-2,0::money,10::money,NULL),('LCB-L1-c2','LCB-L1',current_date-1,50::money,10::money,NULL),
 ('LCB-DF-a','LCB-DF',current_date-3,20::money,10::money,'Legacy note'),('LCB-DF-b','LCB-DF',current_date-2,20::money,10::money,NULL);
UPDATE public."Loans" SET "Auto Charge Enabled"=true WHERE "Row ID" LIKE 'LCB-%';
-- One receipt at a time per borrower (a second Processing receipt of the same borrower in one statement needs reconciliation).
INSERT INTO public."Payments"("Ref Received By Cash Account","Row ID","Ref Borrower","Ref Target Charge","Amount Received","Payment Date","Allocation Method","Status")
 VALUES('CI-DAD','LCB-P1','LCB-B1','LCB-L1-c1',10::money,current_date,'Single Full','Processing');
INSERT INTO public."Payments"("Ref Received By Cash Account","Row ID","Ref Borrower","Ref Target Charge","Amount Received","Payment Date","Allocation Method","Status")
 VALUES('CI-DAD','LCB-P2','LCB-B1','LCB-L1-c2',60::money,current_date,'Single Full','Processing');
INSERT INTO public."Payments"("Ref Received By Cash Account","Row ID","Ref Borrower","Ref Target Charge","Amount Received","Payment Date","Allocation Method","Status")
 VALUES('CI-DAD','LCB-PD','LCB-BD','LCB-DF-a',10::money,current_date,'Single Partial','Processing');
INSERT INTO public."Business Expenses"("Row ID","Expense Date","Expense Category","Amount","Ref Paid By Cash Account","Ref Paid By Cash Holder")
 VALUES('LCB-EXPENSE',current_date,'Other',5::money,'CI-DAD','ch:dad');
-- The V131 default write-off of LCB-DF: written-down charges carry evidence with no original_late.
UPDATE public."Loans" SET "Defaulted"=true,"Close Date"=current_date,"Closed By"='synthetic@example.invalid' WHERE "Row ID"='LCB-DF';
DO $$ BEGIN
 IF (SELECT "Default Loss Amount"::numeric FROM public."Loans" WHERE "Row ID"='LCB-DF') IS DISTINCT FROM 100
  OR NOT EXISTS(SELECT 1 FROM public."Charges" WHERE "Row ID"='LCB-DF-b' AND "Notes" LIKE '%original_interest%' AND "Notes" NOT LIKE '%original_late%')
  OR (SELECT count(*) FROM public."Repayments" WHERE "Ref Loans" IN ('LCB-L1','LCB-DF'))<>4 THEN
  RAISE EXCEPTION 'LCB fixture did not post as expected at V131'; END IF;
END $$;

CREATE SCHEMA lc_before;
-- Relations: one jsonb per row, the column list and the Bangkok day of the snapshot.
CREATE TABLE lc_before.relation_rows(rel text NOT NULL,row_value jsonb NOT NULL);
CREATE TABLE lc_before.relation_columns(rel text PRIMARY KEY,columns text[] NOT NULL,snapshot_day date NOT NULL);
DO $$
DECLARE r text;
BEGIN
 FOREACH r IN ARRAY ARRAY['"Cash Dashboard"','olap_portfolio_summary','reporting_income_statement','reporting_income_monthly','reporting_income_daily','reporting_income_events'] LOOP
  EXECUTE format('INSERT INTO lc_before.relation_rows SELECT %L,to_jsonb(v) FROM public.%s v',r,r);
  EXECUTE format('INSERT INTO lc_before.relation_columns SELECT %L,array_agg(attname::text ORDER BY attnum),(CURRENT_TIMESTAMP AT TIME ZONE %L)::date FROM pg_attribute WHERE attrelid=%L::regclass AND attnum>0 AND NOT attisdropped',
   r,'Asia/Bangkok','public.'||r);
 END LOOP;
END $$;
-- Routines and views: identity arguments, owner, ACL, security, search_path and comment.
CREATE TABLE lc_before.routines AS
 SELECT p.oid::regprocedure::text AS signature,pg_get_userbyid(p.proowner) AS owner,p.proacl::text AS acl,p.prosecdef AS security_definer,
  p.proconfig::text AS config,obj_description(p.oid,'pg_proc') AS comment,p.prokind::text AS kind
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public';
CREATE TABLE lc_before.views AS
 SELECT c.oid::regclass::text AS name,pg_get_userbyid(c.relowner) AS owner,c.relacl::text AS acl,c.reloptions::text AS options,obj_description(c.oid,'pg_class') AS comment
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('v','m');
-- User triggers on the public tables (no trigger may be added, renamed or re-timed by V132).
CREATE TABLE lc_before.triggers AS
 SELECT c.relname::text AS relation,t.tgname::text AS trigger_name,t.tgtype::integer AS trigger_type,t.tgenabled::text AS enabled,t.tgdeferrable AS is_deferrable,t.tginitdeferred AS is_initially_deferred,
  pg_get_triggerdef(t.oid) AS definition
 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND NOT t.tgisinternal;
-- Table-level ACLs (the new columns inherit these; nothing else may move).
CREATE TABLE lc_before.tables AS
 SELECT c.oid::regclass::text AS name,pg_get_userbyid(c.relowner) AS owner,c.relacl::text AS acl
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p');
DO $$ BEGIN
 IF (SELECT count(*) FROM lc_before.relation_columns)<>6 OR (SELECT count(*) FROM lc_before.routines)<100 OR (SELECT count(*) FROM lc_before.triggers)<50 THEN
  RAISE EXCEPTION 'LCB snapshot is incomplete'; END IF;
END $$;
SELECT 'Late charges before-state recorded at V131' AS result;
