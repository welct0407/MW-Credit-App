-- R068 ALL-ARCH-03 part 2b: the agent's reviewer and projector identities become the pair (effective role,
-- session login). The integration agent signs in as its IAM database user and SET ROLEs the task role, so the
-- V33/V49 checks on session_user alone no longer fit. Accepted: effective_role is the expected role AND
-- session_user is that role itself (password login, unchanged) or the agent's IAM user. Inside a SECURITY
-- DEFINER body current_user is the owner, so the SET ROLE target is read from the role setting
-- (current_setting('role') is 'none' or '' without SET ROLE; verified on PostgreSQL 18). Bodies are otherwise
-- the current text; owner, SECURITY mode, search_path, ACL and comments are kept (CREATE OR REPLACE). No grant
-- or membership here: GRANT ... TO "mw-integration-agent@...iam" WITH INHERIT FALSE, SET TRUE is an operator step.
-- Transactional; re-runnable (a second apply re-asserts the same text). On Cloud SQL the runner is not a
-- superuser: the preflight names every missing authority first (V93/V94 pattern).

-- 1. Preflight. Fails closed with the complete list of problems.
DO $preflight$
DECLARE problems text[]:='{}'; signature text; src text; owner_role text; found integer;
 begin_sig text:='agent_audit.begin_operation(uuid,text,text,text,text,jsonb,text)'; capture_sig text:='agent_audit.capture_change()';
 attach_sig text:='public.attach_payment_receipt_evidence(text,text,text,timestamptz,jsonb,uuid,text)';
 pair_mark text:=$m$current_setting('role',true)$m$;
BEGIN
 IF current_database() NOT IN ('loan_manager_dev','payment_rehearsal','loan_manager_prod') THEN RAISE EXCEPTION 'Unsupported application database'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='mw_business_audit_owner') THEN problems:=problems||'role mw_business_audit_owner is missing'; END IF;
 FOREACH signature IN ARRAY ARRAY[begin_sig,capture_sig,attach_sig] LOOP
  IF to_regprocedure(signature) IS NULL THEN problems:=problems||format('%s is missing',signature); END IF;
 END LOOP;
 IF to_regclass('agent_audit.commits') IS NULL OR NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid=to_regclass('agent_audit.commits') AND attname='database_session_role' AND NOT attisdropped) THEN
  problems:=problems||'agent_audit.commits.database_session_role is missing'; END IF;
 IF cardinality(problems)>0 THEN RAISE EXCEPTION 'V95 preflight: %', array_to_string(problems,'; '); END IF;
 -- Expected ownership: V33 objects belong to the audit owner; the receipt definer (V49/V50) to the runner that migrated it.
 FOREACH signature IN ARRAY ARRAY[begin_sig,capture_sig] LOOP
  IF (SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE oid=signature::regprocedure)<>'mw_business_audit_owner' THEN problems:=problems||format('%s is not owned by mw_business_audit_owner',signature); END IF;
 END LOOP;
 IF (SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid='agent_audit.commits'::regclass)<>'mw_business_audit_owner' THEN problems:=problems||'agent_audit.commits is not owned by mw_business_audit_owner'; END IF;
 SELECT pg_get_userbyid(proowner) INTO owner_role FROM pg_proc WHERE oid=attach_sig::regprocedure;
 -- Current text: each body still has its bare session_user check exactly once, or already carries the pair (re-run).
 FOREACH signature IN ARRAY ARRAY[begin_sig,capture_sig,attach_sig] LOOP
  SELECT prosrc INTO src FROM pg_proc WHERE oid=signature::regprocedure;
  found:=(length(src)-length(replace(src,CASE signature WHEN attach_sig THEN $o$IF session_user<>'mw_receipt_projector' THEN$o$ ELSE $o$IF session_user<>'mw_reviewer_dml' THEN$o$ END,'')))
   /length(CASE signature WHEN attach_sig THEN $o$IF session_user<>'mw_receipt_projector' THEN$o$ ELSE $o$IF session_user<>'mw_reviewer_dml' THEN$o$ END);
  IF NOT ((found=1 AND strpos(src,pair_mark)=0) OR (found=0 AND strpos(src,pair_mark)>0)) THEN
   problems:=problems||format('%s has an unexpected identity check (%s bare occurrence(s)); review the current body before V95',signature,found); END IF;
 END LOOP;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=current_user AND rolsuper) THEN
  -- CREATE OR REPLACE FUNCTION needs ownership (or membership of the owner) and CREATE on the schema for the executing role.
  IF NOT (pg_has_role(current_user,'mw_business_audit_owner','USAGE') OR pg_has_role(current_user,'mw_business_audit_owner','SET')) THEN
   problems:=problems||format('%s holds neither inherited nor SET authority on mw_business_audit_owner (temporary maintenance membership required)',current_user); END IF;
  IF NOT pg_has_role(current_user,owner_role,'USAGE') AND NOT pg_has_role(current_user,owner_role,'SET') THEN
   problems:=problems||format('%s holds neither inherited nor SET authority on %s, the owner of attach_payment_receipt_evidence',current_user,owner_role); END IF;
  IF NOT has_schema_privilege(CASE WHEN pg_has_role(current_user,owner_role,'USAGE') THEN current_user ELSE owner_role END,'public','CREATE') THEN
   problems:=problems||format('%s lacks CREATE on schema public (required by CREATE OR REPLACE FUNCTION)',CASE WHEN pg_has_role(current_user,owner_role,'USAGE') THEN current_user ELSE owner_role END); END IF;
 END IF;
 IF cardinality(problems)>0 THEN RAISE EXCEPTION 'V95 preflight: %', array_to_string(problems,'; '); END IF;
END $preflight$;

-- 2. Audit-owner objects: begin_operation, capture_change and the commits default. Written as an inheriting
-- member of mw_business_audit_owner, or under SET LOCAL ROLE when the runner only holds SET (V93 §3 pattern).
DO $audit$
DECLARE switched boolean:=false;
BEGIN
 IF NOT pg_has_role(current_user,'mw_business_audit_owner','USAGE') THEN SET LOCAL ROLE mw_business_audit_owner; switched:=true; END IF;
 -- V33 body plus the pair. The DEV reviewer target (mw_reviewer_dml_dev, W4) is accepted in every database but PROD.
 EXECUTE $fn$
CREATE OR REPLACE FUNCTION agent_audit.begin_operation(
 p_operation_id uuid,p_reviewer_id text,p_reviewer_login text,p_plan_sha256 text,
 p_request_reason text,p_direct_targets jsonb,p_code_version text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE effective_role text:=CASE WHEN current_setting('role',true) IN ('none','') THEN session_user::text ELSE current_setting('role',true) END;
BEGIN
 -- ALL-ARCH-03 (V95): reviewer identity is the pair (effective role, session login); inside this definer
 -- current_user is the owner, so the SET ROLE target comes from the role setting.
 IF NOT ((effective_role='mw_reviewer_dml' OR (effective_role='mw_reviewer_dml_dev' AND current_database()<>'loan_manager_prod'))
  AND session_user::text IN (effective_role,'mw-integration-agent@clever-oasis-508610-n7.iam')) THEN RAISE EXCEPTION 'Dedicated reviewer connection required'; END IF;
 IF nullif(current_setting('mw_agent.operation_id',true),'') IS NOT NULL THEN
  RAISE EXCEPTION 'Only one operation per transaction';
 END IF;
 INSERT INTO agent_audit.commits(operation_id,reviewer_id,reviewer_login,plan_sha256,request_reason,direct_targets,code_version)
 VALUES(p_operation_id,p_reviewer_id,p_reviewer_login,p_plan_sha256,p_request_reason,p_direct_targets,p_code_version);
 PERFORM set_config('mw_agent.operation_id',p_operation_id::text,true);
END $$;
 $fn$;
 EXECUTE $fn$
CREATE OR REPLACE FUNCTION agent_audit.capture_change() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE operation uuid; old_value jsonb; new_value jsonb; key_value jsonb;
 effective_role text:=CASE WHEN current_setting('role',true) IN ('none','') THEN session_user::text ELSE current_setting('role',true) END;
BEGIN
 -- AppSheet/shared database identities are not relabelled as agent DML.
 -- API calls have central host audits, with the attribution limits in SCHEMA.md.
 -- ALL-ARCH-03 (V95): the same pair as begin_operation; the marker row must carry this effective role.
 IF NOT ((effective_role='mw_reviewer_dml' OR (effective_role='mw_reviewer_dml_dev' AND current_database()<>'loan_manager_prod'))
  AND session_user::text IN (effective_role,'mw-integration-agent@clever-oasis-508610-n7.iam')) THEN RETURN NULL; END IF;
 operation:=nullif(current_setting('mw_agent.operation_id',true),'')::uuid;
 IF operation IS NULL OR NOT EXISTS (
    SELECT 1 FROM agent_audit.commits c
    WHERE c.operation_id=operation AND c.database_txid=pg_current_xact_id()
      AND c.database_session_role=effective_role) THEN
  RAISE EXCEPTION 'Reviewer DML requires its transaction audit marker';
 END IF;
 IF TG_OP<>'INSERT' THEN old_value:=to_jsonb(OLD); END IF;
 IF TG_OP<>'DELETE' THEN new_value:=to_jsonb(NEW); END IF;
 key_value:=coalesce(new_value,old_value)->'Row ID';
 IF key_value IS NULL OR key_value='null'::jsonb THEN RAISE EXCEPTION 'Audited table key unavailable'; END IF;
 INSERT INTO agent_audit.row_changes(operation_id,schema_name,table_name,action,row_key,before_row,after_row)
 VALUES(operation,TG_TABLE_SCHEMA,TG_TABLE_NAME,TG_OP,jsonb_build_object('Row ID',key_value),old_value,new_value);
 RETURN NULL;
END $$;
 $fn$;
 -- The marker records the effective role (begin_operation and the receipt definer insert with the default).
 ALTER TABLE agent_audit.commits ALTER COLUMN database_session_role
  SET DEFAULT (CASE WHEN current_setting('role',true) IN ('none','') THEN session_user::text ELSE current_setting('role',true) END)::name;
 IF switched THEN RESET ROLE; END IF;
END $audit$;
RESET ROLE;

-- 3. Receipt projector definer (runner-owned, V50 text): current text via pg_get_functiondef + exact-count
-- replace (V94 pattern), so owner, SECURITY mode, search_path, ACL and comment are preserved.
DO $receipt$
DECLARE sig text:='public.attach_payment_receipt_evidence(text,text,text,timestamptz,jsonb,uuid,text)'; definition text; owner_role text; found integer; switched boolean:=false;
 old_check text:=$o$IF session_user<>'mw_receipt_projector' THEN RAISE EXCEPTION 'Dedicated receipt projector required'; END IF;$o$;
 new_check text:=$n$IF NOT (CASE WHEN current_setting('role',true) IN ('none','') THEN session_user::text ELSE current_setting('role',true) END='mw_receipt_projector' AND session_user IN ('mw_receipt_projector','mw-integration-agent@clever-oasis-508610-n7.iam')) THEN RAISE EXCEPTION 'Dedicated receipt projector required'; END IF;$n$;
BEGIN
 SELECT pg_get_functiondef(sig::regprocedure),pg_get_userbyid(proowner) INTO STRICT definition,owner_role FROM pg_proc WHERE oid=sig::regprocedure;
 found:=(length(definition)-length(replace(definition,old_check,'')))/length(old_check);
 IF found=0 AND strpos(definition,new_check)>0 THEN RETURN; END IF; -- already replaced (re-run)
 IF found<>1 THEN RAISE EXCEPTION 'V95: % occurrence(s) of the projector session check in %, expected 1',found,sig; END IF;
 IF NOT pg_has_role(current_user,owner_role,'USAGE') THEN EXECUTE format('SET LOCAL ROLE %I',owner_role); switched:=true; END IF;
 EXECUTE replace(definition,old_check,new_check);
 IF switched THEN RESET ROLE; END IF;
END $receipt$;
RESET ROLE;

-- 4. Assertions: no bare session_user check remains in the three bodies, every body carries the pair,
-- the default is the effective-role expression, and header properties survived the replace.
DO $assert$
DECLARE sig text; r record; default_expr text;
BEGIN
 FOREACH sig IN ARRAY ARRAY['agent_audit.begin_operation(uuid,text,text,text,text,jsonb,text)','agent_audit.capture_change()','public.attach_payment_receipt_evidence(text,text,text,timestamptz,jsonb,uuid,text)'] LOOP
  SELECT prosrc,prosecdef,proconfig,pg_get_userbyid(proowner) AS owner INTO STRICT r FROM pg_proc WHERE oid=sig::regprocedure;
  IF r.prosrc LIKE '%session_user<>%' OR r.prosrc NOT LIKE $p$%CASE WHEN current_setting('role',true) IN ('none','') THEN session_user::text ELSE current_setting('role',true) END%$p$
   OR r.prosrc NOT LIKE '%mw-integration-agent@clever-oasis-508610-n7.iam%' THEN RAISE EXCEPTION 'V95: % does not carry the role/session pair',sig; END IF;
  IF NOT r.prosecdef OR NOT ('search_path=pg_catalog'=ANY(r.proconfig)) OR (sig LIKE 'agent_audit.%' AND r.owner<>'mw_business_audit_owner') THEN RAISE EXCEPTION 'V95: % lost its definer header',sig; END IF;
 END LOOP;
 IF NOT has_function_privilege('mw_reviewer_dml','agent_audit.begin_operation(uuid,text,text,text,text,jsonb,text)','EXECUTE') THEN RAISE EXCEPTION 'V95: reviewer EXECUTE on begin_operation lost'; END IF;
 SELECT regexp_replace(pg_get_expr(d.adbin,d.adrelid),'\s+',' ','g') INTO default_expr FROM pg_attrdef d JOIN pg_attribute a ON a.attrelid=d.adrelid AND a.attnum=d.adnum
  WHERE d.adrelid='agent_audit.commits'::regclass AND a.attname='database_session_role';
 IF default_expr IS DISTINCT FROM $d$( CASE WHEN (current_setting('role'::text, true) = ANY (ARRAY['none'::text, ''::text])) THEN (SESSION_USER)::text ELSE current_setting('role'::text, true) END)::name$d$ THEN
  RAISE EXCEPTION 'V95: commits.database_session_role default is %',default_expr; END IF;
END $assert$;
