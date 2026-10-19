-- DB-SCHEMA-02 (V93): trigger firing order is (relation, timing, level, C-collation name).
-- This snapshot is the contract for Payments, Loans, Charges and Repayments: a new or renamed
-- trigger must be added here deliberately, in its firing position, by the migration that creates it.
\set ON_ERROR_STOP on
BEGIN;
CREATE TEMP TABLE to_expected(relation text, timing text, level text, events text, tgname text, is_deferrable boolean, is_initially_deferred boolean) ON COMMIT DROP;
INSERT INTO to_expected VALUES
  ('Charges','BEFORE','STATEMENT','INSERT,DELETE,UPDATE','a000_business_history_begin',false,false),
  ('Charges','BEFORE','ROW','INSERT,UPDATE','a000_blank_refs',false,false),
  ('Charges','BEFORE','ROW','INSERT,DELETE,UPDATE','aa_vc_lock',false,false),
  ('Charges','BEFORE','ROW','INSERT,DELETE,UPDATE','ab_charge_consistency',false,false),
  ('Charges','BEFORE','ROW','DELETE,UPDATE','default_posting_guard',false,false),
  ('Charges','BEFORE','ROW','INSERT,UPDATE','zz_vc_charge_row',false,false),
  ('Charges','AFTER','STATEMENT','INSERT,DELETE,UPDATE','zzzzz_business_history_flush',false,false),
  ('Charges','AFTER','ROW','INSERT','first_day_receipt',false,false),
  ('Charges','AFTER','ROW','INSERT,DELETE,UPDATE','mw_agent_capture',false,false),
  ('Charges','AFTER','ROW','UPDATE','quick_payment_request',false,false),
  ('Charges','AFTER','ROW','INSERT,DELETE,UPDATE','zzzz_business_history',false,false),
  ('Charges','AFTER','ROW','INSERT,DELETE,UPDATE','zzzzzz_business_history_commit',true,true),
  ('Charges','AFTER','ROW','INSERT,DELETE,UPDATE','zzzzzzz_pwa_row_change',false,false),
  ('Loans','BEFORE','STATEMENT','INSERT,DELETE,UPDATE','a000_business_history_begin',false,false),
  ('Loans','BEFORE','STATEMENT','INSERT,DELETE,UPDATE','aa_cashpool_lock',false,false),
  ('Loans','BEFORE','ROW','INSERT,UPDATE','a000_blank_refs',false,false),
  ('Loans','BEFORE','ROW','UPDATE','a000_opening_consistency',false,false),
  ('Loans','BEFORE','ROW','DELETE','a00_business_delete',false,false),
  ('Loans','BEFORE','ROW','INSERT,UPDATE','a0_cash_account',false,false),
  ('Loans','BEFORE','ROW','UPDATE','aa_cash_identity',false,false),
  ('Loans','BEFORE','ROW','UPDATE','aa_vc_daily_lock',false,false),
  ('Loans','BEFORE','ROW','INSERT,DELETE,UPDATE','aa_vc_lock',false,false),
  ('Loans','BEFORE','ROW','UPDATE','ab_loan_consistency',false,false),
  ('Loans','BEFORE','ROW','INSERT','ab_new_loan_cashpool_guard',false,false),
  ('Loans','BEFORE','ROW','INSERT,UPDATE','closing_payment_guard',false,false),
  ('Loans','BEFORE','ROW','INSERT,UPDATE','default_loan_transition',false,false),
  ('Loans','BEFORE','ROW','INSERT,UPDATE','zz_vc_daily_interest',false,false),
  ('Loans','BEFORE','ROW','INSERT,UPDATE','zz_vc_loan_row',false,false),
  ('Loans','AFTER','STATEMENT','INSERT,DELETE,UPDATE','zzzzz_business_history_flush',false,false),
  ('Loans','AFTER','ROW','INSERT,DELETE,UPDATE','a001_parent_dirty',false,false),
  ('Loans','AFTER','ROW','INSERT','first_day_charge',false,false),
  ('Loans','AFTER','ROW','INSERT,UPDATE','manual_charge_generation',false,false),
  ('Loans','AFTER','ROW','INSERT,DELETE,UPDATE','mw_agent_capture',false,false),
  ('Loans','AFTER','ROW','UPDATE','quick_payment_request',false,false),
  ('Loans','AFTER','ROW','UPDATE','referral_loan_closed',true,true),
  ('Loans','AFTER','ROW','INSERT,DELETE,UPDATE','vc_borrower_changed',true,true),
  ('Loans','AFTER','ROW','UPDATE','vc_loan_status_changed',true,true),
  ('Loans','AFTER','ROW','INSERT,UPDATE','zz_cash_source',false,false),
  ('Loans','AFTER','ROW','INSERT,UPDATE','zz_pwa_notification_loan',false,false),
  ('Loans','AFTER','ROW','DELETE,UPDATE','zzy_r051_opening',false,false),
  ('Loans','AFTER','ROW','INSERT,DELETE,UPDATE','zzzz_business_history',false,false),
  ('Loans','AFTER','ROW','INSERT,DELETE,UPDATE','zzzzzz_business_history_commit',true,true),
  ('Loans','AFTER','ROW','INSERT,DELETE,UPDATE','zzzzzzz_pwa_row_change',false,false),
  ('Payments','BEFORE','STATEMENT','INSERT,DELETE,UPDATE','a000_business_history_begin',false,false),
  ('Payments','BEFORE','ROW','INSERT,UPDATE','a000_blank_refs',false,false),
  ('Payments','BEFORE','ROW','UPDATE','a000_opening_consistency',false,false),
  ('Payments','BEFORE','ROW','INSERT,UPDATE','a000_payment_delete_request',false,false),
  ('Payments','BEFORE','ROW','INSERT,UPDATE','a000_pwa_explicit_plan',false,false),
  ('Payments','BEFORE','ROW','DELETE,UPDATE','a00_payment_crud',false,false),
  ('Payments','BEFORE','ROW','INSERT,UPDATE','a00_receipt_evidence',false,false),
  ('Payments','BEFORE','ROW','INSERT,UPDATE','a01_receipt_upload_stamp',false,false),
  ('Payments','BEFORE','ROW','INSERT,UPDATE','a0_cash_account',false,false),
  ('Payments','BEFORE','ROW','INSERT,UPDATE','a1_selected_charge_scope',false,false),
  ('Payments','BEFORE','ROW','INSERT,UPDATE','aa_cash_holder',false,false),
  ('Payments','BEFORE','ROW','UPDATE','aa_cash_identity',false,false),
  ('Payments','BEFORE','ROW','INSERT,UPDATE','close_loan_request',false,false),
  ('Payments','BEFORE','ROW','INSERT,UPDATE','lump_sum_receipt_guard',false,false),
  ('Payments','BEFORE','ROW','DELETE','payment_delete_guard',false,false),
  ('Payments','BEFORE','ROW','INSERT,UPDATE','zz_vc_payment_row',false,false),
  ('Payments','AFTER','STATEMENT','INSERT,DELETE,UPDATE','zzzzz_business_history_flush',false,false),
  ('Payments','AFTER','ROW','INSERT,DELETE,UPDATE','mw_agent_capture',false,false),
  ('Payments','AFTER','ROW','INSERT,UPDATE','process_lump_sum',false,false),
  ('Payments','AFTER','ROW','INSERT,UPDATE','zz_cash_source',false,false),
  ('Payments','AFTER','ROW','INSERT,UPDATE','zz_pwa_notification_payment',false,false),
  ('Payments','AFTER','ROW','DELETE,UPDATE','zzy_r051_opening',false,false),
  ('Payments','AFTER','ROW','DELETE,UPDATE','zzz_payment_crud',false,false),
  ('Payments','AFTER','ROW','UPDATE','zzzz_payment_delete_requested',false,false),
  ('Payments','AFTER','ROW','INSERT,DELETE,UPDATE','zzzzzz_business_history_commit',true,true),
  ('Payments','AFTER','ROW','INSERT,DELETE,UPDATE','zzzzzzz_pwa_row_change',false,false),
  ('Repayments','BEFORE','STATEMENT','INSERT,DELETE,UPDATE','a000_business_history_begin',false,false),
  ('Repayments','BEFORE','STATEMENT','INSERT,DELETE,UPDATE','aa_cashpool_lock',false,false),
  ('Repayments','BEFORE','ROW','INSERT,UPDATE','a000_blank_refs',false,false),
  ('Repayments','BEFORE','ROW','INSERT,DELETE,UPDATE','aa_vc_lock',false,false),
  ('Repayments','BEFORE','ROW','INSERT,DELETE,UPDATE','aa_vc_payment_lock',false,false),
  ('Repayments','BEFORE','ROW','DELETE,UPDATE','default_posting_guard',false,false),
  ('Repayments','BEFORE','ROW','INSERT,DELETE,UPDATE','lump_sum_child_guard',false,false),
  ('Repayments','AFTER','STATEMENT','INSERT,DELETE,UPDATE','zzzzz_business_history_flush',false,false),
  ('Repayments','AFTER','ROW','INSERT,DELETE,UPDATE','a001_parent_dirty',false,false),
  ('Repayments','AFTER','ROW','INSERT,DELETE,UPDATE','mw_agent_capture',false,false),
  ('Repayments','AFTER','ROW','INSERT,DELETE,UPDATE','vc_borrower_changed',true,true),
  ('Repayments','AFTER','ROW','INSERT,DELETE,UPDATE','vc_payment_changed',true,true),
  ('Repayments','AFTER','ROW','INSERT,DELETE,UPDATE','vc_repayment_changed',true,true),
  ('Repayments','AFTER','ROW','INSERT,DELETE,UPDATE','zzzz_business_history',false,false),
  ('Repayments','AFTER','ROW','INSERT,DELETE,UPDATE','zzzzzz_business_history_commit',true,true),
  ('Repayments','AFTER','ROW','INSERT,DELETE,UPDATE','zzzzzzz_pwa_row_change',false,false)
;
CREATE TEMP VIEW to_actual AS
 SELECT c.relname::text AS relation, CASE WHEN t.tgtype&2>0 THEN 'BEFORE' ELSE 'AFTER' END AS timing, CASE WHEN t.tgtype&1>0 THEN 'ROW' ELSE 'STATEMENT' END AS level,
  concat_ws(',',CASE WHEN t.tgtype&4>0 THEN 'INSERT' END,CASE WHEN t.tgtype&8>0 THEN 'DELETE' END,CASE WHEN t.tgtype&16>0 THEN 'UPDATE' END) AS events,
  t.tgname::text AS tgname, t.tgdeferrable AS is_deferrable, t.tginitdeferred AS is_initially_deferred
 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid WHERE NOT t.tgisinternal AND c.relname IN ('Payments','Loans','Charges','Repayments');
DO $$ DECLARE unexpected text[]; missing text[]; BEGIN
 unexpected:=ARRAY(SELECT format('%s %s %s %s',relation,timing,level,tgname) FROM (SELECT * FROM to_actual EXCEPT SELECT * FROM to_expected) x ORDER BY 1);
 missing:=ARRAY(SELECT format('%s %s %s %s',relation,timing,level,tgname) FROM (SELECT * FROM to_expected EXCEPT SELECT * FROM to_actual) x ORDER BY 1);
 IF cardinality(unexpected)>0 OR cardinality(missing)>0 THEN RAISE EXCEPTION 'Trigger snapshot differs; unexpected: %; missing: %',unexpected,missing; END IF;
 -- The blank-ref normalizer fires first in the BEFORE ROW partition of every table that has it; no legacy name remains.
 IF EXISTS(SELECT 1 FROM (SELECT c.oid, t.tgname, row_number() OVER (PARTITION BY c.oid ORDER BY t.tgname COLLATE "C") pos FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid WHERE NOT t.tgisinternal AND t.tgtype&3=3) x WHERE tgname='a000_blank_refs' AND pos<>1)
  OR (SELECT count(*) FROM pg_trigger WHERE tgname='a000_blank_refs')<>9 OR EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='appsheet_blank_refs') THEN RAISE EXCEPTION 'Blank-ref normalizer order broken'; END IF;
END $$;
-- V97 (R078): the change-log trigger exists exactly on the 19 tracked tables, carries the primary-key column as
-- its one argument and is the last non-deferred AFTER ROW trigger of each (deferred commit triggers fire at commit).
DO $$ DECLARE bad text[]; BEGIN
 bad:=ARRAY(SELECT format('%s missing',v.relation) FROM (VALUES ('Borrowers'),('Loans'),('Charges'),('Payments'),('Payment Allocations'),('Repayments'),('Business Expenses'),('Cash Accounts'),('Cash Holders'),('Cash Ledger'),
   ('Cash Pool Contributions'),('Settlements'),('Partners'),('r008_cash_account_cutover'),('pwa_payment_commands'),('Daily Analytics'),('Statistics'),
   ('Cash Statement Context'),('Loan Assessment SQL Lab')) v(relation)
   WHERE NOT EXISTS(SELECT 1 FROM pg_trigger t WHERE t.tgrelid=format('public.%I',v.relation)::regclass AND t.tgname='zzzzzzz_pwa_row_change' AND t.tgtype=29 AND t.tgenabled='O' AND NOT t.tgdeferrable
     AND t.tgfoid='public.pwa_track_row_change()'::regprocedure AND t.tgnargs=1
     AND convert_from(substring(t.tgargs from 1 for length(t.tgargs)-1),'UTF8')=(SELECT a.attname FROM pg_constraint k JOIN pg_attribute a ON a.attrelid=k.conrelid AND a.attnum=k.conkey[1] WHERE k.conrelid=t.tgrelid AND k.contype='p')))
  ||ARRAY(SELECT format('%s unexpected',t.tgrelid::regclass) FROM pg_trigger t WHERE t.tgname='zzzzzzz_pwa_row_change' AND t.tgrelid::regclass::text NOT IN ('"Borrowers"','"Loans"','"Charges"','"Payments"','"Payment Allocations"','"Repayments"',
   '"Business Expenses"','"Cash Accounts"','"Cash Holders"','"Cash Ledger"','"Cash Pool Contributions"','"Settlements"','"Partners"','r008_cash_account_cutover','pwa_payment_commands','"Daily Analytics"','"Statistics"','"Cash Statement Context"','"Loan Assessment SQL Lab"'))
  ||ARRAY(SELECT format('%s fires before %s',x.tgrelid::regclass,x.tgname) FROM pg_trigger x WHERE NOT x.tgisinternal AND x.tgtype&3=1 AND NOT x.tgdeferrable AND x.tgname COLLATE "C">'zzzzzzz_pwa_row_change'
   AND EXISTS(SELECT 1 FROM pg_trigger t WHERE t.tgrelid=x.tgrelid AND t.tgname='zzzzzzz_pwa_row_change'));
 IF cardinality(bad)>0 THEN RAISE EXCEPTION 'Change-log trigger placement differs: %',bad; END IF;
END $$;
SELECT 'Trigger order snapshot passed' AS result;
ROLLBACK;
