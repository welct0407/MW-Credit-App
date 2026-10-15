-- Editable settings retain existing actor checks, CAS and canonical replay identity.
-- This changes only the default for future borrower inserts; existing rows are untouched.
ALTER TABLE public."Borrowers" ALTER COLUMN "AI Collection Enabled" SET DEFAULT true;

DO $migration$ DECLARE definition text;old_text text:=$old$ IF (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(i) key) IS DISTINCT FROM ARRAY['address','city','communicationName','description','hidden','instagramUsername','name','note','preferredReceivingAccountId','referrerId','workingLocation'] THEN RAISE EXCEPTION 'inputs';END IF;
 input_text:='{';FOREACH k IN ARRAY ARRAY['name','description','communicationName','instagramUsername','city','workingLocation','address','hidden','referrerId','preferredReceivingAccountId','note'] LOOP
  IF k='hidden' THEN IF jsonb_typeof(i->k) NOT IN('boolean','null') THEN RAISE EXCEPTION 'boolean';END IF;
  ELSE IF jsonb_typeof(i->k) NOT IN('string','null') OR octet_length(i->>k)>65536 THEN RAISE EXCEPTION 'text';END IF;
  IF k IN('referrerId','preferredReceivingAccountId') AND i->k<>'null'::jsonb AND (octet_length(i->>k) NOT BETWEEN 1 AND 256 OR i->>k~'[[:cntrl:]]') THEN RAISE EXCEPTION 'ref';END IF;END IF;
  input_text:=input_text||CASE WHEN input_text='{' THEN '' ELSE ',' END||to_json(k)::text||':'||CASE WHEN i->k='null'::jsonb THEN 'null' WHEN k='hidden' THEN (i->k)::text ELSE to_json(i->>k)::text END;
 END LOOP;input_text:=input_text||'}';END IF;
$old$;BEGIN
 SELECT pg_get_functiondef('public.pwa_submit_operation_v2(text)'::regprocedure) INTO definition;
 IF strpos(definition,old_text)=0 THEN RAISE EXCEPTION 'V92 expected function anchor missing: public.pwa_submit_operation_v2(text)';END IF;
 EXECUTE replace(definition,old_text,$new$ IF (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(i-'aiCollectionEnabled') key) IS DISTINCT FROM ARRAY['address','city','communicationName','description','hidden','instagramUsername','name','note','preferredReceivingAccountId','referrerId','workingLocation'] THEN RAISE EXCEPTION 'inputs';END IF;
 input_text:='{';FOREACH k IN ARRAY ARRAY['name','description','communicationName','instagramUsername','city','workingLocation','address','hidden','referrerId','preferredReceivingAccountId','note']||CASE WHEN i?'aiCollectionEnabled' THEN ARRAY['aiCollectionEnabled'] ELSE ARRAY[]::text[] END LOOP
  IF k IN('hidden','aiCollectionEnabled') THEN IF jsonb_typeof(i->k) NOT IN('boolean','null') THEN RAISE EXCEPTION 'boolean';END IF;
  ELSE IF jsonb_typeof(i->k) NOT IN('string','null') OR octet_length(i->>k)>65536 THEN RAISE EXCEPTION 'text';END IF;
  IF k IN('referrerId','preferredReceivingAccountId') AND i->k<>'null'::jsonb AND (octet_length(i->>k) NOT BETWEEN 1 AND 256 OR i->>k~'[[:cntrl:]]') THEN RAISE EXCEPTION 'ref';END IF;END IF;
  input_text:=input_text||CASE WHEN input_text='{' THEN '' ELSE ',' END||to_json(k)::text||':'||CASE WHEN i->k='null'::jsonb THEN 'null' WHEN k IN('hidden','aiCollectionEnabled') THEN (i->k)::text ELSE to_json(i->>k)::text END;
 END LOOP;input_text:=input_text||'}';END IF;
$new$);
END $migration$;

DO $migration$ DECLARE definition text;old_text text:=$old$ INSERT INTO public."Borrowers"("Row ID","Borrower Name","Description","Communication Name","Instagram Username","City","Working Location","Address","Hidden Flag","Ref Referrer","Ref Preferred Receiving Cash Account","Borrower Note","Creation Date") VALUES(target,i->>'name',i->>'description',i->>'communicationName',i->>'instagramUsername',i->>'city',i->>'workingLocation',i->>'address',(i->>'hidden')::boolean,i->>'referrerId',i->>'preferredReceivingAccountId',i->>'note',(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date);$old$;BEGIN
 SELECT pg_get_functiondef('public.pwa_submit_operation_v2(text)'::regprocedure) INTO definition;
 IF strpos(definition,old_text)=0 THEN RAISE EXCEPTION 'V92 expected function anchor missing: public.pwa_submit_operation_v2(text)';END IF;
 EXECUTE replace(definition,old_text,$new$ INSERT INTO public."Borrowers"("Row ID","Borrower Name","Description","Communication Name","Instagram Username","City","Working Location","Address","Hidden Flag","Ref Referrer","Ref Preferred Receiving Cash Account","Borrower Note","Creation Date","AI Collection Enabled") VALUES(target,i->>'name',i->>'description',i->>'communicationName',i->>'instagramUsername',i->>'city',i->>'workingLocation',i->>'address',(i->>'hidden')::boolean,i->>'referrerId',i->>'preferredReceivingAccountId',i->>'note',(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date,CASE WHEN i?'aiCollectionEnabled' THEN (i->>'aiCollectionEnabled')::boolean ELSE true END);$new$);
END $migration$;

DO $migration$ DECLARE definition text;old_text text:=$old$ ELSIF op='borrower.update' THEN UPDATE public."Borrowers" SET "Borrower Name"=i->>'name',"Description"=i->>'description',"Communication Name"=i->>'communicationName',"Instagram Username"=i->>'instagramUsername',"City"=i->>'city',"Working Location"=i->>'workingLocation',"Address"=i->>'address',"Hidden Flag"=(i->>'hidden')::boolean,"Ref Referrer"=i->>'referrerId',"Ref Preferred Receiving Cash Account"=i->>'preferredReceivingAccountId',"Borrower Note"=i->>'note' WHERE "Row ID"=target;$old$;BEGIN
 SELECT pg_get_functiondef('public.pwa_submit_operation_v2(text)'::regprocedure) INTO definition;
 IF strpos(definition,old_text)=0 THEN RAISE EXCEPTION 'V92 expected function anchor missing: public.pwa_submit_operation_v2(text)';END IF;
 EXECUTE replace(definition,old_text,$new$ ELSIF op='borrower.update' THEN UPDATE public."Borrowers" SET "Borrower Name"=i->>'name',"Description"=i->>'description',"Communication Name"=i->>'communicationName',"Instagram Username"=i->>'instagramUsername',"City"=i->>'city',"Working Location"=i->>'workingLocation',"Address"=i->>'address',"Hidden Flag"=(i->>'hidden')::boolean,"Ref Referrer"=i->>'referrerId',"Ref Preferred Receiving Cash Account"=i->>'preferredReceivingAccountId',"Borrower Note"=i->>'note',"AI Collection Enabled"=CASE WHEN i?'aiCollectionEnabled' THEN (i->>'aiCollectionEnabled')::boolean ELSE "AI Collection Enabled" END WHERE "Row ID"=target;$new$);
END $migration$;

DO $migration$ DECLARE definition text;old_text text:=$old$ IF kind='partner' AND split_part(op,'.',2)<>'delete' THEN
 IF split_part(op,'.',2)='create' THEN
 IF coalesce((i->>'igIntegrationEnabled')::boolean,false) OR (i->>'aiReviewer')::boolean THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Integration permissions are read-only';END IF;
 ELSE IF (i->'igIntegrationEnabled',i->'aiReviewer') IS DISTINCT FROM (snapshot->'IG Integration Enabled',snapshot->'AI Reviewer') THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Integration permissions are read-only';END IF;END IF;
 END IF;
$old$;BEGIN
 SELECT pg_get_functiondef('public.pwa_apply_management_v2(text)'::regprocedure) INTO definition;
 IF strpos(definition,old_text)=0 THEN RAISE EXCEPTION 'V92 expected function anchor missing: public.pwa_apply_management_v2(text)';END IF;
 EXECUTE replace(definition,old_text,$new$$new$);
END $migration$;

DO $migration$ DECLARE definition text;old_text text:=$old$  IF k='email' AND nullif(btrim(i->>k),'') IS NOT NULL AND lower(btrim(i->>k))<>'welct0407@mw-credit.com' THEN RAISE EXCEPTION USING ERRCODE='22023';END IF;$old$;BEGIN
 SELECT pg_get_functiondef('public.pwa_management_input_text_v2(text,jsonb)'::regprocedure) INTO definition;
 IF strpos(definition,old_text)=0 THEN RAISE EXCEPTION 'V92 expected function anchor missing: public.pwa_management_input_text_v2(text,jsonb)';END IF;
 EXECUTE replace(definition,old_text,$new$  IF k='email' AND nullif(btrim(i->>k),'') IS NOT NULL AND (octet_length(i->>k)>320 OR btrim(i->>k)!~'^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') THEN RAISE EXCEPTION USING ERRCODE='22023';END IF;$new$);
END $migration$;

DO $migration$ DECLARE definition text;old_text text:=$old$ IF i->>'statementAccountId' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public."Cash Accounts" WHERE "Row ID"=i->>'statementAccountId' AND "Active" IS TRUE) THEN RAISE EXCEPTION USING ERRCODE='P5B04';END IF;$old$;BEGIN
 SELECT pg_get_functiondef('public.pwa_apply_preference_v2(text)'::regprocedure) INTO definition;
 IF strpos(definition,old_text)=0 THEN RAISE EXCEPTION 'V92 expected function anchor missing: public.pwa_apply_preference_v2(text)';END IF;
 EXECUTE replace(definition,old_text,$new$ IF i->>'statementAccountId' IS NOT NULL AND i->>'statementAccountId' IS DISTINCT FROM (SELECT "Ref Cash Account"::text FROM public."Cash Statement Context" WHERE "Ref Partner"=target) AND NOT EXISTS(SELECT 1 FROM public."Cash Accounts" WHERE "Row ID"=i->>'statementAccountId' AND "Active" IS TRUE) THEN RAISE EXCEPTION USING ERRCODE='P5B04';END IF;$new$);
END $migration$;

DO $migration$ DECLARE definition text;old_text text:=$old$ IF i->>'statementDate' IS NOT NULL AND (i->>'statementDate')::date NOT BETWEEN today-14 AND today THEN RAISE EXCEPTION USING ERRCODE='P5B08';END IF;$old$;BEGIN
 SELECT pg_get_functiondef('public.pwa_apply_preference_v2(text)'::regprocedure) INTO definition;
 IF strpos(definition,old_text)=0 THEN RAISE EXCEPTION 'V92 expected function anchor missing: public.pwa_apply_preference_v2(text)';END IF;
 EXECUTE replace(definition,old_text,$new$ IF i->>'statementDate' IS NOT NULL AND i->>'statementDate' IS DISTINCT FROM (SELECT "Statement Date"::text FROM public."Cash Statement Context" WHERE "Ref Partner"=target) AND (i->>'statementDate')::date NOT BETWEEN today-14 AND today THEN RAISE EXCEPTION USING ERRCODE='P5B08';END IF;$new$);
END $migration$;
