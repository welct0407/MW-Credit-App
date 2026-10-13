-- R056 synthetic registration boundary. Disposable loopback database only.
BEGIN;
DO $$ BEGIN
 IF current_database() NOT IN ('loan_manager_dev','payment_rehearsal') OR inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet THEN
  RAISE EXCEPTION 'Disposable loopback database required';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid='public.pwa_notify_subscribe_v1(jsonb,jsonb)'::regprocedure
  AND prosecdef AND pg_get_userbyid(proowner)='mw_notify_owner_dev' AND replace(proconfig[1],' ','')='search_path=pg_catalog,public') THEN
  RAISE EXCEPTION 'Subscription ownership/security drift';
 END IF;
 IF EXISTS(SELECT 1 FROM pg_proc p,LATERAL aclexplode(p.proacl) a WHERE p.oid='public.pwa_notify_subscribe_v1(jsonb,jsonb)'::regprocedure AND a.grantee=0 AND a.privilege_type='EXECUTE') THEN
  RAISE EXCEPTION 'Public subscription execution';
 END IF;
END $$;
CREATE ROLE r056_apple_subscription_test LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
GRANT mw_notify_api_dev TO r056_apple_subscription_test WITH INHERIT TRUE, SET FALSE, ADMIN FALSE;
GRANT USAGE ON SCHEMA public TO r056_apple_subscription_test;
INSERT INTO public."Partners"("Row ID","Partner Role","Login Email","Email")
 VALUES('R056-APPLE-SYNTHETIC','A','r056-apple@example.invalid','r056-apple@example.invalid');
SET SESSION AUTHORIZATION r056_apple_subscription_test;
DO $$
DECLARE
 actor jsonb:=jsonb_build_object('issuer','https://securetoken.google.com/clever-oasis-508610-n7','subject','r056-apple-synthetic','loginEmail','r056-apple@example.invalid','partnerId','R056-APPLE-SYNTHETIC');
 subscription jsonb:=jsonb_build_object('expirationTime',NULL,'keys',jsonb_build_object(
  'p256dh',translate(rtrim(replace(encode(decode('04'||repeat('01',64),'hex'),'base64'),E'\n',''),'='),'+/','-_'),
  'auth',translate(rtrim(encode(decode(repeat('01',16),'hex'),'base64'),'='),'+/','-_')));
 endpoint text; result jsonb; rejected boolean;
BEGIN
 FOREACH endpoint IN ARRAY ARRAY[
  'https://web.push.apple.com/synthetic','https://webpush.push.apple.com/synthetic',
  'https://webpush-123.push.apple.com/synthetic','https://a.b.push.apple.com/synthetic',
  'https://fcm.googleapis.com/synthetic','https://updates.push.services.mozilla.com/synthetic'] LOOP
  result:=public.pwa_notify_subscribe_v1(actor,subscription||jsonb_build_object('endpoint',endpoint));
  IF result->>'subscriptionId' IS NULL THEN RAISE EXCEPTION 'Valid provider rejected'; END IF;
 END LOOP;
 FOREACH endpoint IN ARRAY ARRAY[
  'https://push.apple.com/synthetic','https://evilpush.apple.com/synthetic',
  'https://web.push.apple.com.evil.invalid/synthetic','https://push.apple.com.evil.invalid/synthetic',
  'https://-web.push.apple.com/synthetic','https://web-.push.apple.com/synthetic',
  'https://web..push.apple.com/synthetic','https://web_push.push.apple.com/synthetic',
  'https://web.push.apple.com./synthetic','https://'||repeat('a',64)||'.push.apple.com/synthetic',
  'http://webpush.push.apple.com/synthetic','https://webpush.push.apple.com:8443/synthetic',
  'https://user@webpush.push.apple.com/synthetic','https://webpush.push.apple.com@evil.invalid/synthetic',
  'https://webpush.push.apple.com/synthetic#fragment'] LOOP
  rejected:=false;
  BEGIN
   PERFORM public.pwa_notify_subscribe_v1(actor,subscription||jsonb_build_object('endpoint',endpoint));
  EXCEPTION WHEN OTHERS THEN
   IF SQLERRM<>'invalid_subscription' THEN RAISE; END IF;
   rejected:=true;
  END;
  IF NOT rejected THEN RAISE EXCEPTION 'Invalid provider accepted'; END IF;
 END LOOP;
END $$;
RESET SESSION AUTHORIZATION;
ROLLBACK;
