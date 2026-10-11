-- R053: reuse V86 state through fixed, separately owned RPCs. No runtime activation.
-- Operator must provision the five closed environment roles before this migration.
DO $preflight$
DECLARE suffix text; role_name text;
BEGIN
 IF current_database() NOT IN ('loan_manager_dev','payment_rehearsal','loan_manager_prod') THEN RAISE EXCEPTION 'Unsupported worker database'; END IF;
 suffix:=CASE current_database() WHEN 'loan_manager_prod' THEN 'prod' ELSE 'dev' END;
 FOREACH role_name IN ARRAY ARRAY['mw_notify_owner_'||suffix,'mw_notify_api_'||suffix,'mw_notify_dispatch_'||suffix,'mw_jobs_owner_'||suffix,'mw_jobs_'||suffix] LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=role_name AND NOT rolcanlogin AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication AND NOT rolbypassrls) THEN RAISE EXCEPTION 'Missing or unsafe worker role'; END IF;
  IF EXISTS(SELECT 1 FROM pg_auth_members WHERE member=role_name::regrole) THEN RAISE EXCEPTION 'Worker capability inherits another role'; END IF;
 END LOOP;
END $preflight$;

-- Private helper: definer RPCs retain session_user as the actual caller identity.
CREATE FUNCTION public.pwa_worker_guard_v1(capability text) RETURNS void
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE suffix text; expected_owner text; expected_capability text;
BEGIN
 IF current_database() NOT IN ('loan_manager_dev','payment_rehearsal','loan_manager_prod') OR capability NOT IN ('api','dispatch','jobs') OR capability IS NULL THEN RAISE EXCEPTION 'access_denied'; END IF;
 suffix:=CASE current_database() WHEN 'loan_manager_prod' THEN 'prod' ELSE 'dev' END;
 expected_owner:=CASE capability WHEN 'jobs' THEN 'mw_jobs_owner_' ELSE 'mw_notify_owner_' END||suffix;
 expected_capability:=CASE capability WHEN 'jobs' THEN 'mw_jobs_' ELSE 'mw_notify_'||capability||'_' END||suffix;
 IF current_user<>expected_owner OR NOT pg_has_role(session_user,expected_capability,'USAGE') OR pg_has_role(session_user,expected_owner,'MEMBER') THEN RAISE EXCEPTION 'access_denied'; END IF;
END $$;

CREATE FUNCTION public.pwa_notify_actor_v1(actor jsonb) RETURNS text
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE partner text; matches bigint;
BEGIN
 PERFORM public.pwa_worker_guard_v1('api');
 IF actor IS NULL OR jsonb_typeof(actor)<>'object' OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(actor) key) IS DISTINCT FROM ARRAY['issuer','loginEmail','partnerId','subject']::text[]
 OR actor->>'issuer'<>'https://securetoken.google.com/clever-oasis-508610-n7'
 OR coalesce(length(actor->>'subject'),0) NOT BETWEEN 1 AND 128 OR coalesce(length(actor->>'partnerId'),0) NOT BETWEEN 1 AND 256
 OR coalesce(length(actor->>'loginEmail'),0) NOT BETWEEN 1 AND 320 OR actor->>'loginEmail'<>lower(btrim(actor->>'loginEmail'))
 OR EXISTS(SELECT 1 FROM jsonb_each(actor) e WHERE jsonb_typeof(e.value)<>'string') THEN RAISE EXCEPTION 'access_denied'; END IF;
 SELECT count(*),min("Row ID") INTO matches,partner FROM public."Partners" WHERE lower(btrim("Login Email"))=actor->>'loginEmail';
 IF matches<>1 OR partner IS DISTINCT FROM actor->>'partnerId' THEN RAISE EXCEPTION 'access_denied'; END IF;
 RETURN partner;
END $$;

CREATE FUNCTION public.pwa_notify_subscribe_v1(actor jsonb,subscription jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE partner text; endpoint text; endpoint_digest text; expires timestamptz; subscription_id uuid; key_bytes bytea; auth_bytes bytea;
BEGIN
 partner:=public.pwa_notify_actor_v1(actor);endpoint:=subscription->>'endpoint';
 IF jsonb_typeof(subscription) IS DISTINCT FROM 'object' OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(subscription) key) IS DISTINCT FROM ARRAY['endpoint','expirationTime','keys']::text[]
 OR jsonb_typeof(subscription->'keys') IS DISTINCT FROM 'object' OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(subscription->'keys') key) IS DISTINCT FROM ARRAY['auth','p256dh']::text[]
 OR jsonb_typeof(subscription->'endpoint') IS DISTINCT FROM 'string' OR coalesce(length(endpoint),0) NOT BETWEEN 1 AND 4096
 OR endpoint !~ '^https://(fcm\.googleapis\.com|web\.push\.apple\.com|updates\.push\.services\.mozilla\.com)/[^[:space:]#]*$'
 OR coalesce(subscription#>>'{keys,p256dh}','') !~ '^[A-Za-z0-9_-]{87}$' OR coalesce(subscription#>>'{keys,auth}','') !~ '^[A-Za-z0-9_-]{22}$' THEN RAISE EXCEPTION 'invalid_subscription'; END IF;
 BEGIN
  key_bytes:=decode(translate(subscription#>>'{keys,p256dh}','-_','+/')||'=','base64');auth_bytes:=decode(translate(subscription#>>'{keys,auth}','-_','+/')||'==','base64');
  IF octet_length(key_bytes)<>65 OR get_byte(key_bytes,0)<>4 OR octet_length(auth_bytes)<>16 THEN RAISE EXCEPTION 'invalid_subscription'; END IF;
  IF subscription->'expirationTime'<>'null'::jsonb THEN
   IF jsonb_typeof(subscription->'expirationTime')<>'number' OR subscription->>'expirationTime' !~ '^[0-9]{1,16}$' THEN RAISE EXCEPTION 'invalid_subscription'; END IF;
   expires:=to_timestamp((subscription->>'expirationTime')::numeric/1000);IF expires<=clock_timestamp() THEN RAISE EXCEPTION 'invalid_subscription'; END IF;
  END IF;
 EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'invalid_subscription'; END;
 endpoint_digest:=encode(sha256(convert_to(endpoint,'UTF8')),'hex');
 INSERT INTO public.pwa_push_subscriptions AS s(issuer,subject,partner_id,endpoint_hash,endpoint,p256dh,auth,expires_at)
 VALUES(actor->>'issuer',actor->>'subject',partner,endpoint_digest,endpoint,subscription#>>'{keys,p256dh}',subscription#>>'{keys,auth}',expires)
 ON CONFLICT(endpoint_hash) DO UPDATE SET p256dh=excluded.p256dh,auth=excluded.auth,expires_at=excluded.expires_at,enabled=true,version=s.version+1,last_seen_at=clock_timestamp()
 WHERE s.issuer=excluded.issuer AND s.subject=excluded.subject AND s.partner_id=excluded.partner_id RETURNING s.subscription_id INTO subscription_id;
 IF subscription_id IS NULL THEN RAISE EXCEPTION 'access_denied'; END IF;
 RETURN jsonb_build_object('subscriptionId',subscription_id);
END $$;

CREATE FUNCTION public.pwa_notify_revoke_v1(actor jsonb,id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE partner text:=public.pwa_notify_actor_v1(actor);
BEGIN
 UPDATE public.pwa_push_subscriptions SET enabled=false,version=version+1 WHERE subscription_id=id AND issuer=actor->>'issuer' AND subject=actor->>'subject' AND partner_id=partner;
END $$;

CREATE FUNCTION public.pwa_notify_preference_v1(actor jsonb,preference boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE partner text:=public.pwa_notify_actor_v1(actor);
BEGIN
 IF preference IS NULL THEN RAISE EXCEPTION 'invalid_request'; END IF;
 INSERT INTO public.pwa_notification_preferences AS p(partner_id,channel,enabled) VALUES(partner,'web-push',preference)
 ON CONFLICT(partner_id,channel) DO UPDATE SET enabled=excluded.enabled,version=p.version+1,updated_at=clock_timestamp();
END $$;

CREATE FUNCTION public.pwa_notify_status_v1(actor jsonb,endpoint_digest text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE partner text:=public.pwa_notify_actor_v1(actor);
BEGIN
 IF endpoint_digest IS NOT NULL AND endpoint_digest !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'invalid_request'; END IF;
 RETURN jsonb_build_object('enabled',coalesce((SELECT enabled FROM public.pwa_notification_preferences WHERE partner_id=partner AND channel='web-push'),true),
 'deviceRegistered',EXISTS(SELECT 1 FROM public.pwa_push_subscriptions WHERE partner_id=partner AND issuer=actor->>'issuer' AND subject=actor->>'subject' AND endpoint_hash=endpoint_digest AND enabled AND (expires_at IS NULL OR expires_at>clock_timestamp())),
 'subscriptionId',(SELECT subscription_id FROM public.pwa_push_subscriptions WHERE partner_id=partner AND issuer=actor->>'issuer' AND subject=actor->>'subject' AND endpoint_hash=endpoint_digest AND enabled AND (expires_at IS NULL OR expires_at>clock_timestamp())));
END $$;

CREATE FUNCTION public.pwa_notify_history_v1(actor jsonb,before_at timestamptz,before_id uuid)
RETURNS TABLE("eventId" uuid,type text,"occurredAt" text,state text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE partner text:=public.pwa_notify_actor_v1(actor);
BEGIN
 IF (before_at IS NULL)<>(before_id IS NULL) OR (before_at IS NOT NULL AND NOT isfinite(before_at)) THEN RAISE EXCEPTION 'invalid_request'; END IF;
 RETURN QUERY SELECT e.event_id,e.event_type,to_char(e.occurred_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
 CASE WHEN bool_or(d.state='sent') THEN 'sent' WHEN bool_or(d.state='uncertain') THEN 'uncertain' ELSE min(d.state) END
 FROM public.pwa_notification_deliveries d JOIN public.pwa_notification_events e USING(event_id)
 WHERE d.recipient_partner_id=partner AND (before_at IS NULL OR (e.occurred_at,e.event_id)<(before_at,before_id))
 GROUP BY e.event_id ORDER BY e.occurred_at DESC,e.event_id DESC LIMIT 26;
END $$;

CREATE FUNCTION public.pwa_notify_target_v1(actor jsonb,event uuid) RETURNS TABLE(kind text,id text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE partner text:=public.pwa_notify_actor_v1(actor);
BEGIN
 RETURN QUERY SELECT e.source_kind,e.source_id FROM public.pwa_notification_events e WHERE e.event_id=$2 AND EXISTS(SELECT 1 FROM public.pwa_notification_deliveries d WHERE d.event_id=e.event_id AND d.recipient_partner_id=partner);
END $$;

-- Private eligibility predicate shared by enqueue and every send boundary.
CREATE FUNCTION public.pwa_notify_eligible_v1(event uuid,subscription uuid) RETURNS boolean
LANGUAGE sql STABLE SET search_path=pg_catalog,public AS $$
 SELECT EXISTS(
  SELECT 1 FROM public.pwa_notification_events e JOIN public.pwa_push_subscriptions s ON s.subscription_id=subscription
  WHERE e.event_id=event AND e.actor_partner_id IS NOT NULL AND s.partner_id<>e.actor_partner_id
  AND s.enabled AND (s.expires_at IS NULL OR s.expires_at>statement_timestamp()) AND s.created_at<=e.occurred_at
  AND (SELECT count(*) FROM public."Partners" p WHERE lower(btrim(p."Login Email"))=e.actor_login_email)=1
  AND EXISTS(SELECT 1 FROM public."Partners" p WHERE p."Row ID"=e.actor_partner_id AND lower(btrim(p."Login Email"))=e.actor_login_email)
  AND EXISTS(SELECT 1 FROM public."Partners" p WHERE p."Row ID"=s.partner_id AND nullif(btrim(p."Login Email"),'') IS NOT NULL AND nullif(btrim(p."Email"),'') IS NOT NULL
   AND (SELECT count(*) FROM public."Partners" other WHERE lower(btrim(other."Login Email"))=lower(btrim(p."Login Email")))=1)
  AND NOT EXISTS(SELECT 1 FROM public.pwa_notification_preferences p WHERE p.partner_id=s.partner_id AND p.channel='web-push' AND (NOT p.enabled OR p.updated_at>e.occurred_at))
 );
$$;

CREATE FUNCTION public.pwa_notify_candidates_v1(batch_limit integer)
RETURNS TABLE(event_id uuid,subscription_id uuid,version bigint,issuer text,subject text,partner_id text,endpoint_hash text,login_email text,partner_role text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 PERFORM public.pwa_worker_guard_v1('dispatch');
 IF batch_limit IS NULL OR batch_limit NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'invalid_request'; END IF;
 RETURN QUERY SELECT e.event_id,s.subscription_id,s.version,s.issuer,s.subject,s.partner_id,s.endpoint_hash,lower(btrim(p."Login Email")),p."Partner Role"
 FROM public.pwa_notification_events e JOIN public.pwa_push_subscriptions s ON s.created_at<=e.occurred_at JOIN public."Partners" p ON p."Row ID"=s.partner_id
 WHERE public.pwa_notify_eligible_v1(e.event_id,s.subscription_id)
 AND NOT EXISTS(SELECT 1 FROM public.pwa_notification_deliveries d WHERE d.event_id=e.event_id AND d.channel='web-push' AND d.destination_key=s.endpoint_hash)
 ORDER BY e.occurred_at,e.event_id,s.subscription_id LIMIT batch_limit;
END $$;

CREATE FUNCTION public.pwa_notify_enqueue_v1(event uuid,subscription uuid,subscription_version bigint,eligible boolean) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE inserted bigint;
BEGIN
 PERFORM public.pwa_worker_guard_v1('dispatch');
 IF eligible IS NULL THEN RAISE EXCEPTION 'invalid_request'; END IF;
 -- Subscription lock serializes revocation/rotation with this boundary.
 PERFORM 1 FROM public.pwa_push_subscriptions s WHERE s.subscription_id=subscription FOR UPDATE;
 INSERT INTO public.pwa_notification_deliveries(event_id,channel,destination_key,recipient_partner_id,subscription_id,subscription_version,state,provider_result,completed_at)
 SELECT event,'web-push',s.endpoint_hash,s.partner_id,s.subscription_id,s.version,CASE WHEN eligible THEN 'pending' ELSE 'cancelled' END,CASE WHEN eligible THEN NULL ELSE 'ineligible' END,CASE WHEN eligible THEN NULL ELSE clock_timestamp() END
 FROM public.pwa_push_subscriptions s WHERE s.subscription_id=subscription AND s.version=subscription_version AND public.pwa_notify_eligible_v1(event,subscription)
 ON CONFLICT DO NOTHING;
 GET DIAGNOSTICS inserted=ROW_COUNT;RETURN inserted=1;
END $$;

CREATE OR REPLACE FUNCTION public.pwa_claim_notifications_v1(p_limit integer,p_seconds integer)
RETURNS SETOF public.pwa_notification_deliveries LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 PERFORM public.pwa_worker_guard_v1('dispatch');
 IF p_limit IS NULL OR p_seconds IS NULL OR p_limit NOT BETWEEN 1 AND 50 OR p_seconds NOT BETWEEN 5 AND 120 THEN RAISE EXCEPTION 'Invalid claim bounds'; END IF;
 UPDATE public.pwa_notification_deliveries SET state=CASE WHEN send_started_at IS NULL AND attempts<8 THEN 'retry' ELSE 'uncertain' END,lease_expires_at=NULL,provider_result='lease_expired'
 WHERE state='leased' AND lease_expires_at<=clock_timestamp();
 RETURN QUERY WITH due AS (
 SELECT delivery_id FROM public.pwa_notification_deliveries WHERE state IN ('pending','retry') AND attempts<8 AND next_attempt_at<=clock_timestamp()
 ORDER BY next_attempt_at,delivery_id FOR UPDATE SKIP LOCKED LIMIT p_limit)
 UPDATE public.pwa_notification_deliveries d SET state='leased',lease_generation=d.lease_generation+1,
 lease_expires_at=clock_timestamp()+make_interval(secs=>p_seconds),send_started_at=NULL,attempts=d.attempts+1
 FROM due WHERE d.delivery_id=due.delivery_id RETURNING d.*;
END $$;

CREATE FUNCTION public.pwa_notify_prepare_send_v1(delivery uuid,generation bigint)
RETURNS TABLE(subscription_id uuid,version bigint,issuer text,subject text,partner_id text,endpoint_hash text,endpoint text,p256dh text,auth text,expires_at timestamptz,login_email text,partner_role text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 PERFORM public.pwa_worker_guard_v1('dispatch');
 RETURN QUERY SELECT s.subscription_id,s.version,s.issuer,s.subject,s.partner_id,s.endpoint_hash,s.endpoint,s.p256dh,s.auth,s.expires_at,lower(btrim(p."Login Email")),p."Partner Role"
 FROM public.pwa_notification_deliveries d JOIN public.pwa_push_subscriptions s USING(subscription_id) JOIN public."Partners" p ON p."Row ID"=s.partner_id
 WHERE d.delivery_id=delivery AND d.lease_generation=generation AND d.state='leased' AND d.lease_expires_at>clock_timestamp() AND d.send_started_at IS NULL
 AND s.version=d.subscription_version AND public.pwa_notify_eligible_v1(d.event_id,s.subscription_id);
END $$;

CREATE FUNCTION public.pwa_notify_start_send_v1(delivery uuid,generation bigint,subscription_version bigint) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE changed bigint;
BEGIN
 PERFORM public.pwa_worker_guard_v1('dispatch');
 PERFORM 1 FROM public.pwa_push_subscriptions s JOIN public.pwa_notification_deliveries d USING(subscription_id) WHERE d.delivery_id=delivery FOR UPDATE OF s;
 UPDATE public.pwa_notification_deliveries d SET send_started_at=clock_timestamp()
 WHERE d.delivery_id=delivery AND d.lease_generation=generation AND d.state='leased' AND d.lease_expires_at>clock_timestamp() AND d.send_started_at IS NULL
 AND d.subscription_version=$3 AND EXISTS(SELECT 1 FROM public.pwa_push_subscriptions s WHERE s.subscription_id=d.subscription_id AND s.version=$3)
 AND public.pwa_notify_eligible_v1(d.event_id,d.subscription_id);
 GET DIAGNOSTICS changed=ROW_COUNT;RETURN changed=1;
END $$;

CREATE FUNCTION public.pwa_notify_complete_v1(delivery uuid,generation bigint,result_class text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE d public.pwa_notification_deliveries; outcome text;
BEGIN
 PERFORM public.pwa_worker_guard_v1('dispatch');
 IF result_class IS NULL OR result_class NOT IN ('accepted','expired','throttled','unavailable','network','rejected','ineligible','deferred') THEN RAISE EXCEPTION 'invalid_provider_result'; END IF;
 SELECT * INTO d FROM public.pwa_notification_deliveries WHERE delivery_id=delivery AND lease_generation=generation AND state='leased' AND lease_expires_at>clock_timestamp() FOR UPDATE;
 IF NOT FOUND THEN RETURN 'fenced'; END IF;
 IF (result_class IN ('ineligible','deferred') AND d.send_started_at IS NOT NULL) OR (result_class NOT IN ('ineligible','deferred') AND d.send_started_at IS NULL) THEN RAISE EXCEPTION 'invalid_provider_result'; END IF;
 outcome:=CASE WHEN result_class='accepted' THEN 'sent' WHEN result_class='ineligible' THEN 'cancelled' WHEN result_class='network' THEN 'uncertain' WHEN result_class IN ('expired','rejected') OR d.attempts>=8 THEN 'dead' ELSE 'retry' END;
 UPDATE public.pwa_notification_deliveries SET state=outcome,lease_expires_at=NULL,provider_result=CASE result_class WHEN 'deferred' THEN 'unavailable' ELSE result_class END,
 next_attempt_at=clock_timestamp()+make_interval(secs=>least(3600,30*power(2,d.attempts)::integer)),completed_at=CASE WHEN outcome IN ('sent','cancelled','dead') THEN clock_timestamp() ELSE NULL END WHERE delivery_id=delivery;
 IF result_class='expired' THEN UPDATE public.pwa_push_subscriptions SET enabled=false,version=version+1 WHERE subscription_id=d.subscription_id AND version=d.subscription_version; END IF;
 RETURN outcome;
END $$;

CREATE FUNCTION public.pwa_job_run_v1(job text,business_date date,scope text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE boundary timestamp:=clock_timestamp() AT TIME ZONE 'Asia/Bangkok'; r public.pwa_job_runs; affected bigint;
BEGIN
 PERFORM public.pwa_worker_guard_v1('jobs');
 IF job IS NULL OR job NOT IN ('daily-charges','recent-analytics') OR business_date IS NULL OR NOT isfinite(business_date) OR scope IS NULL
 OR (job='daily-charges' AND scope<>'daily') OR (job='recent-analytics' AND scope !~ '^hour:(0[0-9]|1[0-9]|2[0-3])$') THEN RAISE EXCEPTION 'invalid_job'; END IF;
 IF business_date<>boundary::date OR (job='recent-analytics' AND scope<>'hour:'||to_char(boundary,'HH24')) THEN RAISE EXCEPTION 'job_boundary_changed'; END IF;
 INSERT INTO public.pwa_job_runs(job_name,business_date,scope_key,state) VALUES(job,$2,scope,'pending') ON CONFLICT DO NOTHING;
 SELECT * INTO STRICT r FROM public.pwa_job_runs j WHERE j.job_name=job AND j.business_date=$2 AND j.scope_key=scope FOR UPDATE;
 IF r.state='completed' THEN RETURN jsonb_build_object('enabled',true,'state','completed','replayed',true,'resultCount',r.result_count); END IF;
 IF r.state NOT IN ('pending','failed') THEN RAISE EXCEPTION 'job_requires_reconciliation'; END IF;
 UPDATE public.pwa_job_runs SET state='leased',lease_generation=lease_generation+1,lease_expires_at=clock_timestamp()+interval '120 seconds',started_at=clock_timestamp() WHERE run_id=r.run_id;
 IF job='daily-charges' THEN affected:=public.generate_due_charges($2); ELSE affected:=public.refresh_daily_analytics($2-1,$2); END IF;
 UPDATE public.pwa_job_runs SET state='completed',lease_expires_at=NULL,completed_at=clock_timestamp(),checkpoint=$2::text||'|'||scope,result_count=affected WHERE run_id=r.run_id;
 RETURN jsonb_build_object('enabled',true,'state','completed','replayed',false,'resultCount',affected);
END $$;

-- Activation is metadata on this exact function, never a caller/session setting.
-- The standard setting works for the managed nonsuperuser owner. Missing or
-- unknown metadata is closed; application_name is restored on function exit.
CREATE OR REPLACE FUNCTION public.pwa_capture_notification_v1() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET application_name='mw_pwa_capture_disabled_v1' AS $$
DECLARE kind text; actor_email text; actor_id text; matches bigint; version text;
BEGIN
 IF NOT EXISTS (
  SELECT 1 FROM pg_catalog.pg_proc
  WHERE oid='public.pwa_capture_notification_v1()'::pg_catalog.regprocedure
  AND 'application_name=mw_pwa_capture_enabled_v1'=ANY(proconfig)
 ) THEN RETURN NEW; END IF;
 IF TG_TABLE_NAME='Payments' THEN
  IF NEW."Status" IS DISTINCT FROM 'Posted' OR (TG_OP='UPDATE' AND OLD."Status"='Posted') THEN RETURN NEW; END IF;
  kind:='payment.posted';actor_email:=nullif(lower(btrim(NEW."Created By")),'');version:='posted';
 ELSE
  IF TG_OP='INSERT' THEN kind:='loan.created';actor_email:=nullif(lower(btrim(NEW."Created By")),'');version:='created';
  ELSIF NEW."Loan Status"='ปิดยอดแล้ว' AND OLD."Loan Status" IS DISTINCT FROM 'ปิดยอดแล้ว' AND NEW."Ref Closing Payment" IS NULL THEN
   kind:='loan.closed';actor_email:=nullif(lower(btrim(NEW."Closed By")),'');
   -- The source UPDATE already holds the loan row lock, serializing close occurrences.
   SELECT 'closed:'||(count(*)+1)::text INTO version FROM public.pwa_notification_events WHERE source_kind='loan' AND source_id=NEW."Row ID" AND event_type='loan.closed';
  ELSE RETURN NEW; END IF;
 END IF;
 SELECT count(*),min("Row ID") INTO matches,actor_id FROM public."Partners" WHERE lower(btrim("Login Email"))=actor_email;
 IF matches<>1 THEN actor_id:=NULL; END IF;
 INSERT INTO public.pwa_notification_events(dedupe_key,event_type,source_kind,source_id,source_version,actor_partner_id,actor_login_email)
 VALUES(kind||':'||NEW."Row ID"||':'||version,kind,CASE WHEN TG_TABLE_NAME='Payments' THEN 'payment' ELSE 'loan' END,NEW."Row ID",version,actor_id,actor_email)
 ON CONFLICT(dedupe_key) DO NOTHING;
 IF FOUND THEN PERFORM pg_catalog.pg_notify('mw_pwa_notifications_v1',''); END IF;
 RETURN NEW;
END $$;

DO $ownership$
DECLARE suffix text:=CASE current_database() WHEN 'loan_manager_prod' THEN 'prod' ELSE 'dev' END;
 notify_owner text:='mw_notify_owner_'||suffix; jobs_owner text:='mw_jobs_owner_'||suffix;
 api text:='mw_notify_api_'||suffix; dispatcher text:='mw_notify_dispatch_'||suffix; jobs text:='mw_jobs_'||suffix;
 signature text; relation_name text;
 api_functions text[]:=ARRAY['public.pwa_notify_subscribe_v1(jsonb,jsonb)','public.pwa_notify_revoke_v1(jsonb,uuid)','public.pwa_notify_preference_v1(jsonb,boolean)','public.pwa_notify_status_v1(jsonb,text)','public.pwa_notify_history_v1(jsonb,timestamptz,uuid)','public.pwa_notify_target_v1(jsonb,uuid)'];
 dispatch_functions text[]:=ARRAY['public.pwa_notify_candidates_v1(integer)','public.pwa_notify_enqueue_v1(uuid,uuid,bigint,boolean)','public.pwa_claim_notifications_v1(integer,integer)','public.pwa_notify_prepare_send_v1(uuid,bigint)','public.pwa_notify_start_send_v1(uuid,bigint,bigint)','public.pwa_notify_complete_v1(uuid,bigint,text)'];
 private_functions text[]:=ARRAY['public.pwa_worker_guard_v1(text)','public.pwa_notify_actor_v1(jsonb)','public.pwa_notify_eligible_v1(uuid,uuid)','public.pwa_capture_notification_v1()'];
BEGIN
 EXECUTE format('GRANT USAGE ON SCHEMA public TO %I,%I,%I,%I,%I',notify_owner,jobs_owner,api,dispatcher,jobs);
 EXECUTE format('GRANT SELECT ("Row ID","Login Email","Partner Role","Email") ON public."Partners" TO %I',notify_owner);
 FOREACH relation_name IN ARRAY ARRAY['pwa_notification_events','pwa_notification_deliveries','pwa_push_subscriptions','pwa_notification_preferences'] LOOP
  EXECUTE format('ALTER TABLE public.%I OWNER TO %I',relation_name,notify_owner);
 END LOOP;
 EXECUTE format('ALTER TABLE public.pwa_job_runs OWNER TO %I',jobs_owner);
 FOREACH signature IN ARRAY api_functions||dispatch_functions||private_functions LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC',signature::regprocedure);
  EXECUTE format('COMMENT ON FUNCTION %s IS %L',signature::regprocedure,'mw-access:governance fixed notification boundary; explicit capability only');
  EXECUTE format('ALTER FUNCTION %s OWNER TO %I',signature::regprocedure,notify_owner);
 END LOOP;
 FOREACH signature IN ARRAY api_functions LOOP EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO %I',signature::regprocedure,api); END LOOP;
 FOREACH signature IN ARRAY dispatch_functions LOOP EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO %I',signature::regprocedure,dispatcher); END LOOP;
 REVOKE ALL ON FUNCTION public.pwa_job_run_v1(text,date,text) FROM PUBLIC;
 COMMENT ON FUNCTION public.pwa_job_run_v1(text,date,text) IS 'mw-access:governance fixed atomic scheduled jobs; explicit capability only';
 EXECUTE format('ALTER FUNCTION public.pwa_job_run_v1(text,date,text) OWNER TO %I',jobs_owner);
 EXECUTE format('GRANT EXECUTE ON FUNCTION public.pwa_job_run_v1(text,date,text) TO %I',jobs);
 EXECUTE format('GRANT EXECUTE ON FUNCTION public.pwa_worker_guard_v1(text) TO %I',jobs_owner);
 -- Canonical job invoker dependencies are provisioned using the separately reviewed
 -- exact manifest. No blanket financial capability or application-role membership.
END $ownership$;
