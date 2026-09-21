BEGIN;
DO $$
DECLARE flag boolean;
BEGIN
  INSERT INTO public."Partners" ("Row ID","Partner Name")
    VALUES ('r014-reviewer-test','Synthetic reviewer test');
  SELECT "AI Reviewer" INTO flag FROM public."Partners" WHERE "Row ID"='r014-reviewer-test';
  IF flag IS DISTINCT FROM false THEN RAISE EXCEPTION 'New partner must not be a reviewer'; END IF;
  BEGIN
    UPDATE public."Partners" SET "AI Reviewer"=NULL WHERE "Row ID"='r014-reviewer-test';
    RAISE EXCEPTION 'NULL reviewer incorrectly accepted';
  EXCEPTION WHEN not_null_violation THEN NULL;
  END;
  UPDATE public."Partners" SET "AI Reviewer"=true WHERE "Row ID"='r014-reviewer-test';
  IF NOT (SELECT "AI Reviewer" FROM public."Partners" WHERE "Row ID"='r014-reviewer-test')
    THEN RAISE EXCEPTION 'Explicit reviewer selection failed'; END IF;
END $$;
ROLLBACK;
