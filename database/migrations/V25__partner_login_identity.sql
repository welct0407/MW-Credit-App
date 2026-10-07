-- R009: separate authenticated identity from notification delivery.
-- Existing distinct Partner emails are the reviewed initial login mapping.
-- Notification Email remains the existing Email column; no DEV address in migrations.
ALTER TABLE public."Partners" ADD COLUMN "Login Email" text;
ALTER TABLE public."Partners" ADD CONSTRAINT partners_login_email_nonblank
  CHECK ("Login Email" IS NULL OR btrim("Login Email") <> '');
CREATE UNIQUE INDEX partners_login_email_unique
  ON public."Partners" (lower(btrim("Login Email")))
  WHERE "Login Email" IS NOT NULL;
COMMENT ON COLUMN public."Partners"."Login Email" IS
  'Unique AppSheet sign-in identity; independent of notification Email. Null means no login mapping.';
COMMENT ON COLUMN public."Partners"."Email" IS
  'Notification delivery address; may be shared. Never use this field to identify/exclude the actor.';
-- Backfill last: existing deferred Partner financial triggers must not precede DDL.
UPDATE public."Partners" SET "Login Email" = lower(btrim("Email"))
WHERE nullif(btrim("Email"), '') IS NOT NULL;
