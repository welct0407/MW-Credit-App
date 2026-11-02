-- R115 daily cash withdrawal (owner request of 2 November 2026; Archie's design). From Cash Position a Partner withdraws
-- cash from Dad's bank accounts into Dad's on-hand cash account for a chosen date and 10-minute time: one Manual
-- "Cash Handover" per non-zero line, all lines in one request or none. Functions only.
-- 1. guard_cash_ledger keeps its server "Created At" on every INSERT except a Manual row inserted while the
--    transaction-local setting r115.cash_movement_time is 'on' (the r005.allow_cash_adjustment pattern): that row keeps
--    the explicit "Created At" (the cash statements' transaction time, V30), which must not be in the future. Only
--    pwa_apply_management_financial_v2 turns the setting on, around its own inserts. "Created At" stays immutable on UPDATE.
-- 2. pwa_management_financial_text_v2 accepts cash-withdrawal.create: inputs {movementDate, movementTime, toAccountId,
--    lines:[{fromAccountId, amount}]} in that canonical order (movementTime HH:MM with minutes a multiple of 10; 1 to 10
--    lines, amount a positive whole-baht integer string, distinct fromAccountId, none equal to toAccountId; the command
--    contract drops zero lines before this). Anything else is 22023.
-- 3. pwa_apply_management_financial_v2 applies it under the request lock, the target lock and one lock per source
--    account (sorted): every account must be an active account of the active holder ch:dad (else invalid_reference
--    P5B04); the date and time must not be in the future and the date must be within the 15 Bangkok days the Recent
--    statement views cover (else invalid_date P5B08); each line must not exceed the account's balance as of that date
--    and time (the day's opening balance from "Cash Account Daily Summary Recent" plus that day's entries of
--    "Cash Account Statement Recent" with Sort Timestamp <= the time, ties included; an uninitialized account is
--    account_unavailable P5B07, an overdraw insufficient_funds P5B10). Rows: Movement Date = date, Created At = date
--    and time (Bangkok), ids <targetId> for line 1 and wd115:<targetId>:<n> for line n, notes "Daily cash withdrawal".
-- 4. pwa_submit_operation_v2 accepts the operation (a create: null expectedVersion, UUID target) and routes it to (2)
--    and (3); the journal's replay and conflict rules are unchanged.
-- No table, column, constraint, trigger, role or grant change. Every function is CREATE OR REPLACE'd from its current
-- definition with exact, counted text replacements (as V116 does), which keeps each owner and ACL; the self-check proves it.

DO $preflight$
BEGIN
 IF current_database() NOT IN ('loan_manager_dev','payment_rehearsal','loan_manager_prod') THEN RAISE EXCEPTION 'Unsupported application database'; END IF;
 IF to_regclass('public."Cash Account Statement Recent"') IS NULL OR to_regclass('public."Cash Account Daily Summary Recent"') IS NULL THEN RAISE EXCEPTION 'V127 needs the V27 statement views'; END IF;
END $preflight$;

CREATE TEMP TABLE v127_acl ON COMMIT DROP AS
 SELECT p.oid::regprocedure::text AS routine,pg_get_userbyid(p.proowner) AS owner,coalesce(p.proacl::text,'') AS acl,p.prosecdef AS definer
 FROM pg_proc p WHERE p.oid IN ('public.guard_cash_ledger()'::regprocedure,'public.pwa_management_financial_text_v2(text,jsonb)'::regprocedure,
  'public.pwa_apply_management_financial_v2(text)'::regprocedure,'public.pwa_submit_operation_v2(text)'::regprocedure);

CREATE FUNCTION pg_temp.v127_replace(routine regprocedure,marker text,edits text[]) RETURNS void LANGUAGE plpgsql AS $f$
DECLARE definition text:=pg_get_functiondef(routine);k integer;
BEGIN
 IF position(marker IN definition)>0 THEN RAISE EXCEPTION 'V127: % already changed',routine; END IF;
 FOR k IN 1..array_length(edits,1) LOOP
  IF (length(definition)-length(replace(definition,edits[k][1],'')))/length(edits[k][1])<>1 THEN RAISE EXCEPTION 'V127: unexpected % boundary %',routine,k; END IF;
  definition:=replace(definition,edits[k][1],edits[k][2]);
 END LOOP;
 EXECUTE definition;
END $f$;

-- 1. The ledger guard: an explicit transaction time on a Manual INSERT only under the transaction-local setting.
SELECT pg_temp.v127_replace('public.guard_cash_ledger()'::regprocedure,'r115.cash_movement_time',ARRAY[
 ARRAY[$o$   NEW."Created At":=CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok';$o$,
       $n$   IF NEW."Entry Origin"='Manual' AND current_setting('r115.cash_movement_time',true)='on' THEN
    -- R115 (V127): Daily cash withdrawal records the chosen transaction time; only its command sets this
    -- transaction-local setting, around its own inserts. The time must not be in the future.
    IF NEW."Created At" IS NULL OR NEW."Created At">CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok' THEN
     RAISE EXCEPTION 'Cash movement time must not be in the future';
    END IF;
   ELSE
    NEW."Created At":=CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok';
   END IF;$n$]]);

-- 2. The canonical input text of cash-withdrawal.create.
SELECT pg_temp.v127_replace('public.pwa_management_financial_text_v2(text,jsonb)'::regprocedure,'cash-withdrawal.create',ARRAY[
 ARRAY[$o$DECLARE keys text[];k text;result text:='{';$o$,
       $n$DECLARE keys text[];k text;result text:='{';wd_line jsonb;wd_n integer:=0;$n$],
 ARRAY[$o$'cash-movement.create','cash-movement.update','cash-movement.delete') OR jsonb_typeof(i) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION USING ERRCODE='22023';END IF;$o$,
       $n$'cash-movement.create','cash-movement.update','cash-movement.delete','cash-withdrawal.create') OR jsonb_typeof(i) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION USING ERRCODE='22023';END IF;
 IF op='cash-withdrawal.create' THEN
  -- R115 (V127): {movementDate, movementTime, toAccountId, lines:[{fromAccountId, amount}]}, 1 to 10 positive whole-baht lines.
  IF (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(i) key) IS DISTINCT FROM ARRAY['lines','movementDate','movementTime','toAccountId'] THEN RAISE EXCEPTION USING ERRCODE='22023';END IF;
  IF jsonb_typeof(i->'movementDate') IS DISTINCT FROM 'string' OR i->>'movementDate'!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' OR ((i->>'movementDate')::date)::text<>i->>'movementDate'
   OR jsonb_typeof(i->'movementTime') IS DISTINCT FROM 'string' OR i->>'movementTime'!~'^([01][0-9]|2[0-3]):[0-5]0$'
   OR jsonb_typeof(i->'toAccountId') IS DISTINCT FROM 'string' OR octet_length(i->>'toAccountId') NOT BETWEEN 1 AND 256 OR i->>'toAccountId'~'[[:cntrl:]]'
   OR jsonb_typeof(i->'lines') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION USING ERRCODE='22023';END IF;
  IF jsonb_array_length(i->'lines') NOT BETWEEN 1 AND 10 OR (SELECT count(DISTINCT l->>'fromAccountId') FROM jsonb_array_elements(i->'lines') l)<>jsonb_array_length(i->'lines') THEN RAISE EXCEPTION USING ERRCODE='22023';END IF;
  result:='{"movementDate":'||to_json(i->>'movementDate')::text||',"movementTime":'||to_json(i->>'movementTime')::text||',"toAccountId":'||to_json(i->>'toAccountId')::text||',"lines":[';
  FOR wd_line IN SELECT l FROM jsonb_array_elements(i->'lines') l LOOP
   wd_n:=wd_n+1;
   IF jsonb_typeof(wd_line) IS DISTINCT FROM 'object' OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(wd_line) key) IS DISTINCT FROM ARRAY['amount','fromAccountId']
    OR jsonb_typeof(wd_line->'fromAccountId') IS DISTINCT FROM 'string' OR octet_length(wd_line->>'fromAccountId') NOT BETWEEN 1 AND 256 OR wd_line->>'fromAccountId'~'[[:cntrl:]]' OR wd_line->>'fromAccountId'=i->>'toAccountId'
    OR jsonb_typeof(wd_line->'amount') IS DISTINCT FROM 'string' OR wd_line->>'amount'!~'^[1-9][0-9]{0,16}$' OR (wd_line->>'amount')::numeric>92233720368547758 THEN RAISE EXCEPTION USING ERRCODE='22023';END IF;
   result:=result||CASE WHEN wd_n>1 THEN ',' ELSE '' END||'{"fromAccountId":'||to_json(wd_line->>'fromAccountId')::text||',"amount":'||to_json(wd_line->>'amount')::text||'}';
  END LOOP;
  RETURN result||']}';
 END IF;$n$]]);

-- 3. The writer: Dad's accounts only, not in the future, within the Recent window, no line beyond its as-of balance.
SELECT pg_temp.v127_replace('public.pwa_apply_management_financial_v2(text)'::regprocedure,'cash-withdrawal',ARRAY[
 ARRAY[$o$day date:=(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date;message text;$o$,
       $n$day date:=(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date;message text;wd_day date;wd_ts timestamp;wd_line jsonb;wd_n bigint;wd_id text;wd_account text;$n$],
 ARRAY[$o$ IF i ? 'partnerId' AND NOT EXISTS(SELECT 1 FROM public."Partners" WHERE "Row ID"=i->>'partnerId') THEN RAISE EXCEPTION USING ERRCODE='P5B04';END IF;$o$,
       $n$ IF kind='cash-withdrawal' THEN
  -- R115 (V127): Daily cash withdrawal, one Manual Cash Handover per line from a Dad account into a Dad account, all or none.
  wd_day:=(i->>'movementDate')::date;wd_ts:=wd_day+(i->>'movementTime')::time;
  IF wd_ts>(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok') OR wd_day<day-14 THEN RAISE EXCEPTION USING ERRCODE='P5B08';END IF;
  FOR wd_account IN SELECT a FROM (SELECT i->>'toAccountId' a UNION ALL SELECT l->>'fromAccountId' FROM jsonb_array_elements(i->'lines') l) x GROUP BY a ORDER BY a COLLATE "C" LOOP
   IF NOT EXISTS(SELECT 1 FROM public."Cash Accounts" a JOIN public."Cash Holders" h ON h."Row ID"=a."Ref Cash Holder" WHERE a."Row ID"=wd_account AND a."Active" AND h."Active" AND h."Row ID"='ch:dad') THEN RAISE EXCEPTION USING ERRCODE='P5B04';END IF;
   PERFORM pg_advisory_xact_lock(public.pwa_lock_key_v1('cash-withdrawal-account',wd_account));
  END LOOP;
  IF EXISTS(SELECT 1 FROM public."Cash Ledger" WHERE "Row ID" LIKE 'wd115:'||target||':%') THEN RAISE EXCEPTION USING ERRCODE='P5B01';END IF;
  FOR wd_line IN SELECT l FROM jsonb_array_elements(i->'lines') l LOOP
   SELECT d."Opening Balance"+coalesce((SELECT sum(s."Signed Amount") FROM public."Cash Account Statement Recent" s
     WHERE s."Ref Cash Account"=d."Ref Cash Account" AND s."Statement Date"=d."Statement Date" AND s."Sort Timestamp"<=wd_ts),0)
    INTO available FROM public."Cash Account Daily Summary Recent" d WHERE d."Ref Cash Account"=wd_line->>'fromAccountId' AND d."Statement Date"=wd_day;
   IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P5B08';END IF;
   IF available IS NULL THEN RAISE EXCEPTION USING ERRCODE='P5B07';END IF;
   IF (wd_line->>'amount')::numeric>available THEN RAISE EXCEPTION USING ERRCODE='P5B10';END IF;
  END LOOP;
  BEGIN
   PERFORM set_config('r115.cash_movement_time','on',true);
   FOR wd_line,wd_n IN SELECT l,n FROM jsonb_array_elements(i->'lines') WITH ORDINALITY x(l,n) LOOP
    wd_id:=CASE WHEN wd_n=1 THEN target ELSE 'wd115:'||target||':'||wd_n END;
    INSERT INTO public."Cash Ledger"("Row ID","Movement Date","Movement Type","Amount","Ref From Cash Holder","Ref To Cash Holder","Ref From Cash Account","Ref To Cash Account","Ref Business Expense","Entry Origin","Source Type","Source Key","Notes","Created By","Created At")
     VALUES(wd_id,wd_day,'Cash Handover',(wd_line->>'amount')::numeric,'ch:dad','ch:dad',wd_line->>'fromAccountId',i->>'toAccountId',NULL,'Manual','Manual','MANUAL:'||wd_id,'Daily cash withdrawal',e#>>'{actor,loginEmail}',wd_ts);
   END LOOP;
   PERFORM set_config('r115.cash_movement_time','',true);
  EXCEPTION WHEN foreign_key_violation THEN RAISE EXCEPTION USING ERRCODE='P5B05';
  WHEN unique_violation THEN RAISE EXCEPTION USING ERRCODE='P5B01';
  WHEN raise_exception THEN GET STACKED DIAGNOSTICS message=MESSAGE_TEXT;
   IF message='Cash movement time must not be in the future' THEN RAISE EXCEPTION USING ERRCODE='P5B08';
   ELSIF message IN('A valid active cash account is required','A cash account is required for this new cash movement') THEN RAISE EXCEPTION USING ERRCODE='P5B07';
   ELSIF message IN('Cash handover requires Dad/Lisa endpoints or two distinct accounts of one holder','Manual transfers require active cash holders','Cash holder and account disagree') THEN RAISE EXCEPTION USING ERRCODE='P5B04';
   ELSE RAISE;END IF;
  END;
  RETURN jsonb_build_object('operation',op,'targetType',kind,'targetId',target,'paymentId',NULL,'plan',NULL,'predecessorRequestId',NULL,'sourceCreatedBy',NULL);
 END IF;
 IF i ? 'partnerId' AND NOT EXISTS(SELECT 1 FROM public."Partners" WHERE "Row ID"=i->>'partnerId') THEN RAISE EXCEPTION USING ERRCODE='P5B04';END IF;$n$]]);

-- 4. The operation command: accepted operation, create shape, canonical text and writer.
SELECT pg_temp.v127_replace('public.pwa_submit_operation_v2(text)'::regprocedure,'cash-withdrawal',ARRAY[
 ARRAY[$o$'cash-movement.create','cash-movement.update','cash-movement.delete','cash-openings.initialize'$o$,
       $n$'cash-movement.create','cash-movement.update','cash-movement.delete','cash-withdrawal.create','cash-openings.initialize'$n$],
 ARRAY[$o$'settlement.settle-all','cash-movement.create','assessment.create') THEN$o$,
       $n$'settlement.settle-all','cash-movement.create','cash-withdrawal.create','assessment.create') THEN$n$],
 ARRAY[$o$ELSIF split_part(op,'.',1) IN('capital-contribution','settlement','cash-movement') THEN input_text:=$o$,
       $n$ELSIF split_part(op,'.',1) IN('capital-contribution','settlement','cash-movement','cash-withdrawal') THEN input_text:=$n$],
 ARRAY[$o$ELSIF split_part(op,'.',1) IN('capital-contribution','settlement','cash-movement') THEN result_value:=$o$,
       $n$ELSIF split_part(op,'.',1) IN('capital-contribution','settlement','cash-movement','cash-withdrawal') THEN result_value:=$n$]]);

-- Self-check: owners, privileges and security unchanged; the change present in every body; PUBLIC executes no command function.
DO $check$
DECLARE bad text;
BEGIN
 SELECT string_agg(o.routine,', ') INTO bad FROM v127_acl o JOIN pg_proc p ON p.oid=o.routine::regprocedure
  WHERE pg_get_userbyid(p.proowner)<>o.owner OR coalesce(p.proacl::text,'')<>o.acl OR p.prosecdef<>o.definer;
 IF bad IS NOT NULL OR (SELECT count(*) FROM v127_acl)<>4 THEN RAISE EXCEPTION 'V127 changed the owner, privileges or security of %',coalesce(bad,'a replaced function'); END IF;
 IF has_function_privilege('public','public.pwa_submit_operation_v2(text)','EXECUTE') OR has_function_privilege('public','public.pwa_apply_management_financial_v2(text)','EXECUTE') THEN RAISE EXCEPTION 'V127: PUBLIC must not execute the operation functions'; END IF;
 IF position('r115.cash_movement_time' IN pg_get_functiondef('public.guard_cash_ledger()'::regprocedure))=0
  OR position('cash-withdrawal.create' IN pg_get_functiondef('public.pwa_management_financial_text_v2(text,jsonb)'::regprocedure))=0
  OR position($s$'r115.cash_movement_time','on'$s$ IN pg_get_functiondef('public.pwa_apply_management_financial_v2(text)'::regprocedure))=0
  OR position('cash-withdrawal.create' IN pg_get_functiondef('public.pwa_submit_operation_v2(text)'::regprocedure))=0 THEN RAISE EXCEPTION 'V127: a function was not replaced'; END IF;
END $check$;
DROP FUNCTION pg_temp.v127_replace(regprocedure,text,text[]);
