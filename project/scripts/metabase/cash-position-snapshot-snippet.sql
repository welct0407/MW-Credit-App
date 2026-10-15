WITH clock AS (
 SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date AS today,
 CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok' AS queried_at
), dates AS (
 SELECT generate_series(coalesce((SELECT min("Date") FROM {{model:daily-cash-snapshot}}),c.today),c.today,interval '1 day')::date AS "Date"
 FROM clock c
), selected AS (
 SELECT max(d."Date") AS position_date FROM dates d WHERE true [[AND {{position_date}}]]
), accounts AS (
 SELECT a."Cash Account ID",a."Cash Holder ID",a."Cash Holder",a."Account",
 CASE WHEN a."Initialized" THEN a."Current Balance" END AS "Balance",a."Balance Status",
 NULL::timestamp AS "Generated At"
 FROM {{model:cash-accounts}} a CROSS JOIN selected s CROSS JOIN clock c WHERE s.position_date=c.today
 UNION ALL
 SELECT a."Cash Account ID",a."Cash Holder ID",a."Cash Holder",a."Account",a."Balance",a."Balance Status",a."Generated At"
 FROM {{model:account-cash-snapshot}} a CROSS JOIN selected s CROSS JOIN clock c WHERE a."Date"=s.position_date AND s.position_date<c.today
), position AS (
 SELECT p."Available Cash" AS remaining,
 (SELECT CASE WHEN count(*)>0 AND bool_and("Balance" IS NOT NULL) THEN sum("Balance") END FROM accounts) AS cash,
 NULL::timestamp AS generated_at,NULL::date AS available_from,
 CASE WHEN (SELECT count(*)>0 AND bool_and("Balance" IS NOT NULL) FROM accounts) THEN 'Known' ELSE 'Opening balance missing' END AS status
 FROM {{model:portfolio}} p CROSS JOIN selected s CROSS JOIN clock c WHERE s.position_date=c.today
 UNION ALL
 SELECT p."Remaining Lending Capital",p."Net Cash Balance",p."Generated At",p."Available From",p."Balance Status"
 FROM {{model:daily-cash-snapshot}} p CROSS JOIN selected s CROSS JOIN clock c WHERE p."Date"=s.position_date AND s.position_date<c.today
)
SELECT s.position_date AS "Position Date",
 CASE WHEN s.position_date=c.today THEN 'Real-time · on report refresh' WHEN s.position_date<c.today THEN 'Daily Analytics · hourly refresh' ELSE 'No date in reporting range' END AS "Data Source",
 CASE WHEN s.position_date=c.today THEN c.queried_at ELSE p.generated_at END AS "As Of",
 p.available_from AS "Cash Available From",
 CASE WHEN s.position_date IS NULL THEN 'No date in available reporting range'
 WHEN p.status IS NULL THEN 'Snapshot missing — rebuild required'
 WHEN s.position_date<c.today AND (a."Cash Account ID" IS NULL OR a."Generated At" IS DISTINCT FROM p.generated_at) THEN 'Account snapshot missing or refresh times differ'
 ELSE p.status END AS "Availability",
 p.remaining AS "Remaining Lending Capital",p.cash AS "Net Cash Balance",
 a."Cash Account ID",a."Cash Holder ID",a."Cash Holder",a."Account",a."Balance",a."Balance Status",
 a."Generated At" AS "Account Snapshot At"
FROM selected s CROSS JOIN clock c LEFT JOIN position p ON true LEFT JOIN accounts a ON true
