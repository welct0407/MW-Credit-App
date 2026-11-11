\set ON_ERROR_STOP on
-- R140 V144 upgrade route at the head (after Test-PaidDate-Before.sql at V143): the migration moved no cash row, every
-- "Paid Date" is null, and the paid rows keep their cash on the Expense Date.
DO $$ BEGIN
 IF (SELECT n||'|'||digest FROM pd_before.ledger) IS DISTINCT FROM (SELECT count(*)||'|'||md5(coalesce(string_agg(to_jsonb(c)::text,'|' ORDER BY c."Row ID" COLLATE "C"),'')) FROM "Cash Ledger" c) THEN
  RAISE EXCEPTION 'FAILED: V144 moved a cash ledger row'; END IF;
 IF EXISTS(SELECT 1 FROM "Business Expenses" WHERE "Paid Date" IS NOT NULL) THEN RAISE EXCEPTION 'FAILED: a paid date was backfilled'; END IF;
 IF (SELECT string_agg(l."Ref Business Expense"||'='||(l."Movement Date"=e."Expense Date")::text,',' ORDER BY l."Ref Business Expense") FROM "Cash Ledger" l JOIN "Business Expenses" e ON e."Row ID"=l."Ref Business Expense" WHERE e."Row ID" LIKE 'PDB-%')
   IS DISTINCT FROM 'PDB-PAID-1=true,PDB-PAID-2=true' THEN RAISE EXCEPTION 'FAILED: the paid rows left the Expense Date'; END IF;
END $$;
SELECT 'Paid date upgrade route passed' AS result;
