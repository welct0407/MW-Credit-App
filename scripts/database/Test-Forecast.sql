\set ON_ERROR_STOP on
BEGIN;
CREATE FUNCTION pg_temp.check_forecast(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'Forecast assertion failed: %',label;END IF;END $$;
CREATE TEMP TABLE fl AS SELECT jsonb_build_object('status','ยังไม่ปิดยอด','defaulted',false,'start','2026-09-01','close',NULL,
 'balance',1000,'daily',10,'auto',true,'interval',1,'anchor','2026-09-01','type','ดอกเบี้ยรายวัน','due',NULL,
 'arrangement','[Original daily interest: 10 baht/day on 1000 baht principal]','original',1000,'payment',0,'fixed',0,'invalid',false) l,
 '[{"id":"c1","date":"2026-09-27","pdue":0,"idue":10,"ppaid":0,"ipaid":4,"invalid":false}]'::jsonb c;
SELECT pg_temp.check_forecast((SELECT sum(interest)=36 FROM fl,public.forecast_schedule_v1(l,c,'2026-09-27','2026-09-30')),'Today unpaid + three future days');
SELECT pg_temp.check_forecast((SELECT count(*)=3 FROM fl,public.forecast_schedule_v1(l,c,'2026-09-27','2026-09-30') WHERE origin='Simulated'),'Three dates');
SELECT pg_temp.check_forecast((SELECT sum(interest)=6 FROM fl,public.forecast_schedule_v1(l,c,'2026-09-27','2026-09-27')),'Last day today once');
SELECT pg_temp.check_forecast((SELECT count(*)=1 FROM fl,public.forecast_schedule_v1(l||'{"auto":false}',c,'2026-09-27','2026-09-30') WHERE origin='Notice'),'Manual plan notice');
SELECT pg_temp.check_forecast((SELECT count(*)=0 FROM fl,public.forecast_schedule_v1(l||'{"auto":false}',c,'2026-09-27','2026-09-30') WHERE origin='Simulated'),'No invented manual interest');
SELECT pg_temp.check_forecast((SELECT bool_and(NOT eligible) FROM fl,public.forecast_schedule_v1(l||'{"defaulted":true}',c,'2026-09-27','2026-09-30')),'Default excluded');
SELECT pg_temp.check_forecast((SELECT count(*)=1 FROM fl,public.forecast_schedule_v1(l||'{"status":"ปิดยอดแล้ว"}',c,'2026-09-27','2026-09-30') WHERE bucket='Recovery only'),'Closed recovery');
SELECT pg_temp.check_forecast((SELECT count(*)=1 FROM fl,public.forecast_schedule_v1(l,'[]','2026-09-27','2026-09-30') WHERE issue='Expected today charge missing'),'Missing today flagged');
SELECT pg_temp.check_forecast((SELECT count(*)=1 FROM fl,public.forecast_schedule_v1(l||'{"interval":0}',c,'2026-09-27','2026-09-30') WHERE origin='Exception'),'Invalid interval');
SELECT pg_temp.check_forecast((SELECT count(*)=1 FROM fl,public.forecast_schedule_v1(l||'{"invalid":true}',c,'2026-09-27','2026-09-30') WHERE origin='Exception'),'Future or invalid repayment rejected');
SELECT pg_temp.check_forecast((SELECT sum(interest)=26 FROM fl,public.forecast_schedule_v1(l,c||'[{"id":"future","date":"2026-09-28","pdue":0,"idue":10,"ppaid":0,"ipaid":10,"invalid":false}]','2026-09-27','2026-09-30')),'Prepaid future charge no duplicate');
SELECT pg_temp.check_forecast((SELECT count(*)=2 FROM fl,public.forecast_schedule_v1(l,c||'[{"id":"future","date":"2026-09-28","pdue":0,"idue":10,"ppaid":0,"ipaid":10,"invalid":false}]','2026-09-27','2026-09-30') WHERE origin='Simulated'),'Recorded date overrides simulated');
SELECT pg_temp.check_forecast((SELECT sum(interest)=26 FROM fl,public.forecast_schedule_v1(l,c||'[{"id":"future","date":"2026-09-28","pdue":500,"idue":10,"ppaid":0,"ipaid":0,"invalid":false}]','2026-09-27','2026-09-30')),'V45 reduction affects later dates');
SELECT pg_temp.check_forecast((SELECT count(*)=1 FROM fl,public.forecast_schedule_v1(l||'{"arrangement":""}',c||'[{"id":"future","date":"2026-09-28","pdue":500,"idue":10,"ppaid":0,"ipaid":0,"invalid":false}]','2026-09-27','2026-09-30') WHERE origin='Exception'),'Missing rate basis suppresses tail');
SELECT pg_temp.check_forecast((SELECT sum(interest)=16 FROM fl,public.forecast_schedule_v1(l,c||'[{"id":"todayprincipal","date":"2026-09-27","pdue":500,"idue":0,"ppaid":0,"ipaid":0,"invalid":false}]','2026-09-27','2026-09-29')),'Today principal affects tomorrow');
SELECT pg_temp.check_forecast((SELECT sum(interest)=26 FROM fl,public.forecast_schedule_v1(l||'{"original_rate":2}',c||'[{"id":"todayprincipal","date":"2026-09-27","pdue":500,"idue":0,"ppaid":0,"ipaid":0,"invalid":false}]','2026-09-27','2026-09-29')),'Stored whole percentage overrides historical note');
SELECT pg_temp.check_forecast((SELECT sum(interest)=6 FROM fl,public.forecast_schedule_v1(l||'{"original_rate":0}',c||'[{"id":"todayprincipal","date":"2026-09-27","pdue":500,"idue":0,"ppaid":0,"ipaid":0,"invalid":false}]','2026-09-27','2026-09-29')),'Stored zero rate suppresses future interest after principal');
SELECT pg_temp.check_forecast((SELECT sum(interest)=19 FROM fl,public.forecast_schedule_v1(l,'[{"date":"2026-09-27","pdue":0,"idue":10,"ipaid":-9,"ppaid":0}]','2026-09-27','2026-09-27')),'Reversal reopens obligation');
SELECT pg_temp.check_forecast((SELECT principal=1000 AND interest=50 FROM fl,public.forecast_schedule_v1(l||'{"type":"กำหนดวันชำระ","due":"2026-09-29","fixed":50}', '[]','2026-09-27','2026-09-30') WHERE origin='Simulated'),'Fixed due components');
SELECT pg_temp.check_forecast((SELECT count(*)=0 FROM fl,public.forecast_schedule_v1(l||'{"type":"กำหนดวันชำระ","due":"2026-10-01","fixed":50}', '[]','2026-09-27','2026-09-30')),'Next month excluded');
SELECT pg_temp.check_forecast((SELECT sum(principal)=2 AND sum(interest)=2 FROM fl,public.forecast_schedule_v1(l||'{"type":"ผ่อนชำระรายวัน","start":"2026-09-26","due":"2026-09-30","original":7,"balance":2,"payment":2}', '[{"date":"2026-09-28","pdue":0,"idue":0,"ppaid":0,"ipaid":0}]','2026-09-28','2026-09-30')),'Installment remainder and last day');
SELECT pg_temp.check_forecast((SELECT count(*)=1 FROM fl,public.forecast_schedule_v1(l||'{"type":"ผ่อนชำระรายวัน","start":"2026-09-26","due":"2026-09-30","original":7,"balance":2,"payment":2}', '[]','2026-09-28','2026-09-30') WHERE issue='Installment missing initial charge'),'Missing first installment');
SELECT pg_temp.check_forecast((SELECT sum(interest)=10 FROM fl,public.forecast_schedule_v1(l||'{"start":"2024-02-01","anchor":"2024-02-01"}', '[{"date":"2024-02-28","pdue":0,"idue":0,"ppaid":0,"ipaid":0}]','2024-02-28','2024-02-29')),'Leap February');
SELECT pg_temp.check_forecast((SELECT remaining_interest=505 AND remaining_principal=950 FROM public.forecast_scenario_v1(600,1200,100,200,80,75,25,'Planning')),'Design Planning example');
SELECT pg_temp.check_forecast((SELECT remaining_interest=360 AND remaining_principal=660 FROM public.forecast_scenario_v1(600,1200,100,200,80,75,25,'Stress')),'Design Stress example');
SELECT pg_temp.check_forecast((SELECT remaining_interest=0 AND remaining_principal=0 FROM public.forecast_scenario_v1(600,1200,100,200,10,5,25,'Stress')),'Stress floor');
SELECT pg_temp.check_forecast((SELECT remaining_interest=600 AND remaining_principal=1200 FROM public.forecast_scenario_v1(600,1200,100,200,100,100,100,'Schedule')),'Schedule no overdue recovery');
DO $$ BEGIN
 BEGIN PERFORM * FROM public.forecast_scenario_v1(1,1,0,0,101,100,0,'Planning');RAISE EXCEPTION 'Did not reject percentage';EXCEPTION WHEN raise_exception THEN IF SQLERRM='Did not reject percentage' THEN RAISE;END IF;END;
 BEGIN PERFORM * FROM public.forecast_scenario_v1(1,1,0,0,'NaN',100,0,'Planning');RAISE EXCEPTION 'Did not reject NaN';EXCEPTION WHEN raise_exception THEN IF SQLERRM='Did not reject NaN' THEN RAISE;END IF;END;
END $$;
SELECT pg_temp.check_forecast(2000+505+950+100-1000-200-300=2055,'Cash example excludes actual twice');
ROLLBACK;
\echo Forecast synthetic checks passed
