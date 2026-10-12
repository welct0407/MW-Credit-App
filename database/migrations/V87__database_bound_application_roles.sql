-- R052: exact database-bound financial command ownership. Run PROD pending
-- V78..V87 as one reviewed Flyway group; no runtime activation is performed.
DO $migration$
DECLARE signature text; definition text; old_guard text; new_guard text; owner_role text; role_name text; r record;
 manifest text[]:=ARRAY['public.pwa_command_status_v1(uuid,text,text)','public.pwa_submit_selected_charges_v1(text)','public.pwa_operation_status_v2(uuid,text,text)','public.pwa_submit_operation_v2(text)','public.guard_pwa_explicit_payment_v6()','public.pwa_native_inverse_permitted_v2(text)','public.pwa_apply_loan_create_v2(text)','public.pwa_apply_loan_source_v2(text)','public.pwa_apply_loan_close_v2(text)','public.pwa_apply_charge_v2(text)','public.pwa_apply_payment_v2(text)','public.pwa_apply_expense_v2(text)','public.pwa_apply_preference_v2(text)','public.pwa_apply_management_v2(text)','public.pwa_apply_management_financial_v2(text)','public.pwa_apply_cash_opening_v2(text)','public.pwa_apply_assessment_v2(text)','public.pwa_apply_analytics_v2(text)'];
BEGIN
 IF current_database() NOT IN('loan_manager_dev','payment_rehearsal','loan_manager_prod') THEN RAISE EXCEPTION 'Unsupported application database';END IF;
 owner_role:=CASE WHEN current_database()='loan_manager_prod' THEN 'mw_app_prod_journal_owner' ELSE 'mw_app_dev_journal_owner' END;
 FOREACH role_name IN ARRAY CASE WHEN current_database()='loan_manager_prod' THEN ARRAY['mw_app_dev','mw_app_dev_journal_owner','mw_app_prod','mw_app_prod_journal_owner'] ELSE ARRAY['mw_app_dev','mw_app_dev_journal_owner'] END LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=role_name AND NOT rolcanlogin AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication AND NOT rolbypassrls) THEN RAISE EXCEPTION 'Missing or unsafe application role';END IF;
 END LOOP;
 IF current_database()='loan_manager_prod' AND (NOT pg_has_role('mw_app_prod_journal_owner','mw_app_prod','USAGE') OR pg_has_role('mw_app_prod','mw_app_dev','MEMBER') OR pg_has_role('mw_app_prod','mw_app_dev_journal_owner','MEMBER') OR pg_has_role('mw_app_prod_journal_owner','mw_app_dev','MEMBER') OR pg_has_role('mw_app_prod_journal_owner','mw_app_dev_journal_owner','MEMBER')) THEN RAISE EXCEPTION 'Unsafe production capability membership';END IF;
 FOREACH signature IN ARRAY manifest LOOP
  SELECT pg_get_functiondef(signature::regprocedure) INTO STRICT definition;
  IF EXISTS(SELECT 1 FROM pg_proc WHERE oid=signature::regprocedure AND (prosecdef IS DISTINCT FROM (signature=ANY(manifest[1:4])) OR (signature=ANY(manifest[1:4]) AND proowner<>'mw_app_dev_journal_owner'::regrole))) THEN RAISE EXCEPTION 'Unexpected function ownership or execution mode: %',signature;END IF;
  IF signature=ANY(manifest[1:4]) THEN
   old_guard:='current_database() NOT IN (''loan_manager_dev'',''payment_rehearsal'') OR NOT pg_has_role(session_user,''mw_app_dev'',''MEMBER'')';
   IF strpos(definition,old_guard)=0 THEN old_guard:=replace(old_guard,'IN (','IN(');END IF;
   new_guard:='current_database() NOT IN (''loan_manager_dev'',''payment_rehearsal'',''loan_manager_prod'') OR NOT pg_has_role(session_user,CASE current_database() WHEN ''loan_manager_prod'' THEN ''mw_app_prod'' ELSE ''mw_app_dev'' END,''MEMBER'')';
  ELSIF signature='public.pwa_native_inverse_permitted_v2(text)' THEN
   old_guard:='current_user=''mw_app_dev_journal_owner''';
   new_guard:='current_database() IN (''loan_manager_dev'',''payment_rehearsal'',''loan_manager_prod'') AND current_user=CASE current_database() WHEN ''loan_manager_prod'' THEN ''mw_app_prod_journal_owner'' ELSE ''mw_app_dev_journal_owner'' END';
  ELSE
   old_guard:='current_user<>''mw_app_dev_journal_owner''';
   new_guard:='(current_database() NOT IN (''loan_manager_dev'',''payment_rehearsal'',''loan_manager_prod'') OR current_user<>CASE current_database() WHEN ''loan_manager_prod'' THEN ''mw_app_prod_journal_owner'' ELSE ''mw_app_dev_journal_owner'' END)';
  END IF;
  IF (length(definition)-length(replace(definition,old_guard,'')))/length(old_guard)<>1 THEN RAISE EXCEPTION 'Unexpected function guard: %',signature;END IF;
  EXECUTE replace(definition,old_guard,new_guard);
  IF current_database()='loan_manager_prod' AND signature=ANY(manifest[1:4]) THEN EXECUTE format('ALTER FUNCTION %s OWNER TO %I',signature::regprocedure,owner_role);END IF;
 END LOOP;
END $migration$;

DO $acl$
DECLARE r record; mapped text; allowed_signatures regprocedure[]:=ARRAY['public.apply_loan_close_calculation_v83(text,date,text)'::regprocedure,'public.payment_crud_finish_core_v83(public."Payments",public."Payments",text)'::regprocedure,'public.payment_crud_prepare_core_v83(public."Payments",public."Payments",text)'::regprocedure,'public.pwa_apply_analytics_v2(text)'::regprocedure,'public.pwa_apply_assessment_v2(text)'::regprocedure,'public.pwa_apply_cash_opening_v2(text)'::regprocedure,'public.pwa_apply_charge_v2(text)'::regprocedure,'public.pwa_apply_expense_v2(text)'::regprocedure,'public.pwa_apply_loan_close_v2(text)'::regprocedure,'public.pwa_apply_loan_create_v2(text)'::regprocedure,'public.pwa_apply_loan_source_v2(text)'::regprocedure,'public.pwa_apply_management_financial_v2(text)'::regprocedure,'public.pwa_apply_management_v2(text)'::regprocedure,'public.pwa_apply_payment_v2(text)'::regprocedure,'public.pwa_apply_preference_v2(text)'::regprocedure,'public.pwa_assessment_refresh_window_v2(date,date,date)'::regprocedure,'public.pwa_cash_opening_basis_v2(text)'::regprocedure,'public.pwa_command_status_v1(uuid,text,text)'::regprocedure,'public.pwa_expense_version_v2(text)'::regprocedure,'public.pwa_management_financial_text_v2(text,jsonb)'::regprocedure,'public.pwa_management_input_text_v2(text,jsonb)'::regprocedure,'public.pwa_management_tools_text_v2(text,jsonb)'::regprocedure,'public.pwa_native_inverse_permitted_v2(text)'::regprocedure,'public.pwa_operation_status_v2(uuid,text,text)'::regprocedure,'public.pwa_payment_correction_text_v2(jsonb)'::regprocedure,'public.pwa_payment_head_v2(text)'::regprocedure,'public.pwa_payment_version_v2(text)'::regprocedure,'public.pwa_preference_version_v2(text)'::regprocedure,'public.pwa_submit_operation_v2(text)'::regprocedure,'public.pwa_submit_selected_charges_v1(text)'::regprocedure];
BEGIN
 IF current_database()<>'loan_manager_prod' THEN RETURN;END IF;
 IF EXISTS(SELECT 1 FROM pg_default_acl d CROSS JOIN LATERAL aclexplode(d.defaclacl) a WHERE a.grantee IN ('mw_app_dev'::regrole,'mw_app_dev_journal_owner'::regrole)) THEN RAISE EXCEPTION 'Unexpected DEV default privileges';END IF;
 FOR r IN SELECT p.oid,p.proname,p.oid::regprocedure AS signature,a.privilege_type,a.is_grantable,pg_get_userbyid(a.grantee) AS role_name FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee IN ('mw_app_dev'::regrole,'mw_app_dev_journal_owner'::regrole) LOOP
  IF NOT r.oid=ANY(allowed_signatures) OR r.privilege_type<>'EXECUTE' OR r.is_grantable THEN RAISE EXCEPTION 'Unexpected legacy routine ACL: %',r.signature;END IF;
  mapped:=CASE r.role_name WHEN 'mw_app_dev' THEN 'mw_app_prod' ELSE 'mw_app_prod_journal_owner' END;
  EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO %I',r.signature,mapped);
  EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM %I',r.signature,r.role_name);
 END LOOP;
 FOR r IN SELECT c.oid,c.oid::regclass AS relation,n.nspname,c.relname,a.privilege_type,a.is_grantable,pg_get_userbyid(a.grantee) AS role_name FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace CROSS JOIN LATERAL aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a WHERE a.grantee IN ('mw_app_dev'::regrole,'mw_app_dev_journal_owner'::regrole) LOOP
  IF r.nspname<>'public' OR r.is_grantable OR NOT ((r.relname='pwa_payment_commands' AND r.privilege_type IN ('SELECT','INSERT')) OR (r.relname='r008_cash_account_cutover' AND r.privilege_type='INSERT' AND r.role_name='mw_app_dev_journal_owner')) THEN RAISE EXCEPTION 'Unexpected legacy relation ACL: %',r.relation;END IF;
  mapped:=CASE r.role_name WHEN 'mw_app_dev' THEN 'mw_app_prod' ELSE 'mw_app_prod_journal_owner' END;
  EXECUTE format('GRANT %s ON TABLE %s TO %I',r.privilege_type,r.relation,mapped);
  EXECUTE format('REVOKE %s ON TABLE %s FROM %I',r.privilege_type,r.relation,r.role_name);
 END LOOP;
 FOR r IN SELECT n.nspname,a.privilege_type,a.is_grantable,pg_get_userbyid(a.grantee) AS role_name FROM pg_namespace n CROSS JOIN LATERAL aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) a WHERE a.grantee IN ('mw_app_dev'::regrole,'mw_app_dev_journal_owner'::regrole) LOOP
  IF r.nspname NOT IN ('public','assessment_lab') OR r.privilege_type<>'USAGE' OR r.is_grantable THEN RAISE EXCEPTION 'Unexpected legacy schema ACL';END IF;
  mapped:=CASE r.role_name WHEN 'mw_app_dev' THEN 'mw_app_prod' ELSE 'mw_app_prod_journal_owner' END;
  EXECUTE format('GRANT USAGE ON SCHEMA %I TO %I',r.nspname,mapped);
  EXECUTE format('REVOKE USAGE ON SCHEMA %I FROM %I',r.nspname,r.role_name);
 END LOOP;
 IF EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace AND proowner IN ('mw_app_dev'::regrole,'mw_app_dev_journal_owner'::regrole)) THEN RAISE EXCEPTION 'Residual DEV routine owner';END IF;
 IF EXISTS(SELECT 1 FROM pg_class WHERE relnamespace='public'::regnamespace AND relowner IN ('mw_app_dev'::regrole,'mw_app_dev_journal_owner'::regrole)) THEN RAISE EXCEPTION 'Residual DEV relation owner';END IF;
END $acl$;
