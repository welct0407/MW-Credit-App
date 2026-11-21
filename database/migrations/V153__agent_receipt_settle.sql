-- R181 (owner, 21 November 2026: "Why I wasn't given option in the ig to close multiple loans? ... Even without auto closure,
-- loan closure option should be given"; Archie's design, accepted). The agent receipt command gains schemaVersion 11: the
-- v10 keys and 8-key lines, plus principal entries of kind `settle` that carry the Loan Close quote's planHash. It is the
-- Reviewer's numbered close choice in the pay-forward options request (reviewed mode only, slip dated today): one payment
-- of the slip amount closes one or several loans, exactly as the manual receiving command closes loans inside a receipt
-- (R113): the server recomputes the pay-forward plan under the borrower -> loans -> charges locks and requires the command's
-- lines, booked charges and principal entries to equal it, `settles` to equal the command's settle loans and each settle
-- entry's planHash to equal the plan's (apply_loan_close_calculation_v83 checks it again under the locks); the plan's own
-- entries are booked through pwa_apply_pay_forward_v1 with the settle switch on for that one call; every settled loan must
-- end closed; the referral rebate of each closed referred loan follows from referral_loan_closed (V124 default path), as
-- for any payment that closes a loan. The payment is Selected Charges (status function: 11 like 9 and 10).
-- Versions 7 to 10 are unchanged: every edit below is reached only by schemaVersion 11, or widens a version list by 11.
-- Replaced in place (owner, ACL, security, configuration and comment kept; the self-check compares them):
-- pwa_submit_agent_receipt_v1(text), pwa_agent_receipt_status_v1(uuid,text,text). No table, column, trigger or grant.
-- Rollback: a later migration restores the V132 bodies (no v11 row is then readable by the status function; none exists
-- unless the agent switch loan_settle_options_enabled was on).

DO $preflight$
DECLARE problems text[]:='{}'; r record;
BEGIN
 IF current_database() NOT IN ('loan_manager_dev','payment_rehearsal','loan_manager_prod') THEN RAISE EXCEPTION 'Unsupported application database'; END IF;
 IF position('R181' IN pg_get_functiondef('public.pwa_submit_agent_receipt_v1(text)'::regprocedure))>0 THEN problems:=problems||'V153: the agent receipt command already accepts v11'::text; END IF;
 IF position($s$IF entry->>'kind'='settle' THEN$s$ IN pg_get_functiondef('public.pwa_apply_pay_forward_v1(jsonb,jsonb,date)'::regprocedure))=0 THEN problems:=problems||'V153 needs the V126 settle writer'::text; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=current_user AND rolsuper) THEN
  -- Replacing a routine needs its owner's authority (the owner window of the release).
  FOR r IN SELECT DISTINCT pg_get_userbyid(p.proowner) AS owner FROM pg_proc p WHERE p.oid IN
    ('public.pwa_submit_agent_receipt_v1(text)'::regprocedure,'public.pwa_agent_receipt_status_v1(uuid,text,text)'::regprocedure) LOOP
   IF NOT pg_has_role(current_user,r.owner,'USAGE') THEN problems:=problems||format('%s cannot replace routines owned by %s (owner window required)',current_user,r.owner); END IF;
  END LOOP;
 END IF;
 IF cardinality(problems)>0 THEN RAISE EXCEPTION 'V153 preflight: %',array_to_string(problems,'; '); END IF;
END $preflight$;

CREATE TEMP TABLE v153_routines ON COMMIT DROP AS
 SELECT r.name AS routine,p.oid AS old_oid,pg_get_userbyid(p.proowner) AS owner,coalesce(p.proacl,acldefault('f',p.proowner)) AS effective,
  p.prosecdef AS definer,p.provolatile AS volatile,p.proconfig AS config,obj_description(p.oid,'pg_proc') AS comment
 FROM unnest(ARRAY['public.pwa_submit_agent_receipt_v1(text)','public.pwa_agent_receipt_status_v1(uuid,text,text)']) r(name)
 JOIN pg_proc p ON p.oid=r.name::regprocedure;

-- Exact text patches of the current definitions (each boundary must occur exactly once), then CREATE OR REPLACE.
CREATE FUNCTION pg_temp.v153_patch(routine text, edits text[], all_old text DEFAULT NULL, all_new text DEFAULT NULL, all_count integer DEFAULT 0) RETURNS void LANGUAGE plpgsql AS $patch$
DECLARE definition text:=pg_get_functiondef(routine::regprocedure); k integer; o text; n text;
BEGIN
 IF position('R181' IN definition)>0 THEN RAISE EXCEPTION 'V153: % is already patched',routine; END IF;
 IF all_old IS NOT NULL THEN
  IF (length(definition)-length(replace(definition,all_old,'')))/length(all_old)<>all_count THEN
   RAISE EXCEPTION 'V153: % has % occurrences of %, expected %',routine,(length(definition)-length(replace(definition,all_old,'')))/length(all_old),all_old,all_count; END IF;
  definition:=replace(definition,all_old,all_new);
 END IF;
 FOR k IN 1..coalesce(array_length(edits,1),0)/2 LOOP
  o:=edits[2*k-1];n:=edits[2*k];
  IF position(o IN definition)=0 AND position(E'\n' IN o)>0 THEN o:=replace(o,E'\n',E'\r\n');n:=replace(n,E'\n',E'\r\n'); END IF;
  IF (length(definition)-length(replace(definition,o,'')))/length(o)<>1 THEN RAISE EXCEPTION 'V153: unexpected % boundary %',routine,k; END IF;
  definition:=replace(definition,o,n);
 END LOOP;
 IF position('R181' IN definition)=0 THEN RAISE EXCEPTION 'V153: % patch carries no R181 marker',routine; END IF;
 EXECUTE definition;
END $patch$;

-- 1. pwa_submit_agent_receipt_v1: every "9 or 10" list gains 11 (command keys, the plan block, the payment's allocation
-- method and selected charges, the post-posting refresh), then the v11 rules.
SELECT pg_temp.v153_patch('public.pwa_submit_agent_receipt_v1(text)',ARRAY[
 $o$IF octet_length($1)>16384 AND c->'schemaVersion' NOT IN ('9'::jsonb,'10'::jsonb) THEN RAISE EXCEPTION 'size'; END IF;$o$,
 $n$IF octet_length($1)>16384 AND c->'schemaVersion' NOT IN ('9'::jsonb,'10'::jsonb,'11'::jsonb) THEN RAISE EXCEPTION 'size'; END IF;$n$,
 $o$OR c->'schemaVersion' NOT IN ('7'::jsonb,'8'::jsonb,'9'::jsonb,'10'::jsonb) OR (c->>'environment')<>environment$o$,
 $n$OR c->'schemaVersion' NOT IN ('7'::jsonb,'8'::jsonb,'9'::jsonb,'10'::jsonb,'11'::jsonb) OR (c->>'environment')<>environment$n$,
 $o$IF c->'schemaVersion' IN ('8'::jsonb,'9'::jsonb,'10'::jsonb) AND c->'payerLines'<>'null'::jsonb THEN$o$,
 $n$IF c->'schemaVersion' IN ('8'::jsonb,'9'::jsonb,'10'::jsonb,'11'::jsonb) AND c->'payerLines'<>'null'::jsonb THEN$n$,
 $o$IS DISTINCT FROM (CASE WHEN c->'schemaVersion'='10'::jsonb
     -- R118 agent v10: the 8-key line with the late charge and its expected remaining.$o$,
 $n$IS DISTINCT FROM (CASE WHEN c->'schemaVersion' IN ('10'::jsonb,'11'::jsonb)
     -- R118 agent v10 (R181 v11 too): the 8-key line with the late charge and its expected remaining.$n$,
 -- R181 v11: a settle entry carries the quote's planHash (8 keys); raise and book keep their 7 keys.
 $o$IF jsonb_typeof(entry) IS DISTINCT FROM 'object' OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(entry) key) IS DISTINCT FROM ARRAY['accruedInterest','amount','chargeDate','chargeId','kind','loanId','principalDue'] THEN RAISE EXCEPTION 'principal entry'; END IF;
    FOREACH k IN ARRAY ARRAY['loanId','kind','chargeId','chargeDate','amount','accruedInterest','principalDue'] LOOP$o$,
 $n$IF jsonb_typeof(entry) IS DISTINCT FROM 'object' OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(entry) key) IS DISTINCT FROM (CASE WHEN c->'schemaVersion'='11'::jsonb AND entry->>'kind'='settle'
     -- R181 v11: the settle entry of a Reviewer's close choice, with the Loan Close quote's planHash.
     THEN ARRAY['accruedInterest','amount','chargeDate','chargeId','kind','loanId','planHash','principalDue']
     ELSE ARRAY['accruedInterest','amount','chargeDate','chargeId','kind','loanId','principalDue'] END) THEN RAISE EXCEPTION 'principal entry'; END IF;
    FOREACH k IN ARRAY ARRAY['loanId','kind','chargeId','chargeDate','amount','accruedInterest','principalDue']||(CASE WHEN entry ? 'planHash' THEN ARRAY['planHash'] ELSE ARRAY[]::text[] END) LOOP$n$,
 $o$IF entry->>'kind' NOT IN ('raise','book') THEN RAISE EXCEPTION 'principal kind'; END IF;$o$,
 $n$IF entry->>'kind' NOT IN ('raise','book') AND NOT (c->'schemaVersion'='11'::jsonb AND entry->>'kind'='settle' AND entry->>'planHash'~'^[a-f0-9]{64}$') THEN RAISE EXCEPTION 'principal kind'; END IF;$n$,
 $o$||',"accruedInterest":'||to_json(entry->>'accruedInterest')::text||',"principalDue":'||to_json(entry->>'principalDue')::text||'}';
   END LOOP;$o$,
 $n$||',"accruedInterest":'||to_json(entry->>'accruedInterest')::text||',"principalDue":'||to_json(entry->>'principalDue')::text
     ||CASE WHEN entry ? 'planHash' THEN ',"planHash":'||to_json(entry->>'planHash')::text ELSE '' END||'}';
   END LOOP;$n$,
 $o$IF loans IS DISTINCT FROM coalesce(sorted_ids,ARRAY[]::text[]) THEN RAISE EXCEPTION 'principal order'; END IF;$o$,
 $n$IF loans IS DISTINCT FROM coalesce(sorted_ids,ARRAY[]::text[]) THEN RAISE EXCEPTION 'principal order'; END IF;
   -- R181 v11: at least one settle entry (a v11 command is a close choice; anything else is v10).
   IF c->'schemaVersion'='11'::jsonb AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(c->'principal') s WHERE s.value->>'kind'='settle') THEN RAISE EXCEPTION 'settle'; END IF;$n$,
 -- R181 v11: the plan settles exactly the command's settle loans; the principal comparison includes each settle planHash.
 $o$OR plan->'materialize' IS DISTINCT FROM c->'materialize' OR plan->>'uncovered' IS DISTINCT FROM '0' OR plan->'settles' IS DISTINCT FROM '[]'::jsonb$o$,
 $n$OR plan->'materialize' IS DISTINCT FROM c->'materialize' OR plan->>'uncovered' IS DISTINCT FROM '0'
    OR plan->'settles' IS DISTINCT FROM (CASE WHEN c->'schemaVersion'='11'::jsonb THEN (SELECT coalesce(jsonb_agg(s.value->'loanId' ORDER BY s.value->>'loanId' COLLATE "C"),'[]'::jsonb)
     FROM jsonb_array_elements(c->'principal') s WHERE s.value->>'kind'='settle') ELSE '[]'::jsonb END) -- R181 v11$n$,
 $o$'principalDue',y->'principalDue') ORDER BY y->>'loanId' COLLATE "C"),'[]'::jsonb)$o$,
 $n$'principalDue',y->'principalDue')||CASE WHEN c->'schemaVersion'='11'::jsonb AND y->>'kind'='settle' THEN jsonb_build_object('planHash',y->'planHash') ELSE '{}'::jsonb END ORDER BY y->>'loanId' COLLATE "C"),'[]'::jsonb)$n$,
 -- R181 v11 (as the manual command, R113): the plan's own entries are booked with settling switched on for this call only.
 $o$PERFORM public.pwa_apply_pay_forward_v1(c->'principal',c->'materialize',today);$o$,
 $n$IF c->'schemaVersion'='11'::jsonb THEN
    PERFORM set_config('pwa.pay_forward_settle','on',true); -- R181 v11
    PERFORM public.pwa_apply_pay_forward_v1(plan->'principal',c->'materialize',today);
    PERFORM set_config('pwa.pay_forward_settle','',true);
   ELSE
    PERFORM public.pwa_apply_pay_forward_v1(c->'principal',c->'materialize',today);
   END IF;$n$,
 $o$FOR entry IN SELECT value FROM jsonb_array_elements(plan->'principal') LOOP$o$,
 $n$FOR entry IN SELECT value FROM jsonb_array_elements(plan->'principal') WHERE value->>'kind' IS DISTINCT FROM 'settle' LOOP -- R181: a settled loan has no new daily amount$n$,
 $o$   END LOOP;
  END IF;
  -- R095: learn the payer lines$o$,
 $n$   END LOOP;
   -- R181 v11: the payment closed every loan it settles (close_payment_loans, unchanged), else nothing posts.
   IF c->'schemaVersion'='11'::jsonb AND EXISTS(SELECT 1 FROM jsonb_array_elements(plan->'principal') e JOIN public."Loans" x ON x."Row ID"=e.value->>'loanId'
     WHERE e.value->>'kind'='settle' AND x."Loan Status" IS DISTINCT FROM 'ปิดยอดแล้ว') THEN RAISE EXCEPTION USING ERRCODE='P4C05';END IF;
  END IF;
  -- R095: learn the payer lines$n$],
 $a$c->'schemaVersion' IN ('9'::jsonb,'10'::jsonb)$a$,$a$c->'schemaVersion' IN ('9'::jsonb,'10'::jsonb,'11'::jsonb)$a$,6);

-- 2. pwa_agent_receipt_status_v1: v11 rows are readable, Selected Charges like 9 and 10.
SELECT pg_temp.v153_patch('public.pwa_agent_receipt_status_v1(uuid,text,text)',ARRAY[
 $o$IN ('7','8','9','10') AND p.canonical_json::jsonb->'command' ? 'reviewId'; -- R118: agent v10$o$,
 $n$IN ('7','8','9','10','11') AND p.canonical_json::jsonb->'command' ? 'reviewId'; -- R118: agent v10; R181: agent v11$n$,
 $o$CASE WHEN c->>'schemaVersion' IN ('9','10') THEN 'Selected Charges' ELSE 'Lump Sum' END$o$,
 $n$CASE WHEN c->>'schemaVersion' IN ('9','10','11') THEN 'Selected Charges' ELSE 'Lump Sum' END$n$]);

-- Self-check: both routines keep owner, ACL, security, volatility, configuration and comment, and now name R181.
DO $check$
DECLARE r record;
BEGIN
 FOR r IN SELECT v.*,p.oid AS new_oid,pg_get_userbyid(p.proowner) AS new_owner,coalesce(p.proacl,acldefault('f',p.proowner)) AS new_effective,
   p.prosecdef AS new_definer,p.provolatile AS new_volatile,p.proconfig AS new_config,obj_description(p.oid,'pg_proc') AS new_comment
  FROM v153_routines v JOIN pg_proc p ON p.oid=v.routine::regprocedure LOOP
  IF r.new_oid<>r.old_oid OR r.new_owner<>r.owner OR r.new_effective::text<>r.effective::text OR r.new_definer<>r.definer OR r.new_volatile<>r.volatile
    OR r.new_config IS DISTINCT FROM r.config OR r.new_comment IS DISTINCT FROM r.comment THEN RAISE EXCEPTION 'V153: % changed its header, owner or ACL',r.routine; END IF;
  IF position('R181' IN pg_get_functiondef(r.new_oid))=0 THEN RAISE EXCEPTION 'V153: % was not replaced',r.routine; END IF;
 END LOOP;
END $check$;
