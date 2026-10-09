-- R052 Phase 6. Closed management commands over existing source tables; no schema fields added.
CREATE FUNCTION public.pwa_management_input_text_v2(op text,i jsonb) RETURNS text
LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE keys text[];k text;result text:='{';
BEGIN
 IF op NOT IN('cash-holder.create','cash-holder.update','cash-holder.delete','cash-account.create','cash-account.update','cash-account.delete','partner.create','partner.update','partner.delete') OR jsonb_typeof(i) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION USING ERRCODE='22023';END IF;
 IF split_part(op,'.',2)='delete' THEN IF i<>'{}'::jsonb THEN RAISE EXCEPTION USING ERRCODE='22023';END IF;RETURN '{}';END IF;
 IF split_part(op,'.',1)='cash-holder' THEN keys:=ARRAY['holderName','active','sortOrder'];
 ELSIF split_part(op,'.',1)='cash-account' THEN keys:=ARRAY['cashHolderId','accountLabel','bankName','accountNumber','alternativeAccountNumber','defaultAccount','active','sortOrder'];
 IF op='cash-account.update' THEN keys:=array_remove(keys,'cashHolderId');END IF;
 ELSIF split_part(op,'.',1)='partner' THEN keys:=ARRAY['partnerName','partnerRole','loginEmail','email','instagramUsername','languagePreference','igIntegrationEnabled','aiReviewer'];
 END IF;
 IF (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(i) key) IS DISTINCT FROM (SELECT array_agg(key ORDER BY key) FROM unnest(keys) key) THEN RAISE EXCEPTION USING ERRCODE='22023';END IF;
 FOREACH k IN ARRAY keys LOOP
  IF k IN('active','defaultAccount','aiReviewer') THEN IF jsonb_typeof(i->k) IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION USING ERRCODE='22023';END IF;
  ELSIF k='igIntegrationEnabled' THEN IF jsonb_typeof(i->k) NOT IN('boolean','null') THEN RAISE EXCEPTION USING ERRCODE='22023';END IF;
  ELSIF k='sortOrder' THEN IF jsonb_typeof(i->k) IS DISTINCT FROM 'number' OR i->>k!~'^-?(0|[1-9][0-9]*)$' OR (i->>k)::numeric NOT BETWEEN -2147483648 AND 2147483647 THEN RAISE EXCEPTION USING ERRCODE='22023';END IF;
  ELSE IF jsonb_typeof(i->k) NOT IN('string','null') OR octet_length(i->>k)>65536 THEN RAISE EXCEPTION USING ERRCODE='22023';END IF;END IF;
  IF k IN('holderName','accountLabel','bankName','partnerName','partnerRole') AND (jsonb_typeof(i->k) IS DISTINCT FROM 'string' OR btrim(i->>k)='') THEN RAISE EXCEPTION USING ERRCODE='22023';END IF;
  IF k='cashHolderId' AND (jsonb_typeof(i->k) IS DISTINCT FROM 'string' OR octet_length(i->>k) NOT BETWEEN 1 AND 256 OR i->>k~'[[:cntrl:]]') THEN RAISE EXCEPTION USING ERRCODE='22023';END IF;
  IF k='partnerRole' AND i->>k NOT IN('A','B') THEN RAISE EXCEPTION USING ERRCODE='22023';END IF;
  IF k='languagePreference' AND i->k<>'null'::jsonb AND i->>k NOT IN('English','ไทย') THEN RAISE EXCEPTION USING ERRCODE='22023';END IF;
  IF k='loginEmail' AND i->k<>'null'::jsonb AND (btrim(i->>k)='' OR octet_length(i->>k)>320 OR i->>k~'[\r\n]') THEN RAISE EXCEPTION USING ERRCODE='22023';END IF;
  IF k='email' AND nullif(btrim(i->>k),'') IS NOT NULL AND lower(btrim(i->>k))<>'welct0407@mw-credit.com' THEN RAISE EXCEPTION USING ERRCODE='22023';END IF;
  result:=result||CASE WHEN result='{' THEN '' ELSE ',' END||to_json(k)::text||':'||CASE WHEN i->k='null'::jsonb THEN 'null' WHEN k IN('active','defaultAccount','aiReviewer','igIntegrationEnabled','sortOrder') THEN (i->k)::text ELSE to_json(i->>k)::text END;
 END LOOP;RETURN result||'}';
END $$;
REVOKE ALL ON FUNCTION public.pwa_management_input_text_v2(text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pwa_management_input_text_v2(text,jsonb) TO mw_app_dev_journal_owner;

CREATE FUNCTION public.pwa_apply_management_v2(payload text) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE e jsonb:=payload::jsonb;c jsonb:=e->'command';i jsonb:=c->'inputs';op text:=c->>'operation';kind text:=split_part(op,'.',1);target text:=c->>'targetId';snapshot jsonb;version text;constraint_name text;
BEGIN
 IF current_user<>'mw_app_dev_journal_owner' THEN RAISE EXCEPTION USING ERRCODE='42501';END IF;
 PERFORM public.pwa_management_input_text_v2(op,i);
 PERFORM pg_advisory_xact_lock(hashtextextended('management:'||kind||':'||target,0));
 IF kind='cash-holder' THEN SELECT to_jsonb(t) INTO snapshot FROM public."Cash Holders" t WHERE t."Row ID"=target FOR UPDATE;
 ELSIF kind='cash-account' THEN SELECT to_jsonb(t) INTO snapshot FROM public."Cash Accounts" t WHERE t."Row ID"=target FOR UPDATE;
 ELSIF kind='partner' THEN SELECT to_jsonb(t) INTO snapshot FROM public."Partners" t WHERE t."Row ID"=target FOR UPDATE;
 ELSE RAISE EXCEPTION USING ERRCODE='22023';END IF;
 version:=encode(sha256(convert_to(snapshot::text,'UTF8')),'hex');
 IF split_part(op,'.',2)='create' THEN IF snapshot IS NOT NULL THEN RAISE EXCEPTION USING ERRCODE='P5B01';END IF;
 ELSE IF snapshot IS NULL THEN RAISE EXCEPTION USING ERRCODE='P5B02';END IF;IF version IS DISTINCT FROM c->>'expectedVersion' THEN RAISE EXCEPTION USING ERRCODE='P5B01';END IF;END IF;
 IF kind='partner' AND split_part(op,'.',2)<>'delete' THEN
 IF split_part(op,'.',2)='create' THEN
 IF coalesce((i->>'igIntegrationEnabled')::boolean,false) OR (i->>'aiReviewer')::boolean THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Integration permissions are read-only';END IF;
 ELSE IF (i->'igIntegrationEnabled',i->'aiReviewer') IS DISTINCT FROM (snapshot->'IG Integration Enabled',snapshot->'AI Reviewer') THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Integration permissions are read-only';END IF;END IF;
 END IF;
 BEGIN
 IF op='cash-holder.create' THEN INSERT INTO public."Cash Holders"("Row ID","Holder Name","Active","Sort Order") VALUES(target,i->>'holderName',(i->>'active')::boolean,(i->>'sortOrder')::integer);
 ELSIF op='cash-holder.update' THEN UPDATE public."Cash Holders" SET "Holder Name"=i->>'holderName',"Active"=(i->>'active')::boolean,"Sort Order"=(i->>'sortOrder')::integer WHERE "Row ID"=target;
 ELSIF op='cash-holder.delete' THEN DELETE FROM public."Cash Holders" WHERE "Row ID"=target;
 ELSIF op='cash-account.create' THEN INSERT INTO public."Cash Accounts"("Row ID","Ref Cash Holder","Account Label","Bank Name","Account Number","Alternative Account Number","Default Account","Active","Sort Order") VALUES(target,i->>'cashHolderId',i->>'accountLabel',i->>'bankName',i->>'accountNumber',i->>'alternativeAccountNumber',(i->>'defaultAccount')::boolean,(i->>'active')::boolean,(i->>'sortOrder')::integer);
 ELSIF op='cash-account.update' THEN UPDATE public."Cash Accounts" SET "Account Label"=i->>'accountLabel',"Bank Name"=i->>'bankName',"Account Number"=i->>'accountNumber',"Alternative Account Number"=i->>'alternativeAccountNumber',"Default Account"=(i->>'defaultAccount')::boolean,"Active"=(i->>'active')::boolean,"Sort Order"=(i->>'sortOrder')::integer WHERE "Row ID"=target;
 ELSIF op='cash-account.delete' THEN DELETE FROM public."Cash Accounts" WHERE "Row ID"=target;
 ELSIF op='partner.create' THEN INSERT INTO public."Partners"("Row ID","Partner Name","Partner Role","Login Email","Email","Instagram Username","Language Preference","IG Integration Enabled","AI Reviewer") VALUES(target,i->>'partnerName',i->>'partnerRole',i->>'loginEmail',i->>'email',i->>'instagramUsername',i->>'languagePreference',(i->>'igIntegrationEnabled')::boolean,(i->>'aiReviewer')::boolean);
 ELSIF op='partner.update' THEN UPDATE public."Partners" SET "Partner Name"=i->>'partnerName',"Partner Role"=i->>'partnerRole',"Login Email"=i->>'loginEmail',"Email"=i->>'email',"Instagram Username"=i->>'instagramUsername',"Language Preference"=i->>'languagePreference',"IG Integration Enabled"=(i->>'igIntegrationEnabled')::boolean,"AI Reviewer"=(i->>'aiReviewer')::boolean WHERE "Row ID"=target;
 ELSIF op='partner.delete' THEN DELETE FROM public."Partners" WHERE "Row ID"=target;
 END IF;
 EXCEPTION WHEN foreign_key_violation THEN RAISE EXCEPTION USING ERRCODE='P5B05';
 WHEN SQLSTATE '23001' THEN GET STACKED DIAGNOSTICS constraint_name=CONSTRAINT_NAME;IF (op='cash-holder.delete' AND constraint_name='Cash Accounts_Ref Cash Holder_fkey') OR (op='cash-account.delete' AND constraint_name IN('Borrowers_Ref Preferred Receiving Cash Account_fkey','Borrowers_Payment Request Cash Account_fkey','Charges_Payment Request Cash Account_fkey','Loans_Ref Disbursed From Cash Account_fkey','Loans_Payment Request Cash Account_fkey','Payments_Ref Received By Cash Account_fkey','Business Expenses_Ref Paid By Cash Account_fkey','Settlements_Ref Paid From Cash Account_fkey','Cash Ledger_Ref From Cash Account_fkey','Cash Ledger_Ref To Cash Account_fkey','r008_cash_account_cutover_Ref Cash Account_fkey')) THEN RAISE EXCEPTION USING ERRCODE='P5B05';ELSE RAISE;END IF;
 WHEN unique_violation THEN GET STACKED DIAGNOSTICS constraint_name=CONSTRAINT_NAME;
 IF constraint_name IN('partners_login_email_unique','Cash Holders_Holder Name_key','Cash Accounts_Ref Cash Holder_Account Label_key','cash_account_one_default') THEN RAISE EXCEPTION USING ERRCODE='P5B05';ELSE RAISE;END IF;
 WHEN raise_exception THEN
 IF SQLERRM IN('Choose a replacement default account before deletion','An inactive cash account cannot be default','Select a replacement default before deactivating this account') THEN RAISE EXCEPTION USING ERRCODE='P5B05';ELSE RAISE;END IF;
 END;
 RETURN jsonb_build_object('operation',op,'targetType',kind,'targetId',target,'paymentId',NULL,'plan',NULL,'predecessorRequestId',NULL,'sourceCreatedBy',NULL);
END $$;
REVOKE ALL ON FUNCTION public.pwa_apply_management_v2(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pwa_apply_management_v2(text) TO mw_app_dev_journal_owner;

DO $migration$ DECLARE definition text;old_text text:=$old$'expense.delete','preference.update')$old$;BEGIN
 SELECT pg_get_functiondef('public.pwa_submit_operation_v2(text)'::regprocedure) INTO definition;
 IF (length(definition)-length(replace(definition,old_text,'')))/length(old_text)<>1 THEN RAISE EXCEPTION 'Unexpected management routine boundary';END IF;
 EXECUTE replace(definition,old_text,$new$'expense.delete','preference.update','cash-holder.create','cash-holder.update','cash-holder.delete','cash-account.create','cash-account.update','cash-account.delete','partner.create','partner.update','partner.delete')$new$);
END $migration$;

DO $migration$ DECLARE definition text;old_text text:=$old$IF op IN('borrower.create','loan.create','charge.create','expense.create') THEN$old$;BEGIN
 SELECT pg_get_functiondef('public.pwa_submit_operation_v2(text)'::regprocedure) INTO definition;
 IF (length(definition)-length(replace(definition,old_text,'')))/length(old_text)<>1 THEN RAISE EXCEPTION 'Unexpected management routine boundary';END IF;
 EXECUTE replace(definition,old_text,$new$IF op IN('borrower.create','loan.create','charge.create','expense.create','cash-holder.create','cash-account.create','partner.create') THEN$new$);
END $migration$;

DO $migration$ DECLARE definition text;old_text text:=$old$IF op='preference.update' THEN
 IF (SELECT array_agg$old$;BEGIN
 SELECT pg_get_functiondef('public.pwa_submit_operation_v2(text)'::regprocedure) INTO definition;
 IF (length(definition)-length(replace(definition,old_text,'')))/length(old_text)<>1 THEN RAISE EXCEPTION 'Unexpected management routine boundary';END IF;
 EXECUTE replace(definition,old_text,$new$IF split_part(op,'.',1) IN('cash-holder','cash-account','partner') THEN input_text:=public.pwa_management_input_text_v2(op,i);
 ELSIF op='preference.update' THEN
 IF (SELECT array_agg$new$);
END $migration$;

DO $migration$ DECLARE definition text;old_text text:=$old$IF op='preference.update' THEN result_value:=$old$;BEGIN
 SELECT pg_get_functiondef('public.pwa_submit_operation_v2(text)'::regprocedure) INTO definition;
 IF (length(definition)-length(replace(definition,old_text,'')))/length(old_text)<>1 THEN RAISE EXCEPTION 'Unexpected management routine boundary';END IF;
 EXECUTE replace(definition,old_text,$new$IF split_part(op,'.',1) IN('cash-holder','cash-account','partner') THEN result_value:=public.pwa_apply_management_v2($1);ELSIF op='preference.update' THEN result_value:=$new$);
END $migration$;

DO $migration$ DECLARE definition text;old_text text:=$old$ RETURN public.pwa_operation_status_v2(request,a->>'issuer',a->>'subject');
END$old$;BEGIN
 SELECT pg_get_functiondef('public.pwa_submit_operation_v2(text)'::regprocedure) INTO definition;
 IF (length(definition)-length(replace(definition,old_text,'')))/length(old_text)<>1 THEN RAISE EXCEPTION 'Unexpected management routine boundary';END IF;
 EXECUTE replace(definition,old_text,$new$ SELECT * INTO old FROM public.pwa_payment_commands p WHERE p.request_id=request;
 RETURN jsonb_build_object('kind','recorded','originalOutcome',jsonb_build_object('status',old.outcome,'code',old.rejection_code,'result',old.result_json,'recordedAt',to_char(old.recorded_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')));
END$new$);
END $migration$;

-- Appended to unpublished V85 after the first-family verification boundary.
CREATE FUNCTION public.pwa_management_financial_text_v2(op text,i jsonb) RETURNS text
LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE keys text[];k text;result text:='{';kind text:=split_part(op,'.',1);action text:=split_part(op,'.',2);
BEGIN
 IF op NOT IN('capital-contribution.create','capital-contribution.update','capital-contribution.delete','settlement.create','settlement.update','settlement.complete','settlement.reverse','settlement.cancel','settlement.settle-all','cash-movement.create','cash-movement.update','cash-movement.delete') OR jsonb_typeof(i) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION USING ERRCODE='22023';END IF;
 IF action IN('delete','reverse','cancel') THEN IF i<>'{}'::jsonb THEN RAISE EXCEPTION USING ERRCODE='22023';END IF;RETURN '{}';END IF;
 IF action='complete' THEN keys:=ARRAY['cashAccountId'];ELSIF action='settle-all' THEN keys:=ARRAY['partnerId','reviewedAmount','notes'];
 ELSIF kind='capital-contribution' THEN keys:=ARRAY['partnerId','contributionDate','transactionType','amount','notes'];
 ELSIF kind='settlement' THEN keys:=ARRAY['settlementDate','partnerId','amount','status','transferDate','notes','cashAccountId'];
 ELSE keys:=ARRAY['movementDate','movementType','amount','fromAccountId','toAccountId','businessExpenseId','notes'];END IF;
 IF (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(i) key) IS DISTINCT FROM (SELECT array_agg(key ORDER BY key) FROM unnest(keys) key) THEN RAISE EXCEPTION USING ERRCODE='22023';END IF;
 FOREACH k IN ARRAY keys LOOP
 IF jsonb_typeof(i->k) NOT IN('string','null') OR octet_length(i->>k)>65536 THEN RAISE EXCEPTION USING ERRCODE='22023';END IF;
 IF k LIKE '%Id' AND i->k<>'null'::jsonb AND (octet_length(i->>k) NOT BETWEEN 1 AND 256 OR i->>k~'[[:cntrl:]]') THEN RAISE EXCEPTION USING ERRCODE='22023';END IF;
 IF k='partnerId' AND i->k='null'::jsonb THEN RAISE EXCEPTION USING ERRCODE='22023';END IF;
 IF k LIKE '%Date' AND NOT(k='transferDate' AND i->k='null'::jsonb) AND (jsonb_typeof(i->k) IS DISTINCT FROM 'string' OR i->>k!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' OR ((i->>k)::date)::text<>i->>k) THEN RAISE EXCEPTION USING ERRCODE='22023';END IF;
 IF k IN('amount','reviewedAmount') AND (jsonb_typeof(i->k) IS DISTINCT FROM 'string' OR i->>k!~'^(0|[1-9][0-9]*)(\.[0-9]{1,2})?$' OR (i->>k)::numeric<=0 OR (i->>k)::numeric>92233720368547758.07) THEN RAISE EXCEPTION USING ERRCODE='22023';END IF;
 IF kind='cash-movement' AND k='amount' AND i->>k!~'^[1-9][0-9]*$' THEN RAISE EXCEPTION USING ERRCODE='22023';END IF;
 IF k='transactionType' AND i->>k NOT IN('Contribution','Withdrawal') OR k='movementType' AND i->>k NOT IN('Cash Handover','Expense Reimbursement') OR k='status' AND i->>k NOT IN('Pending','Completed','Cancelled') THEN RAISE EXCEPTION USING ERRCODE='22023';END IF;
 IF k IN('transactionType','movementType','status') AND i->k='null'::jsonb THEN RAISE EXCEPTION USING ERRCODE='22023';END IF;
 result:=result||CASE WHEN result='{' THEN '' ELSE ',' END||to_json(k)::text||':'||coalesce(to_json(i->>k)::text,'null');END LOOP;RETURN result||'}';
END $$;
REVOKE ALL ON FUNCTION public.pwa_management_financial_text_v2(text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pwa_management_financial_text_v2(text,jsonb) TO mw_app_dev_journal_owner;

CREATE FUNCTION public.pwa_apply_management_financial_v2(payload text) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE e jsonb:=payload::jsonb;c jsonb:=e->'command';i jsonb:=c->'inputs';op text:=c->>'operation';kind text:=split_part(op,'.',1);action text:=split_part(op,'.',2);target text:=c->>'targetId';snapshot jsonb;version text;available numeric;account_id text;from_holder text;to_holder text;day date:=(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date;message text;
BEGIN
 IF current_user<>'mw_app_dev_journal_owner' THEN RAISE EXCEPTION USING ERRCODE='42501';END IF;
 PERFORM public.pwa_management_financial_text_v2(op,i);
 IF kind IN('capital-contribution','settlement') AND NOT pg_try_advisory_xact_lock(9152026,15) THEN RAISE EXCEPTION 'Partner allocation is busy; sync and retry';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('management:'||kind||':'||target,0));
 IF kind='capital-contribution' THEN SELECT to_jsonb(s) INTO snapshot FROM public."Cash Pool Contributions" s WHERE "Row ID"=target FOR UPDATE;
 ELSIF kind='settlement' THEN SELECT to_jsonb(s) INTO snapshot FROM public."Settlements" s WHERE "Row ID"=target FOR UPDATE;
 ELSE SELECT to_jsonb(s) INTO snapshot FROM public."Cash Ledger" s WHERE "Row ID"=target FOR UPDATE;END IF;
 version:=encode(sha256(convert_to(snapshot::text,'UTF8')),'hex');
 IF action IN('create','settle-all') THEN IF snapshot IS NOT NULL THEN RAISE EXCEPTION USING ERRCODE='P5B01';END IF;
 ELSE IF snapshot IS NULL THEN RAISE EXCEPTION USING ERRCODE='P5B02';END IF;IF version IS DISTINCT FROM c->>'expectedVersion' THEN RAISE EXCEPTION USING ERRCODE='P5B01';END IF;END IF;
 IF kind='settlement' AND ((action='complete' AND snapshot->>'Status' IS DISTINCT FROM 'Pending') OR (action='reverse' AND snapshot->>'Status' IS DISTINCT FROM 'Completed') OR (action='cancel' AND coalesce(snapshot->>'Status','') NOT IN('Pending','Completed'))) THEN RAISE EXCEPTION USING ERRCODE='P5B01';END IF;
 IF kind='settlement' AND ((action IN('create','update') AND i->>'status'='Cancelled') OR (action='update' AND snapshot->>'Status'='Cancelled')) THEN RAISE EXCEPTION USING ERRCODE='P5B01';END IF;
 IF kind='cash-movement' AND snapshot IS NOT NULL AND (snapshot->>'Entry Origin'<>'Manual' OR snapshot->>'Movement Type' NOT IN('Cash Handover','Expense Reimbursement')) THEN RAISE EXCEPTION USING ERRCODE='P5B05';END IF;
 IF i ? 'partnerId' AND NOT EXISTS(SELECT 1 FROM public."Partners" WHERE "Row ID"=i->>'partnerId') THEN RAISE EXCEPTION USING ERRCODE='P5B04';END IF;
 IF kind='capital-contribution' AND action<>'delete' AND i->>'transactionType'='Withdrawal' THEN
 SELECT coalesce(sum(CASE WHEN "Transaction Type"='Contribution' THEN "Amount"::numeric ELSE -"Amount"::numeric END),0) INTO available FROM public."Cash Pool Contributions" WHERE "Ref Partner"=i->>'partnerId' AND "Contribution Date"<=(i->>'contributionDate')::date AND "Row ID"<>target;
 IF (i->>'amount')::numeric>available THEN RAISE EXCEPTION USING ERRCODE='P5B10';END IF;END IF;
 BEGIN
 IF kind='capital-contribution' THEN
 IF action='create' THEN INSERT INTO public."Cash Pool Contributions"("Row ID","Ref Partner","Contribution Date","Transaction Type","Amount","Notes") VALUES(target,i->>'partnerId',(i->>'contributionDate')::date,i->>'transactionType',(i->>'amount')::numeric::money,i->>'notes');
 ELSIF action='update' THEN UPDATE public."Cash Pool Contributions" SET "Ref Partner"=i->>'partnerId',"Contribution Date"=(i->>'contributionDate')::date,"Transaction Type"=i->>'transactionType',"Amount"=(i->>'amount')::numeric::money,"Notes"=i->>'notes' WHERE "Row ID"=target;
 ELSE DELETE FROM public."Cash Pool Contributions" WHERE "Row ID"=target;END IF;
 ELSIF kind='settlement' THEN
 IF action='settle-all' THEN
 PERFORM public.recalculate_business_expenses_from_date('0001-01-01');
 SELECT public.partner_net_profit(i->>'partnerId')-coalesce(sum("Amount"::numeric),0) INTO available FROM public."Settlements" WHERE "Ref Partner"=i->>'partnerId' AND "Status" IS DISTINCT FROM 'Cancelled';
 IF available IS DISTINCT FROM (i->>'reviewedAmount')::numeric THEN RAISE EXCEPTION USING ERRCODE='P5B09';END IF;
 IF available<=0 THEN RAISE EXCEPTION USING ERRCODE='P5B10';END IF;
 INSERT INTO public."Settlements"("Row ID","Settlement Date","Ref Partner","Amount","Status","Notes") VALUES(target,day,i->>'partnerId',available::money,'Pending',i->>'notes');
 ELSIF action IN('create','update') THEN
 IF i->>'status'='Completed' AND i->>'transferDate' IS NULL THEN RAISE EXCEPTION USING ERRCODE='P5B08';END IF;
 IF i->>'status'='Completed' AND (i->>'amount')::numeric<>trunc((i->>'amount')::numeric) THEN RAISE EXCEPTION USING ERRCODE='P5B06';END IF;
 IF action='create' THEN INSERT INTO public."Settlements"("Row ID","Settlement Date","Ref Partner","Amount","Status","Transfer Date","Notes","Ref Paid From Cash Account") VALUES(target,(i->>'settlementDate')::date,i->>'partnerId',(i->>'amount')::numeric::money,i->>'status',(i->>'transferDate')::date,i->>'notes',i->>'cashAccountId');
 ELSE UPDATE public."Settlements" SET "Settlement Date"=(i->>'settlementDate')::date,"Ref Partner"=i->>'partnerId',"Amount"=(i->>'amount')::numeric::money,"Status"=i->>'status',"Transfer Date"=(i->>'transferDate')::date,"Notes"=i->>'notes',"Ref Paid From Cash Account"=i->>'cashAccountId' WHERE "Row ID"=target;END IF;
 ELSIF action='complete' THEN
 IF (snapshot->>'Amount')::money::numeric<>trunc((snapshot->>'Amount')::money::numeric) THEN RAISE EXCEPTION USING ERRCODE='P5B06';END IF;
 account_id:=coalesce(i->>'cashAccountId',snapshot->>'Ref Paid From Cash Account');
 IF NOT EXISTS(SELECT 1 FROM public."Cash Accounts" a JOIN public."Cash Holders" h ON h."Row ID"=a."Ref Cash Holder" WHERE a."Row ID"=account_id AND a."Active" AND h."Active" AND h."Row ID"='ch:lisa') THEN
 IF i->>'cashAccountId' IS NOT NULL THEN RAISE EXCEPTION USING ERRCODE='P5B07';END IF;
 SELECT CASE WHEN count(*)=1 THEN min(a."Row ID") END INTO account_id FROM public."Cash Accounts" a JOIN public."Cash Holders" h ON h."Row ID"=a."Ref Cash Holder" WHERE a."Active" AND a."Default Account" AND h."Active" AND h."Row ID"='ch:lisa';
 END IF;
 IF account_id IS NULL THEN RAISE EXCEPTION USING ERRCODE='P5B07';END IF;
 PERFORM public.cash_account_holder(account_id,true);
 UPDATE public."Settlements" SET "Status"='Completed',"Transfer Date"=day,"Ref Paid From Cash Account"=account_id WHERE "Row ID"=target;
 ELSIF action='reverse' THEN UPDATE public."Settlements" SET "Status"='Pending',"Transfer Date"=NULL WHERE "Row ID"=target;
 ELSE UPDATE public."Settlements" SET "Status"='Cancelled',"Notes"=concat_ws(E'\n',nullif("Notes",''),'Cancelled by '||(e#>>'{actor,partnerId}')||' at '||(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::text) WHERE "Row ID"=target;END IF;
 ELSE
 IF action='delete' THEN DELETE FROM public."Cash Ledger" WHERE "Row ID"=target;
 ELSE
 from_holder:=public.cash_account_holder(i->>'fromAccountId',true);to_holder:=public.cash_account_holder(i->>'toAccountId',true);
 IF action='create' THEN INSERT INTO public."Cash Ledger"("Row ID","Movement Date","Movement Type","Amount","Ref From Cash Holder","Ref To Cash Holder","Ref From Cash Account","Ref To Cash Account","Ref Business Expense","Entry Origin","Source Type","Source Key","Notes","Created By") VALUES(target,(i->>'movementDate')::date,i->>'movementType',(i->>'amount')::numeric,from_holder,to_holder,i->>'fromAccountId',i->>'toAccountId',i->>'businessExpenseId','Manual','Manual','MANUAL:'||target,i->>'notes',e#>>'{actor,loginEmail}');
 ELSE UPDATE public."Cash Ledger" SET "Movement Date"=(i->>'movementDate')::date,"Movement Type"=i->>'movementType',"Amount"=(i->>'amount')::numeric,"Ref From Cash Holder"=from_holder,"Ref To Cash Holder"=to_holder,"Ref From Cash Account"=i->>'fromAccountId',"Ref To Cash Account"=i->>'toAccountId',"Ref Business Expense"=i->>'businessExpenseId',"Notes"=i->>'notes' WHERE "Row ID"=target;END IF;END IF;
 END IF;
 EXCEPTION WHEN foreign_key_violation THEN RAISE EXCEPTION USING ERRCODE='P5B05';
 WHEN raise_exception THEN GET STACKED DIAGNOSTICS message=MESSAGE_TEXT;
 IF message='Settlement exceeds net available to settle' THEN RAISE EXCEPTION USING ERRCODE='P5B10';
 ELSIF message IN('A valid active cash account is required','A cash account is required for this new cash movement') THEN RAISE EXCEPTION USING ERRCODE='P5B07';
 ELSIF message IN('Cash handover requires Dad/Lisa endpoints or two distinct accounts of one holder','Only reimbursement may link a business expense','Expense reimbursement must be Lisa to Tommy','Linked reimbursement expense must have been paid by Tommy','Manual transfers require active cash holders','Cash holder and account disagree') THEN RAISE EXCEPTION USING ERRCODE='P5B04';
 ELSE RAISE;END IF;
 END;
 RETURN jsonb_build_object('operation',op,'targetType',kind,'targetId',target,'paymentId',NULL,'plan',NULL,'predecessorRequestId',NULL,'sourceCreatedBy',NULL);
END $$;
REVOKE ALL ON FUNCTION public.pwa_apply_management_financial_v2(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pwa_apply_management_financial_v2(text) TO mw_app_dev_journal_owner;

DO $migration$ DECLARE definition text;old_text text:=$old$'partner.delete') THEN RAISE EXCEPTION 'target'$old$;BEGIN
 SELECT pg_get_functiondef('public.pwa_submit_operation_v2(text)'::regprocedure) INTO definition;
 IF (length(definition)-length(replace(definition,old_text,'')))/length(old_text)<>1 THEN RAISE EXCEPTION 'Unexpected management financial boundary';END IF;
 EXECUTE replace(definition,old_text,$new$'partner.delete','capital-contribution.create','capital-contribution.update','capital-contribution.delete','settlement.create','settlement.update','settlement.complete','settlement.reverse','settlement.cancel','settlement.settle-all','cash-movement.create','cash-movement.update','cash-movement.delete') THEN RAISE EXCEPTION 'target'$new$);
END $migration$;

DO $migration$ DECLARE definition text;old_text text:=$old$'cash-account.create','partner.create') THEN$old$;BEGIN
 SELECT pg_get_functiondef('public.pwa_submit_operation_v2(text)'::regprocedure) INTO definition;
 IF (length(definition)-length(replace(definition,old_text,'')))/length(old_text)<>1 THEN RAISE EXCEPTION 'Unexpected management financial boundary';END IF;
 EXECUTE replace(definition,old_text,$new$'cash-account.create','partner.create','capital-contribution.create','settlement.create','settlement.settle-all','cash-movement.create') THEN$new$);
END $migration$;

DO $migration$ DECLARE definition text;old_text text:=$old$IF split_part(op,'.',1) IN('cash-holder','cash-account','partner') THEN input_text:=$old$;BEGIN
 SELECT pg_get_functiondef('public.pwa_submit_operation_v2(text)'::regprocedure) INTO definition;
 IF (length(definition)-length(replace(definition,old_text,'')))/length(old_text)<>1 THEN RAISE EXCEPTION 'Unexpected management financial boundary';END IF;
 EXECUTE replace(definition,old_text,$new$IF split_part(op,'.',1) IN('capital-contribution','settlement','cash-movement') THEN input_text:=public.pwa_management_financial_text_v2(op,i);ELSIF split_part(op,'.',1) IN('cash-holder','cash-account','partner') THEN input_text:=$new$);
END $migration$;

DO $migration$ DECLARE definition text;old_text text:=$old$IF split_part(op,'.',1) IN('cash-holder','cash-account','partner') THEN result_value:=$old$;BEGIN
 SELECT pg_get_functiondef('public.pwa_submit_operation_v2(text)'::regprocedure) INTO definition;
 IF (length(definition)-length(replace(definition,old_text,'')))/length(old_text)<>1 THEN RAISE EXCEPTION 'Unexpected management financial boundary';END IF;
 EXECUTE replace(definition,old_text,$new$IF split_part(op,'.',1) IN('capital-contribution','settlement','cash-movement') THEN result_value:=public.pwa_apply_management_financial_v2($1);ELSIF split_part(op,'.',1) IN('cash-holder','cash-account','partner') THEN result_value:=$new$);
END $migration$;

DO $migration$ DECLARE definition text;old_text text:=$old$WHEN SQLSTATE 'P5B09' THEN rejection:='plan_changed';END;$old$;BEGIN
 SELECT pg_get_functiondef('public.pwa_submit_operation_v2(text)'::regprocedure) INTO definition;
 IF (length(definition)-length(replace(definition,old_text,'')))/length(old_text)<>1 THEN RAISE EXCEPTION 'Unexpected management financial boundary';END IF;
 EXECUTE replace(definition,old_text,$new$WHEN SQLSTATE 'P5B09' THEN rejection:='plan_changed';WHEN SQLSTATE 'P5B10' THEN rejection:='insufficient_funds';END;$new$);
END $migration$;

-- Draft fragment; append to unpublished V85 only after the active financial proof releases it.
-- The authenticated journal owner is NOLOGIN; ordinary runtime remains SELECT-only here.
GRANT INSERT ON public.r008_cash_account_cutover TO mw_app_dev_journal_owner;

CREATE FUNCTION public.pwa_cash_opening_basis_v2(p_holder text) RETURNS jsonb
LANGUAGE sql STABLE SET search_path=pg_catalog,public AS $$
 SELECT jsonb_build_object('holderId',h."Row ID",'holderLabel',h."Holder Name",
 'sourceVersion',encode(sha256(convert_to(to_jsonb(h)::text,'UTF8')),'hex'),
 'holderBalance',b."Current Balance"::text,
 'accounts',coalesce((SELECT jsonb_agg(jsonb_build_object('accountId',a."Ref Cash Account",
 'label',a."Account Label",'initialized',a."Initialized",'balance',a."Current Balance"::text)
 ORDER BY a."Ref Cash Account" COLLATE "C") FROM public."Cash Account Balances" a
 WHERE a."Ref Cash Holder"=h."Row ID"),'[]'::jsonb))
 FROM public."Cash Holders" h JOIN public."Cash Holder Balances" b ON b."Ref Cash Holder"=h."Row ID"
 WHERE h."Row ID"=p_holder
$$;
REVOKE ALL ON FUNCTION public.pwa_cash_opening_basis_v2(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pwa_cash_opening_basis_v2(text) TO mw_app_dev,mw_app_dev_journal_owner;

CREATE FUNCTION public.pwa_apply_cash_opening_v2(payload text) RETURNS jsonb
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE e jsonb:=payload::jsonb;c jsonb:=e->'command';i jsonb:=c->'inputs';target text:=c->>'targetId';basis jsonb;allocation jsonb;message text;
BEGIN
 IF current_user<>'mw_app_dev_journal_owner' OR c->>'operation'<>'cash-openings.initialize' THEN RAISE EXCEPTION USING ERRCODE='42501';END IF;
 -- Exact native lock set and order before comparing the reviewed basis or touching openings.
 LOCK TABLE public."Payments",public."Loans",public."Business Expenses",public."Settlements",public."Cash Ledger",public."Cash Accounts" IN SHARE ROW EXCLUSIVE MODE;
 PERFORM 1 FROM public."Cash Holders" WHERE "Row ID"=target FOR UPDATE;
 basis:=public.pwa_cash_opening_basis_v2(target);
 IF basis IS NULL THEN RAISE EXCEPTION USING ERRCODE='P5B02';END IF;
 IF basis->>'sourceVersion' IS DISTINCT FROM c->>'expectedVersion' THEN RAISE EXCEPTION USING ERRCODE='P5B01';END IF;
 IF encode(sha256(convert_to(basis::text,'UTF8')),'hex') IS DISTINCT FROM i->>'reviewedBasisHash' THEN RAISE EXCEPTION USING ERRCODE='P5B09';END IF;
 SELECT jsonb_object_agg(x->>'accountId',x->>'amount') INTO allocation FROM jsonb_array_elements(i->'openings') x;
 BEGIN
 PERFORM public.initialize_cash_accounts(target,allocation,e#>>'{actor,loginEmail}',i->>'notes');
 EXCEPTION WHEN raise_exception THEN GET STACKED DIAGNOSTICS message=MESSAGE_TEXT;
 IF message IN('Cash account has already been initialized','Opening allocation must include exactly all uninitialized accounts of this holder','Account openings must sum exactly to the current holder balance') THEN RAISE EXCEPTION USING ERRCODE='P5B09';
 ELSIF message='Holder has no cash accounts' THEN RAISE EXCEPTION USING ERRCODE='P5B04';ELSE RAISE;END IF;
 END;
 RETURN jsonb_build_object('operation',c->>'operation','targetType','cash-openings','targetId',target,'paymentId',NULL,'plan',NULL,'predecessorRequestId',NULL,'sourceCreatedBy',NULL);
END $$;
REVOKE ALL ON FUNCTION public.pwa_apply_cash_opening_v2(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pwa_apply_cash_opening_v2(text) TO mw_app_dev_journal_owner;

CREATE FUNCTION public.pwa_management_tools_text_v2(op text,i jsonb) RETURNS text
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,public AS $$
DECLARE keys text[];k text;result text:='{';row_value jsonb;previous_id text;items text:='';
BEGIN
 IF jsonb_typeof(i) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION USING ERRCODE='22023';END IF;
 IF op IN('assessment.refresh','assessment.delete') THEN IF i<>'{}'::jsonb THEN RAISE EXCEPTION USING ERRCODE='22023';END IF;RETURN '{}';
 ELSIF op='analytics.refresh' THEN keys:=ARRAY['mode'];
 ELSIF op='cash-openings.initialize' THEN keys:=ARRAY['openings','reviewedBasisHash','notes'];
 ELSIF op IN('assessment.create','assessment.update') THEN keys:=ARRAY['assessmentId','borrowerId','proposedLoanAmount','minimumDailyProfitRate','forecastStart','forecastEnd'];
 ELSE RAISE EXCEPTION USING ERRCODE='22023';END IF;
 IF (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(i) key) IS DISTINCT FROM (SELECT array_agg(key ORDER BY key) FROM unnest(keys) key) THEN RAISE EXCEPTION USING ERRCODE='22023';END IF;
 IF op='cash-openings.initialize' THEN
 IF jsonb_typeof(i->'openings') IS DISTINCT FROM 'array' OR jsonb_array_length(i->'openings') NOT BETWEEN 1 AND 10000 THEN RAISE EXCEPTION USING ERRCODE='22023';END IF;
 FOR row_value IN SELECT value FROM jsonb_array_elements(i->'openings') LOOP
 IF jsonb_typeof(row_value) IS DISTINCT FROM 'object' OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(row_value) key) IS DISTINCT FROM ARRAY['accountId','amount']
 OR jsonb_typeof(row_value->'accountId') IS DISTINCT FROM 'string' OR octet_length(row_value->>'accountId') NOT BETWEEN 1 AND 256 OR row_value->>'accountId'~'[[:cntrl:]]'
 OR jsonb_typeof(row_value->'amount') IS DISTINCT FROM 'string' OR octet_length(row_value->>'amount')>65536 OR row_value->>'amount'!~'^(0|-?[1-9][0-9]*)$'
 OR (previous_id IS NOT NULL AND previous_id COLLATE "C">=(row_value->>'accountId') COLLATE "C") THEN RAISE EXCEPTION USING ERRCODE='22023';END IF;
 items:=items||CASE WHEN items='' THEN '' ELSE ',' END||'{"accountId":'||to_json(row_value->>'accountId')::text||',"amount":'||to_json(row_value->>'amount')::text||'}';previous_id:=row_value->>'accountId';
 END LOOP;
 END IF;
 FOREACH k IN ARRAY keys LOOP
 IF k='openings' THEN result:=result||'"openings":['||items||']';CONTINUE;END IF;
 IF jsonb_typeof(i->k) NOT IN('string','null') OR octet_length(i->>k)>65536 THEN RAISE EXCEPTION USING ERRCODE='22023';END IF;
 IF k='borrowerId' AND i->k<>'null'::jsonb AND (octet_length(i->>k) NOT BETWEEN 1 AND 256 OR i->>k~'[[:cntrl:]]') THEN RAISE EXCEPTION USING ERRCODE='22023';END IF;
 IF k IN('forecastStart','forecastEnd') AND (jsonb_typeof(i->k) IS DISTINCT FROM 'string' OR i->>k!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' OR ((i->>k)::date)::text<>i->>k) THEN RAISE EXCEPTION USING ERRCODE='22023';END IF;
 IF k='proposedLoanAmount' AND i->k<>'null'::jsonb AND (i->>k!~'^(0|[1-9][0-9]*)(\.[0-9]{1,2})?$' OR (i->>k)::numeric>92233720368547758.07) THEN RAISE EXCEPTION USING ERRCODE='22023';END IF;
 IF k='minimumDailyProfitRate' AND i->k<>'null'::jsonb AND (i->>k!~'^(0|[1-9][0-9]*)(\.[0-9]+)?$' OR (i->>k)::numeric>3.4028234663852886e38) THEN RAISE EXCEPTION USING ERRCODE='22023';END IF;
 IF k='mode' AND (i->>k IS NULL OR i->>k NOT IN('Recent','Full')) OR k='reviewedBasisHash' AND (i->>k IS NULL OR i->>k!~'^[a-f0-9]{64}$') OR op='cash-openings.initialize' AND k='notes' AND nullif(btrim(i->>k),'') IS NULL THEN RAISE EXCEPTION USING ERRCODE='22023';END IF;
 result:=result||CASE WHEN result='{' THEN '' ELSE ',' END||to_json(k)::text||':'||coalesce(to_json(i->>k)::text,'null');END LOOP;RETURN result||'}';
END $$;
REVOKE ALL ON FUNCTION public.pwa_management_tools_text_v2(text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pwa_management_tools_text_v2(text,jsonb) TO mw_app_dev_journal_owner;

-- Explicit recalculation may renew an expired valid window; reads and ordinary edits never do.
CREATE FUNCTION public.pwa_assessment_refresh_window_v2(start_day date,end_day date,as_of date) RETURNS date[]
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,public AS $$
BEGIN
 IF start_day IS NULL OR end_day IS NULL OR as_of IS NULL OR start_day>end_day OR end_day-start_day>3660 OR start_day>as_of THEN RAISE EXCEPTION USING ERRCODE='P5B08';END IF;
 IF end_day<as_of THEN RETURN ARRAY[as_of,as_of];END IF;
 RETURN ARRAY[start_day,end_day];
END $$;
REVOKE ALL ON FUNCTION public.pwa_assessment_refresh_window_v2(date,date,date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pwa_assessment_refresh_window_v2(date,date,date) TO mw_app_dev_journal_owner;

CREATE FUNCTION public.pwa_apply_assessment_v2(payload text) RETURNS jsonb
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE e jsonb:=payload::jsonb;c jsonb:=e->'command';i jsonb:=c->'inputs';op text:=c->>'operation';target text:=c->>'targetId';snapshot jsonb;day date:=(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date;message text;
BEGIN
 IF current_user<>'mw_app_dev_journal_owner' OR op NOT IN('assessment.create','assessment.update','assessment.refresh','assessment.delete') THEN RAISE EXCEPTION USING ERRCODE='42501';END IF;
 PERFORM public.pwa_management_tools_text_v2(op,i);
 PERFORM pg_advisory_xact_lock(hashtextextended('management:assessment:'||target,0));
 SELECT to_jsonb(s) INTO snapshot FROM public."Loan Assessment SQL Lab" s WHERE "Row ID"=target FOR UPDATE;
 IF op='assessment.create' THEN IF snapshot IS NOT NULL THEN RAISE EXCEPTION USING ERRCODE='P5B01';END IF;
 ELSE IF snapshot IS NULL THEN RAISE EXCEPTION USING ERRCODE='P5B02';END IF;IF encode(sha256(convert_to(snapshot::text,'UTF8')),'hex') IS DISTINCT FROM c->>'expectedVersion' THEN RAISE EXCEPTION USING ERRCODE='P5B01';END IF;END IF;
 IF op IN('assessment.create','assessment.update') AND i->>'borrowerId' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public."Borrowers" WHERE "Row ID"=i->>'borrowerId') THEN RAISE EXCEPTION USING ERRCODE='P5B04';END IF;
 IF op='assessment.create' AND ((i->>'forecastStart')::date<>day OR (i->>'forecastEnd')::date<>day) THEN RAISE EXCEPTION USING ERRCODE='P5B08';END IF;
 IF op='assessment.update' AND (i->>'forecastStart' IS DISTINCT FROM snapshot->>'SQL Forecast Start' OR i->>'forecastEnd' IS DISTINCT FROM snapshot->>'SQL Forecast End') THEN RAISE EXCEPTION USING ERRCODE='P5B08';END IF;
 BEGIN
 IF op='assessment.create' THEN INSERT INTO public."Loan Assessment SQL Lab"("Row ID","Assessment ID","Ref Borrower","Proposed Loan Amount","Minimum Daily Profit Rate","SQL Forecast Start","SQL Forecast End") VALUES(target,i->>'assessmentId',i->>'borrowerId',(i->>'proposedLoanAmount')::numeric::money,(i->>'minimumDailyProfitRate')::real,day,day);
 ELSIF op='assessment.update' THEN UPDATE public."Loan Assessment SQL Lab" SET "Assessment ID"=i->>'assessmentId',"Ref Borrower"=i->>'borrowerId',"Proposed Loan Amount"=(i->>'proposedLoanAmount')::numeric::money,"Minimum Daily Profit Rate"=(i->>'minimumDailyProfitRate')::real WHERE "Row ID"=target;
 ELSIF op='assessment.refresh' THEN UPDATE public."Loan Assessment SQL Lab" SET "SQL Forecast Start"=(public.pwa_assessment_refresh_window_v2("SQL Forecast Start","SQL Forecast End",day))[1],"SQL Forecast End"=(public.pwa_assessment_refresh_window_v2("SQL Forecast Start","SQL Forecast End",day))[2],"SQL Refresh Token"=e->>'requestId' WHERE "Row ID"=target;
 ELSE DELETE FROM public."Loan Assessment SQL Lab" WHERE "Row ID"=target;END IF;
 EXCEPTION WHEN foreign_key_violation THEN RAISE EXCEPTION USING ERRCODE='P5B04';
 WHEN raise_exception THEN GET STACKED DIAGNOSTICS message=MESSAGE_TEXT;
 IF message='Forecast window must include today and cannot exceed 3660 days' THEN RAISE EXCEPTION USING ERRCODE='P5B08';ELSE RAISE;END IF;
 END;
 RETURN jsonb_build_object('operation',op,'targetType','assessment','targetId',target,'paymentId',NULL,'plan',NULL,'predecessorRequestId',NULL,'sourceCreatedBy',NULL);
END $$;
REVOKE ALL ON FUNCTION public.pwa_apply_assessment_v2(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pwa_apply_assessment_v2(text) TO mw_app_dev_journal_owner;

DO $migration$ DECLARE definition text;old_text text:=$old$'cash-movement.delete') THEN RAISE EXCEPTION 'target'$old$;BEGIN
 SELECT pg_get_functiondef('public.pwa_submit_operation_v2(text)'::regprocedure) INTO definition;
 IF (length(definition)-length(replace(definition,old_text,'')))/length(old_text)<>1 THEN RAISE EXCEPTION 'Unexpected management tools boundary';END IF;
 EXECUTE replace(definition,old_text,$new$'cash-movement.delete','cash-openings.initialize','assessment.create','assessment.update','assessment.refresh','assessment.delete') THEN RAISE EXCEPTION 'target'$new$);
END $migration$;

DO $migration$ DECLARE definition text;old_text text:=$old$'settlement.settle-all','cash-movement.create') THEN$old$;BEGIN
 SELECT pg_get_functiondef('public.pwa_submit_operation_v2(text)'::regprocedure) INTO definition;
 IF (length(definition)-length(replace(definition,old_text,'')))/length(old_text)<>1 THEN RAISE EXCEPTION 'Unexpected management tools boundary';END IF;
 EXECUTE replace(definition,old_text,$new$'settlement.settle-all','cash-movement.create','assessment.create') THEN$new$);
END $migration$;

DO $migration$ DECLARE definition text;old_text text:=$old$IF split_part(op,'.',1) IN('capital-contribution','settlement','cash-movement') THEN input_text:=$old$;BEGIN
 SELECT pg_get_functiondef('public.pwa_submit_operation_v2(text)'::regprocedure) INTO definition;
 IF (length(definition)-length(replace(definition,old_text,'')))/length(old_text)<>1 THEN RAISE EXCEPTION 'Unexpected management tools boundary';END IF;
 EXECUTE replace(definition,old_text,$new$IF split_part(op,'.',1) IN('cash-openings','assessment') THEN input_text:=public.pwa_management_tools_text_v2(op,i);ELSIF split_part(op,'.',1) IN('capital-contribution','settlement','cash-movement') THEN input_text:=$new$);
END $migration$;

DO $migration$ DECLARE definition text;old_text text:=$old$IF split_part(op,'.',1) IN('capital-contribution','settlement','cash-movement') THEN result_value:=$old$;BEGIN
 SELECT pg_get_functiondef('public.pwa_submit_operation_v2(text)'::regprocedure) INTO definition;
 IF (length(definition)-length(replace(definition,old_text,'')))/length(old_text)<>1 THEN RAISE EXCEPTION 'Unexpected management tools boundary';END IF;
 EXECUTE replace(definition,old_text,$new$IF split_part(op,'.',1)='cash-openings' THEN result_value:=public.pwa_apply_cash_opening_v2($1);ELSIF split_part(op,'.',1)='assessment' THEN result_value:=public.pwa_apply_assessment_v2($1);ELSIF split_part(op,'.',1) IN('capital-contribution','settlement','cash-movement') THEN result_value:=$new$);
END $migration$;

-- Native assessment trigger invokes functions in its existing schema; no source DML privilege is added.
GRANT USAGE ON SCHEMA assessment_lab TO mw_app_dev_journal_owner;

CREATE FUNCTION public.pwa_apply_analytics_v2(payload text) RETURNS jsonb
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE e jsonb:=payload::jsonb;c jsonb:=e->'command';i jsonb:=c->'inputs';target text:=c->>'targetId';snapshot jsonb;
BEGIN
 IF current_user<>'mw_app_dev_journal_owner' OR c->>'operation'<>'analytics.refresh' THEN RAISE EXCEPTION USING ERRCODE='42501';END IF;
 PERFORM public.pwa_management_tools_text_v2('analytics.refresh',i);
 PERFORM pg_advisory_xact_lock(hashtextextended('management:analytics:'||target,0));
 SELECT to_jsonb(s) INTO snapshot FROM public."Statistics" s WHERE "Row ID"=target FOR UPDATE;
 IF snapshot IS NULL THEN RAISE EXCEPTION USING ERRCODE='P5B02';END IF;
 IF encode(sha256(convert_to(snapshot::text,'UTF8')),'hex') IS DISTINCT FROM c->>'expectedVersion' THEN RAISE EXCEPTION USING ERRCODE='P5B01';END IF;
 UPDATE public."Statistics" SET "Analytics Refresh Request"=public.olap_reporting_date()::text||'|'||(i->>'mode')||'|'||(e->>'requestId') WHERE "Row ID"=target;
 RETURN jsonb_build_object('operation','analytics.refresh','targetType','analytics','targetId',target,'paymentId',NULL,'plan',NULL,'predecessorRequestId',NULL,'sourceCreatedBy',NULL);
END $$;
REVOKE ALL ON FUNCTION public.pwa_apply_analytics_v2(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pwa_apply_analytics_v2(text) TO mw_app_dev_journal_owner;

DO $migration$ DECLARE definition text;old_text text:=$old$'assessment.delete') THEN RAISE EXCEPTION 'target'$old$;BEGIN
 SELECT pg_get_functiondef('public.pwa_submit_operation_v2(text)'::regprocedure) INTO definition;
 IF (length(definition)-length(replace(definition,old_text,'')))/length(old_text)<>1 THEN RAISE EXCEPTION 'Unexpected analytics boundary';END IF;
 EXECUTE replace(definition,old_text,$new$'assessment.delete','analytics.refresh') THEN RAISE EXCEPTION 'target'$new$);
END $migration$;

DO $migration$ DECLARE definition text;old_text text:=$old$IN('cash-openings','assessment') THEN input_text:=$old$;BEGIN
 SELECT pg_get_functiondef('public.pwa_submit_operation_v2(text)'::regprocedure) INTO definition;
 IF (length(definition)-length(replace(definition,old_text,'')))/length(old_text)<>1 THEN RAISE EXCEPTION 'Unexpected analytics boundary';END IF;
 EXECUTE replace(definition,old_text,$new$IN('cash-openings','assessment','analytics') THEN input_text:=$new$);
END $migration$;

DO $migration$ DECLARE definition text;old_text text:=$old$IF split_part(op,'.',1)='cash-openings' THEN result_value:=$old$;BEGIN
 SELECT pg_get_functiondef('public.pwa_submit_operation_v2(text)'::regprocedure) INTO definition;
 IF (length(definition)-length(replace(definition,old_text,'')))/length(old_text)<>1 THEN RAISE EXCEPTION 'Unexpected analytics boundary';END IF;
 EXECUTE replace(definition,old_text,$new$IF split_part(op,'.',1)='analytics' THEN result_value:=public.pwa_apply_analytics_v2($1);ELSIF split_part(op,'.',1)='cash-openings' THEN result_value:=$new$);
END $migration$;
