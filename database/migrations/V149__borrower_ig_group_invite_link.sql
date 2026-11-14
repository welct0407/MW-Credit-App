-- R154 borrower Instagram group invite link (owner request and authorization of 14 November 2026 for the new column
-- "Borrowers"."IG Group Invite Link", this migration and PROD in this release; orchestrator plan R154, decisions D1 and D2).
-- V148 is applied and stays.
-- R153's "IG Group URL" opens the Instagram app on an iPhone but not the group itself (owner test of 14 November 2026); the
-- group's invite link (https://ig.me/j/...) does. The owner fills this second link by hand; the collection detail's group
-- chat summary card opens it on a phone and the instagram.com link on a computer (read service: groupChat.inviteUrl beside
-- groupChat.url, only while a summary exists). It is a display link: nothing financial, no notification and no agent reads
-- it. An invite link lets anyone who holds it join the group: it is stored only here, written only by the owner through the
-- borrower command, and can be reset in Instagram.
-- Rule (one text in SQL, services/business/borrowers.mjs canonicalBorrowerFields and apps/pwa/src/ig-group-url.ts):
--   ^https://ig\.me/j/[A-Za-z0-9._~%/?=&+-]{1,255}$
-- (https only; ig.me under /j/; no user info, no space, no fragment; at most 255 characters after the prefix). Null means no
-- invite link. An empty string is not a link (the PWA sends null for a blank field). "IG Group URL" and its rule stay.
-- Objects:
--  1. Column "Borrowers"."IG Group Invite Link" text, nullable, no default, no backfill, no index; CHECK
--     borrowers_ig_group_invite_link_check.
--  2. The borrower command: pwa_submit_operation_v2 accepts the optional input igGroupInviteLink (JSON string matching the
--     rule, or null; canonical position right after igGroupUrl, only when present; canonical text to_json(i->>k)) and
--     writes it only when present, so a command without the key keeps the stored link. pwa_borrower_version_v2 hashes it
--     after igGroupUrl (the Node mirror versionSql in services/business/borrowers.mjs reads it through to_jsonb(b), absent
--     before V149).
-- Grants on tables: none here. The application roles read "Borrowers" at table level. The reader login holds column grants
-- only: the operator adds SELECT ("IG Group Invite Link") from scripts/production/reader-capability-contract.json (PROD) and
-- scripts/configure-dev-read-role.py (DEV) after this migration; until then the read service leaves groupChat.inviteUrl out.
-- Every borrower version hash changes once (the version object gains "igGroupInviteLink": null); a client editing with an
-- older version gets source_conflict and re-reads, as after V148.
-- Preflight: V148 is applied, the column does not exist, neither routine carries the R154 marker, the runner can replace
-- the routines. Self-check: owner, ACL, security, volatility, configuration and comment of both routines unchanged; the
-- column, its check and comment as designed; the R154 patches are in place.
-- Rollback: a later migration restores the V148 bodies; the column stays (null reads as no invite link).

DO $preflight$
DECLARE problems text[]:='{}'; r record;
BEGIN
 IF current_database() NOT IN ('loan_manager_dev','payment_rehearsal','loan_manager_prod') THEN RAISE EXCEPTION 'Unsupported application database'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='public."Borrowers"'::regclass AND attname='IG Group URL' AND attnum>0 AND NOT attisdropped)
   OR position('R153' IN pg_get_functiondef('public.pwa_submit_operation_v2(text)'::regprocedure))=0 THEN problems:=problems||'V149 needs V148 ("IG Group URL")'::text; END IF;
 IF EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='public."Borrowers"'::regclass AND attname='IG Group Invite Link' AND attnum>0 AND NOT attisdropped) THEN
  problems:=problems||'V149: "Borrowers"."IG Group Invite Link" already exists'::text; END IF;
 IF EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public."Borrowers"'::regclass AND conname='borrowers_ig_group_invite_link_check') THEN
  problems:=problems||'V149: borrowers_ig_group_invite_link_check already exists'::text; END IF;
 IF position('R154' IN pg_get_functiondef('public.pwa_submit_operation_v2(text)'::regprocedure))>0 OR position('R154' IN pg_get_functiondef('public.pwa_borrower_version_v2(text)'::regprocedure))>0 THEN
  problems:=problems||'V149: a borrower routine is already patched'::text; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=current_user AND rolsuper) THEN
  -- Replacing a routine needs its owner's authority (the owner window of the release).
  FOR r IN SELECT DISTINCT pg_get_userbyid(p.proowner) AS owner FROM pg_proc p WHERE p.oid IN ('public.pwa_submit_operation_v2(text)'::regprocedure,'public.pwa_borrower_version_v2(text)'::regprocedure) LOOP
   IF NOT pg_has_role(current_user,r.owner,'USAGE') THEN problems:=problems||format('%s cannot replace routines owned by %s (owner window required)',current_user,r.owner); END IF;
  END LOOP;
 END IF;
 IF cardinality(problems)>0 THEN RAISE EXCEPTION 'V149 preflight: %',array_to_string(problems,'; '); END IF;
END $preflight$;

-- Snapshot of every routine this migration replaces in place: owner, effective ACL, security, volatility, configuration and
-- comment. The self-check compares them.
CREATE TEMP TABLE v149_routines ON COMMIT DROP AS
 SELECT r.name AS routine,pg_get_userbyid(p.proowner) AS owner,coalesce(p.proacl,acldefault('f',p.proowner)) AS effective,
  p.prosecdef AS definer,p.provolatile AS volatile,p.proconfig AS config,obj_description(p.oid,'pg_proc') AS comment
 FROM unnest(ARRAY['public.pwa_submit_operation_v2(text)','public.pwa_borrower_version_v2(text)']) r(name) JOIN pg_proc p ON p.oid=r.name::regprocedure;

-- 1. The column.
ALTER TABLE public."Borrowers" ADD COLUMN "IG Group Invite Link" text,
 ADD CONSTRAINT borrowers_ig_group_invite_link_check CHECK ("IG Group Invite Link" IS NULL OR "IG Group Invite Link" ~ '^https://ig\.me/j/[A-Za-z0-9._~%/?=&+-]{1,255}$');
COMMENT ON COLUMN public."Borrowers"."IG Group Invite Link" IS 'R154: invite link of this borrower''s Instagram group chat (https://ig.me/j/...), set by the owner; the collection group chat summary card opens it on a phone (it opens the group in the Instagram app). Anyone holding it can join the group; reset it in Instagram if it leaks. Null = none. Display only.';

-- Exact, counted replacements in a routine's current definition (V132/V135/V148 method): every boundary must occur exactly
-- once, else the migration fails; bodies first created from a CRLF file keep CRLF line ends and are matched as written.
CREATE FUNCTION pg_temp.v149_patch(routine text, edits text[]) RETURNS void LANGUAGE plpgsql AS $patch$
DECLARE definition text:=pg_get_functiondef(routine::regprocedure); k integer; o text; n text;
BEGIN
 IF position('R154' IN definition)>0 THEN RAISE EXCEPTION 'V149: % is already patched',routine; END IF;
 FOR k IN 1..array_length(edits,1)/2 LOOP
  o:=edits[2*k-1];n:=edits[2*k];
  IF position(o IN definition)=0 AND position(E'\n' IN o)>0 THEN o:=replace(o,E'\n',E'\r\n');n:=replace(n,E'\n',E'\r\n'); END IF;
  IF (length(definition)-length(replace(definition,o,'')))/length(o)<>1 THEN RAISE EXCEPTION 'V149: unexpected % boundary %',routine,k; END IF;
  definition:=replace(definition,o,n);
 END LOOP;
 IF position('R154' IN definition)=0 THEN RAISE EXCEPTION 'V149: % patch carries no R154 marker',routine; END IF;
 EXECUTE definition;
END $patch$;

-- 2. The borrower command: one optional text input right after igGroupUrl, written only when present.
SELECT pg_temp.v149_patch('public.pwa_submit_operation_v2(text)',ARRAY[
 $o$jsonb_object_keys(i-'aiCollectionEnabled'-'referralRebateRate'-'referralRebateCap'-'igGroupUrl') key)$o$,
 $n$jsonb_object_keys(i-'aiCollectionEnabled'-'referralRebateRate'-'referralRebateCap'-'igGroupUrl'-'igGroupInviteLink') key)$n$,
 $o$||CASE WHEN i?'igGroupUrl' THEN ARRAY['igGroupUrl'] ELSE ARRAY[]::text[] END LOOP$o$,
 $n$||CASE WHEN i?'igGroupUrl' THEN ARRAY['igGroupUrl'] ELSE ARRAY[]::text[] END||CASE WHEN i?'igGroupInviteLink' THEN ARRAY['igGroupInviteLink'] ELSE ARRAY[]::text[] END LOOP$n$,
 $o$THEN RAISE EXCEPTION 'url';END IF;$o$,
 $n$THEN RAISE EXCEPTION 'url';END IF;
  -- R154: the Instagram group invite link, a JSON string matching the "IG Group Invite Link" column check, or null (none).
  ELSIF k='igGroupInviteLink' THEN IF i->k<>'null'::jsonb AND (jsonb_typeof(i->k) IS DISTINCT FROM 'string' OR i->>k!~'^https://ig\.me/j/[A-Za-z0-9._~%/?=&+-]{1,255}$') THEN RAISE EXCEPTION 'invite';END IF;$n$,
 $o$"Referral Rebate Cap","IG Group URL") VALUES($o$,
 $n$"Referral Rebate Cap","IG Group URL","IG Group Invite Link") VALUES($n$,
 $o$,i->>'igGroupUrl');$o$,
 $n$,i->>'igGroupUrl',i->>'igGroupInviteLink');$n$,
 $o$"IG Group URL"=CASE WHEN i?'igGroupUrl' THEN i->>'igGroupUrl' ELSE "IG Group URL" END WHERE "Row ID"=target;$o$,
 $n$"IG Group URL"=CASE WHEN i?'igGroupUrl' THEN i->>'igGroupUrl' ELSE "IG Group URL" END,"IG Group Invite Link"=CASE WHEN i?'igGroupInviteLink' THEN i->>'igGroupInviteLink' ELSE "IG Group Invite Link" END WHERE "Row ID"=target;$n$]);

-- The borrower version hashes the invite link after the group link (services/business/borrowers.mjs versionSql is the same
-- jsonb text).
SELECT pg_temp.v149_patch('public.pwa_borrower_version_v2(text)',ARRAY[
 $o$'igGroupUrl',b."IG Group URL" )::text$o$,
 $n$'igGroupUrl',b."IG Group URL",'igGroupInviteLink',b."IG Group Invite Link" )::text$n$,
 $o$ -- R153: the Instagram group chat link is part of the version.$o$,
 $n$ -- R153: the Instagram group chat link is part of the version.
 -- R154: the Instagram group invite link is part of the version.$n$]);

-- Self-check.
DO $check$
DECLARE bad text;
BEGIN
 SELECT string_agg(o.routine,', ') INTO bad FROM v149_routines o JOIN pg_proc p ON p.oid=o.routine::regprocedure
  WHERE pg_get_userbyid(p.proowner)<>o.owner OR p.prosecdef<>o.definer OR p.provolatile<>o.volatile OR p.proconfig IS DISTINCT FROM o.config
   OR obj_description(p.oid,'pg_proc') IS DISTINCT FROM o.comment
   OR (SELECT array_agg(a.grantee::text||':'||a.privilege_type ORDER BY a.grantee,a.privilege_type) FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee<>p.proowner)
    IS DISTINCT FROM (SELECT array_agg(a.grantee::text||':'||a.privilege_type ORDER BY a.grantee,a.privilege_type) FROM aclexplode(o.effective) a WHERE a.grantee<>p.proowner);
 IF bad IS NOT NULL OR (SELECT count(*) FROM v149_routines)<>2 THEN RAISE EXCEPTION 'V149 changed the owner, privileges, attributes or comment of %',coalesce(bad,'an unexpected routine set'); END IF;
 SELECT string_agg(r,', ') INTO bad FROM unnest(ARRAY['public.pwa_submit_operation_v2(text)','public.pwa_borrower_version_v2(text)']) r
  WHERE position('R154' IN pg_get_functiondef(r::regprocedure))=0 OR position('igGroupInviteLink' IN pg_get_functiondef(r::regprocedure))=0;
 IF bad IS NOT NULL THEN RAISE EXCEPTION 'V149: not patched: %',bad; END IF;
 -- The column: text, nullable, no default, its comment; the check validated.
 IF (SELECT array_agg(format('%s:%s:%s',format_type(a.atttypid,a.atttypmod),a.attnotnull,a.atthasdef)) FROM pg_attribute a
     WHERE a.attrelid='public."Borrowers"'::regclass AND a.attname='IG Group Invite Link' AND NOT a.attisdropped AND col_description(a.attrelid,a.attnum) LIKE 'R154:%')
    IS DISTINCT FROM ARRAY['text:f:f'] THEN RAISE EXCEPTION 'V149: the "IG Group Invite Link" column differs from the design'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public."Borrowers"'::regclass AND contype='c' AND convalidated AND conname='borrowers_ig_group_invite_link_check') THEN
  RAISE EXCEPTION 'V149: borrowers_ig_group_invite_link_check is missing'; END IF;
 -- The rule accepts an invite link and refuses the near misses (invented links only).
 IF NOT ('https://ig.me/j/AbCdEfGh12345678/' ~ '^https://ig\.me/j/[A-Za-z0-9._~%/?=&+-]{1,255}$' AND 'https://ig.me/j/AbCdEfGh12345678' ~ '^https://ig\.me/j/[A-Za-z0-9._~%/?=&+-]{1,255}$')
  OR 'http://ig.me/j/AbCdEfGh12345678/' ~ '^https://ig\.me/j/[A-Za-z0-9._~%/?=&+-]{1,255}$'
  OR 'https://ig.me/m/invented_user/' ~ '^https://ig\.me/j/[A-Za-z0-9._~%/?=&+-]{1,255}$'
  OR 'https://www.instagram.com/direct/t/100000000000001/' ~ '^https://ig\.me/j/[A-Za-z0-9._~%/?=&+-]{1,255}$'
  OR 'https://user@ig.me/j/AbCdEfGh12345678/' ~ '^https://ig\.me/j/[A-Za-z0-9._~%/?=&+-]{1,255}$'
  OR 'https://ig.me/j/Ab Cd/' ~ '^https://ig\.me/j/[A-Za-z0-9._~%/?=&+-]{1,255}$'
  OR 'https://ig.me/j/' ~ '^https://ig\.me/j/[A-Za-z0-9._~%/?=&+-]{1,255}$'
  OR ('https://ig.me/j/'||repeat('a',256)) ~ '^https://ig\.me/j/[A-Za-z0-9._~%/?=&+-]{1,255}$'
 THEN RAISE EXCEPTION 'V149: the invite link rule differs from the design'; END IF;
END $check$;
