-- R120 referral rebate terms per referrer (owner authorization of 4 November 2026 for the four nullable columns and this
-- migration; design accepted the same day, Archie's anchor decisions). V134 is applied and stays.
-- Rule: rebate = least(round(profit x rate / 100), cap); profit is the interest and late charges received on the closed loan
-- (R118); rate and cap are the referrer's own "Referral Rebate Rate" and "Referral Rebate Cap" on "Borrowers", null meaning
-- the default 10 and 1,000. The terms are read when the close posts; a later change never restates a booked rebate, and the
-- applied terms are copied to the expense row ("Rebate Rate", "Rebate Cap"; Rule Version REFERRAL_REBATE_V2 on new rows).
-- Rate 0 is valid and books nothing (the existing rebate<=0 return).
-- Objects:
--  1. Columns: "Borrowers"."Referral Rebate Rate" (whole number 0 to 100) and "Referral Rebate Cap" (whole number 1 or more),
--     "Business Expenses"."Rebate Rate" and "Rebate Cap"; numeric, nullable, no default, no backfill, no index. The V15 row
--     check "Business Expenses_check2" (same name) accepts REFERRAL_REBATE_V1, or V2 with both applied terms present.
--  2. referral_rebate_terms(referrer text) jsonb: {"rate","cap","custom"} with the defaults filled in, the only place that
--     holds 10 and 1,000; LANGUAGE sql STABLE, invoker rights, EXECUTE for mw_app_<env> only (V122 projection form; the
--     journal owner and the command user are members, postgres is superuser).
--  3. create_referral_rebate and pwa_referral_rebate_projection_v1 call it (one rule, so the trigger and the Loan Close preview
--     cannot drift; the P4C05 drift check is unchanged and also catches a terms change between quote and close). The
--     projection result gains "profit" (whole baht text), "rate", "cap" (JSON numbers) and "custom" (boolean).
--  4. The borrower command: pwa_submit_operation_v2 accepts the optional inputs referralRebateRate and referralRebateCap (JSON
--     number or null, after aiCollectionEnabled, only when present; canonical text (i->k)::text) and writes them when present;
--     pwa_borrower_version_v2 hashes both columns (the Node mirror versionSql in services/business/borrowers.mjs is identical).
-- Grants on tables: none. Application roles and mw_integration_agent read both tables at table level; the notify owner's
-- column grants do not need the new columns. Every expense and borrower version hash changes once (the expense version
-- hashes to_jsonb of the row, as when V122 added "Ref Offset Payment").
-- Preflight: V134 is applied, none of the new objects exists, the runner can replace the routines. Self-check: owner, ACL,
-- security, volatility and configuration of every replaced routine unchanged; comments unchanged except the two rebate
-- routines; columns, checks and comments as designed; the new function's ACL; the R120 patches are in place.
-- Rollback: a later migration restores the V134 bodies; the columns stay (null reads as the default).

DO $preflight$
DECLARE problems text[]:='{}'; r record;
BEGIN
 IF current_database() NOT IN ('loan_manager_dev','payment_rehearsal','loan_manager_prod') THEN RAISE EXCEPTION 'Unsupported application database'; END IF;
 IF to_regprocedure('public.pwa_notify_content_v4(uuid,bigint)') IS NULL THEN problems:=problems||'V135 needs V134 (pwa_notify_content_v4)'::text; END IF;
 IF to_regprocedure('public.referral_rebate_terms(text)') IS NOT NULL THEN problems:=problems||'V135: referral_rebate_terms already exists'::text; END IF;
 IF EXISTS(SELECT 1 FROM pg_attribute WHERE NOT attisdropped AND attnum>0 AND (attrelid,attname) IN (('public."Borrowers"'::regclass,'Referral Rebate Rate'),
   ('public."Borrowers"'::regclass,'Referral Rebate Cap'),('public."Business Expenses"'::regclass,'Rebate Rate'),('public."Business Expenses"'::regclass,'Rebate Cap'))) THEN
  problems:=problems||'V135: a referral rebate terms column already exists'::text; END IF;
 IF (SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid='public."Business Expenses"'::regclass AND conname='Business Expenses_check2')
   IS DISTINCT FROM $c$CHECK ((("Source Type" <> 'Referral Rebate'::text) OR ((("Amount")::numeric > (0)::numeric) AND ("Ref Related Loan" IS NOT NULL) AND ("Ref Related Borrower" IS NOT NULL) AND ("Ref Payee Borrower" IS NOT NULL) AND ("Source Key" = ('REFERRAL_REBATE:'::text || "Ref Related Loan")) AND ("Rule Version" = 'REFERRAL_REBATE_V1'::text))))$c$ THEN
  problems:=problems||'V135: "Business Expenses_check2" differs from V15'::text; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=CASE current_database() WHEN 'loan_manager_prod' THEN 'mw_app_prod' ELSE 'mw_app_dev' END) THEN problems:=problems||'V135 needs the application role'::text; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=current_user AND rolsuper) THEN
  -- Replacing a routine needs its owner's authority (the owner window of the release).
  FOR r IN SELECT DISTINCT pg_get_userbyid(p.proowner) AS owner FROM pg_proc p WHERE p.oid IN ('public.create_referral_rebate(text)'::regprocedure,
    'public.pwa_referral_rebate_projection_v1(text,jsonb)'::regprocedure,'public.pwa_submit_operation_v2(text)'::regprocedure,'public.pwa_borrower_version_v2(text)'::regprocedure) LOOP
   IF NOT pg_has_role(current_user,r.owner,'USAGE') THEN problems:=problems||format('%s cannot replace routines owned by %s (owner window required)',current_user,r.owner); END IF;
  END LOOP;
 END IF;
 IF cardinality(problems)>0 THEN RAISE EXCEPTION 'V135 preflight: %',array_to_string(problems,'; '); END IF;
END $preflight$;

-- Snapshot of every routine this migration replaces in place: owner, effective ACL, security, volatility, configuration and
-- comment. The self-check compares them.
CREATE TEMP TABLE v135_routines ON COMMIT DROP AS
 SELECT r.name AS routine,pg_get_userbyid(p.proowner) AS owner,coalesce(p.proacl,acldefault('f',p.proowner)) AS effective,
  p.prosecdef AS definer,p.provolatile AS volatile,p.proconfig AS config,obj_description(p.oid,'pg_proc') AS comment
 FROM unnest(ARRAY['public.create_referral_rebate(text)','public.pwa_referral_rebate_projection_v1(text,jsonb)',
  'public.pwa_submit_operation_v2(text)','public.pwa_borrower_version_v2(text)']) r(name) JOIN pg_proc p ON p.oid=r.name::regprocedure;

-- 1. Columns.
ALTER TABLE public."Borrowers" ADD COLUMN "Referral Rebate Rate" numeric, ADD COLUMN "Referral Rebate Cap" numeric,
 ADD CONSTRAINT borrowers_referral_rebate_rate_check CHECK ("Referral Rebate Rate" IS NULL OR ("Referral Rebate Rate" BETWEEN 0 AND 100 AND "Referral Rebate Rate"=trunc("Referral Rebate Rate"))),
 ADD CONSTRAINT borrowers_referral_rebate_cap_check CHECK ("Referral Rebate Cap" IS NULL OR ("Referral Rebate Cap">=1 AND "Referral Rebate Cap"=trunc("Referral Rebate Cap")));
-- The referral rebate row check (V15, same name kept) pinned "Rule Version" REFERRAL_REBATE_V1; it now accepts V1 (rows
-- booked before V135) or V2 with the applied terms present.
ALTER TABLE public."Business Expenses" ADD COLUMN "Rebate Rate" numeric, ADD COLUMN "Rebate Cap" numeric,
 DROP CONSTRAINT "Business Expenses_check2",
 ADD CONSTRAINT "Business Expenses_check2" CHECK ("Source Type"<>'Referral Rebate' OR ("Amount"::numeric>0 AND "Ref Related Loan" IS NOT NULL AND "Ref Related Borrower" IS NOT NULL
  AND "Ref Payee Borrower" IS NOT NULL AND "Source Key"='REFERRAL_REBATE:'||"Ref Related Loan"
  AND ("Rule Version"='REFERRAL_REBATE_V1' OR ("Rule Version"='REFERRAL_REBATE_V2' AND "Rebate Rate" IS NOT NULL AND "Rebate Cap" IS NOT NULL))));
COMMENT ON COLUMN public."Borrowers"."Referral Rebate Rate" IS 'R120: percent of the profit (interest and late charges received) this borrower earns as referrer on each closed loan they referred, whole number 0 to 100; null = default 10 (referral_rebate_terms). 0 = no rebate.';
COMMENT ON COLUMN public."Borrowers"."Referral Rebate Cap" IS 'R120: most this borrower earns as referrer per closed referred loan, whole baht, 1 or more; null = default 1,000 (referral_rebate_terms).';
COMMENT ON COLUMN public."Business Expenses"."Rebate Rate" IS 'R120: referral rebate rate (percent) applied when this rebate was booked (REFERRAL_REBATE_V2); null on rows booked before V135 and on other expenses.';
COMMENT ON COLUMN public."Business Expenses"."Rebate Cap" IS 'R120: referral rebate cap (baht) applied when this rebate was booked (REFERRAL_REBATE_V2); null on rows booked before V135 and on other expenses.';

-- 2. The terms: the referrer's rate and cap with the defaults (10 and 1,000) filled in; an unknown referrer gets the defaults.
CREATE FUNCTION public.referral_rebate_terms(p_referrer text) RETURNS jsonb
    LANGUAGE sql STABLE
    SET search_path TO 'pg_catalog', 'public'
    AS $$
 SELECT jsonb_build_object('rate',coalesce(b."Referral Rebate Rate",10),'cap',coalesce(b."Referral Rebate Cap",1000),
  'custom',(b."Referral Rebate Rate" IS NOT NULL OR b."Referral Rebate Cap" IS NOT NULL))
 FROM (SELECT p_referrer AS id) k LEFT JOIN public."Borrowers" b ON b."Row ID"=k.id;
$$;
COMMENT ON FUNCTION public.referral_rebate_terms(text) IS 'R120: the referral rebate terms of a referrer: {"rate": percent, "cap": baht, "custom": either set on the Borrower}, defaults 10% and 1,000 when null. Shared by create_referral_rebate and pwa_referral_rebate_projection_v1. Read only.';

-- Execute rights (V122 form): the application role only (the command user and the journal owner are members); PUBLIC and
-- default-privilege grants (PROD's mw_integration_agent EXECUTE ON ROUTINES) are removed.
DO $acl$
DECLARE grantee text; app text:=CASE current_database() WHEN 'loan_manager_prod' THEN 'mw_app_prod' ELSE 'mw_app_dev' END;
BEGIN
 REVOKE ALL ON FUNCTION public.referral_rebate_terms(text) FROM PUBLIC;
 FOR grantee IN SELECT DISTINCT pg_get_userbyid(a.grantee) FROM pg_proc p CROSS JOIN LATERAL aclexplode(p.proacl) a
   WHERE p.oid='public.referral_rebate_terms(text)'::regprocedure AND a.grantee<>0 AND a.grantee<>p.proowner LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION public.referral_rebate_terms(text) FROM %I',grantee);
 END LOOP;
 EXECUTE format('GRANT EXECUTE ON FUNCTION public.referral_rebate_terms(text) TO %I',app);
END $acl$;

-- Exact, counted replacements in a routine's current definition (V132 method): every boundary must occur exactly once, else
-- the migration fails; bodies first created from a CRLF file keep CRLF line ends and are matched as written.
CREATE FUNCTION pg_temp.v135_patch(routine text, edits text[]) RETURNS void LANGUAGE plpgsql AS $patch$
DECLARE definition text:=pg_get_functiondef(routine::regprocedure); k integer; o text; n text;
BEGIN
 IF position('R120' IN definition)>0 THEN RAISE EXCEPTION 'V135: % is already patched',routine; END IF;
 FOR k IN 1..array_length(edits,1)/2 LOOP
  o:=edits[2*k-1];n:=edits[2*k];
  IF position(o IN definition)=0 AND position(E'\n' IN o)>0 THEN o:=replace(o,E'\n',E'\r\n');n:=replace(n,E'\n',E'\r\n'); END IF;
  IF (length(definition)-length(replace(definition,o,'')))/length(o)<>1 THEN RAISE EXCEPTION 'V135: unexpected % boundary %',routine,k; END IF;
  definition:=replace(definition,o,n);
 END LOOP;
 IF position('R120' IN definition)=0 THEN RAISE EXCEPTION 'V135: % patch carries no R120 marker',routine; END IF;
 EXECUTE definition;
END $patch$;

-- 3. The rebate and its preview read the referrer's terms.
SELECT pg_temp.v135_patch('public.create_referral_rebate(text)',ARRAY[
 $o$ plan jsonb; offset_plan jsonb; covered numeric; creator text; h text; request uuid; canonical text;$o$,
 $n$ plan jsonb; offset_plan jsonb; covered numeric; creator text; h text; request uuid; canonical text;
 terms jsonb; -- R120: the referrer's rate and cap$n$,
 $o$ rebate:=least(round(profit*0.10),1000);$o$,
 $n$ -- R120: the referrer's own rate and cap (referral_rebate_terms, defaults 10% and 1,000), as the projection reads them.
 terms:=public.referral_rebate_terms(referrer);
 rebate:=least(round(profit*(terms->>'rate')::numeric/100),(terms->>'cap')::numeric);$n$,
 $o$"Source Type","Source Key","Gross Profit Basis","Rule Version","Created By","Ref Offset Payment")$o$,
 $n$"Source Type","Source Key","Gross Profit Basis","Rule Version","Created By","Ref Offset Payment","Rebate Rate","Rebate Cap")$n$,
 $o$'REFERRAL_REBATE_V1','SQL:loan-close',offset_id)$o$,
 $n$'REFERRAL_REBATE_V2','SQL:loan-close',offset_id,(terms->>'rate')::numeric,(terms->>'cap')::numeric)$n$]);
COMMENT ON FUNCTION public.create_referral_rebate(text) IS 'R111/R118/R120: the referral rebate of a closed referred loan, the referrer''s rate (default 10%) of the interest and late charges received, at most the referrer''s cap (default 1,000), as an expense or offset to the referrer''s open loan; the applied terms are stored on the expense.';

SELECT pg_temp.v135_patch('public.pwa_referral_rebate_projection_v1(text,jsonb)',ARRAY[
 $o$principal numeric; profit numeric; rebate numeric;$o$,
 $n$principal numeric; profit numeric; rebate numeric; terms jsonb; -- R120$n$,
 $o$principal fully repaid, 10% of interest, at most 1,000.$o$,
 $n$principal fully repaid, the referrer's rate of the profit, at most the referrer's cap.$n$,
 $o$ rebate:=least(round(profit*0.10),1000);$o$,
 $n$ -- R120: the referrer's terms, shared with create_referral_rebate.
 terms:=public.referral_rebate_terms(referrer."Row ID");
 rebate:=least(round(profit*(terms->>'rate')::numeric/100),(terms->>'cap')::numeric);$n$,
 $o$'selfReferral',referrer."Row ID"=l."Ref Borrowers",$o$,
 $n$'selfReferral',referrer."Row ID"=l."Ref Borrowers",
  'profit',round(profit)::text,'rate',terms->'rate','cap',terms->'cap','custom',terms->'custom',$n$]);
COMMENT ON FUNCTION public.pwa_referral_rebate_projection_v1(text,jsonb) IS 'R111/R118/R120: the referral rebate a Loan Close with this calculation creates (create_referral_rebate rule: the referrer''s rate of interest and late charges, at most the referrer''s cap), its referrer, whether the referrer has an open loan, the profit base and the terms (rate, cap, custom); null when none. Read only.';

-- 4. The borrower command: two optional whole-number inputs after aiCollectionEnabled, written only when present.
SELECT pg_temp.v135_patch('public.pwa_submit_operation_v2(text)',ARRAY[
 $o$jsonb_object_keys(i-'aiCollectionEnabled') key)$o$,
 $n$jsonb_object_keys(i-'aiCollectionEnabled'-'referralRebateRate'-'referralRebateCap') key)$n$,
 $o$||CASE WHEN i?'aiCollectionEnabled' THEN ARRAY['aiCollectionEnabled'] ELSE ARRAY[]::text[] END LOOP$o$,
 $n$||CASE WHEN i?'aiCollectionEnabled' THEN ARRAY['aiCollectionEnabled'] ELSE ARRAY[]::text[] END||CASE WHEN i?'referralRebateRate' THEN ARRAY['referralRebateRate'] ELSE ARRAY[]::text[] END||CASE WHEN i?'referralRebateCap' THEN ARRAY['referralRebateCap'] ELSE ARRAY[]::text[] END LOOP$n$,
 $o$  IF k IN('hidden','aiCollectionEnabled') THEN IF jsonb_typeof(i->k) NOT IN('boolean','null') THEN RAISE EXCEPTION 'boolean';END IF;$o$,
 $n$  IF k IN('hidden','aiCollectionEnabled') THEN IF jsonb_typeof(i->k) NOT IN('boolean','null') THEN RAISE EXCEPTION 'boolean';END IF;
  -- R120: referral rebate rate (0 to 100) and cap (1 or more), whole numbers as JSON numbers, or null (the default).
  ELSIF k IN('referralRebateRate','referralRebateCap') THEN IF i->k<>'null'::jsonb AND (jsonb_typeof(i->k) IS DISTINCT FROM 'number' OR i->>k!~'^(0|[1-9][0-9]{0,11})$' OR (k='referralRebateRate' AND (i->>k)::numeric>100) OR (k='referralRebateCap' AND (i->>k)::numeric<1)) THEN RAISE EXCEPTION 'number';END IF;$n$,
 $o$WHEN k IN('hidden','aiCollectionEnabled') THEN (i->k)::text$o$,
 $n$WHEN k IN('hidden','aiCollectionEnabled','referralRebateRate','referralRebateCap') THEN (i->k)::text$n$,
 $o$"Borrower Note","Creation Date","AI Collection Enabled") VALUES($o$,
 $n$"Borrower Note","Creation Date","AI Collection Enabled","Referral Rebate Rate","Referral Rebate Cap") VALUES($n$,
 $o$CASE WHEN i?'aiCollectionEnabled' THEN (i->>'aiCollectionEnabled')::boolean ELSE true END);$o$,
 $n$CASE WHEN i?'aiCollectionEnabled' THEN (i->>'aiCollectionEnabled')::boolean ELSE true END,(i->>'referralRebateRate')::numeric,(i->>'referralRebateCap')::numeric);$n$,
 $o$"AI Collection Enabled"=CASE WHEN i?'aiCollectionEnabled' THEN (i->>'aiCollectionEnabled')::boolean ELSE "AI Collection Enabled" END WHERE "Row ID"=target;$o$,
 $n$"AI Collection Enabled"=CASE WHEN i?'aiCollectionEnabled' THEN (i->>'aiCollectionEnabled')::boolean ELSE "AI Collection Enabled" END,"Referral Rebate Rate"=CASE WHEN i?'referralRebateRate' THEN (i->>'referralRebateRate')::numeric ELSE "Referral Rebate Rate" END,"Referral Rebate Cap"=CASE WHEN i?'referralRebateCap' THEN (i->>'referralRebateCap')::numeric ELSE "Referral Rebate Cap" END WHERE "Row ID"=target;$n$]);

-- The borrower version hashes the two terms after "note" (services/business/borrowers.mjs versionSql is the same text).
SELECT pg_temp.v135_patch('public.pwa_borrower_version_v2(text)',ARRAY[
 $o$'note',b."Borrower Note" )::text$o$,
 $n$'note',b."Borrower Note",'referralRebateRate',b."Referral Rebate Rate",'referralRebateCap',b."Referral Rebate Cap" )::text$n$,
 $o$ SELECT encode(sha256($o$,
 $n$ -- R120: the referral rebate terms are part of the version.
 SELECT encode(sha256($n$]);

-- Self-check.
DO $check$
DECLARE bad text; app text:=CASE current_database() WHEN 'loan_manager_prod' THEN 'mw_app_prod' ELSE 'mw_app_dev' END;
BEGIN
 SELECT string_agg(o.routine,', ') INTO bad FROM v135_routines o JOIN pg_proc p ON p.oid=o.routine::regprocedure
  WHERE pg_get_userbyid(p.proowner)<>o.owner OR p.prosecdef<>o.definer OR p.provolatile<>o.volatile OR p.proconfig IS DISTINCT FROM o.config
   OR (o.routine NOT IN ('public.create_referral_rebate(text)','public.pwa_referral_rebate_projection_v1(text,jsonb)') AND obj_description(p.oid,'pg_proc') IS DISTINCT FROM o.comment)
   OR (SELECT array_agg(a.grantee::text||':'||a.privilege_type ORDER BY a.grantee,a.privilege_type) FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee<>p.proowner)
    IS DISTINCT FROM (SELECT array_agg(a.grantee::text||':'||a.privilege_type ORDER BY a.grantee,a.privilege_type) FROM aclexplode(o.effective) a WHERE a.grantee<>p.proowner);
 IF bad IS NOT NULL OR (SELECT count(*) FROM v135_routines)<>4 THEN RAISE EXCEPTION 'V135 changed the owner, privileges, attributes or comment of %',coalesce(bad,'an unexpected routine set'); END IF;
 SELECT string_agg(r,', ') INTO bad FROM unnest(ARRAY['public.create_referral_rebate(text)','public.pwa_referral_rebate_projection_v1(text,jsonb)',
   'public.pwa_submit_operation_v2(text)','public.pwa_borrower_version_v2(text)']) r WHERE position('R120' IN pg_get_functiondef(r::regprocedure))=0;
 IF bad IS NOT NULL THEN RAISE EXCEPTION 'V135: not patched: %',bad; END IF;
 IF position('0.10' IN pg_get_functiondef('public.create_referral_rebate(text)'::regprocedure))>0 OR position('0.10' IN pg_get_functiondef('public.pwa_referral_rebate_projection_v1(text,jsonb)'::regprocedure))>0
  OR position('REFERRAL_REBATE_V1' IN pg_get_functiondef('public.create_referral_rebate(text)'::regprocedure))>0 THEN RAISE EXCEPTION 'V135: a rebate routine keeps the fixed rule'; END IF;
 -- The new function: invoker rights, stable, EXECUTE for the application role only.
 IF (SELECT array_agg(DISTINCT CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END||':'||a.privilege_type) FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
   WHERE p.oid='public.referral_rebate_terms(text)'::regprocedure AND a.grantee<>p.proowner) IS DISTINCT FROM ARRAY[app||':EXECUTE']
  OR (SELECT prosecdef OR provolatile<>'s' FROM pg_proc WHERE oid='public.referral_rebate_terms(text)'::regprocedure) THEN RAISE EXCEPTION 'V135: unexpected access or attributes of referral_rebate_terms'; END IF;
 IF public.referral_rebate_terms(NULL)<>'{"cap": 1000, "rate": 10, "custom": false}'::jsonb THEN RAISE EXCEPTION 'V135: the default terms differ from the design'; END IF;
 -- Columns: types, nullability, no default, comments; the two checks.
 IF (SELECT array_agg(format('%s.%s:%s:%s:%s',a.attrelid::regclass,a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,a.atthasdef) ORDER BY a.attrelid::regclass::text,a.attnum)
     FROM pg_attribute a WHERE a.attrelid IN ('public."Borrowers"'::regclass,'public."Business Expenses"'::regclass) AND NOT a.attisdropped AND col_description(a.attrelid,a.attnum) LIKE 'R120:%')
    IS DISTINCT FROM ARRAY['"Borrowers".Referral Rebate Rate:numeric:f:f','"Borrowers".Referral Rebate Cap:numeric:f:f','"Business Expenses".Rebate Rate:numeric:f:f','"Business Expenses".Rebate Cap:numeric:f:f'] THEN
  RAISE EXCEPTION 'V135: the referral rebate terms columns differ from the design'; END IF;
 IF (SELECT count(*) FROM pg_constraint WHERE conrelid='public."Borrowers"'::regclass AND contype='c' AND convalidated
     AND conname IN ('borrowers_referral_rebate_rate_check','borrowers_referral_rebate_cap_check'))<>2
  OR position($c$'REFERRAL_REBATE_V2'$c$ IN (SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid='public."Business Expenses"'::regclass AND conname='Business Expenses_check2' AND convalidated))=0
  THEN RAISE EXCEPTION 'V135: the terms checks are missing'; END IF;
END $check$;
