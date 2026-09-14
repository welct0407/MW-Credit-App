-- DRAFT: isolated synthetic database only. Not executed or PostgreSQL-tested yet.
-- Run as the owner in a dedicated empty POC database, not the loan database.
-- Deliberately fails if these objects already exist. No credentials or grants here.
BEGIN;
CREATE TABLE public.poc_source (
  id varchar(64) PRIMARY KEY,
  input_value integer NOT NULL DEFAULT 0,
  revision integer NOT NULL DEFAULT 0 CHECK (revision >= 0)
);
CREATE TABLE public.poc_projection (
  id varchar(64) PRIMARY KEY REFERENCES public.poc_source(id),
  applied_revision integer NOT NULL,
  derived_value bigint NOT NULL
);
CREATE TABLE public.poc_events (
  id varchar(100) PRIMARY KEY,
  source_id varchar(64) NOT NULL REFERENCES public.poc_source(id),
  revision integer NOT NULL,
  input_value integer NOT NULL,
  derived_value bigint NOT NULL,
  UNIQUE (source_id, revision)
);
INSERT INTO public.poc_source VALUES ('SYNC-001', 0, 0);
INSERT INTO public.poc_projection VALUES ('SYNC-001', 0, 0);

CREATE FUNCTION public.poc_apply_source_update() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'POC keys are immutable';
  END IF;
  IF NEW.input_value = OLD.input_value AND NEW.revision = OLD.revision THEN
    RETURN NEW;
  END IF;
  IF NEW.revision <> OLD.revision + 1 THEN
    RAISE EXCEPTION 'POC revision must advance exactly one step';
  END IF;
  UPDATE public.poc_projection
     SET applied_revision = NEW.revision,
         derived_value = NEW.input_value::bigint * 2
   WHERE id = NEW.id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'POC projection missing';
  END IF;
  INSERT INTO public.poc_events(id, source_id, revision, input_value, derived_value)
  VALUES (NEW.id || '-' || NEW.revision::text, NEW.id, NEW.revision,
          NEW.input_value, NEW.input_value::bigint * 2);
  -- Raise AFTER both side effects to prove transaction rollback includes them.
  IF NEW.input_value < 0 THEN
    RAISE EXCEPTION 'POC negative input deliberately rejected';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER poc_source_update
AFTER UPDATE ON public.poc_source
FOR EACH ROW EXECUTE FUNCTION public.poc_apply_source_update();
COMMIT;

-- AppSheet test sequence (perform through the new GUI, not these SQL comments):
-- 1. SYNC-001 => value 10, revision 1: projection 20/rev1, one event.
-- 2. Identical save: still one event (client may elide the no-op write).
-- 3. value 7, revision 2: projection 14/rev2, two events.
-- 4. value -1, revision 3: sync error; source/projection/events stay at step 3.
-- 5. Correct rejected pending update to value 9, revision 3: 18/rev3, three events.
-- Record all table values after the originating sync before any extra sync.
