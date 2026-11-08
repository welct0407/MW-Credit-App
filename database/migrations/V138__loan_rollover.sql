-- R136 loan rollover (owner decisions D1 to D14 of 8 November 2026; design project/outputs/r136-daily-instalment-rollover/DESIGN.md).
-- An open daily-instalment or daily-interest loan O is closed on day D (today or yesterday, Bangkok) and a new loan N of the
-- same type is created by the same request; O's settlement (unpaid charges, the days not yet charged or the payoff gap, the
-- early closure penalty) is netted off against N's disbursement. V137 is applied and stays.
-- Objects:
--  1. Column "Loans"."Ref Rollover Source Loan" (nullable, FK to "Loans", ON DELETE RESTRICT; owner-authorized through D5):
--     set only by the rollover apply on N; names O. Comment of "Loans"."Transfer Fee": its business name is Documentation Fee
--     (D1, labels only).
--  2. loan_rollover_calculation_v1(loan, day, penalty): the quote for both types, read only (invoker rights; EXECUTE for
--     mw_app_<env>, the journal owner inherits it). Ineligible loans return {eligible:false, reason}. The quote carries the
--     closing charge (rl138:<length>:<loan>:<day>), the Selected Charges lines, sourceVersion and planHash.
--  3. pwa_apply_loan_rollover_v1(canonical): operation loan.rollover (journal owner only): O's closing charge (and, for a
--     daily-interest O, the R101 lowering of a charge dated after D), O's settlement payment pwa:<request> (Net-off at
--     Disbursement, Selected Charges, dated D, received on N's disbursing account, explicit plan), the referral rebate of O
--     forced inside the command, then N (the loan.create body plus the link) with its first-day net-off, and N's charge for
--     today when D is yesterday.
--  4. pwa_submit_operation_v2: loan.rollover (canonical inputs = loan.create's 13 keys, then sourceLoanId,
--     sourceExpectedVersion, penalty, expectedSettlement, expectedPlanHash); P5B12 is rejection rollover_ineligible.
--  5. Journal: pwa_versioned_outcome admits rollover_ineligible and, on loan.rollover only, result_json.settlement
--     {paymentId, plan} and result_json.rollover {closedLoanId, newLoanId, settlementPaymentId, firstDayPaymentId,
--     statement}. pwa_effective_payment_plan_v2, pwa_payment_head_v2 and the unique receipt index know both receipts
--     (R111 precedent: one journal row, two receipts, each with exactly one provenance).
--  6. first_day_charge_trigger never treats an rl138: closing charge as a first-day charge (a rollover on O's loan date).
-- Preflight: V137 applied, no new object exists, every counted boundary occurs as expected, the runner can replace each
-- routine, the roles exist. Self-check: owner, ACL, security, volatility, configuration and comment of every replaced routine
-- unchanged; exact ACLs of the new functions; the column, its FK and the journal constraint and indexes.
-- Rollback: a later migration restores the V137 bodies; the column stays (null). Rollovers already recorded stay ordinary
-- loans, charges and payments.

DO $preflight$
DECLARE problems text[]:='{}'; r record; suffix text:=CASE current_database() WHEN 'loan_manager_prod' THEN 'prod' ELSE 'dev' END;
BEGIN
 IF current_database() NOT IN ('loan_manager_dev','payment_rehearsal','loan_manager_prod') THEN RAISE EXCEPTION 'Unsupported application database'; END IF;
 IF to_regclass('public.pwa_rebate_settlements') IS NULL THEN problems:=problems||'V138 needs V137'::text; END IF;
 IF to_regprocedure('public.loan_rollover_calculation_v1(text,date,numeric)') IS NOT NULL OR to_regprocedure('public.pwa_apply_loan_rollover_v1(text)') IS NOT NULL
  OR to_regclass('public.pwa_operation_settlement_receipt_v1') IS NOT NULL THEN problems:=problems||'V138: a new object already exists'::text; END IF;
 IF EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='public."Loans"'::regclass AND attname='Ref Rollover Source Loan' AND NOT attisdropped) THEN
  problems:=problems||'V138: "Ref Rollover Source Loan" already exists'::text; END IF;
 IF position($c$'sourceCreatedBy'::text, 'rebate'::text]) = '{}'::jsonb)$c$ IN (SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname='pwa_versioned_outcome' AND conrelid='public.pwa_payment_commands'::regclass))=0
  THEN problems:=problems||'V138: pwa_versioned_outcome differs from V122'::text; END IF;
 FOR r IN SELECT unnest(ARRAY['mw_app_'||suffix,'mw_app_'||suffix||'_journal_owner']) AS role LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=r.role) THEN problems:=problems||format('V138 needs the role %s',r.role); END IF;
 END LOOP;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=current_user AND rolsuper) THEN
  FOR r IN SELECT DISTINCT pg_get_userbyid(p.proowner) AS owner FROM pg_proc p WHERE p.oid IN ('public.pwa_submit_operation_v2(text)'::regprocedure,
    'public.pwa_effective_payment_plan_v2(text)'::regprocedure,'public.pwa_payment_head_v2(text)'::regprocedure,'public.first_day_charge_trigger()'::regprocedure) LOOP
   IF NOT pg_has_role(current_user,r.owner,'USAGE') THEN problems:=problems||format('%s cannot replace routines owned by %s (owner window required)',current_user,r.owner); END IF;
  END LOOP;
 END IF;
 IF cardinality(problems)>0 THEN RAISE EXCEPTION 'V138 preflight: %',array_to_string(problems,'; '); END IF;
END $preflight$;

CREATE TEMP TABLE v138_routines ON COMMIT DROP AS
 SELECT r.name AS routine,pg_get_userbyid(p.proowner) AS owner,coalesce(p.proacl,acldefault('f',p.proowner)) AS effective,
  p.prosecdef AS definer,p.provolatile AS volatile,p.proconfig AS config,obj_description(p.oid,'pg_proc') AS comment
 FROM unnest(ARRAY['public.pwa_submit_operation_v2(text)','public.pwa_effective_payment_plan_v2(text)','public.pwa_payment_head_v2(text)',
  'public.first_day_charge_trigger()']) r(name) JOIN pg_proc p ON p.oid=r.name::regprocedure;

-- 1. The link (D5) and the documentation fee's business name (D1).
ALTER TABLE public."Loans" ADD COLUMN "Ref Rollover Source Loan" text REFERENCES public."Loans"("Row ID") ON DELETE RESTRICT;
CREATE INDEX loans_ref_rollover_source_loan ON public."Loans"("Ref Rollover Source Loan") WHERE "Ref Rollover Source Loan" IS NOT NULL;
COMMENT ON COLUMN public."Loans"."Ref Rollover Source Loan" IS 'R136: the original loan this loan was created from by a rollover (loan.rollover), which closed it with a net-off settlement on the rollover day. Set only by pwa_apply_loan_rollover_v1; null on every other loan.';
COMMENT ON COLUMN public."Loans"."Transfer Fee" IS 'Documentation Fee (R136 business name; the column keeps its name): a one-off fee added to the first-day charge interest of a daily-interest or daily-instalment loan and netted off at disbursement, so it is profit on the loan date. A fixed-due-date loan has no first-day charge.';

-- 2. The quote. Instalment O: unpaid charges, the days not yet charged (R = due date - latest charge date, never negative),
-- the principal not yet on a charge and the remaining interest DP x R - that principal (D11: never below 0, interestClamped),
-- the penalty. Daily-interest O: the Loan Close quote for the day (unpaid charges, outstanding principal not on a charge,
-- gap interest, the R101 lowering of a charge dated after the day) plus the penalty. The closing charge rl138: carries the
-- principal not yet on a charge and the remaining or gap interest plus the penalty; the settlement pays every balance of O.
CREATE FUNCTION public.loan_rollover_calculation_v1(p_loan text, p_day date, p_penalty numeric) RETURNS jsonb
    LANGUAGE plpgsql STABLE
    SET search_path TO 'pg_catalog', 'public'
    AS $$
DECLARE l public."Loans"%ROWTYPE; reason text; outstanding numeric; unpaid numeric:=0; unpaid_principal numeric:=0; missing numeric:=0;
 latest date; uncharged integer; raw_interest numeric; interest numeric:=0; clamped boolean:=false; gap_days integer:=0; daily numeric;
 close jsonb; m jsonb; future jsonb; lines jsonb; target text; settlement numeric; closing jsonb; context jsonb; message text; instalment boolean;
BEGIN
 IF p_day IS NULL OR p_penalty IS NULL OR p_penalty<0 OR p_penalty<>trunc(p_penalty) OR p_penalty>92233720368547758 THEN
  RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Rollover penalty must be a whole baht amount of 0 or more'; END IF;
 SELECT * INTO l FROM public."Loans" WHERE "Row ID"=p_loan;
 IF NOT FOUND THEN RETURN NULL; END IF;
 instalment:=l."Loan Type"='ผ่อนชำระรายวัน';
 reason:=CASE
  WHEN l."Loan Status" IS DISTINCT FROM 'ยังไม่ปิดยอด' THEN 'closed'
  WHEN l."Loan Type" IS NULL OR l."Loan Type" NOT IN ('ผ่อนชำระรายวัน','ดอกเบี้ยรายวัน') THEN 'type'
  WHEN coalesce(l."Defaulted",false) OR coalesce(l."Default Loss Amount"::numeric,0)<>0
   OR EXISTS(SELECT 1 FROM public."Charges" WHERE "Ref Loans"=p_loan AND starts_with("Row ID",'df10:')) THEN 'defaulted'
  WHEN NOT coalesce(l."Auto Charge Enabled",false) THEN 'auto'
  WHEN EXISTS(SELECT 1 FROM public."Payments" WHERE "Ref Borrower"=l."Ref Borrowers" AND "Status" IN ('Processing','Error')) THEN 'processing'
  WHEN l."Loan Date" IS NULL OR p_day<l."Loan Date" THEN 'date'
  WHEN EXISTS(SELECT 1 FROM public."Charges" WHERE "Ref Loans"=p_loan AND starts_with("Row ID",'rl138:')) THEN 'earlier'
  WHEN l."Principal Amount" IS NULL OR l."Principal Amount"::numeric<=0
   OR (instalment AND (l."Due Date" IS NULL OR l."Due Date"<l."Loan Date" OR l."Daily Payment Amount" IS NULL OR l."Daily Payment Amount"::numeric<=0))
   OR (NOT instalment AND (l."Current Daily Interest" IS NULL OR l."Current Daily Interest"::numeric<0)) THEN 'terms'
  WHEN EXISTS(SELECT 1 FROM public."Charges" c LEFT JOIN LATERAL(SELECT coalesce(sum(r."Principal Paid"::numeric),0) p,coalesce(sum(r."Interest Paid"::numeric),0) i,coalesce(sum(r."Late Charge Paid"::numeric),0) lt
    FROM public."Repayments" r WHERE r."Ref Charges"=c."Row ID") paid ON true WHERE c."Ref Loans"=p_loan
    AND (c."Principal Due" IS NULL OR c."Interest Due" IS NULL OR c."Principal Due"::numeric<paid.p OR c."Interest Due"::numeric<paid.i OR c."Late Charge Due"::numeric<paid.lt)) THEN 'reconcile'
 END;
 IF reason IS NOT NULL THEN RETURN jsonb_build_object('eligible',false,'reason',reason,'loanId',p_loan,'type',l."Loan Type"); END IF;
 target:='rl138:'||length(p_loan)||':'||p_loan||':'||p_day::text;
 IF instalment THEN
  daily:=l."Daily Payment Amount"::numeric;
  SELECT l."Principal Amount"::numeric-coalesce(sum("Principal Paid"::numeric),0) INTO outstanding FROM public."Repayments" WHERE "Ref Loans"=p_loan;
  WITH paid AS(SELECT r."Ref Charges" id,sum(r."Principal Paid"::numeric) p,sum(r."Interest Paid"::numeric) i,sum(r."Late Charge Paid"::numeric) lt FROM public."Repayments" r WHERE r."Ref Loans"=p_loan GROUP BY r."Ref Charges"),
  rem AS(SELECT c."Row ID" id,c."Charge Date" charge_day,c."Principal Due"::numeric-coalesce(paid.p,0) p,c."Interest Due"::numeric-coalesce(paid.i,0) i,c."Late Charge Due"::numeric-coalesce(paid.lt,0) lt
   FROM public."Charges" c LEFT JOIN paid ON paid.id=c."Row ID" WHERE c."Ref Loans"=p_loan)
  SELECT coalesce(sum(p+i+lt),0),coalesce(sum(p),0),max(charge_day),
   coalesce(jsonb_agg(jsonb_build_object('chargeId',id,'principal',trim_scale(p)::text,'interest',trim_scale(i)::text,'lateCharge',trim_scale(lt)::text,'expectedPrincipalRemaining',trim_scale(p)::text,
    'expectedInterestRemaining',trim_scale(i)::text,'expectedLateChargeRemaining',trim_scale(lt)::text,'chargeDate',charge_day::text) ORDER BY id COLLATE "C") FILTER(WHERE p+i+lt>0),'[]'::jsonb)
  INTO unpaid,unpaid_principal,latest,lines FROM rem;
  missing:=outstanding-unpaid_principal;
  IF missing<0 OR latest IS NULL THEN RETURN jsonb_build_object('eligible',false,'reason','reconcile','loanId',p_loan,'type',l."Loan Type"); END IF;
  uncharged:=greatest(0,l."Due Date"-latest);
  raw_interest:=daily*uncharged-missing;
  interest:=greatest(0,raw_interest);clamped:=raw_interest<0;
 ELSE
  daily:=l."Current Daily Interest"::numeric;
  BEGIN close:=public.loan_close_calculation_v83(p_loan,p_day);
  EXCEPTION WHEN SQLSTATE 'P0001' THEN GET STACKED DIAGNOSTICS message=MESSAGE_TEXT;
   RETURN jsonb_build_object('eligible',false,'reason',CASE WHEN message='Loan has no outstanding principal to close' THEN 'nothing' ELSE 'reconcile' END,'loanId',p_loan,'type',l."Loan Type");
  END;
  m:=close->'mutation';
  IF m->>'kind' IN ('insert','increase') THEN missing:=(m->>'principal')::numeric;END IF;
  IF m->>'kind'='insert' THEN interest:=(m->>'interest')::numeric;END IF;
  IF jsonb_typeof(m->'futureInterest')='array' THEN future:=m->'futureInterest';END IF;
  -- The close quote's lines without its own closing change: the lc7: insert goes, an increase of the charge dated D is taken
  -- back (the closing charge carries that principal instead).
  SELECT coalesce(jsonb_agg(CASE WHEN m->>'kind'='increase' AND x->>'chargeId'=close->>'targetChargeId'
     THEN x||jsonb_build_object('principal',trim_scale((x->>'principal')::numeric-missing)::text,'expectedPrincipalRemaining',trim_scale((x->>'expectedPrincipalRemaining')::numeric-missing)::text) ELSE x END
    ORDER BY (x->>'chargeId') COLLATE "C"),'[]'::jsonb)
   INTO lines FROM jsonb_array_elements(close->'allocations') x WHERE NOT (m->>'kind'='insert' AND x->>'chargeId'=m->>'chargeId');
  SELECT coalesce(jsonb_agg(x ORDER BY (x->>'chargeId') COLLATE "C"),'[]'::jsonb) INTO lines FROM jsonb_array_elements(lines) x
   WHERE (x->>'principal')::numeric+(x->>'interest')::numeric+coalesce(x->>'lateCharge','0')::numeric>0;
  SELECT coalesce(sum((x->>'principal')::numeric+(x->>'interest')::numeric+coalesce(x->>'lateCharge','0')::numeric),0) INTO unpaid FROM jsonb_array_elements(lines) x;
  SELECT max("Charge Date") INTO latest FROM public."Charges" WHERE "Ref Loans"=p_loan AND "Charge Date"<=p_day AND NOT starts_with("Row ID",'df10:');
  gap_days:=CASE WHEN daily>0 THEN (interest/daily)::integer ELSE 0 END;
 END IF;
 IF missing+interest+p_penalty>0 THEN
  closing:=jsonb_build_object('chargeId',target,'principal',trim_scale(missing)::text,'interest',trim_scale(interest+p_penalty)::text);
  SELECT jsonb_agg(x ORDER BY (x->>'chargeId') COLLATE "C") INTO lines FROM (SELECT x FROM jsonb_array_elements(lines) x UNION ALL
   SELECT jsonb_build_object('chargeId',target,'principal',trim_scale(missing)::text,'interest',trim_scale(interest+p_penalty)::text,'lateCharge','0','expectedPrincipalRemaining',trim_scale(missing)::text,
    'expectedInterestRemaining',trim_scale(interest+p_penalty)::text,'expectedLateChargeRemaining','0','chargeDate',p_day::text)) s;
 END IF;
 settlement:=unpaid+missing+interest+p_penalty;
 IF settlement<=0 THEN RETURN jsonb_build_object('eligible',false,'reason','nothing','loanId',p_loan,'type',l."Loan Type"); END IF;
 IF settlement<>trunc(settlement) OR EXISTS(SELECT 1 FROM jsonb_array_elements(lines) x WHERE x->>'principal'!~'^(0|[1-9][0-9]*)$' OR x->>'interest'!~'^(0|[1-9][0-9]*)$' OR coalesce(x->>'lateCharge','0')!~'^(0|[1-9][0-9]*)$') THEN
  RETURN jsonb_build_object('eligible',false,'reason','reconcile','loanId',p_loan,'type',l."Loan Type"); END IF;
 context:=jsonb_build_object('eligible',true,'loanId',p_loan,'borrowerId',l."Ref Borrowers",'type',l."Loan Type",'businessDate',p_day::text,'sourceVersion',public.pwa_loan_version_v2(p_loan),
  'dailyAmount',trim_scale(daily)::text,'unpaid',trim_scale(unpaid)::text,'missingPrincipal',trim_scale(missing)::text,'penalty',trim_scale(p_penalty)::text,'settlement',trim_scale(settlement)::text,
  'closingCharge',closing,'futureInterest',future,'allocations',lines)
  ||CASE WHEN instalment THEN jsonb_build_object('latestChargeDate',latest::text,'dueDate',l."Due Date"::text,'unchargedDays',uncharged,'remainingInterest',trim_scale(interest)::text,'interestClamped',clamped)
   ELSE jsonb_build_object('latestChargeDate',latest::text,'gapDays',gap_days,'gapInterest',trim_scale(interest)::text) END;
 RETURN context||jsonb_build_object('planHash',encode(sha256(convert_to(context::text,'UTF8')),'hex'));
END $$;
COMMENT ON FUNCTION public.loan_rollover_calculation_v1(text,date,numeric) IS 'R136: the rollover quote of an open daily-instalment or daily-interest loan on a day with an early closure penalty: unpaid charges, the principal not yet on a charge, the remaining interest of the days not yet charged (instalment) or the payoff gap interest (daily interest), the closing charge rl138:, the Selected Charges lines, the settlement, sourceVersion and planHash; {eligible:false, reason} when the loan cannot be rolled over. Read only.';

-- 3. The governed apply (journal owner only, invoker rights like pwa_apply_loan_close_v2).
CREATE FUNCTION public.pwa_apply_loan_rollover_v1(canonical text) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
DECLARE e jsonb:=canonical::jsonb;i jsonb:=e#>'{command,inputs}';a jsonb:=e->'actor';target text:=e#>>'{command,targetId}';source text:=i->>'sourceLoanId';
 today date:=(statement_timestamp() AT TIME ZONE 'Asia/Bangkok')::date;day date;parent text;o public."Loans"%ROWTYPE;quote jsonb;l public."Loans"%ROWTYPE;component record;
 first_payment text;first_charge text;first_plan jsonb;first_total numeric:=0;settle_payment text:='pwa:'||(e->>'requestId');settle_plan jsonb;result_value jsonb;statement jsonb;
 actual public."Payments"%ROWTYPE;f jsonb;ids text;cash numeric;profit numeric;settlement numeric;new_key text;old_key text;note text;message text;fee numeric;booked text;
BEGIN
 IF (current_database() NOT IN ('loan_manager_dev','payment_rehearsal','loan_manager_prod') OR current_user<>CASE current_database() WHEN 'loan_manager_prod' THEN 'mw_app_prod_journal_owner' ELSE 'mw_app_dev_journal_owner' END) OR e#>>'{command,operation}'<>'loan.rollover' THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Governed operation required';END IF;
 day:=(i->>'loanDate')::date;
 SELECT "Ref Borrowers" INTO parent FROM public."Loans" WHERE "Row ID"=source;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P5B02';END IF;
 IF parent IS DISTINCT FROM i->>'borrowerId' THEN RAISE EXCEPTION USING ERRCODE='P5B04';END IF;
 -- Locks: the borrower, the new loan's key, the original loan and its charges (the Loan Close order).
 PERFORM 1 FROM public."Borrowers" WHERE "Row ID"=parent FOR UPDATE;
 PERFORM pg_advisory_xact_lock(public.pwa_lock_key_v1('loan',target));
 SELECT * INTO o FROM public."Loans" WHERE "Row ID"=source FOR UPDATE;
 IF o."Ref Borrowers" IS DISTINCT FROM parent THEN RAISE EXCEPTION USING ERRCODE='P5B01';END IF;
 PERFORM 1 FROM public."Charges" WHERE "Ref Loans"=source ORDER BY "Row ID" COLLATE "C" FOR UPDATE;
 IF EXISTS(SELECT 1 FROM public."Loans" WHERE "Row ID"=target) THEN RAISE EXCEPTION USING ERRCODE='P5B01';END IF;
 -- D7: the rollover day is today or yesterday (the payment-date rule).
 IF day IS NULL OR day NOT IN (today,today-1) THEN RAISE EXCEPTION USING ERRCODE='P5B08';END IF;
 IF public.pwa_loan_version_v2(source) IS DISTINCT FROM i->>'sourceExpectedVersion' THEN RAISE EXCEPTION USING ERRCODE='P5B01';END IF;
 quote:=public.loan_rollover_calculation_v1(source,day,(i->>'penalty')::numeric);
 IF quote IS NULL OR (quote->>'eligible')::boolean IS NOT TRUE THEN RAISE EXCEPTION USING ERRCODE='P5B12';END IF;
 IF quote->>'planHash' IS DISTINCT FROM i->>'expectedPlanHash' OR quote->>'settlement' IS DISTINCT FROM i->>'expectedSettlement' THEN RAISE EXCEPTION USING ERRCODE='P5B01';END IF;
 settlement:=(quote->>'settlement')::numeric;
 -- N: the loan.create inputs, of O's type, with automatic charges (its first-day net-off), disbursed by Lisa.
 IF i->>'type' IS DISTINCT FROM o."Loan Type" THEN RAISE EXCEPTION USING ERRCODE='P5B04';END IF;
 IF (i->'autoChargeEnabled') IS DISTINCT FROM 'true'::jsonb THEN RAISE EXCEPTION USING ERRCODE='P5B06';END IF;
 IF NOT EXISTS(SELECT 1 FROM public."Cash Accounts" ca JOIN public."Cash Holders" ch ON ch."Row ID"=ca."Ref Cash Holder" WHERE ca."Row ID"=i->>'disbursingAccountId' AND ca."Active" IS TRUE AND ch."Active" IS TRUE AND ch."Row ID"='ch:lisa') THEN RAISE EXCEPTION USING ERRCODE='P5B07';END IF;
 l:=jsonb_populate_record(NULL::public."Loans",jsonb_build_object('Row ID',target,'Ref Borrowers',i->'borrowerId','Loan Date',i->'loanDate','Principal Amount',i->'principal','Transfer Fee',i->'transferFee','Ref Disbursed From Cash Account',i->'disbursingAccountId','Loan Type',i->'type','Due Date',i->'dueDate','Daily Payment Amount',i->'dailyPayment','Fixed Interest',i->'fixedInterest','Current Daily Interest',i->'currentDailyInterest','Interest Payment Interval',i->'paymentInterval','Loan Arrangement',i->'arrangement','Auto Charge Enabled',i->'autoChargeEnabled','Created By',a->'loginEmail','Loan Status','ยังไม่ปิดยอด','Defaulted',false,'Ref Rollover Source Loan',source));
 BEGIN SELECT * INTO component FROM public.first_day_components_v83(l);
 EXCEPTION WHEN SQLSTATE 'P0001' THEN RAISE EXCEPTION USING ERRCODE='P5B06';
 END;
 IF NOT FOUND OR component.principal+component.interest<=0 OR component.principal<>trunc(component.principal) OR component.interest<>trunc(component.interest) THEN RAISE EXCEPTION USING ERRCODE='P5B06';END IF;
 first_charge:='fd6:'||target;first_payment:='fd6:'||first_charge;first_total:=component.principal+component.interest;fee:=coalesce(l."Transfer Fee"::numeric,0);
 first_plan:=jsonb_build_object('borrowerId',parent,'amountReceived',first_total::bigint::text,
  'allocations',jsonb_build_array(jsonb_build_object('chargeId',first_charge,'principal',component.principal::bigint::text,'interest',component.interest::bigint::text,'expectedPrincipalRemaining',component.principal::bigint::text,'expectedInterestRemaining',component.interest::bigint::text,'chargeDate',l."Loan Date"::text)),
  'allocationMethod','First-day Auto','targetChargeId',first_charge,'targetLoanId',NULL,'cashAccountId',l."Ref Disbursed From Cash Account",'paymentDate',l."Loan Date"::text,'paymentMethod','Net-off at Disbursement');
 settle_plan:=jsonb_build_object('borrowerId',parent,'amountReceived',trim_scale(settlement)::text,'allocations',quote->'allocations','allocationMethod','Selected Charges','targetChargeId',NULL,'targetLoanId',NULL,
  'cashAccountId',l."Ref Disbursed From Cash Account",'paymentDate',day::text,'paymentMethod','Net-off at Disbursement');
 -- D6: cash issued to the borrower = principal - (first-day payment + fee) - settlement, never negative (zero allowed).
 cash:=l."Principal Amount"::numeric-first_total-settlement;
 IF cash<0 THEN RAISE EXCEPTION USING ERRCODE='P5B12';END IF;
 SELECT coalesce(sum((x->>'interest')::numeric+coalesce(x->>'lateCharge','0')::numeric),0) INTO profit FROM jsonb_array_elements(quote->'allocations') x;
 profit:=profit+component.interest;
 statement:=jsonb_build_object('businessDate',day::text,'type',o."Loan Type",'principal',trim_scale(l."Principal Amount"::numeric)::text,'documentationFee',trim_scale(fee)::text,
  'firstDayPayment',trim_scale(first_total-fee)::text,'firstDayTotal',trim_scale(first_total)::text,'available',trim_scale(l."Principal Amount"::numeric-first_total)::text,
  'settlement',quote->'settlement','cashIssued',trim_scale(cash)::text,'profit',trim_scale(profit)::text,'quote',quote-'allocations'-'sourceVersion');
 -- The keys the app shows for a loan (create_referral_rebate's form): borrower - English name-฿principal-DD/MM-rate%.
 SELECT coalesce(b."Borrower Name",'')||' - '||coalesce(b."Description",'') INTO old_key FROM public."Borrowers" b WHERE b."Row ID"=parent;
 new_key:=old_key||'-'||coalesce('฿'||to_char(round(l."Principal Amount"::numeric),'FM999,999,999,999,990'),'')||'-'||coalesce(to_char(l."Loan Date",'DD/MM'),'')||'-'||coalesce(public.original_daily_interest_rate(l,false)::text||'%','Unavailable');
 old_key:=old_key||'-'||coalesce('฿'||to_char(round(o."Principal Amount"::numeric),'FM999,999,999,999,990'),'')||'-'||coalesce(to_char(o."Loan Date",'DD/MM'),'')||'-'||coalesce(o."Original Daily Interest Rate"::text||'%','Unavailable');
 result_value:=jsonb_build_object('operation','loan.rollover','targetType','loan','targetId',target,'paymentId',first_payment,'plan',first_plan,'predecessorRequestId',NULL,'sourceCreatedBy',a->>'loginEmail',
  'settlement',jsonb_build_object('paymentId',settle_payment,'plan',settle_plan),
  'rollover',jsonb_build_object('closedLoanId',source,'newLoanId',target,'settlementPaymentId',settle_payment,'firstDayPaymentId',first_payment,'statement',statement));
 -- This row and every triggered effect share the caller's savepoint and outer transaction; both receipts resolve their plans
 -- from it (pwa_effective_payment_plan_v2).
 INSERT INTO public.pwa_payment_commands(request_id,contract_version,actor_issuer,actor_subject,actor_partner_id,actor_login_email,canonical_json,payload_sha256,outcome,payment_id,rejection_code,result_json)
 VALUES((e->>'requestId')::uuid,2,a->>'issuer',a->>'subject',a->>'partnerId',a->>'loginEmail',canonical,encode(sha256(convert_to(canonical,'UTF8')),'hex'),'applied',NULL,NULL,result_value);
 -- O's closing: the R101 lowering of a daily-interest charge dated after D (the V113 trail line, so a later Loan Close of a
 -- reopened loan reads it as settled), then the closing charge.
 FOR f IN SELECT value FROM jsonb_array_elements(CASE WHEN jsonb_typeof(quote->'futureInterest')='array' THEN quote->'futureInterest' ELSE '[]'::jsonb END) LOOP
  UPDATE public."Charges" SET "Interest Due"=(f->>'interestDue')::numeric::money,
   "Notes"=coalesce(nullif("Notes",'')||E'\n','')||'Interest Due lowered from '||trim_scale("Interest Due"::numeric)::text||' by Loan Close '||day::text||E'\n'||'Rollover to loan '||new_key
   WHERE "Row ID"=f->>'chargeId' AND "Ref Loans"=source AND "Charge Date">day AND "Interest Due"::numeric>(f->>'interestDue')::numeric;
  IF NOT FOUND THEN RAISE EXCEPTION 'Rollover plan future charge differs from the loan';END IF;
 END LOOP;
 IF quote->'closingCharge' IS NOT NULL AND quote->'closingCharge'<>'null'::jsonb THEN
  note:='Rollover to loan '||new_key||': '||CASE WHEN o."Loan Type"='ผ่อนชำระรายวัน'
    THEN (quote->>'unchargedDays')||' days not yet charged x ฿'||(quote->>'dailyAmount')||' = '||trim_scale((quote->>'unchargedDays')::numeric*(quote->>'dailyAmount')::numeric)::text||' (principal '||(quote->>'missingPrincipal')||', interest '||(quote->>'remainingInterest')||')'
    ELSE 'outstanding principal '||(quote->>'missingPrincipal')||', interest '||(quote->>'gapDays')||' days x ฿'||(quote->>'dailyAmount')||' = '||(quote->>'gapInterest') END
   ||', early closure penalty ฿'||(quote->>'penalty');
  INSERT INTO public."Charges"("Row ID","Ref Loans","Charge Date","Principal Due","Interest Due","Notes")
   VALUES(quote#>>'{closingCharge,chargeId}',source,day,(quote#>>'{closingCharge,principal}')::numeric::money,(quote#>>'{closingCharge,interest}')::numeric::money,note);
 END IF;
 -- O's settlement: the explicit plan (Selected Charges, no target loan, so never the Loan Close calculation); the ordinary
 -- payment engine closes O with it. The referral trigger is fired inside this command once the payment is Posted.
 SELECT string_agg(value->>'chargeId',' , ' ORDER BY (value->>'chargeId') COLLATE "C") INTO ids FROM jsonb_array_elements(quote->'allocations');
 SET CONSTRAINTS public.referral_loan_closed DEFERRED;
 INSERT INTO public."Payments"("Row ID","Ref Borrower","Payment Date","Amount Received","Payment Method","Allocation Method","Selected Charge IDs","Ref Target Charge","Ref Target Loan","Ref Received By Cash Account","Notes","Created By","Status")
 VALUES(settle_payment,parent,day,settlement::money,'Net-off at Disbursement','Selected Charges',ids,NULL,NULL,l."Ref Disbursed From Cash Account",'Rollover to loan '||new_key,a->>'loginEmail','Processing');
 SELECT * INTO actual FROM public."Payments" WHERE "Row ID"=settle_payment;
 IF NOT FOUND OR actual."Status" IS DISTINCT FROM 'Posted' OR actual."Amount Received"::numeric IS DISTINCT FROM settlement
  OR NOT EXISTS(SELECT 1 FROM public."Loans" WHERE "Row ID"=source AND "Loan Status"='ปิดยอดแล้ว' AND "Ref Closing Payment"=settle_payment) THEN RAISE EXCEPTION 'Rollover settlement differs from immutable plan';END IF;
 SET CONSTRAINTS public.referral_loan_closed IMMEDIATE;
 SET CONSTRAINTS public.referral_loan_closed DEFERRED;
 -- N (the loan.create body plus the link): its first-day charge and net-off follow from the insert.
 BEGIN
  INSERT INTO public."Loans"("Row ID","Ref Borrowers","Loan Date","Principal Amount","Transfer Fee","Ref Disbursed From Cash Account","Loan Type","Due Date","Daily Payment Amount","Fixed Interest","Current Daily Interest","Interest Payment Interval","Loan Arrangement","Auto Charge Enabled","Created By","Loan Status","Defaulted","Interest Schedule Anchor Date","Ref Rollover Source Loan")
  VALUES(l."Row ID",l."Ref Borrowers",l."Loan Date",l."Principal Amount",l."Transfer Fee",l."Ref Disbursed From Cash Account",l."Loan Type",l."Due Date",l."Daily Payment Amount",l."Fixed Interest",l."Current Daily Interest",l."Interest Payment Interval",l."Loan Arrangement",l."Auto Charge Enabled",l."Created By",l."Loan Status",false,NULL,source);
 EXCEPTION WHEN check_violation THEN GET STACKED DIAGNOSTICS message=MESSAGE_TEXT;
  IF message LIKE 'New loan exceeds available cashpool%' THEN RAISE EXCEPTION USING ERRCODE='P5B10';ELSE RAISE EXCEPTION USING ERRCODE='P5B06';END IF;
 WHEN SQLSTATE 'P0001' THEN RAISE EXCEPTION USING ERRCODE='P5B06';
 END;
 SELECT * INTO actual FROM public."Payments" WHERE "Row ID"=first_payment;
 IF NOT FOUND OR actual."Status" IS DISTINCT FROM 'Posted' OR actual."Amount Received"::numeric IS DISTINCT FROM first_total
  OR (SELECT count(*) FROM public."Payment Allocations" WHERE "Ref Payment"=first_payment)<>1
  OR NOT EXISTS(SELECT 1 FROM public."Payment Allocations" WHERE "Ref Payment"=first_payment AND "Ref Charge"=first_charge AND "Allocated Principal"::numeric=component.principal AND "Allocated Interest"::numeric=component.interest) THEN RAISE EXCEPTION 'First-day effect does not match immutable operation plan';END IF;
 -- D7: the daily charge job of today has run and never backfills; N's charge for today is generated now when its schedule
 -- calls for one.
 IF day<today THEN
  BEGIN booked:=public.generate_loan_charge(target,today);
  EXCEPTION WHEN SQLSTATE 'P0001' THEN RAISE EXCEPTION USING ERRCODE='P5B06';
  END;
 END IF;
 RETURN result_value;
END $$;
COMMENT ON FUNCTION public.pwa_apply_loan_rollover_v1(text) IS 'mw-access:governance R136 loan.rollover for pwa_submit_operation_v2: closes the original loan with a net-off settlement and creates the new loan in one transaction; journal owner only.';

-- 4. The journal admits the rollover's outcome and rejection (one counted widening of pwa_versioned_outcome; every other
-- rule is unchanged and existing rows are revalidated).
DO $journal$
DECLARE definition text;
 o1 text:=$o$'sourceCreatedBy'::text, 'rebate'::text]) = '{}'::jsonb)$o$;
 n1 text:=$n$'sourceCreatedBy'::text, 'rebate'::text, 'settlement'::text, 'rollover'::text]) = '{}'::jsonb) AND ((NOT ((result_json ? 'settlement'::text) OR (result_json ? 'rollover'::text))) OR (((result_json ->> 'operation'::text) = 'loan.rollover'::text) AND (jsonb_typeof((result_json -> 'settlement'::text)) = 'object'::text) AND (jsonb_typeof((result_json -> 'rollover'::text)) = 'object'::text)))$n$;
 o2 text:=$o$'record_requires_reconciliation'::text]$o$;
 n2 text:=$n$'record_requires_reconciliation'::text, 'rollover_ineligible'::text]$n$;
BEGIN
 SELECT pg_get_constraintdef(oid) INTO definition FROM pg_constraint WHERE conname='pwa_versioned_outcome' AND conrelid='public.pwa_payment_commands'::regclass;
 IF definition IS NULL OR (length(definition)-length(replace(definition,o1,'')))/length(o1)<>1 OR (length(definition)-length(replace(definition,o2,'')))/length(o2)<>1 THEN RAISE EXCEPTION 'V138: unexpected pwa_versioned_outcome';END IF;
 ALTER TABLE public.pwa_payment_commands DROP CONSTRAINT pwa_versioned_outcome;
 EXECUTE 'ALTER TABLE public.pwa_payment_commands ADD CONSTRAINT pwa_versioned_outcome '||replace(replace(definition,o1,n1),o2,n2);
END $journal$;

-- Each receipt a governed operation creates has one origin row: the first-day receipt of a rollover by paymentId, its
-- settlement by settlement.paymentId.
DROP INDEX public.pwa_operation_receipt_v2;
CREATE UNIQUE INDEX pwa_operation_receipt_v2 ON public.pwa_payment_commands((result_json->>'paymentId'))
 WHERE contract_version=2 AND outcome='applied' AND canonical_json::jsonb#>>'{command,operation}' IN('loan.create','loan.close','charge.create','loan.rollover');
CREATE UNIQUE INDEX pwa_operation_settlement_receipt_v1 ON public.pwa_payment_commands((result_json#>>'{settlement,paymentId}'))
 WHERE contract_version=2 AND outcome='applied' AND canonical_json::jsonb#>>'{command,operation}'='loan.rollover';

-- Exact, counted replacements in a routine's current definition (V137 method); each edit names how often its boundary occurs.
CREATE FUNCTION pg_temp.v138_patch(routine text, edits text[]) RETURNS void LANGUAGE plpgsql AS $patch$
DECLARE definition text:=pg_get_functiondef(routine::regprocedure); k integer; o text; n text; times integer;
BEGIN
 IF position('R136' IN definition)>0 THEN RAISE EXCEPTION 'V138: % is already patched',routine; END IF;
 FOR k IN 1..array_length(edits,1)/3 LOOP
  o:=edits[3*k-2];n:=edits[3*k-1];times:=edits[3*k]::integer;
  IF position(o IN definition)=0 AND position(E'\n' IN o)>0 THEN o:=replace(o,E'\n',E'\r\n');n:=replace(n,E'\n',E'\r\n'); END IF;
  IF (length(definition)-length(replace(definition,o,'')))/length(o)<>times THEN RAISE EXCEPTION 'V138: unexpected % boundary %',routine,k; END IF;
  definition:=replace(definition,o,n);
 END LOOP;
 IF position('R136' IN definition)=0 THEN RAISE EXCEPTION 'V138: % patch carries no R136 marker',routine; END IF;
 EXECUTE definition;
END $patch$;

-- 5. The operation: target N's new UUID (no version), the loan.create keys then the rollover keys; dispatch; P5B12.
SELECT pg_temp.v138_patch('public.pwa_submit_operation_v2(text)',ARRAY[
 $o$'loan.book-projected-charge','loan.close','charge.create'$o$,
 $n$'loan.book-projected-charge','loan.close','loan.rollover','charge.create'$n$,'1',
 $o$IF op IN('borrower.create','loan.create','charge.create'$o$,
 $n$IF op IN('borrower.create','loan.create','loan.rollover','charge.create'$n$,'1',
 $o$ ELSIF op IN('loan.create','loan.update') THEN$o$,
 $n$ ELSIF op IN('loan.create','loan.update','loan.rollover') THEN$n$,'1',
 $o$ IF i ? 'scheduleAnchor' THEN keys:=array_append(keys,'scheduleAnchor');END IF;$o$,
 $n$ IF i ? 'scheduleAnchor' THEN keys:=array_append(keys,'scheduleAnchor');END IF;
 -- R136: a rollover is a new loan (no schedule anchor) plus its original loan, that loan's version, the penalty and the quote.
 IF op='loan.rollover' THEN
  IF i ? 'scheduleAnchor' THEN RAISE EXCEPTION 'rollover anchor';END IF;
  keys:=keys||ARRAY['sourceLoanId','sourceExpectedVersion','penalty','expectedSettlement','expectedPlanHash'];
  IF jsonb_typeof(i->'sourceLoanId') IS DISTINCT FROM 'string' OR octet_length(i->>'sourceLoanId') NOT BETWEEN 1 AND 256 OR i->>'sourceLoanId'~'[[:cntrl:]]'
   OR jsonb_typeof(i->'sourceExpectedVersion') IS DISTINCT FROM 'string' OR i->>'sourceExpectedVersion'!~'^[a-f0-9]{64}$'
   OR jsonb_typeof(i->'penalty') IS DISTINCT FROM 'string' OR i->>'penalty'!~'^(0|[1-9][0-9]{0,16})$' OR (i->>'penalty')::numeric>92233720368547758
   OR jsonb_typeof(i->'expectedSettlement') IS DISTINCT FROM 'string' OR i->>'expectedSettlement'!~'^[1-9][0-9]{0,16}$' OR (i->>'expectedSettlement')::numeric>92233720368547758
   OR jsonb_typeof(i->'expectedPlanHash') IS DISTINCT FROM 'string' OR i->>'expectedPlanHash'!~'^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'rollover input';END IF;
 END IF;$n$,'1',
 $o$IF k IN('borrowerId','disbursingAccountId') AND ((op='loan.create' AND$o$,
 $n$IF k IN('borrowerId','disbursingAccountId') AND ((op IN('loan.create','loan.rollover') AND$n$,'1',
 $o$ IF op='loan.create' AND ((i->>'principal')::numeric IS NULL$o$,
 $n$ IF op IN('loan.create','loan.rollover') AND ((i->>'principal')::numeric IS NULL$n$,'1',
 $o$ELSIF op='loan.close' THEN result_value:=public.pwa_apply_loan_close_v2($1);$o$,
 $n$ELSIF op='loan.close' THEN result_value:=public.pwa_apply_loan_close_v2($1);ELSIF op='loan.rollover' THEN result_value:=public.pwa_apply_loan_rollover_v1($1);$n$,'1',
 $o$WHEN SQLSTATE 'P5B11' THEN rejection:='plan_changed';END;$o$,
 $n$WHEN SQLSTATE 'P5B11' THEN rejection:='plan_changed';WHEN SQLSTATE 'P5B12' THEN rejection:='rollover_ineligible';END;$n$,'1']);

-- 6. Provenance: the first-day receipt of a rollover by paymentId, its settlement by settlement.paymentId.
SELECT pg_temp.v138_patch('public.pwa_effective_payment_plan_v2(text)',ARRAY[
 $o$'charge.create','system.rebate-offset')) OR$o$,
 $n$'charge.create','system.rebate-offset','loan.rollover')) OR
  -- R136: the settlement payment of a rollover.
  (j.contract_version=2 AND j.outcome='applied' AND j.result_json#>>'{settlement,paymentId}'=p_id AND j.canonical_json::jsonb#>>'{command,operation}'='loan.rollover') OR$n$,'2',
 $o$ ELSIF r.result_json#>>'{rebate,offsetPaymentId}'=p_id THEN$o$,
 $n$ ELSIF r.result_json#>>'{settlement,paymentId}'=p_id THEN plan:=r.result_json#>'{settlement,plan}'; -- R136
 ELSIF r.result_json#>>'{rebate,offsetPaymentId}'=p_id THEN$n$,'1']);

SELECT pg_temp.v138_patch('public.pwa_payment_head_v2(text)',ARRAY[
 $o$'charge.create','payment.create');END IF;$o$,
 $n$'charge.create','payment.create','loan.rollover');END IF;
 -- R136: the settlement payment of a rollover.
 IF head IS NULL THEN SELECT request_id INTO head FROM public.pwa_payment_commands WHERE contract_version=2 AND outcome='applied' AND result_json#>>'{settlement,paymentId}'=$1 AND canonical_json::jsonb#>>'{command,operation}'='loan.rollover';END IF;$n$,'1']);

-- 7. An rl138: closing charge on O's loan date is never a first-day charge.
SELECT pg_temp.v138_patch('public.first_day_charge_trigger()',ARRAY[
 $o$AND NOT starts_with(NEW."Row ID",'df10:') THEN$o$,
 $n$AND NOT starts_with(NEW."Row ID",'df10:') AND NOT starts_with(NEW."Row ID",'rl138:') /* R136 */ THEN$n$,'1']);

-- 8. Access: the quote for the application role (the preview read; the journal owner inherits it), the apply for the journal
-- owner only; PROD's default grants removed.
DO $acl$
DECLARE suffix text:=CASE current_database() WHEN 'loan_manager_prod' THEN 'prod' ELSE 'dev' END; app text; journal text; grantee text; routine text;
BEGIN
 app:='mw_app_'||suffix; journal:=app||'_journal_owner';
 FOREACH routine IN ARRAY ARRAY['public.loan_rollover_calculation_v1(text,date,numeric)','public.pwa_apply_loan_rollover_v1(text)'] LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC',routine);
  FOR grantee IN SELECT DISTINCT pg_get_userbyid(a.grantee) FROM pg_proc p CROSS JOIN LATERAL aclexplode(p.proacl) a
    WHERE p.oid=routine::regprocedure AND a.grantee<>0 AND a.grantee<>p.proowner LOOP
   EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %I',routine,grantee);
  END LOOP;
 END LOOP;
 EXECUTE format('GRANT EXECUTE ON FUNCTION public.loan_rollover_calculation_v1(text,date,numeric) TO %I',app);
 EXECUTE format('GRANT EXECUTE ON FUNCTION public.pwa_apply_loan_rollover_v1(text) TO %I',journal);
END $acl$;

-- Self-check.
DO $check$
DECLARE bad text; suffix text:=CASE current_database() WHEN 'loan_manager_prod' THEN 'prod' ELSE 'dev' END; app text; journal text; definition text;
BEGIN
 app:='mw_app_'||suffix; journal:=app||'_journal_owner';
 SELECT string_agg(o.routine,', ') INTO bad FROM v138_routines o JOIN pg_proc p ON p.oid=o.routine::regprocedure
  WHERE pg_get_userbyid(p.proowner)<>o.owner OR p.prosecdef<>o.definer OR p.provolatile<>o.volatile OR p.proconfig IS DISTINCT FROM o.config
   OR obj_description(p.oid,'pg_proc') IS DISTINCT FROM o.comment
   OR (SELECT array_agg(a.grantee::text||':'||a.privilege_type ORDER BY (a.grantee::text||':'||a.privilege_type) COLLATE "C") FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee<>p.proowner)
    IS DISTINCT FROM (SELECT array_agg(a.grantee::text||':'||a.privilege_type ORDER BY (a.grantee::text||':'||a.privilege_type) COLLATE "C") FROM aclexplode(o.effective) a WHERE a.grantee<>p.proowner);
 IF bad IS NOT NULL OR (SELECT count(*) FROM v138_routines)<>4 THEN RAISE EXCEPTION 'V138 changed the owner, privileges, attributes or comment of %',coalesce(bad,'an unexpected routine set'); END IF;
 SELECT string_agg(r,', ') INTO bad FROM unnest(ARRAY['public.pwa_submit_operation_v2(text)','public.pwa_effective_payment_plan_v2(text)','public.pwa_payment_head_v2(text)','public.first_day_charge_trigger()']) r
  WHERE position('R136' IN pg_get_functiondef(r::regprocedure))=0;
 IF bad IS NOT NULL THEN RAISE EXCEPTION 'V138: not patched: %',bad; END IF;
 -- New functions: exact ACLs, invoker rights, the apply's governance comment.
 SELECT string_agg(f.routine,', ') INTO bad FROM (VALUES ('public.loan_rollover_calculation_v1(text,date,numeric)',ARRAY[app||':EXECUTE']),('public.pwa_apply_loan_rollover_v1(text)',ARRAY[journal||':EXECUTE'])) f(routine,expected)
  WHERE (SELECT array_agg(CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END||':'||a.privilege_type ORDER BY (CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END||':'||a.privilege_type) COLLATE "C")
    FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid=f.routine::regprocedure AND a.grantee<>p.proowner) IS DISTINCT FROM f.expected;
 IF bad IS NOT NULL THEN RAISE EXCEPTION 'V138: unexpected access to %',bad; END IF;
 IF EXISTS(SELECT 1 FROM pg_proc WHERE prosecdef AND oid IN ('public.loan_rollover_calculation_v1(text,date,numeric)'::regprocedure,'public.pwa_apply_loan_rollover_v1(text)'::regprocedure))
  OR obj_description('public.pwa_apply_loan_rollover_v1(text)'::regprocedure,'pg_proc') NOT LIKE 'mw-access:governance%' THEN RAISE EXCEPTION 'V138: the new functions'' security or comments differ from the design'; END IF;
 -- The link column: nullable text, FK to "Loans" with ON DELETE RESTRICT.
 IF NOT EXISTS(SELECT 1 FROM pg_constraint c JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=ANY(c.conkey) WHERE c.conrelid='public."Loans"'::regclass AND c.contype='f'
   AND c.confrelid='public."Loans"'::regclass AND a.attname='Ref Rollover Source Loan' AND c.confdeltype='r' AND NOT a.attnotnull AND a.atttypid='text'::regtype) THEN RAISE EXCEPTION 'V138: the rollover link differs from the design'; END IF;
 SELECT pg_get_constraintdef(oid) INTO definition FROM pg_constraint WHERE conname='pwa_versioned_outcome' AND conrelid='public.pwa_payment_commands'::regclass AND convalidated;
 IF definition IS NULL OR position($c$'rollover_ineligible'::text]$c$ IN definition)=0 OR position($c$'settlement'::text, 'rollover'::text]) = '{}'::jsonb)$c$ IN definition)=0 THEN RAISE EXCEPTION 'V138: pwa_versioned_outcome differs from the design'; END IF;
 IF position('loan.rollover' IN pg_get_indexdef('public.pwa_operation_receipt_v2'::regclass))=0 OR NOT (SELECT indisunique FROM pg_index WHERE indexrelid='public.pwa_operation_settlement_receipt_v1'::regclass) THEN
  RAISE EXCEPTION 'V138: the receipt indexes differ from the design'; END IF;
END $check$;
