-- R052 Phase 8: additive, dormant notification/job persistence. No historical backfill.
-- No runtime grants or scheduler/provider activation. Typed comments exclude these
-- objects from the ordinary DEV application-role reconciler.
CREATE TABLE public.pwa_notification_events (
 event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 dedupe_key text NOT NULL UNIQUE CHECK(length(dedupe_key) BETWEEN 1 AND 512),
 event_type text NOT NULL CHECK(event_type IN ('loan.created','loan.closed','payment.posted')),
 source_kind text NOT NULL CHECK(source_kind IN ('loan','payment')),
 source_id text NOT NULL CHECK(length(source_id) BETWEEN 1 AND 256),
 source_version text NOT NULL CHECK(length(source_version) BETWEEN 1 AND 256),
 actor_partner_id text, actor_login_email text,
 occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK(actor_partner_id IS NULL OR length(actor_partner_id) BETWEEN 1 AND 256),
 CHECK(actor_login_email IS NULL OR length(actor_login_email) BETWEEN 1 AND 320)
);
CREATE TABLE public.pwa_push_subscriptions (
 subscription_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 issuer text NOT NULL CHECK(issuer='https://securetoken.google.com/clever-oasis-508610-n7'),
 subject text NOT NULL CHECK(length(subject) BETWEEN 1 AND 128),
 partner_id text NOT NULL CHECK(length(partner_id) BETWEEN 1 AND 256),
 endpoint_hash text NOT NULL UNIQUE CHECK(endpoint_hash ~ '^[a-f0-9]{64}$'),
 endpoint text NOT NULL CHECK(length(endpoint) BETWEEN 1 AND 4096),
 p256dh text NOT NULL CHECK(length(p256dh) BETWEEN 1 AND 256),
 auth text NOT NULL CHECK(length(auth) BETWEEN 1 AND 256),
 enabled boolean NOT NULL DEFAULT true,
 version bigint NOT NULL DEFAULT 1 CHECK(version>0),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 last_seen_at timestamptz NOT NULL DEFAULT clock_timestamp(), expires_at timestamptz
);
CREATE INDEX pwa_push_subscription_owner ON public.pwa_push_subscriptions(partner_id,subject) WHERE enabled;
CREATE TABLE public.pwa_notification_preferences (
 partner_id text NOT NULL CHECK(length(partner_id) BETWEEN 1 AND 256),
 channel text NOT NULL CHECK(channel='web-push'), enabled boolean NOT NULL,
 version bigint NOT NULL DEFAULT 1 CHECK(version>0), updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(partner_id,channel)
);
CREATE TABLE public.pwa_notification_deliveries (
 delivery_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 event_id uuid NOT NULL REFERENCES public.pwa_notification_events(event_id),
 channel text NOT NULL CHECK(channel='web-push'),
 destination_key text NOT NULL CHECK(destination_key ~ '^[a-f0-9]{64}$'),
 recipient_partner_id text NOT NULL CHECK(length(recipient_partner_id) BETWEEN 1 AND 256),
 subscription_id uuid NOT NULL REFERENCES public.pwa_push_subscriptions(subscription_id),
 subscription_version bigint NOT NULL CHECK(subscription_version>0),
 state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','leased','sent','retry','uncertain','cancelled','dead')),
 lease_generation bigint NOT NULL DEFAULT 0 CHECK(lease_generation>=0), lease_expires_at timestamptz, send_started_at timestamptz,
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 8),
 next_attempt_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 provider_result text CHECK(provider_result IN ('accepted','expired','throttled','unavailable','network','rejected','ineligible','lease_expired')),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), completed_at timestamptz,
 UNIQUE(event_id,channel,destination_key),
 CHECK((state='leased')=(lease_expires_at IS NOT NULL))
);
CREATE INDEX pwa_notification_delivery_due ON public.pwa_notification_deliveries(next_attempt_at,delivery_id) WHERE state IN ('pending','retry');
CREATE TABLE public.pwa_job_runs (
 run_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 job_name text NOT NULL CHECK(job_name IN ('daily-charges','recent-analytics')),
 business_date date NOT NULL CHECK(isfinite(business_date)),
 scope_key text NOT NULL CHECK(length(scope_key) BETWEEN 1 AND 256),
 state text NOT NULL CHECK(state IN ('pending','leased','completed','uncertain','failed')),
 lease_generation bigint NOT NULL DEFAULT 0 CHECK(lease_generation>=0), lease_expires_at timestamptz,
 checkpoint text CHECK(length(checkpoint)<=512),
 started_at timestamptz, completed_at timestamptz,
 result_count bigint CHECK(result_count>=0), error_code text CHECK(error_code IN ('execution_failed','lease_expired')),
 UNIQUE(job_name,business_date,scope_key), CHECK((state='leased')=(lease_expires_at IS NOT NULL))
);
COMMENT ON TABLE public.pwa_notification_events IS 'mw-access:governance notification immutable occurrence; explicit capture authority only';
COMMENT ON TABLE public.pwa_notification_deliveries IS 'mw-access:governance notification fenced delivery state';
COMMENT ON TABLE public.pwa_push_subscriptions IS 'mw-access:secret authenticated device credentials';
COMMENT ON TABLE public.pwa_notification_preferences IS 'mw-access:governance authenticated notification preferences';
COMMENT ON TABLE public.pwa_job_runs IS 'mw-access:governance canonical job evidence';
REVOKE ALL ON public.pwa_notification_events,public.pwa_notification_deliveries,public.pwa_push_subscriptions,public.pwa_notification_preferences,public.pwa_job_runs FROM PUBLIC;
DO $acl$ DECLARE role_name text; BEGIN
 FOR role_name IN SELECT rolname FROM pg_roles WHERE rolname IN ('mw_app_dev','mw_app_prod') LOOP
  EXECUTE format('REVOKE ALL ON public.pwa_notification_events,public.pwa_notification_deliveries,public.pwa_push_subscriptions,public.pwa_notification_preferences,public.pwa_job_runs FROM %I',role_name);
 END LOOP;
END $acl$;

-- Same source occurrence dedupes regardless of PWA/AppSheet entry. Metadata edits
-- and reposting the same payment cannot produce a second payment notification.
CREATE FUNCTION public.pwa_capture_notification_v1() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE kind text; actor_email text; actor_id text; matches bigint; version text;
BEGIN
 IF current_setting('mw.pwa_event_capture',true) IS DISTINCT FROM 'enabled' THEN RETURN NEW; END IF;
 IF TG_TABLE_NAME='Payments' THEN
  IF NEW."Status" IS DISTINCT FROM 'Posted' OR (TG_OP='UPDATE' AND OLD."Status"='Posted') THEN RETURN NEW; END IF;
  kind:='payment.posted';actor_email:=nullif(lower(btrim(NEW."Created By")),'');version:='posted';
 ELSE
  IF TG_OP='INSERT' THEN kind:='loan.created';actor_email:=nullif(lower(btrim(NEW."Created By")),'');version:='created';
  ELSIF NEW."Loan Status"='ปิดยอดแล้ว' AND OLD."Loan Status" IS DISTINCT FROM 'ปิดยอดแล้ว' AND NEW."Ref Closing Payment" IS NULL THEN
   kind:='loan.closed';actor_email:=nullif(lower(btrim(NEW."Closed By")),'');version:='closed:'||coalesce(NEW."Close Date"::text,'unknown');
  ELSE RETURN NEW; END IF;
 END IF;
 SELECT count(*),min("Row ID") INTO matches,actor_id FROM public."Partners" WHERE lower(btrim("Login Email"))=actor_email;
 IF matches<>1 THEN actor_id:=NULL;END IF;
 INSERT INTO public.pwa_notification_events(dedupe_key,event_type,source_kind,source_id,source_version,actor_partner_id,actor_login_email)
 VALUES(kind||':'||NEW."Row ID"||':'||version,kind,CASE WHEN TG_TABLE_NAME='Payments' THEN 'payment' ELSE 'loan' END,NEW."Row ID",version,actor_id,actor_email)
 ON CONFLICT(dedupe_key) DO NOTHING;
 RETURN NEW;
END $function$;
COMMENT ON FUNCTION public.pwa_capture_notification_v1() IS 'mw-access:governance dormant transaction capture; no public execution';
REVOKE ALL ON FUNCTION public.pwa_capture_notification_v1() FROM PUBLIC;
CREATE TRIGGER zz_pwa_notification_payment AFTER INSERT OR UPDATE ON public."Payments" FOR EACH ROW EXECUTE FUNCTION public.pwa_capture_notification_v1();
CREATE TRIGGER zz_pwa_notification_loan AFTER INSERT OR UPDATE ON public."Loans" FOR EACH ROW EXECUTE FUNCTION public.pwa_capture_notification_v1();

-- Expired claims become uncertain, never silently retry a potentially accepted send.
CREATE FUNCTION public.pwa_claim_notifications_v1(p_limit integer,p_seconds integer)
RETURNS SETOF public.pwa_notification_deliveries LANGUAGE plpgsql SET search_path=pg_catalog,public AS $function$
BEGIN
 IF p_limit NOT BETWEEN 1 AND 50 OR p_seconds NOT BETWEEN 5 AND 120 THEN RAISE EXCEPTION 'Invalid claim bounds';END IF;
 UPDATE public.pwa_notification_deliveries SET state=CASE WHEN send_started_at IS NULL AND attempts<8 THEN 'retry' ELSE 'uncertain' END,lease_expires_at=NULL,provider_result='lease_expired'
 WHERE state='leased' AND lease_expires_at<=clock_timestamp();
 RETURN QUERY WITH due AS (
 SELECT delivery_id FROM public.pwa_notification_deliveries WHERE state IN ('pending','retry') AND attempts<8 AND next_attempt_at<=clock_timestamp()
 ORDER BY next_attempt_at,delivery_id FOR UPDATE SKIP LOCKED LIMIT p_limit)
 UPDATE public.pwa_notification_deliveries d SET state='leased',lease_generation=d.lease_generation+1,
 lease_expires_at=clock_timestamp()+make_interval(secs=>p_seconds),send_started_at=NULL,attempts=d.attempts+1
 FROM due WHERE d.delivery_id=due.delivery_id RETURNING d.*;
END $function$;
COMMENT ON FUNCTION public.pwa_claim_notifications_v1(integer,integer) IS 'mw-access:governance fenced dispatcher claim';
REVOKE ALL ON FUNCTION public.pwa_claim_notifications_v1(integer,integer) FROM PUBLIC;
