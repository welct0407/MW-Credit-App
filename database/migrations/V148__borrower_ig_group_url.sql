-- R153 borrower Instagram group chat link (owner request and authorization of 13 November 2026 for the new column
-- "Borrowers"."IG Group URL", this migration and PROD in this release; Archie's plan, orchestrator-accepted, decisions D3
-- and D4). V147 is applied and stays.
-- The owner fills the link once per borrower by hand. The collection detail's group chat summary card offers it as "Open
-- chat" (read service: groupChat.url, only while a summary exists). It is a display link: nothing financial, no
-- notification and no agent reads it. By owner decision the column stores an Instagram thread link; R146 had kept
-- Instagram thread ids out of the application database (the agent's own state keeps only a hashed key), and this column is
-- the one deliberate exception, written only by the owner through the borrower command.
-- Rule (one text in SQL, services/business/borrowers.mjs canonicalBorrowerFields and apps/pwa/src/ig-group-url.ts):
--   ^https://((www\.)?instagram\.com/direct/|ig\.me/)[A-Za-z0-9._~%/?=&+-]{1,255}$
-- (https only; instagram.com or www.instagram.com under /direct/, or ig.me; no user info, no space, no fragment; at most 255
-- characters after the prefix). Null means no link. An empty string is not a link (the PWA sends null for a blank field).
-- Objects:
--  1. Column "Borrowers"."IG Group URL" text, nullable, no default, no backfill, no index; CHECK borrowers_ig_group_url_check.
--  2. The borrower command: pwa_submit_operation_v2 accepts the optional input igGroupUrl (JSON string matching the rule, or
--     null; canonical position after referralRebateCap, only when present; canonical text to_json(i->>k)) and writes it
--     only when present, so a command without the key (an earlier PWA build, the offline queue, a chat proposal, the
--     collection note) keeps the stored link. pwa_borrower_version_v2 hashes it after referralRebateCap (the Node mirror
--     versionSql in services/business/borrowers.mjs reads it through to_jsonb(b), absent before V148).
-- Grants on tables: none here. The application roles read "Borrowers" at table level. The reader login holds column grants
-- only: the operator adds SELECT ("IG Group URL") from scripts/production/reader-capability-contract.json (PROD) and
-- scripts/configure-dev-read-role.py (DEV) after this migration; until then the read service leaves groupChat.url out.
-- Every borrower version hash changes once (the version object gains "igGroupUrl": null); a client editing with an older
-- version gets source_conflict and re-reads, as after V135.
-- Preflight: V147 is applied, the column does not exist, neither routine carries the R153 marker, the runner can replace
-- the routines. Self-check: owner, ACL, security, volatility, configuration and comment of both routines unchanged; the
-- column, its check and comment as designed; the R153 patches are in place.
-- Rollback: a later migration restores the V147 bodies; the column stays (null reads as no link).

DO $preflight$
DECLARE problems text[]:='{}'; r record;
BEGIN
 IF current_database() NOT IN ('loan_manager_dev','payment_rehearsal','loan_manager_prod') THEN RAISE EXCEPTION 'Unsupported application database'; END IF;
 IF to_regprocedure('public.pwa_mark_group_chat_seen_v1(jsonb,text,timestamptz)') IS NULL THEN problems:=problems||'V148 needs V147 (pwa_mark_group_chat_seen_v1)'::text; END IF;
 IF EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='public."Borrowers"'::regclass AND attname='IG Group URL' AND attnum>0 AND NOT attisdropped) THEN
  problems:=problems||'V148: "Borrowers"."IG Group URL" already exists'::text; END IF;
 IF EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public."Borrowers"'::regclass AND conname='borrowers_ig_group_url_check') THEN
  problems:=problems||'V148: borrowers_ig_group_url_check already exists'::text; END IF;
 IF position('R153' IN pg_get_functiondef('public.pwa_submit_operation_v2(text)'::regprocedure))>0 OR position('R153' IN pg_get_functiondef('public.pwa_borrower_version_v2(text)'::regprocedure))>0 THEN
  problems:=problems||'V148: a borrower routine is already patched'::text; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=current_user AND rolsuper) THEN
  -- Replacing a routine needs its owner's authority (the owner window of the release).
  FOR r IN SELECT DISTINCT pg_get_userbyid(p.proowner) AS owner FROM pg_proc p WHERE p.oid IN ('public.pwa_submit_operation_v2(text)'::regprocedure,'public.pwa_borrower_version_v2(text)'::regprocedure) LOOP
   IF NOT pg_has_role(current_user,r.owner,'USAGE') THEN problems:=problems||format('%s cannot replace routines owned by %s (owner window required)',current_user,r.owner); END IF;
  END LOOP;
 END IF;
 IF cardinality(problems)>0 THEN RAISE EXCEPTION 'V148 preflight: %',array_to_string(problems,'; '); END IF;
END $preflight$;

-- Snapshot of every routine this migration replaces in place: owner, effective ACL, security, volatility, configuration and
-- comment. The self-check compares them.
CREATE TEMP TABLE v148_routines ON COMMIT DROP AS
 SELECT r.name AS routine,pg_get_userbyid(p.proowner) AS owner,coalesce(p.proacl,acldefault('f',p.proowner)) AS effective,
  p.prosecdef AS definer,p.provolatile AS volatile,p.proconfig AS config,obj_description(p.oid,'pg_proc') AS comment
 FROM unnest(ARRAY['public.pwa_submit_operation_v2(text)','public.pwa_borrower_version_v2(text)']) r(name) JOIN pg_proc p ON p.oid=r.name::regprocedure;

-- 1. The column.
ALTER TABLE public."Borrowers" ADD COLUMN "IG Group URL" text,
 ADD CONSTRAINT borrowers_ig_group_url_check CHECK ("IG Group URL" IS NULL OR "IG Group URL" ~ '^https://((www\.)?instagram\.com/direct/|ig\.me/)[A-Za-z0-9._~%/?=&+-]{1,255}$');
COMMENT ON COLUMN public."Borrowers"."IG Group URL" IS 'R153: link to this borrower''s Instagram group chat (https://instagram.com/direct/..., https://www.instagram.com/direct/... or https://ig.me/...), set by the owner; shown as Open chat on the collection group chat summary card. Null = no link. Display only.';

-- Exact, counted replacements in a routine's current definition (V132/V135 method): every boundary must occur exactly once,
-- else the migration fails; bodies first created from a CRLF file keep CRLF line ends and are matched as written.
CREATE FUNCTION pg_temp.v148_patch(routine text, edits text[]) RETURNS void LANGUAGE plpgsql AS $patch$
DECLARE definition text:=pg_get_functiondef(routine::regprocedure); k integer; o text; n text;
BEGIN
 IF position('R153' IN definition)>0 THEN RAISE EXCEPTION 'V148: % is already patched',routine; END IF;
 FOR k IN 1..array_length(edits,1)/2 LOOP
  o:=edits[2*k-1];n:=edits[2*k];
  IF position(o IN definition)=0 AND position(E'\n' IN o)>0 THEN o:=replace(o,E'\n',E'\r\n');n:=replace(n,E'\n',E'\r\n'); END IF;
  IF (length(definition)-length(replace(definition,o,'')))/length(o)<>1 THEN RAISE EXCEPTION 'V148: unexpected % boundary %',routine,k; END IF;
  definition:=replace(definition,o,n);
 END LOOP;
 IF position('R153' IN definition)=0 THEN RAISE EXCEPTION 'V148: % patch carries no R153 marker',routine; END IF;
 EXECUTE definition;
END $patch$;

-- 2. The borrower command: one optional text input after referralRebateCap, written only when present.
SELECT pg_temp.v148_patch('public.pwa_submit_operation_v2(text)',ARRAY[
 $o$jsonb_object_keys(i-'aiCollectionEnabled'-'referralRebateRate'-'referralRebateCap') key)$o$,
 $n$jsonb_object_keys(i-'aiCollectionEnabled'-'referralRebateRate'-'referralRebateCap'-'igGroupUrl') key)$n$,
 $o$||CASE WHEN i?'referralRebateCap' THEN ARRAY['referralRebateCap'] ELSE ARRAY[]::text[] END LOOP$o$,
 $n$||CASE WHEN i?'referralRebateCap' THEN ARRAY['referralRebateCap'] ELSE ARRAY[]::text[] END||CASE WHEN i?'igGroupUrl' THEN ARRAY['igGroupUrl'] ELSE ARRAY[]::text[] END LOOP$n$,
 $o$THEN RAISE EXCEPTION 'number';END IF;$o$,
 $n$THEN RAISE EXCEPTION 'number';END IF;
  -- R153: the Instagram group chat link, a JSON string matching the "IG Group URL" column check, or null (no link).
  ELSIF k='igGroupUrl' THEN IF i->k<>'null'::jsonb AND (jsonb_typeof(i->k) IS DISTINCT FROM 'string' OR i->>k!~'^https://((www\.)?instagram\.com/direct/|ig\.me/)[A-Za-z0-9._~%/?=&+-]{1,255}$') THEN RAISE EXCEPTION 'url';END IF;$n$,
 $o$"Referral Rebate Rate","Referral Rebate Cap") VALUES($o$,
 $n$"Referral Rebate Rate","Referral Rebate Cap","IG Group URL") VALUES($n$,
 $o$(i->>'referralRebateRate')::numeric,(i->>'referralRebateCap')::numeric);$o$,
 $n$(i->>'referralRebateRate')::numeric,(i->>'referralRebateCap')::numeric,i->>'igGroupUrl');$n$,
 $o$"Referral Rebate Cap"=CASE WHEN i?'referralRebateCap' THEN (i->>'referralRebateCap')::numeric ELSE "Referral Rebate Cap" END WHERE "Row ID"=target;$o$,
 $n$"Referral Rebate Cap"=CASE WHEN i?'referralRebateCap' THEN (i->>'referralRebateCap')::numeric ELSE "Referral Rebate Cap" END,"IG Group URL"=CASE WHEN i?'igGroupUrl' THEN i->>'igGroupUrl' ELSE "IG Group URL" END WHERE "Row ID"=target;$n$]);

-- The borrower version hashes the link after the terms (services/business/borrowers.mjs versionSql is the same jsonb text).
SELECT pg_temp.v148_patch('public.pwa_borrower_version_v2(text)',ARRAY[
 $o$'referralRebateCap',b."Referral Rebate Cap" )::text$o$,
 $n$'referralRebateCap',b."Referral Rebate Cap",'igGroupUrl',b."IG Group URL" )::text$n$,
 $o$ -- R120: the referral rebate terms are part of the version.$o$,
 $n$ -- R120: the referral rebate terms are part of the version.
 -- R153: the Instagram group chat link is part of the version.$n$]);

-- Self-check.
DO $check$
DECLARE bad text;
BEGIN
 SELECT string_agg(o.routine,', ') INTO bad FROM v148_routines o JOIN pg_proc p ON p.oid=o.routine::regprocedure
  WHERE pg_get_userbyid(p.proowner)<>o.owner OR p.prosecdef<>o.definer OR p.provolatile<>o.volatile OR p.proconfig IS DISTINCT FROM o.config
   OR obj_description(p.oid,'pg_proc') IS DISTINCT FROM o.comment
   OR (SELECT array_agg(a.grantee::text||':'||a.privilege_type ORDER BY a.grantee,a.privilege_type) FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee<>p.proowner)
    IS DISTINCT FROM (SELECT array_agg(a.grantee::text||':'||a.privilege_type ORDER BY a.grantee,a.privilege_type) FROM aclexplode(o.effective) a WHERE a.grantee<>p.proowner);
 IF bad IS NOT NULL OR (SELECT count(*) FROM v148_routines)<>2 THEN RAISE EXCEPTION 'V148 changed the owner, privileges, attributes or comment of %',coalesce(bad,'an unexpected routine set'); END IF;
 SELECT string_agg(r,', ') INTO bad FROM unnest(ARRAY['public.pwa_submit_operation_v2(text)','public.pwa_borrower_version_v2(text)']) r
  WHERE position('R153' IN pg_get_functiondef(r::regprocedure))=0 OR position('igGroupUrl' IN pg_get_functiondef(r::regprocedure))=0;
 IF bad IS NOT NULL THEN RAISE EXCEPTION 'V148: not patched: %',bad; END IF;
 -- The column: text, nullable, no default, its comment; the check validated and the rule as designed.
 IF (SELECT array_agg(format('%s:%s:%s',format_type(a.atttypid,a.atttypmod),a.attnotnull,a.atthasdef)) FROM pg_attribute a
     WHERE a.attrelid='public."Borrowers"'::regclass AND a.attname='IG Group URL' AND NOT a.attisdropped AND col_description(a.attrelid,a.attnum) LIKE 'R153:%')
    IS DISTINCT FROM ARRAY['text:f:f'] THEN RAISE EXCEPTION 'V148: the "IG Group URL" column differs from the design'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public."Borrowers"'::regclass AND contype='c' AND convalidated AND conname='borrowers_ig_group_url_check') THEN
  RAISE EXCEPTION 'V148: borrowers_ig_group_url_check is missing'; END IF;
 -- The rule accepts the three link forms and refuses the near misses (invented thread ids only).
 IF NOT ('https://www.instagram.com/direct/t/100000000000001/' ~ '^https://((www\.)?instagram\.com/direct/|ig\.me/)[A-Za-z0-9._~%/?=&+-]{1,255}$'
   AND 'https://instagram.com/direct/t/100000000000001' ~ '^https://((www\.)?instagram\.com/direct/|ig\.me/)[A-Za-z0-9._~%/?=&+-]{1,255}$'
   AND 'https://ig.me/j/InventedLink01/' ~ '^https://((www\.)?instagram\.com/direct/|ig\.me/)[A-Za-z0-9._~%/?=&+-]{1,255}$')
  OR 'http://www.instagram.com/direct/t/100000000000001/' ~ '^https://((www\.)?instagram\.com/direct/|ig\.me/)[A-Za-z0-9._~%/?=&+-]{1,255}$'
  OR 'https://user@www.instagram.com/direct/t/100000000000001/' ~ '^https://((www\.)?instagram\.com/direct/|ig\.me/)[A-Za-z0-9._~%/?=&+-]{1,255}$'
  OR 'https://www.instagram.com.example.invalid/direct/t/1/' ~ '^https://((www\.)?instagram\.com/direct/|ig\.me/)[A-Za-z0-9._~%/?=&+-]{1,255}$'
  OR 'https://www.instagram.com/direct/t/1 2/' ~ '^https://((www\.)?instagram\.com/direct/|ig\.me/)[A-Za-z0-9._~%/?=&+-]{1,255}$'
  OR ('https://ig.me/'||repeat('a',256)) ~'^https://((www\.)?instagram\.com/direct/|ig\.me/)[A-Za-z0-9._~%/?=&+-]{1,255}$'
 THEN RAISE EXCEPTION 'V148: the link rule differs from the design'; END IF;
END $check$;
