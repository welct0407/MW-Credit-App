-- R119 (owner-approved plan of 4 November 2026; Archie's design): the push of a payment that closed several referred loans
-- names every rebate. Since V131 (R117) each closed loan gets its own rebate and offset (ro122:<payment>:<loan>), but
-- pwa_notify_content_v3 reads only the first rebate (ORDER BY "Row ID" LIMIT 1).
-- New function only: pwa_notify_content_v4 = the v3 columns unchanged in meaning (the scalar rebate columns stay the first
-- rebate) plus a last column `rebates jsonb`, every rebate of the event as [{amount, payee, payable}] (payee by the v3
-- language rule; payable = amount less the part settled by offset), ordered by the expense "Row ID" COLLATE "C"; an empty
-- array when there is none and NULL on a chat event. It reads the same columns as v3, so no grant changes.
-- V99 boundary, copied from v3: the notify owner's pinned SECURITY DEFINER, the v3 comment, EXECUTE only for the
-- dispatcher (PROD default-privilege grants revoked). v1, v2 and v3 stay unchanged for older dispatchers (V124's
-- self-check text still matches). No table, column, constraint, trigger, grant on a table or data change.
-- Preflight: V132 is applied (v3 exists), v4 is not, the notify roles exist and the runner can hand the function to the
-- notify owner. Self-check: v1 to v3 unchanged (owner, ACL, security, configuration, comment, body); v4 has the v3 owner,
-- security, configuration, comment and EXECUTE grantees, and its columns are v3's plus `rebates`.
-- Rollback: dispatchers before R119 read v3; a later migration may drop v4.

DO $preflight$
DECLARE suffix text:=CASE current_database() WHEN 'loan_manager_prod' THEN 'prod' ELSE 'dev' END; problems text[]:='{}'; notify_owner text; dispatcher text;
BEGIN
 IF current_database() NOT IN ('loan_manager_dev','payment_rehearsal','loan_manager_prod') THEN RAISE EXCEPTION 'Unsupported application database'; END IF;
 notify_owner:='mw_notify_owner_'||suffix; dispatcher:='mw_notify_dispatch_'||suffix;
 IF to_regprocedure('public.pwa_notify_content_v3(uuid,bigint)') IS NULL THEN problems:=problems||'V134 needs V132 (pwa_notify_content_v3)'::text; END IF;
 IF to_regprocedure('public.pwa_notify_content_v4(uuid,bigint)') IS NOT NULL THEN problems:=problems||'V134: pwa_notify_content_v4 already exists'::text; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=notify_owner) OR NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=dispatcher) THEN problems:=problems||'V134 needs the notify owner and dispatcher roles'::text; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=current_user AND rolsuper) THEN
  IF NOT pg_has_role(current_user,notify_owner,'SET') THEN problems:=problems||format('%s cannot SET ROLE %s (temporary maintenance membership required for ALTER FUNCTION OWNER)',current_user,notify_owner); END IF;
  IF NOT has_schema_privilege(notify_owner,'public','CREATE') THEN problems:=problems||format('%s lacks CREATE on schema public (required by ALTER FUNCTION OWNER; grant temporarily)',notify_owner); END IF;
 END IF;
 IF cardinality(problems)>0 THEN RAISE EXCEPTION 'V134 preflight: %',array_to_string(problems,'; '); END IF;
END $preflight$;

-- Snapshot of the three earlier content functions, which this migration must leave exactly as they are.
CREATE TEMP TABLE v134_before ON COMMIT DROP AS
 SELECT p.oid::regprocedure::text AS routine,pg_get_userbyid(p.proowner) AS owner,coalesce(p.proacl::text,'') AS acl,p.prosecdef AS definer,
  p.proconfig AS config,obj_description(p.oid,'pg_proc') AS comment,md5(p.prosrc) AS body
 FROM pg_proc p WHERE p.oid IN ('public.pwa_notify_content_v1(uuid,bigint)'::regprocedure,'public.pwa_notify_content_v2(uuid,bigint)'::regprocedure,'public.pwa_notify_content_v3(uuid,bigint)'::regprocedure);

-- Push content v4: v3 plus `rebates`, every rebate of a closed loan (loan.closed) or of each referred loan the payment
-- closed (payment.posted, V124). The scalar rebate columns keep the v3 reading (the first rebate).
CREATE FUNCTION public.pwa_notify_content_v4(delivery uuid, generation bigint) RETURNS TABLE(found boolean, event_type text, language text, borrower_name text, amount numeric, rebate_amount numeric, rebate_payee text, rebate_payable numeric, payment_method text, rebate_loan text, late_charge_amount numeric, rebates jsonb)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $_$
BEGIN
 PERFORM public.pwa_worker_guard_v1('dispatch');
 RETURN QUERY SELECT src.source_found,
  -- A chat reply carries its outcome ('chat.reply:ok' / 'chat.reply:failed', from source_version 'ok:<message>').
  CASE WHEN e.event_type='chat.reply' THEN 'chat.reply:'||split_part(e.source_version,':',1) ELSE e.event_type END,
  CASE WHEN recipient."Language Preference"='ไทย' THEN 'th' ELSE 'en' END::text,
  -- Chat: the thread title. Thai: the Thai name. English: the English name only ("Description"); none when blank.
  CASE WHEN e.source_kind='chat' THEN src.source_title WHEN recipient."Language Preference"='ไทย' THEN b."Borrower Name" ELSE nullif(btrim(b."Description",E' \t\r\n\f\v'),'') END,
  src.source_amount,
  -- R111: a closed loan's referral rebate, its payee (the v1 name rule) and the part not settled by offset
  rb.rebate_amount,
  -- (an English recipient falls back to the Thai name when the referrer has no English name: the line names a payee).
  CASE WHEN rb.rebate_amount IS NULL THEN NULL WHEN recipient."Language Preference"='ไทย' THEN pb."Borrower Name" ELSE coalesce(nullif(btrim(pb."Description",E' \t\r\n\f\v'),''),pb."Borrower Name") END,
  rb.rebate_payable,
  -- R111: a posted payment's method, and for a Referral Rebate Offset the closed loan whose rebate it is (the push then
  -- reads as a rebate offset, not as cash received from the referrer).
  src.payment_method,
  (SELECT x."Ref Related Loan" FROM public."Business Expenses" x WHERE e.source_kind='payment' AND x."Ref Offset Payment"=e.source_id ORDER BY x."Row ID" COLLATE "C" LIMIT 1),
  -- R118: the late-charge part of the payment.
  CASE WHEN e.source_kind='payment' THEN (SELECT coalesce(sum(y."Late Charge Paid"::numeric),0) FROM public."Repayments" y WHERE y."Ref Payment"=e.source_id) END,
  -- R119: every rebate, in expense "Row ID" order; [] when none; NULL on a chat event.
  CASE WHEN e.source_kind='chat' THEN NULL ELSE (
   SELECT coalesce(jsonb_agg(jsonb_build_object('amount',x."Amount"::numeric,
     'payee',CASE WHEN recipient."Language Preference"='ไทย' THEN xb."Borrower Name" ELSE coalesce(nullif(btrim(xb."Description",E' \t\r\n\f\v'),''),xb."Borrower Name") END,
     'payable',x."Amount"::numeric-coalesce(o."Amount Received"::numeric,0)) ORDER BY x."Row ID" COLLATE "C"),'[]'::jsonb)
   FROM public."Business Expenses" x LEFT JOIN public."Payments" o ON o."Row ID"=x."Ref Offset Payment" LEFT JOIN public."Borrowers" xb ON xb."Row ID"=x."Ref Payee Borrower"
   WHERE x."Source Type"='Referral Rebate' AND ((e.event_type='loan.closed' AND e.source_kind='loan' AND x."Ref Related Loan"=e.source_id)
    OR (e.event_type='payment.posted' AND e.source_kind='payment' AND x."Ref Related Loan" IN (SELECT y."Row ID" FROM public."Loans" y WHERE y."Ref Closing Payment"=e.source_id)))) END
 FROM public.pwa_notification_deliveries d JOIN public.pwa_notification_events e ON e.event_id=d.event_id
 LEFT JOIN public."Partners" recipient ON recipient."Row ID"=d.recipient_partner_id
 LEFT JOIN LATERAL (
  SELECT true AS source_found,p."Ref Borrower" AS borrower_id,p."Amount Received"::numeric AS source_amount,NULL::text AS source_title,p."Payment Method" AS payment_method FROM public."Payments" p WHERE e.source_kind='payment' AND p."Row ID"=e.source_id
  UNION ALL
  SELECT true,l."Ref Borrowers",l."Principal Amount"::numeric,NULL::text,NULL::text FROM public."Loans" l WHERE e.source_kind='loan' AND l."Row ID"=e.source_id
  UNION ALL
  SELECT true,NULL::text,NULL::numeric,t.title,NULL::text FROM public.pwa_chat_threads t WHERE e.source_kind='chat' AND t.id::text=e.source_id AND t.partner_id=d.recipient_partner_id
 ) source_row ON true
 CROSS JOIN LATERAL (SELECT coalesce(source_row.source_found,false) AS source_found,source_row.borrower_id,source_row.source_amount,source_row.source_title,source_row.payment_method) src
 LEFT JOIN public."Borrowers" b ON b."Row ID"=src.borrower_id
 LEFT JOIN LATERAL (
  SELECT x."Amount"::numeric AS rebate_amount,x."Ref Payee Borrower" AS payee_id,x."Amount"::numeric-coalesce(o."Amount Received"::numeric,0) AS rebate_payable
  FROM public."Business Expenses" x LEFT JOIN public."Payments" o ON o."Row ID"=x."Ref Offset Payment"
  WHERE x."Source Type"='Referral Rebate' AND ((e.event_type='loan.closed' AND e.source_kind='loan' AND x."Ref Related Loan"=e.source_id)
   -- R111 V124: the payment that closed a referred loan carries that loan's rebate (its "Payment received" push).
   OR (e.event_type='payment.posted' AND e.source_kind='payment' AND x."Ref Related Loan" IN (SELECT y."Row ID" FROM public."Loans" y WHERE y."Ref Closing Payment"=e.source_id)))
  ORDER BY x."Row ID" COLLATE "C" LIMIT 1
 ) rb ON true
 LEFT JOIN public."Borrowers" pb ON pb."Row ID"=rb.payee_id
 WHERE d.delivery_id=$1 AND d.lease_generation=$2 AND d.state='leased' AND d.lease_expires_at>clock_timestamp();
END $_$;

DO $notify$
DECLARE suffix text:=CASE current_database() WHEN 'loan_manager_prod' THEN 'prod' ELSE 'dev' END; notify_owner text; dispatcher text; grantee text;
BEGIN
 notify_owner:='mw_notify_owner_'||suffix; dispatcher:='mw_notify_dispatch_'||suffix;
 REVOKE ALL ON FUNCTION public.pwa_notify_content_v4(uuid,bigint) FROM PUBLIC;
 -- PROD's default privileges give mw_integration_agent EXECUTE on a function postgres creates (V103/V122): revoke them.
 FOR grantee IN SELECT DISTINCT pg_get_userbyid(a.grantee) FROM pg_proc p CROSS JOIN LATERAL aclexplode(p.proacl) a
   WHERE p.oid='public.pwa_notify_content_v4(uuid,bigint)'::regprocedure AND a.grantee<>0 AND a.grantee<>p.proowner LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION public.pwa_notify_content_v4(uuid,bigint) FROM %I',grantee);
 END LOOP;
 COMMENT ON FUNCTION public.pwa_notify_content_v4(uuid,bigint) IS 'mw-access:governance fixed notification boundary; explicit capability only';
 EXECUTE format('GRANT EXECUTE ON FUNCTION public.pwa_notify_content_v4(uuid,bigint) TO %I',dispatcher);
 EXECUTE format('ALTER FUNCTION public.pwa_notify_content_v4(uuid,bigint) OWNER TO %I',notify_owner);
END $notify$;

-- Self-check: v1 to v3 untouched; v4 is v3's boundary (owner, definer, pinned search path, comment, EXECUTE grantees)
-- and its result is v3's columns plus `rebates`.
DO $check$
DECLARE bad text; v3 oid:='public.pwa_notify_content_v3(uuid,bigint)'::regprocedure; v4 oid:='public.pwa_notify_content_v4(uuid,bigint)'::regprocedure;
BEGIN
 SELECT string_agg(o.routine,', ') INTO bad FROM v134_before o JOIN pg_proc p ON p.oid=o.routine::regprocedure
  WHERE pg_get_userbyid(p.proowner)<>o.owner OR coalesce(p.proacl::text,'')<>o.acl OR p.prosecdef<>o.definer OR p.proconfig IS DISTINCT FROM o.config
   OR obj_description(p.oid,'pg_proc') IS DISTINCT FROM o.comment OR md5(p.prosrc)<>o.body;
 IF bad IS NOT NULL OR (SELECT count(*) FROM v134_before)<>3 THEN RAISE EXCEPTION 'V134 changed %',coalesce(bad,'an unexpected set of content functions'); END IF;
 IF (SELECT p4.proowner<>p3.proowner OR NOT p4.prosecdef OR p4.prosecdef<>p3.prosecdef OR p4.proconfig IS DISTINCT FROM p3.proconfig OR p4.provolatile<>p3.provolatile
     OR obj_description(p4.oid,'pg_proc') IS DISTINCT FROM obj_description(p3.oid,'pg_proc') FROM pg_proc p3,pg_proc p4 WHERE p3.oid=v3 AND p4.oid=v4)
  OR EXISTS((SELECT a.grantee,a.privilege_type FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid=v3)
   EXCEPT ALL (SELECT a.grantee,a.privilege_type FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid=v4))
  OR EXISTS((SELECT a.grantee,a.privilege_type FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid=v4)
   EXCEPT ALL (SELECT a.grantee,a.privilege_type FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid=v3))
 THEN RAISE EXCEPTION 'V134: pwa_notify_content_v4 must keep the v3 owner, definer, configuration, comment and EXECUTE grantees'; END IF;
 IF (SELECT array_agg(u.n||':'||format_type(u.t,NULL) ORDER BY u.o) FROM pg_proc p,unnest(p.proargnames,p.proargmodes,p.proallargtypes) WITH ORDINALITY u(n,m,t,o) WHERE p.oid=v4 AND u.m='t')
   IS DISTINCT FROM (SELECT array_agg(u.n||':'||format_type(u.t,NULL) ORDER BY u.o) FROM pg_proc p,unnest(p.proargnames,p.proargmodes,p.proallargtypes) WITH ORDINALITY u(n,m,t,o) WHERE p.oid=v3 AND u.m='t')||ARRAY['rebates:jsonb']::text[]
 THEN RAISE EXCEPTION 'V134: pwa_notify_content_v4 columns must be the v3 columns plus rebates'; END IF;
END $check$;
