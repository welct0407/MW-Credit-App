-- Immutable source/verified object identity, independently retried metadata links.
ALTER TABLE runtime.receipt_jobs ADD COLUMN source text;
CREATE TABLE runtime.receipt_assets (
 receipt_id text PRIMARY KEY CHECK(receipt_id ~ '^[0-9a-f]{64}$'),
 job_id text NOT NULL UNIQUE REFERENCES runtime.receipt_jobs(id),
 source text NOT NULL,
 archive_state text NOT NULL DEFAULT 'SOURCE_PENDING',
 attempts integer NOT NULL DEFAULT 0,
 next_attempt_at double precision NOT NULL DEFAULT 0,
 last_error_code text NOT NULL DEFAULT '',
 object_key text, raw_sha256 text, pixel_sha256 text, mime_type text, byte_size integer,
 generation text, crc32c text, downloaded_at double precision,
 classification text NOT NULL DEFAULT 'unknown', classified_at double precision,
 CHECK(archive_state IN ('SOURCE_PENDING','LOCAL_READY','UPLOADING','ARCHIVED','SOURCE_UNAVAILABLE','INTEGRITY_CONFLICT')),
 CHECK(archive_state<>'ARCHIVED' OR (generation IS NOT NULL AND raw_sha256 IS NOT NULL AND object_key IS NOT NULL))
);
CREATE TABLE runtime.receipt_payment_links (
 link_id text PRIMARY KEY,
 receipt_id text NOT NULL UNIQUE REFERENCES runtime.receipt_assets(receipt_id),
 business_environment text NOT NULL CHECK(business_environment IN ('dev','prod')),
 payment_id text NOT NULL,
 verification text NOT NULL, verification_digest text NOT NULL,
 projection_state text NOT NULL DEFAULT 'PENDING' CHECK(projection_state IN ('PENDING','APPLIED','UNKNOWN','CONFLICT')),
 attempts integer NOT NULL DEFAULT 0, next_attempt_at double precision NOT NULL DEFAULT 0,
 last_error_code text NOT NULL DEFAULT '', verified_at double precision NOT NULL,
 UNIQUE(business_environment,payment_id)
);
CREATE FUNCTION runtime.guard_receipt_identity() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF TG_TABLE_NAME='receipt_assets' THEN
  IF (NEW.receipt_id,NEW.job_id,NEW.source) IS DISTINCT FROM (OLD.receipt_id,OLD.job_id,OLD.source)
   OR (OLD.raw_sha256 IS NOT NULL AND (NEW.object_key,NEW.raw_sha256,NEW.pixel_sha256,NEW.mime_type,NEW.byte_size,NEW.downloaded_at)
      IS DISTINCT FROM (OLD.object_key,OLD.raw_sha256,OLD.pixel_sha256,OLD.mime_type,OLD.byte_size,OLD.downloaded_at))
   OR (OLD.generation IS NOT NULL AND (NEW.generation,NEW.crc32c,NEW.archive_state)
      IS DISTINCT FROM (OLD.generation,OLD.crc32c,OLD.archive_state)) THEN
   RAISE EXCEPTION 'Receipt source and verified locator are immutable';
  END IF;
 ELSIF TG_TABLE_NAME='receipt_jobs' THEN
  IF OLD.source IS NOT NULL AND NEW.source IS DISTINCT FROM OLD.source THEN RAISE EXCEPTION 'Receipt ingress source is immutable'; END IF;
 ELSE
  IF (NEW.link_id,NEW.receipt_id,NEW.business_environment,NEW.payment_id,NEW.verification,NEW.verification_digest,NEW.verified_at)
   IS DISTINCT FROM (OLD.link_id,OLD.receipt_id,OLD.business_environment,OLD.payment_id,OLD.verification,OLD.verification_digest,OLD.verified_at) THEN
   RAISE EXCEPTION 'Receipt association is immutable';
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER receipt_asset_identity BEFORE UPDATE ON runtime.receipt_assets FOR EACH ROW EXECUTE FUNCTION runtime.guard_receipt_identity();
CREATE TRIGGER receipt_link_identity BEFORE UPDATE ON runtime.receipt_payment_links FOR EACH ROW EXECUTE FUNCTION runtime.guard_receipt_identity();
CREATE TRIGGER receipt_source_identity BEFORE UPDATE OF source ON runtime.receipt_jobs FOR EACH ROW EXECUTE FUNCTION runtime.guard_receipt_identity();
GRANT SELECT,INSERT,UPDATE ON runtime.receipt_assets,runtime.receipt_payment_links TO mw_agent_worker;
GRANT SELECT ON runtime.receipt_assets,runtime.receipt_payment_links TO mw_agent_auditor;
REVOKE ALL ON FUNCTION runtime.guard_receipt_identity() FROM PUBLIC;
