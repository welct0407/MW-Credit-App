-- R008: let the originating AppSheet command event look up the exact receipt
-- for the existing notification process. No new columns, financial changes,
-- existing-key rewrites, or notification delivery from SQL.
-- V23's MD5 keys remain valid and retry-safe. New command keys can be built
-- with AppSheet CONCATENATE/LEN, including a length-delimited source identity.
DO $$
DECLARE definition text; old_fragment text; new_fragment text;
BEGIN
 definition:=pg_get_functiondef('public.quick_payment_request()'::regprocedure);
 old_fragment:=$old$ payment_id:='r008:'||md5(TG_TABLE_NAME||'|'||length(NEW."Row ID")||':'||NEW."Row ID"||'|'||token);$old$;
 new_fragment:=$new$ -- Preserve idempotency for commands already posted under V23.
 IF EXISTS(SELECT 1 FROM public."Payments" WHERE "Row ID"='r008:'||md5(TG_TABLE_NAME||'|'||length(NEW."Row ID")||':'||NEW."Row ID"||'|'||token) AND "Status"='Posted') THEN RETURN NULL; END IF;
 payment_id:='r008:'||TG_TABLE_NAME||'|'||length(NEW."Row ID")||':'||NEW."Row ID"||'|'||token;$new$;
 IF position(old_fragment in definition)=0 THEN
  RAISE EXCEPTION 'Expected V23 quick-payment identity definition is missing';
 END IF;
 EXECUTE replace(definition,old_fragment,new_fragment);
END $$;
