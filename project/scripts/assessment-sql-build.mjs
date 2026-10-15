import fs from 'node:fs/promises';
const out='C:/GitHub/AppSheet-Loan-Project/outputs/assessment-sql-20260915';
await fs.mkdir(out,{recursive:true});
// Pure calculation accepts normalized, anonymous test data as well as database input.
const sql=String.raw`BEGIN;
DO $$ BEGIN IF current_database()<>'loan_manager_prod' THEN RAISE EXCEPTION 'Wrong database'; END IF; END $$;
CREATE SCHEMA IF NOT EXISTS assessment_lab;
CREATE OR REPLACE FUNCTION assessment_lab.forecast(p_loans jsonb,p_charges jsonb,p_amount numeric,p_rate numeric,p_asof date,p_start date,p_end date)
RETURNS TABLE(day date,principal numeric,interest numeric,minimum_profit numeric,coverage numeric,margin numeric,contract_outstanding numeric)
LANGUAGE sql IMMUTABLE AS $fn$
WITH loans AS MATERIALIZED (
 SELECT * FROM jsonb_to_recordset(p_loans) AS l(id text,kind text,auto boolean,start_date date,due_date date,principal numeric,outstanding numeric,received_interest numeric,daily_interest numeric,fixed_interest numeric,daily_payment numeric,last_charge date)
), charges AS MATERIALIZED (
 SELECT * FROM jsonb_to_recordset(p_charges) AS c(loan_id text,charge_date date,principal_due numeric,principal_remaining numeric,amount_remaining numeric)
), days AS (SELECT p_start+g AS d FROM generate_series(0,p_end-p_start)g),
daily AS (
 SELECT d,
 COALESCE((SELECT sum(outstanding) FROM loans WHERE (auto AND kind='ดอกเบี้ยรายวัน' AND daily_interest<>0) OR (auto AND kind='กำหนดวันชำระ' AND due_date>d)),0) AS revolving_out,
 COALESCE((SELECT sum(principal) FROM loans WHERE (auto AND kind='ดอกเบี้ยรายวัน' AND daily_interest<>0) OR (auto AND kind='กำหนดวันชำระ' AND due_date>d)),0) AS revolving_base,
 COALESCE((SELECT sum(principal*(start_date-date '2000-01-01')) FROM loans WHERE (auto AND kind='ดอกเบี้ยรายวัน' AND daily_interest<>0) OR (auto AND kind='กำหนดวันชำระ' AND due_date>d)),0) AS revolving_weight,
 COALESCE((SELECT sum(outstanding) FROM loans WHERE start_date<=d AND (kind='ผ่อนชำระรายวัน' OR NOT auto OR (kind='ดอกเบี้ยรายวัน' AND daily_interest=0))),0) AS installment_out,
 COALESCE((SELECT sum(principal) FROM loans WHERE start_date<=d AND ((kind='ผ่อนชำระรายวัน' AND auto AND due_date>=start_date AND daily_payment>0) OR NOT auto OR (kind='ดอกเบี้ยรายวัน' AND daily_interest=0))),0) AS installment_base,
 COALESCE((SELECT sum(floor(principal/(due_date-start_date+1))+CASE WHEN d-start_date+1<=mod(principal,(due_date-start_date+1)::numeric) THEN 1 ELSE 0 END) FROM loans WHERE kind='ผ่อนชำระรายวัน' AND auto AND due_date>=start_date AND daily_payment>0 AND d BETWEEN start_date AND due_date),0)
 +COALESCE((SELECT sum(c.principal_due) FROM charges c JOIN loans l ON l.id=c.loan_id WHERE c.charge_date=d AND (NOT auto OR (kind='ดอกเบี้ยรายวัน' AND daily_interest=0))),0) AS contract_due,
 COALESCE((SELECT sum(floor(principal/(due_date-start_date+1))+CASE WHEN d-start_date+1<=mod(principal,(due_date-start_date+1)::numeric) THEN 1 ELSE 0 END) FROM loans WHERE kind='ผ่อนชำระรายวัน' AND auto AND due_date>=start_date AND daily_payment>0 AND d BETWEEN start_date AND due_date AND d>COALESCE(last_charge,start_date-1)),0)
 +COALESCE((SELECT sum(c.principal_remaining) FROM charges c JOIN loans l ON l.id=c.loan_id WHERE c.charge_date=d AND d>p_asof AND (NOT auto OR (kind='ดอกเบี้ยรายวัน' AND daily_interest=0))),0) AS future_principal,
 COALESCE((SELECT sum(daily_payment) FROM loans WHERE kind='ผ่อนชำระรายวัน' AND auto AND due_date>=start_date AND daily_payment>0 AND d BETWEEN start_date AND due_date AND d>COALESCE(last_charge,start_date-1)),0)
 +COALESCE((SELECT sum(c.amount_remaining) FROM charges c JOIN loans l ON l.id=c.loan_id WHERE c.charge_date=d AND d>p_asof AND (NOT auto OR (kind='ดอกเบี้ยรายวัน' AND daily_interest=0))),0) AS future_total,
 COALESCE((SELECT sum(received_interest) FROM loans),0)
 + COALESCE((SELECT sum(daily_interest) FROM loans WHERE auto AND kind='ดอกเบี้ยรายวัน'),0)*greatest(d-p_asof,0)
 + COALESCE((SELECT sum(fixed_interest) FROM loans WHERE auto AND kind='กำหนดวันชำระ' AND due_date>p_asof AND due_date<=d),0) AS noninstallment_interest
 FROM days
), accumulated AS (
 SELECT *,sum(future_principal) OVER(ORDER BY d) fp,sum(future_total-future_principal) OVER(ORDER BY d) fi,
 greatest(0,installment_base-sum(contract_due) OVER(ORDER BY d)) co FROM daily
), results AS (
 SELECT d,revolving_out+greatest(0,installment_out-fp) pr,
 noninstallment_interest+fi intr,
 p_rate*((d-date '2000-01-01'+1)*revolving_base-revolving_weight+sum(co) OVER(ORDER BY d)) profit,co FROM accumulated
)
SELECT d,pr,intr,profit,pr+p_amount+profit,intr-pr-p_amount-profit,co FROM results ORDER BY d
$fn$;
CREATE OR REPLACE FUNCTION assessment_lab.inputs(p_borrower text) RETURNS jsonb LANGUAGE sql STABLE AS $fn$
WITH repayments_loan AS (SELECT "Ref Loans" id,sum("Principal Paid"::numeric) pp,sum("Interest Paid"::numeric) ip FROM public."Repayments" GROUP BY 1),
repayments_charge AS (SELECT "Ref Charges" id,sum("Principal Paid"::numeric) pp,sum("Interest Paid"::numeric) ip FROM public."Repayments" GROUP BY 1),
loans AS MATERIALIZED(SELECT l.*,coalesce(r.pp,0) pp,coalesce(r.ip,0) ip FROM public."Loans" l LEFT JOIN repayments_loan r ON r.id=l."Row ID" WHERE "Ref Borrowers"=p_borrower AND "Loan Status"='ยังไม่ปิดยอด')
SELECT jsonb_build_object('loans',coalesce((SELECT jsonb_agg(jsonb_build_object('id',"Row ID",'kind',"Loan Type",'auto',coalesce("Auto Charge Enabled",false),'start_date',"Loan Date",'due_date',"Due Date",'principal',"Principal Amount"::numeric,'outstanding',"Principal Amount"::numeric-pp,'received_interest',ip,'daily_interest',coalesce("Current Daily Interest"::numeric,0),'fixed_interest',coalesce("Fixed Interest"::numeric,0),'daily_payment',coalesce("Daily Payment Amount"::numeric,0),'last_charge',(SELECT max("Charge Date") FROM public."Charges" c WHERE c."Ref Loans"=loans."Row ID"))) FROM loans),'[]'::jsonb),
'charges',coalesce((SELECT jsonb_agg(jsonb_build_object('loan_id',c."Ref Loans",'charge_date',c."Charge Date",'principal_due',coalesce(c."Principal Due"::numeric,0),'principal_remaining',coalesce(c."Principal Due"::numeric,0)-coalesce(r.pp,0),'amount_remaining',coalesce(c."Principal Due"::numeric,0)+coalesce(c."Interest Due"::numeric,0)-coalesce(r.pp,0)-coalesce(r.ip,0))) FROM public."Charges" c JOIN loans l ON l."Row ID"=c."Ref Loans" LEFT JOIN repayments_charge r ON r.id=c."Row ID"),'[]'::jsonb))
$fn$;
COMMIT;
SELECT json_build_object('installed',true,'schema','assessment_lab','production_tables_changed',false);
`;
await fs.writeFile(out+'/01-calculation.sql',sql);
console.log('Calculation SQL generated; no database execution.');
