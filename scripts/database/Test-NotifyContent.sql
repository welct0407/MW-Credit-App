-- V99 (R080): the push content facts RPC under the real roles, at the migration head, in a disposable
-- loopback cluster. One rolled-back transaction with synthetic rows: each event type, Thai/English/unset
-- recipient language, a missing and a deleted source row (found=false), the result shape (no actor column), the V88
-- lease fence, and the
-- capability boundary (only mw_notify_dispatch_dev executes; the API capability and other roles are denied).
\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
 IF current_database() NOT IN ('loan_manager_dev','payment_rehearsal') OR inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet THEN
  RAISE EXCEPTION 'Disposable loopback database required'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid='public.pwa_notify_content_v1(uuid,bigint)'::regprocedure
  AND prosecdef AND pg_get_userbyid(proowner)='mw_notify_owner_dev' AND 'search_path=pg_catalog, public'=ANY(proconfig)) THEN
  RAISE EXCEPTION 'Content RPC ownership/security drift'; END IF;
END $$;
\ir Test-CashAccountFixtures.sql
INSERT INTO "Borrowers"("Row ID","Borrower Name") VALUES('NC-B','สมชาย ใจดี');
INSERT INTO "Partners"("Row ID","Partner Role","Partner Name","Login Email","Email","Language Preference") VALUES
 ('NC-ACTOR','A','นก','nc-actor@example.invalid','nc-actor@example.invalid',NULL),
 ('NC-TH','B','Thai recipient','nc-th@example.invalid','nc-th@example.invalid','ไทย'),
 ('NC-EN','B','English recipient','nc-en@example.invalid','nc-en@example.invalid','English'),
 ('NC-NONE','B','Unset recipient','nc-none@example.invalid','nc-none@example.invalid',NULL);
INSERT INTO "Cash Pool Contributions"("Row ID","Ref Partner","Contribution Date","Transaction Type","Amount") VALUES('NC-CA','NC-ACTOR',current_date-30,'Contribution',50000::money);
INSERT INTO "Loans"("Ref Disbursed From Cash Account","Row ID","Ref Borrowers","Loan Date","Principal Amount","Loan Status","Loan Type","Auto Charge Enabled")
 VALUES('CI-LISA','NC-L','NC-B',current_date-10,20000::money,'ยังไม่ปิดยอด','กำหนดวันชำระ',false),
       ('CI-LISA','NC-L2','NC-B',current_date-10,1000::money,'ยังไม่ปิดยอด','กำหนดวันชำระ',false);
INSERT INTO "Charges"("Row ID","Ref Loans","Charge Date","Principal Due","Interest Due") VALUES('NC-C','NC-L',current_date-2,4900::money,100::money);
INSERT INTO "Payments"("Row ID","Ref Borrower","Status","Amount Received","Payment Date","Allocation Method","Ref Target Charge","Ref Received By Cash Account")
 VALUES('NC-P','NC-B','Processing',5000::money,current_date,'Lump Sum',NULL,'CI-DAD');
CREATE TEMP TABLE nc_case(name text PRIMARY KEY,delivery uuid,generation bigint) ON COMMIT DROP;
GRANT SELECT ON nc_case TO PUBLIC;
DO $$
DECLARE c record; e uuid; s uuid; d uuid; n integer:=0;
BEGIN
 FOR c IN SELECT * FROM (VALUES
   ('payment-th','payment.posted','payment','NC-P','NC-ACTOR','NC-TH','leased'),
   ('payment-en','payment.posted','payment','NC-P','NC-ACTOR','NC-EN','leased'),
   ('created-none','loan.created','loan','NC-L','NC-ACTOR','NC-NONE','leased'),
   ('closed-th','loan.closed','loan','NC-L',NULL,'NC-TH','leased'),
   ('missing-en','payment.posted','payment','NC-GONE','NC-ACTOR','NC-EN','leased'),
   ('deleted-th','loan.created','loan','NC-L2','NC-ACTOR','NC-TH','leased'),
   ('pending-en','loan.created','loan','NC-L','NC-ACTOR','NC-EN','pending')) v(name,kind,source_kind,source_id,actor,recipient,state) LOOP
  n:=n+1;
  INSERT INTO public.pwa_notification_events(dedupe_key,event_type,source_kind,source_id,source_version,actor_partner_id,actor_login_email)
  VALUES('NC-'||c.name,c.kind,c.source_kind,c.source_id,'v1',c.actor,CASE WHEN c.actor IS NULL THEN NULL ELSE 'nc-actor@example.invalid' END) RETURNING event_id INTO e;
  INSERT INTO public.pwa_push_subscriptions(issuer,subject,partner_id,endpoint_hash,endpoint,p256dh,auth)
  VALUES('https://securetoken.google.com/clever-oasis-508610-n7','nc-'||c.name,c.recipient,encode(sha256(convert_to('nc-'||c.name,'UTF8')),'hex'),'https://fcm.googleapis.com/fcm/send/nc-'||c.name,'synthetic','synthetic') RETURNING subscription_id INTO s;
  INSERT INTO public.pwa_notification_deliveries(event_id,channel,destination_key,recipient_partner_id,subscription_id,subscription_version,state,lease_generation,lease_expires_at)
  VALUES(e,'web-push',encode(sha256(convert_to('nc-'||c.name,'UTF8')),'hex'),c.recipient,s,1,c.state,CASE WHEN c.state='leased' THEN 3 ELSE 0 END,CASE WHEN c.state='leased' THEN clock_timestamp()+interval '60 seconds' END) RETURNING delivery_id INTO d;
  INSERT INTO nc_case VALUES(c.name,d,CASE WHEN c.state='leased' THEN 3 ELSE 0 END);
 END LOOP;
 IF n<>7 THEN RAISE EXCEPTION 'fixture rows missing'; END IF;
END $$;
-- The source row of one event is deleted after capture.
DELETE FROM "Loans" WHERE "Row ID"='NC-L2';
CREATE ROLE v99_content_dispatch LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
GRANT mw_notify_dispatch_dev TO v99_content_dispatch WITH INHERIT TRUE, SET FALSE, ADMIN FALSE;
CREATE ROLE v99_content_api LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
GRANT mw_notify_api_dev TO v99_content_api WITH INHERIT TRUE, SET FALSE, ADMIN FALSE;
GRANT USAGE ON SCHEMA public TO v99_content_dispatch,v99_content_api;

-- The result carries no actor (owner decision: two users, the actor adds nothing).
DO $$ BEGIN
 IF (SELECT array_agg(u.n ORDER BY u.o) FROM pg_proc p,unnest(p.proargnames,p.proargmodes) WITH ORDINALITY u(n,m,o) WHERE p.oid='public.pwa_notify_content_v1(uuid,bigint)'::regprocedure AND u.m='t')
  IS DISTINCT FROM ARRAY['found','event_type','language','borrower_name','amount']::text[] THEN RAISE EXCEPTION 'Content RPC result columns differ'; END IF;
END $$;

-- A. Facts per case as the dispatch capability.
SET SESSION AUTHORIZATION v99_content_dispatch;
DO $$
DECLARE c record; got text; expected text;
BEGIN
 FOR c IN SELECT k.name,k.delivery,k.generation,x.expected FROM nc_case k JOIN (VALUES
   ('payment-th','t|payment.posted|th|สมชาย ใจดี|5000'),
   ('payment-en','t|payment.posted|en|สมชาย ใจดี|5000'),
   ('created-none','t|loan.created|en|สมชาย ใจดี|20000'),
   ('closed-th','t|loan.closed|th|สมชาย ใจดี|20000'),
   ('missing-en','f|payment.posted|en|∅|∅'),
   ('deleted-th','f|loan.created|th|∅|∅'),
   ('pending-en','none')) x(name,expected) USING(name) LOOP
  SELECT coalesce(string_agg(concat_ws('|',CASE WHEN r.found THEN 't' ELSE 'f' END,r.event_type,r.language,coalesce(r.borrower_name,'∅'),coalesce(trim_scale(r.amount)::text,'∅')),';'),'none')
   INTO got FROM public.pwa_notify_content_v1(c.delivery,c.generation) r;
  IF got IS DISTINCT FROM c.expected THEN RAISE EXCEPTION 'Content facts for % differ: % (expected %)',c.name,got,c.expected; END IF;
 END LOOP;
 -- Lease fence: a stale generation or an unknown delivery returns no row.
 IF EXISTS(SELECT 1 FROM nc_case k,LATERAL public.pwa_notify_content_v1(k.delivery,k.generation-1) WHERE k.name='payment-th') THEN RAISE EXCEPTION 'Stale lease generation returned content'; END IF;
 IF EXISTS(SELECT 1 FROM public.pwa_notify_content_v1(gen_random_uuid(),3)) THEN RAISE EXCEPTION 'Unknown delivery returned content'; END IF;
 -- The capability itself reads no source table directly.
 BEGIN PERFORM 1 FROM public."Payments" LIMIT 1; RAISE EXCEPTION 'dispatch capability read Payments directly';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET SESSION AUTHORIZATION;

-- B. An expired lease returns no row.
UPDATE public.pwa_notification_deliveries SET lease_expires_at=clock_timestamp()-interval '1 second' WHERE delivery_id=(SELECT delivery FROM nc_case WHERE name='payment-en');
SET SESSION AUTHORIZATION v99_content_dispatch;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM nc_case k,LATERAL public.pwa_notify_content_v1(k.delivery,k.generation) WHERE k.name='payment-en') THEN RAISE EXCEPTION 'Expired lease returned content'; END IF;
END $$;
RESET SESSION AUTHORIZATION;

-- C. Other capabilities are denied: no EXECUTE for the API capability or the application role.
SET SESSION AUTHORIZATION v99_content_api;
DO $$ BEGIN
 BEGIN PERFORM public.pwa_notify_content_v1((SELECT delivery FROM nc_case WHERE name='payment-th'),3); RAISE EXCEPTION 'API capability executed the content RPC';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET SESSION AUTHORIZATION;
DO $$ BEGIN
 IF has_function_privilege('mw_notify_api_dev','public.pwa_notify_content_v1(uuid,bigint)','EXECUTE') OR has_function_privilege('mw_app_dev','public.pwa_notify_content_v1(uuid,bigint)','EXECUTE')
  OR has_function_privilege('mw-credit-app-command-dev@clever-oasis-508610-n7.iam','public.pwa_notify_content_v1(uuid,bigint)','EXECUTE')
  OR NOT has_function_privilege('mw_notify_dispatch_dev','public.pwa_notify_content_v1(uuid,bigint)','EXECUTE') THEN RAISE EXCEPTION 'Content RPC EXECUTE must be the dispatch capability only'; END IF;
END $$;
SELECT 'Notification content regression passed' AS result;
ROLLBACK;
