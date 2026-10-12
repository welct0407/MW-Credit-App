-- Compatible optional loan anchor input. Existing canonical bytes and omitted-update semantics remain unchanged.

-- Existing column only; governed triggers and financial engines are retained.

DO $migration$ DECLARE definition text; old_text text:=$old$keys:=ARRAY['borrowerId','loanDate','principal','transferFee','disbursingAccountId','type','dueDate','dailyPayment','fixedInterest','currentDailyInterest','paymentInterval','arrangement','autoChargeEnabled'];$old$;BEGIN
 SELECT pg_get_functiondef('public.pwa_submit_operation_v2(text)'::regprocedure) INTO definition;
 IF (length(definition)-length(replace(definition,old_text,'')))/length(old_text)<>1 THEN RAISE EXCEPTION 'Unexpected loan anchor routine boundary: public.pwa_submit_operation_v2(text)';END IF;
 EXECUTE replace(definition,old_text,$new$keys:=ARRAY['borrowerId','loanDate','principal','transferFee','disbursingAccountId','type','dueDate','dailyPayment','fixedInterest','currentDailyInterest','paymentInterval','arrangement','autoChargeEnabled'];
 IF i ? 'scheduleAnchor' THEN keys:=array_append(keys,'scheduleAnchor');END IF;$new$);
END $migration$;

DO $migration$ DECLARE definition text; old_text text:=$old$k IN('loanDate','dueDate')$old$;BEGIN
 SELECT pg_get_functiondef('public.pwa_submit_operation_v2(text)'::regprocedure) INTO definition;
 IF (length(definition)-length(replace(definition,old_text,'')))/length(old_text)<>1 THEN RAISE EXCEPTION 'Unexpected loan anchor routine boundary: public.pwa_submit_operation_v2(text)';END IF;
 EXECUTE replace(definition,old_text,$new$k IN('loanDate','dueDate','scheduleAnchor')$new$);
END $migration$;

DO $migration$ DECLARE definition text; old_text text:=$old$SELECT * INTO component FROM public.first_day_components_v83(l);$old$;BEGIN
 SELECT pg_get_functiondef('public.pwa_apply_loan_create_v2(text)'::regprocedure) INTO definition;
 IF (length(definition)-length(replace(definition,old_text,'')))/length(old_text)<>1 THEN RAISE EXCEPTION 'Unexpected loan anchor routine boundary: public.pwa_apply_loan_create_v2(text)';END IF;
 EXECUTE replace(definition,old_text,$new$l."Interest Schedule Anchor Date":=(i->>'scheduleAnchor')::date;
 IF l."Interest Schedule Anchor Date"<l."Loan Date" THEN RAISE EXCEPTION USING ERRCODE='P5B08';END IF;
 SELECT * INTO component FROM public.first_day_components_v83(l);$new$);
END $migration$;

DO $migration$ DECLARE definition text; old_text text:=$old$"Created By","Loan Status","Defaulted")$old$;BEGIN
 SELECT pg_get_functiondef('public.pwa_apply_loan_create_v2(text)'::regprocedure) INTO definition;
 IF (length(definition)-length(replace(definition,old_text,'')))/length(old_text)<>1 THEN RAISE EXCEPTION 'Unexpected loan anchor routine boundary: public.pwa_apply_loan_create_v2(text)';END IF;
 EXECUTE replace(definition,old_text,$new$"Created By","Loan Status","Defaulted","Interest Schedule Anchor Date")$new$);
END $migration$;

DO $migration$ DECLARE definition text; old_text text:=$old$l."Created By",l."Loan Status",false);$old$;BEGIN
 SELECT pg_get_functiondef('public.pwa_apply_loan_create_v2(text)'::regprocedure) INTO definition;
 IF (length(definition)-length(replace(definition,old_text,'')))/length(old_text)<>1 THEN RAISE EXCEPTION 'Unexpected loan anchor routine boundary: public.pwa_apply_loan_create_v2(text)';END IF;
 EXECUTE replace(definition,old_text,$new$l."Created By",l."Loan Status",false,l."Interest Schedule Anchor Date");$new$);
END $migration$;

DO $migration$ DECLARE definition text; old_text text:=$old$WHEN 'loan.update' THEN UPDATE$old$;BEGIN
 SELECT pg_get_functiondef('public.pwa_apply_loan_source_v2(text)'::regprocedure) INTO definition;
 IF (length(definition)-length(replace(definition,old_text,'')))/length(old_text)<>1 THEN RAISE EXCEPTION 'Unexpected loan anchor routine boundary: public.pwa_apply_loan_source_v2(text)';END IF;
 EXECUTE replace(definition,old_text,$new$WHEN 'loan.update' THEN
 IF i ? 'scheduleAnchor' AND (i->>'scheduleAnchor')::date<(i->>'loanDate')::date THEN RAISE EXCEPTION USING ERRCODE='P5B08';END IF;
 UPDATE$new$);
END $migration$;

DO $migration$ DECLARE definition text; old_text text:=$old$"Loan Arrangement"=i->>'arrangement'$old$;BEGIN
 SELECT pg_get_functiondef('public.pwa_apply_loan_source_v2(text)'::regprocedure) INTO definition;
 IF (length(definition)-length(replace(definition,old_text,'')))/length(old_text)<>1 THEN RAISE EXCEPTION 'Unexpected loan anchor routine boundary: public.pwa_apply_loan_source_v2(text)';END IF;
 EXECUTE replace(definition,old_text,$new$"Interest Schedule Anchor Date"=CASE WHEN i ? 'scheduleAnchor' THEN (i->>'scheduleAnchor')::date ELSE l."Interest Schedule Anchor Date" END,"Loan Arrangement"=i->>'arrangement'$new$);
END $migration$;
