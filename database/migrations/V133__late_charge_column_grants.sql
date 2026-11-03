-- V133 (R118): "Repayments"."Late Charge Paid" for the jobs owner, and the PROD Metabase borrower reader's late sibling.
--
-- V132 added the late-charge columns and made the analytics refresh and the vc_* charge triggers read
-- sum("Interest Paid"+"Late Charge Paid"). A table- or view-level grant covers a new column; a column-level grant does not.
-- mw_jobs_owner_<env> reads "Repayments" column by column (the reviewed R053 dependency manifest, applied outside the
-- migration chain: "Payment Date","Principal Paid","Interest Paid","Ref Loans","Ref Charges"), so pwa_job_run_v1 ->
-- refresh_daily_analytics_scoped and charge inserts failed in DEV with "permission denied for table Repayments". V132 granted
-- the notify owner its column only (V132 line 128).
--
-- The audit (DEV column ACLs, and the R117 PROD capture project/outputs/dictionary-r117-20261103): on "Charges",
-- "Repayments", "Payment Allocations" and the views V132 extended, the only roles holding an interest sibling column by
-- column without its late column are mw_jobs_owner_<env> ("Repayments"."Interest Paid") and, in PROD only,
-- metabase_borrower_reader (olap_repayments_analytics."Interest Paid"). The jobs owner's "Charges" INSERT/UPDATE columns need
-- no late column (its default and the triggers cover it); nothing reads "Payment Allocations" column by column. Reader IAM
-- logins (names with '@') stay an operator step (scripts/configure-dev-read-role.py,
-- scripts/production/reader-capability-contract.json). GRANT is idempotent, so an existing grant is left as it is.
-- The self-check proves catalog-wide that no non-owner, non-superuser, non-IAM role reads a sibling column without its late
-- column (scripts/database/Test-AccessMatrix.sql repeats it as a parity test).

-- Preflight: V132 is applied (its five late columns exist) and V133 is not.
DO $preflight$
BEGIN
 IF (SELECT count(*) FROM pg_attribute WHERE attnum>0 AND NOT attisdropped AND (
     (attrelid='public."Charges"'::regclass AND attname IN ('Late Charge Due','Late Charge Paid','Late Charge Remaining'))
  OR (attrelid='public."Payment Allocations"'::regclass AND attname='Allocated Late Charge')
  OR (attrelid='public."Repayments"'::regclass AND attname='Late Charge Paid')))<>5
 THEN RAISE EXCEPTION 'V133 requires V132 (the late-charge columns)'; END IF;
END $preflight$;

-- The sibling pairs: (relation, interest-sibling column, late column). Only pairs whose both columns exist are used.
CREATE TEMPORARY TABLE v133_pairs(relation regclass,sibling name,late name) ON COMMIT DROP;
INSERT INTO v133_pairs
SELECT to_regclass(r),s,l FROM (VALUES
 ('public."Charges"','Interest Due','Late Charge Due'),('public."Charges"','Interest Paid','Late Charge Paid'),('public."Charges"','Interest Remaining','Late Charge Remaining'),
 ('public."Payment Allocations"','Allocated Interest','Allocated Late Charge'),
 ('public."Repayments"','Interest Paid','Late Charge Paid'),
 ('public.olap_charges_analytics','Interest Due','Late Charge Due'),('public.olap_charges_analytics','Interest Paid','Late Charge Paid'),('public.olap_charges_analytics','Interest Remaining','Late Charge Remaining'),
 ('public.olap_repayments_analytics','Interest Paid','Late Charge Paid'),
 ('public.oltp_upcoming_charge_events_v1','Interest Remaining','Late Charge Remaining'),
 ('public.reporting_income_statement','Principal Write-offs MTD','Late Charges Received MTD'),
 ('public.reporting_income_monthly','Principal Write-offs','Late Charges Received'),
 ('public.reporting_income_daily','Principal Write-offs','Late Charges Received'),
 ('public.reporting_income_events','Principal Write-offs','Late Charges Received')
) v(r,s,l)
WHERE to_regclass(r) IS NOT NULL
  AND EXISTS(SELECT 1 FROM pg_attribute a WHERE a.attrelid=to_regclass(r) AND a.attname=s AND a.attnum>0 AND NOT a.attisdropped)
  AND EXISTS(SELECT 1 FROM pg_attribute a WHERE a.attrelid=to_regclass(r) AND a.attname=l AND a.attnum>0 AND NOT a.attisdropped);
DO $pairs$ BEGIN IF (SELECT count(*) FROM v133_pairs)<>14 THEN RAISE EXCEPTION 'V133: % of 14 sibling pairs resolved',(SELECT count(*) FROM v133_pairs); END IF; END $pairs$;

DO $grant$
DECLARE jobs_owner text:='mw_jobs_owner_'||CASE current_database() WHEN 'loan_manager_prod' THEN 'prod' ELSE 'dev' END;
BEGIN
 IF to_regrole(jobs_owner) IS NULL THEN RAISE EXCEPTION 'V133: role % is missing',jobs_owner; END IF;
 EXECUTE format('GRANT SELECT ("Late Charge Paid") ON public."Repayments" TO %I',jobs_owner);
 -- PROD only: the Metabase borrower reader reads olap_repayments_analytics."Interest Paid" column by column.
 IF to_regrole('metabase_borrower_reader') IS NOT NULL
    AND has_column_privilege('metabase_borrower_reader','public.olap_repayments_analytics','Interest Paid','SELECT') THEN
  GRANT SELECT ("Late Charge Paid") ON public.olap_repayments_analytics TO metabase_borrower_reader;
 END IF;
END $grant$;

-- Self-check: every non-owner, non-superuser, non-IAM role with direct SELECT on a sibling now reads its late column.
DO $selfcheck$
DECLARE missing text;
BEGIN
 SELECT string_agg(format('%s %s.%s',r.rolname,p.relation,p.late),', ') INTO missing
 FROM v133_pairs p
 JOIN pg_attribute a ON a.attrelid=p.relation AND a.attname=p.sibling
 JOIN pg_class c ON c.oid=p.relation
 CROSS JOIN LATERAL aclexplode(a.attacl) x
 JOIN pg_roles r ON r.oid=x.grantee
 WHERE x.privilege_type='SELECT' AND x.grantee<>c.relowner AND NOT r.rolsuper AND position('@' IN r.rolname)=0
   AND NOT has_column_privilege(r.oid,p.relation,p.late::text,'SELECT');
 IF missing IS NOT NULL THEN RAISE EXCEPTION 'V133: roles still without their late column: %',missing; END IF;
END $selfcheck$;
