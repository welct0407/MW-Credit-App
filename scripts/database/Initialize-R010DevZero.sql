-- Explicit owner authorization: 20 September 2026, zero all five DEV accounts
-- and offset Dad 19,828 / Lisa 26,234. Operational DEV data only, NEVER promote.
-- Execute with psql -1 -v ON_ERROR_STOP=1 via the host-pinned runner.
SET LOCAL lock_timeout='10s';
SET LOCAL statement_timeout='60s';
LOCK TABLE public."Payments",public."Loans",public."Business Expenses",public."Settlements",public."Cash Ledger",public."Cash Accounts" IN SHARE ROW EXCLUSIVE MODE;
DO $$ BEGIN
 IF (SELECT count(*) FROM "Cash Accounts")<>5 OR EXISTS(SELECT 1 FROM r008_cash_account_cutover)
 THEN RAISE EXCEPTION 'Expected exactly five wholly uninitialized DEV accounts; stop on drift or retry'; END IF;
 IF (SELECT "Current Balance" FROM "Cash Holder Balances" WHERE "Ref Cash Holder"='ch:dad') IS DISTINCT FROM 19828::numeric
 OR (SELECT "Current Balance" FROM "Cash Holder Balances" WHERE "Ref Cash Holder"='ch:lisa') IS DISTINCT FROM 26234::numeric
 OR (SELECT "Current Balance" FROM "Cash Holder Balances" WHERE "Ref Cash Holder"='ch:tommy') IS DISTINCT FROM 0::numeric
 THEN RAISE EXCEPTION 'Holder balances differ from the explicitly approved amounts'; END IF;
 IF EXISTS(SELECT 1 FROM "Cash Accounts" WHERE "Ref Cash Holder" NOT IN ('ch:dad','ch:lisa','ch:tommy'))
 THEN RAISE EXCEPTION 'Unexpected account holder'; END IF;
END $$;
CREATE TEMP TABLE r010_ledger_before ON COMMIT DROP AS SELECT "Row ID",md5(row_to_json(l)::text) fingerprint FROM "Cash Ledger" l;
SET LOCAL r005.allow_cash_adjustment='on';
INSERT INTO "Cash Ledger"("Row ID","Movement Date","Movement Type","Amount","Ref From Cash Holder","Ref From Cash Account","Source Key","Notes","Created By") VALUES
 ('r010-dev-zero-dad-20260920',(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date,'Manual Correction',19828,'ch:dad',default_cash_account('ch:dad'),'MANUAL:r010-dev-zero-dad-20260920','Owner approved DEV-only reduction of holder balance to zero and zero initialization of all DEV accounts on 2026-09-20. No payment or loan reversal.','Owner authorization / R010'),
 ('r010-dev-zero-lisa-20260920',(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date,'Manual Correction',26234,'ch:lisa',default_cash_account('ch:lisa'),'MANUAL:r010-dev-zero-lisa-20260920','Owner approved DEV-only reduction of holder balance to zero and zero initialization of all DEV accounts on 2026-09-20. No payment or loan reversal.','Owner authorization / R010');
DO $$ DECLARE holder_allocation record; BEGIN
 FOR holder_allocation IN SELECT "Ref Cash Holder" holder,jsonb_object_agg("Row ID",0) openings FROM "Cash Accounts" GROUP BY 1 ORDER BY 1 LOOP
  PERFORM initialize_cash_accounts(holder_allocation.holder,holder_allocation.openings,'Owner authorization / R010','Owner approved zero DEV account opening on 2026-09-20 after auditable holder adjustments. Captured existing account flows; no history deletion.');
 END LOOP;
 IF EXISTS(SELECT 1 FROM "Cash Account Balances" WHERE NOT "Initialized" OR "Opening Balance"<>0 OR "Current Balance"<>0)
 OR (SELECT count(*) FROM r008_cash_account_cutover)<>5 THEN RAISE EXCEPTION 'Account zero initialization failed'; END IF;
 IF EXISTS(SELECT 1 FROM "Cash Holder Balances" h JOIN (SELECT "Ref Cash Holder",sum("Current Balance") n FROM "Cash Account Balances" GROUP BY 1) a USING("Ref Cash Holder") WHERE h."Current Balance" IS DISTINCT FROM a.n)
 THEN RAISE EXCEPTION 'Account/holder reconciliation failed'; END IF;
 IF EXISTS(SELECT 1 FROM "Cash Account Daily Summary Recent" WHERE "Statement Date"=(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date AND (NOT "Is Initialized" OR "Closing Balance" IS DISTINCT FROM 0::numeric))
 OR EXISTS(SELECT 1 FROM "Cash Account Statement Recent" WHERE "Balance After" IS NULL)
 THEN RAISE EXCEPTION 'Statement balances did not initialize'; END IF;
 IF EXISTS(SELECT 1 FROM r010_ledger_before b LEFT JOIN "Cash Ledger" l USING("Row ID") WHERE b.fingerprint IS DISTINCT FROM md5(row_to_json(l)::text))
 OR (SELECT count(*) FROM "Cash Ledger")<>(SELECT count(*)+2 FROM r010_ledger_before)
 THEN RAISE EXCEPTION 'Existing ledger preservation failed'; END IF;
END $$;
SELECT json_build_object('initializedAccounts',count(*),'zeroOpenings',count(*) FILTER(WHERE "Opening Balance"=0),'zeroCurrentBalances',count(*) FILTER(WHERE "Current Balance"=0)) FROM "Cash Account Balances";
