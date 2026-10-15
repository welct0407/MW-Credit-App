-- Same 153 date keys as the existing Calendar source during the comparison.
-- Date dimension remains available to Daily Analytics; no physical Calendar data table.
CREATE VIEW public."OLAP Calendar SQL Lab" AS
SELECT date '2026-08-01'+n AS "Date" FROM generate_series(0,date '2026-12-31'-date '2026-08-01') n;
SELECT json_build_object('dates',count(*),'first',min("Date"),'last',max("Date")) FROM public."OLAP Calendar SQL Lab";
