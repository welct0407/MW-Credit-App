BEGIN;
DO $$ BEGIN
 ASSERT (SELECT "Login Email"='legacy@example.invalid' AND "Email"='Legacy@example.invalid'
 FROM "Partners" WHERE "Row ID"='R009PRE-A'), 'Backfill must preserve delivery and normalize login';
END $$;
INSERT INTO "Partners" ("Row ID","Partner Name","Login Email","Email") VALUES
 ('R009TEST-A','Synthetic A','a@example.invalid','shared@example.invalid'),
 ('R009TEST-B','Synthetic B','b@example.invalid','shared@example.invalid'),
 ('R009TEST-C','Synthetic C','c@example.invalid','shared@example.invalid'),
 ('R009TEST-D','Synthetic D',NULL,NULL);
DO $$
DECLARE actor_id text; addresses text[];
BEGIN
 SELECT "Row ID" INTO STRICT actor_id FROM "Partners" WHERE lower(btrim("Login Email"))='a@example.invalid';
 SELECT array_agg(DISTINCT "Email") INTO addresses FROM "Partners"
 WHERE "Row ID" LIKE 'R009TEST-%' AND "Row ID"<>actor_id AND nullif(btrim("Email"),'') IS NOT NULL;
 ASSERT addresses=ARRAY['shared@example.invalid'], 'Shared delivery address must survive creator exclusion and deduplicate';
 ASSERT (SELECT count(*) FROM "Partners" WHERE "Row ID" LIKE 'R009TEST-%' AND "Row ID"<>actor_id AND "Email"='shared@example.invalid')=2;
 BEGIN
  INSERT INTO "Partners"("Row ID","Login Email") VALUES ('R009TEST-E',' A@EXAMPLE.INVALID ');
  RAISE EXCEPTION 'Duplicate login accepted';
 EXCEPTION WHEN unique_violation THEN NULL;
 END;
 BEGIN
  UPDATE "Partners" SET "Login Email"=' ' WHERE "Row ID"='R009TEST-D';
  RAISE EXCEPTION 'Blank login accepted';
 EXCEPTION WHEN check_violation THEN NULL;
 END;
 ASSERT NOT EXISTS(SELECT 1 FROM "Partners" WHERE "Login Email"='unknown@example.invalid');
END $$;
ROLLBACK;
